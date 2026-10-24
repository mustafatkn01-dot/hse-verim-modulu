// Arşiv işlemleri: fotoğraf küçültme (1000 / 1200 px), ZIP yedek, silme ve depolama kartı.
// Her şey tarayıcıda çalışır; fotoğraflar sayfa sayfa okunur, işlem kesilirse kaldığı yerden devam eder.
import * as S from "./store.js?v=20261024d";
import { esc, toast } from "./ui.js?v=20261024d";

const GIB = 1073741824, PART = 150 * 1024 * 1024, SAVE = { 1200: 0.3, 1000: 0.2 }; // özgün boyutun kalan oranı
const nf = n => Number(n).toLocaleString("tr-TR");
export const fmtSize = b => b >= 100 * 1048576 ? (b / GIB).toFixed(2).replace(".", ",") + " GB" : Math.max(0, Math.round(b / 1048576)) + " MB";
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- Yıl sayfasındaki etiketler ----
export const badges = meta => meta?.noPhotos ? '<span class="tag gray">Fotoğraflar silindi</span>' : meta?.shrink ? `<span class="tag">Küçültüldü · ${meta.shrink.px} px</span>` : "";

// ---- Pencere yardımcıları ----
function shell() {
  const m = document.createElement("div"); m.className = "mod"; m.innerHTML = '<div class="mbox ar" role="dialog" aria-modal="true"></div>'; document.body.appendChild(m);
  const box = m.querySelector(".ar"); let busy = false;
  const api = { box, set: h => { box.innerHTML = h; }, busy: v => { busy = v; }, close: () => m.remove(), $: s => box.querySelector(s) };
  m.addEventListener("mousedown", e => { if (e.target === m && !busy) m.remove(); });
  return api;
}
const wakeLock = async () => { try { return await navigator.wakeLock?.request("screen"); } catch { return null; } };

// ---- ZIP (depolamasız, kütüphanesiz) ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipBuild(files) {
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0, cs = 0;
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true); lh.setUint16(26, nm.length, true);
    parts.push(lh.buffer, nm, f.data);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    cen.push(ch.buffer, nm); cs += 46 + nm.length; off += 30 + nm.length + sz;
  }
  const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...cen, end.buffer], { type: "application/zip" });
}
function dataToBytes(d) { const b = atob(d.slice(d.indexOf(",") + 1)), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
const saveBlob = (blob, name) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); };

// ---- Yedek: ZIP parçaları (parça başına yaklaşık 150 MB). Her parça için kullanıcı İndir'e basar ----
async function backup(ui, fid, y, st, upto = 0, nSel = 0) {
  const u = await S.photoUsage(fid, y).catch(() => null), est = u ? u.bytes * 0.75 * (upto && u.n ? Math.min(1, nSel / u.n) : 1) : 0, nParts = Math.max(1, Math.ceil(est / PART));
  let files = [{ name: `veri_${y}.json`, data: new TextEncoder().encode(JSON.stringify(await S.yearData(fid, y), null, 1)) }], size = 0, part = 1, n = 0;
  const total = upto ? nSel : (u?.n || 0);
  const flush = async () => {
    if (!files.length) return true;
    const blob = zipBuild(files), name = `HSE_${y}_foto_yedek_${part}.zip`; files = []; size = 0;
    const ok = await new Promise(res => {
      ui.set(`<h2>${y} yılı · Yedek</h2><div class="muted" style="font-size:13px;line-height:1.5">Parça ${part} hazır (${fmtSize(blob.size)}). İndirdikten sonra bir sonraki parça hazırlanır.</div>
        <div class="ar-btns"><button class="sec" data-s>İptal</button><button data-d>Parça ${part} / ~${Math.max(nParts, part)} indir</button></div>`);
      ui.$("[data-s]").onclick = () => res(false); ui.$("[data-d]").onclick = () => { saveBlob(blob, name); res(true); };
    });
    if (ok) part++; return ok;
  };
  for await (const docs of S.fotoPages(fid, y)) for (const d of docs) {
    if (st.stop) return false;
    const v = d.data(); if (!v.d || (upto && v.at && v.at > upto)) continue;
    const bytes = dataToBytes(v.d); files.push({ name: `${d.id}.jpg`, data: bytes }); size += bytes.length; n++;
    if (n % 5 === 0 || n === total) ui.set(prog(`${y} yılı · Yedek hazırlanıyor`, n / (total || n), [["Fotoğraf", `${nf(n)} / ${nf(total || n)}`], ["Parça", `${part} / ~${Math.max(nParts, part)}`]], true));
    if (ui.$("[data-x]")) ui.$("[data-x]").onclick = () => { st.stop = true; };
    if (size >= PART) { if (!(await flush())) return false; }
  }
  return await flush();
}
const prog = (title, f, rows, stopBtn) => `<h2>${title}</h2><div class="muted" style="font-size:13px;line-height:1.5">Bu pencereyi ve sekmeyi kapatmayın. İptal ederseniz kaldığı yerden devam edilir.</div>
  <div class="ar-bar"><i style="width:${Math.min(100, Math.round(f * 100))}%"></i></div>${rows.map(([k, v]) => `<div class="ar-kv"><span>${k}</span><b>${v}</b></div>`).join("")}
  ${stopBtn ? '<div class="ar-btns"><button class="sec" data-x>İptal</button></div>' : ""}`;

