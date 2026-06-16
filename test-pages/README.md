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
2. Click `Scan page`.
3. Confirm the popup detects:
   - first name
   - last name
   - email
   - phone
   - current employer
   - current title
   - LinkedIn URL
   - years of Python experience
   - machine learning experience textarea
   - country select
   - willing to relocate select
   - expected salary
   - visa sponsorship
   - short cover note contenteditable field
4. Enter API endpoint, model, key, and profile JSON.
5. Click `Suggest values`.
6. Confirm suggestions render with:
   - proposed value
   - confidence
   - reason
   - source facts
   - approval checkbox where allowed
7. Approve a subset of supported suggestions.
8. Click `Fill approved fields`.
9. Confirm:
   - text inputs populate
   - textarea populates
   - native selects choose the expected option
   - unsupported/manual fields remain for manual handling
   - the form is never submitted

## Notes

- If you test through `file://`, Chrome may require enabling extension access to file URLs in the extension details page.
- The contenteditable `Short cover note` field is included to exercise `role="textbox"` detection and fill behavior.
