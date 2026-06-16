# Example Profile Package

This package is designed to be filled by another LLM from:

- your CV
- past cover letters
- past application answers
- any work-authorization or relocation preferences you want preserved exactly

## Goal

Produce two kinds of profile data:

1. Structured data for direct autofill
2. Rich Markdown notes for broader inference and future retrieval

## Files

- [profile.json](/C:/Github/job-form-fill/example-profile-package/profile.json)
- [experience-notes.md](/C:/Github/job-form-fill/example-profile-package/experience-notes.md)
- [application-answer-bank.md](/C:/Github/job-form-fill/example-profile-package/application-answer-bank.md)
- [role-targeting-notes.md](/C:/Github/job-form-fill/example-profile-package/role-targeting-notes.md)
- [fill-package-instructions.md](/C:/Github/job-form-fill/example-profile-package/fill-package-instructions.md)

## Instructions for the other LLM

1. Fill `profile.json` with direct factual data only.
2. Do not invent work authorization, visa, salary, legal, or demographic answers.
3. Put richer narrative detail, evidence, and reusable wording into the Markdown files.
4. Preserve dates and company names as accurately as possible.
5. If information is uncertain, keep it out of `profile.json` and place it in Markdown with a note.

## How this should be used here later

- `profile.json` will be used for direct field mapping.
- Markdown files can be summarized or selectively retrieved for broader autofill suggestions.
