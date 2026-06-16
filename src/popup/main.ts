import "./style.css";
import { fillApprovedFields } from "../content/fillFields";
import { scanPageFields } from "../content/fieldScanner";
import { requestFieldSuggestions } from "../shared/suggestionClient";
import type { FieldSuggestion } from "../shared/suggestions";
import {
  loadPopupSettings,
  savePopupSettings,
  type StoredPopupSettings
} from "../shared/storage";
import type {
  ApprovedSuggestion,
  DetectedField,
  FillResult
} from "../shared/types";

const defaultProfile = `{
  "personal": {
    "firstName": "",
    "lastName": "",
    "email": "",
    "phone": "",
    "city": "",
    "country": "",
    "linkedin": "",
    "github": ""
  },
  "workAuthorization": {
    "approvedAnswersOnly": true,
    "answers": {}
  },
  "currentRole": {
    "company": "",
    "title": "",
    "location": "",
    "startDate": "",
    "summary": ""
  },
  "experience": [],
  "education": [],
  "skills": [],
  "standardAnswers": {
    "noticePeriod": "",
    "salaryExpectations": "",
    "willingToRelocate": "",
    "whyInterestedGeneric": ""
  }
}`;

type PopupState = {
  apiEndpoint: string;
  apiKey: string;
  apiModel: string;
  approvedByFieldId: Record<string, boolean>;
  detectedFields: DetectedField[];
  fillResultsByFieldId: Record<string, FillResult>;
  isFilling: boolean;
  isInitializing: boolean;
  isScanning: boolean;
  isSuggesting: boolean;
  lastSuggestionCount: number;
  profileJson: string;
  statusMessage: string;
  statusTone: "neutral" | "success" | "error";
  storageMessage: string;
  storageTone: "neutral" | "success" | "error";
  suggestionsByFieldId: Record<string, FieldSuggestion>;
};

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("Popup root element was not found.");
}

const app = appRoot;

const state: PopupState = {
  apiEndpoint: "",
  apiKey: "",
  apiModel: "",
  approvedByFieldId: {},
  detectedFields: [],
  fillResultsByFieldId: {},
  isFilling: false,
  isInitializing: true,
  isScanning: false,
  isSuggesting: false,
  lastSuggestionCount: 0,
  profileJson: defaultProfile,
  statusMessage: "Ready to scan the active tab.",
  statusTone: "neutral",
  storageMessage: "Loading saved local settings...",
  storageTone: "neutral",
  suggestionsByFieldId: {}
};

let saveTimeoutId: number | null = null;

