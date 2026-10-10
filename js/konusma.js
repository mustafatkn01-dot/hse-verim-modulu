// Eğitim Konuşması · Aylık Giriş
import * as S from "./store.js?v=20261010f";
import { esc, ic, toast, noteEditor } from "./ui.js?v=20261010f";
import { katsayi, bandOf, num, MONTHS, DEFAULT_PARAMS } from "./scoring.js?v=20261010f";

const COLL = "konusma";
const BAND = { Mükemmel: ["#17A06F", "#0B6E4F", "#D9F1E6"], İyi: ["#2A82C4", "#145F96", "#DCEAF7"], Orta: ["#E8A512", "#6B3F00", "#FBE9C6"], Kritik: ["#D6382E", "#B3261E", "#FADAD7"] };
const pad = n => String(n).padStart(2, "0");
const D = { key: "", month: null, rows: {}, exists: false, saved: true, timer: null, msg: "" };
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
  }
  D.ctx = ctx; D.v = v; D.setup = setup; D.ro = String(st.year) !== String(st.active);
  draw();
}
const rowOf = id => (D.rows[id] ||= { min: "", note: "" });
const target = () => num((D.setup.params || DEFAULT_PARAMS).egitim.hedef) || 10;

function summary() {
  const out = {}; let vs = 0, cnt = 0, hit = 0, tot = 0;
  D.setup.rows.forEach(r => {
    const x = calcKonusma(rowOf(r.id).min, r.n, target(), katsayi(r));
    out[r.id] = { ...x, F: +katsayi(r).toFixed(2) };
    if (x.has) { vs += x.pct; cnt++; tot += x.min; if (x.pct >= 100) hit++; }
  });
  return { per: out, avg: cnt ? vs / cnt : null, cnt, hit, tot };
}

