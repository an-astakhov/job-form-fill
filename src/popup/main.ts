import "./style.css";
import { fillFieldValues } from "../content/fillFields";
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
import type { DetectedField, FillInstruction, FillResult } from "../shared/types";

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
  detectedFields: DetectedField[];
  fillResultsByFieldId: Record<string, FillResult>;
  isAutofilling: boolean;
  isInitializing: boolean;
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
  detectedFields: [],
  fillResultsByFieldId: {},
  isAutofilling: false,
  isInitializing: true,
  lastSuggestionCount: 0,
  logs: [],
  profileFactCount: 0,
  profileJson: defaultProfile,
  statusMessage: "Ready to autofill the active tab.",
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

  state.logs = [entry, ...state.logs].slice(0, 10);
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

type FillableSuggestion = FieldSuggestion & {
  manualFillRequired: false;
  proposedValue: string;
  unsupported: false;
};

function isFillableSuggestion(
  suggestion: FieldSuggestion | null
): suggestion is FillableSuggestion {
  if (!suggestion) {
    return false;
  }

  if (suggestion.unsupported || suggestion.manualFillRequired) {
    return false;
  }

  return typeof suggestion.proposedValue === "string" && suggestion.proposedValue.length > 0;
}

function getFillableSuggestions(): FillInstruction[] {
  return state.detectedFields
    .map((field) => {
      const suggestion = getSuggestion(field.internalId);
      if (!isFillableSuggestion(suggestion)) {
        return null;
      }

      return {
        internalId: field.internalId,
        value: suggestion.proposedValue
      } satisfies FillInstruction;
    })
    .filter((item): item is FillInstruction => item !== null);
}

function getUnsupportedCount(): number {
  return Object.values(state.suggestionsByFieldId).filter((suggestion) => {
    return suggestion.unsupported;
  }).length;
}

function getFilledSuccessCount(): number {
  return Object.values(state.fillResultsByFieldId).filter((result) => result.success).length;
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
    return "Guess";
  }

  return "Suggested";
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
      <strong>${result.success ? "Filled" : "Not filled"}</strong>
      <span>${escapeHtml(result.message)}</span>
    </div>
  `;
}

function renderSuggestionSection(field: DetectedField): string {
  const suggestion = getSuggestion(field.internalId);
  if (!suggestion) {
    return `
      <div class="suggestion-box suggestion-box-empty">
        <p class="suggestion-empty">No autofill result saved for this field yet.</p>
      </div>
    `;
  }

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

      ${renderFillResultSection(field.internalId)}
    </div>
  `;
}

