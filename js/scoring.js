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
export const newRow = (i = 1) => ({ name: `Bölüm ${i}`, n: "10", risk: "0-3", tc: "1,0", ramp: "Düşük", ztf: "1,0" });
