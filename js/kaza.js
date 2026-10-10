// İş Kazası · Aylık Giriş
import * as S from "./store.js?v=20261011i";
import { esc, ic, toast, noteEditor, guestLock, roText } from "./ui.js?v=20261011i";
import { katsayi, bandOf, MONTHS, DEFAULT_PARAMS } from "./scoring.js?v=20261011i";

const COLL = "kaza";
const T = [["Gün kayıpsız", 2], ["1-5 gün kayıplı", 5], ["5-20 gün kayıplı", 10], ["20+ gün kayıplı", 20], ["Uzuv kaybı", 50], ["Ölüm", 100]];
const BAND = { Mükemmel: ["#0B6E4F", "#D9F1E6"], İyi: ["#145F96", "#DCEAF7"], Orta: ["#6B3F00", "#FBE9C6"], Kritik: ["#B3261E", "#FADAD7"] };
const pad = n => String(n).padStart(2, "0");
const D = { key: "", month: null, rows: {}, exists: false, saved: true, timer: null, msg: "" };
const f1 = n => n.toFixed(1).replace(".", ",");

// Tek bölümün hesabı: verim = max(0, 100 − Σ(adet × puan) × bölüm katsayısı)
export function calcKaza(c, F) {
  const count = c.reduce((a, b) => a + b, 0), lost = c.slice(1).reduce((a, b) => a + b, 0);
  const pen = c.reduce((a, b, k) => a + b * T[k][1], 0) * F;
  return { count, lost, pen, verim: Math.max(0, 100 - pen) };
}

