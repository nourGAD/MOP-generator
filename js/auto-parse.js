/* Auto MOP: turns free text / speech into MOP Generator setups (RAN and/or TRM).
   Works in the browser (window.AutoParse) and in node (module.exports). */
(function (root) {
  // ---------- text clean-up ----------
  const NUMW = { zero: 0, one: 1, single: 1, two: 2, pair: 2, double: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
    // Arabic (Egyptian + MSA spellings)
    "واحد": 1, "واحدة": 1, "اتنين": 2, "اثنين": 2, "إثنين": 2, "تلاتة": 3, "ثلاثة": 3, "تلات": 3, "اربعة": 4, "أربعة": 4, "اربع": 4, "خمسة": 5, "خمس": 5,
    "ستة": 6, "ست": 6, "سبعة": 7, "تمانية": 8, "ثمانية": 8, "تسعة": 9, "عشرة": 10, "عشر": 10 };
  const AR = [ // Arabic words -> English keywords the parser understands
    [/الساعة|الساعه/g, " at "], [/لمدة|لمده|مدته|مدتها/g, " for "], [/،/g, ","],
    [/راديو|راديوهات/g, " radio "], [/اير|إير/g, " air "], [/انتينا|انتنا|أنتينا|هوائي|هوائيات|دش|طبق/g, " antenna "], [/بيز ?باند|بيسباند/g, " baseband "],
    [/سواب|تبديل|استبدال/g, " swap "], [/جديد|جديدة|جداد/g, " new "], [/قديم|قديمة|موجود|موجودة|ريوز/g, " reused "], [/مواقع|موقع|سايت|سايتات/g, " sites "],
    [/لينكات|لينك|وصلات|وصلة/g, " links "], [/أيام|ايام|يومين|يوم/g, (m) => m === "يومين" ? " 2 days " : " days "], [/ساعات|ساعة|ساعه/g, " hours "],
    [/انقطاع|اوتاج|أوتاج|اوتيدج/g, " outage "], [/فريق|فرق|تيمات|تيم/g, " teams "], [/ميكرويف|مايكروويف/g, " mw "], [/فك|تفكيك/g, " dismantle "],
    [/توسعة|اضافة|إضافة/g, " expansion "], [/ و /g, " and "], [/ مع /g, " and "], [/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))],
  ];
  function clean(raw) {
    let t = " " + String(raw || "") + " ";
    AR.forEach(([re, to]) => { t = t.replace(re, to); });
    t = t.replace(/[“”"']/g, " ").replace(/×/g, "x");
    // number words -> digits
    t = t.replace(/[a-z؀-ۿ]+/gi, w => (NUMW[w.toLowerCase()] !== undefined ? String(NUMW[w.toLowerCase()]) : w));
    // "a / an" before equipment words means 1
    t = t.replace(/\b(a|an)\s+(?=(new|reused?|existing|old|radio|rru|air|antenna|dish|rau|odu|idu|baseband|bb|mmu|cabinet|rbs)\b)/gi, "1 ");
    // compact notation from LLDs / BoQs: "3x4486B8B20B28", "4*44xxB1B3", "AIR6419B42", "BB5212(3G)", "4451HP B1B3", "Base band 6630"
    t = t.replace(/\bbase\s+band\b/gi, "baseband").replace(/\b(\d{1,3})\s*[x*]\s*(?=[A-Za-z0-9])/gi, "$1x ")
      .replace(/\b(AIR|BB|RP)(?=\d)/gi, "$1 ").replace(/\b(\d{4}|\d{2}xx|\d{3}x)(HP)?(?=[BN]\d)/gi, "$1$2 ");
    t = t.replace(/\(([^)]*)\)/g, (m, c) => " (" + c.replace(/[+,&]|\band\b/gi, "/") + ")");
    for (let i = 0; i < 3; i++) t = t.replace(/\b([2-5]g)\s*(?:and|\+|&|\/|,)\s*([2-5]g)\b/gi, "$1/$2");
    return t.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
  }

  // ---------- settings ----------
  const COUNTRIES = ["Lebanon", "Egypt", "Saudi Arabia", "KSA", "United Arab Emirates", "UAE", "Jordan", "Oman", "Qatar", "Kuwait", "Bahrain", "Iraq", "Palestine",
    "Türkiye", "Turkey", "South Africa", "Angola", "Zambia", "Kenya", "Nigeria", "Morocco", "Djibouti", "Libya", "Tanzania", "Ethiopia", "Sudan", "Yemen"];
  const CNORM = { KSA: "Saudi Arabia", UAE: "United Arab Emirates", Turkey: "Türkiye" };
  function time(h, m, ap) {
    h = +h; m = +(m || 0); ap = (ap || "").toLowerCase().replace(/\./g, "");
    if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0;
    if (h > 23 || m > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const TM = "(\\d{1,2})(?:[:.](\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)?";
  function settingsOf(t) {
    const s = {}, L = t.toLowerCase(), got = [];
    let m;
    if ((m = L.match(/(\d+)\s*(?:x\s*)?(?:(?:mw|microwave|rbs|ran|radio|existing|new|cell)\s*)*(sites?|links?|hops?|nodes?)\b/))) { s.sites = +m[1]; got.push(`${m[1]} ${/link|hop/.test(m[2]) ? "links" : "sites"}`); }
    if ((m = L.match(/(\d)\s*[- ]?days?\b/)) || (m = L.match(/\bdays?\s*[:=]?\s*(\d)\b/))) { s.days = +m[1]; }
    if (/\b(1|one|single)[- ]day\b/.test(L)) s.days = 1;
    if (/\bno outage\b|without outage|zero outage/.test(L)) { s.outageDay = 0; got.push("no outage"); }
    else if ((m = L.match(/(?:outage|cutover|cut[- ]over|migration)\s*(?:is\s*|will be\s*)?(?:on\s*)?day\s*(\d)/)) || (m = L.match(/day\s*(\d)\s*(?:is\s*)?(?:the\s*)?(?:outage|cutover|migration)/))) { s.outageDay = +m[1]; got.push(`outage on day ${m[1]}`); }
    if ((m = L.match(new RegExp("(?:outage|cutover|window|migration)[^.\\n]{0,30}?(?:at|from|starts?|starting|start at)\\s*" + TM)))) { const v = time(m[1], m[2], m[3]); if (v) { s.outStart = v; got.push(`outage starts ${v}`); } }
    else if (/outage[^.\n]{0,25}midnight|midnight[^.\n]{0,15}outage/.test(L)) { s.outStart = "00:00"; got.push("outage starts 00:00"); }
    if ((m = L.match(/(?:max(?:imum)?|up to|allowed|approved|window(?: of)?)\s*(?:outage\s*(?:of\s*)?)?(\d+(?:\.\d+)?)\s*(h|hrs?|hours?|min|minutes?)\b/)) ||
        (m = L.match(/outage\s*(?:of|is|for|=)?\s*(\d+(?:\.\d+)?)\s*(h|hrs?|hours?|min|minutes?)\b/)) ||
        (m = L.match(/(\d+(?:\.\d+)?)\s*(h|hrs?|hours?|min|minutes?)\s*(?:of\s*)?outage/)) ||
        (/outage|cutover/.test(L) && (m = L.match(/(?:for|lasting|duration(?: of)?)\s*(\d+(?:\.\d+)?)\s*(h|hrs?|hours?|min|minutes?)\b/)))) {
      const v = /^min/.test(m[2]) ? +m[1] / 60 : +m[1]; if (v > 0 && v <= 12) { s.outMax = Math.round(v * 2) / 2 || 0.5; got.push(`max outage ${s.outMax} h`); } }
    if ((m = L.match(/(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)\s*(?:per|a|\/|each)\s*day/)) || (m = L.match(/(?:work(?:ing)?|max(?:imum)?)\s*(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)\s*(?:a|per)?\s*day/))) { const v = +m[1]; if (v >= 4 && v <= 16) { s.maxHours = v; got.push(`${v} h per day`); } }
    if ((m = L.match(new RegExp("(?:arrive|arrival|on site|start(?:ing)? work|team starts?|day starts?)\\s*(?:at|by|from)?\\s*" + TM)))) { const v = time(m[1], m[2], m[3]); if (v) { s.arrive = v; got.push(`team on site ${v}`); } }
    if ((m = L.match(/(\d+)\s*teams?\b/))) { s.teams = +m[1]; got.push(`${m[1]} teams`); }
    if ((m = L.match(/(\d)\s*sectors?\b/))) { s.sectors = +m[1]; got.push(`${m[1]} sectors`); }
    if ((m = L.match(/(\d+)\s*(?:old|legacy|existing)\s*(?:rrus?|rru|radios?)\b/)) || (m = L.match(/dismantle\s*(\d+)\s*(?:old\s*)?(?:rrus?|radios?)/))) { s.legacyRRU = +m[1]; got.push(`dismantle ${m[1]} old RRUs`); }
    if ((m = L.match(/(\d{2,3})\s*(?:m|meters?|metres?)\s*(?:high\s*)?(monopole|lattice|tower|rooftop|guyed|flagpole)?/)) && (m[2] || /tower|height/.test(L))) { s.towerHeight = +m[1]; got.push(`${m[1]} m tower`); }
    const tt = L.match(/\b(monopole|lattice|rooftop|guyed mast|flagpole)\b/); if (tt) s.towerType = tt[1].replace(/\b\w/g, c => c.toUpperCase());
    if ((m = t.match(/\bproject\s*(?:name\s*)?(?:is|called|named|:)?\s*([A-Za-z0-9][^,.;\n]{2,48})/i))) s.name = m[1].trim();
    for (const c of COUNTRIES) if (new RegExp("\\b" + c + "\\b", "i").test(t)) { s.country = CNORM[c] || c; got.push(s.country); break; }
    if ((m = L.match(/\b(?:customer|operator|client)\s*(?:is|:)?\s*([a-z0-9][a-z0-9 &-]{1,30}?)(?=[,.;\n]|$| and )/))) s.customer = m[1].trim().replace(/\b\w/g, c => c.toUpperCase());
    if (/space diversity|\bsd\b|\b1\+1\s*sd/.test(L)) { s.sd = true; got.push("space diversity"); }
    if (/reuse (?:the )?(?:existing )?cabl|keep (?:the )?(?:old )?cabl|existing cabl/.test(L)) { s.reuseCabling = true; got.push("reuse cabling"); }
    // scenarios
    const ran = /new site|greenfield|new build|\bnsb\b/.test(L) ? "nsb" : /\b(5g|air)\s*(only|add[- ]?only)\b|add(?:ing)?\s*(?:\d+\s*)?(?:5g|air)\b(?!.*swap)/.test(L) && !/radio|rru/.test(L) ? "g5"
      : /expansion|expand|add(?:ing)?\s*(?:\d+\s*)?(?:new\s*)?radios?|add(?:ing)? (?:a )?(?:radio|carrier|band)/.test(L) && !/swap|moderni/.test(L) ? "exp"
      : /swap|moderni[sz]|replace|upgrade/.test(L) ? "swap" : null;
    if (ran) s.ranScenario = ran;
    const trm = /dismantl|decommission/.test(L) && !/swap|new link|upgrade/.test(L) ? "dism"
      : /hot[- ]?swap|both ends|2 teams? (?:at|on) both/.test(L) ? "hot"
      : /outdoor (?:swap|upgrade)[^.\n]*(?:2|two) teams|(?:2|two) teams?[^.\n]*outdoor/.test(L) ? "out2"
      : /1\s*\+\s*0[^.\n]{0,20}2\s*\+\s*0|upgrade to 2\s*\+\s*0|\b2\+0\b/.test(L) ? "upg"
      : /\b(idu|npu|indoor)\s*(swap|only|replacement|change)/.test(L) ? "idu"
      : /\b(radio|rau|odu)\s*(swap|replacement|change)\s*only|only\s*(radio|rau|odu)/.test(L) ? "radswap"
      : /new (mw )?(link|hop)s?/.test(L) ? "new"
      : /swap|moderni[sz]|replace/.test(L) ? "normal" : null;
    if (trm) s.trmMethod = trm;
    return { s, got };
  }

  // ---------- equipment ----------
  const BANDS = "(?:\\s*\\(?\\s*(?:b|n)\\d{1,3}(?:\\s*[\\/+]?\\s*(?:b|n)?\\d{1,3})*[a-z]{0,2}\\s*\\)?)?";
  const RADIO_NUM = /\b(2203|2205|2208|2212|2217|2219|2238|2242|2260|2279|4402|4407|4408|4412|4415|4418|4422|4427|4443|4449|4455|4466|4471|4478|4480|4485|4486|4488|4489|4490|4494|4499|6626|6646|6672|8808|8843|8863|8823)\b/;
  const AIR_MIN = { "6419": 60, "6449": 60, "6488": 60, "6428": 55, "3219": 45, "3239": 45, "3246": 45, "3255": 40, "3268": 40, "3227": 45, "1281": 45, "1641": 45 };
  const RAD_MIN = { "6646": 40, "6626": 35, "4486": 20, "4490": 20, "2219": 15, "4415": 15 };
  const DISH_MIN = d => d <= 0.3 ? 40 : d <= 0.6 ? 45 : d <= 0.9 ? 60 : d <= 1.2 ? 75 : d <= 1.8 ? 120 : 150;
  function bandsOf(seg) {
    const m = seg.match(/\b((?:b|n)\d{1,3}(?:\s*[\/+]?\s*(?:b|n)?\d{1,3})*(?:aa|a)?)\b/i);
    return m ? m[1].replace(/\s+/g, "").toUpperCase() : "";
  }
  // quantity = the number written just before the equipment word ("3x new radio", "add 3 radio"), or "x3" / "3 pcs" after it
  function qtyAt(seg, idx) {
    const pre = seg.slice(0, Math.max(0, idx));
    let m = pre.match(/(\d{1,3})\s*(?:x|pcs?|pieces?|units?|nos?\.?)?\s*(?:of\s*)?(?:(?:new|reused?|existing|old|legacy|mw|microwave|\d(?:\.\d+)?\s*m)\s*)*(?:x\s*)?$/i);
    if (m) return Math.max(1, +m[1]);
    const post = seg.slice(idx);
    m = post.match(/\bx\s*(\d{1,2})\b|\b(\d{1,2})\s*(?:x|pcs?|pieces?|units?)\b|^\S+(?:\s+\S+)?\s+(\d{1,2})\s*$/i);
    return m ? Math.max(1, +(m[1] || m[2] || m[3])) : 1;
  }
  const LOWSET = new Set([5, 8, 12, 13, 14, 17, 20, 26, 28, 29, 71]), MIDSET = new Set([1, 2, 3, 4, 7, 25, 30, 34, 38, 39, 40, 41, 66]);
  const MODEL_ROLE = { "4486": "Low band", "6646": "Low band", "4490": "Mid band" };
  function radioRole(bands, n) {
    const nums = [...String(bands || "").matchAll(/(?:B|N)?(\d{1,3})/gi)].map(x => +x[1]);
    if (nums.length) { const lo = nums.every(x => LOWSET.has(x)), mi = nums.every(x => MIDSET.has(x)); return lo ? "Low band" : mi ? "Mid band" : "Multi band"; }
    return MODEL_ROLE[n] || "Radio";
  }
  const statusOf = seg => /\b(reuse[ds]?|existing|old|keep|kept|legacy|current)\b/i.test(seg) ? "Reused" : "New";
  const techOf = seg => { const L = seg.toLowerCase(); const t = [];
    const pm = seg.match(/\(\s*([GWL](?:[GWL0-9]|-?[FT]DD|-)*)\s*\)/i);
    if (pm && !/[2-5]g/i.test(pm[1])) { const x = pm[1].toUpperCase(); if (/G/.test(x.replace(/DD/g, ""))) t.push("2G"); if (/W/.test(x)) t.push("3G"); if (/L/.test(x)) t.push("4G"); return t.join("+"); } ["2g", "3g", "4g", "5g"].forEach(g => { if (L.includes(g)) t.push(g.toUpperCase()); }); if (/\blte\b/.test(L) && !t.includes("4G")) t.push("4G"); if (/\bnr\b/.test(L) && !t.includes("5G")) t.push("5G"); if (/\b(umts|wcdma)\b/.test(L)) t.push("3G"); if (/\bgsm\b/.test(L)) t.push("2G"); return t.join("+"); };

  function itemsOf(t) {
    const segs = t.split(/\n|;|,|\+|\band\b|\bplus\b|\bthen\b|\balso\b|&|\.(?!\d)/i).map(x => x.trim()).filter(Boolean);
    const out = [];
    for (const seg of segs) {
      const L = seg.toLowerCase(), st = statusOf(seg);
      let m, kw = null;
      const Q = re => { const i = L.search(re); return qtyAt(seg, i < 0 ? 0 : i); };
      if (/\b(dismantle|remove)\b/.test(L) && /\b(rrus?|old radios?)\b/.test(L)) continue; // legacy RRU count handled in settings
      // ---- TRM ----
      if ((m = L.match(/\b(mmu\s*\d?\w?)\b/))) { out.push({ dom: "TRM", cat: "idu", role: "IDU", model: m[1].toUpperCase().replace(/\s+/, " ").replace(/^MMU$/, "MMU 3"), qty: Q(/\bmmu/), min: 15, status: st, seg }); continue; }
      if ((m = L.match(/\bml\s*-?\s*(66\d\d|669\d)\b/)) || (/\b(idu|npu|indoor unit)\b/.test(L) && !/\bbaseband|bb\d/.test(L))) {
        const n = m ? m[1] : (L.match(/\b(66\d\d|669\d)\b/) || [])[1]; out.push({ dom: "TRM", cat: "idu", role: "IDU", model: n ? `ML ${n} IDU` : (/\bnpu\b/.test(L) ? "NPU 3" : "ML 6691 IDU"), qty: Q(/\b(ml\s*-?\s*66|ml\s*-?\s*669|idu|npu|indoor)/), min: 30, status: st, seg }); continue; }
      if ((m = L.match(/\b(?:ml|mini[- ]?link|minilink)\s*-?\s*(63\d\d)\b/))) { out.push({ dom: "TRM", cat: "rad", role: "Radio", model: `ML ${m[1]}`, qty: Q(/\b(ml|mini[- ]?link|minilink)\s*-?\s*63/), min: 30, status: st, seg }); continue; }
      if ((m = L.match(/\b(rau|odu)\s*-?\s*(\d{1,4})?\b/))) { out.push({ dom: "TRM", cat: "rad", role: "Radio", model: m[2] && m[2].length >= 3 ? `RAU ${m[2]}` : "RAU 6363", qty: Q(/\b(rau|odu)/), min: 15, status: st, seg }); continue; }
      if (/\b(dish|parabolic|hpx|mw antenna|microwave antenna|vhlp)\b/.test(L) || (/\bantenna\b/.test(L) && /(\d(?:\.\d)?)\s*m\b/.test(L))) {
        const d = +((L.match(/(\d(?:\.\d+)?)\s*m\b/) || [])[1] || 0.6); const sd = /\b(sd|diversity)\b/.test(L);
        out.push({ dom: "TRM", cat: "ant", role: sd ? "Antenna SD" : "Antenna", model: `Antenna ${d}m HPX`, qty: Q(/\b(\d(?:\.\d+)?\s*m\s+)?(?:(?:hpx|mw|microwave|sd|new)\s+)*(dish|parabolic|hpx|antenna|vhlp)/), min: DISH_MIN(d), status: st, seg }); continue; }
      // ---- RAN ----
      if ((m = L.match(/\b(?:baseband|bb)\s*-?\s*(\d{4}|\d{3}x)\b/)) || (m = L.match(/\b(rp|ru)\s*-?\s*(6\d{3})\b/)) || (m = L.match(/\b(5212|5216|6620|6630|6631|6641|6648|6651|6655|6672)\b/)) || /\bbaseband\b/.test(L)) {
        let model = "Baseband";
        if (m && m[2]) model = `RP${m[2]}`; else if (m) model = (/^66/.test(m[1]) && /\brp\b/.test(L)) || /^6655|^6651|^6672/.test(m[1]) ? `RP${m[1]}` : `BB${m[1]}`;
        out.push({ dom: "RAN", cat: "bb", model, qty: Q(/\b(baseband|bb\s*-?\s*\d|rp\s*-?\s*6|ru\s*-?\s*6|ran processor|processor|5212|5216|66[2-7]\d)/), status: st, tech: techOf(seg) || (st === "New" ? "4G+5G" : "3G"), seg }); continue; }
      if ((m = L.match(/\b(rbs|cabinet|enclosure)\s*-?\s*(\d{4})?\b/))) { out.push({ dom: "RAN", cat: "rbs", model: m[2] ? `${m[1] === "enclosure" ? "Enclosure" : "RBS"} ${m[2]}` : (m[1] === "enclosure" ? "Enclosure 6150" : "RBS 6102"), qty: Q(/\b(rbs|cabinet|enclosure)/), min: 90, status: st, seg }); continue; }
      if ((m = L.match(/\b(?:air|aas|mmimo|massive mimo)\s*-?\s*(\d{4})?\b/)) || /\b5g (unit|antenna|radio)\b/.test(L)) {
        const n = m && m[1] ? m[1] : "3219", b = bandsOf(seg.replace(/\([^)]*\)/g, "")) || (n === "3255" ? "B78AA" : "B42");
        out.push({ dom: "RAN", cat: "air", role: "5G AIR", model: `AIR ${n} ${b}`.trim(), qty: Q(/\b(air|aas|mmimo|massive|5g)/), min: AIR_MIN[n] || 45, status: st, seg }); continue; }
      if ((m = L.match(/\b(?:radio|rru|rrus|radio unit)\s*-?\s*(\d{4}|\d{2}xx)(hp)?\b/)) || (m = L.match(/\b(\d{4}|\d{2}xx)(hp)?\s+(?=[bn]\d)/)) || (m = L.match(RADIO_NUM)) || /\b(radio|rrus?)\b/.test(L)) {
        const n = m ? m[1] : "", hp = m && m[2] ? "HP" : "", b = bandsOf(seg.replace(/\([^)]*\)/g, ""));
        out.push({ dom: "RAN", cat: "rad", role: radioRole(b, n), model: n ? `Radio ${n}${hp}${b ? " " + b : ""}` : "Radio", qty: Q(/\b(radio|rrus?|\d{4}|\d{2}xx)/), min: RAD_MIN[n] || 20, status: st, seg }); continue; }
      if (/\bantenna|sector\b/.test(L)) { out.push({ dom: "RAN", cat: "ant", role: "Antenna", model: "Sector antenna", qty: Q(/\b(antenna|sector)/), min: 45, status: st, seg, warn: "Passive antenna – added as a generic unit (install + cabling time)" }); continue; }
      if (/\b[a-z]{2,}\s*-?\d{3,4}\b/i.test(L)) out.push({ dom: null, cat: "unknown", model: seg, qty: 1, status: st, seg, warn: "Not recognised – ignored" });
    }
    return out;
  }

  function understand(raw) {
    const t = clean(raw), { s, got } = settingsOf(t), items = itemsOf(t);
    const doms = new Set(items.filter(i => i.dom && i.status === "New" || i.cat === "bb").map(i => i.dom).filter(Boolean));
    items.filter(i => i.dom).forEach(i => doms.add(i.dom));
    if (!doms.size) { if (s.trmMethod && !s.ranScenario) doms.add("TRM"); else if (/\b(mw|microwave|links?|hops?)\b/i.test(t)) doms.add("TRM"); else if (s.ranScenario || /\bsites?\b/i.test(t)) doms.add("RAN"); }
    return { text: t, settings: s, got, items, domains: [...doms] };
  }

  // ---------- build setups for the MOP engine ----------
  // groups: [{ name, sites, items }] – one site type per group (from an uploaded file); without groups: one type from the text
  function buildStates(u, M, ov, groups) {
    ov = ov || {}; const out = {}, s = Object.assign({}, u.settings, ov);
    const iso = d => d.toISOString().slice(0, 10);
    const single = !(groups && groups.length);
    if (single) groups = [{ name: null, sites: s.sites || 1, items: u.items }];
    const base = (st) => {
      const P = st.project;
      ["name", "country", "customer", "outStart", "outMax", "maxHours", "arrive", "teams", "sectors"].forEach(k => { if (s[k] !== undefined && s[k] !== "") P[k] = s[k]; });
      P.startDate = iso(new Date()); P.regions = ""; st.siteList = "";
      if (!s.name) P.name = st.domain === "TRM" ? "Auto MW link MOP" : "Auto site MOP";
      if (!s.country) P.country = "";
      return st;
    };
    const uniq = (types) => { const used = new Set(); types.forEach(t => { let n = t.name, k = 2; while (used.has(n.toLowerCase())) n = `${t.name} (${k++})`; used.add(n.toLowerCase()); t.name = n; }); return types; };
    const EDITS = () => ({ rm: {}, mv: {}, dur: {}, afterOf: {}, add: [] });
    const eqLib = types => { const m = new Map(); types.forEach(t => (t.units || []).forEach(x => { if (!m.has(x.model)) m.set(x.model, { model: x.model, kind: /AIR/.test(x.role || "") ? "air" : "radio", min: x.min }); })); return [...m.values()]; };

    const ranGroups = groups.map(g => ({ g, its: g.items.filter(i => i.dom === "RAN") })).filter(x => x.its.length || (single && u.domains.includes("RAN")));
    if (ranGroups.length) {
      const st = base(M.normalize(M.DEFAULT_STATE())), P = st.project;
      P.legacyRRU = s.legacyRRU !== undefined ? s.legacyRRU : 0;
      const types = ranGroups.map(({ g, its }) => {
        const units = its.filter(i => ["rad", "air", "ant"].includes(i.cat) && i.status === "New").map(i => ({ role: i.role, model: i.model, qty: i.qty, min: i.min }));
        const basebands = its.filter(i => i.cat === "bb").map(i => ({ model: i.model, status: i.status, tech: i.tech, qty: i.qty }));
        const rbs = its.filter(i => i.cat === "rbs" && i.status === "New").map(i => ({ type: i.model, qty: i.qty, min: i.min }));
        const sc = s.ranScenario || (basebands.some(b => b.status === "Reused") || P.legacyRRU ? "swap" : units.length && units.every(x => /AIR/.test(x.role)) ? "g5" : "swap");
        const SC = M.RAN_SCEN[sc];
        const days = s.days && SC.days.includes(+s.days) ? +s.days : SC.def;
        let od = s.outageDay !== undefined ? s.outageDay : (sc === "g5" || sc === "nsb" ? 0 : sc === "exp" ? days : Math.min(2, days));
        if (sc === "exp" && od === 0) od = days;
        if (sc === "swap" && od === 0) od = Math.min(2, days);
        const label = ({ swap: "Swap", exp: "Expansion", g5: "5G AIR add", nsb: "New site" })[sc];
        return { name: g.name || `Auto – ${label}`, sites: Math.max(1, +g.sites || 1), scenario: sc, days, outageDay: od,
          towerType: s.towerType || "Monopole", towerHeight: s.towerHeight || 30, reuseCabling: !!s.reuseCabling, rbs, basebands, units, gsmAnts: [], edits: EDITS() };
      });
      st.types = uniq(types); st.equipment = eqLib(st.types);
      P.outageDay = st.types[0].outageDay || 2; P.daysPerSite = st.types[0].days;
      out.RAN = M.normalize(st);
    }
    const trmGroups = groups.map(g => ({ g, its: g.items.filter(i => i.dom === "TRM") })).filter(x => x.its.length || (single && u.domains.includes("TRM")));
    if (trmGroups.length) {
      const st = base(M.normalize(M.DEFAULT_TRM()));
      const types = trmGroups.map(({ g, its }) => {
        const units = its.filter(i => i.status === "New").map(i => ({ role: i.role, model: i.model, qty: i.qty, min: i.min }));
        const cats = new Set(its.filter(i => i.status === "New").map(i => i.cat));
        const meth = s.trmMethod || (cats.size === 1 && cats.has("idu") ? "idu" : cats.size === 1 && cats.has("rad") && its.some(i => i.cat === "ant" && i.status === "Reused") ? "radswap" : "normal");
        const MD = M.TRM_METHODS[meth];
        const days = Math.min(MD.days, Math.max(MD.minDays, +s.days || MD.days));
        let od = s.outageDay !== undefined ? s.outageDay : M.trmNatOutageDay(meth, days);
        if (["new", "dism"].includes(meth)) od = 0; else if (od > days) od = days;
        return { name: g.name || `Auto – ${MD.label.replace(/\s*\(.*\)/, "")}`, sites: Math.max(1, +g.sites || 1), method: meth, days, outageDay: od, compact: false,
          sd: !!s.sd || units.some(x => /SD/.test(x.role)), reuseCabling: !!s.reuseCabling, units, edits: EDITS() };
      });
      st.types = uniq(types); st.equipment = eqLib(st.types);
      out.TRM = M.normalize(st);
    }
    return out;
  }

  const api = { clean, understand, buildStates, settingsOf, itemsOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.AutoParse = api;
})(typeof window !== "undefined" ? window : globalThis);
