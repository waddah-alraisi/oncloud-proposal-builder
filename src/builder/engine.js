// The Proposal Builder's engine: the original single-file builder (oncloud-proposal-builder.html, schema v4), unchanged
// in what it calculates and prints, with its seams moved onto OnCloud — the proposal is one OnCloud record, the company
// profile the app's key-value store, images OnCloud files — and its links to the workspace (contacts, products, quotes,
// exchange rates) handed in as `io`. It builds its screens as strings, every value through esc().
import { applyClient, applyProduct, applyQuote, fxFromRates } from './links.js';

export function createBuilder({ root, io, chrome }) {
root.innerHTML = chrome;
const KEY = "oncloud.proposals.v3";
const CKEY = "oncloud.company.v1";
const $ = s => root.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const toast = m => io.toast(String(m));
const num = v => { const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g,"")); return isFinite(n) ? n : 0; };
/* Gulf and a few other currencies carry three minor units; most carry two. */
const MINOR3 = ["OMR","KWD","BHD","JOD","TND","LYD","IQD"];
const minorUnits = c => MINOR3.indexOf(String(c||"").trim().toUpperCase()) >= 0 ? 3 : 2;
function money(n, ccy){
  const code = ccy === undefined ? ((typeof data !== "undefined" && data) ? data.currency : "") : ccy;
  const d = minorUnits(code);
  return (isFinite(n) ? n : 0).toLocaleString(undefined, {minimumFractionDigits:d, maximumFractionDigits:d});
}
const now = () => Date.now();

const STATUSES = [
  {k:"draft",    label:"Draft"},
  {k:"awaiting", label:"Sent — awaiting response"},
  {k:"active",   label:"Active"},
  {k:"won",      label:"Closed won"},
  {k:"lost",     label:"Closed lost"}
];
const statusLabel = k => (STATUSES.find(s => s.k === k) || STATUSES[0]).label;


/* One proposal is open; OnCloud holds it (io.saveProposal). */
const store = { ok: true, all(){ return data ? {[data.id]: data} : {}; }, put(){ return true; } };

function newId(){ return "p" + now().toString(36) + Math.random().toString(36).slice(2,6); }

/* ---------- company profile: everything true of OnCloud rather than of one client ---------- */
function blankCosting(){
  return {
    baseCcy: "OMR",
    rateCard: [],      /* {role, day} — internal cost per day, in baseCcy */
    fx: [],            /* {ccy, rate} — 1 ccy = rate baseCcy */
    fxAsOf: "",
    aiModels: [],      /* {provider, model, in, out, cached, ccy, asOf} per 1M tokens */
    aiAsOf: "",
    targetMargin: "35",
    contingency: "10",
    overheadPerManday: ""
  };
}
function blankCompany(){
  return {
    name: io.workspace.name || "", site:"", cover:"", costing: blankCosting(),
    clauses:{
      residency:"Workspace pinned at creation; backups and replicas inherit the pin",
      headcount:"Does not re-price the subscription within a term",
      signature:"Dates assume a signed order by {valid}. Every week of delay in signature moves go-live by a week.",
      sla:"Response and resolution targets are measured from the moment an issue is raised through one of the channels listed above.",
      integrScope:"Only the systems listed here are in scope. Any other system is a change request.",
      changeNone:"No change allowance is included. Each approved change is quoted and invoiced separately.",
      changeSome:"The allowance is a pre-agreed budget drawn down against these rates. Unused allowance is not invoiced.",
      changeNoWork:"None. Nothing is built or invoiced without written approval",
      changePlan:"An approved change carries its own dates; the timeline in section 2 moves with it",
      milestoneNote:"Milestone shares apply to the one-off project cost. Invoices payable within {payDays} days of invoice date.",
      subsNote:"mid-term additions pro-rated to the renewal date",
      obligations:"Each week an item is late moves the related go-live by the same week.",
      validity:"Valid until {valid}. Changes to scope, entity count or timeline are handled under change control and quoted before work begins."
    },
    differentiators:[
      {title:"Data stays in the jurisdiction it was created in", detail:"Each workspace is pinned to a physical region at creation, enforced in the database rather than by policy."},
      {title:"Priced per company, not per seat", detail:"Inviting the whole operation costs the same as inviting finance, so the data in the system is complete."},
      {title:"Export is a feature, not a negotiation", detail:"Full schema, full history, standard formats, no exit fee."}
    ]
  };
}
const cstore = {
  /* the company profile: OnCloud's key-value store for this workspace (io.saveCompany) */
  load(){
    const o = io.company, b = blankCompany();
    if (!o || typeof o !== "object") return b;
    /* merge clauses key by key so a clause added in a later build still has a default */
    return Object.assign(b, o, {
      clauses: Object.assign(b.clauses, o.clauses || {}),
      costing: Object.assign(b.costing, (o.costing && typeof o.costing === "object") ? o.costing : {})
    });
  },
  save(c){ io.saveCompany(c); return true; }
};
let company = cstore.load();
/* the workspace's logo (OnCloud's /connected/me), on the cover and in every footer */
function logoMark(cls){ return io.workspace.logo ? '<img class="' + cls + '" src="' + esc(io.workspace.logo) + '" alt="' + esc(company.name || io.workspace.name || "") + '">' : ''; }
function coverSrc(){ return (data && data.cover) || company.cover || io.defaultCover; }
function fill(s){
  return String(s||"")
    .replace(/\{valid\}/g, (function(){ const d = new Date(data.valid); return (data.valid && !isNaN(d)) ? d.toLocaleDateString(undefined,{day:"numeric",month:"long",year:"numeric"}) : "[date]"; })())
    .replace(/\{payDays\}/g, String(data.payDays||"[__]"))
    .replace(/\{company\}/g, company.name || io.workspace.name || "");
}
/* a clause is the company default unless this proposal overrides it */
function cl(k){
  const o = data.clauses || {};
  return fill(String(o[k] ?? company.clauses[k] ?? "").trim());
}

const DAYS = [
  {k:"Sun", full:"Sunday"},    {k:"Mon", full:"Monday"},  {k:"Tue", full:"Tuesday"},
  {k:"Wed", full:"Wednesday"}, {k:"Thu", full:"Thursday"},{k:"Fri", full:"Friday"},
  {k:"Sat", full:"Saturday"}
];
const dayFull = k => (DAYS.filter(d => d.k === k)[0] || {full:k}).full;

/* Internal costing. Never printed, never in the client export. */
function blankInternal(){
  return {
    mandays: [],      /* {phase, role, days, day} */
    infra: [],        /* {item, provider, qty, qtyLink, amount, ccy, basis, months, monthsLink, mode, alloc} */
    licences: [],     /* {item, qty, qtyLink, amount, ccy, basis, pass} */
    aiPackages: [],   /* {item, provider, amount, ccy, basis, months, alloc} — bought as a plan, not by the token */
    aiSell: "",       /* which commercial line is the AI the client is paying for */
    aiUsersBase: "", aiUsersBaseLink: "",   /* the seats AI cost is spread over */
    termYears: "",    /* blank follows the initial term in the commercial section */
    actuals: [],      /* {month, people, infra, lic, ai, fees, other, note} — what it really cost */
    fees: {pct:"", fixed:"", tx:"", note:""},
    aiProduct: [],    /* {feature, model, users, usersLink, reqs, inTok, outTok, cache, months, growth} */
    aiDelivery: [],   /* {tool, model, monthly, ccy, inTok, outTok, months, monthsLink, alloc} */
    aiAssume: [
      "users active per day: ",
      "requests per session: ",
      "tokens per request measured from a sample: ",
      "price list date: ",
      "fallback model: ",
      "rate limits: "
    ],
    other: [],        /* {item, amount, ccy, basis} */
    risk: {pct:"", amount:"", reason:""},
    contingency: "",  /* blank uses the company default */
    supportRole: "",
    supportDays: "",  /* support days per month */
    msMonths: []      /* month number for each payment milestone */
  };
}

function blank(){
  return {
    schemaVersion: 4,
    internal: blankInternal(),
    id: newId(), created: now(), updated: now(), status: "draft",
    history: [{t: now(), m: "Proposal created"}],
    clauses: {}, cover: "", lang: "en",
    /* every added section can be switched off per proposal; off or empty never prints */
    sections: {exec:true, situation:true, outcomes:true, experience:true, roi:true, why:true, obligations:true, timelineBar:true, history:true},
    problem:"", outcome:"", execOverride:"",
    situation:[{pain:"", cost:"", who:""}],
    outcomes:[{outcome:"", measure:"", baseline:"", target:"", when:""}],
    experience:[{person:"", moment:"", change:""}],
    why: (typeof company !== "undefined" && company.differentiators ? company.differentiators.map(function(d){ return {title:d.title, detail:d.detail}; }) : []),
    roiHours:"", roiCostHour:"", roiRevenue:"", roiOther:"",
    obligations:[{item:"", by:"", owner:""}],
    client:"", attention:"", preparedBy:"", role:"", ref:"OC-PROP-2026-001", issued:"", valid:"", version:"1.0",
    headline:"", subline:"", understanding:"", entities:"", users:"", modules:"", goLive:"",
    capabilities:[
      {name:"Workspace and access", what:"Roles, approvals and audit trail across every module", status:"Live"},
      {name:"Finance", what:"", status:"Live"}
    ],
    techLead:"",
    scope:[
      {ref:"SOW-01", work:"Platform setup", del:"Workspace, entities, roles, approvals", owner:"OnCloud", out:""},
      {ref:"SOW-02", work:"Configuration", del:"", owner:"OnCloud", out:""}
    ],
    deliverables:[{name:"Configuration workbook", fmt:"Doc", due:"Week 2", by:""}],
    region:"", backups:"", rpo:"", rto:"", availability:"", certs:"",
    assumptions:["Source data arrives complete as at the agreed cut-off date"],
    exclusions:["Custom development beyond the configuration in scope"],
    timeline:[{phase:"Discovery", start:"", finish:"", gate:"Workbook signed off"}],
    integrations:[{system:"", direction:"Two-way", method:"API", provider:"Client", cost:""}],
    changeIntro:"Any request outside the agreed scope is quoted before work on it begins. Nothing is built, and nothing is invoiced, without written approval.",
    changeApprover:"", changeTurnaround:"5 working days", changeDayRate:"", changeHourRate:"", changeAllowance:"",
    changeTriggers:["A new module, entity or integration not named in the scope of work","A change to an approved configuration after sign-off","Data earlier than the agreed migration cut-off"],
    currency:"OMR", vat:"5", tier:"",
    subs:[{line:"Plan", basis:"Per company, per year", qty:"1", unit:"", when:"In advance"}],
    oneoff:[{line:"Implementation", amount:""}],
    milestones:[
      {name:"On signature", trigger:"Order form executed", share:"40"},
      {name:"Configuration accepted", trigger:"Walkthrough accepted", share:"30"},
      {name:"Go-live", trigger:"Cutover complete", share:"30"}
    ],
    addons:[], packages:[], discountValue:"", discountNote:"",
    payDays:"30", initialTerm:"12", noticeDays:"60", renewalPrice:"Fixed for 2 years", exit:"Full export, no fee",
    sla:[{sev:"1 Critical", resp:"", res:""}], supportHours:"",
    hours: [["Sun",1],["Mon",1],["Tue",1],["Wed",1],["Thu",1],["Fri",0],["Sat",0]]
      .map(function(d){ return {d: d[0], on: !!d[1], from: "08:00", to: "17:00"}; }),
    hoursTz: "GST, UTC+4",
    slaUptime:"", slaWindow:"", slaMaint:"", slaChannels:"", slaEscalation:"", slaCredits:"", slaExclusions:"",
    appendix:[{ref:"A", doc:"Company profile and commercial registration", att:"Yes"}],
    ask:""
  };
}
/* v2 (and anything earlier) becomes v3 without losing a field: unknown keys ride along,
   missing keys take the v3 default, and nothing already written is overwritten. */
function migrate(o){
  /* deep copy: a shallow Object.assign would leave the new proposal sharing its
     arrays with the old one, so editing a duplicate would edit its original */
  let src;
  try { src = o ? JSON.parse(JSON.stringify(o)) : {}; } catch(e){ src = {}; }
  const from = Number(src.schemaVersion || 2);
  const b = blank();
  const m = Object.assign(b, src);
  m.id = src.id || b.id;
  m.history = Array.isArray(src.history) ? src.history.slice() : [{t: now(), m: "Proposal created"}];
  m.status = src.status || "draft";
  m.clauses = (src.clauses && typeof src.clauses === "object") ? src.clauses : {};
  m.sections = Object.assign(b.sections, (src.sections && typeof src.sections === "object") ? src.sections : {});
  m.created = src.created || b.created;
  m.updated = src.updated || b.updated;
  if (!Array.isArray(m.hours) || m.hours.length !== 7) m.hours = b.hours;
  m.hours = m.hours.map(function(r, i){
    r = r || {};
    return {d: r.d || b.hours[i].d, on: r.on !== false && r.on !== "No", from: r.from || "08:00", to: r.to || "17:00"};
  });
  /* internal costing: created empty for anything older, never invented */
  const bi = blankInternal();
  const si = (src.internal && typeof src.internal === "object" && !Array.isArray(src.internal)) ? src.internal : {};
  m.internal = Object.assign(bi, si);
  ["mandays","infra","licences","aiPackages","aiProduct","aiDelivery","aiAssume","other","msMonths","actuals"].forEach(function(k){
    if (!Array.isArray(m.internal[k])) m.internal[k] = blankInternal()[k];
  });
  ["fees","risk"].forEach(function(k){
    const d = blankInternal()[k];
    m.internal[k] = (si[k] && typeof si[k] === "object" && !Array.isArray(si[k])) ? Object.assign(d, si[k]) : d;
  });

  if (from < 3){
    m.schemaVersion = 3;
    m.history.push({t: now(), m: "Migrated to proposal format v3"});
  }
  if (from < 4){
    m.schemaVersion = 4;
    m.history.push({t: now(), m: "Migrated to proposal format v4"});
  }
  return m;
}

let data, step = 0, view = "build";
let hideInternal = false;
try { hideInternal = localStorage.getItem("oncloud.hideInternal") === "1"; } catch(e){}
function applyHideInternal(){
  root.classList.toggle("hide-internal", hideInternal);
  const b = $("#btnHideInt");
  if (b){ b.textContent = hideInternal ? "Show internal" : "Hide internal"; b.classList.toggle("primary", hideInternal); }
}

function persist(){
  data.updated = now();
  let yearOne = null;
  try { yearOne = totals().yearOne; } catch(e){}
  io.saveProposal(data, yearOne);
}
function log(msg){
  const h = data.history || (data.history = []);
  const last = h[h.length - 1];
  if (last && last.m === msg && now() - last.t < 15*60*1000){ last.t = now(); return; }
  h.push({t: now(), m: msg});
  if (h.length > 200) h.splice(0, h.length - 200);
}
/* the proposal OnCloud handed over, brought up to this format */
data = migrate(io.proposal);
/* Without the costing key, the server never sends the costing: nothing to show or to save. */
if (!io.canSeeCosts){ hideInternal = true; }

/* "10%" takes a tenth off; "500" takes 500 off; blank takes nothing off. */
function discNet(gross, disc){
  const d = String(disc||"").trim();
  if (!d) return gross;
  if (/%\s*$/.test(d)) return gross * (1 - num(d) / 100);
  return Math.max(0, gross - num(d));
}
function hasDisc(disc){ return String(disc||"").trim().length > 0 && num(disc) !== 0; }

/* FX: a rate row says 1 <ccy> = rate <base>. Anything already in the base, or in a
   currency with no row, is taken at 1 so a missing rate never silently zeroes a cost. */
