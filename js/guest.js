// Misafir kullanıcı: davet bağlantısı → ad / bölüm ile onay isteği → sahibin onayı (süresiz / 24 saat) → fabrika bazlı erişim
// Veri yolları (hepsi sahibin hesabı altında):
//   users/{sahip}/invites/{kod}        davet (e-posta ayarı kopyası)
//   users/{sahip}/guestReqs/{misafirUid}  onay isteği {gid, code, name, unit, status, at}
//   users/{sahip}/members/{misafirUid}    onaylı üye {name, unit, factories[], mode, expires|null}
import { auth, db, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot, signInAnonymously, signInWithEmailAndPassword, createAuxUser, changeAuxPassword, serverTimestamp } from "./firebase.js?v=20261030f";
import { esc, toast, confirmBox } from "./ui.js?v=20261030f";

const Q = new URLSearchParams(location.search);
export const linkInfo = () => {
  const d = Q.get("d"); if (d && d.includes(".")) { const [owner, code] = d.split("."); return { type: "pguest", owner, code, ek: Q.get("k") || "" }; }
  const m = Q.get("misafir"); if (m && m.includes(".")) { const [owner, code] = m.split("."); return { type: "guest", owner, code }; }
  const o = Q.get("onay"); if (o) return { type: "approve", gid: o };
  const a = Q.get("denetim"); if (a && a.split(".").length === 4) { const [fid, year, month, dept] = a.split("."); return { type: "audit", fid, year, month, dept }; }
  return null;
};
export const clearLink = () => { try { history.replaceState(null, "", location.pathname + location.hash); } catch {} };
export const storedOwner = () => { try { return localStorage.getItem("hse_gowner"); } catch { return null; } };
export const storeOwner = o => { try { o ? localStorage.setItem("hse_gowner", o) : localStorage.removeItem("hse_gowner"); } catch {} };

const ms = x => (x == null ? null : x.toMillis ? x.toMillis() : x instanceof Date ? x.getTime() : (typeof x === "string" ? Date.parse(x) : +x));
export const isLive = m => !!m && !m.stopped && (m.expires == null || ms(m.expires) > Date.now());
export const leftText = m => {
  if (!m) return "";
  if (m.expires == null) return "Süresiz";
  const d = ms(m.expires) - Date.now(); if (d <= 0) return "Süresi doldu";
  const h = Math.floor(d / 36e5), mi = Math.floor((d % 36e5) / 6e4);
  return h ? `${h} sa ${mi} dk kaldı` : `${mi} dk kaldı`;
};
const hleft = d => { const h = Math.ceil(d / 36e5); return h > 48 ? Math.ceil(h / 24) + " gün" : h + " saat"; };
const isPend = d => d.ok === false && !d.ap && !d.blocked, pendOf = l => (l || []).filter(isPend).length;
const ago = t => new Date(t).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const REQ = (o, g) => doc(db, `users/${o}/guestReqs/${g}`), MEM = (o, g) => doc(db, `users/${o}/members/${g}`);
export const getMember = async (o, g) => { try { const d = await getDoc(MEM(o, g)); return d.exists() ? d.data() : null; } catch { return null; } };
// Son görülme: misafir uygulamayı açtığında üyelik kaydına yazılır (kurallar yalnızca bu alana izin verir)
export const touchSeen = (o, g) => { updateDoc(MEM(o, g), { lastSeen: Date.now() }).catch(() => {}); if (DEV.id) updateDoc(doc(db, `users/${o}/members/${g}/devices/${DEV.id}`), { last: Date.now() }).catch(() => {}); };
const DEV = { id: "" };
export const watchDevice = (o, g, cb) => DEV.id ? onSnapshot(doc(db, `users/${o}/members/${g}/devices/${DEV.id}`), s => cb(s.exists() ? s.data() : null), () => {}) : () => {};
export const watchMember = (o, g, cb) => onSnapshot(MEM(o, g), s => cb(s.exists() ? s.data() : null), () => {});

// ---------------- Misafir: onay isteği ekranı ----------------
let sending = false;
export const isSending = () => sending;

function screen() {
  let s = document.getElementById("guestReq");
  if (!s) { s = document.createElement("section"); s.id = "guestReq"; s.style.cssText = "min-height:100vh;display:grid;place-items:center;padding:16px"; document.body.prepend(s); }
  return s;
}
export function hideRequest() { document.getElementById("guestReq")?.remove(); }
const boxHtml = inner => `<div class="box"><div class="stripe" style="border-radius:4px;overflow:hidden;margin-bottom:18px"><i></i><i></i><i></i><i></i></div>
  <div class="brand" style="margin-bottom:10px"><div><h1 style="font-size:20px">HSE Verim Modülü</h1><span class="muted" style="font-size:12px">Misafir erişimi</span></div></div>${inner}</div>`;

// Davet bağlantısı yapıştırma ekranı (ana ekran uygulaması gibi bağlantısız açılan yerlerde)
const parseInvite = t => { t = String(t || "").trim(); { const u = t.match(/https?:\/\/[^\s]+/); if (u) t = u[0]; } let personal = false, ek = ""; try { const u = new URL(t), d = u.searchParams.get("d"), m = u.searchParams.get("misafir"); if (d) { t = d; personal = true; ek = u.searchParams.get("k") || ""; } else if (m) t = m; } catch {} const [owner, code] = t.split("."); if (!(owner && code)) return null; return { owner, code, ek, personal: personal || code.length === 16 }; };
export function showInviteEntry(onProceed, onBack) {
  const s = screen();
  s.innerHTML = boxHtml(`<div class="muted" style="line-height:1.55;margin-bottom:10px">Yetkili kullanıcının size gönderdiği <b>davet bağlantısını</b> aşağıya yapıştırın. Sonraki ekranda bilgilerinizi yazıp onaya göndereceksiniz.</div>
    <label for="gInv">Davet bağlantısı</label><input id="gInv" autocomplete="off" autocapitalize="off" placeholder="https://…?misafir=…">
    <div class="err" id="gErr"></div>
    <div class="row"><button type="button" id="gGo">Devam</button><button type="button" class="sec" id="gBack">Geri dön</button></div>`);
  document.getElementById("gGo").onclick = () => { const r = parseInvite(document.getElementById("gInv").value); if (!r) { document.getElementById("gErr").textContent = "Bağlantı geçerli görünmüyor. Size gönderilen davet bağlantısının tamamını yapıştırın."; return; } onProceed(r); };
  document.getElementById("gBack").onclick = onBack;
}
// owner/code: bağlantıdan veya daha önce kaydedilenden gelir. onApproved: onaylanınca çağrılır.
export function showRequest({ owner, code, note = "" }, onApproved) {
  const s = screen(), prev = (() => { try { return JSON.parse(localStorage.getItem("hse_gname") || "{}"); } catch { return {}; } })();
  s.innerHTML = boxHtml(`<div class="muted" style="line-height:1.55;margin-bottom:10px">Yetkili kullanıcının gönderdiği bağlantıyla geldiniz. Bilgilerinizi yazıp <b>Onay Gönder</b>'e basın. Yetkili kullanıcı onaylayınca bu ekran otomatik açılır.<br>Denetim kayıtlarınız bu adla tutulur.</div>
    ${note ? `<div class="warn" style="margin-bottom:10px">${esc(note)}</div>` : ""}
    <label>Ad Soyad <span style="color:#D6382E">*</span></label><input id="gName" autocomplete="name" value="${esc(prev.n || "")}" required>
    <label>Bölüm / Görev <span class="muted" style="font-weight:500;text-transform:none;letter-spacing:0">(isteğe bağlı)</span></label><input id="gUnit" autocomplete="organization-title" placeholder="Örn. Matbaa / Operatör" value="${esc(prev.u || "")}">
    <div class="muted" style="font-size:12.5px"><span style="color:#D6382E">*</span> Zorunlu alan</div>
    <div class="err" id="gErr"></div>
    <div class="row"><button type="button" id="gSend">Onay Gönder</button></div>`);
  const err = t => { document.getElementById("gErr").textContent = t; };
  document.getElementById("gSend").onclick = async () => {
    const name = document.getElementById("gName").value.trim(), unit = document.getElementById("gUnit").value.trim();
    if (name.length < 3) return err("Ad soyadınızı yazın.");
    err(""); sending = true; document.getElementById("gSend").disabled = true;
    try {
      if (!auth.currentUser) await signInAnonymously(auth);
      const gid = auth.currentUser.uid;
      const inv = await getDoc(doc(db, `users/${owner}/invites/${code}`));
      if (!inv.exists()) throw new Error("Davet bağlantısı geçersiz veya yenilenmiş. Yetkili kullanıcıdan yeni bağlantı isteyin.");
      const body = { gid, code, name, unit, status: "pending", at: Date.now() };
      await setDoc(REQ(owner, gid), body); // tam değiştirme: eski karar alanları (decidedAt) temizlenir
      try { localStorage.setItem("hse_gname", JSON.stringify({ n: name, u: unit })); } catch {}
      storeOwner(owner);
      const link = `${location.origin}${location.pathname}?onay=${gid}`;
      const [m1, m2] = await Promise.all([sendMail(inv.data().emailjs, { guest_name: name, guest_unit: unit, guest_email: "", approve_link: link }), sendPush(inv.data().ntfy, { name, unit, link })]);
      const sent = m1 || m2, tried = !!(inv.data().ntfy || inv.data().emailjs);
      sending = false; waiting({ owner, code, gid, sent, tried }, onApproved);
    } catch (e) { sending = false; document.getElementById("gSend").disabled = false; err(e.code === "auth/admin-restricted-operation" || e.code === "auth/operation-not-allowed" ? "Misafir girişi Firebase'de kapalı. Yetkili kullanıcı: Konsol → Authentication → Sign-in method → Anonim girişi etkinleştirin." : (e.message || String(e))); }
  };
}

async function sendMail(cfg, params) {
  if (!cfg?.service || !cfg?.template || !cfg?.key) return false;
  try {
    const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service_id: cfg.service, template_id: cfg.template, user_id: cfg.key, template_params: params }) });
    return r.ok;
  } catch { return false; }
}

