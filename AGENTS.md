# Gauge implementation notes

- Follow the product constraints in `README.md` and `docs/DECISIONS.md`.
- Keep report content local to the browser and render it as text.
- `src/lib/report/dom.ts` is the only module that should use `DOMParser` or inspect parsed HTML nodes.
- Keep parsing and analysis pure outside the DOM boundary.
- Do not add remote fonts, image assets, telemetry, or external requests.
- Do not add CSS or SVG gradients.
