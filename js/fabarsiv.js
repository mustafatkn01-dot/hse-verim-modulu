// Fabrika arşivi: arşivle (isteğe bağlı ZIP paket), arşivlenmiş fabrika özeti, arşivden çıkar, kalıcı silme ve paket yükleme.
// Veri bulutta olduğu gibi kalır; paket ek bir kopyadır. Paket: manifest.json + veri/{yıl}.json (sıkıştırılmış) + foto/{yıl}/{id}.jpg, parçalar yaklaşık 150 MB.
import * as S from "./store.js?v=20261031a";
import * as Guest from "./guest.js?v=20261031a";
import { FS } from "./firebase.js?v=20261031a";
import { esc, toast, shrinkDataUrl } from "./ui.js?v=20261031a";
import { shell, prog, fmtSize, nf, wakeLock, saveBlob, dataToBytes, PART, badges } from "./arsiv.js?v=20261031a";
import { zipBuild, zipOpen, toBytes, fromBytes } from "./zip.js?v=20261031a";
import { load } from "./verim.js?v=20261031a";
import { num, DEFAULT_PARAMS } from "./scoring.js?v=20261031a";

const COLLS = ["isg", "isgg", "kaza", "konusma", "isbasi", "ramak", "kazag", "konusmag", "isbasig"];
const PKG_VER = 1;
const OPTS = [["a", "Orijinal", "Fotoğraflar aynen"], ["b", "1000 px küçült", "Yaklaşık %80 küçülme"], ["c", "Fotoğrafsız", "Fotoğraflar pakete konmaz"]];
const OPT_LBL = { a: "orijinal", b: "1000 px", c: "fotoğrafsız" };
const avgOf = a => { const v = a.filter(x => x !== null && x !== undefined); return v.length ? v.reduce((s, c) => s + c, 0) / v.length : null; };
const dFmt = t => new Date(t).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
const slug = s => String(s || "fabrika").replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i").replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "fabrika";
const ownerUid = () => S.getOwner() || null;
const kv = rows => rows.map(([k, v]) => `<div class="ar-kv"><span>${k}</span><b>${v}</b></div>`).join("");
const b64 = u => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const quotaMsg = e => (e?.code === "resource-exhausted" || /quota|resource-exhausted/i.test(String(e?.message || ""))) ? "Günlük yazma sınırına ulaşıldı. Yarın aynı paketi seçerek devam edin; kaldığı yerden devam eder." : (e?.message || String(e));

// ---------- Özet ve sayılar ----------
// Kayıt sayıları (denetim oturumu, bulgu, kaza olayı, ramak kala, eğitim konuşması, işbaşı kayıtları) ve fotoğraf boyutu
export async function overview(fid, prog0 = () => { }) {
  const ys = await S.listYears(fid), o = { den: 0, bul: 0, kaza: 0, ramak: 0, kons: 0, isb: 0, foto: 0, bytes: 0 };
  for (const y of ys) {
    prog0(y);
    const [ig, kz, kn, ib, rk] = await Promise.all(["isg", "kaza", "konusma", "isbasi", "ramak"].map(c => S.listMonthDocs(fid, y, c)));
    ig.forEach(d => (d.sessions || []).forEach(s => { o.den++; Object.values(s.fails || {}).forEach(l => { o.bul += (l || []).length || 1; }); }));
    kz.forEach(d => Object.values(d.result?.per || {}).forEach(x => { o.kaza += +x?.count || 0; }));
    o.ramak += rk.length; o.kons += kn.length; o.isb += ib.length;
    const u = await S.photoUsage(fid, y).catch(() => null); if (u) { o.foto += u.n; o.bytes += u.bytes; }
  }
  return o;
}
async function yearScore(fid, y) {
  try {
    const setup = await S.getSetup(fid, y); if (!setup?.rows?.length) return null;
    const p = setup.params || DEFAULT_PARAMS, W = [num(p.w.kaza), num(p.w.konusma), num(p.w.isbasi), num(p.w.isg)], data = await load({ fid, year: y }, setup);
    const total = (id, m) => { let a = 0, d = 0; data[id][m].forEach((x, k) => { if (x !== null) { a += x * W[k]; d += W[k]; } }); return d ? a / d : null; };
    const v = avgOf(setup.rows.map(r => avgOf(Array.from({ length: 12 }, (_, m) => total(r.id, m)))));
    return v === null ? null : +v.toFixed(1);
  } catch { return null; }
}
// Arşivleme anındaki yıllık verim ve sayılar: fabrika belgesine yazılır (veriler silinse de karşılaştırmada görünür)
async function makeSummary(fid, onP) {
  const ov = await overview(fid, y => onP?.(`${y} sayıları`)), years = [];
  for (const y of await S.listYears(fid)) { onP?.(`${y} verimi`); const v = await yearScore(fid, y); years.push({ y: String(y), v }); }
  return { ...ov, years };
}