// Telefon bildirimi (ntfy.sh): sahip telefonuna anında push gönderir; uygulama kapalıyken de çalışır
async function pushRaw(topic, { title, message, click, priority = 4, tags = ["bust_in_silhouette"] }) {
  if (!topic) return false;
  try {
    const r = await fetch("https://ntfy.sh/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, title, message, click, priority, tags }) });
    return r.ok;
  } catch { return false; }
}
const sendPush = (topic, { name, unit, link }) => pushRaw(topic, { title: "HSE Verim · Misafir onay isteği", message: `${name}${unit ? ` (${unit})` : ""} erişim istiyor. Onaylamak için dokunun.`, click: link });

// Onay bekleme ekranı: istek durumunu canlı izler
export function waiting({ owner, gid, code, sent, tried }, onApproved) {
  const s = screen();
  s.innerHTML = boxHtml(`<h2 style="margin-bottom:6px">Onay bekleniyor</h2>
    <div class="muted" style="line-height:1.55">İsteğiniz yetkili kullanıcıya iletildi${sent ? " (bildirim gönderildi)" : (tried ? " (bildirim gönderilemedi; yetkili kullanıcı uygulamada isteğinizi görür)" : " (bildirim ayarı kapalı; yetkili kullanıcı uygulamada isteğinizi görür)")}. Onaylandığında bu ekran kendiliğinden açılır. Bu sayfayı kapatabilirsiniz; aynı cihazdan tekrar açtığınızda kaldığınız yerden devam edersiniz.</div>
    <div class="row" style="margin-top:14px"><button class="sec" id="gAgain">İsteği yenile</button></div>`);
  document.getElementById("gAgain").onclick = () => { off(); showRequest({ owner, code }, onApproved); };
  const off = onSnapshot(REQ(owner, gid), async snap => {
    const d = snap.data(); if (!d) return;
    if (d.status === "approved") { const m = await getMember(owner, gid); if (isLive(m)) { off(); storeOwner(owner); hideRequest(); onApproved(); } }
    if (d.status === "rejected") { off(); showRequest({ owner, code: d.code || code, note: "İsteğiniz yetkili kullanıcı tarafından onaylanmadı. Gerekirse yeniden gönderebilirsiniz." }, onApproved); }
  }, () => {});
}

// Daha önce gönderilmiş isteğin durumunu oku (dönen misafir için)
export async function pendingState(owner, gid) {
  try { const d = await getDoc(REQ(owner, gid)); return d.exists() ? d.data() : null; } catch { return null; }
}

// Süresi dolmuş / onaysız dönen misafir
export function showExpired({ owner, code, member }, onApproved) {
  const note = member ? (isLive(member) ? "" : "Erişim süreniz doldu. Devam etmek için yeniden onay isteyin.") : "";
  showRequest({ owner, code: code || "", note }, onApproved);
}

// ---------------- Misafir → sahip: denetim gelen kutusu ----------------
// users/{sahip}/inbox/{misafirUid}_{fabrika}_{yıl}_{ay}_{bölüm}  → aynı denetim için tek satır (tekrar kayıtlar satırı günceller)
const GC = { owner: null, uid: null, name: "", ntfy: null };
export const setGuestCtx = c => Object.assign(GC, c);
export const pushOwner = (title, message) => pushRaw(GC.ntfy, { title, message, click: `${location.origin}${location.pathname}`, priority: 3 });
export async function reportAudit(info, kind) {
  if (!GC.owner || !GC.uid) return;
  const key = [info.fid, info.year, info.month, info.dept].join("_");
  try {
    await setDoc(doc(db, `users/${GC.owner}/inbox/${GC.uid}_${key}`), { fid: info.fid, year: +info.year, month: +info.month, dept: info.dept, deptName: info.deptName || "", factoryName: info.factoryName || "", no: +info.no || 0, by: GC.uid, byName: GC.name, kind, status: "open", at: Date.now() });
  } catch (e) { toast("Yetkiliye bildirilemedi: " + (e.message || e)); return; }
  // Telefon bildirimi: "kaydetti" bildirimi aynı denetim için 10 dakikada bir; "tamamlanmasını istiyor" her zaman
  const tk = "hse_gpush_" + key; let last = 0; try { last = +localStorage.getItem(tk) || 0; } catch {}
  if (kind === "saved" && Date.now() - last < 600000) return;
  try { localStorage.setItem(tk, String(Date.now())); } catch {}
  const what = kind === "review" ? "tamamlanmasını istiyor" : "kaydetti";
  pushRaw(GC.ntfy, { title: "HSE Verim · Misafir denetimi", message: `${GC.name} · ${info.deptName} · ${info.no}. denetimi ${what}.`, click: `${location.origin}${location.pathname}?denetim=${[info.fid, info.year, info.month, info.dept].join(".")}`, priority: kind === "review" ? 4 : 3, tags: ["clipboard"] });
}
// Misafir aksiyon bildirimi: gelen kutusuna ayrı satır (no: 0 = aksiyon) + yetkiliye telefon bildirimi
export async function reportFix(info, catName) {
  if (!GC.owner || !GC.uid) return;
  const key = [info.fid, info.year, info.month, info.dept].join("_");
  try {
    await setDoc(doc(db, `users/${GC.owner}/inbox/${GC.uid}_fx_${key}`), { fid: info.fid, year: +info.year, month: +info.month, dept: info.dept, deptName: info.deptName || "", factoryName: info.factoryName || "", wk: +info.wk || 0, no: 0, by: GC.uid, byName: GC.name, kind: "saved", status: "open", at: Date.now() });
  } catch (e) { toast("Yetkiliye bildirilemedi: " + (e.message || e)); return; }
  pushRaw(GC.ntfy, { title: "HSE Verim · Aksiyon bildirimi", message: `${GC.name} · ${info.deptName}${info.wk ? " · " + info.wk + ". hafta" : ""}: ${catName} için aksiyon bildirdi. İncelemek için dokunun.`, click: `${location.origin}${location.pathname}?denetim=${[info.fid, info.year, info.month, info.dept].join(".")}`, priority: 4, tags: ["white_check_mark"] });
}
export const inboxDelete = id => deleteDoc(doc(db, `users/${auth.currentUser.uid}/inbox/${id}`)).catch(() => {});
export async function inboxClear(ownerUid, { fid, year, month, dept }) {
  try {
    const all = await getDocs(collection(db, `users/${ownerUid}/inbox`));
    for (const d of all.docs) { const x = d.data(); if (x.fid === fid && +x.year === +year && +x.month === +month && x.dept === dept) await deleteDoc(doc(db, `users/${ownerUid}/inbox/${d.id}`)); }
  } catch {}
}
export function watchInbox(ownerUid, cb) {
  let first = true;
  return onSnapshot(collection(db, `users/${ownerUid}/inbox`), snap => {
    if (first) { first = false; return; }
    const add = snap.docChanges().filter(c => (c.type === "added" || c.type === "modified") && c.doc.data().status === "open").map(c => c.doc.data());
    if (add.length) cb(add);
  }, () => {});
}
const MN = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export async function renderInbox(box, { ownerUid, onOpen }) {
  const rows = await getDocs(collection(db, `users/${ownerUid}/inbox`)).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []);
  const open = rows.filter(r => r.status === "open").sort((a, b) => (a.kind === "review" ? -1 : 0) - (b.kind === "review" ? -1 : 0) || b.at - a.at);
  if (!open.length) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="cd" style="gap:12px"><div><h2>Misafir denetimleri · kontrol bekleyen (${open.length})</h2><div class="muted" style="font-size:13px">Misafirlerin kaydettiği veya tamamlanmasını istediği denetimler. Açıp kontrol edin; onayladığınızda veya geri gönderdiğinizde satır kalkar.</div></div>
    <div class="col1" style="gap:8px">${open.map(r => `<div class="it" style="gap:10px;flex-wrap:wrap"><div class="grow"><b>${esc(r.deptName)}</b> <span class="tag" style="${r.kind === "review" || !r.no ? "background:#FBE9C6;color:#6B3F00" : ""}">${!r.no ? "Aksiyon bildirildi" : r.kind === "review" ? "Tamamlanması istendi" : "Kaydedildi"}</span>
      <div class="muted" style="font-size:12.5px">${esc(r.factoryName)} · ${MN[r.month - 1]} ${r.year} · ${r.no ? r.no + ". denetim · " : r.wk ? r.wk + ". hafta · " : ""}${esc(r.byName)} · ${ago(r.at)}</div></div>
      <div class="row" style="gap:6px"><button class="sm" data-io="${r.id}">Aç</button><button class="sm sec" data-ix="${r.id}">Gördüm</button></div></div>`).join("")}</div></div>`;
  box.querySelectorAll("[data-io]").forEach(b => b.onclick = () => onOpen(open.find(r => r.id === b.dataset.io)));
  box.querySelectorAll("[data-ix]").forEach(b => b.onclick = async () => { await deleteDoc(doc(db, `users/${ownerUid}/inbox/${b.dataset.ix}`)).catch(() => {}); renderInbox(box, { ownerUid, onOpen }); });
}

// ---------------- Sahip: uygulama açıkken canlı bildirim ----------------
export async function notify(title, body, url) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "hse-guest", renotify: true, data: { url } });
  } catch {}
}
export function watchRequests(ownerUid, cb) {
  let first = true;
  return onSnapshot(collection(db, `users/${ownerUid}/guestReqs`), snap => {
    const pend = snap.docs.map(d => d.data()).filter(d => d.status === "pending");
    if (first) { first = false; if (pend.length) cb(pend, true); return; }
    const add = snap.docChanges().filter(c => (c.type === "added" || c.type === "modified") && c.doc.data().status === "pending").map(c => c.doc.data());
    if (add.length) cb(add, false);
  }, () => {});
}

// ---------------- Sahip: onay penceresi ----------------
// ---- Kişi kaydı (kalıcı ID): misafir ayrılıp aynı ad soyadla yeniden katılırsa önceki kayıtları devam eder ----
// users/{sahip}/guestPeople/{ID} = { name, norm, unit, uids: [eski ve yeni misafir uid'leri], createdAt }
const PPL = (o, p) => doc(db, `users/${o}/guestPeople/${p}`);
const normName = s => String(s || "").replace(/İ/g, "i").replace(/I/g, "i").toLowerCase().replace(/[ıçğöşü]/g, c => ({ ı: "i", ç: "c", ğ: "g", ö: "o", ş: "s", ü: "u" })[c]).replace(/\s+/g, " ").trim();
const validPid = p => /^[A-Z2-9]{6}$/.test(p) && (n => n >= 2 && n <= 4)([...p].filter(c => /[2-9]/.test(c)).length);
const GCOLLS = ["isgg", "konusmag", "isbasig", "kazag", "ramak"];
const loadPeople = async o => getDocs(collection(db, `users/${o}/guestPeople`)).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []);
const newPid = taken => { // 6 hane, serbest dizilim; en az 2 harf ve en az 2 rakam (karışan I, O, L, 0, 1 kullanılmaz)
  const L = "ABCDEFGHJKMNPQRSTUVWXYZ", N = "23456789", A = L + N;
  for (;;) { const p = Array.from(crypto.getRandomValues(new Uint8Array(6)), b => A[b % A.length]).join(""), n = [...p].filter(c => N.includes(c)).length; if (n >= 2 && n <= 4 && !taken.has(p)) return p; }
};
// Önceki kayıtları bul: kişi kaydı (ID) + adı eşleşen, sahibi artık üye olmayan (sahipsiz) taslaklar
async function findPrev(o, name, gid) {
  const S = await import("./store.js?v=20261030f"), n = normName(name);
  const people = (await loadPeople(o)).filter(p => p.norm === n);
  const mems = await getDocs(collection(db, `users/${o}/members`)).then(s => new Set(s.docs.map(d => d.id))).catch(() => new Set());
  const uids = new Set(); people.forEach(p => (p.uids || []).forEach(u => { if (u !== gid && !mems.has(u)) uids.add(u); }));
  let count = 0;
  for (const f of await S.listFactories()) for (const y of await S.listYears(f.id)) for (const c of GCOLLS) {
    for (const d of await S.listMonthDocs(f.id, y, c)) {
      const u = d.guestUid; if (!u || u === gid || mems.has(u)) continue;
      if (uids.has(u) || normName(d.guestName) === n) { uids.add(u); count++; }
    }
  }
  return { person: people[0] || null, pid: people[0]?.id || null, uids, count };
}
async function migrateGuest(oldUids, newUid, name) {
  const S = await import("./store.js?v=20261030f"); let n = 0;
  for (const f of await S.listFactories()) for (const y of await S.listYears(f.id)) for (const c of GCOLLS) {
    const all = await S.listMonthDocs(f.id, y, c), ids = new Set(all.map(d => d.id));
    for (const d of all) {
      const ou = [...oldUids].find(u => d.guestUid === u); if (!ou) continue;
      const nid = d.id.split(ou).join(newUid); if (ids.has(nid)) continue;
      const { id, updatedAt, ...rest } = d;
      await S.saveMonthDoc(f.id, y, c, nid, { ...rest, guestUid: newUid, guestName: name });
      await S.deleteMonthDoc(f.id, y, c, d.id); n++;
    }
  }
  return n;
}

export async function approvalDialog(ownerUid, gid, factories, done) {
  let req = null; try { const d = await getDoc(REQ(ownerUid, gid)); req = d.exists() ? d.data() : null; } catch {}
  const m = document.createElement("div"); m.className = "mod";
  const close = () => m.remove();
  if (!req) { m.innerHTML = `<div class="mbox" style="gap:14px"><h2>Misafir isteği bulunamadı</h2><div class="muted">İstek silinmiş olabilir veya başka bir hesapla giriş yapmış olabilirsiniz.</div><div class="row" style="justify-content:flex-end"><button class="sec" data-x>Kapat</button></div></div>`; document.body.appendChild(m); m.querySelector("[data-x]").onclick = close; return; }
  const done0 = req.status !== "pending";
  m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:14px"><h2>Misafir erişim isteği</h2>
    <div style="line-height:1.6"><div class="row" style="gap:8px;flex-wrap:nowrap" id="gNmRow"><b style="font-size:17px" id="gNm">${esc(req.name)}</b><button type="button" class="sm sec" id="gNmEd" aria-label="Adı düzenle" title="Adı düzenle" style="flex:0 0 32px;width:32px;height:32px;min-height:0;padding:0;display:flex;align-items:center;justify-content:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg></button></div><span class="muted">${[esc(req.unit || req.email || ""), ago(req.at)].filter(Boolean).join(" · ")}</span></div>
    ${done0 ? `<div class="warn">Bu istek zaten işlendi: ${req.status === "approved" ? "onaylandı" : "reddedildi"}. İsterseniz yeniden onay verebilirsiniz.</div>` : ""}
    <div id="gMerge"></div>
    <div class="col1" style="gap:8px"><span class="hd">ERİŞİM VERİLECEK FABRİKA</span>
      ${factories.length > 1 ? `<select id="gFac" class="inp" style="font-weight:600">${factories.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join("")}</select>`
        : factories.length ? `<div class="inp ro" style="font-weight:600">${esc(factories[0].name)}</div>` : '<span class="muted">Fabrika yok</span>'}</div>
    <div class="muted" style="font-size:12.5px;line-height:1.5">Misafir; veri girişi yapar, İSG denetimini yalnızca kaydeder (tamamlama, silme, kurulum ve ayarlar yetkisi yoktur), raporları görür ve PDF alabilir.</div>
    <div class="col1" style="gap:8px"><button data-ok="perm">Süresiz onay</button><button class="sec" data-ok="24h">24 saatlik onay</button><button class="sec" data-ok="no" style="color:#B3261E;border-color:#B3261E">İptal (reddet)</button></div></div>`;
  document.body.appendChild(m);
  let prev = null, lookSeq = 0;
  const look = async nm => {
    const box = m.querySelector("#gMerge"), seq = ++lookSeq; if (!box) return;
    box.innerHTML = '<div class="muted" style="font-size:12.5px">Önceki kayıtlar aranıyor…</div>';
    let r = null; try { r = await findPrev(ownerUid, nm, gid); } catch {}
    if (seq !== lookSeq) return; prev = r;
    if (!r || (!r.pid && !r.count)) { box.innerHTML = ""; return; }
    box.innerHTML = `<div style="background:#EAF7F1;border:1px solid #A9DCC4;border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:6px"><div><b style="color:#0B6E4F">Daha önce kayıtlı bir kişi</b>${r.pid ? ` <span class="tag">ID ${esc(r.pid)}</span>` : ""}</div>${r.count ? `<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;cursor:pointer"><input type="checkbox" id="gMg" checked style="margin-top:3px"><span>Önceki <b>${r.count}</b> taslak/bildirim kaydıyla birleştir, kaldığı yerden devam etsin. Başka biriyse işareti kaldırın.</span></label>` : '<div class="muted" style="font-size:12.5px">Devam edecek önceki kayıt yok; aynı ID ile kaydedilecek.</div>'}</div>`;
  };
  look(req.name);
  m.querySelector("#gNmEd")?.addEventListener("click", () => {
    const row = m.querySelector("#gNmRow"); if (row.querySelector("input")) return;
    row.innerHTML = `<input id="gNmI" class="inp" value="${esc(req.name)}" maxlength="60" style="flex:1;min-width:0;font-weight:700">`; row.querySelector("input").focus(); row.querySelector("input").select();
    row.querySelector("input").addEventListener("change", e => { const v = e.target.value.trim(); if (v.length >= 3) look(v); });
  });
  m.querySelectorAll("[data-ok]").forEach(b => b.onclick = async () => {
    const mode = b.dataset.ok, nm = (m.querySelector("#gNmI")?.value || req.name).trim();
    if (mode !== "no" && nm.length < 3) { toast("Ad soyadı en az 3 karakter olmalı."); return; } m.querySelectorAll("button").forEach(x => (x.disabled = true));
    try {
      if (mode === "no") { await updateDoc(REQ(ownerUid, gid), { status: "rejected", decidedAt: Date.now() }); toast("İstek reddedildi."); }
      else {
        const sel = m.querySelector("#gFac"), fs = sel ? [sel.value] : factories.slice(0, 1).map(f => f.id);
        if (!fs.length) { toast("Fabrika bulunamadı."); m.querySelectorAll("button").forEach(x => (x.disabled = false)); return; }
        const cg = await getDoc(doc(db, `users/${ownerUid}/meta/guestcfg`)).catch(() => null);
        const ppl = await loadPeople(ownerUid), pid = prev?.pid || newPid(new Set(ppl.map(p => p.id))), merge = !!(m.querySelector("#gMg")?.checked && prev?.uids?.size);
        await setDoc(PPL(ownerUid, pid), { name: nm, norm: normName(nm), unit: req.unit || "", createdAt: prev?.person?.createdAt || Date.now(), uids: [...new Set([...(prev?.person?.uids || []), ...(merge ? prev.uids : []), gid])] });
        await setDoc(MEM(ownerUid, gid), { ntfy: cg?.exists() ? cg.data().ntfy || null : null, name: nm, unit: req.unit || "", pid, hist: false, factories: fs, mode, expires: mode === "24h" ? new Date(Date.now() + 864e5) : null, createdAt: Date.now() });
        let moved = 0; if (merge) { try { moved = await migrateGuest(prev.uids, gid, nm); } catch (e) { toast("Önceki kayıtlar taşınamadı: " + (e.message || e)); } }
        await updateDoc(REQ(ownerUid, gid), { status: "approved", decidedAt: Date.now() });
        toast(`${nm} için ${mode === "24h" ? "24 saatlik" : "süresiz"} erişim onaylandı.${moved ? " " + moved + " önceki kayıt devam ettirildi." : ""}`);
      }
      close(); done?.();
    } catch (e) { toast("Kaydedilemedi: " + (e.message || e)); m.querySelectorAll("button").forEach(x => (x.disabled = false)); }
  });
  m.addEventListener("mousedown", e => { if (e.target === m) close(); });
}

