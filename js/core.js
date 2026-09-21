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
    domain: "RAN",
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
      { name: "Type-1", sites: 5, reuseCabling: false, units: [
        { role: "Low band", model: "Radio 4486 B8B20B28", qty: 3, min: 20 },
        { role: "Mid band", model: "Radio 4490 B1B3", qty: 3, min: 20 },
        { role: "5G AIR", model: "AIR 6419 B42", qty: 3, min: 60 } ] },
      { name: "Type-2", sites: 14, reuseCabling: false, units: [
        { role: "Low band", model: "Radio 4486 B8B20B28", qty: 3, min: 20 },
        { role: "Mid band", model: "Radio 4490 B1B3", qty: 3, min: 20 },
        { role: "5G AIR", model: "AIR 3219 B42", qty: 3, min: 45 } ] },
      { name: "Type-3", sites: 1, reuseCabling: false, units: [
        { role: "Low band", model: "Radio 6646 B8B20B28", qty: 1, min: 40 },
        { role: "Mid band", model: "Radio 4490 B1B3", qty: 3, min: 20 },
        { role: "5G AIR", model: "AIR 3219 B42", qty: 3, min: 45 } ] },
      { name: "Type-4", sites: 5, reuseCabling: false, units: [
        { role: "Low band", model: "Radio 4486 B8B20B28", qty: 3, min: 20 },
        { role: "Mid band", model: "Radio 4490 B1B3", qty: 3, min: 20 },
        { role: "5G AIR", model: "AIR 3255 B78AA", qty: 3, min: 40 } ] },
    ],
    rbs: [],
    siteList: "",
  });

  // a unit is handled as a 5G AIR (installed/cabled with the AIR steps) when its role or model says so
  const isAir = u => /\b(AIR|5G|NR|AAS|mMIMO)\b/i.test(`${u.role || ""} ${u.model || ""}`);
  const unitsOf = t => (t.units || []).filter(u => u.model && +u.qty > 0);
  const radiosOf = t => unitsOf(t).filter(u => !isAir(u)), airsOf = t => unitsOf(t).filter(isAir);
  const sumQ = L => L.reduce((a, u) => a + (+u.qty || 0), 0), sumMin = L => L.reduce((a, u) => a + (+u.qty || 0) * (+u.min || 0), 0);
  const listTxt = (L, withRole) => L.map(u => `${u.qty}x ${u.model}${withRole && u.role ? ` (${u.role})` : ""}`).join(" + ");
  const equipTxt = t => listTxt(unitsOf(t), false) || "no equipment";
  // bring older saved setups up to date
  function normalize(x) {
    if (x && x.domain === "TRM") {
      const d = DEFAULT_TRM(), s = Object.assign(d, x);
      s.project = Object.assign({}, DEFAULT_TRM().project, x.project || {});
      s.fixed = Object.assign({}, DEFAULT_TRM().fixed, x.fixed || {}); s.unit = Object.assign({}, DEFAULT_TRM().unit, x.unit || {});
      if (!Array.isArray(s.types) || !s.types.length) s.types = DEFAULT_TRM().types;
      s.types.forEach(t => { if (!TRM_METHODS[t.method]) t.method = "normal"; if (!Array.isArray(t.units)) t.units = []; });
      return s;
    }
    const d = DEFAULT_STATE(); const s = Object.assign(d, x || {}); s.domain = "RAN";
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
    const libMin = m => { const e = (s.equipment || []).find(q => q.model === m); return e ? +e.min : 20; };
    s.types = s.types.map(t => {
      if (Array.isArray(t.units)) return t;
      const u = [];
      if (t.lowModel) u.push({ role: "Low band", model: t.lowModel, qty: +t.lowQty || 0, min: libMin(t.lowModel) });
      if (t.midModel) u.push({ role: "Mid band", model: t.midModel, qty: +t.midQty || 0, min: libMin(t.midModel) });
      if (t.airModel) u.push({ role: "5G AIR", model: t.airModel, qty: +t.airQty || 0, min: libMin(t.airModel) });
      return { name: t.name, sites: t.sites, reuseCabling: !!t.reuseCabling, units: u };
    });
    if (!Array.isArray(s.rbs)) s.rbs = [];
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
  // start / cutover / end date per site or link: round-robin over teams, each team works its items back to back
  function planDates(state, sites, daysByType, cutByType) {
    const P = state.project, T = Math.max(1, +P.teams || 1), free = Array(T).fill(null);
    const s0 = firstWD(P, new Date(P.startDate + "T00:00:00Z"));
    return sites.map((x, i) => {
      const k = i % T, d = daysByType[x.type] || 2, c = cutByType[x.type] || 1;
      const st = free[k] ? addWD(P, free[k], 1) : s0; const end = addWD(P, st, d - 1); free[k] = end;
      return { start: st, cut: addWD(P, st, c - 1), end, team: k + 1 };
    });
  }
  const COLORS = ["1F77B4", "2CA02C", "9467BD", "FF7F0E", "17BECF", "D62728", "8C564B", "E377C2"];
  const short = m => (m || "").split(" ").slice(0, 2).join(" ");
  const hm = s => { const [h, m] = String(s || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const fmt = min => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return `${h}:${String(m).padStart(2, "0")}`; };
  const clock = min => { min = Math.round(min); return `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`; };
  function equipMin(state, model) { const e = state.equipment.find(x => x.model === model); return e ? +e.min : 0; }

  function activities(state, t) {
    const F = state.fixed, U = state.unit, P = state.project, D = daysOf(P), CUT = cutDayOf(P);
    const RAD = radiosOf(t), AIRS = airsOf(t);
    const nr = sumQ(RAD), na = sumQ(AIRS);
    const radTxt = listTxt(RAD, true) || "radios";
    const radMin = sumMin(RAD), airMin = sumMin(AIRS);
    const reuse = !!t.reuseCabling, heavy = AIRS.some(u => /6419|64T/.test(u.model));
    const RBS = (state.rbs || []).filter(r => r.type && +r.qty > 0);
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
    const airInstall = after => A("airs", "Install 5G AIRs", na ? `Install ${listTxt(AIRS, true)} with brackets; set azimuth & tilt per RND` : "No 5G AIR in this site type", "Tower crew", airMin, [after], "",
      !na ? "SKIPPED – no 5G AIR" : heavy ? "Heavy AIR: hoist + structural approval" : "");
    const airCab = (after, rem) => A("airCab", "AIR cabling", `Run & fix DC + fiber for ${na} AIRs to ${NEW}; ground kits; weatherproof; labels`, "Tower crew", reuse ? 0 : na * U.cableAIR, after, "",
      reuse ? "SKIPPED – existing cabling reused" : rem);
    const rbsActs = RBS.map((r, i) => A("rbs" + i, `Install ${r.type}`, `Install ${r.qty}x ${r.type} (RBS / cabinet) on plinth or wall; grounding, DC feed, cable entry`, "Ground tech",
      (+r.qty || 0) * (+r.min || 0), [i ? "rbs" + (i - 1) : "material"], "", "New RBS – before baseband installation"));
    const bbTrack = () => [
      ...rbsActs,
      A("bbInst", `Install ${NEW}`, `Mount new baseband(s) in ${RBS.length ? RBS.map(r => r.type).join(" / ") : "rack/enclosure"} + grounding${OLD ? ` (${OLD} stays)` : ""}`, "Ground tech", F.bbInstall * newN, [RBS.length ? "rbs" + (RBS.length - 1) : "material"], "", newN ? "Parallel with tower work" : "SKIPPED – no new baseband"),
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
    c.push(A("rehome", OLD ? `Re-home ${OLD}` : "Re-home reused baseband", OLD ? `Connect reused baseband(s) (${oldTech}) to new radios (${RAD.map(u => short(u.model)).join(" / ") || "radios"})` : "No reused baseband",
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

  // ======================= TRM (MW link) =======================
  const TRM_FIXED = [
    ["access", "Health check with NOC / site access", 15], ["ehs", "EHS session", 15], ["material", "Material check vs MDR / LB", 30],
    ["rfi", "RFI check (CB, poles, tray, earth bar)", 30], ["precheck", "Pre-check screenshots & outage plan", 30],
    ["assemble", "Assemble antennas & radios on ground", 60], ["prepIdu", "Prepare ML 66xx on ground", 60], ["rigging", "Rigging & rescue kit", 30],
    ["pole", "Install new MW pole", 60], ["iduInst", "Install & power ML 66xx / MMU", 30], ["brk", "Break", 45], ["nedcn", "Configure basic NE & DCN", 30],
    ["swup", "ML 66xx SW upgrade", 60], ["ifc", "Connect IF / fiber to MMU", 30], ["sbl", "Confirm SBL release for radios", 30],
    ["lcfg", "Link configuration & interference test (Tx off)", 30], ["lrf", "Share LRF / RMM fingerprint", 30], ["logout", "Logout with NOC", 15],
    ["travel", "Move to far-end site", 45],
    ["align", "Link alignment (RSL / XPI)", 120], ["alignSD", "Main-Div alignment (SD)", 60], ["confirm", "Confirm RSL / XPI achieved", 30],
    ["backup", "TN backup, report & photos", 30], ["gng", "GO / NO-GO for migration", 15], ["nocStart", "NOC confirms outage start", 30],
    ["npu", "NPU / IDU swap (if in scope)", 60], ["traffic", "DCN / VLAN / traffic configuration", 90], ["relocate", "Relocate reused items (radio / IF / MMU)", 60],
    ["confirmUp", "NOC confirms all sites up", 30], ["backupAfter", "Backup report & config after", 30], ["clearPm", "Clear PM logs for 24h performance", 30],
    ["decomIdu", "Uninstall old IDU / card", 90], ["dism", "Dismantle old antenna, radio, pole, IF", 90], ["nodeVis", "Node visibility check with integrator", 30],
    ["clearAlarms", "Clear alarms & QA print screens", 60], ["leave", "Confirm with NOC & leave site", 15],
    ["stability", "Link stability / BER check", 30], ["cleanup", "Clean-up for outdoor QA (both ends)", 120], ["vss", "VSS / VCOP photo session to RSC", 60],
    ["vssSnag", "Clear VSS / VCOP snags", 60], ["pack", "Pack & arrange dismantled material", 60], ["qaPrep", "QA preparation – photos both ends", 90],
    ["license", "Install license key, QA print screens", 60], ["qaSnag", "Clear QA snags from RSC", 60],
    ["route", "Route new cables into cabinet & connectors", 30], ["contin", "IF continuity test", 30], ["ready", "Report readiness for swap", 15],
    ["discDish", "Disconnect & lower old dish (hot swap)", 45], ["alignHot", "Alignment during hot swap", 90], ["trafficHot", "Traffic restore after hot swap", 30], ["connRad", "Connect radio cables, check inventory", 30], ["relChk", "Radio release check / upgrade", 30],
    ["cfg", "Configure new ML & radios per LB", 30], ["txOn", "Interference test, Tx on, RF loop", 30], ["xpi", "XPI fine tuning", 60],
    ["rearrange", "Rearrange ICC / XPIC / fiber for 2+0", 30], ["resetCfg", "Reset & re-config radios for 2+0", 30], ["finetune", "Fine tuning / XPI adjust", 60],
    ["powerRad", "Power radio & connect fiber to IDU", 30], ["login", "Login, initial config & SW upgrade", 30],
    ["labels", "Check cable labels for relocation", 30], ["relocIdu", "Move cables from old IDU to new IDU", 30], ["cfgMmu", "Configure MMU / radio as before", 30],
  ];
  const TRM_METHODS = {
    normal: { label: "Normal swap (1 team, cold)", days: 4 },
    hot: { label: "Hot swap (2 teams, both ends)", days: 3 },
    upg: { label: "1+0 → 2+0 upgrade (add radio)", days: 3 },
    idu: { label: "IDU / NPU swap only", days: 2 },
  };
  const trmCat = u => /\b(ant|antenna|dish|hpx?|vhlp|sb\d)/i.test(`${u.role} ${u.model}`) ? "ant"
    : /\b(idu|npu|mmu|optix|odf)\b|ml ?66\d\d|669\d/i.test(`${u.role} ${u.model}`) ? "idu" : "rad";
  const DEFAULT_TRM = () => ({
    domain: "TRM",
    project: { name: "MW Link Modernization", country: "Libya", prefix: "LNK", arrive: "09:00", maxHours: 10, daysPerSite: 4, outStart: "11:30", outMax: 6.5,
      startDate: "2026-10-05", teams: 2, sectors: 3, legacyRRU: 0, weekend: "frisat", regions: "" },
    equipment: [
      { model: "Antenna 0.6m HPX", kind: "radio", min: 45 }, { model: "Antenna 0.9m HPX", kind: "radio", min: 60 },
      { model: "Antenna 1.2m HPX", kind: "radio", min: 75 }, { model: "Antenna 1.8m HPX", kind: "radio", min: 120 },
      { model: "RAU 6363", kind: "radio", min: 15 }, { model: "RAU 6365", kind: "radio", min: 15 }, { model: "ML 6352", kind: "radio", min: 30 },
      { model: "ML 6691 IDU", kind: "radio", min: 30 }, { model: "ML 6692 IDU", kind: "radio", min: 30 }, { model: "MMU 3", kind: "radio", min: 15 },
    ],
    unit: { cableRadio: 30, cableAIR: 0, dismantleRRU: 0, jumperSector: 0 },
    fixed: Object.fromEntries(TRM_FIXED.map(f => [f[0], f[2]])),
    types: [
      { name: "SC-1 Antenna swap + RAU", sites: 6, method: "normal", compact: false, sd: false, reuseCabling: false, units: [
        { role: "Antenna", model: "Antenna 0.9m HPX", qty: 1, min: 60 }, { role: "Radio", model: "RAU 6363", qty: 2, min: 15 }] },
      { name: "SC-1 Hot swap", sites: 4, method: "hot", compact: false, sd: false, reuseCabling: false, units: [
        { role: "Antenna", model: "Antenna 0.9m HPX", qty: 1, min: 60 }, { role: "Radio", model: "RAU 6363", qty: 2, min: 15 }] },
      { name: "SC-2 1+0 to 2+0", sites: 5, method: "upg", compact: false, sd: false, reuseCabling: false, units: [
        { role: "Radio", model: "ML 6352", qty: 1, min: 30 }] },
      { name: "SC-5 1.2m + SD + IDU", sites: 3, method: "normal", compact: false, sd: true, reuseCabling: false, units: [
        { role: "Antenna main", model: "Antenna 1.2m HPX", qty: 1, min: 75 }, { role: "Antenna SD", model: "Antenna 1.2m HPX", qty: 1, min: 75 },
        { role: "Radio", model: "RAU 6365", qty: 2, min: 15 }, { role: "IDU", model: "ML 6691 IDU", qty: 1, min: 30 }] },
      { name: "SC-8 IDU / NPU swap", sites: 4, method: "idu", compact: false, sd: false, reuseCabling: false, units: [
        { role: "IDU", model: "ML 6691 IDU", qty: 1, min: 30 }] },
    ],
    siteList: "",
  });

  function trmActivities(state, t) {
    const F = state.fixed, U = state.unit, m = TRM_METHODS[t.method] ? t.method : "normal";
    const all = unitsOf(t), ANT = all.filter(u => trmCat(u) === "ant"), RAD = all.filter(u => trmCat(u) === "rad"), IDU = all.filter(u => trmCat(u) === "idu");
    const antMin = sumMin(ANT), radMin = sumMin(RAD), iduN = sumQ(IDU), nRad = sumQ(RAD), hasAnt = ANT.length > 0, sd = !!t.sd;
    const cab = t.reuseCabling ? 0 : Math.max(nRad, 1) * U.cableRadio;
    const A = (key, name, desc, who, dur, after, impact, rem, extra) => Object.assign({ key, name, desc, who, dur: Math.max(0, Math.round(+dur || 0)), after: after || [], impact: impact || "Non-SA", rem: rem || "" }, extra || {});
    const TL = "Team lead", RG = "Riggers", FE = "FE / TX engineer", INT = "Remote integrator";
    const start = (p, both, first) => [
      A(p + "acc", "Health check with NOC", "Health check with NOC before entering site; NOC reference number is mandatory", "All", F.access, [], "", "No NOC ref = ASP responsibility"),
      A(p + "ehs", both ? "EHS session (both ends)" : "EHS session", both ? "Team splits – EHS done at both ends" : "Toolbox talk, rescue plan, PPE, wind check", "All", F.ehs, [p + "acc"]),
      ...(first ? [A(p + "mat", "Material check", "Unpack and verify full material vs scope, MDR and LB", TL, F.material, [p + "acc"])] : []),
    ];
    // one end (A or B) installation block
    const endBlock = (p, label, first, after0) => {
      const L = start(p, false, first).map(a => (after0 && !a.after.length ? Object.assign(a, { after: [after0] }) : a));
      L.push(A(p + "rfi", "RFI check", "Check RFI as per scope & design: CB available, poles, cable tray, earth bars", TL, F.rfi, [p + "ehs"]));
      if (first) L.push(A(p + "pre", "Pre-check & outage plan", "Pre-check screenshots; share outage plan for approval with expected migration date", FE, F.precheck, [p + "ehs"]));
      L.push(A(p + "asm", "Assemble antennas & radios", `Assemble ${listTxt(ANT.concat(RAD), false) || "units"} on ground`, RG, (hasAnt || nRad) ? F.assemble : 0, [p + "rfi"]));
      if (iduN) L.push(A(p + "pidu", "Prepare ML 66xx on ground", `Prepare ${listTxt(IDU, false)} with required cards`, FE, F.prepIdu, [p + "rfi"]));
      L.push(A(p + "rig", "Rigging", "Tower climbing & rope lifting prep, pulley, rescue kit; measure IF / power cable length", RG, F.rigging, [p + "rfi"]));
      let last = p + "rig";
      if (hasAnt) { L.push(A(p + "pole", "Install new MW pole", "Hoist & install new MW pole per LB, below / above existing antenna – no impact on live traffic", RG, F.pole, [last])); last = p + "pole";
        L.push(A(p + "ant", `Install ${sd ? "main + SD antennas" : "antenna"}`, `Hoist & install ${listTxt(ANT, true)} per LB without affecting live traffic`, RG, antMin, [last, p + "asm"], "", sd ? "Space diversity – two antennas" : "")); last = p + "ant"; }
      if (nRad) { L.push(A(p + "rad", "Install radio units", `Hoist & install ${listTxt(RAD, true)}`, RG, radMin, [last, p + "asm"])); last = p + "rad"; }
      L.push(A(p + "cab", "Cables, clamps & dressing", "Install clamps and IF / fiber / power cables, dressing & systemization", RG, cab, [last], "", t.reuseCabling ? "SKIPPED – existing cabling reused" : ""));
      if (iduN) L.push(A(p + "idu", "Install & power ML 66xx", `Install and power ${listTxt(IDU, false)} (or new MMU)`, FE, F.iduInst * iduN, [p + "pidu"]));
      let ifcAfter = [p + "brk"];
      if (iduN) { L.push(A(p + "ne", "Basic NE & DCN", "Configure basic NE and DCN", FE, F.nedcn, [p + "idu"])); L.push(A(p + "sw", "SW upgrade", "ML 66xx SW upgrade to current version", FE, F.swup, [p + "ne"])); ifcAfter.push(p + "sw"); }
      L.push(A(p + "brk", "Break", "Break", "All", F.brk, [p + "cab"]));
      L.push(A(p + "ifc", "Connect IF / fiber to MMU", "Connect installed IF / fiber cables to MMUs as per requirement", FE, F.ifc, ifcAfter));
      L.push(A(p + "sbl", "Confirm SBL release", "Confirm availability of SBL release for radio units", FE, F.sbl, [p + "rfi"]));
      L.push(A(p + "lcfg", "Link configuration & interference test", "Configure link per LB (Tx off / dummy freq) and run interference test", FE, F.lcfg, [p + "ifc", p + "sbl"], "", "Interference found = STOP, revert to planning – do NOT align"));
      L.push(A(p + "lrf", "Share LRF / RMM fingerprint", "Share license request file / RMM fingerprint for license processing", FE, F.lrf, [p + "lcfg"]));
      L.push(A(p + "out", "Logout with NOC", `Confirm ${label} status and logout with NOC`, "All", F.logout, [p + "lrf"]));
      return L;
    };
    const migration = (L, first, opts) => {
      L.push(A("bk", "Backup, report & photos", "Take and save existing TN backup, report, print screens and overview photos", FE, F.backup, [first]));
      L.push(A("gng", "GO / NO-GO for migration", "Confirm go-ahead for migration; both NE and FE nodes visible", TL, F.gng, L.some(a => a.key === "cnf") ? ["bk", "cnf"] : ["bk"], "", "Rollback plan ready: backup, labels, old link intact"));
      L.push(A("noc", "NOC confirms outage start", "Call NOC for outage window; arrange customer FME support if needed", TL, F.nocStart, ["gng"], "Outage", "🔴 OUTAGE STARTS – not before approved start", { atOutage: true }));
      let tr = "noc";
      if (opts.npu) { L.push(A("npu", "NPU / IDU swap", "Swap NPU, align module SW and apply previous configuration", FE, F.npu, ["noc"], "Outage")); tr = "npu"; }
      L.push(A("tra", "DCN / VLAN / traffic", "Confirm DCN & VLAN, node visible on ENM, restore 2G / 3G / 4G traffic on assigned TX ports only", INT + " + FE", F.traffic, [tr], "Outage"));
      L.push(A("rel", "Relocate reused items", "Move reused radio / IF / MMU from old link to new link (if reused)", RG, F.relocate, ["noc"], "Outage"));
      L.push(A("up", "NOC confirms all sites up", "NOC confirms traffic migrated; all local + dependent sites up", "NOC + " + TL, F.confirmUp, ["tra", "rel"], "Outage", "🟢 OUTAGE ENDS – rollback if not OK"));
      L.push(A("bka", "Backup & config after", "Take all backup reports and config files", FE, F.backupAfter, ["up"]));
      L.push(A("pm", "Clear PM logs", "Clear performance logs & cache for 24h performance approval", FE, F.clearPm, ["up"]));
      const leaveAfter = ["bka", "pm"];
      if (opts.dism) {
        if (iduN) { L.push(A("dIdu", "Uninstall old IDU / card", "Uninstall old IDU or card per decommissioning plan", FE, F.decomIdu, ["up"])); leaveAfter.push("dIdu"); }
        L.push(A("dism", "Dismantle old link", "Dismantle old antenna, radio, MW pole and IF cables; lower to ground", RG, F.dism, ["up"])); leaveAfter.push("dism");
      }
      L.push(A("vis", "Node visibility & link health", "Check node visibility with integrator; confirm link healthy", INT, F.nodeVis, ["bka"]));
      L.push(A("alm", "Clear alarms & QA print screens", "Clear node alarms, take print screens for QA", FE, F.clearAlarms, ["vis"]));
      leaveAfter.push("alm");
      L.push(A("lv", "Confirm with NOC & leave", "NOC confirms all services / sites up; leave site", "All", F.leave, leaveAfter));
    };
    const qaDay = (withDism) => {
      const L = start("q", true, false);
      L.push(A("stab", "Link stability check", "Check link stability & performance since counter reset; no BER", FE, F.stability, ["qehs"]));
      let after = "stab";
      if (withDism) {
        if (iduN) L.push(A("dIdu", "Uninstall old IDU / card", "Uninstall old IDU or card per decommissioning plan", FE, F.decomIdu, ["stab"]));
        L.push(A("dism", "Dismantle old link", "Dismantle old antenna, radio, MW pole and IF cables; lower to ground", RG, F.dism, ["stab"])); after = "dism";
      }
      L.push(A("cln", "Clean-up for outdoor QA", "Clean up both ends for outdoor QA", RG, F.cleanup, [after]));
      L.push(A("vss", "VSS / VCOP session", "Upload installation photos to VSS / VCOP and submit to RSC", FE, F.vss, ["stab"]));
      L.push(A("vsn", "Clear VSS / VCOP snags", "Clear snags received from RSC to close VSS / VCOP", RG + " + FE", F.vssSnag, ["vss"]));
      L.push(A("pk", "Pack dismantled material", "Pack reusable material; arrange pick-up of dismantled material", RG, F.pack, ["cln"], "", "Nothing left on site for next day"));
      L.push(A("qap", "QA preparation (both ends)", "Prepare QA for site A and B; upload all link photos", TL + " + FE", F.qaPrep, ["vsn", "pk"]));
      L.push(A("lic", "License key & QA print screens", "Install license key, clear license alarms, exit unlock mode; print screens per checklist", FE, F.license, ["vsn"]));
      L.push(A("qsn", "Clear QA snags", "Clear snags received by RSC to close QA session", "All", F.qaSnag, ["qap", "lic"]));
      L.push(A("qlo", "Logout with NOC", "Logout with NOC", "All", F.logout, ["qsn"]));
      return L;
    };
    const days = [];
    if (m === "normal") {
      if (t.compact) {
        const L = endBlock("a", "Site A", true);
        L.push(A("mv", "Move to Site B", "Logout Site A and move to far-end site", "All", F.travel, ["aout"]));
        L.push(...endBlock("b", "Site B", false, "mv"));
        days.push({ title: "🔧 DAY 1 – INSTALLATION SITE A + SITE B (no impact)", acts: L });
      } else {
        days.push({ title: "🔧 DAY 1 – NE / SITE A INSTALLATION (no impact)", acts: endBlock("a", "Site A", true) });
        days.push({ title: "🔧 DAY 2 – FE / SITE B INSTALLATION (no impact)", acts: endBlock("b", "Site B", false) });
      }
      const c = start("c", true, false);
      c.push(A("aln", "Link alignment", "Align link, include far-end visit; achieve RSL & XPI per LB", RG + " + FE", F.align, ["cehs"]));
      let a2 = "aln";
      if (sd) { c.push(A("sd", "Main-Div alignment (SD)", "Align main–diversity antenna; check interference", RG + " + FE", F.alignSD, ["aln"])); a2 = "sd"; }
      c.push(A("cnf", "Confirm RSL / XPI", "Confirm desired RSL and XPI achieved", FE, F.confirm, [a2]));
      migration(c, a2, { npu: iduN > 0, dism: true });
      days.push({ title: `⚡ DAY ${days.length + 1} – ALIGNMENT, MIGRATION & DECOMMISSIONING`, acts: c, cut: true });
      days.push({ title: `✅ DAY ${days.length + 1} – QA, VSS / VCOP SESSIONS`, acts: qaDay(false) });
    } else if (m === "hot") {
      const L = start("a", false, true).map(a => Object.assign(a, { who: a.who === "All" ? "Team A + Team B" : a.who }));
      L[0].desc += " (two teams, one per end)";
      L.push(A("arfi", "RFI check (both ends)", "Check RFI per scope & design at both ends", TL, F.rfi, ["aehs"]));
      L.push(A("apre", "Pre-check & outage plan", "Pre-check screenshots; IM issues outage plan for next-day migration approval", FE, F.precheck, ["aehs"], "", "Ericsson gets migration confirmation from customer"));
      L.push(A("aasm", "Assemble dishes & radios", `Assemble ${listTxt(ANT.concat(RAD), false) || "units"} on ground – ready for lifting`, RG, F.assemble, ["arfi"]));
      if (iduN) { L.push(A("apidu", "Prepare ML 66xx on ground", `Prepare ${listTxt(IDU, false)}`, FE, F.prepIdu, ["arfi"]));
        L.push(A("aidu", "Install & power ML 66xx", "Install and power new ML 66xx", FE, F.iduInst * iduN, ["apidu"]));
        L.push(A("ane", "Basic NE & DCN + SW upgrade", "Configure basic NE / DCN and upgrade SW", FE, F.nedcn + F.swup, ["aidu"])); }
      L.push(A("arig", "Rigging", "Tower climbing & rope prep, pulley, rescue kit; measure IF cable", RG, F.rigging, ["aasm"]));
      L.push(A("acab", "Cables, clamps & dressing", "Install clamps and new radio / fiber / power cables", RG, cab, ["arig"], "", t.reuseCabling ? "SKIPPED – existing cabling reused" : ""));
      L.push(A("arou", "Route cables & connectors", "Route new cables into cabinet, make connectors", RG, t.reuseCabling ? 0 : F.route, ["acab"]));
      L.push(A("acon", "IF continuity test", "Continuity test on all IF connectors", FE, t.reuseCabling ? 0 : F.contin, ["arou"]));
      L.push(A("aifc", "Connect & label IF to MMU", "Connect IF cables to MMUs, label for identification", FE, F.ifc, iduN ? ["acon", "ane"] : ["acon"]));
      L.push(A("ardy", "Report readiness for swap", "Report site status and readiness for hot swap", TL, F.ready, ["aifc", "apre"]));
      L.push(A("aout", "Logout with NOC", "Logout with NOC", "All", F.logout, ["ardy"]));
      days.push({ title: "🔧 DAY 1 – PREPARATION, BOTH ENDS IN PARALLEL (no impact)", acts: L });
      const c = start("c", true, false).map(a => Object.assign(a, { who: a.who === "All" ? "Team A + Team B" : a.who }));
      c.push(A("bk", "Backup, report & photos", "Save existing TN backup, report, print screens, photos", FE, F.backup, ["cehs"]));
      c.push(A("gng", "GO / NO-GO for hot swap", "Both dishes assembled & ready for lifting; other HW installed", TL, F.gng, ["bk"], "", "Mark old dish position – needed for rollback"));
      c.push(A("noc", "NOC confirms outage window", "Call NOC for outage window; arrange customer FME if needed", TL, F.nocStart, ["gng"]));
      c.push(A("dd", "Lower old dish", "Disconnect IF from old IDU, dismantle old dish only; keep old IF cables on tower", RG, F.discDish, ["noc"], "Outage", "🔴 OUTAGE STARTS – not before approved start", { atOutage: true }));
      c.push(A("nd", "Install new dish & radio", `Hoist & install ${listTxt(ANT.concat(RAD), true) || "new dish & radio"} per LB`, RG, antMin + radMin, ["dd"], "Outage"));
      c.push(A("cr", "Connect radio cables", "Connect radio cables per labels; confirm HW in SW inventory", FE, F.connRad, ["nd"], "Outage"));
      c.push(A("rc", "Radio release check", "Check radio release, upgrade if needed", FE, F.relChk, ["cr"], "Outage"));
      c.push(A("cf", "Configure ML & radios", "Configure new ML and radios with approved LB", FE, F.cfg, ["cr"], "Outage"));
      c.push(A("tx", "Interference test & Tx on", "Interference test both ends, switch Tx on, software RF loop", FE, F.txOn, ["rc", "cf"], "Outage", "Interference = STOP, revert to planning"));
      c.push(A("aln", "Alignment / fine tuning", "Align link, recheck interference; achieve RSL per LB", RG + " + FE", F.alignHot + (sd ? F.alignSD : 0), ["tx"], "Outage", sd ? "Includes Main-Div (SD) alignment" : ""));
      c.push(A("xp", "XPI fine tuning", "Check XPI and fine tune to accepted levels", FE, F.xpi / 2, ["aln"], "Outage"));
      c.push(A("tra", "DCN / VLAN / traffic", "Confirm DCN & VLAN, ENM visibility, restore traffic on assigned ports", INT + " + FE", F.trafficHot, ["aln"], "Outage"));
      c.push(A("up", "NOC confirms all sites up", "Traffic migrated; all local + dependent sites up", "NOC + " + TL, F.confirmUp, ["xp", "tra"], "Outage", "🟢 OUTAGE ENDS – rollback if not OK (reinstall old dish at marked position)"));
      c.push(A("lrf", "Share LRF / RMM fingerprint", "Share license request file for processing", FE, F.lrf, ["up"]));
      c.push(A("bka", "Backup & config after", "Take backup reports and config files", FE, F.backupAfter, ["up"]));
      c.push(A("pm", "Clear PM logs", "Clear performance logs for 24h approval", FE, F.clearPm, ["up"]));
      c.push(A("lv", "Confirm with NOC & leave", "NOC confirms all services up; leave site", "Team A + Team B", F.leave, ["lrf", "bka", "pm"]));
      days.push({ title: "⚡ DAY 2 – HARDWARE HOT SWAP, ALIGNMENT & MIGRATION", acts: c, cut: true });
      days.push({ title: "✅ DAY 3 – DECOMMISSIONING, QA & VSS / VCOP", acts: qaDay(true) });
    } else if (m === "upg") {
      const L = start("a", false, true);
      L.push(A("arfi", "RFI check – Site A", "Check RFI as per scope & design", TL, F.rfi, ["aehs"]));
      L.push(A("aasm", "Assemble new radio – Site A", `Assemble ${listTxt(RAD, false) || "new radio"}`, RG, F.assemble / 2, ["arfi"]));
      L.push(A("apre", "Pre-check & outage plan", "Pre-check screenshots; share outage plan for approval", FE, F.precheck, ["aehs"]));
      L.push(A("arig", "Rigging – Site A", "Tower climbing & rope prep, rescue kit", RG, F.rigging, ["aasm"]));
      L.push(A("arad", "Install radio on existing antenna – Site A", `Install ${listTxt(RAD, true)} on free port of existing integration kit (dish must be dual-pol HPX)`, RG, radMin, ["arig"], "", "Not HPX = antenna swap needed"));
      L.push(A("acab", "Cables & dressing – Site A", "Clamps, fiber / power cables, dressing", RG, cab, ["arad"]));
      L.push(A("apow", "Power radio & fiber to IDU – Site A", "Power new radio, connect fiber to planned IDU port", FE, F.powerRad, ["acab"]));
      L.push(A("alog", "Login, config & SW – Site A", "Initial configuration and SW upgrade", FE, F.login, ["apow"]));
      L.push(A("mv", "Break & move to Site B", "Break and move to far end", "All", F.travel, ["alog"]));
      L.push(...start("b", false, false).map(a => (!a.after.length ? Object.assign(a, { after: ["mv"] }) : a)));
      L.push(A("brfi", "RFI check – Site B", "Check RFI as per scope & design", TL, F.rfi, ["behs"]));
      L.push(A("basm", "Assemble new radio – Site B", "Assemble new radio", RG, F.assemble / 2, ["brfi"]));
      L.push(A("brig", "Rigging – Site B", "Tower climbing & rope prep", RG, F.rigging, ["basm"]));
      L.push(A("brad", "Install radio on existing antenna – Site B", `Install ${listTxt(RAD, true)} on existing antenna`, RG, radMin, ["brig"]));
      L.push(A("bout", "Logout with NOC", "Logout with NOC", "All", F.logout, ["brad"]));
      days.push({ title: "🔧 DAY 1 – SITE A INSTALLATION + SITE B START (no impact)", acts: L });
      const c = start("c", true, false);
      c.push(A("bcab", "Cables & dressing – Site B", "Clamps, fiber / power cables, dressing", RG, cab, ["cehs"]));
      c.push(A("bpow", "Power radio & fiber to IDU – Site B", "Power new radio, connect fiber to IDU", FE, F.powerRad, ["bcab"]));
      c.push(A("blog", "Login, config & SW – Site B", "Initial configuration and SW upgrade", FE, F.login, ["bpow"]));
      c.push(A("bk", "Backup, report & photos", "Save existing radio backup, report, print screens", FE, F.backup, ["blog"]));
      c.push(A("gng", "GO / NO-GO for upgrade", "Confirm go-ahead for 1+0 → 2+0 upgrade", TL, F.gng, ["bk"]));
      c.push(A("noc", "NOC confirms outage start", "Call NOC for outage window", TL, F.nocStart, ["gng"], "Outage", "🔴 OUTAGE STARTS – not before approved start", { atOutage: true }));
      c.push(A("rar", "Rearrange ICC / XPIC / fiber", "Rearrange connectivity between existing and new radio for 2+0", FE, F.rearrange, ["noc"], "Outage"));
      c.push(A("rst", "Reset & re-config for 2+0", "Reset existing radio config and reconfigure VN for 2+0 RLB", FE, F.resetCfg, ["noc"], "Outage"));
      c.push(A("cf", "Configure radios per LB", "Configure radio units with approved LB", FE, F.cfg, ["rar", "rst"], "Outage"));
      c.push(A("tx", "Interference test & Tx on", "Interference test both ends; switch Tx on, restore hop on 2+0", FE, F.txOn, ["cf"], "Outage", "Interference = STOP"));
      c.push(A("ft", "Fine tuning / XPI", "Link fine tuning, XPI adjust, recheck interference", RG + " + FE", F.finetune, ["tx"], "Outage"));
      c.push(A("cnf", "Confirm modulation / RSL / XPI", "Confirm modulation, capacity, RSL, XPI achieved", FE, F.confirm, ["ft"], "Outage"));
      c.push(A("tra", "DCN / VLAN / traffic", "Confirm DCN / VLAN, ENM visibility, restore traffic", INT + " + FE", F.trafficHot, ["ft"], "Outage"));
      c.push(A("up", "NOC confirms all sites up", "Traffic confirmed; all local + dependent sites up", "NOC + " + TL, F.confirmUp, ["tra", "cnf"], "Outage", "🟢 OUTAGE ENDS – rollback if not OK"));
      c.push(A("lrf", "Share LRF / RMM fingerprint", "Share license request file", FE, F.lrf, ["up"]));
      c.push(A("bka", "Backup & config after", "Backup reports & config files", FE, F.backupAfter, ["up"]));
      c.push(A("pm", "Clear PM logs", "Clear PM logs for 24h approval", FE, F.clearPm, ["bka"]));
      c.push(A("lv", "Confirm with NOC & leave", "NOC confirms all up; leave site", "All", F.leave, ["lrf", "pm"]));
      days.push({ title: "⚡ DAY 2 – SITE B + LINK UPGRADE 1+0 → 2+0", acts: c, cut: true });
      days.push({ title: "✅ DAY 3 – QA, VSS / VCOP SESSIONS", acts: qaDay(false) });
    } else {
      const c = start("c", false, true);
      c.push(A("rfi", "RFI check", "Check RFI as per scope & design", TL, F.rfi, ["cehs"]));
      c.push(A("pre", "Pre-check & outage plan", "Pre-check screenshots; share outage plan with expected migration time", FE, F.precheck, ["cehs"]));
      c.push(A("lab", "Check cable labels", "Check cables planned for relocation: labels visible and accurate", FE, F.labels, ["cehs"]));
      c.push(A("asm", "Assemble ML 66xx", `Assemble ${listTxt(IDU, false) || "new IDU"} with required modules / cards`, FE, F.prepIdu / 2, ["rfi"]));
      c.push(A("idu", "Install & power ML 66xx", "Install and power on new ML 66xx", FE, F.iduInst * Math.max(1, iduN), ["asm"]));
      c.push(A("ne", "Basic NE & DCN", "Configure basic NE and DCN", FE, F.nedcn, ["idu"]));
      c.push(A("sw", "SW upgrade", "ML 66xx SW upgrade", FE, F.swup, ["ne"]));
      c.push(A("bk", "Backup, report & photos", "Save existing IDU backup, report, print screens, photos", FE, F.backup, ["sw", "pre", "lab"]));
      c.push(A("gng", "GO / NO-GO for IDU swap", "Confirm go-ahead for IDU upgrade", TL, F.gng, ["bk"], "", "Rollback: reconnect relocated HW as before"));
      c.push(A("noc", "NOC confirms outage start", "Call NOC for outage window", TL, F.nocStart, ["gng"], "Outage", "🔴 OUTAGE STARTS – not before approved start", { atOutage: true }));
      c.push(A("rel", "Move cables to new IDU", "Disconnect from old IDU, relocate to new IDU per planned ports (radio, ethernet, fiber)", FE, F.relocIdu, ["noc"], "Outage"));
      c.push(A("mmu", "Configure MMU / radio as before", "Configure MMU and radio with same parameters to restore links", FE, F.cfgMmu, ["rel"], "Outage"));
      c.push(A("tra", "WAN / VLAN / traffic", "WAN up, add to DCN & traffic VLANs, ENM visibility, restore traffic", INT + " + FE", F.traffic * 2 / 3, ["mmu"], "Outage"));
      c.push(A("up", "NOC confirms all sites up", "Traffic confirmed; all local + dependent sites up", "NOC + " + TL, F.confirmUp, ["tra"], "Outage", "🟢 OUTAGE ENDS – rollback if not OK"));
      c.push(A("lrf", "Share LRF / RMM fingerprint", "Share license request file", FE, F.lrf, ["up"]));
      c.push(A("bka", "Backup & config after", "Backup reports & config files", FE, F.backupAfter, ["up"]));
      c.push(A("pm", "Clear PM logs", "Clear PM logs for 24h approval", FE, F.clearPm, ["bka"]));
      c.push(A("lv", "Confirm with NOC & leave", "NOC confirms all up; leave site", "All", F.leave, ["lrf", "pm"]));
      days.push({ title: "⚡ DAY 1 – PREPARATION & IDU / NPU SWAP", acts: c, cut: true });
      days.push({ title: "✅ DAY 2 – QA, VSS / VCOP SESSIONS", acts: qaDay(false) });
    }
    days.forEach((d, i) => { d.idx = i + 1; d.title = d.title.replace(/DAY \d+/, `DAY ${i + 1}`);
      const pos = {}; d.acts.forEach((a, k) => pos[a.key] = k + 1);
      d.acts.forEach(a => { a.afterIdx = a.after.map(k => pos[k]).filter(Boolean); }); });
    return days;
  }

  function schedule(state, t) {
    const P = state.project, TRM = state.domain === "TRM", outApproved = hm(P.outStart), outMax = (+P.outMax || 0) * 60;
    const days = TRM ? trmActivities(state, t) : activities(state, t);
    if (TRM) days.forEach(d => {
      if (!d.cut) { d.arrive = hm(P.arrive); return; }
      // team arrives just in time: approved outage start minus the preparation chain before the outage
      d.acts.forEach(a => { a.start = a.afterIdx.length ? Math.max(...a.afterIdx.map(k => d.acts[k - 1].end)) : 0; a.end = a.start + a.dur; });
      const first = d.acts.find(a => a.atOutage); d.lead = first ? first.start : 0; d.arrive = Math.max(0, outApproved - d.lead);
    });
    days.forEach(d => { if (!TRM && d.cut) d.lead = leadMin(state); });
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
    if (lines.length) return lines.map((l, i) => { const p = l.split(/[,;\t]/).map(x => x.trim());
      if (state.domain === "TRM") return { id: p[0] || `LINK-${i + 1}`, a: p[1] || "", b: p[2] || "", type: p[3] || state.types[0].name, gov: p[4] || "" };
      return { id: p[0] || `SITE-${i + 1}`, type: p[1] || state.types[0].name, gov: p[2] || "" }; });
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
    const P = state.project, TRM = state.domain === "TRM";
    const U1 = TRM ? "link" : "site", Us = TRM ? "links" : "sites", UU = TRM ? "Link" : "Site";
    const types = state.types.map((t, i) => Object.assign({}, t, { color: COLORS[i % COLORS.length], sch: schedule(state, t) }));
    const sites = sitesOf(state);
    const ND = TRM ? Math.max(...types.map(t => t.sch.days.length)) : daysOf(P), CUT = TRM ? 0 : cutDayOf(P);
    const dBy = Object.fromEntries(types.map(t => [t.name, t.sch.days.length])), cBy = Object.fromEntries(types.map(t => [t.name, t.sch.cutIdx]));
    const plan = planDates(state, sites, dBy, cBy);
    const siteDays = sites.reduce((a, x) => a + (dBy[x.type] || 0), 0);
    const used = new Set(["Dashboard", "Connections", "Site Tracker"]);
    types.forEach((t, i) => { let b = String(t.name || `Type-${i + 1}`).replace(/[*?:\\/\[\]']/g, "-").slice(0, 28).trim() || `Type-${i + 1}`, n = b, k = 2;
      while (used.has(n.toLowerCase()) || used.has(n)) n = `${b.slice(0, 26)}-${k++}`; used.add(n); used.add(n.toLowerCase()); t.sheet = n; });
    const nav = [["🏠 Dashboard", "Dashboard"], ...types.map(t => [t.sheet, t.sheet]), ["🔌 Connections", "Connections"], ["📅 Site Tracker", "Site Tracker"]];
    const db = wb.addWorksheet("Dashboard", { views: [{ showGridLines: false }], properties: { tabColor: { argb: ARGB(NAVY) } } });
    const tws = types.map(t => wb.addWorksheet(t.sheet, { views: [{ showGridLines: false, state: "frozen", xSplit: 2, ySplit: 6, zoomScale: 85 }], properties: { tabColor: { argb: ARGB(t.color) } } }));
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
      banner(ws, `MOP ${t.name}  |  ${equipTxt(t)}`,
        TRM ? `${(TRM_METHODS[t.method] || TRM_METHODS.normal).label}${t.compact && t.method === "normal" ? " – both ends on Day 1" : ""}${t.sd ? "   •   Space diversity" : ""}   •   Links: ${t.sites}   •   ${t.sch.days.length} days per link   •   Qty per link end   •   Blue = edit   •   Outage start & allowed hours on Dashboard` : `BB: ${bbText(state)}${(state.rbs || []).filter(r => r.type && +r.qty > 0).length ? "   •   RBS: " + state.rbs.filter(r => r.type && +r.qty > 0).map(r => r.qty + "x " + r.type).join(" + ") : ""}   •   Sites: ${t.sites}   •   ${ND} days per site   •   Day-time work only   •   Blue = edit   •   Outage start & allowed hours on Dashboard${t.reuseCabling ? "   •   Existing cabling reused" : ""}`, last);
      navbar(ws, 3);
      hdr(ws, 6, 1, ["SN", "Activity", "What to do", "Who", "Impact", "After SN", "Dur (min)", "Start", "End", "Remarks"]);
      ws.mergeCells(6, G0, 6, last); put(ws, 6, G0, "🕒 TIME MAPPING (30-min slots from team arrival)", { font: { bold: true, ...WHITEF }, fill: HDR, al: CEN });
      let r = 7; const info = [];
      S.days.forEach((d, di) => {
        const br = r, dn = di + 1;
        ws.mergeCells(r, 1, r, 5); put(ws, r, 1, d.title, { font: { bold: true, ...WHITEF }, fill: TEAL, al: LFT });
        put(ws, r, 6, "Arrive", { font: { bold: true, ...WHITEF }, fill: TEAL, al: CEN });
        put(ws, r, 7, fx(d.cut ? (TRM ? `${DB("outStart")}-${d.lead}/1440` : DB("cutArrive")) : DB("arrive"), d.arrive / 1440), { font: { bold: true, color: { argb: "FF008000" } }, fill: IN, al: CEN, fmt: "hh:mm" });
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
          { type: "expression", priority: 2, formulae: [`AND(OR(ISNUMBER(SEARCH("Tower",$D${first})),ISNUMBER(SEARCH("Rigger",$D${first}))),${ov})`], style: cfFill("F59F00") },
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
      [[TRM ? "Riggers" : "Tower", "F59F00", "FF000000"], [TRM ? "TL / FE" : "Ground/FE", "4C6EF5", "FFFFFFFF"], ["Outage", "E03131", "FFFFFFFF"], ["Remote", "9C36B5", "FFFFFFFF"], ["Allowed outage", "FFE3E3", "FF000000"], ["After max", "E9ECEF", "FF000000"]]
        .forEach(([lab, col, fc], i) => { ws.mergeCells(4, G0 + i * 3, 4, G0 + i * 3 + 2); put(ws, 4, G0 + i * 3, lab, { font: { size: 8, bold: true, color: { argb: fc } }, fill: col, al: CEN }); });
      [7, 20, 46, 14, 8, 8, 8, 7, 7, 26].forEach((w, i) => ws.getColumn(i + 1).width = w);
      for (let s = 0; s < NS; s++) ws.getColumn(G0 + s).width = 3.4;
      ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    });

    // ---------- Connections ----------
    const nT = types.length, NEWB = bbList(state, "New"), OLDB = bbList(state, "Reused");
    const newName = bbNames(state, "New") || "New baseband";
    banner(cn, "🔌 Connections – what connects to what", TRM ? "Exact ports per approved LB. Qty per link end (x2 for both ends) in blue." : "Exact ports per approved design / RND. Qty per site type in blue. 'Step' = MOP step where it is done.", 6 + nT);
    navbar(cn, 3);
    hdr(cn, 5, 1, ["#", "From", "To", "Cable / type", ...types.map(t => t.name), "Step", "Remarks"]);
    const airDay = ND === 4 ? "2" : `1 / ${CUT}`;
    const ROLES = [...new Set(types.flatMap(t => unitsOf(t).map(u => u.role || "Radio")))];
    const trmConn = [
      ["ML 66xx / IDU (MMU)", "Radio units (RAU / ML 6352)", "IF / fiber cable", t => sumQ(unitsOf(t).filter(u => trmCat(u) === "rad")), "Day 1 (per end)", "Label both ends; continuity test"],
      ["Radio units", "Antenna", "Direct mount / flex", t => sumQ(unitsOf(t).filter(u => trmCat(u) === "ant")), "Day 1 (per end)", "Per LB polarisation"],
      ["Rectifier / PDU", "ML 66xx / IDU", "DC power + CB", t => Math.max(1, sumQ(unitsOf(t).filter(u => trmCat(u) === "idu"))), "Day 1 (per end)", ""],
      ["Rectifier / PDU", "Radio units (if DC-fed)", "DC power cable", t => sumQ(unitsOf(t).filter(u => trmCat(u) === "rad")), "Day 1 (per end)", ""],
      ["ML 66xx / IDU", "RAN baseband / router", "Ethernet / optical (assigned TX ports only)", () => 1, "Outage day", "Traffic & DCN VLANs"],
      ["ML 66xx / IDU", "DCN / ENM", "DCN VLAN", () => 1, "Outage day", "Node visible on ENM"],
      ["Old IDU", "New IDU", "Relocated radio / ethernet / fiber (if IDU swap)", t => sumQ(unitsOf(t).filter(u => trmCat(u) === "idu")), "Outage day", "Per planned ports & labels"],
      ["All new units", "Site ground bar", "Grounding cable", t => sumQ(unitsOf(t)), "Day 1 (per end)", "Antenna, radios, IDU"],
    ];
    const conn = TRM ? trmConn : [
      ...ROLES.map(role => [newName, role, "Fiber CPRI + SFP", t => sumQ(unitsOf(t).filter(u => (u.role || "Radio") === role)), /AIR|5G|NR/i.test(role) ? `Day ${airDay}` : "Day 1", "One per unit"]),
      ...OLDB.map(b => [`${b.model} (reused${b.tech ? ", " + b.tech : ""})`, "New radios", "Fiber CPRI + SFP", () => +b.qty, `Day ${CUT} (outage)`, "Re-home during outage"]),
      ...NEWB.map(b => ["Rectifier / PDU", b.model, "DC power + CB", () => +b.qty, "Day 1", ""]),
      ...(state.rbs || []).filter(r => r.type && +r.qty > 0).map(r => ["Rectifier / PDU", r.type, "DC power + CB", () => +r.qty, "Day 1", "New RBS"]),
      ["Rectifier / PDU", "Radios", "DC power cable + CB", t => sumQ(radiosOf(t)), "Day 1", ""],
      ["Rectifier / PDU", "AIRs", "DC power cable + CB", t => sumQ(airsOf(t)), `Day ${airDay}`, ""],
      ["Radios", "Existing antennas", "RF jumpers (per port map)", () => "map", `Day ${CUT} (outage)`, "Torque + weatherproof"],
      [newName, "TX / MW / router", "Ethernet / fiber backhaul", () => 1, `Day 1 / ${CUT}`, "New port Day 1, migration on cutover"],
      ["Site alarms", "New / reused basebands", "Alarm cable", () => 1, `Day ${CUT}`, ""],
      ["All new units", "Site ground bar", "Grounding cable", t => sumQ(unitsOf(t)) + bbQty(state, "New") + (state.rbs || []).reduce((a, r) => a + (r.type ? +r.qty || 0 : 0), 0), "Day 1", "Radios + AIRs + new basebands + RBS"],
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
    banner(st, `📅 ${UU} Tracker – auto schedule & progress`, TRM ? `Dates planned from project start, days per link type and number of teams (${wk(P).label}). Dates are values – edit blue cells as needed.` : `Dates auto-planned from project start, days per site and number of teams (${wk(P).label}). Override blue cells if needed.`, TRM ? 13 : 11);
    navbar(st, 3);
    hdr(st, 5, 1, TRM ? ["#", "Link ID", "Link type", "Team", "Start (Day 1)", "Outage day", "End (last day)", "Status", "Progress", "Region", "Remarks", "Site A", "Site B"]
      : ["#", "Site ID", "Site type", "Team", "Start (Day 1)", "Cutover day", "End (last day)", "Status", "Progress", "Region", "Remarks"]);
    const typeList = `"${types.map(t => t.name).join(",")}"`, start = new Date(P.startDate + "T00:00:00Z"), code = wk(P).code;
    const xl = d => d.getTime() / 86400000 + 25569;
    const regs = String(P.regions || "").split(",").map(x => x.trim()).filter(Boolean);
    sites.forEach((s, i) => {
      const r = 6 + i, teams = Math.max(1, +P.teams || 1);
      const d1 = addWD(P, firstWD(P, start), Math.floor(i / teams) * ND);
      put(st, r, 1, i + 1, { al: CEN });
      put(st, r, 2, s.id, { font: { color: { argb: "FF0000FF" } }, fill: IN, al: CEN });
      put(st, r, 3, s.type, { font: { color: { argb: "FF0000FF" } }, fill: IN, al: CEN }); st.getCell(r, 3).dataValidation = { type: "list", allowBlank: true, formulae: [typeList] };
      if (TRM) {
        const pd = plan[i];
        put(st, r, 4, pd.team, { al: CEN, fmt: '"Team "0' });
        put(st, r, 5, xl(pd.start), { font: { color: { argb: "FF0000FF" } }, fill: IN, al: CEN, fmt: "ddd dd-mmm" });
        put(st, r, 6, xl(pd.cut), { font: { bold: true, color: { argb: "FFC92A2A" } }, fill: IN, al: CEN, fmt: "ddd dd-mmm" });
        put(st, r, 7, xl(pd.end), { font: { color: { argb: "FF0000FF" } }, fill: IN, al: CEN, fmt: "ddd dd-mmm" });
        put(st, r, 12, s.a || "", { font: { color: { argb: "FF0000FF" } }, fill: IN, al: CEN }); put(st, r, 13, s.b || "", { font: { color: { argb: "FF0000FF" } }, fill: IN, al: CEN });
      } else {
      put(st, r, 4, fx(`MOD(A${r}-1,${DB("teams")})+1`, (i % teams) + 1), { al: CEN, fmt: '"Team "0' });
      put(st, r, 5, fx(`WORKDAY.INTL(${DB("start")}-1,1+INT((A${r}-1)/${DB("teams")})*${DB("days")},${code})`, xl(d1)), { fill: IN, al: CEN, fmt: "ddd dd-mmm" });
      put(st, r, 6, fx(`WORKDAY.INTL(E${r},IF(${DB("days")}>=4,2,1),${code})`, xl(addWD(P, d1, CUT - 1))), { al: CEN, fmt: "ddd dd-mmm", font: { bold: true, color: { argb: "FFC92A2A" } } });
      put(st, r, 7, fx(`WORKDAY.INTL(E${r},${DB("days")}-1,${code})`, xl(addWD(P, d1, ND - 1))), { al: CEN, fmt: "ddd dd-mmm" });
      }
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
    [4, 12, TRM ? 22 : 10, 9, 14, 14, 14, 13, 10, 14, 26, 14, 14].forEach((w, i) => st.getColumn(i + 1).width = w);

    // ---------- Dashboard ----------
    const lastDbCol = 6 + ND + 5;
    banner(db, `📡 ${P.name}${P.country ? " – " + P.country : ""} – ${TRM ? "TRM (MW link)" : "RAN"} Installation Dashboard`, TRM ? `TRM • days per link from the swap method • day-time work only • ${sites.length} links • ${nT} link types` : `${ND} days per site • day-time work only • remote integration in parallel with field work • ${sites.length} sites • ${nT} equipment types • BB: ${bbText(state)}`, Math.max(14, lastDbCol));
    navbar(db, 3);
    const LEAD = leadMin(state);
    const maxLead = TRM ? Math.max(...types.map(t => t.sch.days.find(d => d.cut).lead || 0)) : LEAD;
    const inputs = [["👷 Team on site (normal days)", hm(P.arrive) / 1440, "hh:mm"], [TRM ? "👷 Team on site – outage day (auto, earliest type)" : `👷 Team on site – cutover day (auto)`, fx(`${IC.outStart}-${maxLead}/1440`, Math.max(0, hm(P.outStart) - maxLead) / 1440), "hh:mm", "auto"],
      ["🔴 Approved outage start", hm(P.outStart) / 1440, "hh:mm"], ["⏳ Max outage allowed (h)", +P.outMax, "0.0"],
      ["⏱ Max working hours / day", +P.maxHours, "0.0"], TRM ? ["📆 Days per link", "per method", "@", "auto"] : ["📆 Days per site", ND, "0"],
      ["🚀 Project start date", xl(start), "ddd dd-mmm-yyyy"], ["👥 Teams in parallel", +P.teams, "0"]];
    inputs.forEach(([l, v, f, auto], i) => {
      const r = 4 + i; db.mergeCells(r, 1, r, 2);
      put(db, r, 1, l, { font: { bold: true }, fill: "E8EEF6", al: LFT });
      put(db, r, 3, v, { font: { bold: true, color: { argb: auto ? "FF000000" : "FF0000FF" } }, fill: auto ? "E9ECEF" : IN, al: CEN, fmt: f });
    });
    db.getCell(5, 4).value = TRM ? "= outage start − prep (per link type)" : `= outage start − ${fmt(LEAD)} prep`; db.getCell(5, 4).font = F({ size: 8, italic: true, color: { argb: "FF666666" } });
    db.mergeCells(13, 1, 15, 3);
    put(db, 13, 1, TRM ? `ℹ Outage start / allowed hours: change C6–C7 → outage-day arrival and the first outage step move with it; the outage closes when the NOC confirms all sites up, and each link type is flagged if it runs over.\nℹ Days per link follow the swap method chosen in the MOP Generator.` : `ℹ Outage start / allowed hours: change C6–C7 → cutover-day arrival and power-off move with it, outage still closes when 'Cells on air' is done, and each type is flagged if it runs over.\nℹ Days per site (C9) updates the tracker & site-days; to move activities between days, change it in the MOP Generator and regenerate.`, { font: { size: 9, italic: true, bold: true, color: { argb: "FFC92A2A" } }, al: LFT, border: false });
    const H0 = 17, T0 = 18, TL = T0 + nT - 1;
    const dayCols = Array.from({ length: ND }, (_, i) => 6 + i), cOut = 6 + ND, cTot = cOut + 1, cSum = cOut + 2, cStat = cOut + 3, cWin = cOut + 4;
    const lastDay = sites.length ? new Date(Math.max(...plan.map(x => x.end.getTime()))) : new Date(P.startDate + "T00:00:00Z");
    const allOk = types.every(t => t.sch.outOk);
    const cards = [[Us.toUpperCase(), `SUM(D${T0}:D${TL})`, sites.length, "0", "1F77B4"], [`${U1.toUpperCase()}-DAYS`, `SUMPRODUCT(D${T0}:D${TL},E${T0}:E${TL})`, siteDays, "0", "0F766E"],
      ["MAX OUTAGE", `MAX(${CL(cOut)}${T0}:${CL(cOut)}${TL})`, Math.max(...types.map(t => t.sch.outage)) / 1440, "[h]:mm", "C92A2A"],
      ["🏁 PROJECT FINISH", `MAX('Site Tracker'!G6:G${L})`, xl(lastDay), "dd-mmm-yy", "F59F00"],
      [`✔ ${Us.toUpperCase()} DONE`, `COUNTIF('Site Tracker'!H6:H${L},"Done")&" / "&COUNTA('Site Tracker'!B6:B${L})`, `0 / ${sites.length}`, "@", "2F9E44"]];
    cards.forEach(([lab, f, v, nf, col], i) => {
      const c = 5 + i * 2;
      db.mergeCells(5, c, 5, c + 1); db.mergeCells(6, c, 8, c + 1);
      put(db, 5, c, lab, { font: { size: 9, bold: true, ...WHITEF }, fill: col, al: CEN });
      const med = { style: "medium", color: { argb: ARGB(col) } };
      put(db, 6, c, fx(f, v), { font: { size: 20, bold: true, color: { argb: ARGB(col) } }, fill: "FFFFFF", al: CEN, fmt: nf });
      db.getCell(6, c).border = { top: med, left: med, bottom: med, right: med };
    });
    db.mergeCells(10, 5, 11, 14);
    put(db, 10, 5, TRM ? fx(`"Outage allowed "&TEXT(${IC.outStart},"hh:mm")&" → "&TEXT(${IC.outStart}+${IC.outMax}/24,"hh:mm")&"  •  team arrives just in time for the outage  •  rollback plan in every outage day"`,
      `Outage allowed ${clock(hm(P.outStart))} → ${clock(hm(P.outStart) + P.outMax * 60)}  •  team arrives just in time for the outage  •  rollback plan in every outage day`) : fx(`"Outage allowed "&TEXT(${IC.outStart},"hh:mm")&" → "&TEXT(${IC.outStart}+${IC.outMax}/24,"hh:mm")&" (cutover day ${CUT})  •  "&${IC.days}&" days per site  •  24h KPI check remote"`,
      `Outage allowed ${clock(hm(P.outStart))} → ${clock(hm(P.outStart) + P.outMax * 60)} (cutover day ${CUT})  •  ${ND} days per site  •  24h KPI check remote`), { font: { italic: true, bold: true, color: { argb: ARGB(TEAL) } }, al: LFT, border: false });
    const H = { 1: `${UU} type`, 2: TRM ? "Method / equipment (per end)" : "Equipment", 4: TRM ? "Links" : "Sites", 5: "Days" };
    dayCols.forEach((c, i) => H[c] = `Day ${i + 1}${!TRM && i + 1 === CUT ? " ⚡" : ""}`);
    Object.assign(H, { [cOut]: "🔴 Outage", [cTot]: `⏱ Total / ${U1}`, [cSum]: `Σ all ${Us}`, [cStat]: "Status", [cWin]: "🔴 Outage window" });
    for (const [c, v] of Object.entries(H)) put(db, H0, +c, v, { font: { bold: true, ...WHITEF }, fill: HDR, al: CEN });
    put(db, H0, 3, null, { fill: HDR }); db.mergeCells(H0, 2, H0, 3);
    types.forEach((t, j) => {
      const r = T0 + j, s = `'${t.sheet}'!`, n = sites.filter(x => x.type === t.name).length, S = t.sch, K = KP[t.name];
      put(db, r, 1, { text: t.name, hyperlink: `#'${t.sheet}'!A1` }, { font: { bold: true, underline: true, ...WHITEF }, fill: t.color, al: CEN });
      db.mergeCells(r, 2, r, 3); put(db, r, 2, `${TRM ? (TRM_METHODS[t.method] || TRM_METHODS.normal).label + (t.sd ? " + SD" : "") + ": " : ""}${equipTxt(t)}${t.reuseCabling ? " (reuse cabling)" : ""}`, { font: { size: 9 } });
      put(db, r, 4, fx(`COUNTIF('Site Tracker'!$C$6:$C$${L},"${t.name}")`, n), { font: { bold: true }, al: CEN });
      put(db, r, 5, TRM ? S.days.length : fx(IC.days, ND), { al: CEN });
      dayCols.forEach((c, i) => put(db, r, c, S.days[i] ? fx(`${s}${K["d" + (i + 1)]}`, S.days[i].hours / 1440) : null, { al: CEN, fmt: "[h]:mm", fill: S.days[i] ? null : "F2F4F7",
        font: S.days[i] && S.days[i].cut ? { bold: true, color: { argb: "FFC92A2A" } } : { bold: false } }));
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
    put(db, tr, 5, fx(`SUMPRODUCT(D${T0}:D${TL},E${T0}:E${TL})`, siteDays), { font: { bold: true, ...WHITEF }, fill: NAVY, al: CEN, fmt: `0" ${U1}-days"` });
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
    const widths = { 1: TRM ? 22 : 13, 2: 30, 3: 20, 4: 7, 5: 7 };
    dayCols.forEach(c => widths[c] = 9); Object.assign(widths, { [cOut]: 9, [cTot]: 11, [cSum]: 11, [cStat]: 18, [cWin]: 16 });
    for (let c = 1; c <= Math.max(14, cWin); c++) db.getColumn(c).width = widths[c] || 9;
    db.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
    return wb;
  }

  // ---------------- PDF (simplified, for reading) ----------------
  const clean = s => String(s || "").replace(/→/g, "->").replace(/[⚠]/g, "!").replace(/[✔✓]/g, "OK").replace(/[′]/g, "'")
    .replace(/[\u{1F000}-\u{1FFFF}\u2600-\u27BF\u2B50\u2B06\uFE0F]/gu, "").replace(/\s{2,}/g, " ").trim();
  function buildPdf(jsPDF, stateIn) {
    const state = normalize(stateIn), P = state.project, TRM = state.domain === "TRM";
    const U1 = TRM ? "link" : "site", Us = TRM ? "links" : "sites";
    const types = state.types.map((t, i) => Object.assign({}, t, { color: COLORS[i % COLORS.length], sch: schedule(state, t) }));
    const sites = sitesOf(state);
    const ND = TRM ? Math.max(...types.map(t => t.sch.days.length)) : daysOf(P), CUT = TRM ? 0 : cutDayOf(P);
    const dBy = Object.fromEntries(types.map(t => [t.name, t.sch.days.length])), cBy = Object.fromEntries(types.map(t => [t.name, t.sch.cutIdx]));
    const plan = planDates(state, sites, dBy, cBy);
    const siteDays = sites.reduce((a, x) => a + (dBy[x.type] || 0), 0);
    const finish = sites.length ? new Date(Math.max(...plan.map(x => x.end.getTime()))) : new Date(P.startDate + "T00:00:00Z");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth(), Hh = doc.internal.pageSize.getHeight(), M0 = 12;
    const rgb = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    const COLS = { tower: "F59F00", ground: "4C6EF5", remote: "9C36B5", out: "E03131" };
    const colOf = a => a.impact === "Outage" ? COLS.out : /Tower|Rigger/.test(a.who) ? COLS.tower : /^Remote/.test(a.who) ? COLS.remote : COLS.ground;
    const title = clean(`${P.name}${P.country ? " – " + P.country : ""}`);
    const head = (t, sub) => {
      doc.setFillColor(...rgb("14213D")); doc.rect(0, 0, W, 20, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text(clean(t), M0, 12.5);
      if (sub) { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(200, 210, 222); doc.text(clean(sub), M0, 17.5); }
      doc.setTextColor(23, 34, 48);
    };
    const legend = y => {
      [[TRM ? "Riggers" : "Tower crew", COLS.tower], [TRM ? "Team lead / FE" : "Ground / FE", COLS.ground], ["Remote integrator", COLS.remote], ["Outage", COLS.out]].forEach(([l, c], i) => {
        const x = M0 + i * 42; doc.setFillColor(...rgb(c)); doc.rect(x, y - 2.6, 5, 3, "F"); doc.setFontSize(8.5); doc.setTextColor(80, 90, 104); doc.text(l, x + 6.5, y); });
      doc.setTextColor(23, 34, 48);
    };
    // ---- page 1: overview
    head(`Installation MOP – ${title}`, TRM ? `TRM (MW link)  |  Generated ${new Date().toISOString().slice(0, 10)}  |  ${sites.length} links  |  ${types.length} link types` : `Generated ${new Date().toISOString().slice(0, 10)}  |  ${sites.length} sites  |  ${types.length} site types  |  ${ND} days per site`);
    let y = 30;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Key facts", M0, y); y += 2;
    const allowed = `${clock(hm(P.outStart))} -> ${clock(hm(P.outStart) + (+P.outMax || 0) * 60)} (${P.outMax} h)`;
    doc.autoTable({ startY: y, margin: { left: M0 }, tableWidth: 190, theme: "plain", styles: { fontSize: 9.5, cellPadding: 1.4 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 52, textColor: [74, 88, 104] } },
      body: TRM ? [["Days per link", "Set by the swap method of each link type (see table)"], ["Team on site", `${P.arrive}; on the outage day the team arrives just in time for the approved outage start`],
        ["Allowed outage", allowed], ["Rollback", "Every outage day has a rollback decision – old link kept until NOC confirms all sites up"], ["Working day limit", `${P.maxHours} h, day-time only`],
        ["Teams / start", `${P.teams} teams from ${P.startDate} – finish ${finish.toISOString().slice(0, 10)}`]]
      : [["Days per site", `${ND} (cutover on Day ${cutDayOf(P)})`], ["Team on site", `${P.arrive} (cutover day ${clock(cutArrive(state))} – ${fmt(leadMin(state))} h before outage)`],
        ["Allowed outage", allowed], ["Basebands", clean(bbText(state))], ["Working day limit", `${P.maxHours} h, day-time only`],
        ["Teams / start", `${P.teams} teams from ${P.startDate} – finish ${finish.toISOString().slice(0, 10)}`]] });
    y = doc.lastAutoTable.finalY + 7;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text(TRM ? "Link types at a glance" : "Site types at a glance", M0, y); y += 2;
    const dh = Array.from({ length: ND }, (_, i) => `Day ${i + 1}${!TRM && i + 1 === cutDayOf(P) ? " (cutover)" : ""}`);
    doc.autoTable({ startY: y, margin: { left: M0, right: M0 }, styles: { fontSize: 9, cellPadding: 1.8, valign: "middle" },
      headStyles: { fillColor: rgb("2E3B55"), textColor: 255 },
      head: [["Type", TRM ? "Method / equipment per end" : "Equipment", TRM ? "Links" : "Sites", ...dh, "Outage window", "Status"]],
      body: types.map(t => [t.name, clean((TRM ? (TRM_METHODS[t.method] || TRM_METHODS.normal).label + (t.sd ? " + SD" : "") + ": " : "") + equipTxt(t)), sites.filter(s => s.type === t.name).length,
        ...Array.from({ length: ND }, (_, i) => t.sch.days[i] ? `${clock(t.sch.days[i].arrive)}-${clock(t.sch.days[i].leave)}\n${fmt(t.sch.days[i].hours)} h${t.sch.days[i].cut && TRM ? " *" : ""}` : "-"),
        `${clock(t.sch.outStart)} -> ${clock(t.sch.outEnd)}\n${fmt(t.sch.outage)} h`,
        t.sch.days.some(d => d.hours / 60 > +P.maxHours + 0.001) ? "! day too long" : t.sch.outOk ? "OK" : "! outage over allowed"]),
      didParseCell: h => { if (h.section === "body" && h.column.index === 0) { h.cell.styles.fillColor = rgb(types[h.row.index].color); h.cell.styles.textColor = 255; h.cell.styles.fontStyle = "bold"; }
        if (h.section === "body" && h.column.index === 4 + ND) { const ok = String(h.cell.raw) === "OK"; h.cell.styles.textColor = ok ? rgb("2B8A3E") : rgb("C92A2A"); h.cell.styles.fontStyle = "bold"; } } });
    y = doc.lastAutoTable.finalY + 8;
    if (y > Hh - 34) { doc.addPage(); head(`Installation MOP – ${title}`, "How to read this document"); y = 30; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("How to read the pages that follow", M0, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(74, 88, 104);
    [TRM ? "* = outage day. One page per link type and day: step, activity, who does it, start / end time and a bar on the day's timeline." : "One page per site type and day: step number, activity, who does it, start and end time, and a bar on the day's timeline.",
     "Red rows are inside the outage. The outage starts at the approved time and ends when all cells are back on air.",
     "Purple rows are done remotely by the integrator, in parallel with the field team.",
     "Full details (step descriptions, dependencies, connections, site tracker) are in the Excel MOP."].forEach(t => { doc.text("•  " + t, M0, y); y += 5; });
    legend(y + 3);
    // ---- per type
    types.forEach(t => {
      const S = t.sch;
      S.days.forEach((d, di) => {
        doc.addPage();
        head(`${t.name}  |  Day ${di + 1} of ${S.days.length}${d.cut ? (TRM ? "  –  OUTAGE DAY" : "  –  CUTOVER") : ""}`, clean(TRM ? `${(TRM_METHODS[t.method] || TRM_METHODS.normal).label}  |  per end: ${equipTxt(t)}` : `${equipTxt(t)}  |  BB: ${bbText(state)}`));
        doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
        doc.text(clean(d.title.replace(/^\S+\s/, "")), M0, 28);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(74, 88, 104);
        let line = `On site ${clock(d.arrive)} -> ${clock(d.leave)}  (${fmt(d.hours)} h)`;
        if (d.cut) line += `   |   Outage ${clock(S.outStart)} -> ${clock(S.outEnd)} (${fmt(S.outage)} h), allowed ${allowed}  ${S.outOk ? "OK" : "! exceeds"}`;
        doc.text(line, M0, 33.5); doc.setTextColor(23, 34, 48);
        const span = Math.max(+P.maxHours * 60, d.hours, d.cut ? S.allowedEnd - d.arrive : 0);
        const TLW = 108;
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

  const api = { planDates, DEFAULT_TRM, TRM_FIXED, TRM_METHODS, trmCat, isAir, equipTxt, unitsOf, buildPdf, leadMin, cutArrive, WEEKEND, sub, bbText, bbNames, finishDate, normalize, daysOf, cutDayOf, DEFAULT_STATE, FIXED, schedule, activities, sitesOf, buildWorkbook, fmt, clock, hm, COLORS };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MOP = api;
})(typeof window !== "undefined" ? window : globalThis);
