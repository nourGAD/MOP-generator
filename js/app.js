(function(){
const M=window.MOP, $=s=>document.querySelector(s);
const KEY="mop-generator-state-v1";
let S; try{S=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){S=null}
S=M.normalize(S&&S.types?S:null);
let sel=0;
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const COL=i=>"#"+M.COLORS[i%M.COLORS.length];
const toast=m=>{const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove("show"),3200)};

function opts(kind,v){return S.equipment.filter(e=>e.kind===kind).map(e=>`<option ${e.model===v?"selected":""}>${esc(e.model)}</option>`).join("")}
function updCut(){ $("#cutLbl").firstChild.textContent=`Team on site – cutover (Day ${M.cutDayOf(S.project)})`; $("#cutOut").textContent=M.clock(M.cutArrive(S));
  $("#cutLbl small").textContent=`auto: ${M.fmt(M.leadMin(S))} h before outage`; }
function renderInputs(){
  $("#pname").value=S.project.name;
  document.querySelectorAll("[data-p]").forEach(el=>el.value=S.project[el.dataset.p]);
  document.querySelectorAll("[data-u]").forEach(el=>el.value=S.unit[el.dataset.u]);
  $("#sites").value=S.siteList||"";
  $("#types").innerHTML=S.types.map((t,i)=>`
   <div class="tcard" style="--c:${COL(i)}" data-i="${i}">
    <div class="head"><label class="f">Name<input type="text" data-t="name" value="${esc(t.name)}"></label>
      <label class="f">Sites<input type="number" min="0" data-t="sites" value="${t.sites}"></label>
      <button class="x" data-del="${i}" aria-label="Remove ${esc(t.name)}" title="Remove">×</button></div>
    <div class="row"><label class="f">Low-band radio<select data-t="lowModel">${opts("radio",t.lowModel)}</select></label><label class="f">Qty<input type="number" min="0" data-t="lowQty" value="${t.lowQty}"></label></div>
    <div class="row"><label class="f">Mid-band radio<select data-t="midModel">${opts("radio",t.midModel)}</select></label><label class="f">Qty<input type="number" min="0" data-t="midQty" value="${t.midQty}"></label></div>
    <div class="row"><label class="f">5G AIR<select data-t="airModel">${opts("air",t.airModel)}</select></label><label class="f">Qty<input type="number" min="0" data-t="airQty" value="${t.airQty}"></label></div>
    <label class="chk"><input type="checkbox" data-t="reuseCabling" ${t.reuseCabling?"checked":""}> Reuse existing cabling (skip cable runs)</label>
   </div>`).join("");
  $("#equip").innerHTML=S.equipment.map((e,i)=>`<div class="eq" data-e="${i}">
    <input type="text" data-k="model" value="${esc(e.model)}" aria-label="Model">
    <select data-k="kind" aria-label="Kind"><option value="radio" ${e.kind==="radio"?"selected":""}>Radio</option><option value="air" ${e.kind==="air"?"selected":""}>AIR</option></select>
    <input type="number" min="0" data-k="min" value="${e.min}" aria-label="Minutes">
    <button class="x" data-edel="${i}" aria-label="Remove model">×</button></div>`).join("");
  $("#bbs").innerHTML=S.basebands.map((b,i)=>`<div class="bb" data-b="${i}">
    <input type="text" data-bb="model" value="${esc(b.model)}" aria-label="Baseband model" placeholder="Model">
    <select data-bb="status" aria-label="New or reused"><option ${b.status==="New"?"selected":""}>New</option><option ${b.status==="Reused"?"selected":""}>Reused</option></select>
    <input type="text" data-bb="tech" value="${esc(b.tech)}" aria-label="Technologies" placeholder="e.g. 4G+5G">
    <input type="number" min="0" max="9" data-bb="qty" value="${b.qty}" aria-label="Quantity">
    <button class="x" data-bdel="${i}" aria-label="Remove baseband">×</button></div>`).join("")||'<p class="hint">No baseband – add at least one new baseband.</p>';
  updCut();
  $("#fixed").innerHTML=M.FIXED.map(([k,l])=>`<div class="fx"><span>${esc(l)}</span><input type="number" min="0" data-f="${k}" value="${S.fixed[k]}"></div>`).join("");
}

function render(){
  save();
  const sites=M.sitesOf(S), cnt=n=>sites.filter(s=>s.type===n).length, mx=+S.project.maxHours*60;
  const sch=S.types.map(t=>M.schedule(S,t));
  if(sel>=S.types.length) sel=0;
  $("#sum").innerHTML=S.types.map((t,i)=>{const r=sch[i],bad=Math.max(...r.days.map(d=>d.hours))>mx+0.5;
    return `<button class="tile" style="--c:${COL(i)}" data-sel="${i}" aria-pressed="${i===sel}">
      <div class="nm"><i></i>${esc(t.name)} <span style="font-weight:500;color:var(--ink-2);font-size:13px">· ${cnt(t.name)} site${cnt(t.name)===1?"":"s"}</span></div>
      <div class="eqt">${t.lowQty}× ${esc(t.lowModel)} + ${t.midQty}× ${esc(t.midModel)} + ${t.airQty}× ${esc(t.airModel)}</div>
      <dl style="grid-template-columns:repeat(${r.days.length+1},1fr)">${r.days.map((d,k)=>`<div><dt>Day ${k+1}${d.cut?" ⚡":""}</dt><dd>${M.fmt(d.hours)}</dd></div>`).join("")}<div><dt>Outage</dt><dd class="o">${M.fmt(r.outage)}</dd></div></dl>
      <span class="flag ${bad||!r.outOk?"bad":""}">${bad?"⚠ Over "+S.project.maxHours+" h – split or add crew":!r.outOk?"⚠ Outage exceeds the allowed "+S.project.outMax+" h":"✔ Fits the day and the outage window"}</span>
    </button>`}).join("");
  // totals
  const teams=Math.max(1,+S.project.teams||1), end=M.finishDate(S,sites.length);
  const unknown=sites.filter(s=>!S.types.some(t=>t.name===s.type)).length;
  $("#totals").innerHTML=`<span><b>${esc(S.project.country||"—")}</b></span><span><b>${sites.length}</b> sites</span><span><b>${sites.length*M.daysOf(S.project)}</b> site-days</span><span>Finish <b>${end.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"})}</b> with ${teams} team${teams>1?"s":""} · ${esc((M.WEEKEND[S.project.weekend]||M.WEEKEND.sun).label)}</span>${unknown?`<span style="color:var(--red)">${unknown} site(s) in the list use an unknown type</span>`:""}`;
  // timeline
  const t=S.types[sel], r=sch[sel]; if(!t){$("#tl").innerHTML="<p>Add a site type to start.</p>";return}
  const span=Math.max(mx,...r.days.map(d=>d.hours),...r.days.filter(d=>d.cut).map(d=>r.allowedEnd-d.arrive)); const step=60, W=span;
  const colorOf=a=>a.impact==="Outage"?"var(--red)":/Tower/.test(a.who)?"var(--amber)":/^Remote/.test(a.who)?"var(--violet)":"var(--blue)";
  const ticks=a=>{let h="";for(let m=0;m<=W;m+=step)h+=`<span style="left:${m/W*100}%">${M.clock(a+m)}</span>`;return h};
  const day=(d,di)=>{const bad=d.hours>mx+0.5;
    const ob=d.cut?`<div class="aw" style="left:${Math.max(0,r.outApproved-d.arrive)/W*100}%;width:${(r.allowedEnd-Math.max(r.outApproved,d.arrive))/W*100}%"></div><div class="ob" style="left:${(r.outStart-d.arrive)/W*100}%;width:${r.outage/W*100}%"></div>`:"";
    const over=W>mx?`<div class="over" style="left:${mx/W*100}%;right:0"></div>`:"";
    return `<div class="day"><div class="dayhead"><b>${esc(d.title.replace(/^\S+\s/,""))}</b><span class="${bad?"bad":""}">${M.clock(d.arrive)} → ${M.clock(d.leave)} · ${M.fmt(d.hours)} h</span></div>
      <div class="scale"><span></span><div class="ticks">${ticks(d.arrive)}</div></div>
      ${d.acts.map((a,k)=>`<div class="lane ${a.dur?"":"skip"}"><div class="lb" title="${esc(a.name)} – ${esc(a.who)}"><em>${di+1}.${k+1}</em>${esc(a.name)}</div>
        <div class="track" style="--hr:${60/W*100}%">${ob}${over}${a.dur?`<div class="bar-a" style="--k:${colorOf(a)};left:${(a.start-d.arrive)/W*100}%;width:${a.dur/W*100}%" title="${M.clock(a.start)}–${M.clock(a.end)} · ${a.dur} min">${a.dur>=30?a.dur+"′":""}</div>`:""}</div></div>`).join("")}
    </div>`};
  $("#tl").innerHTML=`<h2>${esc(t.name)} — ${r.days.length} days on site</h2>
    <div class="sub">Outage on Day ${r.cutIdx}: ${M.clock(r.outStart)} → ${M.clock(r.outEnd)} (${M.fmt(r.outage)}) · allowed ${M.clock(r.outApproved)} → ${M.clock(r.allowedEnd)} <b style="color:${r.outOk?"var(--green)":"var(--red)"}">${r.outOk?"✔ within window":"⚠ exceeds window"}</b> · Total ${M.fmt(r.total)} on site${t.reuseCabling?" · cable runs skipped (reused)":""}</div>
    <div class="legend"><span style="--k:var(--amber)">Tower crew</span><span style="--k:var(--blue)">Ground / FE</span><span style="--k:var(--violet)">Remote integrator</span><span style="--k:var(--red)">Outage</span><span style="--k:rgba(47,158,68,.35)">Allowed outage window</span></div>
    ${r.days.map(day).join("")}
    <div class="note">The Excel file has the full MOP for every site type: steps, who, dependencies, clock times, time mapping, connections and a site tracker with auto dates.</div>`;
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
  else if(el.dataset.t){const i=+el.closest(".tcard").dataset.i; S.types[i][el.dataset.t]=v}
  else if(el.dataset.k){const i=+el.closest(".eq").dataset.e, old=S.equipment[i].model; S.equipment[i][el.dataset.k]=v;
    if(el.dataset.k==="model") S.types.forEach(t=>["lowModel","midModel","airModel"].forEach(k=>{if(t[k]===old)t[k]=v}));
    if(el.dataset.k!=="min"){ clearTimeout(window._rr); window._rr=setTimeout(()=>{const a=document.activeElement;renderInputs();},600);} }
  else return;
  render();
});
document.addEventListener("click",e=>{
  const b=e.target.closest("button"); if(!b) return;
  if(b.dataset.sel!==undefined){sel=+b.dataset.sel;render()}
  else if(b.dataset.del!==undefined){if(S.types.length<2){toast("Keep at least one site type.");return} S.types.splice(+b.dataset.del,1);renderInputs();render()}
  else if(b.dataset.bdel!==undefined){S.basebands.splice(+b.dataset.bdel,1);renderInputs();render()}
  else if(b.dataset.edel!==undefined){const m=S.equipment[+b.dataset.edel].model; if(S.types.some(t=>[t.lowModel,t.midModel,t.airModel].includes(m))){toast(m+" is used by a site type – change it there first.");return} S.equipment.splice(+b.dataset.edel,1);renderInputs();render()}
});
$("#addType").onclick=()=>{const l=S.types[S.types.length-1]; S.types.push(Object.assign({},l,{name:"Type-"+(S.types.length+1),sites:1})); sel=S.types.length-1; renderInputs(); render()};
$("#addBB").onclick=()=>{S.basebands.push({model:"",status:"New",tech:"",qty:1}); renderInputs(); render(); const x=document.querySelectorAll('[data-bb="model"]'); x[x.length-1].focus()};
$("#addEq").onclick=()=>{S.equipment.push({model:"New model",kind:"radio",min:20}); renderInputs(); render()};
$("#reset").onclick=()=>{S=M.DEFAULT_STATE(); sel=0; renderInputs(); render(); toast("Default setup restored.")};