// ---- Arşiv işlemleri penceresi ----
export async function openArsiv({ fid, y, meta, onDone }) {
  const ui = shell(); let sel = null, bk = true;
  if (meta?.noPhotos) { ui.set(`<h2>${y} yılı · Arşiv işlemleri</h2><div class="ar-eff no">Bu yılın fotoğrafları silinmiş. Küçültülecek fotoğraf yok.</div><div class="ar-btns"><button data-c>Kapat</button></div>`); ui.$("[data-c]").onclick = ui.close; return; }
  ui.set('<div class="muted">Hesaplanıyor…</div>');
  const u = await S.photoUsage(fid, y).catch(() => null), cur = meta?.shrink?.px || 0;
  const estText = () => { if (!sel) return "Bir boyut seçin."; if (!u) return "Fotoğraf sayısı okunamadı; işlem yine de yapılabilir."; const f = cur ? SAVE[sel] / SAVE[cur] : SAVE[sel]; return `${nf(u.n)} fotoğraf · ${fmtSize(u.bytes)} → yaklaşık ${fmtSize(u.bytes * f)} (${fmtSize(u.bytes * (1 - f))} boşalır)`; };
  const render = () => {
    ui.set(`<h2>${y} yılı · Arşiv işlemleri</h2>
      <div class="muted" style="font-size:13px;line-height:1.5">Fotoğraflar küçültülür, veriler ve kayıtlar aynı kalır. Küçültülen fotoğrafın eski kalitesi geri getirilemez.</div>
      ${cur ? `<div class="ar-eff">Bu yıl şu an ${cur} px. Daha da küçültmek için 1000 px seçebilirsiniz.</div>` : ""}
      <span class="hd">KÜÇÜLTME BOYUTU</span>
      <div class="ar-sw"><button type="button" data-s="1200" class="${sel === 1200 ? "on" : ""}" ${cur && cur <= 1200 ? "disabled" : ""}>1200 px<small>yaklaşık %70 kazanç</small></button><button type="button" data-s="1000" class="${sel === 1000 ? "on" : ""}" ${cur && cur <= 1000 ? "disabled" : ""}>1000 px<small>yaklaşık %80 kazanç</small></button></div>
      <div class="ar-eff ${sel ? "" : "no"}">${estText()}</div>
      <label class="ar-chk"><input type="checkbox" id="arBk" ${bk ? "checked" : ""}><span>Önce orijinal fotoğrafların yedeğini indir<small>ZIP parçaları halinde, yaklaşık ${Math.max(1, Math.ceil((u?.bytes || 0) * 0.75 / PART))} dosya (150 MB)</small></span></label>
      <div class="ar-btns"><button class="sec" data-c>Vazgeç</button><button data-go ${sel ? "" : "disabled"}>Başlat</button></div>`);
    ui.box.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { bk = ui.$("#arBk").checked; sel = +b.dataset.s; render(); });
    ui.$("[data-c]").onclick = ui.close;
    ui.$("[data-go]").onclick = () => { bk = ui.$("#arBk").checked; if (bk) run(); else warn(); };
  };
  const warn = () => { ui.set(`<h2>Yedeksiz devam edilsin mi?</h2><div class="warn">Yedek indirilmeden küçültülürse orijinal fotoğraflar geri getirilemez.</div><div class="ar-btns"><button class="sec" data-b>Geri dön</button><button class="danger" data-y>Yine de başlat</button></div>`); ui.$("[data-b]").onclick = render; ui.$("[data-y]").onclick = () => { bk = false; run(); }; };
  const run = async () => {
    const st = { stop: false }, wl = await wakeLock(); ui.busy(true);
    const guard = e => { e.preventDefault(); e.returnValue = ""; }; window.addEventListener("beforeunload", guard);
    try {
      if (bk) { const ok = await backup(ui, fid, y, st); if (!ok) { ui.busy(false); toast("Yedek tamamlanmadı; küçültme başlatılmadı."); return ui.close(); } }
      const total = u?.n || 0;
      ui.set(prog(`${y} yılı · Küçültülüyor`, 0, [["Fotoğraf", `0 / ${nf(total)}`], ["Kazanılan alan", "0 MB"]], true));
      ui.$("[data-x]").onclick = () => { st.stop = true; };
      let last = 0;
      const r = await S.shrinkYear(fid, y, sel, { stop: () => st.stop, onProgress: ({ n, saved }) => { if (Date.now() - last < 200) return; last = Date.now(); ui.set(prog(`${y} yılı · Küçültülüyor`, total ? n / total : 0, [["Fotoğraf", `${nf(n)} / ${nf(total || n)}`], ["Kazanılan alan", fmtSize(saved)]], true)); ui.$("[data-x]").onclick = () => { st.stop = true; }; } });
      ui.busy(false);
      if (r.stopped) { toast("Durduruldu. İstediğiniz zaman kaldığı yerden devam edebilirsiniz."); ui.close(); return onDone?.(); }
      const pct = r.before ? Math.round((1 - r.after / r.before) * 100) : 0;
      ui.set(`<h2>Tamamlandı</h2><div><div class="ar-kv"><span>Fotoğraf</span><b>${nf(r.n)}</b></div><div class="ar-kv"><span>Önce</span><b>${fmtSize(r.before)}</b></div><div class="ar-kv"><span>Şimdi</span><b>${fmtSize(r.after)}</b></div><div class="ar-kv"><span>Kazanç</span><b style="color:var(--gd)">%${pct}</b></div></div><div class="muted" style="font-size:13px">Yıl sayfasında "Küçültüldü · ${sel} px" etiketi görünecek.</div><div class="ar-btns"><button data-c>Kapat</button></div>`);
      ui.$("[data-c]").onclick = () => { ui.close(); onDone?.(); };
    } catch (e) { ui.busy(false); ui.set(`<h2>Hata</h2><div class="warn">İşlem tamamlanamadı: ${esc(e.message || e)}. Yeniden başlatırsanız kaldığı yerden devam eder.</div><div class="ar-btns"><button data-c>Kapat</button></div>`); ui.$("[data-c]").onclick = () => { ui.close(); onDone?.(); }; }
    finally { window.removeEventListener("beforeunload", guard); try { wl?.release(); } catch { } }
  };
  render();
}

