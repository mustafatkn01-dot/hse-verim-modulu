// Bulgu paylaşımı: yetkili, seçtiği bölümlerin açık bulgularını seçtiği misafirlerle paylaşır; misafir kendi ekranında görür ve
// mevcut "Aksiyon bildir" akışıyla aksiyon alır (yetkili onayı mevcut Aksiyon bildirimleri panelinde).
// Puan kuralı mevcut sistemdeki gibi: aksiyonun gönderim zamanı denetim haftası içindeyse (en geç cumartesi) ve yetkili kabul ederse puana işlenir.
import * as S from "./store.js?v=20261022q";
import { esc, ic, toast, confirmBox } from "./ui.js?v=20261022q";

const pad = n => String(n).padStart(2, "0"), iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); d.setDate(d.getDate() + n); return iso(d); };
const monOf = s => { const g = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)).getDay(); return addDays(s, g === 0 ? -6 : 1 - g); };
export const fd = s => new Date(s + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
const WA = '<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 20.5l1.6-5.5A8.4 8.4 0 1 1 21 11.5z"/><path d="M9 9.5c.3 2 2.5 4.2 4.5 4.5l1.2-1.2-1.6-.9-.8.6c-.7-.3-1.4-1-1.7-1.7l.6-.8-.9-1.6z"/>';
const ML = '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>';
const IB = "flex:0 0 40px;width:40px;height:40px;padding:0;display:grid;place-items:center;min-height:0";

// Bir bölüm kaydındaki açık (aksiyonu kabul edilmemiş) bulgu sayısı ve son denetim haftasının cumartesisi
export function openInfo(doc) {
  let n = 0, last = "";
  for (const s of doc?.sessions || []) {
    if (s.date && s.date > last) last = s.date;
    for (const [id, arr] of Object.entries(s.fails || {})) (arr || []).forEach((t, j) => { if (!t) return; const f = s.fixed?.[id + "|" + j]; if (!(f && f.t === t && f.st === "ok")) n++; });
  }
  return { n, cut: last ? addDays(monOf(last), 5) : "" };
}
const keyOf = (m, id) => `${pad(+m)}_${id}`;

// ---------------- Yetkili: paylaş penceresi ----------------
export async function openShare({ fid, year, month, rows, factoryName = "", onDone = () => {} }) {
  const m = document.createElement("div"); m.className = "mod";
  m.innerHTML = '<div class="mbox pf" role="dialog" aria-modal="true" style="gap:12px"></div>'; document.body.appendChild(m);
  const box = m.querySelector(".mbox"), close = () => { m.remove(); onDone(); };
  m.addEventListener("mousedown", e => { if (e.target === m) close(); });
  box.innerHTML = '<div class="muted">Hazırlanıyor…</div>';
  const [mem, old, docs] = await Promise.all([S.listMembers().catch(() => []), S.listShares(fid, year, month).catch(() => []),
    Promise.all(rows.map(r => S.getMonthDoc(fid, year, "isg", keyOf(month, r.id)).catch(() => null)))]);
  const live = mem.filter(x => (x.factories || []).includes(fid) && (x.expires == null || (x.expires.toMillis ? x.expires.toMillis() : +x.expires) > Date.now()));
  const info = Object.fromEntries(rows.map((r, i) => [r.id, openInfo(docs[i])]));
  const st = { g: [], b: [], t: addDays(iso(new Date()), 7), note: "", old };
  const cutOf = ids => ids.map(i => info[i].cut).filter(Boolean).sort().pop() || "";
  const draw = () => {
    const all = rows.filter(r => info[r.id].n > 0), nOpen = st.b.reduce((a, i) => a + info[i].n, 0);
    box.innerHTML = `<h2 style="margin:0;font-size:20px">Bulguları paylaş</h2>
      <div class="muted" style="font-size:13px;line-height:1.5">${esc(factoryName)} · seçtiğiniz bölümlerin açık bulguları, seçtiğiniz kişilerle paylaşılır. Kişi bulgulara aksiyon girer, onayı siz verirsiniz.</div>
      <span class="hd">KİME</span>
      ${live.length ? `<div class="col1" style="gap:6px">${live.map(g => `<label class="opt" style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid ${st.g.includes(g.id) ? "var(--gd)" : "var(--line)"};border-radius:12px;cursor:pointer;margin:0;${st.g.includes(g.id) ? "background:#EAF7F1" : ""}"><input type="checkbox" data-g="${g.id}" ${st.g.includes(g.id) ? "checked" : ""} style="width:20px;height:20px;margin:2px 0 0;flex:0 0 20px;accent-color:#0B6E4F"><span style="min-width:0"><b style="font-size:14px;display:block">${esc(g.name || "Misafir")}</b>${g.unit ? `<span style="font-style:italic;font-size:12px;color:var(--muted);display:block">${esc(g.unit)}</span>` : ""}</span></label>`).join("")}</div>` : '<div class="muted" style="font-size:13px">Bu fabrikaya yetkili onaylı misafir yok. Ayarlar &gt; Misafir erişimi bölümünden davet edin.</div>'}
      <span class="hd">HANGİ BÖLÜMLER</span>
      <div class="col1" style="gap:6px">${all.length ? `<label style="display:flex;gap:10px;align-items:center;padding:10px 12px;border:1px solid ${st.b.length === all.length ? "var(--gd)" : "var(--line)"};border-radius:12px;cursor:pointer;margin:0;${st.b.length === all.length ? "background:#EAF7F1" : ""}"><input type="checkbox" data-ball ${st.b.length === all.length ? "checked" : ""} style="width:20px;height:20px;flex:0 0 20px;accent-color:#0B6E4F"><b style="font-size:14px">Tüm bölümler</b></label>` : ""}
      ${rows.map(r => { const n = info[r.id].n, on = st.b.includes(r.id); return `<label style="display:flex;gap:10px;align-items:center;padding:10px 12px;border:1px solid ${on ? "var(--gd)" : "var(--line)"};border-radius:12px;cursor:${n ? "pointer" : "default"};margin:0;${on ? "background:#EAF7F1;" : ""}${n ? "" : "opacity:.5"}"><input type="checkbox" data-b="${r.id}" ${on ? "checked" : ""} ${n ? "" : "disabled"} style="width:20px;height:20px;flex:0 0 20px;accent-color:#0B6E4F"><span style="flex:1;min-width:0"><b style="font-size:14px">${esc(r.name)}</b></span><span class="muted" style="font-size:12.5px;white-space:nowrap">${n ? n + " açık bulgu" : "açık bulgu yok"}</span></label>`; }).join("")}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:end"><div><label class="hd" for="shT" style="margin:0">TERMİN</label><input type="date" id="shT" class="inp" value="${st.t}" min="${iso(new Date())}" style="margin-top:4px"></div><span class="muted" style="font-size:12.5px;line-height:1.4">Takip içindir. Puan için hafta kuralı geçerlidir.</span></div>
      <div><label class="hd" for="shN" style="margin:0">NOT (İSTEĞE BAĞLI)</label><textarea id="shN" class="inp" style="margin-top:4px;height:auto;min-height:64px;padding:10px;resize:vertical" placeholder="Örn. Önce yaya yolu ve yangın söndürücü önü.">${esc(st.note)}</textarea></div>
      ${st.g.length && st.b.length ? `<div style="border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.5;background:#E3F0F9;border:1px solid #BCD6EA;color:#143B5B">${st.g.length} kişi · ${st.b.length} bölüm · ${nOpen} açık bulgu. ${cutOf(st.b) ? (cutOf(st.b) >= iso(new Date()) ? `Puan için aksiyon en geç ${fd(cutOf(st.b))} gününe kadar girilmeli.` : "Denetim haftası kapandı: aksiyon görünür ama puan değişmez.") : ""}</div>` : ""}
      ${st.old.length ? `<div style="border-top:1px solid var(--line);padding-top:10px;display:flex;flex-direction:column;gap:6px"><span class="hd">BU AYIN PAYLAŞIMLARI (${st.old.length})</span>${st.old.map(o => `<div style="display:flex;align-items:center;gap:8px"><span style="flex:1;min-width:0;font-size:13px;line-height:1.4">${esc(Object.values(o.names || {}).join(", ") || "-")} <span class="muted">· ${esc(o.depts.map(d => d.name).join(", "))} · ${fd(o.termin)}</span></span><button type="button" class="sec sm" data-rm="${o.id}" style="flex:0 0 auto;min-width:0;padding:0 10px">Kaldır</button></div>`).join("")}</div>` : ""}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="sec" data-c>Vazgeç</button><button data-go ${st.g.length && st.b.length ? "" : "disabled"}>Gönder</button></div>`;
    box.querySelectorAll("[data-g]").forEach(x => x.onchange = () => { keep(); st.g = x.checked ? [...st.g, x.dataset.g] : st.g.filter(i => i !== x.dataset.g); draw(); });
    box.querySelectorAll("[data-b]").forEach(x => x.onchange = () => { keep(); st.b = x.checked ? [...st.b, x.dataset.b] : st.b.filter(i => i !== x.dataset.b); draw(); });
    const ba = box.querySelector("[data-ball]"); if (ba) ba.onchange = () => { keep(); st.b = ba.checked ? all.map(r => r.id) : []; draw(); };
    box.querySelectorAll("[data-rm]").forEach(x => x.onclick = async () => {
      if (!(await confirmBox("Paylaşım kaldırılsın mı?", "Kişi bu paylaşımı artık göremez. Girdiği aksiyonlar sizde kalır.", "Kaldır", true))) return;
      try { await S.deleteShare(x.dataset.rm); st.old = st.old.filter(o => o.id !== x.dataset.rm); toast("Paylaşım kaldırıldı."); } catch { toast("Kaldırılamadı."); } draw();
    });
    box.querySelector("[data-c]").onclick = close; box.querySelector("[data-go]").onclick = send;
  };
  const keep = () => { const t = box.querySelector("#shT"), n = box.querySelector("#shN"); if (t?.value) st.t = t.value; if (n) st.note = n.value; };
  const send = async () => {
    keep(); const btn = box.querySelector("[data-go]"); btn.disabled = true;
    const depts = rows.filter(r => st.b.includes(r.id)).map(r => ({ id: r.id, name: r.name })), names = Object.fromEntries(st.g.map(g => [g, live.find(x => x.id === g)?.name || "Misafir"]));
    try { await S.addShare({ fid, year: String(year), month: +month, depts, guests: st.g, names, termin: st.t, note: st.note.trim() }); }
    catch (e) { btn.disabled = false; return toast("Paylaşılamadı: " + (e.message || e)); }
    done(depts, names);
  };
  const done = (depts, names) => {
    const link = `${location.origin}${location.pathname}?denetim=${fid}.${year}.${month}.${depts[0].id}`, n = depts.reduce((a, d) => a + info[d.id].n, 0), cut = cutOf(depts.map(d => d.id));
    const wk = cut && cut >= iso(new Date()) ? `Puan için aksiyonu en geç ${fd(cut)} gününe kadar girin. ` : "";
    const msgFor = nm => `Merhaba ${nm.split(" ")[0]},\n${depts.map(d => d.name).join(", ")} bölümünde ${n} açık İSG bulgusu sizinle paylaşıldı. ${wk}Termin: ${fd(st.t)}.${st.note.trim() ? "\nNot: " + st.note.trim() : ""}\nBağlantı: ${link}`;
    box.innerHTML = `<h2 style="margin:0;font-size:20px">Paylaşıldı</h2>
      <div class="muted" style="font-size:13px;line-height:1.5">Kişiler uygulamayı açtığında paylaşımı görür. İsterseniz mesajı ayrıca WhatsApp veya e-posta ile gönderin.</div>
      ${st.g.map(g => { const nm = names[g]; return `<div style="display:flex;align-items:center;gap:8px"><span style="flex:1;min-width:0"><b style="font-size:14px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(nm)}</b>${live.find(x => x.id === g)?.unit ? `<span style="font-style:italic;font-size:12px;color:var(--muted);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(live.find(x => x.id === g).unit)}</span>` : ""}</span>
        <a href="https://wa.me/?text=${encodeURIComponent(msgFor(nm))}" target="_blank" rel="noopener" aria-label="${esc(nm)} için WhatsApp mesajı" title="WhatsApp"><button type="button" class="sec" style="${IB}">${ic(WA, 20)}</button></a>
        <a href="mailto:?subject=${encodeURIComponent("İSG bulguları paylaşıldı")}&body=${encodeURIComponent(msgFor(nm))}" aria-label="${esc(nm)} için e-posta" title="E-posta"><button type="button" class="sec" style="${IB}">${ic(ML, 20)}</button></a></div>`; }).join("")}
      <button data-c>Kapat</button>`;
    box.querySelector("[data-c]").onclick = close;
  };
  draw();
}

// ---------------- Misafir: kendisiyle paylaşılanlar ----------------
// Satırlar: paylaşımdaki her bölüm için güncel açık bulgu sayısı, termin, not (en yeni paylaşım geçerli)
export async function guestRows(fid, year) {
  const shares = await S.myShares(fid, year).catch(() => []), seen = new Map();
  for (const sh of shares) for (const d of sh.depts || []) { const k = sh.month + "|" + d.id; if (!seen.has(k)) seen.set(k, { month: sh.month, id: d.id, name: d.name, termin: sh.termin, note: sh.note || "" }); }
  const rows = await Promise.all([...seen.values()].map(async r => ({ ...r, ...openInfo(await S.getMonthDoc(fid, year, "isg", keyOf(r.month, r.id)).catch(() => null)) })));
  return rows;
}
export function guestCard(rows, open) {
  if (!rows?.length) return "";
  const tot = rows.reduce((a, r) => a + r.n, 0), cut = rows.map(r => r.cut).filter(Boolean).sort().pop() || "", today = iso(new Date());
  return `<div class="cd" style="padding:16px 20px;gap:10px"><button type="button" data-shrt aria-expanded="${open}" style="display:flex;align-items:center;gap:12px;width:100%;min-height:44px;height:auto;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;font-weight:400"><span style="flex:1;min-width:0"><b style="font:600 16px Sora,sans-serif;display:block">Bana paylaşılanlar (${tot})</b><span class="muted" style="font-size:12.5px;line-height:1.5">Yetkilinin sizinle paylaştığı açık bulgular.</span></span><span style="transform:rotate(${open ? 180 : 0}deg);display:flex">${ic('<path d="M6 9l6 6 6-6"/>')}</span></button>
    ${open ? `${cut && cut >= today ? `<div style="border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.5;background:#E3F0F9;border:1px solid #BCD6EA;color:#143B5B"><b>Puan için:</b> Aksiyonu en geç ${fd(cut)} gününe kadar girin. Sonrasında aksiyon görünür, ama puan değişmez.</div>` : ""}
    ${rows.map(r => `<div class="sess" style="flex-direction:column;align-items:stretch;gap:6px"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><b style="font-size:14px;min-width:0">${esc(r.name)}</b><span class="pill" style="${r.n ? "background:#FBE9C6;color:#5A3300" : "background:#D9F1E6;color:#0B6E4F"};white-space:nowrap">${r.n ? r.n + " açık" : "açık bulgu yok"}</span></div>
      <div class="muted" style="font-size:12.5px">Termin: ${fd(r.termin)}</div>${r.note ? `<div style="font-style:italic;font-size:12.5px;color:var(--muted)">${esc(r.note)}</div>` : ""}
      ${r.n ? `<button class="sec" data-shr="${r.month}|${r.id}" style="height:42px">Bulguları aç</button>` : ""}</div>`).join("")}` : ""}</div>`;
}
