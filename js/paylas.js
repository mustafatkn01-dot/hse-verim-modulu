// Bulgu paylaşımı: yetkili, seçtiği bölümlerin açık bulgularını seçtiği misafirlerle paylaşır; misafir kendi ekranında görür ve
// mevcut "Aksiyon bildir" akışıyla aksiyon alır (yetkili onayı mevcut Aksiyon bildirimleri panelinde).
// Puan kuralı mevcut sistemdeki gibi: aksiyonun gönderim zamanı denetim haftası içindeyse (en geç cumartesi) ve yetkili kabul ederse puana işlenir.
import * as S from "./store.js?v=20261029d";
import { esc, ic, toast, confirmBox, compressImage, showPhoto, GUEST, pickDate, fmtTarih } from "./ui.js?v=20261029d";
import * as Guest from "./guest.js?v=20261029d";
import { CATS } from "./isgcats.js?v=20261029d";

const pad = n => String(n).padStart(2, "0"), iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); d.setDate(d.getDate() + n); return iso(d); };
const monOf = s => { const g = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)).getDay(); return addDays(s, g === 0 ? -6 : 1 - g); };
export const fd = s => new Date(s + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
const WA = '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M8 10h8M8 13h5"/>';
const ML = '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>';
const PB = "display:flex;align-items:center;justify-content:center;gap:5px;height:44px;padding:0 8px;min-width:0;white-space:nowrap;border:1px solid var(--inl);border-radius:10px;color:var(--text);font-weight:700;font-size:12.5px;cursor:pointer;background:var(--card)";
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
  const st = { dd: null, q: "", not: false, acc: false, g: [], b: [], t: addDays(iso(new Date()), 7), note: "", old, roles: {}, all: false };
  // Denetim kaydındaki sorumlu ve termin, bölüm seçilince hazır gelir (elle değiştirilebilir)
  const autoFill = ids => { for (const id of ids) { const d = docs[rows.findIndex(r => r.id === id)]; (d?.resp || []).forEach(r => { if (r.id && live.some(g => g.id === r.id) && !st.g.includes(r.id) && !st.old.some(o => o.all && (o.guests || []).includes(r.id))) st.g = [...st.g, r.id]; }); if (d?.due && !st.tUser && d.due >= iso(new Date())) st.t = d.due; } };
  const cutOf = ids => ids.map(i => info[i].cut).filter(Boolean).sort().pop() || "";
  const short = n => { const p = String(n || "Misafir").trim().split(/\s+/); return p.length < 2 ? p[0] : p[0] + " " + p[p.length - 1].slice(0, 1) + "."; };
  const CHV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  const draw = () => {
    box.classList.add("sh");
    const sy = box.querySelector(".shb")?.scrollTop || 0, ly = box.querySelector(".gddl")?.scrollTop || 0;
    const shRows = st.old.flatMap(o => (o.guests || []).map(g => ({ o, g }))), allG = new Set(st.old.filter(o => o.all).flatMap(o => o.guests || [])), all = rows, nOpen = st.b.reduce((a, i) => a + info[i].n, 0);
    const dd = (id, label, val, body) => { const o = st.dd === id; return `<div class="gdd${o ? " open" : ""}"><button type="button" class="gddb" data-dd="${id}" aria-expanded="${o}"><span style="flex:1;min-width:0"><span class="hd" style="display:block;font-size:10.5px;margin:0">${label}</span><b style="font-size:13.5px">${val}</b></span>${CHV}</button>${o ? body : ""}</div>`; };
    const q = (st.q || "").toLocaleLowerCase("tr");
    const kb = `<div class="gddl"><input class="inp gsrch" id="shQ" placeholder="Ad ara" value="${esc(st.q || "")}" aria-label="Ad ara">${live.filter(g => !q || String(g.name || "").toLocaleLowerCase("tr").includes(q)).map(g => { const on = st.g.includes(g.id), cov = allG.has(g.id); return `<button type="button" class="gopt" data-g="${g.id}" ${cov ? "disabled" : ""}><i>${on ? "✓" : ""}</i><span style="flex:1;min-width:0;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.name || "Misafir")}${g.unit ? ` <small class="muted">${esc(g.unit)}</small>` : ""}</span>${cov ? '<span class="tag" style="background:#FFF3D6;color:#6B3F00;flex:0 0 auto">Zaten tüm bölümlerde</span>' : ""}</button>`; }).join("") || '<span class="muted" style="padding:8px">Sonuç yok</span>'}</div>`;
    const bb = `<div class="gddl">${all.length ? `<button type="button" class="gopt" data-ball><i>${st.all ? "✓" : ""}</i>Tüm bölümler</button>` : ""}${rows.map(r => { const n = info[r.id].n, on = st.b.includes(r.id); return `<button type="button" class="gopt" data-b="${r.id}" ${n || st.all ? "" : "disabled"}><i>${on ? "✓" : ""}</i><span style="flex:1;min-width:0">${esc(r.name)}</span><span class="muted" style="font-size:12px;white-space:nowrap">${n ? n + " açık" : "açık bulgu yok"}</span></button>`; }).join("")}</div>`;
    const bval = st.b.length ? (st.all ? "Tüm bölümler" : `${st.b.length} / ${rows.length} bölüm`) + ` · ${nOpen} açık bulgu` : "Bölüm seçin";
    box.innerHTML = `<div class="shb"><h2 style="margin:0;font-size:20px">Bulguları paylaş</h2>
      <div class="muted" style="font-size:13px;line-height:1.5">${esc(factoryName)} · seçtiğiniz bölümlerin açık bulguları, seçtiğiniz kişilerle paylaşılır. Kişi bulgulara aksiyon girer, onayı siz verirsiniz.</div>
      ${live.length ? dd("k", "Kime", st.g.length ? st.g.length + " kişi seçili" : "Kişi seçin", kb) : '<div class="muted">Bu fabrikaya yetkili aktif misafir yok.</div>'}
      ${st.g.length ? `<div class="gchips">${st.g.map(id => { const g = live.find(x => x.id === id), iz = st.roles[id] === "izle"; return `<span class="gcx"><span class="n">${esc(short(g?.name))}</span><button type="button" class="role${iz ? " iz" : ""}" data-role="${id}">${iz ? "İzler" : "Aksiyon alır"}</button><button type="button" class="x" data-rmg="${id}" aria-label="Çıkar">×</button></span>`; }).join("")}</div><div class="muted" style="font-size:12.5px;line-height:1.45">Etikete dokununca rol değişir. Aksiyon alır: aksiyon ve kanıt girer. İzler: yalnızca canlı takip.</div>` : ""}
      ${all.length ? dd("b", "Hangi bölümler", bval, bb) : ""}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:end"><div><label class="hd" for="shT" style="margin:0">TERMİN</label><button type="button" id="shT" class="sec" style="margin-top:4px;width:100%;justify-content:center">${fmtTarih(st.t)}</button></div><span class="muted" style="font-size:12.5px;line-height:1.4">Takip içindir. Puan için hafta kuralı geçerlidir.</span></div>
      ${st.not || st.note ? `<div><label class="hd" for="shN" style="margin:0">NOT</label><textarea id="shN" class="inp" style="margin-top:4px;height:auto;min-height:64px;padding:10px;resize:vertical" placeholder="Örn. Önce yaya yolu ve yangın söndürücü önü.">${esc(st.note)}</textarea></div>` : '<button type="button" class="gl" data-not>+ Not ekle</button>'}
      ${st.g.length && st.b.length ? `<div style="border-radius:12px;padding:8px 12px;font-size:12.5px;line-height:1.5;background:#E3F0F9;border:1px solid #BCD6EA;color:#143B5B">${st.g.length} kişi · ${st.b.length} bölüm · ${nOpen} açık bulgu. ${cutOf(st.b) ? (cutOf(st.b) >= iso(new Date()) ? `Puan için aksiyon en geç ${fd(cutOf(st.b))} gününe kadar girilmeli.` : "Denetim haftası kapandı: aksiyon görünür ama puan değişmez.") : ""}</div>` : ""}
      ${st.old.length ? `<div class="gacc${st.acc ? " open" : ""}"><button type="button" class="gacch" data-acc aria-expanded="${!!st.acc}"><b style="flex:1;font-size:13.5px">Bu ayın paylaşımları (${shRows.length})</b>${CHV}</button>${st.acc ? `<div class="gaccb"><div class="glst">${shRows.map(({ o, g }) => { const nm = o.names?.[g] || live.find(x => x.id === g)?.name || "Misafir", sc = o.all ? `Tüm bölümler (${rows.length})` : o.depts.map(d => d.name).join(", "); return `<div style="display:flex;align-items:center;gap:8px"><span style="flex:1;min-width:0;font-size:13px;line-height:1.4"><b>${esc(nm)}</b><span class="muted" style="display:block;font-size:12.5px">${esc(sc)} · ${fd(o.termin)}</span>${!o.all && allG.has(g) ? '<span class="tag" style="background:#FFF3D6;color:#6B3F00">Zaten tüm bölümlerde · bu satır gereksiz</span>' : ""}</span><button type="button" class="sec sm" data-rm="${o.id}|${g}" style="flex:0 0 auto;min-width:0;height:28px;min-height:28px;padding:0 9px;font-size:12px;border-radius:8px;color:#B3261E;border-color:#B3261E">Kaldır</button></div>`; }).join("")}</div><button type="button" class="sec" data-sum>Durum özetini gönder</button></div>` : ""}</div>` : ""}</div>
      <div class="shf"><button class="sec" data-c>Vazgeç</button><button data-go ${st.g.length && st.b.length ? "" : "disabled"}>Gönder</button></div>`;
    const sb = box.querySelector(".shb"); if (sb) sb.scrollTop = sy; const gl = box.querySelector(".gddl"); if (gl) gl.scrollTop = ly;
    const on = (s, f) => box.querySelectorAll(s).forEach(x => x.onclick = () => f(x));
    on("[data-dd]", x => { keep(); st.dd = st.dd === x.dataset.dd ? null : x.dataset.dd; st.q = ""; draw(); });
    on("[data-g]", x => { keep(); const id = x.dataset.g; st.g = st.g.includes(id) ? st.g.filter(i => i !== id) : [...st.g, id]; draw(); });
    on("[data-rmg]", x => { keep(); st.g = st.g.filter(i => i !== x.dataset.rmg); draw(); });
    on("[data-role]", x => { keep(); st.roles[x.dataset.role] = st.roles[x.dataset.role] === "izle" ? "aks" : "izle"; draw(); });
    on("[data-b]", x => { keep(); const id = x.dataset.b; st.all = false; st.b = st.b.includes(id) ? st.b.filter(i => i !== id) : [...st.b, id]; if (st.b.includes(id)) autoFill([id]); draw(); });
    on("[data-ball]", () => { keep(); st.all = !st.all; st.b = st.all ? all.map(r => r.id) : []; if (st.all) autoFill(st.b); draw(); });
    on("[data-not]", () => { keep(); st.not = true; draw(); });
    on("[data-acc]", () => { keep(); st.acc = !st.acc; draw(); });
    const sq = box.querySelector("#shQ"); if (sq) { sq.oninput = e => { const p = e.target.selectionStart; st.q = e.target.value; draw(); const n = box.querySelector("#shQ"); if (n) { n.focus(); n.setSelectionRange(p, p); } }; }
    box.querySelectorAll("[data-rm]").forEach(x => x.onclick = async () => {
      const [sid, g] = x.dataset.rm.split("|"), o = st.old.find(y => y.id === sid); if (!o) return;
      const nm = o.names?.[g] || "Kişi";
      if (!(await confirmBox("Paylaşım kaldırılsın mı?", `${nm} bu paylaşımı artık göremez. Girdiği aksiyonlar sizde kalır. Diğer kişiler etkilenmez.`, "Kaldır", true))) return;
      try { await S.removeShareGuest(sid, g); o.guests = (o.guests || []).filter(i => i !== g); if (!o.guests.length) st.old = st.old.filter(y => y.id !== sid); toast("Paylaşım kaldırıldı."); } catch { toast("Kaldırılamadı."); } draw();
    });
    box.querySelector("[data-c]").onclick = close; box.querySelector("[data-go]").onclick = send;
    const sm = box.querySelector("[data-sum]"); if (sm) sm.onclick = summary;
    const tb = box.querySelector("#shT"); if (tb) tb.onclick = async () => { keep(); const r = await pickDate({ title: "Termin", min: iso(new Date()), a: st.t, view: st.t }); if (r?.a) { st.t = r.a; st.tUser = true; } draw(); };
  };
  const keep = () => { const n = box.querySelector("#shN"); if (n) st.note = n.value; };
  const send = async () => {
    keep(); const btn = box.querySelector("[data-go]"); btn.disabled = true;
    const depts = rows.filter(r => st.b.includes(r.id)).map(r => ({ id: r.id, name: r.name })), names = Object.fromEntries(st.g.map(g => [g, live.find(x => x.id === g)?.name || "Misafir"]));
    try { for (const g of st.g) await S.addShare({ fid, year: String(year), month: +month, depts, guests: [g], names: { [g]: names[g] }, roles: { [g]: st.roles[g] || "aks" }, all: !!st.all, termin: st.t, note: st.note.trim() }); }
    catch (e) { btn.disabled = false; return toast("Paylaşılamadı: " + (e.message || e)); }
    done(depts, names);
  };
  const done = (depts, names) => {
    const link = `${location.origin}${location.pathname}?denetim=${fid}.${year}.${month}.${depts[0].id}`, n = depts.reduce((a, d) => a + info[d.id].n, 0), cut = cutOf(depts.map(d => d.id));
    const wk = cut && cut >= iso(new Date()) ? `Puan için aksiyonu en geç ${fd(cut)} gününe kadar girin. ` : "";
    const msgFor = (nm, g) => `Sayın ${nm},\n${depts.map(d => d.name).join(", ")} bölümünde ${n} açık İSG bulgusu sizinle paylaşıldı. ${st.roles[g] === "izle" ? "Durumu uygulamadan canlı takip edebilirsiniz. " : wk ? wk.replace("Puan için aksiyonu en geç", "Puan için aksiyonunuzu en geç").replace("girin. ", "girmenizi rica ederiz. ") : ""}Termin: ${fd(st.t)}.${st.note.trim() ? "\nNot: " + st.note.trim() : ""}\nBağlantı: ${link}\nİyi çalışmalar dileriz.`;
    box.classList.remove("sh"); box.innerHTML = `<h2 style="margin:0;font-size:20px">Paylaşıldı</h2>
      <div class="muted" style="font-size:13px;line-height:1.5">Kişiler uygulamayı açtığında paylaşımı görür. İsterseniz mesajı ayrıca WhatsApp veya e-posta ile gönderin.</div>
      ${st.g.map(g => { const nm = names[g]; return `<div style="display:flex;align-items:center;gap:8px"><span style="flex:1;min-width:0"><b style="font-size:14px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(nm)}</b>${live.find(x => x.id === g)?.unit ? `<span style="font-style:italic;font-size:12px;color:var(--muted);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(live.find(x => x.id === g).unit)}</span>` : ""}</span>
        <a href="https://wa.me/?text=${encodeURIComponent(msgFor(nm, g))}" target="_blank" rel="noopener" aria-label="${esc(nm)} için WhatsApp mesajı" title="WhatsApp"><button type="button" class="sec" style="${IB}">${ic(WA, 17)}</button></a>
        <a href="mailto:?subject=${encodeURIComponent("İSG bulguları paylaşıldı")}&body=${encodeURIComponent(msgFor(nm, g))}" aria-label="${esc(nm)} için e-posta" title="E-posta"><button type="button" class="sec" style="${IB}">${ic(ML, 17)}</button></a></div>`; }).join("")}
      <button data-c>Kapat</button>`;
    box.querySelector("[data-c]").onclick = close;
  };
  // Durum özeti: bu ayın paylaşımlarındaki bölümler için canlı sayılar; kişi başına WhatsApp / e-posta simgeleri
  const summary = async () => {
    sm0();
    const ids = [...new Set(st.old.flatMap(o => o.all ? rows.map(r => r.id) : o.depts.map(d => d.id)))], isgg = await S.listMonthDocs(fid, year, "isgg").catch(() => []);
    const lines = []; let T = 0, K = 0, O = 0, A = 0;
    for (const id of ids) {
      const isg = await S.getMonthDoc(fid, year, "isg", keyOf(month, id)).catch(() => null);
      const it = buildItems(isg, isgg.filter(g => g.id.startsWith(keyOf(month, id) + "_fix_")));
      const k = it.filter(x => x.st === "ok").length, o = it.filter(x => x.st === "on").length, a = it.length - k - o;
      T += it.length; K += k; O += o; A += a; lines.push(`${rows.find(r => r.id === id)?.name || id}: ${k}/${it.length} aksiyon alındı`);
    }
    const msg0 = `İSG bulgu durumu\nToplam ${T} bulgu: ${K} aksiyon alındı, ${O} onay bekliyor, ${A} açık.\n${lines.join("\n")}\nSon durumu lütfen uygulamanızdaki ekrandan takip ediniz.`.replace(/\\n/g, "\n") + "\nİyi çalışmalar dileriz.", msg = msg0;
    const people = [...new Map(st.old.flatMap(o => Object.entries(o.names || {}))).entries()];
    box.innerHTML = `<h2 style="margin:0;font-size:20px">Durum özeti</h2><div style="background:var(--calc);border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.55;white-space:pre-line">${esc(msg)}</div>
      ${people.map(([g, nm]) => `<div style="display:flex;align-items:center;gap:8px"><span style="flex:1;min-width:0"><b style="font-size:14px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(nm)}</b>${live.find(x => x.id === g)?.unit ? `<span style="font-style:italic;font-size:12px;color:var(--muted);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(live.find(x => x.id === g).unit)}</span>` : ""}</span>
        <a href="https://wa.me/?text=${encodeURIComponent(`Sayın ${nm},\n` + msg)}" target="_blank" rel="noopener" aria-label="${esc(nm)} için WhatsApp mesajı"><button type="button" class="sec" style="${IB}">${ic(WA, 17)}</button></a>
        <a href="mailto:?subject=${encodeURIComponent("İSG bulgu durumu")}&body=${encodeURIComponent(`Sayın ${nm},\n` + msg)}" aria-label="${esc(nm)} için e-posta"><button type="button" class="sec" style="${IB}">${ic(ML, 17)}</button></a></div>`).join("")}
      <button data-c>Kapat</button>`;
    box.querySelector("[data-c]").onclick = close;
  };
  const sm0 = () => { box.classList.remove("sh"); box.innerHTML = '<div class="muted">Hesaplanıyor…</div>'; };
  draw();
}

