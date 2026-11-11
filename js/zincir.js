// Bulgu zinciri: tekrar eden bulguların haftalar (ay ve yıl sınırı dahil) arasında gizli kimliklerle bağlanması.
// Denetim kaydında (session) iki gizli harita tutulur; ekranda ve raporda görünmez:
//   s.bk = { "madde|sıra": "b…" }  bulgu kimliği: bulgu yazılınca verilir, metin düzeltilse de değişmez
//   s.zk = { "madde|sıra": "z…" }  zincir kimliği: aynı sorunun haftalarını bağlar (yoksa bulgu kendi zinciridir)
// Benzerlik yalnızca öneri içindir; bağlantıyı kullanıcı onaylar, sonra her şey kimlik üzerinden yürür.
// Zincirle kapanan eski haftalarda s.fixed[k].via doludur; bu kapanış puanı değiştirmez (bkz. scoring.fxOk).

export const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const KEY = (id, j) => id + "|" + j;

// ---------- Kimlik atama ----------
// Yeni kaydedilen denetimin (rec) bulgularına kimlik verir. Aynı denetim düzenleniyorsa (old) mevcut kimlikler korunur:
// madde başına bulgu sayısı değişmediyse sırayla, değiştiyse birebir aynı metinle eşleşenler eski kimliğini alır.
export function assignIds(rec, old = null, syn = null) {
  const bk = {}, zk = {}, rk = {};
  for (const [id, arr0] of Object.entries(rec.fails || {})) {
    const arr = arr0 || [], prev = old?.fails?.[id] || [], used = new Set();
    arr.forEach((t, j) => {
      let k = -1;
      if (prev.length === arr.length) k = j;
      else k = prev.findIndex((p, i) => !used.has(i) && String(p).trim() === String(t).trim());
      if (k >= 0 && old?.bk?.[KEY(id, k)]) { used.add(k); bk[KEY(id, j)] = old.bk[KEY(id, k)]; if (old.zk?.[KEY(id, k)]) zk[KEY(id, j)] = old.zk[KEY(id, k)]; if (old.rk?.[KEY(id, k)]) rk[KEY(id, j)] = old.rk[KEY(id, k)]; }
      else if (k >= 0 && old && syn) bk[KEY(id, j)] = syn(KEY(id, k)); // kimliksiz eski kayıt: zincirde kullanılan geçici anahtar korunur
      else bk[KEY(id, j)] = newId("b");
    });
  }
  rec.bk = bk; rec.zk = zk; if (Object.keys(rk).length) rec.rk = rk; else delete rec.rk;
  return rec;
}
// Eski kayıtlarda kimliği olmayan bulgulara kimlik verir (kayıt değiştiyse true döner)
export function ensureIds(doc) {
  let ch = false;
  for (const s of doc?.sessions || []) for (const [id, arr] of Object.entries(s.fails || {})) (arr || []).forEach((t, j) => {
    const k = KEY(id, j); s.bk ||= {};
    if (!s.bk[k]) { s.bk[k] = newId("b"); ch = true; }
  });
  return ch;
}