// ---------------- Sahip: Ayarlar'daki "Misafir Kullanıcılar" bölümü ----------------
const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), b => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
let memOpen = false;
const memWrap = (n, inner) => n >= 2
  ? `<details id="gMemBox" ${memOpen ? "open" : ""}><summary style="cursor:pointer;font-weight:700">Misafirler (${n})</summary><div class="col1" style="gap:8px;margin-top:10px">${inner}</div></details>`
  : `<div class="col1" style="gap:8px"><span class="hd">MİSAFİRLER (${n})</span>${inner}</div>`;
let unMem = null, boxOpen = false;
export const reset = () => { boxOpen = false; memOpen = false; };
export async function renderSettings(box, { ownerUid, factories, onChange, scope }) {
  unMem?.();
  const invs = await getDocs(collection(db, `users/${ownerUid}/invites`)).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []);
  const cfgD = await getDoc(doc(db, `users/${ownerUid}/meta/guestcfg`)).catch(() => null), cfg = cfgD?.exists() ? cfgD.data() : {};
  const reqs = await getDocs(collection(db, `users/${ownerUid}/guestReqs`)).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []);
  const mems = await getDocs(collection(db, `users/${ownerUid}/members`)).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []);
  for (const m of mems) if ((m.ntfy || null) !== (cfg.ntfy || null)) { await updateDoc(MEM(ownerUid, m.id), { ntfy: cfg.ntfy || null }).catch(() => {}); m.ntfy = cfg.ntfy || null; }
  { const ppl = await loadPeople(ownerUid), taken = new Set(ppl.map(p => p.id));
    for (const p of ppl) if (!validPid(p.id)) { // eski biçimli ID'yi 6 haneli yeni biçime çevir (kişi kaydı ve üyelik birlikte)
      const np = newPid(taken); taken.add(np); const { id, ...rest } = p;
      try { await setDoc(PPL(ownerUid, np), rest); await deleteDoc(PPL(ownerUid, id)); for (const m of mems) if (m.pid === id) { await updateDoc(MEM(ownerUid, m.id), { pid: np }); m.pid = np; } p.id = np; } catch {} }
    for (const m of mems) if (!m.pid) { const n = normName(m.name), ex = ppl.find(p => p.norm === n); const pid = ex?.id || newPid(taken); taken.add(pid);
      try { await setDoc(PPL(ownerUid, pid), { name: m.name, norm: n, unit: m.unit || "", createdAt: ex?.createdAt || Date.now(), uids: [...new Set([...(ex?.uids || []), m.id])] }); await updateDoc(MEM(ownerUid, m.id), { pid }); m.pid = pid; } catch {} } }
  const inv0 = invs[0];
  if (inv0 && (cfg.ntfy || null) !== (inv0.ntfy || null)) { await updateDoc(doc(db, `users/${ownerUid}/invites/${inv0.id}`), { ntfy: cfg.ntfy || null }).catch(() => {}); inv0.ntfy = cfg.ntfy || null; }
  const inv = invs[0], link = inv ? `${location.origin}${location.pathname}?misafir=${ownerUid}.${inv.id}` : "";
  const fname = ids => (ids || []).map(i => factories.find(f => f.id === i)?.name || "—").join(", ");
  const devs = {}, devOpen = (renderSettings.dopen ||= new Set());
  const legacy = mems.filter(m => !m.inv), pins = await getDocs(collection(db, `users/${ownerUid}/pinvites`)).then(s => s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt)).catch(() => []);
  await Promise.all(pins.map(async p => { devs[p.id] = await getDocs(collection(db, `users/${ownerUid}/members/${p.uid}/devices`)).then(s => s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.last - a.last)).catch(() => []); }));
  const pend = reqs.filter(r => r.status === "pending").sort((a, b) => b.at - a.at);
  const PEN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';
  const people = [...pins.map(p => { const m = mems.find(x => x.id === p.uid); return { kind: "inv", uid: p.uid, name: p.name, pid: p.pid || m?.pid, p, m, factories: p.factories, stop: !!(p.closed || !m), devs: devs[p.id] || [] }; }),
    ...legacy.map(m => ({ kind: "ort", uid: m.id, name: m.name, pid: m.pid, p: null, m, factories: m.factories, stop: !!m.stopped, devs: [] }))];
  people.forEach(x => { x.exp = !x.stop && !isLive(x.m); });
  const card = x => { const np = pendOf(x.devs), stt = x.stop ? ["Durduruldu", "background:#FBE9C6;color:#6B3F00"] : x.exp ? ["Süresi doldu", "background:#FADAD7;color:#8E1B16"] : x.m.lastSeen ? ["Aktif", ""] : x.kind === "inv" ? ["Link açılmadı", "background:#FBE9C6;color:#6B3F00"] : ["Aktif", ""];
    return `<div class="it" style="gap:10px;flex-wrap:nowrap;align-items:flex-start"><div class="grow" style="min-width:0"><div><b>${esc(x.name)}</b> <span class="tag" style="${stt[1]}">${stt[0]}</span></div>${x.pid ? `<div class="muted" style="font-size:12px">ID ${esc(x.pid)}</div>` : ""}<div class="muted" style="font-size:12.5px">${[esc(fname(x.factories)), x.m && !x.stop ? "Erişim: " + esc(leftText(x.m)) : ""].filter(Boolean).join(" · ")}</div>${x.kind === "inv" && x.p.linkUntil && !x.stop && ms(x.p.linkUntil) + 72 * 36e5 > Date.now() ? `<div class="muted" style="font-size:12.5px">${ms(x.p.linkUntil) > Date.now() ? "Bağlantı " + hleft(ms(x.p.linkUntil) - Date.now()) + " geçerli" : "Bağlantı süresi doldu (yeni cihaz onay ister)"}</div>` : ""}${np ? `<div><span class="tag" style="background:#FBE9C6;color:#6B3F00">${np} cihaz onay bekliyor</span></div>` : ""}<div class="muted" style="font-size:12.5px">${x.m?.lastSeen ? "Son görülme: " + ago(x.m.lastSeen) : x.p ? "Gönderildi: " + ago(x.p.createdAt) : "Henüz görülmedi"}</div></div><button type="button" class="gedit" data-edit="${x.uid}" aria-label="${esc(x.name)} düzenle">${PEN}</button></div>`; };
  const nAkt = pins.filter(p => { const m = mems.find(x => x.id === p.uid); return m && !p.closed && isLive(m); }).length, sub = [`${pins.length} kişi`, nAkt ? `${nAkt} aktif` : "", (pend.length + pins.reduce((n, p) => n + pendOf(devs[p.id]), 0)) ? `${pend.length + pins.reduce((n, p) => n + pendOf(devs[p.id]), 0)} onay bekliyor` : ""].filter(Boolean).join(" · ");
  box.innerHTML = `<button type="button" id="gAcc" aria-expanded="${boxOpen}" aria-label="Misafir Kullanıcılar bölümünü ${boxOpen ? "kapat" : "aç"}" style="display:flex;align-items:center;gap:12px;width:100%;min-height:40px;height:auto;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer"><span style="flex:1;min-width:0"><h2 style="margin:0">Misafir Kullanıcılar</h2><div class="muted" style="font-size:13px;margin-top:4px;font-weight:600">${sub}</div></span><span style="flex:0 0 40px;width:40px;height:40px;border-radius:12px;border:1.5px solid var(--gd);color:var(--gd);box-sizing:border-box;display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .15s;${boxOpen ? "transform:rotate(180deg)" : ""}"><path d="M6 9l6 6 6-6"/></svg></span></button>
    <div class="col1" id="gAccB" ${boxOpen ? "" : "hidden"} style="gap:14px;border-top:1px solid var(--line);padding-top:14px"><div class="muted" style="font-size:13px;line-height:1.5">Saha yardımcınıza veya denetim yapacak yetkiliye kişiye özel davet bağlantısı gönderin; bağlantıya dokunan onay beklemeden girer. Misafir fabrika bazlı yetkilendirilir.</div>
    <div class="col1" style="gap:8px"><span class="hd">KİŞİYE ÖZEL DAVET (önerilen)</span>
      <div class="muted" style="font-size:12.5px;line-height:1.55">Her misafir için ayrı bağlantı üretilir. Bağlantı geçerlilik süresi içinde kişinin kendi cihazları (iPhone 2, Android 1) onaysız girer; sonradan gelen yeni cihaz sizin onayınızı bekler.</div>
      <div><button class="sm" id="pNew">Misafir davet et</button></div>
</div>
    <div class="col1" id="gPeople" style="gap:8px"><span class="hd">MİSAFİRLER (${people.length})</span>${people.map(card).join("") || '<span class="muted">Henüz misafir yok.</span>'}</div>
    <details><summary style="cursor:pointer;font-weight:700">Ortak davet bağlantısı (onay isteyen yöntem)</summary><div class="col1" style="gap:12px;margin-top:10px">
    <div class="col1" style="gap:8px"><span class="hd">DAVET BAĞLANTISI</span>
      ${inv ? `<div class="row" style="flex-wrap:nowrap;gap:10px;align-items:stretch"><input class="inp" id="gLink" readonly value="${esc(link)}" onfocus="this.select()" style="flex:1;min-width:0"><button class="sm" id="gClose" aria-label="Davet bağlantısını kapat" title="Davet bağlantısını kapat" style="flex:0 0 32px;width:32px;height:32px;min-height:0;align-self:center;padding:0;background:#B3261E;border-color:#B3261E;color:#fff;font-size:26px;font-weight:400;line-height:1;display:grid;place-items:center;margin-right:6px">×</button></div><div class="row"><button class="sm" id="gCopy">Kopyala</button><button class="sm sec" id="gShare">Paylaş</button><button class="sm sec" id="gRegen">Bağlantıyı yenile</button></div>
        <div class="muted" style="font-size:12.5px">“Yenile” eski bağlantıyı geçersiz kılar, kırmızı × bağlantıyı kapatır (onaylı misafirler etkilenmez).</div>` : `<div><button id="gMake">Davet bağlantısı oluştur</button></div>`}</div>
    ${pend.length ? `<div class="col1" style="gap:8px"><span class="hd">ONAY BEKLEYEN İSTEKLER (${pend.length})</span>${pend.map(r => `<div class="it" style="gap:10px;flex-wrap:wrap"><div class="grow"><b>${esc(r.name)}</b><div class="muted" style="font-size:12.5px">${[esc(r.unit || r.email || ""), ago(r.at)].filter(Boolean).join(" · ")}</div></div><button class="sm" data-rv="${r.id}">İncele ve onayla</button></div>`).join("")}</div>` : ""}
    <div class="muted" style="font-size:12.5px;line-height:1.5">Bu bağlantıyla gelip onaylanan kişiler yukarıdaki Misafirler listesinde görünür.</div>
    </div></details>
    <details ${cfg.ntfy ? "" : "open"}><summary style="cursor:pointer;font-weight:700">Telefon bildirimi (önerilen, ücretsiz)</summary><div class="col1" style="gap:8px;margin-top:10px">
      <div class="muted" style="font-size:12.5px;line-height:1.6">Misafir “Onay Gönder”e bastığında telefonunuza anında bildirim gelir; uygulama kapalı olsa bile. Bildirime dokununca onay ekranı açılır.<br><b>1.</b> Telefonunuza <b>ntfy</b> uygulamasını kurun (Play Store / App Store).<br><b>2.</b> Aşağıdan “Bildirim kodu oluştur”a basın.<br><b>3.</b> ntfy'de <b>+</b> ile aşağıdaki kodu abone olun (sunucu: ntfy.sh).<br><b>4.</b> “Test bildirimi gönder” ile deneyin.</div>
      ${cfg.ntfy ? `<input class="inp" id="gTopic" readonly value="${esc(cfg.ntfy)}" onfocus="this.select()"><div class="row"><button class="sm" id="gTest">Test bildirimi gönder</button><button class="sm sec" id="gTopicCopy">Kodu kopyala</button><button class="sm sec" id="gTopicNew">Kodu yenile</button><button class="sm sec" id="gTopicOff">Kapat</button></div>` : `<div><button class="sm" id="gTopicNew">Bildirim kodu oluştur</button></div>`}</div></details>
    <details><summary style="cursor:pointer;font-weight:700">E-posta bildirimi (isteğe bağlı)</summary><div class="col1" style="gap:8px;margin-top:10px">
      <div class="muted" style="font-size:12.5px;line-height:1.55">Ücretsiz <b>EmailJS</b> hesabıyla e-posta da gönderilebilir. Service ID, Template ID ve Public Key'i girin. Şablonda <code>{{guest_name}}</code>, <code>{{guest_unit}}</code> ve <code>{{approve_link}}</code> değişkenleri kullanılır. Boş bırakırsanız e-posta gitmez.</div>
      <input class="inp" id="gSvc" placeholder="Service ID" value="${esc(cfg.service || "")}"><input class="inp" id="gTpl" placeholder="Template ID" value="${esc(cfg.template || "")}"><input class="inp" id="gKey" placeholder="Public Key" value="${esc(cfg.key || "")}">
      <div><button class="sm" id="gCfg">Kaydet</button></div></div></details></div>`;
  box.querySelector("#gAcc").onclick = e => { const b = e.currentTarget, body = box.querySelector("#gAccB"); boxOpen = body.hidden; body.hidden = !boxOpen; b.setAttribute("aria-expanded", boxOpen); b.setAttribute("aria-label", "Misafir Kullanıcılar bölümünü " + (boxOpen ? "kapat" : "aç")); b.querySelector("svg").style.transform = boxOpen ? "rotate(180deg)" : ""; };
  { // Canlı durum: misafir girince / yeni cihaz onay isteyince sayfa yenilemeden listeyi güncelle
    let t = null; const offs = [];
    const fire = () => {
      if (!box.isConnected) { unMem?.(); return; }
      clearTimeout(t); t = setTimeout(() => { if (box.isConnected && !box.contains(document.activeElement && document.activeElement.matches("input,textarea,select") ? document.activeElement : null)) renderSettings(box, { ownerUid, factories, onChange, scope }); }, 500);
    };
    const watch = c => { let first = true; offs.push(onSnapshot(c, () => { if (first) { first = false; return; } fire(); }, () => {})); };
    watch(collection(db, `users/${ownerUid}/members`));
    pins.forEach(p => watch(collection(db, `users/${ownerUid}/members/${p.uid}/devices`)));
    unMem = () => { offs.forEach(o => o()); clearTimeout(t); unMem = null; };
  }
  box.querySelector("#gMemBox")?.addEventListener("toggle", e => { memOpen = e.target.open; });
  const q = s => box.querySelector(s), refresh = () => { renderSettings(box, { ownerUid, factories, onChange, scope }); onChange?.(); };
  const mk = async () => {
    for (const i of invs) await deleteDoc(doc(db, `users/${ownerUid}/invites/${i.id}`)).catch(() => {});
    const c = cfgD?.exists() ? cfg : {}; await setDoc(doc(db, `users/${ownerUid}/invites/${rnd()}`), { createdAt: Date.now(), ntfy: c.ntfy || null, emailjs: c.service && c.template && c.key ? { service: c.service, template: c.template, key: c.key } : null });
    refresh();
  };
  q("#gMake") && (q("#gMake").onclick = mk);
  q("#gRegen") && (q("#gRegen").onclick = async () => { if (await confirmBox("Davet bağlantısı yenilensin mi?", "Eski davet bağlantısı geçersiz olacak.", "Yenile")) mk(); });
  q("#gClose") && (q("#gClose").onclick = async () => { if (!(await confirmBox("Davet bağlantısı kapatılsın mı?", "Bağlantı çalışmaz; onaylı misafirler etkilenmez. İstediğinizde yeniden oluşturabilirsiniz.", "Kapat", true))) return; for (const i of invs) await deleteDoc(doc(db, `users/${ownerUid}/invites/${i.id}`)).catch(() => {}); toast("Davet bağlantısı kapatıldı."); refresh(); });
  q("#gCopy") && (q("#gCopy").onclick = async () => { try { await navigator.clipboard.writeText(link); toast("Bağlantı kopyalandı."); } catch { q("#gLink").select(); toast("Bağlantıyı seçip kopyalayın."); } });
  q("#gShare") && (q("#gShare").onclick = async () => { if (navigator.share) { try { await navigator.share({ title: "HSE Verim Modülü · Misafir erişimi", text: "HSE Verim Modülü misafir erişim bağlantısı:", url: link }); } catch {} } else { try { await navigator.clipboard.writeText(link); toast("Bağlantı kopyalandı."); } catch {} } });
  q("#gCfg").onclick = async () => {
    const c = { service: q("#gSvc").value.trim(), template: q("#gTpl").value.trim(), key: q("#gKey").value.trim() };
    await setDoc(doc(db, `users/${ownerUid}/meta/guestcfg`), c, { merge: true });
    if (inv) await updateDoc(doc(db, `users/${ownerUid}/invites/${inv.id}`), { emailjs: c.service && c.template && c.key ? c : null });
    toast("E-posta ayarı kaydedildi.");
  };
  const setTopic = async t => {
    await setDoc(doc(db, `users/${ownerUid}/meta/guestcfg`), { ntfy: t }, { merge: true });
    if (inv) await updateDoc(doc(db, `users/${ownerUid}/invites/${inv.id}`), { ntfy: t });
    refresh();
  };
  q("#gTopicNew") && (q("#gTopicNew").onclick = async () => { if (!cfg.ntfy || await confirmBox("Yeni kod oluşturulsun mu?", "Yeni kod oluşturulunca ntfy'de yeniden abone olmanız gerekir.", "Oluştur")) setTopic("hse-" + rnd() + rnd()); });
  q("#gTopicOff") && (q("#gTopicOff").onclick = () => setTopic(null));
  q("#gTopicCopy") && (q("#gTopicCopy").onclick = async () => { try { await navigator.clipboard.writeText(cfg.ntfy); toast("Kod kopyalandı."); } catch { q("#gTopic").select(); } });
  q("#gTest") && (q("#gTest").onclick = async () => { const ok = await sendPush(cfg.ntfy, { name: "Test Kullanıcı", unit: "Test Bölümü", link: location.origin + location.pathname }); toast(ok ? "Test bildirimi gönderildi; telefonunuza gelmesi gerekir." : "Gönderilemedi; internet bağlantısını kontrol edin."); });
  q("#pNew").onclick = () => inviteDialog(ownerUid, factories, refresh);
  const pin = id => pins.find(p => p.id === id);
  // ---- Kalem: ortak düzenleme alt sayfası (davetli ve ortak bağlantı aynı ekran) ----
  const ACC = ["Süresiz", "24 saat", "7 gün"], accTxt = m => !m ? "—" : m.expires == null ? "Süresiz" : leftText(m);
  const CH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  const newLink = async x => {
    const p = x.p;
    if (!(await confirmBox("Yeni link üretilsin mi?", `${p.name} için eski bağlantı ve eski bağlantıyla açılmış tüm oturumlar geçersiz olur. Kişi ve paylaşımları korunur; yeni bağlantıyı ona göndermeniz gerekir.`, "Yeni link üret", true))) return false;
    try {
      const np = tokGen(), ek = p.ek || p.token;
      await changeAuxPassword(pEmail(ek), p.token, np);
      const lh = p.linkH || 24, lu = Date.now() + lh * 36e5;
      await updateDoc(PIN(ownerUid, p.uid), { token: np, ek, linkH: lh, linkUntil: lu });
      await updateDoc(MEM(ownerUid, p.uid), { rot: serverTimestamp(), linkUntil: lu }).catch(() => {});
      for (const d of x.devs) await deleteDoc(doc(db, `users/${ownerUid}/members/${p.uid}/devices/${d.id}`)).catch(() => {});
      toast("Yeni link üretildi."); const np2 = { ...p, token: np, ek, linkH: lh, linkUntil: lu }; refresh(); sendDialog(ownerUid, np2); return true;
    } catch (e) { toast("Üretilemedi: " + (e.code === "auth/invalid-credential" ? "Hesap şifresi eşleşmedi." : e.message || e)); return false; }
  };
  const openEdit = async uid => {
    const x = people.find(y => y.uid === uid); if (!x) return;
    const md = document.createElement("div"); md.className = "mod"; document.body.appendChild(md);
    const e = { acc: null, lv: null, hist: null, fab: [...(x.factories || [])], sec: null, secRows: [], dd: null, dev: false }; let secOrig = null;
    const close = () => md.remove();
    md.addEventListener("mousedown", ev => { if (ev.target === md) close(); });
    const dd = (id, label, val, items, multi) => { const o = e.dd === id; return `<div class="gdd${o ? " open" : ""}"><button type="button" class="gddb" data-dd="${id}" aria-expanded="${o}"><span style="flex:1;min-width:0"><span class="hd" style="display:block;font-size:10.5px;margin:0">${esc(label)}</span><b style="font-size:13.5px">${esc(val)}</b></span>${CH}</button>${o ? `<div class="gddl">${items.map((it, k) => `<button type="button" class="gopt" data-opt="${id}|${k}"><i>${it[2] ? "✓" : ""}</i>${esc(it[1])}</button>`).join("")}</div>` : ""}</div>`; };
    const loadDevs = () => getDocs(collection(db, `users/${ownerUid}/members/${x.uid}/devices`)).then(s => s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.last - a.last)).catch(() => x.devs);
    const draw = () => {
      const accVal = e.acc || accTxt(x.m), lvVal = validTxt(e.lv || x.p?.linkH || 24), np = pendOf(x.devs);
      const histVal = (e.hist ?? (x.m?.hist !== false)) ? "Açık" : "Kapalı", secOn = !!(e.sec && e.secRows.length), allOn = secOn && e.sec.length === e.secRows.length;
      const secVal = allOn ? `Tüm bölümler (${e.secRows.length})` : e.sec?.length ? `${e.sec.length} / ${e.secRows.length} bölüm` : "Paylaşım yok";
      md.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:12px"><div class="row" style="flex-wrap:nowrap;align-items:flex-start;gap:10px"><div class="grow" style="min-width:0"><h2 style="margin:0;font-size:18px">${esc(x.name)}</h2><div class="muted" style="font-size:12.5px">${x.pid ? "ID " + esc(x.pid) + " · " : ""}${x.kind === "inv" ? "Kişiye özel davet" : "Ortak bağlantı"}</div></div><button type="button" class="sm sec" data-x>Kapat</button></div>
      ${x.stop ? '<div class="muted" style="font-size:13px;line-height:1.5">Erişim durduruldu. Kayıt listede duruyor; yeniden açabilir veya silebilirsiniz.</div>' : `<div class="gddrow">${dd("acc", "Erişim süresi", accVal, ACC.map(a => [a, a, a === accVal]), 0)}${x.kind === "inv" ? dd("lv", "Bağlantı geçerliliği", lvVal, VALID.map(v => [v[0], v[1], v[1] === lvVal]), 0) : ""}</div>
        ${dd("fab", "Fabrikalar", `${e.fab.length} / ${factories.length} fabrika seçili`, factories.map(f => [f.id, f.name, e.fab.includes(f.id)]), 1)}
        ${secOn ? dd("sec", "Paylaşılan bölümler (bu ay)", secVal, [["*", "Tüm bölümler", allOn], ...e.secRows.map(r => [r.id, r.name, e.sec.includes(r.id)])], 1) : ""}
        ${dd("hist", "Eski bulgular ve aksiyon", histVal, [["0", "Kapalı · yeni denetçi gibi", histVal === "Kapalı"], ["1", "Açık · eski bulguları görür, aksiyon bildirir", histVal === "Açık"]], 0)}
        ${x.devs.length ? `<div class="gdd${e.dev ? " open" : ""}"><button type="button" class="gddb" data-dev aria-expanded="${e.dev}"><span style="flex:1;min-width:0"><span class="hd" style="display:block;font-size:10.5px;margin:0">Cihazlar</span><b style="font-size:13.5px">${x.devs.length} cihaz${np ? ` · ${np} onay bekliyor` : ""}</b></span>${CH}</button>${e.dev ? `<div class="gddl" style="max-height:none;padding:6px">${x.devs.map(d => `<div class="row" style="gap:8px;flex-wrap:nowrap;justify-content:space-between;align-items:center;padding:4px"><div style="min-width:0"><b style="font-size:13px">${esc(d.label || "Cihaz")}</b>${d.blocked ? ' <span class="tag" style="background:#FADAD7;color:#8E1B16">Engelli</span>' : isPend(d) ? ' <span class="tag" style="background:#FBE9C6;color:#6B3F00">Onay bekliyor</span>' : ""}<div class="muted" style="font-size:12px">İlk giriş ${ago(d.first)} · Son ${ago(d.last)}</div></div><div class="row" style="gap:6px;flex:0 0 auto;flex-wrap:nowrap">${isPend(d) ? `<button type="button" class="sm" data-dap="${d.id}">Onayla</button>` : ""}<button type="button" class="sm sec" data-dblk="${d.id}|${d.blocked ? 0 : 1}" style="${d.blocked ? "" : "color:#B3261E;border-color:#B3261E"}">${d.blocked ? "Engeli kaldır" : "Engelle"}</button></div></div>`).join("")}</div>` : ""}</div>` : ""}`}
      <div class="gtwo">${x.stop ? '<button type="button" class="sec" data-reopen>Yeniden aç</button>' : `${x.kind === "inv" ? '<button type="button" class="sec" data-newlink>Yeni link üret</button><button type="button" class="sec" data-resend>Mesajı gönder</button>' : ""}<button type="button" class="sec" data-stop>Erişimi durdur</button>`}<button type="button" class="sec" data-del style="color:#B3261E;border-color:#B3261E">Kişiyi sil</button></div>
      ${x.stop ? "" : '<button type="button" data-save>Kaydet</button>'}</div>`;
      const q = s => md.querySelector(s), on = (s, f) => md.querySelectorAll(s).forEach(b => b.onclick = () => f(b));
      q("[data-x]").onclick = close;
      on("[data-dd]", b => { e.dd = e.dd === b.dataset.dd ? null : b.dataset.dd; draw(); });
      on("[data-dev]", () => { e.dev = !e.dev; draw(); });
      on("[data-opt]", b => {
        const [id, k] = b.dataset.opt.split("|"), i = +k;
        if (id === "acc") { e.acc = ACC[i]; e.dd = null; }
        else if (id === "hist") { e.hist = i === 1; e.dd = null; }
        else if (id === "lv") { e.lv = VALID[i][0]; e.dd = null; }
        else if (id === "fab") { const f = factories[i].id, at = e.fab.indexOf(f); if (at > -1) { if (e.fab.length > 1) e.fab.splice(at, 1); } else e.fab.push(f); }
        else if (id === "sec") { if (i === 0) e.sec = e.sec.length === e.secRows.length ? [] : e.secRows.map(r => r.id); else { const f = e.secRows[i - 1].id, at = e.sec.indexOf(f); if (at > -1) e.sec.splice(at, 1); else e.sec.push(f); } }
        draw();
      });
      on("[data-dap]", async b => { await updateDoc(doc(db, `users/${ownerUid}/members/${x.uid}/devices/${b.dataset.dap}`), { ap: true }).catch(er => toast("Kaydedilemedi: " + (er.message || er))); toast("Cihaz onaylandı."); x.devs = await loadDevs(); draw(); refresh(); });
      on("[data-dblk]", async b => { const [dv, v] = b.dataset.dblk.split("|");
        if (v === "1" && !(await confirmBox("Cihaz engellensin mi?", "Bu cihazın erişimi hemen biter. Kişi diğer cihazlarını kullanmaya devam eder.", "Engelle", true))) return;
        await updateDoc(doc(db, `users/${ownerUid}/members/${x.uid}/devices/${dv}`), { blocked: v === "1" }).catch(er => toast("Kaydedilemedi: " + (er.message || er))); toast(v === "1" ? "Cihaz engellendi." : "Engel kaldırıldı."); x.devs = await loadDevs(); draw(); refresh(); });
      on("[data-newlink]", async () => { if (await newLink(x)) close(); });
      on("[data-resend]", () => { close(); sendDialog(ownerUid, x.p); });
      on("[data-stop]", async () => {
        if (!(await confirmBox("Erişim durdurulsun mu?", `${x.name} için tüm cihazların erişimi hemen biter. Kayıt listede "Durduruldu" olarak kalır; istediğinizde yeniden açabilirsiniz.`, "Durdur", true))) return;
        try { if (x.p) { await deleteDoc(MEM(ownerUid, x.uid)).catch(() => {}); await updateDoc(PIN(ownerUid, x.p.uid), { closed: true }); } else await updateDoc(MEM(ownerUid, x.uid), { stopped: true }); }
        catch (er) { return toast("Kaydedilemedi: " + (er.message || er)); }
        toast("Erişim durduruldu."); close(); refresh(); });
      on("[data-reopen]", async () => {
        try {
          if (x.p) { const p = x.p, m0 = x.m, expires = p.expires && ms(p.expires) > Date.now() ? p.expires : (p.expires ? new Date(Date.now() + 30 * 864e5) : null);
            await setDoc(MEM(ownerUid, p.uid), { ntfy: cfg.ntfy || null, name: p.name, unit: "", pid: p.pid || m0?.pid || null, inv: true, ...(m0?.hist !== undefined ? { hist: m0.hist } : {}), factories: p.factories, mode: expires ? "24h" : "perm", expires, createdAt: m0?.createdAt || Date.now(), ...(m0?.lastSeen ? { lastSeen: m0.lastSeen } : {}) });
            await updateDoc(PIN(ownerUid, p.uid), { closed: false, expires }); }
          else await updateDoc(MEM(ownerUid, x.uid), { stopped: false });
        } catch (er) { return toast("Kaydedilemedi: " + (er.message || er)); }
        toast("Erişim yeniden açıldı."); close(); refresh(); });
      on("[data-del]", async () => {
        if (!(await confirmBox("Kişi silinsin mi?", `${x.name} için erişim biter ve kayıt tamamen kalkar. Geri alınamaz.`, "Sil", true))) return;
        try { await deleteDoc(MEM(ownerUid, x.uid)).catch(() => {}); if (x.p) await deleteDoc(PIN(ownerUid, x.p.uid)); else await deleteDoc(REQ(ownerUid, x.uid)).catch(() => {}); }
        catch (er) { return toast("Silinemedi: " + (er.message || er)); }
        toast("Kişi silindi."); close(); refresh(); });
      on("[data-save]", async b => {
        b.disabled = true; const mUp = {}, pUp = {};
        try {
          if (e.acc && e.acc !== accTxt(x.m)) { const A = { "Süresiz": ["perm", null], "24 saat": ["24h", new Date(Date.now() + 864e5)], "7 gün": ["7d", new Date(Date.now() + 7 * 864e5)] }[e.acc]; mUp.mode = A[0]; mUp.expires = A[1]; if (x.p) pUp.expires = A[1]; }
          if (e.lv && x.p && +e.lv !== +(x.p.linkH || 24)) { const lu = Date.now() + e.lv * 36e5; pUp.linkH = +e.lv; pUp.linkUntil = lu; mUp.linkUntil = lu; }
          if ([...e.fab].sort().join() !== [...(x.factories || [])].sort().join()) { mUp.factories = e.fab; if (x.p) pUp.factories = e.fab; }
          if (e.hist !== null && e.hist !== (x.m?.hist !== false)) mUp.hist = e.hist;
          if (Object.keys(mUp).length) await updateDoc(MEM(ownerUid, x.uid), mUp);
          if (x.p && Object.keys(pUp).length) await updateDoc(PIN(ownerUid, x.p.uid), pUp);
          if (scope && secOrig && e.sec && [...e.sec].sort().join() !== [...secOrig].sort().join()) await scope.set(x.uid, x.name, e.secRows.filter(r => e.sec.includes(r.id)));
        } catch (er) { b.disabled = false; return toast("Kaydedilemedi: " + (er.message || er)); }
        toast("Kaydedildi."); close(); refresh();
      });
    };
    draw();
    if (scope && !x.stop) { try { const [rows, cur] = await Promise.all([scope.rows(), scope.get(x.uid)]); if (rows.length) { e.secRows = rows; e.sec = cur.slice(); secOrig = cur.slice(); draw(); } } catch {} }
  };
  box.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => openEdit(b.dataset.edit));
}

// ---------------- Kişiye özel davet (her misafir için ayrı Firebase hesabı; bağlantı = giriş anahtarı) ----------------
// users/{sahip}/pinvites/{uid} = { name, phone, uid, token, pid, factories[], expires, closed, createdAt }  (yalnızca sahip okur)
// Misafir bağlantıya dokununca e-posta/şifre ile (bağlantıdaki anahtardan türetilir) girer; her cihazda aynı uid → onay, çoklu ID, yeniden kayıt yok.
const GDOM = "misafir.example.com";
export const pEmail = code => `m${String(code).toLowerCase()}@${GDOM}`;
export const isEmailGuest = u => !!u && !u.isAnonymous && String(u.email || "").endsWith("@" + GDOM);
export const isGuestUser = u => !!u && (u.isAnonymous || isEmailGuest(u));
const PIN = (o, id) => doc(db, `users/${o}/pinvites/${id}`);
const tokGen = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
const pLink = (o, tok, ek) => `${location.origin}${location.pathname}?d=${o}.${tok}${ek && ek !== tok ? "&k=" + ek : ""}`;
const phoneNo = p => { let d = String(p || "").replace(/\D/g, ""); if (!d) return ""; if (d.startsWith("00")) d = d.slice(2); else if (d.startsWith("0")) d = "90" + d.slice(1); else if (d.length === 10) d = "90" + d; return d; };
const VALID = [[24, "24 saat"], [48, "48 saat"], [168, "7 gün"]], validTxt = h => (VALID.find(v => v[0] === +h) || [0, ""])[1];
// WhatsApp için kalın yazı *…*; e-postada düz metin
const pMsg = (name, link, h, wa = true) => { const b = t => (wa ? `*${t}*` : t), v = validTxt(h); return `${b(`Sayın ${name},`)}\nHSE Verim Modülü davet bağlantınız hazır. Açmak için bağlantıya dokunmanız yeterlidir:\n${link}\nBu bağlantı size özeldir, lütfen başkasıyla paylaşmayınız.${v ? `\nDavet bağlantısı ${v} geçerlidir.` : ""}\n${b("İyi çalışmalar dileriz.")}`; };

export function sendDialog(ownerUid, p) {
  const link = pLink(ownerUid, p.token, p.ek), msg = pMsg(p.name, link, p.linkH), mail = pMsg(p.name, link, p.linkH, false), no = phoneNo(p.phone);
  const m = modal(`<h2>Davet hazır</h2><div class="muted" style="font-size:12.5px;line-height:1.5">${esc(p.name)} için kişiye özel bağlantı. Mesaj hazır gelir, siz yalnızca gönderirsiniz.</div>
    <div style="background:var(--calc,#EEF3F1);border-radius:12px;padding:10px 12px;font-size:12.5px;line-height:1.55;white-space:pre-line;overflow-wrap:anywhere">${esc(msg).replace(/\*([^*]+)\*/g, "<b>$1</b>")}</div>
    <div class="col1" style="gap:8px"><button data-wa>WhatsApp ile gönder</button><div class="row2" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="sec" data-ml style="white-space:nowrap;padding:0 6px;font-size:13px">Mail ile gönder</button><button class="sec" data-cp style="white-space:nowrap;padding:0 6px;font-size:13px">Bağlantıyı kopyala</button></div><button class="sec" data-x>Kapat</button></div>`);
  m.querySelector("[data-wa]").onclick = () => { window.open(`https://wa.me/${no}?text=${encodeURIComponent(msg)}`, "_blank"); };
  m.querySelector("[data-ml]").onclick = () => { location.href = `mailto:?subject=${encodeURIComponent("HSE Verim Modülü davet bağlantınız")}&body=${encodeURIComponent(mail)}`; };
  m.querySelector("[data-cp]").onclick = async () => { try { await navigator.clipboard.writeText(link); toast("Bağlantı kopyalandı."); } catch { toast("Kopyalanamadı."); } };
  m.querySelector("[data-x]").onclick = () => m.remove();
}
export function inviteDialog(ownerUid, factories, done) {
  const m = modal(`<h2>Misafir davet et</h2>
    <div class="col1" style="gap:8px"><label class="hd">AD SOYAD *</label><input class="inp" id="pnN" autocomplete="off" maxlength="60">
    <label class="hd">TELEFON (WHATSAPP İÇİN, İSTEĞE BAĞLI)</label><input class="inp" id="pnP" inputmode="tel" autocomplete="off" placeholder="05xx xxx xx xx">
    ${factories.length > 1 ? `<label class="hd">FABRİKA</label><select class="inp" id="pnF" style="font-weight:600">${factories.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join("")}</select>` : ""}
    <label class="hd">BAĞLANTI GEÇERLİLİĞİ</label><select class="inp" id="pnH" style="font-weight:600">${VALID.map(v => `<option value="${v[0]}">${v[1]}</option>`).join("")}</select>
    <label class="hd">ERİŞİM SÜRESİ</label><select class="inp" id="pnD" style="font-weight:600"><option value="30">30 gün</option><option value="7">7 gün</option><option value="0">Süresiz</option></select>
    <div class="muted" style="font-size:12.5px;line-height:1.5">Hangi bölümleri göreceği ve yetkisi, denetim sayfasındaki Paylaş ekranından belirlenir.</div></div>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="sec" data-x>Vazgeç</button><button data-s>Davet oluştur</button></div>`);
  m.querySelector("[data-x]").onclick = () => m.remove();
  m.querySelector("[data-s]").onclick = async e => {
    const name = m.querySelector("#pnN").value.trim(), phone = m.querySelector("#pnP").value.trim(), days = +m.querySelector("#pnD").value, lh = +m.querySelector("#pnH").value;
    if (name.length < 3) return toast("Ad soyadı yazın.");
    const fs = m.querySelector("#pnF") ? [m.querySelector("#pnF").value] : factories.slice(0, 1).map(f => f.id);
    if (!fs.length) return toast("Önce bir fabrika oluşturun.");
    e.target.disabled = true; e.target.textContent = "Oluşturuluyor…";
    try {
      const token = tokGen(), uid = await createAuxUser(pEmail(token), token), expires = days ? new Date(Date.now() + days * 864e5) : null;
      const cg = await getDoc(doc(db, `users/${ownerUid}/meta/guestcfg`)).catch(() => null), ppl = await loadPeople(ownerUid), pid = newPid(new Set(ppl.map(p => p.id)));
      await setDoc(PPL(ownerUid, pid), { name, norm: normName(name), unit: "", createdAt: Date.now(), uids: [uid] });
      await setDoc(MEM(ownerUid, uid), { ntfy: cg?.exists() ? cg.data().ntfy || null : null, name, unit: "", pid, inv: true, hist: false, factories: fs, mode: expires ? "24h" : "perm", expires, linkUntil: Date.now() + lh * 36e5, createdAt: Date.now() });
      const p = { name, phone, uid, token, ek: token, pid, factories: fs, expires, closed: false, linkH: lh, linkUntil: Date.now() + lh * 36e5, createdAt: Date.now() };
      await setDoc(PIN(ownerUid, uid), p);
      m.remove(); done?.(); sendDialog(ownerUid, p);
    } catch (er) { e.target.disabled = false; e.target.textContent = "Davet oluştur"; toast("Oluşturulamadı: " + (er.code === "auth/operation-not-allowed" ? "E-posta/Parola girişi Firebase'de kapalı." : er.message || er)); }
  };
}

// ---------------- Misafir: bağlantıdan giriş / kapalı ekranı / kısayol kartı ----------------

// ---- Cihaz kaydı: her tarayıcı ortamı (Safari, kısayol, Chrome…) bir kez kaydedilir; yeni cihazda yetkiliye bildirim, yetkili cihazı engelleyebilir ----
const fpId = () => { const t = [navigator.userAgent, screen.width + "x" + screen.height, Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language].join("|"); let h = 5381; for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return "f" + h.toString(16); };
// Cihaz numarası: yerel hafıza → çerez → (ikisi de kapalıysa) cihaz özelliklerinden türetilen sabit numara
const devId = () => {
  let d = null; try { d = localStorage.getItem("hse_dev"); } catch {}
  if (!d) { const m = document.cookie.match(/(?:^|; )hse_dev=([^;]+)/); d = m ? m[1] : null; }
  if (!d) d = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, "0")).join("");
  let ok = false; try { localStorage.setItem("hse_dev", d); ok = localStorage.getItem("hse_dev") === d; } catch {}
  try { document.cookie = `hse_dev=${d}; max-age=31536000; path=/; SameSite=Lax`; if (!ok && document.cookie.includes("hse_dev=" + d)) ok = true; } catch {}
  return ok ? d : fpId();
};
const devInfo = () => {
  const ua = navigator.userAgent, ios = /iphone|ipad|ipod/i.test(ua), and = /android/i.test(ua), pc = ios ? (/ipad/i.test(ua) ? "iPad" : "iPhone") : and ? "Android" : /windows/i.test(ua) ? "Windows" : /mac/i.test(ua) ? "Mac" : "Cihaz";
  const sa = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const inapp = !sa && (/whatsapp|fban|fbav|instagram/i.test(ua) || (ios && !/safari/i.test(ua)));
  const br = sa ? "Ana ekran kısayolu" : inapp ? "Uygulama içi tarayıcı" : /samsungbrowser/i.test(ua) ? "Samsung Internet" : /edg/i.test(ua) ? "Edge" : /crios|chrome/i.test(ua) ? "Chrome" : /fxios|firefox/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "Tarayıcı";
  return { label: `${pc} · ${br}`, plat: ios ? "ios" : and ? "and" : "pc", app: inapp };
};
const HAK = { ios: 2, and: 1, pc: 1 };
export const rotated = (user, m) => { const lat = Date.parse(user?.metadata?.lastSignInTime || "") || 0, rot = m?.rot ? ms(m.rot) : 0; return !!(rot && lat && lat + 2000 < rot); };
// "ok" | "blocked" | "rot" | "pending"
// Kurallar: pencere içinde (bağlantı geçerliliği) platforma göre cihaz hakkı (iPhone 2, Android 1, bilgisayar 1; uygulama içi tarayıcı sayılmaz);
// ilk cihazdan farklı platform veya pencere sonrası yeni cihaz → yetkili onayı
export async function deviceGate(owner, user, m, first) {
  if (rotated(user, m)) return "rot";
  DEV.id = devId();
  const col = collection(db, `users/${owner}/members/${user.uid}/devices`), ref = doc(db, `users/${owner}/members/${user.uid}/devices/${DEV.id}`); let d = null, all = [];
  try { d = await getDoc(ref); } catch {}
  if (d?.exists()) {
    const x = d.data();
    if (x.blocked) return "blocked";
    if (x.ok === false && !x.ap) return "pending";
    return "ok";
  }
  if (!d) return "ok"; // okunamadı (kural yayınlanmamış): girişe dokunma
  try { all = (await getDocs(col)).docs.map(z => z.data()); } catch {}
  const i = devInfo(), now = Date.now(), until = m.linkUntil ? ms(m.linkUntil) : 0, inWin = !until || now <= until;
  const okd = all.filter(z => z.ok !== false || z.ap).sort((a, b) => a.first - b.first), f0 = okd[0];
  let ok = true;
  if (f0 && f0.plat && f0.plat !== i.plat) ok = false;
  else if (!inWin && okd.length) ok = false;
  else if (!i.app && okd.filter(z => !z.app && !z.blocked).length >= HAK[f0?.plat || i.plat]) ok = false;
  try {
    await setDoc(ref, { label: i.label, plat: i.plat, app: i.app, ok, first: now, last: now });
    if (!first || !ok) pushRaw(m.ntfy, { title: ok ? "HSE Verim · Yeni cihaz" : "HSE Verim · Cihaz onayı bekliyor", message: ok ? `${m.name} yeni bir cihazdan girdi (${i.label}). Tanımıyorsanız Ayarlar'dan engelleyin.` : `${m.name} yeni bir cihazdan girmek istiyor (${i.label}). Ayarlar > Misafir Kullanıcılar'dan onaylayın veya engelleyin.`, click: `${location.origin}${location.pathname}`, priority: 4, tags: ["warning"] });
  } catch { return "ok"; }
  return ok ? "ok" : "pending";
}
// Onay bekleme ekranı: yetkili onaylayınca kendiliğinden açılır
export function showPending(owner, uid, onOk, onBlocked) {
  const s = screen();
  s.innerHTML = boxHtml(`<h2 style="margin-bottom:6px">Onay bekleniyor</h2><div class="muted" style="line-height:1.55">Bu bağlantı bu cihazda otomatik açılmıyor. İsteğiniz yetkili kişiye iletildi. Onaylanınca bu ekran kendiliğinden açılır. Sayfayı kapatabilirsiniz.</div>`);
  const off = onSnapshot(doc(db, `users/${owner}/members/${uid}/devices/${DEV.id}`), sn => { const x = sn.data(); if (!x) return; if (x.blocked) { off(); onBlocked?.(); } else if (x.ap) { off(); hideRequest(); onOk(); } }, () => {});
  return off;
}
export function showEnded({ title, text, retry, btn }) {
  const s = screen();
  s.innerHTML = boxHtml(`<h2 style="margin-bottom:6px">${esc(title)}</h2><div class="muted" style="line-height:1.55">${esc(text)}</div>${retry ? `<div class="row" style="margin-top:14px"><button id="gRe">${esc(btn || "Yeniden gir")}</button></div>` : ""}`);
  document.getElementById("gRe")?.addEventListener("click", () => location.reload());
}
export async function pLogin(link) {
  const s = screen(); s.innerHTML = boxHtml(`<div class="muted" style="line-height:1.55">Giriş yapılıyor…</div>`);
  try { await signInWithEmailAndPassword(auth, pEmail(link.ek || link.code), link.code); }
  catch (e) {
    const net = e.code === "auth/network-request-failed";
    showEnded({ title: net ? "Bağlantı hatası" : "Bağlantı geçersiz", text: net ? "İnternet bağlantınızı kontrol edip yeniden deneyin." : "Bu bağlantı geçerli değil veya kapatılmış. Yetkili kişiden yeni bağlantı isteyin.", retry: net });
  }
}
// Ana ekrana eklenince açılış adresi bağlantıyı (anahtarı) taşısın
export async function pinManifest() {
  try {
    const l = document.querySelector('link[rel="manifest"]'); if (!l) return;
    const m = await (await fetch(l.href)).json();
    m.start_url = location.href; m.scope = new URL("./", location.href).href;
    m.icons = (m.icons || []).map(i => ({ ...i, src: new URL(i.src, l.href).href }));
    l.href = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: "application/manifest+json" }));
  } catch {}
}
export function installCard(host, { standalone, hasPrompt, install }) {
  host.querySelector("#instCard")?.remove();
  let k = null; try { k = localStorage.getItem("hse_gk"); } catch {}
  if (standalone || k) return;
  const ua = navigator.userAgent, ios = /iphone|ipad|ipod/i.test(ua), iosSaf = ios && /safari/i.test(ua) && !/crios|fxios|edgios|opios|fban|fbav|instagram|line\/|whatsapp|gsa\//i.test(ua);
  let inner;
  if (iosSaf) inner = `<div class="muted" style="font-size:13px;line-height:1.55"><b>1.</b> Alttaki <b>Paylaş</b> düğmesine basın.<br><b>2.</b> <b>Ana Ekrana Ekle</b>'yi seçin, sonra <b>Ekle</b>.</div><div class="row" style="justify-content:flex-end"><button class="sm" data-ik>Tamam</button></div>`;
  else if (!ios && hasPrompt()) inner = `<div class="muted" style="font-size:13px">Uygulamayı tek dokunuşla açmak için ana ekrana ekleyin.</div><div class="row" style="gap:8px;justify-content:flex-end"><button class="sm sec" data-ik>Sonra</button><button class="sm" data-ii>Kısayolu ekle</button></div>`;
  else return;
  const c = document.createElement("div"); c.id = "instCard"; c.className = "cd"; c.style.gap = "10px"; c.innerHTML = `<h2>Kısayol ekle</h2>${inner}`;
  host.prepend(c);
  c.querySelector("[data-ik]")?.addEventListener("click", () => { try { localStorage.setItem("hse_gk", "1"); } catch {} c.remove(); });
  c.querySelector("[data-ii]")?.addEventListener("click", async () => { await install(); try { localStorage.setItem("hse_gk", "1"); } catch {} c.remove(); });
}
export const ownerUid = () => auth.currentUser?.uid;

