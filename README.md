# MOP Generator – Site Installation

A small web app that builds a time-phased installation MOP (Excel) from site types and equipment.
Enter the country, site types (radios / AIR / baseband), unit install times and schedule rules; the app shows the
2-day plan per site type live and exports a complete workbook:

- **Dashboard** – days, hours per day, outage window, site-days, project finish date
- **One sheet per site type** – steps, team, impact, dependencies, clock start/end, 30-min time mapping (formulas)
- **Connections** – what connects to what, quantities per site type
- **Site Tracker** – auto schedule per team (country weekend aware) with status and progress

Everything runs in the browser. No backend, no database, no data leaves the user's computer.

## Run it

| Option | How |
|---|---|
| Try locally | `python3 -m http.server 8080` in this folder → open http://localhost:8080 |
| Docker | `docker compose up -d --build` → http://SERVER:8080 |
| Any web server / IIS / SharePoint static | copy the folder as-is (index.html at the root) |
| GitHub Pages | push to a repo, Settings → Pages → Source: *GitHub Actions* (workflow included) |

> Opening `index.html` by double-click also works, but offline mode (service worker) only works when served over http(s).

## Use it as a team

- **Save setup** exports every input (country, types, times, site list) as a `.json` file.
  Share it on Teams / email; a colleague clicks **Load setup** to get the same project.
- `examples/lebanon-setup.json` is a ready example (4 site types, 25 sites).
- Inputs are also remembered per browser, so users continue where they stopped.
- Installable as an app (Chrome/Edge: *Install MOP Generator* in the address bar) and works offline after first load.

## Change the defaults

Defaults (equipment list, unit minutes, activity minutes, default site types) are in `js/core.js` → `DEFAULT_STATE`.
Activity steps and texts are in `activities()` in the same file. After changing files, bump `VERSION` in `sw.js`
so users receive the update.

## Files

```
index.html              page
css/style.css           styles (light/dark)
js/core.js              scheduling engine + Excel builder
js/app.js               user interface
vendor/exceljs.min.js   ExcelJS 4.4.0 (MIT) – bundled, no CDN needed
sw.js, manifest.webmanifest, icons/   installable / offline
Dockerfile, nginx.conf, docker-compose.yml
.github/workflows/deploy-pages.yml
```

## Notes

- Durations are planning assumptions; tune them after the first sites.
- Day 2 start time follows the customer outage approval – change it and all Day 2 times and the outage window move.
- Excel charts are not generated (library limitation); the app shows the timeline instead.