// ---------- Paket oluşturma ----------
async function buildPackage(ui, f, opt, sum, st) {
  const pkg = Math.random().toString(36).slice(2, 10), metas = await S.listYearsMeta(f.id), ys = metas.map(m => m.id), cur = await S.getFactory(f.id);
  const fo = {}; for (const [k, v] of Object.entries(S.plainTs(cur || {}))) if (!k.startsWith("arc") && k !== "archived" && k !== "id") fo[k] = v;
  const est = Math.max(1, Math.ceil((opt === "c" ? 0 : (sum.bytes || 0) * (opt === "b" ? 0.2 : 0.75)) / PART)), name0 = slug(f.name), fmeta = {}, nPh = {}, yrs = [];
  let files = [], size = 0, part = 1, nph = 0;
  const flush = async last => {
    files.unshift({ name: "part.json", data: toBytes(JSON.stringify({ app: "hse-verim", pkg, part })), z: false });
    if (last) {
      const man = { app: "hse-verim", format: PKG_VER, pkg, parts: part, createdAt: Date.now(), fid: f.id, name: f.name, loc: f.loc || "", photo: opt, note: f.arcNote || "", sum, years: yrs.map(y => ({ y, photos: nPh[y] || 0 })), photos: nph };
      files.push({ name: "manifest.json", data: toBytes(JSON.stringify(man)), z: true }, { name: "fotometa.json", data: toBytes(JSON.stringify(fmeta)), z: true });
    }
    const blob = await zipBuild(files), fname = `HSE_${name0}_${pkg}_${part}.zip`; files = []; size = 0;
    const ok = await new Promise(res => {
      ui.set(`<h2>${esc(f.name)} · Arşiv paketi</h2><div class="muted" style="font-size:13px;line-height:1.5">${last && part > 1 ? "Son parça" : `Parça ${part}`} hazır (${fmtSize(blob.size)}). ${last ? "İndirdikten sonra işlem tamamlanır." : "İndirdikten sonra bir sonraki parça hazırlanır."}</div>
        <div class="ar-btns"><button class="sec" data-s>İptal</button><button data-d>${last && part === 1 ? "Paketi indir" : `Parça ${part} / ${last ? part : "~" + Math.max(est, part)} indir`}</button></div>`);
      ui.$("[data-s]").onclick = () => res(false); ui.$("[data-d]").onclick = () => { saveBlob(blob, fname); res(true); };
    });
    if (ok) part++; return ok;
  };
  const add = async (n, data, z) => { if (size && size + data.length > PART) { if (!(await flush(false))) return false; } files.push({ name: n, data, z }); size += data.length; return true; };
  ui.set(prog(`${f.name} · Paket hazırlanıyor`, 0, [["Aşama", "Kayıtlar okunuyor"]], true)); ui.$("[data-x]").onclick = () => { st.stop = true; };
  if (!(await add("fabrika.json", toBytes(JSON.stringify(fo)), true))) return false;
  for (const m of metas) {
    const y = m.id; yrs.push(y);
    const yd = await S.yearData(f.id, y);
    if (opt === "c") for (const c of COLLS) yd[c] = (yd[c] || []).map(d => { const { id, ...r } = d; const [nd] = S.stripThumbs(r); return { id, ...nd }; });
    if (!(await add(`veri/${y}.json`, toBytes(JSON.stringify(S.plainTs(yd))), true))) return false;
    if (!(await add(`yil/${y}.json`, toBytes(JSON.stringify({ archived: !!m.archived, shrink: m.shrink || null, noPhotos: !!m.noPhotos, shrinkPart: m.shrinkPart || null })), false))) return false;
    if (st.stop) return false;
  }
  if (opt !== "c") {
    const total = sum.foto || 0; let n = 0;
    for (const y of ys) {
      fmeta[y] = {}; nPh[y] = 0;
      for await (const docs of S.fotoPages(f.id, y)) for (const d of docs) {
        if (st.stop) return false;
        const v = d.data(); if (!v.d) continue;
        let src = v.d, sz = v.sz || 0, ob = v.ob || 0;
        if (opt === "b" && !(v.sz && v.sz <= 1000)) { const nd = await shrinkDataUrl(v.d, 1000).catch(() => null); if (nd && nd.length < v.d.length) { src = nd; sz = 1000; ob = v.ob || v.len || v.d.length; } }
        const mm = /^data:([^;,]+)/.exec(src), mime = mm ? mm[1] : "image/jpeg", ext = mime.includes("jpeg") ? "jpg" : (mime.split("/")[1] || "bin");
        if (!(await add(`foto/${y}/${d.id}.${ext}`, dataToBytes(src), false))) return false;
        fmeta[y][d.id] = { at: v.at || 0, sz, ob, m: mime }; nPh[y]++; nph++; n++;
        if (n % 4 === 0 || n === total) { ui.set(prog(`${f.name} · Paket hazırlanıyor`, total ? n / total : 1, [["Fotoğraf", `${nf(n)} / ${nf(total || n)}`], ["Parça", `${part} / ~${Math.max(est, part)}`]], true)); ui.$("[data-x]").onclick = () => { st.stop = true; }; }
      }
    }
  }
  if (st.stop) return false;
  return (await flush(true)) ? { pkg, photo: opt } : false;
}

// ---------- Ortak pencere parçaları ----------
const optHtml = sel => OPTS.map(([k, t, s]) => `<button type="button" data-o="${k}" class="${sel === k ? "on" : ""}">${t}<small>${s}</small></button>`).join("");
const guard = e => { e.preventDefault(); e.returnValue = ""; };
const card = (ui, title, text, no, yes, danger) => new Promise(res => {
  ui.set(`<h2>${esc(title)}</h2><div class="muted" style="font-size:13px;line-height:1.5">${text}</div><div class="ar-btns"><button class="sec" data-n>${no}</button><button class="${danger ? "danger" : ""}" data-y>${yes}</button></div>`);
  ui.$("[data-n]").onclick = () => res(false); ui.$("[data-y]").onclick = () => res(true);
});