// ---- Silme penceresi: tüm fotoğraflar / yılın tamamı ----
export function openSil({ fid, y, meta, onDone }) {
  const ui = shell(); let sel = null;
  const render = () => {
    ui.set(`<h2>${y} yılını sil</h2><div class="muted" style="font-size:13px;line-height:1.5">Silme işleminin geri dönüşü yok. Önce fotoğraf yedeği almanızı öneririz.</div>
      <div class="ar-sw one">${meta?.noPhotos ? "" : `<button type="button" data-d="ph" class="${sel === "ph" ? "on" : ""}">Tüm fotoğrafları sil<small>Veriler kalır. Fotoğraflar küçük resimler dahil kalıcı silinir.</small></button>`}<button type="button" data-d="all" class="rd ${sel === "all" ? "on" : ""}">Yılın tamamını sil<small>${y} yılına ait tüm kayıtlar, kurulum ve fotoğraflar kalıcı silinir.</small></button></div>
      ${sel ? `<div><span class="hd">ONAYLAMAK İÇİN ${y} YAZIN</span><input id="arCf" class="inp" inputmode="numeric" autocomplete="off" style="margin-top:6px"></div>` : ""}
      <div class="ar-btns"><button class="sec" data-c>Vazgeç</button><button class="danger" data-go ${sel ? "disabled" : ""}>Sil</button></div>`);
    ui.box.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { sel = b.dataset.d; render(); ui.$("#arCf")?.focus(); });
    ui.$("[data-c]").onclick = ui.close;
    const cf = ui.$("#arCf"); if (cf) cf.oninput = () => { ui.$("[data-go]").disabled = cf.value.trim() !== String(y); };
    ui.$("[data-go]").onclick = run;
  };
  const run = async () => {
    const st = { stop: false }; ui.busy(true);
    const guard = e => { e.preventDefault(); e.returnValue = ""; }; window.addEventListener("beforeunload", guard);
    try {
      if (sel === "ph") {
        ui.set(prog(`${y} yılı · Fotoğraflar siliniyor`, 0, [["Silinen fotoğraf", "0"]], true)); ui.$("[data-x]").onclick = () => { st.stop = true; };
        const r = await S.deleteYearPhotos(fid, y, { stop: () => st.stop, onProgress: p => { ui.set(prog(`${y} yılı · ${p.phase === "foto" ? "Fotoğraflar siliniyor" : "Kayıtlar temizleniyor"}`, 0.5, [["Silinen fotoğraf", nf(p.n)], ...(p.m ? [["Temizlenen kayıt", nf(p.m)]] : [])], true)); ui.$("[data-x]").onclick = () => { st.stop = true; }; } });
        ui.busy(false); ui.close(); toast(r.stopped ? "Durduruldu; yeniden başlatırsanız devam eder." : "Fotoğraflar silindi."); return onDone?.(null);
      }
      ui.set(`<h2>${y} yılı siliniyor</h2><div class="muted">Lütfen bekleyin…</div>`);
      await S.deleteYearDeep(fid, y); if (S.pref.get("year") === String(y)) S.pref.set("year", "");
      ui.busy(false); ui.close(); toast("Yıl silindi."); onDone?.(null);
    } catch (e) { ui.busy(false); ui.set(`<h2>Hata</h2><div class="warn">İşlem tamamlanamadı: ${esc(e.message || e)}</div><div class="ar-btns"><button data-c>Kapat</button></div>`); ui.$("[data-c]").onclick = () => { ui.close(); onDone?.(null); }; }
    finally { window.removeEventListener("beforeunload", guard); }
  };
  render();
}

