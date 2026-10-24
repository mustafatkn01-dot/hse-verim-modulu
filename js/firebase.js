// Firebase başlatma (web config herkese açıktır; güvenlik Firestore kurallarındadır)
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, setPersistence, browserLocalPersistence,
  sendSignInLinkToEmail, EmailAuthProvider, reauthenticateWithCredential, signInWithEmailLink, signInAnonymously, updatePassword } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc,
  query, orderBy, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import * as FSX from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD8YdxVO452s1ETlqqpsiZcVTeKzxCZ2j0",
  authDomain: "hse-verim-modulu.firebaseapp.com",
  projectId: "hse-verim-modulu",
  storageBucket: "hse-verim-modulu.firebasestorage.app",
  messagingSenderId: "443537949210",
  appId: "1:443537949210:web:d701ca271a154d94be87a3"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

// Ek işlevler (toplama sorguları, sayfalama): ad alanı olarak, bir ad bulunamazsa undefined olur
export const FS = FSX;
// Yetkili oturumunu bozmadan ikinci bir uygulama örneğiyle yeni bir (misafir) Auth kullanıcısı oluşturur; uid döner
export async function createAuxUser(email, pw) {
  const a = initializeApp(firebaseConfig, "aux" + Date.now()), au = getAuth(a);
  try { const c = await createUserWithEmailAndPassword(au, email, pw); const uid = c.user.uid; await signOut(au).catch(() => {}); return uid; }
  finally { deleteApp(a).catch(() => {}); }
}
// Misafir hesabının şifresini (= bağlantı anahtarı) değiştirir: eski bağlantı ve eski oturumlar geçersiz olur, uid aynı kalır
export async function changeAuxPassword(email, oldPw, newPw) {
  const a = initializeApp(firebaseConfig, "aux" + Date.now()), au = getAuth(a);
  try { const c = await signInWithEmailAndPassword(au, email, oldPw); await updatePassword(c.user, newPw); await signOut(au).catch(() => {}); }
  finally { deleteApp(a).catch(() => {}); }
}
export const apiKey = firebaseConfig.apiKey, authDomain = firebaseConfig.authDomain;
export { signInAnonymously, signInWithEmailLink, sendSignInLinkToEmail, EmailAuthProvider, reauthenticateWithCredential, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  sendPasswordResetEmail, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc,
  query, orderBy, serverTimestamp, onSnapshot };
