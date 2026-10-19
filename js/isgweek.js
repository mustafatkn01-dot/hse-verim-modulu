// İSG Denetim · hafta bazlı görünüm (ay içinde "o haftanın sonuna kadar" birikimli skor)
import { calcIsg, katsayi, surecVar, DEFAULT_PARAMS } from "./scoring.js?v=20261019h";
import { CATS } from "./isgcats.js?v=20261019h";

const pad = n => String(n).padStart(2, "0");
const dt = t => new Date(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10));
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addD = (t, n) => { const d = dt(t); d.setDate(d.getDate() + n); return iso(d); };
export const monOf = t => { const g = dt(t).getDay(); return addD(t, g === 0 ? -6 : 1 - g); };
export const wkNo = t => { const m = monOf(t), d = dt(m); d.setDate(d.getDate() + 3); const j4 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - j4) / 864e5 - 3 + ((j4.getDay() + 6) % 7)) / 7); };
const dm = d => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const MF = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

// docs: [{ m: 1-12, id: bölümId, sessions, freq, bonus }]; months: 1-12 listesi (seçili dönem)
export function lastWeekKey(docs, months) {
  let k = null;
  docs.forEach(d => { if (!months.includes(d.m)) return; (d.sessions || []).forEach(s => { if (s?.date) { const w = monOf(s.date); if (k === null || w > k) k = w; } }); });
  return k;
}
// Hafta başlığı: "Ekim 2026 · 43. hafta · 19.10" (tek gün) veya "… · 19.10–21.10"
export function weekLabel(docs, key, year) {
  const ds = []; docs.forEach(d => (d.sessions || []).forEach(s => { if (s?.date && monOf(s.date) === key) ds.push(s.date); })); ds.sort();
  if (!ds.length) return "";
  return `${MF[+ds[ds.length - 1].slice(5, 7) - 1]} ${year} · ${wkNo(ds[0])}. hafta · ${ds[0] === ds[ds.length - 1] ? dm(ds[0]) : dm(ds[0]) + "–" + dm(ds[ds.length - 1])}`;
}
// O hafta denetlenen bölümlerin skoru: ay başından haftanın sonuna (pazar) kadar yapılan tüm denetimlerle
export function weekScores(docs, rows, params, year, key) {
  const out = {}, end = addD(key, 6), p = params || DEFAULT_PARAMS;
  rows.forEach(r => {
    const mine = docs.filter(d => d.id === r.id && (d.sessions || []).some(s => s?.date && monOf(s.date) === key));
    if (!mine.length) return;
    mine.sort((a, b) => b.m - a.m); const d = mine[0];
    const ss = (d.sessions || []).filter(s => !s?.date || s.date <= end);
    try { out[r.id] = +calcIsg({ cats: CATS, sessions: ss, draft: { marks: {}, notes: {}, ydNotes: {} }, freqOv: d.freq || {}, bonusIdx: d.bonus || 0, F: katsayi(r, d.m), p, yog: surecVar(year, d.m) }).score.toFixed(2); } catch { }
  });
  return out;
}

// Dönem görünümü: her bölümün seçili aylardaki TÜM denetimlerinin puan ortalaması.
// Bir denetimin puanı = o denetim gününe kadar (ay başından) birikimli skor (denetim ekranındaki "Anlık İSG skoru"). Son denetim = resmi ay skoru.
export function auditAvg(docs, rows, params, year, months) {
  const out = {}, p = params || DEFAULT_PARAMS;
  rows.forEach(r => {
    const sc = [];
    docs.filter(d => d.id === r.id && months.includes(d.m)).forEach(d => {
      const all = d.sessions || []; if (!all.length) return;
      const F = katsayi(r, d.m), yog = surecVar(year, d.m), dates = [...new Set(all.map(s => s?.date).filter(Boolean))].sort();
      const run = (ss, last) => { try { return +calcIsg({ cats: CATS, sessions: ss, draft: { marks: {}, notes: {}, ydNotes: {} }, freqOv: last ? (d.freq || {}) : {}, bonusIdx: last ? (d.bonus || 0) : 0, F, p, yog }).score.toFixed(2); } catch { return null; } };
      if (!dates.length) { const x = run(all, true); if (x !== null) sc.push(x); return; }
      dates.forEach((dd, i) => { const x = run(all.filter(s => !s?.date || s.date <= dd), i === dates.length - 1); if (x !== null) sc.push(x); });
    });
    if (sc.length) out[r.id] = { avg: sc.reduce((a, c) => a + c, 0) / sc.length, n: sc.length };
  });
  return out;
}
