import type { DetectedField } from "./types";

export type FieldSuggestion = {
  internalId: string;
  proposedValue: string | null;
  confidence: number;
  reason: string;
  sourceFacts: string[];
  requiresUserReview: boolean;
  manualFillRequired: boolean;
  unsupported: boolean;
};

export type SuggestionEnvelope = {
  suggestions: FieldSuggestion[];
};

export const SUGGESTION_SYSTEM_PROMPT = `You are an autofill assistant for a personal job application helper.
You map detected web form fields to a supplied user profile.
Use only the supplied profile facts.
If a field is unsupported, return unsupported.
Never invent facts.
Never answer sensitive, legal, immigration, demographic, disability, salary, notice-period, or work-authorization questions unless an exact approved answer is present in the profile.
Prefer concise answers.
Do not submit anything.
Return strict JSON only in the shape {"suggestions":[...]}.`;

export function parseProfileJson(profileJson: string): unknown {
  return JSON.parse(profileJson);
}

export function buildSuggestionUserPayload(
  fields: DetectedField[],
  profile: unknown
): string {
  return JSON.stringify(
    {
      task: "Suggest autofill values for the detected job application fields.",
      rules: [
        "Return one suggestion for every detected field.",
        "Use only profile facts supplied in this request.",
        "If unsupported, set proposedValue to null and unsupported to true.",
        "Do not invent dates, companies, degrees, addresses, legal statuses, salary expectations, or work authorization answers.",
        "Only answer sensitive or legal questions when the exact approved answer exists in the profile.",
        "Set manualFillRequired to true for controls that are not safe to autofill.",
        "Return strict JSON only."
      ],
      profile,
      fields
    },
    null,
    2
  );
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function createUnsupportedSuggestion(field: DetectedField): FieldSuggestion {
  return {
    internalId: field.internalId,
    proposedValue: null,
    confidence: 0,
    reason: "No valid suggestion was returned for this field.",
    sourceFacts: [],
    requiresUserReview: true,
    manualFillRequired: true,
    unsupported: true
  };
}

function normalizeSuggestion(raw: unknown): FieldSuggestion | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const suggestion = raw as Record<string, unknown>;
  if (typeof suggestion.internalId !== "string") {
    return null;
  }

  return {
    internalId: suggestion.internalId,
    proposedValue:
      typeof suggestion.proposedValue === "string" ? suggestion.proposedValue : null,
    confidence: clampConfidence(suggestion.confidence),
    reason: typeof suggestion.reason === "string" ? suggestion.reason : "",
    sourceFacts: normalizeStringArray(suggestion.sourceFacts),
    requiresUserReview: suggestion.requiresUserReview !== false,
    manualFillRequired: suggestion.manualFillRequired === true,
    unsupported: suggestion.unsupported === true
  };
}

export function normalizeSuggestionEnvelope(
  fields: DetectedField[],
  payload: unknown
): SuggestionEnvelope {
  const normalized = new Map<string, FieldSuggestion>();
  const payloadObject =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const rawSuggestions: unknown[] = Array.isArray(payloadObject?.suggestions)
    ? payloadObject.suggestions
    : [];

  for (const raw of rawSuggestions) {
    const suggestion = normalizeSuggestion(raw);
    if (!suggestion) {
      continue;
    }

    normalized.set(suggestion.internalId, suggestion);
  }

  return {
    suggestions: fields.map((field) => {
      return normalized.get(field.internalId) ?? createUnsupportedSuggestion(field);
    })
  };
}