function fxRate(ccy, costing){
  const c = costing || (company && company.costing) || {};
  const want = String(ccy || "").trim().toUpperCase();
  const base = String(c.baseCcy || "OMR").trim().toUpperCase();
  if (!want || want === base) return 1;
  const row = (c.fx || []).filter(r => String(r.ccy||"").trim().toUpperCase() === want)[0];
  const n = row ? num(row.rate) : 0;
  return n > 0 ? n : 0;
}
/* convert into the proposal currency */
function conv(amount, from, to, costing){
  const a = num(amount);
  if (!a) return 0;
  const f = fxRate(from, costing), t = fxRate(to, costing);
  if (!f || !t) return 0;
  return a * f / t;
}
function rateFor(role, costing){
  const c = costing || (company && company.costing) || {};
  const row = (c.rateCard || []).filter(r => String(r.role||"").trim() === String(role||"").trim())[0];
  return row ? num(row.day) : 0;
}
function modelFor(name, costing){
  const c = costing || (company && company.costing) || {};
  return (c.aiModels || []).filter(m => String(m.model||"").trim() === String(name||"").trim())[0] || null;
}
function staleDays(iso){
  const t = Date.parse(String(iso||""));
  if (!isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

/* counts, not money: no currency minor units */
const qty = (n, dp) => { const v = num(n); return v.toLocaleString(undefined, {minimumFractionDigits: dp||0, maximumFractionDigits: dp||0}); };
/* Numbers already written into the proposal, offered to the costing rows so a
   licence count or a project length is never typed in twice. */
/* How many years the costing runs for. The commercial section already carries the
   initial term in months, so that is the default; the internal override is for when
   you want to see further out than you have contracted. */
function termYears(d){
  const own = num((d.internal || {}).termYears);
  if (own > 0) return Math.min(10, Math.round(own));
  const months = num(d.initialTerm);
  if (months > 0) return Math.min(10, Math.max(1, Math.ceil(months / 12)));
  return 3;
}
function projectMonths(d){
  const tl = (d.timeline || []).map(r => ({s: Date.parse(r.start), f: Date.parse(r.finish)}))
    .filter(r => isFinite(r.s) && isFinite(r.f) && r.f >= r.s);
  if (!tl.length) return 0;
  const a = Math.min.apply(null, tl.map(r => r.s)), b = Math.max.apply(null, tl.map(r => r.f));
  return Math.max(1, Math.round((b - a) / (30.44 * 86400000)));
}
function linkOpts(d){
  const out = [{code: "", label: "\u2014", value: null}];
  (d.subs || []).forEach(function(r, i){
    out.push({code: "sub:" + i, label: "Qty \u00b7 " + (String(r.line||"").trim() || ("line " + (i+1))), value: num(r.qty)});
  });
  if ((d.subs || []).length > 1)
    out.push({code: "sub:*", label: "Qty \u00b7 all lines", value: (d.subs||[]).reduce((a, r) => a + num(r.qty), 0)});
  const P = projectMonths(d), T = termYears(d) * 12;
  /* short labels so they stay distinguishable in a narrow cell */
  out.push({code: "months",      label: "Project months", value: P});
  out.push({code: "termMonths",  label: "Term months", value: T});
  out.push({code: "engagement",  label: "Project + term months", value: P + T});
  out.push({code: "termYears",   label: "Term years", value: termYears(d)});
  return out;
}
function linkVal(code, d){
  if (!code) return null;
  const hit = linkOpts(d).filter(o => o.code === code)[0];
  return hit ? hit.value : null;
}
/* a linked field uses the proposal's number; an unlinked one uses what was typed */
function linked(row, key, d){
  const v = linkVal(row[key + "Link"], d);
  return v === null ? num(row[key]) : v;
}
/* A recurring cost spread across the engagement.
   MONTHS blank  — runs every year of the term, nothing charged to the build.
   MONTHS set    — the first months of cover that fall inside the build window are
                   charged to the project, and the rest fall into the run years in
                   order, so "project + subscription" prices the whole engagement. */
function spreadRow(amount, basis, months, projMonths, years){
  const out = {build: 0, run: new Array(Math.max(1, years)).fill(0)};
  const m = num(months);
  if (basis === "One-off"){ out.build = amount; return out; }

  const perMonth = basis === "Annual" ? amount / 12 : amount;
  if (!(m > 0)){
    const yearly = basis === "Annual" ? amount : amount * 12;
    for (let y = 0; y < out.run.length; y++) out.run[y] = yearly;
    return out;
  }
  const buildM = Math.min(m, Math.max(0, projMonths));
  out.build = perMonth * buildM;
  let rest = m - buildM;
  for (let y = 0; y < out.run.length && rest > 0.0000001; y++){
    const take = Math.min(12, rest);
    out.run[y] = perMonth * take;
    rest -= take;
  }
  return out;
}

const ALLOC = v => { const n = num(v); return (String(v||"").trim() === "" ) ? 1 : Math.max(0, n) / 100; };

/* Every internal cost, rolled up in the proposal's own currency.
   One-off costs land in the project P&L; recurring costs land in the run P&L. */
function costsFor(d, costing){
  const c = costing || (typeof company !== "undefined" && company.costing) || {};
  const I = (d && d.internal) || {};
  const ccy  = d.currency || c.baseCcy || "OMR";
  const base = c.baseCcy || "OMR";
  const missingFx = {};
  const take = (amount, from) => {
    const f = String(from || base).trim().toUpperCase();
    if (num(amount) && !fxRate(f, c)) missingFx[f] = true;
    return conv(amount, f, ccy, c);
  };

  /* labour */
  const byPhase = {}, byRole = {}, noRate = [];
  let days = 0, labourBase = 0;
  (I.mandays || []).forEach(function(r){
    const dd = num(r.days);
    const own = num(r.day);
    const card = rateFor(r.role, c);
    const dayCost = own > 0 ? own : card;
    if (dd > 0 && dayCost <= 0) noRate.push(String(r.phase||"") + " / " + String(r.role||""));
    const amt = dd * dayCost;
    days += dd;
    labourBase += amt;
    const pk = String(r.phase||"").trim() || "Unassigned";
    const rk = String(r.role||"").trim() || "Unassigned";
    byPhase[pk] = (byPhase[pk] || 0) + amt;
    byRole[rk]  = (byRole[rk]  || 0) + amt;
  });
  const overheadBase = days * num(c.overheadPerManday);
  const labour = take(labourBase + overheadBase, base);
  const contPct = String(I.contingency ?? "").trim() !== "" ? num(I.contingency) : num(c.contingency);
  const contingency = labour * contPct / 100;

  const years = termYears(d);
  const P = projectMonths(d);
  const zeros = () => new Array(years).fill(0);
  const add = (acc, sp) => { acc.once += sp.build; sp.run.forEach((v, y) => { if (y < years) acc.year[y] += v; }); };

  /* infrastructure */
  const inf = {once: 0, year: zeros()};
  (I.infra || []).forEach(function(r){
    const q = Math.max(0, linked(r, "qty", d)) || 1;
    const a = take(r.amount, r.ccy) * q * ALLOC(r.alloc);
    add(inf, spreadRow(a, String(r.basis || "Monthly"), linked(r, "months", d), P, years));
  });

  /* licences — a pass-through is billed on at cost and carries no margin */
  const lic = {once: 0, year: zeros()}, pas = {once: 0, year: zeros()};
  (I.licences || []).forEach(function(r){
    const q = Math.max(0, linked(r, "qty", d)) || 1;
    const a = take(r.amount, r.ccy) * q;
    const sp = spreadRow(a, String(r.basis || "Annual"), linked(r, "months", d), P, years);
    add((r.pass === true || r.pass === "Yes") ? pas : lic, sp);
  });

  /* other direct costs */
  const oth = {once: 0, year: zeros()};
  (I.other || []).forEach(function(r){
    const a = take(r.amount, r.ccy);
    add(oth, spreadRow(a, String(r.basis || "One-off"), num(r.months), P, years));
  });

  const infraOnce = inf.once, infraYear = inf.year[0] || 0;
  const licOnce = lic.once, licYear = lic.year[0] || 0;
  const passOnce = pas.once, passYear = pas.year[0] || 0;
  const otherOnce = oth.once, otherYear = oth.year[0] || 0;

  /* AI bought as a plan rather than by the token */
  const aip = {once: 0, year: zeros()};
  (I.aiPackages || []).forEach(function(r){
    const a = take(r.amount, r.ccy) * ALLOC(r.alloc);
    add(aip, spreadRow(a, String(r.basis || "Monthly"), linked(r, "months", d), P, years));
  });
  const aiPackOnce = aip.once, aiPackYear = aip.year[0] || 0;

  const ai = aiCostsFor(d, c);
  Object.keys(ai.missingFx || {}).forEach(function(k){ missingFx[k] = true; });

  /* support capacity comes from the hours block; the cost comes from days booked */
  const supportDays = num(I.supportDays);
  const supportRate = rateFor(I.supportRole, c);
  const supportYear = take(supportDays * 12 * supportRate, base);

  /* payment and transaction fees */
  const feePct = num((I.fees||{}).pct), feeFixed = num((I.fees||{}).fixed), feeTx = num((I.fees||{}).tx);
  const feeFixedYear = take(feeFixed * feeTx * 12, ccy);

  const oneOffBase = labour + contingency + infraOnce + licOnce + ai.delivery + aiPackOnce + otherOnce;
  const riskPct = num((I.risk||{}).pct), riskAmt = take((I.risk||{}).amount, ccy);
  const risk = riskAmt > 0 ? riskAmt : oneOffBase * riskPct / 100;

  return {
    ccy: ccy, base: base,
    days: days, byPhase: byPhase, byRole: byRole, noRate: noRate,
    labour: labour, overhead: take(overheadBase, base), contPct: contPct, contingency: contingency,
    infraOnce: infraOnce, infraYear: infraYear,
    licOnce: licOnce, licYear: licYear, passOnce: passOnce, passYear: passYear,
    otherOnce: otherOnce, otherYear: otherYear,
    years: years, projMonths: P,
    infraYearN: inf.year, licYearN: lic.year, passYearN: pas.year, otherYearN: oth.year, aiPackYearN: aip.year,
    aiTokensY: ai.productByYear,
    aiPackOnce: aiPackOnce, aiPackYear: aiPackYear,
    aiProduct: ai.product + aiPackYear,
    aiProductY: ai.productByYear.map((v, i) => v + (aip.year[i] || 0)),
    aiDelivery: ai.delivery + aiPackOnce, aiRows: ai.rows, aiSens: ai.sens,
    supportDays: supportDays, supportRate: supportRate, supportYear: supportYear,
    feePct: feePct, feeFixedYear: feeFixedYear,
    risk: risk,
    oneOff: oneOffBase + risk,
    missingFx: Object.keys(missingFx)
  };
}

/* one year of a row, however many years the term runs for */
function yearOf(row, i){ return (row.byYear && row.byYear[i] !== undefined) ? row.byYear[i] : 0; }

/* AI cost is tokens x list price / 1,000,000, with the cached share priced separately,
   growth compounded month by month, and the model's own currency converted at the end. */
function aiCostsFor(d, costing){
  const c = costing || (typeof company !== "undefined" && company.costing) || {};
  const I = (d && d.internal) || {};
  const ccy = d.currency || c.baseCcy || "OMR";
  const missingFx = {};
  const px = function(m, field){
    const f = String(m.ccy || c.baseCcy || "OMR").trim().toUpperCase();
    if (num(m[field]) && !fxRate(f, c)) missingFx[f] = true;
    return conv(num(m[field]), f, ccy, c);
  };

  const rows = (I.aiProduct || []).map(function(r){
    const m = modelFor(r.model, c);
    const pin = m ? px(m, "in") : 0, pout = m ? px(m, "out") : 0, pcache = m ? px(m, "cached") : 0;
    const reqM0  = linked(r, "users", d) * num(r.reqs);
    const cache  = Math.min(100, Math.max(0, num(r.cache))) / 100;
    const inTok  = num(r.inTok), outTok = num(r.outTok);
    const growth = num(r.growth) / 100;
    const limit  = num(r.months) > 0 ? num(r.months) : Infinity;
    const perReq = (inTok * ((1 - cache) * pin + cache * pcache) + outTok * pout) / 1e6;
    const monthCost = mi => (mi < limit) ? reqM0 * Math.pow(1 + growth, mi) * perReq : 0;
    const monthReq  = mi => (mi < limit) ? reqM0 * Math.pow(1 + growth, mi) : 0;
    const yr = y => { let a = 0; for (let mi = y*12; mi < y*12 + 12; mi++) a += monthCost(mi); return a; };
    const byYear = [];
    for (let i = 0; i < termYears(d); i++) byYear.push(yr(i));
    return {
      byYear: byYear,
      feature: r.feature, model: r.model, hasModel: !!m,
      users: linked(r, "users", d), reqM0: reqM0, tokM0: monthReq(0) * (inTok + outTok), perReq: perReq,
      m0: monthCost(0), y1: yr(0), y2: yr(1), y3: yr(2),
      missing: !m || !(inTok > 0 || outTok > 0) || !(reqM0 > 0),
      linkedUsers: !!r.usersLink
    };
  });

  let delivery = 0;
  (I.aiDelivery || []).forEach(function(r){
    const m = modelFor(r.model, c);
    const months = Math.max(0, linked(r, "months", d));
    const alloc = ALLOC(r.alloc);
    const perMonth = m
      ? (num(r.inTok) * px(m, "in") + num(r.outTok) * px(m, "out")) / 1e6
      : (function(){ const f = String(r.ccy || c.baseCcy || "OMR").trim().toUpperCase();
                     if (num(r.monthly) && !fxRate(f, c)) missingFx[f] = true;
                     return conv(r.monthly, f, ccy, c); })();
    delivery += perMonth * months * alloc;
  });

  const years = termYears(d);
  const y = [];
  for (let i = 0; i < years; i++) y.push(rows.reduce((a, r) => a + yearOf(r, i), 0));
  return {
    product: y[0] || 0, productByYear: y, delivery: delivery, rows: rows,
    sens: [(y[0]||0) * 0.5, (y[0]||0), (y[0]||0) * 2],
    missingFx: missingFx
  };
}

/* Revenue comes out of the commercial section, never re-entered. VAT is excluded.
   The total discount is spread across one-off and recurring in proportion. */
function plFor(d, costing){
  const c = costing || (typeof company !== "undefined" && company.costing) || {};
  const t = totalsFor(d);
  const k = costsFor(d, c);
  const ratio = t.gross ? t.net / t.gross : 1;
  const revOnce = t.oneoff * ratio;
  const revRun  = t.subs  * ratio;

  const projRev  = revOnce + k.passOnce;
  const projCost = k.oneOff + k.passOnce;
  const project  = {rev: projRev, cost: projCost, gp: projRev - projCost,
                    margin: projRev ? (projRev - projCost) / projRev * 100 : 0};

  const feeOn = v => v * k.feePct / 100;
  const years = termYears(d);
  const run = Array.from({length: years}, (_, i) => i).map(function(i){
    const rev = revRun + (k.passYearN[i] || 0);
    const collected = (i === 0 ? revOnce + revRun : revRun) + (k.passYearN[i] || 0);
    const fees = feeOn(collected) + k.feeFixedYear;
    const cost = (k.infraYearN[i] || 0) + (k.licYearN[i] || 0) + (k.passYearN[i] || 0) +
                 (k.aiProductY[i] || 0) + (k.otherYearN[i] || 0) + k.supportYear + fees;
    return {year: i + 1, rev: rev, cost: cost, fees: fees, gp: rev - cost, margin: rev ? (rev - cost) / rev * 100 : 0,
            infra: k.infraYearN[i] || 0, lic: (k.licYearN[i] || 0) + (k.passYearN[i] || 0), other: k.otherYearN[i] || 0};
  });

  const revT  = project.rev  + run.reduce((a, r) => a + r.rev, 0);
  const costT = project.cost + run.reduce((a, r) => a + r.cost, 0);
  const cash = cashFor(d, c, {revOnce: revOnce, revRun: revRun, k: k, run: run});

  return {
    ccy: k.ccy, k: k, t: t, ratio: ratio, revOnce: revOnce, revRun: revRun,
    years: years, project: project, run: run,
    total: {rev: revT, cost: costT, gp: revT - costT, margin: revT ? (revT - costT) / revT * 100 : 0},
    dayRate: k.days ? revOnce / k.days : 0,
    cash: cash,
    floor: floorFor(d, c, k, revOnce, revRun, run)
  };
}

/* The lowest price that still clears the target margin. Transaction fees scale with
   revenue, so the recurring floor is solved rather than divided. */
function floorFor(d, c, k, revOnce, revRun, run){
  const m = Math.min(99, Math.max(0, num(c.targetMargin))) / 100;
  const onceCost = k.oneOff;                       /* pass-through excluded both sides */
  const onceFloor = (1 - m) > 0 ? onceCost / (1 - m) : 0;

  const f = k.feePct / 100;
  const fixedRun = (k.infraYearN[0] || 0) + (k.licYearN[0] || 0) + (k.aiProductY[0] || 0) +
                   (k.otherYearN[0] || 0) + k.supportYear + k.feeFixedYear + f * revOnce;
  const denom = 1 - f - m;
  const runFloor = denom > 0 ? fixedRun / denom : 0;
  const scale = revRun > 0 ? runFloor / revRun : 0;

  const lines = (d.subs || []).map(function(r){
    const unit = num(r.unit);
    return {line: r.line, qty: num(r.qty), unit: unit, floor: scale > 0 ? unit * scale : 0};
  });
  return {target: m * 100, onceFloor: onceFloor, runFloor: runFloor, scale: scale, lines: lines, solvable: denom > 0};
}

/* Month-by-month cash: milestone inflows against the cost of delivering.
   Labour follows its phase on the timeline when the dates parse, otherwise it is
   spread evenly across the delivery window. Recurring costs start at go-live. */
function cashFor(d, c, ctx){
  const k = ctx.k;
  const I = d.internal || {};
  const tl = (d.timeline || []).filter(r => String(r.phase||"").trim());
  const parsed = tl.map(r => ({phase: String(r.phase||"").trim(), s: Date.parse(r.start), f: Date.parse(r.finish)}));
  const dated = parsed.filter(r => isFinite(r.s) && isFinite(r.f) && r.f >= r.s);
  const start = dated.length ? Math.min.apply(null, dated.map(r => r.s)) : Date.now();
  const mIdx = ms => Math.max(0, Math.round((ms - start) / (30.44 * 86400000)));
  const goLive = dated.length ? mIdx(Math.max.apply(null, dated.map(r => r.f))) : 3;
  const horizon = Math.max(12, goLive + 12 * termYears(d));

  const out = new Array(horizon + 1).fill(0);
  const inn = new Array(horizon + 1).fill(0);

  /* labour and contingency, by phase */
  /* byPhase holds rate-card cost only: the overhead per manday and the contingency
     sit outside it, so scale the phases up to the labour line in the P&L */
  const phaseBase = Object.keys(k.byPhase).reduce((a, p) => a + conv(k.byPhase[p], k.base, k.ccy, c), 0);
  const lift = phaseBase ? (k.labour + k.contingency) / phaseBase : 1;
  const base = fxRate(k.base, c) ? 1 : 1;
  Object.keys(k.byPhase).forEach(function(ph){
    const amt = conv(k.byPhase[ph], k.base, k.ccy, c) * lift;
    const hit = dated.filter(r => r.phase === ph)[0];
    let a = 0, b = Math.min(horizon, goLive);
    if (hit){ a = mIdx(hit.s); b = Math.min(horizon, mIdx(hit.f)); }
    const span = Math.max(1, b - a + 1);
    for (let i = a; i <= b && i <= horizon; i++) out[i] += amt / span;
  });

  /* everything else that is one-off lands at the start of delivery */
  out[0] += k.infraOnce + k.licOnce + k.passOnce + k.aiDelivery + k.otherOnce + k.risk;

  /* recurring costs begin at go-live */
  for (let i = goLive; i <= horizon; i++){
    const yr = Math.min(ctx.run.length - 1, Math.floor((i - goLive) / 12));
    const r = ctx.run[yr] || ctx.run[0];
    out[i] += ((k.infraYearN[yr] || 0) + (k.licYearN[yr] || 0) + (k.passYearN[yr] || 0) +
               (k.aiProductY[yr] || 0) + (k.otherYearN[yr] || 0) + k.supportYear + r.fees) / 12;
  }

  /* milestone inflows, shifted by the invoice terms: money arrives when it is paid,
     not when the invoice is raised */
  const lag = Math.round(num(d.payDays) / 30.44);
  const ms = (d.milestones || []).filter(r => String(r.name||"").trim() || num(r.share));
  ms.forEach(function(r, i){
    const set = String((I.msMonths||[])[i] ?? "").trim() !== "";
    const raised = set ? num((I.msMonths || [])[i]) : Math.round(goLive * (i + 1) / Math.max(1, ms.length));
    const at = Math.min(horizon, raised + lag);
    inn[at] += ctx.revOnce * num(r.share) / 100;
  });
  /* the subscription is invoiced at go-live and on each anniversary inside the term */
  for (let yr = 0; yr < termYears(d); yr++){
    const at = goLive + 12 * yr + lag;
    if (at <= horizon) inn[at] += ctx.revRun + k.passYear;
  }

  let cum = 0, low = 0, lowAt = 0, be = null;
  const months = [];
  for (let i = 0; i <= horizon; i++){
    cum += inn[i] - out[i];
    if (cum < low){ low = cum; lowAt = i; }
    if (be === null && cum >= 0 && (inn[i] || out[i])) be = i;
    months.push({m: i, in: inn[i], out: out[i], cum: cum});
  }
  return {months: months, low: low, lowAt: lowAt, breakEven: be, goLive: goLive, horizon: horizon,
          dated: dated.length > 0, lag: lag};
}

/* The plan, month by month and split the same way the actuals are entered, so the
   two can be set side by side. Month zero is the start of the dated timeline. */
function monthKeyOf(ms){
  const dt = new Date(ms);
  return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0");
}
function keyToIndex(start, key){
  const m = /^(\d{4})-(\d{1,2})/.exec(String(key || ""));
  if (!m) return -1;
  const s = new Date(start);
  return (+m[1] - s.getFullYear()) * 12 + (+m[2] - 1 - s.getMonth());
}
function indexToKey(start, i){
  const s = new Date(start);
  return monthKeyOf(new Date(s.getFullYear(), s.getMonth() + i, 1).getTime());
}

const COST_KEYS = ["people","infra","lic","ai","fees","other"];
function planMonths(d, costing){
  const c = costing || (typeof company !== "undefined" && company.costing) || {};
  const k = costsFor(d, c);
  const t = totalsFor(d);
  const ratio = t.gross ? t.net / t.gross : 1;
  const revOnce = t.oneoff * ratio, revRun = t.subs * ratio;
  const years = k.years;

  const tl = (d.timeline || []).map(r => ({phase: String(r.phase||"").trim(), s: Date.parse(r.start), f: Date.parse(r.finish)}))
    .filter(r => isFinite(r.s) && isFinite(r.f) && r.f >= r.s);
  const start = tl.length ? Math.min.apply(null, tl.map(r => r.s)) : Date.now();
  const mIdx = ms => Math.max(0, Math.round((ms - start) / (30.44 * 86400000)));
  const goLive = tl.length ? mIdx(Math.max.apply(null, tl.map(r => r.f))) : 3;
  const horizon = Math.max(12, goLive + 12 * years);

  const months = [];
  for (let i = 0; i <= horizon; i++){
    const o = {}; COST_KEYS.forEach(x => o[x] = 0); months.push(o);
  }

  /* people: labour and contingency follow their phase, support runs after go-live */
  /* byPhase holds rate-card cost only: the overhead per manday and the contingency
     sit outside it, so scale the phases up to the labour line in the P&L */
  const phaseBase = Object.keys(k.byPhase).reduce((a, p) => a + conv(k.byPhase[p], k.base, k.ccy, c), 0);
  const lift = phaseBase ? (k.labour + k.contingency) / phaseBase : 1;
  Object.keys(k.byPhase).forEach(function(ph){
    const amt = conv(k.byPhase[ph], k.base, k.ccy, c) * lift;
    const hit = tl.filter(r => r.phase === ph)[0];
    let a = 0, b = Math.min(horizon, goLive);
    if (hit){ a = mIdx(hit.s); b = Math.min(horizon, mIdx(hit.f)); }
    const span = Math.max(1, b - a + 1);
    for (let i = a; i <= b && i <= horizon; i++) months[i].people += amt / span;
  });
  for (let i = goLive; i <= horizon; i++) months[i].people += k.supportYear / 12;

  /* whatever is charged to the build, spread across the build months */
  const buildSpan = Math.max(1, goLive);
  const spread = (total, key) => { for (let i = 0; i < buildSpan && i <= horizon; i++) months[i][key] += total / buildSpan; };
  spread(k.infraOnce, "infra");
  spread(k.licOnce + k.passOnce, "lic");
  spread(k.aiDelivery, "ai");
  spread(k.otherOnce + k.risk, "other");

  /* and the recurring side, from go-live, at the rate of the year it falls in */
  for (let i = goLive; i <= horizon; i++){
    const y = Math.min(years - 1, Math.floor((i - goLive) / 12));
    const collected = (y === 0 ? revOnce + revRun : revRun) + (k.passYearN[y] || 0);
    const feesYear = collected * k.feePct / 100 + k.feeFixedYear;
    months[i].infra += (k.infraYearN[y] || 0) / 12;
    months[i].lic   += ((k.licYearN[y] || 0) + (k.passYearN[y] || 0)) / 12;
    months[i].ai    += (k.aiProductY[y] || 0) / 12;
    months[i].other += (k.otherYearN[y] || 0) / 12;
    months[i].fees  += feesYear / 12;
  }
  months.forEach(o => { o.total = COST_KEYS.reduce((a, x) => a + o[x], 0); });
  return {months: months, start: start, goLive: goLive, horizon: horizon, dated: tl.length > 0, ccy: k.ccy};
}

/* What it actually cost, against what it was priced to cost. */
function actualsFor(d, costing){
  const c = costing || (typeof company !== "undefined" && company.costing) || {};
  const plan = planMonths(d, c);
  const pl = plFor(d, c);

  const rows = (((d.internal || {}).actuals) || []).map(function(r){
    const i = keyToIndex(plan.start, r.month);
    const p = (i >= 0 && plan.months[i]) ? plan.months[i] : null;
    const a = {};
    COST_KEYS.forEach(x => a[x] = num(r[x]));
    a.total = COST_KEYS.reduce((s, x) => s + a[x], 0);
    return {month: String(r.month || ""), idx: i, plan: p, actual: a,
            delta: p ? a.total - p.total : null, note: String(r.note || "")};
  }).sort((x, y) => x.idx - y.idx);

  const tracked = rows.filter(r => r.idx >= 0 && r.plan);
  const planToDate   = tracked.reduce((s, r) => s + r.plan.total, 0);
  const actualToDate = tracked.reduce((s, r) => s + r.actual.total, 0);
  const byKey = {};
  COST_KEYS.forEach(function(x){
    byKey[x] = {plan: tracked.reduce((s, r) => s + r.plan[x], 0),
                actual: tracked.reduce((s, r) => s + r.actual[x], 0)};
    byKey[x].delta = byKey[x].actual - byKey[x].plan;
  });

  const forecastCost   = pl.total.cost - planToDate + actualToDate;
  const forecastMargin = pl.total.rev ? (pl.total.rev - forecastCost) / pl.total.rev * 100 : null;
  const nextIdx = tracked.length ? Math.max.apply(null, tracked.map(r => r.idx)) + 1 : 0;

  return {
    ccy: plan.ccy, plan: plan, rows: rows, byKey: byKey,
    months: tracked.length, planToDate: planToDate, actualToDate: actualToDate,
    variance: actualToDate - planToDate,
    variancePct: planToDate ? (actualToDate - planToDate) / planToDate * 100 : null,
    plannedCost: pl.total.cost, plannedMargin: pl.total.margin,
    forecastCost: forecastCost, forecastMargin: forecastMargin,
    rev: pl.total.rev, nextMonth: indexToKey(plan.start, Math.min(plan.horizon, nextIdx)),
    dated: plan.dated
  };
}

/* Internal only. Each one is a thing that would quietly cost money. */
/* The AI the client is buying, against the AI it takes to serve them. */
function aiSellFor(d, costing){
  const c = costing || (typeof company !== "undefined" && company.costing) || {};
  const t = totalsFor(d);
  const k = costsFor(d, c);
  const pick = String((d.internal || {}).aiSell || "");
  const ratio = t.gross ? t.net / t.gross : 1;
  let rev = 0, label = "", basis = "";
  const m = /^(add|sub):(\d+)$/.exec(pick);
  if (m){
    const i = +m[2];
    if (m[1] === "add"){
      const r = (d.addons || [])[i];
      if (r && r.accepted){
        rev = num(r.amount) * ratio;
        basis = (r.basis || "One-off") === "Annual" ? "a year" : "one-off";
        label = String(r.line || "");
      } else if (r){ label = String(r.line || ""); basis = "not accepted"; }
    } else {
      const r = (d.subs || [])[i];
      if (r){
        rev = discNet(num(r.qty) * num(r.unit), r.disc) * ratio;
        basis = "a year";
        label = String(r.line || "");
      }
    }
  }
  const costYear = k.aiProductY[0];
  return {picked: !!pick, label: label, basis: basis, annual: basis === "a year", rev: rev, cost: costYear,
          gp: rev - costYear, margin: rev ? (rev - costYear) / rev * 100 : null};
}

/* What AI adds to one seat, one month — the figure that tells you whether a
   per-user price covers the per-user cost. */
function perUserFor(d, costing){
  const c = costing || (typeof company !== "undefined" && company.costing) || {};
  const I = d.internal || {};
  const k = costsFor(d, c);
  const sell = aiSellFor(d, c);

  /* billable seats: linked to a subscription line by default, typed if you prefer */
  let users = linked(I, "aiUsersBase", d);
  if (!(users > 0)){
    const all = linkOpts(d).filter(o => o.code === "sub:*")[0] || linkOpts(d).filter(o => /^sub:\d+$/.test(o.code))[0];
    users = all ? all.value : 0;
  }

  const costYear  = k.aiProductY[0];
  const costMonth = costYear / 12;
  const per       = users > 0 ? costMonth / users : null;

  const sellMonth = sell.picked && sell.annual ? sell.rev / 12 : null;
  const sellPer   = (sellMonth !== null && users > 0) ? sellMonth / users : null;

  const rows = k.aiRows.map(function(r){
    return {
      feature: r.feature,
      perActive:   r.reqM0 > 0 && r.users > 0 ? r.m0 / r.users : null,
      perBillable: users > 0 ? (r.y1 / 12) / users : null
    };
  });
  const planPer = users > 0 ? (k.aiPackYear / 12) / users : null;

  return {
    users: users, costYear: costYear, costMonth: costMonth,
    perUser: per, planPerUser: planPer,
    tokenPerUser: users > 0 ? (k.aiTokensY[0] / 12) / users : null,
    sellPerUser: sellPer, sellMonth: sellMonth,
    gpPerUser: (sellPer !== null && per !== null) ? sellPer - per : null,
    marginPerUser: (sellPer !== null && per !== null && sellPer) ? (sellPer - per) / sellPer * 100 : null,
    rows: rows, ccy: k.ccy
  };
}

function flagsFor(d, costing){
  const c = costing || (typeof company !== "undefined" && company.costing) || {};
  const pl = plFor(d, c);
  const k = pl.k;
  const out = [];
  const target = num(c.targetMargin);
  if (pl.project.rev > 0 && pl.project.margin < target)
    out.push({bad: true, m: "Project margin is " + money(pl.project.margin, "x") + "%, under the " + money(target, "x") + "% target."});
  if (pl.run[0].rev > 0 && pl.run[0].margin < target)
    out.push({bad: true, m: "Year-one run margin is " + money(pl.run[0].margin, "x") + "%, under the " + money(target, "x") + "% target."});
  if (pl.cash.low < 0)
    out.push({bad: true, m: "Cash goes " + k.ccy + " " + money(-pl.cash.low, k.ccy) + " negative at month " + pl.cash.lowAt + "."});
  const fxAge = staleDays(c.fxAsOf), aiAge = staleDays(c.aiAsOf);
  if (fxAge === null) out.push({bad: false, m: "Exchange rates have no date on them."});
  else if (fxAge > 30) out.push({bad: true, m: "Exchange rates are " + fxAge + " days old."});
  if ((c.aiModels||[]).length){
    if (aiAge === null) out.push({bad: false, m: "The AI price list has no date on it."});
    else if (aiAge > 30) out.push({bad: true, m: "The AI price list is " + aiAge + " days old."});
  }
  if (k.missingFx.length) out.push({bad: true, m: "No exchange rate for " + k.missingFx.join(", ") + " — those rows count as zero."});
  if (k.noRate.length) out.push({bad: true, m: k.noRate.length + " manday row" + (k.noRate.length>1?"s have":" has") + " no day cost."});
  const badAi = k.aiRows.filter(r => r.missing).length;
  if (badAi) out.push({bad: true, m: badAi + " AI row" + (badAi>1?"s are":" is") + " missing a model or its token figures."});
  if (!pl.floor.solvable) out.push({bad: true, m: "Transaction fees plus the target margin leave nothing over — no recurring price can reach the target."});
  if (!pl.cash.dated) out.push({bad: false, m: "No dated timeline, so the cash view spreads delivery evenly instead of following the plan."});
  const act = actualsFor(d, c);
  if (act.months && act.variancePct !== null && act.variancePct > 10)
    out.push({bad: true, m: "Actual cost is running " + money(act.variancePct, "x") + "% over plan across " + act.months + " month" + (act.months === 1 ? "" : "s") + "."});
  if (act.months && act.forecastMargin !== null && act.forecastMargin < num(c.targetMargin))
    out.push({bad: true, m: "On actuals so far the margin lands at " + money(act.forecastMargin, "x") + "%, under the " + money(num(c.targetMargin), "x") + "% target."});
  const sell = aiSellFor(d, c);
  if (sell.picked && sell.margin !== null && sell.margin < 0)
    out.push({bad: true, m: "The AI you are selling costs more than it earns: " + money(-sell.gp, k.ccy) + " " + k.ccy + " short in year one."});
  if (!sell.picked && (k.aiProductY[0] > 0))
    out.push({bad: false, m: "AI costs " + k.ccy + " " + money(k.aiProductY[0], k.ccy) + " a year and no commercial line is marked as what pays for it."});
  return out;
}

function totalsFor(d){
  const subsGross = (d.subs||[]).reduce((s,r) => s + num(r.qty) * num(r.unit), 0);
  const subsNet   = (d.subs||[]).reduce((s,r) => s + discNet(num(r.qty) * num(r.unit), r.disc), 0);
  const feesGross = (d.oneoff||[]).reduce((s,r) => s + num(r.amount), 0);
  const feesNet   = (d.oneoff||[]).reduce((s,r) => s + discNet(num(r.amount), r.disc), 0);
  const integr    = (d.integrations||[]).reduce((s,r) => s + num(r.cost), 0);
  const allowance = num(d.changeAllowance);

  /* an add-on counts only once it has been accepted */
  const taken     = (d.addons||[]).filter(a => a.accepted);
  const addOnce   = taken.filter(a => (a.basis||"One-off") !== "Annual").reduce((s,a) => s + num(a.amount), 0);
  const addYear   = taken.filter(a => (a.basis||"One-off") === "Annual").reduce((s,a) => s + num(a.amount), 0);

  const subs   = subsNet + addYear;
  const fees   = feesNet + addOnce;
  const oneoff = fees + integr + allowance;      // the whole non-recurring project cost
  const gross  = subs + oneoff;
  const net    = discNet(gross, d.discountValue);
  const lineDiscount  = (subsGross - subsNet) + (feesGross - feesNet);
  const totalDiscount = gross - net;
  const vat = net * num(d.vat) / 100;
  const shareSum = (d.milestones||[]).reduce((s,r) => s + num(r.share), 0);
  return {subs, subsGross: subsGross + addYear, fees, feesGross: feesGross + addOnce,
          integr, allowance, addOnce, addYear, oneoff, gross, lineDiscount, totalDiscount,
          net, vat, yearOne: net + vat, yearTwo: subs, shareSum};
}
const totals = () => totalsFor(data);

/* Value against cost. Nothing is assumed: with no inputs the section does not exist. */
function roiFor(d){
  const hours = num(d.roiHours), rate = num(d.roiCostHour);
  const timeValue = hours * rate * 12;
  const revenue = num(d.roiRevenue), other = num(d.roiOther);
  const annual = timeValue + revenue + other;
  const t = totalsFor(d);
  const vatMul = 1 + num(d.vat) / 100;
  const recurring = t.subs * vatMul;
  const cost3 = t.yearOne + recurring * 2;
  return {
    hours, rate, timeValue, revenue, other, annual,
    yearOneCost: t.yearOne, recurring, cost3,
    payback: annual > 0 ? t.yearOne / (annual / 12) : 0,
    net3: annual * 3 - cost3,
    has: annual > 0
  };
}

/* internal: the three-year margin, or a dash when there is nothing costed yet */
function marginLabel(d){
  try {
    const pl = plFor(d);
    if (!pl.total.rev || !pl.k.days && !pl.k.infraYear && !pl.k.aiProductY[0]) return "no costs";
    return money(pl.total.margin, "x") + "% margin";
  } catch(e){ return "—"; }
}

function isLate(d){
  if (d.status !== "awaiting" || !d.valid) return false;
  const v = new Date(d.valid);
  return !isNaN(v) && v.getTime() < Date.now();
}

function fld(key, label, opts){
  opts = opts || {};
  const v = esc(data[key]);
  if (opts.area) return '<div class="field"><label for="f-'+key+'">'+label+'</label><textarea id="f-'+key+'" data-k="'+key+'" placeholder="'+esc(opts.ph||"")+'">'+v+'</textarea></div>';
  return '<div class="field"><label for="f-'+key+'">'+label+'</label><input id="f-'+key+'" data-k="'+key+'" value="'+v+'" placeholder="'+esc(opts.ph||"")+'"'+(opts.type?' type="'+opts.type+'"':'')+'></div>';
}
/* working-hours selector: a row per day, each switched on or off with its own
   from/to times, plus one button to push the first working day onto the rest */
function hoursBlock(){
  const rows = (data.hours||[]).map(function(r, i){
    const off = !r.on;
    return '<div class="hrow' + (off ? ' off' : '') + '">' +
      '<label class="hday"><input type="checkbox" data-hr="'+i+'" data-f="on"'+(off?'':' checked')+'><span>'+esc(dayFull(r.d))+'</span></label>' +
      '<input type="time" data-hr="'+i+'" data-f="from" value="'+esc(r.from||"")+'" aria-label="Opens"'+(off?' disabled':'')+'>' +
      '<span class="hdash">to</span>' +
      '<input type="time" data-hr="'+i+'" data-f="to" value="'+esc(r.to||"")+'" aria-label="Closes"'+(off?' disabled':'')+'>' +
      '<span class="hstate">'+(off ? "Closed" : "Open")+'</span>' +
    '</div>';
  }).join("");
  return '<div class="hours">'+rows+'</div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">' +
    '<button class="btn light" id="hrCopy">Copy the first open day to every open day</button></div>';
}

function rowBlock(arrKey, cols, tmpl){
  const widths = cols.map(c => c.w).join(" ") + " 32px";
  const head = '<div class="rowhead" style="grid-template-columns:'+widths+'">' + cols.map(c => "<span>"+c.h+"</span>").join("") + "<span></span></div>";
  const cell = (c, r, i) => c.opts
    ? '<select class="status" data-arr="'+arrKey+'" data-i="'+i+'" data-f="'+c.k+'"'+(c.bool?' data-bool="1"':'')+' aria-label="'+esc(c.h)+'">' +
        c.opts.map(function(o){
          const sel = c.bool ? ((r[c.k] ? "Yes" : "No") === o) : ((r[c.k] || c.opts[0]) === o);
          return '<option value="'+esc(o)+'"'+(sel?" selected":"")+'>'+esc(o)+'</option>';
        }).join("") + '</select>'
    : '<input data-arr="'+arrKey+'" data-i="'+i+'" data-f="'+c.k+'" value="'+esc(r[c.k])+'" placeholder="'+esc(c.ph||"")+'" aria-label="'+esc(c.h)+'">';
  const rows = (data[arrKey]||[]).map((r,i) =>
    '<div class="row" style="grid-template-columns:'+widths+'">' +
      cols.map(c => cell(c, r, i)).join("") +
      '<button class="del" data-del="'+arrKey+'" data-i="'+i+'" aria-label="Remove row" title="Remove row">&times;</button>' +
    '</div>').join("");
  return head + '<div class="rows">'+rows+'</div><div><button class="btn light" data-add="'+arrKey+'" data-tmpl=\''+esc(JSON.stringify(tmpl))+'\'>Add row</button></div>';
}
/* row editor bound to data.internal[key] */
function intRows(key, cols, tmpl){
  const arr = (data.internal && data.internal[key]) || [];
  const widths = cols.map(c => c.w).join(" ") + " 32px";
  const head = '<div class="rowhead" style="grid-template-columns:'+widths+'">' + cols.map(c => "<span>"+c.h+"</span>").join("") + "<span></span></div>";
  const cell = function(c, r, i){
    if (c.opts) return '<select class="status" data-ik="'+key+'" data-i="'+i+'" data-f="'+c.k+'"'+(c.bool?' data-bool="1"':'')+' aria-label="'+esc(c.h)+'">' +
      c.opts.map(function(o){
        const sel = c.bool ? ((r[c.k] === true || r[c.k] === "Yes" ? "Yes" : "No") === o) : ((r[c.k] || c.opts[0]) === o);
        return '<option value="'+esc(o)+'"'+(sel?" selected":"")+'>'+esc(o)+'</option>';
      }).join("") + '</select>';
    if (c.link){
      const code = r[c.k + "Link"] || "";
      const v = linkVal(code, data);
      return '<div class="lnkcell">' +
        '<select class="status" data-ik="'+key+'" data-i="'+i+'" data-f="'+c.k+'Link" aria-label="'+esc(c.h)+' source">' +
          linkOpts(data).map(function(o){
            return '<option value="'+esc(o.code)+'"'+(o.code === code ? " selected" : "")+'>'+esc(o.label)+'</option>';
          }).join("") + '</select>' +
        (v === null
          ? '<input data-ik="'+key+'" data-i="'+i+'" data-f="'+c.k+'" value="'+esc(r[c.k])+'" placeholder="'+esc(c.ph||"")+'" aria-label="'+esc(c.h)+'">'
          : '<input value="'+esc(qty(v, v % 1 ? 1 : 0))+'" disabled title="From the proposal" aria-label="'+esc(c.h)+'">') +
        '</div>';
    }
    if (c.type) return '<input type="'+c.type+'" data-ik="'+key+'" data-i="'+i+'" data-f="'+c.k+'" value="'+esc(r[c.k])+'" aria-label="'+esc(c.h)+'">';
    if (c.list) return '<input list="'+c.list+'" data-ik="'+key+'" data-i="'+i+'" data-f="'+c.k+'" value="'+esc(r[c.k])+'" placeholder="'+esc(c.ph||"")+'" aria-label="'+esc(c.h)+'">';
    return '<input data-ik="'+key+'" data-i="'+i+'" data-f="'+c.k+'" value="'+esc(r[c.k])+'" placeholder="'+esc(c.ph||"")+'" aria-label="'+esc(c.h)+'">';
  };
  const rows = arr.map(function(r, i){
    return '<div class="row" style="grid-template-columns:'+widths+'">' + cols.map(c => cell(c, r, i)).join("") +
      '<button class="del" data-ikdel="'+key+'" data-i="'+i+'" aria-label="Remove row">&times;</button></div>';
  }).join("");
  return head + '<div class="rows">'+rows+'</div><div><button class="btn light" data-ikadd="'+key+'" data-tmpl=\''+esc(JSON.stringify(tmpl))+'\'>Add row</button></div>';
}
function intList(key, label){
  const arr = (data.internal && data.internal[key]) || [];
  return '<div class="rows">' + arr.map(function(v, i){
    return '<div class="row" style="grid-template-columns:1fr 32px">' +
      '<input data-iklist="'+key+'" data-i="'+i+'" value="'+esc(v)+'" aria-label="'+esc(label)+'">' +
      '<button class="del" data-iklistdel="'+key+'" data-i="'+i+'" aria-label="Remove">&times;</button></div>';
  }).join("") + '</div><div><button class="btn light" data-iklistadd="'+key+'">Add ' + esc(label.toLowerCase()) + '</button></div>';
}
function modelList(){
  return '<datalist id="dlModels">' + ((company.costing||{}).aiModels||[]).map(m => '<option value="'+esc(m.model)+'">').join("") + '</datalist>';
}
function ifld(key, label, opts){
  opts = opts || {};
  const v = esc((data.internal||{})[key]);
  return '<div class="field"><label for="in-'+key+'">'+label+'</label><input id="in-'+key+'" data-ik2="'+key+'" value="'+v+'" placeholder="'+esc(opts.ph||"")+'"></div>';
}
function ifld2(group, key, label, opts){
  opts = opts || {};
  const v = esc(((data.internal||{})[group]||{})[key]);
  return '<div class="field"><label for="in-'+group+'-'+key+'">'+label+'</label><input id="in-'+group+'-'+key+'" data-ikg="'+group+'" data-f="'+key+'" value="'+v+'" placeholder="'+esc(opts.ph||"")+'"></div>';
}
function roleList(){
  return '<datalist id="dlRoles">' + ((company.costing||{}).rateCard||[]).map(r => '<option value="'+esc(r.role)+'">').join("") + '</datalist>';
}
function ccyList(){
  const c = company.costing || {};
  const all = [c.baseCcy || "OMR"].concat((c.fx||[]).map(r => r.ccy)).filter(Boolean);
  return '<datalist id="dlCcy">' + all.map(x => '<option value="'+esc(x)+'">').join("") + '</datalist>';
}

/* row editor bound to company.costing[key] — the costing tables in Settings */
function coRows(key, cols, tmpl){
  const arr = (company.costing && company.costing[key]) || [];
  const widths = cols.map(c => c.w).join(" ") + " 32px";
  const head = '<div class="rowhead" style="grid-template-columns:'+widths+'">' + cols.map(c => "<span>"+c.h+"</span>").join("") + "<span></span></div>";
  const rows = arr.map(function(r, i){
    return '<div class="row" style="grid-template-columns:'+widths+'">' +
      cols.map(function(c){
        return '<input data-cok="'+key+'" data-i="'+i+'" data-f="'+c.k+'" value="'+esc(r[c.k])+'" placeholder="'+esc(c.ph||"")+'" aria-label="'+esc(c.h)+'">';
      }).join("") +
      '<button class="del" data-codel="'+key+'" data-i="'+i+'" aria-label="Remove row">&times;</button>' +
    '</div>';
  }).join("");
  return head + '<div class="rows">'+rows+'</div><div><button class="btn light" data-coadd="'+key+'" data-tmpl=\''+esc(JSON.stringify(tmpl))+'\'>Add row</button></div>';
}
function cfld(key, label, opts){
  opts = opts || {};
  const v = esc((company.costing||{})[key]);
  return '<div class="field"><label for="cs-'+key+'">'+label+'</label><input id="cs-'+key+'" data-cs="'+key+'" value="'+v+'" placeholder="'+esc(opts.ph||"")+'"></div>';
}
function costingPanel(){
  const c = company.costing || blankCosting();
  const base = esc(c.baseCcy || "OMR");
  const fxAge = staleDays(c.fxAsOf), aiAge = staleDays(c.aiAsOf);
  const warn = (age, what) => age === null
    ? '<p class="hint">No "as of" date on the '+what+' yet.</p>'
    : (age > 30 ? '<p class="hint" style="color:var(--red,#c2384a)">The '+what+' is '+age+' days old. Check it against the source before quoting.</p>'
                : '<p class="hint">'+what.charAt(0).toUpperCase()+what.slice(1)+' set '+age+' day'+(age===1?'':'s')+' ago.</p>');
  return '<div class="internal">' +
    '<div class="int-band"><span class="tag">INTERNAL</span>' +
    '<span class="msg">Costing settings. These never appear in a proposal and never leave in a client export.</span></div>' +
    '<div class="grid2">' + cfld("baseCcy","BASE CURRENCY",{ph:"OMR"}) + cfld("targetMargin","TARGET GROSS MARGIN %",{ph:"35"}) +
      cfld("contingency","DEFAULT CONTINGENCY ON LABOUR %",{ph:"10"}) + cfld("overheadPerManday","OVERHEAD PER MANDAY ("+base+")",{ph:"0"}) +
    '</div>' +
    '<h3 style="margin-top:16px">Rate card</h3>' +
    '<p class="hint">Internal cost per day in '+base+' — what a day actually costs you, not what you sell it for.</p>' +
    coRows("rateCard",[{k:"role",h:"ROLE",w:"1.6fr",ph:"Implementation consultant"},{k:"day",h:"COST / DAY",w:".8fr",ph:"0"}],{role:"",day:""}) +
    '<h3 style="margin-top:16px">Exchange rates</h3>' +
    '<p class="hint">One row per foreign currency: 1 unit of that currency equals how many '+base+'. '+base+' itself needs no row.</p>' +
    (io.can.rates ? '<div><button class="btn light" data-pick="fx">' + esc(io.t("loadRates")) + '</button></div>' : '') +
    coRows("fx",[{k:"ccy",h:"CURRENCY",w:".7fr",ph:"USD"},{k:"rate",h:"1 UNIT = ? "+base,w:"1fr",ph:"0.385"}],{ccy:"",rate:""}) +
    '<div class="grid2">' + cfld("fxAsOf","RATES AS OF",{ph:"2026-10-26"}) + '</div>' + warn(fxAge, "exchange rates") +
    '<h3 style="margin-top:16px">AI model prices</h3>' +
    '<p class="hint">Per 1M tokens, copied from the provider\'s own pricing page. Nothing is pre-filled — a wrong price here quietly misprices every deal.</p>' +
    coRows("aiModels",[
      {k:"provider",h:"PROVIDER",w:"1fr",ph:"Anthropic"},
      {k:"model",h:"MODEL",w:"1.3fr",ph:"claude-sonnet-4-5"},
      {k:"in",h:"INPUT /1M",w:".8fr",ph:"3.00"},
      {k:"out",h:"OUTPUT /1M",w:".8fr",ph:"15.00"},
      {k:"cached",h:"CACHED IN /1M",w:".9fr",ph:"0.30"},
      {k:"ccy",h:"CCY",w:".5fr",ph:"USD"}
    ],{provider:"",model:"",in:"",out:"",cached:"",ccy:"USD"}) +
    '<div class="grid2">' + cfld("aiAsOf","PRICES AS OF",{ph:"2026-10-26"}) + '</div>' + warn(aiAge, "AI price list") +
    '</div>';
}

function listBlock(key, label){
  const rows = (data[key]||[]).map((v,i) =>
    '<div class="row" style="grid-template-columns:1fr 32px">' +
      '<input data-list="'+key+'" data-i="'+i+'" value="'+esc(v)+'" aria-label="'+esc(label)+'">' +
      '<button class="del" data-dellist="'+key+'" data-i="'+i+'" aria-label="Remove">&times;</button>' +
    '</div>').join("");
  return '<div class="rows">'+rows+'</div><div><button class="btn light" data-addlist="'+key+'">Add '+esc(label.toLowerCase())+'</button></div>';
}
/* The phase bar, drawn by hand in SVG (the hosted app loads no chart library: its content policy allows OnCloud's CDN
   only). The box is given its height up front so pagination can measure the page before the chart exists. */
function tlScaled(rows){
  const ds = rows.map(r => ({s: Date.parse(r.start), f: Date.parse(r.finish)}));
  return {ds: ds, ok: ds.length > 0 && ds.every(d => isFinite(d.s) && isFinite(d.f) && d.f >= d.s)};
}
const TL_ROW = 28;
function tlHeight(rows){
  const sc = tlScaled(rows).ok;
  return rows.length * TL_ROW + (sc ? 30 : 12) + 10;
}

function timelineBox(rows){
  const clean = rows.map(r => ({phase: String(r.phase||""), start: String(r.start||""), finish: String(r.finish||"")}));
  return '<div class="tlchart" style="height:' + tlHeight(clean) + 'px" data-tl="' + esc(JSON.stringify(clean)) + '"></div>';
}

function drawTimelines(root){
  Array.from(root.querySelectorAll(".tlchart")).forEach(function(el){
    let rows;
    try { rows = JSON.parse(el.dataset.tl || "[]"); } catch(e){ return; }
    if (rows.length) el.innerHTML = timelineSvg(rows);
  });
}

/* The units are real CSS pixels at A4 content width, so the label column, the bars
   and the axis line up instead of being scaled against each other. */
function timelineSvg(rows){
  if (!rows.length) return "";
  const W = Math.max(420, Math.round(178 * mmPx()));
  const labelW = Math.round(W * 0.26), padR = 10;
  const track = W - labelW - padR;
  const sc = tlScaled(rows), scaled = sc.ok;
  const axisH = scaled ? 30 : 12;
  const H = rows.length * TL_ROW + axisH + 10;
  const fit = (str, px) => {
    const max = Math.max(4, Math.floor(px / 5.3));
    const t = String(str || "");
    return esc(t.length > max ? t.slice(0, max - 1) + "\u2026" : t);
  };
  let min = 0, span = 1;
  if (scaled){
    min = Math.min.apply(null, sc.ds.map(d => d.s));
    span = Math.max(86400000, Math.max.apply(null, sc.ds.map(d => d.f)) - min);
  }
  const x = v => labelW + (v - min) / span * track;

  let grid = "";
  if (scaled){
    const ticks = 5;
    for (let i = 0; i <= ticks; i++){
      const v = min + span * i / ticks, px = x(v);
      const lab = new Date(v).toLocaleDateString(undefined, {day:"2-digit", month:"short"});
      grid += '<line x1="'+px.toFixed(1)+'" y1="4" x2="'+px.toFixed(1)+'" y2="'+(H-axisH+4)+'" stroke="#eceff4"/>' +
        '<text x="'+px.toFixed(1)+'" y="'+(H-axisH+20)+'" font-size="9" fill="#8a94a8" text-anchor="'+(i===0?"start":(i===ticks?"end":"middle"))+'">'+esc(lab)+'</text>';
    }
  }
  const body = rows.map(function(r, i){
    const top = 4 + i * TL_ROW;
    let x0, w;
    if (scaled){
      x0 = x(sc.ds[i].s);
      w = Math.max(4, x(Math.max(sc.ds[i].f, sc.ds[i].s + 86400000)) - x0);
    } else {
      x0 = labelW + (i / rows.length) * track;
      w = Math.max(4, track / rows.length - 6);
    }
    return (i % 2 ? '<rect x="0" y="'+top+'" width="'+W+'" height="'+TL_ROW+'" fill="#fafbfd"/>' : '') +
      '<text x="0" y="'+(top + TL_ROW/2 + 3.4)+'" font-size="9.5" fill="#566481">'+fit(r.phase, labelW - 10)+'</text>' +
      '<rect x="'+x0.toFixed(1)+'" y="'+(top + (TL_ROW-13)/2)+'" width="'+w.toFixed(1)+'" height="13" rx="2" style="fill:'+(i === 0 ? "var(--ember)" : "var(--ink-800)")+'"/>';
  }).join("");

  return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'" role="img" aria-label="Project phases over time">' +
    grid + body +
    '<line x1="'+labelW+'" y1="'+(H-axisH+4)+'" x2="'+W+'" y2="'+(H-axisH+4)+'" stroke="#e5e9f0"/>' +
    '</svg>' +
    (scaled ? "" : '<p class="m" style="font-size:8pt">' + tr("Phases are shown in order. Give every row a real date and the bar is drawn to scale.") + '</p>');
}

/* appendix rows carry an optional image, so a diagram or a form mapping actually prints */
function appendixRows(){
  const rows = (data.appendix||[]).map(function(r, i){
    return '<div class="row" style="grid-template-columns:.4fr 2fr .7fr 32px">' +
      '<input data-arr="appendix" data-i="'+i+'" data-f="ref" value="'+esc(r.ref)+'" aria-label="Ref">' +
      '<input data-arr="appendix" data-i="'+i+'" data-f="doc" value="'+esc(r.doc)+'" aria-label="Document">' +
      '<select class="status" data-arr="appendix" data-i="'+i+'" data-f="att" aria-label="Attached">' +
        ["Yes","No"].map(o => '<option value="'+o+'"'+((r.att||"Yes")===o?" selected":"")+'>'+o+'</option>').join("") +
      '</select>' +
      '<button class="del" data-del="appendix" data-i="'+i+'" aria-label="Remove row">&times;</button>' +
      '<div style="grid-column:1/-1;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
        (r.img ? '<img src="'+r.img+'" alt="" style="height:44px;border-radius:4px;border:1px solid var(--ink-200)">' : '') +
        '<input type="file" accept="image/*" data-aimg="'+i+'" style="font-size:12px">' +
        (r.img ? '<button class="btn ghost" data-aimgdel="'+i+'">Remove image</button>' : '<span class="hint">Optional image, downscaled to 200KB before saving</span>') +
      '</div></div>';
  }).join("");
  return '<div class="rowhead" style="grid-template-columns:.4fr 2fr .7fr 32px"><span>REF</span><span>DOCUMENT</span><span>ATTACHED</span><span></span></div>' +
    '<div class="rows">' + rows + '</div>' +
    '<div><button class="btn light" data-add="appendix" data-tmpl=\'' + esc(JSON.stringify({ref:"",doc:"",att:"Yes",img:""})) + '\'>Add row</button></div>';
}

/* a card title with its own on/off switch; off means the section never prints */
function cardHead(title, key, tag){
  const h = tag || "h2";
  if (!key) return '<' + h + '>' + title + '</' + h + '>';
  const on = data.sections && data.sections[key] !== false;
  return '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">' +
    '<' + h + '>' + title + '</' + h + '>' +
    '<label style="display:flex;gap:7px;align-items:center;font-size:12.5px;color:var(--ink-600);cursor:pointer">' +
    '<input type="checkbox" data-sec="' + key + '"' + (on ? " checked" : "") + '> include in the document</label></div>';
}
function roiHtml(){
  const r = roiFor(data), c = esc(data.currency||"");
  if (!r.has) return '<p class="hint">Enter at least one figure above and the value case appears here, and in the document.</p>';
  return '<div class="t"><span>Time recovered</span><span class="v">'+c+' '+money(r.timeValue)+'</span></div>' +
    '<div class="t"><span>Revenue protected or gained</span><span class="v">'+c+' '+money(r.revenue)+'</span></div>' +
    '<div class="t"><span>Other savings</span><span class="v">'+c+' '+money(r.other)+'</span></div>' +
    '<div class="t big"><span>Annual value</span><span class="v">'+c+' '+money(r.annual)+'</span></div>' +
    '<div class="t"><span>Payback on year-one cost</span><span class="v">'+esc(r.payback.toFixed(1))+' months</span></div>' +
    '<div class="t"><span>Three-year net</span><span class="v">'+c+' '+money(r.net3)+'</span></div>';
}
function totalsHtml(){
  const t = totals(), c = esc(data.currency || "");
  const disc = (t.lineDiscount || t.totalDiscount)
    ? '<div class="t"><span>Before discount</span><span class="v" style="text-decoration:line-through;color:var(--ink-400)">'+c+' '+money(t.gross + t.lineDiscount)+'</span></div>' +
      '<div class="t"><span>Discount</span><span class="v" style="color:var(--green)">− '+c+' '+money(t.lineDiscount + t.totalDiscount)+'</span></div>'
    : '';
  return '<div class="t"><span>Implementation and services</span><span class="v">'+c+' '+money(t.fees)+'</span></div>' +
    '<div class="t"><span>Integrations <span style="color:var(--ink-400)">(from technical)</span></span><span class="v">'+c+' '+money(t.integr)+'</span></div>' +
    '<div class="t"><span>Change allowance <span style="color:var(--ink-400)">(from change control)</span></span><span class="v">'+c+' '+money(t.allowance)+'</span></div>' +
    '<div class="t"><span>One-off project cost</span><span class="v">'+c+' '+money(t.oneoff)+'</span></div>' +
    '<div class="t"><span>Annual subscription</span><span class="v">'+c+' '+money(t.subs)+'</span></div>' +
    disc +
    '<div class="t"><span>VAT at '+esc(data.vat||"0")+'%</span><span class="v">'+c+' '+money(t.vat)+'</span></div>' +
    '<div class="t big"><span>Total project cost, year one</span><span class="v">'+c+' '+money(t.yearOne)+'</span></div>' +
    '<div class="t"><span>Year two onward</span><span class="v">'+c+' '+money(t.yearTwo)+' + VAT</span></div>';
}
function shareHtml(){
  const t = totals();
  const okShare = Math.round(t.shareSum) === 100;
  return 'Shares apply to the one-off total and should add to 100%. Currently <strong style="color:'+(okShare?"var(--green)":"var(--ember-ink)")+'">'+money(t.shareSum)+'%</strong>.';
}

const STEPS = [
  {n:"00", t:"Particulars",    render:stepParticulars},
  {n:"01", t:"Story",          render:stepStory},
  {n:"02", t:"Value",          render:stepValue},
  {n:"03", t:"Platform",       render:stepPlatform},
  {n:"04", t:"Technical",      render:stepTechnical},
  {n:"05", t:"Change control", render:stepChange},
  {n:"06", t:"Commercial",     render:stepCommercial},
  {n:"06i",t:"Costs (internal)",render:stepInternal, internal:true},
  {n:"07", t:"Appendix",       render:stepAppendix},
  {n:"08", t:"History",        render:stepHistory},
  {n:"09", t:"Review",         render:stepReview}
];

function stepStory(){
  return '<div class="card">' + cardHead("Executive summary", "exec") +
    '<p class="hint">Composed from these fields plus the timeline, the year-one total and the ask. Printed on its own page, right after the cover. Write an override only if the composed version will not do.</p>' +
    fld("problem","THE PROBLEM",{area:true, ph:"What is going wrong today, in their words."}) +
    fld("outcome","THE OUTCOME",{area:true, ph:"What is true once this is done."}) +
    fld("execOverride","OVERRIDE (OPTIONAL)",{area:true, ph:"Leave blank to use the composed summary."}) +
    '</div>' +
    '<div class="card">' + cardHead("Their situation today", "situation", "h3") +
    '<p class="hint">What happens now, what it costs them, and who carries it. Cost can be money, hours, risk or reputation — whatever they said.</p>' +
    rowBlock("situation",[
      {k:"pain",h:"WHAT HAPPENS NOW",w:"1.5fr",ph:"Month-end reconciled by hand across four systems"},
      {k:"cost",h:"WHAT IT COSTS",w:"1.4fr",ph:"Nine working days a month"},
      {k:"who",h:"WHO FEELS IT",w:"1fr",ph:"Finance team"}
    ],{pain:"",cost:"",who:""}) + '</div>' +
    '<div class="card">' + cardHead("Outcomes we commit to", "outcomes", "h3") +
    '<p class="hint">Only commit to what you can measure and are willing to be held to. A target with no baseline is not a commitment.</p>' +
    rowBlock("outcomes",[
      {k:"outcome",h:"OUTCOME",w:"1.5fr",ph:"Faster month-end close"},
      {k:"measure",h:"MEASURE",w:"1fr",ph:"Working days"},
      {k:"baseline",h:"TODAY",w:".6fr",ph:"9"},
      {k:"target",h:"TARGET",w:".6fr",ph:"3"},
      {k:"when",h:"BY WHEN",w:".9fr",ph:"Q2 after go-live"}
    ],{outcome:"",measure:"",baseline:"",target:"",when:""}) + '</div>' +
    '<div class="card">' + cardHead("Experience by person", "experience", "h3") +
    '<p class="hint">The moment each role actually lives through, and what changes in it. This is the section that makes a proposal feel written for them.</p>' +
    rowBlock("experience",[
      {k:"person",h:"WHO",w:"1fr",ph:"Warehouse supervisor"},
      {k:"moment",h:"THE MOMENT THAT MATTERS",w:"1.5fr",ph:"Receiving a delivery at 6am"},
      {k:"change",h:"WHAT CHANGES",w:"1.5fr",ph:"Scans it once; finance sees it before the office opens"}
    ],{person:"",moment:"",change:""}) + '</div>';
}
function stepValue(){
  return '<div class="card">' + cardHead("Value and payback", "roi") +
    '<p class="hint">Use the client\'s own figures. Anything left blank is left out of the calculation and out of the document.</p>' +
    '<div class="grid2">' +
      fld("roiHours","HOURS SAVED PER MONTH") +
      fld("roiCostHour","COST PER HOUR") +
      fld("roiRevenue","REVENUE PROTECTED OR GAINED, PER YEAR") +
      fld("roiOther","OTHER SAVINGS, PER YEAR") +
    '</div>' +
    '<div class="totals" id="roiBox">' + roiHtml() + '</div>' +
    '<p class="hint">Payback is the year-one cost divided by a month of value. Three-year net is three years of value less year one plus two renewals.</p>' +
    '</div>' +
    '<div class="card">' + cardHead("Why " + esc(company.name || "us"), "why", "h3") +
    '<p class="hint">Pre-filled from the company profile. Edit them here for this client; the profile stays as it is.</p>' +
    rowBlock("why",[
      {k:"title",h:"DIFFERENTIATOR",w:"1.2fr"},
      {k:"detail",h:"ONE LINE",w:"2fr"}
    ],{title:"",detail:""}) + '</div>';
}

function stepParticulars(){
  return '<div class="card"><h2>Particulars</h2>' +
    '<p class="hint">These appear on the cover and in every page footer.</p>' +
    linksBar() +
    '<div class="grid2">' +
      fld("client","CLIENT LEGAL NAME",{ph:"Al Manara Trading LLC"}) +
      fld("attention","ATTENTION",{ph:"Name, role"}) +
      fld("preparedBy","PREPARED BY",{ph:"Your name"}) +
      fld("role","YOUR ROLE",{ph:"Founder"}) +
      fld("ref","PROPOSAL REFERENCE") + fld("version","VERSION") +
      fld("issued","ISSUE DATE",{type:"date"}) + fld("valid","VALID UNTIL",{type:"date"}) +
    '</div>' +
    '<div class="grid2" style="max-width:700px">' +
    '<div class="field"><label for="f-lang">PROPOSAL LANGUAGE</label>' +
    '<select class="status" id="f-lang" data-k="lang">' +
      [["en","English"],["ar","العربية (right to left)"],["bi","Bilingual — cover and summary in both"]]
        .map(function(o){ return '<option value="'+o[0]+'"'+((data.lang||"en")===o[0]?" selected":"")+'>'+esc(o[1])+'</option>'; }).join("") +
    '</select></div>' +
    '<div class="field"><label for="f-status">STATUS</label>' +
    '<select class="status" id="f-status" data-status>' +
      STATUSES.map(s => '<option value="'+s.k+'"'+(data.status===s.k?" selected":"")+'>'+esc(s.label)+'</option>').join("") +
    '</select></div></div>' +
    '<p class="hint">Field content is printed exactly as you type it — nothing is translated for you. Only the fixed labels change language.</p></div>';
}
function stepPlatform(){
  return '<div class="card"><h2>Section 01 — the platform</h2>' +
    '<p class="hint">The headline is the argument of the whole proposal, written for this client.</p>' +
    fld("headline","HEADLINE",{area:true, ph:"Al Manara runs finance, people and customers on one system — and keeps the data in Oman."}) +
    fld("subline","SUPPORTING LINE") +
    fld("understanding","UNDERSTANDING OF THE REQUIREMENT",{area:true, ph:"Restate what they told you, in their words and with their numbers."}) +
    '<div class="grid4">' + fld("entities","ENTITIES") + fld("users","USERS") + fld("modules","MODULES") + fld("goLive","TARGET GO-LIVE") + '</div></div>' +
    '<div class="card"><h2>Capabilities</h2><p class="hint">Only what this client asked about. Status is the honest one: Live, or the quarter it lands.</p>' +
    rowBlock("capabilities",[
      {k:"name",h:"CAPABILITY",w:"1.1fr"},
      {k:"what",h:"WHAT IT DOES FOR THEM",w:"1.9fr"},
      {k:"status",h:"STATUS",w:".9fr",opts:["Live","In this project","Roadmap"]},
      {k:"due",h:"DUE",w:".6fr",ph:"Q2 2027"}
    ],{name:"",what:"",status:"Live",due:""}) +
    '<p class="hint"><strong>Live</strong> exists today. <strong>In this project</strong> is being built for them and is priced in section 2. <strong>Roadmap</strong> needs a quarter in the due column.</p>' +
    '</div>';
}
function stepTechnical(){
  return '<div class="card"><h2>Section 02 — technical</h2>' +
    fld("techLead","OPENING LINE",{area:true, ph:"Goes live on 4 modules across 3 legal entities by 1 March 2027."}) +
    '<h3>Scope of work</h3><p class="hint">Anything left blank in the out-of-scope column will be assumed included.</p>' +
    rowBlock("scope",[{k:"ref",h:"REF",w:".6fr"},{k:"work",h:"WORKSTREAM",w:"1fr"},{k:"del",h:"DELIVERED",w:"1.6fr"},{k:"owner",h:"OWNER",w:".6fr"},{k:"out",h:"OUT OF SCOPE",w:"1fr"}],{ref:"SOW-0",work:"",del:"",owner:"OnCloud",out:""}) +
    '</div><div class="card"><h3>Deliverables</h3><p class="hint">Each needs a named accepting role, not a department.</p>' +
    rowBlock("deliverables",[{k:"name",h:"DELIVERABLE",w:"1.8fr"},{k:"fmt",h:"FORMAT",w:".6fr"},{k:"due",h:"DUE",w:".7fr"},{k:"by",h:"ACCEPTED BY",w:"1fr"}],{name:"",fmt:"Doc",due:"",by:""}) +
    '</div><div class="card"><h3>Hosting and residency</h3><div class="grid2">' +
      fld("region","HOSTING REGION",{ph:"om-mct-1, Muscat"}) + fld("backups","BACKUPS",{ph:"Daily, retained 35 days"}) +
      fld("rpo","RECOVERY POINT OBJECTIVE (RPO)",{ph:"15 minutes"}) + fld("rto","RECOVERY TIME OBJECTIVE (RTO)",{ph:"4 hours"}) +
      fld("availability","AVAILABILITY TARGET",{ph:"99.9%"}) + fld("certs","CERTIFICATIONS",{ph:"None yet, targeting ISO 27001"}) +
    '</div></div><div class="card"><h3>Integrations</h3>' +
    '<p class="hint">Only systems named here are in scope. Costs are entered here but printed in the commercial section, one line per system — the technical section stays free of pricing.</p>' +
    rowBlock("integrations",[
      {k:"system",h:"SYSTEM",w:"1.3fr",ph:"Thawani"},
      {k:"direction",h:"DIRECTION",w:".9fr",opts:["Two-way","Inbound","Outbound"]},
      {k:"method",h:"METHOD",w:".9fr",opts:["API","File","Plugin","Webhook"]},
      {k:"provider",h:"ACCESS FROM",w:".8fr",opts:["Client","OnCloud","Third party"]},
      {k:"cost",h:"COST",w:".7fr"}
    ],{system:"",direction:"Two-way",method:"API",provider:"Client",cost:""}) +
    '</div><div class="card"><h3>Assumptions</h3>' +
    '<p class="hint">What has to be true for the plan and the price to hold. An assumption that proves wrong becomes a change request.</p>' +
    listBlock("assumptions","Assumption") +
    '</div><div class="card"><h3>Exclusions</h3>' +
    '<p class="hint">What is explicitly not included. This is the list that prevents an argument in month three.</p>' +
    listBlock("exclusions","Exclusion") +
    '</div><div class="card">' + cardHead("What we need from you", "obligations", "h3") +
    '<p class="hint">Dependencies the client owns, separate from assumptions. Every row here is a date the timeline rests on.</p>' +
    rowBlock("obligations",[
      {k:"item",h:"ITEM",w:"1.8fr",ph:"Trial balance export for all entities"},
      {k:"by",h:"NEEDED BY",w:".9fr",ph:"Week 2"},
      {k:"owner",h:"OWNER",w:"1fr",ph:"Name, role"}
    ],{item:"",by:"",owner:""}) + '</div>' +
    '<div class="card">' + cardHead("Timeline", "timelineBar", "h3") +
    '<p class="hint">The switch controls the drawn phase bar. The table prints either way. Use real dates and the bar is drawn to scale.</p>' +
    rowBlock("timeline",[{k:"phase",h:"PHASE",w:"1fr"},{k:"start",h:"START",w:".8fr"},{k:"finish",h:"FINISH",w:".8fr"},{k:"gate",h:"GATE",w:"1.4fr"}],{phase:"",start:"",finish:"",gate:""}) +
    '</div>';
}
function stepChange(){
  return '<div class="card"><h2>Section 03 — change control</h2>' +
    '<p class="hint">Sits between the scope and the price on purpose: it is the clause both sides reach for when the project moves.</p>' +
    fld("changeIntro","HOW CHANGES ARE HANDLED",{area:true}) +
    '<div class="grid2">' +
      fld("changeApprover","WHO APPROVES, CLIENT SIDE",{ph:"Name, role"}) +
      fld("changeTurnaround","QUOTE TURNAROUND",{ph:"5 working days"}) +
      fld("changeDayRate","DAY RATE") +
      fld("changeHourRate","HOURLY RATE") +
      fld("changeAllowance","CHANGE ALLOWANCE",{ph:"Leave blank for none"}) +
    '</div>' +
    '<p class="hint">An allowance is a pre-agreed budget for changes, drawn down against the rates above. It is added to the project cost in the commercial section; leave it blank and nothing is added.</p>' +
    '</div><div class="card"><h3>What counts as a change</h3>' +
    '<p class="hint">Be specific. A vague trigger list is the same as no change control at all.</p>' +
    listBlock("changeTriggers","Trigger") + '</div>';
}
function stepCommercial(){
  return '<div class="card"><h2>Section 04 — commercial</h2>' +
    '<div class="grid4">' + fld("currency","CURRENCY") + fld("vat","VAT %") + fld("tier","PLAN TIER",{ph:"Growth"}) + '</div>' +
    '<h3>Subscription lines</h3><p class="hint">Annual value is quantity × unit price, recomputed as you type. Billing is <em>in advance</em> (charged at the start of the term) or <em>in arrears</em> (charged at the end).</p>' +
    pickBar("subs") + rowBlock("subs",[
      {k:"line",h:"LINE",w:"1.1fr"},{k:"basis",h:"BASIS",w:".9fr"},
      {k:"qty",h:"QTY",w:".4fr"},{k:"unit",h:"UNIT PRICE",w:".65fr"},
      {k:"disc",h:"DISCOUNT",w:".55fr",ph:"10% or 500"},
      {k:"when",h:"BILLED",w:".8fr",opts:["In advance","In arrears","Monthly in advance","Quarterly in advance"]}
    ],{line:"",basis:"Per year",qty:"1",unit:"",disc:"",when:"In advance"}) +
    '<h3 style="margin-top:8px">Implementation and services</h3>' +
    '<p class="hint">Integration costs come from the technical section and change allowance from change control — do not repeat them here.</p>' +
    pickBar("oneoff") + rowBlock("oneoff",[{k:"line",h:"LINE",w:"2fr"},{k:"amount",h:"AMOUNT",w:".8fr"},{k:"disc",h:"DISCOUNT",w:".6fr",ph:"10% or 500"}],{line:"",amount:"",disc:""}) +
    '<div class="grid2" style="margin-top:4px">' + fld("discountValue","DISCOUNT ON THE TOTAL",{ph:"5% or 1000"}) + fld("discountNote","WHY, IN ONE LINE",{ph:"Launch client"}) + '</div>' +
    '<div class="totals" id="totalsBox">' + totalsHtml() + '</div></div>' +
    '<div class="card"><h3>Optional add-ons and later phases</h3>' +
    '<p class="hint">Priced but excluded from the totals until ticked. This is how a gap in scope becomes a decision for the client rather than a surprise later.</p>' +
    rowBlock("addons",[
      {k:"line",h:"ADD-ON",w:"1.8fr",ph:"Arabic payroll gazette export"},
      {k:"basis",h:"BASIS",w:".8fr",opts:["One-off","Annual"]},
      {k:"amount",h:"AMOUNT",w:".7fr"},
      {k:"accepted",h:"ACCEPTED",w:".7fr",opts:["No","Yes"],bool:true}
    ],{line:"",basis:"One-off",amount:"",accepted:false}) + '</div>' +
    '<div class="card"><h3>Pricing options</h3>' +
    '<p class="hint">Leave empty for a single price. Add two or three and they print side by side before the detail, with the recommended one marked.</p>' +
    rowBlock("packages",[
      {k:"name",h:"NAME",w:".9fr",ph:"Recommended"},
      {k:"price",h:"PRICE",w:".7fr"},
      {k:"basis",h:"BASIS",w:".8fr",ph:"year one"},
      {k:"items",h:"WHAT IS IN IT (COMMA SEPARATED)",w:"2.2fr"},
      {k:"pick",h:"RECOMMEND",w:".7fr",opts:["No","Yes"],bool:true}
    ],{name:"",price:"",basis:"year one",items:"",pick:false}) + '</div>' +
    '<div class="card"><h3>Payment milestones</h3><p class="hint" id="shareHint">' + shareHtml() + '</p>' +
    rowBlock("milestones",[{k:"name",h:"MILESTONE",w:"1.2fr"},{k:"trigger",h:"TRIGGER",w:"1.6fr"},{k:"share",h:"SHARE %",w:".6fr"}],{name:"",trigger:"",share:""}) +
    '</div><div class="card"><h3>Terms</h3>' +
    '<p class="hint">Term, renewal and exit — the commitments that outlive the project.</p><div class="grid2">' +
      fld("initialTerm","INITIAL TERM (MONTHS)") + fld("noticeDays","NOTICE TO STOP (DAYS)") +
      fld("renewalPrice","PRICE ON RENEWAL") + fld("exit","EXIT") + fld("payDays","INVOICE DUE (DAYS)") +
    '</div></div><div class="card"><h3>Support hours</h3>' +
    '<p class="hint">Switch off the days you are closed. These are the hours that print, and the hours the response times below are measured against.</p>' +
    hoursBlock() + '<div class="grid2" style="margin-top:12px">' +
      fld("hoursTz","TIME ZONE",{ph:"GST, UTC+4"}) +
      fld("supportHours","NOTE ON HOURS",{ph:"Public holidays excluded"}) +
    '</div></div><div class="card"><h3>Service Level Agreement (SLA)</h3>' +
    '<p class="hint">Response is time to a human reply; resolution is time to a working system or an agreed workaround. Leave a field blank and that row is left out of the document.</p>' +
    rowBlock("sla",[{k:"sev",h:"SEVERITY",w:"1fr"},{k:"resp",h:"RESPONSE",w:"1fr"},{k:"res",h:"RESOLUTION",w:"1fr"}],{sev:"",resp:"",res:""}) +
    '<div class="grid2" style="margin-top:14px">' +
      fld("slaUptime","AVAILABILITY COMMITMENT",{ph:"99.9% of each calendar month"}) +
      fld("slaWindow","MEASURED OVER",{ph:"Calendar month, excluding planned maintenance"}) +
      fld("slaMaint","PLANNED MAINTENANCE",{ph:"Fridays 22:00–02:00, 5 working days' notice"}) +
      fld("slaChannels","HOW TO RAISE AN ISSUE",{ph:"In-app help desk, email, phone for severity 1"}) +
      fld("slaEscalation","ESCALATION",{ph:"Unanswered at 2x target goes to the account lead, then the CTO"}) +
      fld("slaCredits","SERVICE CREDITS",{ph:"5% of the monthly fee per full percentage point missed, capped at 25%"}) +
    '</div>' + fld("slaExclusions","WHAT THE SLA DOES NOT COVER",{area:true, ph:"Client network or device faults, third-party systems outside our control, misuse, and changes made outside the change process."}) +
    '</div>';
}
function stepInternal(){
  return '<div class="internal">' +
    '<div class="int-band"><span class="tag">INTERNAL</span>' +
    '<span class="msg">Costs, margin and cash. None of this is printed, none of it is in the client export, and <strong>Hide internal</strong> in the toolbar takes it off the screen before you share one.</span></div>' +
    '<div class="card int"><h2>Costs and margin</h2>' +
    '<p class="hint">Rates, exchange rates and AI prices come from <strong>Company \u2192 costing settings</strong>, so one price change reprices every open deal. Everything on this page belongs to this proposal alone.</p>' +
    '<p class="hint" style="color:var(--red,#c2384a)">Stored in OnCloud with the proposal. Only people who may see product costs in this workspace can open this section.</p>' +
    '<div id="intBody"></div>' +
    '</div></div>';
}
/* Everything on this panel is derived, so a keystroke rebuilds it — which throws
   away the very field being typed into. Note which field had the caret and where,
   then put it back. */
const FIELD_KEYS = ["ik","ik2","ikg","ikms","iklist","i","f"];
function fieldId(n){
  return FIELD_KEYS.map(k => n.dataset[k] === undefined ? "" : n.dataset[k]).join("|") + "|" + (n.id || "");
}
function refreshInternal(){
  const el = $("#intBody");
  if (!el) return;
  const a = document.activeElement;
  const live = a && el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  const want = live ? fieldId(a) : null;
  let start = null, end = null;
  if (live){ try { start = a.selectionStart; end = a.selectionEnd; } catch(e){} }

  el.innerHTML = internalBody();

  if (want === null) return;
  const all = el.querySelectorAll("input,textarea,select");
  for (let i = 0; i < all.length; i++){
    if (fieldId(all[i]) !== want) continue;
    all[i].focus();
    if (start !== null){ try { all[i].setSelectionRange(start, end); } catch(e){} }
    return;
  }
}
function internalBody(){
  const c = company.costing || blankCosting();
  const k = costsFor(data);
  const ccy = esc(k.ccy);
  const M = v => ccy + " " + money(v, k.ccy);
  const sub = (label, v) => '<div class="t"><span>'+label+'</span><span class="v">'+M(v)+'</span></div>';
  const noCard = !((c.rateCard||[]).length);

  const refs = linkOpts(data).filter(o => o.code);
  const ref = '<p class="hint"><strong>Numbers already in this proposal.</strong> Any field with a dropdown above it can take one of these instead of a typed number, so a licence count or a project length is only ever entered once.</p>' +
    '<div class="refgrid">' + refs.map(function(o){
      return '<div class="r"><span class="k">' + esc(o.label.toUpperCase()) + '</span><span class="v">' + esc(qty(o.value, o.value % 1 ? 1 : 0)) + '</span></div>';
    }).join("") +
    '<div class="r"><span class="k">INVOICE DUE (DAYS)</span><span class="v">' + esc(qty(num(data.payDays))) + '</span></div>' +
    '<div class="r"><span class="k">MILESTONE SHARES</span><span class="v">' + esc((data.milestones||[]).map(r => qty(num(r.share)) + "%").join(" / ") || "—") + '</span></div>' +
    '<div class="r"><span class="k">INITIAL TERM (MONTHS)</span><span class="v">' + esc(qty(num(data.initialTerm))) + '</span></div>' +
    '</div>';

  const yrs = termYears(data);
  const fromTerm = !num((data.internal||{}).termYears);
  const termBox = '<div class="grid2" style="margin-bottom:4px">' +
    ifld("termYears","SUBSCRIPTION TERM (YEARS)",{ph:String(yrs)}) + '</div>' +
    '<p class="hint">' + (fromTerm
      ? 'Following the commercial section: an initial term of ' + esc(qty(num(data.initialTerm))) + ' months, so the costing runs ' + yrs + ' year' + (yrs === 1 ? '' : 's') + '. Type a number here to look further out than you have contracted.'
      : 'Overriding the commercial section, which says ' + esc(qty(num(data.initialTerm))) + ' months. Clear this field to follow the proposal again.') +
    ' The run P&amp;L, the AI cost, the infrastructure and the cash view all use it.</p>';

  return roleList() + ccyList() + modelList() + ref + termBox +
    '<h3>Mandays</h3>' +
    '<p class="hint">Day cost comes from the rate card unless you type one in. ' +
      (noCard ? '<strong>The rate card is empty</strong> — add roles in Company → costing settings, or type a cost per day on each row.' : 'Roles autocomplete from the rate card.') + '</p>' +
    intRows("mandays",[
      {k:"phase",h:"PHASE / WORKSTREAM",w:"1.5fr",ph:"Configuration"},
      {k:"role",h:"ROLE",w:"1.2fr",ph:"Consultant",list:"dlRoles"},
      {k:"days",h:"DAYS",w:".6fr",ph:"0"},
      {k:"day",h:"COST / DAY",w:".8fr",ph:"rate card"}
    ],{phase:"",role:"",days:"",day:""}) +
    subtotalTable("By phase", k.byPhase, k) + subtotalTable("By role", k.byRole, k) +
    '<div class="grid2" style="margin-top:10px">' + ifld("contingency","CONTINGENCY ON LABOUR % (blank uses " + esc(num(c.contingency)) + "%)",{ph:String(num(c.contingency))}) + '</div>' +
    '<div class="t-wrap">' + sub("Labour at cost", k.labour) + sub("Contingency at " + money(k.contPct) + "%", k.contingency) + '</div>' +

    '<h3 style="margin-top:18px">Infrastructure</h3>' +
    '<p class="hint">MONTHS is how long you pay for it, counted from the start of the project. Pick <strong>Project + term months</strong> for anything you pay from day one of the build until the end of the term — the build months land in the project cost and the rest in the run years. Leave it blank for something that only starts at go-live and runs every year. ALLOC % splits a shared platform cost; blank means 100%.</p>' +
    intRows("infra",[
      {k:"item",h:"ITEM",w:"1.4fr",ph:"Managed database"},
      {k:"provider",h:"PROVIDER",w:".9fr",ph:"DigitalOcean"},
      {k:"amount",h:"UNIT AMOUNT",w:".8fr",ph:"0"},
      {k:"qty",h:"QTY",w:"1.1fr",ph:"1",link:true},
      {k:"ccy",h:"CCY",w:".7fr",ph:"USD",list:"dlCcy"},
      {k:"basis",h:"BASIS",w:".9fr",opts:["Monthly","Annual","One-off"]},
      {k:"months",h:"MONTHS",w:"1.1fr",ph:"",link:true},
      {k:"mode",h:"MODE",w:".9fr",opts:["Dedicated","Shared"]},
      {k:"alloc",h:"ALLOC %",w:".7fr",ph:"100"}
    ],{item:"",provider:"",amount:"",qty:"",qtyLink:"",ccy:"",basis:"Monthly",months:"",monthsLink:"",mode:"Dedicated",alloc:""}) +
    '<div class="t-wrap">' + sub("Infrastructure in the project", k.infraOnce) + sub("Infrastructure, year 1", k.infraYear) +
      (k.infraYearN.length > 1 ? '<div class="t"><span class="m">Later years</span><span class="v">' +
        k.infraYearN.slice(1).map(v => money(v, k.ccy)).join(" \u00b7 ") + '</span></div>' : '') + '</div>' +

    '<h3 style="margin-top:18px">Licences and third-party</h3>' +
    '<p class="hint">Cost each, times how many \u2014 and HOW MANY can come straight from a subscription line, so a licence count is never out of step with what you quoted. A pass-through is billed to the client at cost: it shows up as revenue and as cost, and carries no margin.</p>' +
    intRows("licences",[
      {k:"item",h:"ITEM",w:"1.4fr",ph:"Door-lock SDK licence"},
      {k:"amount",h:"COST EACH",w:".8fr",ph:"0"},
      {k:"qty",h:"HOW MANY",w:"1.2fr",ph:"1",link:true},
      {k:"ccy",h:"CCY",w:".7fr",ph:"USD",list:"dlCcy"},
      {k:"basis",h:"BASIS",w:".9fr",opts:["Annual","Monthly","One-off"]},
      {k:"months",h:"MONTHS",w:"1.2fr",ph:"",link:true},
      {k:"pass",h:"PASS-THROUGH",w:".9fr",opts:["No","Yes"],bool:true}
    ],{item:"",amount:"",qty:"",qtyLink:"",ccy:"",basis:"Annual",months:"",monthsLink:"",pass:false}) +
    '<div class="t-wrap">' + sub("Licences in the project", k.licOnce) + sub("Licences, year 1", k.licYear) +
      (k.passOnce || k.passYear ? sub("Pass-through, no margin", k.passOnce + k.passYear) : "") + '</div>' +

    '<h3 style="margin-top:18px">AI in the product</h3>' +
    '<p class="hint">What the client\'s own users will cost you each month. ' +
      (((c.aiModels||[]).length) ? 'Models autocomplete from the price list.' : '<strong>The AI price list is empty</strong> — add models in Company → costing settings. Nothing is assumed for you.') + '</p>' +
    intRows("aiProduct",[
      {k:"feature",h:"FEATURE",w:"1.4fr",ph:"Resident assistant"},
      {k:"model",h:"MODEL",w:"1.2fr",ph:"model",list:"dlModels"},
      {k:"users",h:"ACTIVE USERS",w:"1.3fr",ph:"0",link:true},
      {k:"reqs",h:"REQ / USER / MO",w:"1fr",ph:"0"},
      {k:"inTok",h:"IN TOKENS",w:".9fr",ph:"0"},
      {k:"outTok",h:"OUT TOKENS",w:".9fr",ph:"0"},
      {k:"cache",h:"CACHE %",w:".7fr",ph:"0"},
      {k:"months",h:"MONTHS",w:".7fr",ph:"ongoing"},
      {k:"growth",h:"GROWTH %/MO",w:".9fr",ph:"0"}
    ],{feature:"",model:"",users:"",usersLink:"",reqs:"",inTok:"",outTok:"",cache:"",months:"",growth:""}) +
    aiRowTable(k) +
    '<h3 style="margin-top:16px">AI bought as a plan</h3>' +
    '<p class="hint">Anything you pay a fixed price for rather than by the token: a committed-spend bundle, a platform subscription, or a feature sold to you on a flat plan. One-off rows go to the project, monthly and annual rows to the run.</p>' +
    intRows("aiPackages",[
      {k:"item",h:"ITEM",w:"1.5fr",ph:"Committed spend bundle"},
      {k:"provider",h:"PROVIDER",w:"1fr",ph:""},
      {k:"amount",h:"AMOUNT",w:".9fr",ph:"0"},
      {k:"ccy",h:"CCY",w:".7fr",ph:"USD",list:"dlCcy"},
      {k:"basis",h:"BASIS",w:".9fr",opts:["Monthly","Annual","One-off"]},
      {k:"months",h:"MONTHS",w:"1.2fr",ph:"",link:true},
      {k:"alloc",h:"ALLOC %",w:".7fr",ph:"100"}
    ],{item:"",provider:"",amount:"",ccy:"",basis:"Monthly",months:"",monthsLink:"",alloc:""}) +
    (k.aiPackOnce || k.aiPackYear
      ? '<div class="t-wrap">' + sub("Plans in the project", k.aiPackOnce) + sub("Plans, year 1", k.aiPackYear) + '</div>'
      : '') +
    '<div class="t-wrap">' +
      '<div class="t"><span>By the token, year 1</span><span class="v">' + M(k.aiTokensY[0]) + '</span></div>' +
      (k.aiPackYear ? '<div class="t"><span>On a plan, year 1</span><span class="v">' + M(k.aiPackYear) + '</span></div>' : '') +
      sub("AI in the product, year 1", k.aiProductY[0] || 0) +
      k.aiProductY.slice(1).map((v, i) => sub("Year " + (i + 2), v)).join("") +
      '<div class="t"><span>Sensitivity on year 1 — 0.5\u00d7 / 1\u00d7 / 2\u00d7</span><span class="v">' +
        M(k.aiSens[0]) + " \u00b7 " + M(k.aiSens[1]) + " \u00b7 " + M(k.aiSens[2]) + '</span></div>' +
    '</div>' +

    '<h3 style="margin-top:18px">AI in delivery</h3>' +
    '<p class="hint">Coding agents and tools used to build this, charged to the project. Either a flat monthly cost, or name a model and give the tokens a month.</p>' +
    intRows("aiDelivery",[
      {k:"tool",h:"TOOL",w:"1.4fr",ph:"Coding agent seats"},
      {k:"model",h:"MODEL (OPTIONAL)",w:"1.1fr",ph:"",list:"dlModels"},
      {k:"monthly",h:"MONTHLY",w:".8fr",ph:"0"},
      {k:"ccy",h:"CCY",w:".7fr",ph:"USD",list:"dlCcy"},
      {k:"inTok",h:"IN TOKENS/MO",w:"1fr",ph:""},
      {k:"outTok",h:"OUT TOKENS/MO",w:"1fr",ph:""},
      {k:"months",h:"MONTHS",w:"1.1fr",ph:"0",link:true},
      {k:"alloc",h:"ALLOC %",w:".7fr",ph:"100"}
    ],{tool:"",model:"",monthly:"",ccy:"",inTok:"",outTok:"",months:"",monthsLink:"",alloc:""}) +
    '<div class="t-wrap">' + sub("AI in delivery, charged to the project", k.aiDelivery) + '</div>' +
    perUserBlock(k, M) +
    aiSellBlock(k, M) +

    '<h3 style="margin-top:18px">AI assumptions</h3>' +
    '<p class="hint">Write down what the numbers above rest on. These are prompts, not values — an unanswered one is a number you guessed.</p>' +
    intList("aiAssume","Assumption") +

    '<h3 style="margin-top:18px">Payment and transaction fees</h3>' +
    '<p class="hint">Leave blank if the client settles directly with the payment provider and you never touch the money.</p>' +
    '<div class="grid2">' + ifld2("fees","pct","% OF COLLECTED VALUE",{ph:"2.4"}) + ifld2("fees","fixed","FIXED PER TRANSACTION",{ph:"0.100"}) +
      ifld2("fees","tx","TRANSACTIONS PER MONTH",{ph:"0"}) + ifld2("fees","note","NOTE",{ph:"Card acquiring on resident payments"}) + '</div>' +

    '<h3 style="margin-top:18px">Other direct costs</h3>' +
    intRows("other",[
      {k:"item",h:"ITEM",w:"1.8fr",ph:"Travel, hardware, subcontractor, training materials"},
      {k:"amount",h:"AMOUNT",w:".8fr",ph:"0"},
      {k:"ccy",h:"CCY",w:".7fr",ph:"OMR",list:"dlCcy"},
      {k:"basis",h:"BASIS",w:".9fr",opts:["One-off","Monthly","Annual"]},
      {k:"months",h:"MONTHS",w:"1.2fr",ph:"",link:true}
    ],{item:"",amount:"",ccy:"",basis:"One-off",months:"",monthsLink:""}) +

    '<h3 style="margin-top:18px">Support and risk</h3>' +
    '<div class="grid2">' +
      '<div class="field"><label for="in-supportRole">SUPPORT ROLE</label><input id="in-supportRole" list="dlRoles" data-ik2="supportRole" value="'+esc((data.internal||{}).supportRole)+'" placeholder="Support engineer"></div>' +
      ifld("supportDays","SUPPORT DAYS PER MONTH",{ph:"1.5"}) +
    '</div>' +
    '<p class="hint">' + supportCapacityLine() + '</p>' +
    '<div class="grid2">' + ifld2("risk","pct","RISK % ON ONE-OFF COST",{ph:"5"}) + ifld2("risk","amount","OR A FIXED AMOUNT",{ph:""}) + '</div>' +
    ifld2("risk","reason","REASON",{ph:"First integration with this lock vendor"}) +
    '<div class="t-wrap">' + sub("Support per year", k.supportYear) + sub("Risk", k.risk) +
      '<div class="t big"><span>One-off cost of delivery</span><span class="v">' + M(k.oneOff) + '</span></div></div>' +
    plBlock() +

    (k.missingFx.length ? '<div class="flags"><div class="flag hot"><span>No exchange rate for ' + esc(k.missingFx.join(", ")) +
      '. Those rows are counted as zero until you add a rate in Company → costing settings.</span></div></div>' : "") +
    (k.noRate.length ? '<div class="flags"><div class="flag hot"><span>No day cost on: ' + esc(k.noRate.slice(0,4).join("; ")) +
      (k.noRate.length > 4 ? " and " + (k.noRate.length-4) + " more" : "") + '</span></div></div>' : "");
}

/* capacity check: the hours block says how many hours a month you are open,
   the support days say how many you have actually priced */
function supportCapacityLine(){
  const rows = (data.hours||[]).filter(r => r.on);
  const mins = rows.reduce(function(a, r){
    const p = s => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s||"")); return m ? (+m[1])*60 + (+m[2]) : null; };
    const f = p(r.from), t = p(r.to);
    return a + (f !== null && t !== null && t > f ? t - f : 0);
  }, 0);
  const hoursMonth = mins / 60 * 52 / 12;
  const days = num((data.internal||{}).supportDays);
  if (!rows.length) return "Every day is switched off in the support-hours block, so there is no cover to price.";
  return "The support-hours block is open " + rows.length + " days a week, about " + qty(hoursMonth) +
    " hours a month. You have priced " + qty(days, 1) + " days a month" +
    (days > 0 ? " — about " + qty(days * 8 / (hoursMonth || 1) * 100) + "% of that window." : ".");
}

