// Bölüm katsayısı F = 1 + (çalışan katsayısı − 0,05) + (risk katsayısı − 0,05)
export const num = s => { const v = parseFloat(String(s).replace(",", ".")); return isNaN(v) ? 0 : v; };
export const c2 = x => x.toFixed(2).replace(".", ",");
export const RISK = { "0-3": .05, "4-6": .10, "8-12": .15, "15-16": .20, "20-25": .25 };
export function empCoef(n) {
  const v = parseInt(n, 10) || 0;
  return v >= 26 ? .30 : v >= 21 ? .25 : v >= 16 ? .20 : v >= 11 ? .15 : v >= 6 ? .10 : .05;
}
export const katsayi = r => 1 + (empCoef(r.n) - .05) + ((RISK[r.risk] ?? .05) - .05);
export const ztfRamp = (r, p) => Math.min(1, num(r.ztf) + num({ Düşük: p.ramp.dusuk, Orta: p.ramp.orta, Yüksek: p.ramp.yuksek }[r.ramp] ?? 0));

export const DEFAULT_PARAMS = {
  w: { kaza: "40", konusma: "15", isbasi: "15", isg: "30" },
  esik: { m: "90", i: "75", o: "50" },
  egitim: { hedef: "10", kztf: "1", ktc: "1" },
  ramp: { dusuk: "0", orta: "0,05", yuksek: "0,10" },
  isg: { azami: "3", r1: "5", r2: "10", r3: "15" }
};
export const rid = () => "d" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const newRow = (i = 1) => ({ id: rid(), name: `Bölüm ${i}`, n: "10", risk: "0-3", tc: "1,0", ramp: "Düşük", ztf: "1,0" });

// ---------- İSG Denetim hesabı ----------
export const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const mf = n => (n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : 3); // denetim sayısı → sıklık
export const bandOf = (sc, p) => {
  const m = num(p.esik.m), i = num(p.esik.i), o = num(p.esik.o);
  return sc >= m ? "Mükemmel" : sc >= i ? "İyi" : sc >= o ? "Orta" : "Kritik";
};

/**
 * cats: [{w, items:[...]}]   sessions: [{fails:{id:[]}, app:{ci:bool}}]
 * draft: {marks, notes}      freqOv: {ci: 0-3}      bonusIdx: 0-3     F: bölüm katsayısı   p: parametreler
 * Ceza = 100 × Σ(sıklık·ağırlık) / (azami × toplam ağırlık) × F   (Y.D. kategori: ceza 0, payda sabit)
 * Skor = min(100, max(0, 100 − ceza) + bonus)
 */
export function calcIsg({ cats, sessions, draft, freqOv, bonusIdx, F, p }) {
  const azami = Math.max(1, num(p.isg.azami) || 3);
  const bonusVals = [0, num(p.isg.r1), num(p.isg.r2), num(p.isg.r3)];
  let numer = 0, den = 0, total = 0, nCount = 0, totalItems = 0, unmarked = 0, missing = 0, ydMissing = 0, curFails = 0, curMarked = false;
  const catInfo = cats.map((c, ci) => {
    total += c.w; totalItems += c.items.length;
    const savedCat = sessions.filter(s => Object.keys(s.fails).some(k => k.startsWith(`c${ci}i`))).length;
    let curFailed = 0, anyApplicable = false, allYD = c.items.length > 0;
    const items = c.items.map((_, ii) => {
      const id = `c${ci}i${ii}`, mk = draft.marks[id];
      if (!mk) unmarked++; else curMarked = true;
      if (mk === "n") nCount++; else allYD = false;
      if (mk === "u" || mk === "x") anyApplicable = true;
      const prev = sessions.filter(s => s.fails[id] !== undefined);
      const isX = mk === "x";
      if (isX) { curFails++; curFailed++; if (!(draft.notes[id] || []).some(t => t.trim())) missing++; }
      return { id, mk, prev, isX, cnt: prev.length + (isX ? 1 : 0) };
    });
    if (allYD && !(draft.ydNotes?.[ci] || "").trim()) ydMissing++;
    const savedApplicable = sessions.some(s => s.app[ci]);
    const hasFreq = anyApplicable || savedApplicable;
    const catCount = savedCat + (curFailed > 0 ? 1 : 0);
    let auto = Math.min(azami, mf(catCount));
    if (c.w === 3 && catCount > 0) auto = Math.min(azami, Math.max(2, auto));
    const ov = freqOv[ci];
    const freq = !hasFreq ? null : (ov !== undefined ? ov : auto);
    if (hasFreq) { numer += freq * c.w; den += c.w; }
    return { items, hasFreq, catCount, auto, freq, allYD, hasOverride: ov !== undefined };
  });
  const penalty = total > 0 ? (100 * numer / (azami * total)) * F : 0;
  const bonus = bonusVals[bonusIdx] || 0;
  const score = Math.min(100, Math.max(0, 100 - penalty) + bonus);
  return { catInfo, penalty, bonus, bonusVals, score, den, total, nCount, totalItems, ydPct: totalItems ? Math.round(100 * nCount / totalItems) : 0,
    unmarked, missing, ydMissing, curFails, curMarked, azami, canSave: unmarked === 0 && missing === 0 && ydMissing === 0 };
}
