import type { DetectedField } from "./types";
import {
  buildSuggestionUserPayload,
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

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

function extractMessageContent(response: ChatCompletionResponse): string {
  const content = response.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        return item?.type === "text" && typeof item.text === "string" ? item.text : "";
      })
      .join("");
  }

  throw new Error("Suggestion API response did not contain message content.");
}

export async function requestFieldSuggestions(
  request: SuggestionRequest
): Promise<SuggestionEnvelope> {
  const profile = parseProfileJson(request.profileJson);
  const response = await fetch(request.apiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${request.apiKey}`
    },
    body: JSON.stringify({
      model: request.apiModel,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: SUGGESTION_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: buildSuggestionUserPayload(request.detectedFields, profile)
        }
      ]
    })
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `Suggestion request failed with ${response.status}: ${responseText.slice(0, 240)}`
    );
  }

  const responseJson = (await response.json()) as ChatCompletionResponse;
  const content = extractMessageContent(responseJson);
  const parsed = JSON.parse(content) as unknown;
  return normalizeSuggestionEnvelope(request.detectedFields, parsed);
}
