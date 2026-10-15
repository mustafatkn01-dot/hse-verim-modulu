// Eğitim Konuşması · Aylık Giriş
import * as S from "./store.js?v=20261015h";
import { esc, ic, toast, noteEditor, guestLock, roText, GUEST } from "./ui.js?v=20261015h";
import * as Guest from "./guest.js?v=20261015h";
import * as K from "./kayit.js?v=20261015h";
import { katsayi, nAt, bandOf, num, MONTHS, DEFAULT_PARAMS } from "./scoring.js?v=20261015h";

const COLL = "konusma";
const BAND = { Mükemmel: ["#17A06F", "#0B6E4F", "#D9F1E6"], İyi: ["#2A82C4", "#145F96", "#DCEAF7"], Orta: ["#E8A512", "#6B3F00", "#FBE9C6"], Kritik: ["#D6382E", "#B3261E", "#FADAD7"] };
const pad = n => String(n).padStart(2, "0");
export const reset = () => { D.kOpen = false; };
const D = { key: "", month: null, rows: {}, g: [], kOpen: false, exists: false, saved: true, timer: null, msg: "" };
const f1 = n => n.toFixed(1).replace(".", ",");

// Verim = min(100, gerçekleşen dk / (çalışan × hedef dk × bölüm katsayısı) × 100); boş girdi hesaba katılmaz
export function calcKonusma(minStr, n, hedef, F) {
  const goal = (parseInt(n, 10) || 0) * hedef * F;
  const raw = String(minStr ?? "").trim();
  const m = raw === "" ? null : num(raw);
  const has = m !== null && m >= 0 && goal > 0 && /^[0-9]+([.,][0-9]+)?$/.test(raw);
  return { goal, has, min: has ? m : null, pct: has ? Math.min(100, m / goal * 100) : null };
}

export async function render(v, ctx) {
  const { st } = ctx;
  const setup = await S.getSetup(st.fid, st.year);
  if (!setup?.rows?.length) { v.innerHTML = `<div class="cd"><h2>Önce bölümleri tanımlayın</h2><p class="sub">Eğitim konuşması girişi için Kurulum ve Kayıtlar sayfasında en az bir bölüm kaydedilmeli.</p><div><a href="#kurulum"><button>Kurulum'a git</button></a></div></div>`; return; }
  if (!D.month) { const n = new Date(); D.month = +st.year === n.getFullYear() ? n.getMonth() + 1 : 1; }
  const key = [st.fid, st.year, D.month].join("/");
  if (D.key !== key) {
    clearTimeout(D.timer);
    const doc = await S.getMonthDoc(st.fid, st.year, COLL, pad(D.month));
    D.rows = doc?.rows || {}; D.exists = !!doc; D.key = key; D.saved = true; D.msg = "";
    // Eski kayıt (tek kutuda aylık toplam) ilk kayıt olarak korunur
    Object.values(D.rows).forEach(x => { if (!x.log) x.log = String(x.min ?? "").trim() !== "" ? [{ id: "L0", d: "", min: String(x.min).trim() }] : []; });
  }
  D.g = await K.loadGuest(st.fid, st.year, "konusma", D.month);
  D.ctx = ctx; D.v = v; D.setup = setup; D.ro = String(st.year) !== String(st.active) || guestLock(st.year, D.month);
  draw();
}
const rowOf = id => (D.rows[id] ||= { min: "", note: "", log: [] });
// Aylık toplam: sahip kayıtları + onaylı misafir kayıtları (geçerli sayılar); kayıt yoksa boş
const ents = id => [...rowOf(id).log.filter(x => K.isNum(x.min)).map(x => x.min), ...D.g.filter(x => x.dept === id && x.status === "approved" && K.isNum(x.min)).map(x => x.min)];
const tm = id => { const a = ents(id); return a.length ? String(Math.round(a.reduce((t, x) => t + K.toNum(x), 0) * 100) / 100) : ""; };
const target = () => num((D.setup.params || DEFAULT_PARAMS).egitim.hedef) || 10;

function summary() {
  const out = {}; let vs = 0, cnt = 0, hit = 0, tot = 0;
  D.setup.rows.forEach(r => {
    const x = calcKonusma(tm(r.id), nAt(r, D.month), target(), katsayi(r, D.month));
    out[r.id] = { ...x, F: +katsayi(r, D.month).toFixed(2) };
    if (x.has) { vs += x.pct; cnt++; tot += x.min; if (x.pct >= 100) hit++; }
  });
  return { per: out, avg: cnt ? vs / cnt : null, cnt, hit, tot };
}