let dl=null; (async()=>{try{ if(window.claude&&window.claude.use) dl=await window.claude.use("downloads"); }catch(e){dl=null}})();
$("#gen").onclick=async()=>{
  const btn=$("#gen");
  if(!window.ExcelJS){toast("The Excel library did not load. Check your connection and reload the page.");return}
  const names=S.types.map(t=>t.name.trim()); if(new Set(names).size!==names.length||names.some(n=>!n||/[\[\]:*?\/\\']/.test(n))){toast("Give every site type a unique name without [ ] : * ? / \\ '");return}
  btn.disabled=true; btn.textContent="Building…";
  try{
    const wb=await M.buildWorkbook(window.ExcelJS,S); const buf=await wb.xlsx.writeBuffer();
    const name=[S.project.name||"MOP",S.project.country].filter(Boolean).join(" ").replace(/[^\w\- ]+/g,"").trim().replace(/\s+/g,"_")+"_Installation_MOP.xlsx";
    const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    if(dl){ try{ await dl.save({filename:name,data:blob}); toast("Excel MOP saved."); }
      catch(err){ const c=err&&err.code; toast(c==="declined"?"Download cancelled.":c==="rate_limited"?"A save prompt is already open.":"Download is not available here."); } }
    else { const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000); toast("Excel MOP downloaded."); }
  }catch(err){ console.error(err); toast("Could not build the file: "+(err.message||err)); }
  btn.disabled=false; btn.textContent="Download Excel MOP";
};
renderInputs(); render();
// ---- simplified PDF
const fileBase=()=>[S.project.name||"MOP",S.project.country].filter(Boolean).join(" ").replace(/[^\w\- ]+/g,"").trim().replace(/\s+/g,"_");
async function deliver(blob,name,what){
  if(dl){ try{ await dl.save({filename:name,data:blob}); toast(what+" saved."); }catch(err){ const c=err&&err.code; toast(c==="declined"?"Download cancelled.":c==="rate_limited"?"A save prompt is already open.":"Download is not available here."); } return; }
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000); toast(what+" downloaded.");
}
$("#pdf").onclick=async()=>{
  const btn=$("#pdf");
  if(!window.jspdf||!window.jspdf.jsPDF){toast("The PDF library did not load. Check your connection and reload the page.");return}
  btn.disabled=true; btn.textContent="…";
  try{ const doc=M.buildPdf(window.jspdf.jsPDF,S); await deliver(doc.output("blob"),fileBase()+"_MOP_summary.pdf","PDF MOP"); }
  catch(err){ console.error(err); toast("Could not build the PDF: "+(err.message||err)); }
  btn.disabled=false; btn.textContent="PDF";
};
// ---- share setups with the team
$("#exp").onclick=async()=>{
  const name=[S.project.name,S.project.country,"setup"].filter(Boolean).join(" ").replace(/[^\w\- ]+/g,"").trim().replace(/\s+/g,"_")+".json";
  const blob=new Blob([JSON.stringify(S,null,2)],{type:"application/json"});
  if(dl){try{await dl.save({filename:name,data:blob});toast("Setup saved.")}catch(e){toast(e&&e.code==="declined"?"Save cancelled.":"Save is not available here.")}return}
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast("Setup saved.");
};
$("#imp").onchange=async e=>{
  const f=e.target.files[0]; if(!f) return;
  try{const x=JSON.parse(await f.text()); if(!x||!Array.isArray(x.types)||!x.project) throw new Error("not a MOP setup file");
    S=M.normalize(x);
    sel=0; renderInputs(); render(); toast("Loaded setup: "+(S.project.name||f.name));
  }catch(err){toast("Could not load "+f.name+": "+err.message)}
  e.target.value="";
};
if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
