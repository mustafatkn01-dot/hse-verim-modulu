// Tatil takvimi ve haftalık denetim planı (yalnızca gösterim; puanı etkilemez)
import * as S from "./store.js?v=20261012k";
import { esc } from "./ui.js?v=20261012k";

const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at0 = s => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const addD = (s, n) => { const d = at0(s); d.setDate(d.getDate() + n); return iso(d); };
export const GUN = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
export const AY = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const AYU = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const fmt = s => `${+s.slice(8)} ${AY[+s.slice(5, 7) - 1]}`;
export const fmtU = s => `${+s.slice(8)} ${AYU[+s.slice(5, 7) - 1]}`;
export const range = (a, z) => (a.slice(0, 7) === z.slice(0, 7) ? `${+a.slice(8)}–${fmtU(z)}` : `${fmtU(a)} – ${fmtU(z)}`);

// Resmi tatiller (sabit tarihli)
const FIX = { "01-01": "Yılbaşı", "04-23": "Ulusal Egemenlik ve Çocuk Bayramı", "05-01": "Emek ve Dayanışma Günü", "05-19": "Atatürk'ü Anma, Gençlik ve Spor Bayramı", "07-15": "Demokrasi ve Millî Birlik Günü", "08-30": "Zafer Bayramı", "10-29": "Cumhuriyet Bayramı" };
// Dini bayramlar: [1. gün, gün sayısı, ad]; arife (yarım gün) bir gün öncesidir. Yeni yıl için Diyanet takvimine göre eklenir.
const DINI = [["2025-03-30", 3, "Ramazan Bayramı"], ["2025-06-06", 4, "Kurban Bayramı"], ["2026-03-20", 3, "Ramazan Bayramı"], ["2026-05-27", 4, "Kurban Bayramı"], ["2027-03-09", 3, "Ramazan Bayramı"], ["2027-05-16", 4, "Kurban Bayramı"]];
export const diniVar = y => DINI.some(x => x[0].startsWith(String(y)));

// Ana takvim: tarih → { ad, yarim, tur }
export function takvim(doc, years) {
  const m = new Map();
  (years || Array.from({ length: 21 }, (_, i) => 2025 + i)).forEach(y => {
    Object.entries(FIX).forEach(([k, ad]) => m.set(`${y}-${k}`, { ad, tur: "Resmi" }));
    m.set(`${y}-10-28`, { ad: "Cumhuriyet Bayramı arifesi", yarim: true, tur: "Resmi" });
  });
  DINI.forEach(([a, n, ad]) => { m.set(addD(a, -1), { ad: ad + " arifesi", yarim: true, tur: "Dini" }); for (let i = 0; i < n; i++) m.set(addD(a, i), { ad: `${ad} (${i + 1}. gün)`, tur: "Dini" }); });
  (doc?.kaldir || []).forEach(d => m.delete(d));
  (doc?.ozel || []).forEach(o => { if (o?.d) m.set(o.d, { ad: o.ad || "Özel gün", yarim: !!o.yarim, tur: "Özel" }); });
  return m;
}

// Bir haftanın (pazartesi başlangıçlı) tatilden etkilenip etkilenmediği: Pzt–Çar'da hiç iş günü yoksa etkilenir
export function haftaBilgi(mon, map) {
  const g = Array.from({ length: 7 }, (_, i) => addD(mon, i)), tam = d => { const h = map.get(d); return h && !h.yarim; };
  const work = g.slice(0, 5).map(d => !tam(d));
  const ad = [...new Set(g.slice(0, 5).filter(tam).map(d => map.get(d).ad.replace(/ \(\d\. gün\)$/, "")))].join(", ");
  return { etkili: !work[0] && !work[1] && !work[2], ad, gun: g.slice(0, 5).filter(tam).length };
}

// Haftalık denetim planı. Pzt–Çar zamanında, Per–Paz geç; "tatil, plan dışı" kararlı ve denetimsiz hafta gri
export function planUyum(dates, year, o = {}, today = new Date()) {
  const map = o.map || takvim(null), karar = o.karar || {}, tdy = iso(today), ahead = addD(tdy, 21), weeks = [];
  let m = `${year}-01-01`; while (at0(m).getDay() !== 1) m = addD(m, 1);
  for (; m.slice(0, 4) === String(year); m = addD(m, 7)) {
    const z = addD(m, 6), hit = (dates || []).filter(x => x >= m && x <= z), cur = tdy >= m && tdy <= z, fut = m > tdy, hb = haftaBilgi(m, map), k = karar[m]?.k;
    const on = hit.some(x => { const g = at0(x).getDay(); return g >= 1 && g <= 3; });
    let st;
    if (hit.length) st = on ? "ok" : "late";
    else if (k === "tatil") st = "off";
    else if (hb.etkili && !k) st = "ask";
    else st = fut ? "future" : cur ? "wait" : "miss";
    weeks.push({ a: m, z, st, cur, ad: hb.ad, soru: st === "ask" && m <= ahead });
  }
  const c = s => weeks.filter(w => w.st === s).length, done = c("ok") + c("late"), plan = done + c("miss");
  return { weeks, total: weeks.length, done, plan, late: c("late"), miss: c("miss"), off: c("off"), ask: weeks.filter(w => w.soru), pct: plan ? done / plan * 100 : null };
}