function persist(now = false) {
  if (D.ro || GUEST.on) return Promise.resolve();
  D.saved = false; setSv(); clearTimeout(D.timer);
  const run = async () => {
    const [f, y, m] = D.key.split("/"), s = summary(), p = D.setup.params || DEFAULT_PARAMS;
    const rows = {}; D.setup.rows.forEach(r => { rows[r.id] = { ...rowOf(r.id), min: tm(r.id) }; });
    try {
      await S.saveMonthDoc(f, y, COLL, pad(+m), { rows, month: +m, result: { avg: s.avg === null ? null : +s.avg.toFixed(2), band: s.avg === null ? null : bandOf(s.avg, p), total: s.tot, hit: s.hit, counted: s.cnt,
        per: Object.fromEntries(Object.entries(s.per).map(([k, x]) => [k, { goal: +x.goal.toFixed(1), min: x.min, pct: x.pct === null ? null : +x.pct.toFixed(2), F: x.F }])) } });
      D.saved = true; D.exists = true; D.msg = "";
    } catch (e) { D.msg = "Kaydedilemedi: " + e.message; }
    setSv();
  };
  if (now) return run();
  D.timer = setTimeout(run, 700); return Promise.resolve();
}
const setSv = () => { const e = document.getElementById("sv"); if (e) e.textContent = D.msg || (D.saved ? (D.exists ? "Kayıtlı" : "Bu ay henüz kaydedilmedi") : "Kaydediliyor…"); };
const $ = id => document.getElementById(id);

