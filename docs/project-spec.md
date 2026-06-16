# AI-Assisted Job Application Autofill Extension

## Spec Review

This spec is strong for an MVP. It is appropriately scoped around scan -> suggest -> review -> fill, and it explicitly forbids auto-submit, which is the right safety boundary.

A few implementation notes and assumptions:

- `internalId` should be stable within a single scan result. Long-term persistence across page reloads is not required for the MVP.
- "OpenAI-compatible API endpoint" is broad, so the implementation should isolate request construction behind a small client module. The exact response envelope can be finalized in Step 6.
- A separate `model` setting is required in practice for most OpenAI-compatible chat-completions endpoints, even though it was not explicitly listed in the original settings UI.
- Custom dropdowns should be detected but not force-filled in the first version unless the DOM is clearly a safe native control.
- Nearby/context text should be capped aggressively to avoid sending excessive page content.
- Sensitive questions should default to unsupported unless the profile contains an explicit approved answer.

## MVP Goal

Build a personal-use Chrome Extension, Manifest V3, for AI-assisted autofilling job application forms such as Workday, Greenhouse, Lever, and SmartRecruiters.

The extension must **not** auto-submit forms. It should scan the current page, propose values, and fill the fields that are safe enough to autofill while leaving the rest for manual editing.

## Functional Requirements

1. Scan the current visible page for form fields.
2. Extract useful metadata for each field.
3. Send the field list plus a locally stored user profile to an OpenAI-compatible API endpoint.
4. Receive structured fill suggestions.
5. Show suggestions in the popup UI.
6. Fill supported fields into the current page in one step.
7. Leave unsupported or unsafe fields untouched for manual editing.
8. Never submit the application automatically.

## Tech Stack

- Manifest V3 Chrome extension
- TypeScript
- Vite if useful
- Plain React for popup UI, or vanilla TypeScript if simpler
- No heavy UI framework required
- Local extension storage for user profile and API settings

## Architecture

### 1. Manifest

Use Manifest V3.

Required permissions:

- `activeTab`
- `scripting`
- `storage`

Host permissions should be minimal. For MVP, rely on `activeTab` where possible.

### 2. Popup UI

The popup should have:

- Button: `Autofill page`
- List of detected fields
- For each detected field:
  - detected label
  - field type
  - current value if any
  - suggested value
  - confidence score
  - status
  - fill result
- Settings section:
  - API endpoint URL
  - API model
  - API key, for personal local use only
  - editable user profile JSON textarea

For personal use, storing the API key in local Chrome storage is acceptable for this MVP, but keep the implementation isolated so it can later be replaced by a backend proxy.

### 3. Content Script: Field Detection

Implement a content script that scans the page for visible fields:

- `input`
- `textarea`
- `select`
- elements with `contenteditable="true"`
- elements with `role="textbox"`
- optionally elements with `role="combobox"`

Ignore:

- hidden fields
- disabled fields
- readonly fields
- submit buttons
- password fields
- file upload fields for now

For each detected field, return a stable internal field id and metadata:

```ts
type DetectedField = {
  internalId: string;
  tagName: string;
  inputType?: string;
  role?: string | null;
  name?: string | null;
  id?: string | null;
  ariaLabel?: string | null;
  ariaLabelledByText?: string | null;
  placeholder?: string | null;
  labelText?: string | null;
  nearbyText: string[];
  sectionText?: string | null;
  currentValue?: string | null;
  options?: string[];
  required: boolean;
  disabled: boolean;
  readonly: boolean;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};
```

Label extraction order:

1. Explicit `<label for="...">`
2. Wrapping `<label>`
3. `aria-label`
4. `aria-labelledby`
5. placeholder
6. nearest preceding text node
7. nearest parent section/card heading
8. nearby visible text within approximately the same form row or parent container

Also collect surrounding text from the nearest meaningful container, but cap it to avoid huge payloads.

### 4. Content Script: Filling Fields

Implement:

```ts
fillFields(fillInstructions: FillInstruction[]): FillResult[]
```

Where:

```ts
type FillInstruction = {
  internalId: string;
  value: string;
};
```

The filler should:

- Find the corresponding DOM element.
- Set the value.
- Dispatch relevant events:
  - `input`
  - `change`
  - `blur`
- For React/Workday-style fields, use the native value setter when possible.
- Return success/failure per field.

For select elements:

- Match option by exact text first.
- Then case-insensitive text.
- Then value.
- If no match, mark as failed.

Do not attempt complex custom dropdown filling in the first version. Detect them, show suggestions, but mark them as `manual fill required` unless a safe implementation is obvious.

### 5. OpenAI Suggestion Call

Create a function that sends:

- detected fields
- user profile JSON
- strict rules

The model must return structured JSON only.

Use this output schema:

