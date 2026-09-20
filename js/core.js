/* MOP engine + Excel builder. Works in browser (window.MOP) and node (module.exports). */
(function (root) {
  // key, label, default minutes
  const FIXED = [
    ["access", "Site access & PTW (Day 1)", 15], ["safety1", "Safety briefing (Day 1)", 30], ["precheck", "Pre-check", 30],
    ["material", "Material check", 30], ["rigging1", "Rigging (Day 1)", 30],
    ["bbInstall", "Install new baseband (each)", 60], ["bbPower", "Power new baseband (each)", 30], ["bbSw", "New baseband SW & config (each)", 90],
    ["tn", "Transmission", 45], ["powerRadios", "Power up radios", 30], ["closeDay", "Close day", 20],
    ["accessN", "Site access & PTW (other days)", 15], ["safetyN", "Safety briefing (other days)", 15], ["riggingN", "Rigging (other days)", 15],
    ["precut", "Pre-cutover check", 20], ["gng", "GO / NO-GO", 10], ["powerOff", "Power off old equipment", 10],
    ["rehome", "Re-home reused baseband (each)", 30], ["txmig", "TX migration", 15], ["integ", "Integration", 60], ["rf", "RF & alarm check", 20],
    ["onair", "Cells on air", 10], ["powerAir", "Power up AIRs", 30], ["nrInteg", "5G integration", 30], ["nrUnlock", "5G unlock", 15],
    ["svc", "Service test", 45], ["ext", "External alarms", 30], ["dismBB", "Dismantle old BB", 30], ["dress", "Final dressing & tower check", 45],
    ["kpi", "KPI & alarm check (finishing day)", 45], ["pack", "Pack old material", 60], ["rsc", "QA & RSC submission", 60], ["snags", "Clear RSC snags", 30],
    ["closeSite", "Close site", 15],
  ];

  const DEFAULT_STATE = () => ({
    project: { name: "Swap & Modernization", country: "Lebanon", prefix: "LB", arrive: "07:00", maxHours: 11,
      daysPerSite: 2, outStart: "08:00", outMax: 4, startDate: "2026-10-05", teams: 3, sectors: 3, legacyRRU: 6, weekend: "sun", regions: "" },
    basebands: [
      { model: "RP6655", status: "New", tech: "4G+5G", qty: 1 },
      { model: "BB5212", status: "Reused", tech: "3G", qty: 1 },
    ],
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

  // bring older saved setups up to date
  function normalize(x) {
    const d = DEFAULT_STATE(); const s = Object.assign(d, x || {});
    const op = (x && x.project) || {};
    s.project = Object.assign({}, d.project, op);
    if (op.day1Arrive && !op.arrive) s.project.arrive = op.day1Arrive;
    if (!x || !Array.isArray(x.basebands)) {
      const b = [];
      if (op.newBB !== undefined) { if (op.newBB) b.push({ model: op.newBB, status: "New", tech: "4G+5G", qty: 1 }); if (op.oldBB) b.push({ model: op.oldBB, status: "Reused", tech: "3G", qty: 1 }); }
      s.basebands = b.length ? b : d.basebands;
    }
    s.fixed = Object.assign({}, d.fixed, (x && x.fixed) || {});
    s.unit = Object.assign({}, d.unit, (x && x.unit) || {});
    if (!Array.isArray(s.types) || !s.types.length) s.types = d.types;
    return s;
  }

  const WEEKEND = {
    sun: { label: "Sunday off", code: 11, days: [0] }, frisat: { label: "Friday + Saturday off", code: 7, days: [5, 6] },
    satsun: { label: "Saturday + Sunday off", code: 1, days: [6, 0] }, fri: { label: "Friday off", code: 16, days: [5] },
  };
  const wk = P => WEEKEND[P.weekend] || WEEKEND.sun;
  const daysOf = P => ([2, 3, 4].includes(+P.daysPerSite) ? +P.daysPerSite : 2);
  const cutDayOf = P => (daysOf(P) === 4 ? 3 : 2);
  // team arrives on cutover day just in time for the approved outage start
  const leadMin = S => { const F = S.fixed; return (+F.accessN || 0) + (+F.safetyN || 0) + Math.max(+F.riggingN || 0, +F.precut || 0) + (+F.gng || 0); };
  const cutArrive = S => Math.max(0, hm(S.project.outStart) - leadMin(S));
  const bbList = (S, st) => (S.basebands || []).filter(b => b.model && b.status === st && +b.qty > 0);
  const bbNames = (S, st) => bbList(S, st).map(b => (+b.qty > 1 ? `${b.qty}x ` : "") + b.model).join(" + ");
  const bbQty = (S, st) => bbList(S, st).reduce((a, b) => a + (+b.qty || 0), 0);
  const bbText = S => (S.basebands || []).filter(b => b.model && +b.qty > 0)
    .map(b => `${b.qty}x ${b.status === "New" ? "New" : "Reuse"} ${b.model}${b.tech ? ` (${b.tech})` : ""}`).join(" + ") || "No baseband defined";
  const sub = (S, str) => String(str || ""); // kept for compatibility
  const addWD = (P, d, n) => { const x = new Date(d); let k = 0; while (k < n) { x.setUTCDate(x.getUTCDate() + 1); if (!wk(P).days.includes(x.getUTCDay())) k++; } return x; };
  const firstWD = (P, d) => { const x = new Date(d); while (wk(P).days.includes(x.getUTCDay())) x.setUTCDate(x.getUTCDate() + 1); return x; };
  function finishDate(state, n) {
    const P = state.project, t = Math.max(1, +P.teams || 1), D = daysOf(P);
    const f = firstWD(P, new Date(P.startDate + "T00:00:00Z"));
    return n ? addWD(P, addWD(P, f, Math.floor((n - 1) / t) * D), D - 1) : f;
  }
  const COLORS = ["1F77B4", "2CA02C", "9467BD", "FF7F0E", "17BECF", "D62728", "8C564B", "E377C2"];
  const short = m => (m || "").split(" ").slice(0, 2).join(" ");
  const hm = s => { const [h, m] = String(s || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const fmt = min => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return `${h}:${String(m).padStart(2, "0")}`; };
  const clock = min => { min = Math.round(min); return `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`; };
  function equipMin(state, model) { const e = state.equipment.find(x => x.model === model); return e ? +e.min : 0; }

  function activities(state, t) {
    const F = state.fixed, U = state.unit, P = state.project, D = daysOf(P), CUT = cutDayOf(P);
    const nr = (+t.lowQty || 0) + (+t.midQty || 0), na = +t.airQty || 0;
    const radTxt = [t.lowQty ? `${t.lowQty}x ${short(t.lowModel)}` : "", t.midQty ? `${t.midQty}x ${short(t.midModel)}` : ""].filter(Boolean).join(" + ");
    const radMin = (+t.lowQty || 0) * equipMin(state, t.lowModel) + (+t.midQty || 0) * equipMin(state, t.midModel);
    const airMin = na * equipMin(state, t.airModel);
    const reuse = !!t.reuseCabling, heavy = /6419/.test(t.airModel || "");
    const newN = bbQty(state, "New"), oldN = bbQty(state, "Reused");
    const NEW = bbNames(state, "New") || "new baseband", OLD = bbNames(state, "Reused");
    const oldTech = bbList(state, "Reused").map(b => b.tech).filter(Boolean).join("/") || "legacy";
    const A = (key, name, desc, who, dur, after, impact, rem, extra) => Object.assign({ key, name, desc, who, dur: Math.max(0, Math.round(+dur || 0)), after: after || [], impact: impact || "Non-SA", rem: rem || "" }, extra || {});
    const start1 = () => [
      A("access", "Site access & PTW", "Request site access from NOC with CR no.; permit / landlord / security clearance", "All", F.access),
      A("safety", "Safety briefing", "Toolbox talk, risk assessment, rescue plan, PPE & climbing gear, wind check", "All", F.safety1, ["access"], "", "Stop climbing if wind > 38 km/h"),
      A("precheck", "Pre-check", "Screenshot alarms & cells, record existing equipment & rectifier capacity, before-photos", "FE", F.precheck, ["safety"]),
      A("material", "Material check", "Check material vs BoQ (qty, serial, damage, SFPs, jumpers, CBs)", "Team lead", F.material, ["safety"], "", "Report missing items immediately"),
    ];
    const startN = (note) => [
      A("access", "Site access & PTW", "NOC access with CR no." + (note || ""), "All", F.accessN, [], "", note ? "Start time per outage approval" : ""),
      A("safety", "Safety briefing", "Toolbox talk, rigging check, wind check", "All", F.safetyN, ["access"]),
    ];
    const airInstall = after => A("airs", "Install 5G AIRs", `Install ${na}x ${short(t.airModel)} with brackets; set azimuth & tilt per RND`, "Tower crew", airMin, [after], "", heavy ? "Heavy AIR: hoist + structural approval" : "");
    const airCab = (after, rem) => A("airCab", "AIR cabling", `Run & fix DC + fiber for ${na} AIRs to ${NEW}; ground kits; weatherproof; labels`, "Tower crew", reuse ? 0 : na * U.cableAIR, after, "",
      reuse ? "SKIPPED – existing cabling reused" : rem);
    const bbTrack = () => [
      A("bbInst", `Install ${NEW}`, `Mount new baseband(s) in rack/enclosure + grounding${OLD ? ` (${OLD} stays)` : ""}`, "Ground tech", F.bbInstall * newN, ["material"], "", newN ? "Parallel with tower work" : "SKIPPED – no new baseband"),
      A("bbPow", `Power ${NEW}`, "Connect to rectifier CB, check voltage/polarity & capacity", "Ground tech", F.bbPower * newN, ["bbInst"]),
      A("bbSw", `${NEW} SW & config`, "Power up, load SW / site config / licenses", "FE", F.bbSw * newN, ["bbPow"], "", "Pre-stage in WH to save time"),
      A("tn", "Transmission", `Connect ${NEW} to TX (new port), check OSS reachability`, "FE", F.tn, ["bbSw"]),
    ];
    // ---- Day 1 (installation)
    const d1 = start1();
    d1.push(A("rig", "Rigging", "Pulley, ropes, rescue kit, exclusion zone", "Tower crew", F.rigging1, ["material"]));
    d1.push(A("radios", "Install radios", `Install ${radTxt} with brackets & grounding next to old RRUs`, "Tower crew", radMin, ["rig"], "", "Old RRUs stay in service"));
    let lastTower = "radios";
    if (D !== 4) { d1.push(airInstall("radios")); lastTower = "airs"; }
    d1.push(A("radCab", "Radio cabling", `Run & fix DC + fiber for ${nr} radios to ${NEW}; ground kits; weatherproof; labels`, "Tower crew", reuse ? 0 : nr * U.cableRadio, [lastTower], "",
      reuse ? "SKIPPED – existing cabling reused" : "⭐ PRIORITY – needed for cutover. AIR cabling can run in parallel (same route, install once). Skip if existing cabling is reused"));
    d1.push(...bbTrack());
    d1.push(A("powRad", "Power up radios", `Connect radio DC & fiber at ${NEW} side, power up, no HW alarms. Cells LOCKED`, "FE + Ground tech", F.powerRadios, ["radCab", "tn"], "", "Never unlock before jumpers connected"));
    d1.push(A("close", "Close day", "Secure cables, photos, inform NOC leaving site", "All", F.closeDay, ["powRad"]));
    const days = [{ title: `🔧 DAY 1 – INSTALLATION: ${NEW} + RADIOS${D !== 4 ? " + 5G AIRs" : ""} (no impact)`, acts: d1 }];
    // ---- Day 2 for 4-day plan: AIRs
    if (D === 4) {
      const d = startN("");
      d.push(A("rig", "Rigging", "Rope & pulley for AIR hoisting", "Tower crew", F.riggingN, ["safety"]));
      d.push(airInstall("rig"));
      d.push(airCab(["airs"], "Install once – same route as radio cabling"));
      d.push(A("powAir", "Power up AIRs", `Connect AIR DC & fiber at ${NEW}, power up, no HW alarms`, "Ground tech", F.powerAir, ["airCab"]));
      d.push(A("nrInt", "5G pre-integration", "Load NR config on AIRs (cells locked)", "Remote integrator", F.nrInteg, ["powAir"], "", "🛰 Remote – parallel with field work"));
      d.push(A("close", "Close day", "Secure cables, photos, inform NOC", "All", F.closeDay, ["nrInt"]));
      days.push({ title: "📡 DAY 2 – 5G AIR INSTALLATION (no impact)", acts: d });
    }
    // ---- Cutover day
    const finishHere = D === 2;
    const c = startN("; confirm approved outage window");
    c.push(A("rig", "Rigging", "Rope & pulley ready for jumper swap" + (D !== 4 ? " + AIR cabling" : ""), "Tower crew", F.riggingN, ["safety"]));
    c.push(A("precut", "Pre-cutover check", "Alarm/KPI snapshot & old config backup (remote); FE test calls on site", "Remote integrator + FE", F.precut, ["safety"], "", "Remote, parallel with field"));
    c.push(A("gng", "GO / NO-GO", "Previous-day work OK, integrator & NOC online; approval to start outage", "Team lead + Remote integrator", F.gng, ["rig", "precut"], "", "Any issue = postpone"));
    c.push(A("off", "Power off old equipment", "Lock cells (remote), power off old RRUs & old baseband (site)", "Remote integrator + FE", F.powerOff, ["gng"], "Outage",
      "🔴 OUTAGE STARTS – not before approved outage start", { atOutage: true }));
    c.push(A("jump", "Jumper swap", "Per sector: old RRU jumpers off, new radio jumpers to antennas, torque + weatherproof", "Tower crew", (+P.sectors || 3) * U.jumperSector, ["off"], "Outage", "Keep old RRUs mounted (rollback)"));
    c.push(A("rehome", OLD ? `Re-home ${OLD}` : "Re-home reused baseband", OLD ? `Connect reused baseband(s) (${oldTech}) to new radios (${short(t.lowModel)} / ${short(t.midModel)})` : "No reused baseband",
      "Ground tech", F.rehome * oldN, ["off"], "Outage", oldN ? "Parallel with jumper swap" : "SKIPPED – no reused baseband"));
    c.push(A("txmig", "TX migration", `Move backhaul from old BB to ${NEW}`, "FE", F.txmig, ["off"], "Outage", "Parallel with jumper swap"));
    c.push(A("integ", "Integration", `Activate ${NEW}, unlock cells${OLD ? `; activate ${oldTech} on new radios via ${OLD}` : ""}`, "Remote integrator", F.integ, ["jump", "rehome", "txmig"], "Outage", "Remote action"));
    c.push(A("rf", "RF & alarm check", "RSSI, VSWR, sector / cross-feeder check (remote) + visual check on site", "Remote integrator + FE", F.rf, ["integ"], "Outage"));
    c.push(A("onair", "Cells on air", "NOC confirms all cells on air", "NOC + Remote integrator", F.onair, ["rf"], "Outage", "🟢 OUTAGE ENDS when this is done – rollback if not OK"));
    let testAfter = "onair";
    const dismAfter = ["onair"];
    if (D !== 4) {
      c.push(airCab(["jump"], "Tower crew free during integration / only if not done on Day 1 (skip if already done or cabling reused)"));
      c.push(A("powAir", "Power up AIRs", `Connect AIR DC & fiber at ${NEW}, power up, no HW alarms`, "Ground tech", F.powerAir, ["airCab"]));
      c.push(A("nrInt", "5G integration", "Load / activate NR config on AIRs", "Remote integrator", F.nrInteg, ["onair", "powAir"], "", "🛰 Remote – parallel with field work"));
      testAfter = "nrInt"; dismAfter.push("airCab");
    }
    c.push(A("nrUn", "5G unlock", "Unlock N78 cells, check 5G attach", "Remote integrator", F.nrUnlock, [testAfter], "", "🛰 Remote – parallel with field work"));
    c.push(A("svc", "Service test", "Remote KPI / counter check per sector; FE test calls (voice, data, VoLTE, 5G) on site", "Remote integrator + FE", F.svc, ["nrUn"], "", "🛰 Remote – parallel with field work"));
    c.push(A("ext", "External alarms", "Move site alarms to new BB, test with NOC", "Ground tech", F.ext, ["onair"]));
    c.push(A("dism", "Dismantle old RRUs", "Remove old RRUs & cables (do not cut cables)", "Tower crew", (+P.legacyRRU || 0) * U.dismantleRRU, dismAfter, "", "Only after cells on air"));
    c.push(A("dismBB", "Dismantle old BB", "Remove old baseband & unused modules" + (OLD ? ` (${OLD} stays)` : ""), "Ground tech", F.dismBB, ["ext"]));
    const finishing = (arr, first) => {
      arr.push(A("dress", "Final dressing & tower check", "Final cable dressing, label & weatherproofing check, torque marks", "Tower crew", F.dress, [first], "", "💡 Should be done while installing to save time – here only final check"));
      if (!finishHere) arr.push(A("kpi", "KPI & alarm check", "Alarm-free + 24h KPI check vs before", "Remote integrator", F.kpi, [first], "", "🛰 Remote"));
      arr.push(A("pack", "Pack old material", "Pack dismantled units, return note with serials", "Ground tech", F.pack, finishHere ? ["dism", "dismBB"] : [first]));
      arr.push(A("rsc", "QA & RSC submission", "QA walk, photo package & checklist, submit RSC", "Team lead + FE", F.rsc, finishHere ? ["svc", "dress"] : ["dress", "kpi"]));
      arr.push(A("snags", "Clear RSC snags", "Fix any snags raised by RSC review & resubmit (if any)", "Tower crew + Team lead", F.snags, ["rsc"], "", "Buffer – skip if RSC clean"));
      arr.push(A("closeS", "Close site", "Clean site, close PTW, inform NOC 🎉", "All", F.closeSite, ["pack", "snags"], "", finishHere ? "24h KPI check done remotely next day – no site visit" : ""));
    };
    if (finishHere) finishing(c, "dism");
    else c.push(A("close", "Close day", "Housekeeping, photos, inform NOC", "All", F.closeDay, ["svc", "dism", "dismBB"]));
    days.push({ title: `⚡ DAY ${CUT} – CUTOVER + 5G (remote, parallel) + DISMANTLE${finishHere ? " + QA / RSC" : ""}`, acts: c, cut: true });
    if (!finishHere) {
      const f = startN(""); finishing(f, "safety");
      days.push({ title: `✅ DAY ${D} – FINISHING, QA, RSC & SNAG CLEARANCE`, acts: f });
    }
    days.forEach((d, i) => { d.arrive = d.cut ? cutArrive(state) : hm(P.arrive); d.idx = i + 1;
      const pos = {}; d.acts.forEach((a, k) => pos[a.key] = k + 1);
      d.acts.forEach(a => { a.afterIdx = a.after.map(k => pos[k]).filter(Boolean); }); });
    return days;
  }

  function schedule(state, t) {
    const P = state.project, days = activities(state, t), outApproved = hm(P.outStart), outMax = (+P.outMax || 0) * 60;
    days.forEach(d => {
      d.acts.forEach(a => {
        a.start = a.afterIdx.length ? Math.max(...a.afterIdx.map(k => d.acts[k - 1].end)) : d.arrive;
        if (a.atOutage) a.start = Math.max(a.start, outApproved);
        a.end = a.start + a.dur;
      });
      d.leave = Math.max(...d.acts.map(a => a.end)); d.hours = d.leave - d.arrive;
    });
    const cd = days.find(d => d.cut), out = cd.acts.filter(a => a.impact === "Outage");
    const oS = Math.min(...out.map(a => a.start)), oE = Math.max(...out.map(a => a.end));
    const allowedEnd = outApproved + outMax;
    return { days, cutIdx: cd.idx, outage: oE - oS, outStart: oS, outEnd: oE, outApproved, allowedEnd, outMax,
      outOk: oE <= allowedEnd + 0.5 && oE - oS <= outMax + 0.5, total: days.reduce((a, d) => a + d.hours, 0) };
  }

  function sitesOf(state) {
    const lines = (state.siteList || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length) return lines.map((l, i) => { const p = l.split(/[,;\t]/).map(x => x.trim()); return { id: p[0] || `SITE-${i + 1}`, type: p[1] || state.types[0].name, gov: p[2] || "" }; });
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
  const WHITEF = { color: { argb: "FFFFFFFF" } };
  function put(ws, r, c, v, o = {}) {
    const cell = ws.getCell(r, c); cell.value = v; cell.font = F(o.font || {});
    cell.alignment = o.al || { wrapText: true, vertical: "top" };
    if (o.fill) cell.fill = solid(o.fill); if (o.fmt) cell.numFmt = o.fmt; if (o.border !== false) cell.border = BOX;
    return cell;
  }
  const CEN = { horizontal: "center", vertical: "middle", wrapText: true };
  const LFT = { horizontal: "left", vertical: "middle", wrapText: true };
  const fx = (formula, result) => ({ formula, result });
  // Dashboard input cells
  const IC = { arrive: "$C$4", cutArrive: "$C$5", outStart: "$C$6", outMax: "$C$7", maxHours: "$C$8", days: "$C$9", start: "$C$10", teams: "$C$11" };
  const DB = k => `Dashboard!${IC[k]}`;

  async function buildWorkbook(ExcelJS, stateIn) {
    const state = normalize(stateIn);
    const wb = new ExcelJS.Workbook(); wb.creator = "MOP Generator"; wb.calcProperties.fullCalcOnLoad = true;
    const P = state.project, ND = daysOf(P), CUT = cutDayOf(P);
    const types = state.types.map((t, i) => Object.assign({}, t, { color: COLORS[i % COLORS.length], sch: schedule(state, t) }));
    const sites = sitesOf(state);
    const nav = [["🏠 Dashboard", "Dashboard"], ...types.map(t => [t.name, t.name]), ["🔌 Connections", "Connections"], ["📅 Site Tracker", "Site Tracker"]];
    const db = wb.addWorksheet("Dashboard", { views: [{ showGridLines: false }], properties: { tabColor: { argb: ARGB(NAVY) } } });
    const tws = types.map(t => wb.addWorksheet(t.name, { views: [{ showGridLines: false, state: "frozen", xSplit: 2, ySplit: 6, zoomScale: 85 }], properties: { tabColor: { argb: ARGB(t.color) } } }));
    const cn = wb.addWorksheet("Connections", { views: [{ showGridLines: false }] });
    const st = wb.addWorksheet("Site Tracker", { views: [{ showGridLines: false, state: "frozen", xSplit: 2, ySplit: 5 }], properties: { tabColor: { argb: "FF2F9E44" } } });
    const banner = (ws, title, sub, lastCol) => {
      ws.mergeCells(1, 1, 1, lastCol); put(ws, 1, 1, title, { font: { size: 16, bold: true, ...WHITEF }, fill: NAVY, al: LFT, border: false }); ws.getRow(1).height = 34;
      ws.mergeCells(2, 1, 2, lastCol); put(ws, 2, 1, sub, { font: { size: 9, italic: true, ...WHITEF }, fill: TEAL, al: LFT, border: false });
    };
    const navbar = (ws, row) => nav.forEach(([lab, sh], i) => put(ws, row, i + 1, { text: lab, hyperlink: `#'${sh}'!A1` }, { font: { size: 9, bold: true, underline: true, color: { argb: ARGB(NAVY) } }, fill: "E8EEF6", al: CEN }));
    const hdr = (ws, r, c0, labels) => labels.forEach((l, i) => put(ws, r, c0 + i, l, { font: { bold: true, ...WHITEF }, fill: HDR, al: CEN }));

    // ---------- Type sheets ----------
    const G0 = 11, NS = 28, KP = {};
    types.forEach((t, ti) => {
      const ws = tws[ti], last = G0 + NS - 1, S = t.sch;
      banner(ws, `MOP ${t.name}  |  ${t.lowQty}x ${t.lowModel} + ${t.midQty}x ${t.midModel} + ${t.airQty}x ${t.airModel}`,
        `BB: ${bbText(state)}   •   Sites: ${t.sites}   •   ${ND} days per site   •   Day-time work only   •   Blue = edit   •   Outage start & allowed hours on Dashboard${t.reuseCabling ? "   •   Existing cabling reused" : ""}`, last);
      navbar(ws, 3);
      hdr(ws, 6, 1, ["SN", "Activity", "What to do", "Who", "Impact", "After SN", "Dur (min)", "Start", "End", "Remarks"]);
      ws.mergeCells(6, G0, 6, last); put(ws, 6, G0, "🕒 TIME MAPPING (30-min slots from team arrival)", { font: { bold: true, ...WHITEF }, fill: HDR, al: CEN });
      let r = 7; const info = [];
      S.days.forEach((d, di) => {
        const br = r, dn = di + 1;
        ws.mergeCells(r, 1, r, 5); put(ws, r, 1, d.title, { font: { bold: true, ...WHITEF }, fill: TEAL, al: LFT });
        put(ws, r, 6, "Arrive", { font: { bold: true, ...WHITEF }, fill: TEAL, al: CEN });
        put(ws, r, 7, fx(d.cut ? DB("cutArrive") : DB("arrive"), d.arrive / 1440), { font: { bold: true, color: { argb: "FF008000" } }, fill: IN, al: CEN, fmt: "hh:mm" });
        put(ws, r, 8, "Leave", { font: { bold: true, ...WHITEF }, fill: TEAL, al: CEN });
        for (let s = 0; s < NS; s++) put(ws, r, G0 + s, fx(`$G$${br}+${s}/48`, (d.arrive + s * 30) / 1440), { font: { size: 7, bold: true, ...WHITEF }, fill: TEAL, al: { textRotation: 90, horizontal: "center" }, fmt: "hh:mm" });
        ws.getRow(r).height = 34; r++;
        const first = r, rows = {};
        d.acts.forEach((a, n) => {
          const k = n + 1; rows[k] = r;
          put(ws, r, 1, `${dn}.${k}`, { font: { bold: true }, al: CEN });
          put(ws, r, 2, a.name, { font: { bold: true } }); put(ws, r, 3, a.desc); put(ws, r, 4, a.who, { al: CEN });
          put(ws, r, 5, a.impact, { al: CEN }); put(ws, r, 6, a.afterIdx.map(x => `${dn}.${x}`).join(", ") || "—", { al: CEN });
          put(ws, r, 7, a.dur, { font: { color: { argb: "FF0000FF" } }, fill: IN, al: CEN });
          let f = a.afterIdx.length ? `MAX(${a.afterIdx.map(x => `I${rows[x]}`).join(",")})` : `$G$${br}`;
          if (a.atOutage) f = `MAX(${f},${DB("outStart")})`;
          put(ws, r, 8, fx(f, a.start / 1440), { al: CEN, fmt: "hh:mm" });
          put(ws, r, 9, fx(`H${r}+G${r}/1440`, a.end / 1440), { al: CEN, fmt: "hh:mm" });
          put(ws, r, 10, a.rem);
          for (let s = 0; s < NS; s++) {
            const col = CL(G0 + s), slot = d.arrive + s * 30;
            put(ws, r, G0 + s, fx(`IF(AND($H${r}>=${col}$${br}-0.0001,$H${r}<${col}$${br}+1/48-0.0001),$G${r}&"'","")`, a.start >= slot && a.start < slot + 30 ? `${a.dur}'` : ""), { font: { size: 7, bold: true, ...WHITEF }, al: CEN });
          }
          ws.getRow(r).height = 30; r++;
        });
        const lastR = r - 1;
        put(ws, br, 9, fx(`MAX(I${first}:I${lastR})`, d.leave / 1440), { font: { bold: true, ...WHITEF }, fill: TEAL, al: CEN, fmt: "hh:mm" });
        const ok = d.hours / 60 <= +P.maxHours + 0.001;
        put(ws, br, 10, fx(`TEXT(I${br}-G${br},"h:mm")&" h  "&IF((I${br}-G${br})*24>${DB("maxHours")}+0.001,"⚠ over "&${DB("maxHours")}&"h","✔ OK")`, `${fmt(d.hours)} h  ${ok ? "✔ OK" : "⚠ over " + P.maxHours + "h"}`), { font: { bold: true, ...WHITEF }, fill: TEAL, al: LFT });
        const tl = CL(G0), g = `${tl}${first}:${CL(last)}${lastR}`, ov = `${tl}$${br}<$I${first},${tl}$${br}+1/48>$H${first}`;
        const rules = [
          { type: "expression", priority: 1, formulae: [`AND($E${first}="Outage",${ov})`], style: cfFill("E03131") },
          { type: "expression", priority: 2, formulae: [`AND(ISNUMBER(SEARCH("Tower",$D${first})),${ov})`], style: cfFill("F59F00") },
          { type: "expression", priority: 3, formulae: [`AND(LEFT($D${first},6)="Remote",${ov})`], style: cfFill("9C36B5") },
          { type: "expression", priority: 4, formulae: [`AND(${ov})`], style: cfFill("4C6EF5") },
        ];
        if (d.cut) rules.push({ type: "expression", priority: 5, formulae: [`AND(${tl}$${br}<${DB("outStart")}+${DB("outMax")}/24,${tl}$${br}+1/48>${DB("outStart")})`], style: cfFill("FFE3E3") });
        rules.push({ type: "expression", priority: 6, formulae: [`${tl}$${br}>=$G$${br}+${DB("maxHours")}/24-0.0001`], style: cfFill("E9ECEF") });
        ws.addConditionalFormatting({ ref: g, rules });
        ws.addConditionalFormatting({ ref: `J${br}`, rules: [{ type: "expression", priority: 7, formulae: [`ISNUMBER(SEARCH("⚠",J${br}))`], style: cfFill("C92A2A") }] });
        info.push({ br, first, last: lastR, cut: d.cut });
      });
      ws.addConditionalFormatting({ ref: `E7:E${r}`, rules: [{ type: "expression", priority: 8, formulae: ['$E7="Outage"'], style: Object.assign(cfFill("FFE3E3"), { font: { bold: true, color: { argb: "FFC00000" } } }) }] });
      ws.addConditionalFormatting({ ref: `D7:D${r}`, rules: [{ type: "expression", priority: 9, formulae: ['LEFT($D7,6)="Remote"'], style: { font: { bold: true, color: { argb: "FF9C36B5" } } } }] });
      const o = info.find(x => x.cut);
      const oS = `_xlfn.MINIFS(H${o.first}:H${o.last},E${o.first}:E${o.last},"Outage")`, oE = `_xlfn.MAXIFS(I${o.first}:I${o.last},E${o.first}:E${o.last},"Outage")`;
      // KPI strip (row 4 labels, row 5 values) in consecutive columns B..
      const ks = S.days.map((d, i) => [`Day ${i + 1}`, `I${info[i].br}-G${info[i].br}`, d.hours]);
      ks.push(["🔴 Outage", `${oE}-${oS}`, S.outage]);
      ks.push(["⏱ Total", ks.map((_, i) => `${CL(2 + i)}5`).slice(0, S.days.length).join("+"), S.total]);
      KP[t.name] = {};
      ks.forEach(([l, f, v], i) => {
        const c = 2 + i;
        put(ws, 4, c, l, { font: { bold: true, ...WHITEF }, fill: NAVY, al: CEN });
        put(ws, 5, c, fx(f, v / 1440), { font: { size: 12, bold: true, color: { argb: l.includes("Outage") ? "FFC00000" : ARGB(NAVY) } }, fill: "E8EEF6", al: CEN, fmt: "[h]:mm" });
        KP[t.name][i < S.days.length ? `d${i + 1}` : l.includes("Outage") ? "Outage" : "Total"] = `${CL(c)}5`;
      });
      ws.getRow(5).height = 24;
      // outage window vs allowed
      const hs = G0 + 16; // helper cells (small grey)
      put(ws, 5, hs, fx(oS, S.outStart / 1440), { font: { size: 7, color: { argb: "FF999999" } }, fmt: "hh:mm", border: false });
      put(ws, 5, hs + 1, fx(oE, S.outEnd / 1440), { font: { size: 7, color: { argb: "FF999999" } }, fmt: "hh:mm", border: false });
      const okF = `IF(AND(${CL(hs + 1)}5<=${DB("outStart")}+${DB("outMax")}/24+0.0001,(${CL(hs + 1)}5-${CL(hs)}5)*24<=${DB("outMax")}+0.001),"✔ within allowed","⚠ exceeds allowed")`;
      put(ws, 5, hs + 2, fx(okF, S.outOk ? "✔ within allowed" : "⚠ exceeds allowed"), { font: { size: 7, color: { argb: "FF999999" } }, border: false });
      ws.mergeCells(5, G0, 5, G0 + 15);
      put(ws, 5, G0, fx(`"🔴 Outage (Day ${S.cutIdx}): "&TEXT(${CL(hs)}5,"hh:mm")&" → "&TEXT(${CL(hs + 1)}5,"hh:mm")&"   |   allowed: "&TEXT(${DB("outStart")},"hh:mm")&" → "&TEXT(${DB("outStart")}+${DB("outMax")}/24,"hh:mm")&" ("&${DB("outMax")}&" h)   "&${CL(hs + 2)}5`,
        `🔴 Outage (Day ${S.cutIdx}): ${clock(S.outStart)} → ${clock(S.outEnd)}   |   allowed: ${clock(S.outApproved)} → ${clock(S.allowedEnd)} (${P.outMax} h)   ${S.outOk ? "✔ within allowed" : "⚠ exceeds allowed"}`),
        { font: { bold: true, color: { argb: "FFC92A2A" } }, fill: "FFE3E3", al: CEN });
      ws.addConditionalFormatting({ ref: `${CL(G0)}5`, rules: [{ type: "expression", priority: 10, formulae: [`ISNUMBER(SEARCH("⚠",${CL(G0)}5))`], style: Object.assign(cfFill("C92A2A"), { font: { bold: true, color: { argb: "FFFFFFFF" } } }) }] });
      KP[t.name].OutS = `${CL(hs)}5`; KP[t.name].OutE = `${CL(hs + 1)}5`; KP[t.name].OutOk = `${CL(hs + 2)}5`;
      [["Tower", "F59F00", "FF000000"], ["Ground/FE", "4C6EF5", "FFFFFFFF"], ["Outage", "E03131", "FFFFFFFF"], ["Remote", "9C36B5", "FFFFFFFF"], ["Allowed outage", "FFE3E3", "FF000000"], ["After max", "E9ECEF", "FF000000"]]
        .forEach(([lab, col, fc], i) => { ws.mergeCells(4, G0 + i * 3, 4, G0 + i * 3 + 2); put(ws, 4, G0 + i * 3, lab, { font: { size: 8, bold: true, color: { argb: fc } }, fill: col, al: CEN }); });
      [7, 20, 46, 14, 8, 8, 8, 7, 7, 26].forEach((w, i) => ws.getColumn(i + 1).width = w);
      for (let s = 0; s < NS; s++) ws.getColumn(G0 + s).width = 3.4;
      ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    });

    // ---------- Connections ----------
    const nT = types.length, NEWB = bbList(state, "New"), OLDB = bbList(state, "Reused");
    const newName = bbNames(state, "New") || "New baseband";
    banner(cn, "🔌 Connections – what connects to what", "Exact ports per approved design / RND. Qty per site type in blue. 'Step' = MOP step where it is done.", 6 + nT);
    navbar(cn, 3);
    hdr(cn, 5, 1, ["#", "From", "To", "Cable / type", ...types.map(t => t.name), "Step", "Remarks"]);
    const airDay = ND === 4 ? "2" : `1 / ${CUT}`;
    const conn = [
      [newName, "Low-band radio", "Fiber CPRI + SFP", t => +t.lowQty, "Day 1", "One per radio"],
      [newName, "Mid-band radio", "Fiber CPRI + SFP", t => +t.midQty, "Day 1", "One per radio"],
      [newName, "AIR (N78)", "Fiber + SFP", t => +t.airQty, `Day ${airDay}`, "Per design per AIR"],
      ...OLDB.map(b => [`${b.model} (reused${b.tech ? ", " + b.tech : ""})`, "New radios", "Fiber CPRI + SFP", () => +b.qty, `Day ${CUT} (outage)`, "Re-home during outage"]),
      ...NEWB.map(b => ["Rectifier / PDU", b.model, "DC power + CB", () => +b.qty, "Day 1", ""]),
      ["Rectifier / PDU", "Radios", "DC power cable + CB", t => +t.lowQty + +t.midQty, "Day 1", ""],
      ["Rectifier / PDU", "AIRs", "DC power cable + CB", t => +t.airQty, `Day ${airDay}`, ""],
      ["Radios", "Existing antennas", "RF jumpers (per port map)", () => "map", `Day ${CUT} (outage)`, "Torque + weatherproof"],
      [newName, "TX / MW / router", "Ethernet / fiber backhaul", () => 1, `Day 1 / ${CUT}`, "New port Day 1, migration on cutover"],
      ["Site alarms", "New / reused basebands", "Alarm cable", () => 1, `Day ${CUT}`, ""],
      ["All new units", "Site ground bar", "Grounding cable", t => +t.lowQty + +t.midQty + +t.airQty + bbQty(state, "New"), "Day 1", "Radios + AIRs + new basebands"],
    ];
    conn.forEach(([a, b, c, q, s, rm], i) => {
      const r = 6 + i, z = i % 2 ? "F7F9FC" : null;
      put(cn, r, 1, i + 1, { al: CEN, fill: z }); put(cn, r, 2, a, { font: { bold: true }, fill: z }); put(cn, r, 3, b, { fill: z }); put(cn, r, 4, c, { fill: z });
      types.forEach((t, j) => put(cn, r, 5 + j, q(t), { font: { color: { argb: "FF0000FF" } }, fill: IN, al: CEN }));
      put(cn, r, 5 + nT, s, { al: CEN, fill: z }); put(cn, r, 6 + nT, rm, { fill: z });
    });
    [4, 22, 24, 26].forEach((w, i) => cn.getColumn(i + 1).width = w);
    types.forEach((t, j) => cn.getColumn(5 + j).width = 9);
    cn.getColumn(5 + nT).width = 14; cn.getColumn(6 + nT).width = 30;

    // ---------- Site Tracker ----------
    banner(st, "📅 Site Tracker – auto schedule & progress", `Dates auto-planned from project start, days per site and number of teams (${wk(P).label}). Override blue cells if needed.`, 11);
    navbar(st, 3);
    hdr(st, 5, 1, ["#", "Site ID", "Site type", "Team", "Start (Day 1)", "Cutover day", "End (last day)", "Status", "Progress", "Region", "Remarks"]);
    const typeList = `"${types.map(t => t.name).join(",")}"`, start = new Date(P.startDate + "T00:00:00Z"), code = wk(P).code;
    const xl = d => d.getTime() / 86400000 + 25569;
    const regs = String(P.regions || "").split(",").map(x => x.trim()).filter(Boolean);
    sites.forEach((s, i) => {
      const r = 6 + i, teams = Math.max(1, +P.teams || 1);
      const d1 = addWD(P, firstWD(P, start), Math.floor(i / teams) * ND);
      put(st, r, 1, i + 1, { al: CEN });
      put(st, r, 2, s.id, { font: { color: { argb: "FF0000FF" } }, fill: IN, al: CEN });
      put(st, r, 3, s.type, { font: { color: { argb: "FF0000FF" } }, fill: IN, al: CEN }); st.getCell(r, 3).dataValidation = { type: "list", allowBlank: true, formulae: [typeList] };
      put(st, r, 4, fx(`MOD(A${r}-1,${DB("teams")})+1`, (i % teams) + 1), { al: CEN, fmt: '"Team "0' });
      put(st, r, 5, fx(`WORKDAY.INTL(${DB("start")}-1,1+INT((A${r}-1)/${DB("teams")})*${DB("days")},${code})`, xl(d1)), { fill: IN, al: CEN, fmt: "ddd dd-mmm" });
      put(st, r, 6, fx(`WORKDAY.INTL(E${r},IF(${DB("days")}>=4,2,1),${code})`, xl(addWD(P, d1, CUT - 1))), { al: CEN, fmt: "ddd dd-mmm", font: { bold: true, color: { argb: "FFC92A2A" } } });
      put(st, r, 7, fx(`WORKDAY.INTL(E${r},${DB("days")}-1,${code})`, xl(addWD(P, d1, ND - 1))), { al: CEN, fmt: "ddd dd-mmm" });
      put(st, r, 8, "Not started", { font: { color: { argb: "FF0000FF" } }, fill: IN, al: CEN }); st.getCell(r, 8).dataValidation = { type: "list", formulae: ['"Not started,In progress,Done,On hold"'] };
      put(st, r, 9, fx(`IF(H${r}="Done",1,IF(H${r}="In progress",0.5,0))`, 0), { font: { bold: true }, al: CEN, fmt: "0%" });
      put(st, r, 10, s.gov, { font: { color: { argb: "FF0000FF" } }, fill: IN, al: CEN });
      if (regs.length && regs.join(",").length < 250) st.getCell(r, 10).dataValidation = { type: "list", allowBlank: true, formulae: [`"${regs.join(",").replace(/"/g, "")}"`] };
      put(st, r, 11, "");
    });
    const L = 5 + Math.max(1, sites.length);
    st.addConditionalFormatting({ ref: `I6:I${L}`, rules: [{ type: "dataBar", priority: 1, cfvo: [{ type: "num", value: 0 }, { type: "num", value: 1 }], color: { argb: "FF2F9E44" } }] });
    st.addConditionalFormatting({ ref: `H6:H${L}`, rules: [["Done", "D3F9D8", "FF2B8A3E"], ["In progress", "FFF3BF", "FFE67700"], ["On hold", "FFE3E3", "FFC92A2A"]].map(([v, c, f], i) =>
      ({ type: "expression", priority: 2 + i, formulae: [`H6="${v}"`], style: Object.assign(cfFill(c), { font: { bold: true, color: { argb: f } } }) })) });
    st.addConditionalFormatting({ ref: `E6:G${L}`, rules: [{ type: "expression", priority: 6, formulae: ["E6=TODAY()"], style: Object.assign(cfFill("FFD43B"), { font: { bold: true } }) }] });
    [4, 12, 10, 9, 14, 14, 14, 13, 10, 14, 26].forEach((w, i) => st.getColumn(i + 1).width = w);

    // ---------- Dashboard ----------
    const lastDbCol = 6 + ND + 5;
    banner(db, `📡 ${P.name}${P.country ? " – " + P.country : ""} – Installation Dashboard`, `${ND} days per site • day-time work only • remote integration in parallel with field work • ${sites.length} sites • ${nT} equipment types • BB: ${bbText(state)}`, Math.max(14, lastDbCol));
    navbar(db, 3);
    const LEAD = leadMin(state);
    const inputs = [["👷 Team on site (normal days)", hm(P.arrive) / 1440, "hh:mm"], [`👷 Team on site – cutover day (auto)`, fx(`${IC.outStart}-${LEAD}/1440`, cutArrive(state) / 1440), "hh:mm", "auto"],
      ["🔴 Approved outage start", hm(P.outStart) / 1440, "hh:mm"], ["⏳ Max outage allowed (h)", +P.outMax, "0.0"],
      ["⏱ Max working hours / day", +P.maxHours, "0.0"], ["📆 Days per site", ND, "0"],
      ["🚀 Project start date", xl(start), "ddd dd-mmm-yyyy"], ["👥 Teams in parallel", +P.teams, "0"]];
    inputs.forEach(([l, v, f, auto], i) => {
      const r = 4 + i; db.mergeCells(r, 1, r, 2);
      put(db, r, 1, l, { font: { bold: true }, fill: "E8EEF6", al: LFT });
      put(db, r, 3, v, { font: { bold: true, color: { argb: auto ? "FF000000" : "FF0000FF" } }, fill: auto ? "E9ECEF" : IN, al: CEN, fmt: f });
    });
    db.getCell(5, 4).value = `= outage start − ${fmt(LEAD)} prep`; db.getCell(5, 4).font = F({ size: 8, italic: true, color: { argb: "FF666666" } });
    db.mergeCells(13, 1, 15, 3);
    put(db, 13, 1, `ℹ Outage start / allowed hours: change C6–C7 → cutover-day arrival and power-off move with it, outage still closes when 'Cells on air' is done, and each type is flagged if it runs over.\nℹ Days per site (C9) updates the tracker & site-days; to move activities between days, change it in the MOP Generator and regenerate.`, { font: { size: 9, italic: true, bold: true, color: { argb: "FFC92A2A" } }, al: LFT, border: false });
    const H0 = 17, T0 = 18, TL = T0 + nT - 1;
    const dayCols = Array.from({ length: ND }, (_, i) => 6 + i), cOut = 6 + ND, cTot = cOut + 1, cSum = cOut + 2, cStat = cOut + 3, cWin = cOut + 4;
    const lastDay = finishDate(state, sites.length);
    const allOk = types.every(t => t.sch.outOk);
    const cards = [["SITES", `SUM(D${T0}:D${TL})`, sites.length, "0", "1F77B4"], ["SITE-DAYS", `SUM(D${T0}:D${TL})*${IC.days}`, sites.length * ND, "0", "0F766E"],
      ["MAX OUTAGE", `MAX(${CL(cOut)}${T0}:${CL(cOut)}${TL})`, Math.max(...types.map(t => t.sch.outage)) / 1440, "[h]:mm", "C92A2A"],
      ["🏁 PROJECT FINISH", `MAX('Site Tracker'!G6:G${L})`, xl(lastDay), "dd-mmm-yy", "F59F00"],
      ["✔ SITES DONE", `COUNTIF('Site Tracker'!H6:H${L},"Done")&" / "&COUNTA('Site Tracker'!B6:B${L})`, `0 / ${sites.length}`, "@", "2F9E44"]];
    cards.forEach(([lab, f, v, nf, col], i) => {
      const c = 5 + i * 2;
      db.mergeCells(5, c, 5, c + 1); db.mergeCells(6, c, 8, c + 1);
      put(db, 5, c, lab, { font: { size: 9, bold: true, ...WHITEF }, fill: col, al: CEN });
      const med = { style: "medium", color: { argb: ARGB(col) } };
      put(db, 6, c, fx(f, v), { font: { size: 20, bold: true, color: { argb: ARGB(col) } }, fill: "FFFFFF", al: CEN, fmt: nf });
      db.getCell(6, c).border = { top: med, left: med, bottom: med, right: med };
    });
    db.mergeCells(10, 5, 11, 14);
    put(db, 10, 5, fx(`"Outage allowed "&TEXT(${IC.outStart},"hh:mm")&" → "&TEXT(${IC.outStart}+${IC.outMax}/24,"hh:mm")&" (cutover day ${CUT})  •  "&${IC.days}&" days per site  •  24h KPI check remote"`,
      `Outage allowed ${clock(hm(P.outStart))} → ${clock(hm(P.outStart) + P.outMax * 60)} (cutover day ${CUT})  •  ${ND} days per site  •  24h KPI check remote`), { font: { italic: true, bold: true, color: { argb: ARGB(TEAL) } }, al: LFT, border: false });
    const H = { 1: "Site type", 2: "Radios + AIR", 4: "Sites", 5: "Days" };
    dayCols.forEach((c, i) => H[c] = `Day ${i + 1}${i + 1 === CUT ? " ⚡" : ""}`);
    Object.assign(H, { [cOut]: "🔴 Outage", [cTot]: "⏱ Total / site", [cSum]: "Σ all sites", [cStat]: "Status", [cWin]: "🔴 Outage window" });
    for (const [c, v] of Object.entries(H)) put(db, H0, +c, v, { font: { bold: true, ...WHITEF }, fill: HDR, al: CEN });
    put(db, H0, 3, null, { fill: HDR }); db.mergeCells(H0, 2, H0, 3);
    types.forEach((t, j) => {
      const r = T0 + j, s = `'${t.name}'!`, n = sites.filter(x => x.type === t.name).length, S = t.sch, K = KP[t.name];
      put(db, r, 1, { text: t.name, hyperlink: `#'${t.name}'!A1` }, { font: { bold: true, underline: true, ...WHITEF }, fill: t.color, al: CEN });
      db.mergeCells(r, 2, r, 3); put(db, r, 2, `${t.lowQty}x ${t.lowModel} + ${t.midQty}x ${t.midModel} + ${t.airQty}x ${t.airModel}${t.reuseCabling ? " (reuse cabling)" : ""}`, { font: { size: 9 } });
      put(db, r, 4, fx(`COUNTIF('Site Tracker'!$C$6:$C$${L},"${t.name}")`, n), { font: { bold: true }, al: CEN });
      put(db, r, 5, fx(IC.days, ND), { al: CEN });
      dayCols.forEach((c, i) => put(db, r, c, fx(`${s}${K["d" + (i + 1)]}`, S.days[i].hours / 1440), { al: CEN, fmt: "[h]:mm", font: { bold: i + 1 === CUT } }));
      put(db, r, cOut, fx(`${s}${K.Outage}`, S.outage / 1440), { font: { bold: true, color: { argb: "FFC00000" } }, al: CEN, fmt: "[h]:mm" });
      put(db, r, cTot, fx(`${s}${K.Total}`, S.total / 1440), { font: { bold: true }, al: CEN, fmt: "[h]:mm" });
      put(db, r, cSum, fx(`D${r}*${CL(cTot)}${r}`, n * S.total / 1440), { al: CEN, fmt: "[h]:mm" });
      const dayOk = S.days.every(d => d.hours / 60 <= +P.maxHours + 0.001);
      put(db, r, cStat, fx(`IF(MAX(${CL(dayCols[0])}${r}:${CL(dayCols[ND - 1])}${r})*24>${IC.maxHours}+0.001,"⚠ day > max hours",IF(LEFT(${s}${K.OutOk},1)="⚠","⚠ outage > allowed","✔ OK"))`,
        !dayOk ? "⚠ day > max hours" : !S.outOk ? "⚠ outage > allowed" : "✔ OK"), { font: { bold: true }, al: CEN });
      put(db, r, cWin, fx(`TEXT(${s}${K.OutS},"hh:mm")&" → "&TEXT(${s}${K.OutE},"hh:mm")`, `${clock(S.outStart)} → ${clock(S.outEnd)}`), { font: { size: 9, bold: true, color: { argb: "FFC92A2A" } }, al: CEN });
      db.getRow(r).height = 30;
    });
    const tr = TL + 1;
    put(db, tr, 1, "TOTAL", { font: { bold: true, ...WHITEF }, fill: NAVY, al: CEN });
    for (let c = 2; c <= cWin; c++) put(db, tr, c, null, { fill: NAVY });
    put(db, tr, 4, fx(`SUM(D${T0}:D${TL})`, sites.length), { font: { bold: true, ...WHITEF }, fill: NAVY, al: CEN });
    put(db, tr, 5, fx(`SUM(D${T0}:D${TL})*${IC.days}`, sites.length * ND), { font: { bold: true, ...WHITEF }, fill: NAVY, al: CEN, fmt: '0" site-days"' });
    put(db, tr, cSum, fx(`SUM(${CL(cSum)}${T0}:${CL(cSum)}${TL})`, types.reduce((a, t) => a + sites.filter(x => x.type === t.name).length * t.sch.total, 0) / 1440), { font: { bold: true, ...WHITEF }, fill: NAVY, al: CEN, fmt: "[h]:mm" });
    const sR = `${CL(cStat)}${T0}:${CL(cStat)}${TL}`;
    db.addConditionalFormatting({ ref: sR, rules: [
      { type: "expression", priority: 1, formulae: [`LEFT(${CL(cStat)}${T0},1)="⚠"`], style: Object.assign(cfFill("FFE3E3"), { font: { bold: true, color: { argb: "FFC92A2A" } } }) },
      { type: "expression", priority: 2, formulae: [`LEFT(${CL(cStat)}${T0},1)="✔"`], style: Object.assign(cfFill("D3F9D8"), { font: { bold: true, color: { argb: "FF2B8A3E" } } }) }] });
    const dR = `${CL(dayCols[0])}${T0}:${CL(dayCols[ND - 1])}${TL}`;
    db.addConditionalFormatting({ ref: dR, rules: [
      { type: "expression", priority: 3, formulae: [`${CL(dayCols[0])}${T0}*24>${IC.maxHours}+0.001`], style: Object.assign(cfFill("FFE3E3"), { font: { bold: true, color: { argb: "FFC92A2A" } } }) },
      { type: "expression", priority: 4, formulae: [`${CL(dayCols[0])}${T0}*24<=${IC.maxHours}+0.001`], style: cfFill("EBFBEE") }] });
    db.addConditionalFormatting({ ref: `${CL(cOut)}${T0}:${CL(cOut)}${TL}`, rules: [{ type: "expression", priority: 5, formulae: [`${CL(cOut)}${T0}*24>${IC.outMax}+0.001`], style: cfFill("FFC9C9") }] });
    db.addConditionalFormatting({ ref: `${CL(cTot)}${T0}:${CL(cTot)}${TL}`, rules: [{ type: "dataBar", priority: 6, cfvo: [{ type: "num", value: 0 }, { type: "num", value: 1.4 }], color: { argb: "FF4C6EF5" } }] });
    const widths = { 1: 13, 2: 30, 3: 20, 4: 7, 5: 7 };
    dayCols.forEach(c => widths[c] = 9); Object.assign(widths, { [cOut]: 9, [cTot]: 11, [cSum]: 11, [cStat]: 18, [cWin]: 16 });
    for (let c = 1; c <= Math.max(14, cWin); c++) db.getColumn(c).width = widths[c] || 9;
    db.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
    return wb;
  }

  // ---------------- PDF (simplified, for reading) ----------------
  const clean = s => String(s || "").replace(/→/g, "->").replace(/[⚠]/g, "!").replace(/[✔✓]/g, "OK").replace(/[′]/g, "'")
    .replace(/[\u{1F000}-\u{1FFFF}\u2600-\u27BF\u2B50\u2B06\uFE0F]/gu, "").replace(/\s{2,}/g, " ").trim();
  function buildPdf(jsPDF, stateIn) {
    const state = normalize(stateIn), P = state.project, ND = daysOf(P);
    const types = state.types.map((t, i) => Object.assign({}, t, { color: COLORS[i % COLORS.length], sch: schedule(state, t) }));
    const sites = sitesOf(state);
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth(), Hh = doc.internal.pageSize.getHeight(), M0 = 12;
    const rgb = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    const COLS = { tower: "F59F00", ground: "4C6EF5", remote: "9C36B5", out: "E03131" };
    const colOf = a => a.impact === "Outage" ? COLS.out : /Tower/.test(a.who) ? COLS.tower : /^Remote/.test(a.who) ? COLS.remote : COLS.ground;
    const title = clean(`${P.name}${P.country ? " – " + P.country : ""}`);
    const head = (t, sub) => {
      doc.setFillColor(...rgb("14213D")); doc.rect(0, 0, W, 20, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text(clean(t), M0, 12.5);
      if (sub) { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(200, 210, 222); doc.text(clean(sub), M0, 17.5); }
      doc.setTextColor(23, 34, 48);
    };
    const legend = y => {
      [["Tower crew", COLS.tower], ["Ground / FE", COLS.ground], ["Remote integrator", COLS.remote], ["Outage", COLS.out]].forEach(([l, c], i) => {
        const x = M0 + i * 42; doc.setFillColor(...rgb(c)); doc.rect(x, y - 2.6, 5, 3, "F"); doc.setFontSize(8.5); doc.setTextColor(80, 90, 104); doc.text(l, x + 6.5, y); });
      doc.setTextColor(23, 34, 48);
    };
    // ---- page 1: overview
    head(`Installation MOP – ${title}`, `Generated ${new Date().toISOString().slice(0, 10)}  |  ${sites.length} sites  |  ${types.length} site types  |  ${ND} days per site`);
    let y = 30;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Key facts", M0, y); y += 2;
    const allowed = `${clock(hm(P.outStart))} -> ${clock(hm(P.outStart) + (+P.outMax || 0) * 60)} (${P.outMax} h)`;
    doc.autoTable({ startY: y, margin: { left: M0 }, tableWidth: 125, theme: "plain", styles: { fontSize: 9.5, cellPadding: 1.4 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 52, textColor: [74, 88, 104] } },
      body: [["Days per site", `${ND} (cutover on Day ${cutDayOf(P)})`], ["Team on site", `${P.arrive} (cutover day ${clock(cutArrive(state))} – ${fmt(leadMin(state))} h before outage)`],
        ["Allowed outage", allowed], ["Basebands", clean(bbText(state))], ["Working day limit", `${P.maxHours} h, day-time only`],
        ["Teams / start", `${P.teams} teams from ${P.startDate} – finish ${finishDate(state, sites.length).toISOString().slice(0, 10)}`]] });
    y = doc.lastAutoTable.finalY + 7;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Site types at a glance", M0, y); y += 2;
    const dh = Array.from({ length: ND }, (_, i) => `Day ${i + 1}${i + 1 === cutDayOf(P) ? " (cutover)" : ""}`);
    doc.autoTable({ startY: y, margin: { left: M0, right: M0 }, styles: { fontSize: 9, cellPadding: 1.8, valign: "middle" },
      headStyles: { fillColor: rgb("2E3B55"), textColor: 255 },
      head: [["Type", "Equipment", "Sites", ...dh, "Outage window", "Status"]],
      body: types.map(t => [t.name, clean(`${t.lowQty}x ${t.lowModel} + ${t.midQty}x ${t.midModel} + ${t.airQty}x ${t.airModel}`), sites.filter(s => s.type === t.name).length,
        ...t.sch.days.map(d => `${clock(d.arrive)}-${clock(d.leave)}\n${fmt(d.hours)} h`),
        `${clock(t.sch.outStart)} -> ${clock(t.sch.outEnd)}\n${fmt(t.sch.outage)} h`,
        t.sch.days.some(d => d.hours / 60 > +P.maxHours + 0.001) ? "! day too long" : t.sch.outOk ? "OK" : "! outage over allowed"]),
      didParseCell: h => { if (h.section === "body" && h.column.index === 0) { h.cell.styles.fillColor = rgb(types[h.row.index].color); h.cell.styles.textColor = 255; h.cell.styles.fontStyle = "bold"; }
        if (h.section === "body" && h.column.index === 4 + ND) { const ok = String(h.cell.raw) === "OK"; h.cell.styles.textColor = ok ? rgb("2B8A3E") : rgb("C92A2A"); h.cell.styles.fontStyle = "bold"; } } });
    y = doc.lastAutoTable.finalY + 8;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("How to read the pages that follow", M0, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(74, 88, 104);
    ["One page per site type and day: step number, activity, who does it, start and end time, and a bar on the day's timeline.",
     "Red rows are inside the outage. The outage starts at the approved time and ends when all cells are back on air.",
     "Purple rows are done remotely by the integrator, in parallel with the field team.",
     "Full details (step descriptions, dependencies, connections, site tracker) are in the Excel MOP."].forEach(t => { doc.text("•  " + t, M0, y); y += 5; });
    legend(y + 3);
    // ---- per type
    types.forEach(t => {
      const S = t.sch;
      S.days.forEach((d, di) => {
        doc.addPage();
        head(`${t.name}  |  Day ${di + 1} of ${ND}${d.cut ? "  –  CUTOVER" : ""}`, clean(`${t.lowQty}x ${t.lowModel} + ${t.midQty}x ${t.midModel} + ${t.airQty}x ${t.airModel}  |  BB: ${bbText(state)}`));
        doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
        doc.text(clean(d.title.replace(/^\S+\s/, "")), M0, 28);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(74, 88, 104);
        let line = `On site ${clock(d.arrive)} -> ${clock(d.leave)}  (${fmt(d.hours)} h)`;
        if (d.cut) line += `   |   Outage ${clock(S.outStart)} -> ${clock(S.outEnd)} (${fmt(S.outage)} h), allowed ${allowed}  ${S.outOk ? "OK" : "! exceeds"}`;
        doc.text(line, M0, 33.5); doc.setTextColor(23, 34, 48);
        const span = Math.max(+P.maxHours * 60, d.hours, d.cut ? S.allowedEnd - d.arrive : 0);
        const TLW = 118;
        doc.autoTable({ startY: 37, margin: { left: M0, right: M0, bottom: 14 }, styles: { fontSize: 8, cellPadding: 0.85, valign: "middle", overflow: "linebreak" },
          headStyles: { fillColor: rgb("2E3B55"), textColor: 255, fontSize: 8.5 },
          head: [["#", "Activity", "Who", "Start", "End", "Min", `Timeline  ${clock(d.arrive)} -> ${clock(d.arrive + span)}`]],
          body: d.acts.map((a, k) => [`${di + 1}.${k + 1}`, clean(a.name) + (a.dur ? "" : "  (skipped)"), clean(a.who), clock(a.start), clock(a.end), a.dur, ""]),
          columnStyles: { 0: { cellWidth: 11, halign: "center" }, 1: { cellWidth: 56, fontStyle: "bold" }, 2: { cellWidth: 44 }, 3: { cellWidth: 13, halign: "center" }, 4: { cellWidth: 13, halign: "center" }, 5: { cellWidth: 10, halign: "center" }, 6: { cellWidth: TLW } },
          didParseCell: h => { if (h.section === "body") { const a = d.acts[h.row.index]; if (a.impact === "Outage" && h.column.index < 6) h.cell.styles.fillColor = [255, 227, 227];
            if (/^Remote/.test(a.who) && h.column.index === 2) { h.cell.styles.textColor = rgb(COLS.remote); h.cell.styles.fontStyle = "bold"; } if (!a.dur) h.cell.styles.textColor = [150, 150, 150]; } },
          didDrawCell: h => {
            if (h.column.index !== 6) return;
            const x0 = h.cell.x + 1.5, w = h.cell.width - 3, yy = h.cell.y, hh = h.cell.height;
            if (h.section === "head") return;
            for (let m = 0; m <= span; m += 60) { doc.setDrawColor(225, 230, 236); doc.setLineWidth(0.1); doc.line(x0 + m / span * w, yy, x0 + m / span * w, yy + hh); }
            if (d.cut) { const a0 = Math.max(0, S.outApproved - d.arrive), a1 = S.allowedEnd - d.arrive; doc.setFillColor(211, 249, 216); doc.rect(x0 + a0 / span * w, yy + 0.2, (a1 - a0) / span * w, hh - 0.4, "F"); }
            const a = d.acts[h.row.index]; if (!a.dur) return;
            doc.setFillColor(...rgb(colOf(a))); doc.rect(x0 + (a.start - d.arrive) / span * w, yy + hh * 0.25, Math.max(0.8, a.dur / span * w), hh * 0.5, "F");
          } });
        let yy = doc.lastAutoTable.finalY + 6; if (yy > Hh - 22) { doc.addPage(); yy = 28; }
        legend(yy); if (d.cut) { doc.setFillColor(211, 249, 216); doc.rect(M0 + 168, yy - 2.6, 5, 3, "F"); doc.setFontSize(8.5); doc.setTextColor(80, 90, 104); doc.text("Allowed outage window", M0 + 174.5, yy); }
        const notes = d.acts.filter(a => a.rem && /PRIORITY|SKIPPED|OUTAGE|rollback|Heavy|postpone/i.test(a.rem)).map(a => clean(a.name + ": " + a.rem)).slice(0, 5);
        if (notes.length) { yy += 6; doc.setFontSize(8.5); doc.setTextColor(74, 88, 104); doc.setFont("helvetica", "bold"); doc.text("Key notes", M0, yy); doc.setFont("helvetica", "normal");
          notes.forEach(n => { yy += 4.3; if (yy < Hh - 12) doc.text("•  " + n, M0, yy, { maxWidth: W - 2 * M0 }); }); }
      });
    });
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140, 150, 160);
      doc.text(clean(title) + "  |  Installation MOP (summary) – full detail in Excel", M0, Hh - 6); doc.text(`${i} / ${n}`, W - M0, Hh - 6, { align: "right" }); }
    return doc;
  }

  const api = { buildPdf, leadMin, cutArrive, WEEKEND, sub, bbText, bbNames, finishDate, normalize, daysOf, cutDayOf, DEFAULT_STATE, FIXED, schedule, activities, sitesOf, buildWorkbook, fmt, clock, hm, COLORS };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MOP = api;
})(typeof window !== "undefined" ? window : globalThis);
