// Veri katmanı: users/{uid}/factories/{fid}/years/{yıl}/setup/main
import { auth, db, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, query, orderBy, serverTimestamp, onSnapshot } from "./firebase.js?v=20261010t";

const uid = () => auth.currentUser.uid;
// Veri sahibi: misafir kullanıcıda davet eden hesabın uid'si; kendi oturum/profil kayıtları ise her zaman kendi hesabında
let OWN = null, GF = null;
export const setOwner = (o, factories = null) => { OWN = o; GF = factories; };
export const getOwner = () => OWN;
const base = () => `users/${OWN || uid()}`;
const mine = () => `users/${uid()}`;

export async function listFactories() {
  if (GF) { // misafir: yalnızca izin verilen fabrikalar (tek tek okunur)
    const out = await Promise.all(GF.map(async id => { try { const d = await getDoc(doc(db, `${base()}/factories/${id}`)); return d.exists() ? { id, ...d.data() } : null; } catch { return null; } }));
    return out.filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name), "tr"));
  }
  const s = await getDocs(query(collection(db, `${base()}/factories`), orderBy("name")));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function addFactory(name, loc = "") {
  const r = await addDoc(collection(db, `${base()}/factories`), { name, loc, archived: false, createdAt: serverTimestamp() });
  return r.id;
}
export async function renameFactory(id, name) { await updateDoc(doc(db, `${base()}/factories/${id}`), { name }); }
export async function updateFactory(id, data) { await updateDoc(doc(db, `${base()}/factories/${id}`), data); }
// Fabrikayı tüm yıl ve kurulum verileriyle birlikte siler
export async function deleteFactoryDeep(id) {
  for (const y of await listYears(id)) {
    for (const coll of ["isg", "kaza", "konusma", "isbasi", "foto"]) for (const d of await listMonthDocs(id, y, coll)) await deleteDoc(monthRef(id, y, coll, d.id));
    await deleteDoc(setupRef(id, y)).catch(() => {});
    await deleteDoc(doc(db, `${base()}/factories/${id}/years/${y}`));
  }
  await deleteDoc(doc(db, `${base()}/factories/${id}`));
}
export async function setArchived(id, archived) { await updateDoc(doc(db, `${base()}/factories/${id}`), { archived }); }
export async function removeFactory(id) { await deleteDoc(doc(db, `${base()}/factories/${id}`)); }

export async function listYears(fid) {
  const s = await getDocs(collection(db, `${base()}/factories/${fid}/years`));
  return s.docs.map(d => d.id).sort();
}
export async function addYear(fid, year) {
  await setDoc(doc(db, `${base()}/factories/${fid}/years/${year}`), { year: Number(year), createdAt: serverTimestamp() });
}

// Kurulum (bölümler + parametreler) tek belgede: .../years/{yıl}/setup/main
const setupRef = (fid, y) => doc(db, `${base()}/factories/${fid}/years/${y}/setup/main`);
// Kimliği olmayan eski bölüm kayıtlarına kalıcı (deterministik) kimlik verir ve geri yazar
const hash = t => { let h = 0; for (const c of t) h = (h * 31 + c.codePointAt(0)) >>> 0; return h.toString(36); };
export async function getSetup(fid, y) {
  const d = await getDoc(setupRef(fid, y));
  if (!d.exists()) return null;
  const data = d.data();
  if (data.rows?.some(r => !r.id)) {
    data.rows = data.rows.map((r, i) => (r.id ? r : { ...r, id: `d${i}_${hash(String(r.name || ""))}` }));
    await setDoc(setupRef(fid, y), { ...data, updatedAt: serverTimestamp() }).catch(() => {});
  }
  return data;
}
export async function saveSetup(fid, y, data) { await setDoc(setupRef(fid, y), { ...data, updatedAt: serverTimestamp() }); }

// Aylık veri: .../years/{yıl}/{koleksiyon}/{belgeId}
const monthRef = (fid, y, coll, id) => doc(db, `${base()}/factories/${fid}/years/${y}/${coll}/${id}`);
export async function getMonthDoc(fid, y, coll, id) { const d = await getDoc(monthRef(fid, y, coll, id)); return d.exists() ? d.data() : null; }
export async function saveMonthDoc(fid, y, coll, id, data) { await setDoc(monthRef(fid, y, coll, id), { ...data, updatedAt: serverTimestamp() }); }
export async function listMonthDocs(fid, y, coll) { const s = await getDocs(collection(db, `${base()}/factories/${fid}/years/${y}/${coll}`)); return s.docs.map(d => ({ id: d.id, ...d.data() })); }

