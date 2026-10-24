// (ramak kala kayıtları islendi:"ramak" ile yazılır: görev takibin eski sürümleri bunları almaz, yalnızca yeni sürüm olay sayfasına ekler)
// Görev takip programı köprüsü (mtisggorev). HSE Verim yalnızca küçük kayıtlar bırakır ve durumu okur;
// görev/kaza kayıtlarını görev programı kendisi oluşturur. Bağlantı yoksa özellik uyarı kartıyla kapalı kalır.
import { GOREV_CFG } from "./gorev-config.js?v=20261022s";
import * as S from "./store.js?v=20261022s";
import { esc, toast } from "./ui.js?v=20261022s";

const CFG = GOREV_CFG || null, CDN = "https://www.gstatic.com/firebasejs/10.14.1/";
let F = null, auth = null, db = null, user = null, err = "", fabs = null, started = false, offs = [], loaded = false;
const durum = new Map(), gelen = new Map(), aks = new Map(), aksSent = new Map(), pend = new Map(), subs = new Set();
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const enabled = () => !!CFG;
export const state = () => !CFG ? "yok" : err && !F ? "hata" : !F ? "bekle" : !user ? "giris" : err ? "hata" : "hazir";
export const statusText = () => ({ yok: "Tanımlı değil", bekle: "Bağlanıyor…", giris: "Bağlı değil", hata: "Bağlantı sorunu", hazir: `Bağlı · ${user?.email || ""}` })[state()];
export const durumOf = key => durum.get(key) || null;
export const aksOf = key => aks.get(key) || null;
export const linked = () => state() === "hazir" && loaded;
export const onChange = f => { subs.add(f); return () => subs.delete(f); };
const fire = () => { subs.forEach(f => { try { f(); } catch { } }); paint(); };

// Büyük/küçük harf ve Türkçe karakter farkları yok sayılır (görev programı ile aynı kural)
const norm = s => String(s || "").replace(/İ/g, "i").replace(/I/g, "i").toLowerCase()
  .replace(/[ıçğöşü]/g, c => ({ ı: "i", ç: "c", ğ: "g", ö: "o", ş: "s", ü: "u" })[c]).replace(/\s+/g, " ").trim();
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
export const makeKey = (...p) => p.map(x => String(x).replace(/[^A-Za-z0-9_-]/g, "_")).join("_");
// Aynı metinli birden fazla açıklama için dup sırası eklenir
export const noteKey = (kind, fid, y, m, dept, extra, text, dup = 0) => makeKey(kind, fid, y, String(m).padStart(2, "0"), dept, extra, hash(String(text).trim()) + (dup ? "x" + dup : ""));

const R = p => F.ref(db, (CFG.root || "isg") + "/" + p);
const stopW = () => { offs.forEach(f => { try { f(); } catch { } }); offs = []; durum.clear(); gelen.clear(); aks.clear(); aksSent.clear(); fabs = null; loaded = false; };
function startW() {
  const bad = e => { err = /permission/i.test(e?.message || "") ? "yetki" : "okuma"; fire(); };
  const map = (m, v) => { m.clear(); Object.keys(v || {}).forEach(k => m.set(k, v[k])); };
  offs.push(F.onValue(R("hseDurum"), s => { map(durum, s.val()); err = ""; loaded = true; fire(); }, bad));
  offs.push(F.onValue(R("hseAksiyon"), s => { map(aks, s.val()); fire(); }, () => { }));
  offs.push(F.onValue(R("hseGelen"), s => { map(gelen, s.val()); fire(); }, bad));
  setTimeout(() => bolumleriYayinla().catch(() => { }), 1500);
  offs.push(F.onValue(R("settings/fabrikalar"), s => {
    const v = s.val(); fabs = Object.values(v || {}).map(x => x && x.name).filter(Boolean); fire();
  }, bad));
}


// ---- Aksiyon alındı ⇄ görev kapatma ----
// HSE'de onaylı aksiyon: isg/hseAksiyon/{anahtar} = { tx, at }. Görev programı bunu görünce bağlı görevi kapatır.
// Yalnızca göreve bağlı (durum açık/kapalı) bulgular için yazılır; bağlantı yoksa sessizce atlanır.
export function aksiyonYaz(key, tx, at) {
  if (state() !== "hazir" || !loaded) return;
  const d = durum.get(key); if (!d || (d.durum !== "acik" && d.durum !== "kapali")) return;
  const cur = aks.get(key); if ((cur && cur.tx === tx) || aksSent.get(key) === tx) return;
  aksSent.set(key, tx);
  F.set(R("hseAksiyon/" + key), { tx, at: at || Date.now() }).catch(() => aksSent.delete(key));
}
export function aksiyonSil(key) {
  if (state() !== "hazir" || !loaded || !aks.has(key)) return;
  aksSent.delete(key); F.remove(R("hseAksiyon/" + key)).catch(() => { });
}

