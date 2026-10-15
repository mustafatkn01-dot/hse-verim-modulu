// Ramak Kala bildirimleri: ay bazında kayıt, bildiren bölümün bonus kademesi, misafir kaydı için yetkili onayı
// Koleksiyon "ramak": her bildirim ayrı kayıt. status: approved (yetkili kaydı / onaylı) | pending (misafir, onay bekliyor) | rejected
import * as S from "./store.js?v=20261015d";
import * as Guest from "./guest.js?v=20261015d";
import * as Gorev from "./gorev.js?v=20261015d";
import { esc, toast, pickDate, fmtTarih, compressImage, showPhoto, confirmBox, GUEST, guestLock, roText } from "./ui.js?v=20261015d";
import { CATS } from "./isgcats.js?v=20261015d";
import { calcIsg, katsayi, bandOf, MONTHS, DEFAULT_PARAMS } from "./scoring.js?v=20261015d";

export const COLL = "ramak";
export const TIER = ["Yok", "Ayda 1", "2 Haftada 1", "Haftalık"];
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const eid = () => "r" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

// ---- Hesap ----
// 1 bildirim → Ayda 1, 2-3 → 2 Haftada 1, 4 ve üzeri → Haftalık
export const tierIdx = n => n >= 4 ? 3 : n >= 2 ? 2 : n >= 1 ? 1 : 0;
export const load = async (fid, year, month) => (await S.listMonthDocs(fid, year, COLL)).filter(x => +x.month === +month);
// Puana yalnızca onaylı "Bölümden bildirim" kayıtları girer (bildiren bölüm başına)
export function counts(recs) { const c = {}; recs.forEach(r => { if (r.src === "b" && r.status === "approved" && r.dept) c[r.dept] = (c[r.dept] || 0) + 1; }); return c; }
// Eski kayıtlarda elle seçilmiş (>0) kademe, elle sayılır; "bonusMan" yoksa bunu çıkarırız
export const isMan = doc => doc?.bonusMan === true || (doc?.bonusMan === undefined && (doc?.bonus || 0) > 0);

export function isgResult(doc, row, m, p) {
  const c = calcIsg({ cats: CATS, sessions: doc.sessions, draft: { marks: {}, notes: {}, ydNotes: {} }, freqOv: doc.freq, bonusIdx: doc.bonus, F: katsayi(row, +m), p });
  return { score: +c.score.toFixed(2), penalty: +c.penalty.toFixed(2), bonus: c.bonus, den: c.den, total: c.total, ydPct: c.ydPct, band: bandOf(c.score, p), F: +katsayi(row, +m).toFixed(2), sessions: doc.sessions.length };
}
// Kayıtlar değişince, elle seçilmemiş bölüm-ay denetim kayıtlarının bonusunu ve sonucunu günceller (sahip)
export async function syncBonus(fid, year, month, setup, recs) {
  if (GUEST.on) return;
  const c = counts(recs), p = setup.params || DEFAULT_PARAMS;
  for (const row of setup.rows) {
    const id = `${pad(month)}_${row.id}`, doc = await S.getMonthDoc(fid, year, "isg", id).catch(() => null);
    if (!doc || !doc.sessions?.length || isMan(doc)) continue;
    const idx = tierIdx(c[row.id] || 0);
    if ((doc.bonus || 0) === idx && doc.bonusMan === false) continue;
    const nd = { ...doc, bonus: idx, bonusMan: false }; nd.result = isgResult(nd, row, month, p);
    await S.saveMonthDoc(fid, year, "isg", id, nd).catch(() => { });
  }
}