/* The P&L, the floor and the flags. Internal, and never passed to the paginator. */
function plBlock(){
  const c = company.costing || blankCosting();
  const pl = plFor(data);
  const ccy = esc(pl.ccy);
  const M = v => ccy + " " + money(v, pl.ccy);
  const pc = v => money(v, "x") + "%";
  const cls = v => v < 0 ? ' class="n neg"' : ' class="n"';
  const k = pl.k;

  const project =
    '<table class="pl"><thead><tr><th>PROJECT P&amp;L — ONE-OFF</th><th class="n">' + ccy + '</th></tr></thead><tbody>' +
    '<tr><td>Revenue, excluding VAT</td><td class="n">' + money(pl.revOnce, pl.ccy) + '</td></tr>' +
    (k.passOnce ? '<tr><td>Pass-through billed on</td><td class="n">' + money(k.passOnce, pl.ccy) + '</td></tr>' : '') +
    '<tr><td>Labour</td><td class="n">' + money(k.labour, pl.ccy) + '</td></tr>' +
    '<tr><td>Contingency at ' + pc(k.contPct) + '</td><td class="n">' + money(k.contingency, pl.ccy) + '</td></tr>' +
    '<tr><td>Infrastructure in the build</td><td class="n">' + money(k.infraOnce, pl.ccy) + '</td></tr>' +
    '<tr><td>Licences</td><td class="n">' + money(k.licOnce, pl.ccy) + '</td></tr>' +
    (k.passOnce ? '<tr><td>Pass-through at cost</td><td class="n">' + money(k.passOnce, pl.ccy) + '</td></tr>' : '') +
    '<tr><td>AI in delivery</td><td class="n">' + money(k.aiDelivery, pl.ccy) + '</td></tr>' +
    '<tr><td>Other direct costs</td><td class="n">' + money(k.otherOnce, pl.ccy) + '</td></tr>' +
    '<tr><td>Risk</td><td class="n">' + money(k.risk, pl.ccy) + '</td></tr>' +
    '<tr class="sum"><td>Gross profit · margin ' + pc(pl.project.margin) + '</td><td' + cls(pl.project.gp).slice(1) + '>' + money(pl.project.gp, pl.ccy) + '</td></tr>' +
    '</tbody></table>';

  const run =
    '<table class="pl" style="margin-top:14px"><thead><tr><th>RUN P&amp;L — ' + pl.years + ' YEAR' + (pl.years === 1 ? '' : 'S') + '</th>' +
      pl.run.map(r => '<th class="n">YEAR ' + r.year + '</th>').join("") + '</tr></thead><tbody>' +
    '<tr><td>Subscription revenue</td>' + pl.run.map(r => '<td class="n">' + money(r.rev, pl.ccy) + '</td>').join("") + '</tr>' +
    '<tr><td>Infrastructure</td>' + pl.run.map(r => '<td class="n">' + money(r.infra, pl.ccy) + '</td>').join("") + '</tr>' +
    '<tr><td>Licences' + (k.passYear ? ' and pass-through' : '') + '</td>' + pl.run.map(r => '<td class="n">' + money(r.lic, pl.ccy) + '</td>').join("") + '</tr>' +
    '<tr><td>AI in the product</td>' + pl.run.map((r,i) => '<td class="n">' + money(k.aiProductY[i] || 0, pl.ccy) + '</td>').join("") + '</tr>' +
    '<tr><td>Payment and transaction fees</td>' + pl.run.map(r => '<td class="n">' + money(r.fees, pl.ccy) + '</td>').join("") + '</tr>' +
    '<tr><td>Support, ' + qty(k.supportDays, 1) + ' days a month</td>' + pl.run.map(() => '<td class="n">' + money(k.supportYear, pl.ccy) + '</td>').join("") + '</tr>' +
    (k.otherYearN.some(v => v) ? '<tr><td>Other recurring</td>' + pl.run.map(r => '<td class="n">' + money(r.other, pl.ccy) + '</td>').join("") + '</tr>' : '') +
    '<tr class="sum"><td>Gross profit</td>' + pl.run.map(r => '<td' + cls(r.gp) + '>' + money(r.gp, pl.ccy) + '</td>').join("") + '</tr>' +
    '<tr><td>Margin</td>' + pl.run.map(r => '<td class="n">' + pc(r.margin) + '</td>').join("") + '</tr>' +
    '</tbody></table>';

  const span = pl.years + "-year";
  const totals =
    '<div class="t-wrap">' +
    '<div class="t"><span>' + span + ' revenue</span><span class="v">' + M(pl.total.rev) + '</span></div>' +
    '<div class="t"><span>' + span + ' cost</span><span class="v">' + M(pl.total.cost) + '</span></div>' +
    '<div class="t big"><span>' + span + ' gross profit · ' + pc(pl.total.margin) + '</span><span class="v">' + M(pl.total.gp) + '</span></div>' +
    '<div class="t"><span>Effective day rate on ' + qty(k.days, 1) + ' days</span><span class="v">' + M(pl.dayRate) + '</span></div>' +
    '<div class="t"><span>Break-even</span><span class="v">' + (pl.cash.breakEven === null ? "not inside the horizon" : "month " + pl.cash.breakEven) + '</span></div>' +
    '<div class="t"><span>Lowest cash point</span><span class="v">' + M(pl.cash.low) + ' at month ' + pl.cash.lowAt + '</span></div>' +
    '</div>';

  const f = pl.floor;
  const floor =
    '<table class="pl" style="margin-top:14px"><thead><tr><th>PRICE FLOOR AT ' + pc(f.target) + ' MARGIN</th><th class="n">NOW</th><th class="n">FLOOR</th></tr></thead><tbody>' +
    '<tr><td>One-off price</td><td class="n">' + money(pl.revOnce, pl.ccy) + '</td><td class="n">' + money(f.onceFloor, pl.ccy) + '</td></tr>' +
    '<tr><td>Subscription, per year</td><td class="n">' + money(pl.revRun, pl.ccy) + '</td><td class="n">' + (f.solvable ? money(f.runFloor, pl.ccy) : "—") + '</td></tr>' +
    f.lines.map(function(l){
      return '<tr><td style="padding-left:18px" class="m">' + esc(l.line || "—") + ', unit</td><td class="n">' + money(l.unit, pl.ccy) + '</td><td class="n">' + (f.scale > 0 ? money(l.floor, pl.ccy) : "—") + '</td></tr>';
    }).join("") +
    '</tbody></table>';

  const flags = flagsFor(data);
  const flagHtml = flags.length
    ? '<div class="flags">' + flags.map(x => '<div class="flag' + (x.bad ? ' hot' : '') + '"><span>' + esc(x.m) + '</span></div>').join("") + '</div>'
    : '<p class="hint">Nothing flagged.</p>';

  const ms = (data.milestones || []).filter(r => String(r.name||"").trim() || num(r.share));
  const msEditor = ms.length
    ? '<div class="rowhead" style="grid-template-columns:1.6fr .7fr .8fr"><span>MILESTONE</span><span>SHARE %</span><span>MONTH</span></div>' +
      '<div class="rows">' + ms.map(function(r, i){
        return '<div class="row" style="grid-template-columns:1.6fr .7fr .8fr">' +
          '<input value="' + esc(r.name) + '" disabled>' +
          '<input value="' + esc(r.share) + '" disabled>' +
          '<input data-ikms="' + i + '" value="' + esc(((data.internal||{}).msMonths||[])[i] ?? "") + '" placeholder="auto" aria-label="Month"></div>';
      }).join("") + '</div>'
    : '<p class="hint">No payment milestones in the commercial section yet, so there is nothing to collect.</p>';

  const cash = '<h3 style="margin-top:22px">Cash</h3>' +
    '<p class="hint">Milestone money in against the cost of delivering it, month by month from the start of the timeline. Go-live lands in month ' + pl.cash.goLive +
    '. Invoices are collected ' + qty(num(data.payDays)) + ' days after they are raised, so inflows sit ' + pl.cash.lag + ' month' + (pl.cash.lag === 1 ? '' : 's') + ' later than the milestone. Leave a month blank and the milestone is spread evenly across delivery.</p>' +
    msEditor + cashChart(pl) +
    '<div class="t-wrap">' +
      '<div class="t"><span>Lowest cumulative cash</span><span class="v">' + M(pl.cash.low) + ' at month ' + pl.cash.lowAt + '</span></div>' +
      '<div class="t"><span>Break-even</span><span class="v">' + (pl.cash.breakEven === null ? "not inside " + pl.cash.horizon + " months" : "month " + pl.cash.breakEven) + '</span></div>' +
    '</div>';

  return '<h3 style="margin-top:22px">Profit and loss</h3>' +
    '<p class="hint">Revenue is read from the commercial section and never re-entered here. VAT is excluded throughout. The total discount is spread across one-off and recurring in proportion.</p>' +
    project + run + totals + floor + cash + actualsBlock() +
    '<h3 style="margin-top:18px">Flags</h3>' + flagHtml;
}