// Bölüm kaydı + aksiyon istekleri → bulgu listesi: ok (aksiyon alındı) / on (aksiyon bildirildi, onay bekliyor) / ac (açık)
export function buildItems(isg, fixDocs, since = "", uid = "", fixMap = {}) {
  const reqs = {};
  for (const d of fixDocs || []) Object.entries(d?.draft?.fixReqs || {}).forEach(([k, r]) => { if (!reqs[k] || r.at > reqs[k].at) reqs[k] = r; });
  const items = [];
  for (const s of isg?.sessions || []) if (!since || (s.date && monOf(s.date) >= since) || Object.entries(s.fails || {}).some(([id, arr]) => (arr || []).some((t, j) => t && s.fixed?.[id + "|" + j]?.st !== "ok"))) for (const [id, arr] of Object.entries(s.fails || {})) (arr || []).forEach((t, j) => {
    if (!t) return; const k = id + "|" + j, f = s.fixed?.[k], r = reqs[`${s.no}|${k}`], ok = !!(f && f.t === t && f.st === "ok"), pend = !ok && !!r && r.t === t && !(f && (f.rat || 0) >= r.at), rej0 = !ok && !pend && !!(f && f.st === "rej" && f.t === t),
      // Ret yalnızca reddedilen aksiyonu bildiren misafire görünür; diğer misafirler için bulgu normal açık bulgu gibi kalır
      rej = rej0 && (!uid || (f.gu ? f.gu === uid : f.rat != null ? fixMap[uid]?.draft?.fixReqs?.[`${s.no}|${k}`]?.at === f.rat : !!f.gn && f.gn === GUEST.name));
    items.push({ no: s.no, id, j, t, st: ok ? "ok" : pend ? "on" : rej ? "rej" : "ac", why: rej ? (f.rej || "") : "", by: ok ? (f.gn || "") : "", tx: ok ? (f.tx || "") : "", before: s.photos?.[k] || [], after: ok ? (f.ph || []) : pend ? (r.ph || []) : [] });
  });
  return items;
}
// Misafir: paylaşımdaki bölümler canlı izlenir (bölüm kaydı + aksiyon istekleri + kendi gözlem taslağı); her değişiklikte cb(rows)
export async function watchGuest(fid, year, uid, cb, allRows = []) {
  const shares = await S.myShares(fid, year).catch(() => []), map = new Map();
  for (const sh of shares) for (const d of (sh.all && allRows.length ? allRows : sh.depts || [])) {
    const k = sh.month + "|" + d.id, role = sh.roles?.[uid] || "aks", e = map.get(k);
    if (!e) map.set(k, { at: sh.at || 0, since: monOf(iso(new Date(sh.at || 0))), key: k, month: sh.month, id: d.id, name: d.name, termin: sh.termin, note: sh.note || "", role, gs: new Set(sh.guests || []) });
    else { e.at = Math.max(e.at, sh.at || 0); { const w = monOf(iso(new Date(sh.at || 0))); if (w < e.since) e.since = w; } if (role === "aks") e.role = "aks"; (sh.guests || []).forEach(g => e.gs.add(g)); }
  }
  const rows = [...map.values()], st = {}, offs = [], today = iso(new Date());
  const emit = () => cb(rows.map(r => {
    const x = st[r.key] || {}, items = buildItems(x.isg, Object.values(x.fix || {}), r.since, uid, x.fix || {}), ds = (x.isg?.sessions || []).map(s => s.date).filter(Boolean).sort(), own = x.own;
    const mine = own && own.status === "review" ? Object.entries(own.draft?.marks || {}).filter(([, v]) => v === "x").flatMap(([id]) => (own.draft.notes?.[id] || []).map(t => String(t || "").trim()).filter(Boolean)) : [];
    return { at: r.at, key: r.key, month: r.month, id: r.id, name: r.name, termin: r.termin, note: r.note, role: r.role, items, mine, done: !!(x.isg?.sessions?.length), no: (x.isg?.sessions?.length || 0) + 1,
      n: items.length, ok: items.filter(i => i.st === "ok").length, on: items.filter(i => i.st === "on").length, ac: items.filter(i => i.st === "ac" || i.st === "rej").length,
      lt: items.filter(i => (i.st === "ac" || i.st === "rej") && r.termin < today).length, cut: ds.length ? addDays(monOf(ds[ds.length - 1]), 5) : "" };
  }));
  for (const r of rows) {
    st[r.key] = { fix: {} }; const base = keyOf(r.month, r.id);
    offs.push(S.watchMonthDoc(fid, year, "isg", base, d => { st[r.key].isg = d; emit(); }));
    for (const g of r.gs) offs.push(S.watchMonthDoc(fid, year, "isgg", `${base}_fix_${g}`, d => { st[r.key].fix[g] = d; emit(); }));
    offs.push(S.watchMonthDoc(fid, year, "isgg", `${base}_${uid}`, d => { st[r.key].own = d; emit(); }));
  }
  emit();
  return () => offs.forEach(f => { try { f && f(); } catch { } });
}
const stack = c => `<div style="display:flex;height:10px;border-radius:99px;overflow:hidden;background:#EEF3F1">${[[c.ok, "#17A06F"], [c.on, "#F5B700"], [c.ac, "#C3D1CC"]].map(([v, bg]) => c.n ? `<i style="display:block;height:100%;width:${v / c.n * 100}%;background:${bg}"></i>` : "").join("")}</div>`;
const PILL = { ok: ["#D9F1E6", "#0B6E4F", "Aksiyon alındı"], on: ["#FFF3D6", "#6B3F00", "Onay bekliyor"], ac: ["#EEF3F1", "#3E534E", "Açık"], rej: ["#FDECEA", "#7A1C14", "Reddedildi"] };
const th = l => l.map(p => `<span class="pth"><img src="${p.t}" data-pv="${p.id}" alt="Fotoğraf"></span>`).join("");
// ui: { open, openB } – kart varsayılan kapalı, bölümler varsayılan kapalı
export function guestCard(rows, ui = {}) {
  if (!rows?.length) return "";
  const T = rows.reduce((a, r) => ({ n: a.n + r.n, ok: a.ok + r.ok, on: a.on + r.on, ac: a.ac + r.ac, lt: a.lt + r.lt }), { n: 0, ok: 0, on: 0, ac: 0, lt: 0 }), open = !!ui.open;
  const cut = rows.map(r => r.cut).filter(Boolean).sort().pop() || "", today = iso(new Date()), onlyWatch = rows.every(r => r.role === "izle");
  const pct = T.n ? Math.round(T.ok / T.n * 100) : 0, flt = ui.flt || "ac";
  const chips = [["ac", "Açık"], ["on", "Onay bekliyor"], ["all", "Tümü"]].map(([k, l]) => `<button type="button" data-shf="${k}" style="flex:0 0 auto;height:34px;padding:0 14px;border-radius:99px;font-size:13px;font-weight:700;${flt === k ? "background:#0B2230;color:#fff;border:1px solid #0B2230" : "background:var(--card);color:var(--text);border:1px solid var(--inl)"}">${l}</button>`).join("");
  return `<div class="cd" style="padding:16px 20px;gap:10px"><button type="button" data-shrt aria-expanded="${open}" style="display:flex;align-items:center;gap:12px;width:100%;min-height:44px;height:auto;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;font-weight:400"><span style="flex:1;min-width:0"><b style="font:600 16px Sora,sans-serif;display:block">Bana paylaşılanlar (${T.ac + T.on})</b><span class="muted" style="font-size:12.5px;line-height:1.5">${onlyWatch ? "Yalnızca izlersiniz. " : ""}${T.ok}/${T.n} aksiyon alındı</span></span><span style="transform:rotate(${open ? 180 : 0}deg);display:flex">${ic('<path d="M6 9l6 6 6-6"/>')}</span></button>
    ${open ? `<div style="display:flex;align-items:center;justify-content:space-between"><span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#0B6E4F"><b style="width:8px;height:8px;border-radius:50%;background:#17A06F;display:inline-block"></b>Canlı takip</span><b style="font:700 18px Sora,sans-serif;color:#0B6E4F">%${pct}</b></div>${stack(T)}
    <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--muted)"><span>Aksiyon alındı ${T.ok}</span><span>Onay bekliyor ${T.on}</span><span>Açık ${T.ac}</span>${T.lt ? `<span style="color:#B3261E;font-weight:700">Gecikti ${T.lt}</span>` : ""}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${chips}</div>
    ${!onlyWatch && cut && cut >= today ? `<div style="border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.5;background:#E3F0F9;border:1px solid #BCD6EA;color:#143B5B"><b>Puan için:</b> Aksiyonu en geç ${fd(cut)} gününe kadar girin. Sonrasında aksiyon görünür, ama puan değişmez.</div>` : ""}
    ${rows.map(r => { const o = ui.openB === r.key; return `<div class="sess" style="flex-direction:column;align-items:stretch;gap:8px"><button type="button" data-shrb="${r.key}" aria-expanded="${o}" style="display:flex;align-items:center;gap:10px;width:100%;min-height:44px;height:auto;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;font-weight:400"><span style="flex:1;min-width:0"><b style="font:600 15px Sora,sans-serif;display:block">${esc(r.name)}</b><span class="muted" style="font-size:12.5px">${r.ok}/${r.n} aksiyon alındı${r.lt ? ` · <b style="color:#B3261E">${r.lt} gecikti</b>` : ""}</span></span><span style="transform:rotate(${o ? 180 : 0}deg);display:flex">${ic('<path d="M6 9l6 6 6-6"/>')}</span></button>${stack(r)}
      ${o ? `${r.note ? `<div style="font-style:italic;font-size:12.5px;color:var(--muted)">${esc(r.note)}</div>` : ""}${r.items.filter(i => flt === "all" || (flt === "ac" ? i.st === "ac" || i.st === "rej" : i.st === flt)).map(i => { const [bg, fg, tx] = PILL[i.st], late = (i.st === "ac" || i.st === "rej") && r.termin < today; return `<div style="border:1px solid var(--line);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px;background:var(--card)"><div style="font-size:14px;line-height:1.45">${esc(i.t)}</div>${i.st === "rej" ? `<div style="background:#FDECEA;border:1px solid #F3B8B2;color:#7A1C14;border-radius:10px;padding:8px 10px;font-size:12.5px;line-height:1.45"><b>Gerekçe:</b> ${esc(i.why || "Belirtilmedi")}</div>` : ""}${i.before.length || i.after.length ? `<div style="display:grid;grid-template-columns:${i.before.length && i.after.length ? "1fr 1fr" : "1fr"};gap:6px">${i.before.length ? `<div><span class="hd" style="font-size:11px">${i.after.length ? "ÖNCE" : "TESPİT FOTOĞRAFI"}</span><div class="phs" style="padding:0">${th(i.before)}</div></div>` : ""}${i.after.length ? `<div><span class="hd" style="font-size:11px">SONRA</span><div class="phs" style="padding:0">${th(i.after)}</div></div>` : ""}</div>` : ""}${i.st === "ok" ? `<div style="font-size:12.5px;line-height:1.45;color:var(--muted)"><b>Aksiyon kapatan:</b> ${esc(i.by === "Görev takip" || !i.by ? "Yetkili" : i.by)}${i.tx ? " · " + esc(i.tx) : ""}</div>` : ""}<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12.5px;color:var(--muted)"><span style="font-size:12px;font-weight:700;padding:3px 10px;border-radius:99px;background:${bg};color:${fg}">${tx}</span>${late ? '<span style="font-size:12px;font-weight:700;padding:3px 10px;border-radius:99px;background:#D6382E;color:#fff">Gecikti</span>' : ""}<span>Termin: ${fd(r.termin)}</span></div>${r.role === "aks" && (i.st === "ac" || i.st === "rej") ? `<button class="sec" data-gfxk="${r.month}|${r.id}|${i.no}|${i.id}|${i.j}" style="height:42px">${i.st === "rej" ? "Düzeltip yeniden gönder" : "Aksiyon bildir"}</button>` : ""}</div>`; }).join("")}
        ${!r.done ? '<div style="font-style:italic;font-size:12.5px;color:var(--muted);line-height:1.5">Henüz denetim yapılmadı. Bulgular kaydedildiğinde canlı olarak aktarılacaktır.</div>' : ""}${r.mine.map(t => `<div style="border:1px dashed var(--inl);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px"><div style="font-size:14px;line-height:1.45">${esc(t)}</div><span style="font-size:12px;font-weight:700;padding:3px 10px;border-radius:99px;background:#FFF3D6;color:#6B3F00;align-self:flex-start">Yeni bulgu · onay bekliyor</span></div>`).join("")}
        <button class="sec" data-shro="${r.key}" style="height:42px">+ Gözlemimi ekle</button>` : ""}</div>`; }).join("")}` : ""}</div>`;
}
// Misafir: kendi gözlemini bulgu olarak ekler → mevcut misafir taslağına yazılır ve onay için yetkiliye gider
export function obsDialog({ fid, year, row, uid, name, factoryName = "", onDone = () => {} }) {
  const m = document.createElement("div"); m.className = "mod";
  m.innerHTML = '<div class="mbox pf" role="dialog" aria-modal="true" style="gap:12px"></div>'; document.body.appendChild(m);
  const box = m.querySelector(".mbox"), close = () => m.remove(); m.addEventListener("mousedown", e => { if (e.target === m) close(); });
  const d = { ci: 0, ii: 0, t: "", ph: null };
  const draw = () => {
    box.innerHTML = `<h2 style="margin:0;font-size:20px">Gözlem ekle · ${esc(row.name)}</h2><div class="muted" style="font-size:13px;line-height:1.5">Bulgunuz yetkiliye gider. Onaylanınca haftalık denetim listesine eklenir.</div>
      <div><label class="hd" for="obC" style="margin:0">KATEGORİ</label><select id="obC" class="inp" style="margin-top:4px">${CATS.map((c, i) => `<option value="${i}" ${i === d.ci ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
      <div><label class="hd" for="obI" style="margin:0">MADDE</label><select id="obI" class="inp" style="margin-top:4px">${CATS[d.ci].items.map((t, i) => `<option value="${i}" ${i === d.ii ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
      <div><label class="hd" for="obT" style="margin:0">BULGU</label><textarea id="obT" class="inp" style="margin-top:4px;height:auto;min-height:72px;padding:10px;resize:vertical" placeholder="Gözlemlediğiniz bulguyu yazın">${esc(d.t)}</textarea></div>
      ${d.ph ? `<div class="phs" style="padding:0"><span class="pth"><img src="${d.ph.t}" alt="Fotoğraf"></span></div>` : ""}
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px"><label style="${PB}">${ic('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.6"/>', 24).replace("currentColor", "#0B6E4F")}<span>Fotoğraf çek</span><input type="file" accept="image/*" capture="environment" id="obF" hidden></label><label style="${PB}">${ic('<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 9"/>', 24).replace("currentColor", "#2A82C4")}<span>Galeriden seç</span><input type="file" accept="image/*" id="obG" hidden></label></div>${d.ph ? '<div class="muted" style="font-size:12.5px;text-align:center">Fotoğraf eklendi. Değiştirmek için tekrar çekin veya seçin.</div>' : ""}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="sec" data-c>Vazgeç</button><button data-go ${d.t.trim() && d.ph ? "" : "disabled"}>Onaya gönder</button></div>`;
    box.querySelector("#obC").onchange = e => { d.t = box.querySelector("#obT").value; d.ci = +e.target.value; d.ii = 0; draw(); };
    box.querySelector("#obI").onchange = e => { d.ii = +e.target.value; };
    box.querySelector("#obT").oninput = e => { d.t = e.target.value; box.querySelector("[data-go]").disabled = !(d.t.trim() && d.ph); };
    const pick = async e => { const f = e.target.files[0]; if (!f) return; d.t = box.querySelector("#obT").value; try { const { full, thumb } = await compressImage(f), pid = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await S.savePhoto(fid, year, pid, full); d.ph = { id: pid, t: thumb }; } catch (er) { toast("Fotoğraf eklenemedi: " + (er.message || er)); } draw(); };
    box.querySelector("#obF").onchange = pick; box.querySelector("#obG").onchange = pick;
    box.querySelector("[data-c]").onclick = close; box.querySelector("[data-go]").onclick = send;
  };
  const send = async () => {
    const btn = box.querySelector("[data-go]"); btn.disabled = true;
    const id = `c${d.ci}i${d.ii}`, key = `${keyOf(row.month, row.id)}_${uid}`, now = new Date(), mm = pad(+row.month);
    try {
      let g = await S.getMonthDoc(fid, year, "isgg", key).catch(() => null);
      const date = +row.month === now.getMonth() + 1 && +year === now.getFullYear() ? iso(now) : `${year}-${mm}-01`;
      let dr = g && g.status !== "approved" && g.draft ? g.draft : { marks: {}, notes: {}, ydNotes: {}, photos: {}, date, on: true, edit: null };
      dr = { ...dr, marks: { ...dr.marks, [id]: "x" }, notes: { ...dr.notes }, photos: { ...dr.photos } };
      const cur = (dr.notes[id] || []).filter((t, i, a) => !(a.length === 1 && !String(t).trim())), k = cur.length;
      dr.notes[id] = [...cur, d.t.trim()]; dr.photos[`${id}|${k}`] = [d.ph];
      await S.saveMonthDoc(fid, year, "isgg", key, { guestUid: uid, guestName: name, dept: row.id, month: +row.month, status: "review", draft: dr, at: Date.now() });
      Guest.reportAudit({ fid, year, month: row.month, dept: row.id, deptName: row.name, factoryName, no: row.no }, "review");
    } catch (e) { btn.disabled = false; return toast("Gönderilemedi: " + (e.message || e)); }
    close(); toast("Gözlem yetkiliye gönderildi."); onDone();
  };
  draw();
}

// Yeni paylaşım bilgi şeridi: son kapatılandan sonra gelen paylaşım varsa görünür
const seenKey = uid => "hse_shseen_" + uid;
const seenAt = uid => { try { return +localStorage.getItem(seenKey(uid)) || 0; } catch { return 0; } };
export function shareBanner(rows, uid) {
  const fresh = (rows || []).filter(r => (r.at || 0) > seenAt(uid));
  if (!fresh.length) return "";
  const n = fresh.reduce((a, r) => a + r.ac + r.on, 0), names = [...new Set(fresh.map(r => r.name))].join(", ");
  return `<div class="okbar" style="display:flex;align-items:center;gap:10px"><span style="flex:1;min-width:0;line-height:1.45">Size yeni bir paylaşım yapıldı: ${esc(names)} · ${n} açık bulgu</span><button type="button" class="sec" data-shrx style="flex:0 0 auto;height:34px;padding:0 12px;font-size:12.5px">Kapat</button></div>`;
}
export function dismissBanner(rows, uid) {
  const m = Math.max(0, ...(rows || []).map(r => r.at || 0));
  try { localStorage.setItem(seenKey(uid), String(m)); } catch { }
}
