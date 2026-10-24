// Eğitim Konuşması ve İşbaşı Eğitim için "kayıt ekleme" yardımcıları: aylık toplam = sahip kayıtları + onaylı misafir kayıtları
import * as S from "./store.js?v=20261022s";
import { esc, ic, toast, pickDate, fmtTarih, GUEST, confirmBox } from "./ui.js?v=20261022s";

const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const isNum = s => /^[0-9]+([.,][0-9]+)?$/.test(String(s).trim());
export const isInt = s => /^[0-9]+$/.test(String(s).trim());
export const toNum = s => { const v = parseFloat(String(s).replace(",", ".")); return isNaN(v) ? 0 : v; };
export const eid = () => "k" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
export const GCOLL = { konusma: "konusmag", isbasi: "isbasig", kaza: "kazag" };

// Bu ayın misafir kayıtları (onaylı + bekleyen + reddedilen)
export async function loadGuest(fid, year, coll, month) {
  try { return (await S.listMonthDocs(fid, year, GCOLL[coll])).filter(x => +x.month === +month); } catch { return []; }
}

// Varsayılan tarih: bugün (ay içindeyse), değilse ayın son günü
export function defDate(year, month) {
  const t = new Date(), last = new Date(+year, +month, 0), ms = `${year}-${pad(month)}-01`, me = iso(last), td = iso(t);
  return { d: td >= ms && td <= me ? td : me, min: ms, max: td < me ? (td < ms ? ms : td) : me };
}

// Kayıt ekleme penceresi. fields: [{ k, label, ph, ok(s), err }] → { d, ...değerler } | null
export function addDialog({ title, sub, fields, year, month }) {
  return new Promise(res => {
    const R = defDate(year, month); let d = R.d;
    const m = document.createElement("div"); m.className = "mod";
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:14px"><h2>${esc(title)}</h2>${sub ? `<div class="muted" style="font-size:13.5px;line-height:1.5">${esc(sub)}</div>` : ""}
      <div class="col1" style="gap:6px"><span class="hd">TARİH</span><button type="button" class="inp fld" id="kD"><span id="kDt">${fmtTarih(d)}</span>${ic('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>', 18)}</button></div>
      ${fields.map(f => `<div class="col1" style="gap:6px"><span class="hd">${esc(f.label)}</span>${f.type === "select" ? `<select class="inp" data-f="${f.k}">${f.options.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("")}</select>`
        : f.type === "text" ? `<textarea class="inp" data-f="${f.k}" rows="4" maxlength="1000" placeholder="${esc(f.ph || "")}" style="height:auto;resize:vertical"></textarea>`
        : `<input class="inp" data-f="${f.k}" inputmode="decimal" placeholder="${esc(f.ph || "")}" autocomplete="off">`}</div>`).join("")}
      <div class="err" id="kE"></div>
      <div class="row" style="justify-content:flex-end;gap:8px"><button class="sec" data-x>Vazgeç</button><button data-s>Ekle</button></div></div>`;
    document.body.appendChild(m);
    const done = v => { m.remove(); res(v); };
    m.querySelector("[data-x]").onclick = () => done(null);
    m.addEventListener("mousedown", e => { if (e.target === m) done(null); });
    m.querySelector("#kD").onclick = async () => { const r = await pickDate({ title: "Tarih", min: R.min, max: R.max, a: d, view: `${year}-${pad(month)}-01` }); if (r?.a) { d = r.a; m.querySelector("#kDt").textContent = fmtTarih(d); } };
    m.querySelector("[data-f]").focus();
    m.querySelector("[data-s]").onclick = () => {
      const out = { d };
      for (const f of fields) { const v = m.querySelector(`[data-f="${f.k}"]`).value.trim(); if (!f.ok(v)) { m.querySelector("#kE").textContent = f.err; return; } out[f.k] = v; }
      done(out);
    };
  });
}

// Reddederken isteğe bağlı not penceresi → metin ("" olabilir) | null (vazgeçildi)
export function noteDialog() {
  return new Promise(res => {
    const m = document.createElement("div"); m.className = "mod";
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:14px"><h2>Kayıt reddedilsin mi?</h2>
      <div class="muted" style="font-size:13.5px;line-height:1.5">Misafir bu notu kaydının altında görür. Not yazmak isteğe bağlıdır.</div>
      <textarea class="inp" id="kN" rows="4" maxlength="300" placeholder="Örn. Eğitim evrakı gelmedi; imzalı listeyi gönderin." style="height:auto;resize:vertical"></textarea>
      <div class="row" style="justify-content:flex-end;gap:8px"><button class="sec" data-x>Vazgeç</button><button data-s style="background:#B3261E;border-color:#B3261E">Reddet</button></div></div>`;
    document.body.appendChild(m);
    const done = v => { m.remove(); res(v); };
    m.querySelector("[data-x]").onclick = () => done(null);
    m.addEventListener("mousedown", e => { if (e.target === m) done(null); });
    m.querySelector("[data-s]").onclick = () => done(m.querySelector("#kN").value.trim());
    m.querySelector("#kN").focus();
  });
}

