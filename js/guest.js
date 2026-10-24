// Misafir kullanıcı: davet bağlantısı → ad / bölüm ile onay isteği → sahibin onayı (süresiz / 24 saat) → fabrika bazlı erişim
// Veri yolları (hepsi sahibin hesabı altında):
//   users/{sahip}/invites/{kod}        davet (e-posta ayarı kopyası)
//   users/{sahip}/guestReqs/{misafirUid}  onay isteği {gid, code, name, unit, status, at}
//   users/{sahip}/members/{misafirUid}    onaylı üye {name, unit, factories[], mode, expires|null}
import { auth, db, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot, signInAnonymously } from "./firebase.js?v=20261022z";
import { esc, toast, confirmBox } from "./ui.js?v=20261022z";

const Q = new URLSearchParams(location.search);
export const linkInfo = () => {
  const m = Q.get("misafir"); if (m && m.includes(".")) { const [owner, code] = m.split("."); return { type: "guest", owner, code }; }
  const o = Q.get("onay"); if (o) return { type: "approve", gid: o };
  const a = Q.get("denetim"); if (a && a.split(".").length === 4) { const [fid, year, month, dept] = a.split("."); return { type: "audit", fid, year, month, dept }; }
  return null;
};
export const clearLink = () => { try { history.replaceState(null, "", location.pathname + location.hash); } catch {} };
export const storedOwner = () => { try { return localStorage.getItem("hse_gowner"); } catch { return null; } };
export const storeOwner = o => { try { o ? localStorage.setItem("hse_gowner", o) : localStorage.removeItem("hse_gowner"); } catch {} };