function getCurrentSettings(): StoredPopupSettings {
  return {
    apiEndpoint: state.apiEndpoint,
    apiKey: state.apiKey,
    apiModel: state.apiModel,
    profileJson: state.profileJson
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatFieldType(field: DetectedField): string {
  if (field.tagName === "input" && field.inputType) {
    return `input:${field.inputType}`;
  }

  if (field.role) {
    return `${field.tagName} (${field.role})`;
  }

  return field.tagName;
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function getSuggestion(fieldId: string): FieldSuggestion | null {
  return state.suggestionsByFieldId[fieldId] ?? null;
}

function getFillResult(fieldId: string): FillResult | null {
  return state.fillResultsByFieldId[fieldId] ?? null;
}

function canApproveSuggestion(suggestion: FieldSuggestion | null): boolean {
  if (!suggestion) {
    return false;
  }

  if (suggestion.unsupported || suggestion.manualFillRequired) {
    return false;
  }

  return typeof suggestion.proposedValue === "string" && suggestion.proposedValue.length > 0;
}

function getApprovedSuggestions(): ApprovedSuggestion[] {
  return state.detectedFields
    .map((field) => {
      const suggestion = getSuggestion(field.internalId);
      const approved = state.approvedByFieldId[field.internalId] === true;
      if (!approved || !canApproveSuggestion(suggestion) || !suggestion?.proposedValue) {
        return null;
      }

      return {
        internalId: field.internalId,
        value: suggestion.proposedValue
      } satisfies ApprovedSuggestion;
    })
    .filter((item): item is ApprovedSuggestion => item !== null);
}

function getApprovedCount(): number {
  return getApprovedSuggestions().length;
}

function canRequestSuggestions(): boolean {
  return (
    !state.isInitializing &&
    !state.isScanning &&
    !state.isSuggesting &&
    !state.isFilling &&
    state.detectedFields.length > 0
  );
}

function canFillApprovedSuggestions(): boolean {
  return (
    !state.isInitializing &&
    !state.isScanning &&
    !state.isSuggesting &&
    !state.isFilling &&
    getApprovedCount() > 0
  );
}

function getSuggestionStatusLabel(suggestion: FieldSuggestion | null): string {
  if (!suggestion) {
    return "No suggestion yet";
  }

  if (suggestion.unsupported) {
    return "Unsupported";
  }

  if (suggestion.manualFillRequired) {
    return "Manual fill required";
  }

  if (suggestion.requiresUserReview) {
    return "Review required";
  }

  return "Ready";
}

function getSuggestionStatusClass(suggestion: FieldSuggestion | null): string {
  if (!suggestion) {
    return "suggestion-status-neutral";
  }

  if (suggestion.unsupported) {
    return "suggestion-status-error";
  }

  if (suggestion.manualFillRequired || suggestion.requiresUserReview) {
    return "suggestion-status-warning";
  }

  return "suggestion-status-success";
}

function renderFillResultSection(fieldId: string): string {
  const result = getFillResult(fieldId);
  if (!result) {
    return "";
  }

  return `
    <div class="fill-result ${result.success ? "fill-result-success" : "fill-result-error"}">
      <strong>${result.success ? "Fill result" : "Fill failed"}</strong>
      <span>${escapeHtml(result.message)}</span>
    </div>
  `;
}

function renderSuggestionSection(field: DetectedField): string {
  const suggestion = getSuggestion(field.internalId);
  if (!suggestion) {
    return `
      <div class="suggestion-box suggestion-box-empty">
        <p class="suggestion-empty">No suggestion has been requested for this field yet.</p>
      </div>
    `;
  }

  const sourceFacts = suggestion.sourceFacts.length
    ? suggestion.sourceFacts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")
    : "<li>No supporting source facts were returned.</li>";

  const canApprove = canApproveSuggestion(suggestion);
  const checked = state.approvedByFieldId[field.internalId] === true;
  const approvalHint = canApprove
    ? "Approve this suggestion for the fill step."
    : suggestion.unsupported
      ? "This field is unsupported and must be answered manually."
      : suggestion.manualFillRequired
        ? "This field is marked as manual fill required."
        : "This field requires review before approval.";

  return `
    <div class="suggestion-box">
      <div class="suggestion-header">
        <span class="suggestion-status ${getSuggestionStatusClass(suggestion)}">
          ${escapeHtml(getSuggestionStatusLabel(suggestion))}
        </span>
        <span class="confidence-chip">Confidence ${escapeHtml(formatConfidence(suggestion.confidence))}</span>
      </div>

      <dl class="suggestion-details">
        <div>
          <dt>Suggested value</dt>
          <dd>${escapeHtml(suggestion.proposedValue ?? "(none)")}</dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>${escapeHtml(suggestion.reason || "(no reason returned)")}</dd>
        </div>
      </dl>

      <div class="source-facts">
        <p>Source facts</p>
        <ul>${sourceFacts}</ul>
      </div>

      <label class="approval-row ${canApprove ? "" : "approval-row-disabled"}">
        <input
          type="checkbox"
          data-approve-field-id="${escapeHtml(field.internalId)}"
          ${checked ? "checked" : ""}
          ${canApprove ? "" : "disabled"}
        />
        <span>${escapeHtml(approvalHint)}</span>
      </label>

      ${renderFillResultSection(field.internalId)}
    </div>
  `;
}

function renderFieldList(fields: DetectedField[]): string {
  if (!fields.length) {
    return `
      <div class="empty-state">
        <p>No page scan has been run yet.</p>
        <p class="panel-note">
          Detected labels, field types, current values, suggestions, confidence,
          and approval controls will appear here.
        </p>
      </div>
    `;
  }

  return `
    <div class="field-list">
      ${fields
        .map((field) => {
          const title = field.labelText ?? field.ariaLabel ?? field.name ?? "Unlabeled field";
          const currentValue = field.currentValue ?? "";
          const nearbyText = field.nearbyText
            .filter((item) => item && item !== field.labelText)
            .slice(0, 3);

          return `
            <article class="field-card">
              <div class="field-card-header">
                <h3>${escapeHtml(title)}</h3>
                <span class="field-type-chip">${escapeHtml(formatFieldType(field))}</span>
              </div>
              <p class="field-meta">
                ${field.required ? "Required" : "Optional"} - ${escapeHtml(field.internalId)}
              </p>
              <dl class="field-details">
                <div>
                  <dt>Current</dt>
                  <dd>${escapeHtml(currentValue || "(empty)")}</dd>
                </div>
                <div>
                  <dt>Name / ID</dt>
                  <dd>${escapeHtml(
                    [field.name, field.id].filter(Boolean).join(" / ") || "(none)"
                  )}</dd>
                </div>
                <div>
                  <dt>Placeholder</dt>
                  <dd>${escapeHtml(field.placeholder ?? "(none)")}</dd>
                </div>
                <div>
                  <dt>Nearby text</dt>
                  <dd>${escapeHtml(nearbyText.join(" | ") || "(none)")}</dd>
                </div>
              </dl>

              ${renderSuggestionSection(field)}
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function render(): void {
  const approvedCount = getApprovedCount();

  app.innerHTML = `
    <main class="popup-shell">
      <header class="hero">
        <p class="eyebrow">Chrome Extension MVP</p>
        <h1>Job Form Fill</h1>
        <p class="subtitle">
          Review all values before filling. The extension never submits forms.
        </p>
      </header>

      <section class="panel actions-panel" aria-labelledby="actions-heading">
        <div class="panel-heading">
          <h2 id="actions-heading">Actions</h2>
          <span class="status-pill">Step 8 wired</span>
        </div>

        <div class="status-banner status-${state.statusTone}">
          ${escapeHtml(state.statusMessage)}
        </div>

        <div class="action-grid">
          <button
            type="button"
            class="primary-action"
            data-action="scan"
            ${state.isScanning || state.isInitializing || state.isSuggesting || state.isFilling ? "disabled" : ""}
          >
            ${state.isScanning ? "Scanning..." : "Scan page"}
          </button>
          <button
            type="button"
            class="secondary-action"
            data-action="suggest"
            ${canRequestSuggestions() ? "" : "disabled"}
          >
            ${state.isSuggesting ? "Requesting suggestions..." : "Suggest values"}
          </button>
          <button
            type="button"
            class="secondary-action"
            data-action="fill"
            ${canFillApprovedSuggestions() ? "" : "disabled"}
          >
            ${state.isFilling ? "Filling approved fields..." : `Fill approved fields (${approvedCount})`}
          </button>
        </div>

        <p class="panel-note">
          ${state.lastSuggestionCount > 0
            ? `The last suggestion request returned ${state.lastSuggestionCount} suggestion(s). ${approvedCount} field(s) are currently approved for filling.`
            : "Request suggestions first, then review each field and approve the ones you want to fill."}
        </p>
      </section>

      <section class="panel" aria-labelledby="fields-heading">
        <div class="panel-heading">
          <h2 id="fields-heading">Detected Fields</h2>
          <span class="muted-label">${state.detectedFields.length} fields</span>
        </div>

        ${renderFieldList(state.detectedFields)}
      </section>

      <section class="panel settings-panel" aria-labelledby="settings-heading">
        <div class="panel-heading">
          <h2 id="settings-heading">Settings</h2>
          <span class="muted-label">Stored locally</span>
        </div>

        <div class="status-banner status-${state.storageTone}">
          ${escapeHtml(state.storageMessage)}
        </div>

        <label class="field">
          <span>API endpoint URL</span>
          <input
            type="url"
            name="apiEndpoint"
            autocomplete="off"
            value="${escapeHtml(state.apiEndpoint)}"
            placeholder="https://api.example.com/v1/chat/completions"
            ${state.isInitializing ? "disabled" : ""}
          />
        </label>

        <label class="field">
          <span>API model</span>
          <input
            type="text"
            name="apiModel"
            autocomplete="off"
            value="${escapeHtml(state.apiModel)}"
            placeholder="gpt-4.1-mini"
            ${state.isInitializing ? "disabled" : ""}
          />
        </label>

        <label class="field">
          <span>API key</span>
          <input
            type="password"
            name="apiKey"
            autocomplete="off"
            value="${escapeHtml(state.apiKey)}"
            placeholder="Stored locally for MVP use"
            ${state.isInitializing ? "disabled" : ""}
          />
        </label>

        <label class="field">
          <span>User profile JSON</span>
          <textarea
            name="profileJson"
            spellcheck="false"
            rows="16"
            ${state.isInitializing ? "disabled" : ""}
          >${escapeHtml(state.profileJson)}</textarea>
        </label>
      </section>
    </main>
  `;

  const scanButton = app.querySelector<HTMLButtonElement>("[data-action='scan']");
  scanButton?.addEventListener("click", () => {
    void handleScan();
  });

  const suggestButton = app.querySelector<HTMLButtonElement>("[data-action='suggest']");
  suggestButton?.addEventListener("click", () => {
    void handleSuggest();
  });

  const fillButton = app.querySelector<HTMLButtonElement>("[data-action='fill']");
  fillButton?.addEventListener("click", () => {
    void handleFill();
  });

  const approvalInputs = app.querySelectorAll<HTMLInputElement>("[data-approve-field-id]");
  for (const input of approvalInputs) {
    input.addEventListener("change", (event) => {
      const checkbox = event.currentTarget as HTMLInputElement;
      const fieldId = checkbox.dataset.approveFieldId;
      if (!fieldId) {
        return;
      }

      state.approvedByFieldId[fieldId] = checkbox.checked;
      render();
    });
  }

  const apiEndpointInput = app.querySelector<HTMLInputElement>("input[name='apiEndpoint']");
  apiEndpointInput?.addEventListener("input", (event) => {
    state.apiEndpoint = (event.currentTarget as HTMLInputElement).value;
    queueSettingsSave();
  });

  const apiModelInput = app.querySelector<HTMLInputElement>("input[name='apiModel']");
  apiModelInput?.addEventListener("input", (event) => {
    state.apiModel = (event.currentTarget as HTMLInputElement).value;
    queueSettingsSave();
  });

  const apiKeyInput = app.querySelector<HTMLInputElement>("input[name='apiKey']");
  apiKeyInput?.addEventListener("input", (event) => {
    state.apiKey = (event.currentTarget as HTMLInputElement).value;
    queueSettingsSave();
  });

  const profileTextarea = app.querySelector<HTMLTextAreaElement>("textarea[name='profileJson']");
  profileTextarea?.addEventListener("input", (event) => {
    state.profileJson = (event.currentTarget as HTMLTextAreaElement).value;
    queueSettingsSave();
  });
}

function updateStorageBanner(): void {
  const banner = app.querySelector<HTMLElement>(".settings-panel .status-banner");
  if (!banner) {
    return;
  }

  banner.className = `status-banner status-${state.storageTone}`;
  banner.textContent = state.storageMessage;
}

function queueSettingsSave(): void {
  state.storageMessage = "Saving settings locally...";
  state.storageTone = "neutral";
  updateStorageBanner();

  if (saveTimeoutId !== null) {
    window.clearTimeout(saveTimeoutId);
  }

  saveTimeoutId = window.setTimeout(() => {
    void persistSettings();
  }, 300);
}

async function persistSettings(): Promise<void> {
  try {
    await savePopupSettings(getCurrentSettings());
    state.storageMessage = "Settings saved locally in Chrome extension storage.";
    state.storageTone = "success";
  } catch (error) {
    state.storageMessage =
      error instanceof Error ? error.message : "Failed to save settings locally.";
    state.storageTone = "error";
  } finally {
    saveTimeoutId = null;
    updateStorageBanner();
  }
}

async function initializePopup(): Promise<void> {
  render();

  try {
    const settings = await loadPopupSettings(getCurrentSettings());
    state.apiEndpoint = settings.apiEndpoint;
    state.apiKey = settings.apiKey;
    state.apiModel = settings.apiModel;
    state.profileJson = settings.profileJson;
    state.storageMessage = "Settings loaded from local Chrome extension storage.";
    state.storageTone = "success";
  } catch (error) {
    state.storageMessage =
      error instanceof Error ? error.message : "Failed to load local settings.";
    state.storageTone = "error";
  } finally {
    state.isInitializing = false;
    render();
  }
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (typeof tab?.id !== "number") {
    throw new Error("No active tab is available for scanning.");
  }

  return tab.id;
}

function resetSuggestionState(): void {
  state.approvedByFieldId = {};
  state.fillResultsByFieldId = {};
  state.lastSuggestionCount = 0;
  state.suggestionsByFieldId = {};
}

async function handleScan(): Promise<void> {
  state.isScanning = true;
  state.statusMessage = "Scanning the active page for visible form fields...";
  state.statusTone = "neutral";
  render();

  try {
    const tabId = await getActiveTabId();
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: scanPageFields
    });

    state.detectedFields = result?.result ?? [];
    resetSuggestionState();
    state.statusMessage = `Scan complete. Found ${state.detectedFields.length} visible field(s).`;
    state.statusTone = "success";
  } catch (error) {
    state.detectedFields = [];
    resetSuggestionState();
    state.statusMessage =
      error instanceof Error ? error.message : "Scanning failed for an unknown reason.";
    state.statusTone = "error";
  } finally {
    state.isScanning = false;
    render();
  }
}

function validateSuggestionInputs(): string | null {
  if (!state.apiEndpoint.trim()) {
    return "API endpoint URL is required before requesting suggestions.";
  }

  if (!state.apiModel.trim()) {
    return "API model is required before requesting suggestions.";
  }

  if (!state.apiKey.trim()) {
    return "API key is required before requesting suggestions.";
  }

  if (state.detectedFields.length === 0) {
    return "Scan the page before requesting suggestions.";
  }

  try {
    JSON.parse(state.profileJson);
  } catch {
    return "User profile JSON is invalid. Fix it before requesting suggestions.";
  }

  return null;
}

async function handleSuggest(): Promise<void> {
  const validationError = validateSuggestionInputs();
  if (validationError) {
    state.statusMessage = validationError;
    state.statusTone = "error";
    render();
    return;
  }

  state.isSuggesting = true;
  state.statusMessage = "Requesting structured suggestions from the configured API...";
  state.statusTone = "neutral";
  render();

  try {
    const result = await requestFieldSuggestions({
      apiEndpoint: state.apiEndpoint.trim(),
      apiKey: state.apiKey.trim(),
      apiModel: state.apiModel.trim(),
      detectedFields: state.detectedFields,
      profileJson: state.profileJson
    });

    state.lastSuggestionCount = result.suggestions.length;
    state.approvedByFieldId = {};
    state.fillResultsByFieldId = {};
    state.suggestionsByFieldId = Object.fromEntries(
      result.suggestions.map((suggestion) => [suggestion.internalId, suggestion])
    );
    state.statusMessage = `Suggestion request completed. Received ${result.suggestions.length} structured suggestion(s). Review each field and approve the ones you want to fill.`;
    state.statusTone = "success";
  } catch (error) {
    state.lastSuggestionCount = 0;
    state.statusMessage =
      error instanceof Error ? error.message : "Suggestion request failed.";
    state.statusTone = "error";
  } finally {
    state.isSuggesting = false;
    render();
  }
}

async function handleFill(): Promise<void> {
  const approvedSuggestions = getApprovedSuggestions();
  if (approvedSuggestions.length === 0) {
    state.statusMessage = "Approve at least one suggestion before filling.";
    state.statusTone = "error";
    render();
    return;
  }

  state.isFilling = true;
  state.statusMessage = `Filling ${approvedSuggestions.length} approved field(s) on the active page...`;
  state.statusTone = "neutral";
  render();

  try {
    const tabId = await getActiveTabId();
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: fillApprovedFields,
      args: [approvedSuggestions]
    });

    const fillResults = (result?.result ?? []) as FillResult[];
    state.fillResultsByFieldId = Object.fromEntries(
      fillResults.map((fillResult) => [fillResult.internalId, fillResult])
    );

    const successCount = fillResults.filter((fillResult) => fillResult.success).length;
    const failureCount = fillResults.length - successCount;

    state.statusMessage = `Fill completed. ${successCount} field(s) succeeded, ${failureCount} failed.`;
    state.statusTone = failureCount === 0 ? "success" : "error";
  } catch (error) {
    state.fillResultsByFieldId = {};
    state.statusMessage =
      error instanceof Error ? error.message : "Filling approved fields failed.";
    state.statusTone = "error";
  } finally {
    state.isFilling = false;
    render();
  }
}

void initializePopup();
