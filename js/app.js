import { auth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from "./firebase.js?v=20261030c";
import * as S from "./store.js?v=20261030c";
import * as Prim from "./primary.js?v=20261030c";
import * as Denetim from "./denetim.js?v=20261030c";
import * as Kaza from "./kaza.js?v=20261030c";
import * as Konusma from "./konusma.js?v=20261030c";
import * as Ramak from "./ramak.js?v=20261030c";
import * as Genel from "./genel.js?v=20261030c";
import * as Rapor from "./rapor.js?v=20261030c";
import * as Verim from "./verim.js?v=20261030c";
import * as Isbasi from "./isbasi.js?v=20261030c";
import * as Guest from "./guest.js?v=20261030c";
import * as Yontem from "./yontem.js?v=20261030c";
import * as Tatil from "./tatil.js?v=20261030c";
import * as Gorev from "./gorev.js?v=20261030c";
import { banner, bannerInit, guestWatch, stop as bnStop, linkRenewed } from "./bildirim.js?v=20261030c";
import * as Arsiv from "./arsiv.js?v=20261030c";
import * as FabArsiv from "./fabarsiv.js?v=20261030c";
import { $, esc, ic, toast, modal, confirmBox, formBox, noticeBox, GUEST } from "./ui.js?v=20261030c";
import { num, c2, katsayi, nAt, ztfRamp, RISK, DEFAULT_PARAMS, newRow, rid } from "./scoring.js?v=20261030c";
const PEND_META = { isbasig: ["isbasi", "İşbaşı Eğitim"], konusmag: ["konusma", "Eğitim Konuşması"], kazag: ["kaza", "İş Kazası"], ramak: ["ramak", "Ramak Kala"] };

const VERSION = "1.8.5";
const st = { factories: [], years: [], fid: null, year: null, page: "genel", profile: {}, lastSync: new Date() };

const GROUPS = [
  ["ANA MENÜ", [
    ["genel", "Genel Bakış", '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'],
    ["kurulum", "Kurulum ve Kayıtlar", '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'],
    ["ayarlar", "Ayarlar", '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>']]],
  ["AYLIK VERİ GİRİŞİ", [
    ["denetim", "İSG Denetim Listesi", '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 13l2 2 4-4"/>'],
    ["ramak", "Ramak Kala", '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16.5h0"/>'],
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
  "auth/too-many-requests": "Çok fazla deneme yapıldı; Firebase bu cihazı geçici olarak engelledi. 15-60 dakika bekleyin veya şifre sıfırlama bağlantısı isteyin.", "auth/network-request-failed": "Bağlantı hatası.",
  "auth/operation-not-allowed": "E-posta/Parola girişi Firebase'de kapalı. Konsol → Authentication → Sign-in method → E-posta/Parola anahtarını açın.", "auth/user-disabled": "Bu hesap Firebase'de devre dışı bırakılmış."
}[e.code] || ((e.code ? `[${e.code}] ` : "") + e.message));

// ---------- Giriş ----------
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault(); $("loginErr").textContent = "";
  try { await signInWithEmailAndPassword(auth, $("em").value.trim(), $("pw").value); }
  catch (er) { $("loginErr").textContent = errMsg(er); }
});
$("showPw").addEventListener("change", e => { $("pw").type = e.target.checked ? "text" : "password"; });
$("btnGuest").addEventListener("click", () => {
  showOnly("none");
  Guest.showInviteEntry(({ owner, code, personal }) => personal ? (Guest.storeOwner(owner), Guest.pLogin({ owner, code })) : Guest.showRequest({ owner, code }, () => { const u = auth.currentUser; if (u) startGuest(owner, u); }), () => { Guest.hideRequest(); showOnly("login"); });
});
$("btnLink").addEventListener("click", async () => {
  const em = $("em").value.trim();
  if (!em) { $("loginErr").textContent = "Önce e-posta yazın."; return; }
  try { await Prim.sendLoginLink(em); $("loginErr").textContent = "Giriş bağlantısı e-postanıza gönderildi. Bu tarayıcıda e-postadaki bağlantıya dokunun."; }
  catch (er) { $("loginErr").textContent = Prim.loginErrText(er); }
});
Prim.finishLoginLink(t => { $("loginErr").textContent = t; });
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
const LINK = Guest.linkInfo();
let closedNote = null;
let unwatchDev = null;
let unwatchG = null, guestTimer = null, unwatchReq = null, unwatchInb = null, unwatchFb = null;
try { navigator.serviceWorker?.register("./sw.js"); } catch {}
// Ana ekrana ekle / uygulamayı kur (tarayıcı destekliyorsa doğrudan, desteklemiyorsa kısa yönerge)
let DEFER = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); DEFER = e; if (GUEST.on && st.page === "genel") render(); });
window.addEventListener("appinstalled", () => { DEFER = null; });
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
async function installApp() {
  if (DEFER) { const d = DEFER; DEFER = null; d.prompt(); await d.userChoice?.catch(() => { }); return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  noticeBox("Ana ekrana ekle", ios ? "Safari'de alttaki Paylaş simgesine basın, ardından \"Ana Ekrana Ekle\" deyin." : "Tarayıcının sağ üstteki ⋮ menüsünü açın, \"Uygulamayı yükle\" veya \"Ana ekrana ekle\" seçeneğine basın.", "ok");
}
const instState = () => `<div><span class="hd">UYGULAMA</span><div style="font-weight:700"><i class="sw" style="background:${standalone() ? "#17A06F" : "#9FB4AE"};border-radius:50%"></i>${standalone() ? "Kurulu · ana ekranda" : "Tarayıcıda açık"}</div></div>`;
const instBtn = () => standalone() ? "" : `<button class="sec" id="appInst" title="Uygulamayı telefonun ana ekranına ekler">Uygulamayı kur</button>`;
const instBind = () => { const b = $("appInst"); if (b) b.onclick = installApp; };
function showOnly(which) { // "login" | "app" | "none"
  $("login").classList.toggle("hide", which !== "login");
  $("app").classList.toggle("hide", which !== "app");
}
async function guestOut(note, manual) {
  bnStop();
  const eg = Guest.isEmailGuest(auth.currentUser) && LINK?.type === "pguest";
  unwatchG?.(); unwatchDev?.(); clearInterval(guestTimer); Guest.storeOwner(null); st.role = null; GUEST.on = false; S.setOwner(null);
  if (eg) closedNote = manual ? { title: "Çıkış yapıldı", text: "Tekrar girmek için size gönderilen bağlantıya dokunun ya da aşağıdaki düğmeye basın.", retry: true } : { title: "Erişim sona erdi", text: note || "Bu bağlantı kapatıldı." };
  try { await signOut(auth); } catch {}
  if (eg) return;
  if (note) { try { sessionStorage.setItem("hse_gnote", note); } catch {} }
  location.href = location.pathname;
}
// Misafir "son görülme": açılışta ve sekmeye dönünce, en fazla 10 dakikada bir
let seenAt = 0;
function seenPing(owner, gid) {
  const go = () => { if (Date.now() - seenAt > 6e5) { seenAt = Date.now(); Guest.touchSeen(owner, gid); } };
  go(); if (!seenPing.bound) { seenPing.bound = true; document.addEventListener("visibilitychange", () => { if (!document.hidden && GUEST.on) go(); }); }
}
async function startGuest(owner, user) {
  const m = await Guest.getMember(owner, user.uid);
  if (!Guest.isLive(m)) {
    const rq = await Guest.pendingState(owner, user.uid);
    showOnly("none");
    if (Guest.isEmailGuest(user)) { closedNote = { title: m ? "Erişim süreniz doldu" : "Bağlantı kapatıldı", text: m ? "Yeniden erişim için yetkili kişiyle iletişime geçin." : "Bu bağlantı yetkili kişi tarafından kapatılmış. Erişim için yetkili kişiyle iletişime geçin." }; Guest.showEnded(closedNote); await signOut(auth).catch(() => {}); return; }
    if (rq?.status === "pending") return Guest.waiting({ owner, gid: user.uid, code: rq.code }, () => startGuest(owner, user));
    return Guest.showExpired({ owner, code: LINK?.code || rq?.code, member: m }, () => startGuest(owner, user));
  }
  Guest.hideRequest(); Guest.storeOwner(owner);
  const an = Guest.archivedNote(m); // fabrikası arşivlenen misafir: erişim askıda uyarısı; yetkili geri açarsa kendiliğinden devam eder
  if (an) { unwatchG?.(); clearInterval(guestTimer); showOnly("none"); Guest.showEnded({ ...an, retry: true, btn: "Tamam" }); unwatchG = Guest.watchMember(owner, user.uid, mm => { if (mm && !Guest.archivedNote(mm)) startGuest(owner, user); }); return; }
  const first = !m.lastSeen && Guest.isEmailGuest(user); if (LINK?.type === "pguest") Guest.pinManifest();
  if (Guest.isEmailGuest(user)) {
    const g = await Guest.deviceGate(owner, user, m, first);
    if (g === "rot") { await signOut(auth).catch(() => {}); return; }
    if (g === "pending") { showOnly("none"); unwatchDev?.(); unwatchDev = Guest.showPending(owner, user.uid, () => startGuest(owner, user), () => { closedNote = { title: "Cihaz engellendi", text: "Bu cihazın erişimi yetkili kişi tarafından engellendi. Erişim için yetkili kişiyle iletişime geçin." }; Guest.showEnded(closedNote); signOut(auth).catch(() => {}); }); return; }
    if (g === "blocked") { closedNote = { title: "Cihaz engellendi", text: "Bu cihazın erişimi yetkili kişi tarafından engellendi. Erişim için yetkili kişiyle iletişime geçin." }; Guest.showEnded(closedNote); showOnly("none"); await signOut(auth).catch(() => {}); return; }
    unwatchDev?.(); unwatchDev = Guest.watchDevice(owner, user.uid, d => { if (d?.blocked) guestOut("Bu cihazın erişimi yetkili kişi tarafından engellendi."); });
  }
  seenPing(owner, user.uid); if (first) toast(`Hoş geldiniz, ${m.name}.`);
  S.setOwner(owner, m.factories || []);
  Guest.setGuestCtx({ owner, uid: user.uid, name: m.name, ntfy: m.ntfy || null }); linkRenewed(user.uid, m.rot);
  GUEST.on = true; GUEST.name = m.name; GUEST.uid = user.uid; GUEST.hist = m.hist !== false; st.role = "guest"; st.guest = { uid: user.uid, name: m.name, email: m.unit || m.email || "", member: m };
  showOnly("app"); document.body.classList.add("is-guest");
  unwatchG?.(); clearInterval(guestTimer);
  const check = mm => { if (!Guest.isLive(mm)) guestOut(mm?.stopped ? "Erişiminiz yetkili kişi tarafından durduruldu." : mm ? "Erişim süreniz doldu." : "Erişiminiz yetkili kullanıcı tarafından kaldırıldı."); };
  unwatchG = Guest.watchMember(owner, user.uid, mm => { if (!mm) return check(null); if (Guest.archivedNote(mm)) return startGuest(owner, user); if (Guest.isEmailGuest(user) && Guest.rotated(user, mm)) return guestOut("Bu bağlantı yenilendi. Size gönderilen yeni bağlantıya dokunun."); st.guest.member = mm; Guest.setGuestCtx({ ntfy: mm.ntfy || null }); check(mm); });
  guestTimer = setInterval(() => check(st.guest.member), 30000);
  await loadContext(); go(location.hash.slice(1) || "genel");
}
onAuthStateChanged(auth, async user => {
  if (!user) {
    bnStop(); unwatchG?.(); clearInterval(guestTimer);
    if (closedNote) { showOnly("none"); Guest.showEnded(closedNote); return; }
    if (LINK?.type === "pguest") { showOnly("none"); Guest.pLogin(LINK); return; }
    if (LINK?.type === "guest") { showOnly("none"); Guest.showRequest({ owner: LINK.owner, code: LINK.code, note: (() => { try { const n = sessionStorage.getItem("hse_gnote"); sessionStorage.removeItem("hse_gnote"); return n || ""; } catch { return ""; } })() }, () => { const u = auth.currentUser; if (u) startGuest(LINK.owner, u); }); return; }
    showOnly("login"); return;
  }
  if (Guest.isGuestUser(user)) {
    if (Guest.isSending()) return; // istek gönderilirken bekle
    if (LINK?.type === "pguest" && Guest.isEmailGuest(user) && user.email !== Guest.pEmail(LINK.ek || LINK.code)) { await signOut(auth); return; } // bu cihazda başka misafir açıktı
    const owner = LINK?.type === "guest" || LINK?.type === "pguest" ? LINK.owner : Guest.storedOwner();
    if (!owner) { await signOut(auth); return; }
    return startGuest(owner, user);
  }
  Guest.hideRequest(); showOnly("app"); document.body.classList.remove("is-guest"); st.role = "owner"; GUEST.on = false;
  if (user) {
    try { await S.touchSession(true); await S.ensurePrimary(); } catch {}
    unwatch?.(); clearInterval(beat);
    unwatch = S.watchSession(d => { if (d?.revoked) doSignOut(); });
    beat = setInterval(() => S.touchSession().catch(() => {}), 5 * 60 * 1000);
    S.getProfile().then(p => { st.profile = p; }).catch(() => {});
    Gorev.init();
    await loadContext(); go(location.hash.slice(1) || "genel");
    Prim.handleLanding(t => { toast(t); if (st.page === "ayarlar") render(); });
    unwatchReq?.();
    unwatchReq = Guest.watchRequests(user.uid, (list, initial) => {
      const r = list[list.length - 1], n = list.length;
      const msg = initial ? `${n} misafir isteği onay bekliyor.` : `${r.name} misafir erişimi istiyor.`;
      initial ? bannerInit(["y", "Yeni misafir kaydı", msg]) : banner("y", "Yeni misafir kaydı", msg); Guest.notify("HSE Verim · Misafir onay isteği", msg, `${location.pathname}?onay=${r.gid}`);
      if (!initial && !document.querySelector(".mod")) Guest.approvalDialog(user.uid, r.gid, st.all, () => { if (st.page === "ayarlar") render(); });
      else if (st.page === "ayarlar") render();
    });
    unwatchInb?.(); let inbFirst = true;
    unwatchInb = Guest.watchInbox(user.uid, list => {
      const r = list[list.length - 1], msg = r.no === 0 ? `${r.byName} · ${r.deptName}${r.wk ? " · " + r.wk + ". hafta" : ""}: aksiyon bildirdi.` : `${r.byName} · ${r.deptName}: ${r.no}. denetim ${r.kind === "review" ? "tamamlanmasını istiyor" : "kaydedildi"}.`;
      inbFirst ? (inbFirst = false, bannerInit(["y", "Aksiyon incelemesi bekliyor", msg])) : banner("y", r.no === 0 ? "Aksiyon incelemesi bekliyor" : "Misafir denetimi", msg); Guest.notify("HSE Verim · Misafir denetimi", msg, `${location.pathname}?denetim=${[r.fid, r.year, r.month, r.dept].join(".")}`);
      if (st.page === "genel") render(); else if (st.page === "denetim") Denetim.reload();
    });
    unwatchFb?.(); st.fb = []; let fbFirst = true;
    unwatchFb = Guest.watchFeedback(user.uid, list => {
      const before = (st.fb || []).filter(x => !x.read).length; st.fb = list; const now = list.filter(x => !x.read).length;
      if (!fbFirst && now > before) { const r = list.find(x => !x.read); banner("y", "Yeni geri bildirim", `${r.name}`); Guest.notify("HSE Verim · Geri bildirim", `${r.name}: ${r.text.slice(0, 100)}`, location.pathname); }
      fbFirst = false; drawNav();
    });
    if (LINK?.type === "audit") { Guest.clearLink(); openAudit(LINK); }
    if (LINK?.type === "approve") { Guest.clearLink(); Guest.approvalDialog(user.uid, LINK.gid, st.all, () => { if (st.page === "ayarlar") render(); }); }
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
  // Yıl kuralları: bugünün yılından ilerisi geçerli değildir; arşivdeki yıllar seçicilerde görünmez
  const cy = new Date().getFullYear();
  st.yearsMeta = st.fid ? await S.listYearsMeta(st.fid) : [];
  st.yearsAll = st.yearsMeta.map(m => m.id);
  st.years = st.yearsMeta.filter(m => !m.archived && +m.id <= cy).map(m => m.id);
  const saved = S.pref.get("year");
  const fa = st.factories.find(f => f.id === st.fid)?.activeYear;
  st.active = st.years.map(String).includes(String(fa)) ? String(fa) : st.years[st.years.length - 1] || null;
  st.year = st.years.includes(saved) ? saved : st.active;
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
const resetOpen = () => { for (const M of [Denetim, Kaza, Konusma, Isbasi, Ramak, Genel, Rapor, Verim, Tatil, Yontem, Guest]) M.reset?.(); };
let lastPage = null;
function go(p) { const np = PAGES.find(x => x[0] === p && !x[3]) ? p : "genel"; if (np !== lastPage) { resetOpen(); lastPage = np; } st.page = PAGES.find(x => x[0] === p && !x[3]) && !(st.role === "guest" && p === "kurulum") ? p : "genel"; toggleMenu(false); render(); }
// ---------- Onay bekleyen misafir kayıtları (işbaşı · konuşma · kaza) ----------
let pendKey = "", pendOff = [], pendSeen = {}, pendFirst = {};
function pendRecalc() {
  const list = []; Object.entries(st.pendBy || {}).forEach(([c, a]) => a.forEach(x => list.push({ ...x, coll: c })));
  st.pend = { list, n: { isbasi: 0, konusma: 0, kaza: 0, ...Object.fromEntries(Object.entries(PEND_META).map(([c, m]) => [m[0], (st.pendBy?.[c] || []).length])) } };
}
function ensurePend() {
  if (st.role !== "owner" || !st.fid || !st.year) return;
  const key = st.fid + "/" + st.year; if (key === pendKey) return;
  pendOff.forEach(f => f?.()); pendOff = []; pendKey = key; st.pendBy = {}; pendSeen = {}; pendFirst = {};
  Object.keys(PEND_META).forEach(c => {
    pendOff.push(S.watchColl(st.fid, st.year, c, rows => {
      const pend = rows.filter(x => x.status === "pending"); st.pendBy[c] = pend;
      const fresh = pend.filter(x => !pendSeen[c + x.id]); pend.forEach(x => { pendSeen[c + x.id] = 1; });
      pendRecalc(); drawNav();
      if (!pendFirst[c]) { pendFirst[c] = 1; if (fresh.length && !pendNoteDone) { pendNoteDone = 1; bannerInit(["y", "Onay bekleyen misafir kaydı", `${fresh.length} kayıt onayınızı bekliyor.`]); } }
      else if (fresh.length) { const m = PEND_META[c][1], x = fresh[fresh.length - 1], msg = `${x.guestName || "Misafir"} · ${m}: onayınızı bekliyor.`; banner("y", c === "ramak" ? "Ramak kala bildirimi geldi" : `${m} onay bekliyor`, `${x.guestName || "Misafir"}`); Guest.notify("HSE Verim · " + m, msg, location.pathname + "#" + PEND_META[c][0]); }
      if (st.page === "genel") render(); else if (st.page === PEND_META[c][0] && !document.querySelector(".mod")) render();
    }));
  });
}
let pendNoteDone = 0;
async function pendBoxHTML() {
  const L = st.pend?.list || []; if (!L.length) return "";
  let rows = {}; try { (await S.getSetup(st.fid, st.year))?.rows?.forEach(r => { rows[r.id] = r.name; }); } catch {}
  const MN = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const txt = x => x.coll === "isbasig" ? `${x.g ?? 0} giriş / ${x.e ?? 0} eğitim` + (/^\d{4}-\d{2}-\d{2}$/.test(x.hd || "") && x.hd !== x.d ? ` · işe başlama ${+x.hd.slice(8)} ${MN[+x.hd.slice(5, 7) - 1].slice(0, 3)}` : "") : x.coll === "konusmag" ? `${x.min} dk` : x.coll === "ramak" ? String(x.txt || "").slice(0, 60) : "kaza kaydı";
  return `<div class="cd" style="gap:12px"><div><h2>Onay bekleyen misafir kayıtları (${L.length})</h2><div class="muted" style="font-size:13px">Onaylanana kadar verim hesabına katılmaz.</div></div>
    <div class="col1" style="gap:8px">${L.sort((a, b) => (b.at || 0) - (a.at || 0)).map(x => `<div class="it" style="gap:10px;flex-wrap:wrap"><div class="grow"><b>${esc(rows[x.dept] || "—")}</b> <span class="tag" style="background:#FBE9C6;color:#6B3F00">${PEND_META[x.coll][1]}</span>
      <div class="muted" style="font-size:12.5px">${esc(txt(x))} · ${MN[(+x.month || 1) - 1]} · ${esc(x.guestName || "Misafir")}</div></div><button class="sm" data-pg="${PEND_META[x.coll][0]}" data-pm="${+x.month || ""}">Aç</button></div>`).join("")}</div></div>`;
}
function drawNav() {
  const un = (st.fb || []).filter(x => !x.read).length, env = ic('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>');
  const fbItem = st.role === "guest" ? `<a href="#" data-fb>${env}Geri Bildirim Gönder</a>` : `<a href="#" data-fb>${env}Mesaj Kutusu${un ? '<small style="margin-left:auto;font:italic 600 12px Manrope,system-ui,sans-serif;color:#F5B700">Mesajınız var</small>' : ""}</a>`;
  $("nav").innerHTML = `<div class="brand"><div class="logo"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg></div><div><b>HSE Verim Modülü</b><small>Performans Takip</small></div></div>`
    + GROUPS.map(([t, items]) => `<div class="grp"><div class="t">${t}</div>` + items.filter(i => !(st.role === "guest" && i[0] === "kurulum")).map(([k, n, d, soon]) =>
      `<a href="#${k}" class="${st.page === k ? "on" : ""} ${soon ? "soon" : ""}">${ic(d)}${n}${soon ? ' <small style="margin-left:auto;font-size:10px">yakında</small>' : ""}${st.role === "owner" && st.pend?.n?.[k] ? `<small style="margin-left:auto;background:#F5B700;color:#3B2B00;border-radius:10px;padding:1px 8px;font:700 11px Manrope,system-ui,sans-serif">${st.pend.n[k]}</small>` : ""}</a>`).join("") + (t === "RAPOR" ? fbItem : "") + `</div>`).join("")
    + `<div class="goal"><b>Hedef: Sıfır Zarar</b><span>Güvenli çalış. Ölç. Geliştir.</span><div class="dots"><i style="background:#17A06F"></i><i style="background:#2A82C4"></i><i style="background:#F5B700"></i><i style="background:#D6382E"></i></div></div>`;
  $("nav").querySelector("[data-fb]")?.addEventListener("click", e => { e.preventDefault(); toggleMenu(false); if (st.role === "guest") Guest.feedbackDialog(); else Guest.inboxDialog(Guest.ownerUid(), st.fb || [], () => drawNav()); });
}
let renderTok = 0;
async function render() {
  const tok = ++renderTok;
  ensurePend(); if (st.role === "guest" && st.guest) guestWatch({ fid: st.fid, year: st.year, uid: st.guest.uid }); drawNav();
  const v = $("view");
  if (st.page === "ayarlar") return st.role === "guest" ? pageGuestAyarlar(v) : pageAyarlar(v);
  if (!st.fid || !st.year) {
    v.innerHTML = `<div class="cd"><h2>Başlayalım</h2><p class="sub">Önce Ayarlar'dan bir fabrika ve yıl oluşturun.</p><div><a href="#ayarlar"><button>Ayarlar'a git</button></a></div></div>`;
    return;
  }
  if (st.page === "kurulum") return pageKurulum(v);
  if (st.page === "rapor") return Rapor.render(v, { st });
  if (st.page === "verim") return Verim.render(v, { st });
  if (st.page === "isbasi") return Isbasi.render(v, { st });
  if (st.page === "konusma") return Konusma.render(v, { st });
  if (st.page === "ramak") return Ramak.render(v, { st });
  if (st.page === "kaza") return Kaza.render(v, { st });
  if (st.page === "denetim") return Denetim.render(v, { st });
  await Genel.render(v, { st });
  if (tok !== renderTok) return; // daha yeni bir çizim başladı; kutuları ikinci kez ekleme
  if (st.role === "guest") Guest.installCard(v, { standalone: standalone(), hasPrompt: () => !!DEFER, install: installApp });
  if (st.role === "owner") {
    v.querySelectorAll("#inboxBox,#pendBox").forEach(x => x.remove());
    const b = document.createElement("div"); b.id = "inboxBox"; v.prepend(b); Guest.renderInbox(b, { ownerUid: auth.currentUser.uid, onOpen: openAudit });
    const h = await pendBoxHTML();
    if (tok !== renderTok) return;
    v.querySelectorAll("#pendBox").forEach(x => x.remove());
    if (h) { const p = document.createElement("div"); p.id = "pendBox"; p.innerHTML = h; v.prepend(p);
      p.querySelectorAll("[data-pg]").forEach(btn => btn.onclick = () => { st.jumpMonth = btn.dataset.pm ? +btn.dataset.pm : null; if (location.hash === "#" + btn.dataset.pg) go(btn.dataset.pg); else location.hash = btn.dataset.pg; }); }
  }
}
async function openAudit(a) {
  if (st.factories.find(f => f.id === a.fid)) {
    st.fid = a.fid; S.pref.set("fid", a.fid); await loadYears();
    if (st.years.map(String).includes(String(a.year))) { st.year = String(a.year); S.pref.set("year", st.year); }
    drawSelectors();
  }
  Denetim.focus(a.month, a.dept, a.no === 0 ? "-" : a.by || "*");
  if (location.hash === "#denetim") go("denetim"); else location.hash = "#denetim";
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
      ${setup.rows.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(nAt(r, new Date().getMonth() + 1))}</td><td>${r.risk}</td><td>${c2(ztfRamp(r, p))}</td><td>${c2(katsayi(r, new Date().getMonth() + 1))}</td></tr>`).join("")}</table></div></div>`);
}

// ---------- Kurulum ve Kayıtlar ----------
const HELP = {
  ad: ["Bölüm adı", "Bölümün tüm sayfalarda, grafiklerde ve raporlarda görünen adı.", []],
  calisan: ["Çalışan sayısı", "Bölümün ortalama çalışan sayısı. Sayı, bölüm katsayısına aşağıdaki gibi etki eder.",
    [["0-5", "katsayı 0,05"], ["6-10", "katsayı 0,10"], ["11-15", "katsayı 0,15"], ["16-20", "katsayı 0,20"], ["21-25", "katsayı 0,25"], ["26+", "katsayı 0,30"]]],
  risk: ["Risk skoru (5×5)", "Bölümün 5×5 risk matrisine göre skor aralığı. Seçilen aralık risk seviyesini ve bölüm katsayısına etkisini belirler.",
    [["0-3", "Çok Düşük · 0,05"], ["4-6", "Düşük · 0,10"], ["8-12", "Orta · 0,15"], ["15-16", "Yüksek · 0,20"], ["20-25", "Çok Yüksek · 0,25"]]],
  mak: ["Makine sayısı", "Bölümde İSG denetiminde makine emniyeti (koruyucu, acil durdurma, sıkışma noktaları) kontrolüne konu makine sayısı. Az makineli bölümde tek bir makine arızası makine parkının tamamı demektir; bu yüzden bulgu daha ağır sayılır.",
    [["4+", "normal hesap"], ["2-3", "aynı denetimde 2 makine bulgusu sıklığı 1 basamak artırır"], ["1", "tek makine bulgusu sıklığı 1 basamak artırır (kritikte sıklık 3)"], ["Yok", "makine maddeleri (1, 2) yeni denetimde otomatik Y.D. gelir; Y.D. maddelerden ceza gelmez"]]],
  tc: ["Turnover / Kalıcılık (TC)", "Personelin bölümde kalıcılık sürecini ifade eder. Tahmin etmeyin; gerçek kayda göre seçin. 1 değerine yakınlık kalıcı kadroyu, 0'a yakınlık yüksek devri gösterir.",
    [["1,0", "personel 3+ ay kalıcı"], ["0,6", "1-3 ay içinde ayrıldı"], ["0,2", "ilk 1 ayda ayrıldı"]]],
  ramp: ["Hızlı artış (Ramp)", "Çalışma sezonuna göre bölüm içindeki çalışan sayısı artış hızını ifade eder. Seçilen düzey, ZTF değerine tolerans olarak eklenir.",
    [["Düşük", "tolerans 0"], ["Orta", "tolerans +0,05"], ["Yüksek", "tolerans +0,10"]]],
  ztf: ["ZTF · Eğitim zamanlama", "İşe başlama eğitiminin hedef süre (5 gün) içinde verilmesini ifade eder. Süreç başlangıç ayından itibaren işbaşı kayıtlarındaki işe başlama ve eğitim tarihlerinden hesaplanır; bu sütundaki değer yalnızca tarihi olmayan kayıtlar ve eski aylar için kullanılır.",
    [["1,0", "1-5 gün"], ["0,8", "6. gün"], ["0,6", "7. gün"], ["0,4", "8. gün"], ["0,2", "9. gün"], ["0", "10+ gün veya eğitim verilmedi"]]],
  ztfr: ["ZTF (ramp toleranslı) · hesaplanan", "ZTF değerine ramp toleransı eklenerek bulunur, en fazla 1,0 olur. Elle girilmez.", [["Formül", "min(1; ZTF + ramp toleransı)"]]],
  kat: ["Bölüm katsayısı · hesaplanan", "Çalışan sayısı ve risk skoruna göre bulunur. İSG denetim cezası bu katsayıyla çarpılır. Elle girilmez.", [["Formül", "1 + (çalışan katsayısı − 0,05) + (risk katsayısı − 0,05)"]]]
};
const HEADS = [["ad", "Bölüm adı"], ["calisan", "Çalışan sayısı"], ["risk", "Risk skoru (5×5)"], ["mak", "Makine sayısı"], ["tc", "Turnover (TC)"], ["ramp", "Ramp düzeyi"], ["ztf", "ZTF"], ["ztfr", "ZTF (ramp toleranslı)"], ["kat", "Bölüm katsayısı"]];
const OPT = {
  risk: [["0-3", "0-3"], ["4-6", "4-6"], ["8-12", "8-12"], ["15-16", "15-16"], ["20-25", "20-25"]],
  mak: [["4", "4+ makine"], ["23", "2-3 makine"], ["1", "1 makine"], ["0", "Yok"]],
  tc: [["1,0", "1,0 · 3+ ay"], ["0,6", "0,6 · 1-3 ay"], ["0,2", "0,2 · ilk ay"]],
  ramp: [["Düşük", "Düşük"], ["Orta", "Orta"], ["Yüksek", "Yüksek"]],
  ztf: [["1,0", "1,0 · 1-5 gün"], ["0,8", "0,8 · 6. gün"], ["0,6", "0,6 · 7. gün"], ["0,4", "0,4 · 8. gün"], ["0,2", "0,2 · 9. gün"], ["0", "0 · 10+ gün"]]
};
const K = { key: "", rows: [], params: null, help: null, dirty: false, cm: 0 };
const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const sel = (cls, opts, val, label) => `<select class="${cls}" aria-label="${label}">${opts.map(([v, t]) => `<option value="${v}" ${v === val ? "selected" : ""}>${t}</option>`).join("")}</select>`;

// Çalışan sayısı aylıktır: ekranda bu ayın sayısı görünür; değiştirip kaydedince değişiklik bu aydan itibaren geçerli olur (önceki aylar değişmez)
const kLoad = rows => rows.map(r => { const o = r.id ? { ...r } : { ...r, id: rid() }; o.n0 = o.n; if (K.cm) o.n = String(nAt(o, K.cm)); return o; });
const kSave = () => K.rows.map(r => {
  const o = { ...r }, base = r.n0; delete o.n0;
  if (!K.cm || base === undefined) { o.n = String(r.n).trim(); return o; }
  const eff = String(nAt({ n: base, nm: r.nm }, K.cm)), nv = String(r.n).trim(); o.n = base;
  if (nv !== eff) { if (K.cm === 1) o.n = nv; else o.nm = { ...(r.nm || {}), [K.cm]: nv }; }
  if (o.nm && !Object.keys(o.nm).length) delete o.nm;
  return o;
});
async function pageKurulum(v) {
  Tatil.reset(); Yontem.reset();
  const key = st.fid + "/" + st.year;
  if (K.key !== key) {
    const s = await S.getSetup(st.fid, st.year);
    K.key = key; K.help = null; K.dirty = false;
    K.cm = +st.year === new Date().getFullYear() ? new Date().getMonth() + 1 : 0;
    K.rows = kLoad(s?.rows?.length ? s.rows : [newRow(1)]);
    K.params = JSON.parse(JSON.stringify({ ...DEFAULT_PARAMS, ...(s?.params || {}) })); K.params.esik = { ...DEFAULT_PARAMS.esik, ...(K.params.esik || {}) }; K.params.egitim = { ...DEFAULT_PARAMS.egitim, ...(K.params.egitim || {}) };
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
        ${sel("inp", OPT.mak, r.mak || "4", "Makine sayısı").replace("<select", '<select data-k="mak"')}
        ${sel("inp", OPT.tc, r.tc, "Turnover, kalıcılık katsayısı (TC)").replace("<select", '<select data-k="tc"')}
        ${sel("inp", OPT.ramp, r.ramp, "Hızlı artış, ramp düzeyi").replace("<select", '<select data-k="ramp"')}
        ${sel("inp", OPT.ztf, r.ztf, "ZTF, eğitim zamanlama katsayısı").replace("<select", '<select data-k="ztf"')}
        <span class="calc">${c2(ztfRamp(r, p))}</span><span class="calc">${c2(katsayi(r))}</span>
        <button class="xb" data-del="${i}" aria-label="Bölümü sil" ${K.rows.length < 2 ? "disabled" : ""}>×</button></div>`).join("")}
      <div class="muted" style="font-size:12px">Gri kutular hesaplanan değerlerdir, elle değiştirilemez.</div>${K.cm ? `<div class="muted" style="font-size:12px">Çalışan sayısı değişikliği kaydedildiği ay (${MONTHS_TR[K.cm - 1]}) ve sonraki aylar için geçerlidir; önceki aylar değişmez.</div>` : ""}</div></div>
  </div>
  <div class="two">
    <div class="cd"><h2>2 · Parametreler</h2><div class="params">
      <div class="col"><span class="hd">MODÜL AĞIRLIKLARI (%)</span>${pr("İş Kazası", "w.kaza", "İş Kazası ağırlığı")}${pr("Eğitim Konuşması", "w.konusma", "Eğitim Konuşması ağırlığı")}${pr("İşbaşı Eğitim", "w.isbasi", "İşbaşı Eğitim ağırlığı")}${pr("İSG Denetim", "w.isg", "İSG Denetim ağırlığı")}</div>
      <div class="col"><span class="hd">DURUM EŞİKLERİ (≥)</span>${pr("Mükemmel", "esik.m", "Mükemmel eşiği", '<i class="sw" style="background:#17A06F"></i>')}${pr("İyi", "esik.i", "İyi eşiği", '<i class="sw" style="background:#2A82C4"></i>')}${pr("Orta", "esik.o", "Orta eşiği", '<i class="sw" style="background:#F5B700"></i>')}${pr("Yıllık hedef", "esik.h", "Yıllık hedef", '<i class="sw" style="background:#fff;border:2px solid #0B6E4F;box-sizing:border-box"></i>')}</div>
      <div class="col"><span class="hd">EĞİTİM</span>${pr("Hedef süre (dk/kişi/ay)", "egitim.hedef", "Hedef süre")}${pr("ZTF şiddeti (kZTF)", "egitim.kztf", "ZTF şiddeti")}${pr("TC şiddeti (kTC)", "egitim.ktc", "TC şiddeti")}<div class="muted" style="font-size:12px">1 = tam etki, 0 = etkisiz.</div>
        <div class="pr"><span>Süreç başlangıç ayı</span><input class="pi" type="month" data-p="egitim.basla" aria-label="Süreç başlangıç ayı" value="${esc(p.egitim.basla || "2026-10")}"></div><div class="muted" style="font-size:12px">Eğitim konuşması ay kapanışı ve işbaşı tarih bazlı ZTF bu aydan itibaren geçerlidir.</div></div>
      <div class="col"><span class="hd">RAMP TOLERANSI (ZTF'YE EKLENİR)</span>${pr("Düşük", "ramp.dusuk", "Düşük ramp toleransı")}${pr("Orta", "ramp.orta", "Orta ramp toleransı")}${pr("Yüksek", "ramp.yuksek", "Yüksek ramp toleransı")}</div>
      <div class="col"><span class="hd">İSG DENETİMİ</span>${pr("Azami sıklık puanı", "isg.azami", "Azami sıklık puanı")}${pr("Ramak kala: ayda 1", "isg.r1", "Ayda 1 bonusu")}${pr("Ramak kala: 2 haftada 1", "isg.r2", "2 haftada 1 bonusu")}${pr("Ramak kala: haftalık", "isg.r3", "Haftalık bonusu")}</div>
    </div></div>
    <div class="save"><h2>3 · Kaydet ve Aktifleştir</h2>
      <ul>${["Bölüm tabloları oluşturulur", "Verim hesaplamaları bağlanır", "Genel Bakış grafikleri hazırlanır", "Aylık veri giriş sayfaları açılır"].map(t => `<li>${ic('<path d="M4 12l5 5L20 6"/>').replace('stroke="currentColor"', 'stroke="#5BD6A4"')}<span>${t}</span></li>`).join("")}</ul>
      <div id="kerr" class="warn hide"></div>
      <button class="go" id="saveK">Kaydet ve Sistemi Aktifleştir</button>
      <small>Sonradan bölüm eklendiğinde veya silindiğinde tablolar ve grafikler yeniden hesaplanır.</small></div>
  </div>
  <div id="tatilCard"></div>
  <div id="yontemCard"></div>`;
  v.querySelectorAll("[data-h]").forEach(b => b.onclick = () => { K.help = K.help === b.dataset.h ? null : b.dataset.h; drawKurulum(v); });
  v.querySelectorAll(".g[data-i]").forEach(g => g.querySelectorAll("[data-k]").forEach(el => el.onchange = () => {
    K.rows[+g.dataset.i][el.dataset.k] = el.value; drawKurulum(v);
  }));
  v.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { K.rows.splice(+b.dataset.del, 1); drawKurulum(v); });
  $("addRow").onclick = () => { K.rows.push(newRow(K.rows.length + 1)); drawKurulum(v); };
  v.querySelectorAll(".pi").forEach(el => el.onchange = () => {
    const ks = el.dataset.p.split("."); ks.slice(0, -1).reduce((o, k) => o[k], K.params)[ks.at(-1)] = el.value.trim(); drawKurulum(v);
  });
  if (String(st.year) !== String(st.active)) {
    v.querySelectorAll(".inp,.pi,.xb,#addRow,#saveK").forEach(e => e.disabled = true);
    v.insertAdjacentHTML("afterbegin", `<div class="warn">${st.year} arşiv yılıdır, salt okunur. Değişiklik için aktif yılı seçin veya Ayarlar → Yıllar’dan bu yılı aktif yapın.</div>`);
  }
  Tatil.mount($("tatilCard"), st, String(st.year) !== String(st.active) || st.role === "guest").catch(() => {});
  Yontem.mount($("yontemCard"), () => K.params, { fname: st.factories.find(x => x.id === st.fid)?.name || "", year: st.year });
  $("saveK").onclick = async () => {
    const errs = validateK();
    const box = $("kerr"); box.classList.toggle("hide", !errs.length); box.innerHTML = errs.join("<br>");
    if (errs.length) return;
    const btn = $("saveK"); if (btn.dataset.busy) return;
    const label = btn.textContent; btn.dataset.busy = "1"; btn.disabled = true; btn.textContent = "Kaydediliyor…";
    const slow = setTimeout(() => toast("Bağlantı yavaş; kayıt gönderiliyor. Sayfayı kapatmayın."), 4000);
    try {
      const saved = kSave(); await S.saveSetup(st.fid, st.year, { rows: saved, params: K.params }); clearTimeout(slow); Gorev.bolumleriYayinla?.().catch(() => { });
      K.rows = kLoad(saved); drawKurulum(v); toast("Kurulum kaydedildi");
      const b2 = $("saveK"); if (b2) { b2.textContent = "✓ Kaydedildi"; setTimeout(() => { const b3 = $("saveK"); if (b3 && b3.textContent === "✓ Kaydedildi") b3.textContent = label; }, 2500); }
    } catch (e) { clearTimeout(slow); toast("Kaydedilemedi: " + e.message); btn.disabled = false; btn.textContent = label; delete btn.dataset.busy; }
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
  if (!(num(p.esik.h) > 0 && num(p.esik.h) <= 100)) e.push("Yıllık hedef 1 ile 100 arasında olmalı.");
  return e;
}

// ---------- Ayarlar ----------
const BUILD = "10.10.2026";
const fmtDt = t => new Date(t).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const photoOf = uid => { try { return S.pref.get("photo_" + uid) || ""; } catch { return ""; } };
const avHtml = (name, photo, id) => `<button type="button" class="av" id="${id}" aria-label="Profil fotoğrafı">${photo ? `<img src="${esc(photo)}" alt="">` : esc(initials(name))}</button>`;
const readPhoto = file => new Promise((res, rej) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => { const m = Math.min(im.width, im.height), c = document.createElement("canvas"); c.width = c.height = 256; c.getContext("2d").drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, 256, 256); URL.revokeObjectURL(u); res(c.toDataURL("image/jpeg", 0.82)); }; im.onerror = () => rej(new Error("Resim okunamadı.")); im.src = u; });
// Profil fotoğrafı: seç / kaldır. Sonuç: yeni data URL, "" (kaldır) veya null (vazgeç)
async function pickPhoto(has) {
  let rm = false;
  const p = modal(`<h2>Profil fotoğrafı</h2><p class="muted">Fotoğraf yoksa adınızın baş harfleri gösterilir.</p><div class="row" style="justify-content:flex-end"><button class="sec" data-no>Vazgeç</button>${has ? '<button class="sec outred" data-rmp>Kaldır</button>' : ""}<button data-yes>Fotoğraf seç</button></div>`);
  const b = document.querySelector("[data-rmp]"); if (b) b.onclick = () => { rm = true; document.querySelector(".mod [data-no]").click(); };
  const r = await p; if (rm) return ""; if (!r) return null;
  return new Promise(res => { const i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.onchange = async () => { const f = i.files[0]; if (!f) return res(null); try { res(await readPhoto(f)); } catch (e) { toast(e.message); res(null); } }; i.oncancel = () => res(null); i.click(); });
}
const initials = n => (n || "").split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join("") || "?";
const item = (inner, bg = "var(--card)", bd = "var(--line)") => `<div class="it${bg === "var(--card)" ? "" : " lt"}" style="background:${bg};border-color:${bd}">${inner}</div>`;
const THEMES = [["light", "Açık", "#0B2230", "#EDF2F0", "#fff"], ["dark", "Koyu", "#06121a", "#0d1a22", "#14262f"], ["auto", "Cihaza göre", "#0B2230", "#8aa39b", "#cfdcd7"]];

// Yıl seçenekleri penceresi: Arşive taşı · Sil · İptal
function yearMenu(y, { active, archived }) {
  return new Promise(res => {
    const m = document.createElement("div"); m.className = "mod";
    const info = active ? `${y} şu an aktif yıl. Aktif yıl arşive taşınamaz veya silinemez; önce başka bir yılı aktif yapın.`
      : `<b>Arşive taşı:</b> yıl seçicilerden ve karşılaştırmalardan kalkar, verileri korunur; istediğiniz zaman geri alabilirsiniz.<br><b>Sil:</b> ${y} yılının tüm kayıtları kalıcı olarak silinir, geri alınamaz.`;
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:14px"><h2>${y} yılı</h2><div class="muted" style="line-height:1.55">${info}</div>
      <div class="row" style="justify-content:flex-end;gap:8px">${active ? "" : `<button class="sec" data-r="${archived ? "unarch" : "arch"}">${archived ? "Arşivden çıkar" : "Arşive taşı"}</button><button data-r="del" style="background:#B3261E;color:#fff">Sil</button>`}<button class="sec" data-r="">İptal</button></div></div>`;
    document.body.appendChild(m);
    const done = v => { m.remove(); res(v || null); };
    m.querySelectorAll("[data-r]").forEach(b => b.onclick = () => done(b.dataset.r));
    m.addEventListener("mousedown", e => { if (e.target === m) done(null); });
  });
}

function pageGuestAyarlar(v) {
  const g = st.guest, theme = S.pref.get("theme") || "light";
  v.innerHTML = `<div><h1 class="ttl">Ayarlar</h1><div class="sub">Misafir erişimi</div></div>
  <div class="cd"><div class="row" style="gap:16px;flex-wrap:nowrap">${avHtml(g.name, photoOf(g.uid), "avBtn")}<div style="min-width:0;flex:1"><b style="font-size:17px">${esc(g.name)}</b><div class="muted" style="overflow-wrap:anywhere">${esc(g.email)}</div></div></div>
    <div class="fg"><div><span class="hd">ROL</span><div class="inp ro">Misafir</div></div><div><span class="hd">ERİŞİM</span><div class="inp ro">${esc(Guest.leftText(g.member))}</div></div>
    <div><span class="hd">FABRİKALAR</span><div class="inp ro">${esc(st.all.map(f => f.name).join(", "))}</div></div></div>
    <div class="muted" style="font-size:12.5px;line-height:1.6">Misafir olarak veri girişi yapabilir, İSG denetimini kaydedebilir, raporları görüp PDF alabilirsiniz. Denetimi tamamlama, silme, kurulum ve yıl/tarih ekleme yetkili kullanıcıdadır.</div>
    <div class="row" style="justify-content:flex-end"><button class="sec outred" id="gOut">Çıkış yap</button></div></div>
  <div class="cd" style="gap:12px"><h2>Uygulama</h2><div class="fg">${instState()}</div>${standalone() ? "" : `<div class="muted" style="font-size:13px;line-height:1.55">Ana ekrana ekleyerek uygulama gibi tam ekran kullanabilirsiniz.</div><div class="row">${instBtn()}</div>`}</div>
  <div class="cd"><h2>Görünüm</h2><div class="th">${THEMES.map(([k, n, sd, bg, cd]) => `<button class="tb ${k === theme ? "on" : ""}" data-theme="${k}" aria-pressed="${k === theme}"><div class="pv"><div style="flex:0 0 28%;background:${sd}"></div><div style="flex:1;background:${bg};display:flex;flex-direction:column;gap:5px;padding:7px"><div style="height:8px;border-radius:4px;background:${cd}"></div><div style="height:8px;width:60%;border-radius:4px;background:#17A06F"></div></div></div><b>${n}</b></button>`).join("")}</div></div>`;
  instBind();
  v.querySelectorAll("[data-theme]").forEach(b => b.onclick = () => { S.pref.set("theme", b.dataset.theme); applyTheme(); pageGuestAyarlar(v); });
  $("avBtn").onclick = async () => { const r = await pickPhoto(!!photoOf(g.uid)); if (r === null) return; S.pref.set("photo_" + g.uid, r); pageGuestAyarlar(v); };
  $("gOut").onclick = async () => { const eg = Guest.isEmailGuest(auth.currentUser); if (await confirmBox("Çıkış yapılsın mı?", eg ? "Tekrar girmek için size gönderilen bağlantıya dokunmanız yeterlidir." : "Tekrar girmek için yeniden onay gerekir.", "Çıkış yap")) guestOut(null, true); };
}

let yilKeep = false, yilSel = null;
async function pageAyarlar(v) {
  const email = auth.currentUser.email, theme = S.pref.get("theme") || "light";
  const [sessions, profile] = await Promise.all([S.listSessions().catch(() => []), S.getProfile().catch(() => ({}))]);
  st.profile = profile;
  const name = profile.name || "";
  const cy = new Date().getFullYear(), maxYear = st.yearsAll[st.yearsAll.length - 1];
  const started = st.yearsAll.filter(y => +y <= cy), futYear = st.yearsAll.find(y => +y > cy), lastStarted = started[started.length - 1];
  if (!yilKeep) yilSel = null; const yOpen = yilKeep; yilKeep = false;
  const yAll = [...st.yearsMeta].sort((p, q) => +p.id - +q.id), yLim = +(st.active || cy);
  const yItems = yAll.filter(m => +m.id <= yLim).map(m => ({ y: String(m.id), meta: m }));
  const yNext = yAll.find(m => +m.id > yLim), nextV = yNext ? String(yNext.id) : yItems.length ? String(+yItems[yItems.length - 1].y + 1) : String(cy);
  const nextRaw = lastStarted ? String(+lastStarted + 1) : String(cy), canStart = !futYear && +nextRaw <= cy, next = nextRaw;
  const counts = {};
  await Promise.all(st.all.map(async f => {
    try { const ys = await S.listYears(f.id); const s = ys.length ? await S.getSetup(f.id, ys[ys.length - 1]) : null; counts[f.id] = s?.rows?.length ?? 0; } catch { counts[f.id] = 0; }
  }));
  const accHead = (id, title, sub) => `<button type="button" data-acc="${id}" aria-expanded="false" aria-label="${title} bölümünü aç" style="display:flex;align-items:center;gap:12px;width:100%;min-height:40px;height:auto;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer"><span style="flex:1;min-width:0"><h2 style="margin:0">${title}</h2><div class="muted" style="font-size:13px;margin-top:4px;font-weight:600">${sub}</div></span><span style="flex:0 0 40px;width:40px;height:40px;border-radius:12px;border:1.5px solid var(--gd);color:var(--gd);box-sizing:border-box;display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .15s"><path d="M6 9l6 6 6-6"/></svg></span></button>`;
  const accBody = '<div class="col1" hidden style="gap:14px;border-top:1px solid var(--line);padding-top:14px">';
  const me = S.deviceId(), prime = await S.getPrimary().catch(() => null), iAmPrime = prime?.deviceId === me;
  const cur = st.factories.find(f => f.id === st.fid);
  v.innerHTML = `
  <div><h1 class="ttl">Ayarlar</h1><div class="sub">Hesap bilgileriniz, oturum açık cihazlarınız, fabrikalar, tema ve uygulama sürümü burada yönetilir.</div></div>
  <div id="note" class="okbar hide"><span id="noteT"></span><button class="sec" id="noteX">Kapat</button></div>
  <div class="two">
  <div class="colw">
    <div class="cd"><div><h2>Hesap</h2><div class="muted" style="font-size:13px">Giriş yaptığınız hesabın bilgileri. E-posta ile giriş yapılır, şifreniz hiçbir yerde gösterilmez.</div></div>
      <div class="row" style="gap:16px;flex-wrap:nowrap">${avHtml(name || email, profile.photo, "avBtn")}
        <div style="min-width:0;flex:1"><b style="font-size:17px">${esc(name || "Adınızı girin")}</b><div class="muted" style="overflow-wrap:anywhere">${esc(email)}</div></div></div>
      <div class="fg">
        <div><label class="hd" for="adSoyad">AD SOYAD</label><input id="adSoyad" class="inp" value="${esc(name)}" placeholder="Ad Soyad"></div>
        <div><span class="hd">E-POSTA</span><div class="inp ro">${esc(email)}</div></div>
        <div><span class="hd">ROL</span><div class="inp ro">Yönetici</div></div>
        <div><span class="hd">GİRİŞ YÖNTEMİ</span><div class="inp ro">E-posta ve şifre</div></div></div>
      <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><button class="sec" id="saveName">Adı kaydet</button><button class="sec outred" id="askOut">Çıkış yap</button></div><div class="row"><button class="sec" id="resetPw">Şifre sıfırlama bağlantısı gönder</button></div></div>

    <div class="cd" id="guestBox"></div>

    <div class="cd" style="gap:14px">${accHead("ses", "Oturumlar ve Cihazlar", sessions.length + " cihaz")}${accBody}<div class="muted" style="font-size:13px">Hesabınıza giriş yapılmış cihazlar. Tanımadığınız bir cihaz varsa oradan uzaktan çıkış yapabilirsiniz.</div>
      <div class="col1">${sessions.map(d => { const prim = d.id === prime?.deviceId, mine = d.id === me; return item(`
        ${ic('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>').replace('width="20" height="20"', 'width="24" height="24"')}
        <div class="grow"><div class="row" style="gap:8px;flex-wrap:wrap"><b>${esc(d.name)}</b>${prim ? '<span class="tag" style="background:#0B2230;color:#fff">Ana cihaz</span>' : '<span class="tag" style="background:#EEF2F0;color:#4A5C57">İkincil cihaz</span>'}${mine ? '<span class="tag">Bu cihaz</span>' : ""}</div>
          <div class="muted" style="font-size:12.5px">${esc(d.kind || "")} · Son etkinlik ${fmtDt(d.lastSeen)}</div></div>
        <div class="row" style="gap:8px">${!prim ? `<button class="sm sec" data-prim="${d.id}" data-pname="${esc(d.name)}">Yetkili cihaz yap</button>` : ""}${!mine && iAmPrime ? `<button class="sm rm" data-rev="${d.id}">Uzaktan çıkış yap</button>` : ""}</div>`,
        mine ? "#F1FAF6" : "var(--card)", mine ? "#9ED6BD" : "var(--line)"); }).join("") || '<div class="muted">Oturum bilgisi bulunamadı.</div>'}</div>
      ${iAmPrime ? "" : '<div class="muted" style="font-size:12.5px;line-height:1.6">Bu cihaz ikincil cihazdır. Diğer oturumları yalnızca ana cihaz kapatabilir. Bu cihazı ana cihaz yapmak için "Yetkili cihaz yap" düğmesini kullanın; e-postanıza kod gönderilir.</div>'}
      <div class="muted" style="font-size:12.5px;line-height:1.6">Çıkış yapılan cihazda oturum kapatılır ve yerel önbellek temizlenir. Verileriniz bulutta güvende kalır, tekrar giriş yapınca geri gelir.</div></div></div>

  </div>
  <div class="colw">
    <div class="cd" style="gap:14px">${accHead("fab", "Fabrikalar", st.factories.length + " fabrika" + (cur ? " · aktif: " + esc(cur.name) : "") + (st.all.length > st.factories.length ? " · " + (st.all.length - st.factories.length) + " arşivde" : ""))}${accBody}<div class="muted" style="font-size:13px">Birden fazla fabrikanın denetimini yapabilirsiniz. Her fabrikanın bölümleri, kayıtları ve raporları ayrı tutulur; fabrika seçerek geçiş yaparsınız.</div>
      <div class="col1">${st.factories.map(f => item(`
        <div class="grow"><b>${esc(f.name)}${f.archived ? " · arşivde" : ""}</b><div class="muted" style="font-size:12.5px">${esc(f.loc || "Konum yok")} · ${counts[f.id] ?? 0} bölüm</div></div>
        ${f.id === st.fid && !f.archived ? '<span class="tag">Aktif fabrika</span>' : (!f.archived ? `<button class="sm sec" data-act="${f.id}">Aktif yap</button>` : "")}
        <button class="sm sec" data-edit="${f.id}">Düzenle</button>
        <button class="sm sec" data-arc="${f.id}" data-v="${f.archived ? 0 : 1}">${f.archived ? "Arşivden çıkar" : "Arşivle"}</button>
        <button class="sm trash" data-rm="${f.id}" aria-label="Fabrikayı sil" title="Sil">${ic('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>').replace('width="20" height="20"', 'width="16" height="16"')}</button>`,
        f.id === st.fid && !f.archived ? "#F1FAF6" : "var(--card)")).join("") || '<div class="muted">Henüz fabrika yok.</div>'}</div>
      ${FabArsiv.listHtml(st.all)}
      <div class="col1" style="padding-top:14px;border-top:1px solid var(--line)"><span class="hd">YENİ FABRİKA EKLE</span>
        <div class="fg"><input id="nf" class="inp" placeholder="Fabrika adı" aria-label="Fabrika adı"><input id="nl" class="inp" placeholder="Konum (örn. Gebze)" aria-label="Konum"></div>
        <div><button id="addF">+ Fabrika ekle</button></div></div></div></div>

    <div class="cd" style="gap:14px">${accHead("yil", "Yıllar", yItems.length + " yıl" + (st.active ? " · aktif: " + st.active : ""))}${accBody}
      ${st.fid ? '<div id="yStep" class="col1" style="gap:12px"></div>' : '<span class="muted">Seçili fabrikada yıl yok.</span>'}</div></div>
    <div class="cd" style="gap:14px">${accHead("tema", "Görünüm", esc(THEMES.find(t => t[0] === theme)?.[1] || ""))}${accBody}<div class="muted" style="font-size:13px">Tema seçimi bu cihazda saklanır.</div>
      <div class="th">${THEMES.map(([k, n, sd, bg, cd]) => `<button class="tb ${k === theme ? "on" : ""}" data-theme="${k}" aria-pressed="${k === theme}">
        <div class="pv"><div style="flex:0 0 28%;background:${sd}"></div><div style="flex:1;background:${bg};display:flex;flex-direction:column;gap:5px;padding:7px"><div style="height:8px;border-radius:4px;background:${cd}"></div><div style="height:8px;width:60%;border-radius:4px;background:#17A06F"></div></div></div><b>${n}</b></button>`).join("")}</div></div></div>

    <div class="cd" id="depoCard" style="gap:12px"></div>
    <div class="cd" style="gap:14px"><button type="button" id="uaTg" aria-expanded="false" aria-label="Uygulama ve Senkronizasyon bölümünü aç" style="display:flex;align-items:center;gap:12px;width:100%;min-height:40px;height:auto;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer"><span style="flex:1;min-width:0"><h2 style="margin:0">Uygulama ve Senkronizasyon</h2><div class="muted" style="font-size:13px;margin-top:4px;font-weight:600">Sürüm ${VERSION}</div></span><span style="flex:0 0 40px;width:40px;height:40px;border-radius:12px;border:1.5px solid var(--gd);color:var(--gd);box-sizing:border-box;display:flex;align-items:center;justify-content:center"><svg id="uaCh" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .15s"><path d="M6 9l6 6 6-6"/></svg></span></button>
      <div class="col1" id="uaBody" data-ua hidden style="gap:14px;border-top:1px solid var(--line);padding-top:14px">
      <div class="fg">
        <div><span class="hd">SÜRÜM</span><div style="font-weight:800;font-size:18px">${VERSION}</div></div>
        <div><span class="hd">DERLEME TARİHİ</span><div style="font-weight:700">${BUILD}</div></div>
        <div><span class="hd">VERİ ALTYAPISI</span><div style="font-weight:700">Bulut depolama · cihazlar arası senkronizasyon</div></div>
        <div><span class="hd">SENKRONİZASYON</span><div style="font-weight:700"><i class="sw" style="background:#17A06F;border-radius:50%"></i><span id="syncT">Güncel · ${st.lastSync.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span></div></div>${instState()}</div>
      <div class="row"><button class="sec" id="doSync">Şimdi senkronize et</button>${instBtn()}<button class="sec" id="backup" title="Tüm fabrikalar, yıllar ve kayıtlar tek JSON dosyası olarak indirilir">Tüm verileri indir (JSON)</button>${Gorev.enabled() ? `<button class="sec" id="gvBtn"></button>` : ""}<span class="muted" id="backupT" style="font-size:12.5px"></span></div></div></div>
  </div></div>
  <div id="modal" class="mod hide"><div class="mbox"><h2>Çıkış yapılsın mı?</h2>
    <p class="muted">Bu cihazdaki oturum kapatılır ve yerel önbellek temizlenir. Verileriniz bulutta güvende kalır.</p>
    <div class="row" style="justify-content:flex-end"><button class="sec" id="noOut">Vazgeç</button><button class="danger" id="yesOut">Evet, çıkış yap</button></div></div></div>`;
  instBind();
  v.querySelectorAll("[data-acc]").forEach(b => b.onclick = () => { const body = b.nextElementSibling, o = body.hidden; body.hidden = !o; b.setAttribute("aria-expanded", o); b.setAttribute("aria-label", b.querySelector("h2").textContent + " bölümünü " + (o ? "kapat" : "aç")); b.querySelector("svg").style.transform = o ? "rotate(180deg)" : ""; });
  if (yOpen) v.querySelector("[data-acc=yil]")?.click();
  $("uaTg").onclick = () => { const b = $("uaBody"), o = b.hidden; b.hidden = !o; $("uaTg").setAttribute("aria-expanded", o); $("uaTg").setAttribute("aria-label", "Uygulama ve Senkronizasyon bölümünü " + (o ? "kapat" : "aç")); $("uaCh").style.transform = o ? "rotate(180deg)" : ""; };
  const say = t => { $("noteT").textContent = t; $("note").classList.remove("hide"); };
  const scope = !st.fid || !st.year ? null : (() => {
    const fid = st.fid, year = st.year, month = new Date().getMonth() + 1; let rows = null;
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, t7 = new Date(); t7.setDate(t7.getDate() + 7);
    const sc = { rows: async () => rows ||= ((await S.getSetup(fid, year))?.rows || []).filter(r => r.id && r.name).map(r => ({ id: r.id, name: r.name })),
      get: async uid => { const rs = await sc.rows(), sh = (await S.listShares(fid, year, month)).filter(x => (x.guests || []).includes(uid)); return sh.some(x => x.all) ? rs.map(r => r.id) : [...new Set(sh.flatMap(x => (x.depts || []).map(d => d.id)))]; },
      set: async (uid, name, secs) => S.setGuestScope(uid, name, fid, year, month, secs, (await sc.rows()).length, iso(t7)) };
    return sc;
  })();
  Guest.renderSettings($("guestBox"), { ownerUid: auth.currentUser.uid, factories: st.all, scope }).catch(() => {});
  $("noteX").onclick = () => $("note").classList.add("hide");
  $("avBtn").onclick = async () => { const r = await pickPhoto(!!profile.photo); if (r === null) return; try { await S.saveProfile({ photo: r }); } catch (e) { return say("Kaydedilemedi: " + (e.message || e)); } say(r ? "Profil fotoğrafı kaydedildi." : "Profil fotoğrafı kaldırıldı."); pageAyarlar(v); };
  $("saveName").onclick = async () => { await S.saveProfile({ name: $("adSoyad").value.trim() }); say("Adınız kaydedildi."); pageAyarlar(v); };
  $("resetPw").onclick = async () => { try { await sendPasswordResetEmail(auth, email); say("Şifre sıfırlama bağlantısı e-postanıza gönderildi."); } catch (e) { say(errMsg(e)); } };
  v.querySelectorAll("[data-prim]").forEach(b => b.onclick = () => Prim.startTransfer({ id: b.dataset.prim, name: b.dataset.pname }, t => { toast(t); pageAyarlar(v); }));
  v.querySelectorAll("[data-rev]").forEach(b => b.onclick = async () => { if (await confirmBox("Oturum kapatılsın mı?", "Bu cihazdaki oturum uzaktan kapatılır.", "Oturumu kapat", true)) { try { await S.revokeSession(b.dataset.rev); say("Cihazın oturumu kapatıldı."); } catch (e) { say(e.message); } pageAyarlar(v); } });
  $("backup").onclick = async () => {
    $("backup").disabled = true; $("backupT").textContent = "Hazırlanıyor…";
    try {
      const d = await S.exportAll(), blob = new Blob([JSON.stringify(d, null, 1)], { type: "application/json" }), el = document.createElement("a");
      el.href = URL.createObjectURL(blob); el.download = `hse-verim-yedek-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(el); el.click();
      setTimeout(() => { URL.revokeObjectURL(el.href); el.remove(); }, 500); $("backupT").textContent = `İndirildi · ${d.factories.length} fabrika`;
    } catch (e) { $("backupT").textContent = "Yedek alınamadı: " + e.message; }
    $("backup").disabled = false;
  };
  $("askOut").onclick = () => $("modal").classList.remove("hide");
  $("noOut").onclick = () => $("modal").classList.add("hide");
  $("yesOut").onclick = doSignOut;
  v.querySelectorAll("[data-theme]").forEach(b => b.onclick = () => { S.pref.set("theme", b.dataset.theme); applyTheme(); Promise.resolve(pageAyarlar(v)).then(() => v.querySelector("[data-acc=tema]")?.click()); });
  v.querySelectorAll("[data-act]").forEach(b => b.onclick = async () => { st.fid = b.dataset.act; S.pref.set("fid", st.fid); await loadYears(); say("Aktif fabrika değiştirildi."); pageAyarlar(v); });
  v.querySelectorAll("[data-edit]").forEach(b => b.onclick = async () => {
    const f = st.all.find(x => x.id === b.dataset.edit);
    const r = await formBox("Fabrikayı düzenle", [["name", "Fabrika adı", f.name], ["loc", "Konum", f.loc || ""]]);
    if (!r) return;
    if (!r.name.trim()) return say("Fabrika adı boş olamaz.");
    await S.updateFactory(f.id, { name: r.name.trim(), loc: r.loc.trim() }); await loadContext(); say("Fabrika güncellendi."); pageAyarlar(v);
  });
  const fabDone = async () => { await loadContext(); pageAyarlar(v); };
  FabArsiv.bindList(v, st.all, { onDone: fabDone });
  v.querySelectorAll("[data-arc]").forEach(b => b.onclick = () => FabArsiv.openArsivle(st.all.find(x => x.id === b.dataset.arc), { onDone: fabDone }));
  v.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { const f = st.all.find(x => x.id === b.dataset.rm); FabArsiv.openSil(f, { onDone: async del => { if (del) { if (S.pref.get("fid") === f.id) S.pref.set("fid", ""); K.key = ""; } await fabDone(); } }); });
  $("addF").onclick = async () => {
    const n = $("nf").value.trim(); if (!n) return say("Fabrika adı yazın.");
    const id = await S.addFactory(n, $("nl").value.trim()); S.pref.set("fid", id); await loadContext(); say("Fabrika eklendi."); pageAyarlar(v);
  };
  // Yıllar: ok işaretleriyle gezilen tek yıl kartı (yalnızca mevcut yıllar + bir sonraki yıl)
  const yEl = $("yStep"), fi = yItems.findIndex(x => x.y === String(yilSel ?? st.active));
  let yi = fi >= 0 ? fi : Math.max(0, yItems.length - 1);
  const yState = it => String(it.y) === String(st.active) ? { k: "act", label: "Aktif" } : { k: "arc", label: "Arşivde" };
  const yDone = (y) => { yilKeep = true; yilSel = y; pageAyarlar(v); };
  const yRun = async (a, it) => {
    const y = it.y;
    if (a === "act") {
      if (+y > cy) return say(`${y} yılı henüz başlamadı; bugünün tarihi ${new Date().toLocaleDateString("tr-TR")}.`);
      if (!(await confirmBox(`${y} yılı aktif yapılsın mı?`, "Şu an aktif olan yıl arşive geçer (salt okunur).", "Aktif yap"))) return;
      await S.updateFactory(st.fid, { activeYear: y }); S.pref.set("year", y); await loadContext(); say(`${y} yılı aktif yapıldı.`); return yDone(y);
    }
    if (a === "arch" || a === "unarch") { await S.setYearArchived(st.fid, y, a === "arch"); await loadContext(); say(a === "arch" ? `${y} yılı arşive taşındı.` : `${y} yılı arşivden çıkarıldı.`); return yDone(y); }
    if (a === "arc") return Arsiv.openArsiv({ fid: st.fid, y, meta: it.meta, onDone: async () => { await loadContext(); yDone(y); } });
    if (a === "del") return Arsiv.openSil({ fid: st.fid, y, meta: it.meta, onDone: async (keep) => { await loadContext(); yDone(keep === null && !(await S.listYears(st.fid)).map(String).includes(String(y)) ? null : y); } });
    if (a === "new") {
      if (+y > cy) return say(`${y} yılı henüz başlamadı; 1 Ocak ${y} tarihinde başlatılabilir.`);
      if (st.yearsAll.map(String).includes(String(y))) { await S.updateFactory(st.fid, { activeYear: y }); S.pref.set("year", y); await loadContext(); say(`${y} yılı başlatıldı ve aktif yapıldı.`); return yDone(y); }
      await S.addYear(st.fid, y);
      if (maxYear) { const prev = await S.getSetup(st.fid, maxYear); if (prev) await S.saveSetup(st.fid, y, { rows: prev.rows.map(r => { const o = { ...r, n: String(nAt(r, 12)) }; delete o.nm; return o; }), params: prev.params }); }
      await S.updateFactory(st.fid, { activeYear: y }); S.pref.set("year", y); await loadContext(); say(`${y} yılı başlatıldı ve aktif yapıldı.`); return yDone(y);
    }
  };
  const drawY = () => {
    if (!yEl) return;
    const it = yItems[yi], s = it ? yState(it) : { k: "gry", label: "" }, b = (a, t, c = "sec", dis = false) => `<button class="sm ${c}" data-ya="${a}" ${dis ? "disabled" : ""}>${t}</button>`;
    let acts = "";
    if (it) {
      if (s.k === "act") acts = '<span class="muted">Düzenlemeye açık yıl</span>';
      else if (it.meta.archived) acts = b("unarch", "Arşivden çıkar") + b("arc", "Arşiv işlemleri") + b("del", "Sil", "sec yrm");
      else acts = b("act", "Aktif yap", "ypri") + b("arc", "Arşiv işlemleri") + b("del", "Sil", "sec yrm");
    }
    // Son kayıtlı yılda: bir sonraki yılı başlat düğmesi (1 Ocak'a kadar gri pasif, sonra yeşil çerçeveli)
    if (!it || yi === yItems.length - 1) acts += b("new", `+ ${nextV} yıl başlat`, "sec ynew", +nextV > cy);
    yEl.innerHTML = `<div class="yst"><button class="sec yab" data-yn="-1" aria-label="Önceki yıl" ${yi <= 0 ? "disabled" : ""}>‹</button>
      <div class="yctr">${it ? `<div class="yyr ${s.k === "act" ? "" : "dimc"}">${it.y}</div><span class="ypl ${s.k}">${s.label}</span>${s.k === "act" ? "" : Arsiv.badges(it.meta)}<span class="ypos">${yi + 1} / ${yItems.length}</span>` : '<span class="muted">Kayıtlı yıl yok</span>'}</div>
      <button class="sec yab" data-yn="1" aria-label="Sonraki yıl" ${yi >= yItems.length - 1 ? "disabled" : ""}>›</button></div>
      <div class="yact">${acts}</div>`;
    yEl.querySelectorAll("[data-yn]").forEach(x => x.onclick = () => { yi += +x.dataset.yn; drawY(); });
    yEl.querySelectorAll("[data-ya]").forEach(x => x.onclick = () => yRun(x.dataset.ya, x.dataset.ya === "new" ? { y: nextV } : it));
  };
  drawY();
  if ($("depoCard")) {
    const mm = {}; Promise.all(st.all.map(async f => { try { for (const m of await S.listYearsMeta(f.id)) mm[f.id + "|" + m.id] = m; } catch { } })).then(() =>
      Arsiv.renderDepo($("depoCard"), { factories: st.all, profile: st.profile, metaOf: (f, y) => mm[f + "|" + y], active: st.fid && st.active ? { fid: st.fid, y: st.active, fn: st.all.length > 1 ? (st.all.find(f => f.id === st.fid)?.name || "") : "" } : null }));
  }
  if ($("gvBtn")) {
    const gp = () => { const ok = Gorev.state() === "hazir"; $("gvBtn").textContent = ok ? "Görev programı bağlı · Bağlantıyı kes" : "Görev programına bağlan"; $("gvBtn").title = Gorev.statusText(); };
    gp(); const off = Gorev.onChange(() => { if ($("gvBtn")) gp(); else off(); });
    $("gvBtn").onclick = async () => { if (Gorev.state() === "hazir") await Gorev.disconnect(); else if (await Gorev.login()) say("Görev takip programına bağlandı."); gp(); };
  }
  $("doSync").onclick = async () => { await loadContext(); $("syncT").textContent = "Güncel · " + st.lastSync.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }); say("Veriler buluttan yenilendi."); };
}
function applyTheme() {
  const t = S.pref.get("theme") || "light"; document.documentElement.dataset.theme = t;
  // Yerleşik tarih/saat seçicileri uygulama temasını izlesin (Android Chrome meta etiketine bakar)
  const cs = t === "dark" ? "dark" : t === "auto" ? "light dark" : "light"; document.documentElement.style.colorScheme = cs;
  let m = document.querySelector('meta[name="color-scheme"]'); if (!m) { m = document.createElement("meta"); m.name = "color-scheme"; document.head.appendChild(m); } m.content = cs;
}
applyTheme();
