import { auth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from "./firebase.js";
import * as S from "./store.js";
import { katsayi, ztfRamp, RISK, TOL } from "./scoring.js";

const VERSION = "1.0.0";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const st = { factories: [], years: [], fid: null, year: null, page: "genel" };

const PAGES = [
  ["genel", "Genel Bakış"], ["kurulum", "Kurulum"], ["ayarlar", "Ayarlar"],
  ["denetim", "İSG Denetim", 1], ["kaza", "İş Kazası", 1], ["konusma", "Eğitim Konuşması", 1],
  ["isbasi", "İşbaşı Eğitim", 1], ["rapor", "Rapor", 1], ["verim", "Verim Tablosu", 1]
];

function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2200); }
const errMsg = e => ({
  "auth/invalid-credential": "E-posta veya şifre hatalı.", "auth/invalid-email": "E-posta geçersiz.",
  "auth/too-many-requests": "Çok fazla deneme. Bir süre bekleyin.", "auth/network-request-failed": "Bağlantı hatası."
}[e.code] || e.message);

// ---------- Giriş ----------
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault(); $("loginErr").textContent = "";
  try { await signInWithEmailAndPassword(auth, $("em").value.trim(), $("pw").value); }
  catch (er) { $("loginErr").textContent = errMsg(er); }
});
$("btnReset").addEventListener("click", async () => {
  const em = $("em").value.trim();
  if (!em) { $("loginErr").textContent = "Önce e-posta yazın."; return; }
  try { await sendPasswordResetEmail(auth, em); $("loginErr").textContent = "Sıfırlama bağlantısı gönderildi."; }
  catch (er) { $("loginErr").textContent = errMsg(er); }
});

onAuthStateChanged(auth, async user => {
  $("login").classList.toggle("hide", !!user);
  $("app").classList.toggle("hide", !user);
  if (user) { await loadContext(); go(location.hash.slice(1) || "genel"); }
});

// ---------- Bağlam: fabrika + yıl ----------
async function loadContext() {
  st.factories = await S.listFactories();
  if (!st.factories.length) { st.fid = null; st.years = []; st.year = null; return drawSelectors(); }
  const saved = S.pref.get("fid");
  st.fid = st.factories.find(f => f.id === saved)?.id || st.factories[0].id;
  await loadYears();
}
async function loadYears() {
  st.years = st.fid ? await S.listYears(st.fid) : [];
  const saved = S.pref.get("year");
  st.year = st.years.includes(saved) ? saved : st.years[st.years.length - 1] || null;
  drawSelectors();
}
function drawSelectors() {
  $("selFactory").innerHTML = st.factories.length
    ? st.factories.map(f => `<option value="${f.id}" ${f.id === st.fid ? "selected" : ""}>${esc(f.name)}</option>`).join("")
    : `<option>Fabrika yok</option>`;
  $("selYear").innerHTML = st.years.length
    ? st.years.map(y => `<option ${y === st.year ? "selected" : ""}>${y}</option>`).join("")
    : `<option>Yıl yok</option>`;
}
$("selFactory").addEventListener("change", async e => { st.fid = e.target.value; S.pref.set("fid", st.fid); await loadYears(); render(); });
$("selYear").addEventListener("change", e => { st.year = e.target.value; S.pref.set("year", st.year); render(); });

// ---------- Yönlendirme ----------
window.addEventListener("hashchange", () => auth.currentUser && go(location.hash.slice(1)));
function go(p) { st.page = PAGES.find(x => x[0] === p && !x[2]) ? p : "genel"; render(); }
function drawNav() {
  $("nav").innerHTML = `<div class="brand">HSE Verim Modülü</div>` + PAGES.map(([k, n, soon]) =>
    `<a href="#${k}" class="${st.page === k ? "on" : ""} ${soon ? "off" : ""}">${n}${soon ? " · yakında" : ""}</a>`).join("");
}
async function render() {
  drawNav();
  const v = $("view");
  if (st.page === "ayarlar") return pageAyarlar(v);
  if (!st.fid || !st.year) {
    v.innerHTML = `<div class="card"><h2>Başlayalım</h2><p class="muted">Önce bir fabrika ve yıl oluşturun.</p><a href="#ayarlar"><button>Ayarlar'a git</button></a></div>`;
    return;
  }
  if (st.page === "kurulum") return pageKurulum(v);
  return pageGenel(v);
}

