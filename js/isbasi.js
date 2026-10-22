// İşbaşı Eğitim · Aylık Giriş
import * as S from "./store.js?v=20261022e";
import { esc, ic, toast, noteEditor, guestLock, roText, GUEST, pickDate, fmtTarih } from "./ui.js?v=20261022e";
import * as Guest from "./guest.js?v=20261022e";
import * as K from "./kayit.js?v=20261022e";
import { katsayi, ztfRamp, rampTol, isbasiZtf, isbasiSayilir, surecVar, kayitAyi, degerAy, ayOf, gunFark, ztfGun, addGun, bandOf, num, c2, MONTHS, DEFAULT_PARAMS } from "./scoring.js?v=20261022e";

const COLL = "isbasi";
const BAND = { Mükemmel: ["#17A06F", "#0B6E4F", "#D9F1E6"], İyi: ["#2A82C4", "#145F96", "#DCEAF7"], Orta: ["#E8A512", "#6B3F00", "#FBE9C6"], Kritik: ["#D6382E", "#B3261E", "#FADAD7"] };
const pad = n => String(n).padStart(2, "0");
export const reset = () => { D.kOpen = false; };
const D = { key: "", month: null, rows: {}, g: [], kOpen: false, exists: false, saved: true, timer: null, msg: "" };
const f1 = n => n.toFixed(1).replace(".", ",");
const isInt = s => /^[0-9]+$/.test(String(s).trim());

/**
 * Verim = min(100, eğitim verilen / işe giriş × 100) × max(0, 1 − (1 − ZTF_ramp) × kZTF) × max(0, 1 − (1 − TC) × kTC)
 * state: 'blank' (veri yok) · 'none' (giriş yok, hesaba katılmaz) · 'bad' (geçersiz/eksik) · 'ok'
 */
export function calcIsbasi(gS, eS, ztf, tc, kZ, kT) {
  const g = String(gS ?? "").trim(), e = String(eS ?? "").trim();
  if (g === "" && e === "") return { state: "blank" };
  if (g !== "" && !isInt(g)) return { state: "bad", why: "İşe giriş tam sayı olmalı" };
  if (g === "") return { state: "bad", why: "İşe giriş sayısını girin" };
  if (+g === 0) return e !== "" && +e > 0 ? { state: "bad", why: "İşe giriş 0 iken eğitim verilen girilemez" } : { state: "none" };
  if (e === "") return { state: "bad", why: "Eğitim verilen sayısını girin (yoksa 0 yazın)" };
  if (!isInt(e)) return { state: "bad", why: "Eğitim verilen tam sayı olmalı" };
  if (+e > +g) return { state: "bad", why: "Eğitim verilen, işe girişten fazla olamaz" };
  const ratio = Math.min(100, +e / +g * 100), fz = Math.max(0, 1 - (1 - ztf) * kZ), ft = Math.max(0, 1 - (1 - tc) * kT);
  return { state: "ok", g: +g, e: +e, ratio, fz, ft, verim: ratio * fz * ft };
}

