// Bölüm katsayısı F = 1 + (çalışan katsayısı − 0,05) + (risk katsayısı − 0,05)
export const RISK = { "0-3": .05, "4-6": .10, "8-12": .15, "15-16": .20, "20-25": .25 };
export const TOL = { Düşük: 0, Orta: .05, Yüksek: .10 };
export function empCoef(n) {
  n = Number(n) || 0;
  return n >= 26 ? .30 : n >= 21 ? .25 : n >= 16 ? .20 : n >= 11 ? .15 : n >= 6 ? .10 : .05;
}
export const katsayi = d => +(1 + (empCoef(d.emp) - .05) + ((RISK[d.risk] ?? .05) - .05)).toFixed(2);
// Ramp toleranslı ZTF (0-1)
export const ztfRamp = d => Math.min(1, (Number(d.ztf) || 0) / 100 + (TOL[d.tol] ?? 0));
