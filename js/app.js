(function(){
const M=window.MOP, $=s=>document.querySelector(s);
const KEY="mop-generator-v2", OLDKEY="mop-generator-state-v1";
let ALL=null; try{ALL=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){ALL=null}
let firstVisit=!ALL||!ALL.mode;
if(!ALL||!ALL.RAN){ let old=null; try{old=JSON.parse(localStorage.getItem(OLDKEY)||"null")}catch(e){} ALL={mode:"RAN",RAN:old&&old.types?old:null,TRM:null}; if(old&&old.types) firstVisit=false; }
ALL.RAN=M.normalize(ALL.RAN&&ALL.RAN.types?ALL.RAN:null); ALL.TRM=M.normalize(ALL.TRM&&ALL.TRM.types?ALL.TRM:M.DEFAULT_TRM());
if(ALL.mode!=="TRM") ALL.mode="RAN";
let S=ALL[ALL.mode];
let sel=0;
const TRMm=()=>S.domain==="TRM";
const W1=()=>TRMm()?"link":"site";
const save=()=>{try{ALL[ALL.mode]=S; localStorage.setItem(KEY,JSON.stringify(ALL))}catch(e){}};
function kindOf(u){ if(TRMm()){const c=M.trmCat(u); return {cls:c, txt:c==="ant"?"Antenna step":c==="idu"?"Indoor / IDU step":"Radio step"}} return M.isAir(u)?{cls:"air",txt:"5G AIR step"}:{cls:"",txt:"Radio step"}; }
function applyMode(){
  document.body.dataset.mode=ALL.mode;
  document.querySelectorAll(".seg button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.mode===ALL.mode)));
  $("#mastSub").textContent=TRMm()?"MOP generator · TRM – MW link installation":"MOP generator · RAN site installation";
  $("#typesTitle").textContent=TRMm()?"Link types & equipment":"Site types & equipment";
  $("#listTitle").textContent=TRMm()?"Link list (optional)":"Site list (optional)";
  document.querySelector(".lbl-id").textContent=TRMm()?"Link ID prefix":"Site ID prefix";
  $("#sites").placeholder=TRMm()?"LNK-001, TRP-101, TRP-205, SC-1 Antenna swap + RAU, Tripoli":"LB-001, Type-1, Beirut\nLB-002, Type-2, Mount Lebanon";
  $("#roles").innerHTML=(TRMm()?["Antenna","Antenna main","Antenna SD","Radio","IDU","MMU"]:["Low band","Mid band","High band","5G AIR","Extra RRU"]).map(v=>`<option value="${v}">`).join("");
}
function switchMode(m){ save(); ALL.mode=m; S=ALL[m]; sel=0; applyMode(); renderInputs(); render(); }
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const COL=i=>"#"+M.COLORS[i%M.COLORS.length];
const toast=m=>{const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove("show"),3200)};

function opts(kind,v){return S.equipment.filter(e=>e.kind===kind).map(e=>`<option ${e.model===v?"selected":""}>${esc(e.model)}</option>`).join("")}
function updCut(){

  const ar=S.types.map(t=>{const r=M.schedule(S,t);const d=r.days.find(x=>x.cut&&!r.noOutage);return d?d.arrive:null}).filter(x=>x!==null);
  $("#cutLbl").firstChild.textContent="Team on site – cutover day";
  $("#cutOut").textContent=ar.length?M.clock(Math.min(...ar))+(Math.min(...ar)!==Math.max(...ar)?" – "+M.clock(Math.max(...ar)):""):"no outage";
  $("#cutLbl small").textContent="auto: just in time for the outage (per site type)"; }
function renderInputs(){
  $("#pname").value=S.project.name;
  document.querySelectorAll("[data-p]").forEach(el=>el.value=S.project[el.dataset.p]);
  document.querySelectorAll("[data-u]").forEach(el=>el.value=S.unit[el.dataset.u]);
  $("#sites").value=S.siteList||""; $("#d0").value=S.d0||"";
  $("#types").innerHTML=S.types.map((t,i)=>`
   <div class="tcard" style="--c:${COL(i)}" data-i="${i}">
    <div class="head"><label class="f">Name<input type="text" data-t="name" value="${esc(t.name)}"></label>
      <label class="f">${TRMm()?"Links":"Sites"}<input type="number" min="0" data-t="sites" value="${t.sites}"></label>
      <button class="x" data-del="${i}" aria-label="Remove ${esc(t.name)}" title="Remove">×</button></div>
    ${!TRMm()?`<div class="opts two"><label class="f">MOP type<select data-t="scenario">${Object.entries(M.RAN_SCEN).map(([k,v])=>`<option value="${k}" ${t.scenario===k?"selected":""}>${esc(v.label)}</option>`).join("")}</select></label>
      <label class="f">Days<select data-t="days" data-num="1">${(M.RAN_SCEN[t.scenario]||M.RAN_SCEN.swap).days.map(d=>`<option value="${d}" ${+t.days===d?"selected":""}>${d} day${d>1?"s":""}</option>`).join("")}</select></label></div>`:""}
    ${TRMm()?`<div class="opts"><label class="f">Swap method<select data-t="method">${Object.entries(M.TRM_METHODS).map(([k,v])=>`<option value="${k}" ${t.method===k?"selected":""}>${esc(v.label)}</option>`).join("")}</select></label>
      ${t.method==="normal"||t.method==="new"?`<label class="chk"><input type="checkbox" data-t="compact" ${t.compact?"checked":""}> Install both ends on Day 1 (small antennas)</label>`:""}
      <label class="chk"><input type="checkbox" data-t="sd" ${t.sd?"checked":""}> Space diversity (SD) – adds Main-Div alignment</label></div>`:""}
    <div class="uh"><span>${TRMm()?"Part · model (per link end)":"Part / band · model"}</span><span>Qty</span><span>Min/unit</span><span></span></div>
    ${(t.units||[]).map((u,k)=>`<div class="un" data-u="${k}">
      <input type="text" list="roles" data-uk="role" value="${esc(u.role)}" aria-label="Part or band" placeholder="e.g. Low band">
      <input type="text" list="models" data-uk="model" value="${esc(u.model)}" aria-label="Model" placeholder="Model">
      <input type="number" min="0" data-uk="qty" value="${u.qty}" aria-label="Quantity">
      <input type="number" min="0" data-uk="min" value="${u.min}" aria-label="Minutes per unit">
      <button class="x" data-udel="${k}" aria-label="Remove part">×</button>
      <i class="kind ${kindOf(u).cls}">${kindOf(u).txt}</i></div>`).join("")}
    <button class="add sm" data-uadd="${i}">${TRMm()?"+ Add part (antenna / radio / IDU)":"+ Add part (radio / RRU / AIR)"}</button>
    <label class="chk"><input type="checkbox" data-t="reuseCabling" ${t.reuseCabling?"checked":""}> Reuse existing cabling (skip cable runs)</label>
   </div>`).join("");
  $("#equip").innerHTML=S.equipment.map((e,i)=>`<div class="eq" data-e="${i}">
    <input type="text" data-k="model" value="${esc(e.model)}" aria-label="Model">
    <select data-k="kind" aria-label="Kind"><option value="radio" ${e.kind==="radio"?"selected":""}>Radio</option><option value="air" ${e.kind==="air"?"selected":""}>AIR</option></select>
    <input type="number" min="0" data-k="min" value="${e.min}" aria-label="Minutes">
    <button class="x" data-edel="${i}" aria-label="Remove model">×</button></div>`).join("");
  $("#rbsList").innerHTML=(S.rbs||[]).map((r,i)=>`<div class="rb" data-r="${i}">
    <input type="text" data-rb="type" value="${esc(r.type)}" aria-label="RBS type" placeholder="e.g. RBS 6150 outdoor">
    <input type="number" min="0" max="9" data-rb="qty" value="${r.qty}" aria-label="Quantity">
    <input type="number" min="0" data-rb="min" value="${r.min}" aria-label="Minutes per unit">
    <button class="x" data-rdel="${i}" aria-label="Remove RBS">×</button></div>`).join("")||'<p class="hint" style="margin:0 0 8px">No new RBS on this project.</p>';
  $("#models").innerHTML=S.equipment.map(e=>`<option value="${esc(e.model)}">`).join("");
  $("#bbs").innerHTML=(S.basebands||[]).map((b,i)=>`<div class="bb" data-b="${i}">
    <input type="text" data-bb="model" value="${esc(b.model)}" aria-label="Baseband model" placeholder="Model">
    <select data-bb="status" aria-label="New or reused"><option ${b.status==="New"?"selected":""}>New</option><option ${b.status==="Reused"?"selected":""}>Reused</option></select>
    <input type="text" data-bb="tech" value="${esc(b.tech)}" aria-label="Technologies" placeholder="e.g. 4G+5G">
    <input type="number" min="0" max="9" data-bb="qty" value="${b.qty}" aria-label="Quantity">
    <button class="x" data-bdel="${i}" aria-label="Remove baseband">×</button></div>`).join("")||'<p class="hint">No baseband – add at least one new baseband.</p>';
  updCut();
  $("#fixed").innerHTML=(TRMm()?M.TRM_FIXED:M.FIXED).map(([k,l])=>`<div class="fx"><span>${esc(l)}</span><input type="number" min="0" data-f="${k}" value="${S.fixed[k]}"></div>`).join("");
}

function render(){
  save();
  const sites=M.sitesOf(S), cnt=n=>sites.filter(s=>s.type===n).length, mx=+S.project.maxHours*60;
  const sch=S.types.map(t=>M.schedule(S,t));
  if(sel>=S.types.length) sel=0;
  $("#sum").innerHTML=S.types.map((t,i)=>{const r=sch[i],bad=Math.max(...r.days.map(d=>d.hours))>mx+0.5;
    return `<button class="tile" style="--c:${COL(i)}" data-sel="${i}" aria-pressed="${i===sel}">
      <div class="nm"><i></i>${esc(t.name)} <span style="font-weight:500;color:var(--ink-2);font-size:13px">· ${cnt(t.name)} ${W1()}${cnt(t.name)===1?"":"s"}</span></div>
      <div class="eqt">${TRMm()?`<b>${esc((M.TRM_METHODS[t.method]||M.TRM_METHODS.normal).label)}${t.sd?" + SD":""}</b> · `:`<b>${esc((M.RAN_SCEN[t.scenario]||M.RAN_SCEN.swap).label)}</b> · `}${esc(M.equipTxt(t))}</div>
      <dl class="${r.days.length>=3?"many":""}" style="grid-template-columns:repeat(${r.days.length+1},1fr)">${r.days.map((d,k)=>`<div><dt>Day ${k+1}${d.cut?(TRMm()?" 🔴":" ⚡"):""}</dt><dd>${M.fmt(d.hours)}</dd></div>`).join("")}<div><dt>Outage</dt><dd class="o">${r.noOutage?"none":M.fmt(r.outage)}</dd></div></dl>
      <span class="flag ${bad||!r.outOk?"bad":""}">${bad?"⚠ Over "+S.project.maxHours+" h – split or add crew":!r.outOk?"⚠ Outage exceeds the allowed "+S.project.outMax+" h":"✔ Fits the day and the outage window"}</span>
    </button>`}).join("");
  // totals
  const teams=Math.max(1,+S.project.teams||1);
  const dBy=Object.fromEntries(S.types.map((t,i)=>[t.name,sch[i].days.length])), cBy=Object.fromEntries(S.types.map((t,i)=>[t.name,sch[i].cutIdx]));
  const plan=M.planDates(S,sites,dBy,cBy), end=sites.length?new Date(Math.max(...plan.map(x=>x.end.getTime()))):new Date(S.project.startDate+"T00:00:00Z");
  const uDays=sites.reduce((a,x)=>a+(dBy[x.type]||0),0);
  const unknown=sites.filter(s=>!S.types.some(t=>t.name===s.type)).length;
  $("#totals").innerHTML=`<span><b>${esc(S.project.country||"—")}</b></span><span><b>${sites.length}</b> ${W1()}s</span><span><b>${uDays}</b> ${W1()}-days</span><span>Finish <b>${end.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"})}</b> with ${teams} team${teams>1?"s":""} · ${esc((M.WEEKEND[S.project.weekend]||M.WEEKEND.sun).label)}</span>${unknown?`<span style="color:var(--red)">${unknown} ${W1()}(s) in the list use an unknown type</span>`:""}`;
  // timeline
  const t=S.types[sel], r=sch[sel]; if(!t){$("#tl").innerHTML="<p>Add a type to start.</p>";return}
  const span=Math.max(mx,...r.days.map(d=>d.hours),...r.days.filter(d=>d.cut).map(d=>r.allowedEnd-d.arrive)); const step=60, W=span;
  const colorOf=a=>a.impact==="Outage"?"var(--red)":/Tower|Rigger/.test(a.who)?"var(--amber)":/^Remote/.test(a.who)?"var(--violet)":"var(--blue)";
  const ticks=a=>{let h="";for(let m=0;m<=W;m+=step)h+=`<span style="left:${m/W*100}%">${M.clock(a+m)}</span>`;return h};
  const nd=r.days.length, E=t.edits||(t.edits={rm:{},mv:{},dur:{},add:[]});
  const WHO=TRMm()?["Riggers","FE / TX engineer","Team lead","Remote integrator","All"]:["Tower crew","Ground tech","FE","Remote integrator","Team lead","All"];
  const day=(d,di)=>{const bad=d.hours>mx+0.5;
    const ob=d.cut&&!r.noOutage?`<div class="aw" style="left:${Math.max(0,r.outApproved-d.arrive)/W*100}%;width:${(r.allowedEnd-Math.max(r.outApproved,d.arrive))/W*100}%"></div><div class="ob" style="left:${(r.outStart-d.arrive)/W*100}%;width:${r.outage/W*100}%"></div>`:"";
    const over=W>mx?`<div class="over" style="left:${mx/W*100}%;right:0"></div>`:"";
    const daySel=(a)=>nd>1?`<select class="mv" data-mv="${esc(a.id)}" aria-label="Move to day" title="Move to another day">${r.days.map((_,k)=>`<option value="${k+1}" ${k===di?"selected":""}>D${k+1}</option>`).join("")}</select>`:"";
    const tag=a=>a.custom?'<i class="tg add">added</i>':a.moved?'<i class="tg mvd">moved</i>':"";
    return `<div class="day"><div class="dayhead"><b>${esc(d.title.replace(/^\S+\s/,""))}</b><span class="${bad?"bad":""}">${M.clock(d.arrive)} → ${M.clock(d.leave)} · ${M.fmt(d.hours)} h</span></div>
      <div class="scale"><span></span><div class="ticks">${ticks(d.arrive)}</div><span></span></div>
      ${d.acts.map((a,k)=>`<div class="lane ${a.dur?"":"skip"}"><div class="lb" title="${esc(a.name)} – ${esc(a.who)}${a.desc?"\n"+esc(a.desc):""}"><em>${di+1}.${k+1}</em>${esc(a.name)}${tag(a)}</div>
        <div class="track" style="--hr:${60/W*100}%">${ob}${over}${a.dur?`<div class="bar-a" style="--k:${colorOf(a)};left:${(a.start-d.arrive)/W*100}%;width:${a.dur/W*100}%" title="${M.clock(a.start)}–${M.clock(a.end)} · ${a.dur} min">${a.dur>=30?a.dur+"′":""}</div>`:""}</div>
        <div class="ed">${daySel(a)}<input type="number" min="0" class="du" data-du="${esc(a.id)}" value="${a.dur}" aria-label="Minutes" title="Minutes"><button class="x" data-rm="${esc(a.id)}" aria-label="Remove ${esc(a.name)}" title="Remove step">×</button></div></div>`).join("")}
      <div class="addrow" data-day="${di+1}">
        <input type="text" list="stepLib" class="an" placeholder="+ Add step to Day ${di+1} (type or pick)" aria-label="New step name">
        <select class="aw2" aria-label="Who">${WHO.map(w=>`<option>${w}</option>`).join("")}</select>
        <input type="number" class="am" min="0" value="30" aria-label="Minutes">
        <select class="aa" aria-label="After step"><option value="">after same crew</option>${d.acts.map(x=>`<option value="${esc(x.key)}">after ${esc(x.name)}</option>`).join("")}</select>
        ${d.cut&&!r.noOutage?'<label class="ao"><input type="checkbox" class="aoc"> outage</label>':""}
        <button class="add sm ab" data-addday="${di+1}">Add</button></div>
    </div>`};
  const rem=M.removedSteps(S,t);
  $("#tl").innerHTML=`<div class="tlhead"><h2>${esc(t.name)} — ${r.days.length} day${r.days.length>1?"s":""} ${TRMm()?"per link":"on site"}</h2>
      <div class="tlbtn">${nd>1?'<button class="ghost2" id="bal" title="Move flexible blocks (QA, finishing, AIR, decommissioning) to even out the days">⚖ Auto-balance days</button>':""}<button class="ghost2" id="rst" title="Undo all step edits for this type">↺ Reset steps</button></div></div>
    <div class="sub">${r.noOutage?`<b style="color:var(--green)">No outage for this MOP type</b>`:`Outage on Day ${r.cutIdx}: ${M.clock(r.outStart)} → ${M.clock(r.outEnd)} (${M.fmt(r.outage)}) · allowed ${M.clock(r.outApproved)} → ${M.clock(r.allowedEnd)} <b style="color:${r.outOk?"var(--green)":"var(--red)"}">${r.outOk?"✔ within window":"⚠ exceeds window"}</b>`} · Total ${M.fmt(r.total)} on site${t.reuseCabling?" · cable runs skipped (reused)":""}</div>
    <div class="legend"><span style="--k:var(--amber)">${TRMm()?"Riggers":"Tower crew"}</span><span style="--k:var(--blue)">${TRMm()?"Team lead / FE":"Ground / FE"}</span><span style="--k:var(--violet)">Remote integrator</span><span style="--k:var(--red)">Outage</span><span style="--k:rgba(47,158,68,.35)">Allowed outage window</span></div>
    <p class="hint">Edit any step: move it to another day (D1…), change its minutes, remove it (×) or add your own step at the end of a day. Moved / added steps run after the same crew's last step of that day.</p>
    ${r.days.map(day).join("")}
    ${rem.length?`<div class="removed"><b>Removed steps:</b> ${rem.map(x=>`<button class="chip" data-restore="${esc(x.id)}" title="Restore">↩ D${x.day} ${esc(x.name)}</button>`).join(" ")}</div>`:""}
    <div class="note">The Excel file has the full MOP for every ${TRMm()?"link":"site"} type: steps, who, dependencies, clock times, time mapping, connections and a ${TRMm()?"link":"site"} tracker with dates. D0 (day-before) preparation is listed on its Dashboard.</div>`;
  $("#stepLib").innerHTML=(TRMm()?M.TRM_FIXED:M.FIXED.concat(M.RAN_EXTRA_LIST)).map(f=>`<option value="${esc(f[1])}">`).join("");
}

// events
document.addEventListener("input",e=>{
  const el=e.target, v=(el.type==="number"||el.dataset.num)?(el.value===""?0:+el.value):el.type==="checkbox"?el.checked:el.value;
  if(el.id==="pname") S.project.name=v;
  else if(el.dataset.p){ S.project[el.dataset.p]=v; document.querySelectorAll(`[data-p="${el.dataset.p}"]`).forEach(o=>{if(o!==el)o.value=v});
    updCut(); }
  else if(el.dataset.bb){const i=+el.closest(".bb").dataset.b; S.basebands[i][el.dataset.bb]=v}
  else if(el.dataset.u) S.unit[el.dataset.u]=v;
  else if(el.dataset.f){ S.fixed[el.dataset.f]=v; updCut(); }
  else if(el.id==="sites") S.siteList=el.value;
  else if(el.id==="d0") S.d0=el.value;
  else if(el.dataset.uk&&false){}
  else if(el.dataset.uk){const i=+el.closest(".tcard").dataset.i, k=+el.closest(".un").dataset.u, u=S.types[i].units[k]; u[el.dataset.uk]=v;
    if(el.dataset.uk==="model"){const e=S.equipment.find(q=>q.model===v); if(e){u.min=+e.min; el.closest(".un").querySelector('[data-uk="min"]').value=u.min}}
    if(el.dataset.uk==="role"||el.dataset.uk==="model"){const ki=el.closest(".un").querySelector(".kind"), k2=kindOf(u); ki.textContent=k2.txt; ki.className="kind "+k2.cls} }
  else if(el.dataset.rb){const i=+el.closest(".rb").dataset.r; S.rbs[i][el.dataset.rb]=v}
  else if(el.dataset.t){const i=+el.closest(".tcard").dataset.i, tt=S.types[i]; tt[el.dataset.t]=v;
    if(["method","scenario","days","compact"].includes(el.dataset.t)){ if(el.dataset.t==="scenario"){tt.days=M.RAN_SCEN[v].def} tt.edits={rm:{},mv:{},dur:{},add:[]}; sel=i; renderInputs(); if(el.dataset.t!=="days"&&el.dataset.t!=="compact") toast("Template changed – step edits for this type were reset."); } updCut()}
  else if(el.dataset.k){const i=+el.closest(".eq").dataset.e, old=S.equipment[i].model; S.equipment[i][el.dataset.k]=v;
    if(el.dataset.k==="model") S.types.forEach(t=>(t.units||[]).forEach(u=>{if(u.model===old)u.model=v}));
    if(el.dataset.k!=="min"){ clearTimeout(window._rr); window._rr=setTimeout(()=>{const a=document.activeElement;renderInputs();},600);} }
  else return;
  render();
});
function curT(){return S.types[sel]}
function edits(t){t.edits=t.edits||{};["rm","mv","dur"].forEach(k=>t.edits[k]=t.edits[k]||{});t.edits.add=t.edits.add||[];return t.edits}
document.addEventListener("change",e=>{
  const el=e.target, t=curT(); if(!t) return;
  if(el.dataset.mv){const id=el.dataset.mv, E=edits(t), to=+el.value;
    if(id.startsWith("c:")){const c=E.add.find(x=>"c:"+x.id===id); if(c) c.day=to;}
    else { const orig=+id.split(":")[0]; if(to===orig) delete E.mv[id]; else E.mv[id]=to; }
    render();}
  else if(el.dataset.du){const id=el.dataset.du, E=edits(t), v=el.value===""?0:+el.value;
    if(id.startsWith("c:")){const c=E.add.find(x=>"c:"+x.id===id); if(c) c.dur=v;} else E.dur[id]=v;
    render();}
  else if(el.classList.contains("an")){const f=(TRMm()?M.TRM_FIXED:M.FIXED.concat(M.RAN_EXTRA_LIST)).find(x=>x[1]===el.value); if(f) el.closest(".addrow").querySelector(".am").value=f[2];}
});
document.addEventListener("click",e=>{
  const b=e.target.closest("button"); if(!b) return;
  const t0=curT();
  if(b.dataset.rm&&t0){const id=b.dataset.rm, E=edits(t0); if(id.startsWith("c:")) E.add=E.add.filter(x=>"c:"+x.id!==id); else E.rm[id]=1; render(); toast("Step removed – restore it from the list under the timeline."); return}
  if(b.dataset.restore&&t0){delete edits(t0).rm[b.dataset.restore]; render(); return}
  if(b.dataset.addday&&t0){const row=b.closest(".addrow"), nm=row.querySelector(".an").value.trim(); if(!nm){toast("Type a step name first.");return}
    const E=edits(t0); E.add.push({id:Date.now().toString(36),name:nm,who:row.querySelector(".aw2").value,dur:+row.querySelector(".am").value||0,day:+b.dataset.addday,after:row.querySelector(".aa").value,outage:!!(row.querySelector(".aoc")&&row.querySelector(".aoc").checked)});
    render(); toast(`Step added to Day ${b.dataset.addday}.`); return}
  if(b.id==="bal"&&t0){const before=M.schedule(S,t0).days.map(d=>M.fmt(d.hours)).join(" / "); t0.edits=M.autoBalance(S,t0); const after=M.schedule(S,t0).days.map(d=>M.fmt(d.hours)).join(" / "); render(); toast(before===after?"Days are already as balanced as the flexible blocks allow.":`Balanced: ${before} → ${after}`); return}
  if(b.id==="rst"&&t0){t0.edits={rm:{},mv:{},dur:{},add:[]}; render(); toast("Steps reset to the template."); return}
  if(b.dataset.mode&&b.closest(".seg,.start")){ $("#start").hidden=true; if(b.dataset.mode!==ALL.mode) switchMode(b.dataset.mode); else save(); return }
  if(b.dataset.sel!==undefined){sel=+b.dataset.sel;render()}
  else if(b.dataset.del!==undefined){if(S.types.length<2){toast("Keep at least one type.");return} S.types.splice(+b.dataset.del,1);renderInputs();render()}
  else if(b.dataset.uadd!==undefined){const t=S.types[+b.dataset.uadd]; t.units=t.units||[]; t.units.push(TRMm()?{role:"",model:"",qty:1,min:30}:{role:"",model:"",qty:3,min:20}); renderInputs(); render();
    const c=document.querySelector(`.tcard[data-i="${b.dataset.uadd}"]`); const r=c.querySelectorAll('[data-uk="role"]'); r[r.length-1].focus()}
  else if(b.dataset.udel!==undefined){const i=+b.closest(".tcard").dataset.i; S.types[i].units.splice(+b.dataset.udel,1); renderInputs(); render()}
  else if(b.dataset.rdel!==undefined){S.rbs.splice(+b.dataset.rdel,1); renderInputs(); render()}
  else if(b.dataset.bdel!==undefined){S.basebands.splice(+b.dataset.bdel,1);renderInputs();render()}
  else if(b.dataset.edel!==undefined){const m=S.equipment[+b.dataset.edel].model; /* models stay usable as free text */ S.equipment.splice(+b.dataset.edel,1);renderInputs();render()}
});
$("#addRBS").onclick=()=>{S.rbs.push({type:"",qty:1,min:90}); renderInputs(); render(); const x=document.querySelectorAll('[data-rb="type"]'); x[x.length-1].focus()};
$("#addType").onclick=()=>{const l=S.types[S.types.length-1]; S.types.push(Object.assign({},JSON.parse(JSON.stringify(l)),{name:"Type-"+(S.types.length+1),sites:1})); sel=S.types.length-1; renderInputs(); render()};
$("#addBB").onclick=()=>{S.basebands.push({model:"",status:"New",tech:"",qty:1}); renderInputs(); render(); const x=document.querySelectorAll('[data-bb="model"]'); x[x.length-1].focus()};
$("#addEq").onclick=()=>{S.equipment.push({model:"New model",kind:"radio",min:20}); renderInputs(); render()};
$("#reset").onclick=()=>{S=TRMm()?M.normalize(M.DEFAULT_TRM()):M.DEFAULT_STATE(); ALL[ALL.mode]=S; sel=0; renderInputs(); render(); toast(`Default ${ALL.mode} setup restored.`)};

let dl=null; (async()=>{try{ if(window.claude&&window.claude.use) dl=await window.claude.use("downloads"); }catch(e){dl=null}})();
$("#gen").onclick=async()=>{
  const btn=$("#gen");
  if(!window.ExcelJS){toast("The Excel library did not load. Check your connection and reload the page.");return}
  const names=S.types.map(t=>t.name.trim()); if(new Set(names).size!==names.length||names.some(n=>!n)){toast("Give every type a unique name.");return}
  btn.disabled=true; btn.textContent="Building…";
  try{
    const wb=await M.buildWorkbook(window.ExcelJS,S); const buf=await wb.xlsx.writeBuffer();
    const name=fileBase()+`_${S.domain}_Installation_MOP.xlsx`;
    const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    if(dl){ try{ await dl.save({filename:name,data:blob}); toast("Excel MOP saved."); }
      catch(err){ const c=err&&err.code; toast(c==="declined"?"Download cancelled.":c==="rate_limited"?"A save prompt is already open.":"Download is not available here."); } }
    else { const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000); toast("Excel MOP downloaded."); }
  }catch(err){ console.error(err); toast("Could not build the file: "+(err.message||err)); }
  btn.disabled=false; btn.textContent="Download Excel MOP";
};
applyMode(); renderInputs(); render();
if(firstVisit) $("#start").hidden=false;
// ---- simplified PDF
function fileBase(){return [S.project.name||"MOP",S.project.country].filter(Boolean).join(" ").replace(/[^\w\- ]+/g,"").trim().replace(/\s+/g,"_")}
const _unusedFB=()=>[S.project.name||"MOP",S.project.country].filter(Boolean).join(" ").replace(/[^\w\- ]+/g,"").trim().replace(/\s+/g,"_");
async function deliver(blob,name,what){
  if(dl){ try{ await dl.save({filename:name,data:blob}); toast(what+" saved."); }catch(err){ const c=err&&err.code; toast(c==="declined"?"Download cancelled.":c==="rate_limited"?"A save prompt is already open.":"Download is not available here."); } return; }
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000); toast(what+" downloaded.");
}
$("#pdf").onclick=async()=>{
  const btn=$("#pdf");
  if(!window.jspdf||!window.jspdf.jsPDF){toast("The PDF library did not load. Check your connection and reload the page.");return}
  btn.disabled=true; btn.textContent="…";
  try{ const doc=M.buildPdf(window.jspdf.jsPDF,S); await deliver(doc.output("blob"),fileBase()+`_${S.domain}_MOP_summary.pdf`,"PDF MOP"); }
  catch(err){ console.error(err); toast("Could not build the PDF: "+(err.message||err)); }
  btn.disabled=false; btn.textContent="PDF";
};
// ---- share setups with the team
$("#exp").onclick=async()=>{
  const name=[S.project.name,S.project.country,"setup"].filter(Boolean).join(" ").replace(/[^\w\- ]+/g,"").trim().replace(/\s+/g,"_")+".json";
  save(); const blob=new Blob([JSON.stringify(ALL,null,2)],{type:"application/json"});
  if(dl){try{await dl.save({filename:name,data:blob});toast("Setup saved.")}catch(e){toast(e&&e.code==="declined"?"Save cancelled.":"Save is not available here.")}return}
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast("Setup saved.");
};
$("#imp").onchange=async e=>{
  const f=e.target.files[0]; if(!f) return;
  try{const x=JSON.parse(await f.text());
    if(x&&x.RAN&&x.TRM){ ALL={mode:x.mode==="TRM"?"TRM":"RAN",RAN:M.normalize(x.RAN),TRM:M.normalize(x.TRM)}; }
    else if(x&&Array.isArray(x.types)&&x.project){ const d=M.normalize(x); ALL[d.domain]=d; ALL.mode=d.domain; }
    else throw new Error("not a MOP setup file");
    S=ALL[ALL.mode]; applyMode();
    sel=0; renderInputs(); render(); toast("Loaded setup: "+(S.project.name||f.name));
  }catch(err){toast("Could not load "+f.name+": "+err.message)}
  e.target.value="";
};
if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