// ---------------- Geri bildirim (misafir → sahip) ----------------
const modal = html => { const m = document.createElement("div"); m.className = "mod"; m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:14px">${html}</div>`; document.body.appendChild(m); m.addEventListener("mousedown", e => { if (e.target === m) m.remove(); }); return m; };
export function feedbackDialog() {
  const m = modal(`<h2>Geri Bildirim</h2><div class="muted" style="font-size:13.5px;line-height:1.5">Gözlem, öneri veya sorununuzu yazın; yetkili kullanıcıya iletilir.</div>
    <textarea id="fbTxt" class="inp" rows="5" maxlength="1000" placeholder="Mesajınız" style="height:auto;resize:vertical"></textarea>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="sec" data-x>Vazgeç</button><button data-s>Gönder</button></div>`);
  m.querySelector("[data-x]").onclick = () => m.remove();
  const t = m.querySelector("#fbTxt"); t.focus();
  m.querySelector("[data-s]").onclick = async e => {
    const text = t.value.trim(); if (!text) { toast("Mesaj yazın."); return; }
    e.target.disabled = true;
    try {
      if (!GC.owner || !GC.uid) throw new Error("oturum yok");
      await setDoc(doc(db, `users/${GC.owner}/feedback/${GC.uid}_${Date.now().toString(36)}`), { gid: GC.uid, name: GC.name || "", text, at: Date.now(), read: false });
    } catch (er) { e.target.disabled = false; toast("Gönderilemedi: " + (er.message || er)); return; }
    pushRaw(GC.ntfy, { title: "HSE Verim · Geri bildirim", message: `${GC.name}: ${text.slice(0, 140)}`, click: `${location.origin}${location.pathname}`, priority: 3, tags: ["speech_balloon"] });
    m.remove(); toast("Geri bildiriminiz iletildi.");
  };
}
export const watchFeedback = (ownerUid, cb) => onSnapshot(collection(db, `users/${ownerUid}/feedback`), snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.at - a.at)), () => {});
export async function inboxDialog(ownerUid, list, onChange) {
  const un = list.filter(x => !x.read).length;
  const paint = () => {
    m.querySelector("#mbBody").innerHTML = list.map(x => `<div class="it" style="gap:10px;flex-direction:column;align-items:stretch"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>${esc(x.name || "Misafir")}${x.read ? "" : ' <span class="tag" style="background:#FBE9C6;color:#6B3F00">Yeni</span>'}</b><span class="muted" style="font-size:12.5px;flex:0 0 auto">${ago(x.at)}</span></div>
      <div style="white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55">${esc(x.text)}</div>
      <div class="row" style="justify-content:flex-end"><button class="sm sec" data-d="${x.id}" style="color:#B3261E;border-color:#B3261E">Sil</button></div></div>`).join("") || '<span class="muted">Henüz mesaj yok.</span>';
    m.querySelectorAll("[data-d]").forEach(b => b.onclick = async () => { await deleteDoc(doc(db, `users/${ownerUid}/feedback/${b.dataset.d}`)).catch(() => {}); list = list.filter(x => x.id !== b.dataset.d); paint(); onChange?.(); });
  };
  const m = modal(`<h2>Mesaj Kutusu</h2><div class="muted" style="font-size:13.5px">${un ? `<b>${un} adet</b> geri bildirim mesajınız var.` : (list.length ? "Tüm mesajlar okundu." : "Yeni mesaj yok.")}</div>
    <div class="col1" style="gap:8px;max-height:55vh;overflow:auto" id="mbBody"></div><div class="row" style="justify-content:flex-end"><button class="sec" data-x>Kapat</button></div>`);
  m.querySelector("[data-x]").onclick = () => m.remove();
  paint();
  await Promise.all(list.filter(x => !x.read).map(x => updateDoc(doc(db, `users/${ownerUid}/feedback/${x.id}`), { read: true }).catch(() => {})));
}

