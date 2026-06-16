import "./style.css";
import { scanPageFields } from "../content/fieldScanner";
import {
  loadPopupSettings,
  savePopupSettings,
  type StoredPopupSettings
} from "../shared/storage";
import type { DetectedField } from "../shared/types";

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
  detectedFields: DetectedField[];
  isInitializing: boolean;
  isScanning: boolean;
  profileJson: string;
  statusMessage: string;
  statusTone: "neutral" | "success" | "error";
  storageMessage: string;
  storageTone: "neutral" | "success" | "error";
};

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("Popup root element was not found.");
}

const app = appRoot;

const state: PopupState = {
  apiEndpoint: "",
  apiKey: "",
  detectedFields: [],
  isInitializing: true,
  isScanning: false,
  profileJson: defaultProfile,
  statusMessage: "Ready to scan the active tab.",
  statusTone: "neutral",
  storageMessage: "Loading saved local settings...",
  storageTone: "neutral"
};

let saveTimeoutId: number | null = null;

function getCurrentSettings(): StoredPopupSettings {
  return {
    apiEndpoint: state.apiEndpoint,
    apiKey: state.apiKey,
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
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function render(): void {
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
          <span class="status-pill">Steps 4-5 next</span>
        </div>

        <div class="status-banner status-${state.statusTone}">
          ${escapeHtml(state.statusMessage)}
        </div>

        <div class="action-grid">
          <button
            type="button"
            class="primary-action"
            data-action="scan"
            ${state.isScanning || state.isInitializing ? "disabled" : ""}
          >
            ${state.isScanning ? "Scanning..." : "Scan page"}
          </button>
          <button type="button" class="secondary-action" disabled>
            Suggest values
          </button>
          <button type="button" class="secondary-action" disabled>
            Fill approved fields
          </button>
        </div>

        <p class="panel-note">
          Suggestion and fill actions stay disabled until the next implementation steps.
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

  const apiEndpointInput = app.querySelector<HTMLInputElement>("input[name='apiEndpoint']");
  apiEndpointInput?.addEventListener("input", (event) => {
    state.apiEndpoint = (event.currentTarget as HTMLInputElement).value;
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
    state.statusMessage = `Scan complete. Found ${state.detectedFields.length} visible field(s).`;
    state.statusTone = "success";
  } catch (error) {
    state.detectedFields = [];
    state.statusMessage =
      error instanceof Error ? error.message : "Scanning failed for an unknown reason.";
    state.statusTone = "error";
  } finally {
    state.isScanning = false;
    render();
  }
}

void initializePopup();
