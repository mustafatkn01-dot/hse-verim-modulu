// Veri katmanı: users/{uid}/factories/{fid}/years/{yıl}/departments/{did}
import { auth, db, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, query, orderBy, serverTimestamp } from "./firebase.js";

const uid = () => auth.currentUser.uid;
const base = () => `users/${uid()}`;

export async function listFactories() {
  const s = await getDocs(query(collection(db, `${base()}/factories`), orderBy("name")));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function addFactory(name) {
  const r = await addDoc(collection(db, `${base()}/factories`), { name, createdAt: serverTimestamp() });
  return r.id;
}
export async function renameFactory(id, name) { await updateDoc(doc(db, `${base()}/factories/${id}`), { name }); }
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
