# Gauge implementation notes

- Follow the product constraints in `README.md` and `docs/DECISIONS.md`.
- Cache the original uploaded report in IndexedDB. Parse and calculate values locally.
- Send only parsed, identifier-stripped measurements to the same-origin Groq endpoint for AI interpretation. Never expose the Groq key to the browser.
- `src/lib/report/dom.ts` is the only module that should use `DOMParser` or inspect parsed HTML nodes.
- Keep parsing and analysis pure outside the DOM boundary.
- Do not add remote fonts, image assets, telemetry, or external requests outside the Groq server endpoint.
- Do not add CSS or SVG gradients.
