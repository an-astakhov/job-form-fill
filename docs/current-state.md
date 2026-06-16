# Current Project State

## Overview

`job-form-fill` is a personal-use Chrome extension, Manifest V3, for AI-assisted autofilling of job application forms.

The extension:

- scans the current page for visible form fields
- sends detected fields plus profile context to an LLM
- fills fields that are considered safe enough to autofill
- never submits the form

## What Is Implemented

### Core extension flow

- Manifest V3 extension scaffold
- popup UI built with Vite + TypeScript
- page field scanning for common form controls
- fill logic for inputs, textareas, native selects, and editable text fields
- per-page popup state persistence for the current browser session

### Suggestion flow

- OpenAI Responses API integration
- structured JSON suggestion output with confidence, reason, and support status
- one-step `Autofill page` workflow
- less conservative inference for ordinary non-sensitive questions
- exact-answer requirement for sensitive/legal/work-authorization topics

### Profile context

- structured `profile.json` support
- Markdown knowledge-note support
- bundled Anton profile package included in the repo
- popup editors for:
  - profile JSON
  - experience notes
  - application answer bank
  - role targeting notes

### Cost / context handling

- stable-context prompt caching for OpenAI Responses
- current stable context includes:
  - structured profile JSON
  - Markdown notes
- page-specific request content remains focused on the detected fields

## Current UX

- The popup now uses a single `Autofill page` button.
- The old approve-before-fill workflow has been removed.
- Results persist when the popup is closed and reopened on the same page.
- The results view is intentionally cleaner than earlier versions and hides noisy DOM metadata from the main UI.

## Personalized Profile Status

Anton's personalized profile package is stored in:

- [docs/anton-profile-package/profile.json](/C:/Github/job-form-fill/docs/anton-profile-package/profile.json)
- [docs/anton-profile-package/experience-notes.md](/C:/Github/job-form-fill/docs/anton-profile-package/experience-notes.md)
- [docs/anton-profile-package/application-answer-bank.md](/C:/Github/job-form-fill/docs/anton-profile-package/application-answer-bank.md)
- [docs/anton-profile-package/role-targeting-notes.md](/C:/Github/job-form-fill/docs/anton-profile-package/role-targeting-notes.md)

The popup's bundled reset data also uses this profile package instead of the old placeholder example.

## Validation Status

The current working version builds successfully:

- `npm run typecheck`
- `npm run build`

Local validation page:

- [test-pages/job-application-test.html](/C:/Github/job-form-fill/test-pages/job-application-test.html)

## Known Limits

- Markdown notes are currently sent as full documents in the stable cached context.
- There is no selective snippet picking yet.
- There is no local retrieval layer, embeddings, or backend RAG system.
- Sensitive answers still depend on exact structured profile data, by design.

## Recommended Next Steps

### First priority: real testing

1. Test the current extension on the local validation page.
2. Test it on a few real job-application sites.
3. Check whether:
   - years-of-experience fields improve
   - motivation/open-text answers improve
   - unsupported rates are acceptable
   - token usage feels reasonable

### Likely next improvement

Implement lightweight local Markdown section selection before the API call.

What this means:

- split Markdown notes by headings or sections
- match relevant sections to the detected fields
- send only the most relevant sections instead of all Markdown every time

Why this is attractive:

- cheaper than always sending all Markdown
- simpler than a full RAG system
- likely enough for this product stage

Important note:

This is not meant to be a full-blown RAG system. The intended next step is a lightweight local filter, not embeddings, not a vector database, and not backend retrieval infrastructure.

### Other sensible follow-ups

1. Improve the popup layout further if testing shows any remaining clutter.
2. Add better handling for larger profile packages if the notes grow substantially.
3. Consider stronger field-type heuristics for selects, numeric inputs, and special cases.
4. Add optional request logging or token-usage visibility if cost debugging becomes important.
5. Consider export/import of the full profile package from the popup later if manual editing inside the extension becomes cumbersome.

## Working Tree Note

At the time of writing, Markdown consumption and the personalized Anton package are present in the working tree and validated locally, but may still be awaiting a dedicated commit depending on the latest user instruction.
