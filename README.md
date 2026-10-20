# MOP Generator – RAN & TRM Installation

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
vendor/                 ExcelJS 4.4.0, jsPDF 2.5.1, jspdf-autotable 3.8.2 (all MIT) – bundled, no CDN needed
sw.js, manifest.webmanifest, icons/   installable / offline
Dockerfile, nginx.conf, docker-compose.yml
.github/workflows/deploy-pages.yml
```

## Notes

- Durations are planning assumptions; tune them after the first sites.
- Day 2 start time follows the customer outage approval – change it and all Day 2 times and the outage window move.
- Excel charts are not generated (library limitation); the app shows the timeline instead.

## Changelog

**v2.1.0**
- RAN MOP types per site type: Swap / modernization (2–4 days, outage), Expansion (1–2 days, short outage),
  5G AIR add only (1–2 days, no outage), New site build (2–3 days, no outage) – steps from the Senegal RAN MOPs
- Step editor on the timeline: move any step to another day, change its minutes, remove / restore it, add your own steps
  (moved and added steps run after the same crew's last step of that day); ⚖ Auto-balance days; ↺ Reset steps
- D0 day-before checklist (editable) – printed on the Excel Dashboard, kept out of the site timeline
- TRM: new method "New link (no outage)" (4 days, or 3 with both ends on Day 1); decommissioning can move to the QA day
- No-outage MOP types handled everywhere (tiles, Excel, PDF); tracker dates planned per type

**v2.0.0 – RAN + TRM**
- Start screen and top-bar switch: **RAN** (site installation) or **TRM** (MW link installation). Each part keeps its own setup
- TRM link types with swap method (sets the days): Normal swap 1 team (4 days, or 3 with both ends on Day 1),
  Hot swap 2 teams (3 days), 1+0 → 2+0 upgrade (3 days), IDU / NPU swap only (2 days); space diversity option
- TRM parts per link end: antennas (size), radios (RAU / ML 6352), ML 66xx IDU / MMU – auto-placed in the antenna, radio or indoor step
- Outage day: team arrives just in time for the approved outage start; migration, rollback note, decommissioning, QA / VSS / VCOP
- TRM Excel & PDF: link tracker with Site A / Site B, connections per link end, link-days and finish date
- Templates built from the Libya (Almadar) and Madagascar TRM MOPs

**v1.3.0**
- New RBS / cabinet list (free-text type, qty, minutes) – installed on Day 1 before the baseband
- Site types are fully editable: add any number of parts (low / mid / high band radio, extra RRU, 5G AIR), write the band freely,
  set qty and minutes per unit; install and cabling times follow. Parts named AIR / 5G / NR use the 5G AIR steps
- Older saved setups are converted automatically

**v1.2.0**
- Cutover-day arrival is automatic: approved outage start minus the pre-outage prep (access, safety, rigging/pre-check, GO/NO-GO) – no idle team
- New **PDF** button: short, easy-to-read MOP for the field team (key facts, site types at a glance, one page per type and day with a timeline). Full detail stays in Excel
- PDF libraries bundled: jsPDF 2.5.1 (MIT), jspdf-autotable 3.8.2 (MIT)

**v1.1.0**
- Days per site: 2, 3 or 4 – activities are re-planned per day and the tracker follows
- Outage rules: approved outage start + max allowed hours; power-off never starts before the approved start,
  the outage closes when "Cells on air" is done and every site type is flagged if it runs past the allowed window
- Basebands: any number of basebands, each New or Reused with technology and quantity
- Dashboard inputs (outage start, allowed hours, arrival, days, teams) can be changed directly in the Excel file