function persist(now = false) {
  if (D.ro) return Promise.resolve();
  D.saved = false; setSv(); clearTimeout(D.timer);
  const run = async () => {
    const [f, y, m] = D.key.split("/"), s = summary(), p = D.setup.params || DEFAULT_PARAMS;
    const rows = {}; D.setup.rows.forEach(r => { rows[r.id] = rowOf(r.id); });
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

function draw() {
  const { st } = D.ctx, v = D.v, p = D.setup.params || DEFAULT_PARAMS, s = summary(), T = target();
  const sb = s.avg === null ? null : BAND[bandOf(s.avg, p)];
  const lows = D.setup.rows.filter(r => { const x = s.per[r.id]; return x.has && x.pct < num(p.esik.i); });
  v.innerHTML = `
  <div class="row sp"><div><h1 class="ttl">Eğitim Konuşması · Aylık Giriş</h1>
    <div class="sub">Bölümde o ay yapılan eğitim konuşmalarının toplam süresini girin. Verim, hedef süreye oranla otomatik hesaplanır.</div>
    <div class="muted" style="font-size:12.5px" id="sv">${D.msg || (D.saved ? (D.exists ? "Kayıtlı" : "Bu ay henüz kaydedilmedi") : "Kaydediliyor…")}</div></div>
    <select id="ay" class="inp" style="width:auto;min-width:170px;font-weight:600">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === D.month ? "selected" : ""}>${m} ${st.year}</option>`).join("")}</select></div>
  ${D.ro ? `<div class="warn">${st.year} geçmiş bir yıldır, salt okunur. Değişiklik için güncel yılı seçin.</div>` : ""}
  <div class="row" style="gap:16px;align-items:stretch">
    <div class="save" style="flex:1 1 220px;padding:20px;gap:8px"><span class="hd" style="color:#9DB5AE;letter-spacing:.8px">TESİS EĞİTİM KONUŞMASI VERİMİ</span>
      <div class="row" style="gap:12px"><b style="font:700 40px Sora,sans-serif;letter-spacing:-1px;color:#fff">${s.avg === null ? "–" : f1(s.avg)}</b><span class="pill" style="background:${sb ? sb[2] : "#EEF2F0"};color:${sb ? sb[1] : "#4A5C57"}">${s.avg === null ? "Veri yok" : bandOf(s.avg, p)}</span></div></div>
    <div class="cd" style="flex:1 1 220px;padding:20px;gap:8px"><span class="hd" style="letter-spacing:.8px">TOPLAM SÜRE (DK)</span><b style="font:700 32px Sora,sans-serif">${Math.round(s.tot)}</b></div>
    <div class="cd" style="flex:1 1 220px;padding:20px;gap:8px"><span class="hd" style="letter-spacing:.8px">HEDEFE ULAŞAN BÖLÜM</span><b style="font:700 32px Sora,sans-serif">${s.hit} / ${s.cnt}</b></div></div>
  <fieldset class="fs" ${D.ro ? "disabled" : ""}><div class="cd"><div><h2>Bölüm Bazında Konuşma Süresi</h2>
    <div class="muted" style="font-size:13px;line-height:1.5">O ay yapılan eğitim konuşmalarının toplam süresini dakika olarak girin. Hedef süre = çalışan sayısı × ${T} dk × bölüm katsayısı. Boş bırakılan bölüm hesaba katılmaz.</div></div>
    <div class="tbl"><div class="tin" style="min-width:820px">
      <div class="cg"><span class="hd">Bölüm</span><span class="hd">Çalışan</span><span class="hd">Katsayı</span><span class="hd">Hedef (dk)</span><span class="hd">Gerçekleşen (dk)</span><span class="hd">Hedefe oran</span><span class="hd">Verim</span></div>
      ${D.setup.rows.map(r => {
        const x = s.per[r.id], row = rowOf(r.id), band = x.has ? bandOf(x.pct, p) : null, b = band ? BAND[band] : ["#D5E0DC", "#4A5C57", "#EEF2F0"];
        const bad = String(row.min).trim() !== "" && !x.has;
        return `<div class="cg" style="padding:8px 0;border-top:1px solid var(--line)"><b>${esc(r.name)}</b><span>${esc(r.n)}</span><span class="muted" style="font-weight:600">×${x.F.toFixed(2).replace(".", ",")}</span><b>${Math.round(x.goal)}</b>
          <input class="inp" data-min="${r.id}" inputmode="decimal" value="${esc(row.min)}" aria-label="Gerçekleşen dakika" placeholder="dk" style="${bad ? "border-color:#D6382E" : ""}">
          <div style="height:12px;border-radius:99px;background:var(--calc);overflow:hidden"><div style="height:12px;border-radius:99px;width:${x.has ? x.pct : 0}%;background:${b[0]}"></div></div>
          <div class="row" style="gap:8px;flex-wrap:nowrap"><b style="min-width:42px">${x.has ? f1(x.pct) : "–"}</b><span class="pill" style="background:${b[2]};color:${b[1]}">${band || (bad ? "Geçersiz" : "Veri yok")}</span></div></div>`;
      }).join("")}</div></div>
    <div class="muted" style="font-size:12.5px">Çalışan sayısı ve katsayı Kurulum sayfasından gelir, burada değiştirilemez. Hedef süre Kurulum › Parametreler'den değiştirilir.</div></div>
  <div class="cd"><h2>Hedefe Ulaşılamayan Bölümler İçin Açıklama</h2>
    ${lows.length ? lows.map(r => { const x = s.per[r.id], row = rowOf(r.id), miss = !row.note.trim(); return `<div class="col1" style="gap:6px"><b>${esc(r.name)} <span class="muted" style="font-weight:600">· hedefin %${Math.round(x.pct)}'i</span></b>
      <button class="nb" style="border-color:${miss ? "#D6382E" : "#C3D1CC"};width:100%" data-note="${r.id}" aria-label="Açıklamayı yaz veya düzenle"><span class="nt" style="color:${miss ? "#8A6A66" : "var(--text)"}">${esc(miss ? "Dokunun ve yazın: hedef süreye neden ulaşılamadı?" : row.note)}</span>${ic('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>', 18)}</button></div>`; }).join("")
      : `<div class="muted">Tüm bölümler hedefin en az %${p.esik.i}'ine ulaştı, açıklama gerekmiyor.</div>`}
    <div class="row"><button id="saveK">${MONTHS[D.month - 1]} Verilerini Kaydet</button><span class="muted" style="font-size:12.5px">Değişiklikler otomatik kaydedilir. Rapor, bu açıklamaları bölüm adıyla yayınlar.</span></div></div></fieldset>`;
  const re = () => { draw(); persist(); };
  $("ay").onchange = e => { D.month = +e.target.value; render(D.v, D.ctx); };
  v.querySelectorAll("[data-min]").forEach(el => el.onchange = () => { rowOf(el.dataset.min).min = el.value.trim(); re(); });
  v.querySelectorAll("[data-note]").forEach(b => b.onclick = async () => {
    const id = b.dataset.note, name = D.setup.rows.find(r => r.id === id).name;
    const r = await noteEditor({ title: `Açıklama · ${name}`, item: "Hedef süreye neden ulaşılamadı?", text: rowOf(id).note, question: "Hedef süreye neden ulaşılamadı?" });
    if (r === null) return; rowOf(id).note = r; re();
  });
  $("saveK").onclick = async () => {
    await persist(true); draw();
    const miss = lows.filter(r => !rowOf(r.id).note.trim()).length, bad = D.setup.rows.filter(r => String(rowOf(r.id).min).trim() !== "" && !s.per[r.id].has).length;
    toast(D.msg ? D.msg : bad ? `Kaydedildi, ancak ${bad} bölümdeki süre geçerli bir sayı değil; hesaba katılmadı.` : miss ? `${MONTHS[D.month - 1]} verileri kaydedildi. ${miss} bölümde açıklama eksik.` : `${MONTHS[D.month - 1]} ${D.ctx.st.year} verileri kaydedildi. Grafikler ve rapor güncellendi.`);
  };
}
