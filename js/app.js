import { auth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from "./firebase.js?v=20261009g";
import * as S from "./store.js?v=20261009g";
import * as Denetim from "./denetim.js?v=20261009g";
import * as Kaza from "./kaza.js?v=20261009g";
import * as Konusma from "./konusma.js?v=20261009g";
import * as Rapor from "./rapor.js?v=20261009g";
import * as Verim from "./verim.js?v=20261009g";
import * as Isbasi from "./isbasi.js?v=20261009g";
import { $, esc, ic, toast, modal, confirmBox, formBox } from "./ui.js?v=20261009g";
import { num, c2, katsayi, ztfRamp, RISK, DEFAULT_PARAMS, newRow, rid } from "./scoring.js?v=20261009g";

const VERSION = "1.0.0";
const st = { factories: [], years: [], fid: null, year: null, page: "genel", profile: {}, lastSync: new Date() };

const GROUPS = [
  ["ANA MENÜ", [
    ["genel", "Genel Bakış", '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'],
    ["kurulum", "Kurulum ve Kayıtlar", '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'],
    ["ayarlar", "Ayarlar", '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>']]],
  ["AYLIK VERİ GİRİŞİ", [
    ["denetim", "İSG Denetim Listesi", '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 13l2 2 4-4"/>'],
    ["kaza", "İş Kazası", '<path d="M12 3l9 16H3L12 3z"/><path d="M12 10v4M12 17h0"/>'],
    ["konusma", "Eğitim Konuşması", '<path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M7 10.5V15c0 1.5 2.2 3 5 3s5-1.5 5-3v-4.5"/>'],
    ["isbasi", "İşbaşı Eğitim", '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 11l2 2 4-4"/>']]],
  ["RAPOR", [
    ["rapor", "Raporlar ve Dışa Aktar", '<path d="M6 3h8l4 4v14H6z"/><path d="M9 17v-3M12 17v-5M15 17v-2"/>'],
    ["verim", "Verim Tablosu", '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M9 5v14"/>']]]
];
const PAGES = GROUPS.flatMap(g => g[1]);

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

let unwatch = null, beat = null;
async function doSignOut() {
  try { unwatch?.(); clearInterval(beat); await S.endSession(); } catch {}
  ["fid", "year", "device"].forEach(k => { try { localStorage.removeItem("hse_" + k); } catch {} });
  K.key = ""; await signOut(auth);
}
onAuthStateChanged(auth, async user => {
  $("login").classList.toggle("hide", !!user);
  $("app").classList.toggle("hide", !user);
  if (user) {
    try { await S.touchSession(true); } catch {}
    unwatch?.(); clearInterval(beat);
    unwatch = S.watchSession(d => { if (d?.revoked) doSignOut(); });
    beat = setInterval(() => S.touchSession().catch(() => {}), 5 * 60 * 1000);
    S.getProfile().then(p => { st.profile = p; }).catch(() => {});
    await loadContext(); go(location.hash.slice(1) || "genel");
  }
});

// ---------- Bağlam: fabrika + yıl ----------
async function loadContext() {
  st.all = await S.listFactories();
  st.factories = st.all.filter(f => !f.archived);
  st.lastSync = new Date();
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
const toggleMenu = o => { $("side").classList.toggle("open", o); $("ov").classList.toggle("show", o ?? $("side").classList.contains("open")); };
$("menuBtn").onclick = () => toggleMenu();
$("ov").onclick = () => toggleMenu(false);
function go(p) { st.page = PAGES.find(x => x[0] === p && !x[3]) ? p : "genel"; toggleMenu(false); render(); }
function drawNav() {
  $("nav").innerHTML = `<div class="brand"><div class="logo"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg></div><div><b>HSE Verim Modülü</b><small>Performans Takip</small></div></div>`
    + GROUPS.map(([t, items]) => `<div class="grp"><div class="t">${t}</div>` + items.map(([k, n, d, soon]) =>
      `<a href="#${k}" class="${st.page === k ? "on" : ""} ${soon ? "soon" : ""}">${ic(d)}${n}${soon ? ' <small style="margin-left:auto;font-size:10px">yakında</small>' : ""}</a>`).join("") + `</div>`).join("")
    + `<div class="goal"><b>Hedef: Sıfır Zarar</b><span>Güvenli çalış. Ölç. Geliştir.</span><div class="dots"><i style="background:#17A06F"></i><i style="background:#2A82C4"></i><i style="background:#F5B700"></i><i style="background:#D6382E"></i></div></div>`;
}
async function render() {
  drawNav();
  const v = $("view");
  if (st.page === "ayarlar") return pageAyarlar(v);
  if (!st.fid || !st.year) {
    v.innerHTML = `<div class="cd"><h2>Başlayalım</h2><p class="sub">Önce Ayarlar'dan bir fabrika ve yıl oluşturun.</p><div><a href="#ayarlar"><button>Ayarlar'a git</button></a></div></div>`;
    return;
  }
  if (st.page === "kurulum") return pageKurulum(v);
  if (st.page === "rapor") return Rapor.render(v, { st });
  if (st.page === "verim") return Verim.render(v, { st });
  if (st.page === "isbasi") return Isbasi.render(v, { st });
  if (st.page === "konusma") return Konusma.render(v, { st });
  if (st.page === "kaza") return Kaza.render(v, { st });
  if (st.page === "denetim") return Denetim.render(v, { st });
  return pageGenel(v);
}

// ---------- Genel Bakış ----------
async function pageGenel(v) {
  const setup = await S.getSetup(st.fid, st.year);
  const fname = st.factories.find(f => f.id === st.fid)?.name;
  const p = setup?.params || DEFAULT_PARAMS;
  v.innerHTML = `<div><h1 class="ttl">Genel Bakış</h1><div class="sub">${esc(fname)} · ${st.year}</div></div>` + (!setup
    ? `<div class="cd"><h2>Kurulum bekleniyor</h2><p class="sub">Bu yıl için henüz bölüm kaydı yok.</p><div><a href="#kurulum"><button>Kurulum ve Kayıtlar'a git</button></a></div></div>`
    : `<div class="cd"><h2>Bölümler</h2><p class="sub">Aylık veri girişi ve verim grafikleri sonraki adımlarda eklenecek.</p>
      <div class="tbl"><table class="t"><tr><th>Bölüm</th><th>Çalışan</th><th>Risk</th><th>ZTF (ramp)</th><th>Bölüm katsayısı</th></tr>
      ${setup.rows.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.n)}</td><td>${r.risk}</td><td>${c2(ztfRamp(r, p))}</td><td>${c2(katsayi(r))}</td></tr>`).join("")}</table></div></div>`);
}

// ---------- Kurulum ve Kayıtlar ----------
const HELP = {
  ad: ["Bölüm adı", "Bölümün tüm sayfalarda, grafiklerde ve raporlarda görünen adı.", []],
  calisan: ["Çalışan sayısı", "Bölümün ortalama çalışan sayısı. Sayı, bölüm katsayısına aşağıdaki gibi etki eder.",
    [["0-5", "katsayı 0,05"], ["6-10", "katsayı 0,10"], ["11-15", "katsayı 0,15"], ["16-20", "katsayı 0,20"], ["21-25", "katsayı 0,25"], ["26+", "katsayı 0,30"]]],
  risk: ["Risk skoru (5×5)", "Bölümün 5×5 risk matrisine göre skor aralığı. Seçilen aralık risk seviyesini ve bölüm katsayısına etkisini belirler.",
    [["0-3", "Çok Düşük · 0,05"], ["4-6", "Düşük · 0,10"], ["8-12", "Orta · 0,15"], ["15-16", "Yüksek · 0,20"], ["20-25", "Çok Yüksek · 0,25"]]],
  tc: ["Turnover / Kalıcılık (TC)", "Personelin bölümde kalıcılık sürecini ifade eder. Tahmin etmeyin; gerçek kayda göre seçin. 1 değerine yakınlık kalıcı kadroyu, 0'a yakınlık yüksek devri gösterir.",
    [["1,0", "personel 3+ ay kalıcı"], ["0,6", "1-3 ay içinde ayrıldı"], ["0,2", "ilk 1 ayda ayrıldı"]]],
  ramp: ["Hızlı artış (Ramp)", "Çalışma sezonuna göre bölüm içindeki çalışan sayısı artış hızını ifade eder. Seçilen düzey, ZTF değerine tolerans olarak eklenir.",
    [["Düşük", "tolerans 0"], ["Orta", "tolerans +0,05"], ["Yüksek", "tolerans +0,10"]]],
  ztf: ["ZTF · Eğitim zamanlama", "İşe başlama eğitimlerinin planlanan günde verilmesini ifade eder. Eğitim geciktikçe her gün için eğitim performansında kayıp oluşur.",
    [["1,0", "1-5 iş günü"], ["0,8", "6. gün"], ["0,6", "7. gün"], ["0,4", "8. gün"], ["0,2", "9. gün"], ["0", "10+ gün veya eğitim verilmedi"]]],
  ztfr: ["ZTF (ramp toleranslı) · hesaplanan", "ZTF değerine ramp toleransı eklenerek bulunur, en fazla 1,0 olur. Elle girilmez.", [["Formül", "min(1; ZTF + ramp toleransı)"]]],
  kat: ["Bölüm katsayısı · hesaplanan", "Çalışan sayısı ve risk skoruna göre bulunur. İSG denetim cezası bu katsayıyla çarpılır. Elle girilmez.", [["Formül", "1 + (çalışan katsayısı − 0,05) + (risk katsayısı − 0,05)"]]]
};
const HEADS = [["ad", "Bölüm adı"], ["calisan", "Çalışan sayısı"], ["risk", "Risk skoru (5×5)"], ["tc", "Turnover (TC)"], ["ramp", "Ramp düzeyi"], ["ztf", "ZTF"], ["ztfr", "ZTF (ramp toleranslı)"], ["kat", "Bölüm katsayısı"]];
const OPT = {
  risk: [["0-3", "0-3"], ["4-6", "4-6"], ["8-12", "8-12"], ["15-16", "15-16"], ["20-25", "20-25"]],
  tc: [["1,0", "1,0 · 3+ ay"], ["0,6", "0,6 · 1-3 ay"], ["0,2", "0,2 · ilk ay"]],
  ramp: [["Düşük", "Düşük"], ["Orta", "Orta"], ["Yüksek", "Yüksek"]],
  ztf: [["1,0", "1,0 · 1-5 gün"], ["0,8", "0,8 · 6. gün"], ["0,6", "0,6 · 7. gün"], ["0,4", "0,4 · 8. gün"], ["0,2", "0,2 · 9. gün"], ["0", "0 · 10+ gün"]]
};
const K = { key: "", rows: [], params: null, help: null, dirty: false };
const sel = (cls, opts, val, label) => `<select class="${cls}" aria-label="${label}">${opts.map(([v, t]) => `<option value="${v}" ${v === val ? "selected" : ""}>${t}</option>`).join("")}</select>`;

async function pageKurulum(v) {
  const key = st.fid + "/" + st.year;
  if (K.key !== key) {
    const s = await S.getSetup(st.fid, st.year);
    K.key = key; K.help = null; K.dirty = false;
    K.rows = (s?.rows?.length ? s.rows : [newRow(1)]).map(r => (r.id ? r : { ...r, id: rid() }));
    K.params = JSON.parse(JSON.stringify({ ...DEFAULT_PARAMS, ...(s?.params || {}) }));
  }
  drawKurulum(v);
}
function drawKurulum(v) {
  const p = K.params, cur = K.help ? HELP[K.help] : null;
  const pr = (label, path, aria, extra = "") => `<div class="pr"><span>${extra}${label}</span><input class="pi" data-p="${path}" aria-label="${aria}" value="${esc(path.split(".").reduce((o, k) => o[k], p))}"></div>`;
  v.innerHTML = `
  <div><h1 class="ttl">Kurulum ve Kayıtlar</h1>
    <div class="sub">Bölümleri ve parametreleri bir kez girin. Kaydettiğinizde tablolar, hesaplamalar, grafikler ve aylık giriş sayfaları otomatik hazırlanır.</div></div>
  <div class="steps">
    <div><span class="n" style="background:#0B6E4F;color:#fff">1</span><span><b>Bölüm Kaydı</b><span class="muted" style="font-size:12px">Şu an burada</span></span></div>
    <div><span class="n" style="background:var(--calc);color:var(--calct)">2</span><span><b>Parametreler</b><span class="muted" style="font-size:12px">Ağırlık ve eşikler</span></span></div>
    <div><span class="n" style="background:#F5B700;color:#2B2000">3</span><span><b>Kaydet ve Aktifleştir</b><span class="muted" style="font-size:12px">Sistemi başlat</span></span></div>
  </div>
  <div class="cd">
    <div class="row sp"><div><h2>1 · Bölüm Kaydı</h2>
      <div class="muted" style="font-size:13px;margin-top:4px">En fazla 12 bölüm tanımlanabilir. Sütun başlıklarına tıklayarak anlamını ve değerlerin ne ifade ettiğini görün.</div></div>
      <button class="sec" id="addRow" ${K.rows.length >= 12 ? "disabled" : ""}>+ Bölüm ekle</button></div>
    <div class="helpbox"><div class="h">${ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h0"/>')}<span>${cur ? cur[0] : "Sütun açıklamaları"}</span></div>
      <div style="line-height:1.6">${cur ? cur[1] : "Bir sütun başlığına tıklayın; anlamı ve alabileceği değerler burada görünür."}</div>
      ${cur && cur[2].length ? `<div class="v">${cur[2].map(([k, t]) => `<div><b>${k}</b> ${t}</div>`).join("")}</div>` : ""}</div>
    <div class="tbl"><div class="tin">
      <div class="g"><span class="hd" style="align-self:end">Sıra</span>
        ${HEADS.map(([k, t]) => `<button class="hb ${K.help === k ? "on" : ""}" data-h="${k}"><span>${t}</span>${ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h0"/>').replace('width="20" height="20"', 'width="14" height="14"')}</button>`).join("")}<span></span></div>
      ${K.rows.map((r, i) => `<div class="g" data-i="${i}">
        <span style="font-weight:700;color:var(--muted)">${i + 1}</span>
        <input class="inp" data-k="name" aria-label="Bölüm adı" value="${esc(r.name)}">
        <input class="inp" data-k="n" inputmode="numeric" aria-label="Çalışan sayısı" value="${esc(r.n)}">
        ${sel("inp", OPT.risk, r.risk, "Risk skoru").replace("<select", '<select data-k="risk"')}
        ${sel("inp", OPT.tc, r.tc, "Turnover, kalıcılık katsayısı (TC)").replace("<select", '<select data-k="tc"')}
        ${sel("inp", OPT.ramp, r.ramp, "Hızlı artış, ramp düzeyi").replace("<select", '<select data-k="ramp"')}
        ${sel("inp", OPT.ztf, r.ztf, "ZTF, eğitim zamanlama katsayısı").replace("<select", '<select data-k="ztf"')}
        <span class="calc">${c2(ztfRamp(r, p))}</span><span class="calc">${c2(katsayi(r))}</span>
        <button class="xb" data-del="${i}" aria-label="Bölümü sil" ${K.rows.length < 2 ? "disabled" : ""}>×</button></div>`).join("")}
      <div class="muted" style="font-size:12px">Gri kutular hesaplanan değerlerdir, elle değiştirilemez.</div></div></div>
  </div>
  <div class="two">
    <div class="cd"><h2>2 · Parametreler</h2><div class="params">
      <div class="col"><span class="hd">MODÜL AĞIRLIKLARI (%)</span>${pr("İş Kazası", "w.kaza", "İş Kazası ağırlığı")}${pr("Eğitim Konuşması", "w.konusma", "Eğitim Konuşması ağırlığı")}${pr("İşbaşı Eğitim", "w.isbasi", "İşbaşı Eğitim ağırlığı")}${pr("İSG Denetim", "w.isg", "İSG Denetim ağırlığı")}</div>
      <div class="col"><span class="hd">DURUM EŞİKLERİ (≥)</span>${pr("Mükemmel", "esik.m", "Mükemmel eşiği", '<i class="sw" style="background:#17A06F"></i>')}${pr("İyi", "esik.i", "İyi eşiği", '<i class="sw" style="background:#2A82C4"></i>')}${pr("Orta", "esik.o", "Orta eşiği", '<i class="sw" style="background:#F5B700"></i>')}</div>
      <div class="col"><span class="hd">EĞİTİM</span>${pr("Hedef süre (dk/kişi/ay)", "egitim.hedef", "Hedef süre")}${pr("ZTF şiddeti (kZTF)", "egitim.kztf", "ZTF şiddeti")}${pr("TC şiddeti (kTC)", "egitim.ktc", "TC şiddeti")}<div class="muted" style="font-size:12px">1 = tam etki, 0 = etkisiz.</div></div>
      <div class="col"><span class="hd">RAMP TOLERANSI (ZTF'YE EKLENİR)</span>${pr("Düşük", "ramp.dusuk", "Düşük ramp toleransı")}${pr("Orta", "ramp.orta", "Orta ramp toleransı")}${pr("Yüksek", "ramp.yuksek", "Yüksek ramp toleransı")}</div>
      <div class="col"><span class="hd">İSG DENETİMİ</span>${pr("Azami sıklık puanı", "isg.azami", "Azami sıklık puanı")}${pr("Ramak kala: ayda 1", "isg.r1", "Ayda 1 bonusu")}${pr("Ramak kala: 2 haftada 1", "isg.r2", "2 haftada 1 bonusu")}${pr("Ramak kala: haftalık", "isg.r3", "Haftalık bonusu")}</div>
    </div></div>
    <div class="save"><h2>3 · Kaydet ve Aktifleştir</h2>
      <ul>${["Bölüm tabloları oluşturulur", "Verim hesaplamaları bağlanır", "Genel Bakış grafikleri hazırlanır", "Aylık veri giriş sayfaları açılır"].map(t => `<li>${ic('<path d="M4 12l5 5L20 6"/>').replace('stroke="currentColor"', 'stroke="#5BD6A4"')}<span>${t}</span></li>`).join("")}</ul>
      <div id="kerr" class="warn hide"></div>
      <button class="go" id="saveK">Kaydet ve Sistemi Aktifleştir</button>
      <small>Sonradan bölüm eklendiğinde veya silindiğinde tablolar ve grafikler yeniden hesaplanır.</small></div>
  </div>`;
  v.querySelectorAll("[data-h]").forEach(b => b.onclick = () => { K.help = K.help === b.dataset.h ? null : b.dataset.h; drawKurulum(v); });
  v.querySelectorAll(".g[data-i]").forEach(g => g.querySelectorAll("[data-k]").forEach(el => el.onchange = () => {
    K.rows[+g.dataset.i][el.dataset.k] = el.value; drawKurulum(v);
  }));
  v.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { K.rows.splice(+b.dataset.del, 1); drawKurulum(v); });
  $("addRow").onclick = () => { K.rows.push(newRow(K.rows.length + 1)); drawKurulum(v); };
  v.querySelectorAll(".pi").forEach(el => el.onchange = () => {
    const ks = el.dataset.p.split("."); ks.slice(0, -1).reduce((o, k) => o[k], K.params)[ks.at(-1)] = el.value.trim(); drawKurulum(v);
  });
  if (st.year < st.years[st.years.length - 1]) {
    v.querySelectorAll(".inp,.pi,.xb,#addRow,#saveK").forEach(e => e.disabled = true);
    v.insertAdjacentHTML("afterbegin", `<div class="warn">${st.year} geçmiş bir yıldır, salt okunur. Değişiklik için güncel yılı seçin.</div>`);
  }
  $("saveK").onclick = async () => {
    const errs = validateK();
    const box = $("kerr"); box.classList.toggle("hide", !errs.length); box.innerHTML = errs.join("<br>");
    if (errs.length) return;
    try { await S.saveSetup(st.fid, st.year, { rows: K.rows, params: K.params }); toast("Kurulum kaydedildi"); }
    catch (e) { toast("Kaydedilemedi: " + e.message); }
  };
}
function validateK() {
  const e = [], p = K.params, names = K.rows.map(r => r.name.trim().toLowerCase());
  if (K.rows.some(r => !r.name.trim())) e.push("Her bölümün adı olmalı.");
  if (new Set(names).size !== names.length) e.push("Bölüm adları birbirinden farklı olmalı.");
  if (K.rows.some(r => !(parseInt(r.n, 10) >= 0))) e.push("Çalışan sayısı sayı olmalı.");
  const sum = Object.values(p.w).reduce((a, x) => a + num(x), 0);
  if (Math.round(sum) !== 100) e.push(`Modül ağırlıkları toplamı 100 olmalı (şu an ${sum}).`);
  if (!(num(p.esik.m) > num(p.esik.i) && num(p.esik.i) > num(p.esik.o))) e.push("Eşikler Mükemmel > İyi > Orta sırasında olmalı.");
  return e;
}

// ---------- Ayarlar ----------
const BUILD = "09.10.2026";
const fmtDt = t => new Date(t).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const initials = n => (n || "").split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join("") || "?";
const item = (inner, bg = "var(--card)", bd = "var(--line)") => `<div class="it" style="background:${bg};border-color:${bd}">${inner}</div>`;
const THEMES = [["light", "Açık", "#0B2230", "#EDF2F0", "#fff"], ["dark", "Koyu", "#06121a", "#0d1a22", "#14262f"], ["auto", "Cihaza göre", "#0B2230", "#8aa39b", "#cfdcd7"]];

async function pageAyarlar(v) {
  const email = auth.currentUser.email, theme = S.pref.get("theme") || "light";
  const [sessions, profile] = await Promise.all([S.listSessions().catch(() => []), S.getProfile().catch(() => ({}))]);
  st.profile = profile;
  const name = profile.name || "";
  const maxYear = st.years[st.years.length - 1];
  const next = maxYear ? String(+maxYear + 1) : null;
  const counts = {};
  await Promise.all(st.all.map(async f => {
    try { const ys = await S.listYears(f.id); const s = ys.length ? await S.getSetup(f.id, ys[ys.length - 1]) : null; counts[f.id] = s?.rows?.length ?? 0; } catch { counts[f.id] = 0; }
  }));
  const me = S.deviceId();
  const cur = st.factories.find(f => f.id === st.fid);
  v.innerHTML = `
  <div><h1 class="ttl">Ayarlar</h1><div class="sub">Hesap bilgileriniz, oturum açık cihazlarınız, fabrikalar, tema ve uygulama sürümü burada yönetilir.</div></div>
  <div id="note" class="okbar hide"><span id="noteT"></span><button class="sec" id="noteX">Kapat</button></div>
  <div class="two">
  <div class="colw">
    <div class="cd"><div><h2>Hesap</h2><div class="muted" style="font-size:13px">Giriş yaptığınız hesabın bilgileri. E-posta ile giriş yapılır, şifreniz hiçbir yerde gösterilmez.</div></div>
      <div class="row" style="gap:16px;flex-wrap:nowrap"><div class="av">${esc(initials(name || email))}</div>
        <div style="min-width:0"><b style="font-size:17px">${esc(name || "Adınızı girin")}</b><div class="muted" style="overflow-wrap:anywhere">${esc(email)}</div></div></div>
      <div class="fg">
        <div><label class="hd" for="adSoyad">AD SOYAD</label><input id="adSoyad" class="inp" value="${esc(name)}" placeholder="Ad Soyad"></div>
        <div><span class="hd">E-POSTA</span><div class="inp ro">${esc(email)}</div></div>
        <div><span class="hd">ROL</span><div class="inp ro">Yönetici</div></div>
        <div><span class="hd">GİRİŞ YÖNTEMİ</span><div class="inp ro">E-posta ve şifre</div></div></div>
      <div class="row"><button class="sec" id="saveName">Adı kaydet</button><button class="sec" id="resetPw">Şifre sıfırlama bağlantısı gönder</button></div></div>

    <div class="cd"><div><h2>Oturumlar ve Cihazlar</h2><div class="muted" style="font-size:13px">Hesabınıza giriş yapılmış cihazlar. Tanımadığınız bir cihaz varsa oradan uzaktan çıkış yapabilirsiniz.</div></div>
      <div class="col1">${sessions.map(d => item(`
        ${ic('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>').replace('width="20" height="20"', 'width="24" height="24"')}
        <div class="grow"><b>${esc(d.name)}</b><div class="muted" style="font-size:12.5px">${esc(d.kind || "")} · Son etkinlik ${fmtDt(d.lastSeen)}</div></div>
        ${d.id === me ? '<span class="tag">Bu cihaz</span>' : `<button class="sm rm" data-rev="${d.id}">Uzaktan çıkış yap</button>`}`,
        d.id === me ? "#F1FAF6" : "var(--card)", d.id === me ? "#9ED6BD" : "var(--line)")).join("") || '<div class="muted">Oturum bilgisi bulunamadı.</div>'}</div>
      <div class="muted" style="font-size:12.5px;line-height:1.6">Çıkış yapılan cihazda oturum kapatılır ve yerel önbellek temizlenir. Verileriniz bulutta güvende kalır, tekrar giriş yapınca geri gelir.</div></div>

    <div class="cd" style="background:#FDF1EF;border-color:#F2C4BF;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between">
      <div style="flex:1 1 240px"><h2 style="color:#6E1511">Çıkış Yap</h2><div style="color:#5A1A16">Bu cihazdaki oturumunuz güvenli şekilde kapatılır.</div></div>
      <button class="big" style="background:#B3261E" id="askOut">Çıkış Yap</button></div>
  </div>
  <div class="colw">
    <div class="cd"><div><h2>Fabrikalar</h2><div class="muted" style="font-size:13px">Birden fazla fabrikanın denetimini yapabilirsiniz. Her fabrikanın bölümleri, kayıtları ve raporları ayrı tutulur; fabrika seçerek geçiş yaparsınız.</div></div>
      <div class="col1">${st.all.map(f => item(`
        <div class="grow"><b>${esc(f.name)}${f.archived ? " · arşivde" : ""}</b><div class="muted" style="font-size:12.5px">${esc(f.loc || "Konum yok")} · ${counts[f.id] ?? 0} bölüm</div></div>
        ${f.id === st.fid && !f.archived ? '<span class="tag">Aktif fabrika</span>' : (!f.archived ? `<button class="sm sec" data-act="${f.id}">Aktif yap</button>` : "")}
        <button class="sm sec" data-edit="${f.id}">Düzenle</button>
        <button class="sm sec" data-arc="${f.id}" data-v="${f.archived ? 0 : 1}">${f.archived ? "Arşivden çıkar" : "Arşivle"}</button>
        <button class="sm trash" data-rm="${f.id}" aria-label="Fabrikayı sil" title="Sil">${ic('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>').replace('width="20" height="20"', 'width="16" height="16"')}</button>`,
        f.id === st.fid && !f.archived ? "#F1FAF6" : "var(--card)")).join("") || '<div class="muted">Henüz fabrika yok.</div>'}</div>
      <div class="col1" style="padding-top:14px;border-top:1px solid var(--line)"><span class="hd">YENİ FABRİKA EKLE</span>
        <div class="fg"><input id="nf" class="inp" placeholder="Fabrika adı" aria-label="Fabrika adı"><input id="nl" class="inp" placeholder="Konum (örn. Gebze)" aria-label="Konum"></div>
        <div><button id="addF">+ Fabrika ekle</button></div></div></div>

    <div class="cd"><div><h2>Yıllar</h2><div class="muted" style="font-size:13px">Veriler yıl bazında saklanır. Geçmiş yıllar salt okunur kalır; yıl seçerek geriye dönük inceleyebilirsiniz. Yıllar arası bölüm karşılaştırması için altyapı hazırdır.</div></div>
      <div class="row">${st.years.map(y => `<span class="yr ${y === maxYear ? "cur" : ""}">${y} · ${y === maxYear ? "Güncel" : "Geçmiş, salt okunur"}</span>`).join("") || '<span class="muted">Seçili fabrikada yıl yok.</span>'}</div>
      <div class="row">${st.fid ? `<button class="sec" id="newY">${next || new Date().getFullYear()} yılını başlat</button>` : ""}</div>
      ${next ? '<div class="muted" style="font-size:12.5px">Yeni yıl başlatılınca bölümler ve parametreler önceki yıldan kopyalanır.</div>' : ""}</div>

    <div class="cd"><div><h2>Görünüm</h2><div class="muted" style="font-size:13px">Tema seçimi bu cihazda saklanır.</div></div>
      <div class="th">${THEMES.map(([k, n, sd, bg, cd]) => `<button class="tb ${k === theme ? "on" : ""}" data-theme="${k}" aria-pressed="${k === theme}">
        <div class="pv"><div style="flex:0 0 28%;background:${sd}"></div><div style="flex:1;background:${bg};display:flex;flex-direction:column;gap:5px;padding:7px"><div style="height:8px;border-radius:4px;background:${cd}"></div><div style="height:8px;width:60%;border-radius:4px;background:#17A06F"></div></div></div><b>${n}</b></button>`).join("")}</div></div>

    <div class="cd"><h2>Uygulama ve Senkronizasyon</h2>
      <div class="fg">
        <div><span class="hd">SÜRÜM</span><div style="font-weight:800;font-size:18px">${VERSION}</div></div>
        <div><span class="hd">DERLEME TARİHİ</span><div style="font-weight:700">${BUILD}</div></div>
        <div><span class="hd">VERİ ALTYAPISI</span><div style="font-weight:700">Bulut depolama · cihazlar arası senkronizasyon</div></div>
        <div><span class="hd">SENKRONİZASYON</span><div style="font-weight:700"><i class="sw" style="background:#17A06F;border-radius:50%"></i><span id="syncT">Güncel · ${st.lastSync.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span></div></div></div>
      <div><button class="sec" id="doSync">Şimdi senkronize et</button></div></div>
  </div></div>
  <div id="modal" class="mod hide"><div class="mbox"><h2>Çıkış yapılsın mı?</h2>
    <p class="muted">Bu cihazdaki oturum kapatılır ve yerel önbellek temizlenir. Verileriniz bulutta güvende kalır.</p>
    <div class="row" style="justify-content:flex-end"><button class="sec" id="noOut">Vazgeç</button><button class="danger" id="yesOut">Evet, çıkış yap</button></div></div></div>`;
  const say = t => { $("noteT").textContent = t; $("note").classList.remove("hide"); };
  $("noteX").onclick = () => $("note").classList.add("hide");
  $("saveName").onclick = async () => { await S.saveProfile({ name: $("adSoyad").value.trim() }); say("Adınız kaydedildi."); pageAyarlar(v); };
  $("resetPw").onclick = async () => { try { await sendPasswordResetEmail(auth, email); say("Şifre sıfırlama bağlantısı e-postanıza gönderildi."); } catch (e) { say(errMsg(e)); } };
  v.querySelectorAll("[data-rev]").forEach(b => b.onclick = async () => { if (confirm("Bu cihazdaki oturum uzaktan kapatılsın mı?")) { await S.revokeSession(b.dataset.rev); say("Cihazın oturumu kapatıldı."); pageAyarlar(v); } });
  $("askOut").onclick = () => $("modal").classList.remove("hide");
  $("noOut").onclick = () => $("modal").classList.add("hide");
  $("yesOut").onclick = doSignOut;
  v.querySelectorAll("[data-theme]").forEach(b => b.onclick = () => { S.pref.set("theme", b.dataset.theme); applyTheme(); pageAyarlar(v); });
  v.querySelectorAll("[data-act]").forEach(b => b.onclick = async () => { st.fid = b.dataset.act; S.pref.set("fid", st.fid); await loadYears(); say("Aktif fabrika değiştirildi."); pageAyarlar(v); });
  v.querySelectorAll("[data-edit]").forEach(b => b.onclick = async () => {
    const f = st.all.find(x => x.id === b.dataset.edit);
    const r = await formBox("Fabrikayı düzenle", [["name", "Fabrika adı", f.name], ["loc", "Konum", f.loc || ""]]);
    if (!r) return;
    if (!r.name.trim()) return say("Fabrika adı boş olamaz.");
    await S.updateFactory(f.id, { name: r.name.trim(), loc: r.loc.trim() }); await loadContext(); say("Fabrika güncellendi."); pageAyarlar(v);
  });
  v.querySelectorAll("[data-arc]").forEach(b => b.onclick = async () => {
    const arch = b.dataset.v === "1", f = st.all.find(x => x.id === b.dataset.arc);
    if (arch && !(await confirmBox("Arşive kaldırılsın mı?", `"${f.name}" arşive alınır ve fabrika seçiminden kalkar. Verileri silinmez, istediğiniz zaman arşivden çıkarabilirsiniz.`, "Evet, arşive kaldır"))) return;
    await S.setArchived(f.id, arch); await loadContext(); say(arch ? "Fabrika arşive kaldırıldı." : "Fabrika arşivden çıkarıldı."); pageAyarlar(v);
  });
  v.querySelectorAll("[data-rm]").forEach(b => b.onclick = async () => {
    const f = st.all.find(x => x.id === b.dataset.rm);
    if (!(await confirmBox("Fabrika silinsin mi?", `"${f.name}" ve içindeki tüm yıl, bölüm ve kayıt bilgileri kalıcı olarak silinir. Bu işlem geri alınamaz.`, "Evet, sil", true))) return;
    await S.deleteFactoryDeep(f.id); if (S.pref.get("fid") === f.id) S.pref.set("fid", ""); K.key = ""; await loadContext(); say("Fabrika ve bilgileri silindi."); pageAyarlar(v);
  });
  $("addF").onclick = async () => {
    const n = $("nf").value.trim(); if (!n) return say("Fabrika adı yazın.");
    const id = await S.addFactory(n, $("nl").value.trim()); S.pref.set("fid", id); await loadContext(); say("Fabrika eklendi."); pageAyarlar(v);
  };
  const ny = $("newY");
  if (ny) ny.onclick = async () => {
    const y = next || String(new Date().getFullYear());
    await S.addYear(st.fid, y);
    if (maxYear) { const prev = await S.getSetup(st.fid, maxYear); if (prev) await S.saveSetup(st.fid, y, { rows: prev.rows, params: prev.params }); }
    S.pref.set("year", y); await loadYears(); say(`${y} yılı başlatıldı.`); pageAyarlar(v);
  };
  $("doSync").onclick = async () => { await loadContext(); $("syncT").textContent = "Güncel · " + st.lastSync.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }); say("Veriler buluttan yenilendi."); };
}
function applyTheme() { document.documentElement.dataset.theme = S.pref.get("theme") || "light"; }
applyTheme();