// ---------- Arşivle ----------
export async function openArsivle(f, { onDone } = {}) {
  const ui = shell(); ui.set(`<h2>${esc(f.name)} · Fabrikayı arşivle</h2><div class="muted">Hesaplanıyor…</div>`);
  let ov, gN = 0; try { ov = await overview(f.id); gN = await Guest.activeCount(ownerUid() || S.getOwner() || (await uidNow()), f.id).catch(() => 0); } catch (e) { ui.set(`<h2>Hata</h2><div class="warn">Okunamadı: ${esc(e.message || e)}</div><div class="ar-btns"><button data-c>Kapat</button></div>`); ui.$("[data-c]").onclick = ui.close; return; }
  let pk = true, opt = "b", note = "";
  const render = () => {
    ui.set(`<h2>${esc(f.name)} · Fabrikayı arşivle</h2>
      <div class="nfo">Arşivlenince seçimlerde, formlarda ve Genel Bakış'ta görünmez. Veriler silinmez, istediğiniz zaman geri alınır.</div>
      <div>${kv([["Denetim · bulgu", `${nf(ov.den)} · ${nf(ov.bul)}`], ["Kaza · ramak kala", `${nf(ov.kaza)} · ${nf(ov.ramak)}`], ["Eğitim konuşması · işbaşı", `${nf(ov.kons)} · ${nf(ov.isb)}`], ["Fotoğraf", `${nf(ov.foto)} adet · ${fmtSize(ov.bytes)}`], ["Misafir erişimi askıya alınır", `${nf(gN)} kişi`]])}</div>
      <label class="ar-chk"><input type="checkbox" id="fPk" ${pk ? "checked" : ""}><span>Arşiv paketi indir<small>Kayıtlar ZIP içinde sıkıştırılır</small></span></label>
      ${pk ? `<span class="hd">FOTOĞRAFLAR</span><div class="ar-sw one">${optHtml(opt)}</div><div class="muted" style="font-size:12.5px;line-height:1.5">${opt === "a" ? `${Math.max(1, Math.ceil(ov.bytes * 0.75 / PART))} parça (150 MB). ` : ""}Bulut verisi olduğu gibi kalır, paket ek bir kopyadır.</div>` : ""}
      <span class="hd">NOT (İSTEĞE BAĞLI)</span><textarea id="fNote" class="inp" rows="3" maxlength="120" placeholder="Ayrılış nedeni / tarih">${esc(note)}</textarea>
      <div class="ar-btns"><button class="sec" data-c>Vazgeç</button><button data-go>${pk ? "Arşivle ve indir" : "Arşivle"}</button></div>`);
    ui.$("#fPk").onchange = e => { note = ui.$("#fNote").value; pk = e.target.checked; render(); };
    ui.box.querySelectorAll("[data-o]").forEach(b => b.onclick = () => { note = ui.$("#fNote").value; opt = b.dataset.o; render(); });
    ui.$("[data-c]").onclick = ui.close; ui.$("[data-go]").onclick = () => { note = ui.$("#fNote").value.trim(); ask(); };
  };
  const ask = async () => {
    if (!(await card(ui, `${f.name} arşivlensin mi?`, gN ? `Fabrika seçimlerden kalkar ve ${nf(gN)} misafirin erişimi askıya alınır. Veriler silinmez.` : "Fabrika seçimlerden kalkar. Veriler silinmez.", "Vazgeç", "Arşivle"))) return render();
    run();
  };
  const run = async () => {
    const st = { stop: false }, wl = await wakeLock(); ui.busy(true); window.addEventListener("beforeunload", guard);
    try {
      ui.set(prog(`${f.name} · Hazırlanıyor`, 0.05, [["Aşama", "Özet hazırlanıyor"]], false));
      const sum = await makeSummary(f.id, t => ui.set(prog(`${f.name} · Hazırlanıyor`, 0.1, [["Aşama", t]], false)));
      let pkgInfo = null;
      if (pk) { const r = await buildPackage(ui, f, opt, sum, st); if (!r) { ui.busy(false); toast("Paket tamamlanmadı; fabrika arşivlenmedi."); return ui.close(); } pkgInfo = { at: Date.now(), opt: r.photo, pkg: r.pkg }; }
      ui.set(prog(`${f.name} · Arşivleniyor`, 0.95, [["Aşama", "Misafir erişimi askıya alınıyor"]], false));
      const susp = await Guest.suspendFactory(ownerUid() || await uidNow(), f.id, f.name, true).catch(() => []);
      await S.updateFactory(f.id, { archived: true, arcAt: Date.now(), arcNote: note || null, arcSum: sum, arcPkg: pkgInfo, arcSusp: susp });
      ui.busy(false);
      ui.set(`<h2>Arşivlendi</h2><div class="muted" style="font-size:13px;line-height:1.5">${esc(f.name)} arşivlenmiş fabrikalar arasına alındı.${susp.length ? ` ${nf(susp.length)} misafirin erişimi askıya alındı.` : ""}</div><div class="ar-btns"><button data-c>Tamam</button></div>`);
      ui.$("[data-c]").onclick = () => { ui.close(); onDone?.(); };
    } catch (e) { ui.busy(false); ui.set(`<h2>Hata</h2><div class="warn">İşlem tamamlanamadı: ${esc(quotaMsg(e))}</div><div class="ar-btns"><button data-c>Kapat</button></div>`); ui.$("[data-c]").onclick = () => { ui.close(); onDone?.(); }; }
    finally { window.removeEventListener("beforeunload", guard); try { wl?.release(); } catch { } }
  };
  render();
}
const uidNow = async () => { const { auth } = await import("./firebase.js?v=20261031a"); return auth.currentUser.uid; };

