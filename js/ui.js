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
// Bilgi / uyarı penceresi (tarayıcının yerleşik alert kutusu yerine): tone "ok" (yeşil) veya "warn" (sarı)
export function noticeBox(title, text, tone = "warn") {
  const [bg, c, d] = tone === "ok" ? ["#D9F1E6", "#0B6E4F", "M4 12l5 5L20 6"] : ["#FBE9C6", "#5A3300", "M12 7v6M12 17h0"];
  return modal(`<div style="display:flex;gap:14px;align-items:flex-start"><span aria-hidden="true" style="flex:0 0 40px;width:40px;height:40px;border-radius:50%;background:${bg};display:grid;place-items:center"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg></span>
    <div class="col1" style="gap:6px;min-width:0"><h2 style="margin:0">${esc(title)}</h2><p class="muted" style="margin:0;line-height:1.55">${esc(text)}</p></div></div>
    <div class="row" style="justify-content:flex-end"><button data-yes>Tamam</button></div><button data-no hidden aria-hidden="true"></button>`);
}
export const formBox = (title, fields) => modal(`<h2>${esc(title)}</h2>${fields.map(([n, l, v]) => `<div><label>${esc(l)}</label><input name="${n}" value="${esc(v)}"></div>`).join("")}<div class="row" style="justify-content:flex-end;margin-top:6px"><button class="sec" data-no>İptal</button><button data-yes>Kaydet</button></div>`);

