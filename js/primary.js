// Ana (yetkili) cihaz değişimi: e-postaya doğrulama bağlantısı/kodu gönderilir, kod girilince ana cihaz değişir.
import { auth, apiKey, authDomain, signInWithEmailLink, sendSignInLinkToEmail, EmailAuthProvider, reauthenticateWithCredential } from "./firebase.js?v=20261010n";
import * as S from "./store.js?v=20261010n";
import { esc } from "./ui.js?v=20261010n";

const LAND = (() => { try { const q = new URLSearchParams(location.search); return q.get("mode") === "signIn" && q.get("oobCode") ? q.get("oobCode") : null; } catch { return null; } })();
if (LAND) { try { history.replaceState(null, "", location.pathname + location.hash); } catch {} }
const pend = { get: () => { try { return JSON.parse(localStorage.getItem("hse_pending") || "null"); } catch { return null; } }, set: v => { try { v ? localStorage.setItem("hse_pending", JSON.stringify(v)) : localStorage.removeItem("hse_pending"); } catch {} } };

const errText = e => ({
  "auth/operation-not-allowed": "E-posta bağlantısıyla doğrulama Firebase'de kapalı. Firebase konsolu → Authentication → Sign-in method → E-posta/Parola → \"E-posta bağlantısı (parolasız oturum açma)\" seçeneğini açın.",
  "auth/unauthorized-continue-uri": "Alan adı yetkili değil. Firebase konsolu → Authentication → Settings → Authorized domains bölümüne mustafatkn01-dot.github.io ekleyin.",
  "auth/invalid-action-code": "Kod geçersiz, kullanılmış veya süresi dolmuş. Yeni kod isteyin.", "auth/expired-action-code": "Kodun süresi dolmuş. Yeni kod isteyin.",
  "auth/invalid-email": "E-posta geçersiz.", "auth/user-mismatch": "Kod bu hesaba ait değil.", "auth/too-many-requests": "Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.", "auth/network-request-failed": "Bağlantı hatası."
}[e?.code] || (e?.message || "İşlem başarısız."));
const parseCode = t => { t = String(t || "").trim(); const m = /[?&]oobCode=([^&\s]+)/.exec(t); return decodeURIComponent(m ? m[1] : t.replace(/\s+/g, "")); };
const linkOf = code => `https://${authDomain}/__/auth/action?apiKey=${apiKey}&mode=signIn&oobCode=${encodeURIComponent(code)}&lang=tr`;

async function verify(code) {
  const u = auth.currentUser;
  await reauthenticateWithCredential(u, EmailAuthProvider.credentialWithLink(u.email, linkOf(code)));
}
async function commit(t) { await S.setPrimary(t.id, t.name); pend.set(null); }

function sheet(html) {
  const m = document.createElement("div"); m.className = "mod"; m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:14px">${html}</div>`;
  document.body.appendChild(m); return m;
}