// ---- Aktif yıl küçültme: seçilen tarihe kadar yüklenen fotoğraflar (kota %85'i geçince Depolama kartında belirir) ----
const fdate = d => new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
export async function openAktif({ fid, y, onDone }) {
  const ui = shell(); let per = null, px = null, bk = true, dt = "", cnt = null, u = null;
  const today = new Date(), yy = +y, eod = d => new Date(yy, d[0], d[1], 23, 59, 59, 999).getTime();
  const PER = [["mar", "Ç1 sonuna kadar", "31 Mart", eod([2, 31])], ["haz", "Yarı yıl sonuna kadar", "30 Haziran", eod([5, 30])], ["eyl", "Ç3 sonuna kadar", "30 Eylül", eod([8, 30])]];
  const maxD = new Date(today.getTime() - 7 * 864e5), maxIso = (maxD.getFullYear() > yy ? new Date(yy, 11, 31) : maxD).toISOString().slice(0, 10);
  ui.set('<div class="muted">Hesaplanıyor…</div>'); u = await S.photoUsage(fid, y).catch(() => null);
  const upto = () => per === "tar" ? (dt ? new Date(dt + "T23:59:59").getTime() : 0) : (PER.find(p => p[0] === per) || [])[3] || 0;
  const load = async () => { const t = upto(); cnt = t ? await S.photoCountUpto(fid, y, t) : null; };
  const render = () => {
    const t = upto(), n = cnt ?? 0, f = u?.n ? Math.min(1, n / u.n) : 0, gb = (u?.bytes || 0) * f, ready = per && px && t;
    const est = ready ? `${nf(n)} fotoğraf · ${fmtSize(gb)} → yaklaşık ${fmtSize(gb * (px === 1200 ? 0.3 : 0.2))} (${fmtSize(gb * (px === 1200 ? 0.7 : 0.8))} boşalır)` : "Tarih ve boyut seçin.";
    ui.set(`<h2>${y} · Aktif yıl küçültme</h2>
      <div class="muted" style="font-size:13px;line-height:1.5">Seçilen tarihe kadar yüklenen fotoğraflar küçültülür. Sonrakilere dokunulmaz. Veriler ve kayıtlar aynı kalır, eski kalite geri getirilemez.</div>
      <span class="hd">HANGİ TARİHE KADAR</span>
      <div class="ar-sw">${PER.map(([k, n2, d, ms]) => { const ok = ms <= today.getTime(); return `<button type="button" data-p="${k}" class="${per === k ? "on" : ""}" ${ok ? "" : "disabled"}>${n2}<small>${ok ? d : "devam ediyor"}</small></button>`; }).join("")}<button type="button" data-p="tar" class="${per === "tar" ? "on" : ""}">Tarih seç<small>${per === "tar" && dt ? fdate(dt + "T00:00:00") : "kendiniz belirleyin"}</small></button></div>
      ${per === "tar" ? `<div class="row" style="flex-wrap:nowrap"><input type="date" id="arDt" class="inp" min="${yy}-01-01" max="${maxIso}" value="${dt}"><span class="muted" style="font-size:12.5px;flex:0 0 auto">en geç ${fdate(maxIso + "T00:00:00")}</span></div>` : ""}
      <span class="hd">KÜÇÜLTME BOYUTU</span>
      <div class="ar-sw"><button type="button" data-s="1200" class="${px === 1200 ? "on" : ""}">1200 px<small>yaklaşık %70 kazanç</small></button><button type="button" data-s="1000" class="${px === 1000 ? "on" : ""}">1000 px<small>yaklaşık %80 kazanç</small></button></div>
      <div class="ar-eff ${ready ? "" : "no"}">${est}</div>
      <div class="warn">Aktif yıl açık olduğu için, işlem sırasında eklenen fotoğraflar bu seferde küçültülmez. Sonra yeniden çalıştırabilirsiniz.</div>
      <label class="ar-chk"><input type="checkbox" id="arBk" ${bk ? "checked" : ""}><span>Önce orijinal fotoğrafların yedeğini indir<small>ZIP parçaları halinde, yaklaşık ${Math.max(1, Math.ceil(gb * 0.75 / PART))} dosya (150 MB)</small></span></label>
      <div class="ar-btns"><button class="sec" data-c>Vazgeç</button><button data-go ${ready ? "" : "disabled"}>Başlat</button></div>`);
    const keep = () => { bk = ui.$("#arBk").checked; };
    ui.box.querySelectorAll("[data-p]").forEach(b => b.onclick = async () => { keep(); per = b.dataset.p; if (per !== "tar") await load(); render(); });
    ui.box.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { keep(); px = +b.dataset.s; render(); });
    const di = ui.$("#arDt"); if (di) di.onchange = async () => { keep(); dt = di.value; await load(); render(); };
    ui.$("[data-c]").onclick = ui.close;
    ui.$("[data-go]").onclick = () => { keep(); if (bk) go(); else warn(); };
  };
  const warn = () => { ui.set(`<h2>Yedeksiz devam edilsin mi?</h2><div class="warn">Yedek indirilmeden küçültülürse orijinal fotoğraflar geri getirilemez.</div><div class="ar-btns"><button class="sec" data-b>Geri dön</button><button class="danger" data-y>Yine de başlat</button></div>`); ui.$("[data-b]").onclick = render; ui.$("[data-y]").onclick = () => { bk = false; go(); }; };
  const go = async () => {
    const st = { stop: false }, wl = await wakeLock(), t = upto(); ui.busy(true);
    const guard = e => { e.preventDefault(); e.returnValue = ""; }; window.addEventListener("beforeunload", guard);
    try {
      if (bk) { const ok = await backup(ui, fid, y, st, t, cnt || 0); if (!ok) { ui.busy(false); toast("Yedek tamamlanmadı; küçültme başlatılmadı."); return ui.close(); } }
      const total = cnt || 0, T = `${y} · Küçültülüyor`;
      ui.set(prog(T, 0, [["Fotoğraf", `0 / ${nf(total)}`], ["Kazanılan alan", "0 MB"]], true)); ui.$("[data-x]").onclick = () => { st.stop = true; };
      let last = 0;
      const r = await S.shrinkYear(fid, y, px, { upto: t, stop: () => st.stop, onProgress: ({ n, saved }) => { if (Date.now() - last < 200) return; last = Date.now(); ui.set(prog(T, total ? Math.min(1, n / total) : 0, [["Fotoğraf", `${nf(n)} / ${nf(Math.max(total, n))}`], ["Kazanılan alan", fmtSize(saved)]], true)); ui.$("[data-x]").onclick = () => { st.stop = true; }; } });
      ui.busy(false);
      if (r.stopped) { toast("Durduruldu. İstediğiniz zaman kaldığı yerden devam edebilirsiniz."); ui.close(); return onDone?.(true); }
      const pct = r.before ? Math.round((1 - r.after / r.before) * 100) : 0;
      ui.set(`<h2>Tamamlandı</h2><div><div class="ar-kv"><span>Fotoğraf</span><b>${nf(r.n)}</b></div><div class="ar-kv"><span>Önce</span><b>${fmtSize(r.before)}</b></div><div class="ar-kv"><span>Şimdi</span><b>${fmtSize(r.after)}</b></div><div class="ar-kv"><span>Kazanç</span><b style="color:var(--gd)">%${pct}</b></div></div><div class="muted" style="font-size:13px">Depolama kartının yıl dağılımında "Küçültüldü · ${px} px · ${fdate(t)} sonuna kadar" etiketi görünecek.</div><div class="ar-btns"><button data-c>Kapat</button></div>`);
      ui.$("[data-c]").onclick = () => { ui.close(); onDone?.(true); };
    } catch (e) { ui.busy(false); ui.set(`<h2>Hata</h2><div class="warn">İşlem tamamlanamadı: ${esc(e.message || e)}. Yeniden başlatırsanız kaldığı yerden devam eder.</div><div class="ar-btns"><button data-c>Kapat</button></div>`); ui.$("[data-c]").onclick = () => { ui.close(); onDone?.(true); }; }
    finally { window.removeEventListener("beforeunload", guard); try { wl?.release(); } catch { } }
  };
  render();
}