// ---- Bölüm listesini görev takibe yayınla (kayıt formundaki açılır liste ve bölüm grafikleri için) ----
// isg/hseBolumler/{fabrikaId} = { fab, list: [bölüm adları], at }. Yalnızca bağlıysa çalışır; puanı etkilemez.
const bolumSon = new Map();
export async function bolumleriYayinla() {
  if (!CFG || state() !== "hazir") return;
  const fs = (await S.listFactories()).filter(f => !f.archived);
  for (const f of fs) {
    const ys = await S.listYears(f.id); if (!ys.length) continue;
    const setup = await S.getSetup(f.id, ys[ys.length - 1]);
    const list = [...new Set((setup?.rows || []).map(r => String(r.name || "").trim()).filter(Boolean))];
    const sig = JSON.stringify([f.name, list]);
    if (bolumSon.get(f.id) === sig) continue;
    try { await F.set(R("hseBolumler/" + makeKey(f.id)), { fab: f.name, list, at: Date.now() }); bolumSon.set(f.id, sig); } catch { }
  }
}

export async function init() {
  if (!CFG || started) return; started = true;
  try {
    const [A, Au, D] = await Promise.all([import(CDN + "firebase-app.js"), import(CDN + "firebase-auth.js"), import(CDN + "firebase-database.js")]);
    const app = A.initializeApp(CFG.firebase, "gorev");
    auth = Au.getAuth(app); db = D.getDatabase(app, CFG.firebase.databaseURL); F = { ...Au, ...D };
    Au.setPersistence(auth, Au.browserLocalPersistence).catch(() => { });
    Au.onAuthStateChanged(auth, u => { user = u; err = ""; stopW(); if (u) startW(); fire(); });
  } catch (e) { started = false; err = "ag"; fire(); }
}

// ---- Düğme / etiket ----
const GREEN = "background:#D9F1E6;color:#0B6E4F";
function inner(key, tile) {
  const d = durum.get(key), g = gelen.get(key);
  const T = (kind, ic, t1, t2, extra) => tile
    ? `<button class="pbtn" ${extra}style="${kind}"><b style="font-size:17px;line-height:1">${ic}</b><i>${t2}</i></button>`
    : null;
  if (d && (d.durum === "acik" || d.durum === "kapali")) {
    const k = d.durum === "kapali" ? "Kapalı" : "Açık";
    return T("background:#D9F1E6;color:#0B6E4F;border-color:#0B6E4F;cursor:default", "✓", "", `Bağlı · ${k}`, "disabled ") || `<span class="pill" style="${GREEN}">✓ Göreve bağlı · ${k}</span>`;
  }
  if (d && d.durum === "kayit" && d.mevcut) return T("background:#D9F1E6;color:#0B6E4F;border-color:#0B6E4F;cursor:default", "✓", "", "Zaten kayıtlı", "disabled ") || `<span class="pill" style="${GREEN}" title="Aynı olay görev takipte zaten vardı; ikinci kayıt açılmadı, mevcut kayıt buna bağlandı">✓ Görev takipte zaten kayıtlı</span>`;
  if (d && d.durum === "kayit") return T("background:#D9F1E6;color:#0B6E4F;border-color:#0B6E4F;cursor:default", "✓", "", "Olay kaydı", "disabled ") || `<span class="pill" style="${GREEN}" title="Olay sayfasında; bilgileri tamamlayıp Göreve Ekle denince görev olur">✓ Olay kaydına aktarıldı</span>`;
  if (g && g.islendi !== "hata") return T("background:#D9F1E6;color:#0B6E4F;border-color:#0B6E4F;cursor:default", "✓", "", "Bağlı · bekliyor", "disabled title=\"Görev programı açılınca eklenir\" ") || `<span class="pill" style="${GREEN}" title="Görev programı açılınca eklenir">✓ Göreve bağlı · aktarım bekliyor</span>`;
  if ((d && d.durum === "hata") || (g && g.islendi === "hata")) return T("background:#FBE9C6;color:#5A3300;border-color:#E8C877", "!", "", "Fabrika adı", `data-gerr="${esc(key)}" `) || `<button class="sm" data-gerr="${esc(key)}" style="height:36px;background:#FBE9C6;color:#5A3300;border:1px solid #E8C877">Aktarılamadı · fabrika adı</button>`;
  return T("color:#0B6E4F;border-color:#0B6E4F", "+", "", "Göreve ekle", `data-gadd="${esc(key)}" `) || `<button class="sm sec" data-gadd="${esc(key)}" style="height:36px">+ Göreve ekle</button>`;
}
export const chip = (key, payload, tile = false) => { pend.set(key, payload); return `<span class="gk" data-gk="${esc(key)}"${tile ? ' data-tile="1"' : ' style="margin-left:auto;flex:0 0 auto"'}>${inner(key, tile)}</span>`; };
function paint() { document.querySelectorAll("[data-gk]").forEach(el => { el.innerHTML = inner(el.dataset.gk, !!el.dataset.tile); }); }