// Büyük açıklama penceresi + sesle yazma (tr-TR). Kaydet → metni döner, vazgeç → null
export function noteEditor({ title, item, text, question = "Hangi makine veya alanda, ne gibi bir uygunsuzluk var?", example = "Örn. Pres-2 koruyucu kapağı açık bırakılmış; operatör müdahale ediyor." }) {
  return new Promise(res => {
    const m = document.createElement("div"); m.className = "mod";
    m.innerHTML = `<div class="mbox ed" role="dialog" aria-modal="true" aria-label="Açıklama düzenle">
      <div class="edh"><button class="okb" data-save aria-label="Kaydet ve forma dön">${ic('<path d="M4 12l5 5L20 6"/>', 26).replace('stroke-width="2"', 'stroke-width="3"')}</button>
        <div class="grow"><b style="font:600 16px Sora,sans-serif">${esc(title)}</b><div class="muted" style="font-size:12.5px">${esc(item)}</div></div>
        <button class="sec xq" data-x aria-label="Vazgeç">×</button></div>
      <div class="edb"><div class="hd">${esc(question)}</div>
        <textarea id="edTxt" rows="8" placeholder="${esc(example)}">${esc(text)}</textarea>
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

// Fotoğrafı küçült (tam: yazdırma kalitesi, en çok 1800 px, küçük resim: 140 px), EXIF yönünü uygula
export async function compressImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { bmp = await new Promise((res, rej) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => res(im); im.onerror = () => rej(new Error("Resim okunamadı")); im.src = u; }); }
  const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight;
  const draw = (max, q) => { const r = Math.min(1, max / Math.max(w0, h0)), c = document.createElement("canvas"); c.width = Math.round(w0 * r); c.height = Math.round(h0 * r); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", q); };
  let full = draw(1800, 0.85); for (const [mx, q] of [[1600, 0.8], [1400, 0.75], [1200, 0.7], [1000, 0.65]]) if (full.length > 900000) full = draw(mx, q);
  return { full, thumb: draw(140, 0.6) };
}
// Kayıtlı fotoğrafı (dataURL) hedef uzun kenara küçültür (1000 px: %65, 1200 px: %70); zaten küçükse null döner
export async function shrinkDataUrl(src, px) {
  const im = new Image(); im.src = src; await im.decode();
  const w = im.naturalWidth, h = im.naturalHeight, m = Math.max(w, h); if (m <= px) return null;
  const r = px / m, c = document.createElement("canvas"); c.width = Math.round(w * r); c.height = Math.round(h * r);
  c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", px <= 1000 ? 0.65 : 0.7);
}
// Tam ekran fotoğraf görüntüleyici
export function showPhoto(src) {
  const m = document.createElement("div"); m.className = "mod";
  m.innerHTML = `<div class="mbox" style="gap:12px;align-items:center;max-width:min(96vw,900px)"><img src="${src}" alt="Fotoğraf" style="max-width:100%;max-height:75vh;border-radius:10px"><button data-x>Kapat</button></div>`;
  document.body.appendChild(m); const close = () => m.remove();
  m.querySelector("[data-x]").onclick = close; m.addEventListener("mousedown", e => { if (e.target === m) close(); });
}

// Misafir kuralı: yalnızca bu ay ve önceki ay için veri girişi
export const GUEST = { on: false, name: "", uid: "" };
export const guestLock = (year, month) => {
  if (!GUEST.on) return false;
  const n = new Date(), cur = n.getMonth() + 1, prev = cur === 1 ? 12 : cur - 1;
  if (+year !== n.getFullYear()) return !(cur === 1 && +year === n.getFullYear() - 1 && +month === 12);
  return !(+month === cur || +month === prev);
};
export const roText = (year, month, active) => GUEST.on && guestLock(year, month) && String(year) === String(active)
  ? "Misafir olarak yalnızca bu ay ve önceki ay için veri girebilirsiniz." : `${year} geçmiş bir yıldır, salt okunur. Değişiklik için güncel yılı seçin.`;

// Tarih seçici: tarayıcının yerleşik takviminin yerine, bilgi kartı düzeninde (ikon, başlık, açıklama, Tamam) özel takvim.
// range=true → başlangıç + bitiş; döner { a, z } (z yoksa a) veya vazgeçilirse null. marks(k) → { ad, yarim } | null (tatil noktası)
const PAY = n => String(n).padStart(2, "0");
const PISO = d => `${d.getFullYear()}-${PAY(d.getMonth() + 1)}-${PAY(d.getDate())}`;
const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const fmtTarih = s => (s ? `${+s.slice(8)} ${AYLAR[+s.slice(5, 7) - 1].slice(0, 3)} ${s.slice(0, 4)}` : "");
export function pickDate({ title = "Tarih seçin", min = "", max = "", a = "", z = "", range = false, marks = null, view = "" } = {}) {
  return new Promise(res => {
    const today = PISO(new Date());
    let ta = a || "", tz = z && z !== a ? z : "";
    const first = ta || view || (max && max < today ? max : min && min > today ? min : today);
    let vy = +first.slice(0, 4), vm = +first.slice(5, 7) - 1;
    const m = document.createElement("div"); m.className = "mod";
    m.innerHTML = `<div class="mbox cl" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div style="display:flex;gap:14px;align-items:flex-start"><span aria-hidden="true" style="flex:0 0 40px;width:40px;height:40px;border-radius:50%;background:#D9F1E6;display:grid;place-items:center"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B6E4F" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg></span>
        <div class="col1" style="gap:6px;min-width:0"><h2 style="margin:0">${esc(title)}</h2><p class="muted" style="margin:0;line-height:1.55" id="clS"></p></div></div>
      <div class="clh"><b id="clM"></b><span style="display:flex;gap:6px"><button class="sec clnv" data-p aria-label="Önceki ay"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button><button class="sec clnv" data-n aria-label="Sonraki ay"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button></span></div>
      <div class="clg"><i>Pzt</i><i>Sal</i><i>Çar</i><i>Per</i><i>Cum</i><i>Cmt</i><i>Paz</i></div><div class="clg" id="clG"></div>
      ${marks ? `<div class="muted" style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px"><span><i class="cdot" style="background:#8FA19B"></i>Resmi tatil</span><span><i class="cdot" style="background:#E8A512"></i>Yarım gün</span></div><div class="muted" style="font-size:12.5px;line-height:1.5" id="clI"></div>` : ""}
      <div class="row" style="justify-content:flex-end"><button class="sec" data-no>İptal</button><button data-yes disabled>Tamam</button></div></div>`;
    document.body.appendChild(m);
    const q = s => m.querySelector(s), close = v => { document.removeEventListener("keydown", esk); m.remove(); res(v); };
    const esk = e => { if (e.key === "Escape") close(null); };
    document.addEventListener("keydown", esk);
    const draw = () => {
      q("#clM").textContent = `${AYLAR[vm]} ${vy}`;
      const ym = `${vy}-${PAY(vm + 1)}`;
      q("[data-p]").disabled = !!min && ym <= min.slice(0, 7); q("[data-n]").disabled = !!max && ym >= max.slice(0, 7);
      const off = (new Date(vy, vm, 1).getDay() + 6) % 7, n = new Date(vy, vm + 1, 0).getDate(); let h = "<span></span>".repeat(off);
      for (let d = 1; d <= n; d++) {
        const k = `${ym}-${PAY(d)}`, g = (new Date(vy, vm, d).getDay() + 6) % 7, mk = marks?.(k), out = (min && k < min) || (max && k > max);
        const hi = tz || "", s = k === ta || k === hi, mid = hi && k > ta && k < hi;
        const c = ["cld", g >= 5 ? "we" : "", k === today ? "td" : "", out ? "out" : "", s ? "sel" : "", mid ? "mid" : "", s && hi && k === ta ? "a" : "", s && hi && k === hi ? "z" : ""].filter(Boolean).join(" ");
        h += `<button class="${c}" data-k="${k}" ${out ? "disabled" : ""}>${d}${mk ? `<i class="cdot" style="background:${mk.yarim ? "#E8A512" : "#8FA19B"}"></i>` : ""}</button>`;
      }
      q("#clG").innerHTML = h;
      const gun = ta && tz ? Math.round((new Date(tz) - new Date(ta)) / 864e5) + 1 : 0;
      q("#clS").textContent = !ta ? (range ? "Önce başlangıç gününe dokunun. Bitiş için ikinci bir güne dokunun." : "Bir güne dokunun.") : tz ? `${fmtTarih(ta)} → ${fmtTarih(tz)} · ${gun} gün` : range ? `${fmtTarih(ta)}. Bitiş için ikinci bir güne dokunun, tek gün için Tamam'a basın.` : fmtTarih(ta);
      q("[data-yes]").disabled = !ta;
      const I = q("#clI"); if (I) { const l = []; if (ta) for (let t = new Date(ta + "T12:00"); PISO(t) <= (tz || ta); t.setDate(t.getDate() + 1)) { const mk = marks(PISO(t)); if (mk) l.push(`${+PISO(t).slice(8)} ${AYLAR[t.getMonth()].slice(0, 3)} ${mk.ad}${mk.yarim ? " (yarım gün)" : ""}`); } I.textContent = !ta ? "Tatil olan günler noktayla işaretlidir." : l.length ? `Aralıkta tatil var: ${l.join(", ")}.` : "Seçilen günlerde tatil yok."; }
    };
    q("#clG").onclick = e => { const b = e.target.closest(".cld"); if (!b || b.disabled) return; const k = b.dataset.k;
      if (!range) { ta = k; tz = ""; } else if (!ta || tz) { ta = k; tz = ""; } else if (k < ta) ta = k; else if (k === ta) tz = ""; else tz = k;
      draw(); };
    q("[data-p]").onclick = () => { if (--vm < 0) { vm = 11; vy--; } draw(); };
    q("[data-n]").onclick = () => { if (++vm > 11) { vm = 0; vy++; } draw(); };
    q("[data-no]").onclick = () => close(null);
    q("[data-yes]").onclick = () => close({ a: ta, z: tz || ta });
    m.addEventListener("mousedown", e => { if (e.target === m) close(null); });
    draw();
  });
}