```ts
type FieldSuggestion = {
  internalId: string;
  proposedValue: string | null;
  confidence: number;
  reason: string;
  sourceFacts: string[];
  requiresUserReview: boolean;
  manualFillRequired: boolean;
  unsupported: boolean;
};
```

Rules for the model:

- Use only facts from the supplied profile.
- Do not invent dates, companies, degrees, addresses, legal statuses, salary expectations, or work authorization answers.
- If a field cannot be answered from the profile, return `unsupported: true` and `proposedValue: null`.
- Treat `unsupported` as a last resort for ordinary non-sensitive fields when the profile strongly supports a reasonable guess.
- For legal, immigration, disability, demographic, EEO, salary, notice-period, and work-authorization questions, only answer if the exact approved answer exists in the profile.
- For ordinary years-of-experience questions, estimate from dated work history and skill evidence when possible.
- Prefer concise answers.
- Do not submit anything.
- Do not generate fake claims.
- Return one suggestion per detected field.

### 6. Example Profile JSON

```json
{
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
}
```

### 7. Prompt

System/developer prompt target:

> You are an autofill assistant for a personal job application helper. You map detected web form fields to a supplied user profile. You must use only the supplied profile facts. Unsupported is the last resort for ordinary fields when the profile strongly supports a reasonable guess. Never invent facts. Never answer sensitive/legal/work-authorization/demographic questions unless an exact approved answer is present in the profile. Return strict JSON only.

The user message should contain the field list and profile.

### 8. Privacy Constraints

For MVP:

- Do not send full page HTML.
- Do not send unrelated page text.
- Send only detected field metadata and capped nearby text.
- Store profile locally.
- Store API key locally only for personal use.
- Add a visible note in the UI: `Review all values before filling. The extension never submits forms.`

### 9. Acceptance Criteria

The MVP is complete when:

1. Extension loads unpacked in Chrome.
2. Popup opens.
3. User can paste/edit profile JSON.
4. User can run one-step autofill on a normal form page.
5. Detected fields appear in popup.
6. Suggestions appear next to fields.
7. Supported text inputs, textareas, and native selects are filled correctly.
8. Unsupported or manual-only fields are clearly left for manual handling.
10. Extension never submits the form.
11. Results persist while reopening the popup on the same page.

### 10. Initial Test Page

Create a local test HTML page with:

- First name
- Last name
- Email
- Phone
- Current employer
- Current title
- LinkedIn URL
- Years of Python experience
- Short textarea: `Describe your machine learning experience`
- Select: country
- Select: willing to relocate
- Unsupported field: `Expected salary`
- Unsupported field: `Do you require visa sponsorship?`

Use this page to validate one-step scanning, suggestions, and filling.

## Implementation Steps

1. Manifest and popup skeleton.
2. Content script field scanner.
3. Display detected fields in popup.
4. Local profile storage.
5. API settings storage.
6. Suggestion API call.
7. Suggestion rendering.
8. Fill supported fields.
9. Test page.
10. Basic error handling and logging.
11. Simplify to one-step autofill.
12. Persist page state and improve suggestion behavior.
13. Prepare example profile package.

## Progress

- [x] Step 1. Manifest and popup skeleton.
- [x] Step 2. Content script field scanner.
- [x] Step 3. Display detected fields in popup.
- [x] Step 4. Local profile storage.
- [x] Step 5. API settings storage.
- [x] Step 6. Suggestion API call.
- [x] Step 7. Suggestion rendering.
- [x] Step 8. Fill supported fields.
- [x] Step 9. Test page.
- [x] Step 10. Basic error handling and logging.
- [x] Step 11. Simplify to one-step autofill.
- [x] Step 12. Persist page state and improve suggestion behavior.
- [x] Step 13. Prepare example profile package.

## Current MVP Notes

- The popup now uses a single `Autofill page` action instead of separate scan, suggest, and approve steps.
- OpenAI Responses API support is in place for the current MVP path.
- Prompt caching is enabled for stable profile context on OpenAI Responses requests.
- Page-specific scan results and fill outcomes persist while reopening the popup on the same page.
- The recommended profile authoring direction is hybrid:
  - small structured JSON for direct autofill
  - Markdown notes for richer context and future retrieval

## Step 1 Scope

Step 1 is complete when the repo contains:

- MV3 manifest with the required permissions
- popup HTML entrypoint
- popup TypeScript entrypoint
- popup skeleton UI with placeholder sections for actions, detected fields, and settings
- base styles and extension-safe layout
- build configuration for a future multi-file extension codebase

## Step 1 Implementation Notes

Chosen approach for Step 1:

- Use Vite with vanilla TypeScript to keep the popup simple and lightweight.
- Keep the UI modular enough that later steps can attach scan/suggest/fill behavior without replacing the layout.
- Delay background script setup until it is actually needed by later steps.
