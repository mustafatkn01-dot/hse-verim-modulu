// İşbaşı Eğitim · Aylık Giriş
import * as S from "./store.js?v=20261011e";
import { esc, ic, toast, noteEditor, guestLock, roText } from "./ui.js?v=20261011e";
import { katsayi, ztfRamp, bandOf, num, c2, MONTHS, DEFAULT_PARAMS } from "./scoring.js?v=20261011e";

const COLL = "isbasi";
const BAND = { Mükemmel: ["#17A06F", "#0B6E4F", "#D9F1E6"], İyi: ["#2A82C4", "#145F96", "#DCEAF7"], Orta: ["#E8A512", "#6B3F00", "#FBE9C6"], Kritik: ["#D6382E", "#B3261E", "#FADAD7"] };
const pad = n => String(n).padStart(2, "0");
const D = { key: "", month: null, rows: {}, exists: false, saved: true, timer: null, msg: "" };
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

export async function render(v, ctx) {
  const { st } = ctx;
  const setup = await S.getSetup(st.fid, st.year);
  if (!setup?.rows?.length) { v.innerHTML = `<div class="cd"><h2>Önce bölümleri tanımlayın</h2><p class="sub">İşbaşı eğitim girişi için Kurulum ve Kayıtlar sayfasında en az bir bölüm kaydedilmeli.</p><div><a href="#kurulum"><button>Kurulum'a git</button></a></div></div>`; return; }
  if (!D.month) { const n = new Date(); D.month = +st.year === n.getFullYear() ? n.getMonth() + 1 : 1; }
  const key = [st.fid, st.year, D.month].join("/");
  if (D.key !== key) {
    clearTimeout(D.timer);
    const doc = await S.getMonthDoc(st.fid, st.year, COLL, pad(D.month));
    D.rows = doc?.rows || {}; D.exists = !!doc; D.key = key; D.saved = true; D.msg = "";
  }
  D.ctx = ctx; D.v = v; D.setup = setup; D.ro = String(st.year) !== String(st.active) || guestLock(st.year, D.month);
  draw();
}
const rowOf = id => (D.rows[id] ||= { g: "", e: "", note: "" });

function summary() {
  const p = D.setup.params || DEFAULT_PARAMS, kZ = num(p.egitim.kztf), kT = num(p.egitim.ktc);
  const per = {}; let vs = 0, cnt = 0, out = 0, sg = 0, se = 0;
  D.setup.rows.forEach(r => {
    const row = rowOf(r.id), ztf = ztfRamp(r, p), tc = num(r.tc);
    const x = calcIsbasi(row.g, row.e, ztf, tc, kZ, kT);
    per[r.id] = { ...x, ztf, tc, needNote: x.state === "ok" && x.verim < 99.995 };
    if (x.state === "ok") { vs += x.verim; cnt++; sg += x.g; se += x.e; } else if (x.state === "none") out++;
  });
  return { per, avg: cnt ? vs / cnt : null, cnt, out, sg, se };
}

function persist(now = false) {
  if (D.ro) return Promise.resolve();
  D.saved = false; setSv(); clearTimeout(D.timer);
  const run = async () => {
    const [f, y, m] = D.key.split("/"), s = summary(), p = D.setup.params || DEFAULT_PARAMS;
    const rows = {}; D.setup.rows.forEach(r => { rows[r.id] = rowOf(r.id); });
    const r2 = n => (n === undefined ? null : +n.toFixed(3));
    try {
      await S.saveMonthDoc(f, y, COLL, pad(+m), { rows, month: +m, result: { avg: s.avg === null ? null : +s.avg.toFixed(2), band: s.avg === null ? null : bandOf(s.avg, p), hired: s.sg, trained: s.se, counted: s.cnt, outOfScope: s.out,
        per: Object.fromEntries(Object.entries(s.per).map(([k, x]) => [k, { state: x.state, g: x.g ?? null, e: x.e ?? null, ratio: r2(x.ratio) ?? null, ztf: r2(x.ztf), tc: r2(x.tc), fz: r2(x.fz) ?? null, ft: r2(x.ft) ?? null, verim: x.state === "ok" ? r2(x.verim) : null }])) } });
      D.saved = true; D.exists = true; D.msg = "";
    } catch (e) { D.msg = "Kaydedilemedi: " + e.message; }
    setSv();
  };
  if (now) return run();
  D.timer = setTimeout(run, 700); return Promise.resolve();
}
const setSv = () => { const e = document.getElementById("sv"); if (e) e.textContent = D.msg || (D.saved ? (D.exists ? "Kayıtlı" : "Bu ay henüz kaydedilmedi") : "Kaydediliyor…"); };
const $ = id => document.getElementById(id);

