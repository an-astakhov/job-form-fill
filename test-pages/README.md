# Test Page Validation

Use [job-application-test.html](/c:/Github/job-form-fill/test-pages/job-application-test.html) to validate the extension end to end.

## Recommended local setup

1. Build the extension:

```powershell
npm run build
```

2. Load `dist/` as an unpacked extension in Chrome.

3. Serve this repo locally so the test page runs over HTTP instead of `file://`:

```powershell
npm run dev -- --host 127.0.0.1 --port 4173
```

4. Open:

```text
http://127.0.0.1:4173/test-pages/job-application-test.html
```

## Validation flow

1. Open the extension popup on the test page.
2. Enter API endpoint, model, key, and profile JSON.
   For OpenAI, use `https://api.openai.com/v1/responses`.
3. Click `Autofill page`.
4. Confirm the popup detects a wide range of controls, including:
   - direct profile fields such as name, email, phone, city, country, LinkedIn, GitHub, and website
   - inference-heavy fields such as years of Python, SQL, machine learning, credit risk, and climate risk experience
   - standard reusable answers such as relocation and preferred work mode
   - open-text prompts such as why this role, why this company, and project summaries
   - awkward label patterns such as wrapped labels, `aria-labelledby`, placeholder-only text, and contenteditable textboxes
   - manual-only or sensitive fields such as salary, visa sponsorship, disability status, and veteran status
5. Confirm suggestions render with:
   - proposed value
   - confidence
   - reason
   - fill result
   - unsupported or guess status where appropriate
6. Confirm:
   - text inputs populate
   - textarea populates
   - native selects choose the expected option
   - awkward or unsafe fields remain for manual handling where appropriate
   - hidden, password, file, disabled, and readonly inputs are ignored or not filled
   - the form is never submitted

## Notes

- If you test through `file://`, Chrome may require enabling extension access to file URLs in the extension details page.
- The page now includes intentionally annoying ATS-like cases to help evaluate scanner quality, ordinary inference quality, and unsupported/manual handling.
