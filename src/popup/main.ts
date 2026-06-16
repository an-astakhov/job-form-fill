import "./style.css";
import { fillApprovedFields } from "../content/fillFields";
import { scanPageFields } from "../content/fieldScanner";
import { requestFieldSuggestions } from "../shared/suggestionClient";
import {
  countMeaningfulProfileFacts,
  parseProfileJson,
  type FieldSuggestion
} from "../shared/suggestions";
import {
  buildPageStateStorageKey,
  loadPageState,
  loadPopupSettings,
  savePageState,
  savePopupSettings,
  type StoredPageState,
  type StoredPopupSettings
} from "../shared/storage";
import type {
  ApprovedSuggestion,
  DetectedField,
  FillResult
} from "../shared/types";

const defaultProfile = `{
  "personal": {
    "firstName": "Avery",
    "lastName": "Hart",
    "email": "avery.hart@example.com",
    "phone": "+1 555 010 2468",
    "city": "Prague",
    "country": "Czech Republic",
    "linkedin": "https://www.linkedin.com/in/avery-hart-example",
    "github": "https://github.com/avery-hart-example"
  },
  "workAuthorization": {
    "approvedAnswersOnly": true,
    "answers": {
      "visaSponsorshipRequired": "No"
    }
  },
  "currentRole": {
    "company": "Acme Robotics",
    "title": "Machine Learning Engineer",
    "location": "Prague, Czech Republic",
    "startDate": "2023-04",
    "summary": "Builds ML-powered document extraction and ranking systems for internal automation."
  },
  "experience": [
    {
      "company": "Acme Robotics",
      "title": "Machine Learning Engineer",
      "startDate": "2023-04",
      "endDate": "Present",
      "highlights": [
        "Built Python services for document parsing and search ranking.",
        "Shipped retrieval and classification features used by recruiters and operations teams."
      ]
    },
    {
      "company": "Northwind Data",
      "title": "Data Scientist",
      "startDate": "2021-01",
      "endDate": "2023-03",
      "highlights": [
        "Developed forecasting and NLP pipelines.",
        "Worked with SQL, Python, scikit-learn, and experiment tracking."
      ]
    }
  ],
  "education": [
    {
      "school": "Example Technical University",
      "degree": "MSc",
      "field": "Computer Science",
      "graduationYear": "2020"
    }
  ],
  "skills": [
    "Python",
    "Machine Learning",
    "NLP",
    "SQL",
    "scikit-learn",
    "Pandas",
    "Prompt Engineering"
  ],
  "standardAnswers": {
    "noticePeriod": "30 days",
    "salaryExpectations": "Prefer to discuss later in the process.",
    "willingToRelocate": "Open to discussion",
    "whyInterestedGeneric": "I am interested in roles where I can apply machine learning to practical product workflows and collaborate closely with engineering teams."
  }
}`;

type ActiveTabContext = {
  pageLabel: string;
  storageKey: string;
  tabId: number;
  url: string;
};

type LogEntry = {
  level: "info" | "success" | "warning" | "error";
  message: string;
  timestamp: string;
};

type PopupState = {
  activePageLabel: string;
  activePageStorageKey: string | null;
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
  logs: LogEntry[];
  profileFactCount: number;
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
  activePageLabel: "Current page",
  activePageStorageKey: null,
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
  logs: [],
  profileFactCount: 0,
  profileJson: defaultProfile,
  statusMessage: "Ready to scan the active tab.",
  statusTone: "neutral",
  storageMessage: "Loading saved local settings...",
  storageTone: "neutral",
  suggestionsByFieldId: {}
};

let pageStateSaveTimeoutId: number | null = null;
let settingsSaveTimeoutId: number | null = null;

function getCurrentSettings(): StoredPopupSettings {
  return {
    apiEndpoint: state.apiEndpoint,
    apiKey: state.apiKey,
    apiModel: state.apiModel,
    profileJson: state.profileJson
  };
}

function getCurrentPageState(): StoredPageState {
  return {
    approvedByFieldId: state.approvedByFieldId,
    detectedFields: state.detectedFields,
    fillResultsByFieldId: state.fillResultsByFieldId,
    lastSuggestionCount: state.lastSuggestionCount,
    suggestionsByFieldId: state.suggestionsByFieldId
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

function addLog(level: LogEntry["level"], message: string): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
  };

  state.logs = [entry, ...state.logs].slice(0, 12);
}

function updateProfileFactCount(): void {
  try {
    const profile = parseProfileJson(state.profileJson);
    state.profileFactCount = countMeaningfulProfileFacts(profile);
  } catch {
    state.profileFactCount = 0;
  }
}

function getFieldDisplayLabel(field: DetectedField): string {
  return field.labelText ?? field.ariaLabel ?? field.name ?? "Untitled field";
}