// Depolama: setup/tatil (özel günler, kaldırılan günler, hafta kararları)
const C = {};
export async function yukle(fid, y, zorla) { const k = fid + "/" + y; if (!C[k] || zorla) C[k] = await S.getTatil(fid, y).catch(() => ({})); return C[k] || {}; }
async function yaz(fid, y, d) { const k = fid + "/" + y; await S.saveTatil(fid, y, d); C[k] = d; return d; }
export async function karar(fid, y, mon, k, not) {
  const d = JSON.parse(JSON.stringify(await yukle(fid, y))); d.karar = d.karar || {};
  if (k) d.karar[mon] = { k, at: Date.now(), ...(not ? { not } : {}) }; else delete d.karar[mon];
  return yaz(fid, y, d);
}

// Kurulum sayfası kartı
export async function mount(el, st, ro) {
  const draw = async () => {
    const d = await yukle(st.fid, st.year), map = takvim(d), y = String(st.year);
    const list = [...map.entries()].filter(([k]) => k.startsWith(y)).sort((a, b) => a[0].localeCompare(b[0]));
    const kr = Object.entries(d.karar || {}).filter(([k]) => k.startsWith(y)).sort((a, b) => a[0].localeCompare(b[0]));
    const kal = (d.kaldir || []).filter(x => x.startsWith(y));
    const tc = { Resmi: ["#DCEAF7", "#145F96"], Dini: ["#D9F1E6", "#0B6E4F"], Özel: ["#FBE9C6", "#6B3F00"] };
    el.innerHTML = `<div class="cd" style="gap:14px"><div><h2>Tatil Takvimi · ${y}</h2>
      <div class="muted" style="font-size:13px;margin-top:4px">Haftalık denetim planında tatil haftalarını belirlemek için kullanılır. Resmi ve dini günler hazır gelir; özel gün ekleyebilir, istemediğinizi kaldırabilirsiniz. Puanı etkilemez.</div></div>
      ${diniVar(y) ? "" : `<div class="warn">${y} yılı için dini bayram günleri hazır değil. Diyanet takvimine göre aşağıdan özel gün olarak ekleyin.</div>`}
      <div class="col1" style="gap:2px;max-height:300px;overflow:auto">${list.length ? list.map(([k, h]) => `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--line)"><span style="width:84px;flex:0 0 84px;font-weight:700">${fmt(k)} <span class="muted" style="font-weight:600">${GUN[at0(k).getDay()]}</span></span><span style="flex:1;min-width:0">${esc(h.ad)}${h.yarim ? ' <span class="muted">· yarım gün</span>' : ""}</span><span class="pill" style="background:${tc[h.tur][0]};color:${tc[h.tur][1]}">${h.tur}</span><button class="xb" style="width:32px;height:32px;flex:0 0 32px;min-height:0" data-tk="rm" data-d="${k}" aria-label="Günü kaldır" ${ro ? "disabled" : ""}>×</button></div>`).join("") : `<div class="muted">Bu yıl için kayıtlı gün yok.</div>`}</div>
      <div class="row" style="gap:8px;align-items:flex-end"><div class="sf" style="flex:0 0 160px"><label class="hd" for="tkD">TARİH</label><input id="tkD" class="inp" type="date" min="${y}-01-01" max="${y}-12-31" ${ro ? "disabled" : ""}></div>
        <div class="sf" style="flex:1 1 180px"><label class="hd" for="tkA">ADI</label><input id="tkA" class="inp" placeholder="Örn. Köprü günü, idari izin" ${ro ? "disabled" : ""}></div>
        <button class="sec" data-tk="add" ${ro ? "disabled" : ""}>+ Gün ekle</button></div>
      ${kal.length ? `<div class="muted" style="font-size:12.5px">${kal.length} hazır gün kaldırılmış. <a href="#" data-tk="reset" style="color:var(--g);font-weight:700">Geri getir</a></div>` : ""}
      <div style="border-top:1px solid var(--line);padding-top:12px" class="col1"><span class="hd">HAFTA KARARLARI</span>
        ${kr.length ? kr.map(([k, x]) => `<div style="display:flex;align-items:center;gap:10px"><span style="flex:1;min-width:0"><b>${range(k, addD(k, 6))}</b> <span class="muted">· ${x.k === "tatil" ? "Tatil, plan dışı" : "Denetim yapılacak"}</span></span><button class="sec" data-tk="undo" data-d="${k}" ${ro ? "disabled" : ""}>Geri al</button></div>`).join("") : `<div class="muted" style="font-size:13px">Henüz karar yok. Tatilden etkilenen hafta olduğunda Genel Bakış'taki Denetim Planı Uyumu kartında sorulur.</div>`}</div></div>`;
    const sv = async fn => { try { await yaz(st.fid, st.year, fn(JSON.parse(JSON.stringify(d)))); } catch (e) { alert("Kaydedilemedi: " + e.message); } draw(); };
    el.querySelectorAll("[data-tk]").forEach(b => b.onclick = e => { e.preventDefault(); const k = b.dataset.tk, dd = b.dataset.d;
      if (k === "rm") sv(x => { const o = (x.ozel || []).filter(z => z.d !== dd); if (o.length !== (x.ozel || []).length) x.ozel = o; else x.kaldir = [...(x.kaldir || []), dd]; if ((x.ozel || []).length === 0) delete x.ozel; return x; });
      if (k === "reset") sv(x => { x.kaldir = (x.kaldir || []).filter(z => !z.startsWith(y)); return x; });
      if (k === "undo") sv(x => { delete x.karar[dd]; return x; });
      if (k === "add") { const dv = el.querySelector("#tkD").value, ad = el.querySelector("#tkA").value.trim(); if (!dv || !dv.startsWith(y)) return alert("Geçerli bir tarih seçin."); sv(x => { x.ozel = (x.ozel || []).filter(z => z.d !== dv).concat({ d: dv, ad: ad || "Özel gün" }); x.kaldir = (x.kaldir || []).filter(z => z !== dv); return x; }); } });
  };
  await draw();
}
