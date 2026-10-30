# Gauge

Gauge turns a Windows `powercfg /batteryreport` HTML file into a local battery health dashboard. Report contents are read and processed in the browser; there is no account or server-side processing.

## Run locally

Requirements: Node.js 20 or newer and npm.

```sh
npm install
npm run dev
```

Choose `Open a report`, or explore the bundled sample. Use Command Prompt or PowerShell to create a report with `powercfg /batteryreport`. XML reports are not supported in this phase.

## Checks

```sh
npm run build
npm run typecheck
npm run lint
npm run check:gradients
npm run check:size
```

The parser accepts the documented Windows HTML table classes. The sample report in `public/sample/` is synthetic demonstration data; it is not the owner's original report and must not be treated as fixture evidence.

## Privacy

Gauge does not upload or persist report data. The optional theme setting is the only local preference stored by the app. Production response headers deny cross-origin connections.