const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const kt = v => (v === 0 ? "0" : (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(2)))).replace(".", ",");
const aylab = a => MONTHS[+a.slice(5, 7) - 1];
// Kayıt penceresi: işe başlama + eğitim tarihi, işe giriş + eğitim verilen (yan yana); gecikme/devir bilgisi canlı gösterilir
function isbasiDialog({ title, sub, year, month, tol = 0, init = null, okLabel = "Ekle" }) {
  return new Promise(res => {
    const R = K.defDate(year, month), yeni = surecVar(year, month);
    let td = init?.d || R.d, hd = init?.hd || td, hdT = !!init?.hd;
    const lo = addGun(R.min, -45), fld = (id, lbl, v) => `<div class="col1" style="gap:6px;min-width:0"><span class="hd">${lbl}</span><button type="button" class="inp fld" id="${id}" style="padding:0 10px"><span id="${id}t">${fmtTarih(v)}</span>${ic('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>', 16)}</button></div>`;
    const m = document.createElement("div"); m.className = "mod";
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:14px"><h2>${esc(title)}</h2><div class="muted" style="font-size:13.5px;line-height:1.5">${esc(sub)}</div>
      <div style="display:grid;grid-template-columns:${yeni ? "1fr 1fr" : "1fr"};gap:10px">${yeni ? fld("iH", "İŞE BAŞLAMA", hd) : ""}${fld("iT", yeni ? "EĞİTİM TARİHİ" : "TARİH", td)}
        <div class="col1" style="gap:6px;min-width:0"><span class="hd">İŞE GİRİŞ (KİŞİ)</span><input class="inp" id="iG" inputmode="numeric" placeholder="0" autocomplete="off" value="${esc(init?.g ?? "")}"></div>
        <div class="col1" style="gap:6px;min-width:0"><span class="hd">EĞİTİM VERİLEN (KİŞİ)</span><input class="inp" id="iE" inputmode="numeric" placeholder="0" autocomplete="off" value="${esc(init?.e ?? "")}"></div></div>
      <div id="iW" style="min-height:20px;font:italic 600 13.5px Manrope,system-ui,sans-serif;color:#B26A00;line-height:1.45"></div>
      <div class="err" id="iX" style="margin:0;min-height:0"></div>
      <div class="row" style="justify-content:flex-end;gap:8px"><button class="sec" data-x>Vazgeç</button><button data-s>${esc(okLabel)}</button></div></div>`;
    document.body.appendChild(m);
    const q = x => m.querySelector(x), done = v => { m.remove(); res(v); };
    const vals = () => { const g = q("#iG").value.trim(), e = q("#iE").value.trim(); return { g, e, gn: K.isInt(g) ? +g : 0, en: K.isInt(e) ? +e : 0 }; };
    const upd = () => {
      const { gn, en } = vals(); let w = "";
      if (yeni && (gn > 0 || en > 0)) {
        const ra = degerAy(hd), ta = ayOf(td), sm = kayitAyi(hd, td);
        if (en > 0 && ra < ta) w = `${aylab(ra)} girişi; ${aylab(ra)} ayında değerlendirildi, ${aylab(ta)} puanına etkisi yok.`;
        else {
          if (en > 0) { const n = gunFark(hd, td); if (n > 0) w = `Eğitim ${n} gün sonra verildi; zamanlama katsayısı ${kt(Math.min(1, ztfGun(n) + tol))}${n > 5 ? " uygulanır" : ""}.`; }
          if (sm > month) w += (w ? " " : "") + (en > 0 ? `Değerlendirme ${MONTHS[sm - 1]} ayına taşıyor.` : `Eğitim süresi ${MONTHS[sm - 1]} ayına taşıyor; bu giriş ${MONTHS[sm - 1]} ayında değerlendirilir.`);
        }
      }
      q("#iW").textContent = w;
    };
    const pick = async (which) => {
      if (which === "T") { const r = await pickDate({ title: yeni ? "Eğitim tarihi" : "Tarih", min: R.min, max: R.max, a: td, view: td.slice(0, 7) + "-01" }); if (r?.a) { td = r.a; q("#iTt").textContent = fmtTarih(td); if (yeni && hd > td) { hd = td; q("#iHt").textContent = fmtTarih(hd); } } }
      else { const r = await pickDate({ title: "İşe başlama tarihi", min: lo, max: td, a: hd, view: hd.slice(0, 7) + "-01" }); if (r?.a) { hd = r.a; hdT = true; q("#iHt").textContent = fmtTarih(hd); } }
      upd();
    };
    q("#iT").onclick = () => pick("T"); if (yeni) q("#iH").onclick = () => pick("H");
    q("#iG").oninput = upd; q("#iE").oninput = upd; upd();
    q("[data-x]").onclick = () => done(null);
    m.addEventListener("mousedown", e => { if (e.target === m) done(null); });
    q("#iG").focus();
    q("[data-s]").onclick = () => {
      const { g, e, gn, en } = vals(), x = q("#iX");
      if (!K.isInt(g)) { x.textContent = "İşe giriş sayısını tam sayı yazın (yoksa 0)."; return; }
      if (!K.isInt(e)) { x.textContent = "Eğitim verilen sayısını tam sayı yazın (yoksa 0)."; return; }
      if (yeni && gn === 0 && en > 0 && !hdT) { x.textContent = "Eğitim verilen kişilerin işe başlama tarihini seçin."; return; }
      done({ d: td, ...(yeni ? { hd } : {}), g, e });
    };
  });
}

export async function render(v, ctx) {
  const { st } = ctx;
  const setup = await S.getSetup(st.fid, st.year);
  if (!setup?.rows?.length) { v.innerHTML = `<div class="cd"><h2>Önce bölümleri tanımlayın</h2><p class="sub">İşbaşı eğitim girişi için Kurulum ve Kayıtlar sayfasında en az bir bölüm kaydedilmeli.</p><div><a href="#kurulum"><button>Kurulum'a git</button></a></div></div>`; return; }
  if (st.jumpMonth) { D.month = +st.jumpMonth; st.jumpMonth = null; }
  if (!D.month) { const n = new Date(); D.month = +st.year === n.getFullYear() ? n.getMonth() + 1 : 1; }
  const key = [st.fid, st.year, D.month].join("/");
  if (D.key !== key) {
    clearTimeout(D.timer);
    const doc = await S.getMonthDoc(st.fid, st.year, COLL, pad(D.month));
    D.rows = doc?.rows || {}; D.exists = !!doc; D.key = key; D.saved = true; D.msg = "";
    // Eski kayıt (tek kutuda aylık toplam) ilk kayıt olarak korunur
    normRows(D.rows);
  }
  D.g = await K.loadGuest(st.fid, st.year, "isbasi", D.month);
  if (!GUEST.on && D.g.some(x => x.status === "pending")) D.kOpen = true;
  D.ctx = ctx; D.v = v; D.setup = setup; D.ro = String(st.year) !== String(st.active) || guestLock(st.year, D.month);
  draw();
}
// Eski kayıt (tek kutuda aylık toplam) ilk kayıt olarak korunur
const normRows = rows => { Object.values(rows).forEach(x => { if (!x.log) x.log = (String(x.g ?? "").trim() !== "" || String(x.e ?? "").trim() !== "") ? [{ id: "L0", d: "", g: String(x.g ?? "").trim(), e: String(x.e ?? "").trim() }] : []; }); return rows; };
const rowOf = id => (D.rows[id] ||= { g: "", e: "", note: "", log: [] });
// Aylık toplam: sahip kayıtları + onaylı misafir kayıtları (değerlendirme ayı bu ay olanlar); kayıt yoksa boş
const countedIn = (rows, g, id, year, month) => [...(rows[id]?.log || []), ...g.filter(x => x.dept === id && x.status === "approved")].filter(x => isbasiSayilir(x, year, month));
const totOf = a => a.length ? { g: String(a.reduce((t, x) => t + (K.isInt(x.g) ? +x.g : 0), 0)), e: String(a.reduce((t, x) => t + (K.isInt(x.e) ? +x.e : 0), 0)) } : { g: "", e: "" };
const ents = id => countedIn(D.rows, D.g, id, D.ctx.st.year, D.month);
const tg = id => totOf(ents(id));

function summarize(setup, rows, g, year, month) {
  const p = setup.params || DEFAULT_PARAMS, kZ = num(p.egitim.kztf), kT = num(p.egitim.ktc);
  const per = {}; let vs = 0, cnt = 0, out = 0, sg = 0, se = 0;
  setup.rows.forEach(r => {
    const ln = countedIn(rows, g, r.id, year, month), ztf = isbasiZtf(ln, r, p, year, month), tc = num(r.tc);
    const t = totOf(ln), x = calcIsbasi(t.g, t.e, ztf, tc, kZ, kT);
    per[r.id] = { ...x, ztf, tc, needNote: x.state === "ok" && x.verim < 99.995 };
    if (x.state === "ok") { vs += x.verim; cnt++; sg += x.g; se += x.e; } else if (x.state === "none") out++;
  });
  return { per, avg: cnt ? vs / cnt : null, cnt, out, sg, se };
}
const summary = () => summarize(D.setup, D.rows, D.g, D.ctx.st.year, D.month);
// Kaydedilecek ay belgesi (sonuç dahil); başka ayın belgesi için de kullanılır
function buildDoc(setup, rows, g, year, month) {
  const s = summarize(setup, rows, g, year, month), p = setup.params || DEFAULT_PARAMS, r2 = n => (n === undefined ? null : +n.toFixed(3));
  const out = {}; setup.rows.forEach(r => { out[r.id] = { ...(rows[r.id] || { g: "", e: "", note: "", log: [] }), ...totOf(countedIn(rows, g, r.id, year, month)) }; });
  return { rows: out, month: +month, result: { avg: s.avg === null ? null : +s.avg.toFixed(2), band: s.avg === null ? null : bandOf(s.avg, p), hired: s.sg, trained: s.se, counted: s.cnt, outOfScope: s.out,
    per: Object.fromEntries(Object.entries(s.per).map(([k, x]) => [k, { state: x.state, g: x.g ?? null, e: x.e ?? null, ratio: r2(x.ratio) ?? null, ztf: r2(x.ztf), tc: r2(x.tc), fz: r2(x.fz) ?? null, ft: r2(x.ft) ?? null, verim: x.state === "ok" ? r2(x.verim) : null }])) } };
}
// Kayıt başka ayın değerlendirmesine devrediyorsa o ayın belgesine yazılır (kapanmış ay değişmez)
async function addToMonth(month, id, line) {
  const [f, y] = D.key.split("/"), doc = await S.getMonthDoc(f, y, COLL, pad(month)), rows = normRows(doc?.rows || {});
  (rows[id] ||= { g: "", e: "", note: "", log: [] }).log.push(line);
  await S.saveMonthDoc(f, y, COLL, pad(month), buildDoc(D.setup, rows, await K.loadGuest(f, y, "isbasi", month), y, month));
}

function persist(now = false) {
  if (D.ro || GUEST.on) return Promise.resolve();
  D.saved = false; setSv(); clearTimeout(D.timer);
  const run = async () => {
    const [f, y, m] = D.key.split("/");
    try { await S.saveMonthDoc(f, y, COLL, pad(+m), buildDoc(D.setup, D.rows, D.g, y, +m)); D.saved = true; D.exists = true; D.msg = ""; }
    catch (e) { D.msg = "Kaydedilemedi: " + e.message; }
    setSv();
  };
  if (now) return run();
  D.timer = setTimeout(run, 700); return Promise.resolve();
}
const setSv = () => { const e = document.getElementById("sv"); if (e) e.textContent = D.msg || (D.saved ? (D.exists ? "Kayıtlı" : "Bu ay henüz kaydedilmedi") : "Kaydediliyor…"); };
const $ = id => document.getElementById(id);

// Çakışma: aynı bölümde yetkili kaydı (0/0 "yok" dahil) veya başka misafir kaydı varsa
function conflictOf(x) {
  const Y = D.ctx.st.year, sy = y => isbasiSayilir(y, Y, D.month); if (!sy(x)) return null;
  const own = rowOf(x.dept).log.filter(sy), gs = D.g.filter(y => y.dept === x.dept && y.id !== x.id && y.status === "approved" && sy(y)), pend = D.g.filter(y => y.dept === x.dept && y.id !== x.id && y.status === "pending" && sy(y));
  const all = [...own, ...gs, ...pend]; if (!all.length) return null;
  const sum = k => all.reduce((t, y) => t + (K.isInt(y[k]) ? +y[k] : 0), 0), g = sum("g"), e = sum("e");
  // Tamamlayıcı eğitim (işe giriş 0, yalnızca eğitim): önceki girişlere ait eğitimdir; toplam işe girişi aşmıyorsa çakışma değildir
  const gg = K.isInt(x.g) ? +x.g : 0, ee = K.isInt(x.e) ? +x.e : 0;
  if (gg === 0 && ee > 0) {
    if (e + ee <= g) return null;
    return { info: true, txt: `Toplam eğitim (${e + ee}) işe girişi (${g}) aşıyor; onaylarsanız bölüm "Geçersiz" görünür`, own: [], gs: [], warn: "" };
  }
  const mevcut = g === 0 && e === 0 ? "yok (0 giriş / 0 eğitim)" : `${g} giriş / ${e} eğitim`;
  return { txt: `Mevcut kayıt: ${mevcut} · Misafir: ${K.isInt(x.g) ? x.g : 0} giriş / ${K.isInt(x.e) ? x.e : 0} eğitim`, own: own.map(y => [x.dept, y.id]), gs,
    warn: "Bu bölümdeki mevcut yetkili ve onaylı misafir kayıtları aylık toplamdan çıkarılır; yalnızca bu misafir kaydı geçerli olur." };
}
function items() {
  const Y = D.ctx.st.year, nm = id => D.setup.rows.find(r => r.id === id)?.name || "—", out = [], tx = x => `${K.isInt(x.g) ? x.g : 0} giriş · ${K.isInt(x.e) ? x.e : 0} eğitim` + (isoOk(x) ? ` · işe başlama ${fmtTarih(x.hd)}` : ""), isoOk = x => /^\d{4}-\d{2}-\d{2}$/.test(x.hd || "") && x.hd !== x.d;
  const tip = x => isbasiSayilir(x, Y, D.month) ? "" : `${MONTHS[+degerAy(x.hd).slice(5, 7) - 1]} girişi; ${MONTHS[+degerAy(x.hd).slice(5, 7) - 1]} ayında değerlendirildi, bu aya etkisi yok.`;
  D.setup.rows.forEach(r => rowOf(r.id).log.forEach(x => out.push({ key: `o:${r.id}:${x.id}`, dept: nm(r.id), text: tx(x), d: x.d, who: x.id === "L0" ? "Önceki kayıt" : "Yetkili", st: "own", tip: tip(x), edited: x.dz || "", edit: !GUEST.on && !D.ro, del: !GUEST.on && !D.ro })));
  D.g.forEach(x => { const mine = GUEST.on && x.guestUid === GUEST.uid; if (GUEST.on && !mine && x.status !== "approved") return;
    out.push({ key: `g:${x.id}`, dept: nm(x.dept), text: tx(x), d: x.d, who: x.guestName || "Misafir", st: x.status, tip: tip(x), note: x.status === "rejected" ? x.ownerNote || "" : "", appr: !GUEST.on && !D.ro && x.status === "pending", conf: x.status === "pending" && !GUEST.on ? conflictOf(x)?.txt : "", info: x.status === "pending" && !GUEST.on ? !!conflictOf(x)?.info : false, del: GUEST.on ? mine && x.status === "pending" : !D.ro }); });
  return out;
}
function draw() {
  const { st } = D.ctx, v = D.v, p = D.setup.params || DEFAULT_PARAMS, s = summary();
  const sb = s.avg === null ? null : BAND[bandOf(s.avg, p)];
  const grid = "90px 100px 110px 90px 90px 90px 90px 90px 150px";
  v.innerHTML = `
  <div class="row sp"><div><h1 class="ttl">İşbaşı Eğitim · Aylık Giriş</h1>
    <div class="sub">İşe giren kişi sayısını ve kendilerine verilen eğitimi ekleyin. ${surecVar(st.year, D.month) ? "Gecikme (ZTF) kayıtlardaki işe başlama ve eğitim tarihlerinden hesaplanır; düzensizlik (TC) Kurulum değerinden gelir." : "Gecikme (ZTF) ve düzensizlik (TC) etkisi Kurulum değerlerinden uygulanır."}</div>
    <div class="muted" style="font-size:12.5px" id="sv">${D.msg || (D.saved ? (D.exists ? "Kayıtlı" : "Bu ay henüz kaydedilmedi") : "Kaydediliyor…")}</div></div>
    <select id="ay" class="inp" style="width:auto;min-width:170px;font-weight:600">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === D.month ? "selected" : ""}>${m} ${st.year}</option>`).join("")}</select></div>
  ${D.ro ? `<div class="warn">${roText(st.year, D.month, st.active)}</div>` : ""}
  <div class="row" style="gap:16px;align-items:stretch">
    <div class="save" style="flex:1 1 220px;padding:20px;gap:8px"><span class="hd" style="color:#9DB5AE;letter-spacing:.8px">TESİS İŞBAŞI EĞİTİM VERİMİ</span>
      <div class="row" style="gap:12px"><b style="font:700 40px Sora,sans-serif;letter-spacing:-1px;color:#fff">${s.avg === null ? "–" : f1(s.avg)}</b><span class="pill" style="background:${sb ? sb[2] : "#EEF2F0"};color:${sb ? sb[1] : "#4A5C57"}">${s.avg === null ? "Veri yok" : bandOf(s.avg, p)}</span></div></div>
    <div class="cd" style="flex:1 1 220px;padding:20px;gap:8px"><span class="hd" style="letter-spacing:.8px">İŞE GİRİŞ / EĞİTİM VERİLEN</span><b style="font:700 32px Sora,sans-serif">${s.sg} / ${s.se}</b></div>
    <div class="cd" style="flex:1 1 220px;padding:20px;gap:8px"><span class="hd" style="letter-spacing:.8px">DEĞERLENDİRME DIŞI BÖLÜM</span><b style="font:700 32px Sora,sans-serif">${s.out}</b></div></div>
  <fieldset class="fs" ${D.ro ? "disabled" : ""}><div class="cd"><div><h2>Bölüm Bazında İşbaşı Eğitim</h2>
    <div class="muted" style="font-size:13px;line-height:1.5">İşe giriş ve eğitim verilen kişi sayısını + düğmesiyle ekleyin; aylık toplam eklenen kayıtların toplamıdır. Verim = eğitim oranı × gecikme faktörü (ZTF) × düzensizlik faktörü (TC). İşe giriş olmayan bölüm (0) "Giriş yok" olur ve toplama katılmaz; kayıt eklenmeyen bölüm de hesaba katılmaz.${surecVar(st.year, D.month) ? " Eğitim 5 gün içinde verilirse ZTF kaybı olmaz; her kişi, işe başlamasından 10 gün sonraki ayda değerlendirilir (ayın son 10 gününde başlayanlar sonraki aya devredilir)." : ""}</div></div>
    <div class="tbl"><div class="tin" style="min-width:980px">
      <div class="ig" style="grid-template-columns:${grid}"><span class="hd">Bölüm</span><span class="hd">İşe giriş</span><span class="hd">Eğitim verilen</span><span class="hd">Eğitim oranı</span><span class="hd">ZTF (ramp tol.)</span><span class="hd">TC</span><span class="hd">ZTF faktörü</span><span class="hd">TC faktörü</span><span class="hd">Verim</span></div>
      ${D.setup.rows.map(r => {
        const x = s.per[r.id], row = rowOf(r.id), ok = x.state === "ok", band = ok ? bandOf(x.verim, p) : null, b = band ? BAND[band] : ["#D5E0DC", "#4A5C57", "#EEF2F0"];
        const label = band || (x.state === "none" ? "Giriş yok" : x.state === "bad" ? "Geçersiz" : "Veri yok"), miss = x.needNote && !row.note.trim();
        return `<div class="col1" style="gap:8px;padding:8px 0;border-top:1px solid var(--line)"><div class="ig" style="grid-template-columns:${grid}"><b>${esc(r.name)}</b>
          <b style="${x.state === "bad" ? "color:#B3261E" : ""}">${tg(r.id).g === "" ? "–" : esc(tg(r.id).g)}</b>
          <div class="row" style="gap:8px;flex-wrap:nowrap"><b style="min-width:20px;${x.state === "bad" ? "color:#B3261E" : ""}">${tg(r.id).e === "" ? "–" : esc(tg(r.id).e)}</b><button type="button" class="sm sec" data-add="${r.id}" aria-label="Giriş ekle" title="Giriş ekle" ${D.ro ? "disabled" : ""} style="flex:0 0 36px;width:36px;height:36px;min-height:0;padding:0;font-size:20px;line-height:1">+</button></div>
          <b>${ok ? f1(x.ratio) : "–"}</b><span class="calc">${c2(x.ztf)}</span><span class="calc">${c2(x.tc)}</span><span>${ok ? c2(x.fz) : "–"}</span><span>${ok ? c2(x.ft) : "–"}</span>
          <div class="row" style="gap:8px;flex-wrap:nowrap"><b style="min-width:42px">${ok ? f1(x.verim) : "–"}</b><span class="pill" style="background:${b[2]};color:${b[1]}">${label}</span></div></div>
          ${x.state === "bad" ? `<div style="color:#B3261E;font-size:12.5px;font-weight:600">${esc(x.why)}</div>` : ""}
          ${x.needNote ? `<div class="xbox" style="gap:6px;padding:10px 12px"><span class="hd">AÇIKLAMA · Verim neden düştü? (gecikme, yüksek sirkülasyon, eğitim verilememesi)</span>
            <button class="nb" style="width:100%;border-color:${miss ? "#D6382E" : "#C3D1CC"}" data-note="${r.id}" aria-label="Açıklamayı yaz veya düzenle"><span class="nt" style="color:${miss ? "#8A6A66" : "var(--text)"}">${esc(miss ? "Dokunun ve yazın: verim neden düştü?" : row.note)}</span>${ic('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>', 18)}</button></div>` : ""}</div>`;
      }).join("")}</div></div>
    <div class="muted" style="font-size:12.5px;line-height:1.6">${surecVar(st.year, D.month) ? "ZTF, kayıtlardaki tarihlerden hesaplanır (tarihi olmayan eski kayıtlarda Kurulum değeri kullanılır)." : "ZTF (eğitimin tamamlandığı gün)"} TC (kalıcılık / düzensizlik) değeri Kurulum sayfasından gelir. Yüksek personel sirkülasyonu bölümdeki düzensizliğin göstergesi olarak puana yansır.</div></div>
  <div class="cd" style="flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between;padding:18px 20px">
    <div class="muted" style="max-width:700px;line-height:1.5">Açıklamalar raporda İşbaşı Eğitim grafiğinin altında bölüm adıyla yayınlanır. Değişiklikler otomatik kaydedilir.</div>
    <button class="big" id="saveK" ${GUEST.on ? 'style="display:none"' : ""}>${MONTHS[D.month - 1]} Verilerini Kaydet</button></div></fieldset>
  ${K.listCard(items(), D.kOpen, !GUEST.on)}`;
  const re = () => { draw(); persist(); };
  $("ay").onchange = e => { D.month = +e.target.value; render(D.v, D.ctx); };
  if (GUEST.on) v.querySelectorAll("[data-note]").forEach(b => { b.disabled = true; });
  const devirMsg = sm => `Kayıt ${MONTHS[sm - 1]} ayına devredildi; orada değerlendirilir.`;
  v.querySelectorAll("[data-add]").forEach(b => b.onclick = async () => {
    const id = b.dataset.add, r0 = D.setup.rows.find(r => r.id === id), name = r0.name, Y = D.ctx.st.year, yeni = surecVar(Y, D.month);
    const a = await isbasiDialog({ title: `İşbaşı eğitim ekle · ${name}`, sub: (GUEST.on ? "Kaydınız yetkili onayından sonra aylık toplama eklenir. " : "") + (yeni ? "Aynı gün işe başlayıp aynı gün eğitilen kişiler tek satır olur. Daha önce girilenlerin eğitimini tamamlıyorsanız işe girişe 0 yazın, işe başlama tarihini seçin." : "Ay toplamına eklenir. Daha önce girilen kişilerin eğitimini tamamlıyorsanız işe girişe 0, eğitime yeni verilen sayıyı yazın. Giriş yoksa ikisine de 0 yazın."), year: Y, month: D.month, tol: rampTol(r0, D.setup.params || DEFAULT_PARAMS) });
    if (!a) return;
    const sm = yeni ? kayitAyi(a.hd, a.d) : D.month;
    if (!GUEST.on) {
      const line = { id: K.eid(), d: a.d, ...(a.hd ? { hd: a.hd } : {}), g: a.g, e: a.e };
      if (sm === D.month) { rowOf(id).log.push(line); re(); return; }
      try { await addToMonth(sm, id, line); toast(devirMsg(sm)); } catch (e) { toast("Kaydedilemedi: " + (e.message || e)); }
      return;
    }
    const gid = `${pad(sm)}_${id}_${GUEST.uid}_${Date.now().toString(36)}`;
    try {
      await S.saveMonthDoc(D.ctx.st.fid, Y, "isbasig", gid, { guestUid: GUEST.uid, guestName: GUEST.name, dept: id, month: sm, d: a.d, ...(a.hd ? { hd: a.hd } : {}), g: a.g, e: a.e, status: "pending", at: Date.now() });
      D.g = await K.loadGuest(D.ctx.st.fid, Y, "isbasi", D.month); D.kOpen = true; draw(); toast(sm === D.month ? "Kaydınız iletildi; yetkili onaylayınca toplama eklenir." : `Kaydınız iletildi; ${MONTHS[sm - 1]} ayına devredildi, yetkili onaylayınca değerlendirilir.`);
      Guest.pushOwner("HSE Verim · İşbaşı eğitim", `${GUEST.name} · ${name}: ${a.g} giriş / ${a.e} eğitim eklemek istiyor.`);
    } catch (e) { toast("Gönderilemedi: " + (e.message || e)); }
  });
  $("kTg")?.addEventListener("click", () => { D.kOpen = !D.kOpen; draw(); });
  v.querySelectorAll("[data-ka]").forEach(b => b.onclick = async () => {
    const act = b.dataset.ka, key = b.dataset.kk, { fid, year } = D.ctx.st;
    try {
      if (key.startsWith("o:") && act === "edit") {
        const [, id, eid] = key.split(":"), old = rowOf(id).log.find(x => x.id === eid); if (!old) return; const r0 = D.setup.rows.find(r => r.id === id), Y = D.ctx.st.year, yeni = surecVar(Y, D.month);
        const a = await isbasiDialog({ title: `Kaydı düzenle · ${r0.name}`, sub: "Değişiklik kaydın altında \"Düzeltildi\" olarak görünür.", year: Y, month: D.month, tol: rampTol(r0, D.setup.params || DEFAULT_PARAMS), okLabel: "Kaydet", init: { d: old.d || undefined, hd: old.hd, g: old.g, e: old.e } });
        if (!a) return; const line = { id: eid, d: a.d, ...(a.hd ? { hd: a.hd } : {}), g: a.g, e: a.e, dz: iso(new Date()) }, sm = yeni ? kayitAyi(a.hd, a.d) : D.month;
        if (sm !== D.month) { await addToMonth(sm, id, line); toast(devirMsg(sm)); }
        rowOf(id).log = rowOf(id).log.filter(x => x.id !== eid); if (sm === D.month) rowOf(id).log.push(line);
        re(); return;
      }
      if (key.startsWith("o:")) { if (!(await K.confirmBox("Kayıt silinsin mi?", "Bu kayıt aylık toplamdan çıkarılır.", "Sil", true))) return; const [, id, eid] = key.split(":"); rowOf(id).log = rowOf(id).log.filter(x => x.id !== eid); re(); return; }
      const gk = key.slice(2), g = D.g.find(x => x.id === gk); if (!g) return;
      let note = ""; if (act === "no") { note = await K.noteDialog(); if (note === null) return; }
      if (act === "use") {
        const c = conflictOf(g) || { own: [], gs: [], warn: "Mevcut kayıt bulunamadı; yalnızca bu kayıt onaylanır." }; if (!(await K.confirmBox("Misafirinkini kullan?", c.warn, "Evet, değiştir", true))) return;
        c.own.forEach(([id, eid]) => { rowOf(id).log = rowOf(id).log.filter(x => x.id !== eid); });
        for (const o of c.gs) { const { id: _o, ...r0 } = o; await S.saveMonthDoc(fid, year, "isbasig", o.id, { ...r0, status: "rejected" }); }
        const { id: _i, ...rest } = g; await S.saveMonthDoc(fid, year, "isbasig", gk, { ...rest, status: "approved" });
      } else if (act === "del") { if (!(await K.confirmBox("Kayıt silinsin mi?", "Bu kayıt kalıcı olarak silinir.", "Sil", true))) return; await S.deleteMonthDoc(fid, year, "isbasig", gk); }
      else { const { id: _i, ...rest } = g; await S.saveMonthDoc(fid, year, "isbasig", gk, { ...rest, status: act === "ok" ? "approved" : "rejected", ...(act === "no" ? { ownerNote: note } : {}) }); }
      D.g = await K.loadGuest(fid, year, "isbasi", D.month); draw(); persist(true);
    } catch (e) { toast("İşlem yapılamadı: " + (e.message || e)); }
  });
  v.querySelectorAll("[data-note]").forEach(b => b.onclick = async () => {
    const id = b.dataset.note, name = D.setup.rows.find(r => r.id === id).name;
    const r = await noteEditor({ title: `Açıklama · ${name}`, item: "Verim neden düştü? (gecikme, yüksek sirkülasyon, eğitim verilememesi)", text: rowOf(id).note, question: "Verim neden düştü?" , example: "Örn. Yüksek sirkülasyon nedeniyle yeni girişlere eğitim verilemedi; 3 kişi eğitim bekliyor." });
    if (r === null) return; rowOf(id).note = r; re();
  });
  $("saveK").onclick = async () => {
    await persist(true); draw();
    const miss = D.setup.rows.filter(r => s.per[r.id].needNote && !rowOf(r.id).note.trim()).length, bad = D.setup.rows.filter(r => s.per[r.id].state === "bad").length;
    toast(D.msg ? D.msg : bad ? `Kaydedildi, ancak ${bad} bölümde geçersiz giriş var; bu bölümler hesaba katılmadı.` : miss ? `${MONTHS[D.month - 1]} verileri kaydedildi. ${miss} bölümde açıklama eksik.` : `${MONTHS[D.month - 1]} ${D.ctx.st.year} verileri kaydedildi. Grafikler ve rapor güncellendi.`);
  };
}
