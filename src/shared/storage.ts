export type StoredPopupSettings = {
  apiEndpoint: string;
  apiKey: string;
  profileJson: string;
};

const STORAGE_KEY = "popupSettings";

export async function loadPopupSettings(
  defaults: StoredPopupSettings
): Promise<StoredPopupSettings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const raw = stored[STORAGE_KEY];

  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  return {
    apiEndpoint:
      typeof raw.apiEndpoint === "string" ? raw.apiEndpoint : defaults.apiEndpoint,
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : defaults.apiKey,
    profileJson:
      typeof raw.profileJson === "string" ? raw.profileJson : defaults.profileJson
  };
}

export async function savePopupSettings(
  settings: StoredPopupSettings
): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY]: settings
  });
}