/* What it really cost, month by month, against what it was priced to cost. */
function actualsBlock(){
  const a = actualsFor(data);
  const ccy = esc(a.ccy);
  const M = v => ccy + " " + money(v, a.ccy);
  const pc = v => v === null ? "\u2014" : money(v, "x") + "%";
  const LAB = {people:"PEOPLE", infra:"INFRA", lic:"LICENCES", ai:"AI", fees:"FEES", other:"OTHER"};
  const keys = ["people","infra","lic","ai","fees","other"];

  const editor = intRows("actuals",
    [{k:"month",h:"MONTH",w:"1.1fr",type:"month"}]
      .concat(keys.map(x => ({k:x, h:LAB[x], w:".8fr", ph:"0"})))
      .concat([{k:"note",h:"NOTE",w:"1.4fr",ph:""}]),
    {month:"", people:"", infra:"", lic:"", ai:"", fees:"", other:"", note:""});

  const table = a.rows.length
    ? '<table class="pl" style="margin-top:12px"><thead><tr><th>MONTH</th><th class="n">PLANNED</th><th class="n">ACTUAL</th><th class="n">VARIANCE</th><th>NOTE</th></tr></thead><tbody>' +
      a.rows.map(function(r){
        if (r.idx < 0 || !r.plan)
          return '<tr><td>' + esc(r.month || "no month") + '</td><td class="n">\u2014</td><td class="n">' + money(r.actual.total, a.ccy) +
                 '</td><td class="n">\u2014</td><td class="m">outside the plan</td></tr>';
        return '<tr><td>' + esc(r.month) + ' <span class="m" style="font-size:11px">month ' + r.idx + '</span></td>' +
          '<td class="n">' + money(r.plan.total, a.ccy) + '</td>' +
          '<td class="n">' + money(r.actual.total, a.ccy) + '</td>' +
          '<td class="n' + (r.delta > 0 ? ' neg' : (r.delta < 0 ? ' good' : '')) + '">' + (r.delta > 0 ? "+" : "") + money(r.delta, a.ccy) + '</td>' +
          '<td class="m">' + esc(r.note) + '</td></tr>';
      }).join("") +
      '<tr class="sum"><td>Across ' + a.months + ' month' + (a.months === 1 ? '' : 's') + '</td>' +
        '<td class="n">' + money(a.planToDate, a.ccy) + '</td>' +
        '<td class="n">' + money(a.actualToDate, a.ccy) + '</td>' +
        '<td class="n' + (a.variance > 0 ? ' neg' : (a.variance < 0 ? ' good' : '')) + '">' + (a.variance > 0 ? "+" : "") + money(a.variance, a.ccy) + '</td>' +
        '<td class="m">' + pc(a.variancePct) + '</td></tr>' +
      '</tbody></table>' +
      '<table class="pl" style="margin-top:12px"><thead><tr><th>WHERE IT WENT</th>' +
        keys.map(x => '<th class="n">' + LAB[x] + '</th>').join("") + '</tr></thead><tbody>' +
      '<tr><td>Planned</td>' + keys.map(x => '<td class="n">' + money(a.byKey[x].plan, a.ccy) + '</td>').join("") + '</tr>' +
      '<tr><td>Actual</td>'  + keys.map(x => '<td class="n">' + money(a.byKey[x].actual, a.ccy) + '</td>').join("") + '</tr>' +
      '<tr class="sum"><td>Variance</td>' + keys.map(x => '<td class="n' + (a.byKey[x].delta > 0 ? ' neg' : (a.byKey[x].delta < 0 ? ' good' : '')) + '">' +
        (a.byKey[x].delta > 0 ? "+" : "") + money(a.byKey[x].delta, a.ccy) + '</td>').join("") + '</tr>' +
      '</tbody></table>' +
      '<div class="t-wrap">' +
        '<div class="t"><span>Cost as priced</span><span class="v">' + M(a.plannedCost) + ' \u00b7 ' + pc(a.plannedMargin) + '</span></div>' +
        '<div class="t big"><span>Cost with the actuals in place</span><span class="v">' + M(a.forecastCost) + ' \u00b7 ' + pc(a.forecastMargin) + '</span></div>' +
      '</div>'
    : '<p class="hint">Nothing logged yet. Add a month and the plan for that month appears beside it.</p>';

  return '<h3 style="margin-top:22px">Actuals against plan</h3>' +
    '<p class="hint">For a project that is running. Log what each month actually cost and the builder sets it against what that month was priced at, then re-reads the margin with the actuals in place of the plan. ' +
    (a.dated ? 'Month 0 is the start of your timeline, so the next month to log is <strong>' + esc(a.nextMonth) + '</strong>.'
             : '<strong>There are no dates on the timeline</strong>, so months cannot be matched to the plan. Add real dates in the Technical section first.') +
    '</p>' + editor + table;
}

