import type { DetectedField } from "./types";
import {
  buildSuggestionUserPayload,
  FIELD_SUGGESTION_RESPONSE_SCHEMA,
  normalizeSuggestionEnvelope,
  parseProfileJson,
  SUGGESTION_SYSTEM_PROMPT,
  type SuggestionEnvelope
} from "./suggestions";

type SuggestionRequest = {
  apiEndpoint: string;
  apiKey: string;
  apiModel: string;
  detectedFields: DetectedField[];
  profileJson: string;
};

export type SuggestionRequestResult = {
  rawContent: string;
  suggestions: SuggestionEnvelope["suggestions"];
};

type ResponsesApiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
    type?: string;
  }>;
};

function hashString(value: string): string {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(16);
}

function isOpenAiResponsesEndpoint(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.hostname === "api.openai.com" &&
      parsedUrl.pathname.endsWith("/v1/responses")
    );
  } catch {
    return false;
  }
}

function buildProfileContextPayload(profile: unknown): string {
  return JSON.stringify(
    {
      contextType: "profile",
      profile
    },
    null,
    2
  );
}

function extractResponseText(response: ResponsesApiResponse): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  if (Array.isArray(response.output)) {
    const text = response.output
      .flatMap((item) => item.content ?? [])
      .map((item) => {
        return item?.type === "output_text" && typeof item.text === "string"
          ? item.text
          : "";
      })
      .join("");

    if (text.trim()) {
      return text;
    }
  }

  throw new Error("Responses API did not return text output.");
}

export async function requestFieldSuggestions(
  request: SuggestionRequest
): Promise<SuggestionRequestResult> {
  const profile = parseProfileJson(request.profileJson);
  const requestBody: Record<string, unknown> = {
    model: request.apiModel,
    store: false,
    temperature: 0,
    instructions: SUGGESTION_SYSTEM_PROMPT,
    text: {
      format: {
        type: "json_schema",
        ...FIELD_SUGGESTION_RESPONSE_SCHEMA
      }
    },
    input: [
      {
        role: "developer",
        content: `Use this profile as stable context.\n${buildProfileContextPayload(profile)}`
      },
      {
        role: "user",
        content: buildSuggestionUserPayload(request.detectedFields, profile)
      }
    ]
  };

  if (isOpenAiResponsesEndpoint(request.apiEndpoint)) {
    requestBody.prompt_cache_key = `job-form-fill:${request.apiModel}:${hashString(
      request.profileJson
    )}`;
    requestBody.prompt_cache_retention = "24h";
  }

  const response = await fetch(request.apiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${request.apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `Suggestion request failed with ${response.status}: ${responseText.slice(0, 240)}`
    );
  }

  const responseJson = (await response.json()) as ResponsesApiResponse;
  const content = extractResponseText(responseJson);
  let parsed: unknown;

  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error(
      `Suggestion API returned non-JSON content. First 240 characters: ${content.slice(0, 240)}`
    );
  }

  const normalized = normalizeSuggestionEnvelope(request.detectedFields, parsed);
  return {
    rawContent: content,
    suggestions: normalized.suggestions
  };
}
