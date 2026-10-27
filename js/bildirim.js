// Bildirim şeridi: üstten kayar, 4 sn görünür, dokununca kapanır. Sarı = bilgi, yeşil = onay, kırmızı = ret.
// Uygulama açılışında birikmiş olaylar tek şeritte toplanır (bannerInit); sonradan gelenler tek tek gösterilir.
import * as S from "./store.js?v=20261026i";

const ICO = { g: '<path d="M5 12.5l4.2 4.2L19 7"/>', y: '<path d="M12 7v6M12 17v.5"/>', r: '<path d="M7 7l10 10M17 7L7 17"/>' };
const Q = []; let busy = false, el = null, tm = null, pool = [], poolT = null;

const node = () => {
  if (el) return el;
  el = document.createElement("div"); el.id = "bnr"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
  el.onclick = () => hide(); document.body.appendChild(el); return el;
};
function hide() { clearTimeout(tm); if (!el) return; el.classList.remove("show"); setTimeout(() => { busy = false; pump(); }, 400); }
function pump() {
  if (busy || !Q.length) return; busy = true;
  const [c, t, m] = Q.shift(), e = node();
  e.className = c; e.innerHTML = `<span class="dot"><svg viewBox="0 0 24 24">${ICO[c] || ICO.y}</svg></span><span><b></b><span class="m"></span></span><i class="pr"></i>`;
  e.querySelector("b").textContent = t; e.querySelector(".m").textContent = m || "";
  void e.offsetWidth; e.classList.add("show"); tm = setTimeout(hide, 4000);
}
export function banner(c, t, m) { Q.push([c, t, m]); pump(); }
// Açılışta gelen olaylar 1,5 sn toplanır: tek olay → şerit, birden çok → tek özet şerit
export function bannerInit(ev) {
  pool.push(ev); clearTimeout(poolT);
  poolT = setTimeout(() => { const p = pool; pool = []; if (p.length === 1) banner(...p[0]); else if (p.length) banner("y", `${p.length} yeni bildirim`, p.slice(0, 3).map(x => x[1]).join(" · ")); }, 1500);
}

// ---------- Misafir: karar / paylaşım olaylarını canlı izler ----------
let gKey = "", gOff = [];
export function stop() { gOff.forEach(f => { try { f?.(); } catch { } }); gOff = []; gKey = ""; }
const META = { konusmag: "Eğitim konuşması", isbasig: "İşbaşı eğitim", kazag: "İş kazası kaydı", ramak: "Ramak kala bildirimi" };
export function guestWatch({ fid, year, uid }) {
  if (!fid || !year || !uid) return;
  const key = `${fid}/${year}`; if (key === gKey) return; stop(); gKey = key;
  const LK = `hse_bn_${uid}_${fid}_${year}`; let seen = null;
  try { seen = JSON.parse(localStorage.getItem(LK) || "null"); } catch { }
  const base = !seen; seen = seen || {};
  const done = {};
  const save = () => { try { localStorage.setItem(LK, JSON.stringify(seen)); } catch { } };
  const run = (src, entries) => {
    const first = !done[src], silent = base && first; done[src] = 1; const evs = [];
    entries.forEach(([k, v, ev]) => { if (seen[k] === v) return; seen[k] = v; if (!silent && ev) evs.push(ev); });
    save(); evs.forEach(e => first ? bannerInit(e) : banner(...e));
  };
  Object.keys(META).forEach(c => gOff.push(S.watchColl(fid, year, c, rows => run(c, rows.filter(x => x.guestUid === uid).map(x => [`${c}|${x.id}`, x.status,
    x.status === "approved" ? ["g", `${META[c]} onaylandı`, "Kaydınız onaylandı."] : x.status === "rejected" ? ["r", `${META[c]} reddedildi`, x.ownerNote ? `Gerekçe: ${x.ownerNote}` : "Ayrıntı için ilgili sayfaya bakın."] : null])))));
  gOff.push(S.watchColl(fid, year, "isg", rows => {
    const en = [];
    rows.forEach(d => (d.sessions || []).forEach(s => Object.entries(s.fixed || {}).forEach(([fk, f]) => {
      if (f.gu !== uid) return;
      en.push([`fx|${d.id}|${s.no}|${fk}`, `${f.st}:${f.at}`, f.st === "ok" ? ["g", "Aksiyon kabul edildi", String(f.t || "").slice(0, 80)] : f.st === "rej" ? ["r", "Aksiyon reddedildi", f.rej ? `Gerekçe: ${f.rej}` : String(f.t || "").slice(0, 80)] : null]);
    })));
    run("isg", en);
  }));
  gOff.push(S.watchMyShares(list => run("sh", list.filter(x => x.fid === fid && String(x.year) === String(year)).map(x => [`sh|${x.id}`, x.at,
    ["y", "Yeni bulgu paylaşıldı", x.all ? "Tüm bölümler sizinle paylaşıldı." : (x.depts || []).map(d => d.name).slice(0, 3).join(", ") + " sizinle paylaşıldı."]]))));
}
// Bağlantı yenilendi: yeni bağlantıyla ilk girişte bir kez
export function linkRenewed(uid, rot) {
  try {
    if (rot == null) return; const k = "hse_grot_" + uid, p = localStorage.getItem(k);
    if (p !== null && p !== String(rot)) bannerInit(["y", "Bağlantınız yenilendi", "Yeni bağlantı etkin. Eski bağlantı artık çalışmaz."]);
    localStorage.setItem(k, String(rot));
  } catch { }
}
