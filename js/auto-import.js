/* Auto MOP – file import.
   Reads Excel (.xlsx), Word (.docx) and PDF files in the browser (nothing is uploaded anywhere),
   finds the site configurations in them and returns one config per row / model:
     { name, sites, text, sitesKnown, qtyEstimated }
   "text" is an equipment string the Auto parser already understands ("3x New Radio 4486 B8B20B28 + ...").
   Works in the browser (window.AutoImport) and in node (module.exports) for testing. */
(function (root) {
  const RADIOISH = /\b(radio|rru|air|aas|m-?mimo)\b|\b\d{4}\s*(hp)?\s*[bn]\d|\b\d{2}xx\s*[bn]\d|\bair\s*\d{4}|\b(rau|odu)\b|\bml\s*-?\s*6\d{3}|\bdish\b/i;
  const EQ = new RegExp(RADIOISH.source + "|\\b(bb|rp)\\s*-?\\s*\\d|\\bbaseband\\b|\\bprocessor\\s*\\d{4}", "i");
  const spaced = s => String(s || "").replace(/(\d)\s*[x*]\s*(?=[A-Za-z0-9])/gi, "$1x ").replace(/\b(AIR|BB|RP)(?=\d)/gi, "$1 ").replace(/\b(\d{4}|\d{2}xx|\d{3}x)(HP)?(?=[BN]\d)/gi, "$1$2 ");
  const cleanCell = s => String(s == null ? "" : s).replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();

  // ---------------- readers ----------------
  async function inflateRaw(u8) {
    const ds = new DecompressionStream("deflate-raw");
    const out = new Response(new Blob([u8]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }
  async function unzip(buf, want) { // minimal zip reader: central directory -> wanted entries
    const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), files = {};
    let eocd = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("Not a valid Office file (zip)");
    let p = dv.getUint32(eocd + 16, true); const n = dv.getUint16(eocd + 10, true), td = new TextDecoder();
    for (let k = 0; k < n; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loff = dv.getUint32(p + 42, true);
      const name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
      if (want(name)) {
        const lnl = dv.getUint16(loff + 26, true), lxl = dv.getUint16(loff + 28, true), start = loff + 30 + lnl + lxl, data = u8.subarray(start, start + csize);
        files[name] = method === 0 ? data : await inflateRaw(data);
      }
      p += 46 + nlen + xlen + clen;
    }
    return files;
  }
  const xmlText = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/&amp;/g, "&");
  async function readDocx(buf) {
    const f = await unzip(buf, n => n === "word/document.xml");
    if (!f["word/document.xml"]) throw new Error("No document text found in this Word file");
    const xml = new TextDecoder().decode(f["word/document.xml"]);
    const tables = [], paras = [];
    const stack = []; let para = null, cell = null, row = null;
    const re = /<w:(tbl|tr|tc|p)\b[^>]*?(\/?)>|<\/w:(tbl|tr|tc|p)>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>/g;
    let m;
    while ((m = re.exec(xml))) {
      if (m[1]) {
        if (m[2]) { if (m[1] === "p") paras.push(""); continue; }
        if (m[1] === "tbl") stack.push({ rows: [] });
        else if (m[1] === "tr") { row = []; stack[stack.length - 1] && (stack[stack.length - 1].row = row); }
        else if (m[1] === "tc") { cell = []; }
        else if (m[1] === "p") para = "";
      } else if (m[3]) {
        const t = stack[stack.length - 1];
        if (m[3] === "p") { if (para != null) { if (cell && t) cell.push(para); else paras.push(para); } para = null; }
        else if (m[3] === "tc") { if (t && t.row) t.row.push(cleanCell((cell || []).join(" "))); cell = null; }
        else if (m[3] === "tr") { if (t && t.row) t.rows.push(t.row); if (t) t.row = null; }
        else if (m[3] === "tbl") { const done = stack.pop(); if (done && done.rows.length) tables.push({ name: `Table ${tables.length + 1}`, rows: done.rows }); }
      } else if (m[4] != null) { if (para != null) para += xmlText(m[4]); }
      else if (m[5]) { if (para != null) para += " "; }
    }
    return { tables, lines: paras.map(cleanCell).filter(Boolean) };
  }
  function cellText(v) {
    if (v == null) return "";
    if (typeof v !== "object") return String(v);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v.richText) return v.richText.map(r => r.text).join("");
    if (v.text != null) return typeof v.text === "string" ? v.text : cellText(v.text);
    if (v.result != null) return cellText(v.result);
    if (v.error) return "";
    return "";
  }
  async function readXlsx(buf, ExcelJS) {
    if (!ExcelJS) throw new Error("Excel reader not loaded");
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    const tables = [];
    wb.eachSheet(ws => {
      const rows = [];
      ws.eachRow({ includeEmpty: false }, r => { const vals = []; for (let c = 1; c <= Math.min(r.cellCount, 160); c++) vals.push(cleanCell(cellText(r.getCell(c).value))); rows.push(vals); });
      if (rows.length) tables.push({ name: ws.name, rows });
    });
    return { tables, lines: [] };
  }
  async function readPdf(buf, pdfjsLib) {
    if (!pdfjsLib) throw new Error("PDF reader not loaded");
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise, lines = [];
    for (let p = 1; p <= Math.min(doc.numPages, 120); p++) {
      const tc = await (await doc.getPage(p)).getTextContent(), byY = new Map();
      tc.items.forEach(it => { if (!it.str || !it.str.trim()) return; const y = Math.round(it.transform[5] / 3) * 3; if (!byY.has(y)) byY.set(y, []); byY.get(y).push(it); });
      [...byY.entries()].sort((a, b) => b[0] - a[0]).forEach(([, its]) => {
        its.sort((a, b) => a.transform[4] - b.transform[4]);
        let s = "", lastEnd = null;
        its.forEach(it => { const x = it.transform[4]; if (lastEnd != null && x - lastEnd > 1.5) s += " "; s += it.str; lastEnd = x + (it.width || 0); });
        lines.push(cleanCell(s));
      });
      // also keep each text item on its own (long "MODEL-1: ..." titles are often one item)
      tc.items.forEach(it => { const s = cleanCell(it.str); if (/^\s*(model|config)/i.test(s)) lines.push(s); });
    }
    return { tables: [], lines: lines.filter(Boolean) };
  }
  async function readFile(name, buf, libs) {
    const ext = (name.split(".").pop() || "").toLowerCase();
    let d;
    if (ext === "xlsx" || ext === "xlsm") d = await readXlsx(buf, libs.ExcelJS);
    else if (ext === "docx" || ext === "docm") d = await readDocx(buf);
    else if (ext === "pdf") d = await readPdf(buf, libs.pdfjsLib);
    else if (ext === "txt" || ext === "csv") { const t = new TextDecoder().decode(buf); d = { tables: ext === "csv" ? [{ name, rows: t.split(/\r?\n/).map(l => l.split(/[,;\t]/).map(cleanCell)) }] : [], lines: t.split(/\r?\n/).map(cleanCell).filter(Boolean) }; }
    else if (ext === "xls" || ext === "doc" || ext === "ppt") throw new Error(`Old .${ext} format – please save it as .${ext}x and upload again`);
    else throw new Error("Unsupported file type – use Excel (.xlsx), Word (.docx) or PDF");
    d.name = name; d.kind = ext; return d;
  }

  // ---------------- finding configs ----------------
  const shortName = (s, i) => { s = cleanCell(s); return s && s.length <= 30 && !/^\d+$/.test(s) ? s : `Config ${i}`; };
  const num = s => { const m = String(s || "").replace(/,/g, "").match(/^\s*(\d+(?:\.\d+)?)/); return m ? +m[1] : NaN; };

  // 1) BoQ tree: "Level Index | Name | Product Number | ... | Quantity"
  function fromBoq(tables) {
    for (const t of tables) {
      const hi = t.rows.slice(0, 15).findIndex(r => r.some(c => /level/i.test(c)) && r.some(c => /quantity|qty/i.test(c)) && r.some(c => /^name$|description/i.test(c)));
      if (hi < 0) continue;
      const H = t.rows[hi], cL = H.findIndex(c => /level/i.test(c)), cN = H.findIndex(c => /^name$/i.test(c)) >= 0 ? H.findIndex(c => /^name$/i.test(c)) : H.findIndex(c => /description/i.test(c)), cQ = H.findIndex(c => /accumulated quantity|quantity|qty/i.test(c));
      const cP = H.findIndex(c => /product\s*(number|no)|part\s*(number|no)|item\s*code/i.test(c));
      const out = []; let cur = null, takenDepth = 99;
      for (const r of t.rows.slice(hi + 1)) {
        const lvl = r[cL] || "", name = r[cN] || "", q = num(r[cQ]); if (!lvl || !name) continue;
        const depth = lvl.split(".").length;
        if (depth > takenDepth) continue; else takenDepth = 99; // parts inside an item we already took
        if (/^(config(uration)?|model|scenario|site type|type)\b/i.test(name) && q > 0) { cur = { name: shortName(name.split(":")[0], out.length + 1), full: name, sites: q, depth, items: new Map() }; out.push(cur); continue; }
        if (!cur || depth <= cur.depth) { if (cur && depth <= cur.depth) cur = null; continue; }
        if (/;|^sm\b|cable|kit|licen|hwac|hup|\bsw\b|software|price|delivery|install|service|bracket|sfp|power|channel|output|carrier|package/i.test(name)) continue;
        if (!/^(radio|air|ran processor|baseband|rp\s*\d|bb\s*\d|rbs|enclosure|mini-?link|ml\s*6|rau|antenna|kre)/i.test(name)) continue;
        if (/^(antenna|kre)/i.test(name)) continue; // passive antennas: not an install step in the engine
        if (cP >= 0 && !r[cP]) continue; // group heading, not a product
        if (!(q > 0)) continue;
        takenDepth = depth;
        if (!cur.items.has(name)) cur.items.set(name, Math.max(1, Math.round(q / cur.sites)));
      }
      const cf = out.filter(c => c.items.size).map(c => ({ name: c.name, sites: c.sites, text: [...c.items].map(([n, q]) => `${q}x New ${n.replace(/ran processor\s*/i, "RP")}`).join(" + "), sitesKnown: true, src: `${t.name} (BoQ)` }));
      if (cf.length) return cf;
    }
    return [];
  }
  // 2) config tables: a column with the equipment per site + a sites/count column
  function fromTables(tables) {
    const all = [];
    const isCount = c => /^#?\s*(no\.?\s*of\s*)?sites?$|^count$|^#\s*sites|site\s*count|^qty$|^quantity$|^no\.? of sites/.test(c);
    const isRad = c => /(radio|hw|hardware|equipment|rbs)\s*(config|configuration|solution)|config(uration)?\s*\/\s*site|^radio(s)?$|radio.*per site/.test(c);
    for (const t of tables) {
      const lim = Math.min(15, t.rows.length), low = t.rows.slice(0, lim).map(r => r.map(c => c.toLowerCase()));
      const order = [...Array(lim).keys()].sort((a, b) => (low[b].some(isRad) && low[b].some(isCount)) - (low[a].some(isRad) && low[a].some(isCount)));
      for (const hi of order) {
        const H = low[hi];
        const cR = H.findIndex(isRad);
        if (cR < 0) continue;
        const cB = H.findIndex((c, i) => i !== cR && /(bb|baseband|ran compute)\s*(config|configuration)|^bb$|^baseband/.test(c));
        const cC = H.findIndex(isCount);
        let cName = H.findIndex((c, i) => i !== cR && i !== cB && /config|model|scenario|^type|name/.test(c)); if (cName < 0) cName = 0;
        const found = [];
        for (const r of t.rows.slice(hi + 1)) {
          const parts = [r[cR], cB >= 0 ? r[cB] : ""].map(cleanCell).filter(s => s && EQ.test(spaced(s)) && /\d\s*[x*]/i.test(s));
          if (!parts.length || !RADIOISH.test(spaced(parts.join(" ")))) continue;
          if (/^(total|sum|grand total)/i.test(r[cName] || "")) continue;
          const s = cC >= 0 ? num(r[cC]) : NaN;
          found.push({ name: shortName(r[cName], all.length + found.length + 1), full: r[cName], sites: s > 0 ? Math.round(s) : 1, text: parts.join(" + "), sitesKnown: s > 0, src: t.name });
        }
        if (found.length) { all.push(...found); break; }
      }
    }
    // the same configs often appear on several sheets – keep each once
    const seen = new Set(); return all.filter(c => { const k = c.sites + "|" + c.text.toLowerCase().replace(/\s+/g, ""); if (seen.has(k)) return false; seen.add(k); return true; })
      .map((c, i) => Object.assign(c, { name: /^Config \d+$/.test(c.name) ? `Config ${i + 1}` : c.name }));
  }
  // 3) LLD-style lines: "MODEL-1: 3x4486B8B20B28 + 3x4451B1B3 + 3xAIR6419B42 & 1xBB5212(3G) + 1xRP6655(4G+5G)"
  function fromModels(lines) {
    const byId = new Map();
    for (const l of lines) {
      const m = l.match(/^\s*((?:model|config(?:uration)?|scenario|option|site type)\s*[- ]?\s*[0-9]+[a-z]?)\s*[:–-]\s*(.+)$/i);
      if (!m || !RADIOISH.test(spaced(m[2])) || !/\d\s*[x*]\s*\w/i.test(m[2])) continue;
      const id = m[1].replace(/\s+/g, "").replace(/^(model|config(?:uration)?|scenario|option|sitetype)-?/i, (x, w) => w[0].toUpperCase() + w.slice(1).toLowerCase() + "-");
      const body = m[2].replace(/\((three|single|multi)[^)]*view\)/ig, "").replace(/\b\d+\s*x\s*KRE[\w/.-]*\s*&?/ig, "").trim();
      const score = (/&/.test(body) ? 2 : 0) + (/\b(bb|rp)\s*-?\s*\d/i.test(body) ? 2 : 0) + body.length / 1000;
      const prev = byId.get(id.toLowerCase());
      if (!prev || score > prev.score) byId.set(id.toLowerCase(), { name: id, sites: 1, text: body.replace(/\s*&\s*/g, " + "), sitesKnown: false, score, src: "model lines" });
    }
    const out = [...byId.values()];
    out.sort((a, b) => (+(a.name.match(/\d+/) || [0])[0]) - (+(b.name.match(/\d+/) || [0])[0]));
    return out.map(({ score, ...c }) => c);
  }
  // 4) scope sentences: "L21 expansion is planned in 60 sites. 92 Radio 4471HP B41 ... has been offered"
  function fromProse(lines) {
    const out = [];
    for (const p of lines) {
      const m = p.match(/([A-Za-z0-9+()_\- ]{2,70}?)\s+(?:layer\s+)?(?:sector\s+)?(expansion|addition|swap|modernization|upgrade)\s+(?:is\s+|are\s+)?planned\s+(?:in|for|on)\s+(?:the\s+following\s+)?(\d+)\s+sites?/i);
      if (!m) continue;
      const sites = +m[3], items = new Map();
      const re = /(?:\b(\d+)\s+)?(?:new\s+)?radio\s+(\d{4}|\d{2}xx)\s*(hp)?\s*\(?\s*((?:[bn]\d{1,3}\s*)+)?\)?/gi; let r;
      while ((r = re.exec(p))) {
        const model = `Radio ${r[2]}${r[3] ? "HP" : ""}${r[4] ? " " + r[4].replace(/\s+/g, "").toUpperCase() : ""}`;
        const per = r[1] && +r[1] > 0 && +r[1] !== sites ? Math.max(1, Math.round(+r[1] / sites)) : 1;
        if (!items.has(model)) items.set(model, per);
      }
      if (!items.size) continue;
      out.push({ name: shortName(`${m[1].trim().replace(/^(scope includes|the|and)\s+/i, "")} ${m[2].toLowerCase()}`, out.length + 1), sites, text: [...items].map(([n, q]) => `${q}x New ${n}`).join(" + "), sitesKnown: true, qtyEstimated: true, src: "scope text" });
    }
    return out;
  }

  function findConfigs(doc) {
    const text = [...doc.lines, ...doc.tables.flatMap(t => t.rows.slice(0, 40).map(r => r.join(" ")))].join("\n");
    const tries = [["BoQ", () => fromBoq(doc.tables)], ["table", () => fromTables(doc.tables)], ["model lines", () => fromModels(doc.lines)], ["scope text", () => fromProse(doc.lines)]];
    for (const [how, fn] of tries) { const c = fn(); if (c.length) return { how, configs: c, text }; }
    return { how: "none", configs: [], text };
  }

  const api = { readFile, readDocx, readXlsx, readPdf, findConfigs, fromBoq, fromTables, fromModels, fromProse, unzip };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.AutoImport = api;
})(typeof window !== "undefined" ? window : globalThis);
