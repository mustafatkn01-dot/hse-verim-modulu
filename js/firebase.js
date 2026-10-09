// Firebase başlatma (web config herkese açıktır; güvenlik Firestore kurallarındadır)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, setPersistence, browserLocalPersistence,
  sendSignInLinkToEmail, EmailAuthProvider, reauthenticateWithCredential, signInWithEmailLink } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc,
  query, orderBy, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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

export const apiKey = firebaseConfig.apiKey, authDomain = firebaseConfig.authDomain;
export { signInWithEmailLink, sendSignInLinkToEmail, EmailAuthProvider, reauthenticateWithCredential, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  sendPasswordResetEmail, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc,
  query, orderBy, serverTimestamp, onSnapshot };
