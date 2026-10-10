// Misafir kullanıcı: davet bağlantısı → ad/e-posta ile onay isteği → sahibin onayı (süresiz / 24 saat) → fabrika bazlı erişim
// Veri yolları (hepsi sahibin hesabı altında):
//   users/{sahip}/invites/{kod}        davet (e-posta ayarı kopyası)
//   users/{sahip}/guestReqs/{misafirUid}  onay isteği {gid, code, name, email, status, at}
//   users/{sahip}/members/{misafirUid}    onaylı üye {name, email, factories[], mode, expires|null}
import { auth, db, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot, signInAnonymously } from "./firebase.js?v=20261010o";
import { esc, toast } from "./ui.js?v=20261010o";

const Q = new URLSearchParams(location.search);
export const linkInfo = () => {
  const m = Q.get("misafir"); if (m && m.includes(".")) { const [owner, code] = m.split("."); return { type: "guest", owner, code }; }
  const o = Q.get("onay"); if (o) return { type: "approve", gid: o };
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
  s.innerHTML = boxHtml(`<div class="muted" style="line-height:1.55;margin-bottom:10px">Yetkili kullanıcının gönderdiği bağlantıyla geldiniz. Adınızı ve e-postanızı yazıp <b>Onay Gönder</b>'e basın; yetkili kullanıcı onayladığında bu ekran otomatik olarak açılır. Şifre gerekmez.</div>
    ${note ? `<div class="warn" style="margin-bottom:10px">${esc(note)}</div>` : ""}
    <label>Ad Soyad</label><input id="gName" autocomplete="name" value="${esc(prev.n || "")}" required>
    <label>E-posta</label><input id="gMail" type="email" autocomplete="email" value="${esc(prev.e || "")}" required>
    <div class="err" id="gErr"></div>
    <div class="row"><button type="button" id="gSend">Onay Gönder</button></div>`);
  const err = t => { document.getElementById("gErr").textContent = t; };
  document.getElementById("gSend").onclick = async () => {
    const name = document.getElementById("gName").value.trim(), email = document.getElementById("gMail").value.trim();
    if (name.length < 3) return err("Ad soyadınızı yazın.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return err("Geçerli bir e-posta yazın.");
    err(""); sending = true; document.getElementById("gSend").disabled = true;
    try {
      if (!auth.currentUser) await signInAnonymously(auth);
      const gid = auth.currentUser.uid;
      const inv = await getDoc(doc(db, `users/${owner}/invites/${code}`));
      if (!inv.exists()) throw new Error("Davet bağlantısı geçersiz veya yenilenmiş. Yetkili kullanıcıdan yeni bağlantı isteyin.");
      const body = { gid, code, name, email, status: "pending", at: Date.now() };
      const ex = await getDoc(REQ(owner, gid));
      if (ex.exists()) await updateDoc(REQ(owner, gid), body); else await setDoc(REQ(owner, gid), body);
      try { localStorage.setItem("hse_gname", JSON.stringify({ n: name, e: email })); } catch {}
      storeOwner(owner);
      const link = `${location.origin}${location.pathname}?onay=${gid}`;
      const [m1, m2] = await Promise.all([sendMail(inv.data().emailjs, { guest_name: name, guest_email: email, approve_link: link }), sendPush(inv.data().ntfy, { name, email, link })]);
      const sent = m1 || m2;
      sending = false; waiting({ owner, code, gid, sent }, onApproved);
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
async function sendPush(topic, { name, email, link }) {
  if (!topic) return false;
  try {
    const r = await fetch("https://ntfy.sh/", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, title: "HSE Verim · Misafir onay isteği", message: `${name} (${email}) erişim istiyor. Onaylamak için dokunun.`, click: link, priority: 4, tags: ["bust_in_silhouette"] }) });
    return r.ok;
  } catch { return false; }
}

// Onay bekleme ekranı: istek durumunu canlı izler
export function waiting({ owner, gid, code, sent }, onApproved) {
  const s = screen();
  s.innerHTML = boxHtml(`<h2 style="margin-bottom:6px">Onay bekleniyor</h2>
    <div class="muted" style="line-height:1.55">İsteğiniz yetkili kullanıcıya iletildi${sent ? " (bildirim gönderildi)" : " (bildirim ayarı kapalı; yetkili kullanıcı uygulamada isteğinizi görür)"}. Onaylandığında bu ekran kendiliğinden açılır. Bu sayfayı kapatabilirsiniz; aynı cihazdan tekrar açtığınızda kaldığınız yerden devam edersiniz.</div>
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
export async function approvalDialog(ownerUid, gid, factories, done) {
  let req = null; try { const d = await getDoc(REQ(ownerUid, gid)); req = d.exists() ? d.data() : null; } catch {}
  const m = document.createElement("div"); m.className = "mod";
  const close = () => m.remove();
  if (!req) { m.innerHTML = `<div class="mbox" style="gap:14px"><h2>Misafir isteği bulunamadı</h2><div class="muted">İstek silinmiş olabilir veya başka bir hesapla giriş yapmış olabilirsiniz.</div><div class="row" style="justify-content:flex-end"><button class="sec" data-x>Kapat</button></div></div>`; document.body.appendChild(m); m.querySelector("[data-x]").onclick = close; return; }
  const done0 = req.status !== "pending";
  m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:14px"><h2>Misafir erişim isteği</h2>
    <div style="line-height:1.6"><b style="font-size:17px">${esc(req.name)}</b><br><span class="muted">${esc(req.email)} · ${ago(req.at)}</span></div>
    ${done0 ? `<div class="warn">Bu istek zaten işlendi: ${req.status === "approved" ? "onaylandı" : "reddedildi"}. İsterseniz yeniden onay verebilirsiniz.</div>` : ""}
    <div class="col1" style="gap:8px"><span class="hd">ERİŞİM VERİLECEK FABRİKALAR</span>
      ${factories.map(f => `<label style="display:flex;align-items:center;gap:10px;font-weight:600;cursor:pointer"><input type="checkbox" data-f="${f.id}" checked style="width:20px;height:20px"> ${esc(f.name)}</label>`).join("") || '<span class="muted">Fabrika yok</span>'}</div>
    <div class="muted" style="font-size:12.5px;line-height:1.5">Misafir; veri girişi yapar, İSG denetimini yalnızca kaydeder (tamamlama, silme, kurulum ve ayarlar yetkisi yoktur), raporları görür ve PDF alabilir.</div>
    <div class="col1" style="gap:8px"><button data-ok="perm">Süresiz onay</button><button class="sec" data-ok="24h">24 saatlik onay</button><button class="sec" data-ok="no" style="color:#B3261E;border-color:#B3261E">İptal (reddet)</button></div></div>`;
  document.body.appendChild(m);
  m.querySelectorAll("[data-ok]").forEach(b => b.onclick = async () => {
    const mode = b.dataset.ok; m.querySelectorAll("button").forEach(x => (x.disabled = true));
    try {
      if (mode === "no") { await updateDoc(REQ(ownerUid, gid), { status: "rejected", decidedAt: Date.now() }); toast("İstek reddedildi."); }
      else {
        const fs = [...m.querySelectorAll("[data-f]:checked")].map(x => x.dataset.f);
        if (!fs.length) { toast("En az bir fabrika seçin."); m.querySelectorAll("button").forEach(x => (x.disabled = false)); return; }
        await setDoc(MEM(ownerUid, gid), { name: req.name, email: req.email, factories: fs, mode, expires: mode === "24h" ? new Date(Date.now() + 864e5) : null, createdAt: Date.now() });
        await updateDoc(REQ(ownerUid, gid), { status: "approved", decidedAt: Date.now() });
        toast(`${req.name} için ${mode === "24h" ? "24 saatlik" : "süresiz"} erişim onaylandı.`);
      }
      close(); done?.();
    } catch (e) { toast("Kaydedilemedi: " + (e.message || e)); m.querySelectorAll("button").forEach(x => (x.disabled = false)); }
  });
  m.addEventListener("mousedown", e => { if (e.target === m) close(); });
}

// ---------------- Sahip: Ayarlar'daki "Misafir Kullanıcılar" bölümü ----------------
const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), b => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
export async function renderSettings(box, { ownerUid, factories, onChange }) {
  const invs = await getDocs(collection(db, `users/${ownerUid}/invites`)).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []);
  const cfgD = await getDoc(doc(db, `users/${ownerUid}/meta/guestcfg`)).catch(() => null), cfg = cfgD?.exists() ? cfgD.data() : {};
  const reqs = await getDocs(collection(db, `users/${ownerUid}/guestReqs`)).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []);
  const mems = await getDocs(collection(db, `users/${ownerUid}/members`)).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []);
  const inv = invs[0], link = inv ? `${location.origin}${location.pathname}?misafir=${ownerUid}.${inv.id}` : "";
  const fname = ids => (ids || []).map(i => factories.find(f => f.id === i)?.name || "—").join(", ");
  const pend = reqs.filter(r => r.status === "pending").sort((a, b) => b.at - a.at);
  box.innerHTML = `<div><h2>Misafir Kullanıcılar</h2><div class="muted" style="font-size:13px;line-height:1.5">Saha yardımcınıza veya denetim yapacak yetkiliye bağlantıyı gönderin. Adını ve e-postasını yazıp <b>Onay Gönder</b>'e basar; siz Süresiz veya 24 saatlik onay verirsiniz. Misafir fabrika bazlı yetkilendirilir.</div></div>
    <div class="col1" style="gap:8px"><span class="hd">DAVET BAĞLANTISI</span>
      ${inv ? `<div class="row" style="flex-wrap:nowrap;gap:10px;align-items:center"><input class="inp" id="gLink" readonly value="${esc(link)}" onfocus="this.select()" style="flex:1;min-width:0"><button class="sm" id="gClose" aria-label="Davet bağlantısını kapat" title="Davet bağlantısını kapat" style="flex:0 0 44px;width:44px;height:44px;padding:0;background:#B3261E;border-color:#B3261E;color:#fff;font-size:22px;line-height:1;margin-right:6px">×</button></div><div class="row"><button class="sm" id="gCopy">Kopyala</button><button class="sm sec" id="gShare">Paylaş</button><button class="sm sec" id="gRegen">Bağlantıyı yenile</button></div>
        <div class="muted" style="font-size:12.5px">“Yenile” eski bağlantıyı geçersiz kılar, kırmızı × bağlantıyı kapatır (onaylı misafirler etkilenmez).</div>` : `<div><button id="gMake">Davet bağlantısı oluştur</button></div>`}</div>
    ${pend.length ? `<div class="col1" style="gap:8px"><span class="hd">ONAY BEKLEYEN İSTEKLER (${pend.length})</span>${pend.map(r => `<div class="it" style="gap:10px;flex-wrap:wrap"><div class="grow"><b>${esc(r.name)}</b><div class="muted" style="font-size:12.5px">${esc(r.email)} · ${ago(r.at)}</div></div><button class="sm" data-rv="${r.id}">İncele ve onayla</button></div>`).join("")}</div>` : ""}
    <div class="col1" style="gap:8px"><span class="hd">MİSAFİRLER (${mems.length})</span>
      ${mems.map(m => { const live = isLive(m); return `<div class="it" style="gap:10px;flex-wrap:wrap"><div class="grow"><b>${esc(m.name)}</b> <span class="tag" style="${live ? "" : "background:#FADAD7;color:#8E1B16"}">${esc(leftText(m))}</span><div class="muted" style="font-size:12.5px">${esc(m.email)} · ${esc(fname(m.factories))}</div></div>
        <div class="row" style="gap:6px"><button class="sm sec" data-perm="${m.id}">Süresiz yap</button><button class="sm sec" data-h24="${m.id}">24 saat</button><button class="sm sec" data-fac="${m.id}">Fabrikalar</button><button class="sm sec" data-rm="${m.id}" style="color:#B3261E;border-color:#B3261E">Erişimi kaldır</button></div></div>`; }).join("") || '<span class="muted">Henüz onaylı misafir yok.</span>'}</div>
    <details ${cfg.ntfy ? "" : "open"}><summary style="cursor:pointer;font-weight:700">Telefon bildirimi (önerilen, ücretsiz)</summary><div class="col1" style="gap:8px;margin-top:10px">
      <div class="muted" style="font-size:12.5px;line-height:1.6">Misafir “Onay Gönder”e bastığında telefonunuza anında bildirim gelir; uygulama kapalı olsa bile. Bildirime dokununca onay ekranı açılır.<br><b>1.</b> Telefonunuza <b>ntfy</b> uygulamasını kurun (Play Store / App Store).<br><b>2.</b> Aşağıdan “Bildirim kodu oluştur”a basın.<br><b>3.</b> ntfy'de <b>+</b> ile aşağıdaki kodu abone olun (sunucu: ntfy.sh).<br><b>4.</b> “Test bildirimi gönder” ile deneyin.</div>
      ${cfg.ntfy ? `<input class="inp" id="gTopic" readonly value="${esc(cfg.ntfy)}" onfocus="this.select()"><div class="row"><button class="sm" id="gTest">Test bildirimi gönder</button><button class="sm sec" id="gTopicCopy">Kodu kopyala</button><button class="sm sec" id="gTopicNew">Kodu yenile</button><button class="sm sec" id="gTopicOff">Kapat</button></div>` : `<div><button class="sm" id="gTopicNew">Bildirim kodu oluştur</button></div>`}</div></details>
    <details><summary style="cursor:pointer;font-weight:700">E-posta bildirimi (isteğe bağlı)</summary><div class="col1" style="gap:8px;margin-top:10px">
      <div class="muted" style="font-size:12.5px;line-height:1.55">Ücretsiz <b>EmailJS</b> hesabıyla e-posta da gönderilebilir. Service ID, Template ID ve Public Key'i girin. Şablonda <code>{{guest_name}}</code>, <code>{{guest_email}}</code> ve <code>{{approve_link}}</code> değişkenleri kullanılır. Boş bırakırsanız e-posta gitmez.</div>
      <input class="inp" id="gSvc" placeholder="Service ID" value="${esc(cfg.service || "")}"><input class="inp" id="gTpl" placeholder="Template ID" value="${esc(cfg.template || "")}"><input class="inp" id="gKey" placeholder="Public Key" value="${esc(cfg.key || "")}">
      <div><button class="sm" id="gCfg">Kaydet</button></div></div></details>`;
  const q = s => box.querySelector(s), refresh = () => { renderSettings(box, { ownerUid, factories, onChange }); onChange?.(); };
  const mk = async () => {
    for (const i of invs) await deleteDoc(doc(db, `users/${ownerUid}/invites/${i.id}`)).catch(() => {});
    const c = cfgD?.exists() ? cfg : {}; await setDoc(doc(db, `users/${ownerUid}/invites/${rnd()}`), { createdAt: Date.now(), ntfy: c.ntfy || null, emailjs: c.service && c.template && c.key ? { service: c.service, template: c.template, key: c.key } : null });
    refresh();
  };
  q("#gMake") && (q("#gMake").onclick = mk);
  q("#gRegen") && (q("#gRegen").onclick = () => { if (confirm("Eski davet bağlantısı geçersiz olacak. Yenilensin mi?")) mk(); });
  q("#gClose") && (q("#gClose").onclick = async () => { if (!confirm("Davet bağlantısı kapatılsın mı? Bağlantı çalışmaz; onaylı misafirler etkilenmez. İstediğinizde yeniden oluşturabilirsiniz.")) return; for (const i of invs) await deleteDoc(doc(db, `users/${ownerUid}/invites/${i.id}`)).catch(() => {}); toast("Davet bağlantısı kapatıldı."); refresh(); });
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
  q("#gTopicNew") && (q("#gTopicNew").onclick = () => { if (!cfg.ntfy || confirm("Yeni kod oluşturulunca ntfy'de yeniden abone olmanız gerekir. Devam edilsin mi?")) setTopic("hse-" + rnd() + rnd()); });
  q("#gTopicOff") && (q("#gTopicOff").onclick = () => setTopic(null));
  q("#gTopicCopy") && (q("#gTopicCopy").onclick = async () => { try { await navigator.clipboard.writeText(cfg.ntfy); toast("Kod kopyalandı."); } catch { q("#gTopic").select(); } });
  q("#gTest") && (q("#gTest").onclick = async () => { const ok = await sendPush(cfg.ntfy, { name: "Test Kullanıcı", email: "test@ornek.com", link: location.origin + location.pathname }); toast(ok ? "Test bildirimi gönderildi; telefonunuza gelmesi gerekir." : "Gönderilemedi; internet bağlantısını kontrol edin."); });
  box.querySelectorAll("[data-rv]").forEach(b => b.onclick = () => approvalDialog(ownerUid, b.dataset.rv, factories, refresh));
  box.querySelectorAll("[data-perm]").forEach(b => b.onclick = async () => { await updateDoc(MEM(ownerUid, b.dataset.perm), { mode: "perm", expires: null }); toast("Erişim süresiz yapıldı."); refresh(); });
  box.querySelectorAll("[data-h24]").forEach(b => b.onclick = async () => { await updateDoc(MEM(ownerUid, b.dataset.h24), { mode: "24h", expires: new Date(Date.now() + 864e5) }); toast("Erişim 24 saat uzatıldı."); refresh(); });
  box.querySelectorAll("[data-rm]").forEach(b => b.onclick = async () => { if (!confirm("Bu misafirin erişimi kaldırılsın mı?")) return; await deleteDoc(MEM(ownerUid, b.dataset.rm)); await deleteDoc(REQ(ownerUid, b.dataset.rm)).catch(() => {}); toast("Erişim kaldırıldı."); refresh(); });
  box.querySelectorAll("[data-fac]").forEach(b => b.onclick = () => {
    const m0 = mems.find(x => x.id === b.dataset.fac), md = document.createElement("div"); md.className = "mod";
    md.innerHTML = `<div class="mbox" style="gap:12px"><h2>${esc(m0.name)} · Fabrikalar</h2>${factories.map(f => `<label style="display:flex;align-items:center;gap:10px;font-weight:600"><input type="checkbox" data-f="${f.id}" ${(m0.factories || []).includes(f.id) ? "checked" : ""} style="width:20px;height:20px"> ${esc(f.name)}</label>`).join("")}
      <div class="row" style="justify-content:flex-end"><button class="sec" data-x>İptal</button><button data-s>Kaydet</button></div></div>`;
    document.body.appendChild(md); md.querySelector("[data-x]").onclick = () => md.remove();
    md.querySelector("[data-s]").onclick = async () => { const fs = [...md.querySelectorAll("[data-f]:checked")].map(x => x.dataset.f); if (!fs.length) return toast("En az bir fabrika seçin."); await updateDoc(MEM(ownerUid, b.dataset.fac), { factories: fs }); md.remove(); toast("Fabrikalar güncellendi."); refresh(); };
  });
}