// ---- Depolama kartı: toplam + yüzde sabit, yıl dağılımı açılır; hesap önbellekli (6 saat) ----
const LS = "hse_depo", TTL = 6 * 3600 * 1000;
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch { return null; } };
const lsSet = v => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch { } };
async function compute(factories) {
  const rows = [];
  for (const f of factories) { let ys = []; try { ys = await S.listYears(f.id); } catch { } for (const y of ys) { const u = await S.photoUsage(f.id, y).catch(() => null); if (u) rows.push({ fid: f.id, fn: f.name, y: String(y), n: u.n, bytes: u.bytes, exact: u.exact }); } }
  return { at: Date.now(), rows };
}
export async function renderDepo(el, { factories, profile, metaOf, active, onShrink }) {
  let open = false, data = lsGet(), fac = +profile?.depoFac > 0 ? +profile.depoFac : 1;
  const draw = () => {
    if (!data) { el.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><h2>Depolama</h2><span class="tag gray">tahmini</span></div><div class="muted">Hesaplanıyor…</div>'; return; }
    const raw = data.rows.reduce((a, r) => a + r.bytes, 0), tot = raw * fac, pct = Math.round(tot / GIB * 100), warn = pct >= 85, col = warn ? "var(--red)" : "var(--gd)";
    const byY = {}; data.rows.forEach(r => { (byY[r.y] ||= []).push(r); });
    const years = Object.keys(byY).sort((a, b) => b - a).map(y => ({ y, rs: byY[y], bytes: byY[y].reduce((a, r) => a + r.bytes, 0) * fac }));
    const multi = new Set(data.rows.map(r => r.fid)).size > 1, d = new Date(data.at);
    el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><h2>Depolama</h2><span class="tag gray">tahmini</span></div>
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px"><b style="font:700 26px Sora,sans-serif">${(tot / GIB).toFixed(2).replace(".", ",")} GB <span class="muted" style="font:600 14px Manrope,sans-serif">/ 1 GB</span></b><b style="font:700 22px Sora,sans-serif;color:${col}">%${pct}</b></div>
      <div class="ar-bar"><i style="width:${Math.min(100, pct)}%;background:${col}"></i></div>
      ${warn ? '<div class="warn">Kota %85\'i aştı. Arşivdeki yılları küçültün veya silin.</div>' : ""}
      <button class="ar-sh" id="dpT" type="button" aria-expanded="${open}" style="border-top:1px solid var(--line);padding-top:12px"><span>Yıl yıl dağılım</span><span class="cv"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span></button>
      <div class="col1" id="dpB" ${open ? "" : "hidden"}>
        ${years.map(r => { const ms = r.rs.map(x => metaOf(x.fid, x.y)), tag = ms.length && ms.every(m => m?.noPhotos) ? '<span class="tag gray">Fotoğraflar silindi</span>' : ms.length && ms.every(m => m?.shrink) ? `<span class="tag">Küçültüldü · ${Math.max(...ms.map(m => m.shrink.px))} px</span>` : ms.some(m => m?.shrinkPart) ? (() => { const m = ms.filter(x => x?.shrinkPart).sort((a, b) => b.shrinkPart.upto - a.shrinkPart.upto)[0].shrinkPart; return `<span class="tag">Küçültüldü · ${m.px} px · ${fdate(m.upto)} sonuna kadar</span>`; })() : "";
          return `<div class="ar-yr"><b>${r.y}</b><div class="ar-bar sm"><i style="width:${tot ? Math.round(r.bytes / tot * 100) : 0}%;background:${col}"></i></div><span style="text-align:right">${fmtSize(r.bytes)}</span></div>${tag || (multi && r.rs.length > 1) ? `<div style="margin:-6px 0 0 54px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">${tag}${multi ? `<span class="muted" style="font-size:12px">${r.rs.map(x => esc(x.fn) + " " + fmtSize(x.bytes * fac)).join(" · ")}</span>` : ""}</div>` : ""}`; }).join("") || '<div class="muted">Henüz fotoğraf yok.</div>'}
        <div style="border-top:1px solid var(--line);padding-top:12px;display:flex;flex-direction:column;gap:8px"><span class="hd">KONSOLDAKİ GERÇEK DEĞER (İSTEĞE BAĞLI, BİR KEZ)</span>
          <div class="row" style="flex-wrap:nowrap"><input id="dpC" class="inp" inputmode="decimal" placeholder="Örn. 0,86 GB"><button class="sec" id="dpK" type="button" style="flex:0 0 auto">Düzelt</button></div>
          <span class="muted" style="font-size:12.5px">${fac === 1 ? "Girilirse hesap bu değere göre düzeltilir. Sonra tekrar girmeniz gerekmez." : "Düzeltme uygulandı (×" + fac.toFixed(2).replace(".", ",") + ")."}</span></div>
        <div class="row" style="justify-content:space-between"><span class="muted" style="font-size:12.5px" id="dpL">Son hesap: ${d.toLocaleDateString("tr-TR")} ${d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span><button class="sec sm" id="dpR" type="button">Yenile</button></div>
      </div>
      ${warn && active ? `<div class="ar-act"><b>Aktif yıl küçültme · ${active.y}${active.fn ? " · " + esc(active.fn) : ""}</b><span class="muted" style="font-size:13px;line-height:1.5">Arşive geçmeden aktif yılın eski fotoğraflarını küçültebilirsiniz. Veriler ve kayıtlar aynı kalır.</span><div><button id="dpA" type="button">Aktif yılı küçült</button></div></div>` : ""}`;
    el.querySelector("#dpT").onclick = () => { open = !open; draw(); };
    const ba = el.querySelector("#dpA"); if (ba) ba.onclick = () => openAktif({ fid: active.fid, y: active.y, onDone: async () => { onShrink?.(); data = await compute(factories); lsSet(data); draw(); } });
    el.querySelector("#dpR").onclick = async () => { el.querySelector("#dpL").textContent = "Hesaplanıyor…"; data = await compute(factories); lsSet(data); draw(); };
    el.querySelector("#dpK").onclick = async () => {
      const v = parseFloat((el.querySelector("#dpC").value || "").replace(",", ".")); if (!(v > 0) || !raw) return toast("Bir sayı yazın.");
      fac = v / (raw / GIB); try { await S.saveProfile({ depoFac: fac }); toast("Düzeltme kaydedildi."); } catch { toast("Kaydedilemedi."); } draw();
    };
  };
  draw();
  if (!data || Date.now() - data.at > TTL) { try { data = await compute(factories); lsSet(data); draw(); } catch { if (!data) el.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><h2>Depolama</h2></div><div class="muted">Hesaplanamadı. Bağlantıyı kontrol edip sayfayı yenileyin.</div>'; } }
}
