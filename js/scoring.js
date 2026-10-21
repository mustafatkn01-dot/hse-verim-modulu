// Bölüm katsayısı F = 1 + (çalışan katsayısı − 0,05) + (risk katsayısı − 0,05)
export const num = s => { const v = parseFloat(String(s).replace(",", ".")); return isNaN(v) ? 0 : v; };
export const c2 = x => x.toFixed(2).replace(".", ",");
export const RISK = { "0-3": .05, "4-6": .10, "8-12": .15, "15-16": .20, "20-25": .25 };
export function empCoef(n) {
  const v = parseInt(n, 10) || 0;
  return v >= 26 ? .30 : v >= 21 ? .25 : v >= 16 ? .20 : v >= 11 ? .15 : v >= 6 ? .10 : .05;
}
// Çalışan sayısı aylıktır: r.n tabandır (yıl başından), r.nm = { "11": "24" } o aydan itibaren geçerli yeni sayıdır
// Süreç başlangıç ayı (Kurulum › Eğitim): Eğitim Konuşması ay kapanışı ve İşbaşı tarih bazlı ZTF bu aydan itibaren geçerlidir. Varsayılan Ekim 2026.
let SUREC = [2026, 10];
export const setSurec = s => { const m = /^(\d{4})-(\d{1,2})$/.exec(String(s ?? "").trim()); SUREC = m && +m[2] >= 1 && +m[2] <= 12 ? [+m[1], +m[2]] : [2026, 10]; };
export const surecVar = (year, month) => +year * 12 + +month >= SUREC[0] * 12 + SUREC[1];
// Eğitim konuşması: süreç başladıktan sonra ay kapandığında (ayın son gününden sonra) kaydı olmayan ama hedefi olan bölüm 0 sayılır
export function konusmaKapali(year, month) {
  const y = +year, m = +month; if (!y || !(m >= 1 && m <= 12)) return false;
  if (!surecVar(y, m)) return false;
  return Date.now() >= new Date(y, m, 1).getTime();
}
export const konusmaSifir = (x, year, month) => !!x && (x.pct === null || x.pct === undefined) && +x.goal > 0 && konusmaKapali(year, month);
export const konusmaPct = (x, year, month) => !x ? null : (x.pct !== null && x.pct !== undefined ? x.pct : konusmaSifir(x, year, month) ? 0 : null);
export const nAt = (r, m) => { const nm = r.nm || {}; let b = 0; Object.keys(nm).forEach(k => { if (+k <= +m && +k > b) b = +k; }); return b && m ? nm[b] : r.n; };
export const katsayi = (r, m) => 1 + (empCoef(nAt(r, m)) - .05) + ((RISK[r.risk] ?? .05) - .05);
export const rampTol = (r, p) => num({ Düşük: p.ramp.dusuk, Orta: p.ramp.orta, Yüksek: p.ramp.yuksek }[r.ramp] ?? 0);
export const ztfRamp = (r, p) => Math.min(1, num(r.ztf) + num({ Düşük: p.ramp.dusuk, Orta: p.ramp.orta, Yüksek: p.ramp.yuksek }[r.ramp] ?? 0));