// ---- Fabrika arşivi: misafir erişimini askıya alma ve geri açma ----
// Arşivlenen fabrika üyenin factories listesinden çıkarılır (Firestore kuralları buna bakar) ve üyede arc[] notu bırakılır; misafir bu notu görür.
const withoutFid = (arr, fid) => (arr || []).filter(x => x !== fid);
const pinOf = async (o, uid) => { try { const p = await getDoc(PIN(o, uid)); return p.exists() ? p : null; } catch { return null; } };
// Bu fabrikada şu an aktif olan misafir sayısı
export async function activeCount(ownerUid, fid) {
  const s = await getDocs(collection(db, `users/${ownerUid}/members`));
  return s.docs.filter(d => (d.data().factories || []).includes(fid) && isLive(d.data())).length;
}
// Fabrikayı tüm misafirlerden çıkarır. note=true ise misafire "arşivlendi" notu bırakır. Askıya alınırken aktif olanları [{uid,name}] döner
export async function suspendFactory(ownerUid, fid, fname, note = true) {
  const out = [], s = await getDocs(collection(db, `users/${ownerUid}/members`));
  for (const d of s.docs) {
    const m = d.data(); if (!(m.factories || []).includes(fid)) continue;
    const up = { factories: withoutFid(m.factories, fid) };
    if (note) up.arc = [...(m.arc || []).filter(a => a.fid !== fid), { fid, name: fname, at: Date.now() }];
    await updateDoc(d.ref, up);
    const p = await pinOf(ownerUid, d.id); if (p && (p.data().factories || []).includes(fid)) await updateDoc(p.ref, { factories: withoutFid(p.data().factories, fid) });
    if (isLive(m)) out.push({ uid: d.id, name: m.name || "" });
  }
  return out;
}
// Arşivden çıkarırken: askıya alınanlardan hâlâ aktif olanlar (üyelik duruyor, durdurulmamış/süresi dolmamış, bağlantısı kapatılmamış)
export async function resumable(ownerUid, susp) {
  const out = [];
  for (const x of susp || []) {
    const m = await getMember(ownerUid, x.uid); if (!isLive(m)) continue;
    const p = await pinOf(ownerUid, x.uid); if (p?.data().closed) continue;
    out.push({ uid: x.uid, name: m.name || x.name || "" });
  }
  return out;
}
// grant: erişimi geri açılacak uid'ler; all: askıya alınan tüm uid'ler (hepsinden arşiv notu kalkar)
export async function resumeFactory(ownerUid, fid, grant, all) {
  for (const uid of all) {
    const m = await getMember(ownerUid, uid); if (!m) continue;
    const up = { arc: (m.arc || []).filter(a => a.fid !== fid) };
    if (grant.includes(uid)) up.factories = [...new Set([...(m.factories || []), fid])];
    await updateDoc(MEM(ownerUid, uid), up);
    if (grant.includes(uid)) { const p = await pinOf(ownerUid, uid); if (p) await updateDoc(p.ref, { factories: [...new Set([...(p.data().factories || []), fid])] }); }
  }
}
// Misafir tarafı: hiç fabrikası kalmadı ve arşivlenen fabrika notu var → uyarı metni
export const archivedNote = m => (m && !(m.factories || []).length && (m.arc || []).length ? { title: m.arc[m.arc.length - 1].name || "Fabrika", text: "Bu fabrika yetkili tarafından arşive kaldırılmıştır. Erişiminiz askıya alındı. Bilgi için yetkili ile iletişime geçin." } : null);