// ---------- Genel Bakış ----------
async function pageGenel(v) {
  const deps = await S.listDepartments(st.fid, st.year);
  const fname = st.factories.find(f => f.id === st.fid)?.name;
  v.innerHTML = `<div class="card"><h2>${esc(fname)} · ${st.year}</h2>
    <p class="muted">${deps.length} bölüm kayıtlı. Aylık veri girişi ve verim hesapları sonraki adımlarda eklenecek.</p></div>
    <div class="card scroll"><table><tr><th>Bölüm</th><th>Çalışan</th><th>Risk</th><th>Bölüm katsayısı</th><th>ZTF (ramp)</th></tr>
    ${deps.map(d => `<tr><td>${esc(d.name)}</td><td>${d.emp}</td><td>${d.risk}</td><td>${katsayi(d)}</td><td>%${Math.round(ztfRamp(d) * 100)}</td></tr>`).join("")
      || `<tr><td colspan="5" class="muted">Kurulum sayfasından bölüm ekleyin.</td></tr>`}</table></div>`;
}

// ---------- Kurulum: bölüm kaydı ----------
async function pageKurulum(v) {
  const deps = await S.listDepartments(st.fid, st.year);
  const opt = (o, sel) => Object.keys(o).map(k => `<option ${k === sel ? "selected" : ""}>${k}</option>`).join("");
  const row = d => `<tr data-id="${d.id || ""}">
    <td><input class="f-name" value="${esc(d.name)}" placeholder="Bölüm adı"></td>
    <td><input class="f-emp" type="number" min="0" value="${d.emp ?? 0}" style="width:80px"></td>
    <td><select class="f-risk">${opt(RISK, d.risk || "0-3")}</select></td>
    <td><input class="f-ztf" type="number" min="0" max="100" value="${d.ztf ?? 0}" style="width:80px"></td>
    <td><select class="f-tol">${opt(TOL, d.tol || "Düşük")}</select></td>
    <td><input class="f-tc" type="number" min="0" max="100" value="${d.tc ?? 0}" style="width:80px"></td>
    <td class="row"><button class="sm b-save">Kaydet</button>${d.id ? `<button class="sm danger b-del">Sil</button>` : ""}</td></tr>`;
  v.innerHTML = `<div class="card"><h2>Bölüm Kaydı · ${st.year}</h2>
    <p class="muted">Yüzde alanları 0–100 arası girilir. Bölüm katsayısı çalışan sayısı ve risk sınıfından hesaplanır.</p>
    <div class="scroll"><table><tr><th>Bölüm</th><th>Çalışan</th><th>Risk</th><th>ZTF %</th><th>Ramp toleransı</th><th>TC %</th><th></th></tr>
    ${deps.map(row).join("")}${row({})}</table></div>
    <p><button class="sec" id="copyPrev">Önceki yıldan bölümleri kopyala</button></p></div>`;
  v.querySelectorAll("tr[data-id]").forEach(tr => {
    const get = () => ({ id: tr.dataset.id || undefined, name: tr.querySelector(".f-name").value.trim(),
      emp: +tr.querySelector(".f-emp").value || 0, risk: tr.querySelector(".f-risk").value,
      ztf: +tr.querySelector(".f-ztf").value || 0, tol: tr.querySelector(".f-tol").value, tc: +tr.querySelector(".f-tc").value || 0 });
    tr.querySelector(".b-save").onclick = async () => {
      const d = get(); if (!d.name) return toast("Bölüm adı gerekli");
      try { await S.saveDepartment(st.fid, st.year, d); toast("Kaydedildi"); render(); } catch (e) { toast(e.message); }
    };
    const del = tr.querySelector(".b-del");
    if (del) del.onclick = async () => { if (confirm("Bu bölüm silinsin mi?")) { await S.removeDepartment(st.fid, st.year, tr.dataset.id); render(); } };
  });
  $("copyPrev").onclick = async () => {
    const prev = st.years.filter(y => y < st.year).pop();
    if (!prev) return toast("Önceki yıl yok");
    if (deps.length && !confirm("Mevcut bölümlere ek olarak kopyalanacak. Devam?")) return;
    for (const d of await S.listDepartments(st.fid, prev)) { const { id, ...c } = d; await S.saveDepartment(st.fid, st.year, c); }
    toast("Kopyalandı"); render();
  };
}

