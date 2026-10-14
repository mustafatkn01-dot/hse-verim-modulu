// İSG Denetim Listesi sayfası
import * as Guest from "./guest.js?v=20261014l";
import * as Gorev from "./gorev.js?v=20261014l";
import * as S from "./store.js?v=20261014l";
import { esc, ic, toast, pickDate, fmtTarih, noteEditor, compressImage, showPhoto, GUEST, guestLock, roText } from "./ui.js?v=20261014l";
import { CATS } from "./isgcats.js?v=20261014l";
import { dotCss, yukle as tatilYukle, takvim as tatilMap } from "./tatil.js?v=20261014l";
import { calcIsg, katsayi, bandOf, num, MONTHS, DEFAULT_PARAMS } from "./scoring.js?v=20261014l";

const COLL = "isg";
const D = { key: "", setup: null, doc: null, dept: null, month: null, open: {}, ro: false, timer: null, saved: true, msg: "" };
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
const blank = (year, month, auditor) => ({ sessions: [], draft: { marks: {}, notes: {}, ydNotes: {}, date: defaultDate(year, month) }, freq: {}, bonus: 0, auditor: auditor || "" });

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
export function reload() { D.key = ""; if (D.v?.isConnected && D.ctx && D.saved) render(D.v, D.ctx); }
export function focus(month, dept, by) { D.month = +month; D.dept = dept; D.key = ""; D.autoOpen = by || null; }

export async function render(v, ctx) {
  const { st } = ctx;
  const setup = await S.getSetup(st.fid, st.year);
  if (!setup?.rows?.length) { v.innerHTML = `<div class="cd"><h2>Önce bölümleri tanımlayın</h2><p class="sub">Denetim girişi için Kurulum ve Kayıtlar sayfasında en az bir bölüm kaydedilmeli.</p><div><a href="#kurulum"><button>Kurulum'a git</button></a></div></div>`; return; }
  D.setup = setup;
  if (!D.month) D.month = defaultMonth(st.year);
  if (!setup.rows.find(r => r.id === D.dept)) D.dept = setup.rows[0].id;
  const key = [st.fid, st.year, D.month, D.dept].join("/");
  if (D.key !== key) {
    clearTimeout(D.timer);
    const doc = await S.getMonthDoc(st.fid, st.year, COLL, `${pad(D.month)}_${D.dept}`);
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
    } else {
      settle(D.doc, st.year, D.month);
      D.gdocs = (await S.listMonthDocs(st.fid, st.year, "isgg").catch(() => [])).filter(g => g.id.startsWith(gid + "_") && (g.status === "saved" || g.status === "review"));
    }
    D.key = key; D.open = {}; D.saved = true; D.touched = false; D.msg = "";
  }
  D.ro = String(st.year) !== String(st.active) || guestLock(st.year, D.month) || (GUEST.on && (D.gstatus === "review" || D.gstatus === "approved"));
  D.ctx = ctx; D.v = v;
  draw(); loadWk();
}

// "Bu hafta" şeridi: bugünün haftasında her bölümün denetim durumu (yalnızca gösterim; bölüme dokununca o bölüme geçilir)
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
  clearTimeout(D.timer);
  const run = async () => {
    const { st } = D.ctx, [f, y, m, d] = D.key.split("/");
    if (GUEST.on) {
      try {
        const g = { guestUid: GUEST.uid, guestName: GUEST.name, dept: d, month: +m, status: D.gstatus, draft: D.doc.draft, at: Date.now() };
        if (D.gnote) g.note = D.gnote;
        await S.saveMonthDoc(f, y, "isgg", `${pad(+m)}_${d}_${GUEST.uid}`, g); D.saved = true;
      } catch (e) { D.msg = "Kaydedilemedi: " + e.message; }
      setSv(); return;
    }
    const p = D.setup.params || DEFAULT_PARAMS, row = D.setup.rows.find(r => r.id === d);
    let result = null;
    if (D.doc.sessions.length) {
      const c = calcIsg({ cats: CATS, sessions: D.doc.sessions, draft: { marks: {}, notes: {}, ydNotes: {} }, freqOv: D.doc.freq, bonusIdx: D.doc.bonus, F: katsayi(row, +m), p });
      result = { score: +c.score.toFixed(2), penalty: +c.penalty.toFixed(2), bonus: c.bonus, den: c.den, total: c.total, ydPct: c.ydPct, band: bandOf(c.score, p), F: +katsayi(row, +m).toFixed(2), sessions: D.doc.sessions.length };
    }
    try { const payload = { ...D.doc, result, dept: d, month: +m }, cn = D.doc.sessions.filter(x => x.closed).map(x => x.no);
      if (!GUEST.on || D.hadClosed) payload.closedNos = cn; else delete payload.closedNos;
      await S.saveMonthDoc(f, y, COLL, `${pad(+m)}_${d}`, payload); D.saved = true; } catch (e) { D.msg = "Kaydedilemedi: " + e.message; }
    setSv(); if (now) loadWk(true);
  };
  if (now) return run();
  D.timer = setTimeout(run, 700);
}
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