/* cumulative cash as a column chart, drawn inline — internal, so it never prints */
function cashChart(pl){
  const ms = pl.cash.months;
  if (!ms.length) return "";
  const W = 760, H = 190, padB = 22, padT = 8;
  const vals = ms.map(m => m.cum);
  const hi = Math.max.apply(null, vals.concat([0]));
  const lo = Math.min.apply(null, vals.concat([0]));
  const span = (hi - lo) || 1;
  const bw = W / ms.length;
  const every = ms.length > 40 ? 12 : (ms.length > 24 ? 6 : 3);
  const y = v => padT + (hi - v) / span * (H - padT - padB);
  const zero = y(0);
  const bars = ms.map(function(m, i){
    const yy = y(m.cum), x = i * bw + 1.5, w = Math.max(2, bw - 3);
    const top = Math.min(yy, zero), h = Math.max(1, Math.abs(zero - yy));
    return '<rect x="'+x.toFixed(1)+'" y="'+top.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'" style="fill:'+(m.cum < 0 ? "var(--red)" : "var(--ember)")+'" opacity="'+(i === pl.cash.goLive ? "1" : ".85")+'"/>' +
      (i % every === 0 ? '<text x="'+(x + w/2).toFixed(1)+'" y="'+(H - 6)+'" font-size="9" fill="#8a94a8" text-anchor="middle">'+i+'</text>' : '');
  }).join("");
  return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'" role="img" aria-label="Cumulative cash by month" style="margin-top:10px">' +
    '<line x1="0" y1="'+zero.toFixed(1)+'" x2="'+W+'" y2="'+zero.toFixed(1)+'" stroke="#c8d0de"/>' +
    bars +
    '<line x1="'+(pl.cash.goLive * bw).toFixed(1)+'" y1="0" x2="'+(pl.cash.goLive * bw).toFixed(1)+'" y2="'+(H - padB)+'" style="stroke:var(--ember)" stroke-dasharray="3 3"/>' +
    '</svg>';
}

/* AI per seat per month: the figure a per-user price has to clear */
function perUserBlock(k, M){
  const pu = perUserFor(data);
  const I = data.internal || {};
  const code = I.aiUsersBaseLink || "";
  const picker = '<div class="field"><label for="in-aiUsersBase">BILLABLE USERS</label>' +
    '<div class="lnkcell" style="flex-direction:row;gap:8px;align-items:center">' +
    '<select class="status" id="in-aiUsersBase" data-ikg2="aiUsersBaseLink" style="flex:1">' +
      linkOpts(data).map(function(o){
        return '<option value="'+esc(o.code)+'"'+(o.code === code ? " selected" : "")+'>'+esc(o.label)+'</option>';
      }).join("") + '</select>' +
    (linkVal(code, data) === null
      ? '<input data-ik2="aiUsersBase" value="'+esc(I.aiUsersBase)+'" placeholder="seats" style="flex:0 0 110px" aria-label="Billable users">'
      : '<input value="'+esc(qty(linkVal(code, data)))+'" disabled style="flex:0 0 110px" aria-label="Billable users">') +
    '</div></div>';

  const M2 = v => k.ccy + " " + money(v, k.ccy);
  const line = (label, v, note) => '<div class="t"><span>' + label + (note ? ' <span class="m" style="font-size:11px">' + note + '</span>' : '') +
    '</span><span class="v">' + (v === null ? "\u2014" : M2(v)) + '</span></div>';

  const body = pu.users > 0
    ? '<div class="t-wrap">' +
        line("By the token", pu.tokenPerUser) +
        (k.aiPackYear ? line("On a plan", pu.planPerUser) : "") +
        '<div class="t big"><span>AI cost per user, per month</span><span class="v">' +
          (pu.perUser === null ? "\u2014" : M2(pu.perUser)) + '</span></div>' +
        (pu.sellPerUser !== null
          ? line("Charged per user, per month", pu.sellPerUser) +
            '<div class="t"><span>Headroom per user' + (pu.marginPerUser === null ? '' : ' \u00b7 ' + money(pu.marginPerUser, "x") + '%') +
            '</span><span class="v"' + (pu.gpPerUser < 0 ? ' style="color:var(--red)"' : '') + '>' + M2(pu.gpPerUser) + '</span></div>'
          : '<div class="t"><span class="m">Mark an annual line below as the AI the client pays for and the price per user appears here.</span><span class="v"></span></div>') +
      '</div>'
    : '<p class="hint">Pick a line with a quantity on it, or type a seat count, and the per-user figures appear.</p>';

  return '<h3 style="margin-top:18px">Per user, per month</h3>' +
    '<p class="hint">Year-one AI cost spread over the seats you are billing: ' +
    '<code>(tokens + plans) \u00f7 12 \u00f7 seats</code>. This is the number a per-user AI price has to clear.</p>' +
    picker + body;
}

/* what the client pays for AI, set against what the AI costs */
function aiSellBlock(k, M){
  const addons = (data.addons || []).map((r, i) => ({code: "add:" + i, label: "Add-on \u00b7 " + (String(r.line||"").trim() || ("row " + (i+1))) + (r.accepted ? "" : " (not accepted)")}));
  const subs   = (data.subs   || []).map((r, i) => ({code: "sub:" + i, label: "Subscription \u00b7 " + (String(r.line||"").trim() || ("line " + (i+1)))}));
  const opts   = [{code: "", label: "\u2014 nothing marked"}].concat(addons, subs);
  const pick   = String((data.internal||{}).aiSell || "");
  const sell   = aiSellFor(data);
  const panel  = sell.picked
    ? '<div class="t-wrap">' +
        '<div class="t"><span>' + esc(sell.label || "that line") + ', ' + esc(sell.basis || "") + '</span><span class="v">' + M(sell.rev) + '</span></div>' +
        '<div class="t"><span>AI it costs to serve, year 1</span><span class="v">' + M(sell.cost) + '</span></div>' +
        '<div class="t big"><span>Margin on AI' + (sell.margin === null ? '' : ' \u00b7 ' + money(sell.margin, "x") + '%') + '</span><span class="v">' + M(sell.gp) + '</span></div>' +
      '</div>'
    : '<p class="hint">Mark the line the client is paying for AI with and the margin on it appears here.</p>';
  return '<h3 style="margin-top:18px">The AI you are selling</h3>' +
    '<p class="hint">Pick the commercial line that covers AI \u2014 an add-on or a subscription line \u2014 and this sets its revenue against the cost above. Nothing here changes the proposal.</p>' +
    '<div class="field"><label for="in-aiSell">PAID FOR BY</label>' +
    '<select id="in-aiSell" class="status" data-ik2="aiSell">' +
      opts.map(o => '<option value="'+esc(o.code)+'"'+(o.code === pick ? " selected" : "")+'>'+esc(o.label)+'</option>').join("") +
    '</select></div>' + panel;
}

