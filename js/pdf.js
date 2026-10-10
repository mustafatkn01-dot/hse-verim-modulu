// Ortak PDF yardımcıları: kâğıt boyutu (A4/A3) + sayfa düzeni (dikey/yatay) penceresi
import { esc } from "./ui.js?v=20261011h";

export function askFormat({ title = "PDF indir", text = "", defOrient = "portrait", hint = "", pics = 0 } = {}) {
  return new Promise(res => {
    const o = { size: "A4", orient: defOrient, pics: false };
    const m = document.createElement("div"); m.className = "mod";
    const seg = (k, items) => items.map(([v, t]) => `<button class="sec" data-k="${k}" data-v="${v}" style="flex:1;height:44px;border-radius:10px;font-weight:700">${t}</button>`).join("");
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:16px"><h2>${esc(title)}</h2>
      <div class="muted" style="line-height:1.5">${esc(text)}</div>
      <div class="col1" style="gap:8px"><span class="hd">KÂĞIT BOYUTU</span><div class="row" style="gap:8px;flex-wrap:nowrap">${seg("size", [["A4", "A4"], ["A3", "A3"]])}</div></div>
      <div class="col1" style="gap:8px"><span class="hd">SAYFA DÜZENİ</span><div class="row" style="gap:8px;flex-wrap:nowrap">${seg("orient", [["portrait", "Dikey"], ["landscape", "Yatay"]])}</div>
        ${hint ? `<span class="muted" style="font-size:12.5px">${esc(hint)}</span>` : ""}</div>
      ${pics ? `<label class="row" style="gap:10px;flex-wrap:nowrap;font-weight:600;cursor:pointer"><input type="checkbox" data-pics style="width:20px;height:20px"> Resimleri ekle (${pics} adet · her açıklamanın altında yaklaşık 8 cm)</label>` : ""}
      <div class="muted" style="font-size:12.5px;line-height:1.5">Yazdırma önizlemesi açılır; oradan doğrudan yazdırabilir veya hedef olarak "PDF olarak kaydet" seçebilirsiniz. Ölçek ve kenar boşlukları "Varsayılan" kalsın.</div>
      <div class="row" style="justify-content:flex-end"><button class="sec" data-no>İptal</button><button class="sec" data-file title="Yazdırmadan doğrudan PDF dosyası olarak indir">Dosya olarak indir</button><button data-yes>Önizleme ve yazdır</button></div></div>`;
    document.body.appendChild(m);
    const paint = () => m.querySelectorAll("[data-k]").forEach(b => { const on = o[b.dataset.k] === b.dataset.v; b.style.background = on ? "var(--sel)" : ""; b.style.color = on ? "#fff" : ""; b.setAttribute("aria-pressed", on); });
    m.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { o[b.dataset.k] = b.dataset.v; paint(); });
    paint();
    const done = v => { m.remove(); res(v); };
    m.querySelector("[data-no]").onclick = () => done(null);
    m.addEventListener("mousedown", e => { if (e.target === m) done(null); });
    const pc = m.querySelector("[data-pics]");
    m.querySelector("[data-yes]").onclick = () => done({ ...o, pics: !!pc?.checked, file: false });
    m.querySelector("[data-file]").onclick = () => done({ ...o, pics: !!pc?.checked, file: true });
  });
}

// Açık sayfayı seçilen kâğıt/yönde yazdır (menü ve düğmeler gizlenir)
// header: her sayfanın üst kenar boşluğunda tekrarlanan tek satır (marka · tesis · rapor · dönem)
export function printCurrent({ size, orient, name, header = "" }) {
  const stl = document.createElement("style");
  const hs = header.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  stl.textContent = `@media print{@page{size:${size} ${orient};margin:${header ? "17mm" : "10mm"} 10mm 14mm;@bottom-center{content:"Sayfa " counter(page) "/" counter(pages);font:600 9.5px Manrope,system-ui,sans-serif;color:#546964}${header ? `@top-left{content:"${hs}";font:700 9.5px Manrope,system-ui,sans-serif;letter-spacing:.6px;color:#546964;vertical-align:bottom;padding-bottom:3mm;border-bottom:1.5px solid #0B2230}` : ""}}}`;
  document.head.appendChild(stl);
  const clean = () => { stl.remove(); window.removeEventListener("afterprint", clean); };
  window.addEventListener("afterprint", clean);
  setTimeout(() => (name ? withTitle(name, () => window.print()) : window.print()), 150);
}

// Gerçek PDF dosyası üret (yazdırma penceresinden bağımsız: telefonda da seçilen boyut/yön korunur)
const loadScript = src => new Promise((res, rej) => {
  if (document.querySelector(`script[data-lib="${src}"]`)) return res();
  const e = document.createElement("script"); e.src = src; e.dataset.lib = src; e.onload = res; e.onerror = () => rej(new Error("lib"));
  document.head.appendChild(e);
});
export async function loadPdfLibs() {
  if (!window.html2canvas) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
  if (!window.jspdf) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  if (!window.html2canvas || !window.jspdf) throw new Error("lib");
}
const PT = { A4: [595.28, 841.89], A3: [841.89, 1190.55] };
// el: sayfa genişliğinde (px) çizilmiş öğe; birden fazla sayfaya bölünebilir (tek=true ise tek sayfaya sığdırılır)
export async function savePdf(el, { size, orient, name, margin = 28, scale, single = false, breaks = null, header = "", pageNo = false }) {
  await loadPdfLibs();
  if (document.fonts?.ready) await document.fonts.ready;
  const sc = scale || (size === "A3" ? 3 : 2.5);
  const cv = await window.html2canvas(el, { scale: sc, backgroundColor: "#ffffff", useCORS: true, logging: false });
  let [pw, ph] = PT[size] || PT.A4; if (orient === "landscape") [pw, ph] = [ph, pw];
  const doc = new window.jspdf.jsPDF({ orientation: orient, unit: "pt", format: size.toLowerCase() });
  const cw = pw - 2 * margin, chh = ph - 2 * margin, k = cw / cv.width;
  // Her sayfanın üst boşluğuna tek satır üst bilgi (Türkçe karakterler için tuval ile çizilir)
  let hdr = null;
  if (header) { const hc = document.createElement("canvas"), g = hc.getContext("2d"), hs = 4; hc.width = Math.round(cw * hs); hc.height = Math.round(16 * hs);
    g.fillStyle = "#fff"; g.fillRect(0, 0, hc.width, hc.height); g.fillStyle = "#546964"; g.font = `700 ${8.5 * hs}px Manrope,system-ui,sans-serif`; g.textBaseline = "alphabetic"; g.fillText(header, 0, 10 * hs);
    g.fillStyle = "#0B2230"; g.fillRect(0, 13 * hs, hc.width, 1.2 * hs); hdr = hc.toDataURL("image/png"); }
  const putHdr = () => { if (hdr) doc.addImage(hdr, "PNG", margin, Math.max(4, margin - 19), cw, 16); };
  let drawW = cw, drawH = cv.height * k;
  if (single && drawH > chh) { const f = chh / drawH; drawW *= f; drawH = chh; }
  if (single || drawH <= chh) {
    putHdr(); doc.addImage(cv.toDataURL("image/jpeg", 0.92), "JPEG", margin + (cw - drawW) / 2, margin, drawW, drawH);
  } else {
    const slice = Math.floor(chh / k); // bir sayfaya düşen kaynak piksel
    const bk = (breaks || []).map(b => Math.round(b * sc)).sort((a, b) => a - b);
    for (let y = 0, pg = 0; y < cv.height;) {
      let end = Math.min(y + slice, cv.height);
      if (end < cv.height && bk.length) { const ok = bk.filter(b => b > y + slice * 0.35 && b <= y + slice); if (ok.length) end = ok[ok.length - 1]; }
      const h = end - y, c2 = document.createElement("canvas"); c2.width = cv.width; c2.height = h;
      c2.getContext("2d").drawImage(cv, 0, y, cv.width, h, 0, 0, cv.width, h);
      if (pg) doc.addPage();
      putHdr(); doc.addImage(c2.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, cw, h * k);
      y = end; pg++;
    }
  }
  if (pageNo) { const tot = doc.getNumberOfPages(), fc = document.createElement("canvas"), g = fc.getContext("2d"), hs = 4; fc.width = 120 * hs; fc.height = 14 * hs;
    for (let i = 1; i <= tot; i++) { g.fillStyle = "#fff"; g.fillRect(0, 0, fc.width, fc.height); g.fillStyle = "#546964"; g.font = `600 ${8.5 * hs}px Manrope,system-ui,sans-serif`; g.textAlign = "center"; g.fillText(`Sayfa ${i}/${tot}`, fc.width / 2, 10 * hs); doc.setPage(i); doc.addImage(fc.toDataURL("image/png"), "PNG", (pw - 120) / 2, ph - margin + 4, 120, 14); } }
  doc.save(name);
}

// Açık rapor sayfasını (düğmeler hariç) seçilen boyut/yönde PDF dosyasına çevir; kartlar sayfa sonunda bölünmez
export async function saveReportPdf(v, { size, orient, name, header = "" }) {
  const land = orient === "landscape", M = 38, W = (land ? 1123 : 794) - 2 * M;
  const box = document.createElement("div"); box.className = "lightbox";
  box.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;background:#fff;padding:0;display:flex;flex-direction:column;gap:14px;color:#10201C`;
  [...v.children].forEach(ch => { if (!ch.classList.contains("noprint")) { const c = ch.cloneNode(true); c.querySelectorAll(".noprint").forEach(x => x.remove()); box.appendChild(c); } });
  document.body.appendChild(box);
  try {
    const top0 = box.getBoundingClientRect().top;
    const breaks = [...box.children, ...box.querySelectorAll("[data-brk]")].map(c => c.getBoundingClientRect().top - top0).filter(t => t > 0);
    await savePdf(box, { size, orient, name, margin: M * 0.75 * (size === "A3" ? 1.4142 : 1), scale: size === "A3" ? 3 : 2.5, breaks, header, pageNo: true });
  } finally { box.remove(); }
}

// Dosya adı: "<Tablo adı> (<Ay Yıl> - A3)"; yazdırma ekranından PDF kaydedilirken de bu ad önerilir
export const fileTitle = (title, plabel, size) => `${title} (${plabel} - ${size})`.replace(/\s*·\s*/g, " - ").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
export function withTitle(name, fn) {
  const old = document.title; document.title = name;
  const back = () => { document.title = old; window.removeEventListener("afterprint", back); };
  window.addEventListener("afterprint", back); setTimeout(back, 120000);
  fn();
}
