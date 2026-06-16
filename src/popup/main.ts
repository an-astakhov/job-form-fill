import "./style.css";

const defaultProfile = `{
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
}`;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Popup root element was not found.");
}

app.innerHTML = `
  <main class="popup-shell">
    <header class="hero">
      <p class="eyebrow">Chrome Extension MVP</p>
      <h1>Job Form Fill</h1>
      <p class="subtitle">
        Review all values before filling. The extension never submits forms.
      </p>
    </header>

    <section class="panel actions-panel" aria-labelledby="actions-heading">
      <div class="panel-heading">
        <h2 id="actions-heading">Actions</h2>
        <span class="status-pill">Step 1 scaffold</span>
      </div>

      <div class="action-grid">
        <button type="button" class="primary-action">Scan page</button>
        <button type="button" class="secondary-action">Suggest values</button>
        <button type="button" class="secondary-action">Fill approved fields</button>
      </div>

      <p class="panel-note">
        Buttons are wired as placeholders for now. Scan, suggestion, and fill logic
        will land in the next implementation steps.
      </p>
    </section>

    <section class="panel" aria-labelledby="fields-heading">
      <div class="panel-heading">
        <h2 id="fields-heading">Detected Fields</h2>
        <span class="muted-label">0 fields</span>
      </div>

      <div class="empty-state">
        <p>No page scan has been run yet.</p>
        <p class="panel-note">
          Detected labels, field types, current values, suggestions, confidence,
          and approval controls will appear here.
        </p>
      </div>
    </section>

    <section class="panel settings-panel" aria-labelledby="settings-heading">
      <div class="panel-heading">
        <h2 id="settings-heading">Settings</h2>
        <span class="muted-label">Local only</span>
      </div>

      <label class="field">
        <span>API endpoint URL</span>
        <input
          type="url"
          name="apiEndpoint"
          placeholder="https://api.example.com/v1/chat/completions"
        />
      </label>

      <label class="field">
        <span>API key</span>
        <input
          type="password"
          name="apiKey"
          placeholder="Stored locally for MVP use"
        />
      </label>

      <label class="field">
        <span>User profile JSON</span>
        <textarea
          name="profileJson"
          spellcheck="false"
          rows="16"
        >${defaultProfile}</textarea>
      </label>
    </section>
  </main>
`;