// Açılır liste: işletim sisteminin ayrı seçim penceresi yerine, kutunun hemen altında açılan liste
const CHV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
function ddHtml(id, opts, val, label, ph = "") {
  const cur = opts.find(o => o[0] === val);
  return `<div class="dd" data-dd="${id}"><input type="hidden" id="${id}" value="${esc(val)}"><button type="button" class="inp dd-b" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(label)}"><span${cur ? "" : ' class="dd-ph"'}>${esc(cur ? cur[1] : ph)}</span>${CHV}</button>
    <div class="dd-l" role="listbox" hidden>${opts.map(o => `<button type="button" role="option" class="dd-o${o[0] === val ? " on" : ""}" data-v="${esc(o[0])}">${esc(o[1])}</button>`).join("")}</div></div>`;
}
function ddBind(root, onPick) {
  root.querySelectorAll(".dd").forEach(d => {
    const b = d.querySelector(".dd-b"), l = d.querySelector(".dd-l"), h = d.querySelector("input");
    const set = (v, fire) => { h.value = v; d.querySelectorAll(".dd-o").forEach(o => { const on = o.dataset.v === v; o.classList.toggle("on", on); if (on) { b.firstElementChild.textContent = o.textContent; b.firstElementChild.classList.remove("dd-ph"); } }); if (fire) onPick(d.dataset.dd, v); };
    d._set = set;
    b.onclick = () => { const o = l.hidden; root.querySelectorAll(".dd-l").forEach(x => { x.hidden = true; }); root.querySelectorAll(".dd-b").forEach(x => x.setAttribute("aria-expanded", "false")); l.hidden = !o; b.setAttribute("aria-expanded", String(o)); };
    l.querySelectorAll(".dd-o").forEach(o => o.onclick = () => { set(o.dataset.v, true); l.hidden = true; b.setAttribute("aria-expanded", "false"); });
  });
}