// Seçili fabrika/yıl bu cihazda hatırlanır
export const pref = {
  get: k => { try { return localStorage.getItem("hse_" + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem("hse_" + k, v); } catch {} }
};

// Profil
export async function getProfile() { const d = await getDoc(doc(db, `${mine()}/meta/profile`)); return d.exists() ? d.data() : {}; }
export async function saveProfile(data) { await setDoc(doc(db, `${mine()}/meta/profile`), data, { merge: true }); }

// Oturumlar / cihazlar: users/{uid}/sessions/{deviceId}
export function deviceId() {
  let id = pref.get("device");
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)); pref.set("device", id); }
  return id;
}
export function deviceInfo() {
  const ua = navigator.userAgent;
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox/.test(ua) ? "Firefox" : /Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "Tarayıcı";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Bilinmiyor";
  const kind = /Mobi|Android|iPhone/.test(ua) ? "Telefon" : /iPad|Tablet/.test(ua) ? "Tablet" : "Bilgisayar";
  return { name: `${br} · ${os}`, kind };
}
const sessRef = id => doc(db, `${mine()}/sessions/${id}`);
export const touchSession = (login = false) => setDoc(sessRef(deviceId()), { ...deviceInfo(), lastSeen: Date.now(), ...(login ? { revoked: false } : {}) }, { merge: true });
export const endSession = () => deleteDoc(sessRef(deviceId()));
export async function listSessions() {
  const s = await getDocs(collection(db, `${mine()}/sessions`));
  return s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.revoked).sort((a, b) => b.lastSeen - a.lastSeen);
}
// Ana (yetkili) cihaz: users/{uid}/meta/primary {deviceId, name, since}. Diğer oturumlar misafirdir.
const primRef = () => doc(db, `${mine()}/meta/primary`);
export async function getPrimary() { const d = await getDoc(primRef()); return d.exists() ? d.data() : null; }
export async function setPrimary(id, name) { await setDoc(primRef(), { deviceId: id, name: name || "", since: Date.now() }); }
// Girişte: ana cihaz yoksa ya da ana cihazın oturumu kapanmışsa bu cihaz ana cihaz olur
export async function ensurePrimary() {
  const me = deviceId(), p = await getPrimary();
  if (p?.deviceId === me) return true;
  if (p?.deviceId) { const s = await getDoc(sessRef(p.deviceId)); if (s.exists() && !s.data().revoked) return false; }
  await setPrimary(me, deviceInfo().name); return true;
}
export async function isPrimary() { const p = await getPrimary(); return p?.deviceId === deviceId(); }
export async function revokeSession(id) {
  if (!(await isPrimary())) throw new Error("Diğer oturumları yalnızca ana cihaz kapatabilir.");
  const p = await getPrimary(); if (p?.deviceId === id) throw new Error("Ana cihazın oturumu kapatılamaz. Önce ana cihazı değiştirin.");
  await setDoc(sessRef(id), { revoked: true }, { merge: true });
}
export const watchSession = cb => onSnapshot(sessRef(deviceId()), snap => cb(snap.data()));

// Yedek: tüm fabrikalar, yıllar, kurulumlar ve aylık kayıtlar tek JSON olarak
export async function exportAll() {
  const out = { app: "HSE Verim Modülü", format: 1, exportedAt: new Date().toISOString(), profile: await getProfile().catch(() => ({})), factories: [] };
  const fs = await getDocs(collection(db, `${base()}/factories`));
  for (const f of fs.docs) {
    const fo = { id: f.id, ...f.data(), years: [] }, ys = await listYears(f.id);
    for (const y of ys) {
      const yo = { year: y, setup: await getSetup(f.id, y).catch(() => null) };
      for (const c of ["isg", "kaza", "konusma", "isbasi"]) yo[c] = await listMonthDocs(f.id, y, c);
      fo.years.push(yo);
    }
    out.factories.push(fo);
  }
  return out;
}

// Fotoğraflar (küçültülmüş JPEG, base64): .../years/{yıl}/foto/{id}
const fotoRef = (fid, y, id) => doc(db, `${base()}/factories/${fid}/years/${y}/foto/${id}`);
export const savePhoto = (fid, y, id, d) => setDoc(fotoRef(fid, y, id), { d, at: Date.now() });
export async function getPhoto(fid, y, id) { const s = await getDoc(fotoRef(fid, y, id)); return s.exists() ? s.data().d : null; }
export const deletePhoto = (fid, y, id) => deleteDoc(fotoRef(fid, y, id));

// Yıl yönetimi: arşivleme ve kalıcı silme
export async function listYearsMeta(fid) {
  const s = await getDocs(collection(db, `${base()}/factories/${fid}/years`));
  return s.docs.map(d => ({ id: d.id, archived: !!(d.data() || {}).archived })).sort((a, b) => (a.id < b.id ? -1 : 1));
}
export const setYearArchived = (fid, y, archived) => setDoc(doc(db, `${base()}/factories/${fid}/years/${y}`), { year: Number(y), archived }, { merge: true });
export async function yearCounts(fid, y) {
  let n = 0; for (const coll of ["isg", "kaza", "konusma", "isbasi"]) n += (await listMonthDocs(fid, y, coll)).length; return n;
}
export async function deleteYearDeep(fid, y) {
  for (const coll of ["isg", "kaza", "konusma", "isbasi", "foto"]) for (const d of await listMonthDocs(fid, y, coll)) await deleteDoc(monthRef(fid, y, coll, d.id));
  await deleteDoc(setupRef(fid, y)).catch(() => {});
  await deleteDoc(doc(db, `${base()}/factories/${fid}/years/${y}`));
}