// ---------- Paket indir (arşivlenmiş fabrika için) ----------
async function openPaket(f, { onDone } = {}) {
  const ui = shell(); let opt = f.arcPkg?.opt || "b";
  const render = () => {
    ui.set(`<h2>${esc(f.name)} · Arşiv paketi</h2><span class="hd">FOTOĞRAFLAR</span><div class="ar-sw one">${optHtml(opt)}</div><div class="muted" style="font-size:12.5px;line-height:1.5">Bulut verisi olduğu gibi kalır, paket ek bir kopyadır.</div><div class="ar-btns"><button class="sec" data-c>Vazgeç</button><button data-go>Paketi hazırla</button></div>`);
    ui.box.querySelectorAll("[data-o]").forEach(b => b.onclick = () => { opt = b.dataset.o; render(); });
    ui.$("[data-c]").onclick = ui.close; ui.$("[data-go]").onclick = run;
  };
  const run = async () => {
    const st = { stop: false }, wl = await wakeLock(); ui.busy(true); window.addEventListener("beforeunload", guard);
    try {
      ui.set(prog(`${f.name} · Hazırlanıyor`, 0.05, [["Aşama", "Özet hazırlanıyor"]], false));
      const sum = f.arcSum || await makeSummary(f.id); const r = await buildPackage(ui, f, opt, sum, st);
      ui.busy(false);
      if (!r) { toast("Paket tamamlanmadı."); return ui.close(); }
      await S.updateFactory(f.id, { arcPkg: { at: Date.now(), opt: r.photo, pkg: r.pkg } }); ui.close(); onDone?.();
    } catch (e) { ui.busy(false); ui.set(`<h2>Hata</h2><div class="warn">İşlem tamamlanamadı: ${esc(quotaMsg(e))}</div><div class="ar-btns"><button data-c>Kapat</button></div>`); ui.$("[data-c]").onclick = ui.close; }
    finally { window.removeEventListener("beforeunload", guard); try { wl?.release(); } catch { } }
  };
  render();
}

// ---------- Sütun grafik (yıllık verim) ----------
export function yearChart(yrs, w = 320, h = 150) {
  const pad = 28, bw = 46, n = yrs.length, gap = (w - pad * 2 - bw * n) / (n + 1), y = v => h - 24 - (v / 100) * (h - 48);
  let o = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Yıllık verim sütun grafiği" style="display:block">`;
  [0, 50, 100].forEach(v => { o += `<line x1="${pad}" x2="${w - 8}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pad - 6}" y="${y(v) + 3}" text-anchor="end" font-size="10" fill="var(--muted)">${v}</text>`; });
  o += `<line x1="${pad}" x2="${w - 8}" y1="${y(90)}" y2="${y(90)}" stroke="var(--gd)" stroke-dasharray="4 3"/><text x="${w - 8}" y="${y(90) - 4}" text-anchor="end" font-size="10" fill="var(--gd)">Hedef 90</text>`;
  yrs.forEach((s, i) => { const x = pad + gap * (i + 1) + bw * i, v = s.v; o += `<rect x="${x}" y="${y(v)}" width="${bw}" height="${y(0) - y(v)}" rx="5" fill="${s.c || "#2A82C4"}"/><text x="${x + bw / 2}" y="${y(v) - 5}" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--text)">${String(v).replace(".", ",")}</text><text x="${x + bw / 2}" y="${h - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(s.y)}</text>`; });
  return o + "</svg>";
}

// ---------- Silme kartı (çöp kutusu ve Kalıcı sil) ----------
export async function openSil(f, { onDone } = {}) {
  const ui = shell();
  ui.set(`<h2>${esc(f.name)} silinsin mi?</h2><div class="muted" style="font-size:13px;line-height:1.5">Silmek istediğinize emin misiniz? Tüm yıllar, kayıtlar ve fotoğraflar buluttan kalıcı olarak silinir.</div><div class="muted" style="font-size:12.5px;line-height:1.5">İsterseniz silmeden önce yedekleyin veya arşive alın.</div><div class="ar-btns"><button class="sec" data-n>Vazgeç</button><button class="danger" data-y>Sil</button></div>`);
  ui.$("[data-n]").onclick = ui.close;
  ui.$("[data-y]").onclick = async () => {
    ui.busy(true); ui.set(`<h2>Siliniyor</h2><div class="muted" style="font-size:13px;line-height:1.5">Bu pencereyi kapatmayın. Büyük fabrikalarda birkaç dakika sürebilir.</div><div class="ar-bar"><i style="width:60%"></i></div>`);
    try { await Guest.suspendFactory(ownerUid() || await uidNow(), f.id, f.name, false).catch(() => { }); await S.deleteFactoryDeep(f.id); ui.busy(false); ui.close(); toast("Fabrika ve bilgileri silindi."); onDone?.(true); }
    catch (e) { ui.busy(false); ui.set(`<h2>Hata</h2><div class="warn">Silinemedi: ${esc(quotaMsg(e))} Yeniden denerseniz kalan kısım silinir.</div><div class="ar-btns"><button data-c>Kapat</button></div>`); ui.$("[data-c]").onclick = () => { ui.close(); onDone?.(false); }; }
  };
}