// ---------- Benzerlik ----------
const TR = { ç: "c", ğ: "g", ı: "i", i̇: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
const fold = s => String(s || "").toLocaleLowerCase("tr").replace(/[çğıöşüâîû]/g, c => TR[c] || c);
// Dolgu sözcükleri (kök hâlinde): bulgunun yerini/ekipmanını anlatmayan sözcükler
const STOP = new Set(["ve", "ile", "bir", "bu", "su", "o", "da", "de", "ki", "icin", "gibi", "olara", "nolu", "no", "numa", "adet", "olan", "olmu", "var", "vardi", "mevcu", "bulun", "durum", "yapil", "edil", "edilm", "konul", "konmu", "birak", "tespi", "gorul", "gozle", "olmad", "degil", "yok", "cok", "fazla", "daha", "hala", "yine", "tekra", "uzeri", "icind", "icer", "taraf", "kisim", "alani", "bolum", "bolge", "ilgil", "sekil", "neden", "olmas", "olmak", "etmek", "edilme", "olup", "ise", "en", "her", "tum", "ayni", "onu", "onune", "onund", "onun"]);
const stem = w => w.slice(0, 5);
const nums = s => [...new Set((fold(s).match(/\d+/g) || []).map(n => String(+n)))];
function words(s) {
  const raw = fold(s).replace(/\d+/g, " ").split(/[^a-z0-9]+/).filter(w => w.length >= 2);
  const out = [], seen = new Set();
  for (const w of raw) { const st = stem(w); if (STOP.has(st) || STOP.has(w) || seen.has(st)) continue; seen.add(st); out.push({ w, st }); }
  return out;
}
const same = (a, b) => a.st === b.st || (Math.min(a.w.length, b.w.length) >= 3 && (a.w.startsWith(b.w) || b.w.startsWith(a.w)));
// Seviye: "guclu" (numara ortak + metin benzer) · "orta" · "zayif" · "farkli" (numaralar çelişiyor: önerilmez)
export function similarity(a, b) {
  const na = nums(a), nb = nums(b), wa = words(a), wb = words(b);
  const common = wa.filter(x => wb.some(y => same(x, y)));
  const ov = Math.min(wa.length, wb.length) ? common.length / Math.min(wa.length, wb.length) : 0;
  const cn = na.filter(n => nb.includes(n));
  let level;
  if (na.length && nb.length && !cn.length) level = "farkli";
  else if (cn.length) level = ov >= 0.34 ? "guclu" : "orta";
  else level = ov >= 0.6 ? "orta" : "zayif";
  const score = level === "farkli" ? 0 : Math.min(1, ov * 0.7 + (cn.length ? 0.3 : 0));
  return { level, score: Math.round(score * 100) / 100, nums: cn, common: common.map(x => x.w) };
}

// ---------- Zincirler ----------
// docs: [{ year, month, doc }] — bir bölümün aylık denetim kayıtları (yıl sınırı geçilebilir)
// Her bulgu bir halka: { y, m, no, date, id, j, t, bk, zk, f (fixed), ok }
export function linksOf(docs) {
  const out = [];
  for (const { year, month, doc } of docs || []) for (const s of doc?.sessions || []) for (const [id, arr] of Object.entries(s.fails || {})) (arr || []).forEach((t, j) => {
    if (!String(t || "").trim()) return;
    const k = KEY(id, j), f = s.fixed?.[k], bk = s.bk?.[k] || `${year}_${month}_${s.no}_${k}`;
    out.push({ y: +year, m: +month, no: s.no, date: s.date || "", id, j, t, bk, zk: s.zk?.[k] || bk, f: f || null, ok: !!(f && f.st === "ok" && (f.via || f.t === t)) });
  });
  return out.sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.no - b.no);
}
// Kapanış anı: aksiyon kabulü (ap), istek zamanı (rat) veya kayıt zamanı (at)
const closedAt = f => f ? (f.ap || f.rat || f.at || 0) : 0;
export function chainsOf(links) {
  const map = new Map();
  for (const l of links) { if (!map.has(l.zk)) map.set(l.zk, { zk: l.zk, id: l.id, links: [] }); map.get(l.zk).links.push(l); }
  return [...map.values()].map(c => {
    const open = c.links.filter(l => !l.ok), last = c.links[c.links.length - 1];
    return { ...c, first: c.links[0], last, open: open.length > 0, nOpen: open.length, closedAt: open.length ? 0 : Math.max(...c.links.map(l => closedAt(l.f))) };
  });
}
const isoOf = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00") - Date.parse(a + "T00:00:00")) / 864e5);
// Yeni yazılan bulgu için öneri: aynı maddedeki açık zincirler (süre sınırı yok) + son 8 haftada kapanmış zincirler (tekrar uyarısı)
// exclude: aynı denetimde zaten bağlanmış zincirler (bir eski halka yalnızca tek yeni bulguya bağlanır)
export function suggest(chains, { id, text, date, exclude = [] }) {
  const open = [], tekrar = [];
  for (const c of chains) {
    if (c.id !== id || exclude.includes(c.zk) || !c.links.some(l => !date || l.date < date)) continue;
    const sim = similarity(text, c.last.t);
    if (c.open) open.push({ chain: c, sim });
    else if (c.closedAt && date && daysBetween(isoOf(c.closedAt), date) <= 56 && sim.level !== "farkli" && sim.level !== "zayif") tekrar.push({ chain: c, sim, closed: isoOf(c.closedAt) });
  }
  const rank = { guclu: 3, orta: 2, zayif: 1, farkli: 0 };
  open.sort((a, b) => rank[b.sim.level] - rank[a.sim.level] || b.sim.score - a.sim.score || (b.chain.last.date || "").localeCompare(a.chain.last.date || ""));
  tekrar.sort((a, b) => b.sim.score - a.sim.score);
  const top = open[0];
  // Varsayılan seçim: güçlü → "Aynı bulgu" seçili; orta → boş (kullanıcı karar verir); zayıf/farklı → "Yeni bulgu" seçili
  const pick = !top ? "yeni" : top.sim.level === "guclu" ? "ayni" : top.sim.level === "orta" ? "" : "yeni";
  return { open, tekrar, pick, top: top || null };
}
// Bir aksiyon kabul edildiğinde kapanacak halkalar: aksiyon tarihine kadar tespit edilmiş, hâlâ açık olanlar
export function closeTargets(chain, actionDate) {
  return chain.links.filter(l => !l.ok && (!actionDate || !l.date || l.date <= actionDate));
}
// Zincirle kapanış kaydı (eski hafta): puanı değiştirmez, yalnızca takip için kapatır
export const viaFix = (l, src, extra = {}) => ({ t: l.t, st: "ok", via: src, at: Date.now(), ...extra });

