# Gauge

Gauge turns a Windows `powercfg /batteryreport` HTML file into a battery health dashboard. The uploaded HTML is processed in the active browser tab and is not persisted. Numeric calculations happen locally. For the optional AI interpretation, Gauge sends calculated battery measurements to Groq through a server endpoint; computer names, BIOS details, battery serial numbers, original filenames, and the original HTML are excluded.

## Run locally

Requirements: Node.js 20 or newer and npm.

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and set `GROQ_API_KEY` for local AI analysis. The key is read only by the server endpoint and is never bundled into the browser app. On Vercel, set `GROQ_API_KEY` in the project's Environment Variables. Use Command Prompt or PowerShell to create a report with `powercfg /batteryreport`, then upload the resulting HTML file. XML reports are not supported in this phase.

## Checks

```sh
npm run build
npm run typecheck
npm run lint
npm run check:gradients
npm run check:size
```

The parser accepts the documented Windows HTML table classes. There is no demo data in the app; the dashboard uses only uploaded report values. Missing measurements are labeled as unreported.

## Privacy

The original report stays in memory for the active tab and can be removed with **Clear this report**. Calculated battery measurements and report-derived readings are sent to Groq for AI interpretation when a report is uploaded or when AI analysis is retried. Device identifiers, BIOS details, battery serial numbers, filenames, and the original HTML are excluded from that request. Numeric dashboard metrics are calculated locally, and the AI text is presented separately as interpretation. The API key stays on the server. The theme preference is the only value persisted in local storage.