function draw() {
  const { st } = D.ctx, v = D.v, p = D.setup.params || DEFAULT_PARAMS, s = summary();
  const sb = s.avg === null ? null : BAND[bandOf(s.avg, p)];
  const grid = "90px 100px 110px 90px 90px 90px 90px 90px 150px";
  v.innerHTML = `
  <div class="row sp"><div><h1 class="ttl">İşbaşı Eğitim · Aylık Giriş</h1>
    <div class="sub">İşe giren kişi sayısını ve kendilerine verilen eğitimi girin. Gecikme (ZTF) ve düzensizlik (TC) etkisi Kurulum değerlerinden otomatik uygulanır.</div>
    <div class="muted" style="font-size:12.5px" id="sv">${D.msg || (D.saved ? (D.exists ? "Kayıtlı" : "Bu ay henüz kaydedilmedi") : "Kaydediliyor…")}</div></div>
    <select id="ay" class="inp" style="width:auto;min-width:170px;font-weight:600">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === D.month ? "selected" : ""}>${m} ${st.year}</option>`).join("")}</select></div>
  ${D.ro ? `<div class="warn">${roText(st.year, D.month, st.active)}</div>` : ""}
  <div class="row" style="gap:16px;align-items:stretch">
    <div class="save" style="flex:1 1 220px;padding:20px;gap:8px"><span class="hd" style="color:#9DB5AE;letter-spacing:.8px">TESİS İŞBAŞI EĞİTİM VERİMİ</span>
      <div class="row" style="gap:12px"><b style="font:700 40px Sora,sans-serif;letter-spacing:-1px;color:#fff">${s.avg === null ? "–" : f1(s.avg)}</b><span class="pill" style="background:${sb ? sb[2] : "#EEF2F0"};color:${sb ? sb[1] : "#4A5C57"}">${s.avg === null ? "Veri yok" : bandOf(s.avg, p)}</span></div></div>
    <div class="cd" style="flex:1 1 220px;padding:20px;gap:8px"><span class="hd" style="letter-spacing:.8px">İŞE GİRİŞ / EĞİTİM VERİLEN</span><b style="font:700 32px Sora,sans-serif">${s.sg} / ${s.se}</b></div>
    <div class="cd" style="flex:1 1 220px;padding:20px;gap:8px"><span class="hd" style="letter-spacing:.8px">DEĞERLENDİRME DIŞI BÖLÜM</span><b style="font:700 32px Sora,sans-serif">${s.out}</b></div></div>
  <fieldset class="fs" ${D.ro ? "disabled" : ""}><div class="cd"><div><h2>Bölüm Bazında İşbaşı Eğitim</h2>
    <div class="muted" style="font-size:13px;line-height:1.5">İşe giriş ve eğitim verilen kişi sayısını girin. Verim = eğitim oranı × gecikme faktörü (ZTF) × düzensizlik faktörü (TC). İşe giriş olmayan bölüm (0) "Giriş yok" olur ve toplama katılmaz; boş bırakılan bölüm de hesaba katılmaz.</div></div>
    <div class="tbl"><div class="tin" style="min-width:980px">
      <div class="ig" style="grid-template-columns:${grid}"><span class="hd">Bölüm</span><span class="hd">İşe giriş</span><span class="hd">Eğitim verilen</span><span class="hd">Eğitim oranı</span><span class="hd">ZTF (ramp tol.)</span><span class="hd">TC</span><span class="hd">ZTF faktörü</span><span class="hd">TC faktörü</span><span class="hd">Verim</span></div>
      ${D.setup.rows.map(r => {
        const x = s.per[r.id], row = rowOf(r.id), ok = x.state === "ok", band = ok ? bandOf(x.verim, p) : null, b = band ? BAND[band] : ["#D5E0DC", "#4A5C57", "#EEF2F0"];
        const label = band || (x.state === "none" ? "Giriş yok" : x.state === "bad" ? "Geçersiz" : "Veri yok"), miss = x.needNote && !row.note.trim();
        return `<div class="col1" style="gap:8px;padding:8px 0;border-top:1px solid var(--line)"><div class="ig" style="grid-template-columns:${grid}"><b>${esc(r.name)}</b>
          <input class="inp" data-g="${r.id}" inputmode="numeric" value="${esc(row.g)}" aria-label="İşe giriş sayısı" placeholder="0" style="${x.state === "bad" ? "border-color:#D6382E" : ""}">
          <input class="inp" data-e="${r.id}" inputmode="numeric" value="${esc(row.e)}" aria-label="Eğitim verilen sayısı" placeholder="0" style="${x.state === "bad" ? "border-color:#D6382E" : ""}">
          <b>${ok ? f1(x.ratio) : "–"}</b><span class="calc">${c2(x.ztf)}</span><span class="calc">${c2(x.tc)}</span><span>${ok ? c2(x.fz) : "–"}</span><span>${ok ? c2(x.ft) : "–"}</span>
          <div class="row" style="gap:8px;flex-wrap:nowrap"><b style="min-width:42px">${ok ? f1(x.verim) : "–"}</b><span class="pill" style="background:${b[2]};color:${b[1]}">${label}</span></div></div>
          ${x.state === "bad" ? `<div style="color:#B3261E;font-size:12.5px;font-weight:600">${esc(x.why)}</div>` : ""}
          ${x.needNote ? `<div class="xbox" style="gap:6px;padding:10px 12px"><span class="hd">AÇIKLAMA · Verim neden düştü? (gecikme, yüksek sirkülasyon, eğitim verilememesi)</span>
            <button class="nb" style="width:100%;border-color:${miss ? "#D6382E" : "#C3D1CC"}" data-note="${r.id}" aria-label="Açıklamayı yaz veya düzenle"><span class="nt" style="color:${miss ? "#8A6A66" : "var(--text)"}">${esc(miss ? "Dokunun ve yazın: verim neden düştü?" : row.note)}</span>${ic('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>', 18)}</button></div>` : ""}</div>`;
      }).join("")}</div></div>
    <div class="muted" style="font-size:12.5px;line-height:1.6">ZTF (eğitimin tamamlandığı gün) ve TC (kalıcılık / düzensizlik) değerleri Kurulum sayfasından gelir. Yüksek personel sirkülasyonu bölümdeki düzensizliğin göstergesi olarak puana yansır.</div></div>
  <div class="cd" style="flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between;padding:18px 20px">
    <div class="muted" style="max-width:700px;line-height:1.5">Açıklamalar raporda İşbaşı Eğitim grafiğinin altında bölüm adıyla yayınlanır. Değişiklikler otomatik kaydedilir.</div>
    <button class="big" id="saveK">${MONTHS[D.month - 1]} Verilerini Kaydet</button></div></fieldset>`;
  const re = () => { draw(); persist(); };
  $("ay").onchange = e => { D.month = +e.target.value; render(D.v, D.ctx); };
  v.querySelectorAll("[data-g]").forEach(el => el.onchange = () => { rowOf(el.dataset.g).g = el.value.trim(); re(); });
  v.querySelectorAll("[data-e]").forEach(el => el.onchange = () => { rowOf(el.dataset.e).e = el.value.trim(); re(); });
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