function getFieldDisplayLabelById(fieldId: string): string {
  const field = state.detectedFields.find((item) => item.internalId === fieldId);
  return field ? getFieldDisplayLabel(field) : "field";
}

function formatFieldType(field: DetectedField): string {
  if (field.tagName === "input" && field.inputType) {
    return field.inputType;
  }

  if (field.role === "textbox") {
    return "text";
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

function getUnsupportedCount(): number {
  return Object.values(state.suggestionsByFieldId).filter((suggestion) => {
    return suggestion.unsupported;
  }).length;
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
    return "No suggestion";
  }

  if (suggestion.unsupported) {
    return "Unsupported";
  }

  if (suggestion.manualFillRequired) {
    return "Manual";
  }

  if (suggestion.requiresUserReview) {
    return "Review";
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
        <p class="suggestion-empty">No suggestion requested yet.</p>
      </div>
    `;
  }

  const sourceFactsMarkup = suggestion.sourceFacts.length
    ? `
        <div class="source-facts">
          <p>Source facts</p>
          <ul>
            ${suggestion.sourceFacts
              .map((fact) => `<li>${escapeHtml(fact)}</li>`)
              .join("")}
          </ul>
        </div>
      `
    : "";

  const canApprove = canApproveSuggestion(suggestion);
  const checked = state.approvedByFieldId[field.internalId] === true;
  const approvalHint = canApprove
    ? "Approve for fill"
    : suggestion.unsupported
      ? "Manual answer needed"
      : suggestion.manualFillRequired
        ? "Manual fill required"
        : "Review before approval";

  return `
    <div class="suggestion-box">
      <div class="suggestion-header">
        <span class="suggestion-status ${getSuggestionStatusClass(suggestion)}">
          ${escapeHtml(getSuggestionStatusLabel(suggestion))}
        </span>
        <span class="confidence-chip">${escapeHtml(formatConfidence(suggestion.confidence))}</span>
      </div>

      <div class="suggestion-primary">
        ${escapeHtml(suggestion.proposedValue ?? "(no proposed value)")}
      </div>

      <p class="suggestion-reason">${escapeHtml(suggestion.reason || "No reason returned.")}</p>

      ${sourceFactsMarkup}

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
        <p>No scan results for this page yet.</p>
        <p class="panel-note">
          Scan the page to detect fields, then request suggestions.
        </p>
      </div>
    `;
  }

  return `
    <div class="field-list">
      ${fields
        .map((field) => {
          const currentValue = field.currentValue?.trim() ?? "";

          return `
            <article class="field-card">
              <div class="field-card-header">
                <div class="field-heading">
                  <h3>${escapeHtml(getFieldDisplayLabel(field))}</h3>
                  <div class="field-chip-row">
                    <span class="field-type-chip">${escapeHtml(formatFieldType(field))}</span>
                    <span class="field-type-chip">${field.required ? "required" : "optional"}</span>
                  </div>
                </div>
              </div>

              ${
                currentValue
                  ? `
                    <div class="current-value">
                      <strong>Current value</strong>
                      <span>${escapeHtml(currentValue)}</span>
                    </div>
                  `
                  : ""
              }

              ${renderSuggestionSection(field)}
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderDiagnosticsPanel(): string {
  const logItems = state.logs.length
    ? state.logs
        .map((entry) => {
          return `
            <li class="log-entry log-${entry.level}">
              <span class="log-time">${escapeHtml(entry.timestamp)}</span>
              <span class="log-message">${escapeHtml(entry.message)}</span>
            </li>
          `;
        })
        .join("")
    : `<li class="log-entry log-info"><span class="log-message">No diagnostics yet.</span></li>`;

  return `
    <section class="panel" aria-labelledby="diagnostics-heading">
      <div class="panel-heading">
        <h2 id="diagnostics-heading">Diagnostics</h2>
        <span class="muted-label">Current page</span>
      </div>

      <div class="diagnostic-grid">
        <div class="diagnostic-card">
          <strong>Profile facts</strong>
          <span>${state.profileFactCount}</span>
        </div>
        <div class="diagnostic-card">
          <strong>Unsupported</strong>
          <span>${getUnsupportedCount()}</span>
        </div>
        <div class="diagnostic-card">
          <strong>Approved</strong>
          <span>${getApprovedCount()}</span>
        </div>
      </div>

      ${
        state.profileFactCount < 3
          ? `<p class="diagnostic-warning">The profile appears mostly empty. That will often lead to unsupported suggestions.</p>`
          : ""
      }

      <ul class="log-list">${logItems}</ul>
    </section>
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
          Working page: ${escapeHtml(state.activePageLabel)}. Review all values before filling.
        </p>
      </header>

      <section class="panel actions-panel" aria-labelledby="actions-heading">
        <div class="panel-heading">
          <h2 id="actions-heading">Actions</h2>
          <span class="status-pill">Persistent per page</span>
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
            ${state.isFilling ? "Filling approved fields..." : `Fill approved (${approvedCount})`}
          </button>
        </div>

        <p class="panel-note">
          ${state.lastSuggestionCount > 0
            ? `Suggestions and approvals are preserved for this page while the browser session stays open.`
            : "Scan once, then reopen the popup later without losing the current page state."}
        </p>
      </section>

      <section class="panel" aria-labelledby="fields-heading">
        <div class="panel-heading">
          <h2 id="fields-heading">Fields</h2>
          <span class="muted-label">${state.detectedFields.length}</span>
        </div>

        ${renderFieldList(state.detectedFields)}
      </section>

      ${renderDiagnosticsPanel()}

      <section class="panel settings-panel" aria-labelledby="settings-heading">
        <div class="panel-heading">
          <h2 id="settings-heading">Profile & API</h2>
          <span class="muted-label">Stored locally</span>
        </div>

        <div class="status-banner status-${state.storageTone}">
          ${escapeHtml(state.storageMessage)}
        </div>

        <label class="field">
          <span>API endpoint</span>
          <input
            type="url"
            name="apiEndpoint"
            autocomplete="off"
            value="${escapeHtml(state.apiEndpoint)}"
            placeholder="https://api.openai.com/v1/responses"
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
            placeholder="gpt-5.4-mini"
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
          <span>Profile JSON</span>
          <textarea
            name="profileJson"
            spellcheck="false"
            rows="16"
            ${state.isInitializing ? "disabled" : ""}
          >${escapeHtml(state.profileJson)}</textarea>
        </label>

        <div class="settings-actions">
          <button
            type="button"
            class="secondary-action"
            data-action="load-fake-profile"
            ${state.isInitializing ? "disabled" : ""}
          >
            Load fake test profile
          </button>
        </div>
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

  const loadFakeProfileButton = app.querySelector<HTMLButtonElement>(
    "[data-action='load-fake-profile']"
  );
  loadFakeProfileButton?.addEventListener("click", () => {
    state.profileJson = defaultProfile;
    updateProfileFactCount();
    addLog("info", "Loaded fake test profile into the editor.");
    queueSettingsSave();
    render();
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
      addLog(
        "info",
        `${checkbox.checked ? "Approved" : "Unapproved"} ${getFieldDisplayLabelById(fieldId)}.`
      );
      queuePageStateSave();
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
    updateProfileFactCount();
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

  if (settingsSaveTimeoutId !== null) {
    window.clearTimeout(settingsSaveTimeoutId);
  }

  settingsSaveTimeoutId = window.setTimeout(() => {
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
    addLog("error", state.storageMessage);
  } finally {
    settingsSaveTimeoutId = null;
    updateStorageBanner();
  }
}

function queuePageStateSave(): void {
  if (!state.activePageStorageKey) {
    return;
  }

  if (pageStateSaveTimeoutId !== null) {
    window.clearTimeout(pageStateSaveTimeoutId);
  }

  pageStateSaveTimeoutId = window.setTimeout(() => {
    void persistPageState();
  }, 150);
}

async function persistPageState(): Promise<void> {
  if (!state.activePageStorageKey) {
    return;
  }

  try {
    await savePageState(state.activePageStorageKey, getCurrentPageState());
  } catch (error) {
    addLog(
      "error",
      error instanceof Error ? error.message : "Failed to save page state."
    );
  } finally {
    pageStateSaveTimeoutId = null;
  }
}

async function getActiveTabContext(): Promise<ActiveTabContext> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (typeof tab?.id !== "number" || !tab.url) {
    throw new Error("No active tab is available for scanning.");
  }

  const url = new URL(tab.url);
  const pageLabel = tab.title?.trim() || `${url.hostname}${url.pathname}`;

  return {
    pageLabel,
    storageKey: buildPageStateStorageKey(tab.id, tab.url),
    tabId: tab.id,
    url: tab.url
  };
}

async function initializePopup(): Promise<void> {
  render();

  try {
    const [settings, activeTabContext] = await Promise.all([
      loadPopupSettings(getCurrentSettings()),
      getActiveTabContext()
    ]);

    state.apiEndpoint = settings.apiEndpoint;
    state.apiKey = settings.apiKey;
    state.apiModel = settings.apiModel;
    state.profileJson = settings.profileJson;
    state.activePageLabel = activeTabContext.pageLabel;
    state.activePageStorageKey = activeTabContext.storageKey;
    updateProfileFactCount();

    const savedPageState = await loadPageState(activeTabContext.storageKey);
    if (savedPageState) {
      state.approvedByFieldId = savedPageState.approvedByFieldId;
      state.detectedFields = savedPageState.detectedFields;
      state.fillResultsByFieldId = savedPageState.fillResultsByFieldId;
      state.lastSuggestionCount = savedPageState.lastSuggestionCount;
      state.suggestionsByFieldId = savedPageState.suggestionsByFieldId;
      addLog(
        "success",
        `Restored ${state.detectedFields.length} saved fields for this page.`
      );
    } else {
      addLog("info", "No saved page state yet for this page.");
    }

    state.storageMessage = "Settings loaded from local Chrome extension storage.";
    state.storageTone = "success";
    addLog("success", "Loaded popup settings from extension storage.");
  } catch (error) {
    state.storageMessage =
      error instanceof Error ? error.message : "Failed to load local settings.";
    state.storageTone = "error";
    addLog("error", state.storageMessage);
  } finally {
    state.isInitializing = false;
    render();
  }
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
    const activeTabContext = await getActiveTabContext();
    state.activePageLabel = activeTabContext.pageLabel;
    state.activePageStorageKey = activeTabContext.storageKey;

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: activeTabContext.tabId },
      func: scanPageFields
    });

    state.detectedFields = result?.result ?? [];
    resetSuggestionState();
    state.statusMessage = `Scan complete. Found ${state.detectedFields.length} visible field(s).`;
    state.statusTone = "success";
    addLog("success", `Scan found ${state.detectedFields.length} visible fields.`);
    queuePageStateSave();
  } catch (error) {
    state.detectedFields = [];
    resetSuggestionState();
    state.statusMessage =
      error instanceof Error ? error.message : "Scanning failed for an unknown reason.";
    state.statusTone = "error";
    addLog("error", state.statusMessage);
  } finally {
    state.isScanning = false;
    render();
  }
}

function validateSuggestionInputs(): string | null {
  if (!state.apiEndpoint.trim()) {
    return "API endpoint URL is required before requesting suggestions.";
  }

  if (state.apiEndpoint.includes("/v1/chat/completions")) {
    return "This extension now uses the Responses API. Set the endpoint to /v1/responses.";
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
    addLog("error", validationError);
    render();
    return;
  }

  state.isSuggesting = true;
  state.statusMessage = "Requesting structured suggestions from the configured API...";
  state.statusTone = "neutral";
  addLog(
    "info",
    `Requesting suggestions for ${state.detectedFields.length} fields with ${state.profileFactCount} profile facts.`
  );
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

    const unsupportedCount = result.suggestions.filter((suggestion) => {
      return suggestion.unsupported;
    }).length;

    if (unsupportedCount === result.suggestions.length && state.profileFactCount < 3) {
      state.statusMessage =
        "All suggestions came back unsupported, and the profile appears mostly empty. Add real facts to the profile JSON and try again.";
      state.statusTone = "error";
      addLog(
        "warning",
        "All suggestions were unsupported. The profile appears mostly empty."
      );
    } else {
      state.statusMessage = `Suggestion request completed. Received ${result.suggestions.length} structured suggestion(s).`;
      state.statusTone = "success";
      addLog(
        unsupportedCount > 0 ? "warning" : "success",
        `Suggestion request returned ${result.suggestions.length} suggestions, ${unsupportedCount} unsupported.`
      );
    }

    queuePageStateSave();
  } catch (error) {
    state.lastSuggestionCount = 0;
    state.statusMessage =
      error instanceof Error ? error.message : "Suggestion request failed.";
    state.statusTone = "error";
    addLog("error", state.statusMessage);
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
    addLog("error", state.statusMessage);
    render();
    return;
  }

  state.isFilling = true;
  state.statusMessage = `Filling ${approvedSuggestions.length} approved field(s) on the active page...`;
  state.statusTone = "neutral";
  addLog("info", `Filling ${approvedSuggestions.length} approved fields.`);
  render();

  try {
    const activeTabContext = await getActiveTabContext();
    state.activePageLabel = activeTabContext.pageLabel;
    state.activePageStorageKey = activeTabContext.storageKey;

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: activeTabContext.tabId },
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
    addLog(
      failureCount === 0 ? "success" : "warning",
      `Fill completed with ${successCount} successes and ${failureCount} failures.`
    );
    queuePageStateSave();
  } catch (error) {
    state.fillResultsByFieldId = {};
    state.statusMessage =
      error instanceof Error ? error.message : "Filling approved fields failed.";
    state.statusTone = "error";
    addLog("error", state.statusMessage);
  } finally {
    state.isFilling = false;
    render();
  }
}

updateProfileFactCount();
void initializePopup();
