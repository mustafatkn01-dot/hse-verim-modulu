// İSG Denetim Listesi sayfası
import * as Guest from "./guest.js?v=20261110k";
import * as Gorev from "./gorev.js?v=20261110k";
import * as S from "./store.js?v=20261110k";
import * as Ramak from "./ramak.js?v=20261110k";
import * as Z from "./zincir.js?v=20261110k";
import * as Paylas from "./paylas.js?v=20261110k";
import { esc, ic, toast, pickDate, fmtTarih, noteEditor, compressImage, showPhoto, showPhotos, openPhotos, setPhotoLoader, GUEST, guestLock, roText } from "./ui.js?v=20261110k";
import { CATS } from "./isgcats.js?v=20261110k";
import { dotCss, yukle as tatilYukle, takvim as tatilMap } from "./tatil.js?v=20261110k";
import { calcIsg, isgMonth, isgAudits, fxInTime, makTier, katsayi, bandOf, num, surecVar, MONTHS, DEFAULT_PARAMS } from "./scoring.js?v=20261110k";

const COLL = "isg";
const D = { pk: { open: false, view: 0, cnt: {} }, fxEditing: new Set(), fxDraft: {}, fxOpen: new Set(), fxList: [], gfxOpen: false, key: "", setup: null, doc: null, dept: null, month: null, open: {}, ro: false, timer: null, saved: true, msg: "" };
const W = { 3: ["Kritik ×3", "#FADAD7", "#8E1B16"], 2: ["Major ×2", "#FBE9C6", "#6B3F00"], 1: ["Minor ×1", "#DCEAF7", "#145F96"] };
const FT = [["#0B6E4F", "#FFF"], ["#F5B700", "#2B2000"], ["#F28C28", "#2B1500"], ["#B3261E", "#FFF"]];
const BAND = { Mükemmel: ["#17A06F", "#0B6E4F", "#D9F1E6"], İyi: ["#2A82C4", "#145F96", "#DCEAF7"], Orta: ["#F5B700", "#6B3F00", "#FBE9C6"], Kritik: ["#D6382E", "#B3261E", "#FADAD7"] };
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dm = s => `${s.slice(8, 10)}.${s.slice(5, 7)}`;
const dmy = s => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
const addDays = (s, n) => { const d = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); d.setDate(d.getDate() + n); return iso(d); };

const AYK = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const dmk = s => `${+s.slice(8)} ${AYK[+s.slice(5, 7) - 1]}`;
// Hafta: Pzt–Paz; denetimler tarihine göre haftaya bağlanır (ISO hafta numarası)
const monOf = s => { const g = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)).getDay(); return addDays(s, g === 0 ? -6 : 1 - g); };
const wkNo = s => { const m = monOf(s), t = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, +m.slice(8, 10) + 3), j4 = new Date(t.getFullYear(), 0, 4); return 1 + Math.round(((t - j4) / 864e5 - 3 + ((j4.getDay() + 6) % 7)) / 7); };

function defaultMonth(year) { const n = new Date(); return +year === n.getFullYear() ? n.getMonth() + 1 : 1; }
function defaultDate(year, month) { const n = new Date(); return (+year === n.getFullYear() && month === n.getMonth() + 1) ? iso(n) : `${year}-${pad(month)}-01`; }
const blank = (year, month, auditor) => ({ sessions: [], draft: { marks: {}, notes: {}, ydNotes: {}, date: defaultDate(year, month) }, freq: {}, bonus: 0, bonusMan: false, auditor: auditor || "" });

const emptyDraft = (date, on) => ({ marks: {}, notes: {}, ydNotes: {}, photos: {}, date, on, edit: null });
// Kayıtlı denetimi yeniden düzenlenebilir taslağa çevirir
function draftFromSession(last) {
  const marks = { ...(last.marks || {}) }, notes = {}, ydNotes = {};
  CATS.forEach((cat, ci) => {
    cat.items.forEach((_, ii) => {
      const id = `c${ci}i${ii}`;
      if (last.fails && last.fails[id]) { marks[id] = "x"; notes[id] = last.fails[id].length ? last.fails[id].slice() : [""]; }
      else if (!marks[id] && last.app && last.app[ci]) marks[id] = "u";
      else if (!marks[id] && last.yd && ci in last.yd) marks[id] = "n";
    });
    if (last.yd && last.yd[ci]) ydNotes[ci] = last.yd[ci];
  });
  return { marks, notes, ydNotes, photos: JSON.parse(JSON.stringify(last.photos || {})), date: last.date };
}
// Misafir taslağını (w) haftanın denetim taslağına (dr) birleştirir. Aynı maddede mevcut bulgu varsa choice[id] === "sep" değilse yalnızca fotoğraflar eklenir
function mergeGuest(dr, w, choice = {}) {
  const rank = { x: 3, u: 2, n: 1 }, tr = t => String(t || "").trim(), nk = t => tr(t).toLowerCase();
  dr.marks ||= {}; dr.notes ||= {}; dr.ydNotes ||= {}; dr.photos ||= {};
  Object.entries(w.marks || {}).forEach(([id, mk]) => {
    const cur = dr.marks[id];
    if (mk !== "x") { if (cur !== "x" && (!cur || rank[mk] > rank[cur])) dr.marks[id] = mk; return; }
    const had = cur === "x" && (dr.notes[id] || []).some(t => tr(t)), gn = w.notes?.[id] || [], gph = k => (w.photos?.[id + "|" + k] || []).map(p => ({ ...p }));
    dr.marks[id] = "x";
    if (had && choice[id] !== "sep") {
      const at = Math.max(0, dr.notes[id].findIndex(t => tr(t))), all = gn.flatMap((_, k) => gph(k));
      if (all.length) (dr.photos[id + "|" + at] ||= []).push(...all);
      return;
    }
    const arr = had ? dr.notes[id].slice() : []; if (!had) Object.keys(dr.photos).forEach(k => { if (k.startsWith(id + "|")) delete dr.photos[k]; });
    gn.forEach((t, k) => {
      const dup = had ? arr.findIndex(x => tr(x) && nk(x) === nk(t)) : -1, ph = gph(k);
      if (dup >= 0) { if (ph.length) (dr.photos[id + "|" + dup] ||= []).push(...ph); return; }
      if (!tr(t) && !ph.length) return;
      arr.push(tr(t)); if (ph.length) dr.photos[id + "|" + (arr.length - 1)] = ph;
    });
    dr.notes[id] = arr.length ? arr : [""];
  });
  Object.entries(w.ydNotes || {}).forEach(([ci, t]) => { if (tr(t) && !dr.ydNotes[ci]) dr.ydNotes[ci] = tr(t); });
}
// Denetim durumu: açık (devam eden) denetim varsa form onu düzenler; hepsi tamamlandıysa yeni denetim yalnızca kullanıcı isteyince başlar
function settle(doc, year, month) {
  const ss = doc.sessions, dr = doc.draft;
  ss.forEach((x, i) => { if (x.closed === undefined && i < ss.length - 1) x.closed = true; });
  if (dr.on === undefined) { const has = Object.keys(dr.marks || {}).length > 0; dr.on = has || !ss.length; if (has && ss.length) ss[ss.length - 1].closed = true; }
  if (dr.edit != null && !ss.some(x => x.no === dr.edit)) dr.edit = null;
  const last = ss[ss.length - 1];
  if (!dr.on && last && !last.closed) {
    doc.draft = { ...draftFromSession(last), on: true, edit: last.no };
  } else if (!dr.on && !last) { doc.draft = emptyDraft(defaultDate(year, month), true); }
}

// Dışarıdan (canlı bildirim) yeniden yükleme: kullanıcı yazarken ezmez
export function reload() { if (D.v?.isConnected && D.ctx && D.saved) { D.force = true; render(D.v, D.ctx); } }
export function focus(month, dept, by) { D.month = +month; D.dept = dept; D.key = ""; D.autoOpen = by || null; }

export async function render(v, ctx) {
  const { st } = ctx;
  D.pk.open = false; D.pk.cnt = {};
  let setup = await S.getSetup(st.fid, st.year);
  if (!setup?.rows?.length) { v.innerHTML = `<div class="cd"><h2>Önce bölümleri tanımlayın</h2><p class="sub">Denetim girişi için Kurulum ve Kayıtlar sayfasında en az bir bölüm kaydedilmeli.</p><div><a href="#kurulum"><button>Kurulum'a git</button></a></div></div>`; return; }
  // Misafir: paylaşımı varsa yalnızca paylaşılan ay/bölümler görünür (paylaşımı olmayan eski misafirler kısıtlanmaz)
  D.shScope = null; D.shMonths = null;
  if (GUEST.on) {
    const mine = await S.myAllShares().catch(() => []);
    if (mine.length) {
      const sc = new Map();
      for (const sh of mine.filter(x => x.fid === st.fid && String(x.year) === String(st.year))) for (const d of (sh.all ? setup.rows : sh.depts || [])) { const k = sh.month + "|" + d.id, w = monOf(iso(new Date(sh.at || 0))); if (!sc.has(k) || w < sc.get(k)) sc.set(k, w); }
      D.shScope = sc; D.shMonths = [...new Set([...sc.keys()].map(k => +k.split("|")[0]))].sort((a, b) => a - b);
      if (!D.shMonths.length) { v.innerHTML = '<div class="cd"><h2>Paylaşım yok</h2><p class="sub">Bu fabrika ve yıl için sizinle paylaşılmış bölüm yok.</p></div>'; return; }
      if (!D.month || !D.shMonths.includes(D.month)) D.month = D.shMonths[D.shMonths.length - 1];
      setup = { ...setup, rows: setup.rows.filter(r => sc.has(D.month + "|" + r.id)) };
    }
  }
  D.setup = setup;
  if (!D.month) D.month = defaultMonth(st.year);
  if (!setup.rows.find(r => r.id === D.dept)) D.dept = setup.rows[0].id;
  const key = [st.fid, st.year, D.month, D.dept].join("/");
  if (D.key !== key || D.force) {
    const doc = await S.getMonthDoc(st.fid, st.year, COLL, `${pad(D.month)}_${D.dept}`);
    // Yükleme sürerken kullanıcı aynı kayıtta yazmaya başladıysa eski veriyle ezme
    if (D.force && D.key === key && !D.saved) { D.force = false; return; }
    D.force = false;
    D.doc = doc ? { ...blank(st.year, D.month), ...doc, draft: { ...blank(st.year, D.month).draft, ...(doc.draft || {}) } } : blank(st.year, D.month, GUEST.on ? GUEST.name : ctx.st.profile?.name);
    D.hadClosed = !!(doc && doc.closedNos);
    D.gdoc = null; D.gdocs = []; D.gstatus = "draft"; D.gnote = "";
    const gid = `${pad(D.month)}_${D.dept}`;
    if (GUEST.on) {
      // Misafir: resmi denetime dokunmaz; kendi taslağı ayrı kayıtta tutulur
      D.gdoc = await S.getMonthDoc(st.fid, st.year, "isgg", `${gid}_${GUEST.uid}`).catch(() => null);
      D.gstatus = D.gdoc?.status || "draft"; D.gnote = D.gdoc?.note || "";
      // Sahibin kararı (onay / geri gönder) sayfa yenilemeden yansır: canlı dinleyici + 15 sn yedek kontrol + sekmeye dönünce kontrol
      D.unwatch?.(); clearInterval(D.gpoll);
      const react = g => {
        if (!g || D.gstatus !== "review" || (g.status !== "approved" && g.status !== "returned")) return;
        D.gstatus = g.status; D.gnote = g.note || "";
        toast(g.status === "approved" ? "Taslağınız onaylandı ve denetime eklendi." : "Taslağınız düzeltme için geri gönderildi.");
        D.key = ""; if (D.v?.isConnected && D.v.querySelector("#bolum")) render(D.v, D.ctx);
      };
      D.gcheck = async () => { if (D.gstatus === "review") react(await S.getMonthDoc(st.fid, st.year, "isgg", `${gid}_${GUEST.uid}`).catch(() => null)); };
      D.unwatch = S.watchMonthDoc(st.fid, st.year, "isgg", `${gid}_${GUEST.uid}`, react);
      D.gpoll = setInterval(D.gcheck, 15000);
      if (!D.vis) { D.vis = true; document.addEventListener("visibilitychange", () => { if (!document.hidden) D.gcheck?.(); }); }
      D.doc.draft = D.gdoc?.draft ? { ...emptyDraft(defaultDate(st.year, D.month), true), ...D.gdoc.draft, on: true, edit: null } : emptyDraft(defaultDate(st.year, D.month), true);
      // Aksiyon bildirimlerim (ayrı kayıt: onaylanmış taslak durumundan etkilenmez) + yetkilinin kararı canlı izlenir
      const fxd = await S.getMonthDoc(st.fid, st.year, "isgg", `${gid}_fix_${GUEST.uid}`).catch(() => null);
      D.fxList = Object.entries(fxd?.draft?.fixReqs || {}).map(([key, req]) => ({ guestUid: GUEST.uid, guestName: GUEST.name, key, req }));
      D.unwatchSh?.(); D.shRows = D.shRows || [];
      Paylas.watchGuest(st.fid, st.year, GUEST.uid, rows => { D.shRows = rows; if (D.v?.isConnected && D.v.querySelector("#bolum") && !document.querySelector(".mod")) draw(); }, D.setup.rows.map(r => ({ id: r.id, name: r.name }))).then(u => { D.unwatchSh = u; }).catch(() => {});
      D.unwatchFx?.(); D.fxSeen = null;
      D.unwatchFx = S.watchMonthDoc(st.fid, st.year, COLL, gid, d => fxWatch(d));
    } else {
      settle(D.doc, st.year, D.month);
      const all = (await S.listMonthDocs(st.fid, st.year, "isgg").catch(() => [])).filter(g => g.id.startsWith(gid + "_"));
      D.gdocs = all.filter(g => g.status === "saved" || g.status === "review");
      D.fxList = all.filter(g => g.draft?.fixReqs).flatMap(g => Object.entries(g.draft.fixReqs).map(([key, req]) => ({ guestUid: g.guestUid, guestName: g.guestName, key, req })));
    }
    D.key = key; D.open = {}; D.saved = true; D.touched = false; D.msg = "";
  }
  D.ro = String(st.year) !== String(st.active) || guestLock(st.year, D.month) || (GUEST.on && (D.gstatus === "review" || D.gstatus === "approved"));
  D.ctx = ctx; D.v = v;
  await rkLoad();
  draw(); loadWk();
}

// Ramak kala: bölümün bu ayki onaylı bildirimi → otomatik kademe (elle seçilmediyse bonus olarak uygulanır)
async function rkLoad() {
  const { st } = D.ctx;
  D.rk = await Ramak.load(st.fid, st.year, D.month).catch(() => []);
  D.rkN = Ramak.counts(D.rk)[D.dept] || 0; D.rkAuto = Ramak.tierIdx(D.rkN);
  D.doc.bonusMan = Ramak.isMan(D.doc);
  if (!D.doc.bonusMan) D.doc.bonus = D.rkAuto;
}