function aiRowTable(k){
  if (!k.aiRows.length) return "";
  const pu = perUserFor(data);
  const byFeature = {};
  pu.rows.forEach(function(r, i){ byFeature[i] = r; });
  return '<table class="pl" style="margin-top:10px"><thead><tr><th>FEATURE</th><th class="n">REQUESTS / MO</th><th class="n">TOKENS / MO</th><th class="n">PER ACTIVE USER / MO</th><th class="n">MONTH 1</th><th class="n">YEAR 1</th></tr></thead><tbody>' +
    k.aiRows.map(function(r, i){
      return '<tr><td>' + esc(r.feature || "—") +
        (r.linkedUsers ? ' <span class="m" style="font-size:11px">' + qty(r.users) + ' from the proposal</span>' : '') +
        (r.missing ? ' <span style="color:var(--red,#c2384a)">needs a model and token figures</span>' : '') + '</td>' +
        '<td class="n">' + qty(r.reqM0) + '</td>' +
        '<td class="n">' + qty(r.tokM0) + '</td>' +
        '<td class="n">' + (byFeature[i] && byFeature[i].perActive !== null ? esc(k.ccy) + ' ' + money(byFeature[i].perActive, k.ccy) : '\u2014') + '</td>' +
        '<td class="n">' + esc(k.ccy) + ' ' + money(r.m0, k.ccy) + '</td>' +
        '<td class="n">' + esc(k.ccy) + ' ' + money(r.y1, k.ccy) + '</td></tr>';
    }).join("") + '</tbody></table>';
}

function subtotalTable(title, map, k){
  const keys = Object.keys(map);
  if (!keys.length) return "";
  const rate = fxRate(k.base, company.costing) ? 1 : 1;
  return '<p class="hint" style="margin-top:10px"><strong>' + esc(title) + '</strong></p>' +
    '<table class="pl"><tbody>' + keys.map(function(key){
      return '<tr><td>' + esc(key) + '</td><td class="n">' + esc(k.base) + ' ' + money(map[key], k.base) + '</td></tr>';
    }).join("") + '</tbody></table>';
}

function stepAppendix(){
  return '<div class="card"><h2>Section 05 — appendix</h2>' +
    '<p class="hint">Attach only what was asked for. With no attachments and no revision history, the appendix page is left out of the document entirely.</p>' +
    appendixRows() +
    fld("ask","THE ASK",{area:true, ph:"What you want them to do, and by when."}) + '</div>';
}
function stepHistory(){
  const h = (data.history||[]).slice().sort((a,b) => b.t - a.t);
  return '<div class="card">' + cardHead("History", "history") +
    '<p class="hint">Newest first. The switch above controls whether it prints in the appendix. Status changes and edits are logged for you; add a note for anything that happened off-screen — a call, a revised price, a request from the client.</p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<input id="noteInput" placeholder="e.g. Raised implementation fee after scope call" style="flex:1;min-width:220px;border:1px solid var(--ink-200);border-radius:6px;padding:9px 11px">' +
    '<button class="btn light" id="btnNote">Add note</button></div>' +
    '<div class="timeline">' + (h.length ? h.map(e =>
      '<div class="tl"><span class="when">'+esc(new Date(e.t).toLocaleString())+'</span><span>'+esc(e.m)+'</span></div>').join("")
      : '<p class="hint">Nothing logged yet.</p>') + '</div></div>';
}
function stepReview(){
  const c = checks();
  const bad = c.filter(x => !x.ok).length;
  return '<div class="card"><h2>Before you send</h2>' +
    '<p class="hint">' + (bad ? bad + " item" + (bad>1?"s":"") + " still open." : "All clear.") + '</p>' +
    '<div class="checklist">' + c.map(x => '<div class="item"><span class="dot '+(x.ok?"ok":"bad")+'"></span><span>'+esc(x.label)+'</span></div>').join("") + '</div>' +
    '<p class="hint">Print / PDF gives the A4 document. Export keeps the data as JSON — the only copy that survives a cleared browser.</p></div>';
}
function checks(){
  const t = totals();
  const f = v => String(v||"").trim().length > 0;
  const on2 = k => data.sections && data.sections[k] !== false;
  return [
    {label:"Client name and attention filled", ok: f(data.client) && f(data.attention)},
    {label:"Valid-until date set", ok: f(data.valid)},
    {label:"Headline rewritten for this client", ok: f(data.headline)},
    {label:"Understanding of the requirement written", ok: f(data.understanding)},
    {label:"Every scope row has an out-of-scope entry", ok: (data.scope||[]).length > 0 && (data.scope||[]).every(r => f(r.out))},
    {label:"Every deliverable has a named acceptor", ok: (data.deliverables||[]).length > 0 && (data.deliverables||[]).every(r => f(r.by))},
    {label:"Hosting region named", ok: f(data.region)},
    {label:"Certifications stated honestly, or none yet", ok: f(data.certs)},
    {label:"Subscription priced", ok: t.subs > 0},
    {label:"Implementation and services priced", ok: t.fees > 0},
    {label:"Every integration has a cost", ok: (data.integrations||[]).filter(r => String(r.system||"").trim()).every(r => num(r.cost) > 0)},
    {label:"Change control names an approver and a rate", ok: String(data.changeApprover||"").trim().length > 0 && num(data.changeDayRate) > 0},
    {label:"Payment milestones add to 100%", ok: Math.round(t.shareSum) === 100},
    {label:"The ask written", ok: f(data.ask)},
    {label:"Executive summary present", ok: !on2("exec") || f(data.execOverride) || (f(data.problem) && f(data.outcome))},
    {label:"At least one outcome has a measure and a target", ok: !on2("outcomes") || (data.outcomes||[]).some(r => f(r.outcome) && f(r.measure) && f(r.target))},
    {label:"Client obligations listed", ok: !on2("obligations") || (data.obligations||[]).some(r => f(r.item) && f(r.by))},
    {label:"Every attached appendix row has an image or a real document name", ok: (data.appendix||[]).filter(r => (r.att||"Yes") === "Yes").every(r => f(r.doc))},
    {label:"Roadmap capabilities carry a quarter", ok: (data.capabilities||[]).filter(r => r.status === "Roadmap").every(r => f(r.due))}
  ];
}

const AR = {"The platform": "المنصة", "Technical proposal": "العرض الفني", "Change control": "إدارة التغيير", "Commercial proposal": "العرض المالي", "Appendix": "الملاحق", "Timeline": "الجدول الزمني", "Where you are, and where this gets you": "وضعكم اليوم، وما يتغيّر", "Your situation today": "وضعكم اليوم", "Deliverables": "المخرجات", "Scope of work": "نطاق العمل", "Integrations": "الربط مع الأنظمة", "Hosting, residency and security": "الاستضافة وموقع البيانات والأمن", "What we need from you": "ما نحتاجه منكم", "How a change is raised": "كيف يُطلب التغيير", "What counts as a change": "ما الذي يُعدّ تغييرًا", "Rates": "الأسعار", "Pricing options": "خيارات الأسعار", "Payment milestones": "دفعات السداد", "Terms": "الشروط", "Support": "الدعم الفني", "Attached documents": "المستندات المرفقة", "Revision history": "سجل التعديلات", "Acceptance": "الاعتماد", "What the platform covers": "ما تغطيه المنصة", "Understanding of your requirement": "فهمنا لمتطلباتكم", "REF": "الرمز", "WORKSTREAM": "مسار العمل", "DELIVERED": "ما يُسلَّم", "OWNER": "المسؤول", "OUT OF SCOPE": "خارج النطاق", "DELIVERABLE": "المخرَج", "FORMAT": "الصيغة", "DUE": "الموعد", "ACCEPTED BY": "يعتمده", "ITEM": "البند", "COMMITMENT": "الالتزام", "PHASE": "المرحلة", "START": "البداية", "FINISH": "النهاية", "GATE": "البوابة", "SYSTEM": "النظام", "DIRECTION": "الاتجاه", "METHOD": "الطريقة", "ACCESS FROM": "صلاحية الوصول من", "COST": "التكلفة", "LINE": "البند", "BASIS": "الأساس", "QTY": "الكمية", "UNIT": "سعر الوحدة", "BILLED": "الفوترة", "ANNUAL": "سنويًا", "AMOUNT": "المبلغ", "ADD-ON": "إضافة اختيارية", "STATUS": "الحالة", "MILESTONE": "الدفعة", "TRIGGER": "الاستحقاق", "SHARE": "النسبة", "TERM": "الشرط", "SEVERITY": "درجة الخطورة", "RESPONSE": "زمن الاستجابة", "RESOLUTION": "زمن المعالجة", "DOCUMENT": "المستند", "ATTACHED": "مرفق", "DATE": "التاريخ", "CHANGE": "التغيير", "RATE": "السعر", "CAPABILITY": "الإمكانية", "WHAT IT DOES": "ما تقدّمه", "OUTCOME": "النتيجة", "MEASURE": "المقياس", "TODAY": "اليوم", "TARGET": "المستهدف", "BY WHEN": "بحلول", "WHO": "من", "THE MOMENT THAT MATTERS": "اللحظة المهمة", "WHAT CHANGES FOR THEM": "ما يتغيّر لهم", "WHAT HAPPENS NOW": "ما يحدث الآن", "WHAT IT COSTS": "كلفته", "WHO FEELS IT": "من يتحمّله", "NEEDED BY": "مطلوب بحلول", "EXECUTIVE SUMMARY": "الملخص التنفيذي", "SECTION": "القسم", "The problem": "المشكلة", "The outcome": "النتيجة", "Year-one investment": "استثمار السنة الأولى", "Payback": "فترة الاسترداد", "The ask": "المطلوب منكم", "Prepared by": "أعدّه", "valid until": "صالح حتى", "Executive summary": "الملخص التنفيذي", "Name and title": "الاسم والمسمى", "Signature and date": "التوقيع والتاريخ", "Annual subscription": "الاشتراك السنوي", "Subtotal": "المجموع الفرعي", "VAT at": "ضريبة القيمة المضافة", "Total project cost, year one": "إجمالي تكلفة المشروع، السنة الأولى", "Year two onward": "من السنة الثانية", "One-off project cost": "التكلفة غير المتكررة", "Discount": "الخصم", "Subscription": "الاشتراك", "Annual value": "القيمة السنوية", "Year-one cost": "تكلفة السنة الأولى", "Three-year net": "الصافي خلال ثلاث سنوات", "RECOMMENDED": "الخيار المقترح", "Integrations total": "إجمالي الربط", "months": "شهرًا", "Section": "القسم", "ASSUMPTIONS": "الافتراضات", "EXCLUSIONS": "الاستثناءات", "including VAT": "شاملة ضريبة القيمة المضافة", "months on stated figures": "شهرًا وفق الأرقام المذكورة", "Accepted add-ons": "الإضافات المعتمدة", "Optional, not included in the total": "خيارات إضافية غير محتسبة في الإجمالي", "What changes, person by person": "ما يتغيّر لكل دور", "Outcomes we commit to": "النتائج التي نلتزم بها", "Value against cost": "القيمة مقابل التكلفة", "CONTINUED": "تابع", "Backups": "النسخ الاحتياطي", "Recovery Point Objective (RPO)": "هدف نقطة الاسترجاع (RPO)", "Recovery Time Objective (RTO)": "هدف زمن الاسترجاع (RTO)", "Integration costs are priced in the commercial section.": "تكاليف الربط مدرجة في العرض المالي.", "Integration": "ربط", "section": "القسم", "Support hours": "ساعات الدعم", "DAY": "اليوم", "HOURS": "الساعات", "Closed": "مغلق", "closed": "مغلق", "All times": "جميع الأوقات", "Service Level Agreement (SLA)": "اتفاقية مستوى الخدمة", "Response is the time to a human reply. Resolution is the time to a working system or an agreed workaround. Both are measured inside the support hours above.": "زمن الاستجابة هو الوقت حتى ردّ موظف. زمن المعالجة هو الوقت حتى عودة النظام للعمل أو اعتماد حل بديل. ويُحتسب كلاهما ضمن ساعات الدعم أعلاه.", "WHAT IT MEANS": "ما يعنيه", "Availability commitment": "التزام الإتاحة", "Measured over": "فترة القياس", "Planned maintenance": "الصيانة المجدولة", "How to raise an issue": "كيفية رفع البلاغ", "Escalation": "التصعيد", "Service credits": "التعويضات", "What the SLA does not cover": "ما لا تغطيه الاتفاقية", "Sunday": "الأحد", "Monday": "الاثنين", "Tuesday": "الثلاثاء", "Wednesday": "الأربعاء", "Thursday": "الخميس", "Friday": "الجمعة", "Saturday": "السبت", "Phases are shown in order. Give every row a real date and the bar is drawn to scale.": "المراحل معروضة بالترتيب. أدخل تواريخ فعلية لكل صف ليُرسم المخطط بمقياس زمني."};
/* Field content is whatever the user typed; only the fixed labels are translated. */
let LANG = "en";
function tr(s){ return LANG === "ar" ? esc(AR[s] || s) : esc(s); }
const DIRS = {en:"ltr", ar:"rtl"};

const P = v => String(v||"").trim() ? esc(v) : '<span class="ph">[to fill]</span>';
const D = v => { if(!v) return '<span class="ph">[date]</span>'; const d = new Date(v); return isNaN(d) ? esc(v) : esc(d.toLocaleDateString(undefined,{day:"numeric",month:"long",year:"numeric"})); };
const cur = n => esc(data.currency||"") + " " + money(n);

/* ---- print pagination ---------------------------------------------------
   Every sheet is one sheet of A4. A section whose content runs past the page
   used to be cut off by overflow:hidden and bleed onto the next printed page.
   Content is measured in the hidden 210mm box first; anything that does not
   fit is moved onto a continuation sheet that repeats the section header at
   the top and carries its own footer at the bottom. */
const SHEET_MM = 296, PAD_MM = 16, GAP_MM = 6, SAFE_MM = 4;
let _mmPx = 0;
function mmPx(){
  if (_mmPx) return _mmPx;
  const d = document.createElement("div");
  d.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;width:10mm;height:100mm";
  document.body.appendChild(d);
  _mmPx = d.offsetHeight / 100;
  d.remove();
  if (!(_mmPx > 0)) _mmPx = 96 / 25.4;
  return _mmPx;
}
const isHead = n => n && (n.tagName === "H2" || n.tagName === "H3" || String(n.className||"").indexOf("eyebrow") >= 0);

/* the eyebrow and the section title, if the sheet opens with them */
function headNodes(stack){
  const out = [], kids = stack.children;
  for (let i = 0; i < kids.length && i < 2; i++){
    const k = kids[i];
    if (String(k.className||"").indexOf("eyebrow") >= 0 || k.tagName === "H2") out.push(k); else break;
  }
  return out;
}

/* a block taller than one page is cut in two: tables keep their header row,
   lists and panels simply hand their tail to a clone of themselves */
function splitBlock(el, room){
  if (el.tagName === "TABLE") return splitTable(el, room);
  const kids = Array.from(el.children);
  if (kids.length < 2) return null;
  const chrome = Math.max(0, el.offsetHeight - kids.reduce((a, k) => a + k.offsetHeight, 0));
  let used = 0, cut = -1;
  for (let i = 0; i < kids.length; i++){
    used += kids[i].offsetHeight;
    if (chrome + used > room && i > 0){ cut = i; break; }
  }
  if (cut < 0) return null;
  const clone = el.cloneNode(false);
  for (let i = cut; i < kids.length; i++) clone.appendChild(kids[i]);
  el.after(clone);
  return clone;
}

function splitTable(tbl, room){
  const body = tbl.tBodies[0];
  if (!body || body.rows.length < 3) return null;
  const trs = Array.from(body.rows);
  const hdr = (trs[0] && trs[0].querySelector("th")) ? trs[0] : null;
  const start = hdr ? 1 : 0;
  let used = hdr ? hdr.offsetHeight : 0, cut = -1;
  for (let i = start; i < trs.length; i++){
    const h = trs[i].offsetHeight;
    if (used + h > room && i > start){ cut = i; break; }
    used += h;
  }
  if (cut < 0 || cut >= trs.length) return null;
  const next = tbl.cloneNode(false);
  const nb = document.createElement("tbody");
  next.appendChild(nb);
  if (hdr) nb.appendChild(hdr.cloneNode(true));
  for (let i = cut; i < trs.length; i++) nb.appendChild(trs[i]);
  tbl.after(next);
  return next;
}

function fitSheet(sh, full, gap){
  const stack = sh.querySelector(".stack");
  if (!stack) return;
  const footEl = sh.querySelector(".foot");
  const room = full - (footEl ? footEl.offsetHeight : 0);
  if (room <= 0) return;

  const head = headNodes(stack), hn = head.length;
  /* a block has to fit under whichever is taller: the header this sheet already
     carries, or the header that would be repeated on a continuation */
  const headH = head.reduce((a, n) => a + n.offsetHeight + gap, 0);
  const lead = [];
  for (let i = 0; i < stack.children.length; i++){
    if (isHead(stack.children[i])) lead.push(stack.children[i]); else break;
  }
  const leadH = lead.reduce((a, n) => a + n.offsetHeight + gap, 0);
  const blockRoom = Math.max(60, room - Math.max(headH, leadH));
  Array.from(stack.children).forEach(function(ch){
    if (head.indexOf(ch) >= 0) return;
    let t = ch, g = 0;
    while (t && t.offsetHeight > blockRoom && g++ < 60) t = splitBlock(t, blockRoom);
  });

  const kids = Array.from(stack.children);
  let used = 0, cut = -1;
  for (let i = 0; i < kids.length; i++){
    const h = kids[i].offsetHeight + (i ? gap : 0);
    if (used + h > room && i > 0){ cut = i; break; }
    used += h;
  }
  if (cut < 0) return;
  /* never leave a heading stranded at the foot of a page */
  while (cut > hn + 1 && isHead(kids[cut - 1])) cut--;
  let forced = false;
  if (cut <= hn){ cut = hn + 1; forced = true; }
  if (cut >= kids.length) return;

  const cont = document.createElement("section");
  cont.className = sh.className;
  ["dir","lang"].forEach(a => { if (sh.getAttribute(a)) cont.setAttribute(a, sh.getAttribute(a)); });
  const cs = document.createElement("div");
  cs.className = "stack";
  cont.appendChild(cs);

  let hAdded = 0;
  if (hn){
    hAdded = hn;
    head.forEach(function(n){
      const c = n.cloneNode(true);
      if (String(c.className||"").indexOf("eyebrow") >= 0 && !c.dataset.cont){
        c.dataset.cont = "1";
        c.textContent = c.textContent + " · " + tr("CONTINUED");
      }
      cs.appendChild(c);
    });
  } else if (footEl && footEl.firstElementChild){
    hAdded = 1;
    const e = document.createElement("p");
    e.className = "eyebrow";
    e.dataset.cont = "1";
    e.textContent = footEl.firstElementChild.textContent.toUpperCase() + " · " + tr("CONTINUED");
    cs.appendChild(e);
  }
  for (let i = cut; i < kids.length; i++) cs.appendChild(kids[i]);
  if (footEl) cont.appendChild(footEl.cloneNode(true));
  sh.after(cont);

  /* a page holding nothing but its own headings is not a page: fold it forward */
  const left = Array.from(stack.children);
  if (!forced && left.length && left.every(isHead)){
    for (let i = 0; i < hAdded && cs.firstChild; i++) cs.removeChild(cs.firstChild);
    left.slice().reverse().forEach(n => cs.insertBefore(n, cs.firstChild));
    sh.remove();
  }
  return cont;
}

/* the preview pane is narrower than A4, so scale it down instead of letting the
   sheets reflow — what is on screen is then the same layout that prints */
function fitPreview(){
  const pane = $("#preview");
  if (!pane) return;
  pane.style.zoom = "";          /* measure unscaled, or each call compounds the last */
  const cs = getComputedStyle(pane);
  const inner = pane.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0) - 2;
  if (inner <= 0) return;
  const a4 = 210 * mmPx();
  const z = Math.min(1, inner / a4);
  pane.style.zoom = z > 0.2 ? String(z) : "";
}
function onResize(){ _mmPx = 0; fitPreview(); }
window.addEventListener("resize", onResize);

function paginateSheets(root){
  const px = mmPx(), gap = GAP_MM * px;
  const full = (SHEET_MM - PAD_MM * 2 - SAFE_MM) * px;
  let sh = root.firstElementChild, guard = 0;
  while (sh && guard++ < 400){
    const made = (sh.classList && sh.classList.contains("sheet") && !sh.classList.contains("dark"))
      ? fitSheet(sh, full, gap) : null;
    sh = made ? made : (sh.parentNode ? sh.nextElementSibling : null);
  }
  const cap = SHEET_MM * px;
  Array.from(root.querySelectorAll("section.sheet")).forEach(function(s, i){
    const f = s.querySelector(".foot");
    if (f && f.lastElementChild) f.lastElementChild.textContent = String(i + 1);
    /* a block that cannot be cut any further is allowed to run on rather than
       be cut off at the edge of the paper */
    s.classList.toggle("over", s.scrollHeight > cap + 2);
  });
}