// Bir bölümün denetim geçmişini yükler: içinde bulunulan aydan geriye n ay (yıl sınırı geçilir)
// get(fid, year, coll, id) → Promise<doc|null>
export async function loadHistory(get, fid, year, month, dept, n = 12) {
  const out = []; let y = +year, m = +month;
  for (let i = 0; i < n; i++) {
    const doc = await get(fid, y, "isg", `${String(m).padStart(2, "0")}_${dept}`).catch(() => null);
    if (doc?.sessions?.length) out.push({ year: y, month: m, doc });
    if (--m < 1) { m = 12; y--; }
  }
  return out.reverse();
}

// ---------- Zincir kapanışlarının tamamlanması (kendi kendini onaran kapanış) ----------
// Kapanış kararları kayıtta kalıcıdır; eski haftalara yazılan "via" kapanışları bunlardan yeniden türetilebilir:
//  1) Bir halkanın kendi kabul edilmiş aksiyonu (fixed ok, via değil): aynı zincirde o tarihe kadar tespit edilmiş açık halkaları kapatır
//     (f.zoff: kullanıcının "kapatılmasın" dediği halkaların bulgu kimlikleri). Bağlantı aksiyondan sonra kurulsa da geçerlidir.
//  2) "Uygun" kararı: kararın verildiği denetimde s.zu = { anahtar: { b: [hedef bulgu kimlikleri], ph, by, at } }
//     hedeflerin zincirinde, karar tarihinden önce tespit edilmiş açık halkaları kapatır.
// docs: tek bölümün [{ year, month, doc }] kayıtları (yerinde güncellenir). Dönüş: değişen "yıl|ay" anahtarları.
const dmyT = t => t ? `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}` : "";
export function heal(docs) {
  const links = linksOf(docs), chains = chainsOf(links), changed = new Set(), sess = new Map(), chainOf = new Map();
  for (const { year, month, doc } of docs || []) for (const s of doc?.sessions || []) sess.set(`${+year}|${+month}|${s.no}`, s);
  chains.forEach(c => c.links.forEach(l => chainOf.set(l.bk, c)));
  const close = (l, src) => {
    if (l.ok) return; const s = sess.get(`${l.y}|${l.m}|${l.no}`); if (!s || (s.fails?.[l.id] || [])[l.j] !== l.t) return;
    const ex = s.fixed?.[l.id + "|" + l.j]; if (ex && ex.st === "ok" && (ex.via || ex.t === l.t)) return;
    const at = src.at || Date.now();
    (s.fixed ||= {})[l.id + "|" + l.j] = { t: l.t, st: "ok", via: src.via, tx: src.tx || "", ph: (src.ph || []).map(p => ({ ...p })), gn: src.gn || "", at, ap: at, auto: 1 };
    l.ok = true; l.f = s.fixed[l.id + "|" + l.j]; changed.add(`${l.y}|${l.m}`);
  };
  for (const c of chains) for (const a of c.links) {
    const f = a.f; if (!(f && f.st === "ok" && !f.via && f.t === a.t && a.date)) continue; const off = f.zoff || [];
    for (const l of c.links) if (l !== a && !l.ok && l.date && l.date <= a.date && !off.includes(l.bk))
      close(l, { via: { k: "aks", d: a.date, no: a.no }, tx: f.tx, ph: f.ph, gn: f.gn, at: f.ap || f.at });
  }
  for (const { doc } of docs || []) for (const s of doc?.sessions || []) for (const r of Object.values(s.zu || {})) {
    const cs = new Set((r.b || []).map(bk => chainOf.get(bk)).filter(Boolean));
    for (const c of cs) for (const l of c.links) if (!l.ok && l.date && s.date && l.date < s.date)
      close(l, { via: { k: "uygun", d: s.date, no: s.no }, tx: r.tx || `${dmyT(s.date)} denetiminde uygun bulundu`, ph: r.ph, gn: r.by, at: r.at });
  }
  return [...changed];
}