const ms = x => (x == null ? null : x.toMillis ? x.toMillis() : x instanceof Date ? x.getTime() : (typeof x === "string" ? Date.parse(x) : +x));
export const isLive = m => !!m && (m.expires == null || ms(m.expires) > Date.now());
export const leftText = m => {
  if (!m) return "";
  if (m.expires == null) return "Süresiz";
  const d = ms(m.expires) - Date.now(); if (d <= 0) return "Süresi doldu";
  const h = Math.floor(d / 36e5), mi = Math.floor((d % 36e5) / 6e4);
  return h ? `${h} sa ${mi} dk kaldı` : `${mi} dk kaldı`;
};
const ago = t => new Date(t).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const REQ = (o, g) => doc(db, `users/${o}/guestReqs/${g}`), MEM = (o, g) => doc(db, `users/${o}/members/${g}`);
export const getMember = async (o, g) => { try { const d = await getDoc(MEM(o, g)); return d.exists() ? d.data() : null; } catch { return null; } };
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
  const S = await import("./store.js?v=20261022z"), n = normName(name);
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
  const S = await import("./store.js?v=20261022z"); let n = 0;
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
        await setDoc(MEM(ownerUid, gid), { ntfy: cg?.exists() ? cg.data().ntfy || null : null, name: nm, unit: req.unit || "", pid, factories: fs, mode, expires: mode === "24h" ? new Date(Date.now() + 864e5) : null, createdAt: Date.now() });
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
export async function renderSettings(box, { ownerUid, factories, onChange }) {
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
  const pend = reqs.filter(r => r.status === "pending").sort((a, b) => b.at - a.at);
  box.innerHTML = `<div><h2>Misafir Kullanıcılar</h2><div class="muted" style="font-size:13px;line-height:1.5">Saha yardımcınıza veya denetim yapacak yetkiliye bağlantıyı gönderin. Adını ve bölümünü yazıp <b>Onay Gönder</b>'e basar; siz Süresiz veya 24 saatlik onay verirsiniz. Misafir fabrika bazlı yetkilendirilir.</div></div>
    <div class="col1" style="gap:8px"><span class="hd">DAVET BAĞLANTISI</span>
      ${inv ? `<div class="row" style="flex-wrap:nowrap;gap:10px;align-items:stretch"><input class="inp" id="gLink" readonly value="${esc(link)}" onfocus="this.select()" style="flex:1;min-width:0"><button class="sm" id="gClose" aria-label="Davet bağlantısını kapat" title="Davet bağlantısını kapat" style="flex:0 0 32px;width:32px;height:32px;min-height:0;align-self:center;padding:0;background:#B3261E;border-color:#B3261E;color:#fff;font-size:26px;font-weight:400;line-height:1;display:grid;place-items:center;margin-right:6px">×</button></div><div class="row"><button class="sm" id="gCopy">Kopyala</button><button class="sm sec" id="gShare">Paylaş</button><button class="sm sec" id="gRegen">Bağlantıyı yenile</button></div>
        <div class="muted" style="font-size:12.5px">“Yenile” eski bağlantıyı geçersiz kılar, kırmızı × bağlantıyı kapatır (onaylı misafirler etkilenmez).</div>` : `<div><button id="gMake">Davet bağlantısı oluştur</button></div>`}</div>
    ${pend.length ? `<div class="col1" style="gap:8px"><span class="hd">ONAY BEKLEYEN İSTEKLER (${pend.length})</span>${pend.map(r => `<div class="it" style="gap:10px;flex-wrap:wrap"><div class="grow"><b>${esc(r.name)}</b><div class="muted" style="font-size:12.5px">${[esc(r.unit || r.email || ""), ago(r.at)].filter(Boolean).join(" · ")}</div></div><button class="sm" data-rv="${r.id}">İncele ve onayla</button></div>`).join("")}</div>` : ""}
    ${memWrap(mems.length, `${mems.map(m => { const live = isLive(m); return `<div class="it" style="gap:10px;flex-wrap:wrap"><div class="grow"><b>${esc(m.name)}</b> <span class="tag" style="${live ? "" : "background:#FADAD7;color:#8E1B16"}">${esc(leftText(m))}</span>${m.pid ? ` <span class="muted" style="font-size:12px">ID ${esc(m.pid)}</span>` : ""}<div class="muted" style="font-size:12.5px">${[esc(m.unit || m.email || ""), esc(fname(m.factories))].filter(Boolean).join(" · ")}</div></div>
        <div class="row" style="gap:6px"><button class="sm sec" data-perm="${m.id}">Süresiz yap</button><button class="sm sec" data-h24="${m.id}">24 saat</button><button class="sm sec" data-fac="${m.id}">Fabrikalar</button><button class="sm sec" data-rm="${m.id}" style="color:#B3261E;border-color:#B3261E">Erişimi kaldır</button></div></div>`; }).join("") || '<span class="muted">Henüz onaylı misafir yok.</span>'}`)}
    <details ${cfg.ntfy ? "" : "open"}><summary style="cursor:pointer;font-weight:700">Telefon bildirimi (önerilen, ücretsiz)</summary><div class="col1" style="gap:8px;margin-top:10px">
      <div class="muted" style="font-size:12.5px;line-height:1.6">Misafir “Onay Gönder”e bastığında telefonunuza anında bildirim gelir; uygulama kapalı olsa bile. Bildirime dokununca onay ekranı açılır.<br><b>1.</b> Telefonunuza <b>ntfy</b> uygulamasını kurun (Play Store / App Store).<br><b>2.</b> Aşağıdan “Bildirim kodu oluştur”a basın.<br><b>3.</b> ntfy'de <b>+</b> ile aşağıdaki kodu abone olun (sunucu: ntfy.sh).<br><b>4.</b> “Test bildirimi gönder” ile deneyin.</div>
      ${cfg.ntfy ? `<input class="inp" id="gTopic" readonly value="${esc(cfg.ntfy)}" onfocus="this.select()"><div class="row"><button class="sm" id="gTest">Test bildirimi gönder</button><button class="sm sec" id="gTopicCopy">Kodu kopyala</button><button class="sm sec" id="gTopicNew">Kodu yenile</button><button class="sm sec" id="gTopicOff">Kapat</button></div>` : `<div><button class="sm" id="gTopicNew">Bildirim kodu oluştur</button></div>`}</div></details>
    <details><summary style="cursor:pointer;font-weight:700">E-posta bildirimi (isteğe bağlı)</summary><div class="col1" style="gap:8px;margin-top:10px">
      <div class="muted" style="font-size:12.5px;line-height:1.55">Ücretsiz <b>EmailJS</b> hesabıyla e-posta da gönderilebilir. Service ID, Template ID ve Public Key'i girin. Şablonda <code>{{guest_name}}</code>, <code>{{guest_unit}}</code> ve <code>{{approve_link}}</code> değişkenleri kullanılır. Boş bırakırsanız e-posta gitmez.</div>
      <input class="inp" id="gSvc" placeholder="Service ID" value="${esc(cfg.service || "")}"><input class="inp" id="gTpl" placeholder="Template ID" value="${esc(cfg.template || "")}"><input class="inp" id="gKey" placeholder="Public Key" value="${esc(cfg.key || "")}">
      <div><button class="sm" id="gCfg">Kaydet</button></div></div></details>`;
  box.querySelector("#gMemBox")?.addEventListener("toggle", e => { memOpen = e.target.open; });
  const q = s => box.querySelector(s), refresh = () => { renderSettings(box, { ownerUid, factories, onChange }); onChange?.(); };
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
  box.querySelectorAll("[data-rv]").forEach(b => b.onclick = () => approvalDialog(ownerUid, b.dataset.rv, factories, refresh));
  box.querySelectorAll("[data-perm]").forEach(b => b.onclick = async () => { await updateDoc(MEM(ownerUid, b.dataset.perm), { mode: "perm", expires: null }); toast("Erişim süresiz yapıldı."); refresh(); });
  box.querySelectorAll("[data-h24]").forEach(b => b.onclick = async () => { await updateDoc(MEM(ownerUid, b.dataset.h24), { mode: "24h", expires: new Date(Date.now() + 864e5) }); toast("Erişim 24 saat uzatıldı."); refresh(); });
  box.querySelectorAll("[data-rm]").forEach(b => b.onclick = async () => { if (!(await confirmBox("Erişim kaldırılsın mı?", "Bu misafirin erişimi kaldırılır.", "Kaldır", true))) return; await deleteDoc(MEM(ownerUid, b.dataset.rm)); await deleteDoc(REQ(ownerUid, b.dataset.rm)).catch(() => {}); toast("Erişim kaldırıldı."); refresh(); });
  box.querySelectorAll("[data-fac]").forEach(b => b.onclick = () => {
    const m0 = mems.find(x => x.id === b.dataset.fac), md = document.createElement("div"); md.className = "mod";
    md.innerHTML = `<div class="mbox" style="gap:12px"><h2>${esc(m0.name)} · Fabrikalar</h2>${factories.map(f => `<label style="display:flex;align-items:center;gap:10px;font-weight:600"><input type="checkbox" data-f="${f.id}" ${(m0.factories || []).includes(f.id) ? "checked" : ""} style="width:20px;height:20px"> ${esc(f.name)}</label>`).join("")}
      <div class="row" style="justify-content:flex-end"><button class="sec" data-x>İptal</button><button data-s>Kaydet</button></div></div>`;
    document.body.appendChild(md); md.querySelector("[data-x]").onclick = () => md.remove();
    md.querySelector("[data-s]").onclick = async () => { const fs = [...md.querySelectorAll("[data-f]:checked")].map(x => x.dataset.f); if (!fs.length) return toast("Fabrika bulunamadı."); await updateDoc(MEM(ownerUid, b.dataset.fac), { factories: fs }); md.remove(); toast("Fabrikalar güncellendi."); refresh(); };
  });
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
