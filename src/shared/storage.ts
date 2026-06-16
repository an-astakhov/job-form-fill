import type { FieldSuggestion } from "./suggestions";
import type { DetectedField, FillResult } from "./types";

export type StoredPopupSettings = {
  apiEndpoint: string;
  apiKey: string;
  apiModel: string;
  profileJson: string;
};

export type StoredPageState = {
  approvedByFieldId: Record<string, boolean>;
  detectedFields: DetectedField[];
  fillResultsByFieldId: Record<string, FillResult>;
  lastSuggestionCount: number;
  suggestionsByFieldId: Record<string, FieldSuggestion>;
};

const SETTINGS_STORAGE_KEY = "popupSettings";

function hashString(value: string): string {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(16);
}

export function buildPageStateStorageKey(tabId: number, url: string): string {
  return `pageState:${tabId}:${hashString(url)}`;
}

export async function loadPopupSettings(
  defaults: StoredPopupSettings
): Promise<StoredPopupSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  const raw = stored[SETTINGS_STORAGE_KEY];

  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  return {
    apiEndpoint:
      typeof raw.apiEndpoint === "string" ? raw.apiEndpoint : defaults.apiEndpoint,
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : defaults.apiKey,
    apiModel: typeof raw.apiModel === "string" ? raw.apiModel : defaults.apiModel,
    profileJson:
      typeof raw.profileJson === "string" ? raw.profileJson : defaults.profileJson
  };
}

export async function savePopupSettings(
  settings: StoredPopupSettings
): Promise<void> {
  await chrome.storage.local.set({
    [SETTINGS_STORAGE_KEY]: settings
  });
}

export async function loadPageState(
  storageKey: string
): Promise<StoredPageState | null> {
  const stored = await chrome.storage.session.get(storageKey);
  const raw = stored[storageKey];

  if (!raw || typeof raw !== "object") {
    return null;
  }

  return {
    approvedByFieldId:
      raw.approvedByFieldId && typeof raw.approvedByFieldId === "object"
        ? (raw.approvedByFieldId as Record<string, boolean>)
        : {},
    detectedFields: Array.isArray(raw.detectedFields)
      ? (raw.detectedFields as DetectedField[])
      : [],
    fillResultsByFieldId:
      raw.fillResultsByFieldId && typeof raw.fillResultsByFieldId === "object"
        ? (raw.fillResultsByFieldId as Record<string, FillResult>)
        : {},
    lastSuggestionCount:
      typeof raw.lastSuggestionCount === "number" ? raw.lastSuggestionCount : 0,
    suggestionsByFieldId:
      raw.suggestionsByFieldId && typeof raw.suggestionsByFieldId === "object"
        ? (raw.suggestionsByFieldId as Record<string, FieldSuggestion>)
        : {}
  };
}

export async function savePageState(
  storageKey: string,
  pageState: StoredPageState
): Promise<void> {
  await chrome.storage.session.set({
    [storageKey]: pageState
  });
}

export async function clearPageState(storageKey: string): Promise<void> {
  await chrome.storage.session.remove(storageKey);
}
