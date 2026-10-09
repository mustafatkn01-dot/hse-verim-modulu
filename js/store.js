// Veri katmanı: users/{uid}/factories/{fid}/years/{yıl}/setup/main
import { auth, db, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, query, orderBy, serverTimestamp, onSnapshot } from "./firebase.js";

const uid = () => auth.currentUser.uid;
const base = () => `users/${uid()}`;

export async function listFactories() {
  const s = await getDocs(query(collection(db, `${base()}/factories`), orderBy("name")));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function addFactory(name, loc = "") {
  const r = await addDoc(collection(db, `${base()}/factories`), { name, loc, archived: false, createdAt: serverTimestamp() });
  return r.id;
}
export async function renameFactory(id, name) { await updateDoc(doc(db, `${base()}/factories/${id}`), { name }); }
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
export async function getSetup(fid, y) { const d = await getDoc(setupRef(fid, y)); return d.exists() ? d.data() : null; }
export async function saveSetup(fid, y, data) { await setDoc(setupRef(fid, y), { ...data, updatedAt: serverTimestamp() }); }

// Seçili fabrika/yıl bu cihazda hatırlanır
export const pref = {
  get: k => { try { return localStorage.getItem("hse_" + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem("hse_" + k, v); } catch {} }
};

// Profil
export async function getProfile() { const d = await getDoc(doc(db, `${base()}/meta/profile`)); return d.exists() ? d.data() : {}; }
export async function saveProfile(data) { await setDoc(doc(db, `${base()}/meta/profile`), data, { merge: true }); }

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
const sessRef = id => doc(db, `${base()}/sessions/${id}`);
export const touchSession = (login = false) => setDoc(sessRef(deviceId()), { ...deviceInfo(), lastSeen: Date.now(), ...(login ? { revoked: false } : {}) }, { merge: true });
export const endSession = () => deleteDoc(sessRef(deviceId()));
export async function listSessions() {
  const s = await getDocs(collection(db, `${base()}/sessions`));
  return s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.revoked).sort((a, b) => b.lastSeen - a.lastSeen);
}
export const revokeSession = id => setDoc(sessRef(id), { revoked: true }, { merge: true });
export const watchSession = cb => onSnapshot(sessRef(deviceId()), snap => cb(snap.data()));
