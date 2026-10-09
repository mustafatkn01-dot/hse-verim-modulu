// Ortak PDF yardımcıları: kâğıt boyutu (A4/A3) + sayfa düzeni (dikey/yatay) penceresi
import { esc } from "./ui.js?v=20261009z";

export function askFormat({ title = "PDF indir", text = "", defOrient = "portrait", hint = "" } = {}) {
  return new Promise(res => {
    const o = { size: "A4", orient: defOrient };
    const m = document.createElement("div"); m.className = "mod";
    const seg = (k, items) => items.map(([v, t]) => `<button class="sec" data-k="${k}" data-v="${v}" style="flex:1;height:44px;border-radius:10px;font-weight:700">${t}</button>`).join("");
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:16px"><h2>${esc(title)}</h2>
      <div class="muted" style="line-height:1.5">${esc(text)}</div>
      <div class="col1" style="gap:8px"><span class="hd">KÂĞIT BOYUTU</span><div class="row" style="gap:8px;flex-wrap:nowrap">${seg("size", [["A4", "A4"], ["A3", "A3"]])}</div></div>
      <div class="col1" style="gap:8px"><span class="hd">SAYFA DÜZENİ</span><div class="row" style="gap:8px;flex-wrap:nowrap">${seg("orient", [["portrait", "Dikey"], ["landscape", "Yatay"]])}</div>
        ${hint ? `<span class="muted" style="font-size:12.5px">${esc(hint)}</span>` : ""}</div>
      <div class="muted" style="font-size:12.5px;line-height:1.5">Açılan yazdırma penceresinde hedef olarak "PDF olarak kaydet" seçin. Ölçek ve kenar boşlukları "Varsayılan" kalsın.</div>
      <div class="row" style="justify-content:flex-end"><button class="sec" data-no>İptal</button><button data-yes>PDF oluştur</button></div></div>`;
    document.body.appendChild(m);
    const paint = () => m.querySelectorAll("[data-k]").forEach(b => { const on = o[b.dataset.k] === b.dataset.v; b.style.background = on ? "var(--sel)" : ""; b.style.color = on ? "#fff" : ""; b.setAttribute("aria-pressed", on); });
    m.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { o[b.dataset.k] = b.dataset.v; paint(); });
    paint();
    const done = v => { m.remove(); res(v); };
    m.querySelector("[data-no]").onclick = () => done(null);
    m.addEventListener("mousedown", e => { if (e.target === m) done(null); });
    m.querySelector("[data-yes]").onclick = () => done({ ...o });
  });
}

// Açık sayfayı seçilen kâğıt/yönde yazdır (menü ve düğmeler gizlenir)
export function printCurrent({ size, orient }) {
  const stl = document.createElement("style");
  stl.textContent = `@media print{@page{size:${size} ${orient};margin:10mm}}`;
  document.head.appendChild(stl);
  const clean = () => { stl.remove(); window.removeEventListener("afterprint", clean); };
  window.addEventListener("afterprint", clean);
  setTimeout(() => window.print(), 150);
}