// ---- Uyarı kartı (uygulamanın .warn deseni) ----
const MSG = {
  yok: ["Görev takip programı bağlı değil", "Bu kurulumda görev takip programı tanımlı değil, bu özellik kullanılamaz. HSE Verim görev takibi olmadan da eksiksiz çalışır."],
  giris: ["Görev takip programına giriş yapılmamış", "Göreve eklemek için Ayarlar → Uygulama ve Senkronizasyon bölümünden görev programı hesabınızla bağlanın."],
  hata: ["Görev takip programına ulaşılamadı", "İnternet bağlantınızı kontrol edin. Sorun sürerse Ayarlar'dan bağlantıyı kesip yeniden bağlanın (yetki hatası olabilir)."]
};
export function warn(kind, x = {}) {
  const [t, msg] = kind === "fab"
    ? ["Fabrika adı uyuşmuyor", `HSE Verim'deki fabrika adı "${x.hse}" görev takip programında bulunamadı. Görev programındaki fabrikalar: ${(x.liste || []).join(", ") || "(liste boş)"}. Adı hangi programda değiştireceğinize siz karar verin; adlar aynı olunca tekrar deneyin.`]
    : MSG[kind] || MSG.hata;
  const m = document.createElement("div"); m.className = "mod";
  m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:14px"><h2>${esc(t)}</h2><div class="warn">${esc(msg)}</div>
    <div class="row" style="justify-content:flex-end">${kind === "giris" || kind === "hata" ? '<button class="sec" data-go>Ayarlara git</button>' : ""}<button data-ok>Tamam</button></div></div>`;
  document.body.appendChild(m);
  m.querySelector("[data-ok]").onclick = () => m.remove();
  const go = m.querySelector("[data-go]"); if (go) go.onclick = () => { m.remove(); location.hash = "#ayarlar"; };
  m.addEventListener("mousedown", e => { if (e.target === m) m.remove(); });
}

// Fotoğrafı görev takibin ana görsel boyutuna (en çok 1000 px, JPEG) küçültür
const shrink = src => new Promise(res => { const im = new Image(); im.onload = () => { const r = Math.min(1, 1000 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * r); c.height = Math.round(im.height * r); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", .72)); }; im.onerror = () => res(""); im.src = src; });
async function add(key) {
  let p = pend.get(key); if (!p) return;
  if (!CFG) return warn("yok");
  if (!F) await init();
  let s = state(); if (s === "bekle") { await sleep(800); s = state(); }
  if (s === "giris") return warn("giris");
  if (s !== "hazir") return warn("hata");
  for (let i = 0; i < 20 && fabs === null; i++) await sleep(150);
  if (fabs === null) return warn("hata");
  if (!fabs.some(n => norm(n) === norm(p.fab))) return warn("fab", { hse: p.fab, liste: fabs });
  if (p.fotoId) { // ramak kala: ilk fotoğraf olay kaydının ana görseli olur
    const { fotoId, fotoFid, fotoYil, ...rest } = p; p = rest;
    try { const full = await S.getPhoto(fotoFid, fotoYil, fotoId); const g = full ? await shrink(full) : ""; if (g && g.length < 900000) p = { ...p, foto: g }; } catch { }
  }
  try { await F.set(R("hseGelen/" + key), { ...p, ...(p.tip === "ramak" ? { islendi: "ramak" } : {}), at: Date.now() }); } catch (e) { return warn("hata"); }
  if (p.tip === "ramak") { // görev takip aynı olayı zaten kayıtlı bulursa uyar
    const off = onChange(() => { if (durum.get(key)?.mevcut) { off(); clearTimeout(tm); toast("Bu ramak kala görev takipte zaten kayıtlı. İkinci kayıt açılmadı, mevcut kayıt bağlandı."); } });
    const tm = setTimeout(off, 45000);
  }
}
document.addEventListener("click", e => {
  const b = e.target.closest?.("[data-gadd]"); if (b) { e.preventDefault(); add(b.dataset.gadd); return; }
  const r = e.target.closest?.("[data-gerr]"); if (r) { e.preventDefault(); const p = pend.get(r.dataset.gerr); warn("fab", { hse: p?.fab || "", liste: fabs || [] }); }
});

// ---- Ayarlar: bağlan / kes ----
export function login() {
  return new Promise(res => {
    const m = document.createElement("div"); m.className = "mod";
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:14px"><h2>Görev takip programına bağlan</h2>
      <div class="muted" style="font-size:13px;line-height:1.5">Görev takip programında kullandığınız hesabın e-posta ve şifresi. Şifre kaydedilmez; yalnızca bu cihazda oturum açık kalır.</div>
      <div><label class="hd" for="gvE">E-POSTA</label><input id="gvE" class="inp" type="email" autocomplete="username"></div>
      <div><label class="hd" for="gvP">ŞİFRE</label><input id="gvP" class="inp" type="password" autocomplete="current-password"></div>
      <div class="warn hide" id="gvW"></div>
      <div class="row" style="justify-content:flex-end"><button class="sec" data-no>Vazgeç</button><button data-yes>Bağlan</button></div></div>`;
    document.body.appendChild(m);
    const done = v => { m.remove(); res(v); };
    m.querySelector("[data-no]").onclick = () => done(false);
    m.querySelector("[data-yes]").onclick = async () => {
      const w = m.querySelector("#gvW"), email = m.querySelector("#gvE").value.trim(), pw = m.querySelector("#gvP").value;
      if (!email || !pw) { w.textContent = "E-posta ve şifre gerekli."; w.classList.remove("hide"); return; }
      try { if (!F) await init(); await F.signInWithEmailAndPassword(auth, email, pw); done(true); }
      catch (e) { w.textContent = /invalid|wrong|not-found|credential/i.test(e?.code || e?.message || "") ? "E-posta veya şifre hatalı." : "Bağlanılamadı: " + (e?.message || e); w.classList.remove("hide"); }
    };
    m.querySelector("#gvE").focus();
  });
}
export async function disconnect() { if (F && auth) await F.signOut(auth); }

