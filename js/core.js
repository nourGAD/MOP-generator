/* MOP engine + Excel builder. Works in browser (window.MOP) and node (module.exports). */
(function (root) {
  const DEFAULT_STATE = () => ({
    project: { name: "Swap & Modernization", country: "Lebanon", prefix: "LB", day1Arrive: "07:00", day2Arrive: "07:00", maxHours: 11,
      startDate: "2026-10-05", teams: 3, sectors: 3, legacyRRU: 6, weekend: "sun", newBB: "RP6655", oldBB: "BB5212", regions: "" },
    equipment: [
      { model: "Radio 4486 B8B20B28", kind: "radio", min: 20 },
      { model: "Radio 4490 B1B3", kind: "radio", min: 20 },
      { model: "Radio 6646 B8B20B28", kind: "radio", min: 40 },
      { model: "AIR 6419 B42", kind: "air", min: 60 },
      { model: "AIR 3219 B42", kind: "air", min: 45 },
      { model: "AIR 3255 B78AA", kind: "air", min: 40 },
    ],
    unit: { cableRadio: 15, cableAIR: 20, dismantleRRU: 20, jumperSector: 30 },
    fixed: Object.fromEntries(FIXED.map(f => [f[0], f[2]])),
    types: [
      { name: "Type-1", sites: 5, lowModel: "Radio 4486 B8B20B28", lowQty: 3, midModel: "Radio 4490 B1B3", midQty: 3, airModel: "AIR 6419 B42", airQty: 3, reuseCabling: false },
      { name: "Type-2", sites: 14, lowModel: "Radio 4486 B8B20B28", lowQty: 3, midModel: "Radio 4490 B1B3", midQty: 3, airModel: "AIR 3219 B42", airQty: 3, reuseCabling: false },
      { name: "Type-3", sites: 1, lowModel: "Radio 6646 B8B20B28", lowQty: 1, midModel: "Radio 4490 B1B3", midQty: 3, airModel: "AIR 3219 B42", airQty: 3, reuseCabling: false },
      { name: "Type-4", sites: 5, lowModel: "Radio 4486 B8B20B28", lowQty: 3, midModel: "Radio 4490 B1B3", midQty: 3, airModel: "AIR 3255 B78AA", airQty: 3, reuseCabling: false },
    ],
    siteList: "",
  });

  // key, label, default minutes, day
  const FIXED = [
    ["access1", "Day 1 – Site access & PTW", 15], ["safety1", "Day 1 – Safety briefing", 30], ["precheck", "Pre-check", 30],
    ["material", "Material check", 30], ["rigging1", "Day 1 – Rigging", 30], ["rpInstall", "Install RP6655", 60],
    ["rpPower", "Power RP6655", 30], ["rpSw", "RP6655 SW & config", 90], ["tn", "Transmission", 45],
    ["powerRadios", "Power up radios", 30], ["close1", "Day 1 – Close day", 20],
    ["access2", "Day 2 – Site access & PTW", 15], ["safety2", "Day 2 – Safety briefing", 15], ["rigging2", "Day 2 – Rigging", 15],
    ["precut", "Pre-cutover check", 20], ["gng", "GO / NO-GO", 10], ["powerOff", "Power off old equipment", 10],
    ["rehome", "3G re-home", 30], ["txmig", "TX migration", 15], ["integ", "Integration", 60], ["rf", "RF & alarm check", 20],
    ["onair", "Cells on air", 10], ["powerAir", "Power up AIRs", 30], ["nrInteg", "5G integration", 30], ["nrUnlock", "5G unlock", 15],
    ["svc", "Service test", 45], ["ext", "External alarms", 30], ["dismBB", "Dismantle old BB", 30], ["dress", "Final dressing & tower check", 45],
    ["pack", "Pack old material", 60], ["rsc", "QA & RSC submission", 60], ["snags", "Clear RSC snags", 30], ["close2", "Day 2 – Close site", 15],
  ];

  const WEEKEND = {
    sun: { label: "Sunday off", code: 11, days: [0] }, frisat: { label: "Friday + Saturday off", code: 7, days: [5, 6] },
    satsun: { label: "Saturday + Sunday off", code: 1, days: [6, 0] }, fri: { label: "Friday off", code: 16, days: [5] },
  };
  const wk = P => WEEKEND[P.weekend] || WEEKEND.sun;
  const sub = (state, str) => String(str || "").replace(/RP6655/g, state.project.newBB || "new BB").replace(/BB5212/g, state.project.oldBB || "old 3G BB");
  const bbText = P => `${P.oldBB ? `1x Reuse ${P.oldBB} (3G) + ` : ""}1x New ${P.newBB || "BB"} (4G+5G)`;
  const addWD = (P, d, n) => { const x = new Date(d); let k = 0; while (k < n) { x.setUTCDate(x.getUTCDate() + 1); if (!wk(P).days.includes(x.getUTCDay())) k++; } return x; };
  const firstWD = (P, d) => { const x = new Date(d); while (wk(P).days.includes(x.getUTCDay())) x.setUTCDate(x.getUTCDate() + 1); return x; };
  function finishDate(state, n) { const P = state.project, t = Math.max(1, +P.teams || 1); const f = firstWD(P, new Date(P.startDate + "T00:00:00Z")); return n ? addWD(P, addWD(P, f, Math.floor((n - 1) / t) * 2), 1) : f; }
  const COLORS = ["1F77B4", "2CA02C", "9467BD", "FF7F0E", "17BECF", "D62728", "8C564B", "E377C2"];
  const short = m => (m || "").split(" ").slice(0, 2).join(" ");
  const hm = s => { const [h, m] = String(s || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const fmt = min => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return `${h}:${String(m).padStart(2, "0")}`; };
  const clock = min => { min = Math.round(min); return `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`; };

  function equipMin(state, model) { const e = state.equipment.find(x => x.model === model); return e ? +e.min : 0; }

  function activities(state, t) {
    const F = state.fixed, U = state.unit, P = state.project;
    const nr = (+t.lowQty || 0) + (+t.midQty || 0), na = +t.airQty || 0;
    const radTxt = [t.lowQty ? `${t.lowQty}x ${short(t.lowModel)}` : "", t.midQty ? `${t.midQty}x ${short(t.midModel)}` : ""].filter(Boolean).join(" + ");
    const radMin = (+t.lowQty || 0) * equipMin(state, t.lowModel) + (+t.midQty || 0) * equipMin(state, t.midModel);
    const airMin = na * equipMin(state, t.airModel);
    const reuse = !!t.reuseCabling;
    const heavy = /6419/.test(t.airModel || "");
    const A = (name, desc, who, dur, after, impact, rem) => ({ name, desc, who, dur: Math.max(0, Math.round(+dur || 0)), after, impact: impact || "Non-SA", rem: rem || "" });
    const D1 = [
      A("Site access & PTW", "Request site access from NOC with CR no.; permit / landlord / security clearance", "All", F.access1, []),
      A("Safety briefing", "Toolbox talk, risk assessment, rescue plan, PPE & climbing gear, wind check", "All", F.safety1, [1], "", "Stop climbing if wind > 38 km/h"),
      A("Pre-check", "Screenshot alarms & cells, record existing equipment & rectifier capacity, before-photos", "FE", F.precheck, [2]),
      A("Material check", "Check material vs BoQ (qty, serial, damage, SFPs, jumpers, CBs)", "Team lead", F.material, [2], "", "Report missing items immediately"),
      A("Rigging", "Pulley, ropes, rescue kit, exclusion zone", "Tower crew", F.rigging1, [4]),
      A("Install radios", `Install ${radTxt} with brackets & grounding next to old RRUs`, "Tower crew", radMin, [5], "", "Old RRUs stay in service"),
      A("Install 5G AIRs", `Install ${na}x ${short(t.airModel)} with brackets; set azimuth & tilt per RND`, "Tower crew", airMin, [6], "", heavy ? "Heavy AIR: hoist + structural approval" : ""),
      A("Radio cabling", `Run & fix DC + fiber for ${nr} radios to RP6655; ground kits; weatherproof; labels`, "Tower crew", reuse ? 0 : nr * U.cableRadio, [7], "",
        reuse ? "SKIPPED – existing cabling reused" : "⭐ PRIORITY – needed for cutover. AIR cabling can run in parallel (same route, install once). Skip if existing cabling is reused"),
      A("Install RP6655", "Mount RP6655 in rack/enclosure + grounding (BB5212 stays)", "Ground tech", F.rpInstall, [4], "", "Parallel with tower work"),
      A("Power RP6655", "Connect RP6655 to rectifier CB, check voltage/polarity & capacity", "Ground tech", F.rpPower, [9]),
      A("RP6655 SW & config", "Power up, load SW / site config / licenses (4G + 5G)", "FE", F.rpSw, [10], "", "Pre-stage in WH to save time"),
      A("Transmission", "Connect RP6655 to TX (new port), check OSS reachability", "FE", F.tn, [11]),
      A("Power up radios", "Connect radio DC & fiber at RP6655 side, power up, no HW alarms. Cells LOCKED", "FE + Ground tech", F.powerRadios, [8, 12], "", "Never unlock before jumpers connected"),
      A("Close day", "Secure cables, photos, inform NOC leaving site", "All", F.close1, [13]),
    ];
    const D2 = [
      A("Site access & PTW", "NOC access with CR no.; confirm approved outage window", "All", F.access2, [], "", "Start time per outage approval"),
      A("Safety briefing", "Toolbox talk, rigging check", "All", F.safety2, [1]),
      A("Rigging", "Rope & pulley ready for jumper swap + AIR cabling", "Tower crew", F.rigging2, [2]),
      A("Pre-cutover check", "Alarm/KPI snapshot & old config backup (remote); FE test calls on site", "Remote integrator + FE", F.precut, [2], "", "Remote, parallel with field"),
      A("GO / NO-GO", "Day 1 work OK, integrator & NOC online; approval to start outage", "Team lead + Remote integrator", F.gng, [3, 4], "", "Any issue = postpone"),
      A("Power off old equipment", "Lock 3G/4G cells (remote), power off old RRUs & old LTE BB (site)", "Remote integrator + FE", F.powerOff, [5], "Outage", "🔴 OUTAGE STARTS"),
      A("Jumper swap", "Per sector: old RRU jumpers off, new radio jumpers to antennas, torque + weatherproof", "Tower crew", (+P.sectors || 3) * U.jumperSector, [6], "Outage", "Keep old RRUs mounted (rollback)"),
      A("3G re-home", `Connect BB5212 to new low-band radio (${short(t.lowModel)})`, "Ground tech", P.oldBB ? F.rehome : 0, [6], "Outage", P.oldBB ? "Parallel with jumper swap" : "SKIPPED – no reused 3G baseband"),
      A("TX migration", "Move backhaul from old BB to RP6655", "FE", F.txmig, [6], "Outage", "Parallel with jumper swap"),
      A("Integration", "Activate RP6655, unlock 4G cells, activate 3G on new radio", "Remote integrator", F.integ, [7, 8, 9], "Outage", "Remote action"),
      A("RF & alarm check", "RSSI, VSWR, sector / cross-feeder check (remote) + visual check on site", "Remote integrator + FE", F.rf, [10], "Outage"),
      A("Cells on air", "NOC confirms all 3G/4G cells on air", "NOC + Remote integrator", F.onair, [11], "Outage", "🟢 OUTAGE ENDS – rollback if not OK"),
      A("AIR cabling", `Run & fix DC + fiber for ${na} AIRs to RP6655; ground kits; weatherproof; labels`, "Tower crew", reuse ? 0 : na * U.cableAIR, [7], "",
        reuse ? "SKIPPED – existing cabling reused" : "Tower crew free during integration / only if not done on Day 1 (skip if already done or cabling reused)"),
      A("Power up AIRs", "Connect AIR DC & fiber at RP6655, power up, no HW alarms", "Ground tech", F.powerAir, [13]),
      A("5G integration", "Load / activate NR config on AIRs", "Remote integrator", F.nrInteg, [12, 14], "", "🛰 Remote – parallel with field work"),
      A("5G unlock", "Unlock N78 cells, check 5G attach", "Remote integrator", F.nrUnlock, [15], "", "🛰 Remote – parallel with field work"),
      A("Service test", "Remote KPI / counter check per sector; FE test calls (voice, data, VoLTE, 5G) on site", "Remote integrator + FE", F.svc, [16], "", "🛰 Remote – parallel with field work"),
      A("External alarms", "Move site alarms to new BB, test with NOC", "Ground tech", F.ext, [12]),
      A("Dismantle old RRUs", "Remove old RRUs & cables (do not cut cables)", "Tower crew", (+P.legacyRRU || 0) * U.dismantleRRU, [12, 13], "", "Only after cells on air"),
      A("Dismantle old BB", "Remove old LTE BB & unused modules", "Ground tech", F.dismBB, [18]),
      A("Final dressing & tower check", "Final cable dressing, label & weatherproofing check, torque marks", "Tower crew", F.dress, [19], "", "💡 Should be done while installing (Day 1) to save time – here only final check"),
      A("Pack old material", "Pack dismantled units, return note with serials", "Ground tech", F.pack, [19, 20]),
      A("QA & RSC submission", "QA walk, photo package & checklist, submit RSC", "Team lead + FE", F.rsc, [17, 21]),
      A("Clear RSC snags", "Fix any snags raised by RSC review & resubmit (if any)", "Tower crew + Team lead", F.snags, [23], "", "Buffer – skip if RSC clean"),
      A("Close site", "Clean site, close PTW, inform NOC 🎉", "All", F.close2, [22, 24], "", "24h KPI check done remotely next day – no site visit"),
    ];
    [D1, D2].forEach(L => L.forEach(a => { a.name = sub(state, a.name); a.desc = sub(state, a.desc); a.rem = sub(state, a.rem); }));
    return [
      { title: sub(state, "🔧 DAY 1 – INSTALLATION: RP6655 + RADIOS + 5G AIRs (no impact)"), arrive: hm(P.day1Arrive), acts: D1 },
      { title: "⚡ DAY 2 – CUTOVER + 5G (remote, parallel) + DISMANTLE + QA / RSC", arrive: hm(P.day2Arrive), acts: D2 },
    ];
  }

  function schedule(state, t) {
    const days = activities(state, t);
    days.forEach(d => {
      d.acts.forEach((a, i) => {
        a.start = a.after.length ? Math.max(...a.after.map(k => d.acts[k - 1].end)) : d.arrive;
        a.end = a.start + a.dur;
      });
      d.leave = Math.max(...d.acts.map(a => a.end));
      d.hours = d.leave - d.arrive;
    });
    const out = days[1].acts.filter(a => a.impact === "Outage");
    const oS = Math.min(...out.map(a => a.start)), oE = Math.max(...out.map(a => a.end));
    return { days, outage: oE - oS, outStart: oS, outEnd: oE, total: days[0].hours + days[1].hours };
  }

  function sitesOf(state) {
    const lines = (state.siteList || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length) {
      return lines.map((l, i) => {
        const p = l.split(/[,;\t]/).map(x => x.trim());
        return { id: p[0] || `SITE-${i + 1}`, type: p[1] || state.types[0].name, gov: p[2] || "" };
      });
    }
    const out = []; let n = 1;
    state.types.forEach(t => { for (let i = 0; i < (+t.sites || 0); i++) out.push({ id: `${state.project.prefix || "SITE"}-${String(n++).padStart(3, "0")}`, type: t.name, gov: "" }); });
    return out;
  }

  // ---------------- Excel ----------------
  const CL = n => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const ARGB = h => "FF" + h;
  const solid = h => ({ type: "pattern", pattern: "solid", fgColor: { argb: ARGB(h) } });
  const cfFill = h => ({ fill: { type: "pattern", pattern: "solid", bgColor: { argb: ARGB(h) } } });
  const thin = { style: "thin", color: { argb: "FFC9CED6" } };
  const BOX = { top: thin, left: thin, bottom: thin, right: thin };
  const NAVY = "14213D", TEAL = "0F766E", HDR = "2E3B55", IN = "FFF9DB";
  const F = (o = {}) => Object.assign({ name: "Arial", size: 10 }, o);

  function put(ws, r, c, v, o = {}) {
    const cell = ws.getCell(r, c);
    cell.value = v;
    cell.font = F(o.font || {});
    cell.alignment = o.al || { wrapText: true, vertical: "top" };
    if (o.fill) cell.fill = solid(o.fill);
    if (o.fmt) cell.numFmt = o.fmt;
    if (o.border !== false) cell.border = BOX;
    return cell;
  }
  const CEN = { horizontal: "center", vertical: "middle", wrapText: true };
  const LFT = { horizontal: "left", vertical: "middle", wrapText: true };
  const fx = (formula, result) => ({ formula, result });

  async function buildWorkbook(ExcelJS, state) {
    const wb = new ExcelJS.Workbook();
    wb.creator = "MOP Generator"; wb.calcProperties.fullCalcOnLoad = true;
    const P = state.project;
    const types = state.types.map((t, i) => Object.assign({}, t, { color: COLORS[i % COLORS.length], sch: schedule(state, t) }));
    const sites = sitesOf(state);
    const nav = [["🏠 Dashboard", "Dashboard"], ...types.map(t => [t.name, t.name]), ["🔌 Connections", "Connections"], ["📅 Site Tracker", "Site Tracker"]];
    const db = wb.addWorksheet("Dashboard", { views: [{ showGridLines: false }], properties: { tabColor: { argb: ARGB(NAVY) } } });
    const tws = types.map(t => wb.addWorksheet(t.name, { views: [{ showGridLines: false, state: "frozen", xSplit: 2, ySplit: 6, zoomScale: 85 }], properties: { tabColor: { argb: ARGB(t.color) } } }));
    const cn = wb.addWorksheet("Connections", { views: [{ showGridLines: false }] });
    const st = wb.addWorksheet("Site Tracker", { views: [{ showGridLines: false, state: "frozen", xSplit: 2, ySplit: 5 }], properties: { tabColor: { argb: "FF2F9E44" } } });

    const banner = (ws, title, sub, lastCol) => {
      ws.mergeCells(1, 1, 1, lastCol); put(ws, 1, 1, title, { font: { size: 16, bold: true, color: { argb: "FFFFFFFF" } }, fill: NAVY, al: LFT, border: false }); ws.getRow(1).height = 34;
      ws.mergeCells(2, 1, 2, lastCol); put(ws, 2, 1, sub, { font: { size: 9, italic: true, color: { argb: "FFFFFFFF" } }, fill: TEAL, al: LFT, border: false });
    };
    const navbar = (ws, row) => nav.forEach(([lab, sh], i) => {
      const c = put(ws, row, i + 1, { text: lab, hyperlink: `#'${sh}'!A1` }, { font: { size: 9, bold: true, underline: true, color: { argb: ARGB(NAVY) } }, fill: "E8EEF6", al: CEN });
    });
    const hdr = (ws, r, c0, labels) => labels.forEach((l, i) => put(ws, r, c0 + i, l, { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: HDR, al: CEN }));

    // ---------- Type sheets ----------
    const G0 = 11, NS = 26;
    const KP = {};
    types.forEach((t, ti) => {
      const ws = tws[ti]; const last = G0 + NS - 1;
      banner(ws, `MOP ${t.name}  |  ${t.lowQty}x ${t.lowModel} + ${t.midQty}x ${t.midModel} + ${t.airQty}x ${t.airModel}`,
        `BB: ${bbText(P)}   •   Sites: ${t.sites}   •   Day-time work only   •   Blue = edit   •   Day 2 start follows outage approval${t.reuseCabling ? "   •   Existing cabling reused" : ""}`, last);
      navbar(ws, 3);
      hdr(ws, 6, 1, ["SN", "Activity", "What to do", "Who", "Impact", "After SN", "Dur (min)", "Start", "End", "Remarks"]);
      ws.mergeCells(6, G0, 6, last); put(ws, 6, G0, "🕒 TIME MAPPING (30-min slots from team arrival)", { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: HDR, al: CEN });
      let r = 7; const info = [];
      t.sch.days.forEach((d, di) => {
        const br = r;
        ws.mergeCells(r, 1, r, 5); put(ws, r, 1, d.title, { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: TEAL, al: LFT });
        put(ws, r, 6, "Arrive", { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: TEAL, al: CEN });
        put(ws, r, 7, fx(`Dashboard!$C$${4 + di}`, d.arrive / 1440), { font: { bold: true, color: { argb: "FF008000" } }, fill: IN, al: CEN, fmt: "hh:mm" });
        put(ws, r, 8, "Leave", { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: TEAL, al: CEN });
        for (let s = 0; s < NS; s++) put(ws, r, G0 + s, fx(`$G$${br}+${s}/48`, (d.arrive + s * 30) / 1440), { font: { size: 7, bold: true, color: { argb: "FFFFFFFF" } }, fill: TEAL, al: { textRotation: 90, horizontal: "center" }, fmt: "hh:mm" });
        ws.getRow(r).height = 34;
        r++; const first = r; const rows = {};
        d.acts.forEach((a, n) => {
          const k = n + 1; rows[k] = r;
          put(ws, r, 1, `${di + 1}.${k}`, { font: { bold: true }, al: CEN });
          put(ws, r, 2, a.name, { font: { bold: true } }); put(ws, r, 3, a.desc); put(ws, r, 4, a.who, { al: CEN });
          put(ws, r, 5, a.impact, { al: CEN }); put(ws, r, 6, a.after.map(x => `${di + 1}.${x}`).join(", ") || "—", { al: CEN });
          put(ws, r, 7, a.dur, { font: { color: { argb: "FF0000FF" } }, fill: IN, al: CEN });
          put(ws, r, 8, fx(a.after.length ? `MAX(${a.after.map(x => `I${rows[x]}`).join(",")})` : `$G$${br}`, a.start / 1440), { al: CEN, fmt: "hh:mm" });
          put(ws, r, 9, fx(`H${r}+G${r}/1440`, a.end / 1440), { al: CEN, fmt: "hh:mm" });
          put(ws, r, 10, a.rem);
          for (let s = 0; s < NS; s++) {
            const col = CL(G0 + s); const slot = d.arrive + s * 30;
            const res = a.start >= slot && a.start < slot + 30 ? `${a.dur}'` : "";
            put(ws, r, G0 + s, fx(`IF(AND($H${r}>=${col}$${br}-0.0001,$H${r}<${col}$${br}+1/48-0.0001),$G${r}&"'","")`, res), { font: { size: 7, bold: true, color: { argb: "FFFFFFFF" } }, al: CEN });
          }
          ws.getRow(r).height = 30; r++;
        });
        const lastR = r - 1;
        put(ws, br, 9, fx(`MAX(I${first}:I${lastR})`, d.leave / 1440), { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: TEAL, al: CEN, fmt: "hh:mm" });
        const ok = d.hours / 60 <= +P.maxHours + 0.001;
        put(ws, br, 10, fx(`TEXT(I${br}-G${br},"h:mm")&" h  "&IF((I${br}-G${br})*24>Dashboard!$C$6+0.001,"⚠ over "&Dashboard!$C$6&"h","✔ OK")`, `${fmt(d.hours)} h  ${ok ? "✔ OK" : "⚠ over " + P.maxHours + "h"}`), { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: TEAL, al: LFT });
        const tl = CL(G0), g = `${tl}${first}:${CL(last)}${lastR}`;
        const ov = `${tl}$${br}<$I${first},${tl}$${br}+1/48>$H${first}`;
        ws.addConditionalFormatting({ ref: g, rules: [
          { type: "expression", priority: 1, formulae: [`AND($E${first}="Outage",${ov})`], style: cfFill("E03131") },
          { type: "expression", priority: 2, formulae: [`AND(ISNUMBER(SEARCH("Tower",$D${first})),${ov})`], style: cfFill("F59F00") },
          { type: "expression", priority: 3, formulae: [`AND(LEFT($D${first},6)="Remote",${ov})`], style: cfFill("9C36B5") },
          { type: "expression", priority: 4, formulae: [`AND(${ov})`], style: cfFill("4C6EF5") },
          { type: "expression", priority: 5, formulae: [`${tl}$${br}>=$G$${br}+Dashboard!$C$6/24-0.0001`], style: cfFill("E9ECEF") },
        ] });
        ws.addConditionalFormatting({ ref: `J${br}`, rules: [{ type: "expression", priority: 6, formulae: [`ISNUMBER(SEARCH("⚠",J${br}))`], style: cfFill("C92A2A") }] });
        info.push({ br, first, last: lastR });
      });
      ws.addConditionalFormatting({ ref: `E7:E${r}`, rules: [{ type: "expression", priority: 7, formulae: ['$E7="Outage"'], style: Object.assign(cfFill("FFE3E3"), { font: { bold: true, color: { argb: "FFC00000" } } }) }] });
      ws.addConditionalFormatting({ ref: `D7:D${r}`, rules: [{ type: "expression", priority: 8, formulae: ['LEFT($D7,6)="Remote"'], style: { font: { bold: true, color: { argb: "FF9C36B5" } } } }] });
      const o = info[1];
      const oS = `_xlfn.MINIFS(H${o.first}:H${o.last},E${o.first}:E${o.last},"Outage")`, oE = `_xlfn.MAXIFS(I${o.first}:I${o.last},E${o.first}:E${o.last},"Outage")`;
      const ks = [["🔧 Day 1", `I${info[0].br}-G${info[0].br}`, t.sch.days[0].hours], ["⚡ Day 2", `I${info[1].br}-G${info[1].br}`, t.sch.days[1].hours],
        ["🔴 Outage", `${oE}-${oS}`, t.sch.outage], ["⏱ Total", "B5+D5", t.sch.total]];
      KP[t.name] = {};
      ks.forEach(([l, f, v], i) => {
        const c = 2 + i * 2;
        put(ws, 4, c, l, { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: NAVY, al: CEN });
        put(ws, 5, c, fx(f, v / 1440), { font: { size: 14, bold: true, color: { argb: l.includes("Outage") ? "FFC00000" : ARGB(NAVY) } }, fill: "E8EEF6", al: CEN, fmt: "[h]:mm" });
        KP[t.name][["1", "2", "Outage", "Total"][i]] = `${CL(c)}5`;
      });
      ws.getRow(5).height = 26;
      ws.mergeCells(5, G0, 5, G0 + 11);
      put(ws, 5, G0, fx(`"🔴 Outage window (Day 2):  "&TEXT(${oS},"hh:mm")&"  →  "&TEXT(${oE},"hh:mm")`, `🔴 Outage window (Day 2):  ${clock(t.sch.outStart)}  →  ${clock(t.sch.outEnd)}`), { font: { bold: true, color: { argb: "FFC92A2A" } }, fill: "FFE3E3", al: CEN });
      KP[t.name].Window = `${CL(G0)}5`;
      [["Tower", "F59F00", "FF000000"], ["Ground/FE", "4C6EF5", "FFFFFFFF"], ["Outage", "E03131", "FFFFFFFF"], ["Remote", "9C36B5", "FFFFFFFF"], ["After max", "E9ECEF", "FF000000"]].forEach(([lab, col, fc], i) => {
        ws.mergeCells(4, G0 + i * 3, 4, G0 + i * 3 + 2); put(ws, 4, G0 + i * 3, lab, { font: { size: 8, bold: true, color: { argb: fc } }, fill: col, al: CEN });
      });
      [7, 20, 46, 14, 8, 8, 8, 7, 7, 26].forEach((w, i) => ws.getColumn(i + 1).width = w);
      for (let s = 0; s < NS; s++) ws.getColumn(G0 + s).width = 3.4;
      ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    });

    // ---------- Connections ----------
    const nT = types.length;
    banner(cn, "🔌 Connections – what connects to what", "Exact ports per approved design / RND. Qty per site type in blue. 'Step' = MOP step where it is done.", 6 + nT);
    navbar(cn, 3);
    hdr(cn, 5, 1, ["#", "From", "To", "Cable / type", ...types.map(t => t.name), "Step", "Remarks"]);
    const conn0 = [
      ["RP6655", "Low-band radio", "Fiber CPRI + SFP", t => +t.lowQty, "1.8 / 1.13", "One per radio"],
      ["RP6655", "Mid-band radio", "Fiber CPRI + SFP", t => +t.midQty, "1.8 / 1.13", "One per radio"],
      ["RP6655", "AIR (N78)", "Fiber + SFP", t => +t.airQty, "2.13 / 2.14", "Per design per AIR"],
      ["BB5212 (reused)", "Low-band radio (U900)", "Fiber CPRI + SFP", () => (P.oldBB ? 1 : 0), "2.8", "3G re-home in outage"],
      ["Rectifier / PDU", "RP6655", "DC power + CB", () => 1, "1.10", ""],
      ["Rectifier / PDU", "Radios", "DC power cable + CB", t => +t.lowQty + +t.midQty, "1.8 / 1.13", ""],
      ["Rectifier / PDU", "AIRs", "DC power cable + CB", t => +t.airQty, "2.13 / 2.14", ""],
      ["Radios", "Existing antennas", "RF jumpers (per port map)", () => "map", "2.7", "Torque + weatherproof"],
      ["RP6655", "TX / MW / router", "Ethernet / fiber backhaul", () => 1, "1.12 / 2.9", "New port Day 1, migration Day 2"],
      ["Site alarms", "RP6655 / BB5212", "Alarm cable", () => 1, "2.18", ""],
      ["All new units", "Site ground bar", "Grounding cable", t => +t.lowQty + +t.midQty + +t.airQty + 1, "1.6–1.9 / 2.13", "Radios + AIRs + RP6655"],
    ];
    const conn = conn0.map(row => row.map(x => typeof x === "string" ? sub(state, x) : x));
    conn.forEach(([a, b, c, q, s, rm], i) => {
      const r = 6 + i, z = i % 2 ? "F7F9FC" : null;
      put(cn, r, 1, i + 1, { al: CEN, fill: z }); put(cn, r, 2, a, { font: { bold: true }, fill: z }); put(cn, r, 3, b, { fill: z }); put(cn, r, 4, c, { fill: z });
      types.forEach((t, j) => put(cn, r, 5 + j, q(t), { font: { color: { argb: "FF0000FF" } }, fill: IN, al: CEN }));
      put(cn, r, 5 + nT, s, { al: CEN, fill: z }); put(cn, r, 6 + nT, rm, { fill: z });
    });
    [4, 18, 24, 26].forEach((w, i) => cn.getColumn(i + 1).width = w);
    types.forEach((t, j) => cn.getColumn(5 + j).width = 9);
    cn.getColumn(5 + nT).width = 13; cn.getColumn(6 + nT).width = 28;

    // ---------- Site Tracker ----------
    banner(st, "📅 Site Tracker – auto schedule & progress", `Day 1 dates auto-planned from project start + number of teams (each team: 1 site / 2 working days, ${wk(P).label}). Override blue cells if needed.`, 11);
    navbar(st, 3);
    hdr(st, 5, 1, ["#", "Site ID", "Site type", "Team", "Day 1", "Day 2 (cutover)", "Day 1 status", "Day 2 status", "Progress", "Region", "Remarks"]);
    const typeList = `"${types.map(t => t.name).join(",")}"`;
    const start = new Date(P.startDate + "T00:00:00Z");
    const xl = d => d.getTime() / 86400000 + 25569;
    sites.forEach((s, i) => {
      const r = 6 + i, teams = Math.max(1, +P.teams || 1);
      const d1 = addWD(P, firstWD(P, start), Math.floor(i / teams) * 2), d2 = addWD(P, d1, 1);
      put(st, r, 1, i + 1, { al: CEN });
      put(st, r, 2, s.id, { font: { color: { argb: "FF0000FF" } }, fill: IN, al: CEN });
      put(st, r, 3, s.type, { font: { color: { argb: "FF0000FF" } }, fill: IN, al: CEN });
      st.getCell(r, 3).dataValidation = { type: "list", allowBlank: true, formulae: [typeList] };
      put(st, r, 4, fx(`MOD(A${r}-1,Dashboard!$C$8)+1`, (i % teams) + 1), { al: CEN, fmt: '"Team "0' });
      put(st, r, 5, fx(`WORKDAY.INTL(Dashboard!$C$7-1,1+INT((A${r}-1)/Dashboard!$C$8)*2,${wk(P).code})`, xl(d1)), { fill: IN, al: CEN, fmt: "ddd dd-mmm" });
      put(st, r, 6, fx(`WORKDAY.INTL(E${r},1,${wk(P).code})`, xl(d2)), { al: CEN, fmt: "ddd dd-mmm" });
      [7, 8].forEach(c => { put(st, r, c, "Not started", { font: { color: { argb: "FF0000FF" } }, fill: IN, al: CEN }); st.getCell(r, c).dataValidation = { type: "list", formulae: ['"Not started,In progress,Done,On hold"'] }; });
      put(st, r, 9, fx(`COUNTIF(G${r}:H${r},"Done")/2`, 0), { font: { bold: true }, al: CEN, fmt: "0%" });
      put(st, r, 10, s.gov, { font: { color: { argb: "FF0000FF" } }, fill: IN, al: CEN });
      const regs = String(P.regions || "").split(",").map(x => x.trim()).filter(Boolean);
      if (regs.length && regs.join(",").length < 250) st.getCell(r, 10).dataValidation = { type: "list", allowBlank: true, formulae: [`"${regs.join(",").replace(/"/g, "")}"`] };
      put(st, r, 11, "");
    });
    const L = 5 + Math.max(1, sites.length);
    st.addConditionalFormatting({ ref: `I6:I${L}`, rules: [{ type: "dataBar", priority: 1, cfvo: [{ type: "num", value: 0 }, { type: "num", value: 1 }], color: { argb: "FF2F9E44" } }] });
    st.addConditionalFormatting({ ref: `G6:H${L}`, rules: [["Done", "D3F9D8", "FF2B8A3E"], ["In progress", "FFF3BF", "FFE67700"], ["On hold", "FFE3E3", "FFC92A2A"]].map(([v, c, f], i) =>
      ({ type: "expression", priority: 2 + i, formulae: [`G6="${v}"`], style: Object.assign(cfFill(c), { font: { bold: true, color: { argb: f } } }) })) });
    st.addConditionalFormatting({ ref: `E6:F${L}`, rules: [{ type: "expression", priority: 6, formulae: ["E6=TODAY()"], style: Object.assign(cfFill("FFD43B"), { font: { bold: true } }) }] });
    [4, 12, 10, 9, 13, 15, 12, 12, 10, 14, 26].forEach((w, i) => st.getColumn(i + 1).width = w);

    // ---------- Dashboard ----------
    banner(db, `📡 ${P.name}${P.country ? " – " + P.country : ""} – Installation Dashboard`, `2 days per site • day-time work only • remote integration in parallel with field work • ${sites.length} sites • ${nT} equipment types`, 14);
    navbar(db, 3);
    const inputs = [["👷 Team on site – Day 1", hm(P.day1Arrive) / 1440, "hh:mm"], ["👷 Team on site – Day 2 (cutover)", hm(P.day2Arrive) / 1440, "hh:mm"],
      ["⏱ Max working hours / day", +P.maxHours, "0"], ["🚀 Project start date", xl(start), "ddd dd-mmm-yyyy"], ["👥 Teams in parallel", +P.teams, "0"]];
    inputs.forEach(([l, v, f], i) => {
      const r = 4 + i; db.mergeCells(r, 1, r, 2);
      put(db, r, 1, l, { font: { bold: true }, fill: "E8EEF6", al: LFT });
      put(db, r, 3, v, { font: { bold: true, color: { argb: "FF0000FF" } }, fill: IN, al: CEN, fmt: f });
    });
    db.mergeCells(10, 1, 12, 3);
    put(db, 10, 1, "ℹ Day 2 start follows the customer outage approval – change C5 and all Day 2 times & the outage window shift automatically.\n🛰 Integration, 5G activation & service tests are remote actions running in parallel with field work.", { font: { size: 9, italic: true, bold: true, color: { argb: "FFC92A2A" } }, al: LFT, border: false });
    const T0 = 16, TL = T0 + nT - 1;
    const siteDays = sites.length * 2;
    const lastDay = finishDate(state, sites.length);
    const cards = [["SITES", `SUM(D${T0}:D${TL})`, sites.length, "0", "1F77B4"], ["SITE-DAYS", `SUMPRODUCT(D${T0}:D${TL},E${T0}:E${TL})`, siteDays, "0", "0F766E"],
      ["OUTAGE / SITE", `MAX(H${T0}:H${TL})`, Math.max(...types.map(t => t.sch.outage)) / 1440, "[h]:mm", "C92A2A"],
      ["🏁 PROJECT FINISH", `MAX('Site Tracker'!F6:F${L})`, xl(lastDay), "dd-mmm-yy", "F59F00"],
      ["✔ SITES DONE", `COUNTIF('Site Tracker'!I6:I${L},1)&" / "&COUNTA('Site Tracker'!B6:B${L})`, `0 / ${sites.length}`, "@", "2F9E44"]];
    cards.forEach(([lab, f, v, nf, col], i) => {
      const c = 5 + i * 2;
      db.mergeCells(5, c, 5, c + 1); db.mergeCells(6, c, 8, c + 1);
      put(db, 5, c, lab, { font: { size: 9, bold: true, color: { argb: "FFFFFFFF" } }, fill: col, al: CEN });
      const med = { style: "medium", color: { argb: ARGB(col) } };
      put(db, 6, c, fx(f, v), { font: { size: 20, bold: true, color: { argb: ARGB(col) } }, fill: "FFFFFF", al: CEN, fmt: nf });
      db.getCell(6, c).border = { top: med, left: med, bottom: med, right: med };
    });
    db.mergeCells(10, 5, 11, 14);
    put(db, 10, 5, "2 days per site • outage timing per customer approval • 24h KPI check remote (no site visit)", { font: { italic: true, bold: true, color: { argb: ARGB(TEAL) } }, al: LFT, border: false });
    const H = { 1: "Site type", 2: "Radios + AIR", 4: "Sites", 5: "Days", 6: "🔧 Day 1", 7: "⚡ Day 2", 8: "🔴 Outage", 9: "⏱ Total / site", 10: "Σ all sites", 11: "Status", 12: "🔴 Outage window" };
    for (const [c, v] of Object.entries(H)) put(db, 15, +c, v, { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: HDR, al: CEN });
    put(db, 15, 3, null, { fill: HDR }); db.mergeCells(15, 2, 15, 3);
    types.forEach((t, j) => {
      const r = T0 + j, s = `'${t.name}'!`, n = sites.filter(x => x.type === t.name).length;
      put(db, r, 1, { text: t.name, hyperlink: `#'${t.name}'!A1` }, { font: { bold: true, underline: true, color: { argb: "FFFFFFFF" } }, fill: t.color, al: CEN });
      db.mergeCells(r, 2, r, 3); put(db, r, 2, `${t.lowQty}x ${t.lowModel} + ${t.midQty}x ${t.midModel} + ${t.airQty}x ${t.airModel}${t.reuseCabling ? " (reuse cabling)" : ""}`, { font: { size: 9 } });
      put(db, r, 4, fx(`COUNTIF('Site Tracker'!$C$6:$C$${L},"${t.name}")`, n), { font: { bold: true }, al: CEN });
      put(db, r, 5, 2, { al: CEN });
      [["Day", 0, t.sch.days[0].hours], ["Day", 1, t.sch.days[1].hours], ["Outage", 0, t.sch.outage], ["Total", 0, t.sch.total]].forEach(([k, di], i) => {
        const key = k === "Day" ? String(di + 1) : k;
        const ref = k === "Day" ? KP[t.name][String(di + 1)] : KP[t.name][k];
        put(db, r, 6 + i, fx(`${s}${ref}`, [t.sch.days[0].hours, t.sch.days[1].hours, t.sch.outage, t.sch.total][i] / 1440),
          { font: k === "Outage" ? { bold: true, color: { argb: "FFC00000" } } : { bold: k === "Total" }, al: CEN, fmt: "[h]:mm" });
      });
      put(db, r, 10, fx(`D${r}*I${r}`, n * t.sch.total / 1440), { al: CEN, fmt: "[h]:mm" });
      const ok = Math.max(t.sch.days[0].hours, t.sch.days[1].hours) / 60 <= +P.maxHours + 0.001;
      put(db, r, 11, fx(`IF(MAX(F${r}:G${r})*24>$C$6+0.001,"⚠ over max hours","✔ OK")`, ok ? "✔ OK" : "⚠ over max hours"), { font: { bold: true }, al: CEN });
      put(db, r, 12, fx(`SUBSTITUTE(${s}${KP[t.name].Window},"🔴 Outage window (Day 2):  ","")`, `${clock(t.sch.outStart)}  →  ${clock(t.sch.outEnd)}`), { font: { size: 9, bold: true, color: { argb: "FFC92A2A" } }, al: CEN });
      db.getRow(r).height = 30;
    });
    const tr = TL + 1;
    put(db, tr, 1, "TOTAL", { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: NAVY, al: CEN });
    for (let c = 2; c <= 12; c++) put(db, tr, c, null, { fill: NAVY });
    put(db, tr, 4, fx(`SUM(D${T0}:D${TL})`, sites.length), { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: NAVY, al: CEN });
    put(db, tr, 5, fx(`SUMPRODUCT(D${T0}:D${TL},E${T0}:E${TL})`, siteDays), { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: NAVY, al: CEN });
    put(db, tr, 10, fx(`SUM(J${T0}:J${TL})`, types.reduce((a, t) => a + sites.filter(x => x.type === t.name).length * t.sch.total, 0) / 1440), { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: NAVY, al: CEN, fmt: "[h]:mm" });
    db.addConditionalFormatting({ ref: `K${T0}:K${TL}`, rules: [
      { type: "expression", priority: 1, formulae: [`LEFT(K${T0},1)="⚠"`], style: Object.assign(cfFill("FFE3E3"), { font: { bold: true, color: { argb: "FFC92A2A" } } }) },
      { type: "expression", priority: 2, formulae: [`LEFT(K${T0},1)="✔"`], style: Object.assign(cfFill("D3F9D8"), { font: { bold: true, color: { argb: "FF2B8A3E" } } }) }] });
    db.addConditionalFormatting({ ref: `F${T0}:G${TL}`, rules: [
      { type: "expression", priority: 3, formulae: [`F${T0}*24>$C$6+0.001`], style: Object.assign(cfFill("FFE3E3"), { font: { bold: true, color: { argb: "FFC92A2A" } } }) },
      { type: "expression", priority: 4, formulae: [`F${T0}*24<=$C$6+0.001`], style: cfFill("EBFBEE") }] });
    db.addConditionalFormatting({ ref: `I${T0}:I${TL}`, rules: [{ type: "dataBar", priority: 5, cfvo: [{ type: "num", value: 0 }, { type: "num", value: 0.9 }], color: { argb: "FF4C6EF5" } }] });
    [13, 30, 18, 7, 7, 9, 9, 9, 11, 11, 17, 18, 8, 8].forEach((w, i) => db.getColumn(i + 1).width = w);
    return wb;
  }

  const api = { WEEKEND, sub, bbText, finishDate, DEFAULT_STATE, FIXED, schedule, activities, sitesOf, buildWorkbook, fmt, clock, hm, COLORS };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MOP = api;
})(typeof window !== "undefined" ? window : globalThis);
