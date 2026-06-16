# Fill Package Instructions

Use this package to build a real autofill profile from:

- CV or resume
- LinkedIn profile text
- cover letters
- past application answers
- notes about work authorization, relocation, salary handling, and preferences

## Output rules

1. Fill `profile.json` with direct factual data only.
2. Do not invent employers, dates, degrees, titles, skills, locations, salaries, or legal answers.
3. For sensitive answers such as work authorization, visa sponsorship, salary, disability, demographic, or EEO topics, only include information that is explicitly provided by the user.
4. Put richer narrative detail into the Markdown files instead of forcing everything into JSON.
5. When information is uncertain, keep it out of `profile.json` and place it in Markdown with a short uncertainty note.
6. When possible, add evidence that helps estimate skill depth and years of experience.

## File-by-file guidance

### `profile.json`

Use for:

- name
- contact details
- location
- links
- current role
- structured role history
- education
- skills
- exact reusable answers

### `experience-notes.md`

Use for:

- career summary
- major projects
- quantified impact
- detailed skill evidence
- first and most recent use of important skills

### `application-answer-bank.md`

Use for:

- reusable motivation answers
- work style answers
- logistics answers
- any approved exact wording for sensitive items

### `role-targeting-notes.md`

Use for:

- preferred role families
- preferred domains
- strongest selling points
- role-specific tailoring notes

## Recommended instruction to the other LLM

```text
Fill this package from the supplied CV, past applications, cover letters, and notes.
Keep profile.json strictly factual and structured.
Use the Markdown files for richer context, evidence, reusable answers, and tailoring.
Do not invent missing facts.
Leave sensitive answers blank unless they are explicitly provided.
When possible, preserve date ranges and add enough evidence for another model to estimate years of experience for major skills.
```