// ---- Rapor: kapatma özeti (yalnızca gösterim, puana girmez) ----
// Veri yüklenene kadar (en fazla ms) bekler; bağlı değilse hemen döner
export async function whenReady(ms = 2500) {
  if (!CFG) return;
  for (let t = 0; t < ms && !(state() === "hazir" && loaded); t += 100) { if (state() === "giris") return; await sleep(100); }
}
// Anahtar biçimi: d|k _ fabrikaId _ yıl _ ay _ bölümId _ ...
const sum0 = () => ({ n: 0, kapali: 0, acik: 0, topSure: 0, nSure: 0 });
export function summary(fid, year, months) {
  if (!CFG || state() !== "hazir" || !loaded) return null;
  const out = { d: sum0(), k: sum0() };
  durum.forEach((v, key) => {
    const p = key.split("_");
    if (p.length < 5 || (p[0] !== "d" && p[0] !== "k") || p[1] !== makeKey(fid) || p[2] !== String(year) || !months.includes(+p[3])) return;
    if (!v || !["acik", "kapali", "kayit"].includes(v.durum)) return;
    const o = out[p[0]]; o.n++; out.m0 = Math.min(out.m0 ?? 99, +p[3]); out.m1 = Math.max(out.m1 ?? 0, +p[3]);
    if (v.durum === "kapali") { o.kapali++; if (v.kapanis && v.acilis && v.kapanis >= v.acilis) { o.topSure += (v.kapanis - v.acilis) / 864e5; o.nSure++; } }
    else o.acik++;
  });
  return out.d.n + out.k.n ? out : null;
}