// ---- Bildirim ekranı ----
// ctx: { st, setup, month, dept, recs } → eklenen kayıt veya null
export function openForm({ st, setup, month, dept = "", recs = [], edit = null }) {
  return new Promise(res => {
    const owner = !GUEST.on, f = { src: edit?.src || "", ph: [...(edit?.photos || [])], d: "", busy: false }, orig = new Set((edit?.photos || []).map(p => p.id));
    if (edit) dept = edit.dept || "";
    const ms = `${st.year}-${pad(month)}-01`, me = iso(new Date(+st.year, +month, 0)), td = iso(new Date());
    f.d = edit?.d || (td >= ms && td <= me ? td : me);
    const maxD = td < me ? (td < ms ? ms : td) : me;
    const m = document.createElement("div"); m.className = "mod";
    m.innerHTML = `<div class="mbox rk" role="dialog" aria-modal="true" aria-labelledby="rkT">
      <h2 id="rkT">${edit ? "Ramak Kala Bildirimini Düzenle" : "Ramak Kala Bildirimi"}</h2>
      <div class="muted" style="font-size:13px;line-height:1.5">${edit ? "Değişiklik kaydedilince listede güncellenir." : owner ? "Kayıt hemen listeye eklenir." : "Kayıt yetkili onayından sonra puana sayılır."}</div>
      <div class="f"><label>KAYNAK</label>${ddHtml("rkSrc", [["b", "Bölümden bildirim (puanlı)"], ["s", "Saha gözlemi (puansız, yalnızca takip)"]], f.src, "Kaynak", "Lütfen bildirim kaynağını seçin")}</div>
      <div class="two" id="rkB"><div class="f"><label>BİLDİREN BÖLÜM <span class="req">*</span></label>${ddHtml("rkD", setup.rows.map(r => [r.id, r.name]), dept, "Bildiren bölüm", "Lütfen bildiren bölümü seçin")}</div>
        <div class="f"><label for="rkW">BİLDİREN KİŞİ <span class="req">*</span></label><input id="rkW" class="inp" placeholder="Ad Soyad" autocomplete="off" maxlength="80"></div></div>
      <div class="two"><div class="f"><label>TARİH <span class="req">*</span></label><button type="button" class="inp" id="rkT2" style="display:flex;align-items:center;justify-content:space-between;text-align:left"><span id="rkTt">${fmtTarih(f.d)}</span></button></div>
        <div class="f"><label for="rkP">OLAY YERİ / MAKİNE</label><input id="rkP" class="inp" placeholder="Örn. Pres 3 yanı" autocomplete="off" maxlength="120"></div></div>
      <div class="f"><label for="rkX">NE OLDU? <span class="req">*</span></label><textarea id="rkX" class="inp" maxlength="1000" placeholder="Ramak kala olayını ve olası sonucunu yazın"></textarea></div>
      <div class="f"><label for="rkO">ÖNERİ / ALINAN ÖNLEM</label><textarea id="rkO" class="inp" maxlength="1000" style="min-height:64px" placeholder="İsteğe bağlı"></textarea></div>
      <div class="f"><label>FOTOĞRAF</label><div class="rphs" id="rkPh"></div><div style="display:flex;gap:8px;margin-top:8px;justify-content:center"><label style="display:flex;flex:1 1 0;align-items:center;justify-content:center;gap:6px;border-radius:10px;border:1px solid var(--gd);color:var(--gd);height:40px;padding:0 10px;margin:0;cursor:pointer;font-size:11px;font-style:italic;font-weight:700;background:var(--card)">+ Fotoğraf çek<input id="rkFc" type="file" accept="image/*" capture="environment" hidden></label><label style="display:flex;flex:1 1 0;align-items:center;justify-content:center;gap:6px;border-radius:10px;border:1px solid var(--gd);color:var(--gd);height:40px;padding:0 10px;margin:0;cursor:pointer;font-size:11px;font-style:italic;font-weight:700;background:var(--card)">+ Fotoğraf ekle<input id="rkF" type="file" accept="image/*" multiple hidden></label></div></div>
      <div id="rkE" class="eff"></div><div class="err" id="rkR"></div>
      <div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><button class="sec" id="rkC">İptal</button><button id="rkS">Kaydet</button></div></div>`;
    document.body.appendChild(m);
    const q = s => m.querySelector(s), done = v => { m.remove(); res(v); };
    const cnt = counts(recs.filter(r => !edit || r.id !== edit.id));
    if (edit) { q("#rkW").value = edit.who || ""; q("#rkP").value = edit.place || ""; q("#rkX").value = edit.txt || ""; q("#rkO").value = edit.tip || ""; q("#rkPh").innerHTML = f.ph.map(p => `<img src="${p.t}" alt="Fotoğraf">`).join(""); }
    const eff = () => {
      const e = q("#rkE");
      if (!f.src) { e.className = "eff"; e.innerHTML = "Önce bildirim kaynağını seçin."; return; }
      if (f.src === "s") { e.className = "eff no"; e.innerHTML = "Saha gözlemi puana etki etmez. Kayıt takip için listeye girer."; return; }
      const d = q("#rkD").value; if (!d) { e.className = "eff"; e.innerHTML = "Bildiren bölümü seçtiğinizde puana etkisi burada görünür."; return; }
      const row = setup.rows.find(r => r.id === d), p = setup.params || DEFAULT_PARAMS, v = [0, +p.isg.r1, +p.isg.r2, +p.isg.r3], n0 = cnt[d] || 0, n1 = n0 + (owner ? 1 : 0), k0 = tierIdx(n0), k1 = tierIdx(n1);
      e.className = "eff";
      e.innerHTML = owner ? `<b>${esc(row.name)}</b>: bu ayki bildirim ${n0} → <b>${n1}</b>. Kademe: <b>${TIER[k1]}</b> (+${v[k1]} puan${k1 !== k0 ? `, şu an +${v[k0]}` : ""}).`
        : `<b>${esc(row.name)}</b> için bu kayıt yetkili onayından sonra sayılır. Şu an ${n0} onaylı bildirim, kademe <b>${TIER[k0]}</b>.`;
    };
    const sync = () => { q("#rkB").style.display = f.src === "b" ? "" : "none"; eff(); };
    ddBind(m, (id, v) => { if (id === "rkSrc") { f.src = v; sync(); } else eff(); });
    q("#rkT2").onclick = async () => { const r = await pickDate({ title: "Tarih", min: ms, max: maxD, a: f.d, view: ms }); if (r?.a) { f.d = r.a; q("#rkTt").textContent = fmtTarih(f.d); } };
    q("#rkF").onchange = q("#rkFc").onchange = async e => {
      const files = [...e.target.files]; e.target.value = ""; q("#rkR").textContent = files.length ? "Fotoğraf hazırlanıyor…" : "";
      for (const file of files) {
        if (f.ph.length >= 4) { q("#rkR").textContent = "En çok 4 fotoğraf eklenebilir."; break; }
        try { const { full, thumb } = await compressImage(file), id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await S.savePhoto(st.fid, st.year, id, full); f.ph.push({ id, t: thumb }); q("#rkR").textContent = ""; }
        catch (er) { q("#rkR").textContent = "Fotoğraf eklenemedi: " + (er.message || er); }
      }
      q("#rkPh").innerHTML = f.ph.map(p => `<img src="${p.t}" alt="Seçilen fotoğraf">`).join("");
    };
    const cancel = () => { f.ph.filter(p => !orig.has(p.id)).forEach(p => S.deletePhoto(st.fid, st.year, p.id).catch(() => { })); done(null); };
    q("#rkC").onclick = cancel; m.addEventListener("mousedown", e => { if (e.target === m) cancel(); });
    q("#rkS").onclick = async () => {
      if (f.busy) return;
      const need = [], b = f.src === "b"; if (!f.src) need.push("kaynak");
      if (b) { if (!q("#rkD").value) need.push("bildiren bölüm"); if (!q("#rkW").value.trim()) need.push("bildiren kişi"); }
      if (!q("#rkX").value.trim()) need.push("açıklama");
      if (need.length) { q("#rkR").textContent = "Eksik alan: " + need.join(", ") + "."; return; }
      const rec = { month: +month, d: f.d, src: f.src, dept: b ? q("#rkD").value : "", who: b ? q("#rkW").value.trim() : "", place: q("#rkP").value.trim(), txt: q("#rkX").value.trim(), tip: q("#rkO").value.trim(), photos: f.ph, at: Date.now() };
      f.busy = true; q("#rkS").disabled = true;
      try {
        let id;
        if (edit) { id = edit.id; const { id: _i, ...old } = edit; Object.assign(rec, { ...old, ...rec, at: edit.at }); f.ph.length || (rec.photos = []); }
        else if (owner) { id = `${pad(month)}_${eid()}`; Object.assign(rec, { status: "approved", by: "Yetkili" }); }
        else { id = `${pad(month)}_${GUEST.uid}_${Date.now().toString(36)}`; Object.assign(rec, { status: "pending", guestUid: GUEST.uid, guestName: GUEST.name }); }
        await S.saveMonthDoc(st.fid, st.year, COLL, id, rec);
        if (edit) (edit.photos || []).filter(p => !f.ph.some(x => x.id === p.id)).forEach(p => S.deletePhoto(st.fid, st.year, p.id).catch(() => { }));
        if (!owner && !edit) { const dn = setup.rows.find(r => r.id === rec.dept)?.name || "saha gözlemi"; Guest.pushOwner("HSE Verim · Ramak kala", `${GUEST.name} · ${dn}: ramak kala bildirimi ekledi, onayınızı bekliyor.`); }
        done({ id, ...rec });
      } catch (er) { f.busy = false; q("#rkS").disabled = false; q("#rkR").textContent = "Kaydedilemedi: " + (er.message || er); }
    };
    sync();
  });
}

