# Profile Authoring Strategy

## Recommendation

Use a hybrid approach:

- Keep a small structured profile for direct, high-confidence fields.
- Keep one or more Markdown files for richer background knowledge.

## What should stay structured

Use structured data for fields that are frequently mapped directly into forms:

- full name
- email
- phone
- city and country
- LinkedIn and GitHub
- work authorization answers
- notice period
- relocate answer
- salary handling preference

This can remain JSON or move later to a friendlier form editor in the extension UI.

## What should move to Markdown

Use Markdown for content that is more natural to edit as prose or bullet lists:

- CV summary
- work history details
- project descriptions
- skills evidence
- reusable cover-letter snippets
- past application answers
- role-specific notes

## Why this split works

- Structured data is better for deterministic autofill.
- Markdown is better for long-form editing and maintenance.
- The model can use Markdown as supporting context without forcing everything into a rigid schema.
- It reduces friction when updating experience, projects, or narrative answers.

## Caching implications

There are two different caching layers to think about:

1. Prompt caching

- Good for repeated requests with the same stable prefix.
- Works best when the stable profile context is sent first and field-specific context is sent later.
- The current extension now uses a stable cache key for OpenAI Responses requests based on the profile content.

2. Knowledge retrieval

- Better for larger Markdown knowledge bases than sending everything on every request.
- The long-term fit is retrieval over local documents or a backend-backed file-search layer.

## Suggested next evolution

1. Keep the current structured profile for direct autofill.
2. Add support for attaching one or more local Markdown notes as optional knowledge sources.
3. Summarize or retrieve only relevant passages from those Markdown files before the suggestion request.
4. Eventually replace raw JSON editing with:
   - a basic profile form for common fields
   - a notes/documents area for Markdown knowledge

## Short version

Yes, Markdown would work well as part of the knowledge base.

No, I would not replace the structured profile with Markdown entirely.

The most practical product direction is:

- structured profile for direct answers
- Markdown for richer context
- retrieval or summarization for larger supporting material