function items() {
  const nm = id => D.setup.rows.find(r => r.id === id)?.name || "—", out = [];
  D.setup.rows.forEach(r => rowOf(r.id).log.forEach(x => out.push({ key: `o:${r.id}:${x.id}`, dept: nm(r.id), text: K.isNum(x.min) ? `${x.min} dk` : "geçersiz", d: x.d, who: x.id === "L0" ? "Önceki kayıt" : "Yetkili", st: "own", del: !GUEST.on && !D.ro })));
  D.g.forEach(x => { const mine = GUEST.on && x.guestUid === GUEST.uid; if (GUEST.on && !mine && x.status !== "approved") return;
    out.push({ key: `g:${x.id}`, dept: nm(x.dept), text: `${x.min} dk`, d: x.d, who: x.guestName || "Misafir", st: x.status, appr: !GUEST.on && !D.ro && x.status === "pending", del: GUEST.on ? mine && x.status === "pending" : !D.ro }); });
  return out;
}
function draw() {
  const { st } = D.ctx, v = D.v, p = D.setup.params || DEFAULT_PARAMS, s = summary(), T = target();
  const sb = s.avg === null ? null : BAND[bandOf(s.avg, p)];
  const lows = D.setup.rows.filter(r => { const x = s.per[r.id]; return x.has && x.pct < num(p.esik.i); });
  v.innerHTML = `
  <div class="row sp"><div><h1 class="ttl">Eğitim Konuşması · Aylık Giriş</h1>
    <div class="sub">Bölümde o ay yapılan eğitim konuşmalarını ekleyin. Verim, hedef süreye oranla otomatik hesaplanır.</div>
    <div class="muted" style="font-size:12.5px" id="sv">${D.msg || (D.saved ? (D.exists ? "Kayıtlı" : "Bu ay henüz kaydedilmedi") : "Kaydediliyor…")}</div></div>
    <select id="ay" class="inp" style="width:auto;min-width:170px;font-weight:600">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === D.month ? "selected" : ""}>${m} ${st.year}</option>`).join("")}</select></div>
  ${D.ro ? `<div class="warn">${roText(st.year, D.month, st.active)}</div>` : ""}
  <div class="row" style="gap:16px;align-items:stretch">
    <div class="save" style="flex:1 1 220px;padding:20px;gap:8px"><span class="hd" style="color:#9DB5AE;letter-spacing:.8px">TESİS EĞİTİM KONUŞMASI VERİMİ</span>
      <div class="row" style="gap:12px"><b style="font:700 40px Sora,sans-serif;letter-spacing:-1px;color:#fff">${s.avg === null ? "–" : f1(s.avg)}</b><span class="pill" style="background:${sb ? sb[2] : "#EEF2F0"};color:${sb ? sb[1] : "#4A5C57"}">${s.avg === null ? "Veri yok" : bandOf(s.avg, p)}</span></div></div>
    <div class="cd" style="flex:1 1 220px;padding:20px;gap:8px"><span class="hd" style="letter-spacing:.8px">TOPLAM SÜRE (DK)</span><b style="font:700 32px Sora,sans-serif">${Math.round(s.tot)}</b></div>
    <div class="cd" style="flex:1 1 220px;padding:20px;gap:8px"><span class="hd" style="letter-spacing:.8px">HEDEFE ULAŞAN BÖLÜM</span><b style="font:700 32px Sora,sans-serif">${s.hit} / ${s.cnt}</b></div></div>
  <fieldset class="fs" ${D.ro ? "disabled" : ""}><div class="cd"><div><h2>Bölüm Bazında Konuşma Süresi</h2>
    <div class="muted" style="font-size:13px;line-height:1.5">O ay yapılan eğitim konuşmalarını + düğmesiyle ekleyin. Hedef süre = çalışan sayısı × ${T} dk × bölüm katsayısı. Aylık toplam eklenen kayıtların toplamıdır; kayıt yoksa bölüm hesaba katılmaz.</div></div>
    <div class="tbl"><div class="tin" style="min-width:820px">
      <div class="cg"><span class="hd">Bölüm</span><span class="hd">Çalışan</span><span class="hd">Katsayı</span><span class="hd">Hedef (dk)</span><span class="hd">Gerçekleşen (dk)</span><span class="hd">Hedefe oran</span><span class="hd">Verim</span></div>
      ${D.setup.rows.map(r => {
        const x = s.per[r.id], row = rowOf(r.id), band = x.has ? bandOf(x.pct, p) : null, b = band ? BAND[band] : ["#D5E0DC", "#4A5C57", "#EEF2F0"];
        const bad = false;
        return `<div class="cg" style="padding:8px 0;border-top:1px solid var(--line)"><b>${esc(r.name)}</b><span>${esc(nAt(r, D.month))}</span><span class="muted" style="font-weight:600">×${x.F.toFixed(2).replace(".", ",")}</span><b>${Math.round(x.goal)}</b>
          <div class="row" style="gap:8px;flex-wrap:nowrap"><b style="min-width:34px">${tm(r.id) === "" ? "–" : esc(tm(r.id))}</b><button type="button" class="sm sec" data-add="${r.id}" aria-label="Süre ekle" title="Süre ekle" ${D.ro ? "disabled" : ""} style="flex:0 0 36px;width:36px;height:36px;min-height:0;padding:0;font-size:20px;line-height:1">+</button></div>
          <div style="height:12px;border-radius:99px;background:var(--calc);overflow:hidden"><div style="height:12px;border-radius:99px;width:${x.has ? x.pct : 0}%;background:${b[0]}"></div></div>
          <div class="row" style="gap:8px;flex-wrap:nowrap"><b style="min-width:42px">${x.has ? f1(x.pct) : "–"}</b><span class="pill" style="background:${b[2]};color:${b[1]}">${band || (bad ? "Geçersiz" : "Veri yok")}</span></div></div>`;
      }).join("")}</div></div>
    <div class="muted" style="font-size:12.5px">Çalışan sayısı ve katsayı Kurulum sayfasından gelir, burada değiştirilemez. Hedef süre Kurulum › Parametreler'den değiştirilir.</div></div>
  <div class="cd"><h2>Hedefe Ulaşılamayan Bölümler İçin Açıklama</h2>
    ${lows.length ? lows.map(r => { const x = s.per[r.id], row = rowOf(r.id), miss = !row.note.trim(); return `<div class="col1" style="gap:6px"><b>${esc(r.name)} <span class="muted" style="font-weight:600">· hedefin %${Math.round(x.pct)}'i</span></b>
      <button class="nb" style="border-color:${miss ? "#D6382E" : "#C3D1CC"};width:100%" data-note="${r.id}" aria-label="Açıklamayı yaz veya düzenle"><span class="nt" style="color:${miss ? "#8A6A66" : "var(--text)"}">${esc(miss ? "Dokunun ve yazın: hedef süreye neden ulaşılamadı?" : row.note)}</span>${ic('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>', 18)}</button></div>`; }).join("")
      : `<div class="muted">Tüm bölümler hedefin en az %${p.esik.i}'ine ulaştı, açıklama gerekmiyor.</div>`}
    <div class="row" ${GUEST.on ? 'style="display:none"' : ""}><button id="saveK">${MONTHS[D.month - 1]} Verilerini Kaydet</button><span class="muted" style="font-size:12.5px">Değişiklikler otomatik kaydedilir. Rapor, bu açıklamaları bölüm adıyla yayınlar.</span></div></div></fieldset>
  ${K.listCard(items(), D.kOpen, !GUEST.on)}`;
  const re = () => { draw(); persist(); };
  $("ay").onchange = e => { D.month = +e.target.value; render(D.v, D.ctx); };
  if (GUEST.on) v.querySelectorAll("[data-note]").forEach(b => { b.disabled = true; });
  v.querySelectorAll("[data-add]").forEach(b => b.onclick = async () => {
    const id = b.dataset.add, name = D.setup.rows.find(r => r.id === id).name;
    const a = await K.addDialog({ title: `Eğitim konuşması ekle · ${name}`, sub: GUEST.on ? "Kaydınız yetkili onayından sonra aylık toplama eklenir." : "Ay toplamına eklenir.", year: D.ctx.st.year, month: D.month,
      fields: [{ k: "min", label: "SÜRE (DK)", ph: "dk", ok: K.isNum, err: "Süreyi dakika olarak sayı yazın." }] });
    if (!a) return;
    if (!GUEST.on) { rowOf(id).log.push({ id: K.eid(), d: a.d, min: a.min }); re(); return; }
    const gid = `${pad(D.month)}_${id}_${GUEST.uid}_${Date.now().toString(36)}`;
    try {
      await S.saveMonthDoc(D.ctx.st.fid, D.ctx.st.year, "konusmag", gid, { guestUid: GUEST.uid, guestName: GUEST.name, dept: id, month: D.month, d: a.d, min: a.min, status: "pending", at: Date.now() });
      D.g = await K.loadGuest(D.ctx.st.fid, D.ctx.st.year, "konusma", D.month); D.kOpen = true; draw(); toast("Kaydınız iletildi; yetkili onaylayınca toplama eklenir.");
      Guest.pushOwner("HSE Verim · Eğitim konuşması", `${GUEST.name} · ${name}: ${a.min} dk eklemek istiyor.`);
    } catch (e) { toast("Gönderilemedi: " + (e.message || e)); }
  });
  $("kTg")?.addEventListener("click", () => { D.kOpen = !D.kOpen; draw(); });
  v.querySelectorAll("[data-ka]").forEach(b => b.onclick = async () => {
    const act = b.dataset.ka, key = b.dataset.kk, { fid, year } = D.ctx.st;
    try {
      if (key.startsWith("o:")) { if (!(await K.confirmBox("Kayıt silinsin mi?", "Bu kayıt aylık toplamdan çıkarılır.", "Sil", true))) return; const [, id, eid] = key.split(":"); rowOf(id).log = rowOf(id).log.filter(x => x.id !== eid); re(); return; }
      const gk = key.slice(2), g = D.g.find(x => x.id === gk); if (!g) return;
      if (act === "del") { if (!(await K.confirmBox("Kayıt silinsin mi?", "Bu kayıt kalıcı olarak silinir.", "Sil", true))) return; await S.deleteMonthDoc(fid, year, "konusmag", gk); }
      else { const { id: _i, ...rest } = g; await S.saveMonthDoc(fid, year, "konusmag", gk, { ...rest, status: act === "ok" ? "approved" : "rejected" }); }
      D.g = await K.loadGuest(fid, year, "konusma", D.month); draw(); persist(true);
    } catch (e) { toast("İşlem yapılamadı: " + (e.message || e)); }
  });
  v.querySelectorAll("[data-note]").forEach(b => b.onclick = async () => {
    const id = b.dataset.note, name = D.setup.rows.find(r => r.id === id).name;
    const r = await noteEditor({ title: `Açıklama · ${name}`, item: "Hedef süreye neden ulaşılamadı?", text: rowOf(id).note, question: "Hedef süreye neden ulaşılamadı?" , example: "Örn. Vardiya değişimi nedeniyle iki çalışan katılamadı; eksik süre bu hafta tamamlanacak." });
    if (r === null) return; rowOf(id).note = r; re();
  });
  $("saveK").onclick = async () => {
    await persist(true); draw();
    const miss = lows.filter(r => !rowOf(r.id).note.trim()).length, bad = D.setup.rows.filter(r => String(rowOf(r.id).min).trim() !== "" && !s.per[r.id].has).length;
    toast(D.msg ? D.msg : bad ? `Kaydedildi, ancak ${bad} bölümdeki süre geçerli bir sayı değil; hesaba katılmadı.` : miss ? `${MONTHS[D.month - 1]} verileri kaydedildi. ${miss} bölümde açıklama eksik.` : `${MONTHS[D.month - 1]} ${D.ctx.st.year} verileri kaydedildi. Grafikler ve rapor güncellendi.`);
  };
}
