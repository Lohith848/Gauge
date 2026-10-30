# Design notes

The app-screen direction is recorded in `.taste-skill/gauge/direction.json` and uses the Achromatic ledger style. The chosen product face is the meter-like blue-grey ground. Gauge's one chart hue marks capacity history, while the shell stays neutral. The capacity bar and battery silhouette make the report's health percentage legible before the person reads the charts.

The first viewport gives the capacity verdict and available-versus-design measure first. History, battery/AC use, observed runtime, recent activity, and device details follow as separate bands so the screen changes density while staying in one visual system.

No demonstration report is included in the shipped app. The synthetic parser fixture stays under `tests/fixtures/` for parser behavior only. Every visible dashboard measurement is read from the uploaded report or labeled as missing.
