import type { DetectedField } from "./types";

export type KnowledgeDocument = {
  content: string;
  title: string;
};

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

export const FIELD_SUGGESTION_RESPONSE_SCHEMA = {
  name: "field_suggestions",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            internalId: { type: "string" },
            proposedValue: { type: ["string", "null"] },
            confidence: { type: "number" },
            reason: { type: "string" },
            sourceFacts: {
              type: "array",
              items: { type: "string" }
            },
            requiresUserReview: { type: "boolean" },
            manualFillRequired: { type: "boolean" },
            unsupported: { type: "boolean" }
          },
          required: [
            "internalId",
            "proposedValue",
            "confidence",
            "reason",
            "sourceFacts",
            "requiresUserReview",
            "manualFillRequired",
            "unsupported"
          ]
        }
      }
    },
    required: ["suggestions"]
  }
} as const;

export const SUGGESTION_SYSTEM_PROMPT = `You are an autofill assistant for a personal job application helper.
You map detected web form fields to a supplied user profile.
You will receive stable context containing structured profile JSON and optional Markdown knowledge notes.
Use only the supplied profile facts and Markdown notes.
Never invent facts.
Treat unsupported as a last resort for ordinary non-sensitive fields.
For ordinary non-sensitive fields, you may provide a best-effort proposal with low confidence when the profile strongly suggests a likely answer.
Use Markdown knowledge notes to infer ordinary non-sensitive answers such as years of experience, skill depth, project evidence, and reusable narrative summaries.
For ordinary experience questions such as years using Python, SQL, machine learning, or similar skills, infer a reasonable estimate from dated work history, role summaries, project bullets, and skills evidence when possible.
If the field asks for years of experience and the evidence supports an estimate, return a concise numeric answer such as "5".
Never answer sensitive, legal, immigration, demographic, disability, salary, notice-period, or work-authorization questions unless an exact approved answer is present in the structured profile JSON.
Prefer concise answers.
Do not submit anything.
Return strict JSON only in the shape {"suggestions":[...]}.`;

export function parseProfileJson(profileJson: string): unknown {
  return JSON.parse(profileJson);
}

export function countMeaningfulProfileFacts(value: unknown): number {
  if (typeof value === "string") {
    return value.trim() ? 1 : 0;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return 1;
  }

  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countMeaningfulProfileFacts(item), 0);
  }

  if (value && typeof value === "object") {
    return Object.values(value).reduce((total, item) => {
      return total + countMeaningfulProfileFacts(item);
    }, 0);
  }

  return 0;
}

export function buildSuggestionUserPayload(
  fields: DetectedField[],
  knowledgeDocuments: KnowledgeDocument[]
): string {
  return JSON.stringify(
    {
      task: "Suggest autofill values for the detected job application fields.",
      rules: [
        "Return one suggestion for every detected field.",
        "Use only the structured profile and Markdown knowledge notes supplied in this request.",
        "If a field is unsupported, set proposedValue to null and unsupported to true.",
        "Do not invent dates, companies, degrees, addresses, legal statuses, salary expectations, or work authorization answers.",
        "Only answer sensitive or legal questions when the exact approved answer exists in the structured profile JSON.",
        "Treat unsupported as a last resort for ordinary non-sensitive fields when the profile contains enough evidence for a reasonable guess.",
        "Use Markdown knowledge notes for ordinary inference, project evidence, skill depth, and reusable narrative answers.",
        "For ordinary non-sensitive fields, if the profile reasonably implies a likely answer, you may propose it with low confidence and explain the inference in the reason.",
        "For ordinary years-of-experience questions, estimate from dated roles and relevant skill evidence when the profile supports a reasonable guess, and prefer a short numeric string.",
        "Set manualFillRequired to true for controls that are not safe to autofill.",
        "Return one JSON object that matches the required schema exactly."
      ],
      availableKnowledgeSources: knowledgeDocuments.map((document) => document.title),
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