// ---------- Arşivden çıkar ----------
async function openCikar(f, { onDone } = {}) {
  const ui = shell(); ui.set(`<h2>${esc(f.name)} · Arşivden çıkar</h2><div class="muted">Hazırlanıyor…</div>`);
  const owner = ownerUid() || await uidNow(), susp = f.arcSusp || [];
  let cands = []; const sc = {};
  try { cands = await Guest.resumable(owner, susp); const sh = await S.factoryShares(f.id); cands.forEach(c => { const mine = sh.filter(x => (x.guests || []).includes(c.uid)); sc[c.uid] = mine.some(x => x.all) ? "Tüm bölümler" : [...new Set(mine.flatMap(x => (x.depts || []).map(d => d.name)))].join(" · "); }); } catch { }
  const on = {}; cands.forEach(c => { on[c.uid] = true; });
  ui.set(`<h2>${esc(f.name)} · Arşivden çıkar</h2>
    <div class="nfo">Fabrika yeniden aktif olur.${cands.length ? " Arşivlenirken erişimi askıya alınan aktif misafirler aşağıdadır." : ""}</div>
    ${cands.length ? `<span class="hd">PAYLAŞIM DEVAM ETSİN Mİ?</span><div class="ar-gl">${cands.map(c => `<label class="ar-chk"><input type="checkbox" data-g="${c.uid}" checked><span>${esc(c.name)}${sc[c.uid] ? `<small>${esc(sc[c.uid])}</small>` : ""}</span></label>`).join("")}</div><div class="muted" style="font-size:12.5px;line-height:1.5">İşaretli misafirlerin ${esc(f.name)} erişimi yeniden açılır.</div>` : ""}
    <div class="ar-btns"><button class="sec" data-c>Vazgeç</button><button data-go>Arşivden çıkar</button></div>`);
  ui.box.querySelectorAll("[data-g]").forEach(i => i.onchange = () => { on[i.dataset.g] = i.checked; });
  ui.$("[data-c]").onclick = ui.close;
  ui.$("[data-go]").onclick = async () => {
    ui.busy(true); ui.$("[data-go]").disabled = true;
    try {
      await Guest.resumeFactory(owner, f.id, Object.keys(on).filter(k => on[k]), susp.map(x => x.uid));
      const del = FS.deleteField(); await S.updateFactory(f.id, { archived: false, arcAt: del, arcNote: del, arcSum: del, arcPkg: del, arcSusp: del, arcRestored: del });
      ui.busy(false); ui.close(); toast("Fabrika arşivden çıkarıldı."); onDone?.();
    } catch (e) { ui.busy(false); ui.$("[data-go]").disabled = false; toast("İşlem tamamlanamadı: " + (e.message || e)); }
  };
}

// ---------- Arşivlenmiş fabrika detayı ----------
export async function openDetay(f, { onDone } = {}) {
  const ui = shell(); ui.set(`<h2>${esc(f.name)}</h2><div class="muted">Yükleniyor…</div>`);
  const sum = f.arcSum || {}, metas = await S.listYearsMeta(f.id).catch(() => []), yrs = (sum.years || []).filter(x => x.v !== null && x.v !== undefined);
  const fresh = async () => { ui.close(); onDone?.(); };
  ui.set(`<h2>${esc(f.name)}</h2><div class="muted" style="margin-top:-6px">Arşivlenmiş fabrika</div>
    <div>${kv([["Arşiv tarihi", f.arcAt ? dFmt(f.arcAt) : "–"], ["Boyut", fmtSize(sum.bytes || 0)], ["Denetim · bulgu", `${nf(sum.den || 0)} · ${nf(sum.bul || 0)}`], ["Kaza · ramak kala", `${nf(sum.kaza || 0)} · ${nf(sum.ramak || 0)}`], ["Paket", f.arcPkg ? `İndirildi · ${OPT_LBL[f.arcPkg.opt] || ""}` : "İndirilmedi"]])}${f.arcNote ? `<div class="muted" style="font-size:12.5px;margin-top:6px">Not: ${esc(f.arcNote)}</div>` : ""}</div>
    ${yrs.length ? `<div><span class="hd">YILLIK VERİM</span>${yearChart(yrs.map((x, i) => ({ ...x, c: i === yrs.length - 1 ? "#2A82C4" : "#9DB5AE" })))}<div class="muted" style="font-size:12.5px">Arşivleme anındaki değerler</div></div>` : ""}
    ${metas.length ? `<div class="ar-gl">${metas.map(m => `<div class="ar-yrw"><b>${esc(m.id)}</b>${badges(m) || '<span class="tag gray">Arşivde</span>'}</div>`).join("")}</div>` : ""}
    <div class="ar-two"><button class="sec" data-cik>Arşivden çıkar</button><button class="sec" data-pk>Paket indir</button></div>
    <button class="sec" data-sil style="color:var(--red);border-color:var(--red)">Kalıcı sil</button>`);
  ui.$("[data-cik]").onclick = () => { ui.close(); openCikar(f, { onDone }); };
  ui.$("[data-pk]").onclick = () => { ui.close(); openPaket(f, { onDone }); };
  ui.$("[data-sil]").onclick = () => { ui.close(); openSil(f, { onDone: d => { if (d) onDone?.(); } }); };
  void fresh;
}

