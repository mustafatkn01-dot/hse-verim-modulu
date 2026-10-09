// Ortak arayüz yardımcıları
export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const ic = (d, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600); }

export function modal(html, opts = {}) {
  return new Promise(res => {
    const m = document.createElement("div"); m.className = "mod"; m.innerHTML = `<div class="mbox" ${opts.wide ? 'style="max-width:720px"' : ""} role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(m);
    const close = v => { opts.onClose?.(); m.remove(); res(v); };
    m.addEventListener("mousedown", e => { if (e.target === m && !opts.sticky) close(null); });
    m.querySelector("[data-no]").onclick = () => close(null);
    m.querySelector("[data-yes]").onclick = () => close(Object.fromEntries([...m.querySelectorAll("input,textarea")].map(i => [i.name, i.value])));
    m.querySelector("input,textarea")?.focus();
  });
}
export async function confirmBox(title, text, yes, danger = false) {
  return !!(await modal(`<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p><div class="row" style="justify-content:flex-end"><button class="sec" data-no>İptal</button><button class="${danger ? "danger" : ""}" data-yes>${esc(yes)}</button></div>`));
}
export const formBox = (title, fields) => modal(`<h2>${esc(title)}</h2>${fields.map(([n, l, v]) => `<div><label>${esc(l)}</label><input name="${n}" value="${esc(v)}"></div>`).join("")}<div class="row" style="justify-content:flex-end;margin-top:6px"><button class="sec" data-no>İptal</button><button data-yes>Kaydet</button></div>`);

// Büyük açıklama penceresi + sesle yazma (tr-TR). Kaydet → metni döner, vazgeç → null
export function noteEditor({ title, item, text, question = "Hangi makine veya alanda, ne gibi bir uygunsuzluk var?" }) {
  return new Promise(res => {
    const m = document.createElement("div"); m.className = "mod";
    m.innerHTML = `<div class="mbox ed" role="dialog" aria-modal="true" aria-label="Açıklama düzenle">
      <div class="edh"><button class="okb" data-save aria-label="Kaydet ve forma dön">${ic('<path d="M4 12l5 5L20 6"/>', 26).replace('stroke-width="2"', 'stroke-width="3"')}</button>
        <div class="grow"><b style="font:600 16px Sora,sans-serif">${esc(title)}</b><div class="muted" style="font-size:12.5px">${esc(item)}</div></div>
        <button class="sec xq" data-x aria-label="Vazgeç">×</button></div>
      <div class="edb"><div class="hd">${esc(question)}</div>
        <textarea id="edTxt" rows="8" placeholder="Örn. Pres-2 koruyucu kapağı açık bırakılmış; operatör müdahale ediyor.">${esc(text)}</textarea>
        <div class="row"><button class="sec vb" data-voice>${ic('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>')}<span id="vTxt">Konuşarak yaz</span></button>
          <span class="muted" id="vNote" style="font-size:12.5px;flex:1 1 200px">Mikrofona dokunup Türkçe konuşun, metin otomatik yazılır.</span></div>
        <div class="muted" style="font-size:12.5px">Yeşil işaret açıklamayı kaydeder ve forma döner.</div></div></div>`;
    document.body.appendChild(m);
    const ta = m.querySelector("#edTxt"); let rec = null;
    const stop = () => { try { if (rec) { rec.onend = null; rec.stop(); } } catch {} rec = null; m.querySelector("[data-voice]").classList.remove("live"); m.querySelector("#vTxt").textContent = "Konuşarak yaz"; };
    const done = v => { stop(); m.remove(); res(v); };
    m.querySelector("[data-save]").onclick = () => done(ta.value);
    m.querySelector("[data-x]").onclick = () => done(null);
    m.querySelector("[data-voice]").onclick = () => {
      const note = m.querySelector("#vNote");
      if (rec) { stop(); note.textContent = "Mikrofona dokunup Türkçe konuşun, metin otomatik yazılır."; return; }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { note.textContent = "Bu tarayıcı sesle yazmayı desteklemiyor. Klavyenizdeki mikrofon simgesini kullanabilirsiniz."; return; }
      try {
        rec = new SR(); rec.lang = "tr-TR"; rec.continuous = true; rec.interimResults = false;
        rec.onresult = ev => {
          let add = ""; for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) add += ev.results[i][0].transcript;
          add = add.trim(); if (!add) return;
          const cur = ta.value.replace(/\s+$/, ""); ta.value = cur ? cur + " " + add : add.charAt(0).toUpperCase() + add.slice(1);
        };
        rec.onerror = () => { stop(); note.textContent = "Mikrofona erişilemedi. Tarayıcıda mikrofon iznini kontrol edin."; };
        rec.onend = () => { stop(); };
        rec.start(); m.querySelector("[data-voice]").classList.add("live"); m.querySelector("#vTxt").textContent = "Dinleniyor… durdur"; note.textContent = "Konuşun; söyledikleriniz metne eklenir.";
      } catch { rec = null; note.textContent = "Sesle yazma başlatılamadı."; }
    };
    ta.focus();
  });
}

// Fotoğrafı küçült (tam: en çok 1200 px, küçük resim: 140 px), EXIF yönünü uygula
export async function compressImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { bmp = await new Promise((res, rej) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => res(im); im.onerror = () => rej(new Error("Resim okunamadı")); im.src = u; }); }
  const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight;
  const draw = (max, q) => { const r = Math.min(1, max / Math.max(w0, h0)), c = document.createElement("canvas"); c.width = Math.round(w0 * r); c.height = Math.round(h0 * r); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", q); };
  let full = draw(1200, 0.72); if (full.length > 700000) full = draw(900, 0.6);
  return { full, thumb: draw(140, 0.6) };
}
// Tam ekran fotoğraf görüntüleyici
export function showPhoto(src) {
  const m = document.createElement("div"); m.className = "mod";
  m.innerHTML = `<div class="mbox" style="gap:12px;align-items:center;max-width:min(96vw,900px)"><img src="${src}" alt="Fotoğraf" style="max-width:100%;max-height:75vh;border-radius:10px"><button data-x>Kapat</button></div>`;
  document.body.appendChild(m); const close = () => m.remove();
  m.querySelector("[data-x]").onclick = close; m.addEventListener("mousedown", e => { if (e.target === m) close(); });
}