function draw() {
  const { st } = D.ctx, v = D.v, doc = D.doc, setup = D.setup, p = setup.params || DEFAULT_PARAMS;
  const row = setup.rows.find(r => r.id === D.dept), F = katsayi(row, D.month);
  const on = doc.draft.on !== false, editNo = doc.draft.edit;
  const calcSessions = doc.sessions.filter(x => x.no !== editNo);
  const c = calcIsg({ cats: CATS, sessions: on ? calcSessions : doc.sessions, draft: on ? doc.draft : { marks: {}, notes: {}, ydNotes: {} }, freqOv: doc.freq, bonusIdx: doc.bonus, F, p });
  const band = bandOf(c.score, p), B = BAND[band];
  const curNo = editNo ?? (doc.sessions.length + 1), date = doc.draft.date;
  const dateOk = date && +date.slice(0, 4) === +st.year && +date.slice(5, 7) === D.month && date <= iso(new Date());
  const canSave = c.canSave && dateOk && !D.ro;
  const canPart = c.missing === 0 && c.ydMissing === 0 && c.curMarked && dateOk && !D.ro;
  const f1 = n => n.toFixed(1).replace(".", ",");
  const catHtml = CATS.map((cat, ci) => {
    const info = c.catInfo[ci], w = W[cat.w], open = !!D.open[ci];
    const [fb, fc] = info.hasFreq ? FT[info.freq] : ["#E4ECE9", "#4A5C57"];
    const items = cat.items.map((txt, ii) => {
      const it = info.items[ii], id = it.id, mk = it.mk, notes = doc.draft.notes[id] && doc.draft.notes[id].length ? doc.draft.notes[id] : [""];
      const prevDates = it.prev.filter(s => !on || !editNo || s.no < editNo).map(s => dm(s.date));
      const fq = Math.min(c.azami, it.cnt === 0 ? 0 : it.cnt === 1 ? 1 : it.cnt <= 3 ? 2 : 3);
      const sb = k => { const [bg, col] = TONE[k]; return seg(mk === k, bg, col); };
      return `<div class="ci"><div class="cir"><div class="grow"><span>${esc(txt)}</span>
        ${prevDates.length && !it.isX ? `<span class="pill" style="background:#FBE9C6;color:#6B3F00">Önceki denetimde uygunsuzdu: ${prevDates.join(", ")}</span>` : ""}</div>
        <div class="row" style="gap:6px;flex-wrap:nowrap">${[["u", "Uygun"], ["x", "Uygunsuz"], ["n", "Y.D."]].map(([k, t]) => `<button class="mk" data-mk="${id}|${k}" style="${sb(k)}" aria-pressed="${mk === k}">${t}</button>`).join("")}</div></div>
        ${it.isX ? `<div class="xbox"><div class="row"><span class="pill" style="background:${FT[fq][0]};color:${FT[fq][1]}">Sıklık ${fq} · otomatik</span>
          <span style="font-size:12.5px;color:#5A1A16">${it.cnt === 1 ? "Bu ay ilk kez tespit edildi" : `Bu ay ${it.cnt} farklı günde uygunsuz (${prevDates.concat([dm(date || "0000-00-00")]).join(", ")})`}</span></div>
          <div class="hd">AÇIKLAMA · Hangi makine veya alanda, ne gibi bir uygunsuzluk var?</div>
          ${notes.map((t, k) => `<div class="row" style="flex-wrap:nowrap;align-items:flex-start;gap:6px"><span style="flex:0 0 16px;padding-top:10px;font-weight:800;color:#8E1B16">${k + 1}.</span>
            <button class="nb" data-note="${id}|${k}" aria-label="Açıklamayı yaz veya düzenle"><span class="nt" style="color:${t.trim() ? "var(--text)" : "#8A6A66"}">${esc(t.trim() ? t : "Dokunun ve yazın: hangi makine veya alanda, ne gibi uygunsuzluk var?")}</span>${ic('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>', 18)}</button>
            <button class="nx" data-nrm="${id}|${k}" aria-label="Açıklamayı sil">×</button></div>
          <div class="phs">${(doc.draft.photos?.[id + "|" + k] || []).map(p => `<span class="pth"><img src="${p.t}" data-pv="${p.id}" alt="Fotoğraf"><button class="px" data-prm="${id}|${k}|${p.id}" aria-label="Fotoğrafı sil">×</button></span>`).join("")}
            ${D.ro ? "" : `<label class="pbtn">${ic('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 20)}<i>Fotoğraf çek</i><input type="file" accept="image/*" capture="environment" data-ph="${id}|${k}" hidden></label><label class="pbtn">${ic('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 9"/>', 20)}<i>Resim ekle</i><input type="file" accept="image/*" multiple data-ph="${id}|${k}" hidden></label>`}${gchip(cat, ii, id, notes, k, curNo, row, st)}</div>`).join("")}
          <button class="sec" style="align-self:flex-start;height:38px;color:#8E1B16;border-color:#B3261E" data-nadd="${id}">+ Benzer uygunsuzluk ekle</button></div>` : ""}</div>`;
    }).join("");
    const ydBox = info.allYD ? `<div class="ydbox"><span class="hd">BU KATEGORİDE TÜM MADDELER Y.D. · KISA GEREKÇE</span>
      <input class="inp" data-yd="${ci}" value="${esc(doc.draft.ydNotes?.[ci] || "")}" aria-label="Y.D. gerekçesi" placeholder="Örn. İlgili bölümde çalışma yoktur">
      <span class="muted" style="font-size:12.5px">Bu kategori puanı etkilemez (ceza 0), ancak bölümün tüm kategorilerindeki payı sabit kalır. Gerekçe raporda görünür.</span></div>` : "";
    const freqBox = info.hasFreq ? `<div class="fbox"><div style="min-width:200px"><span class="hd">KATEGORİ SIKLIĞI (BU AY)</span><div class="muted" style="font-size:12.5px">${info.hasOverride ? `Elle seçildi (otomatik öneri: ${info.auto})` : `Otomatik: bu ay ${info.catCount} farklı günde bulgu → sıklık ${info.auto}${cat.w === 3 ? " (kritik kategoride bulgu varsa en az 2)" : ""}`}</div></div>
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
  <div><div class="hd" style="letter-spacing:.8px">AYLIK VERİ GİRİŞİ</div><h1 class="ttl">İSG Denetim Listesi</h1>
    <div class="muted" style="font-size:12.5px" id="sv">${svTxt()}</div></div>
  <div id="wkWarn" style="display:none"></div>
  <div id="wkStrip" style="display:none"></div>
  ${D.ro && !(GUEST.on && (D.gstatus === "review" || D.gstatus === "approved")) ? `<div class="warn">${roText(st.year, D.month, st.active)}</div>` : ""}
  ${(() => { const cu = on && !GUEST.on && !D.ro && editNo != null ? doc.sessions.find(x => x.no === editNo) : null; return cu && !cu.closed && monOf(cu.date) < monOf(iso(new Date())) ? `<div class="warn">${cu.no}. denetim ${dmy(cu.date)} (${wkNo(cu.date)}. hafta) tarihinde başladı ve hâlâ açık. Eksikleri tamamlayıp “Kaydet ve Denetimi Tamamla”ya basın; açık denetim varken yeni haftanın denetimi başlatılamaz.</div>` : ""; })()}
  ${GUEST.on && D.gstatus === "returned" ? `<div class="warn">Yetkili kullanıcı taslağı düzeltme için geri gönderdi${D.gnote ? ": " + esc(D.gnote) : "."} Düzeltip tekrar kaydedin.</div>` : ""}
  ${GUEST.on && D.gstatus === "review" ? `<div class="okbar"><span>Taslağınız onay bekliyor. Yetkili kullanıcı onaylayınca denetime eklenir.</span></div>` : ""}
  ${GUEST.on && D.gstatus === "approved" ? `<div class="okbar"><span>Taslağınız onaylandı ve denetime eklendi.</span>${guestLock(st.year, D.month) ? "" : '<button class="sec" id="newGDraft">Yeni taslak başlat</button>'}</div>` : ""}
  ${gPanel(D.gdocs)}
  <div class="cd" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px 10px;padding:14px;align-items:start">
    <div class="sf"><label class="hd" for="bolum">BÖLÜM</label><select id="bolum" class="inp">${setup.rows.map(r => `<option value="${r.id}" ${r.id === D.dept ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select></div>
    <div class="sf"><label class="hd" for="ay">DÖNEM</label><select id="ay" class="inp">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === D.month ? "selected" : ""}>${m} ${st.year}</option>`).join("")}</select></div>
    <div class="sf"><label class="hd" for="tarih">DENETİM TARİHİ</label><button id="tarih" class="inp fld ${date ? "" : "ph"}" ${D.ro ? "disabled" : ""}><span>${date ? esc(fmtTarih(date)) : "Tarih seç"}</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B6E4F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg></button>${date ? `<div class="muted" style="font-size:12.5px">${wkNo(date)}. hafta</div>` : ""}</div>
    <div class="sf"><label class="hd" for="denetci">DENETÇİ</label><input id="denetci" class="inp" value="${esc(doc.auditor)}" placeholder="Ad Soyad" ${D.ro ? "disabled" : ""}></div></div>
  <div class="cd" style="padding:18px 20px;gap:14px"><div class="row sp"><b style="font:600 16px Sora,sans-serif">Bu Ayın Denetim Kayıtları</b>
    <span class="muted" style="font-size:12.5px">Aynı bulgu sonraki denetimlerde tekrarlanırsa sıklık otomatik artar: 1 gün → 1 · 2-3 farklı gün → 2 · 4 ve üzeri → 3 (aynı gün yapılan denetimler tek sayılır)</span></div>
    <div class="row" style="gap:12px">${doc.sessions.map(s => { const isEd = on && s.no === editNo, lastS = s.no === doc.sessions.length;
      const stt = isEd ? "açık · düzenleniyor" : s.closed ? "tamamlandı" : "kaydedildi";
      return `<div class="sess ${isEd ? "cur" : ""}">${isEd ? '<span class="sw" style="background:#0B6E4F;border-radius:50%;margin:0"></span>' : ic('<path d="M4 12l5 5L20 6"/>').replace("currentColor", "#0B6E4F")}<div><b>${s.no}. Denetim · ${wkNo(s.date)}. hafta</b><div class="muted" style="font-size:12.5px">${dmy(s.date)} · ${Object.keys(s.fails).length} uygunsuz · ${stt}</div></div>
      ${!D.ro && !GUEST.on ? `<div class="row" style="gap:6px;margin-left:auto;flex-wrap:nowrap">${!isEd ? `<button class="sm" data-reopen="${s.no}" style="white-space:nowrap" title="Bu denetimi tekrar açıp işaretlemeye devam et">Yeniden aç</button>` : ""}<button class="sm sec" data-delsess="${s.no}" style="white-space:nowrap" title="Bu denetimi sil">Sil</button></div>` : ""}</div>`; }).join("")}
      ${on && editNo == null ? `<div class="sess cur"><span class="sw" style="background:#0B6E4F;border-radius:50%;margin:0"></span><div><b>${GUEST.on ? "Taslak denetiminiz" : curNo + ". Denetim"}</b><div style="font-size:12.5px">${date ? dmy(date) : "—"} · ${c.curMarked ? c.curFails + " uygunsuz (taslak)" : "henüz işaretleme yok"} · ${GUEST.on ? ({ saved: "kaydedildi", review: "onay bekliyor", approved: "onaylandı", returned: "geri gönderildi" }[D.gstatus] || "kaydedilmedi") : "yeni, kaydedilmedi"}</div></div></div>` : ""}</div></div>
  <div class="helpbox" style="flex-direction:row;gap:14px;align-items:flex-start">${ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h0"/>', 22)}<div style="line-height:1.6">Her maddeyi <b>Uygun</b>, <b>Uygunsuz</b> veya <b>Y.D.</b> olarak işaretleyin; uygunsuzlukta açıklama yazın.</div></div>
  <fieldset class="fs" ${D.ro ? "disabled" : ""}><div class="two" style="align-items:flex-start">
    <div class="colw" style="flex:2 1 600px;gap:14px">${catHtml}</div>
    <div class="colw side" style="flex:1 1 320px;gap:16px">
      <div class="save" style="gap:16px"><h2 style="font-size:16px">Anlık İSG Skoru · Bu Ay</h2>
        <div class="row" style="gap:14px;flex-wrap:nowrap"><div style="font:700 56px/1 Sora,sans-serif;letter-spacing:-2px;color:#fff">${f1(c.score)}</div>
          <span class="pill" style="background:${B[2]};color:${B[1]}">${band}</span></div>
        <div style="position:relative;height:12px;border-radius:99px;background:rgba(255,255,255,.14)"><div style="height:12px;border-radius:99px;width:${c.score.toFixed(1)}%;background:${B[0]}"></div>
          ${[num(p.esik.o), num(p.esik.i), num(p.esik.m)].map(x => `<div style="position:absolute;top:-3px;left:${x}%;width:2px;height:18px;background:rgba(255,255,255,.55)"></div>`).join("")}</div>
        <div class="row sp" style="font-size:11px;color:#8FA8A1;margin-top:-6px"><span>0</span><span>${p.esik.o}</span><span>${p.esik.i}</span><span>${p.esik.m}</span><span>100</span></div>
        <div class="col1" style="padding-top:6px;border-top:1px solid rgba(255,255,255,.12);gap:10px">
          ${[["Değerlendirme kapsamı (ağırlık)", `<b>${c.den} / ${c.total}</b>`], ["Bölüm katsayısı", `<b>×${F.toFixed(2).replace(".", ",")}</b>`], ["Ceza puanı", `<b style="color:#FFB4AB">−${f1(c.penalty)}</b>`], ["Ramak kala bonusu", `<b style="color:#7FE3B8">+${c.bonus}</b>`], ["Y.D. işaretli madde", `<b>${c.nCount} · %${c.ydPct}</b>`]].map(([a, b]) => `<div class="row sp"><span style="color:#9DB5AE">${a}</span>${b}</div>`).join("")}
          ${c.ydPct > 50 ? `<div style="padding:10px 12px;border-radius:10px;background:#FBE9C6;color:#5A3300;font-size:12.5px;line-height:1.5;font-weight:600">Değerlendirme kapsamı düşük: maddelerin yarısından fazlası Y.D. Skor yüksek görünebilir, raporda uyarı olarak yer alır.</div>` : ""}</div></div>
      <div class="cd" style="padding:20px;gap:12px"><b style="font:600 16px Sora,sans-serif">Ramak Kala Bildirim</b>
        <div class="muted" style="font-size:12.5px;line-height:1.5">Bu dönemde bölümün bildirim sıklığı. Ceza değil, bonus puandır.</div>
        <div class="row">${["Yok", "Ayda 1", "2 Haftada 1", "Haftalık"].map((l, i) => `<button class="bn" data-bonus="${i}" style="${seg(doc.bonus === i, "#0B2230", "#FFF")}"><span>${l}</span><span style="font-size:12px;font-weight:600">+${c.bonusVals[i]} puan</span></button>`).join("")}</div></div>
      <div class="cd" style="padding:20px;gap:12px"><b style="font:600 16px Sora,sans-serif">${curNo}. Denetim · Kaydetmeden Önce</b>
        ${[["İşaretlenmeyen madde", c.unmarked], ["Açıklaması eksik uygunsuz madde", c.missing], ["Gerekçesi eksik Y.D. kategori", c.ydMissing], ["Tarih geçersiz (dönem dışı veya ileri tarih)", dateOk ? 0 : 1]].map(([t, n]) => `<div class="row sp"><span>${t}</span><span class="pill" style="min-width:34px;text-align:center;background:${n === 0 ? "#D9F1E6" : "#FADAD7"};color:${n === 0 ? "#0B6E4F" : "#B3261E"}">${n}</span></div>`).join("")}
        <button class="go2" id="saveSess" ${canPart ? "" : "disabled"}>${GUEST.on ? "Taslağı Kaydet" : curNo + ". Denetimi Kaydet"}</button>
        ${GUEST.on ? `<button class="sec" id="askDone" style="height:44px;font-weight:700" ${canSave ? "" : "disabled"}>Tamamlanmasını İste</button>` : ""}
        ${GUEST.on ? "" : `<button class="sec" id="doneSess" style="height:44px;font-weight:700" ${canSave ? "" : "disabled"}>Kaydet ve Denetimi Tamamla</button>`}
        <div class="muted" style="font-size:12.5px;line-height:1.5"><b>Kaydet:</b> işaretlediğiniz kadarını saklar, denetim açık kalır; sonra kaldığınız yerden devam edebilirsiniz (tüm maddelerin işaretlenmesi gerekmez). <b>Tamamla:</b> tüm maddeler işaretliyken denetimi kapatır. Yeni denetim, yeni hafta başlayınca “Denetimi Başlat” ile açılır.</div></div>
    </div></div></fieldset>`;
  if (!on) {
    v.querySelector("fieldset.fs")?.remove(); v.querySelector(".helpbox")?.remove();
    const last = doc.sessions[doc.sessions.length - 1], thisMon = monOf(iso(new Date())), locked = !!last && monOf(last.date) === thisMon;
    v.insertAdjacentHTML("beforeend", `<div class="cd" style="gap:12px;padding:20px"><b style="font:600 16px Sora,sans-serif">${locked ? "Bu hafta denetimi tamamlandı" : "Yeni denetim başlatılabilir"}</b>
      <div class="muted" style="line-height:1.55">${last ? `${last.no}. denetim ${dmy(last.date)} (${wkNo(last.date)}. hafta) tarihinde tamamlandı. ` : ""}Bu bölümün aylık İSG skoru <b>${f1(c.score)}</b> (${band}). ${locked ? "Saha turunda yeni bir eksiklik görürseniz “Yeniden aç” ile bu haftanın denetimine ekleyin. Yeni denetim, yeni hafta başlayınca açılır." : "Yeni hafta için denetimi başlatabilirsiniz. Geçen haftanın denetimine ekleme yapmak isterseniz “Yeniden aç”ı kullanın."}</div>
      ${D.ro ? "" : `<div><button id="newSess" ${locked ? "disabled" : ""}>${doc.sessions.length + 1}. Denetimi Başlat</button></div>${locked ? `<div class="muted" style="font-size:12.5px;margin-top:-4px">${dmk(addDays(thisMon, 7))} Pzt günü başlatılabilir</div>` : ""}`}</div>`);
  }
  paintWk(); bind(v, c);
}

function bind(v, c) {
  const { st } = D.ctx, doc = D.doc, d = doc.draft;
  const again = () => { draw(); persist(); };
  const on = (sel, fn) => v.querySelectorAll(sel).forEach(el => el.onclick = () => fn(el));
  $("bolum").onchange = e => { D.dept = e.target.value; render(D.v, D.ctx); };
  $("ay").onchange = e => { D.month = +e.target.value; render(D.v, D.ctx); };
  $("tarih").onclick = async () => { const r = await pickDate({ title: "Denetim tarihi", max: iso(new Date()), a: d.date || "", view: `${st.year}-${String(D.month).padStart(2, "0")}-01` }); if (r) { d.date = r.a; again(); } };
  $("denetci").onchange = e => { doc.auditor = e.target.value.trim(); persist(); };
  on("[data-tog]", el => { const k = el.dataset.tog, w = !D.open[k]; D.open = {}; D.open[k] = w; draw(); if (w) setTimeout(() => document.querySelector(`[data-tog="${k}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 30); });
  on("[data-mk]", el => {
    const [id, k] = el.dataset.mk.split("|"); d.marks[id] = k;
    if (k === "x" && !(d.notes[id] && d.notes[id].length)) d.notes[id] = [""];
    again();
  });
  on("[data-nadd]", el => { (d.notes[el.dataset.nadd] ||= [""]).push(""); again(); });
  on("[data-nrm]", el => {
    const [id, k] = el.dataset.nrm.split("|"), kk = +k; const a = d.notes[id] || [""]; d.photos ||= {};
    (d.photos[id + "|" + kk] || []).forEach(p => S.deletePhoto(st.fid, st.year, p.id).catch(() => {}));
    if (a.length <= 1) { d.notes[id] = [""]; delete d.photos[id + "|0"]; }
    else { a.splice(kk, 1); for (let j = kk; j <= a.length; j++) { const nx = d.photos[id + "|" + (j + 1)]; if (nx) d.photos[id + "|" + j] = nx; else delete d.photos[id + "|" + j]; } }
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
  on("[data-pv]", async el => { showPhoto(el.getAttribute("src")); const full = await S.getPhoto(st.fid, st.year, el.dataset.pv).catch(() => null); if (full) { document.querySelector(".mod img")?.setAttribute("src", full); } });
  on("[data-note]", async el => {
    const [id, k] = el.dataset.note.split("|"), m = /^c(\d+)i(\d+)$/.exec(id), cat = CATS[+m[1]];
    const r = await noteEditor({ title: `Açıklama ${cat.name} · ${+k + 1}.`, item: cat.items[+m[2]], text: (d.notes[id] || [""])[+k] || "", example: cat.ex });
    if (r === null) return; (d.notes[id] ||= [""])[+k] = r; again();
  });
  v.querySelectorAll("[data-yd]").forEach(el => el.onchange = () => { (d.ydNotes ||= {})[el.dataset.yd] = el.value; again(); });
  on("[data-freq]", el => { const [ci, k] = el.dataset.freq.split("|"); doc.freq[ci] = +k; again(); });
  on("[data-freqreset]", el => { delete doc.freq[el.dataset.freqreset]; again(); });
  on("[data-bonus]", el => { doc.bonus = +el.dataset.bonus; again(); });
  on("[data-reopen]", async el => {
    const no = +el.dataset.reopen, t = doc.sessions.find(x => x.no === no); if (!t) return;
    if (doc.draft.on !== false && Object.keys(doc.draft.marks || {}).length && doc.draft.edit !== no) {
      const { confirmBox } = await import("./ui.js?v=20261014l");
      if (!(await confirmBox(`${no}. denetim açılsın mı?`, "Şu an açık olan denetimde kaydedilmemiş değişiklikler varsa kaybolur. Önce “Kaydet”e basmanız önerilir.", "Yine de aç"))) return;
    }
    if (t.no === doc.sessions.length) t.closed = false;
    doc.draft = { ...draftFromSession(t), on: true, edit: t.no };
    settle(doc, st.year, D.month); persist(true); draw(); toast(`${t.no}. denetim yeniden açıldı; düzenleyip kaydedin.`);
  });
  const nw = document.getElementById("newSess");
  if (nw) nw.onclick = () => { doc.draft = emptyDraft(defaultDate(st.year, D.month), true); persist(true); draw(); };
  const choose = (title, text, opts) => new Promise(res => {
    const m = document.createElement("div"); m.className = "mod";
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:14px"><h2>${esc(title)}</h2><p class="muted" style="line-height:1.55">${esc(text)}</p><div class="col1" style="gap:8px">${opts.map(([k, t, cl]) => `<button class="${cl || ""}" data-c="${k}">${esc(t)}</button>`).join("")}<button class="sec" data-c="">Vazgeç</button></div></div>`;
    document.body.appendChild(m);
    m.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { m.remove(); res(b.dataset.c || null); });
    m.addEventListener("mousedown", e => { if (e.target === m) { m.remove(); res(null); } });
  });
  const gAll = async () => (await S.listMonthDocs(st.fid, st.year, "isgg").catch(() => [])).filter(g => g.id.startsWith(`${pad(D.month)}_${D.dept}_`));
  on("[data-delsess]", async el => {
    const { confirmBox } = await import("./ui.js?v=20261014l");
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
    const { confirmBox } = await import("./ui.js?v=20261014l");
    if (!(await confirmBox("Misafir taslağı silinsin mi?", `${g.guestName} taslağı ve fotoğrafları kalıcı olarak silinir; denetime ve rapora hiç girmez. Misafir isterse yeniden yazabilir.`, "Evet, tamamen sil", true))) return false;
    Object.values(g.draft?.photos || {}).flat().forEach(p => S.deletePhoto(st.fid, st.year, p.id).catch(() => {}));
    await S.deleteMonthDoc(st.fid, st.year, "isgg", g.id); await Guest.inboxDelete(`${g.guestUid}_${st.fid}_${st.year}_${+g.month}_${g.dept}`);
    toast("Misafir taslağı silindi."); return true;
  };
  on("[data-gdel]", async el => { const g = D.gdocs.find(x => x.id === el.dataset.gdel); if (g && await delG(g)) { D.key = ""; render(D.v, D.ctx); } });
  const dOk = d.date && +d.date.slice(0, 4) === +st.year && +d.date.slice(5, 7) === D.month && d.date <= iso(new Date());
  const doSave = async close => {
    if (D.ro || !dOk || c.missing || c.ydMissing || !c.curMarked || (close && !c.canSave)) return;
    const rec = makeRec(c, d);
    let no;
    if (d.edit != null) { const ix = doc.sessions.findIndex(x => x.no === d.edit); no = d.edit; doc.sessions[ix] = { ...doc.sessions[ix], ...rec }; }
    else { no = doc.sessions.length + 1; doc.sessions.push({ no, ...rec, closed: false }); d.edit = no; }
    if (close) { doc.sessions.find(x => x.no === no).closed = true; doc.draft = emptyDraft(defaultDate(st.year, D.month), false); }
    await persist(true); draw();
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
  const approveG = async (g, w, choice = {}) => {
    const F2 = katsayi(D.setup.rows.find(r => r.id === D.dept), D.month), p2 = D.setup.params || DEFAULT_PARAMS, tgt = wkTarget(w.date);
    if (tgt) {
      if (!Object.keys(w.marks || {}).length) { toast("Taslakta işaretlenmiş madde yok."); return false; }
      if (doc.draft.on !== false && doc.draft.edit === tgt.no) mergeGuest(doc.draft, w, choice);
      else {
        const dr = draftFromSession(tgt); mergeGuest(dr, w, choice);
        const cc = calcIsg({ cats: CATS, sessions: doc.sessions.filter(x => x.no !== tgt.no), draft: dr, freqOv: doc.freq, bonusIdx: doc.bonus, F: F2, p: p2 });
        doc.sessions[doc.sessions.findIndex(x => x.no === tgt.no)] = { ...tgt, ...makeRec(cc, dr) };
      }
      await persist(true); await gDone({ ...g, draft: w }, "approved", "", tgt.no);
      toast(`${g.guestName} taslağı ${tgt.no}. denetime (${wkNo(tgt.date)}. hafta) eklendi.`); return true;
    }
    const dr = { ...emptyDraft(w.date, true), ...w };
    const cc = calcIsg({ cats: CATS, sessions: doc.sessions, draft: dr, freqOv: doc.freq, bonusIdx: doc.bonus, F: F2, p: p2 });
    if (!cc.curMarked) { toast("Taslakta işaretlenmiş madde yok."); return false; }
    doc.sessions.push({ no: doc.sessions.length + 1, ...makeRec(cc, dr), closed: true });
    await persist(true); await gDone({ ...g, draft: w }, "approved");
    toast(`${g.guestName} taslağı onaylandı ve ${doc.sessions.length}. denetim olarak eklendi.`); return true;
  };
  const openReview = g => {
    const w = JSON.parse(JSON.stringify(g.draft || {})); w.marks ||= {}; w.notes ||= {}; w.photos ||= {};
    const m = document.createElement("div"); m.className = "mod"; m.style.padding = "2.5vh 2vw";
    const tgt = wkTarget(w.date), editing = !!tgt && doc.draft.on !== false && doc.draft.edit === tgt.no, mc = {};
    const exTexts = id => !tgt ? [] : editing ? (doc.draft.marks[id] === "x" ? (doc.draft.notes[id] || []).filter(t => String(t || "").trim()) : []) : (tgt.fails?.[id] || []);
    const nUnf = () => Object.values(w.marks).filter(x => x === "x").length, nPh = () => Object.values(w.photos).reduce((a, l) => a + l.length, 0);
    const body = () => {
      let h = "";
      CATS.forEach((cat, ci) => {
        const its = cat.items.map((txt, ii) => ({ txt, id: `c${ci}i${ii}` })).filter(x => w.marks[x.id] === "x"); if (!its.length) return;
        const wt = W[cat.w];
        h += `<div style="border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px"><div class="row" style="gap:8px"><b style="font-size:15px">${esc(cat.name)}</b><span class="pill" style="background:${wt[1]};color:${wt[2]}">${wt[0]}</span></div>
          ${its.map(x => { const ns = w.notes[x.id]?.length ? w.notes[x.id] : [""]; return `<div style="display:flex;flex-direction:column;gap:8px;padding-top:10px;border-top:1px dashed var(--line)"><span class="muted" style="font-size:13px">${esc(x.txt)}</span>
            ${(() => { const ex = exTexts(x.id); return ex.length ? `<div style="border:1px solid var(--hbd);border-radius:12px;padding:10px 12px;background:var(--hbg);display:flex;flex-direction:column;gap:8px"><div style="font-size:12.5px;line-height:1.45"><span class="pill" style="background:#D9F1E6;color:#0B6E4F">Aynı madde</span> ${tgt.no}. denetimde bu haftaki kayıt: <b>${esc(ex[0])}</b>${ex.length > 1 ? ` <span class="muted">(+${ex.length - 1})</span>` : ""}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${[["merge", "Birleştir"], ["sep", "Ayrı bulgu"]].map(([v, l]) => `<button type="button" data-mc="${x.id}|${v}" class="${(mc[x.id] || "merge") === v ? "" : "sec"}" style="min-height:38px;height:auto;font-size:13px">${l}</button>`).join("")}</div><div class="muted" style="font-size:12px;line-height:1.4">${(mc[x.id] || "merge") === "merge" ? "Aynı bulgu: açıklama tekrar yazılmaz, misafirin fotoğrafları mevcut bulguya eklenir." : "Farklı bir bulgu: açıklaması aynı maddeye ayrıca eklenir."}</div></div>` : ""; })()}
            ${ns.map((t, k) => `<div style="display:flex;flex-direction:column;gap:6px"><textarea class="inp" rows="2" data-gn="${x.id}|${k}" style="min-height:64px;height:auto;padding:10px;resize:vertical" placeholder="(açıklama yok)">${esc(t)}</textarea>
              <div style="display:flex;flex-wrap:wrap;gap:10px">${(w.photos[x.id + "|" + k] || []).map(p => `<span class="pth" style="width:120px;height:120px"><img src="${p.t}" data-gp="${p.id}" alt="Fotoğraf" style="width:120px;height:120px"><button class="px" data-gpx="${x.id}|${k}|${p.id}" aria-label="Fotoğrafı çıkar" title="Bu fotoğrafı denetimden çıkar">×</button></span>`).join("")}</div></div>`).join("")}</div>`; }).join("")}</div>`;
      });
      return h || '<div class="muted">Uygunsuz madde yok.</div>';
    };
    const draw2 = () => {
      m.innerHTML = `<div class="mbox" style="max-width:none;width:min(96vw,1100px);height:min(95vh,900px);padding:0;gap:0;overflow:hidden">
        <div class="row sp" style="padding:16px 20px;border-bottom:1px solid var(--line);flex-wrap:nowrap"><div style="min-width:0"><b style="font:600 18px Sora,sans-serif">${esc(g.guestName)} · detaylı kontrol</b>
          <div class="muted" style="font-size:12.5px">${w.date ? dmy(w.date) : "—"} · ${Object.keys(w.marks).length} madde işaretli · ${nUnf()} uygunsuz · ${nPh()} fotoğraf · ${esc(D.setup.rows.find(r => r.id === D.dept)?.name || "")}</div>${tgt ? `<div style="font-size:12.5px;margin-top:2px;color:var(--gd);font-weight:600">Onaylanınca ${tgt.no}. denetime (${wkNo(tgt.date)}. hafta) eklenir.</div>` : ""}</div>
          <button data-x aria-label="Kapat" style="flex:0 0 32px;width:32px;height:32px;min-width:0;padding:0;background:#B3261E;border-color:#B3261E;color:#fff;font-size:26px;line-height:1;display:grid;place-items:center;border-radius:8px">×</button></div>
        <div style="flex:1;overflow:auto;padding:16px 20px;display:flex;flex-direction:column;gap:14px">${body()}</div>
        <div style="padding:14px 20px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:10px;align-items:center"><input class="inp" id="gNote" placeholder="Geri gönderirken misafire not (isteğe bağlı)" style="flex:1 1 240px"><button class="sec" data-ret>Geri gönder</button><button class="sec" data-del style="color:#B3261E;border-color:#B3261E">Tamamen sil</button><button data-ok>${tgt ? "Onayla ve bu haftanın denetimine ekle" : "Onayla ve denetime ekle"}</button></div></div>`;
      m.querySelector("[data-x]").onclick = () => m.remove();
      m.querySelectorAll("[data-mc]").forEach(b => b.onclick = () => { const [id, v] = b.dataset.mc.split("|"); mc[id] = v; const el = m.querySelector(".mbox > div:nth-child(2)"), keep = el.scrollTop; draw2(); m.querySelector(".mbox > div:nth-child(2)").scrollTop = keep; });
      m.querySelectorAll("[data-gn]").forEach(t => t.oninput = () => { const [id, k] = t.dataset.gn.split("|"); (w.notes[id] ||= [""])[+k] = t.value; });
      m.querySelectorAll("[data-gpx]").forEach(b => b.onclick = e => { e.stopPropagation(); const [id, k, pid] = b.dataset.gpx.split("|"), key = id + "|" + k; w.photos[key] = (w.photos[key] || []).filter(p => p.id !== pid); const keep = m.querySelector(".mbox > div:nth-child(2)").scrollTop; draw2(); m.querySelector(".mbox > div:nth-child(2)").scrollTop = keep; });
      const all = [...m.querySelectorAll("[data-gp]")];
      all.forEach((im, ix) => im.onclick = () => lightbox(all.map(x => ({ id: x.dataset.gp, t: x.getAttribute("src") })), ix));
      m.querySelector("[data-ok]").onclick = async e => { e.target.disabled = true; try { if (await approveG(g, w, mc)) { m.remove(); D.key = ""; render(D.v, D.ctx); } else e.target.disabled = false; } catch (er) { toast("Onaylanamadı: " + (er.message || er)); e.target.disabled = false; } };
      m.querySelector("[data-del]").onclick = async () => { if (await delG(g)) { m.remove(); D.key = ""; render(D.v, D.ctx); } };
      m.querySelector("[data-ret]").onclick = async e => { e.target.disabled = true; try { await gDone({ ...g, draft: w }, "returned", m.querySelector("#gNote").value.trim()); toast("Taslak düzeltme için geri gönderildi."); m.remove(); D.key = ""; render(D.v, D.ctx); } catch (er) { toast("Gönderilemedi: " + (er.message || er)); e.target.disabled = false; } };
    };
    const lightbox = (list, i0) => {
      let i = i0; const lb = document.createElement("div"); lb.className = "mod"; lb.style.zIndex = 70;
      const show = async () => {
        lb.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;max-width:96vw"><img src="${list[i].t}" alt="Fotoğraf" style="max-width:96vw;max-height:78vh;border-radius:10px;background:#000"><div class="row" style="gap:10px;justify-content:center"><button class="sec" data-p ${list.length < 2 ? "hidden" : ""}>‹ Önceki</button><span style="color:#fff;font-weight:700">${i + 1} / ${list.length}</span><button class="sec" data-n ${list.length < 2 ? "hidden" : ""}>Sonraki ›</button><button data-c>Kapat</button></div></div>`;
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
}
const $ = id => document.getElementById(id);