function renderFieldList(fields: DetectedField[]): string {
  if (!fields.length) {
    return `
      <div class="empty-state">
        <p>No saved results for this page yet.</p>
        <p class="panel-note">
          Click Autofill page to scan, suggest, and fill in one pass.
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
          <strong>Filled</strong>
          <span>${getFilledSuccessCount()}</span>
        </div>
      </div>

      <ul class="log-list">${logItems}</ul>
    </section>
  `;
}

function render(): void {
  app.innerHTML = `
    <main class="popup-shell">
      <header class="hero">
        <p class="eyebrow">Chrome Extension MVP</p>
        <h1>Job Form Fill</h1>
        <p class="subtitle">
          Working page: ${escapeHtml(state.activePageLabel)}. Autofill supported fields, then edit anything you want manually.
        </p>
      </header>

      <section class="panel actions-panel" aria-labelledby="actions-heading">
        <div class="panel-heading">
          <h2 id="actions-heading">Autofill</h2>
          <span class="status-pill">One step</span>
        </div>

        <div class="status-banner status-${state.statusTone}">
          ${escapeHtml(state.statusMessage)}
        </div>

        <div class="action-grid">
          <button
            type="button"
            class="primary-action"
            data-action="autofill"
            ${state.isInitializing || state.isAutofilling ? "disabled" : ""}
          >
            ${state.isAutofilling ? "Autofilling page..." : "Autofill page"}
          </button>
        </div>

        <p class="panel-note">
          This will scan the page, ask the model for suggestions, and fill every field that looks safe enough to autofill.
        </p>
      </section>

      <section class="panel" aria-labelledby="fields-heading">
        <div class="panel-heading">
          <h2 id="fields-heading">Results</h2>
          <span class="muted-label">${state.detectedFields.length} fields</span>
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

  const autofillButton = app.querySelector<HTMLButtonElement>("[data-action='autofill']");
  autofillButton?.addEventListener("click", () => {
    void handleAutofill();
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
    throw new Error("No active tab is available.");
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
      state.detectedFields = savedPageState.detectedFields;
      state.fillResultsByFieldId = savedPageState.fillResultsByFieldId;
      state.lastSuggestionCount = savedPageState.lastSuggestionCount;
      state.suggestionsByFieldId = savedPageState.suggestionsByFieldId;
      addLog(
        "success",
        `Restored ${state.detectedFields.length} saved field results for this page.`
      );
    } else {
      addLog("info", "No saved autofill state yet for this page.");
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

function validateAutofillInputs(): string | null {
  if (!state.apiEndpoint.trim()) {
    return "API endpoint URL is required before autofill.";
  }

  if (state.apiEndpoint.includes("/v1/chat/completions")) {
    return "This extension now uses the Responses API. Set the endpoint to /v1/responses.";
  }

  if (!state.apiModel.trim()) {
    return "API model is required before autofill.";
  }

  if (!state.apiKey.trim()) {
    return "API key is required before autofill.";
  }

  try {
    JSON.parse(state.profileJson);
  } catch {
    return "Profile JSON is invalid. Fix it before autofill.";
  }

  return null;
}

async function handleAutofill(): Promise<void> {
  const validationError = validateAutofillInputs();
  if (validationError) {
    state.statusMessage = validationError;
    state.statusTone = "error";
    addLog("error", validationError);
    render();
    return;
  }

  state.isAutofilling = true;
  state.statusMessage = "Scanning page, requesting suggestions, and filling supported fields...";
  state.statusTone = "neutral";
  addLog("info", `Starting autofill with ${state.profileFactCount} profile facts.`);
  render();

  try {
    const activeTabContext = await getActiveTabContext();
    state.activePageLabel = activeTabContext.pageLabel;
    state.activePageStorageKey = activeTabContext.storageKey;

    const [scanResult] = await chrome.scripting.executeScript({
      target: { tabId: activeTabContext.tabId },
      func: scanPageFields
    });

    state.detectedFields = scanResult?.result ?? [];
    addLog("success", `Scan found ${state.detectedFields.length} visible fields.`);

    if (state.detectedFields.length === 0) {
      state.suggestionsByFieldId = {};
      state.fillResultsByFieldId = {};
      state.lastSuggestionCount = 0;
      state.statusMessage = "No supported visible fields were detected on this page.";
      state.statusTone = "error";
      addLog("warning", "Autofill stopped because no visible fields were detected.");
      queuePageStateSave();
      return;
    }

    const suggestionResult = await requestFieldSuggestions({
      apiEndpoint: state.apiEndpoint.trim(),
      apiKey: state.apiKey.trim(),
      apiModel: state.apiModel.trim(),
      detectedFields: state.detectedFields,
      profileJson: state.profileJson
    });

    state.lastSuggestionCount = suggestionResult.suggestions.length;
    state.suggestionsByFieldId = Object.fromEntries(
      suggestionResult.suggestions.map((suggestion) => [suggestion.internalId, suggestion])
    );

    const fillableSuggestions = getFillableSuggestions();
    const unsupportedCount = suggestionResult.suggestions.filter((suggestion) => {
      return suggestion.unsupported;
    }).length;

    if (fillableSuggestions.length === 0) {
      state.fillResultsByFieldId = {};
      state.statusMessage =
        unsupportedCount === suggestionResult.suggestions.length
          ? "No fields were autofilled. The model returned only unsupported or manual suggestions."
          : "No fields were autofilled. Suggestions were returned, but none looked safe enough to fill automatically.";
      state.statusTone = "error";
      addLog(
        "warning",
        `Suggestion request returned ${suggestionResult.suggestions.length} suggestions, but none were fillable.`
      );
      queuePageStateSave();
      return;
    }

    const [fillResult] = await chrome.scripting.executeScript({
      target: { tabId: activeTabContext.tabId },
      func: fillFieldValues,
      args: [fillableSuggestions]
    });

    const fillResults = (fillResult?.result ?? []) as FillResult[];
    state.fillResultsByFieldId = Object.fromEntries(
      fillResults.map((result) => [result.internalId, result])
    );

    const successCount = fillResults.filter((result) => result.success).length;
    const failureCount = fillResults.length - successCount;

    state.statusMessage = `Autofill complete. ${successCount} field(s) filled, ${unsupportedCount} unsupported, ${failureCount} failed fills.`;
    state.statusTone = failureCount === 0 ? "success" : "error";
    addLog(
      failureCount === 0 ? "success" : "warning",
      `Autofill finished with ${successCount} filled, ${unsupportedCount} unsupported, ${failureCount} failed fills.`
    );
    queuePageStateSave();
  } catch (error) {
    state.statusMessage =
      error instanceof Error ? error.message : "Autofill failed.";
    state.statusTone = "error";
    addLog("error", state.statusMessage);
  } finally {
    state.isAutofilling = false;
    render();
  }
}

updateProfileFactCount();
void initializePopup();
