# Decisions

- Used the installed `design-taste-frontend` app-screen run and selected its `achromatic-ledger` direction; its blue-grey ground is the chosen Gauge face and the one blue chart hue carries capacity data.
- The supplied spec file ends after Section 6. It refers to Sections 7–17 and Appendices A–D that are not present; those missing details were not invented as binding product requirements.
- Appendix C's promised exact UI copy is absent, so the interface uses concise copy based on the supplied product brief and the error messages are centralized.
- The spec names `hallmark`, but that skill is not installed in this Codex environment. The requested `design-taste-frontend` skill was applied instead.
- No real owner battery report or sanitized fixture was present in the workspace. The synthetic parser fixture is kept under `tests/fixtures/` and is not shipped as demo data.
- Section 6.2 gives `285:27:50` as 1,028,870 seconds, but the stated H:M:S conversion yields 1,027,670 seconds. The parser and test use the arithmetically correct value.
- The original report is cached in IndexedDB. Numeric measurements are calculated locally; only parsed values with computer name, BIOS, battery serial number, and original filename excluded are sent to the same-origin Groq endpoint.
- Groq credentials are server environment variables. The API key is not stored in source code or included in the frontend bundle.