// ---------- Ayarlar ----------
function pageAyarlar(v) {
  const theme = S.pref.get("theme") || "auto";
  v.innerHTML = `
  <div class="card"><h2>Hesap</h2><p>${esc(auth.currentUser.email)}</p>
    <p class="muted">Sürüm <span class="chip">${VERSION}</span></p>
    <button class="danger" id="out">Çıkış yap</button>
    <p class="muted" style="font-size:13px">Bu cihazdaki oturum kapanır; veriler bulutta kalır.</p></div>
  <div class="card"><h2>Tema</h2><select id="theme" style="max-width:220px">
    ${[["auto", "Otomatik"], ["light", "Açık"], ["dark", "Koyu"]].map(([k, n]) => `<option value="${k}" ${k === theme ? "selected" : ""}>${n}</option>`).join("")}</select></div>
  <div class="card"><h2>Fabrikalar</h2>
    <table>${st.factories.map(f => `<tr><td>${esc(f.name)}</td><td class="row">
      <button class="sm sec" data-ren="${f.id}">Yeniden adlandır</button><button class="sm danger" data-del="${f.id}">Sil</button></td></tr>`).join("")}</table>
    <div class="row" style="margin-top:12px"><input id="nf" placeholder="Yeni fabrika adı" style="max-width:260px"><button id="addF">Fabrika ekle</button></div></div>
  <div class="card"><h2>Yıllar</h2>
    <p class="muted">${st.fid ? "Seçili fabrika: " + esc(st.factories.find(f => f.id === st.fid)?.name) : "Önce fabrika ekleyin."}</p>
    <p>${st.years.map(y => `<span class="chip">${y}</span> `).join("") || "—"}</p>
    <div class="row"><input id="ny" type="number" min="2020" max="2100" placeholder="Örn. 2026" style="max-width:140px"><button id="addY" ${st.fid ? "" : "disabled"}>Yıl ekle</button></div></div>`;
  $("out").onclick = () => signOut(auth);
  $("theme").onchange = e => { S.pref.set("theme", e.target.value); applyTheme(); };
  $("addF").onclick = async () => {
    const n = $("nf").value.trim(); if (!n) return;
    const id = await S.addFactory(n); S.pref.set("fid", id); await loadContext(); toast("Fabrika eklendi"); render();
  };
  v.querySelectorAll("[data-ren]").forEach(b => b.onclick = async () => {
    const n = prompt("Yeni ad:"); if (n?.trim()) { await S.renameFactory(b.dataset.ren, n.trim()); await loadContext(); render(); }
  });
  v.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
    if (confirm("Fabrika kaydı silinsin mi? (İçindeki veriler bulutta kalabilir, listeden kalkar.)")) { await S.removeFactory(b.dataset.del); await loadContext(); render(); }
  });
  $("addY").onclick = async () => {
    const y = $("ny").value.trim(); if (!/^\d{4}$/.test(y)) return toast("4 haneli yıl girin");
    await S.addYear(st.fid, y); S.pref.set("year", y); await loadYears(); toast("Yıl eklendi"); render();
  };
}
function applyTheme() { document.documentElement.dataset.theme = S.pref.get("theme") || "auto"; }
applyTheme();