export async function render(v, ctx) {
  const { st } = ctx;
  const setup = await S.getSetup(st.fid, st.year);
  if (!setup?.rows?.length) { v.innerHTML = `<div class="cd"><h2>Önce bölümleri tanımlayın</h2><p class="sub">İş kazası girişi için Kurulum ve Kayıtlar sayfasında en az bir bölüm kaydedilmeli.</p><div><a href="#kurulum"><button>Kurulum'a git</button></a></div></div>`; return; }
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

const rowOf = id => (D.rows[id] ||= { c: [0, 0, 0, 0, 0, 0], note: "" });

function summary() {
  const out = {}; let sum = 0, tot = 0, lost = 0;
  D.setup.rows.forEach(r => { const x = calcKaza(rowOf(r.id).c, katsayi(r)); out[r.id] = { ...x, F: +katsayi(r).toFixed(2) }; sum += x.verim; tot += x.count; lost += x.lost; });
  return { per: out, tesis: sum / D.setup.rows.length, tot, lost };
}

function persist(now = false) {
  if (D.ro) return Promise.resolve();
  D.saved = false; setSv(); clearTimeout(D.timer);
  const run = async () => {
    const [f, y, m] = D.key.split("/"), s = summary(), p = D.setup.params || DEFAULT_PARAMS;
    const rows = {}; D.setup.rows.forEach(r => { rows[r.id] = rowOf(r.id); });
    try {
      await S.saveMonthDoc(f, y, COLL, pad(+m), { rows, month: +m, result: { tesis: +s.tesis.toFixed(2), band: bandOf(s.tesis, p), total: s.tot, lost: s.lost, per: Object.fromEntries(Object.entries(s.per).map(([k, x]) => [k, { count: x.count, lost: x.lost, pen: +x.pen.toFixed(2), verim: +x.verim.toFixed(2), F: x.F }])) } });
      D.saved = true; D.exists = true; D.msg = "";
    } catch (e) { D.msg = "Kaydedilemedi: " + e.message; }
    setSv();
  };
  if (now) return run();
  D.timer = setTimeout(run, 700); return Promise.resolve();
}
const setSv = () => { const e = document.getElementById("sv"); if (e) e.textContent = D.msg || (D.saved ? (D.exists ? "Kayıtlı" : "Bu ay henüz kaydedilmedi") : "Kaydediliyor…"); };

function draw() {
  const { st } = D.ctx, v = D.v, p = D.setup.params || DEFAULT_PARAMS, s = summary(), sb = BAND[bandOf(s.tesis, p)];
  const cell = (id, k, n) => `<div class="stp"><button class="sm sec" data-d="${id}|${k}|-1" aria-label="Azalt">−</button><span style="min-width:22px;text-align:center;font-weight:800;color:${n > 0 ? "#B3261E" : "var(--text)"}">${n}</span><button class="sm sec" data-d="${id}|${k}|1" aria-label="Artır">+</button></div>`;
  v.innerHTML = `
  <div class="row sp"><div><h1 class="ttl">İş Kazası · Aylık Giriş</h1>
    <div class="sub">Her bölüm için o ay yaşanan kazaları türüne göre girin. Verim, kaza puanı ve bölüm katsayısına göre otomatik hesaplanır.</div>
    <div class="muted" style="font-size:12.5px" id="sv">${D.msg || (D.saved ? (D.exists ? "Kayıtlı" : "Bu ay henüz kaydedilmedi") : "Kaydediliyor…")}</div></div>
    <select id="ay" class="inp" style="width:auto;min-width:170px;font-weight:600">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === D.month ? "selected" : ""}>${m} ${st.year}</option>`).join("")}</select></div>
  ${D.ro ? `<div class="warn">${roText(st.year, D.month, st.active)}</div>` : ""}
  <div class="row" style="gap:16px;align-items:stretch">
    <div class="save" style="flex:1 1 220px;padding:20px;gap:8px"><span class="hd" style="color:#9DB5AE;letter-spacing:.8px">TESİS İŞ KAZASI VERİMİ</span>
      <div class="row" style="gap:12px"><b style="font:700 40px Sora,sans-serif;letter-spacing:-1px;color:#fff">${f1(s.tesis)}</b><span class="pill" style="background:${sb[1]};color:${sb[0]}">${bandOf(s.tesis, p)}</span></div></div>
    <div class="cd" style="flex:1 1 220px;padding:20px;gap:8px"><span class="hd" style="letter-spacing:.8px">TOPLAM KAZA (BU AY)</span><b style="font:700 32px Sora,sans-serif">${s.tot}</b></div>
    <div class="cd" style="flex:1 1 220px;padding:20px;gap:8px"><span class="hd" style="letter-spacing:.8px">KAYIPLI KAZA</span><b style="font:700 32px Sora,sans-serif">${s.lost}</b></div></div>
  <fieldset class="fs" ${D.ro ? "disabled" : ""}><div class="cd"><div><h2>Bölüm Bazında Kaza Girişi</h2>
    <div class="muted" style="font-size:13px;line-height:1.5">Her kaza türü için o ay yaşanan adedi girin. Ceza puanı = kaza adedi × tür puanı × bölüm katsayısı. Verim = 100 − ceza (en az 0).</div></div>
    <div class="tbl"><div class="tin" style="min-width:890px">
      <div class="kg" style="align-items:end"><span class="hd">Bölüm</span><span class="hd">Katsayı</span>${T.map(([t, pt]) => `<div><span class="hd" style="display:block;line-height:1.25">${t}</span><span class="muted" style="font-size:11.5px">${pt} puan</span></div>`).join("")}<span class="hd">Ceza</span><span class="hd">Verim</span></div>
      ${D.setup.rows.map(r => {
        const x = s.per[r.id], row = rowOf(r.id), b = BAND[bandOf(x.verim, p)], miss = x.count > 0 && !row.note.trim();
        return `<div class="krow"><div class="kg"><b>${esc(r.name)}</b><span class="muted" style="font-weight:600">×${x.F.toFixed(2).replace(".", ",")}</span>
          ${row.c.map((n, k) => cell(r.id, k, n)).join("")}
          <span style="font-weight:700">${f1(x.pen)}</span>
          <div class="row" style="gap:8px;flex-wrap:nowrap"><b>${f1(x.verim)}</b><span class="pill" style="background:${b[1]};color:${b[0]}">${bandOf(x.verim, p)}</span></div></div>
          ${x.count > 0 ? `<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="hd" style="padding-top:12px;min-width:56px">AÇIKLAMA</span>
            <button class="nb" style="border-color:${miss ? "#D6382E" : "#C3D1CC"}" data-note="${r.id}" aria-label="Açıklamayı yaz veya düzenle"><span class="nt" style="color:${row.note.trim() ? "var(--text)" : "#8A6A66"}">${esc(row.note.trim() ? row.note : "Dokunun ve yazın: kaza nerede, nasıl oldu?")}</span>${ic('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>', 18)}</button></div>` : ""}</div>`;
      }).join("")}</div></div>
    <div class="row"><button id="saveK">${MONTHS[D.month - 1]} Verilerini Kaydet</button><span class="muted" style="font-size:12.5px">Değişiklikler otomatik kaydedilir. Kaza girilen bölümlerde açıklama yazılmalı; rapor bu metni bölüm adıyla yayınlar.</span></div></div></fieldset>`;
  const re = () => { draw(); persist(); };
  $("ay").onchange = e => { D.month = +e.target.value; render(D.v, D.ctx); };
  v.querySelectorAll("[data-d]").forEach(b => b.onclick = () => {
    const [id, k, d] = b.dataset.d.split("|"), row = rowOf(id); row.c[+k] = Math.max(0, row.c[+k] + +d); re();
  });
  v.querySelectorAll("[data-note]").forEach(b => b.onclick = async () => {
    const id = b.dataset.note, name = D.setup.rows.find(r => r.id === id).name;
    const r = await noteEditor({ title: `Açıklama · ${name}`, item: "Kaza nerede, nasıl oldu?", text: rowOf(id).note, question: "Kaza nerede, nasıl oldu?" , example: "Örn. Pres-2 operatörü parmağını sıkıştırdı; ilk yardım verildi, revire sevk edildi." });
    if (r === null) return; rowOf(id).note = r; re();
  });
  $("saveK").onclick = async () => {
    await persist(true); draw();
    const miss = D.setup.rows.filter(r => { const x = s.per[r.id]; return x.count > 0 && !rowOf(r.id).note.trim(); }).length;
    toast(D.msg ? D.msg : miss ? `${MONTHS[D.month - 1]} verileri kaydedildi. ${miss} bölümde kaza açıklaması eksik.` : `${MONTHS[D.month - 1]} ${D.ctx.st.year} verileri kaydedildi. Grafikler ve rapor güncellendi.`);
  };
}
const $ = id => document.getElementById(id);