// ---- Sayfa ----
const R = { key: "", month: null, recs: [], setup: null, open: false, ctx: null, v: null };
export function focus(month) { R.month = +month; R.key = ""; }
const dmy = s => (s ? fmtTarih(s) : "");
const nm = id => R.setup.rows.find(r => r.id === id)?.name || "—";

export async function render(v, ctx) {
  const { st } = ctx;
  const setup = await S.getSetup(st.fid, st.year);
  if (!setup?.rows?.length) { v.innerHTML = `<div class="cd"><h2>Önce bölümleri tanımlayın</h2><p class="sub">Ramak kala girişi için Kurulum ve Kayıtlar sayfasında en az bir bölüm kaydedilmeli.</p><div><a href="#kurulum"><button>Kurulum'a git</button></a></div></div>`; return; }
  if (!R.month) { const n = new Date(); R.month = +st.year === n.getFullYear() ? n.getMonth() + 1 : 1; }
  R.setup = setup; R.ctx = ctx; R.v = v;
  R.recs = await load(st.fid, st.year, R.month).catch(() => []);
  R.ro = String(st.year) !== String(st.active) || guestLock(st.year, R.month);
  draw();
}
function draw() {
  const { st } = R.ctx, v = R.v, p = R.setup.params || DEFAULT_PARAMS, vals = [0, +p.isg.r1, +p.isg.r2, +p.isg.r3], c = counts(R.recs);
  const vis = R.recs.filter(r => !GUEST.on || r.status === "approved" || r.guestUid === GUEST.uid).slice().sort((a, b) => String(b.d).localeCompare(String(a.d)) || (b.at || 0) - (a.at || 0));
  const ok = R.recs.filter(r => r.status === "approved"), wait = R.recs.filter(r => r.status === "pending").length;
  v.innerHTML = `
  <div><div class="hd" style="letter-spacing:.8px">AYLIK VERİ GİRİŞİ</div><h1 class="ttl">Ramak Kala Bildirimleri</h1>
    <div class="sub">Bölümlerden gelen ramak kala bildirimlerini ekleyin. Bildirimi yapan bölüm, ay içindeki bildirim sayısına göre bonus puan alır. Saha gözlemi puan getirmez, yalnızca takip edilir.</div></div>
  ${R.ro ? `<div class="warn">${roText(st.year, R.month, st.active)}</div>` : ""}
  <div class="row" style="gap:10px;align-items:center;flex-wrap:nowrap">
    <select id="rkAy" class="inp" style="font-weight:600;flex:1">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === R.month ? "selected" : ""}>${m} ${st.year}</option>`).join("")}</select>
    ${R.ro ? "" : `<button id="rkAdd" style="flex:0 0 auto;height:40px;display:flex;align-items:center;gap:8px"><b style="font-size:20px;line-height:1">+</b> Bildirim ekle</button>`}</div>
  <div class="grid3">
    <div class="cd tile"><span class="hd">BU AY BİLDİRİM</span><b>${ok.length}</b></div>
    <div class="cd tile"><span class="hd">PUANLI</span><b>${ok.filter(r => r.src === "b").length}</b></div>
    <div class="cd tile"><span class="hd">ONAY BEKLEYEN</span><b>${wait}</b></div></div>
  <div class="cd"><div><h2>Bölüm Bazında Bonus</h2><div class="muted" style="font-size:13px;line-height:1.5">Yalnızca onaylı “Bölümden bildirim” kayıtları sayılır. Kademe: 1 bildirim → Ayda 1 (+${vals[1]}), 2-3 → 2 Haftada 1 (+${vals[2]}), 4 ve üzeri → Haftalık (+${vals[3]}).</div></div>
    <div class="blist">${R.setup.rows.map(r => { const n = c[r.id] || 0, k = tierIdx(n); return `<div class="brow"><b>${esc(r.name)}</b><span class="n">${n}</span><span class="kp k${k}"><span>${TIER[k]}</span><span>${vals[k] ? "+" + vals[k] : "0"} puan</span></span></div>`; }).join("")}</div></div>
  <div class="cd" style="gap:12px"><button type="button" id="rkTg" aria-expanded="${R.open}" style="display:flex;align-items:center;gap:12px;width:100%;min-height:40px;height:auto;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer"><span style="flex:1;min-width:0"><h2 style="margin:0">Bu Ayın Kayıtları</h2>
    <span class="muted" style="font-size:13px;display:block;margin-top:4px;font-weight:600">${vis.length} kayıt${wait && !GUEST.on ? ' · <i style="color:#B26A00">' + wait + " onay bekliyor</i>" : ""}</span></span>
    <span style="flex:0 0 40px;width:40px;height:40px;border-radius:12px;border:1.5px solid var(--gd);color:var(--gd);box-sizing:border-box;display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${R.open ? 180 : 0}deg)"><path d="M6 9l6 6 6-6"/></svg></span></button>
    ${R.open ? `<div>${vis.map(r => {
    const pts = r.src === "b" ? (r.status === "approved" ? `<span class="chip pts">Puanlı · ${esc(nm(r.dept))}</span>` : "") : `<span class="chip">Saha gözlemi · puan yok</span>`;
    const stc = r.status === "pending" ? `<span class="chip wait">Onay bekliyor · puan sayılmadı</span>` : r.status === "rejected" ? `<span class="chip rej">Reddedildi</span>` : "";
    let gv = ""; const mine = GUEST.on && r.guestUid === GUEST.uid, acts = [];
    if (!GUEST.on && !R.ro && r.status === "pending") acts.push(`<button class="sm" data-ra="ok|${r.id}">Onayla</button><button class="sm sec" data-ra="no|${r.id}">Reddet</button>`);
    if (!GUEST.on && r.status === "approved") gv = Gorev.chip(Gorev.noteKey("r", st.fid, st.year, R.month, r.dept || "saha", r.id, r.txt), { tip: "ramak", fab: st.factories?.find(f => f.id === st.fid)?.name || "", yil: +st.year, ay: R.month, tarih: r.d, bolum: r.src === "b" ? nm(r.dept) : "", kisi: r.who || "", yer: r.place || "", metin: r.txt, oneri: r.tip || "", ...(r.photos?.[0]?.id ? { fotoId: r.photos[0].id, fotoFid: st.fid, fotoYil: st.year } : {}), url: location.origin + location.pathname + "#ramak" });
    if (!GUEST.on && !R.ro) acts.push(`<button class="sm sec" data-ra="edit|${r.id}">Düzenle</button>`);
    if (GUEST.on ? mine && r.status === "pending" : !R.ro) acts.push(`<button class="sm sec" data-ra="del|${r.id}" style="color:#B3261E;border-color:#B3261E">Sil</button>`);
    const who = r.src === "b" ? `Bildiren: <b>${esc(nm(r.dept))}</b> · ${esc(r.who)}` : "Saha gözlemi";
    return `<div class="rrec"><div class="rh"><b>${dmy(r.d)}</b><span class="muted" style="font-size:12.5px;text-align:right">${esc(r.by || r.guestName || "Misafir")}${r.guestName ? " (Misafir)" : ""}</span></div>
      <div class="muted" style="font-size:13px">${who}${r.place ? " · " + esc(r.place) : ""}</div>
      <div class="rt">${esc(r.txt)}${r.tip ? ` <i>Öneri: ${esc(r.tip)}</i>` : ""}</div>
      ${r.photos?.length ? `<div class="rphs">${r.photos.map(ph => `<img src="${ph.t}" data-pv="${ph.id}" alt="Fotoğraf">`).join("")}</div>` : ""}
      <div class="rchips"><div class="chips">${pts}${stc}</div>${gv}</div>${acts.length ? `<div class="racts">${acts.join("")}</div>` : ""}</div>`;
  }).join("") || '<span class="muted">Bu ay henüz kayıt yok.</span>'}</div>` : ""}</div>`;
  v.querySelector("#rkAy").onchange = e => { R.month = +e.target.value; render(R.v, R.ctx); };
  v.querySelector("#rkTg").onclick = () => { R.open = !R.open; draw(); };
  const add = v.querySelector("#rkAdd");
  if (add) add.onclick = async () => {
    const r = await openForm({ st, setup: R.setup, month: R.month, recs: R.recs });
    if (!r) return;
    R.recs = await load(st.fid, st.year, R.month).catch(() => R.recs); R.open = true;
    if (!GUEST.on) await syncBonus(st.fid, st.year, R.month, R.setup, R.recs);
    draw(); toast(GUEST.on ? "Kayıt gönderildi, yetkili onayından sonra puana sayılır." : "Kayıt eklendi.");
  };
  v.querySelectorAll("[data-pv]").forEach(im => im.onclick = async () => { showPhoto(im.getAttribute("src")); const full = await S.getPhoto(st.fid, st.year, im.dataset.pv).catch(() => null); if (full) document.querySelector(".mod img")?.setAttribute("src", full); });
  v.querySelectorAll("[data-ra]").forEach(b => b.onclick = async () => {
    const [act, id] = b.dataset.ra.split("|"), r = R.recs.find(x => x.id === id); if (!r) return;
    if (act === "edit") {
      const e = await openForm({ st, setup: R.setup, month: R.month, recs: R.recs, edit: r }); if (!e) return;
      R.recs = await load(st.fid, st.year, R.month).catch(() => R.recs); await syncBonus(st.fid, st.year, R.month, R.setup, R.recs); draw(); toast("Kayıt güncellendi."); return;
    }
    try {
      if (act === "del") {
        if (!(await confirmBox("Kayıt silinsin mi?", "Kayıt ve fotoğrafları kalıcı olarak silinir; hiç yapılmamış gibi puandan da çıkar.", "Sil", true))) return;
        await S.deleteMonthDoc(st.fid, st.year, COLL, id); for (const ph of r.photos || []) S.deletePhoto(st.fid, st.year, ph.id).catch(() => { });
      } else { const { id: _i, ...rest } = r; await S.saveMonthDoc(st.fid, st.year, COLL, id, { ...rest, status: act === "ok" ? "approved" : "rejected" }); }
      R.recs = await load(st.fid, st.year, R.month).catch(() => R.recs);
      if (!GUEST.on) await syncBonus(st.fid, st.year, R.month, R.setup, R.recs);
      draw(); toast(act === "ok" ? "Kayıt onaylandı, bildiren bölümün puanına eklendi." : act === "no" ? "Kayıt reddedildi." : "Kayıt silindi.");
    } catch (e) { toast("İşlem yapılamadı: " + (e.message || e)); }
  });
}