function renderPreview(){
  LANG = (data.lang === 'ar') ? 'ar' : 'en';
  let mkExec = null;
  const t = totals();
  let page = 1;
  const pg = () => ++page;
  const foot = (left, n) => '<div class="foot"><span>'+logoMark("pb-footmark")+esc(left)+'</span><span>'+n+'</span></div>';
  const rows = (arr, cells) => (arr||[]).map(r => "<tr>"+cells(r)+"</tr>").join("");
  const hist = (data.history||[]).slice().sort((a,b) => b.t - a.t);
  const integr = (data.integrations||[]).filter(r => String(r.system||"").trim() || num(r.cost) > 0);
  const attach = (data.appendix||[]).filter(r => String(r.doc||"").trim());
  const s = [];

  /* section numbers are counted, not written in, so a switched-off section renumbers the rest */
  let secNo = 0;
  const nextSec = () => { secNo++; return (secNo < 10 ? "0" : "") + secNo; };
  const on = k => data.sections && data.sections[k] !== false;
  const showHist = on("history") && hist.length > 0;
  const showAppendix = attach.length > 0 || showHist;
  const some = (arr, keys) => (arr||[]).filter(r => keys.some(k => String(r[k]||"").trim()));
  const situation  = on("situation")  ? some(data.situation,  ["pain","cost","who"]) : [];
  const outcomes   = on("outcomes")   ? some(data.outcomes,   ["outcome","measure","target"]) : [];
  const experience = on("experience") ? some(data.experience, ["person","moment","change"]) : [];
  const why        = on("why")        ? some(data.why,        ["title","detail"]) : [];
  const oblig      = on("obligations")? some(data.obligations,["item","by","owner"]) : [];
  const tlRows = (data.timeline||[]).filter(r => String(r.phase||'').trim());
  const addons = (data.addons||[]).filter(r => String(r.line||'').trim());
  const packs  = (data.packages||[]).filter(r => String(r.name||'').trim()).slice(0,3);
  const strike = (g,n) => (Math.abs(g-n) > 0.0005) ? '<s style="color:#919db6">'+money(g)+'</s> '+money(n) : money(n);
  const roi = roiFor(data);
  const showRoi = on("roi") && roi.has;

  const mkCover = () => '<section dir="' + (DIRS[LANG]||'ltr') + '" lang="' + LANG + '" class="sheet dark"><img class="art" src="' + coverSrc() + '" alt=""><div class="scrim"></div>' + logoMark("pb-mark") +
    '<div class="cbody"><p class="kick">PROPOSAL ' + P(data.ref) + ' · COMMERCIAL IN CONFIDENCE</p>' +
    '<div style="display:flex;flex-direction:column;gap:7mm"><h1>' + P(data.headline) + '</h1>' +
    '<p class="csub">Prepared for ' + P(data.client) + ' · for the attention of ' + P(data.attention) + '</p>' +
    '<div class="rule"></div></div>' +
    '<div class="meta"><span>' + P(data.preparedBy) + ', ' + P(data.role) + ' · ' + esc(company.name) + ' · ' + esc(company.site) + '</span>' +
    '<span>' + tr('Prepared by') + ' ' + P(data.preparedBy) + ' · ' + tr('valid until') + ' <span dir="ltr">' + D(data.valid) + '</span> · v' + P(data.version) + '</span></div></div></section>';
  s.push(mkCover());

  /* ---- executive summary: one page for whoever signs ---- */
  const tl = (data.timeline||[]).filter(r => String(r.phase||"").trim());
  const tlFrom = tl.length ? String(tl[0].start||"").trim() : "";
  const tlTo = tl.length ? String(tl[tl.length-1].finish||"").trim() : "";
  const tlText = (tlFrom || tlTo) ? ((tlFrom||"[start]") + " to " + (tlTo||"[finish]")) : String(data.goLive||"").trim();
  const execHas = ["problem","outcome","ask","execOverride"].some(k => String(data[k]||"").trim());
  if (on("exec") && execHas){
    const body = String(data.execOverride||"").trim()
      ? '<div class="lead">' + String(data.execOverride).trim().split(/\n+/).map(p => "<p>"+esc(p)+"</p>").join("") + '</div>'
      : '<table><tr><th style="width:26%">&nbsp;</th><th>&nbsp;</th></tr>' +
        '<tr><td>' + tr('The problem') + '</td><td class="m">' + P(data.problem) + '</td></tr>' +
        '<tr><td>' + tr('The outcome') + '</td><td class="m">' + P(data.outcome) + '</td></tr>' +
        (tlText ? '<tr><td>' + tr('Timeline') + '</td><td class="m"><span dir="ltr">' + esc(tlText) + '</span></td></tr>' : '') +
        '<tr><td>' + tr('Year-one investment') + '</td><td class="m">' + cur(t.yearOne) + ' ' + tr('including VAT') + '</td></tr>' +
        (showRoi ? '<tr><td>' + tr('Payback') + '</td><td class="m">' + esc(roi.payback.toFixed(1)) + ' ' + tr('months on stated figures') + '</td></tr>' : '') +
        '<tr><td>' + tr('The ask') + '</td><td class="m">' + P(data.ask) + '</td></tr></table>';
    mkExec = () => '<section dir="' + (DIRS[LANG]||'ltr') + '" lang="' + LANG + '" class="sheet"><div class="stack"><p class="eyebrow">' + tr('EXECUTIVE SUMMARY') + '</p>' +
      '<h2>' + P(data.client) + '</h2>' + body +
      '<p class="note">' + tr('Prepared by') + ' ' + P(data.preparedBy) + ' · ' + tr('valid until') + ' ' + D(data.valid) + '</p>' +
      '</div>' + foot(tr('Executive summary'), pg()) + '</section>';
    s.push(mkExec());
  }

  /* ---- their situation, the outcomes, the people ---- */
  if (situation.length || outcomes.length || experience.length){
    const n = nextSec();
    s.push('<section class="sheet"><div class="stack"><p class="eyebrow">' + tr('SECTION') + ' ' + n + '</p><h2>' + tr("Where you are, and where this gets you") + '</h2>' +
      (situation.length ? '<h3>' + n + '.1 ' + tr("Your situation today") + '</h3>' +
        '<table><tr><th style="width:40%">' + tr("WHAT HAPPENS NOW") + '</th><th style="width:38%">' + tr("WHAT IT COSTS") + '</th><th class="ac" style="width:22%">' + tr("WHO FEELS IT") + '</th></tr>' +
        rows(situation, r => '<td>'+P(r.pain)+'</td><td class="m">'+P(r.cost)+'</td><td class="m">'+P(r.who)+'</td>') + '</table>' : "") +
      (outcomes.length ? '<h3>' + n + '.' + (situation.length?2:1) + ' Outcomes we commit to</h3>' +
        '<table><tr><th style="width:32%">' + tr("OUTCOME") + '</th><th style="width:20%">' + tr("MEASURE") + '</th><th style="width:14%">' + tr("TODAY") + '</th><th class="ac" style="width:16%">' + tr("TARGET") + '</th><th style="width:18%">' + tr("BY WHEN") + '</th></tr>' +
        rows(outcomes, r => '<td>'+P(r.outcome)+'</td><td class="m">'+P(r.measure)+'</td><td class="num m">'+P(r.baseline)+'</td><td class="num">'+P(r.target)+'</td><td class="m">'+P(r.when)+'</td>') +
        '</table><p class="m" style="font-size:8.6pt">Targets are measured against the baseline recorded at go-live, not against an estimate.</p>' : "") +
      (experience.length ? '<h3>' + n + '.' + (1+(situation.length?1:0)+(outcomes.length?1:0)) + ' What changes, person by person</h3>' +
        '<table><tr><th style="width:24%">' + tr("WHO") + '</th><th style="width:38%">' + tr("THE MOMENT THAT MATTERS") + '</th><th class="ac" style="width:38%">' + tr("WHAT CHANGES FOR THEM") + '</th></tr>' +
        rows(experience, r => '<td>'+P(r.person)+'</td><td class="m">'+P(r.moment)+'</td><td class="m">'+P(r.change)+'</td>') + '</table>' : "") +
      '</div>' + foot(tr("Section") + " " + n, pg()) + '</section>');
  }

  /* ---- why us, and the value ---- */
  if (why.length || showRoi){
    const n = nextSec();
    s.push('<section class="sheet"><div class="stack"><p class="eyebrow">' + tr('SECTION') + ' ' + n + '</p><h2>Why ' + esc(company.name || "us") + ', and what it is worth</h2>' +
      (why.length ? '<h3>' + n + '.1 Why ' + esc(company.name || "us") + '</h3><div class="cols" style="flex-wrap:wrap">' +
        why.map(d => '<div class="panel" style="min-width:52mm"><h3>'+P(d.title)+'</h3><p class="m">'+P(d.detail)+'</p></div>').join("") + '</div>' : "") +
      (showRoi ? '<h3>' + n + '.' + (why.length?2:1) + ' Value against cost</h3>' +
        '<table><tr><th style="width:60%">' + tr("LINE") + '</th><th class="ac" style="width:40%">' + tr("ANNUAL") + '</th></tr>' +
        (roi.timeValue ? '<tr><td>Time recovered — ' + esc(money(roi.hours)) + ' hours a month at ' + cur(roi.rate) + '</td><td class="num m">' + cur(roi.timeValue) + '</td></tr>' : '') +
        (roi.revenue ? '<tr><td>Revenue protected or gained</td><td class="num m">' + cur(roi.revenue) + '</td></tr>' : '') +
        (roi.other ? '<tr><td>Other savings</td><td class="num m">' + cur(roi.other) + '</td></tr>' : '') +
        '<tr class="tot"><td>' + tr('Annual value') + '</td><td class="num">' + cur(roi.annual) + '</td></tr></table>' +
        '<div class="cols"><div class="panel">' +
        '<div class="kv"><span class="m">' + tr('Year-one cost') + '</span><span class="v">' + cur(roi.yearOneCost) + '</span></div>' +
        '<div class="kv"><span class="m">' + tr('Payback') + '</span><span class="v">' + esc(roi.payback.toFixed(1)) + ' months</span></div>' +
        '<div class="kv"><span class="m">' + tr('Three-year net') + '</span><span class="v" style="color:' + (roi.net3 >= 0 ? "var(--green)" : "var(--ember-ink)") + '">' + cur(roi.net3) + '</span></div>' +
        '</div></div>' +
        '<p class="m" style="font-size:8.6pt">On the figures ' + P(data.client) + ' supplied, the platform repays its year-one cost in ' +
        esc(roi.payback.toFixed(1)) + ' months and nets ' + cur(roi.net3) + ' over three years. These are your numbers, not ours — change an input and the case changes with it.</p>' : "") +
      '</div>' + foot(tr("Section") + " " + n, pg()) + '</section>');
  }

  let nTech = '', nChange = '', nComm = '', nApp = '';
  const nPlat = nextSec();
  s.push('<section class="sheet"><div class="stack"><p class="eyebrow">' + tr('SECTION') + ' ' + nPlat + '</p><h2>' + tr("The platform") + '</h2>' +
    '<p class="lead">' + P(data.headline) + '</p><p class="m">' + P(data.subline) + '</p>' +
    '<h3>' + tr("Understanding of your requirement") + '</h3><p class="m">' + P(data.understanding) + '</p>' +
    '<div class="cols"><div class="panel">' +
      '<div class="kv"><span class="m">Entities</span><span class="v">' + P(data.entities) + '</span></div>' +
      '<div class="kv"><span class="m">Users</span><span class="v">' + P(data.users) + '</span></div></div>' +
    '<div class="panel">' +
      '<div class="kv"><span class="m">Modules in scope</span><span class="v">' + P(data.modules) + '</span></div>' +
      '<div class="kv"><span class="m">Target go-live</span><span class="v">' + P(data.goLive) + '</span></div></div></div>' +
    '<h3>' + tr("What the platform covers") + '</h3><table><tr><th style="width:26%">' + tr("CAPABILITY") + '</th><th style="width:56%">' + tr("WHAT IT DOES") + '</th><th class="ac" style="width:18%">' + tr("STATUS") + '</th></tr>' +
    rows(data.capabilities, r => '<td>'+P(r.name)+'</td><td class="m">'+P(r.what)+'</td><td class="m">'+P(r.status)+(String(r.due||'').trim()?' &middot; '+esc(r.due):'')+'</td>') +
    '</table></div>' + foot(tr("Section") + " " + nPlat + " · " + tr("The platform"), pg()) + '</section>');

  nTech = nextSec();
  s.push('<section class="sheet"><div class="stack"><p class="eyebrow">' + tr('SECTION') + ' ' + nTech + '</p><h2>' + tr("Technical proposal") + '</h2>' +
    '<p class="lead">' + P(data.techLead) + '</p><h3>' + nTech + '.1 ' + tr("Scope of work") + '</h3>' +
    '<table><tr><th style="width:12%">' + tr("REF") + '</th><th style="width:20%">' + tr("WORKSTREAM") + '</th><th style="width:30%">' + tr("DELIVERED") + '</th><th style="width:12%">' + tr("OWNER") + '</th><th class="ac" style="width:26%">' + tr("OUT OF SCOPE") + '</th></tr>' +
    rows(data.scope, r => '<td class="num">'+P(r.ref)+'</td><td>'+P(r.work)+'</td><td class="m">'+P(r.del)+'</td><td class="m">'+P(r.owner)+'</td><td class="m">'+P(r.out)+'</td>') +
    '</table><h3>' + nTech + '.2 ' + tr("Deliverables") + '</h3>' +
    '<table><tr><th style="width:44%">' + tr("DELIVERABLE") + '</th><th style="width:16%">' + tr("FORMAT") + '</th><th style="width:16%">' + tr("DUE") + '</th><th style="width:24%">' + tr("ACCEPTED BY") + '</th></tr>' +
    rows(data.deliverables, r => '<td>'+P(r.name)+'</td><td class="m">'+P(r.fmt)+'</td><td class="m">'+P(r.due)+'</td><td class="m">'+P(r.by)+'</td>') +
    '</table>' +
    (integr.length ? '<h3>' + nTech + '.3 ' + tr("Integrations") + '</h3>' +
      '<table><tr><th style="width:34%">' + tr("SYSTEM") + '</th><th style="width:22%">' + tr("DIRECTION") + '</th><th style="width:20%">' + tr("METHOD") + '</th><th class="ac" style="width:24%">' + tr("ACCESS FROM") + '</th></tr>' +
      rows(integr, r => '<td>'+P(r.system)+'</td><td class="m">'+P(r.direction)+'</td><td class="m">'+P(r.method)+'</td><td class="m">'+P(r.provider)+'</td>') +
      '</table><p class="m" style="font-size:8.6pt">' + esc(cl("integrScope")) + ' ' + (t.integr ? tr('Integration costs are priced in the commercial section.') : '') + '</p>' : "") +
    '</div>' + foot(tr("Section") + " " + nTech + " · " + tr("Technical proposal"), pg()) + '</section>');

  s.push('<section class="sheet"><div class="stack"><h3>' + nTech + '.4 ' + tr("Hosting, residency and security") + '</h3>' +
    '<table><tr><th style="width:30%">' + tr("ITEM") + '</th><th>' + tr("COMMITMENT") + '</th></tr>' +
    '<tr><td>Hosting region</td><td class="m">' + P(data.region) + '</td></tr>' +
    '<tr><td>Data residency</td><td class="m">' + esc(cl("residency")) + '</td></tr>' +
    '<tr><td>' + tr('Backups') + '</td><td class="m">' + P(data.backups) + '</td></tr>' +
    '<tr><td>' + tr('Recovery Point Objective (RPO)') + '</td><td class="m">' + P(data.rpo) + '</td></tr>' +
    '<tr><td>' + tr('Recovery Time Objective (RTO)') + '</td><td class="m">' + P(data.rto) + '</td></tr>' +
    '<tr><td>Availability target</td><td class="m">' + P(data.availability) + '</td></tr>' +
    '<tr><td>Export on exit</td><td class="m">' + P(data.exit) + '</td></tr>' +
    '<tr><td>Certifications</td><td class="m">' + P(data.certs) + '</td></tr></table>' +
    '<div class="cols"><div class="panel"><p class="eyebrow">' + tr('ASSUMPTIONS') + '</p><ul>' +
    (data.assumptions||[]).map(a => "<li>"+P(a)+"</li>").join("") + '</ul></div>' +
    '<div class="panel"><p class="eyebrow">' + tr('EXCLUSIONS') + '</p><ul>' +
    (data.exclusions||[]).map(a => "<li>"+P(a)+"</li>").join("") + '</ul></div></div>' +
    '<h3>' + nTech + '.5 ' + tr("Timeline") + '</h3><table><tr><th style="width:28%">' + tr("PHASE") + '</th><th style="width:22%">' + tr("START") + '</th><th style="width:22%">' + tr("FINISH") + '</th><th class="ac" style="width:28%">' + tr("GATE") + '</th></tr>' +
    rows(data.timeline, r => '<td>'+P(r.phase)+'</td><td class="m">'+P(r.start)+'</td><td class="m">'+P(r.finish)+'</td><td class="m">'+P(r.gate)+'</td>') +
    '</table>' + (on("timelineBar") && tlRows.length ? timelineBox(tlRows) : '') + (oblig.length ? '<h3>' + nTech + '.6 ' + tr("What we need from you") + '</h3>' + '<table><tr><th style="width:52%">' + tr("ITEM") + '</th><th style="width:22%">' + tr("NEEDED BY") + '</th><th class="ac" style="width:26%">' + tr("OWNER") + '</th></tr>' + rows(oblig, r => '<td>'+P(r.item)+'</td><td class="m">'+P(r.by)+'</td><td class="m">'+P(r.owner)+'</td>') + '</table><p class="m" style="font-size:8.6pt">' + esc(cl("obligations")) + '</p>' : '') + '<p class="note">' + esc(cl("signature")) + '</p>' +
    '</div>' + foot(tr("Section") + " " + nTech + " · " + tr("Technical proposal"), pg()) + '</section>');

  const trig = (data.changeTriggers||[]).filter(v => String(v||"").trim());
  s.push('<section class="sheet"><div class="stack"><p class="eyebrow">' + (nChange = nextSec(), tr('SECTION') + ' ' + nChange) + '</p><h2>' + tr("Change control") + '</h2>' +
    '<p class="lead">' + P(data.changeIntro) + '</p>' +
    '<h3>' + nChange + '.1 ' + tr("How a change is raised") + '</h3>' +
    '<table><tr><th style="width:30%">' + tr("ITEM") + '</th><th>' + tr("TERM") + '</th></tr>' +
    '<tr><td>Raised by</td><td class="m">Either party, in writing</td></tr>' +
    '<tr><td>Approved by</td><td class="m">' + P(data.changeApprover) + ', for ' + P(data.client) + '</td></tr>' +
    '<tr><td>Quote turnaround</td><td class="m">' + P(data.changeTurnaround) + ' from the written request</td></tr>' +
    '<tr><td>Effect on the plan</td><td class="m">' + esc(cl("changePlan")) + '</td></tr>' +
    '<tr><td>Work before approval</td><td class="m">' + esc(cl("changeNoWork")) + '</td></tr></table>' +
    (trig.length ? '<h3>' + nChange + '.2 ' + tr("What counts as a change") + '</h3><ul>' + trig.map(v => "<li>"+P(v)+"</li>").join("") + '</ul>' : "") +
    '<h3>' + nChange + '.3 ' + tr("Rates") + '</h3><table><tr><th style="width:50%">' + tr("BASIS") + '</th><th class="ac" style="width:50%">' + tr("RATE") + '</th></tr>' +
    '<tr><td>Day rate</td><td class="num m">' + (num(data.changeDayRate) ? cur(num(data.changeDayRate)) : P("")) + '</td></tr>' +
    '<tr><td>Hourly rate</td><td class="num m">' + (num(data.changeHourRate) ? cur(num(data.changeHourRate)) : P("")) + '</td></tr>' +
    (t.allowance ? '<tr class="tot"><td>Change allowance included in this proposal</td><td class="num">' + cur(t.allowance) + '</td></tr>' : "") +
    '</table>' +
    '<p class="m" style="font-size:8.6pt">' + esc(cl(t.allowance ? "changeSome" : "changeNone")) + '</p>' +
    '</div>' + foot(tr("Section") + " " + nChange + " · " + tr("Change control"), pg()) + '</section>');

  let cSub = 0;
  const cNo = () => nComm + "." + (++cSub);
  s.push('<section class="sheet"><div class="stack"><p class="eyebrow">' + (nComm = nextSec(), tr('SECTION') + ' ' + nComm) + '</p><h2>' + tr("Commercial proposal") + '</h2>' +
    '<p class="lead">Total project cost for year one is ' + cur(t.yearOne) + ' including VAT: a one-off project cost of ' + cur(t.oneoff) +
    ' and an annual subscription of ' + cur(t.subs) + ' on the ' + P(data.tier) + ' plan.</p>' +
    (packs.length ? '<h3>' + cNo() + ' ' + tr("Pricing options") + '</h3><div class="cols">' + packs.map(function(p){
      return '<div class="panel"' + (p.pick ? ' style="border-color:var(--ember);border-width:2px"' : '') + '>' +
        (p.pick ? '<p class="eyebrow">' + tr('RECOMMENDED') + '</p>' : '') +
        '<h3>' + P(p.name) + '</h3>' +
        '<p class="v" style="font-family:var(--mono);font-size:13pt">' + esc(data.currency||'') + ' ' + money(num(p.price)) + '</p>' +
        '<p class="m" style="font-size:8.4pt">' + P(p.basis) + '</p>' +
        '<ul>' + String(p.items||'').split(',').map(function(x){ return x.trim(); }).filter(Boolean).map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('') + '</ul>' +
      '</div>'; }).join('') + '</div><p class="m" style="font-size:8.6pt">The pricing that follows sets out the recommended option in full.</p>' : '') +
    '<h3>' + cNo() + ' ' + tr("Subscription") + '</h3><table><tr><th style="width:26%">' + tr("LINE") + '</th><th style="width:22%">' + tr("BASIS") + '</th><th style="width:9%">' + tr("QTY") + '</th><th style="width:14%">' + tr("UNIT") + '</th><th style="width:15%">' + tr("BILLED") + '</th><th class="ac" style="width:14%">' + tr("ANNUAL") + '</th></tr>' +
    rows(data.subs, r => '<td>'+P(r.line)+'</td><td class="m">'+P(r.basis)+'</td><td class="num m">'+P(r.qty)+'</td><td class="num m">'+money(num(r.unit))+'</td><td class="m">'+P(r.when||"In advance")+'</td><td class="num">'+strike(num(r.qty)*num(r.unit), discNet(num(r.qty)*num(r.unit), r.disc))+'</td>') +
    '<tr class="tot"><td>' + tr('Annual subscription') + '</td><td></td><td></td><td></td><td></td><td class="num">' + cur(t.subs) + '</td></tr></table>' +
    '<h3>' + cNo() + ' ' + tr("One-off project cost") + '</h3><table><tr><th style="width:70%">' + tr("LINE") + '</th><th class="ac" style="width:30%">' + tr("AMOUNT") + '</th></tr>' +
    rows(data.oneoff, r => '<td>'+P(r.line)+'</td><td class="num m">'+strike(num(r.amount), discNet(num(r.amount), r.disc))+'</td>') +
    (integr.length ? rows(integr, r => '<td>' + tr('Integration') + ' \u2014 ' + P(r.system) + ' <span class="m" style="font-size:8pt">(' + tr('section') + ' ' + nTech + '.3)</span></td><td class="num m">'+money(num(r.cost))+'</td>') : "") +
    (t.allowance ? '<tr><td>Change allowance, per section ' + nChange + '.3</td><td class="num m">' + money(t.allowance) + '</td></tr>' : "") +
    (t.addOnce ? '<tr><td>' + tr('Accepted add-ons') + '</td><td class="num m">' + money(t.addOnce) + '</td></tr>' : "") +
    '<tr class="tot"><td>' + tr('One-off project cost') + '</td><td class="num">' + cur(t.oneoff) + '</td></tr></table>' +
    (addons.length ? '<h3>' + cNo() + ' ' + tr("Optional, not included in the total") + '</h3>' +
      '<table><tr><th style="width:50%">' + tr("ADD-ON") + '</th><th style="width:16%">' + tr("BASIS") + '</th><th style="width:18%">' + tr("AMOUNT") + '</th><th class="ac" style="width:16%">' + tr("STATUS") + '</th></tr>' +
      rows(addons, r => '<td>'+P(r.line)+'</td><td class="m">'+P(r.basis)+'</td><td class="num m">'+money(num(r.amount))+'</td><td class="m">'+(r.accepted?'Accepted':'Not taken')+'</td>') +
      '</table><p class="m" style="font-size:8.6pt">Anything marked not taken is excluded from every figure in this proposal. It can be added later at the price shown.</p>' : '') +
    '<div class="cols"><div class="panel" style="border-color:var(--ember);border-width:2px">' +
    '<div class="kv"><span class="m">' + tr('One-off project cost') + '</span><span class="v">' + cur(t.oneoff) + '</span></div>' +
    '<div class="kv"><span class="m">' + tr('Annual subscription') + '</span><span class="v">' + cur(t.subs) + '</span></div>' +
    ((t.lineDiscount || t.totalDiscount) ? '<div class="kv"><span class="m">Discount' + (String(data.discountNote||'').trim() ? ' — ' + esc(data.discountNote) : '') + '</span><span class="v" style="color:#0f7d57">− ' + cur(t.lineDiscount + t.totalDiscount) + '</span></div>' : '') +
    '<div class="kv"><span class="m">VAT at ' + P(data.vat) + '%</span><span class="v">' + cur(t.vat) + '</span></div>' +
    '<div class="kv" style="border-top:1px solid var(--ember);padding-top:3mm"><span style="font-size:11pt">' + tr('Total project cost, year one') + '</span>' +
      '<span class="v" style="font-size:12pt;color:var(--ember-ink)"><strong>' + cur(t.yearOne) + '</strong></span></div>' +
    '<div class="kv"><span class="m">' + tr('Year two onward') + '</span><span class="v">' + cur(t.yearTwo) + ' + VAT</span></div>' +
    '</div></div></div>' + foot(tr("Section") + " " + nComm + " · " + tr("Commercial proposal"), pg()) + '</section>');

  s.push('<section class="sheet"><div class="stack"><h3>' + cNo() + ' ' + tr("Payment milestones") + '</h3>' +
    '<table><tr><th style="width:28%">' + tr("MILESTONE") + '</th><th style="width:38%">' + tr("TRIGGER") + '</th><th style="width:14%">' + tr("SHARE") + '</th><th class="ac" style="width:20%">' + tr("AMOUNT") + '</th></tr>' +
    rows(data.milestones, r => '<td>'+P(r.name)+'</td><td class="m">'+P(r.trigger)+'</td><td class="num m">'+money(num(r.share))+'%</td><td class="num m">'+money(t.oneoff*num(r.share)/100)+'</td>') +
    '</table><p class="m">' + esc(cl("milestoneNote")) + '</p>' +
    '<h3>' + cNo() + ' ' + tr("Terms") + '</h3><table><tr><th style="width:30%">' + tr("ITEM") + '</th><th>' + tr("TERM") + '</th></tr>' +
    '<tr><td>Initial term</td><td class="m">' + P(data.initialTerm) + ' months from go-live</td></tr>' +
    '<tr><td>Renewal</td><td class="m">Automatic unless either party gives ' + P(data.noticeDays) + ' days&#39; written notice</td></tr>' +
    '<tr><td>Price on renewal</td><td class="m">' + P(data.renewalPrice) + '</td></tr>' +
    '<tr><td>Subscription billing</td><td class="m">' + esc(((data.subs||[]).map(r => r.when).filter(Boolean)[0]) || "In advance") + '; ' + esc(cl("subsNote")) + '</td></tr>' +
    '<tr><td>Headcount growth</td><td class="m">' + esc(cl("headcount")) + '</td></tr>' +
    '<tr><td>Exit</td><td class="m">' + P(data.exit) + '</td></tr></table>' +
    '<h3>' + cNo() + ' ' + tr("Support hours") + '</h3>' +
    '<table><tr><th style="width:34%">' + tr("DAY") + '</th><th class="ac">' + tr("HOURS") + '</th></tr>' +
    (data.hours||[]).map(r => '<tr><td>' + tr(dayFull(r.d)) + '</td><td class="num m">' +
      (r.on ? '<span dir="ltr">' + esc(r.from||"") + '\u2013' + esc(r.to||"") + '</span>' : tr("Closed")) + '</td></tr>').join("") +
    '<tr class="tot"><td>' + tr('All times') + '</td><td class="num">' + P(data.hoursTz) + '</td></tr></table>' +
    (String(data.supportHours||'').trim() ? '<p class="m" style="font-size:8.6pt">' + esc(data.supportHours) + '</p>' : '') +
    '</div>' + foot(tr("Section") + " " + nComm + " · " + tr("Commercial proposal"), pg()) + '</section>');

  s.push('<section class="sheet"><div class="stack"><h3>' + cNo() + ' ' + tr("Service Level Agreement (SLA)") + '</h3>' +
    '<p class="m">' + tr("Response is the time to a human reply. Resolution is the time to a working system or an agreed workaround. Both are measured inside the support hours above.") + '</p>' +
    '<table><tr><th style="width:34%">' + tr("SEVERITY") + '</th><th style="width:33%">' + tr("RESPONSE") + '</th><th class="ac" style="width:33%">' + tr("RESOLUTION") + '</th></tr>' +
    rows(data.sla, r => '<td>'+P(r.sev)+'</td><td class="num m">'+P(r.resp)+'</td><td class="num m">'+P(r.res)+'</td>') +
    '</table>' +
    (function(){
      const pts = [
        ["Availability commitment", data.slaUptime],
        ["Measured over", data.slaWindow],
        ["Planned maintenance", data.slaMaint],
        ["How to raise an issue", data.slaChannels],
        ["Escalation", data.slaEscalation],
        ["Service credits", data.slaCredits]
      ].filter(r => String(r[1]||"").trim());
      if (!pts.length) return "";
      return '<table><tr><th style="width:34%">' + tr("COMMITMENT") + '</th><th class="ac">' + tr("WHAT IT MEANS") + '</th></tr>' +
        pts.map(r => '<tr><td>' + tr(r[0]) + '</td><td class="m">' + esc(String(r[1])) + '</td></tr>').join("") + '</table>';
    })() +
    (String(data.slaExclusions||'').trim()
      ? '<h3>' + tr("What the SLA does not cover") + '</h3><p class="m">' + esc(data.slaExclusions) + '</p>' : '') +
    (String(cl("sla")||'').trim() ? '<p class="m" style="font-size:8.6pt">' + esc(cl("sla")) + '</p>' : '') +
    '<p class="note">' + esc(cl("validity")) + '</p>' +
    '</div>' + foot(tr("Section") + " " + nComm + " · " + tr("Commercial proposal"), pg()) + '</section>');

  if (showAppendix){
    s.push('<section class="sheet"><div class="stack"><p class="eyebrow">' + (nApp = nextSec(), tr('SECTION') + ' ' + nApp) + '</p><h2>' + tr("Appendix") + '</h2>' +
      (attach.length ? '<h3>' + tr("Attached documents") + '</h3><table><tr><th style="width:12%">' + tr("REF") + '</th><th style="width:66%">' + tr("DOCUMENT") + '</th><th class="ac" style="width:22%">' + tr("ATTACHED") + '</th></tr>' +
        rows(attach, r => '<td class="num">'+P(r.ref)+'</td><td>'+P(r.doc)+(r.img?'<br><img src="'+r.img+'" alt="" style="margin-top:2mm;width:70mm;height:38mm;object-fit:contain;object-position:left top;border:1px solid #d1d8e5;border-radius:3px">':'')+'</td><td class="m">'+P(r.att)+'</td>') + '</table>' : "") +
      (showHist ? '<h3>' + tr("Revision history") + '</h3><table><tr><th style="width:28%">' + tr("DATE") + '</th><th>' + tr("CHANGE") + '</th></tr>' +
        hist.map(e => '<tr><td class="num m">'+esc(new Date(e.t).toLocaleString(undefined,{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}))+'</td><td class="m">'+esc(e.m)+'</td></tr>').join("") + '</table>' : "") +
      '<h3>' + tr("Acceptance") + '</h3><div class="sign">' +
      '<div><p class="eyebrow">' + P(data.client) + '</p><span class="line">' + tr('Name and title') + '</span><span class="line">' + tr('Signature and date') + '</span></div>' +
      '<div><p class="eyebrow" style="color:var(--ember-ink)">' + esc((company.name||"").toUpperCase()) + '</p><span class="line">' + tr('Name and title') + '</span><span class="line">' + tr('Signature and date') + '</span></div></div>' +
      '<p class="note">' + P(data.ask) + ' Questions to ' + P(data.preparedBy) + ' · ' + esc(company.site) + '</p>' +
      '</div>' + foot(tr("Section") + " " + nApp + " · " + tr("Appendix"), pg()) + '</section>');
  }

  /* bilingual: the cover and the executive summary again in Arabic, then the rest as primary */
  if (data.lang === "bi"){
    const prev = LANG;
    LANG = "ar";
    const extra = [mkCover()];
    if (mkExec) extra.push(mkExec());
    LANG = prev;
    s.splice(mkExec ? 2 : 1, 0, extra.join(""));
  }
  const pv = $("#preview"), m = $("#measure");
  pv.setAttribute("dir", DIRS[LANG] || "ltr");
  pv.setAttribute("lang", LANG);
  const dir = DIRS[LANG] || "ltr";
  if (m){
    m.setAttribute("dir", dir);
    m.setAttribute("lang", LANG);
    m.innerHTML = s.join("");
    try { paginateSheets(m); } catch(e){ /* measurement is best effort; print the unsplit sheets */ }
    pv.innerHTML = m.innerHTML;
    m.innerHTML = "";
    fitPreview();
    try { drawTimelines(pv); } catch(e){ /* the table prints either way */ }
  } else {
    pv.innerHTML = s.join("");
    try { drawTimelines(pv); } catch(e){}
  }
}