// Açılır "Bu Ayın Kayıtları" kartı (varsayılan kapalı). items: { key, dept, text, d, who, st: own|approved|pending|rejected, del, appr, edit, edited, tip }
export function listCard(items, open, owner) {
  const pend = items.filter(x => x.st === "pending").length;
  const ord = { pending: 0, own: 1, approved: 1, rejected: 2 };
  const rows = items.slice().sort((a, b) => ord[a.st] - ord[b.st] || String(b.d).localeCompare(String(a.d))).map(x => {
    const tag = x.st === "pending" ? '<span class="tag" style="background:#FBE9C6;color:#6B3F00">Onay bekliyor</span>' : x.st === "rejected" ? '<span class="tag" style="background:#FADAD7;color:#8E1B16">Reddedildi</span>' : "";
    const btn = (a, t, cl = "") => `<button class="sm sec" data-ka="${a}" data-kk="${x.key}" style="${cl}">${t}</button>`;
    return `<div class="it" style="gap:10px;flex-wrap:wrap"><div class="grow"><b>${esc(x.dept)}</b> ${tag}<div class="muted" style="font-size:12.5px">${esc(x.text)}${x.d ? " · " + fmtTarih(x.d) : ""} · ${esc(x.who)}${x.edited ? " · Düzeltildi " + fmtTarih(x.edited) : ""}</div>${x.tip ? `<div style="margin-top:4px;font:italic 600 12.5px Manrope,system-ui,sans-serif;color:#B26A00;line-height:1.45">${esc(x.tip)}</div>` : ""}${x.note ? `<div style="font-size:12.5px;margin-top:4px;color:#8E1B16;font-weight:600">Yetkili notu: ${esc(x.note)}</div>` : ""}</div>
      ${x.conf && x.appr ? `<div style="flex:1 1 100%;background:#FBE9C6;color:#5B3A00;border-radius:10px;padding:9px 12px;font-size:12.5px;line-height:1.5;font-weight:600">⚠ Çakışma · ${esc(x.conf)}</div>` : ""}
      <div class="row" style="gap:6px;flex-wrap:wrap">${x.appr && x.conf && !x.info ? btn("use", "Misafirinkini kullan", "background:#0B6E4F;color:#fff;border-color:#0B6E4F") + btn("ok", x.addLbl || "Toplama ekle") + btn("no", "Reddet", "color:#B3261E;border-color:#B3261E") : x.appr ? btn("ok", "Onayla", "background:#0B6E4F;color:#fff;border-color:#0B6E4F") + btn("no", "Reddet", "color:#B3261E;border-color:#B3261E") : ""}${x.edit ? btn("edit", "Düzenle") : ""}${x.del ? btn("del", "Sil", "color:#B3261E;border-color:#B3261E") : ""}</div></div>`;
  }).join("") || '<span class="muted">Bu ay henüz kayıt yok.</span>';
  return `<div class="cd" style="gap:12px"><button type="button" id="kTg" aria-expanded="${open}" style="display:flex;align-items:center;gap:12px;width:100%;min-height:40px;height:auto;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer"><span style="flex:1;min-width:0"><h2 style="margin:0">Bu Ayın Kayıtları</h2>
    <span class="muted" style="font-size:13px;display:block;margin-top:4px;font-weight:600">${items.length} kayıt${pend && owner ? ' · <i style="color:#B26A00">' + pend + " onay bekliyor</i>" : ""}</span></span>
    <span style="flex:0 0 40px;width:40px;height:40px;border-radius:12px;border:1.5px solid var(--gd);color:var(--gd);box-sizing:border-box;display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${open ? 180 : 0}deg)"><path d="M6 9l6 6 6-6"/></svg></span></button>
    ${open ? `<div class="col1" style="gap:8px">${rows}</div>` : ""}</div>`;
}
export { confirmBox, GUEST, toast };