// Ayarlar → "Yetkili cihaz yap"
export function startTransfer(target, done) {
  const email = auth.currentUser.email;
  const m = sheet(`<h2>Yetkili cihazı değiştir</h2>
    <div class="muted" style="line-height:1.5"><b>${esc(target.name)}</b> ana (yetkili) cihaz olacak. Ana cihaz diğer oturumları kapatabilir; diğer tüm cihazlar misafir oturumdur. Doğrulama için <b>${esc(email)}</b> adresine bir doğrulama bağlantısı gönderilir.</div>
    <div id="s1" class="row" style="justify-content:flex-end"><button class="sec" data-no>Vazgeç</button><button id="send">Doğrulama e-postası gönder</button></div>
    <div id="s2" class="col1 hide" style="gap:10px"><div class="muted" style="line-height:1.5">E-posta gönderildi. İletideki <b>"Sign in to hse-verim-modulu"</b> bağlantısına bu cihazın tarayıcısında dokunursanız değişiklik <b>otomatik</b> tamamlanır. Bağlantıyı başka bir cihazda açtıysanız orada görünen kodu (veya bağlantının tamamını) aşağıya yapıştırıp Tamam'a basın.</div>
      <input id="code" class="inp" placeholder="Başka cihazda açtıysanız kodu yapıştırın" autocomplete="one-time-code" style="font-family:monospace"><div id="err" style="color:#B3261E;font-size:13px;font-weight:600"></div>
      <div class="row" style="justify-content:flex-end"><button class="sec" data-no>Vazgeç</button><button class="sec" id="resend">E-postayı yeniden gönder</button><button id="ok">Tamam</button></div></div>
    <div id="err1" style="color:#B3261E;font-size:13px;font-weight:600"></div>`);
  const $ = s => m.querySelector(s), close = () => { pend.set(null); m.remove(); };
  m.querySelectorAll("[data-no]").forEach(b => b.onclick = close);
  const send = async () => {
    $("#err1").textContent = ""; $("#send").disabled = true;
    try {
      auth.languageCode = "tr";
      await sendSignInLinkToEmail(auth, email, { url: location.origin + location.pathname, handleCodeInApp: true });
      pend.set({ id: target.id, name: target.name, at: Date.now() });
      $("#s1").classList.add("hide"); $("#s2").classList.remove("hide"); $("#code").focus(); $("#err1").textContent = "";
    } catch (e) { $("#err1").textContent = errText(e); $("#send").disabled = false; }
  };
  $("#send").onclick = send; $("#resend").onclick = send;
  $("#ok").onclick = async () => {
    const c = parseCode($("#code").value); if (!c) { $("#err").textContent = "Kodu yapıştırın veya e-postadaki bağlantıyı bu cihazda açın."; return; }
    $("#ok").disabled = true; $("#err").textContent = "";
    try { await verify(c); await commit(target); m.remove(); done?.(`${target.name} artık ana cihaz.`); }
    catch (e) { $("#err").textContent = errText(e); $("#ok").disabled = false; }
  };
}

// E-postadaki bağlantı bu tarayıcıda açıldığında: bekleyen istek varsa otomatik tamamla, yoksa kodu göster
export async function handleLanding(done) {
  if (!LAND) return false;
  const t = pend.get();
  if (!t) return true; // kod kartı açılışta zaten gösterildi
  if (t && auth.currentUser && Date.now() - t.at < 60 * 60 * 1000) {
    try { await verify(LAND); await commit(t); document.querySelectorAll(".mod").forEach(x => x.remove()); done?.(`${t.name} artık ana cihaz.`); return true; } catch (e) { /* kod gösterimine düş */ }
  }
  codeCard(LAND); return true;
}
export const hasLanding = !!LAND;
export function codeCard(code) {
  const m = sheet(`<h2>Doğrulama kodunuz</h2><div class="muted" style="line-height:1.5">Bu kodu, ana cihaz değişikliğini başlattığınız cihazdaki kod alanına yapıştırın. Kodu kimseyle paylaşmayın.</div>
    <textarea readonly rows="3" class="inp" style="height:auto;font-family:monospace;padding:10px;word-break:break-all">${esc(code)}</textarea>
    <div class="row" style="justify-content:flex-end"><button class="sec" data-c>Kapat</button><button data-cp>Kodu kopyala</button></div>`);
  m.querySelector("[data-c]").onclick = () => m.remove();
  m.querySelector("[data-cp]").onclick = async e => { try { await navigator.clipboard.writeText(code); e.target.textContent = "Kopyalandı"; } catch { m.querySelector("textarea").select(); } };
}

// E-posta bağlantısıyla giriş (şifre unutulduğunda / çalışmadığında)
const lm = { get: () => { try { return localStorage.getItem("hse_loginmail"); } catch { return null; } }, set: v => { try { v ? localStorage.setItem("hse_loginmail", v) : localStorage.removeItem("hse_loginmail"); } catch {} } };
export async function sendLoginLink(email) {
  auth.languageCode = "tr";
  await sendSignInLinkToEmail(auth, email, { url: location.origin + location.pathname, handleCodeInApp: true });
  lm.set(email);
}
export const loginErrText = errText;
export async function finishLoginLink(show) {
  const mail = lm.get(); if (!LAND || !mail) return false;
  try { await signInWithEmailLink(auth, mail, linkOf(LAND)); lm.set(null); } catch (e) { lm.set(null); show?.(errText(e) + " Giriş bağlantısı yalnızca bir kez ve aynı tarayıcıda kullanılabilir; yeniden isteyin."); }
  return true;
}
if (LAND && !pend.get() && !lm.get()) codeCard(LAND);