// "Bu hafta" şeridi: bugünün haftasında her bölümün denetim durumu (yalnızca gösterim; bölüme dokununca o bölüme geçilir)
export const reset = () => { WK.open = false; D.open = {}; D.fxOpen = new Set(); D.fxEditing = new Set(); D.gfxOpen = false; D.shrOpen = false; D.shrB = ""; D.shF = "ac"; D.shDd = ""; D.shMo = null; D.zOpen = ""; D.unwatchSh?.(); D.unwatchSh = null; };
const WK = { open: false, rows: null, mon: "", t: 0, days: {} };
async function loadWk(force = false) {
  const { st } = D.ctx || {}; if (!st || !D.setup) return;
  if (String(st.year) !== String(new Date().getFullYear())) { WK.rows = null; return paintWk(); }
  if (!force && Date.now() - WK.t < 15000 && WK.rows) return paintWk();
  const mon = monOf(iso(new Date())), sun = addDays(mon, 6), ms = [...new Set([mon.slice(0, 7), sun.slice(0, 7)])].filter(x => x.slice(0, 4) === String(st.year));
  const pm = addDays(mon.slice(0, 8) + "01", -1).slice(0, 7), ms2 = pm.slice(0, 4) === String(st.year) && !ms.includes(pm) ? [pm, ...ms] : ms;
  const days = {};
  const rows = await Promise.all(D.setup.rows.map(async r => {
    let k = "none", m = +iso(new Date()).slice(5, 7), stale = false, sm = 0;
    for (const ym of ms2) {
      const d = await S.getMonthDoc(st.fid, st.year, COLL, `${ym.slice(5)}_${r.id}`).catch(() => null);
      for (const x of d?.sessions || []) if (x.date && x.closed === false && monOf(x.date) < mon) { stale = true; sm = +ym.slice(5); } else if (x.date && monOf(x.date) === mon) { m = +ym.slice(5); const dd = (days[x.date] ||= { ok: 0, open: 0 }); if (x.closed === false) { k = "open"; dd.open++; } else { if (k !== "open") k = "ok"; dd.ok++; } }
    }
    return { id: r.id, name: r.name, k, m, g: 0, stale, sm };
  }));
  if (!GUEST.on) (await S.listMonthDocs(st.fid, st.year, "isgg").catch(() => [])).forEach(g => { if ((g.status === "saved" || g.status === "review") && g.draft?.date && monOf(g.draft.date) === mon) { const r = rows.find(x => x.id === g.dept); if (r) r.g++; } });
  WK.tm = tatilMap(await tatilYukle(st.fid, st.year).catch(() => null)); WK.rows = rows; WK.days = days; WK.mon = mon; WK.t = Date.now(); paintWk();
}
function paintWarn() {
  const el = D.v?.querySelector("#wkWarn"); if (!el) return;
  if (!WK.rows || GUEST.on) { el.innerHTML = ""; el.style.display = "none"; return; }
  const today = iso(new Date()), dow = new Date().getDay(), late = dow === 0 || dow >= 4, hol = WK.tm?.get(today) && !WK.tm.get(today).yarim;
  const A = WK.rows.filter(r => r.stale), B = hol ? [] : WK.rows.filter(r => !r.stale && r.k === "none");
  const nm = l => l.length <= 2 ? l.map(r => esc(r.name)).join(", ") : `${l.length} bölüm`;
  const L = [];
  if (A.length) L.push([A[0], `Geçen haftadan açık: ${nm(A)}. Lütfen tamamlayın.`]);
  if (B.length) L.push([B[0], `${late ? "Bu hafta denetimi geç kalan" : "Bu hafta denetlenmeyen"}: ${nm(B)}.`]);
  el.style.cssText = L.length ? "display:flex;flex-direction:column;gap:4px;margin-top:-10px" : "display:none";
  el.innerHTML = L.map(([r, t]) => `<button type="button" data-wn="${r.id}|${r.stale ? r.sm : r.m}" style="display:block;width:100%;height:auto;min-height:0;padding:0;margin:0;border:0;background:transparent;text-align:left;font:italic 600 13.5px Manrope,system-ui,sans-serif;color:#B26A00;line-height:1.45;cursor:pointer">${t}</button>`).join("");
  el.querySelectorAll("[data-wn]").forEach(b => b.onclick = () => { const [id, m] = b.dataset.wn.split("|"); if (id === D.dept && +m === D.month) return; D.dept = id; D.month = +m; D.key = ""; render(D.v, D.ctx); });
}
function paintWk() {
  paintWarn();
  const el = D.v?.querySelector("#wkStrip"); if (!el) return;
  if (!WK.rows) { el.style.display = "none"; el.innerHTML = ""; return; }
  const mon = WK.mon, sun = addDays(mon, 6), done = WK.rows.filter(r => r.k === "ok").length, rng = mon.slice(5, 7) === sun.slice(5, 7) ? `${+mon.slice(8)}–${dmk(sun)}` : `${dmk(mon)} – ${dmk(sun)}`;
  const DK = { ok: "ok", open: "late", none: "future" }, TX = { ok: "tamamlandı", open: "açık", none: "başlanmadı" };
  el.style.display = "";
  el.innerHTML = `<div class="cd" style="gap:6px;padding:14px 16px"><button type="button" data-wkt aria-expanded="${WK.open}" aria-label="${WK.open ? "Bu hafta kartını kapat" : "Bu hafta kartını aç"}" style="display:flex;align-items:center;gap:12px;width:100%;min-height:40px;height:auto;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;font-weight:400"><span style="flex:1;min-width:0"><b style="font:600 16px Sora,sans-serif;display:block">Bu hafta · ${rng}</b><span class="muted" style="font-size:13px;display:block;margin-top:3px">${wkNo(mon)}. hafta · ${done}/${WK.rows.length} bölüm tamamlandı</span></span><span style="flex:0 0 40px;width:40px;height:40px;border-radius:12px;border:1.5px solid var(--gd);color:var(--gd);box-sizing:border-box;display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${WK.open ? 180 : 0}deg)"><path d="M6 9l6 6 6-6"/></svg></span></button>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding-top:10px;border-top:1px solid var(--line)">${["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((n, i) => { const dt = addDays(mon, i), r = WK.days[dt] || {}, td = dt === iso(new Date()), n2 = r.ok || r.open || "", hd = !n2 && WK.tm?.get(dt) && !WK.tm.get(dt).yarim ? WK.tm.get(dt).ad : "", bg = r.ok ? "#17A06F" : r.open ? "#E8A512" : "#fff", sh = n2 ? "none" : `inset 0 0 0 1.5px ${td ? "#1E3A5F" : "#C9D8D3"}`; return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11.5px;color:${td ? "var(--text)" : "var(--muted)"};font-weight:${td ? 700 : 400}"><span>${n}</span>${hd ? `<button type="button" data-hd="${dt}" aria-label="${esc(hd)}" style="${dotCss("off", 26)};padding:0;min-height:0;cursor:pointer;${WK.hs === dt ? "outline:2px solid #1E3A5F;outline-offset:2px" : ""}"></button>` : `<span title="${n2 ? n2 + " denetim" : "denetim yok"}" style="width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;color:#fff;background:${bg};box-shadow:${sh}">${n2}</span>`}</div>`; }).join("")}</div>
    ${WK.hs && WK.tm?.get(WK.hs) ? `<div class="muted" style="font-size:13px;text-align:center;margin-top:2px"><b>${fmtTarih(WK.hs)}</b> · ${esc(WK.tm.get(WK.hs).ad)}</div>` : ""}
    ${WK.open ? `<div style="margin-top:6px">${WK.rows.map(r => `<button type="button" data-wkd="${r.id}|${r.m}" style="display:flex;align-items:center;gap:10px;width:100%;min-height:44px;height:auto;padding:8px 0;border:0;border-top:1px solid var(--line);border-radius:0;background:transparent;color:inherit;text-align:left;cursor:pointer;font-weight:${r.id === D.dept ? 700 : 400}"><span style="${dotCss(DK[r.k], 14)}"></span><span style="flex:1;min-width:0">${esc(r.name)}</span><span class="muted" style="font-size:12.5px;font-weight:400;text-align:right">${TX[r.k]}${r.g ? ` · ${r.g} misafir taslağı` : ""}</span></button>`).join("")}</div>` : ""}</div>`;
  el.querySelectorAll("[data-hd]").forEach(b => b.onclick = () => { WK.hs = WK.hs === b.dataset.hd ? "" : b.dataset.hd; paintWk(); });
  el.querySelector("[data-wkt]").onclick = () => { WK.open = !WK.open; paintWk(); };
  el.querySelectorAll("[data-wkd]").forEach(b => b.onclick = () => { const [id, m] = b.dataset.wkd.split("|"); if (id === D.dept && +m === D.month) return; D.dept = id; D.month = +m; D.key = ""; render(D.v, D.ctx); });
}

function persist(now = false) {
  if (D.ro) return;
  D.saved = false; D.touched = true; setSv();
  // Başka bölüm/aya ait bekleyen kayıt varsa önce onu yaz (zamanlayıcı iptal edilip veri kaybolmasın)
  if (D.timer && D.pend && D.pendKey !== D.key) { clearTimeout(D.timer); const o = D.pend; D.pend = null; o(); } else clearTimeout(D.timer);
  const key = D.key, docRef = D.doc, hadClosed = D.hadClosed;
  const run = async () => {
    const { st } = D.ctx, [f, y, m, d] = key.split("/"), mine = () => D.doc === docRef;
    if (GUEST.on) {
      try {
        const g = { guestUid: GUEST.uid, guestName: GUEST.name, dept: d, month: +m, status: D.gstatus, draft: docRef.draft, at: Date.now() };
        if (D.gnote) g.note = D.gnote;
        await S.saveMonthDoc(f, y, "isgg", `${pad(+m)}_${d}_${GUEST.uid}`, g); if (mine()) D.saved = true; return true;
      } catch (e) { D.msg = "Kaydedilemedi: " + e.message; return false; } finally { setSv(); }
    }
    const p = D.setup.params || DEFAULT_PARAMS, row = D.setup.rows.find(r => r.id === d);
    const result = docRef.sessions.length ? Ramak.isgResult(docRef, row, +m, p, y) : null;
    let ok = false; const slow = now ? setTimeout(() => toast("Bağlantı yavaş; kayıt gönderiliyor. Sayfayı kapatmayın."), 6000) : 0;
    try { const payload = { ...docRef, result, dept: d, month: +m }, cn = docRef.sessions.filter(x => x.closed).map(x => x.no);
      if (!GUEST.on || hadClosed) payload.closedNos = cn; else delete payload.closedNos;
      await S.saveMonthDoc(f, y, COLL, `${pad(+m)}_${d}`, payload); if (mine()) { D.saved = true; D.msg = ""; } ok = true; } catch (e) { D.msg = "Kaydedilemedi: " + e.message; }
    clearTimeout(slow); setSv(); if (now) loadWk(true); return ok;
  };
  if (now) { D.pend = null; return run(); }
  D.pend = run; D.pendKey = key; D.timer = setTimeout(() => { D.pend = null; run(); }, 700);
}
// Sekme arka plana giderken / sayfa kapanırken bekleyen kaydı hemen yaz
const flushPending = () => { if (D.pend) { clearTimeout(D.timer); const r = D.pend; D.pend = null; return r(); } };
if (typeof document !== "undefined") { document.addEventListener("visibilitychange", () => { if (document.hidden) flushPending(); }); window.addEventListener("pagehide", () => flushPending()); }
const svTxt = () => D.msg || (!D.touched ? "" : D.saved ? "Taslak kayıtlı" : "Kaydediliyor…");
const setSv = () => { const e = document.getElementById("sv"); if (e) e.textContent = svTxt(); };

// Taslak → denetim kaydı (fails/app/yd/marks/photos)
function makeRec(c, d) {
  const fails = {}, app = {}, yd = {};
  CATS.forEach((cat, ci) => {
    const info = c.catInfo[ci]; app[ci] = info.items.some(it => it.mk === "u" || it.mk === "x");
    info.items.forEach(it => { if (it.isX) fails[it.id] = (d.notes[it.id] || []).map(t => t.trim()).filter(Boolean); });
    if (info.allYD) yd[ci] = (d.ydNotes?.[ci] || "").trim();
  });
  const photos = {};
  CATS.forEach((cat, ci) => c.catInfo[ci].items.forEach(it => {
    if (!it.isX) return; let fi = 0;
    (d.notes[it.id] || []).forEach((t, k) => { if (!t.trim()) return; const ps = d.photos?.[it.id + "|" + k]; if (ps?.length) photos[it.id + "|" + fi] = ps.map(p => ({ ...p })); fi++; });
  }));
  return { date: d.date, fails, app, yd, marks: { ...d.marks }, photos };
}
const seg = (on, bg, c) => on ? `background:${bg};color:${c};border-color:${bg}` : "background:var(--card);color:var(--calct);border-color:var(--inl)";
const TONE = { u: ["#0B6E4F", "#FFF"], x: ["#B3261E", "#FFF"], n: ["#4A5C57", "#FFF"] };

// Sahip: bu bölüm-ayın misafir taslakları (kaydedilmiş / onay bekleyen)
function gPanel(list) {
  if (GUEST.on || !list?.length) return "";
  const card = g => {
    const dr = g.draft || {}, fx = [];
    CATS.forEach((cat, ci) => cat.items.forEach((txt, ii) => {
      const id = `c${ci}i${ii}`; if (dr.marks?.[id] !== "x") return;
      const ns = (dr.notes?.[id] || []).map((t, k) => ({ t, ph: dr.photos?.[id + "|" + k] || [] })).filter(x => x.t.trim() || x.ph.length);
      fx.push(`<div style="padding:8px 0;border-top:1px dashed var(--line)"><b style="font-size:13px">${esc(cat.name)}</b> <span class="muted" style="font-size:12.5px">· ${esc(txt)}</span>${ns.map(x => `<div style="font-size:13px;margin-top:3px">• ${esc(x.t) || "(açıklama yok)"}</div>${x.ph.length ? `<div class="phs">${x.ph.map(p => `<span class="pth"><img src="${p.t}" alt="Fotoğraf"></span>`).join("")}</div>` : ""}`).join("")}</div>`);
    }));
    const marked = Object.keys(dr.marks || {}).length;
    return `<div class="sess cur" style="flex-direction:column;align-items:stretch;gap:8px"><div class="row sp"><div><b>${esc(g.guestName)}</b> <span class="tag" style="${g.status === "review" ? "background:#FBE9C6;color:#6B3F00" : ""}">${g.status === "review" ? "Tamamlanması istendi" : "Kaydedildi"}</span>
      <div class="muted" style="font-size:12.5px">${dr.date ? dmy(dr.date) : "—"} · ${marked} madde işaretli · ${fx.length} uygunsuz</div></div>
      <div class="row" style="gap:6px"><button class="sm" data-gdet="${g.id}">Detaylı kontrol</button><button class="sm sec" data-gdel="${g.id}" style="color:#B3261E;border-color:#B3261E">Sil</button></div></div>
      ${fx.join("") || '<div class="muted" style="font-size:12.5px">Uygunsuz madde yok.</div>'}</div>`;
  };
  return `<div class="cd" style="padding:18px 20px;gap:12px"><div><b style="font:600 16px Sora,sans-serif">Misafir denetim taslakları (${list.length})</b>
    <div class="muted" style="font-size:12.5px;line-height:1.5">Onaylarsanız taslak, tarihinin düştüğü haftanın denetimine eklenir (o hafta kayıt yoksa yeni denetim olarak açılır); skora ve raporlara dahil olur. Onaylanana kadar hiçbir hesaba katılmaz.</div></div>${list.map(card).join("")}</div>`;
}

// Göreve ekle / "Göreve bağlı" etiketi: yalnızca yetkili kullanıcı, dolu açıklama ve düzenlenebilir ayda
function gchip(cat, ii, id, notes, k, curNo, row, st) {
  const t = String(notes[k] || "").trim();
  if (!t || D.ro || GUEST.on) return "";
  const dup = notes.slice(0, k).filter(x => String(x || "").trim() === t).length;
  const key = Gorev.noteKey("d", st.fid, st.year, D.month, D.dept, `${id}_${curNo}`, t, dup);
  return Gorev.chip(key, { tip: "denetim", fab: st.factories?.find(f => f.id === st.fid)?.name || "", yil: +st.year, ay: D.month, bolum: row?.name || "", kategori: cat.name, madde: cat.items[ii], metin: t, agirlik: cat.w, url: location.origin + location.pathname + "#denetim" }, true);
}

// ---------------- Aksiyon alındı ----------------
// Misafir, açık bir bulgu için aksiyon bildirir (ayrı kayıt: isgg/{ay}_{bölüm}_fix_{uid}); yetkili kabul ederse
// session.fixed["madde|sıra"] = {t, tx, ph, st:"ok"} yazılır: bulgu cezada Uygun gibi sayılır, ilk tespit ve sıklık takibi sürer.
const catOf = id => { const m = /^c(\d+)i(\d+)$/.exec(id); return { cat: CATS[+m[1]], txt: CATS[+m[1]].items[+m[2]] }; };
const fxWhen = at => { const d = new Date(at); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fxStateOf = (s, id, j, t) => { const f = s.fixed?.[id + "|" + j]; return f && f.t === t ? f : null; };
const fxImgs = list => list?.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${list.map(p => `<span class="pth"><img src="${p.t}" data-pv="${p.id}" alt="Fotoğraf"></span>`).join("")}</div>` : "";
// Karar bekleyen aksiyon istekleri (istek, varsa kararı geçtiyse bekliyor sayılır)
function fxPending() {
  const out = [];
  (D.fxList || []).forEach(x => {
    const [no, id, j] = x.key.split("|"), s = D.doc.sessions.find(y => y.no === +no);
    if (!s || (s.fails?.[id] || [])[+j] !== x.req.t) return;
    const f = s.fixed?.[id + "|" + j];
    if (f && (f.rat || 0) >= x.req.at) return;
    out.push({ ...x, no: +no, id, j: +j, s });
  });
  return out.sort((a, b) => a.req.at - b.req.at);
}
const pvOpen = el => { setPhotoLoader(id => D.ctx.st && S.getPhoto(D.ctx.st.fid, D.ctx.st.year, id)); openPhotos(el, id => D.ctx.st && S.getPhoto(D.ctx.st.fid, D.ctx.st.year, id)); };
// Yetkili: sahada düzeltme yapıldığında aksiyonu kendisi girer (onay beklemeden kabul edilmiş sayılır)
function fxForm(key, edit = false) {
  const dr = D.fxDraft[key] ||= { tx: "", ph: [] };
  return `<div class="phs" style="padding:0">${dr.ph.map(p => `<span class="pth"><img src="${p.t}" data-pv="${p.id}" alt="Fotoğraf"><button class="px" data-fxprm="${key}" data-pid="${p.id}" aria-label="Fotoğrafı sil">×</button></span>`).join("")}
    <label class="pbtn">${ic('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 20)}<i>Fotoğraf çek</i><input type="file" accept="image/*" capture="environment" data-fxph="${key}" hidden></label>
    <label class="pbtn">${ic('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 9"/>', 20)}<i>Resim ekle</i><input type="file" accept="image/*" multiple data-fxph="${key}" hidden></label></div>
    <button type="button" class="nb" data-fxnb="${key}" aria-label="Aksiyon açıklamasını yaz veya düzenle"><span class="nt" style="color:${dr.tx.trim() ? "var(--text)" : "#6B7F79"}">${esc(dr.tx.trim() ? dr.tx : "Dokunun ve yazın: ne yapıldı?")}</span>${ic('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>', 18)}</button>
    <button data-fxsave="${key}" style="height:44px;background:#0B6E4F;border-color:#0B6E4F;color:#fff;font-weight:700">${edit ? "Değişiklikleri kaydet" : "Aksiyon alındı olarak kaydet"}</button>
    ${edit ? `<button class="sec" data-fxcancel="${key}" style="height:40px">Vazgeç</button><span class="muted" style="font-size:12px">Düzenleme, aksiyonun giriş tarihini değiştirmez; ceza durumu aynı kalır.</span>` : `<span class="muted" style="font-size:12px">Denetimin haftası kapanmadan (en geç cumartesi) girilirse ceza kalkar; sonrasında yalnızca açıklamada görünür.</span>`}`;
}
// Görev takip anahtarı (gchip ile aynı kural) ve aksiyon eşitleme
function gkOf(s, id, j, t) {
  const { st } = D.ctx, dup = (s.fails?.[id] || []).slice(0, j).filter(x => String(x || "").trim() === t).length;
  return Gorev.noteKey("d", st.fid, st.year, D.month, D.dept, `${id}_${s.no}`, t, dup);
}
const gsigOf = () => JSON.stringify((D.doc?.sessions || []).map(s => Object.entries(s.fails || {}).map(([id, arr]) => (arr || []).map((t, j) => Gorev.durumOf(gkOf(s, id, j, String(t || "").trim()))?.durum === "kapali" && !s.fixed?.[id + "|" + j] ? 1 : 0))));
// Görev takipte kapatılan (tamamlandı) görevin bulgusu: aksiyon alındı otomatik kaydedilir (giriş zamanı = görevin kapanış zamanı;
// denetim haftası içindeyse ceza kalkar, sonrasındaysa yalnızca açıklamada görünür). Görev yeniden açılırsa otomatik kayıt geri alınır.
async function fxGorevAuto() {
  if (GUEST.on || D.ro || D.saved === false || D.autoBusy || !D.doc || !Gorev.linked()) return;
  const chg = []; let offReset = false;
  D.doc.sessions.forEach(s => Object.entries(s.fails || {}).forEach(([id, arr]) => (arr || []).forEach((t0, j) => {
    const t = String(t0 || "").trim(); if (!t) return;
    const fk = id + "|" + j, f = s.fixed?.[fk], dn = Gorev.durumOf(gkOf(s, id, j, t));
    if (dn?.durum === "acik" && s.fixedOff?.[fk]) { delete s.fixedOff[fk]; offReset = true; } // görev yeniden açıldı: elle kaldırma kaydı sıfırlanır
    if (dn?.durum === "kapali" && (!f || (f.st === "rej" && f.auto)) && s.fixedOff?.[fk] === (+dn.kapanis || +dn.at || 1)) { /* elle kaldırıldı: aynı kapanış için atla */ }
    else if (dn?.durum === "kapali" && (!f || (f.st === "rej" && f.auto))) {
      const at = +dn.kapanis || +dn.at || Date.now();
      chg.push({ s, fk, old: f, nw: { t, tx: `${fxWhen(at).slice(0, 10)} • Belirtilen uygunsuzluk için aksiyon alınmıştır.`, ph: [], at, rat: at, ap: at, st: "ok", gn: "Görev takip", auto: 1 } });
    } else if (dn?.durum === "acik" && f?.auto && !f.ed) chg.push({ s, fk, old: f, nw: null });
  })));
  if (!chg.length) { if (offReset) persist(true).catch(() => { }); return; }
  D.autoBusy = true;
  try {
    chg.forEach(c => { (c.s.fixed ||= {}); if (c.nw) c.s.fixed[c.fk] = c.nw; else delete c.s.fixed[c.fk]; });
    if ((await persist(true)) === false) { chg.forEach(c => { if (c.old) c.s.fixed[c.fk] = c.old; else delete c.s.fixed[c.fk]; }); return; }
    toast(`Görev takip ile eşitlendi: ${chg.filter(c => c.nw).length} aksiyon alındı, ${chg.filter(c => !c.nw).length} geri alındı.`);
    if (D.v?.isConnected) draw();
  } finally { D.autoBusy = false; }
}
function fxGorevSync() {
  if (GUEST.on || !D.doc || !Gorev.linked()) return;
  D.doc.sessions.forEach(s => Object.entries(s.fails || {}).forEach(([id, arr]) => (arr || []).forEach((t0, j) => {
    const t = String(t0 || "").trim(); if (!t) return;
    const f = s.fixed?.[id + "|" + j], ok = f && f.st === "ok" && f.t === t && (f.tx || "").trim(), key = gkOf(s, id, j, t);
    if (ok && f.auto && !f.ed) return;
    if (ok) Gorev.aksiyonYaz(key, f.tx.trim(), f.at); else Gorev.aksiyonSil(key);
  })));
}

// Denetim formunda açıklamanın altındaki açılır aksiyon kartı (yetkili görünümü)
function fxCard(s, id, j, t) {
  const f = fxStateOf(s, id, j, t), pd = (D.fxPend || []).find(x => x.no === s.no && x.id === id && x.j === j);
  const key = `${s.no}|${id}|${j}`, editing = D.fxEditing.has(key) && f?.st === "ok" && !D.ro && !GUEST.on, canAdd = !D.ro && !GUEST.on && !pd && (!f || f.st === "rej"), saved = (s.fails?.[id] || [])[j] === t;
  if (!f && !pd && !canAdd) return "";
  if (canAdd && !saved) return `<div class="muted" style="font-size:12.5px;padding:2px 2px 0">Aksiyon eklemek için önce denetimi kaydedin.</div>`;
  const cur = pd ? pd.req : f || {};
  const [cls, ttl, bdg, bg, fg] = pd ? ["amb", "Aksiyon bildirildi", "Onay bekliyor", "#FBE9C6", "#5A3300"] : !f ? ["neu", "Aksiyon alındı", "Ekle", "#E4ECE9", "#2A3F3A"] : f.st === "ok" ? ["grn", "Aksiyon alındı", "Onaylandı", "#0B6E4F", "#fff"] : ["red", "Aksiyon reddedildi", "Reddedildi", "#B3261E", "#fff"];
  return `<details class="ak ${cls}" data-fk="${key}" ${D.fxOpen.has(key) ? "open" : ""}><summary><span class="akt"><b>${ttl}</b><span class="pill" style="background:${bg};color:${fg}">${bdg}</span></span>${ic('<path d="M6 9l6 6 6-6"/>', 18)}</summary>
    <div class="akb"><span class="muted" style="font-size:12.5px">${f || pd ? `${esc(pd ? pd.guestName : (f.gn || ""))}${cur.at || cur.ap ? " · " + fxWhen(pd ? cur.at : (f.ap || f.at)) : ""}` : "Sahada düzeltme yapıldıysa anında kapatın; onay beklemez."}</span>
      ${editing ? "" : cur.tx ? `<span>${esc(cur.tx)}</span>${fxImgs(cur.ph)}` : ""}
      ${!pd && f?.st === "rej" ? `<div style="padding:8px 10px;border-radius:10px;background:#FDF1F0;border:1px solid #F3C7C3;color:#7A1C14;font-size:13px"><b>Ret gerekçesi:</b> ${esc(f.rej || "")}</div>` : ""}
      ${pd && !D.ro ? `<button data-fxrev="${key}|${pd.guestUid}" style="height:42px">İncele ve karar ver</button><span class="muted" style="font-size:12px">Onay bekleyen aksiyon puana henüz yansımaz.</span>` : ""}
      ${canAdd && Gorev.durumOf(gkOf(s, id, j, t))?.durum === "kapali" ? `<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:10px;background:#EAF7F1;border:1px solid #A9DCC4;font-size:12.5px"><span>Görev takipte kapatıldı${Gorev.durumOf(gkOf(s, id, j, t)).kapanis ? " · " + fxWhen(Gorev.durumOf(gkOf(s, id, j, t)).kapanis) : ""}</span><button class="sec" data-fxfromg="${key}" style="height:34px;min-height:0;padding:0 10px;font-size:13px;white-space:nowrap">Aksiyon olarak ekle</button></div>` : ""}
      ${canAdd ? fxForm(key) : editing ? fxForm(key, true) : ""}
      ${!pd && f?.st === "ok" && !editing && !D.ro && !GUEST.on ? `<div style="display:flex;gap:8px;flex-wrap:nowrap"><button class="sec" data-fxedit="${key}" style="flex:1 1 0;min-width:0;height:34px;min-height:0;padding:0 8px;font-size:13px;display:flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap">${ic('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>', 15)}Düzenle</button><button class="sec" data-fxdel="${key}" style="flex:1 1 0;min-width:0;height:34px;min-height:0;padding:0 8px;font-size:13px;color:#B3261E;border-color:#B3261E;white-space:nowrap">Aksiyonu kaldır</button></div>` : ""}
      ${!pd && f?.st === "ok" ? (fxInTime(f, s.date) ? `<span style="font-size:12px;color:#0B6E4F">Bu bulgu cezada Uygun gibi sayılır; sıklık takibi sürer.</span>` : `<span style="font-size:12px;color:#7A5200">Hafta kapandıktan sonra girildi: yalnızca açıklamada görünür, ceza puanı değişmez.</span>`) : ""}</div></details>`;
}
// ---------------- Bulgu zinciri (önceki haftalarla eşleşme) ----------------
// Bölümün son 12 aylık denetim geçmişi yüklenir (yıl sınırı dahil); bu ayın kaydı bellekteki güncel hâliyle kullanılır
function zEnsure() {
  const { st } = D.ctx, key = [st.fid, st.year, D.month, D.dept].join("/");
  if (GUEST.on || D.zh?.key === key || D.zBusy === key) return;
  D.zBusy = key;
  Z.loadHistory(S.getMonthDoc, st.fid, st.year, D.month, D.dept, 12)
    .then(docs => { if (D.zBusy !== key) return; D.zh = { key, docs }; })
    .catch(() => { if (D.zBusy === key) D.zh = { key, docs: [], fail: true }; })
    .finally(() => { if (D.zBusy === key) D.zBusy = ""; if (D.v?.isConnected && D.key === key && !document.querySelector(".mod")) draw(); });
}
function zChains(skipNo = null) {
  if (!D.zh || D.zh.key !== D.key) return null;
  const { st } = D.ctx, docs = D.zh.docs.filter(x => !(+x.year === +st.year && +x.month === +D.month));
  docs.push({ year: +st.year, month: +D.month, doc: { sessions: (D.doc.sessions || []).filter(s => s.no !== skipNo) } });
  docs.sort((a, b) => a.year - b.year || a.month - b.month);
  return Z.chainsOf(Z.linksOf(docs));
}
const ZLV = { guclu: ["Güçlü", "g"], orta: ["Orta", "o"], zayif: ["Zayıf", "z"], farkli: ["Farklı", "f"] };
const zDates = c => [...new Set(c.links.filter(l => !l.ok).map(l => dm(l.date)))].slice(-4).join(" · ");
// Bir maddedeki bulgular için öneriler ve seçimler (sel: "madde|sıra" → "zk1+zk2" (birleşen önceki kayıtlar) | "yeni" | "farkli" | "tekrar:zk")
// pre: düzenlenen kayıttaki mevcut zincir bağlantıları ("madde|sıra" → zk), date: denetim tarihi
const zIsC = v => !!v && !/^(yeni|farkli|tekrar:)/.test(v), zParts = v => zIsC(v) ? v.split("+").filter(Boolean) : [];
function zItem(ch, id, notes, sel = {}, date = "", pre = {}) {
  const out = [], used = [];
  notes.forEach((t0, k) => {
    const t = String(t0 || "").trim(); if (!t) { out.push(undefined); return; } if (!ch) { out.push(null); return; }
    const others = notes.flatMap((_, kk) => kk !== k ? zParts(sel[id + "|" + kk]) : []);
    const sg = Z.suggest(ch, { id, text: t, date, exclude: [] });
    if (!sg.open.length && !sg.tekrar.length) { out.push(null); return; }
    const blocked = new Set([...used, ...others]), ok = v => sg.open.some(o => o.chain.zk === v) && !blocked.has(v);
    const avail = sg.open.filter(o => !blocked.has(o.chain.zk)), strong = avail.filter(o => o.sim.level === "guclu");
    // Varsayılan: tüm güçlü adaylar seçili (aynı bulgunun bağlanmamış eski kayıtları birleşir); yalnız orta varsa seçim boş; aksi hâlde yeni bulgu
    let def = "";
    if (sg.open.length) def = strong.length ? strong.map(o => o.chain.zk).join("+") : avail[0]?.sim.level === "orta" ? "" : "yeni";
    else def = "tekrar:" + sg.tekrar[0].chain.zk;
    const key = id + "|" + k, p = pre[key] && sg.open.some(o => o.chain.zk === pre[key]) ? pre[key] : null;
    let eff = sel[key] ?? p ?? def;
    if (zIsC(eff)) { const keep = zParts(eff).filter(ok); eff = keep.length ? keep.join("+") : zParts(def).filter(ok).join("+") || (zIsC(def) ? "" : def); }
    used.push(...zParts(eff));
    out.push({ key, sg, eff, blocked });
  });
  return out;
}
// Kart seçeneğine dokunma: önceki kayıtlar çoklu seçilir (aç/kapa); "Yeni bulgu" / tekrar seçenekleri tek seçimdir ve kartı kapatır
function zToggle(el, attr) {
  const [id, k, ...r] = el.dataset[attr].split("|"), v = r.join("|"), key = id + "|" + k;
  if (!zIsC(v)) return { key, val: v, close: true };
  const cur = [...el.closest(".zls").querySelectorAll(".zop.on")].map(b => b.dataset[attr].split("|").slice(2).join("|")).filter(zIsC);
  return { key, val: (cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]).join("+"), close: false };
}
// Seçilen önceki kayıtlar: en eski zincir ana zincir olur, diğerleri ona bağlanır
const zResolve = z => { const chs = zParts(z.eff).map(v => z.sg.open.find(o => o.chain.zk === v)?.chain).filter(Boolean).sort((a, b) => (a.first.date || "").localeCompare(b.first.date || "")); return chs.length ? { primary: chs[0].zk, merge: chs.slice(1) } : null; };
// Kart: varsayılan kapalı; başlık seçimi tek satırda özetler. pf: data öneki ("z" yetkili denetimi, "gz" misafir onayı)
function zCard(z, open, pf = "z") {
  const { sg, eff, key, blocked } = z, cv = `<span class="cv">${ic('<path d="M6 9l6 6 6-6"/>', 18)}</span>`, sel = zParts(eff);
  const chosen = sel.map(v => sg.open.find(o => o.chain.zk === v)).filter(Boolean);
  const tk = eff.startsWith("tekrar:") ? sg.tekrar.find(o => "tekrar:" + o.chain.zk === eff) || sg.tekrar[0] : null;
  const [cls, ttl, sub, pl] = chosen.length ? ["", chosen.length > 1 ? `Devamı · ${chosen.length} önceki kayıt birleşiyor` : `Devamı · ${chosen[0].chain.nOpen} haftadır açık`, chosen[0].chain.last.t, ZLV[chosen[0].sim.level]]
    : eff === "" ? [" zo", "Seçim gerekli", `${sg.open.length} önceki açık bulgu · dokunup seçin`, ["Karar bekliyor", "o"]]
    : tk ? [" zr", "Tekrarlayan bulgu", `${dm(tk.closed)} kapatılmıştı · yeni açılır`, ["Tekrar", "f"]]
    : eff === "farkli" ? ["", "Farklı sorun", "Kapanmış bulguyla ilgisi yok", ["Yeni", "z"]]
    : ["", "Yeni bulgu", sg.open.length ? "Önceki açık bulgulara bağlanmadı" : "Önceki bulgularla ilgisi yok", ["Yeni", "z"]];
  const op = (v, a, m, p, dis = false) => `<button type="button" class="zop${(zIsC(v) ? sel.includes(v) : eff === v) ? " on" : ""}" data-${pf}s="${key}|${v}" ${dis ? "disabled" : ""}><span class="rd"></span><span class="ot"><span class="a">${esc(a)}</span><span class="m">${esc(m)}</span></span>${p ? `<span class="zpl p-${p[1]}">${p[0]}</span>` : ""}</button>`;
  const list = sg.open.length
    ? sg.open.map(o => blocked.has(o.chain.zk) ? op(o.chain.zk, o.chain.last.t, "Bu denetimde başka bulguya bağlandı", ZLV[o.sim.level], true)
      : op(o.chain.zk, o.chain.last.t, `${zDates(o.chain)} · ${o.chain.nOpen} haftadır açık${o.sim.level === "farkli" ? " · numaralar farklı" : o.sim.common.length ? " · ortak: " + [...o.sim.nums, ...o.sim.common].slice(0, 3).join(", ") : ""}`, ZLV[o.sim.level])).join("") + op("yeni", "Yeni bulgu", "Önceki bulgularla ilgisi yok")
    : op("tekrar:" + sg.tekrar[0].chain.zk, "Tekrarlayan bulgu", `Yeni açılır · raporda önceki kapanış (${dm(sg.tekrar[0].closed)}) yazar`) + op("farkli", "Farklı sorun", "Etiketsiz yeni bulgu olarak açılır");
  return `<div class="zw${cls}"><button type="button" class="zhd" data-${pf}o="${key}" aria-expanded="${open}"><span class="t"><b>${esc(ttl)}</b><span>${esc(sub)}</span></span><span class="zpl p-${pl[1]}">${pl[0]}</span>${cv}</button>
    ${open ? `<div class="zbd"><div class="zls">${list}</div><span class="zht">${sg.open.length ? "Birden fazla önceki kayıt seçebilirsiniz; seçilenler bu haftayla tek bulguda birleşir. Sıklık yine artar." : "Kapanmış bulguya geri bağlanmaz; kabul edilmiş aksiyon ve puanı korunur."}</span></div>` : ""}</div>`;
}
// Bir bulgunun zincirinde, verilen tarihe kadar tespit edilmiş diğer açık halkalar (aksiyonla birlikte kapanır)
function zOlder(s, id, j, date) {
  const { st } = D.ctx, ch = zChains(null); if (!ch) return [];
  for (const c of ch) { const me = c.links.find(l => +l.y === +st.year && +l.m === +D.month && l.no === s.no && l.id === id && l.j === j); if (me) return Z.closeTargets(c, date).filter(l => l !== me); }
  return [];
}
const zOldLbl = l => `${l.no}. Denetim · ${dm(l.date)}${+l.m !== +D.month ? " (" + (MONTHS[l.m - 1] || "") + ")" : ""}`;
// Uygun işaretlenen maddede açık kalan zincirler (denetim tarihinden önce tespit edilmiş)
const zOpenFor = (ch, id, date) => (ch || []).filter(c => c.id === id && c.open && c.links.some(l => !l.ok && (!date || l.date < date)));
// Zincirle kapatma: aynı aydaki kayıtlar bellekte, diğer ay/yıllar ayrıca okunup yazılır. Kapanış puanı değiştirmez (via)
async function zCloseApply(links, src) {
  const { st } = D.ctx, other = new Map(), now = Date.now();
  for (const l of links) {
    const fx = { t: l.t, st: "ok", via: { k: src.k, d: src.d, no: src.no || 0 }, tx: src.tx, ph: src.ph || [], gn: src.by || "", at: now, ap: now };
    if (+l.y === +st.year && +l.m === +D.month) { const s = D.doc.sessions.find(x => x.no === l.no); if (s && (s.fails?.[l.id] || [])[l.j] === l.t) (s.fixed ||= {})[l.id + "|" + l.j] = fx; }
    else { const k = l.y + "|" + l.m; if (!other.has(k)) other.set(k, []); other.get(k).push([l, fx]); }
  }
  for (const [k, arr] of other) {
    const [y, m] = k.split("|"), did = `${pad(+m)}_${D.dept}`;
    try {
      const d2 = await S.getMonthDoc(st.fid, y, COLL, did); if (!d2?.sessions) continue;
      for (const [l, fx] of arr) { const s = d2.sessions.find(x => x.no === l.no); if (s && (s.fails?.[l.id] || [])[l.j] === l.t) (s.fixed ||= {})[l.id + "|" + l.j] = fx; }
      await S.saveMonthDoc(st.fid, y, COLL, did, d2);
    } catch (e) { toast("Önceki ay kaydı güncellenemedi: " + (e.message || e)); }
  }
}
// Birleştirme: seçilen diğer zincirlerin tüm kayıtları ana zincire bağlanır (aynı ay bellekte, diğer aylar ayrıca yazılır)
async function zRelink(list) {
  const { st } = D.ctx, other = new Map();
  for (const { primary, merge } of list || []) for (const c of merge) for (const l of c.links) {
    if (+l.y === +st.year && +l.m === +D.month) { const s = D.doc.sessions.find(x => x.no === l.no); if (s && (s.fails?.[l.id] || [])[l.j] === l.t) (s.zk ||= {})[l.id + "|" + l.j] = primary; }
    else { const k = l.y + "|" + l.m; if (!other.has(k)) other.set(k, []); other.get(k).push([l, primary]); }
  }
  for (const [k, arr] of other) {
    const [y, m] = k.split("|"), did = `${pad(+m)}_${D.dept}`;
    try { const d2 = await S.getMonthDoc(st.fid, y, COLL, did); if (!d2?.sessions) continue; for (const [l, pr] of arr) { const s = d2.sessions.find(x => x.no === l.no); if (s && (s.fails?.[l.id] || [])[l.j] === l.t) (s.zk ||= {})[l.id + "|" + l.j] = pr; } await S.saveMonthDoc(st.fid, y, COLL, did, d2); } catch (e) { toast("Önceki ay kaydı güncellenemedi: " + (e.message || e)); }
  }
  if (other.size) D.zh = null;
}
// Kaydedilen denetime (rec) zincir seçimlerini işler: notes sırası → kayıttaki bulgu sırası (boş açıklamalar atlanır)
function zApplyRec(rec, zs) {
  rec.zk ||= {}; const rk = {};
  for (const [id, list] of Object.entries(zs)) {
    let fi = 0;
    list.forEach(z => { if (z === undefined) return; if (z === null) { fi++; return; } const k = id + "|" + fi++;
      if (/^(yeni|farkli)$/.test(z.eff)) delete rec.zk[k];
      else if (z.eff.startsWith("tekrar:")) { delete rec.zk[k]; rk[k] = z.eff.slice(7); }
      else if (z.eff) { const r = zResolve(z); if (r) { rec.zk[k] = r.primary; if (r.merge.length) (rec.__zm ||= []).push(r); } } });
  }
  if (Object.keys(rk).length) rec.rk = rk; else delete rec.rk;
  return rec;
}
// "Uygun" işaretlenen maddede açık bulgular: kapatma kararı (varsayılan kapalı kart). u: { ok, off: [zk], ph: [] }
function zUcard(id, chs, u = {}, open = false, pf = "zu", guest = false) {
  if (!chs.length) return "";
  const n = chs.filter(c => !(u.off || []).includes(c.zk)).length, cv = `<span class="cv">${ic('<path d="M6 9l6 6 6-6"/>', 18)}</span>`;
  const [ttl, sub, pl] = guest ? [`Misafir "Uygun" buldu · ${chs.length} açık bulgu`, n ? `${n} bulgu kapatılacak` : "İşaretlerseniz kapanır", n ? ["Kapatılacak", "g"] : ["Açık kalır", "z"]]
    : u.ok === true ? [`${n} açık bulgu kapatılacak`, "Kayıtla birlikte işlenir", ["Kapatılacak", "g"]] : u.ok === false ? [`${chs.length} açık bulgu açık kalacak`, "Karar değiştirilebilir", ["Açık kalır", "z"]]
    : [`${chs.length} açık bulgu · kapatılsın mı?`, "Sahada düzelmiş görünüyor", ["Karar bekliyor", "o"]];
  return `<div class="zw zg" style="margin-top:10px"><button type="button" class="zhd" data-${pf}o="${id}" aria-expanded="${open}"><span class="t"><b>${esc(ttl)}</b><span>${esc(sub)}</span></span><span class="zpl p-${pl[1]}">${pl[0]}</span>${cv}</button>
    ${open ? `<div class="zbd">${chs.map(c => `<label class="zck"><input type="checkbox" data-${pf}c="${id}|${c.zk}" ${(u.off || []).includes(c.zk) ? "" : "checked"}><span>${esc(c.last.t)} · ${c.nOpen} hafta</span></label>`).join("")}
      ${guest ? `<span class="zht">İşaretlerseniz kapanış notu: "misafir denetiminde uygun bulundu". Puan değişmez.</span>` : `<span class="hd" style="font-size:11px;color:#0B4D38;margin-top:4px">KANIT FOTOĞRAFI (İSTEĞE BAĞLI)</span>
      <div class="phs" style="padding:0">${(u.ph || []).map(p => `<span class="pth"><img src="${p.t}" data-pv="${p.id}" alt="Fotoğraf"><button class="px" data-zupr="${id}|${p.id}" aria-label="Fotoğrafı sil">×</button></span>`).join("")}${D.ro ? "" : `<label class="pbtn" style="border-color:#6FB79A;color:#0B4D38">${ic('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 20)}<i>Fotoğraf çek</i><input type="file" accept="image/*" capture="environment" data-zuph="${id}" hidden></label><label class="pbtn" style="border-color:#6FB79A;color:#0B4D38">${ic('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 9"/>', 20)}<i>Resim ekle</i><input type="file" accept="image/*" multiple data-zuph="${id}" hidden></label>`}</div>
      <span class="zht">Kapanış notu: "denetimde uygun bulundu" · kapatan: denetimi yapan. Fotoğraf raporda "Aksiyon alındı · Sonrası" olarak görünür. İşaretini kaldırdığınız bulgu açık kalır. Puan değişmez.</span>
      <div class="z2"><button type="button" data-zuok="${id}" style="height:42px;background:#0B6E4F;border-color:#0B6E4F;color:#fff">Seçilenleri kapat</button><button type="button" class="sec" data-zuno="${id}" style="height:42px">Açık kalsın</button></div>`}</div>` : ""}</div>`;
}
// Yetkili: bekleyen aksiyon bildirimleri paneli
function fxPanel(list) {
  if (GUEST.on || !list.length) return "";
  return `<div class="cd" style="padding:18px 20px;gap:12px"><div><b style="font:600 16px Sora,sans-serif">Aksiyon bildirimleri (${list.length})</b>
    <div class="muted" style="font-size:12.5px;line-height:1.5">Misafirlerin bildirdiği aksiyonlar. Kabul ederseniz bulgu cezada Uygun gibi sayılır; reddederseniz gerekçeniz misafire iletilir.</div></div>
    ${list.map(x => { const { cat, txt } = catOf(x.id); return `<div class="sess" style="flex-direction:column;align-items:stretch;gap:6px"><div class="row sp" style="flex-wrap:nowrap"><div style="min-width:0"><b>${esc(cat.name)}</b><div class="muted" style="font-size:12.5px">${x.no}. denetim · ${dm(x.s.date)} · ${esc(x.guestName)} · ${fxWhen(x.req.at)}</div></div><button class="sm" data-fxrev="${x.key}|${x.guestUid}">İncele</button></div>
      <div style="font-size:13px"><span class="muted">Tespit:</span> ${esc(x.req.t)}</div><div style="font-size:13px"><span class="muted">Aksiyon:</span> ${esc(x.req.tx)}</div></div>`; }).join("")}</div>`;
}
// Yetkili: kabul / ret penceresi
async function fxReview(pd, single = false) {
  if (!zChains()) { const { st } = D.ctx; try { D.zh = { key: D.key, docs: await Z.loadHistory(S.getMonthDoc, st.fid, st.year, D.month, D.dept, 12) }; } catch { } }
  const { st } = D.ctx, doc = D.doc, s = pd.s, req = pd.req, { cat } = catOf(pd.id), fk = `${pd.id}|${pd.j}`;
  const row = D.setup.rows.find(r => r.id === D.dept), yg = surecVar(st.year, D.month);
  const aud = fx => isgAudits({ cats: CATS, sessions: doc.sessions.map(x => x === s ? { ...x, fixed: { ...(x.fixed || {}), ...fx } } : x), freqOv: doc.freq, F: katsayi(row, D.month), p: D.setup.params || DEFAULT_PARAMS, yog: yg, mak: makTier(row) }).find(a => a.date === s.date)?.score;
  // Aynı bulgu için birden fazla misafir aksiyon bildirdiyse hepsi birlikte incelenir
  const grp = single ? [pd] : fxPending().filter(x => x.key === pd.key), multi = grp.length > 1, selPh = new Set(grp.flatMap(x => (x.req.ph || []).map(p => p.id))), ratMax = Math.max(...grp.map(x => x.req.at));
  const zOld = zOlder(s, pd.id, pd.j, iso(new Date(ratMax))), zOff = new Set();
  const late = !fxInTime({ rat: req.at }, s.date), b0 = yg ? aud({}) : null, b1 = yg ? aud({ [fk]: { t: req.t, st: "ok", rat: req.at } }) : null, f1 = n => n.toFixed(1).replace(".", ",");
  const m = document.createElement("div"); m.className = "mod";
  m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:14px;max-height:92vh;overflow:auto"><div class="row sp" style="flex-wrap:nowrap"><div><h2 style="font-size:19px">Aksiyon incelemesi</h2><div class="muted" style="font-size:13px">${esc(row.name)} · ${esc(cat.name)} · ${s.no}. denetim</div></div>
      <button data-x aria-label="Kapat" style="flex:0 0 35px;width:35px;height:35px;min-width:0;padding:0;background:#D6382E;border-color:#D6382E;color:#fff;font-size:24px;line-height:1">×</button></div>
    <div style="background:#FDF1F0;border:1px solid #F3C7C3;border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px"><span class="hd" style="color:#B3261E">İLK TESPİT · ${dmy(s.date)}</span><span>${esc(req.t)}</span>${fxImgs(s.photos?.[fk])}</div>
    ${multi ? `<div style="background:#FFF8E6;border:1px solid #F1D48A;border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:10px"><span class="hd" style="color:#7A5200">${grp.length} MİSAFİR AKSİYON BİLDİRDİ</span>
      ${grp.map(x => `<div style="display:flex;flex-direction:column;gap:6px"><b style="font-size:13.5px">${esc(x.guestName)} <span class="muted" style="font-weight:400;font-size:12px">· ${fxWhen(x.req.at)}</span></b><span style="font-size:13px">${esc(x.req.tx)}</span>${x.req.ph?.length ? `<div style="display:flex;flex-wrap:wrap;gap:10px">${x.req.ph.map(p => `<label style="display:flex;flex-direction:column;align-items:center;gap:4px;margin:0"><span class="pth"><img src="${p.t}" data-pv="${p.id}" alt="Fotoğraf"></span><span style="display:flex;align-items:center;gap:5px;font-size:12px"><input type="checkbox" data-sp="${p.id}" checked style="width:18px;height:18px;margin:0;accent-color:#0B6E4F">Rapora</span></label>`).join("")}</div>` : ""}</div>`).join("")}
      <span class="hd" style="color:#7A5200">RAPORA GİDECEK AÇIKLAMA</span><button type="button" class="nb" id="fxNb" aria-label="Aksiyon açıklamasını düzenle"><span class="nt" style="white-space:pre-line">${esc(grp.map(x => `${x.guestName}: ${x.req.tx}`).join("\n"))}</span>${ic('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>', 18)}</button>
      <span class="muted" style="font-size:12px">Birlikte kabul edilir. Fotoğraflardan işaretini kaldırdıklarınız rapora girmez. Tek misafiri ayrı reddetmek için <a href="#" id="fxSingle" style="color:var(--gd);font-weight:700">yalnızca bunu incele</a>.</span></div>` : `    <div style="background:#FFF8E6;border:1px solid #F1D48A;border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px"><span class="hd" style="color:#7A5200">ALINAN AKSİYON · ${fxWhen(req.at)}</span><span class="muted" style="font-size:12.5px">${esc(pd.guestName)}</span>
      <button type="button" class="nb" id="fxNb" aria-label="Aksiyon açıklamasını düzenle"><span class="nt">${esc(req.tx)}</span>${ic('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>', 18)}</button>${fxImgs(req.ph)}
      <span class="muted" style="font-size:12px">Gerekirse açıklamayı düzeltebilirsiniz.</span></div>`}
    ${zOld.length ? `<div style="background:#EAF7F1;border:1px solid #A9DCC4;border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:2px"><b style="color:#0B4D38;font-size:13.5px">Bu aksiyonla kapanacak bulgular</b>
      <label class="zck"><input type="checkbox" checked disabled><span>${s.no}. Denetim · ${dm(s.date)} · ${late ? "hafta kapandı, yalnızca kayıt" : "puana yansır"}</span></label>
      ${zOld.map((l, i) => `<label class="zck"><input type="checkbox" data-zold="${i}" checked><span>${zOldLbl(l)} · yalnızca kayıt</span></label>`).join("")}
      <span class="zht">Aynı bulgunun önceki haftaları. İşaretini kaldırdığınız açık kalır; eski haftaların puanı değişmez.</span></div>` : ""}
    <div style="background:#EAF7F1;border:1px solid #A9DCC4;border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.5"><b style="color:#0B6E4F">Kabul ederseniz</b><br>${late ? "Bu denetimin haftası kapandı (en geç cumartesi): aksiyon yalnızca açıklamada görünür, ceza puanı değişmez. " : ""}${!late && b0 !== null && b1 !== null ? (Math.abs(b1 - b0) < 0.05 ? "Bu denetimin skoru değişmez; kategoride başka açık bulgu var, ceza o bulgular kapanınca kalkar. " : `Bu denetimin skoru <b>${f1(b0)} → ${f1(b1)}</b>. `) : "Bulgu cezada Uygun gibi sayılır. "}Sıklık takibi sürer.</div>
    <button data-ok style="flex:0 0 auto;min-height:46px;height:46px;background:#0B6E4F;border-color:#0B6E4F;color:#fff;font-weight:700">${zOld.length ? `Kabul et (${zOld.length + 1} bulgu kapanır)` : "Kabul et"}</button>
    ${multi ? "" : `    <div style="border-top:1px solid var(--line);padding-top:12px;display:flex;flex-direction:column;gap:8px"><span class="hd">RET GEREKÇESİ (ZORUNLU)</span><textarea class="inp" id="fxRj" rows="3" style="min-height:76px;height:auto;padding:10px;resize:vertical" aria-label="Ret gerekçesi" placeholder="Neden kabul edilmedi? Misafire iletilir."></textarea>
      <button class="sec" data-no style="flex:0 0 auto;min-height:46px;height:46px;color:#D6382E;border-color:#D6382E;font-weight:700">Reddet ve gerekçeyi gönder</button></div>`}</div>`;
  document.body.appendChild(m);
  let txr = multi ? grp.map(x => `${x.guestName}: ${x.req.tx}`).join("\n") : req.tx;
  m.querySelector("#fxNb").onclick = async () => { const r = await noteEditor({ title: "Alınan aksiyon", item: req.t, text: txr, question: "Ne yapıldı? Alınan aksiyonu yazın.", example: "Örn. Koruyucu kapak yerine takıldı." }); if (r !== null) { txr = r; m.querySelector("#fxNb .nt").textContent = r; } };
  m.querySelector("[data-x]").onclick = () => m.remove();
  m.addEventListener("mousedown", e => { if (e.target === m) m.remove(); });
  m.querySelectorAll("[data-pv]").forEach(im => im.onclick = e => { e.preventDefault(); pvOpen(im); });
  m.querySelectorAll("[data-zold]").forEach(c => c.onchange = () => { c.checked ? zOff.delete(+c.dataset.zold) : zOff.add(+c.dataset.zold); m.querySelector("[data-ok]").textContent = `Kabul et (${zOld.length - zOff.size + 1} bulgu kapanır)`; });
  m.querySelectorAll("[data-sp]").forEach(c => c.onchange = () => { c.checked ? selPh.add(c.dataset.sp) : selPh.delete(c.dataset.sp); });
  m.querySelector("#fxSingle")?.addEventListener("click", e => { e.preventDefault(); m.remove(); fxReview(pd, true); });
  const done = async (obj, msg) => {
    m.querySelectorAll("button").forEach(b => b.disabled = true);
    const zSel = obj.st === "ok" ? zOld.filter((_, i) => !zOff.has(i)) : [];
    (s.fixed ||= {})[fk] = { t: req.t, tx: txr.trim(), ph: multi && obj.st === "ok" ? grp.flatMap(x => x.req.ph || []).filter(p => selPh.has(p.id)) : req.ph || [], at: Date.now(), rat: multi ? ratMax : req.at, gn: multi ? [...new Set(grp.map(x => x.guestName))].join(", ") : pd.guestName, gu: pd.guestUid, ...obj };
    if (zSel.length) { await zCloseApply(zSel, { k: "aks", d: iso(new Date(ratMax)), no: s.no, by: s.fixed[fk].gn, tx: s.fixed[fk].tx, ph: s.fixed[fk].ph }); if (zSel.some(l => +l.m !== +D.month || +l.y !== +st.year)) D.zh = null; }
    const ok = await persist(true);
    if (ok === false) { delete s.fixed[fk]; toast("Kaydedilemedi, bağlantıyı kontrol edip tekrar deneyin."); m.querySelectorAll("button").forEach(b => b.disabled = false); return; }
    m.remove();
    for (const gu of new Set(grp.map(x => x.guestUid))) if (!fxPending().some(x => x.guestUid === gu)) Guest.inboxDelete(`${gu}_fx_${st.fid}_${st.year}_${D.month}_${D.dept}`);
    draw(); toast(msg);
  };
  m.querySelector("[data-ok]").onclick = () => { if (!txr.trim()) return toast("Aksiyon açıklaması boş olamaz."); done({ st: "ok", ap: Date.now() }, "Aksiyon kabul edildi; bulgu cezada Uygun gibi sayılır."); };
  m.querySelector("[data-no]") && (m.querySelector("[data-no]").onclick = () => { const r = m.querySelector("#fxRj").value.trim(); if (!r) return toast("Ret gerekçesi yazın."); done({ st: "rej", rej: r }, "Aksiyon reddedildi; gerekçe misafire iletilir."); });
}
// Misafir: açık bulgular listesi (açılır kart) ve aksiyon bildirme formu
// Misafir görünürlüğü: paylaşım haftası ve sonrası denetimler + hâlâ açık bulgusu olan eski denetimler
const gVis = s => {
  if (!GUEST.on) return true;
  if (!GUEST.hist) return false;
  if (!D.shScope) return true;
  const w = D.shScope.get(D.month + "|" + D.dept); if (!w) return false;
  return (s.date && monOf(s.date) >= w) || Object.entries(s.fails || {}).some(([id, arr]) => (arr || []).some((t, j) => t && s.fixed?.[id + "|" + j]?.st !== "ok"));
};
// Yetkili: bölüm sorumlusu / termin varsayılanı (son denetimden 7 gün sonrası)
const defDue = doc => addDays(doc.draft?.date || iso(new Date()), 7);
async function respDialog() {
  const { st } = D.ctx, doc = D.doc;
  const mem = (await S.listMembers().catch(() => [])).filter(x => (x.factories || []).includes(st.fid) && (x.expires == null || (x.expires.toMillis ? x.expires.toMillis() : +x.expires) > Date.now()));
  let sel = [...(doc.resp || [])];
  const m = document.createElement("div"); m.className = "mod";
  const draw2 = () => {
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:12px"><h2 style="font-size:20px">Sorumlu seç</h2>
      ${mem.length ? `<div class="col1" style="gap:6px">${mem.map(g => { const on = sel.some(r => r.id === g.id); return `<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid ${on ? "var(--gd)" : "var(--line)"};border-radius:12px;margin:0;cursor:pointer;${on ? "background:#EAF7F1" : ""}"><input type="checkbox" data-rg="${g.id}" ${on ? "checked" : ""} style="width:20px;height:20px;margin:0;flex:0 0 20px;accent-color:#0B6E4F"><span style="flex:1;min-width:0"><b style="font-size:14px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.name || "Misafir")}</b>${g.unit ? `<span style="font-style:italic;font-size:12px;color:var(--muted);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.unit)}</span>` : ""}</span></label>`; }).join("")}</div>`: '<div class="muted" style="font-size:13px">Kayıtlı misafir yok. Aşağıya ad yazabilirsiniz.</div>'}
      <div><label class="hd" for="rgO" style="margin:0">BAŞKA KİŞİ</label><input id="rgO" class="inp" style="margin-top:4px" placeholder="Uygulama hesabı olmayan kişi" value="${esc(sel.filter(r => !r.id).map(r => r.name).join(", "))}"></div>
      <div class="muted" style="font-size:12.5px">Başka kişi takip tablosunda görünür, paylaşıma eklenmez.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="sec" data-c>Vazgeç</button><button data-ok>Tamam</button></div></div>`;
    m.querySelectorAll("[data-rg]").forEach(c => c.onchange = () => { const g = mem.find(x => x.id === c.dataset.rg); sel = c.checked ? [...sel, { id: g.id, name: g.name || "Misafir" }] : sel.filter(r => r.id !== g.id); const o = m.querySelector("#rgO").value; draw2(); m.querySelector("#rgO").value = o; });
    m.querySelector("[data-c]").onclick = () => m.remove();
    m.querySelector("[data-ok]").onclick = () => { const o = m.querySelector("#rgO").value.split(",").map(x => x.trim()).filter(Boolean); doc.resp = [...sel.filter(r => r.id), ...o.map(name => ({ id: "", name }))]; m.remove(); persist(); draw(); };
    m.addEventListener("mousedown", e => { if (e.target === m) m.remove(); });
  };
  document.body.appendChild(m); draw2();
}
function gfxRows(all = false) {
  const rows = [], pend = fxPending();
  D.doc.sessions.filter(s => all || gVis(s)).forEach(s => Object.entries(s.fails || {}).forEach(([id, arr]) => arr.forEach((t, j) => {
    if (!t) return; const f = fxStateOf(s, id, j, t);
    if (f?.st === "ok") return;
    rows.push({ s, id, j, t, f, pd: pend.find(x => x.no === s.no && x.id === id && x.j === j) });
  })));
  return rows;
}
function gfxPanel() {
  if (!GUEST.on || D.shScope || !GUEST.hist) return "";
  const rows = gfxRows(); if (!rows.length) return "";
  const open = D.gfxOpen;
  return `<div class="cd" style="padding:16px 20px;gap:10px"><button type="button" data-gfxt aria-expanded="${open}" style="display:flex;align-items:center;gap:12px;width:100%;min-height:44px;height:auto;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;font-weight:400"><span style="flex:1;min-width:0"><b style="font:600 16px Sora,sans-serif;display:block">Aksiyon bildir · açık bulgular (${rows.length})</b><span class="muted" style="font-size:12.5px;line-height:1.5">Bir bulguyla ilgili önlem aldıysanız aksiyonu fotoğrafla yetkiliye bildirin.</span></span><span style="transform:rotate(${open ? 180 : 0}deg);display:flex">${ic('<path d="M6 9l6 6 6-6"/>')}</span></button>
    ${open ? rows.map(r => { const { cat } = catOf(r.id), key = `${r.s.no}|${r.id}|${r.j}`;
      return `<div class="sess" style="flex-direction:column;align-items:stretch;gap:6px"><div class="row sp" style="flex-wrap:nowrap"><div style="min-width:0"><b style="font-size:14px">${esc(cat.name)}</b><div class="muted" style="font-size:12.5px">${r.s.no}. denetim · ${dm(r.s.date)}</div></div>
        ${r.pd ? '<span class="pill" style="background:#FBE9C6;color:#5A3300">Onay bekliyor</span>' : r.f?.st === "rej" ? '<span class="pill" style="background:#FADAD7;color:#B3261E">Reddedildi</span>' : ""}</div>
        <div style="font-size:13.5px">${esc(r.t)}</div>${fxImgs(r.s.photos?.[r.id + "|" + r.j])}
        ${!r.pd && r.f?.st === "rej" ? `<div style="padding:8px 10px;border-radius:10px;background:#FDF1F0;border:1px solid #F3C7C3;color:#7A1C14;font-size:13px"><b>Ret gerekçesi:</b> ${esc(r.f.rej || "")}</div>` : ""}
        ${r.pd ? `<div style="font-size:13px"><span class="muted">Bildirdiğiniz aksiyon:</span> ${esc(r.pd.req.tx)}</div>` : ""}
        <button class="sec" data-gfx="${key}" style="height:42px">${r.pd ? "Aksiyonu güncelle" : r.f?.st === "rej" ? "Düzeltip yeniden gönder" : "Aksiyon bildir"}</button></div>`; }).join("") : ""}</div>`;
}
function gfxForm(r) {
  const r0 = r, { st } = D.ctx, { cat } = catOf(r.id), key = `${r.s.no}|${r.id}|${r.j}`, prev = D.fxList.find(x => x.key === key);
  let ph = prev ? prev.req.ph.map(p => ({ ...p })) : [], txt = prev?.req.tx || "";
  const m = document.createElement("div"); m.className = "mod";
  const draw2 = () => {
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:12px;max-height:92vh;overflow:auto"><div class="row sp" style="flex-wrap:nowrap"><div><h2 style="font-size:19px">Aksiyon bildir</h2><div class="muted" style="font-size:13px">${esc(cat.name)} · ${r.s.no}. denetim</div></div>
        <button data-x aria-label="Kapat" style="flex:0 0 35px;width:35px;height:35px;min-width:0;padding:0;background:#D6382E;border-color:#D6382E;color:#fff;font-size:24px;line-height:1">×</button></div>
      <div style="background:#FDF1F0;border:1px solid #F3C7C3;border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px"><span class="hd" style="color:#B3261E">TESPİT</span><span>${esc(r.t)}</span>${fxImgs(r.s.photos?.[r.id + "|" + r.j])}</div>
      <span class="hd">AKSİYON FOTOĞRAFI</span>
      <div class="phs" style="padding:0">${ph.map(p => `<span class="pth"><img src="${p.t}" alt="Fotoğraf"><button class="px" data-rm="${p.id}" aria-label="Fotoğrafı sil">×</button></span>`).join("")}
        <label class="pbtn">${ic('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 20)}<i>Fotoğraf çek</i><input type="file" accept="image/*" capture="environment" hidden></label>
        <label class="pbtn">${ic('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 9"/>', 20)}<i>Resim ekle</i><input type="file" accept="image/*" multiple hidden></label></div>
      <span class="hd">ALINAN AKSİYON</span><button type="button" class="nb" id="gfxNb" aria-label="Aksiyon açıklamasını yaz veya düzenle"><span class="nt" style="color:${txt.trim() ? "var(--text)" : "#6B7F79"}">${esc(txt.trim() ? txt : "Dokunun ve yazın: ne yapıldı?")}</span>${ic('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>', 18)}</button>
      <span class="muted" style="font-size:12px">Açıklama zorunludur. Gönderince yetkili kullanıcıya bildirim gider; kabul edilene kadar puana yansımaz.</span>
      <button data-send style="height:46px;background:#0B6E4F;border-color:#0B6E4F;color:#fff;font-weight:700">Aksiyonu yetkiliye gönder</button></div>`;
    m.querySelector("#gfxNb").onclick = async () => { const r = await noteEditor({ title: "Alınan aksiyon", item: r0.t, text: txt, question: "Ne yapıldı? Alınan aksiyonu yazın.", example: "Örn. Koruyucu kapak yerine takıldı, devre dışı bırakma bağlantısı kaldırıldı." }); if (r !== null) { txt = r; draw2(); } };
    m.querySelector("[data-x]").onclick = () => m.remove();
    m.querySelectorAll("img[src]").forEach(im => { if (im.closest(".pth") && !im.dataset.pv) im.onclick = () => openPhotos(im); });
    m.querySelectorAll("[data-rm]").forEach(b => b.onclick = e => { e.stopPropagation(); const pid = b.dataset.rm; ph = ph.filter(p => p.id !== pid); S.deletePhoto(st.fid, st.year, pid).catch(() => {}); draw2(); });
    m.querySelectorAll("input[type=file]").forEach(inp => inp.onchange = async () => {
      const files = [...inp.files]; inp.value = ""; if (!files.length) return; let n = 0;
      for (const f of files) { try { const { full, thumb } = await compressImage(f), pid = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await S.savePhoto(st.fid, st.year, pid, full); ph.push({ id: pid, t: thumb }); n++; } catch (e) { toast("Fotoğraf eklenemedi: " + (e.message || e)); } }
      draw2();
    });
    m.querySelector("[data-send]").onclick = async e => {
      const text = txt.trim(); if (!text) return toast("Alınan aksiyonu yazın.");
      e.target.disabled = true;
      const reqs = {}; D.fxList.forEach(x => { reqs[x.key] = x.req; }); reqs[key] = { t: r.t, tx: text, ph, at: Date.now(), gn: GUEST.name };
      try {
        await S.saveMonthDoc(st.fid, st.year, "isgg", `${pad(D.month)}_${D.dept}_fix_${GUEST.uid}`, { guestUid: GUEST.uid, guestName: GUEST.name, dept: D.dept, month: D.month, status: "draft", draft: { fixReqs: reqs }, at: Date.now() });
      } catch (er) { toast("Gönderilemedi: " + (er.message || er)); e.target.disabled = false; return; }
      D.fxList = Object.entries(reqs).map(([k, req]) => ({ guestUid: GUEST.uid, guestName: GUEST.name, key: k, req }));
      m.remove(); draw(); toast("Aksiyon yetkili kullanıcıya gönderildi.");
      Guest.reportFix({ fid: st.fid, year: st.year, month: D.month, dept: D.dept, deptName: D.setup.rows.find(x => x.id === D.dept)?.name || "", factoryName: st.factories.find(f => f.id === st.fid)?.name || "", wk: wkNo(r0.s.date) }, cat.name);
    };
  };
  document.body.appendChild(m); draw2();
}
// Misafir: yetkilinin kararı (kabul / ret) canlı yansır
function fxWatch(d) {
  if (!d || !GUEST.on) return;
  const seen = {}; (d.sessions || []).forEach(s => Object.entries(s.fixed || {}).forEach(([k, f]) => { seen[`${s.no}|${k}`] = f; }));
  if (D.fxSeen) Object.entries(seen).forEach(([k, f]) => {
    const o = D.fxSeen[k]; if (o && o.st === f.st && o.rat === f.rat) return;
    if (D.fxList.some(x => x.key === k)) toast(f.st === "ok" ? "Aksiyonunuz kabul edildi. Teşekkürler." : "Aksiyonunuz reddedildi: " + (f.rej || ""));
  });
  D.fxSeen = seen; D.doc.sessions = d.sessions || [];
  if (D.v?.isConnected && D.v.querySelector("#bolum")) draw();
}

function draw() {
  const { st } = D.ctx, v = D.v, doc = D.doc, setup = D.setup, p = setup.params || DEFAULT_PARAMS;
  const row = setup.rows.find(r => r.id === D.dept), F = katsayi(row, D.month);
  const on = doc.draft.on !== false, editNo = doc.draft.edit;
  const calcSessions = doc.sessions.filter(x => x.no !== editNo);
  const yogM = surecVar(st.year, D.month), mak = makTier(row);
  // Makine sayısı "Yok" olan bölümde yeni denetimde makine maddeleri (1, 2) otomatik Y.D. gelir (elle değiştirilebilir)
  if (on && yogM && mak === "0" && !doc.draft.mk0 && !D.ro && !GUEST.on) { doc.draft.mk0 = true; ["c1i0", "c1i1"].forEach(id => { if (!doc.draft.marks[id]) doc.draft.marks[id] = "n"; }); }
  // Süreç başlangıcından sonra: her denetim 100'den başlar, yalnız bu denetimde bulgu çıkan kategoriler ceza alır (sıklık aydaki önceki denetimlerden gelir); ay skoru = denetim skorlarının ortalaması + ramak kala bonusu
  D.fxPend = fxPending();
  if (!GUEST.on) zEnsure();
  const edS = on && !GUEST.on && editNo != null ? doc.sessions.find(x => x.no === editNo) : null;
  const fxc = (id, notes, k) => { const t = String(notes[k] || "").trim(); if (!edS || !t) return ""; const fi = notes.slice(0, k).filter(x => String(x || "").trim()).length; const h = fxCard(edS, id, fi, t); return h ? `<div style="padding-left:22px">${h}</div>` : ""; };
  const zch = !GUEST.on && on && !D.ro ? zChains(editNo) : null, zsel = doc.draft.zsel || {};
  const zPre = (id, notes) => { const o = {}; if (!edS?.zk) return o; let fi = 0; notes.forEach((t, k) => { if (!String(t || "").trim()) return; const v = edS.zk[id + "|" + fi++]; if (v) o[id + "|" + k] = v; }); return o; };
  const fxN = doc.sessions.reduce((a, x) => a + Object.values(x.fixed || {}).filter(f => f.st === "ok").length, 0);
  const c = calcIsg({ cats: CATS, sessions: on ? calcSessions : doc.sessions, draft: on ? (edS?.fixed ? { ...doc.draft, fixed: edS.fixed } : doc.draft) : { marks: {}, notes: {}, ydNotes: {} }, freqOv: doc.freq, bonusIdx: yogM ? 0 : doc.bonus, F, p, yog: yogM, mak, perAudit: yogM });
  const bon = yogM ? (c.bonusVals[doc.bonus] || 0) : c.bonus;
  const mo = yogM ? isgMonth({ cats: CATS, sessions: doc.sessions, freqOv: doc.freq, bonusIdx: doc.bonus, F, p, yog: yogM, mak }) : null;
  const prevA = yogM && on ? isgAudits({ cats: CATS, sessions: calcSessions, freqOv: doc.freq, F, p, yog: yogM, mak }).map(x => x.score) : [];
  const monthL = yogM ? (on ? (c.curMarked ? [...prevA, c.score] : prevA) : (mo.audits || []).map(x => x.score)) : [];
  const monthAvg = monthL.length ? Math.min(100, monthL.reduce((a, x) => a + x, 0) / monthL.length + bon) : null;
  const shown = yogM && !on ? mo.score : c.score;
  const band = bandOf(shown, p), B = BAND[band];
  const curNo = editNo ?? (doc.sessions.length + 1), date = doc.draft.date;
  const dateOk = date && +date.slice(0, 4) === +st.year && +date.slice(5, 7) === D.month && date <= iso(new Date());
  const canSave = c.canSave && dateOk && !D.ro;
  const canPart = c.missing === 0 && c.ydMissing === 0 && c.curMarked && dateOk && !D.ro;
  const f1 = n => n.toFixed(1).replace(".", ",");
  const catHtml = CATS.map((cat, ci) => {
    const info = c.catInfo[ci], w = W[cat.w], open = !!D.open[ci];
    const [fb, fc] = info.hasFreq ? FT[info.freq] : ["#E4ECE9", "#4A5C57"];
    const items = (cat.ord || cat.items.map((_, i) => i)).map(ii => {
      const txt = cat.items[ii], it = info.items[ii], id = it.id, mk = it.mk, notes = doc.draft.notes[id] && doc.draft.notes[id].length ? doc.draft.notes[id] : [""];
      const prevS = it.prev.filter(s => !on || !editNo || s.no < editNo), prevDates = prevS.map(s => dm(s.date)), canPrev = !GUEST.on || GUEST.hist;
      const fq = Math.min(c.azami, it.cnt === 0 ? 0 : it.cnt === 1 ? 1 : it.cnt <= 3 ? 2 : 3);
      const zs = it.isX && zch ? zItem(zch, id, notes, zsel, date, zPre(id, notes)) : null;
      const sb = k => { const [bg, col] = TONE[k]; return seg(mk === k, bg, col); };
      return `<div class="ci"><div class="cir"><div class="grow"><span>${esc(txt)}</span>
        ${prevDates.length && !it.isX ? `<span class="pill" style="background:#FBE9C6;color:#6B3F00">Önceki denetimde uygunsuzdu: ${prevS.map(s => canPrev ? `<button type="button" class="pd" data-pf="${id}|${s.no}" aria-label="${dm(s.date)} tarihli geçmiş bulguyu aç">${dm(s.date)}</button>` : dm(s.date)).join(", ")}</span>` : ""}</div>
        <div class="row" style="gap:6px;flex-wrap:nowrap">${[["u", "Uygun"], ["x", "Uygunsuz"], ["n", "Y.D."]].map(([k, t]) => `<button class="mk" data-mk="${id}|${k}" style="${sb(k)}" aria-pressed="${mk === k}">${t}</button>`).join("")}</div></div>
        ${mk === "u" && zch ? zUcard(id, zOpenFor(zch, id, date), doc.draft.zu?.[id] || {}, D.zOpen === "u|" + id) : ""}${it.isX ? `<div class="xbox"><div class="row"><span class="pill" style="background:${FT[fq][0]};color:${FT[fq][1]}">Sıklık ${fq} · otomatik</span>
          <span style="font-size:12.5px;color:#5A1A16">${it.cnt === 1 ? "Bu ay ilk kez tespit edildi" : `Bu ay ${it.cnt} farklı günde uygunsuz (${prevS.map(s => canPrev ? `<button type="button" class="pd" data-pf="${id}|${s.no}" aria-label="${dm(s.date)} tarihli geçmiş bulguyu aç">${dm(s.date)}</button>` : dm(s.date)).concat([dm(date || "0000-00-00")]).join(", ")})`}</span></div>
          <div class="hd">AÇIKLAMA · Hangi makine veya alanda, ne gibi bir uygunsuzluk var?</div>
          ${notes.map((t, k) => `<div class="row" style="flex-wrap:nowrap;align-items:flex-start;gap:6px"><span style="flex:0 0 16px;padding-top:10px;font-weight:800;color:#8E1B16">${k + 1}.</span>
            <button class="nb" data-note="${id}|${k}" aria-label="Açıklamayı yaz veya düzenle"><span class="nt" style="color:${t.trim() ? "var(--text)" : "#8A6A66"}">${esc(t.trim() ? t : "Dokunun ve yazın: hangi makine veya alanda, ne gibi uygunsuzluk var?")}</span>${ic('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>', 18)}</button>
            <button class="nx" data-nrm="${id}|${k}" aria-label="Açıklamayı sil">×</button></div>
          <div class="phs">${(doc.draft.photos?.[id + "|" + k] || []).map(p => `<span class="pth"><img src="${p.t}" data-pv="${p.id}" alt="Fotoğraf"><button class="px" data-prm="${id}|${k}|${p.id}" aria-label="Fotoğrafı sil">×</button></span>`).join("")}
            ${D.ro ? "" : `<label class="pbtn">${ic('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 20)}<i>Fotoğraf çek</i><input type="file" accept="image/*" capture="environment" data-ph="${id}|${k}" hidden></label><label class="pbtn">${ic('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 9"/>', 20)}<i>Resim ekle</i><input type="file" accept="image/*" multiple data-ph="${id}|${k}" hidden></label>`}${gchip(cat, ii, id, notes, k, curNo, row, st)}</div>${fxc(id, notes, k)}${zs?.[k] ? zCard(zs[k], D.zOpen === zs[k].key) : ""}`).join("")}
          <button class="sec" style="align-self:flex-start;height:38px;color:#8E1B16;border-color:#B3261E" data-nadd="${id}">+ Benzer uygunsuzluk ekle</button></div>` : ""}</div>`;
    }).join("");
    const ydBox = info.allYD ? `<div class="ydbox"><span class="hd">BU KATEGORİDE TÜM MADDELER Y.D. · KISA GEREKÇE</span>
      <input class="inp" data-yd="${ci}" value="${esc(doc.draft.ydNotes?.[ci] || "")}" aria-label="Y.D. gerekçesi" placeholder="Örn. İlgili bölümde çalışma yoktur">
      <span class="muted" style="font-size:12.5px">Bu kategori puanı etkilemez (ceza 0), ancak bölümün tüm kategorilerindeki payı sabit kalır. Gerekçe raporda görünür.</span></div>` : "";
    const freqBox = info.hasFreq ? `<div class="fbox"><div style="min-width:200px"><span class="hd">KATEGORİ SIKLIĞI (BU AY)</span><div class="muted" style="font-size:12.5px">${info.hasOverride ? `Elle seçildi (otomatik öneri: ${info.auto})` : `Otomatik: bu ay ${info.catCount} farklı günde bulgu${info.heavy ? `, bir denetimde ${info.maxDay} bulgu (+1)` : ""} → sıklık ${info.auto}${cat.w === 3 ? " (kritik kategoride bulgu varsa en az 2)" : ""}${yogM ? ". Ceza yalnız bu denetimde bulgu varsa işlenir" : ""}`}</div></div>
      <div class="row">${[0, 1, 2, 3].filter(k => k <= c.azami).map(k => `<button class="fq" data-freq="${ci}|${k}" style="${seg(info.freq === k, FT[k][0], FT[k][1])}">${k}</button>`).join("")}
      ${info.hasOverride ? `<button class="sec" style="height:40px;color:#0F3F63;border-color:var(--inl)" data-freqreset="${ci}">Otomatiğe dön</button>` : ""}</div>
      <div class="muted" style="flex-basis:100%;font-size:12px">0 Uygun · 1 Nadiren (ayda 1) · 2 Sık (ayda 2-3) · 3 Haftalık</div></div>` : "";
    return `<div class="cat"><div class="cath"><button class="cht" data-tog="${ci}" aria-expanded="${open}"><span class="cno">${ci + 1}</span>
      <span class="grow"><b style="font-size:15px;line-height:1.35">${esc(cat.name)}</b><span class="muted" style="display:block;font-size:12.5px">${!info.hasFreq ? "Tüm maddeler Y.D. · bu dönem değerlendirme dışı" : `${esc(cat.sub)} · bu ay ${info.catCount} farklı günde bulgu`}</span></span>
      <span style="transform:rotate(${open ? 180 : 0}deg);display:flex">${ic('<path d="M6 9l6 6 6-6"/>')}</span></button>
      <span class="pill" style="background:${w[1]};color:${w[2]}">${w[0]}</span>
      ${on ? `<span class="pill" style="min-width:74px;text-align:center;background:${info.marked === info.nItems ? "#D9F1E6" : "#FBE9C6"};color:${info.marked === info.nItems ? "#0B6E4F" : "#5A3300"}" title="İşaretlenen madde sayısı">Kontrol ${info.marked}/${info.nItems}</span>` : ""}
      <span class="pill" style="min-width:74px;text-align:center;background:${fb};color:${fc}">${info.hasFreq ? "Sıklık " + info.freq : "Dışı"}</span></div>
      ${open ? `<div class="catb">${items}${ydBox}${freqBox}</div>` : ""}</div>`;
  }).join("");

  v.innerHTML = `
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px"><div style="min-width:0"><div class="hd" style="letter-spacing:.8px">AYLIK VERİ GİRİŞİ</div><h1 class="ttl">İSG Denetim Listesi</h1>
    <div class="muted" style="font-size:12.5px" id="sv">${svTxt()}</div></div>${!GUEST.on && String(st.year) === String(st.active) ? `<button type="button" id="shareBtn" class="sec" aria-label="Bulguları paylaş" title="Bulguları sorumluyla paylaş" style="flex:0 0 44px;width:44px;height:44px;padding:0;display:grid;place-items:center;min-height:0;border-radius:12px">${ic('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.7l6.8-4M8.6 13.3l6.8 4"/>', 20)}</button>` : ""}</div>
  <div id="wkWarn" style="display:none"></div>
  <div id="wkStrip" style="display:none"></div>
  ${D.ro && !(GUEST.on && (D.gstatus === "review" || D.gstatus === "approved")) ? `<div class="warn">${roText(st.year, D.month, st.active)}</div>` : ""}
  ${(() => { const cu = on && !GUEST.on && !D.ro && editNo != null ? doc.sessions.find(x => x.no === editNo) : null; return cu && !cu.closed && monOf(cu.date) < monOf(iso(new Date())) ? `<div class="warn">${cu.no}. denetim ${dmy(cu.date)} (${wkNo(cu.date)}. hafta) tarihinde başladı ve hâlâ açık. Eksikleri tamamlayıp “Kaydet ve Denetimi Tamamla”ya basın; açık denetim varken yeni haftanın denetimi başlatılamaz.</div>` : ""; })()}
  ${GUEST.on && D.gstatus === "returned" ? `<div class="warn">Yetkili kullanıcı taslağı düzeltme için geri gönderdi${D.gnote ? ": " + esc(D.gnote) : "."} Düzeltip tekrar kaydedin.</div>` : ""}
  ${GUEST.on && D.gstatus === "review" ? `<div class="okbar"><span>Taslağınız onay bekliyor. Yetkili kullanıcı onaylayınca denetime eklenir.</span></div>` : ""}
  ${GUEST.on && D.gstatus === "approved" ? `<div class="okbar"><span>Taslağınız onaylandı ve denetime eklendi.</span>${guestLock(st.year, D.month) ? "" : '<button class="sec" id="newGDraft">Yeni taslak başlat</button>'}</div>` : ""}
  ${gPanel(D.gdocs)}
  ${fxPanel(D.fxPend)}
  ${GUEST.on ? Paylas.shareBanner(D.shRows, GUEST.uid) + Paylas.guestCard(D.shRows, { open: D.shrOpen, openB: D.shrB, flt: D.shF, dd: D.shDd, month: D.shMo, year: st.year, years: D.shYrs?.fid === st.fid ? D.shYrs.list : [] }) : ""}
  ${gfxPanel()}
  <div class="cd" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px 10px;padding:14px;align-items:start">
    <div class="sf"><label class="hd" for="bolum">BÖLÜM</label><select id="bolum" class="inp">${setup.rows.map(r => `<option value="${r.id}" ${r.id === D.dept ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select></div>
    <div class="sf" style="position:relative"><label class="hd" for="ay">DÖNEM</label><button id="ay" class="inp fld pkb ${D.pk.open ? "on" : ""}" aria-haspopup="true" aria-expanded="${D.pk.open}"><span>${MONTHS[D.month - 1]} ${st.year}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B6E4F" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="${D.pk.open ? "transform:rotate(180deg)" : ""}"><path d="M6 9l6 6 6-6"/></svg></button>${pkHtml(st)}</div>
    <div class="sf"><label class="hd" for="tarih">DENETİM TARİHİ</label><button id="tarih" class="inp fld ${date ? "" : "ph"}" ${D.ro ? "disabled" : ""}><span>${date ? esc(fmtTarih(date)) : "Tarih seç"}</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B6E4F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg></button>${date ? `<div class="muted" style="font-size:12.5px">${wkNo(date)}. hafta</div>` : ""}</div>
    <div class="sf"><label class="hd" for="denetci">DENETÇİ</label><input id="denetci" class="inp" value="${esc(doc.auditor)}" placeholder="Ad Soyad" ${D.ro ? "disabled" : ""}></div></div>
  <div class="cd" style="padding:18px 20px;gap:14px"><div class="row sp"><b style="font:600 16px Sora,sans-serif">Bu Ayın Denetim Kayıtları</b>
    <span class="muted" style="font-size:12.5px">Aynı bulgu sonraki denetimlerde tekrarlanırsa sıklık otomatik artar: 1 gün → 1 · 2-3 farklı gün → 2 · 4 ve üzeri → 3 (aynı gün yapılan denetimler tek sayılır).${surecVar(D.ctx.st.year, D.month) ? " Bir denetimde aynı kategoride 3 veya daha fazla bulgu varsa sıklık 1 basamak artar (en fazla 3); her bulgu için ayrı not ekleyin." : ""}</span></div>
    <div class="row" style="gap:12px">${doc.sessions.filter(gVis).map(s => { const isEd = on && s.no === editNo, lastS = s.no === doc.sessions.length;
      const stt = isEd ? "açık · düzenleniyor" : s.closed ? "tamamlandı" : "kaydedildi";
      return `<div class="sess ${isEd ? "cur" : ""}">${isEd ? '<span class="sw" style="background:#0B6E4F;border-radius:50%;margin:0"></span>' : ic('<path d="M4 12l5 5L20 6"/>').replace("currentColor", "#0B6E4F")}<div><b>${s.no}. Denetim · ${wkNo(s.date)}. hafta</b><div class="muted" style="font-size:12.5px">${dmy(s.date)} · ${Object.keys(s.fails).length} uygunsuz · ${stt}</div></div>
      ${!D.ro && !GUEST.on ? `<div class="row" style="gap:6px;margin-left:auto;flex-wrap:nowrap">${!isEd ? `<button class="sm" data-reopen="${s.no}" style="white-space:nowrap" title="Bu denetimi tekrar açıp işaretlemeye devam et">Yeniden aç</button>` : ""}<button class="sm sec" data-delsess="${s.no}" style="white-space:nowrap" title="Bu denetimi sil">Sil</button></div>` : ""}</div>`; }).join("")}
      ${on && editNo == null ? `<div class="sess cur"><span class="sw" style="background:#0B6E4F;border-radius:50%;margin:0"></span><div><b>${GUEST.on ? "Taslak denetiminiz" : curNo + ". Denetim"}</b><div style="font-size:12.5px">${date ? dmy(date) : "—"} · ${c.curMarked ? c.curFails + " uygunsuz (taslak)" : "henüz işaretleme yok"} · ${GUEST.on ? ({ saved: "kaydedildi", review: "onay bekliyor", approved: "onaylandı", returned: "geri gönderildi" }[D.gstatus] || "kaydedilmedi") : "yeni, kaydedilmedi"}</div></div></div>` : ""}</div></div>
  <div class="helpbox" style="flex-direction:row;gap:14px;align-items:flex-start">${ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h0"/>', 22)}<div style="line-height:1.6">Her maddeyi <b>Uygun</b>, <b>Uygunsuz</b> veya <b>Y.D.</b> olarak işaretleyin; uygunsuzlukta açıklama yazın.</div></div>
  <fieldset class="fs" ${D.ro ? "disabled" : ""}><div class="two" style="align-items:flex-start">
    <div class="colw" style="flex:2 1 600px;gap:14px">${catHtml}</div>
    <div class="colw side" style="flex:1 1 320px;gap:16px">
      <div class="save" style="gap:16px"><h2 style="font-size:16px">${yogM ? "Bu Denetimin İSG Skoru" : "Anlık İSG Skoru · Bu Ay"}</h2>
        <div class="row" style="gap:14px;flex-wrap:nowrap"><div style="font:700 56px/1 Sora,sans-serif;letter-spacing:-2px;color:#fff">${f1(shown)}</div>
          <span class="pill" style="background:${B[2]};color:${B[1]}">${band}</span></div>
        <div style="position:relative;height:12px;border-radius:99px;background:rgba(255,255,255,.14)"><div style="height:12px;border-radius:99px;width:${shown.toFixed(1)}%;background:${B[0]}"></div>
          ${[num(p.esik.o), num(p.esik.i), num(p.esik.m)].map(x => `<div style="position:absolute;top:-3px;left:${x}%;width:2px;height:18px;background:rgba(255,255,255,.55)"></div>`).join("")}</div>
        <div class="row sp" style="font-size:11px;color:#8FA8A1;margin-top:-6px"><span>0</span><span>${p.esik.o}</span><span>${p.esik.i}</span><span>${p.esik.m}</span><span>100</span></div>
        <div class="col1" style="padding-top:6px;border-top:1px solid rgba(255,255,255,.12);gap:10px">
          ${[["Değerlendirme kapsamı (ağırlık)", `<b>${c.den} / ${c.total}</b>`], ["Bölüm katsayısı", `<b>×${F.toFixed(2).replace(".", ",")}</b>`], ["Ceza puanı", `<b style="color:#FFB4AB">−${f1(c.penalty)}</b>`], ...(monthAvg !== null ? [["Ay skoru (ortalama)", `<b>${f1(monthAvg)} · ${monthL.length} denetim</b>`]] : []), ["Ramak kala bonusu" + (yogM ? " (ay skoruna)" : ""), `<b style="color:#7FE3B8">+${bon}</b>`], ["Y.D. işaretli madde", `<b>${c.nCount} · %${c.ydPct}</b>`], ...(yogM && fxN ? [["Aksiyon onaylı açıklama", `<b style="color:#7FE3B8">${fxN}</b>`]] : [])].map(([a, b]) => `<div class="row sp"><span style="color:#9DB5AE">${a}</span>${b}</div>`).join("")}
          ${c.ydPct > 50 ? `<div style="padding:10px 12px;border-radius:10px;background:#FBE9C6;color:#5A3300;font-size:12.5px;line-height:1.5;font-weight:600">Değerlendirme kapsamı düşük: maddelerin yarısından fazlası Y.D. Skor yüksek görünebilir, raporda uyarı olarak yer alır.</div>` : ""}</div></div>
      <div class="cd" style="padding:20px;gap:12px"><div><b style="font:600 16px Sora,sans-serif">Ramak Kala Bildirim</b>
        <div class="muted" style="font-size:12.5px;line-height:1.5;margin-top:4px">Bildirimi yapan bölüm, bu ay getirdiği bildirim sayısına göre bonus alır. Ceza değil, bonus puandır.</div></div>
        <div class="rk1"><div><span class="hd">${esc(row.name).toLocaleUpperCase("tr")} · ${MONTHS[D.month - 1].toLocaleUpperCase("tr")}</span><div class="big2">${D.rkN} <span>bildirim</span></div></div><span class="kp k${doc.bonus}" style="min-width:150px"><span>${["Yok", "Ayda 1", "2 Haftada 1", "Haftalık"][doc.bonus]}</span><span>${c.bonusVals[doc.bonus] ? "+" + c.bonusVals[doc.bonus] : "0"} puan</span></span></div>
        <div class="muted" style="font-size:12.5px">${doc.bonusMan ? "Kademe elle seçildi, bildirim sayısından hesaplanan kademenin yerine geçer." : "Kademe, onaylı bildirim kayıtlarından otomatik hesaplanır."}</div>
        ${D.rkOpen && !GUEST.on && !D.ro ? `<div class="row" style="gap:8px">${["Yok", "Ayda 1", "2 Haftada 1", "Haftalık"].map((l, i) => `<button class="bn" data-bonus="${i}" style="${seg(doc.bonus === i, "#0B2230", "#FFF")}"><span>${l}</span><span style="font-size:12px;font-weight:600">+${c.bonusVals[i]} puan</span></button>`).join("")}</div>` : ""}
        <div class="row" style="gap:10px;flex-wrap:nowrap">${D.ro ? "" : `<button id="rkAdd" style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px"><b style="font-size:20px;line-height:1">+</b> Bildirim ekle</button>`}<button class="sec" id="rkSee" style="flex:1">Kayıtlar (${D.rk.filter(r => r.status !== "rejected" && (!GUEST.on || r.status === "approved" || r.guestUid === GUEST.uid)).length})</button></div>
        ${GUEST.on || D.ro ? "" : `<button class="lnk" id="rkMan">${doc.bonusMan ? "Otomatik hesaba dön" : D.rkOpen ? "Kademe seçimini gizle" : "Kademeyi elle değiştir"}</button>`}
        ${GUEST.on || D.ro ? "" : `<div style="border-top:1px solid var(--line);padding-top:10px;display:flex;flex-direction:column;gap:6px"><span class="hd">SORUMLU VE TERMİN</span><div style="display:grid;grid-template-columns:minmax(0,1fr) 138px;gap:8px;align-items:center"><button type="button" class="sec" id="rsBtn" style="height:40px;min-width:0;padding:0 10px;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;text-align:left">${esc((doc.resp || []).map(r => r.name).join(", ") || "Sorumlu seç")}</button><button type="button" class="inp fld" id="rdBtn" aria-label="Termin" style="padding:0 8px;font-size:13px"><span>${esc(fmtTarih(doc.due || defDue(doc)))}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B6E4F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg></button></div></div>`}</div>
      <div class="cd" style="padding:20px;gap:12px"><b style="font:600 16px Sora,sans-serif">${curNo}. Denetim · Kaydetmeden Önce</b>
        ${[["İşaretlenmeyen madde", c.unmarked], ["Açıklaması eksik uygunsuz madde", c.missing], ["Gerekçesi eksik Y.D. kategori", c.ydMissing], ["Tarih geçersiz (dönem dışı veya ileri tarih)", dateOk ? 0 : 1]].map(([t, n]) => `<div class="row sp"><span>${t}</span><span class="pill" style="min-width:34px;text-align:center;background:${n === 0 ? "#D9F1E6" : "#FADAD7"};color:${n === 0 ? "#0B6E4F" : "#B3261E"}">${n}</span></div>`).join("")}
        <button class="go2" id="saveSess" ${D.ro ? "disabled" : ""} style="${canPart ? "" : "opacity:.55"}">${GUEST.on ? "Taslağı Kaydet" : curNo + ". Denetimi Kaydet"}</button>
        ${GUEST.on ? `<button class="sec" id="askDone" style="height:44px;font-weight:700" ${canSave ? "" : "disabled"}>Tamamlanmasını İste</button>` : ""}
        ${GUEST.on ? "" : `<button class="sec" id="doneSess" style="height:44px;font-weight:700;${canSave ? "" : "opacity:.55"}" ${D.ro ? "disabled" : ""}>Kaydet ve Denetimi Tamamla</button>`}
        <div class="muted" style="font-size:12.5px;line-height:1.5"><b>Kaydet:</b> işaretlediğiniz kadarını saklar, denetim açık kalır; sonra kaldığınız yerden devam edebilirsiniz (tüm maddelerin işaretlenmesi gerekmez). <b>Tamamla:</b> tüm maddeler işaretliyken denetimi kapatır. Yeni denetim, yeni hafta başlayınca “Denetimi Başlat” ile açılır.</div></div>
    </div></div></fieldset>`;
  if (!on) {
    v.querySelector("fieldset.fs")?.remove(); v.querySelector(".helpbox")?.remove();
    const last = doc.sessions[doc.sessions.length - 1], thisMon = monOf(iso(new Date())), locked = !!last && monOf(last.date) === thisMon;
    v.insertAdjacentHTML("beforeend", `<div class="cd" style="gap:12px;padding:20px"><b style="font:600 16px Sora,sans-serif">${locked ? "Bu hafta denetimi tamamlandı" : "Yeni denetim başlatılabilir"}</b>
      <div class="muted" style="line-height:1.55">${last ? `${last.no}. denetim ${dmy(last.date)} (${wkNo(last.date)}. hafta) tarihinde tamamlandı. ` : ""}Bu bölümün aylık İSG skoru <b>${f1(shown)}</b> (${band})${yogM ? ", denetim skorlarının ortalaması" : ""}. ${locked ? "Saha turunda yeni bir eksiklik görürseniz “Yeniden aç” ile bu haftanın denetimine ekleyin. Yeni denetim, yeni hafta başlayınca açılır." : "Yeni hafta için denetimi başlatabilirsiniz. Geçen haftanın denetimine ekleme yapmak isterseniz “Yeniden aç”ı kullanın."}</div>
      ${D.ro ? "" : `<div><button id="newSess" ${locked ? "disabled" : ""}>${doc.sessions.length + 1}. Denetimi Başlat</button></div>${locked ? `<div class="muted" style="font-size:12.5px;margin-top:-4px">${dmk(addDays(thisMon, 7))} Pzt günü başlatılabilir</div>` : ""}`}</div>`);
  }
  paintWk(); bind(v, c);
}

// Dönem seçici: yıl okları + 3x4 ay tablosu; aylarda bu bölümün denetim sayısı
function pkHtml(st) {
  if (!D.pk.open) return "";
  const ys = (st.years || []).map(Number).sort((a, b) => a - b), y = D.pk.view, i = ys.indexOf(y), cn = D.pk.cnt[y + "/" + D.dept] || {}, now = new Date();
  return `<div class="pkp" role="dialog" aria-label="Dönem seç"><div class="pky"><button class="pkyb" data-pky="-1" aria-label="Önceki yıl" ${i <= 0 ? "disabled" : ""}>‹</button><b>${y}</b><button class="pkyb" data-pky="1" aria-label="Sonraki yıl" ${i < 0 || i >= ys.length - 1 ? "disabled" : ""}>›</button></div>
    <div class="pkg">${MONTHS.map((m, k) => { const n = cn[k + 1] || 0, sel = y === +st.year && k + 1 === D.month, cur = y === now.getFullYear() && k === now.getMonth(); return `<button class="pkm ${n ? "" : "dim"} ${cur ? "cur" : ""} ${sel ? "sel" : ""}" data-pkm="${k + 1}" ${D.shMonths && !(y === +st.year && D.shMonths.includes(k + 1)) ? "disabled" : ""} aria-label="${m} ${y}${n ? ", " + n + " denetim" : ""}">${m.slice(0, 3)}<small>${n || "&nbsp;"}</small></button>`; }).join("")}</div></div>`;
}
async function pkLoad(y) {
  const { st } = D.ctx, k = y + "/" + D.dept;
  if (D.pk.cnt[k]) return;
  const r = {};
  try { (await S.listMonthDocs(st.fid, y, COLL)).forEach(d => { const m = d.id.match(/^(\d\d)_(.+)$/); if (m && m[2] === D.dept) r[+m[1]] = (d.sessions || []).length; }); } catch {}
  D.pk.cnt[k] = r;
}
function pkGo(y, m) {
  const { st } = D.ctx;
  D.pk.open = false; D.month = m; D.key = "";
  if (String(y) === String(st.year)) return render(D.v, D.ctx);
  const sy = document.getElementById("selYear");
  if (sy) { sy.value = String(y); sy.dispatchEvent(new Event("change")); }
}

function bind(v, c) {
  const { st } = D.ctx, doc = D.doc, d = doc.draft;
  fxGorevSync(); D.gsig = gsigOf(); fxGorevAuto();
  if (!D.gsub) D.gsub = Gorev.onChange(() => {
    if (!D.v?.isConnected || !D.doc) return;
    fxGorevSync(); fxGorevAuto();
    const sig = gsigOf();
    if (sig !== D.gsig && D.saved !== false) { D.gsig = sig; draw(); }
  });
  const again = () => { draw(); persist(); };
  const zEd = D.doc.draft?.edit != null ? D.doc.sessions.find(x => x.no === D.doc.draft.edit) : null, zch = !GUEST.on && !D.ro && D.doc.draft?.on !== false ? zChains(zEd?.no ?? null) : null;
  const zPre = (id, notes) => { const o = {}; if (!zEd?.zk) return o; let fi = 0; notes.forEach((t, k) => { if (!String(t || "").trim()) return; const x = zEd.zk[id + "|" + fi++]; if (x) o[id + "|" + k] = x; }); return o; };
  const on = (sel, fn) => v.querySelectorAll(sel).forEach(el => el.onclick = () => fn(el));
  $("bolum").onchange = e => { D.dept = e.target.value; render(D.v, D.ctx); };
  $("ay").onclick = async e => {
    e.stopPropagation(); D.pk.open = !D.pk.open; D.pk.view = +st.year; draw();
    if (D.pk.open) { await pkLoad(D.pk.view); if (D.pk.open) draw(); }
  };
  v.querySelectorAll("[data-pky]").forEach(b => b.onclick = async e => { e.stopPropagation(); D.pk.view += +b.dataset.pky; draw(); await pkLoad(D.pk.view); if (D.pk.open) draw(); });
  v.querySelectorAll("[data-pkm]").forEach(b => b.onclick = e => { e.stopPropagation(); pkGo(D.pk.view, +b.dataset.pkm); });
  v.querySelector(".pkp")?.addEventListener("click", e => e.stopPropagation());
  if (D.pk.open && !D.pk.bound) { D.pk.bound = true; document.addEventListener("click", () => { if (D.pk.open) { D.pk.open = false; if (D.v?.isConnected) draw(); } }); }
  $("tarih").onclick = async () => { const r = await pickDate({ title: "Denetim tarihi", max: iso(new Date()), a: d.date || "", view: `${st.year}-${String(D.month).padStart(2, "0")}-01` }); if (r && await holOK(r.a)) { d.date = r.a; again(); } };
  $("denetci").onchange = e => { doc.auditor = e.target.value.trim(); persist(); };
  on("[data-tog]", el => { const k = el.dataset.tog, w = !D.open[k]; D.open = {}; D.open[k] = w; draw(); if (w) setTimeout(() => document.querySelector(`[data-tog="${k}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 30); });
  on("[data-mk]", el => {
    const [id, k] = el.dataset.mk.split("|"); d.marks[id] = k;
    if (k === "x" && !(d.notes[id] && d.notes[id].length)) d.notes[id] = [""];
    again();
  });
  on("[data-zo]", el => { const k = el.dataset.zo; D.zOpen = D.zOpen === k ? "" : k; draw(); });
  on("[data-zs]", el => { const t = zToggle(el, "zs"); (d.zsel ||= {})[t.key] = t.val; if (t.close) D.zOpen = ""; again(); });
  on("[data-zuo]", el => { const k = "u|" + el.dataset.zuo; D.zOpen = D.zOpen === k ? "" : k; draw(); });
  v.querySelectorAll("[data-zuc]").forEach(cb => cb.onchange = () => { const [id, zk] = cb.dataset.zuc.split("|"), u = ((d.zu ||= {})[id] ||= {}); u.off = (u.off || []).filter(x => x !== zk); if (!cb.checked) u.off.push(zk); again(); });
  on("[data-zuok]", el => { ((d.zu ||= {})[el.dataset.zuok] ||= {}).ok = true; D.zOpen = ""; again(); });
  on("[data-zuno]", el => { ((d.zu ||= {})[el.dataset.zuno] ||= {}).ok = false; D.zOpen = ""; again(); });
  v.querySelectorAll("input[data-zuph]").forEach(inp => inp.onchange = async () => {
    const id = inp.dataset.zuph, files = [...inp.files]; inp.value = ""; if (!files.length) return; let n = 0;
    for (const f of files) { try { const { full, thumb } = await compressImage(f), pid = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await S.savePhoto(st.fid, st.year, pid, full); (((d.zu ||= {})[id] ||= {}).ph ||= []).push({ id: pid, t: thumb }); n++; } catch (e) { toast("Fotoğraf eklenemedi: " + (e.message || e)); } }
    if (n) toast(n + " fotoğraf eklendi"); again();
  });
  on("[data-zupr]", el => { const [id, pid] = el.dataset.zupr.split("|"), u = d.zu?.[id]; if (u) u.ph = (u.ph || []).filter(p => p.id !== pid); S.deletePhoto(st.fid, st.year, pid).catch(() => {}); again(); });
  on("[data-nadd]", el => { (d.notes[el.dataset.nadd] ||= [""]).push(""); again(); });
  on("[data-nrm]", el => {
    const [id, k] = el.dataset.nrm.split("|"), kk = +k; const a = d.notes[id] || [""]; d.photos ||= {};
    (d.photos[id + "|" + kk] || []).forEach(p => S.deletePhoto(st.fid, st.year, p.id).catch(() => {}));
    if (a.length <= 1) { d.notes[id] = [""]; delete d.photos[id + "|0"]; }
    else { a.splice(kk, 1); for (let j = kk; j <= a.length; j++) { const nx = d.photos[id + "|" + (j + 1)]; if (nx) d.photos[id + "|" + j] = nx; else delete d.photos[id + "|" + j]; } }
    if (d.zsel) { const z = d.zsel, n = Object.keys(z).filter(x => x.startsWith(id + "|")).map(x => +x.split("|")[1]); delete z[id + "|" + kk]; n.filter(j => j > kk).sort((a, b) => a - b).forEach(j => { z[id + "|" + (j - 1)] = z[id + "|" + j]; delete z[id + "|" + j]; }); }
    again();
  });
  v.querySelectorAll("input[data-ph]").forEach(inp => inp.onchange = async () => {
    const key = inp.dataset.ph, files = [...inp.files]; inp.value = ""; if (!files.length) return;
    D.msg = "Fotoğraf hazırlanıyor…"; setSv(); let n = 0;
    for (const f of files) {
      try {
        const { full, thumb } = await compressImage(f), pid = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await S.savePhoto(st.fid, st.year, pid, full); ((d.photos ||= {})[key] ||= []).push({ id: pid, t: thumb }); n++;
      } catch (e) { toast("Fotoğraf eklenemedi: " + (e.message || e)); }
    }
    D.msg = ""; if (n) toast(n + " fotoğraf eklendi"); again();
  });
  on("[data-prm]", el => {
    const [id, k, pid] = el.dataset.prm.split("|"), key = id + "|" + k;
    d.photos[key] = (d.photos[key] || []).filter(p => p.id !== pid); S.deletePhoto(st.fid, st.year, pid).catch(() => {}); again();
  });
  setPhotoLoader(id => S.getPhoto(st.fid, st.year, id)); on("[data-pv]", el => openPhotos(el, id => S.getPhoto(st.fid, st.year, id)));
  on("[data-note]", async el => {
    const [id, k] = el.dataset.note.split("|"), m = /^c(\d+)i(\d+)$/.exec(id), cat = CATS[+m[1]];
    const r = await noteEditor({ title: `Açıklama ${cat.name} · ${+k + 1}.`, item: cat.items[+m[2]], text: (d.notes[id] || [""])[+k] || "", example: cat.ex });
    if (r === null) return; (d.notes[id] ||= [""])[+k] = r; again();
  });
  v.querySelectorAll("[data-yd]").forEach(el => el.onchange = () => { (d.ydNotes ||= {})[el.dataset.yd] = el.value; again(); });
  on("[data-freq]", el => { const [ci, k] = el.dataset.freq.split("|"); doc.freq[ci] = +k; again(); });
  on("[data-freqreset]", el => { delete doc.freq[el.dataset.freqreset]; again(); });
  on("[data-bonus]", el => { doc.bonus = +el.dataset.bonus; doc.bonusMan = true; again(); });
  const rkb = document.getElementById("rkMan");
  if (rkb) rkb.onclick = () => { if (doc.bonusMan) { doc.bonusMan = false; doc.bonus = D.rkAuto; D.rkOpen = false; again(); } else { D.rkOpen = !D.rkOpen; draw(); } };
  const rka = document.getElementById("rkAdd");
  if (rka) rka.onclick = async () => {
    const r = await Ramak.openForm({ st, setup: D.setup, month: D.month, dept: D.dept, recs: D.rk }); if (!r) return;
    if (!GUEST.on) await Ramak.syncBonus(st.fid, st.year, D.month, D.setup, await Ramak.load(st.fid, st.year, D.month).catch(() => D.rk));
    await rkLoad(); toast(GUEST.on ? "Kayıt gönderildi, yetkili onayından sonra puana sayılır." : "Kayıt eklendi."); if (GUEST.on) draw(); else again();
  };
  const rks = document.getElementById("rkSee");
  if (rks) rks.onclick = () => { Ramak.focus(D.month); location.hash = "#ramak"; };
  on("[data-reopen]", async el => {
    const no = +el.dataset.reopen, t = doc.sessions.find(x => x.no === no); if (!t) return;
    if (doc.draft.on !== false && Object.keys(doc.draft.marks || {}).length && doc.draft.edit !== no) {
      const { confirmBox } = await import("./ui.js?v=20261110k");
      if (!(await confirmBox(`${no}. denetim açılsın mı?`, "Şu an açık olan denetimde kaydedilmemiş değişiklikler varsa kaybolur. Önce “Kaydet”e basmanız önerilir.", "Yine de aç"))) return;
    }
    if (t.no === doc.sessions.length) t.closed = false;
    doc.draft = { ...draftFromSession(t), on: true, edit: t.no };
    settle(doc, st.year, D.month); persist(true); draw(); toast(`${t.no}. denetim yeniden açıldı; düzenleyip kaydedin.`);
  });
  const nw = document.getElementById("newSess");
  if (nw) nw.onclick = () => { doc.draft = emptyDraft(defaultDate(st.year, D.month), true); delete doc.due; persist(true); draw(); };
  const choose = (title, text, opts) => new Promise(res => {
    const m = document.createElement("div"); m.className = "mod";
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:14px"><h2>${esc(title)}</h2><p class="muted" style="line-height:1.55">${esc(text)}</p><div class="col1" style="gap:8px">${opts.map(([k, t, cl]) => `<button class="${cl || ""}" data-c="${k}">${esc(t)}</button>`).join("")}<button class="sec" data-c="">Vazgeç</button></div></div>`;
    document.body.appendChild(m);
    m.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { m.remove(); res(b.dataset.c || null); });
    m.addEventListener("mousedown", e => { if (e.target === m) { m.remove(); res(null); } });
  });
  const gAll = async () => (await S.listMonthDocs(st.fid, st.year, "isgg").catch(() => [])).filter(g => g.id.startsWith(`${pad(D.month)}_${D.dept}_`));
  on("[data-delsess]", async el => {
    const { confirmBox } = await import("./ui.js?v=20261110k");
    const no = +el.dataset.delsess, ix = doc.sessions.findIndex(x => x.no === no); if (ix < 0) return;
    const gone = doc.sessions[ix], later = ix < doc.sessions.length - 1, all = await gAll(), gAp = all.filter(g => g.status === "approved" && g.no === gone.no);
    let mode = "all";
    if (gAp.length) {
      mode = await choose(`${no}. denetim silinsin mi?`, `Bu denetim misafir taslağından geldi (${gAp[0].guestName}). “Geri gönder” misafirin taslağını düzeltip yeniden göndermesine izin verir; “Tamamen sil” taslağı ve fotoğrafları kalıcı siler, hiç yapılmamış gibi olur.${later ? " Sonraki denetimlerin numarası bir azalır." : ""}`,
        [["ret", "Sil ve misafire geri gönder", "sec"], ["all", "Tamamen sil", "danger"]]);
      if (!mode) return;
    } else if (!(await confirmBox(`${no}. denetim silinsin mi?`, `Kayıtlı denetim ve fotoğrafları silinir; skor ve sıklıklar yeniden hesaplanır.${later ? " Sonraki denetimlerin numarası bir azalır." : ""}`, "Evet, sil", true))) return;
    doc.sessions.splice(ix, 1); doc.sessions.forEach((x, i) => { x.no = i + 1; });
    const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)), save = (g, extra) => S.saveMonthDoc(st.fid, st.year, "isgg", g.id, clean({ guestUid: g.guestUid, guestName: g.guestName, dept: g.dept, month: g.month, status: g.status, draft: g.draft, at: g.at || Date.now(), ...(g.note ? { note: g.note } : {}), ...(g.no != null ? { no: g.no } : {}), ...extra }));
    for (const g of all) if (g.status === "approved" && g.no > gone.no) await save(g, { no: g.no - 1 });
    for (const g of gAp) {
      if (mode === "ret") await save(g, { status: "returned", at: Date.now(), note: "Onaylanan denetim yetkili kullanıcı tarafından silindi; gerekirse düzeltip yeniden gönderebilirsiniz.", no: undefined });
      else { Object.values(g.draft?.photos || {}).flat().forEach(p => S.deletePhoto(st.fid, st.year, p.id).catch(() => {})); await S.deleteMonthDoc(st.fid, st.year, "isgg", g.id).catch(() => {}); }
    }
    if (!gAp.length || mode === "all") Object.values(gone.photos || {}).flat().forEach(p => S.deletePhoto(st.fid, st.year, p.id).catch(() => {}));
    if (doc.draft.edit === gone.no) doc.draft = emptyDraft(defaultDate(st.year, D.month), false);
    else if (doc.draft.edit != null && doc.draft.edit > gone.no) doc.draft.edit -= 1;
    if (!doc.sessions.length) doc.draft = emptyDraft(defaultDate(st.year, D.month), true);
    settle(doc, st.year, D.month); await persist(true); draw();
    toast(`${no}. denetim silindi.`);
  });
  // Sahip: misafir taslağını tamamen sil (denetime ve rapora hiç girmez)
  const delG = async g => {
    const { confirmBox } = await import("./ui.js?v=20261110k");
    if (!(await confirmBox("Misafir taslağı silinsin mi?", `${g.guestName} taslağı ve fotoğrafları kalıcı olarak silinir; denetime ve rapora hiç girmez. Misafir isterse yeniden yazabilir.`, "Evet, tamamen sil", true))) return false;
    Object.values(g.draft?.photos || {}).flat().forEach(p => S.deletePhoto(st.fid, st.year, p.id).catch(() => {}));
    await S.deleteMonthDoc(st.fid, st.year, "isgg", g.id); await Guest.inboxDelete(`${g.guestUid}_${st.fid}_${st.year}_${+g.month}_${g.dept}`);
    toast("Misafir taslağı silindi."); return true;
  };
  on("[data-gdel]", async el => { const g = D.gdocs.find(x => x.id === el.dataset.gdel); if (g && await delG(g)) { D.key = ""; render(D.v, D.ctx); } });
  // İzinli/tatil günü seçilirse uyar; kullanıcı kabul ederse o tarih için tekrar sorma
  const holOK = async date => {
    if (!date || GUEST.on || D.okHol?.has(date)) return true;
    const h = tatilMap(await tatilYukle(st.fid, st.year).catch(() => null)).get(date); if (!h || h.yarim) return true;
    const { confirmBox } = await import("./ui.js?v=20261110k");
    if (!(await confirmBox("İzin / tatil günü", `${fmtTarih(date)} tarihi "${h.ad}" olarak izinli/tatil işaretli. Yine de bu tarihle denetim yapılsın mı?`, "Evet, kabul et"))) return false;
    (D.okHol ||= new Set()).add(date); return true;
  };
  const dOk = d.date && +d.date.slice(0, 4) === +st.year && +d.date.slice(5, 7) === D.month && d.date <= iso(new Date());
  const doSave = async close => {
    if (D.ro) return;
    const why = !dOk ? "Denetim tarihi geçersiz (dönem dışı veya ileri tarih)." : !c.curMarked ? "Önce en az bir madde işaretleyin." : c.missing ? `${c.missing} uygunsuz maddenin açıklaması eksik.` : c.ydMissing ? `${c.ydMissing} Y.D. kategorinin gerekçesi eksik.` : close && !c.canSave ? `Tamamlamak için ${c.unmarked} madde daha işaretlenmeli.` : "";
    if (why) { toast(why); return; }
    // Bulgu zinciri: önceki haftalardaki açık bulgularla eşleşme seçimi
    if (!zch) { toast(D.zh?.fail ? "Önceki bulgular yüklenemedi; bağlantıyı kontrol edip tekrar deneyin." : "Önceki bulgular yükleniyor, birkaç saniye sonra tekrar deneyin."); if (D.zh?.fail) { D.zh = null; zEnsure(); } return; }
    const zAll = {}; CATS.forEach((cat, ci) => cat.items.forEach((_, ii) => { const id = `c${ci}i${ii}`; if (d.marks[id] === "x") zAll[id] = zItem(zch, id, d.notes[id] || [""], d.zsel || {}, d.date, zPre(id, d.notes[id] || [""])); }));
    const zMiss = Object.values(zAll).flat().filter(z => z && z.eff === "").length;
    if (zMiss) { toast(`${zMiss} bulgunun önceki bulgularla eşleşme seçimi eksik.`); const f = Object.values(zAll).flat().find(z => z && z.eff === ""); if (f) { D.zOpen = f.key; draw(); } return; }
    const zU = Object.entries(d.zu || {}).filter(([id, u]) => u.ok === true && d.marks[id] === "u").flatMap(([id, u]) => zOpenFor(zch, id, d.date).filter(c => !(u.off || []).includes(c.zk)).map(c => ({ c, ph: u.ph || [] })));
    if (!(await holOK(d.date))) return;
    const btn = document.getElementById(close ? "doneSess" : "saveSess"); if (btn) { btn.disabled = true; btn.textContent = "Kaydediliyor…"; }
    const rec = makeRec(c, d);
    Z.assignIds(rec, d.edit != null ? doc.sessions.find(x => x.no === d.edit) : null, k => `${st.year}_${D.month}_${d.edit}_${k}`);
    zApplyRec(rec, zAll); const zM = rec.__zm || []; delete rec.__zm;
    let no;
    if (d.edit != null) { const ix = doc.sessions.findIndex(x => x.no === d.edit); no = d.edit; doc.sessions[ix] = { ...doc.sessions[ix], ...rec }; }
    else { no = doc.sessions.length + 1; doc.sessions.push({ no, ...rec, closed: false }); d.edit = no; }
    { const se = doc.sessions.find(x => x.no === no); se.due = doc.due || se.due || defDue(doc); se.resp = (doc.resp || []).map(r => ({ ...r })); }
    if (zM.length) await zRelink(zM);
    if (zU.length) {
      const by = doc.auditor || st.profile?.name || "Yetkili";
      for (const { c: zc, ph } of zU) await zCloseApply(Z.closeTargets(zc, d.date), { k: "uygun", d: d.date, no, by, ph, tx: `${dmy(d.date)} denetiminde uygun bulundu` });
      Object.keys(d.zu || {}).forEach(id => { if (d.zu[id].ok === true) delete d.zu[id]; });
      if (zU.some(x => x.c.links.some(l => !(+l.y === +st.year && +l.m === +D.month)))) D.zh = null;
    }
    if (close) { doc.sessions.find(x => x.no === no).closed = true; doc.draft = emptyDraft(defaultDate(st.year, D.month), false); delete doc.due; }
    const okSave = await persist(true); draw();
    if (okSave === false) { toast("Kaydedilemedi, bağlantıyı kontrol edip tekrar deneyin."); return; }
    toast(close ? `${no}. denetim tamamlandı. ${monOf(d.date) === monOf(iso(new Date())) ? "Yeni denetim, yeni hafta başlayınca açılır." : "Yeni denetim için “Denetimi Başlat”a basın."}` : `${no}. denetim kaydedildi; açık kaldı, kaldığınız yerden devam edebilirsiniz.`);
  };
  const guestSave = async review => {
    if (D.ro || !dOk || c.missing || c.ydMissing || !c.curMarked || (review && !c.canSave)) return;
    D.gstatus = review ? "review" : "saved"; D.gnote = "";
    await persist(true); if (review) D.ro = true; draw();
    const rowN = D.setup.rows.find(r => r.id === D.dept)?.name || "";
    Guest.reportAudit({ fid: st.fid, year: st.year, month: D.month, dept: D.dept, deptName: rowN, factoryName: st.factories.find(f => f.id === st.fid)?.name || "", no: doc.sessions.length + 1 }, review ? "review" : "saved");
    toast(review ? "Taslağınız yetkili kullanıcıya onay için gönderildi." : "Taslağınız kaydedildi. Hazır olunca “Tamamlanmasını İste”ye basın.");
  };
  const sv = document.getElementById("saveSess"); if (sv) sv.onclick = () => GUEST.on ? guestSave(false) : doSave(false);
  const ad = document.getElementById("askDone"); if (ad) ad.onclick = () => guestSave(true);
  const ng = document.getElementById("newGDraft");
  if (ng) ng.onclick = () => { D.gstatus = "draft"; D.gnote = ""; D.doc.draft = emptyDraft(defaultDate(st.year, D.month), true); D.ro = guestLock(st.year, D.month); persist(true); draw(); };
  // Sahip: misafir taslağını onayla / geri gönder
  const gDone = async (g, status, note, no) => {
    const [mm] = g.id.split("_");
    await S.saveMonthDoc(st.fid, st.year, "isgg", g.id, { guestUid: g.guestUid, guestName: g.guestName, dept: g.dept, month: g.month, status, draft: g.draft, at: Date.now(), ...(note ? { note } : {}), ...(status === "approved" ? { no: no ?? doc.sessions.length } : {}) });
    await Guest.inboxDelete(`${g.guestUid}_${st.fid}_${st.year}_${+g.month}_${g.dept}`);
  };
  // ---- Detaylı kontrol penceresi (ekranın ~%85'i) ----
  // Misafir taslağının tarihi hangi haftaya düşüyorsa, o haftanın kaydı varsa taslak ona eklenir (tek haftalık kayıt)
  const wkTarget = date => { if (!date) return null; const ss = doc.sessions.filter(x => x.date && monOf(x.date) === monOf(date)); return ss.length ? ss[ss.length - 1] : null; };
  const approveG = async (g, w, choice = {}, zc = {}) => {
    const F2 = katsayi(D.setup.rows.find(r => r.id === D.dept), D.month), p2 = D.setup.params || DEFAULT_PARAMS, tgt = wkTarget(w.date);
    // Zincir seçimlerini kayıttaki bulgu sırasına işler (misafirin açıklama metniyle eşleşerek)
    const zMap = (fails, set) => { for (const [id, list] of Object.entries(zc.zs || {})) { const used = new Set(); (list || []).forEach((z, k) => { if (!z) return; const t = String(w.notes?.[id]?.[k] || "").trim(), j = (fails[id] || []).findIndex((x, jj) => !used.has(jj) && String(x || "").trim() === t); if (j < 0) return; used.add(j); set(id, j, z.eff); }); } };
    const zMs = [], zObj = (id, e) => Object.values(zc.zs || {}).flat().find(z => z && z.eff === e && z.key.startsWith(id + "|")) || { eff: e, sg: { open: [] } };
    const zSess = se => zMap(se.fails || {}, (id, j, e) => { const kk = id + "|" + j; se.zk ||= {}; if (/^(yeni|farkli)$/.test(e)) delete se.zk[kk]; else if (e.startsWith("tekrar:")) { delete se.zk[kk]; (se.rk ||= {})[kk] = e.slice(7); } else if (e) { const r = zResolve(zObj(id, e)); if (r) { se.zk[kk] = r.primary; if (r.merge.length) zMs.push(r); } } });
    const zClose = async no => { const chs = (zc.ch || []).filter(c => (zc.gu || []).includes(c.zk)); for (const c of chs) await zCloseApply(Z.closeTargets(c, w.date), { k: "misafir", d: w.date, no, by: g.guestName, tx: `${dmy(w.date)} misafir denetiminde (${g.guestName}) uygun bulundu` }); if (chs.some(c => c.links.some(l => !(+l.y === +D.ctx.st.year && +l.m === +D.month)))) D.zh = null; };
    if (tgt) {
      if (!Object.keys(w.marks || {}).length) { toast("Taslakta işaretlenmiş madde yok."); return false; }
      if (doc.draft.on !== false && doc.draft.edit === tgt.no) { mergeGuest(doc.draft, w, choice); zMap(Object.fromEntries(Object.entries(doc.draft.notes || {}).map(([id, a]) => [id, a])), (id, k, e) => { (doc.draft.zsel ||= {})[id + "|" + k] = e; }); }
      else {
        const dr = draftFromSession(tgt); mergeGuest(dr, w, choice);
        const cc = calcIsg({ cats: CATS, sessions: doc.sessions.filter(x => x.no !== tgt.no), draft: dr, freqOv: doc.freq, bonusIdx: doc.bonus, F: F2, p: p2, yog: surecVar(D.ctx.st.year, D.month) });
        const ns = { ...tgt, ...Z.assignIds(makeRec(cc, dr), tgt, k => `${D.ctx.st.year}_${D.month}_${tgt.no}_${k}`) }; zSess(ns);
        doc.sessions[doc.sessions.findIndex(x => x.no === tgt.no)] = ns;
      }
      await zRelink(zMs); await zClose(tgt.no);
      await persist(true); await gDone({ ...g, draft: w }, "approved", "", tgt.no);
      toast(`${g.guestName} taslağı ${tgt.no}. denetime (${wkNo(tgt.date)}. hafta) eklendi.`); return true;
    }
    const dr = { ...emptyDraft(w.date, true), ...w };
    const cc = calcIsg({ cats: CATS, sessions: doc.sessions, draft: dr, freqOv: doc.freq, bonusIdx: doc.bonus, F: F2, p: p2, yog: surecVar(D.ctx.st.year, D.month) });
    if (!cc.curMarked) { toast("Taslakta işaretlenmiş madde yok."); return false; }
    const ns = { no: doc.sessions.length + 1, ...Z.assignIds(makeRec(cc, dr)), closed: true }; zSess(ns);
    doc.sessions.push(ns); await zRelink(zMs); await zClose(ns.no);
    await persist(true); await gDone({ ...g, draft: w }, "approved");
    toast(`${g.guestName} taslağı onaylandı ve ${doc.sessions.length}. denetim olarak eklendi.`); return true;
  };
  const openReview = async g => {
    if (!zChains()) { const { st } = D.ctx; try { D.zh = { key: D.key, docs: await Z.loadHistory(S.getMonthDoc, st.fid, st.year, D.month, D.dept, 12) }; } catch { } }
    const w = JSON.parse(JSON.stringify(g.draft || {})); w.marks ||= {}; w.notes ||= {}; w.photos ||= {};
    const m = document.createElement("div"); m.className = "mod"; m.style.padding = "2.5vh 2vw";
    const tgt = wkTarget(w.date), editing = !!tgt && doc.draft.on !== false && doc.draft.edit === tgt.no, mc = {};
    // Bulgu zinciri: misafir eşleştirme yapmaz; kararlar burada yetkiliye sorulur
    const zch2 = zChains(tgt?.no ?? null), gz = {}, gu = []; let gzOpen = "";
    const gzFor = (id, ns) => zch2 && (!exTexts(id).length || mc[id] === "sep") ? zItem(zch2, id, ns, gz, w.date, {}) : null;
    const gzAll = () => { const o = {}; Object.keys(w.marks).filter(id => w.marks[id] === "x").forEach(id => { const r = gzFor(id, w.notes[id]?.length ? w.notes[id] : [""]); if (r) o[id] = r; }); return o; };
    const gzMiss = () => Object.values(gzAll()).flat().filter(z => z && z.eff === "").length;
    const guList = () => Object.keys(w.marks).filter(id => w.marks[id] === "u").map(id => [id, zOpenFor(zch2, id, w.date)]).filter(([, c]) => c.length);
    const exTexts = id => !tgt ? [] : editing ? (doc.draft.marks[id] === "x" ? (doc.draft.notes[id] || []).filter(t => String(t || "").trim()) : []) : (tgt.fails?.[id] || []);
    const nUnf = () => Object.values(w.marks).filter(x => x === "x").length, nPh = () => Object.values(w.photos).reduce((a, l) => a + l.length, 0);
    const body = () => {
      let h = !zch2 ? '<div class="muted" style="font-size:12.5px">Önceki bulgular yüklenemedi; eşleşme önerisi gösterilemiyor.</div>' : "";
      const gl = guList(); if (gl.length) h += `<div style="display:flex;flex-direction:column;gap:8px">${gl.map(([id, chs]) => { const m2 = /^c(\d+)i(\d+)$/.exec(id); return `<div style="display:flex;flex-direction:column;gap:4px"><span class="muted" style="font-size:12.5px">${esc(CATS[+m2[1]].name)} · ${esc(CATS[+m2[1]].items[+m2[2]])}</span>${zUcard(id, chs, { off: chs.filter(c => !gu.includes(c.zk)).map(c => c.zk) }, gzOpen === "u|" + id, "gu", true)}</div>`; }).join("")}</div>`;
      CATS.forEach((cat, ci) => {
        const its = cat.items.map((txt, ii) => ({ txt, id: `c${ci}i${ii}` })).filter(x => w.marks[x.id] === "x"); if (!its.length) return;
        const wt = W[cat.w];
        h += `<div style="border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px"><div class="row" style="gap:8px"><b style="font-size:15px">${esc(cat.name)}</b><span class="pill" style="background:${wt[1]};color:${wt[2]}">${wt[0]}</span></div>
          ${its.map(x => { const ns = w.notes[x.id]?.length ? w.notes[x.id] : [""], zs = gzFor(x.id, ns); return `<div style="display:flex;flex-direction:column;gap:8px;padding-top:10px;border-top:1px dashed var(--line)"><span class="muted" style="font-size:13px">${esc(x.txt)}</span>
            ${(() => { const ex = exTexts(x.id); return ex.length ? `<div style="border:1px solid var(--hbd);border-radius:12px;padding:10px 12px;background:var(--hbg);display:flex;flex-direction:column;gap:8px"><div style="font-size:12.5px;line-height:1.45"><span class="pill" style="background:#D9F1E6;color:#0B6E4F">Aynı madde</span> ${tgt.no}. denetimde bu haftaki kayıt: <b>${esc(ex[0])}</b>${ex.length > 1 ? ` <span class="muted">(+${ex.length - 1})</span>` : ""}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${[["merge", "Birleştir"], ["sep", "Ayrı bulgu"]].map(([v, l]) => `<button type="button" data-mc="${x.id}|${v}" class="${(mc[x.id] || "merge") === v ? "" : "sec"}" style="min-height:38px;height:auto;font-size:13px">${l}</button>`).join("")}</div><div class="muted" style="font-size:12px;line-height:1.4">${(mc[x.id] || "merge") === "merge" ? "Aynı bulgu: açıklama tekrar yazılmaz, misafirin fotoğrafları mevcut bulguya eklenir." + (() => { const zk = tgt?.zk?.[x.id + "|0"], c = zk && (zch2 || []).find(y => y.zk === zk); return c ? ` Bu haftaki bulgunuz zaten önceki haftaların devamı (${[...new Set(c.links.map(l => dm(l.date)))].join(" · ")}); fotoğraf zincire de işlenir.` : ""; })() : "Farklı bir bulgu: açıklaması aynı maddeye ayrıca eklenir."}</div></div>` : ""; })()}
            ${ns.map((t, k) => `<div style="display:flex;flex-direction:column;gap:6px"><textarea class="inp" rows="2" data-gn="${x.id}|${k}" style="min-height:64px;height:auto;padding:10px;resize:vertical" placeholder="(açıklama yok)">${esc(t)}</textarea>
              <div style="display:flex;flex-wrap:wrap;gap:10px">${(w.photos[x.id + "|" + k] || []).map(p => `<span class="pth" style="width:120px;height:120px"><img src="${p.t}" data-gp="${p.id}" alt="Fotoğraf" style="width:120px;height:120px"><button class="px" data-gpx="${x.id}|${k}|${p.id}" aria-label="Fotoğrafı çıkar" title="Bu fotoğrafı denetimden çıkar">×</button></span>`).join("")}</div>${zs?.[k] ? zCard(zs[k], gzOpen === zs[k].key, "gz") : ""}</div>`).join("")}</div>`; }).join("")}</div>`;
      });
      return h || '<div class="muted">Uygunsuz madde yok.</div>';
    };
    const draw2 = () => {
      m.innerHTML = `<div class="mbox" style="max-width:none;width:min(calc(100vw - 32px),1100px);height:min(95vh,900px);padding:0;gap:0;overflow:hidden">
        <div class="row sp" style="padding:16px 20px;border-bottom:1px solid var(--line);flex-wrap:nowrap"><div style="min-width:0"><b style="font:600 18px Sora,sans-serif">${esc(g.guestName)} · detaylı kontrol</b>
          <div class="muted" style="font-size:12.5px">${w.date ? dmy(w.date) : "—"} · ${Object.keys(w.marks).length} madde işaretli · ${nUnf()} uygunsuz · ${nPh()} fotoğraf · ${esc(D.setup.rows.find(r => r.id === D.dept)?.name || "")}</div>${tgt ? `<div style="font-size:12.5px;margin-top:2px;color:var(--gd);font-weight:600">Onaylanınca ${tgt.no}. denetime (${wkNo(tgt.date)}. hafta) eklenir.</div>` : ""}</div>
          <button data-x aria-label="Kapat" style="flex:0 0 32px;width:32px;height:32px;min-width:0;padding:0;background:#B3261E;border-color:#B3261E;color:#fff;font-size:26px;line-height:1;display:grid;place-items:center;border-radius:8px">×</button></div>
        <div style="flex:1;overflow:auto;padding:16px 20px;display:flex;flex-direction:column;gap:14px">${body()}</div>
        <div style="padding:14px 20px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:10px;align-items:center"><input class="inp" id="gNote" placeholder="Geri gönderirken misafire not (isteğe bağlı)" style="flex:1 1 240px"><button class="sec" data-ret>Geri gönder</button><button class="sec" data-del style="color:#B3261E;border-color:#B3261E">Tamamen sil</button>${gzMiss() ? `<span style="flex-basis:100%;font-size:12.5px;color:#7A1C14;background:#FDECEA;border:1px solid #F3B8B2;border-radius:10px;padding:7px 10px">${gzMiss()} bulgu için önceki haftalarla eşleşme seçimi gerekli.</span>` : ""}<button data-ok ${gzMiss() ? 'disabled style="opacity:.5"' : ""}>${tgt ? "Onayla ve bu haftanın denetimine ekle" : "Onayla ve denetime ekle"}</button></div></div>`;
      m.querySelector("[data-x]").onclick = () => m.remove();
      const rr = () => { const el = m.querySelector(".mbox > div:nth-child(2)"), keep = el.scrollTop; draw2(); m.querySelector(".mbox > div:nth-child(2)").scrollTop = keep; };
      m.querySelectorAll("[data-gzo]").forEach(b => b.onclick = () => { gzOpen = gzOpen === b.dataset.gzo ? "" : b.dataset.gzo; rr(); });
      m.querySelectorAll("[data-gzs]").forEach(b => b.onclick = () => { const t = zToggle(b, "gzs"); gz[t.key] = t.val; if (t.close) gzOpen = ""; rr(); });
      m.querySelectorAll("[data-guo]").forEach(b => b.onclick = () => { const k = "u|" + b.dataset.guo; gzOpen = gzOpen === k ? "" : k; rr(); });
      m.querySelectorAll("[data-guc]").forEach(cb => cb.onchange = () => { const zk = cb.dataset.guc.split("|")[1], i = gu.indexOf(zk); if (cb.checked && i < 0) gu.push(zk); if (!cb.checked && i >= 0) gu.splice(i, 1); rr(); });
      m.querySelectorAll("[data-mc]").forEach(b => b.onclick = () => { const [id, v] = b.dataset.mc.split("|"); mc[id] = v; const el = m.querySelector(".mbox > div:nth-child(2)"), keep = el.scrollTop; draw2(); m.querySelector(".mbox > div:nth-child(2)").scrollTop = keep; });
      m.querySelectorAll("[data-gn]").forEach(t => t.oninput = () => { const [id, k] = t.dataset.gn.split("|"); (w.notes[id] ||= [""])[+k] = t.value; });
      m.querySelectorAll("[data-gpx]").forEach(b => b.onclick = e => { e.stopPropagation(); const [id, k, pid] = b.dataset.gpx.split("|"), key = id + "|" + k; w.photos[key] = (w.photos[key] || []).filter(p => p.id !== pid); const keep = m.querySelector(".mbox > div:nth-child(2)").scrollTop; draw2(); m.querySelector(".mbox > div:nth-child(2)").scrollTop = keep; });
      const all = [...m.querySelectorAll("[data-gp]")];
      all.forEach((im, ix) => im.onclick = () => lightbox(all.map(x => ({ id: x.dataset.gp, t: x.getAttribute("src") })), ix));
      m.querySelector("[data-ok]").onclick = async e => { e.target.disabled = true; try { if (gzMiss()) { e.target.disabled = false; return toast("Önceki haftalarla eşleşme seçimi eksik."); } if (await approveG(g, w, mc, { zs: gzAll(), gu, ch: zch2 || [] })) { m.remove(); D.key = ""; render(D.v, D.ctx); } else e.target.disabled = false; } catch (er) { toast("Onaylanamadı: " + (er.message || er)); e.target.disabled = false; } };
      m.querySelector("[data-del]").onclick = async () => { if (await delG(g)) { m.remove(); D.key = ""; render(D.v, D.ctx); } };
      m.querySelector("[data-ret]").onclick = async e => { e.target.disabled = true; try { await gDone({ ...g, draft: w }, "returned", m.querySelector("#gNote").value.trim()); toast("Taslak düzeltme için geri gönderildi."); m.remove(); D.key = ""; render(D.v, D.ctx); } catch (er) { toast("Gönderilemedi: " + (er.message || er)); e.target.disabled = false; } };
    };
    const lightbox = (list, i0) => {
      let i = i0; const lb = document.createElement("div"); lb.className = "mod"; lb.style.zIndex = 70;
      const show = async () => {
        lb.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;max-width:calc(100vw - 32px)"><img src="${list[i].t}" alt="Fotoğraf" style="max-width:calc(100vw - 32px);max-height:78vh;border-radius:10px;background:#000"><div class="row" style="gap:10px;justify-content:center"><button class="sec" data-p ${list.length < 2 ? "hidden" : ""}>‹ Önceki</button><span style="color:#fff;font-weight:700">${i + 1} / ${list.length}</span><button class="sec" data-n ${list.length < 2 ? "hidden" : ""}>Sonraki ›</button><button data-c>Kapat</button></div></div>`;
        lb.querySelector("[data-c]").onclick = () => lb.remove();
        lb.querySelector("[data-p]").onclick = () => { i = (i + list.length - 1) % list.length; show(); };
        lb.querySelector("[data-n]").onclick = () => { i = (i + 1) % list.length; show(); };
        const at = i, full = await S.getPhoto(st.fid, st.year, list[i].id).catch(() => null); if (full && at === i && lb.isConnected) lb.querySelector("img")?.setAttribute("src", full);
      };
      document.body.appendChild(lb); show(); lb.addEventListener("mousedown", e => { if (e.target === lb) lb.remove(); });
    };
    document.body.appendChild(m); draw2();
  };
  on("[data-gdet]", el => { const g = D.gdocs.find(x => x.id === el.dataset.gdet); if (g) openReview(g); });
  if (D.autoOpen) { const k = D.autoOpen; D.autoOpen = null; const g = D.gdocs.find(x => x.guestUid === k) || (k === "*" ? D.gdocs[0] : null); if (g) openReview(g); }
  const dn = document.getElementById("doneSess"); if (dn) dn.onclick = () => doSave(true);
  // Aksiyon kartları: başlığa dokununca açılır / kapanır (varsayılan kapalı; sayfadan çıkınca kapanır)
  v.querySelectorAll("details.ak[data-fk]").forEach(el => el.addEventListener("toggle", () => { el.open ? D.fxOpen.add(el.dataset.fk) : D.fxOpen.delete(el.dataset.fk); }));
  on("[data-fxrev]", el => { const [key, gu] = el.dataset.fxrev.split("|").length > 3 ? [el.dataset.fxrev.split("|").slice(0, 3).join("|"), el.dataset.fxrev.split("|")[3]] : [el.dataset.fxrev, ""]; const pd = D.fxPend.find(x => x.key === key && x.guestUid === gu); if (pd) fxReview(pd); });
  const fxSess = key => { const [no, id, j] = key.split("|"); const s = doc.sessions.find(x => x.no === +no); return { s, id, j: +j, fk: id + "|" + j }; };
  on("[data-fxfromg]", el => {
    const key = el.dataset.fxfromg, dr = (D.fxDraft[key] ||= { tx: "", ph: [] }), { s, id, j } = fxSess(key), t = String((s?.fails?.[id] || [])[j] || "").trim(), dn = Gorev.durumOf(gkOf(s, id, j, t));
    if (!(dr.tx || "").trim()) dr.tx = "Görev takipte kapatıldı" + (dn?.kapanis ? " (" + fxWhen(dn.kapanis).slice(0, 10) + ")" : "") + ".";
    D.fxOpen.add(key); draw();
  });
  on("[data-fxnb]", async el => {
    const key = el.dataset.fxnb, { s, id, j } = fxSess(key), dr = (D.fxDraft[key] ||= { tx: "", ph: [] });
    const r = await noteEditor({ title: "Alınan aksiyon", item: (s?.fails?.[id] || [])[j] || "", text: dr.tx, question: "Ne yapıldı? Alınan aksiyonu yazın.", example: "Örn. Koruyucu kapak yerine takıldı, devre dışı bırakma bağlantısı kaldırıldı." });
    if (r === null) return; dr.tx = r; D.fxOpen.add(key); draw();
  });
  v.querySelectorAll("input[data-fxph]").forEach(inp => inp.onchange = async () => {
    const key = inp.dataset.fxph, files = [...inp.files]; inp.value = ""; if (!files.length) return; D.msg = "Fotoğraf hazırlanıyor…"; setSv();
    for (const f of files) { try { const { full, thumb } = await compressImage(f), pid = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await S.savePhoto(st.fid, st.year, pid, full); (D.fxDraft[key] ||= { tx: "", ph: [] }).ph.push({ id: pid, t: thumb }); } catch (e) { toast("Fotoğraf eklenemedi: " + (e.message || e)); } }
    D.msg = ""; D.fxOpen.add(key); draw();
  });
  on("[data-fxprm]", el => { const dr = D.fxDraft[el.dataset.fxprm]; if (!dr) return; dr.ph = dr.ph.filter(p => p.id !== el.dataset.pid); if (!D.fxEditing.has(el.dataset.fxprm)) S.deletePhoto(st.fid, st.year, el.dataset.pid).catch(() => {}); D.fxOpen.add(el.dataset.fxprm); draw(); });
  on("[data-fxsave]", async el => {
    const key = el.dataset.fxsave, dr = D.fxDraft[key], { s, id, j, fk } = fxSess(key), tx = (dr?.tx || "").trim();
    if (!s) return; if (!tx) return toast("Alınan aksiyonu yazın.");
    const t = (s.fails?.[id] || [])[j]; if (t === undefined) return toast("Önce denetimi kaydedin.");
    el.disabled = true; const now = Date.now(), old = s.fixed?.[fk], editing = D.fxEditing.has(key) && old?.st === "ok";
    if (editing) {
      const prev = old; s.fixed[fk] = { ...old, tx, ph: dr.ph || [], ed: now };
      const ok2 = await persist(true); if (ok2 === false) { s.fixed[fk] = prev; el.disabled = false; return toast("Kaydedilemedi, bağlantıyı kontrol edip tekrar deneyin."); }
      (prev.ph || []).filter(p => !(dr.ph || []).some(x => x.id === p.id)).forEach(p => S.deletePhoto(st.fid, st.year, p.id).catch(() => {}));
      D.fxEditing.delete(key); delete D.fxDraft[key]; D.fxOpen.add(key); draw(); return toast("Aksiyon güncellendi.");
    }
    const zO = zOlder(s, id, j, iso(new Date(now)));
    let zS = [];
    if (zO.length) { const { confirmBox } = await import("./ui.js?v=20261110k"); if (await confirmBox("Önceki haftalar da kapatılsın mı?", `Bu bulgu önceki haftalarda da açık: ${zO.map(zOldLbl).join(", ")}. Aynı aksiyonla kapatılsın mı? Eski haftaların puanı değişmez.`, "Evet, kapat")) zS = zO; }
    (s.fixed ||= {})[fk] = { t, tx, ph: dr.ph || [], at: now, rat: now, ap: now, st: "ok", gn: "Yetkili" };
    if (zS.length) { await zCloseApply(zS, { k: "aks", d: iso(new Date(now)), no: s.no, by: "Yetkili", tx, ph: dr.ph || [] }); if (zS.some(l => +l.m !== +D.month || +l.y !== +st.year)) D.zh = null; }
    const ok = await persist(true); if (ok === false) { delete s.fixed[fk]; el.disabled = false; return toast("Kaydedilemedi, bağlantıyı kontrol edip tekrar deneyin."); }
    delete D.fxDraft[key]; D.fxOpen.add(key); draw();
    toast(fxInTime({ rat: now }, s.date) ? "Aksiyon kaydedildi; bulgu cezada Uygun gibi sayılır." : "Aksiyon kaydedildi. Denetimin haftası kapandığı için ceza puanı değişmez.");
  });
  on("[data-fxedit]", el => { const key = el.dataset.fxedit, { s, fk } = fxSess(key), f = s?.fixed?.[fk]; if (!f) return; D.fxDraft[key] = { tx: f.tx || "", ph: (f.ph || []).map(p => ({ ...p })) }; D.fxEditing.add(key); D.fxOpen.add(key); draw(); });
  on("[data-fxcancel]", el => {
    const key = el.dataset.fxcancel, { s, fk } = fxSess(key), f = s?.fixed?.[fk], dr = D.fxDraft[key];
    (dr?.ph || []).filter(p => !(f?.ph || []).some(x => x.id === p.id)).forEach(p => S.deletePhoto(st.fid, st.year, p.id).catch(() => {}));
    D.fxEditing.delete(key); delete D.fxDraft[key]; D.fxOpen.add(key); draw();
  });
  on("[data-fxdel]", async el => {
    const { s, id, j, fk } = fxSess(el.dataset.fxdel); if (!s?.fixed?.[fk]) return;
    const { confirmBox } = await import("./ui.js?v=20261110k");
    if (!(await confirmBox("Aksiyon kaldırılsın mı?", "Aksiyon bilgisi silinir; bulgu yeniden cezaya sayılır.", "Evet, kaldır", true))) return;
    const old = s.fixed[fk], oldOff = s.fixedOff?.[fk]; delete s.fixed[fk];
    // Otomatik (görev takip) aksiyon elle kaldırıldıysa, aynı kapanış için yeniden otomatik eklenmesin
    if (old.auto) { const t = String((s.fails?.[id] || [])[j] || "").trim(), dn = Gorev.durumOf(gkOf(s, id, j, t)); (s.fixedOff ||= {})[fk] = +dn?.kapanis || +dn?.at || 1; }
    if ((await persist(true)) === false) { s.fixed[fk] = old; if (oldOff === undefined) delete s.fixedOff?.[fk]; else s.fixedOff[fk] = oldOff; return toast("Kaydedilemedi."); }
    draw(); toast("Aksiyon kaldırıldı.");
  });
  const rsb = v.querySelector("#rsBtn"); if (rsb) rsb.onclick = respDialog;
  const rdb = v.querySelector("#rdBtn"); if (rdb) rdb.onclick = async () => { const r = await pickDate({ title: "Termin", min: iso(new Date()), a: doc.due || defDue(doc), view: doc.due || defDue(doc) }); if (r?.a) { doc.due = r.a; persist(); draw(); } };
  on("[data-gfxt]", () => { D.gfxOpen = !D.gfxOpen; draw(); });
  on("[data-shrx]", () => { Paylas.dismissBanner(D.shRows, GUEST.uid); draw(); });
  on("[data-shf]", el => { D.shF = el.dataset.shf; draw(); });
  on("[data-gfxk]", async el => {
    const [m, dp, no, id, j] = el.dataset.gfxk.split("|"), want = `${no}|${id}|${j}`;
    const open = () => { const r = gfxRows(true).find(x => `${x.s.no}|${x.id}|${x.j}` === want); if (r) gfxForm(r); else toast("Bulgu bulunamadı, sayfa yenilenince tekrar deneyin."); };
    if (+m === D.month && dp === D.dept) return open();
    D.month = +m; D.dept = dp; D.key = ""; await render(D.v, D.ctx); open();
  });
  on("[data-shrt]", () => { D.shrOpen = !D.shrOpen; draw(); });
  on("[data-shrw]", el => { D.shrB = D.shrB === el.dataset.shrw ? "" : el.dataset.shrw; draw(); });
  on("[data-shd]", el => { D.shDd = D.shDd === el.dataset.shd ? "" : el.dataset.shd; draw(); });
  on("[data-shmv]", el => { D.shMo = +el.dataset.shmv; D.shDd = ""; D.shrB = ""; draw(); });
  const toYear = (y, m) => { D.shDd = ""; D.shrB = ""; D.shMo = m ? +m : null; if (String(y) === String(st.year)) return draw(); const sel = document.getElementById("selYear"); if (!sel) return; D.shRows = []; sel.value = String(y); sel.dispatchEvent(new Event("change")); };
  on("[data-shyv]", el => toYear(el.dataset.shyv, null));
  on("[data-shw]", el => { const [y, m] = el.dataset.shw.split("|"); toYear(y, m); });
  if (GUEST.on && D.shYrs?.fid !== st.fid && !D.shYrsBusy) { D.shYrsBusy = true; Paylas.yearsInfo(st.fid, GUEST.uid, st.years).then(list => { D.shYrs = { fid: st.fid, list }; }).catch(() => { D.shYrs = { fid: st.fid, list: [] }; }).finally(() => { D.shYrsBusy = false; if (D.v?.isConnected && D.v.querySelector("#bolum") && !document.querySelector(".mod")) draw(); }); }
  on("[data-shro]", el => { const row = (D.shRows || []).find(r => r.key === el.dataset.shro); if (row) Paylas.obsDialog({ fid: st.fid, year: st.year, row, uid: GUEST.uid, name: GUEST.name, factoryName: st.factories?.find(f => f.id === st.fid)?.name || "" }); });
  on("[data-shr]", el => { const [m, d] = el.dataset.shr.split("|"); D.month = +m; D.dept = d; D.gfxOpen = true; D.key = ""; render(D.v, D.ctx); });
  const sb = v.querySelector("#shareBtn"); if (sb) sb.onclick = () => Paylas.openShare({ fid: st.fid, year: st.year, month: D.month, rows: D.setup.rows, factoryName: st.factories?.find(f => f.id === st.fid)?.name || "" });
  on("[data-gfx]", el => { const r = gfxRows().find(x => `${x.s.no}|${x.id}|${x.j}` === el.dataset.gfx); if (r) gfxForm(r); });
  setPhotoLoader(id => D.ctx.st && S.getPhoto(D.ctx.st.fid, D.ctx.st.year, id)); v.querySelectorAll("[data-pv]").forEach(im => { if (!im.onclick) im.onclick = () => pvOpen(im); });
  v.querySelectorAll("[data-pf]").forEach(b => b.onclick = () => openPrev(b.dataset.pf));
}
// Geçmiş bulgu: turuncu karttaki tarihe dokununca o denetimde yazılan bulgu(lar) ve fotoğrafları (yalnızca okunur, kopyalanır)
function openPrev(ref) {
  const [id, no] = ref.split("|"), s = D.doc.sessions.find(x => String(x.no) === no); if (!s || (GUEST.on && !GUEST.hist)) return;
  const { st } = D.ctx, { txt } = catOf(id), texts = (s.fails?.[id] || []).filter(t => String(t || "").trim());
  const m = document.createElement("div"); m.className = "mod";
  m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:12px;max-height:88vh;overflow:auto"><h2 style="font-size:18px">${dm(s.date)} · Geçmiş bulgu</h2><div class="muted" style="font-size:12.5px;line-height:1.5;margin-top:-6px">${esc(txt)}</div>
    ${texts.length ? texts.map((t, n) => { const ph = s.photos?.[id + "|" + n] || []; return `<div class="gbf">${texts.length > 1 ? `<b>${n + 1}.</b>` : ""}<div class="gbc"><div class="gbt">${esc(t)}</div>${ph.length ? `<div class="gbp">${ph.map((p, k) => `<button type="button" data-gp="${n}|${k}" aria-label="Fotoğrafı büyüt"><img src="${p.t}" alt="Fotoğraf"></button>`).join("")}</div>` : ""}</div></div>`; }).join("") : '<div class="muted">Bu denetimde bulgu açıklaması girilmemiş.</div>'}
    <div class="ar-two"><button class="sec" data-gx>Kapat</button><button data-gc ${texts.length ? "" : "disabled"}>Kopyala</button></div></div>`;
  document.body.appendChild(m);
  m.querySelector("[data-gx]").onclick = () => m.remove(); m.addEventListener("mousedown", e => { if (e.target === m) m.remove(); });
  m.querySelectorAll("[data-gp]").forEach(b => b.onclick = () => { const [n, k] = b.dataset.gp.split("|"); showPhotos((s.photos[id + "|" + n] || []).map(p => ({ t: p.t, id: p.id })), +k, pid => S.getPhoto(st.fid, st.year, pid)); });
  m.querySelector("[data-gc]").onclick = async () => {
    const out = texts.length > 1 ? texts.map((t, n) => `${n + 1}. ${t}`).join("\n") : texts[0];
    try { await navigator.clipboard.writeText(out); toast("Kopyalandı."); }
    catch { try { const ta = document.createElement("textarea"); ta.value = out; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); toast("Kopyalandı."); } catch { toast("Kopyalanamadı, metne basılı tutup kopyalayın."); } }
  };
}
const $ = id => document.getElementById(id);