// ---------- Arşivlenmiş fabrikalar kartı (Ayarlar › Fabrikalar) ----------
export function listHtml(all) {
  const arc = all.filter(f => f.archived), rows = arc.map(f => `<button type="button" class="it ar-frow" data-afab="${f.id}" style="width:100%;text-align:left;flex-wrap:nowrap;cursor:pointer"><div class="grow" style="min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</b><div class="muted" style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.arcAt ? dFmt(f.arcAt) : "Arşivde"}${f.arcSum?.bytes ? " · " + fmtSize(f.arcSum.bytes) : ""}</div></div><span aria-hidden="true">›</span></button>`).join("");
  return `<div class="col1" style="gap:10px;padding-top:14px;border-top:1px solid var(--line)">
    <button type="button" id="arcTg" aria-expanded="false" style="display:flex;align-items:center;gap:10px;width:100%;min-height:44px;height:auto;padding:0 12px;border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--text);text-align:left;cursor:pointer"><b style="flex:1">Arşivlenmiş fabrikalar</b><span class="tag gray">${arc.length}</span><svg id="arcCh" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" style="transition:transform .15s"><path d="M6 9l6 6 6-6"/></svg></button>
    <div id="arcBody" hidden class="col1" style="gap:8px;max-height:224px;overflow:auto">${rows || '<div class="muted" style="font-size:13px">Arşivlenmiş fabrika yok.</div>'}</div>
    <button type="button" id="arcUp" class="it" style="width:100%;text-align:left;flex-wrap:nowrap;cursor:pointer;min-height:52px"><div class="grow"><b style="display:block">Arşiv paketi yükle</b><div class="muted" style="font-size:12.5px">Daha önce indirilen ZIP dosyası</div></div><span aria-hidden="true">›</span></button></div>`;
}
export function bindList(root, all, { onDone } = {}) {
  const tg = root.querySelector("#arcTg"); if (!tg) return;
  tg.onclick = () => { const b = root.querySelector("#arcBody"), o = b.hidden; b.hidden = !o; tg.setAttribute("aria-expanded", o); root.querySelector("#arcCh").style.transform = o ? "rotate(180deg)" : ""; };
  root.querySelectorAll("[data-afab]").forEach(b => b.onclick = () => openDetay(all.find(x => x.id === b.dataset.afab), { onDone }));
  root.querySelector("#arcUp").onclick = () => openYukle({ onDone });
}