// ---------- İşbaşı eğitim: tarih bazlı ZTF ----------
// Hedef süre 5 gün (cezasız); değerlendirme penceresi 10 gün (faktör 0'a düşer). Kişi, işe başlama + 10 gün hangi aya düşüyorsa o ayda değerlendirilir.
const pad2 = n => String(n).padStart(2, "0");
export const isoOk = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
const dms = s => { const [y, m, d] = String(s).split("-").map(Number); return Date.UTC(y, m - 1, d); };
export const gunFark = (a, b) => Math.round((dms(b) - dms(a)) / 864e5);
export const addGun = (s, n) => { const t = new Date(dms(s) + n * 864e5); return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`; };
export const ztfGun = n => (n <= 5 ? 1 : n >= 10 ? 0 : [0.8, 0.6, 0.4, 0.2][n - 6]);
export const ayOf = s => String(s).slice(0, 7);
// Değerlendirme ayı "YYYY-AA" (yıl sınırı aşılmaz: Aralık girişleri Aralık'ta değerlendirilir)
export const degerAy = hd => { const a = ayOf(addGun(hd, 10)); return a.slice(0, 4) > hd.slice(0, 4) ? hd.slice(0, 4) + "-12" : a; };
// Kaydın saklanacağı ay (1-12) ve bu ayın değerlendirmesine girip girmediği
export const kayitAyi = (hd, d) => { const a = isoOk(hd) ? degerAy(hd) : ayOf(d), b = ayOf(d); return +(a > b ? a : b).slice(5, 7); };
export const isbasiSayilir = (x, year, month) => !surecVar(year, month) || !isoOk(x.hd) || degerAy(x.hd) === `${year}-${pad2(month)}`;
const isI = s => /^[0-9]+$/.test(String(s ?? "").trim());
// Bölümün ay ZTF'si: eğitilen kişilerin faktörlerinin ortalaması (tarihi olmayan kayıtlar Kurulum ZTF'si ile). lines: sayılan kayıtlar
export function isbasiZtf(lines, r, p, year, month) {
  const fb = ztfRamp(r, p); if (!surecVar(year, month)) return fb;
  const tol = rampTol(r, p); let w = 0, sum = 0;
  lines.forEach(x => { const e = isI(x.e) ? +x.e : 0; if (!e) return; const f = isoOk(x.hd) && isoOk(x.d) ? Math.min(1, ztfGun(gunFark(x.hd, x.d)) + tol) : fb; w += e; sum += e * f; });
  return w ? sum / w : fb;
}

export const DEFAULT_PARAMS = {
  w: { kaza: "40", konusma: "15", isbasi: "15", isg: "30" },
  esik: { m: "90", i: "75", o: "50", h: "90" },
  egitim: { hedef: "10", kztf: "1", ktc: "1", basla: "2026-10" },
  ramp: { dusuk: "0", orta: "0,05", yuksek: "0,10" },
  isg: { azami: "3", r1: "5", r2: "10", r3: "15" }
};
export const rid = () => "d" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const newRow = (i = 1) => ({ id: rid(), name: `Bölüm ${i}`, n: "10", risk: "0-3", mak: "4", tc: "1,0", ramp: "Düşük", ztf: "1,0" });

// ---------- İSG Denetim hesabı ----------
export const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const mf = n => (n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : 3); // denetim sayısı → sıklık
export const bandOf = (sc, p) => {
  const m = num(p.esik.m), i = num(p.esik.i), o = num(p.esik.o);
  return sc >= m ? "Mükemmel" : sc >= i ? "İyi" : sc >= o ? "Orta" : "Kritik";
};

/**
 * Sıklık: bir kategoride uygunsuzluk bulunan FARKLI GÜN sayısı (aynı gün birden çok denetim = 1)
 * cats: [{w, items:[...]}]   sessions: [{fails:{id:[]}, app:{ci:bool}}]
 * draft: {marks, notes}      freqOv: {ci: 0-3}      bonusIdx: 0-3     F: bölüm katsayısı   p: parametreler
 * Ceza = 100 × Σ(sıklık·ağırlık) / (azami × toplam ağırlık) × F   (Y.D. kategori: ceza 0, payda sabit)
 * Skor = min(100, max(0, 100 − ceza) + bonus)
 */
// Aksiyon alındı: onaylı aksiyonu olan açıklama cezadan düşer; sıklık ve yoğunluk geçmişi korunur.
// s.fixed["madde|sıra"] = {t: bulgu metni, tx: aksiyon açıklaması, ph: fotoğraflar, st: "ok" | "rej", rat: istek zamanı, rej: ret gerekçesi}
export const fxOk = (fx, id, j, t) => { const f = fx?.[id + "|" + j]; return !!f && f.st === "ok" && f.t === String(t || "").trim(); };
export const openIn = (s, id) => { const a = s.fails?.[id]; if (!a) return 0; if (!a.length) return 1; return a.filter((t, j) => !fxOk(s.fixed, id, j, t)).length; };

export function calcIsg({ cats, sessions, draft, freqOv, bonusIdx, F, p, yog = false, mak = "4", perAudit = false, only = null }) {
  const azami = Math.max(1, num(p.isg.azami) || 3);
  const bonusVals = [0, num(p.isg.r1), num(p.isg.r2), num(p.isg.r3)];
  const thrM = { "1": 1, "23": 2 }[mak] ?? 3, MACH = [0, 1, 4]; // makine maddeleri (kategori 2: 1, 2, 5)
  let numer = 0, den = 0, total = 0, nCount = 0, totalItems = 0, unmarked = 0, missing = 0, ydMissing = 0, curFails = 0, curMarked = false;
  const catInfo = cats.map((c, ci) => {
    total += c.w; totalItems += c.items.length;
    const dayOf = (x, i) => x.date || "#" + i, curDay = draft.date || "#cur";
    const catDays = new Set(sessions.map((x, i) => [x, i]).filter(([x]) => Object.keys(x.fails).some(k => k.startsWith(`c${ci}i`))).map(([x, i]) => dayOf(x, i)));
    let curFailed = 0, curOpen = 0, anyApplicable = false, allYD = c.items.length > 0;
    const items = c.items.map((_, ii) => {
      const id = `c${ci}i${ii}`, mk = draft.marks[id];
      if (!mk) unmarked++; else curMarked = true;
      if (mk === "n") nCount++; else allYD = false;
      if (mk === "u" || mk === "x") anyApplicable = true;
      const prev = sessions.filter(s => s.fails[id] !== undefined);
      const isX = mk === "x";
      if (isX) {
        curFails++; curFailed++; if (!(draft.notes[id] || []).some(t => t.trim())) missing++;
        const ne = (draft.notes[id] || []).map(t => String(t).trim()).filter(Boolean);
        if (!draft.fixed || !ne.length || ne.some((t, j) => !fxOk(draft.fixed, id, j, t))) curOpen++;
      }
      const pd = new Set(sessions.map((x, i) => [x, i]).filter(([x]) => x.fails[id] !== undefined).map(([x, i]) => dayOf(x, i)));
      return { id, mk, prev, isX, cnt: pd.size + (isX && !pd.has(curDay) ? 1 : 0) };
    });
    if (allYD && !(draft.ydNotes?.[ci] || "").trim()) ydMissing++;
    const savedApplicable = sessions.some(s => s.app[ci]);
    const hasFreq = anyApplicable || savedApplicable;
    const catCount = catDays.size + (curFailed > 0 && !catDays.has(curDay) ? 1 : 0); // aynı gün yapılan denetimler tek sayılır
    let auto = Math.min(azami, mf(catCount));
    if (c.w === 3 && catCount > 0) auto = Math.min(azami, Math.max(2, auto));
    // Yoğunluk (yog: süreç başlangıç ayından itibaren): bir denetim gününde bu kategoride 3 veya daha fazla bulgu varsa sıklık 1 basamak artar (en fazla azami)
    const byDay = {}; sessions.forEach((x, i) => Object.keys(x.fails).forEach(k => { if (k.startsWith(`c${ci}i`)) { const d = dayOf(x, i); byDay[d] = (byDay[d] || 0) + Math.max(1, (x.fails[k] || []).length); } }));
    items.forEach(it => { if (it.isX) byDay[curDay] = (byDay[curDay] || 0) + Math.max(1, (draft.notes[it.id] || []).filter(t => String(t).trim()).length); });
    const maxDay = Math.max(0, ...Object.values(byDay));
    // Makine kademesi (Kurulum): 1 makinede makine maddesinden (1, 2, 5) tek bulgu, 2-3 makinede aynı günde 2 bulgu "yoğun" sayılır
    let maxM = 0;
    if (ci === 1 && thrM < 3) { const bm = {}; sessions.forEach((x, i) => MACH.forEach(ii => { const k = `c1i${ii}`; if (x.fails[k]) { const d = dayOf(x, i); bm[d] = (bm[d] || 0) + Math.max(1, (x.fails[k] || []).length); } })); MACH.forEach(ii => { const it = items[ii]; if (it?.isX) bm[curDay] = (bm[curDay] || 0) + Math.max(1, (draft.notes[it.id] || []).filter(t => String(t).trim()).length); }); maxM = Math.max(0, ...Object.values(bm)); }
    const heavy = !!yog && catCount > 0 && (maxDay >= 3 || (thrM < 3 && maxM >= thrM));
    if (heavy) auto = Math.min(azami, auto + 1);
    const ov = freqOv[ci];
    const freq = !hasFreq ? null : (ov !== undefined ? ov : auto);
    if (hasFreq) { if (!perAudit || curOpen > 0 || (only && only.has(ci))) numer += freq * c.w; den += c.w; }
    return { items, hasFreq, catCount, auto, freq, heavy, maxDay, allYD, hasOverride: ov !== undefined, marked: items.filter(x => x.mk).length, nItems: items.length };
  });
  const penalty = total > 0 ? (100 * numer / (azami * total)) * F : 0; // Y.D. kategori: ceza 0, payda sabit (tüm bölümlerde aynı ölçek)
  const bonus = bonusVals[bonusIdx] || 0;
  const score = Math.min(100, Math.max(0, 100 - penalty) + bonus);
  return { catInfo, penalty, bonus, bonusVals, score, den, total, nCount, totalItems, ydPct: totalItems ? Math.round(100 * nCount / totalItems) : 0,
    unmarked, missing, ydMissing, curFails, curMarked, azami, canSave: unmarked === 0 && missing === 0 && ydMissing === 0 };
}

// Makine kademesi (Kurulum › bölüm): "4" = 4+ makine (varsayılan), "23" = 2-3, "1" = 1 makine, "0" = yok
export const makTier = r => r?.mak || "4";
const EMPTY = () => ({ marks: {}, notes: {}, ydNotes: {} });
// Denetim bazlı skorlar (süreç başlangıcından sonra): her denetim 100'den başlar, yalnız O denetimde bulgu çıkan kategoriler ceza alır;
// sıklık, aydaki önceki denetimlerden devam eder (ceza puanı taşınmaz). Ramak kala bonusu ay skoruna eklenir.
export function isgAudits({ cats, sessions, freqOv, F, p, yog, mak }) {
  const dates = [...new Set(sessions.map(s => s.date || ""))].sort(), out = [];
  dates.forEach(d => {
    const ss = sessions.filter(s => !s.date || s.date <= d), only = new Set();
    sessions.filter(s => (s.date || "") === d).forEach(s => cats.forEach((_, ci) => { if (Object.keys(s.fails || {}).some(k => k.startsWith(`c${ci}i`) && openIn(s, k) > 0)) only.add(ci); }));
    const c = calcIsg({ cats, sessions: ss, draft: EMPTY(), freqOv: freqOv || {}, bonusIdx: 0, F, p, yog, mak, perAudit: true, only });
    out.push({ date: d, score: c.score, penalty: c.penalty });
  });
  return out;
}
// Aylık İSG skoru: süreç başlangıcından sonra denetim skorlarının ortalaması (+ ramak kala bonusu), öncesinde eski hesap
export function isgMonth({ cats, sessions, freqOv, bonusIdx, F, p, yog, mak }) {
  const c = calcIsg({ cats, sessions, draft: EMPTY(), freqOv: freqOv || {}, bonusIdx: bonusIdx || 0, F, p, yog, mak });
  if (!yog || !sessions.length) return { score: c.score, penalty: c.penalty, bonus: c.bonus, audits: null, c };
  const audits = isgAudits({ cats, sessions, freqOv, F, p, yog, mak }), avg = audits.reduce((a, x) => a + x.score, 0) / audits.length;
  return { score: Math.min(100, Math.max(0, avg) + c.bonus), penalty: 100 - avg, bonus: c.bonus, avg, audits, c };
}