/* ---------- images: downscale and re-encode before anything is stored ---------- */
function shrinkImage(file, maxPx, maxKB, cb){
  if (!file) { cb(null, "No file chosen."); return; }
  if (!/^image\//.test(file.type)){ cb(null, "Only images can be stored. Export a PDF page as PNG or JPG first."); return; }
  const fr = new FileReader();
  fr.onerror = function(){ cb(null, "That file could not be read."); };
  fr.onload = function(){
    const img = new Image();
    img.onerror = function(){ cb(null, "That file could not be read as an image."); };
    img.onload = function(){
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      let q = 0.82, out = c.toDataURL("image/jpeg", q);
      while (out.length > maxKB * 1024 && q > 0.3){ q -= 0.12; out = c.toDataURL("image/jpeg", q); }
      if (out.length > maxKB * 1024){ cb(null, "Still over " + maxKB + "KB after compression — crop it or use a smaller image."); return; }
      cb(out, null);
    };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}

/* ---------- company profile dialog ---------- */
const CLAUSE_LABELS = {
  residency:"Data residency line", headcount:"Headcount growth", signature:"Signature and timeline note",
  sla:"SLA footnote", integrScope:"Integrations scope note", changeNone:"No change allowance",
  changeSome:"Change allowance included", changeNoWork:"Work before approval", changePlan:"Effect on the plan",
  milestoneNote:"Milestone and invoice note", subsNote:"Subscription billing note",
  obligations:"Client obligations note", validity:"Validity note"
};
function renderCompany(){
  $("#companyBody").innerHTML =
    '<div class="grid2">' +
      '<div class="field"><label for="co-name">COMPANY NAME</label><input id="co-name" data-c="name" value="'+esc(company.name)+'"></div>' +
      '<div class="field"><label for="co-site">WEBSITE</label><input id="co-site" data-c="site" value="'+esc(company.site)+'"></div>' +
    '</div>' +
    '<div class="field"><label for="co-cover">COVER IMAGE</label>' +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
      '<input type="file" id="co-cover" accept="image/*">' +
      (company.cover ? '<button class="btn ghost" id="coClearCover">Use built-in</button>' : '<span class="hint">Using the built-in image</span>') +
      '</div></div>' +
    (company.cover ? '<img src="'+company.cover+'" alt="Current cover" style="width:100%;max-height:110px;object-fit:cover;border-radius:8px">' : '') +
    '<h3>Standard clauses</h3>' +
    '<p class="hint">These print in every proposal. <code>{valid}</code>, <code>{payDays}</code> and <code>{company}</code> are filled in from the proposal itself.</p>' +
    Object.keys(CLAUSE_LABELS).map(function(k){
      return '<div class="field"><label for="cc-'+k+'">'+esc(CLAUSE_LABELS[k].toUpperCase())+'</label>' +
        '<textarea id="cc-'+k+'" data-cc="'+k+'" style="min-height:50px">'+esc(company.clauses[k]||"")+'</textarea></div>';
    }).join("") +
    '<h3>Differentiators</h3><p class="hint">Pre-fills the "Why ' + esc(company.name || "us") + '" section on every new proposal.</p>' +
    '<div class="rows">' + (company.differentiators||[]).map(function(d,i){
      return '<div class="row" style="grid-template-columns:1fr 1.6fr 32px">' +
        '<input data-cd="'+i+'" data-f="title" value="'+esc(d.title)+'" placeholder="Title" aria-label="Title">' +
        '<input data-cd="'+i+'" data-f="detail" value="'+esc(d.detail)+'" placeholder="One line" aria-label="Detail">' +
        '<button class="del" data-cddel="'+i+'" aria-label="Remove">&times;</button></div>';
    }).join("") + '</div>' +
    '<div><button class="btn light" id="coAddDiff">Add differentiator</button></div>' +
    costingPanel();
}

function label(){ $("#fileLabel").textContent = (data.client || "Untitled") + " · " + (data.ref || "no ref") + " · " + statusLabel(data.status); }
/* indexes into STEPS that are currently reachable; the internal step drops out
   when "Hide internal" is on, without renumbering anything the client sees */
function visibleSteps(){
  return STEPS.map((s, i) => i).filter(i => !(STEPS[i].internal && hideInternal));
}
function renderSteps(){
  const vis = visibleSteps();
  if (vis.indexOf(step) < 0) step = vis[0];
  $("#steps").innerHTML = vis.map(function(i){
    const s = STEPS[i];
    return '<button class="step '+(i===step?"on":"")+(s.internal?" int":"")+'" data-step="'+i+'"><span class="n">'+s.n+'</span>'+s.t+'</button>';
  }).join("");
  $("#stepBody").innerHTML = STEPS[step].render();
  refreshInternal();
  const at = vis.indexOf(step);
  $("#stepCount").textContent = "Step " + (at+1) + " of " + vis.length;
  $("#btnPrev").disabled = at === 0;
  $("#btnNext").disabled = at === vis.length - 1;
  label();
}
function stepBy(delta){
  const vis = visibleSteps(), at = vis.indexOf(step);
  const next = vis[Math.max(0, Math.min(vis.length - 1, at + delta))];
  if (next !== undefined && next !== step){ step = next; renderSteps(); window.scrollTo(0,0); }
}
function renderAll(){ renderSteps(); renderPreview(); }
function setView(){
  view = "build";
  renderAll();
}
function refreshDerived(){
  refreshInternal();
  const tb = $("#totalsBox"); if (tb) tb.innerHTML = totalsHtml();
  const rb = $("#roiBox"); if (rb) rb.innerHTML = roiHtml();
  const sh = $("#shareHint"); if (sh) sh.innerHTML = shareHtml();
  if (STEPS[step].t === "Review") $("#stepBody").innerHTML = stepReview();
}

let editTimer = null;
function noteEdit(){
  clearTimeout(editTimer);
  const where = STEPS[step].t.toLowerCase();
  editTimer = setTimeout(function(){ log("Edited " + where); persist(); }, 4000);
}

root.addEventListener("input", function(e){
  const el = e.target;
  if (el.dataset.c !== undefined){ company[el.dataset.c] = el.value; cstore.save(company); renderPreview(); return; }
  if (el.dataset.cc !== undefined){ company.clauses[el.dataset.cc] = el.value; cstore.save(company); renderPreview(); return; }
  if (el.dataset.cd !== undefined){ company.differentiators[+el.dataset.cd][el.dataset.f] = el.value; cstore.save(company); return; }
  if (el.dataset.ik !== undefined){
    const row = data.internal[el.dataset.ik][+el.dataset.i];
    if (row) row[el.dataset.f] = el.dataset.bool ? (el.value === "Yes") : el.value;
    persist(); noteEdit(); refreshInternal(); return;
  }
  if (el.dataset.ikms !== undefined){
    const i = +el.dataset.ikms;
    if (!Array.isArray(data.internal.msMonths)) data.internal.msMonths = [];
    data.internal.msMonths[i] = el.value;
    persist(); noteEdit(); refreshInternal(); return;
  }
  if (el.dataset.iklist !== undefined){ data.internal[el.dataset.iklist][+el.dataset.i] = el.value; persist(); noteEdit(); return; }
  if (el.dataset.ikg2 !== undefined){ data.internal[el.dataset.ikg2] = el.value; persist(); noteEdit(); refreshInternal(); return; }
  if (el.dataset.ik2 !== undefined){ data.internal[el.dataset.ik2] = el.value; persist(); noteEdit(); refreshInternal(); return; }
  if (el.dataset.ikg !== undefined){ data.internal[el.dataset.ikg][el.dataset.f] = el.value; persist(); noteEdit(); refreshInternal(); return; }
  if (el.dataset.cs !== undefined){ company.costing[el.dataset.cs] = el.value; cstore.save(company); refreshInternal(); return; }
  if (el.dataset.cok !== undefined){ company.costing[el.dataset.cok][+el.dataset.i][el.dataset.f] = el.value; cstore.save(company); refreshInternal(); return; }
  if (el.dataset.k !== undefined) data[el.dataset.k] = el.value;
  else if (el.dataset.hr !== undefined){
    const row = data.hours[+el.dataset.hr];
    if (!row) return;
    const toggled = el.type === "checkbox";
    row[el.dataset.f] = toggled ? el.checked : el.value;
    persist(); noteEdit();
    /* only the switch changes what the row looks like; a time edit must not
       rebuild the step underneath the caret */
    if (toggled) renderSteps();
    renderPreview();
    return;
  }
  else if (el.dataset.arr !== undefined) data[el.dataset.arr][+el.dataset.i][el.dataset.f] = el.dataset.bool ? (el.value === "Yes") : el.value;
  else if (el.dataset.list !== undefined) data[el.dataset.list][+el.dataset.i] = el.value;
  else return;
  persist(); noteEdit(); renderPreview(); refreshDerived(); label();
});
root.addEventListener("change", function(e){
  const el = e.target;
  if (el.dataset.sec !== undefined){
    data.sections[el.dataset.sec] = el.checked;
    log((el.checked ? "Included " : "Removed ") + el.dataset.sec + " section");
    persist(); renderPreview();
    toast(el.checked ? "Section included" : "Section left out of the document");
    return;
  }
  if (el.dataset.status !== undefined){
    const from = statusLabel(data.status);
    data.status = el.value;
    log("Status changed from " + from + " to " + statusLabel(data.status));
    persist(); label(); renderPreview();
    toast("Status: " + statusLabel(data.status));
  }
});
root.addEventListener("click", function(e){
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.pick !== undefined){ pick(b.dataset.pick, b.dataset.into); return; }
  if (b.dataset.unlink !== undefined){ unlink(b.dataset.unlink); return; }
  if (b.id === "coAddDiff"){ company.differentiators.push({title:"", detail:""}); cstore.save(company); renderCompany(); return; }
  if (b.dataset.cddel !== undefined){ company.differentiators.splice(+b.dataset.cddel, 1); cstore.save(company); renderCompany(); return; }
  if (b.id === "coClearCover"){ company.cover = ""; company.coverFile = ""; cstore.save(company); renderCompany(); renderPreview(); toast("Back to the built-in cover"); return; }
  if (b.id === "coReset"){ company = blankCompany(); cstore.save(company); renderCompany(); renderPreview(); toast("Company profile reset"); return; }
  if (b.id === "coClose"){ $("#dlgCompany").close(); renderPreview(); return; }
  if (b.dataset.iklistadd !== undefined){ data.internal[b.dataset.iklistadd].push(""); persist(); refreshInternal(); return; }
  if (b.dataset.iklistdel !== undefined){ data.internal[b.dataset.iklistdel].splice(+b.dataset.i, 1); persist(); refreshInternal(); return; }
  if (b.dataset.ikadd !== undefined){
    data.internal[b.dataset.ikadd].push(JSON.parse(b.dataset.tmpl));
    persist(); refreshInternal(); return;
  }
  if (b.dataset.ikdel !== undefined){
    data.internal[b.dataset.ikdel].splice(+b.dataset.i, 1);
    persist(); refreshInternal(); return;
  }
  if (b.dataset.coadd !== undefined){
    company.costing[b.dataset.coadd].push(JSON.parse(b.dataset.tmpl));
    cstore.save(company); renderCompany(); refreshInternal(); return;
  }
  if (b.dataset.codel !== undefined){
    company.costing[b.dataset.codel].splice(+b.dataset.i, 1);
    cstore.save(company); renderCompany(); refreshInternal(); return;
  }
  if (b.id === "hrCopy"){
    const open = (data.hours||[]).filter(r => r.on)[0];
    if (!open){ toast("Every day is switched off"); return; }
    data.hours.forEach(function(r){ if (r.on){ r.from = open.from; r.to = open.to; } });
    log("Set every open day to " + open.from + "-" + open.to);
    persist(); renderSteps(); renderPreview(); toast("Copied to every open day"); return;
  }
  if (b.dataset.aimgdel !== undefined){
    data.appendix[+b.dataset.aimgdel].img = ""; data.appendix[+b.dataset.aimgdel].imgFile = "";
    log("Removed an appendix image"); persist(); renderSteps(); renderPreview(); return;
  }
  if (b.id === "btnNote"){
    const inp = document.getElementById("noteInput");
    const v = ((inp && inp.value) || "").trim();
    if (!v){ toast("Write the note first"); return; }
    log(v); persist(); renderSteps(); renderPreview(); toast("Note added");
    return;
  }
  if (b.dataset.step !== undefined){ step = +b.dataset.step; renderSteps(); }
  else if (b.dataset.add){ data[b.dataset.add].push(JSON.parse(b.dataset.tmpl)); persist(); renderSteps(); renderPreview(); }
  else if (b.dataset.del){ data[b.dataset.del].splice(+b.dataset.i, 1); persist(); renderSteps(); renderPreview(); }
  else if (b.dataset.addlist){ data[b.dataset.addlist].push(""); persist(); renderSteps(); renderPreview(); }
  else if (b.dataset.dellist){ data[b.dataset.dellist].splice(+b.dataset.i, 1); persist(); renderSteps(); renderPreview(); }


});
$("#btnCompany").addEventListener("click", function(){ renderCompany(); $("#dlgCompany").showModal(); });
root.addEventListener("change", function(e){
  if (e.target && e.target.dataset && e.target.dataset.aimg !== undefined){
    const i = +e.target.dataset.aimg;
    shrinkImage(e.target.files && e.target.files[0], 1000, 200, function(url, err){
      if (err){ toast(err); return; }
      io.uploadImage(url, "appendix-" + (i + 1) + ".jpg").then(function(f){
        data.appendix[i].img = f.url; data.appendix[i].imgFile = f.id;
        log("Added an image to appendix " + (data.appendix[i].ref || "row " + (i+1)));
        persist(); renderSteps(); renderPreview(); toast("Image attached");
      }, function(){ toast(io.t("uploadFailed")); });
    });
    return;
  }
  if (e.target && e.target.id === "co-cover"){
    const f = e.target.files && e.target.files[0];
    shrinkImage(f, 1600, 400, function(url, err){
      if (err){ toast(err); return; }
      io.uploadImage(url, "cover.jpg").then(function(up){
        company.cover = up.url; company.coverFile = up.id; cstore.save(company);
        renderCompany(); renderPreview(); toast("Cover updated");
      }, function(){ toast(io.t("uploadFailed")); });
    });
  }
});
$("#btnPrev").addEventListener("click", function(){ stepBy(-1); });
$("#btnNext").addEventListener("click", function(){ stepBy(1); });
$("#btnHideInt").addEventListener("click", function(){
  hideInternal = !hideInternal;
  try { localStorage.setItem("oncloud.hideInternal", hideInternal ? "1" : "0"); } catch(e){}
  applyHideInternal();
  renderSteps();
  toast(hideInternal ? "Internal costing hidden" : "Internal costing shown");
});
$("#btnPrint").addEventListener("click", function(){ printSheets(); });

const dlgIo = $("#dlgIo");
let ioMode = "export";
function openIo(mode){
  ioMode = mode;
  const titles = {export:"Export this proposal", exportcosts:"Export with costs", "import":"Import"};
  const hints = {
    "export":"This JSON is the whole proposal, history included. Download it, or keep it in a file beside the deal.",
    "import":"Choose a .json file exported from the Proposal Builder, or paste it below. It replaces what is in this proposal."
  };
  $("#ioTitle").textContent = titles[mode];
  $("#ioHint").textContent = hints[mode];
  const out = mode !== "import";
  $("#ioFile").style.display = out ? "none" : "block";
  $("#ioCopy").style.display = out ? "" : "none";
  $("#ioDownload").style.display = out ? "" : "none";
  $("#ioLoad").style.display = out ? "none" : "";
  $("#ioText").value = mode === "export" ? JSON.stringify(stripInternal(data), null, 2)
    : mode === "exportcosts" ? JSON.stringify(data, null, 2)
    : "";
  dlgIo.showModal();
}
$("#btnExport").addEventListener("click", function(){ openIo("export"); });
$("#btnExportCosts").addEventListener("click", function(){ openIo("exportcosts"); });

/* what a proposal must look like before it is allowed in */
/* the client copy: everything except the costing block */
function stripInternal(d){
  const out = {};
  Object.keys(d || {}).forEach(function(k){ if (k !== "internal") out[k] = d[k]; });
  return out;
}

function validateProposal(o, where){
  const bad = [];
  if (!o || typeof o !== "object" || Array.isArray(o)) return [where + ": not an object"];
  if (!String(o.ref||"").trim() && !String(o.client||"").trim()) bad.push(where + ": no client and no reference — this does not look like a proposal");
  ["subs","oneoff","milestones","scope"].forEach(function(k){
    if (o[k] !== undefined && !Array.isArray(o[k])) bad.push(where + ": " + k + " should be a list");
  });
  if (o.sections !== undefined && (typeof o.sections !== "object" || Array.isArray(o.sections))) bad.push(where + ": sections should be an object");
  /* internal costing is optional; a proposal is never rejected for not having it */
  if (o.internal !== undefined){
    if (typeof o.internal !== "object" || o.internal === null || Array.isArray(o.internal)) bad.push(where + ": internal should be an object");
    else ["mandays","infra","licences","aiPackages","aiProduct","aiDelivery","aiAssume","other","msMonths","actuals"].forEach(function(k){
      if (o.internal[k] !== undefined && !Array.isArray(o.internal[k])) bad.push(where + ": internal." + k + " should be a list");
    });
  }
  return bad;
}
$("#btnImport").addEventListener("click", function(){ openIo("import"); });
$("#ioClose").addEventListener("click", function(){ dlgIo.close(); });
$("#ioCopy").addEventListener("click", function(){
  const txt = $("#ioText").value;
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(function(){ toast("Copied"); }).catch(function(){ $("#ioText").select(); toast("Press Ctrl/Cmd+C to copy"); });
  } else { $("#ioText").select(); toast("Press Ctrl/Cmd+C to copy"); }
});
$("#ioDownload").addEventListener("click", function(){
  try{
    const blob = new Blob([$("#ioText").value], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (data.ref || "proposal") + (ioMode === "exportcosts" ? "-with-costs" : "") + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
    toast("If nothing downloaded, use Copy instead");
  } catch(e){ toast("Download blocked here — use Copy"); }
});
$("#ioFile").addEventListener("change", function(e){
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = function(){ $("#ioText").value = r.result; toast("File read — press Load this JSON"); };
  r.readAsText(f);
});
$("#ioLoad").addEventListener("click", function(){
  try{
    const obj = JSON.parse($("#ioText").value);
    if (!obj || typeof obj !== "object") throw new Error("The file does not contain a JSON object.");

    if (obj.kind === "oncloud.proposals.backup" || (obj.proposals && typeof obj.proposals === "object"))
      throw new Error("That is a backup of many proposals. Open one proposal's export instead; each proposal is its own record in OnCloud now.");

    const problems = validateProposal(obj, "This file");
    if (problems.length) throw new Error(problems.join("\n"));
    const keep = {id: data.id, created: data.created, clientId: data.clientId, quoteId: data.quoteId, quoteNumber: data.quoteNumber};
    data = Object.assign(migrate(obj), keep);
    if (!io.canSeeCosts) data.internal = blankInternal();
    log("Imported from JSON");
    persist(); step = 0; dlgIo.close(); setView("build"); toast("Loaded");
  } catch(err){ toast(String(err && err.message ? err.message : err).slice(0,220)); }
});

applyHideInternal();
setView("build");
/* web fonts change the metrics, so measure once more when they land */
if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ _mmPx = 0; if (view === "build") renderPreview(); });
/* and once more right before the print dialog, in case anything moved */
window.addEventListener("beforeprint", onBeforePrint);
window.addEventListener("afterprint", onAfterPrint);

/* ---------- links to the workspace (ADR 0053): what the builder asks the app for, and what it does with the answer ---------- */
function linksBar(){
  const tags = [];
  if (data.clientId) tags.push('<span class="pb-tag">' + esc(io.t("linkedClient")) + ' <button class="btn ghost" data-unlink="client">' + esc(io.t("unlink")) + '</button></span>');
  if (data.quoteId) tags.push('<span class="pb-tag">' + esc(io.t("linkedQuote")) + ' ' + esc(data.quoteNumber || "") + ' <button class="btn ghost" data-unlink="quote">' + esc(io.t("unlink")) + '</button></span>');
  const btns = (io.can.contacts ? '<button class="btn light" data-pick="client">' + esc(io.t("pickClient")) + '</button>' : '') +
    (io.can.quotes ? '<button class="btn light" data-pick="quote">' + esc(io.t("pickQuote")) + '</button>' : '');
  return btns || tags.length ? '<div class="pb-links">' + btns + tags.join("") + '</div>' : '';
}
function pickBar(into){
  return io.can.products ? '<div class="pb-links"><button class="btn light" data-pick="product" data-into="' + into + '">' + esc(io.t("pickProduct")) + '</button></div>' : '';
}
function unlink(what){
  if (what === "client"){ data.clientId = ""; log("Unlinked the client from Contacts"); }
  if (what === "quote"){ data.quoteId = ""; data.quoteNumber = ""; log("Unlinked the quote"); }
  persist(); renderSteps(); renderPreview();
}
async function pick(what, into){
  try {
    if (what === "client"){
      const c = await io.pickClient();
      if (!c) return;
      applyClient(data, c);
      log("Client linked: " + data.client);
    } else if (what === "product"){
      const p = await io.pickProduct(data.currency);
      if (!p) return;
      applyProduct(data, into, p);
      log("Added " + p.name + " from Products");
    } else if (what === "quote"){
      const q = await io.pickQuote();
      if (!q) return;
      applyQuote(data, q);
      log("Built from quote " + (q.number || q.title || ""));
    } else if (what === "fx"){
      const rows = await io.exchangeRates();
      const fx = fxFromRates(rows, company.costing.baseCcy || "OMR");
      if (!fx.rows.length){ toast(io.t("noRates")); return; }
      company.costing.fx = fx.rows; company.costing.fxAsOf = fx.asOf;
      cstore.save(company); renderCompany(); refreshInternal(); toast(io.t("ratesLoaded")); return;
    }
    persist(); renderSteps(); renderPreview(); refreshDerived(); toast(io.t("linked"));
  } catch(e){ io.fail(e); }
}

/* ---------- printing inside OnCloud ----------
   Print / PDF: the sheets alone in a hidden frame that carries the design system's styles, the workspace's brand and
   these — not OnCloud's print rules for its own screens (black ink, a 16mm margin), which would split every A4 sheet
   and darken the cover's text. The browser's own Print (Ctrl+P) gets a body-level copy of the sheets instead, with
   the app hidden around them. */
function printSheets(){
  try { renderPreview(); } catch(e){}
  const pv = $("#preview");
  if (!pv) return;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const styles = Array.from(document.head.querySelectorAll('link[rel="stylesheet"],style'))
    .filter(n => !/oc-shell-root/.test(n.textContent || ""))
    .map(n => n.outerHTML).join("");
  const doc = frame.contentDocument;
  doc.open();
  doc.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + esc((data.ref || "proposal") + " — " + (data.client || "")) + '</title>' +
    styles + '</head><body style="margin:0;background:#fff"><div class="pb pb-print">' + pv.innerHTML + '</div></body></html>');
  doc.close();
  const imgs = Array.from(doc.images).map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })).filter(Boolean);
  const fonts = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
  Promise.all([fonts].concat(imgs)).then(function(){
    const w = frame.contentWindow;
    const done = function(){ setTimeout(function(){ frame.remove(); }, 500); };
    w.addEventListener("afterprint", done);
    w.focus();
    w.print();
    setTimeout(done, 60000);
  });
}
let printHost = null;
function onBeforePrint(){
  try { renderPreview(); } catch(e){}
  const pv = $("#preview");
  if (!pv) return;
  if (printHost) printHost.remove();
  printHost = document.createElement("div");
  /* oc-shell-print: OnCloud's runtime hides itself while a print surface is on the page */
  printHost.className = "pb pb-print oc-shell-print";
  printHost.innerHTML = pv.innerHTML;
  document.body.appendChild(printHost);
  document.body.classList.add("pb-printing");
}
function onAfterPrint(){
  if (printHost){ printHost.remove(); printHost = null; }
  document.body.classList.remove("pb-printing");
  try { fitPreview(); } catch(e){}
}

return {
  get data(){ return data; },
  get company(){ return company; },
  /* the company profile changed elsewhere (its own screen): take it and redraw */
  setCompany(c){ io.company = c; company = cstore.load(); renderAll(); },
  showCompany(){ renderCompany(); $("#dlgCompany").showModal(); },
  destroy(){
    clearTimeout(editTimer);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("beforeprint", onBeforePrint);
    window.removeEventListener("afterprint", onAfterPrint);
    onAfterPrint();
  }
};
}