// ---------- Paket yükle ----------
const JKEY = pkg => "hse_rs_" + pkg;
const jGet = pkg => { try { return JSON.parse(localStorage.getItem(JKEY(pkg)) || "null"); } catch { return null; } };
const jSet = (pkg, v) => { try { localStorage.setItem(JKEY(pkg), JSON.stringify(v)); } catch { } };
const jDel = pkg => { try { localStorage.removeItem(JKEY(pkg)); } catch { } };
// Seçilen ZIP dosyalarını gruplar ve doğrular: { man, zips (parça sırasıyla), fmeta } veya hata fırlatır
export async function readPackage(fileList) {
  const zs = []; let pkg = null;
  for (const file of fileList) {
    let z; try { z = await zipOpen(file); } catch (e) { throw new Error(`${file.name}: ${e.message}`); }
    if (!z.has("part.json")) throw new Error(`${file.name} bir HSE arşiv paketi değil.`);
    let pj; try { pj = JSON.parse(fromBytes(await z.read("part.json"))); } catch { throw new Error(`${file.name} okunamadı (bozuk).`); }
    if (pj.app !== "hse-verim") throw new Error(`${file.name} bir HSE arşiv paketi değil.`);
    if (pkg && pj.pkg !== pkg) throw new Error("Farklı paketlere ait dosyalar seçildi. Aynı pakete ait tüm parçaları seçin.");
    pkg = pj.pkg; zs.push({ z, part: pj.part, name: file.name });
  }
  const last = zs.find(x => x.z.has("manifest.json"));
  if (!last) throw new Error("Paketin son parçası seçilmemiş. Tüm parçaları birlikte seçin.");
  const man = JSON.parse(fromBytes(await last.z.read("manifest.json")));
  if (man.format > PKG_VER) throw new Error("Bu paket daha yeni bir program sürümüyle hazırlanmış. Uygulamayı güncelleyin.");
  const got = new Set(zs.map(x => x.part)), miss = []; for (let i = 1; i <= man.parts; i++) if (!got.has(i)) miss.push(i);
  if (miss.length) throw new Error(`Eksik parça: ${miss.join(", ")} / ${man.parts}. Tüm parçaları birlikte seçin.`);
  zs.sort((a, b) => a.part - b.part);
  const fmeta = last.z.has("fotometa.json") ? JSON.parse(fromBytes(await last.z.read("fotometa.json"))) : {};
  return { man, zs, fmeta };
}
// Yükleme planı: sıralı iş listesi (idempotent yazımlar; kaldığı yerden devam için sıra numarası saklanır)
async function plan(pk) {
  const items = [{ t: "fab" }]; const first = pk.zs[0].z;
  for (const y of pk.man.years.map(x => x.y)) {
    items.push({ t: "yr", y });
    const yd = JSON.parse(fromBytes(await (pk.zs.find(x => x.z.has(`veri/${y}.json`)) || pk.zs[0]).z.read(`veri/${y}.json`)));
    if (yd.setup) items.push({ t: "set", y, id: "main", d: yd.setup });
    if (yd.tatil && Object.keys(yd.tatil).length) items.push({ t: "set", y, id: "tatil", d: yd.tatil });
    for (const c of COLLS) for (const d of yd[c] || []) items.push({ t: "rec", y, c, d });
  }
  void first;
  for (const p of pk.zs) for (const n of p.z.names.filter(n => n.startsWith("foto/")).sort()) items.push({ t: "ph", z: p.z, n });
  return items;
}
export async function openYukle({ onDone } = {}) {
  const ui = shell(); let pk = null, mode = "ek";
  const fileScreen = (sel = [], err = "") => {
    ui.set(`<h2>Arşiv paketi yükle</h2><div class="muted" style="font-size:13px;line-height:1.5">Daha önce indirdiğiniz arşiv paketini seçin. Paket parçalıysa tüm parçaları birlikte seçin.</div>
      <button type="button" id="fPick" class="ar-drop"><b>ZIP dosyası seç</b><span class="muted" style="font-size:12.5px">Birden fazla parça seçebilirsiniz</span></button><input type="file" id="fIn" accept=".zip,application/zip" multiple hidden>
      ${err ? `<div class="warn">${esc(err)}</div>` : ""}
      ${sel.length ? `<div class="ar-kv"><span>Seçilen: ${esc(sel[0].name)}${sel.length > 1 ? ` +${sel.length - 1}` : ""}</span></div>` : ""}
      <div class="ar-btns"><button class="sec" data-c>Vazgeç</button><button data-go ${sel.length ? "" : "disabled"}>Devam</button></div>`);
    ui.$("#fPick").onclick = () => ui.$("#fIn").click();
    ui.$("#fIn").onchange = e => fileScreen([...e.target.files]);
    ui.$("[data-c]").onclick = ui.close;
    ui.$("[data-go]").onclick = async () => {
      ui.$("[data-go]").disabled = true;
      try { pk = await readPackage(sel); } catch (e) { return fileScreen(sel, e.message || String(e)); }
      preview();
    };
  };
  const preview = async () => {
    const m = pk.man, s = m.sum || {}, ex = await S.getFactory(m.fid).catch(() => null), jr = jGet(m.pkg);
    const warn = m.photo === "b" ? "Fotoğraflar küçültülmüş haliyle gelir. Göreve ekle bağlantıları ve misafir kayıtları taşınmaz." : m.photo === "c" ? "Fotoğraflar pakette yok. Göreve ekle bağlantıları ve misafir kayıtları taşınmaz." : "Göreve ekle bağlantıları ve misafir kayıtları taşınmaz.";
    ui.set(`<h2>Paketi kontrol et</h2><div class="muted" style="font-size:13px;margin-top:-6px">Henüz hiçbir şey yüklenmedi</div>
      <div class="ar-eff" style="display:flex;flex-direction:column;gap:2px"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><b style="font-size:15px">${esc(m.name)}</b><span class="tag">Paket sağlam</span></div>
      ${kv([["Arşiv tarihi", dFmt(m.createdAt)], ["Parça", `${pk.zs.length} / ${m.parts} tamam`], ["Denetim · bulgu", `${nf(s.den || 0)} · ${nf(s.bul || 0)}`], ["Kaza · ramak kala", `${nf(s.kaza || 0)} · ${nf(s.ramak || 0)}`], ["Eğitim · işbaşı", `${nf(s.kons || 0)} · ${nf(s.isb || 0)}`], ["Fotoğraf", m.photo === "c" ? "yok" : `${nf(m.photos)} adet · ${OPT_LBL[m.photo]}`]])}</div>
      <div class="nfo">${jr ? "Yarım kalan yükleme bulundu, kaldığı yerden devam edilir." : "Fabrika arşivlenmiş olarak yüklenir. İsterseniz sonra Arşivden çıkar ile aktif yaparsınız."}</div><div class="warn" style="background:#FBE9C6;color:#5A3300">${warn}</div>
      <div class="ar-btns"><button class="sec" data-c>Vazgeç</button><button data-go>Yükle</button></div>`);
    ui.$("[data-c]").onclick = () => fileScreen();
    ui.$("[data-go]").onclick = () => (ex && !jr ? conflict(ex) : run(ex ? "ek" : "yeni"));
  };
  const conflict = async ex => {
    const n = (await overview(ex.id).catch(() => ({ den: 0 }))).den;
    const draw = () => {
      ui.set(`<h2>Aynı fabrika var</h2><div class="muted" style="font-size:13px;margin-top:-6px">${esc(ex.name)} bulutta kayıtlı</div><div class="nfo">Bulutta bu fabrikanın ${nf(n)} denetim kaydı var. Paket aynı fabrikaya ait.</div>
        <div class="ar-sw one"><button type="button" data-m="ek" class="${mode === "ek" ? "on" : ""}">Eksikleri tamamla<small>Var olan kayıtların üzerine yazılmaz</small></button><button type="button" data-m="ay" class="${mode === "ay" ? "on" : ""}">Ayrı fabrika olarak ekle<small>${esc(pk.man.name)} (2) adıyla, yeni kayıt kodlarıyla</small></button></div>
        <div class="ar-btns"><button class="sec" data-c>Vazgeç</button><button data-go>Yükle</button></div>`);
      ui.box.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { mode = b.dataset.m; draw(); });
      ui.$("[data-c]").onclick = preview; ui.$("[data-go]").onclick = () => run(mode);
    }; draw();
  };
  const run = async md => {
    const m = pk.man, st = { stop: false }, wl = await wakeLock(); ui.busy(true); window.addEventListener("beforeunload", guard);
    try {
      ui.set(prog("Yükleniyor", 0, [["Aşama", "Paket okunuyor"]], false));
      const items = await plan(pk), jr = jGet(m.pkg);
      let fid = jr?.fid || (md === "ay" ? S.newFactoryId() : m.fid), idx = jr?.idx || 0, skip = (jr?.mode || md) === "ek"; const mode0 = jr?.mode || md;
      jSet(m.pkg, { fid, idx, mode: mode0 });
      const total = items.length, t0 = Date.now(), idx0 = idx, phase = i => items[Math.min(i, total - 1)].t; const dn = { rec: 0, ph: 0 };
      const stepsHtml = i => { const p = i >= total ? "end" : phase(i), ord = { fab: 0, yr: 0, set: 0, rec: 1, ph: 2, end: 3 }[p], row = (k, t) => `<div class="ar-st ${ord > k ? "ok" : ord === k ? "now" : ""}"><i>${ord > k ? "✓" : ord === k ? "•" : ""}</i>${t}</div>`; return `<div class="ar-st ok"><i>✓</i>Paket doğrulandı</div>${row(0, "Bölümler ve kurulum")}${row(1, "Denetim ve bulgu kayıtları")}${m.photo === "c" ? "" : row(2, "Fotoğraflar")}`; };
      const view = i => { const el = i > idx0 + 20 ? (Date.now() - t0) / (i - idx0) * (total - i) / 60000 : null; ui.set(prog(`Yükleniyor · ${esc(m.name)}`, total ? i / total : 1, [["Kayıt", `${nf(Math.min(i, total))} / ${nf(total)}`], ["Süre", el === null ? "hesaplanıyor" : el < 1 ? "1 dakikadan az" : `yaklaşık ${Math.ceil(el)} dk`]], true) + stepsHtml(i)); ui.$("[data-x]").onclick = () => { st.stop = true; }; };
      const meta0 = fo => { const o = {}; for (const [k, v] of Object.entries(S.reviveTs(fo))) o[k] = v; return o; };
      const write = async it => {
        if (it.t === "fab") {
          const fo = JSON.parse(fromBytes(await pk.zs[0].z.read("fabrika.json"))), d = meta0(fo);
          if (mode0 === "ay") d.name = `${m.name} (2)`;
          await S.putRaw(fid, "", { ...d, archived: true, arcAt: m.createdAt, arcNote: m.note || null, arcSum: m.sum || null, arcPkg: null, arcSusp: [], arcRestored: Date.now() }, mode0 === "ek");
        } else if (it.t === "yr") {
          const z = pk.zs.find(x => x.z.has(`yil/${it.y}.json`)).z, ym = JSON.parse(fromBytes(await z.read(`yil/${it.y}.json`)));
          const d = { year: Number(it.y), archived: !!ym.archived, shrinkPart: ym.shrinkPart || null };
          if (m.photo === "b") { d.shrink = { px: 1000, at: Date.now(), n: m.years.find(x => x.y === it.y)?.photos || 0, before: 0, after: 0 }; d.noPhotos = false; } else if (m.photo === "c") { d.shrink = null; d.noPhotos = true; } else { d.shrink = ym.shrink || null; d.noPhotos = !!ym.noPhotos; }
          await S.putRaw(fid, `years/${it.y}`, d, skip);
        } else if (it.t === "set") await S.putRaw(fid, `years/${it.y}/setup/${it.id}`, S.reviveTs(it.d), skip);
        else if (it.t === "rec") { const { id, ...r } = it.d; await S.putRaw(fid, `years/${it.y}/${it.c}/${id}`, S.reviveTs(r), skip); }
        else if (it.t === "ph") {
          const mt = /^foto\/([^/]+)\/(.+)\.[^.]+$/.exec(it.n), y = mt[1], id = mt[2], fm = pk.fmeta[y]?.[id] || {}, u = await it.z.read(it.n), d = `data:${fm.m || "image/jpeg"};base64,${b64(u)}`;
          await S.putRaw(fid, `years/${y}/foto/${id}`, { d, at: fm.at || Date.now(), len: d.length, ...(fm.sz ? { sz: fm.sz } : {}), ...(fm.ob ? { ob: fm.ob } : {}) }, skip);
        }
      };
      void dn;
      view(idx); let last = 0;
      while (idx < total) {
        if (st.stop) { ui.busy(false); toast("Durduruldu. Aynı paketi seçerek kaldığı yerden devam edebilirsiniz."); return ui.close(); }
        const first = items[idx], n = first.t === "ph" ? 6 : first.t === "rec" ? 15 : 1, chunk = []; for (let k = idx; k < Math.min(total, idx + n) && items[k].t === first.t; k++) chunk.push(items[k]);
        await Promise.all(chunk.map(write)); idx += chunk.length; jSet(m.pkg, { fid, idx, mode: mode0 });
        if (Date.now() - last > 250) { last = Date.now(); view(idx); }
      }
      jDel(m.pkg); ui.busy(false);
      ui.set(`<div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px"><span class="tag">Tamamlandı</span><h2>${esc(mode0 === "ay" ? m.name + " (2)" : m.name)} yüklendi</h2><div class="muted" style="font-size:13px;line-height:1.5">Arşivlenmiş fabrika olarak Fabrikalar ekranında duruyor.</div></div>
        <div>${kv([["Denetim · bulgu", `${nf(m.sum?.den || 0)} · ${nf(m.sum?.bul || 0)}`], ["Kaza · ramak kala", `${nf(m.sum?.kaza || 0)} · ${nf(m.sum?.ramak || 0)}`], ["Fotoğraf", m.photo === "c" ? "yok" : `${nf(m.photos)} adet`]])}</div>
        <div class="ar-btns"><button class="sec" data-d>Arşiv detayı</button><button data-c>Tamam</button></div>`);
      ui.$("[data-c]").onclick = () => { ui.close(); onDone?.(); };
      ui.$("[data-d]").onclick = async () => { ui.close(); onDone?.(); const f = await S.getFactory(fid); if (f) openDetay(f, { onDone }); };
    } catch (e) { ui.busy(false); ui.set(`<h2>Yükleme durdu</h2><div class="warn">${esc(quotaMsg(e))}</div><div class="muted" style="font-size:12.5px;line-height:1.5">Aynı paketi yeniden seçerseniz kaldığı yerden devam eder.</div><div class="ar-btns"><button data-c>Kapat</button></div>`); ui.$("[data-c]").onclick = () => { ui.close(); onDone?.(); }; }
    finally { window.removeEventListener("beforeunload", guard); try { wl?.release(); } catch { } }
  };
  fileScreen();
}
