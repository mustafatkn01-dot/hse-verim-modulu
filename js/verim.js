// Verim Tablosu · gerçek verilerden dönem / gösterge bazlı özet
import * as S from "./store.js?v=20261026e";
import { esc } from "./ui.js?v=20261026e";
import { bandOf, DEFAULT_PARAMS, num, isgMonth, makTier, katsayi, konusmaPct, surecVar } from "./scoring.js?v=20261026e";
import { askFormat, savePdf, fileTitle, withTitle } from "./pdf.js?v=20261026e";
import { CATS } from "./isgcats.js?v=20261026e";
import * as Gorev from "./gorev.js?v=20261026e";
import { lastWeekKey, weekScores, weekLabel } from "./isgweek.js?v=20261026e";

const BAND = {
  Mükemmel: { fill: "#17A06F", c: "#0B6E4F", bg: "#D9F1E6" }, İyi: { fill: "#2A82C4", c: "#145F96", bg: "#DCEAF7" },
  Orta: { fill: "#E8A512", c: "#6B3F00", bg: "#FBE9C6" }, Kritik: { fill: "#D6382E", c: "#B3261E", bg: "#FADAD7" }
};
const NONE = { fill: "#D5E0DC", c: "#6A7E79", bg: "#EEF2F0" };
const MS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const MF = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MET = [["İş Kazası", "Kaza"], ["Eğitim Konuşması", "Eğitim K."], ["İşbaşı Eğitim", "İşbaşı"], ["İSG Denetim", "İSG"], ["Toplam Verim", "Toplam"]];
const rng = (a, z) => Array.from({ length: z - a + 1 }, (_, i) => a + i);
const f1 = n => n.toFixed(1).replace(".", ",");
const pad = n => String(n).padStart(2, "0");
const avg = (arr, idx) => { const v = idx.map(i => arr[i]).filter(x => x !== null && x !== undefined); return v.length ? v.reduce((a, c) => a + c, 0) / v.length : null; };
export const reset = () => { if (V.op) V.op = {}; if (V.cmp) V.cmp.open = false; };
const V = { p: "m", sel: null, metric: 4, key: "", data: null, wk: false };

export async function load(st, setup) {
  const rows = setup.rows, out = {};
  rows.forEach(r => { out[r.id] = Array.from({ length: 12 }, () => [null, null, null, null]); });
  const [kz, kn, ib, ig] = await Promise.all(["kaza", "konusma", "isbasi", "isg"].map(c => S.listMonthDocs(st.fid, st.year, c)));
  const num0 = x => (typeof x === "number" && isFinite(x) ? x : null);
  const put = (docs, k, pick) => docs.forEach(d => {
    const m = parseInt(String(d.id).slice(0, 2), 10) - 1; if (!(m >= 0 && m < 12) || !d.result) return;
    if (k === 3) {
      const id = String(d.id).slice(3), row = rows.find(r => r.id === id); if (!out[id]) return;
      // Skor, kayıtlı denetimlerden güncel ağırlıklarla yeniden hesaplanır (kategori ağırlığı değişirse eski kayıtlar da güncellenir)
      let sc = num0(d.result.score);
      if (d.sessions?.length && row) { try { sc = +isgMonth({ cats: CATS, sessions: d.sessions, freqOv: d.freq || {}, bonusIdx: d.bonus || 0, F: katsayi(row, m + 1), p: setup.params || DEFAULT_PARAMS, yog: surecVar(st.year, m + 1), mak: makTier(row) }).score.toFixed(2); } catch { } }
      out[id][m][3] = sc; return;
    }
    rows.forEach(r => { const x = d.result.per?.[r.id]; if (x) out[r.id][m][k] = num0(pick(x, m)); });
  });
  put(kz, 0, x => x.verim); put(kn, 1, (x, m) => konusmaPct(x, st.year, m + 1)); put(ib, 2, x => (x.state === "ok" ? x.verim : null)); put(ig, 3);
  // Kullanıcının girdiği açıklamalar (bölüm · ay · modül)
  const p = setup.params || DEFAULT_PARAMS, notes = [], mOf = d => parseInt(String(d.id).slice(0, 2), 10) - 1, low = x => x !== null && ["Orta", "Kritik"].includes(bandOf(x, p));
  const nt = (d, id) => String(d.rows?.[id]?.note || "").trim();
  kz.forEach(d => rows.forEach(r => { const x = d.result?.per?.[r.id], t = nt(d, r.id); if (x?.count > 0 && t) notes.push({ m: mOf(d), k: 0, id: r.id, t, x: `${x.count} olay` }); }));
  kn.forEach(d => rows.forEach(r => { const x = num0(konusmaPct(d.result?.per?.[r.id], st.year, mOf(d) + 1)), t = nt(d, r.id); if (low(x) && t) notes.push({ m: mOf(d), k: 1, id: r.id, t, x: `verim ${f1(x)}` }); }));
  ib.forEach(d => rows.forEach(r => { const x = d.result?.per?.[r.id], t = nt(d, r.id); if (x?.state === "ok" && x.verim < 99.995 && t) notes.push({ m: mOf(d), k: 2, id: r.id, t, x: `verim ${f1(x.verim)}` }); }));
  ig.forEach(d => { const id = String(d.id).slice(3); if (!out[id] || !d.sessions?.length) return; const items = {};
    // Her bulgu (madde içindeki her ayrı not) ayrı satır olur; fotoğrafları kendi notuna bağlıdır
    d.sessions.forEach(se => Object.entries(se.fails || {}).forEach(([key, arr]) => { const o = (items[key] ||= { list: new Map(), c: 0 }); o.c++;
      const L = (arr || []).length ? arr : [""];
      L.forEach((t, j) => { const k = String(t || "").trim(), e = o.list.get(k) || { c: 0, pics: [], at: j, by: {} }; e.c++;
        const ph0 = (se.photos || {})[key + "|" + j] || [], bs = e.by[se.no] || (e.by[se.no] = { no: se.no, m: mOf(d), rs: (d.resp || []).map(r => r.name).join(", "), du: d.due || "", date: se.date || "", pics: [], gk: k ? Gorev.noteKey("d", st.fid, st.year, mOf(d) + 1, id, `${key}_${se.no}`, k, L.slice(0, j).filter(x => String(x || "").trim() === k).length) : "" });
        ph0.forEach(ph => { if (!e.pics.some(x => x.id === ph.id)) e.pics.push(ph); if (!bs.pics.some(x => x.id === ph.id)) bs.pics.push(ph); });
        const fxo = (se.fixed || {})[key + "|" + j]; if (fxo && fxo.st === "ok" && fxo.t === k && (fxo.tx || "").trim()) bs.fx = { tx: fxo.tx.trim(), ph: (fxo.ph || []).map(ph => ({ ...ph })), at: fxo.at || 0 };
        o.list.set(k, e); }); }));
    Object.entries(items).forEach(([key, o]) => { const mm = /^c(\d+)i(\d+)$/.exec(key); if (!mm) return; const c = CATS[+mm[1]]; if (!c) return;
      [...o.list.entries()].forEach(([t, e]) => notes.push({ m: mOf(d), k: 3, id, cat: c.name, t: `${c.name}: ${t || c.items[+mm[2]]}`, x: `${e.c} denetimde uygunsuz`, pics: e.pics, by: e.by })); }); });
  out._n = notes;
  out._i = ig.map(d => ({ m: parseInt(String(d.id).slice(0, 2), 10), id: String(d.id).slice(3), sessions: d.sessions || [], freq: d.freq, bonus: d.bonus }));
  out._s = {}; ig.forEach(d => { const id = String(d.id).slice(3); (d.sessions || []).forEach(se => { if (se?.date) (out._s[id] ||= []).push(se.date); }); });
  return out;
}

export async function render(v, ctx) {
  const { st } = ctx;
  const setup = await S.getSetup(st.fid, st.year);
  if (!setup?.rows?.length) { v.innerHTML = `<div class="cd"><h2>Önce bölümleri tanımlayın</h2><p class="sub">Verim tablosu için Kurulum ve Kayıtlar sayfasında en az bir bölüm kaydedilmeli.</p><div><a href="#kurulum"><button>Kurulum'a git</button></a></div></div>`; return; }
  v.innerHTML = `<div class="sub">Veriler yükleniyor…</div>`;
  const key = [st.fid, st.year].join("/");
  V.data = await load(st, setup);
  if (V.key !== key) { V.key = key; V.p = "m"; V.sel = null; }
  V.ctx = ctx; V.v = v; V.setup = setup;
  draw();
}

function draw() {
  const { st } = V.ctx, setup = V.setup, p = setup.params || DEFAULT_PARAMS, rows = setup.rows, y = st.year;
  const W = [num(p.w?.kaza ?? 40), num(p.w?.konusma ?? 15), num(p.w?.isbasi ?? 15), num(p.w?.isg ?? 30)];
  const band = s => (s === null ? NONE : BAND[bandOf(s, p)]), bname = s => (s === null ? "Veri yok" : bandOf(s, p));
  const mod = id => V.data[id];
  const total = (id, m) => { let a = 0, d = 0; mod(id)[m].forEach((x, k) => { if (x !== null) { a += x * W[k]; d += W[k]; } }); return d > 0 ? a / d : null; };
  const series = (id, k) => Array.from({ length: 12 }, (_, m) => (k === 4 ? total(id, m) : mod(id)[m][k]));
  const hasM = Array.from({ length: 12 }, (_, m) => rows.some(r => total(r.id, m) !== null));
  const lastM = hasM.lastIndexOf(true);
  const PER = {
    m: { t: "Aylık", items: MS.map((n, i) => ({ t: n, idx: [i] })), name: i => MF[i] + " " + y, title: "AY SEÇİN" },
    q: { t: "3 Aylık (Ç1)", items: [{ t: "Ç1", idx: rng(0, 2) }], name: () => "1. çeyrek · Ocak-Mart " + y, title: "" },
    h: { t: "6 Aylık (Ç2)", items: [{ t: "Ç2", idx: rng(0, 5) }], name: () => "2. çeyrek · Ocak-Haziran " + y + " (kümülatif)", title: "" },
    n: { t: "9 Aylık (Ç3)", items: [{ t: "Ç3", idx: rng(0, 8) }], name: () => "3. çeyrek · Ocak-Eylül " + y + " (kümülatif)", title: "" },
    y: { t: "Yıllık", items: [{ t: String(y), idx: rng(0, 11) }], name: () => y + " yılı", title: "" }
  };
  const defSel = { m: Math.max(0, lastM), q: 0, h: 0, n: 0, y: 0 };
  if (V.sel === null || V.sel >= PER[V.p].items.length) V.sel = defSel[V.p];
  const cur = PER[V.p].items[V.sel], have = cur.idx.filter(i => hasM[i]).length, partial = have > 0 && have < cur.idx.length;
  const mk = V.metric, val = (id, k) => avg(series(id, k), cur.idx);
  const seg = on => (on ? "background:var(--sel);color:#fff;border-color:var(--sel)" : "background:var(--card);color:var(--text);border-color:var(--inl)");
  // İSG · "Son hafta" sekmesi: seçili dönemin son denetim haftası; "Dönem" denetimlerin ortalaması, "Son hafta" en son denetimin puanıdır
  const WD = V.data._i || [], wk = mk === 3 ? lastWeekKey(WD, cur.idx.map(i => i + 1)) : null, wmode = !!wk && V.wk;
  const wsc = wk ? weekScores(WD, rows, p, y, wk) : {}, wlab = wk ? weekLabel(WD, wk, y) : "";
  const crows = rows, plab = wmode ? wlab : PER[V.p].name(V.sel);
  const vals = wmode ? crows.map(r => wsc[r.id] ?? null) : rows.map(r => val(r.id, mk)), ok = vals.filter(x => x !== null);
  const av = ok.length ? ok.reduce((a, c) => a + c, 0) / ok.length : null, ab = band(av);
  const cell = x => (x === null ? { t: "–", bg: NONE.bg, c: NONE.c } : { t: f1(x), bg: band(x).bg, c: band(x).c });
  const t0 = 30, H = 2.4;

  const bars = crows.map((r, i) => { const x = vals[i]; return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:330px">
    <div style="font-size:14px;font-weight:800;margin-bottom:4px;position:relative;z-index:2;-webkit-text-stroke:3px var(--card);paint-order:stroke fill">${x === null ? (mk === 3 ? `<span style="font-size:10.5px;font-weight:700;line-height:1.1;display:block;text-align:center;color:var(--muted);-webkit-text-stroke:0">${wmode ? "Denetlenmedi" : "Denetim yok"}</span>` : "–") : f1(x)}</div>
    <div style="width:42%;max-width:40px;height:${x === null ? 3 : Math.round(x * H)}px;background:${band(x).fill};border-radius:8px 8px 2px 2px"></div>
    <div style="height:30px;line-height:30px;font-size:12.5px;font-weight:600;color:var(--muted);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</div></div>`; }).join("");

  const buildNotes = (lab, nms, vs, a, prev, wk2) => {
    const e1 = vs.map((x, i) => [x, i]).filter(x => x[0] !== null).sort((q, z) => z[0] - q[0]), notes = [];
    if (e1.length) {
      const top = e1[0], low = e1[e1.length - 1], nm = i => nms[i];
      notes.push(`${lab} için ${MET[mk][0]} ortalaması ${f1(a)} (${bname(a)}).`);
      notes.push(`En yüksek: ${nm(top[1])} (${f1(top[0])}); en düşük: ${nm(low[1])} (${f1(low[0])}).`);
      const lo = e1.filter(x => bandOf(x[0], p) === "Kritik").map(x => nm(x[1])), mid = e1.filter(x => bandOf(x[0], p) === "Orta").map(x => nm(x[1]));
      if (lo.length) notes.push(`Kritik seviyede: ${lo.join(", ")}. Öncelikli aksiyon gerekir.`);
      if (mid.length) notes.push(`Orta seviyede: ${mid.join(", ")}.`);
      if (!lo.length && !mid.length) notes.push(`Tüm bölümler "İyi" veya üzerinde.`);
      if (wk2 && nms.some((_, i) => vs[i] === null)) notes.push(`Bu hafta denetlenmeyen bölümler: ${nms.filter((_, i) => vs[i] === null).join(", ")}.`);
      if (prev) { const pv = avg(rows.map(r => series(r.id, mk)[V.sel - 1]), rng(0, rows.length - 1)); if (pv !== null) notes.push(`Bir önceki aya göre ${a >= pv ? "artış" : "düşüş"}: ${f1(Math.abs(a - pv))} puan.`); }
    }
    return notes;
  };
  const notes = buildNotes(plab, crows.map(r => r.name), vals, av, !wmode && V.p === "m" && V.sel > 0, wmode);
  if (mk === 3 && !wmode && notes.length) notes.push("İSG puanı, ayda yapılan denetimlerin puan ortalamasıdır (ramak kala bonusu eklenir). Her denetim 100 puandan başlar; yalnız o denetimde bulgu çıkan kategoriler ceza alır, sıklık önceki denetimlerden devam eder.");
  if (wmode && notes.length) notes.push("Puan, bu haftanın en son denetiminin puanıdır (denetim ekranındaki anlık İSG skoru); bu hafta denetlenmeyen bölümler grafikte \"Denetlenmedi\" olarak işaretlenir ve ortalamaya girmez.");
  // PDF: seçilen haftanın grafiği (ay başından o haftanın sonuna birikimli)
  const weekFor = k => { const sc = weekScores(WD, rows, p, y, k), cr = rows, vs = cr.map(r => sc[r.id] ?? null), vv = vs.filter(x => x !== null), a = vv.length ? vv.reduce((q, z) => q + z, 0) / vv.length : null, lab = weekLabel(WD, k, y), ns = buildNotes(lab, cr.map(r => r.name), vs, a, false, true);
    if (ns.length) ns.push("Puan, bu haftanın en son denetiminin puanıdır (denetim ekranındaki anlık İSG skoru); bu hafta denetlenmeyen bölümler grafikte \"Denetlenmedi\" olarak işaretlenir ve ortalamaya girmez.");
    return { names: cr.map(r => r.name), vals: vs, av: a, ab: band(a), abn: bname(a), plabel: lab + " · son denetim", notes: ns, nullLabel: "Denetlenmedi" }; };
  const nonEmpty = rows.some(r => V.data[r.id].some(m => m.some(x => x !== null)));

  const heads = [], mr = rows.map(() => []);
  const addCol = (label, idx, flex, kind, pp, i) => {
    const on = V.p === pp && V.sel === i, bg = on ? "var(--sel)" : kind === "y" ? "#D9F1E6" : kind === "n" || kind === "h" ? "#DCEAF7" : kind === "q" ? "#EEF3F1" : "#F6FAF8";
    heads.push(`<button data-go="${pp}:${i}" aria-pressed="${on}" style="flex:${flex};min-width:0;height:38px;border-radius:8px;border:1px solid ${on ? "var(--sel)" : "#D5E0DC"};background:${bg};color:${on ? "#fff" : "#2A3F3A"};font:inherit;font-size:12px;font-weight:800;padding:0 2px">${label}</button>`);
    rows.forEach((r, b) => { const c = cell(avg(series(r.id, mk), idx)); mr[b].push(`<div style="flex:${flex};min-width:0;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;background:${c.bg};color:${c.c}">${c.t}</div>`); });
  };
  MS.forEach((n, i) => addCol(n, [i], 1, "m", "m", i));
  addCol("3 Ay (Ç1)", rng(0, 2), 1.4, "q", "q", 0);
  addCol("6 Ay (Ç2)", rng(0, 5), 1.4, "h", "h", 0);
  addCol("9 Ay (Ç3)", rng(0, 8), 1.4, "n", "n", 0);
  addCol("Yıllık", rng(0, 11), 1.4, "y", "y", 0);

  const gc = "100px repeat(5,1fr) 110px";
  const E = { h: parseFloat(String(p.esik?.h ?? "90").replace(",", ".")) || 90, o: parseFloat(String(p.esik?.o ?? "50").replace(",", ".")) || 50, i: parseFloat(String(p.esik?.i ?? "75").replace(",", ".")) || 75 };
  // Puan çizgileri: hepsi aynı ince ve soluk stil; hedef/kritik yalnızca renk tonuyla ayrışır, etiketler hepsinde aynı boyut ve kalınlıkta
  const GL = [...new Set([25, E.o, E.i, E.h, 100])].sort((a, z) => a - z);
  const line = (v0, lab) => { const c = v0 === E.h ? ["#0B6E4F", "rgba(11,110,79,.4)"] : v0 === E.o ? ["#D6382E", "rgba(214,56,46,.4)"] : ["var(--muted)", "#D5DFDB"]; return `<div style="position:absolute;left:34px;right:0;bottom:${t0 + v0 * H}px;border-top:1px solid ${c[1]}"></div><div style="position:absolute;left:0;bottom:${t0 + v0 * H - 8}px;width:30px;text-align:right;font-size:12px;font-weight:700;color:${c[0]}">${lab}</div>`; };
  const wTab = wk ? `<span class="noprint" style="display:inline-flex;gap:4px;margin-left:12px;vertical-align:middle">${[[false, "Dönem"], [true, "Son hafta"]].map(([on, t]) => `<button class="sec" data-wk="${on ? 1 : 0}" aria-pressed="${wmode === on}" style="height:30px;min-width:0;padding:0 10px;border-radius:8px;font-size:12.5px;font-weight:700;${wmode === on ? "background:#0B6E4F;color:#fff;border-color:#0B6E4F" : "background:#fff;color:#546964"}">${t}</button>`).join("")}</span>` : "";
  V.v.innerHTML = `
  <div class="col1" style="gap:6px"><h1 class="ttl">Verim Tablosu</h1>
    <div class="sub">Aylık, çeyreklik (3-6-9 aylık, kümülatif) ve yıllık verimi sütun grafik ve tablo olarak görün. Dönemi ve göstergeyi seçin, grafik ile tablo birlikte güncellenir. Veriler aylık giriş sayfalarında kaydedilen sonuçlardan gelir.</div></div>
  ${nonEmpty ? "" : `<div class="warn">${y} yılı için henüz kayıtlı veri yok. Aylık giriş sayfalarından veri kaydedildikçe tablo dolar.</div>`}
  <div class="cd" style="padding:18px 20px;gap:14px">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="col1" style="gap:6px;min-width:0"><label class="hd" for="vP">DÖNEM</label><select id="vP" style="font-weight:700">${["m", "q", "h", "n", "y"].map(k => `<option value="${k}" ${V.p === k ? "selected" : ""}>${PER[k].t}</option>`).join("")}</select></div>
      <div class="col1" style="gap:6px;min-width:0"><label class="hd" for="vS">AY</label><select id="vS" style="font-weight:700" ${V.p === "m" ? "" : "disabled"}>${V.p === "m" ? PER.m.items.map((it, i) => `<option value="${i}" ${V.sel === i ? "selected" : ""}>${MF[i]}${hasM[i] ? "" : " (veri yok)"}</option>`).join("") : `<option>${PER[V.p].items[0].t}</option>`}</select></div></div>
    <div class="col1" style="gap:6px"><span class="hd">GÖSTERGE</span><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">${MET.map((m, k) => `<button data-m="${k}" aria-pressed="${mk === k}" style="height:36px;padding:0 2px;border-radius:10px;border:1px solid;font-weight:700;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${seg(mk === k)}">${m[1]}</button>`).join("")}</div></div></div>
  <div class="cd">
    <div class="row sp"><div><h2>${MET[mk][0]} · Bölüm Karşılaştırması${wTab}</h2><div class="muted" style="font-size:13px;margin-top:4px">${plab}</div></div>
      <div class="row" style="gap:10px;flex-wrap:nowrap"><span class="muted" style="font-size:13px">Tesis ortalaması</span><b style="font:700 22px Sora,sans-serif">${av === null ? "–" : f1(av)}</b><span class="pill" style="background:${ab.bg};color:${ab.c}">${bname(av)}</span>
        <button data-pdf class="sec" style="height:40px;padding:0 16px;border-radius:10px;font-weight:700;white-space:nowrap">PDF indir</button></div></div>
    ${partial && !wmode ? `<div class="warn">Kısmi dönem: ${cur.idx.length} aydan ${have} tanesi için veri var. Değerler mevcut aylar üzerinden hesaplandı.</div>` : ""}
    <div style="overflow-x:auto"><div style="min-width:${Math.max(260, rows.length * 70 + 40)}px;position:relative;height:330px">
      ${GL.map(v => line(v, v)).join("")}
      <div style="position:absolute;left:34px;right:0;top:0;bottom:0;display:flex;gap:10px">${bars}</div></div></div>
    <div class="row" style="gap:14px;font-size:12.5px;color:var(--muted)">${[["Mükemmel", "≥ 90"], ["İyi", "75-89"], ["Orta", "50-74"], ["Kritik", "< 50"]].map(([n, r]) => `<span class="row" style="gap:6px;flex-wrap:nowrap"><span style="width:12px;height:12px;border-radius:3px;background:${BAND[n].fill}"></span>${n} ${r}</span>`).join("")}</div>
    ${notes.length ? `<div style="border-top:1px solid var(--line);padding-top:16px;display:flex;flex-direction:column;gap:8px"><div style="font-weight:800;font-size:13px;letter-spacing:.8px;color:var(--muted)">AÇIKLAMA</div>${notes.map((t, i) => `<div style="display:flex;gap:10px;line-height:1.55"><span style="flex:0 0 22px;font-weight:800;color:#0B6E4F">${i + 1}.</span><span>${esc(t)}</span></div>`).join("")}</div>` : ""}
    <div data-detslot></div></div>
  <div class="cd" style="gap:14px">
    <div class="row sp"><h2>Tablo · ${PER[V.p].name(V.sel)}</h2><div class="row" style="gap:10px"><span class="muted" style="font-size:13px">Modül verimleri ve toplam verim</span><button class="sec sm" data-csv="t" style="height:36px;padding:0 14px;border-radius:10px;font-weight:700">Excel'e aktar</button></div></div>
    <div style="overflow-x:auto"><div style="min-width:700px;display:flex;flex-direction:column;gap:6px">
      <div style="display:grid;grid-template-columns:${gc};gap:6px"><span class="hd">Bölüm</span>${MET.map((m, k) => `<span style="font-size:12px;font-weight:800;padding:6px 8px;border-radius:8px;text-align:center;background:${mk === k ? "var(--sel)" : "#EEF3F1"};color:${mk === k ? "#fff" : "#3E534E"}">${m[1]}</span>`).join("")}<span class="hd" style="text-align:center">Durum</span></div>
      ${rows.map(r => { const tv = val(r.id, 4), sb = band(tv); return `<div style="display:grid;grid-template-columns:${gc};gap:6px;align-items:center"><span style="font-weight:700;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</span>
        ${[0, 1, 2, 3, 4].map(k => { const c = cell(val(r.id, k)); return `<span style="height:38px;display:flex;align-items:center;justify-content:center;border-radius:9px;font-weight:800;background:${c.bg};color:${c.c}">${c.t}</span>`; }).join("")}
        <span style="text-align:center;font-size:12px;font-weight:800;padding:6px 0;border-radius:999px;background:${sb.bg};color:${sb.c}">${bname(tv)}</span></div>`; }).join("")}
      <div style="display:grid;grid-template-columns:${gc};gap:6px;align-items:center;border-top:2px solid var(--line);padding-top:8px;margin-top:2px"><span style="font-weight:800">Tesis</span>
        ${[0, 1, 2, 3, 4].map(k => { const a = rows.map(r => val(r.id, k)).filter(x => x !== null); return `<span style="height:38px;display:flex;align-items:center;justify-content:center;border-radius:9px;font-weight:800;background:var(--sel);color:#fff">${a.length ? f1(a.reduce((s, c) => s + c, 0) / a.length) : "–"}</span>`; }).join("")}<span></span></div></div></div></div>
  <div class="cd" style="gap:14px">
    <div class="row sp"><h2>Tüm Dönemler · ${MET[mk][0]}</h2><div class="row" style="gap:10px"><span class="muted" style="font-size:13px">Dönem başlığına tıklayarak yukarıdaki grafiği o döneme getirin.</span><button class="sec sm" data-csv="m" style="height:36px;padding:0 14px;border-radius:10px;font-weight:700">Excel'e aktar</button></div></div>
    <div style="overflow-x:auto"><div style="min-width:1260px;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;gap:6px;align-items:flex-end"><div style="width:96px;flex:0 0 96px"></div>${heads.join("")}</div>
      ${rows.map((r, b) => `<div style="display:flex;gap:6px;align-items:center"><div style="width:96px;flex:0 0 96px;font-weight:700;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</div>${mr[b].join("")}</div>`).join("")}</div></div>
    <div class="muted" style="font-size:12.5px;line-height:1.6">Veri girilmeyen aylar "–" gösterir. Eksik aylı dönemler mevcut aylar üzerinden hesaplanır ve "kısmi" olarak işaretlenir. Bir bölümde değerlendirilen modül yoksa (örn. işe giriş yok) toplam verimde ağırlıklar kalan modüllere yeniden dağıtılır (ağırlıklar: İş Kazası ${W[0]}, Konuşma ${W[1]}, İşbaşı ${W[2]}, İSG ${W[3]}).</div></div>`;
  const rowIx = Object.fromEntries(rows.map((r, i) => [r.id, i])), MODN = ["İş Kazası", "Eğitim Konuşması", "İşbaşı Eğitim", "İSG Denetim"];
  const sel = (V.data._n || []).filter(n => (mk === 4 || n.k === mk) && cur.idx.includes(n.m) && rowIx[n.id] !== undefined).sort((a, b) => a.k - b.k || rowIx[a.id] - rowIx[b.id] || a.m - b.m);
  const details = [0, 1, 2, 3].map(k => ({ mod: MODN[k], items: sel.filter(n => n.k === k).map(n => ({ dept: rows[rowIx[n.id]].name, text: n.t, cat: n.cat || "", extra: n.x, pics: n.pics || [], by: n.by || null, mon: cur.idx.length > 1 ? MS[n.m] : "" })) })).filter(g => g.items.length);
  const detHtml = `<div style="border-top:1px solid var(--line);padding-top:16px;display:flex;flex-direction:column;gap:12px"><div style="font-weight:800;font-size:13px;letter-spacing:.8px;color:var(--muted)">BÖLÜM AÇIKLAMALARI <span style="font-weight:600;letter-spacing:0">· denetim ve eğitim kayıtlarında yazılanlar</span></div>
    ${details.length ? details.map(g => `<div class="col1" style="gap:6px">${mk === 4 ? `<div style="font-weight:800;color:#145F96">${g.mod}</div>` : ""}${g.items.map((a, i) => `<div style="display:flex;gap:10px;line-height:1.55"><span style="flex:0 0 22px;font-weight:800;color:#0B6E4F">${i + 1}.</span><span>${a.mon ? `<span class="muted">${a.mon} · </span>` : ""}<b>${esc(a.dept)}</b> — ${a.cat && a.text.startsWith(a.cat + ": ") ? `<i style="color:#C4453A;font-weight:600">${esc(a.cat)}:</i> ${esc(a.text.slice(a.cat.length + 2))}` : esc(a.text)} <span class="muted" style="white-space:nowrap">· ${esc(a.extra)}</span></span></div>`).join("")}</div>`).join("") : `<div class="muted">Bu dönem için girilmiş açıklama yok.</div>`}</div>`;
  const info = { fid: st.fid, year: st.year, details, mk4: mk === 4, fname: st.factories.find(f => f.id === st.fid)?.name || "", title: `${MET[mk][0]} · Bölüm Karşılaştırması`, plabel: plab, av, abn: bname(av), ab, names: crows.map(r => r.name), vals, weekFor: wk ? weekFor : null, nullLabel: mk === 3 ? (wmode ? "Denetlenmedi" : "Denetim yok") : "", wkKey: wmode ? wk : null, bandOf: x => (x === null ? NONE : band(x)), notes, partial: partial && !wmode ? `Kısmi dönem: ${cur.idx.length} aydan ${have} tanesi için veri var. Değerler mevcut aylar üzerinden hesaplandı.` : "", esik: p.esik };
  // ---- Açılır kartlar (varsayılan kapalı) ----
  const OP = V.op || (V.op = {});
  const fold = (box, head, key, clickEl) => {
    if (!box || !head) return;
    const body = document.createElement("div"); body.style.cssText = "display:flex;flex-direction:column;gap:14px";
    [...box.children].filter(c => c !== head).forEach(c => body.appendChild(c)); box.appendChild(body);
    const ch = document.createElement("span"); ch.style.cssText = "font-size:18px;margin-left:8px;color:var(--muted)";
    const chHost = head.querySelector("h2") || clickEl;
    const sync = () => { body.style.display = OP[key] ? "flex" : "none"; ch.textContent = OP[key] ? "▴" : "▾"; clickEl.setAttribute("aria-expanded", !!OP[key]); };
    chHost.appendChild(ch); clickEl.style.cursor = "pointer"; clickEl.setAttribute("role", "button"); clickEl.tabIndex = 0;
    const tg = () => { OP[key] = !OP[key]; sync(); };
    clickEl.onclick = e => { if (e.target.closest("button,a,input,select")) return; tg(); }; clickEl.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tg(); } };
    sync();
  };
  const ds = V.v.querySelector("[data-detslot]"); ds.innerHTML = detHtml;
  fold(ds.firstElementChild, ds.firstElementChild?.firstElementChild, "det", ds.firstElementChild?.firstElementChild);
  [...V.v.querySelectorAll(":scope > .cd")].forEach(c => { const h = c.querySelector(":scope > .row.sp"), t = h?.querySelector("h2")?.textContent || ""; if (/^Tablo ·/.test(t)) fold(c, h, "tbl", h); else if (/^Tüm Dönemler/.test(t)) fold(c, h, "all", h); });

  // ---- İSG Denetim · aylık kıyas (son 2/3 ay) ----
  {
    const C = V.cmp || (V.cmp = { open: false, n: 3, drop: false });
    const isg = rows.map(r => ({ r, s: series(r.id, 3) })), last = rng(0, 11).filter(m => isg.some(x => x.s[m] !== null)).pop();
    const card = document.createElement("div"); card.className = "cd"; card.style.gap = "14px";
    const head = `<button data-cmpt aria-expanded="${C.open}" class="sec" style="display:flex;justify-content:space-between;align-items:center;width:100%;border:0;background:none;padding:0;font:inherit;text-align:left"><span><h2 style="margin:0">İSG Denetim · Aylık Kıyas</h2><span class="muted" style="font-size:13px">Bölümlerin son aylardaki denetim puanı ve değişimi</span></span><span style="font-size:20px">${C.open ? "▴" : "▾"}</span></button>`;
    if (!C.open) card.innerHTML = head;
    else if (last === undefined) card.innerHTML = head + `<div class="muted" style="font-size:13.5px">Henüz İSG denetim verisi yok.</div>`;
    else {
      const ms = rng(Math.max(0, last - C.n + 1), last);
      let L = isg.map(x => { const a = x.s[last], b = last > 0 ? x.s[last - 1] : null; return { ...x, d: a !== null && b !== null ? a - b : null }; });
      if (C.drop) L = L.slice().sort((p1, p2) => (p1.d === null) - (p2.d === null) || (p1.d ?? 0) - (p2.d ?? 0));
      const chg = d => d === null ? `<span class="muted">–</span>` : Math.abs(d) < 0.05 ? `<b style="color:#6B7B76">● 0</b>` : d > 0 ? `<b style="color:#1B7F4B">▲ +${f1(d)}</b>` : `<b style="color:#B3261E">▼ −${f1(-d)}</b>`;
      const segSt = on => `height:36px;padding:0 14px;border-radius:10px;border:1px solid ${on ? "var(--sel)" : "var(--line)"};font-weight:700;background:${on ? "var(--sel)" : "#fff"};color:${on ? "#fff" : "var(--ink,#10201C)"}`;
      const seg = (k, t) => `<button data-cn="${k}" aria-pressed="${C.n === k}" style="${segSt(C.n === k)}">${t}</button>`;
      const CH = 2.0, B = 68, TOP = 26, GX = 26, op = i => (ms.length === 1 ? 1 : 0.5 + 0.5 * i / (ms.length - 1)), bw = ms.length === 2 ? 26 : 22, fw = ms.length === 2 ? 17 : 13, gw = ms.length * bw + (ms.length - 1) * 2 + 16;
      const hedef = parseFloat(String(p.esik?.h ?? "90").replace(",", ".")) || 90, kr = parseFloat(String(p.esik?.o ?? "50").replace(",", ".")) || 50, Y = v => B + v * CH, tx = v => f1(v).replace(/,0$/, "");
      const lbl = (v, c, t) => `<div style="position:absolute;left:4px;bottom:${Y(v) + 2}px;font-size:8.5px;font-style:italic;font-weight:600;line-height:1.2;color:${c};z-index:3;white-space:nowrap;-webkit-text-stroke:2.5px var(--card);paint-order:stroke fill;text-shadow:0 0 2px var(--card)">${t}</div>`;
      const ax = (v, c, b) => `<div style="position:absolute;left:0;bottom:${Y(v) - 7}px;width:${GX - 3}px;text-align:right;font-size:11px;${b ? `font-weight:800;color:${c}` : "color:var(--muted)"}">${tx(v)}</div>`;
      const ln = (v, st2) => `<div style="position:absolute;left:0;right:0;bottom:${Y(v)}px;border-top:${st2}"></div>`;
      const H2 = Math.round(100 * CH) + B + TOP;
      const grp = L.map(x => `<div style="flex:0 0 ${gw}px;position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:${H2}px">
        <div style="display:flex;align-items:flex-end;gap:2px">${ms.map((m, i) => { const v = x.s[m]; return `<div style="width:${bw}px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end"><div style="font-size:10px;font-weight:800;margin-bottom:2px;white-space:nowrap">${v === null ? "–" : f1(v)}</div><div style="width:${fw}px;height:${v === null ? 3 : Math.max(3, Math.round(v * CH))}px;background:${band(v).fill};opacity:${op(i)};border-radius:5px 5px 1px 1px"></div><div style="font-size:10px;color:var(--muted);height:16px;line-height:16px">${MS[m]}</div></div>`; }).join("")}</div>
        <div style="margin-top:4px;font-size:12px;font-weight:700;text-align:center;line-height:1.2;width:100%;height:30px;overflow:hidden;display:flex;align-items:flex-start;justify-content:center;word-break:break-word">${esc(x.r.name)}</div><div style="font-size:12px;height:18px">${chg(x.d)}</div></div>`).join("");
      const axis = [0, 25, 75, 100].filter(a => Math.abs(a - hedef) >= 7 && Math.abs(a - kr) >= 7).map(a => ax(a)).join("") + ax(kr, "#D6382E", true) + ax(hedef, "#0B6E4F", true);
      const lines = [25, 75, 100].map(a => ln(a, "1px dashed #B5C5BF")).join("") + ln(0, "1.5px solid #9FB4AE") + `<div style="z-index:0;position:absolute;inset:0;pointer-events:none">${ln(kr, "2px solid #D6382E")}${ln(hedef, "2px solid #0B6E4F")}</div>`;
      card.innerHTML = head + `<div class="row" style="gap:8px">${seg(2, "Son 2 ay")}${seg(3, "Son 3 ay")}<button data-cdrop aria-pressed="${C.drop}" style="${segSt(C.drop)}">En çok düşenler üstte</button></div>
      <div class="row" style="gap:14px;font-size:12px;color:var(--muted)"><span class="row" style="gap:6px;flex-wrap:nowrap"><span style="width:18px;border-top:2px solid #0B6E4F"></span>Hedef puan (${tx(hedef)})</span><span class="row" style="gap:6px;flex-wrap:nowrap"><span style="width:18px;border-top:2px solid #D6382E"></span>Kritik puan (${tx(kr)})</span></div><div style="display:flex"><div style="position:relative;flex:0 0 ${GX}px;height:${H2}px">${axis}</div><div style="overflow-x:auto;flex:1;min-width:0"><div style="position:relative;display:flex;gap:6px;min-width:100%;width:max-content;height:${H2}px">${lines}${grp}</div></div></div>
      <div class="muted" style="font-size:12.5px;line-height:1.6">Sütunlar soldan sağa eski → yeni aydır (son ay en koyu). Bölüm adının altındaki değişim, ${MS[last]} ayının bir önceki aya farkıdır (puan). Veri girilmeyen ay "–" gösterir ve değişim hesaplanmaz. Eğitim ve iş kazası, aydan aya doğal olarak dalgalandığı için aylık kıyaslanmaz.</div>`;
    }
    V.v.appendChild(card);
    card.querySelector("[data-cmpt]").onclick = () => { C.open = !C.open; draw(); };
    card.querySelectorAll("[data-cn]").forEach(b => b.onclick = () => { C.n = +b.dataset.cn; draw(); });
    card.querySelector("[data-cdrop]")?.addEventListener("click", () => { C.drop = !C.drop; draw(); });
  }
  V.v.querySelector("[data-pdf]").onclick = () => pdfDialog(info);
  const fn = `${(info.fname || "tesis").replace(/[^\wğüşıöçĞÜŞİÖÇ-]+/g, "_")}_${y}`;
  V.v.querySelector('[data-csv="t"]').onclick = () => downloadCsv(`${fn}_verim_tablosu_${cur.idx.length === 1 ? MS[cur.idx[0]] : PER[V.p].t.split(" ")[0]}.csv`, [[`${info.fname} · ${PER[V.p].name(V.sel)}`], ["Bölüm", ...MET.map(m => m[0]), "Durum"],
    ...rows.map(r => [r.name, ...[0, 1, 2, 3, 4].map(k => val(r.id, k)), bname(val(r.id, 4))]),
    ["Tesis", ...[0, 1, 2, 3, 4].map(k => avg(rows.map(r => val(r.id, k)).filter(x => x !== null), rng(0, Math.max(0, rows.filter(r => val(r.id, k) !== null).length - 1))))]]);
  const PC = [...MS.map((n, i) => [n, [i]]), ["3 Ay (Ç1)", rng(0, 2)], ["6 Ay (Ç2)", rng(0, 5)], ["9 Ay (Ç3)", rng(0, 8)], ["Yıllık", rng(0, 11)]];
  V.v.querySelector('[data-csv="m"]').onclick = () => downloadCsv(`${fn}_${MET[mk][0].replace(/\s+/g, "_")}_tum_donemler.csv`, [[`${info.fname} · ${MET[mk][0]} · ${y}`], ["Bölüm", ...PC.map(c => c[0])], ...rows.map(r => [r.name, ...PC.map(c => avg(series(r.id, mk), c[1]))])]);
  const rd = () => draw();
  V.v.querySelector("#vP").onchange = e => { V.p = e.target.value; V.sel = null; rd(); };
  V.v.querySelector("#vS").onchange = e => { V.sel = +e.target.value; rd(); };
  V.v.querySelectorAll("[data-wk]").forEach(b => b.onclick = () => { V.wk = b.dataset.wk === "1"; rd(); });
  V.v.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { V.metric = +b.dataset.m; rd(); });
  V.v.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { const [a, i] = b.dataset.go.split(":"); V.p = a; V.sel = +i; rd(); scrollTo({ top: 0, behavior: "smooth" }); });
}

// ---- Tek sayfalık grafik + açıklama PDF'i (A4/A3, dikey/yatay) ----
function pdfDialog(info) {
  const n = info.names.length;
    const dm = d => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : "");
  // Denetimler bölümlere göre farklı sırada numaralanabildiği için ("1. denetim" bir bölümde geçen hafta, başka bölümde bu hafta olabilir) rapor kapsamı HAFTA bazlıdır
  const addD = (t, n) => { const d = new Date(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const monOf = t => { const g = new Date(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)).getDay(); return addD(t, g === 0 ? -6 : 1 - g); };
  const wkNo = t => { const m = monOf(t), d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, +m.slice(8, 10) + 3), j4 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - j4) / 864e5 - 3 + ((j4.getDay() + 6) % 7)) / 7); };
  info.wkOf = b => (b.date ? monOf(b.date) : `${b.m}_${b.no}`);
  const sess = new Map(); info.details.filter(g => g.mod === "İSG Denetim").forEach(g => g.items.forEach(it => Object.values(it.by || {}).forEach(b => { const k = info.wkOf(b), e = sess.get(k) || { k, ds: [] }; if (b.date) e.ds.push(b.date); sess.set(k, e); })));
  const sl = [...sess.values()].sort((a, z) => String(a.k).localeCompare(String(z.k))).map(e => { const ds = e.ds.sort(), rg = ds.length ? (ds[0] === ds[ds.length - 1] ? dm(ds[0]) : `${dm(ds[0])}–${dm(ds[ds.length - 1])}`) : ""; return { k: e.k, label: ds.length ? `${wkNo(ds[0])}. hafta${rg ? " · " + rg : ""}` : "Tarihsiz denetimler" }; });
  info.sess = sl;
  const scopes = sl.length ? [["all", sl.length > 1 ? "Tüm haftalar (hafta bazlı)" : sl[0].label], ...(sl.length > 1 ? [["last:" + sl[sl.length - 1].k, "Son hafta · " + sl[sl.length - 1].label], ...sl.map(x => ["s:" + x.k, x.label])] : [])] : null;
  if (scopes && info.wkKey) { const i = scopes.findIndex(x => x[0] === "last:" + info.wkKey); if (i > 0) scopes.unshift(scopes.splice(i, 1)[0]); }
  askFormat({ title: "PDF indir", text: `${info.title} · ${info.plabel}. Grafik ve açıklamalar; yöneticinize göndermek için hazırlanır (resimsiz tek sayfa).`, defOrient: n > 7 ? "landscape" : "portrait", hint: n > 7 ? `${n} bölüm olduğu için yatay düzen önerilir.` : "Az sayıda bölümde dikey düzen yeterlidir.", scopes, takip: info.details.some(g => g.mod === "İSG Denetim"), pics: info.details.reduce((a, g) => a + g.items.reduce((b, it) => b + (it.pics?.length || 0), 0), 0),
    picsFor: scope => info.details.reduce((a, g) => a + (g.mod !== "İSG Denetim" ? g.items.reduce((b, it) => b + (it.pics?.length || 0), 0) : g.items.reduce((b, it) => b + Object.values(it.by || {}).filter(x => scope === "all" || info.wkOf(x) === scope.replace(/^(s|last):/, "")).reduce((c, x) => c + (x.pics?.length || 0) + (x.fx?.ph?.length || 0), 0), 0)), 0) }).then(o => o && printSheet(info, o));
}

async function printSheet(info, { size, orient, pics = false, file = false, scope = "all", trow = false, ttab = false }) {
  // Hafta seçildiyse grafik de o haftanın görünümüne geçer (ay başından o haftanın sonuna birikimli)
  if (info.weekFor && /^(s|last):/.test(scope)) { const w = info.weekFor(scope.replace(/^(s|last):/, "")); if (w && w.names.length) info = { ...info, ...w, partial: "" }; }
  // Tasarım A4 ölçüsünde (96 dpi) yapılır; A3 için √2 büyütülür.
  const land = orient === "landscape", W = land ? 1123 : 794, Hh = land ? 794 : 1123, M = 38, z = size === "A3" ? 1.4142 : 1;
  const cw = W - 2 * M, cpl = Math.floor(cw / 6.3);
  const lines = it => Math.ceil((it.dept.length + it.text.length + it.extra.length + 12) / cpl);
  const dl = info.details.reduce((a, g) => a + (info.mk4 ? 1 : 0) + g.items.reduce((b, it) => b + lines(it), 0), 0) + (info.details.length ? 0 : 1);
  const fixed = 80 + 30 + (info.partial ? 40 : 0) + info.notes.reduce((a, t) => a + Math.ceil(t.length / cpl), 0) * 19 + 30 + 40 + 6 * 14;
  const n = info.names.length, gap = n > 12 ? 6 : 10, fs = n > 12 ? 11 : 13;
  const now = new Date(), ds = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
  await Gorev.whenReady().catch(() => { });
  const done = gk => !!gk && Gorev.linked() && Gorev.durumOf(gk)?.durum === "kapali";
  // İSG açıklamaları: seçilen kapsama göre denetim bazlı bloklar (her blok kendi numarasıyla başlar)
  let DET = info.details;
  const sl = info.sess || [], sc = scope || "all";
  if (sl.length) {
    const want = sc === "all" ? sl : sl.filter(x => sc === "s:" + x.k || sc === "last:" + x.k);
    DET = info.details.flatMap(g => g.mod !== "İSG Denetim" ? [g] : want.map(w => ({ mod: g.mod, sub: w.label, items: g.items.flatMap(it => Object.values(it.by || {}).filter(b => info.wkOf(b) === w.k).map(b => ({ ...it, pics: b.pics, fx: b.fx, extra: "", done: done(b.gk), mon: "", bm: b.m, rs: b.rs, du: b.du }))) })).filter(x => x.items.length));
  }
  // Paylaşım bilgisi (sorumlu · termin): bölüm adı + ay ile eşleşen en yeni paylaşım
  const SH = trow || ttab ? await S.listShares(info.fid, info.year).catch(() => []) : [];
  const shOf = a => SH.find(x => +x.month === +a.bm + 1 && (x.depts || []).some(d => d.name === a.dept));
  const fdm = t => new Date(t + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long" }), todayIso = new Date().toISOString().slice(0, 10);
  // Sorumlu yalnızca denetim kaydında seçilen kişidir; paylaşılan kişiler otomatik sorumlu sayılmaz
  const whoOf = (sh, a) => a?.rs || "";
  const dueOf = (sh, a) => sh?.termin || a?.du || "";
  const takipRow = a => { if (!trow) return ""; const sh = shOf(a); return `<div style="margin-top:3px;font-size:11px;color:#546964;font-style:italic">Sorumlu: <b style="font-style:normal;color:#3E534E">${esc(whoOf(sh, a) || "-")}</b> · Termin: <b style="font-style:normal;color:#3E534E">${dueOf(sh, a) ? fdm(dueOf(sh, a)) : "-"}</b></div>`; };
  const takipAll = () => ttab ? DET.filter(g => g.mod === "İSG Denetim").flatMap(g => g.items) : [];
  // Takip tablosu: satır listesi verilirse yalnızca o satırlar (sayfalara bölünebilir); devam sayfasında başlık "(devam)"
  const takipTable = (list, cont = false) => { const rows = list || takipAll();
    if (!rows.length) return ""; const th = "padding:5px 6px;text-align:left;font-size:10.5px;font-weight:800;color:#3E534E;border-bottom:1.5px solid #D5E0DC", td = "padding:5px 6px;border-bottom:1px solid #E6EDEA;vertical-align:top;font-size:11px;line-height:1.4";
    return `<div style="border-top:1px solid #D5E0DC;padding-top:10px;display:flex;flex-direction:column;gap:5px"><div style="font-weight:800;font-size:12px;letter-spacing:.8px;color:#10201C;-webkit-text-stroke:.3px #10201C">BULGU TERMİN TAKİP TABLOSU${cont ? " (devam)" : ""}</div>
      <table style="border-collapse:collapse;width:100%"><tr><th style="${th}">Bölüm</th><th style="${th}">Bulgu</th><th style="${th}">Sorumlu</th><th style="${th}">Termin</th><th style="${th}">Durum</th></tr>${rows.map(a => { const sh = shOf(a), dn = !!a.fx, tm = dueOf(sh, a), lt = !dn && tm && tm < todayIso;
      return `<tr style="break-inside:avoid"><td style="${td};white-space:nowrap">${esc(a.dept)}</td><td style="${td}">${esc(a.cat && a.text.startsWith(a.cat + ": ") ? a.text.slice(a.cat.length + 2) : a.text)}</td><td style="${td}">${esc(whoOf(sh, a) || "-")}</td><td style="${td};white-space:nowrap">${tm ? fdm(tm) : "-"}</td><td style="${td};white-space:nowrap;font-weight:700;color:${dn ? "#0B6E4F" : "#B3261E"}">${dn ? "Aksiyon alındı" : lt ? "Gecikti" : "Açık"}</td></tr>`; }).join("")}</table></div>`; };
  const usePics = pics && DET.some(g => g.items.some(i => i.pics?.length || i.fx?.ph?.length)), PH = {};
  if (usePics) await Promise.all(DET.flatMap(g => g.items.flatMap(i => [...(i.pics || []), ...(i.fx?.ph || [])])).map(async p => { try { PH[p.id] = await S.getPhoto(info.fid, info.year, p.id); } catch { } }));
  const psz = file ? 227 : Math.round(227 / z); // 6 cm yükseklik
  const im = p => `<img src="${PH[p.id] || p.t}" alt="Fotoğraf" style="height:${psz}px;width:auto;max-width:100%;border-radius:6px;border:1px solid #C3D1CC">`;
  const fxD = at => { const d = new Date(at); return at ? `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}` : ""; };
  const col = (l, list, c) => `<div style="display:flex;flex-direction:column;gap:3px"><span style="font-size:10.5px;font-weight:800;letter-spacing:.6px;color:${c}">${l}</span><div style="display:flex;flex-wrap:wrap;gap:8px">${list.map(im).join("")}</div></div>`;
  // Aksiyon alındı: kişi adı yazılmaz; açıklama altında yeşil satır, resimlerde "aksiyon öncesi" ve yanında "aksiyon sonrası"
  const fxHtml = a => a.fx ? `<div style="display:flex;gap:8px;align-items:flex-start;margin-top:4px;padding:6px 10px;border-radius:6px;border-left:4px solid #0B6E4F;background:#EAF7F1"><span style="flex:0 0 16px;width:16px;height:16px;border-radius:4px;background:#0B6E4F;display:inline-flex;align-items:center;justify-content:center;margin-top:1px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l5 5L20 6"/></svg></span><span><b style="color:#0B6E4F">Aksiyon alındı</b>${a.fx.at ? ` <span style="color:#546964;white-space:nowrap">· ${fxD(a.fx.at)}</span>` : ""}<br>${esc(a.fx.tx)}</span></div>` : "";
  const picsHtml = a => takipRow(a) + fxHtml(a) + (usePics && a.fx && (a.pics?.length || a.fx.ph.length) ? `<div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:6px">${a.pics?.length ? col("AKSİYON ÖNCESİ", a.pics, "#B3261E") : ""}${a.fx.ph.length ? col("AKSİYON SONRASI", a.fx.ph, "#0B6E4F") : ""}</div>` : usePics && a.pics?.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">${a.pics.map(im).join("")}</div>` : "");
  const sh = document.createElement("div"); sh.id = "psheet";
  const FONT = "font-family:Manrope,system-ui,sans-serif;color:#10201C;display:flex;flex-direction:column;gap:14px;font-size:13px";
  const items = [];
  DET.forEach((g, gi) => g.items.forEach((a, i) => items.push({ gi, mod: g.mod, sub: g.sub, html: `<div data-brk style="display:flex;gap:8px;line-height:1.45;font-size:12px;break-inside:avoid"><span style="flex:0 0 20px;font-weight:800;color:#0B6E4F">${i + 1}.</span><span>${a.mon ? `<span style="color:#546964">${a.mon} · </span>` : ""}<b>${esc(a.dept)}</b> — ${a.cat && a.text.startsWith(a.cat + ": ") ? `<i style="color:#C4453A;font-weight:600">${esc(a.cat)}:</i> ${esc(a.text.slice(a.cat.length + 2))}` : esc(a.text)}${a.done ? ` <span style="color:#8A9A95;font-style:italic">(görev tamamlandı)</span>` : ""}${a.extra ? ` <span style="color:#546964">· ${esc(a.extra)}</span>` : ""}${picsHtml(a)}</span></div>` })));
  const group = list => { let out = "", cur = -1; list.forEach(e => { if (e.gi !== cur) { if (cur !== -1) out += "</div>"; cur = e.gi; out += `<div style="display:flex;flex-direction:column;gap:4px">${e.sub ? `<div style="font-weight:800;color:#145F96">${info.mk4 ? esc(e.mod) : "Açıklamalar"} <span style="font-weight:400;font-style:italic;color:#8A9A95">(${esc(e.sub)})</span></div>` : info.mk4 ? `<div style="font-weight:800;color:#145F96">${esc(e.mod)}</div>` : ""}`; } out += e.html; }); return out + (cur !== -1 ? "</div>" : ""); };
  const descBox = inner => `<div style="border-top:1px solid #D5E0DC;padding-top:10px;display:flex;flex-direction:column;gap:5px">${DET.some(g => g.sub) && !info.mk4 ? "" : `<div style="font-weight:800;font-size:12px;letter-spacing:.8px;color:#3E534E">AÇIKLAMA</div>`}${inner}</div>`;
  const NONE = `<div style="color:#546964">Bu dönem için girilmiş açıklama yok.</div>`;
  // Parçalar: head (her sayfada tekrarlanır), partial/chart/legend (yalnız 1. sayfa), foot (son sayfa)
  const parts = (ch, z) => { const s = (ch - 60) / 100;
    const eh = parseFloat(String(info.esik.h ?? "90").replace(",", ".")) || 90, eo = parseFloat(String(info.esik.o ?? "50").replace(",", ".")) || 50, ei = parseFloat(String(info.esik.i ?? "75").replace(",", ".")) || 75, GL = [...new Set([25, eo, ei, eh, 100])].sort((a, z) => a - z);
    const line = (v, l) => { const c = v === eh ? ["#0B6E4F", "rgba(11,110,79,.4)"] : v === eo ? ["#D6382E", "rgba(214,56,46,.4)"] : ["#6A7E79", "#D5DFDB"]; return `<div style="position:absolute;left:30px;right:0;bottom:${30 + v * s}px;border-top:1px solid ${c[1]}"></div><div style="position:absolute;left:0;bottom:${30 + v * s - 8}px;width:26px;text-align:right;font-size:11.5px;font-weight:700;color:${c[0]}">${l}</div>`; };
    const bars = info.names.map((nm, i) => { const x = info.vals[i], b = info.bandOf(x); return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:${ch}px">
      <div style="font-size:${fs + 1}px;font-weight:800;margin-bottom:4px;position:relative;z-index:2;-webkit-text-stroke:3px #fff;paint-order:stroke fill">${x === null ? (info.nullLabel ? `<span style="font-size:${fs - 2}px;font-weight:700;color:#6A7E79;-webkit-text-stroke:0">${esc(info.nullLabel)}</span>` : "–") : f1(x)}</div>
      <div style="width:42%;max-width:36px;height:${x === null ? 3 : Math.max(3, Math.round(x * s))}px;background:${b.fill};border-radius:7px 7px 2px 2px"></div>
      <div style="height:30px;line-height:30px;font-size:${fs - 0.5}px;font-weight:600;color:#3E534E;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis">${esc(nm)}</div></div>`; }).join("");
    return {
      head: `<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0B2230;padding-bottom:10px;gap:16px">
      <div><div style="font:700 11px Manrope;letter-spacing:1px;color:#546964">${esc(info.fname)}</div><div style="font:700 22px Sora,sans-serif;margin-top:4px">${esc(info.title)}</div><div style="color:#546964;margin-top:2px;display:flex;gap:28px;white-space:nowrap"><span>${esc(info.plabel)}</span><span>Oluşturma tarihi: ${ds}</span></div></div>
      <div style="display:flex;align-items:center;gap:10px;white-space:nowrap"><span style="color:#546964">Tesis ortalaması</span><b style="font:700 26px Sora,sans-serif">${info.av === null ? "–" : f1(info.av)}</b><span style="font-size:12px;font-weight:800;padding:4px 12px;border-radius:999px;background:${info.ab.bg};color:${info.ab.c}">${esc(info.abn)}</span></div></div>`,
      first: `${info.partial ? `<div style="padding:8px 12px;border-radius:8px;background:#FBE9C6;color:#5A3300;font-weight:600">${esc(info.partial)}</div>` : ""}
    <div style="position:relative;height:${ch}px"><div style="position:absolute;inset:0">${GL.map(v => line(v, v)).join("")}</div><div style="position:absolute;left:30px;right:0;top:0;bottom:0;display:flex;gap:${gap}px">${bars}</div></div>
    <div style="display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:#546964">${[["Mükemmel", `≥ ${num(info.esik.m)}`], ["İyi", `${num(info.esik.i)}-${num(info.esik.m) - 1}`], ["Orta", `${num(info.esik.o)}-${num(info.esik.i) - 1}`], ["Kritik", `< ${num(info.esik.o)}`]].map(([k, r]) => `<span style="display:flex;align-items:center;gap:6px"><span style="width:11px;height:11px;border-radius:3px;background:${BAND[k].fill}"></span>${k} ${r}</span>`).join("")}</div>`,
      foot: takipTable() }; };
  const wrap = (inner, z, extra = "", pg = "") => `<div class="ppg" style="width:${cw}px;zoom:${z};${extra}${FONT}">${inner}${pg ? `<div style="position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:11px;color:#6A7E79">${pg}</div>` : ""}</div>`;
  // Tek sayfa düzeni
  const PGH = Hh - 2 * M - 6, avail = PGH - 24; // alttaki 24 px sayfa numarasına ayrılır
  const FIX = `height:${PGH}px;overflow:hidden;box-sizing:border-box;position:relative;`;
  const build = (ch, z, fin) => { const p = parts(ch); return wrap(p.head + p.first + descBox(items.length ? group(items) : NONE) + p.foot, z, fin ? FIX : "", fin ? "Sayfa 1/1" : ""); };
  // Çok sayfalı düzen: her sayfada üst bilgi; devam sayfalarında "AÇIKLAMA" başlığı, madde numaraları kesintisiz
  const paginate = async () => {
    const pc = land ? 260 : 420, p = parts(pc);
    sh.style.cssText = `display:block;position:fixed;left:-99999px;top:0;visibility:hidden;width:${cw}px`;
    sh.innerHTML = `<div style="${FONT.replace("display:flex;flex-direction:column;gap:14px;", "")};width:${cw}px">${items.map(e => e.html).join("")}</div>`;
    await Promise.all([...sh.querySelectorAll("img")].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
    const hs = [...sh.firstElementChild.children].map(c => c.offsetHeight);
    const ph = items.map((e, i) => ({ gi: e.gi, mod: e.mod, html: `<div style="height:${hs[i]}px"></div>` }));
    const fitsF = (idx, first, foot) => { const list = idx.map(i => ph[i]);
      sh.innerHTML = wrap(p.head + (first ? p.first : "") + (list.length ? descBox(group(list)) : first && !items.length ? descBox(NONE) : "") + foot, 1);
      return sh.firstElementChild.offsetHeight <= avail; };
    const pages = []; let cur = [];
    for (let i = 0; i < items.length; i++) {
      if (fitsF([...cur, i], !pages.length, "")) cur.push(i);
      else if (!cur.length && pages.length) cur.push(i);
      else { pages.push(cur); cur = [i]; }
    }
    pages.push(cur);
    // Takip tablosu: son açıklama sayfasında sığdığı kadar satır, kalanı devam sayfalarında (tablo kesilmez, boş sayfa bırakılmaz)
    let rest = takipAll(), lastFoot = "", k = rest.length; const chunks = [];
    while (k > 0 && !fitsF(cur, pages.length === 1, takipTable(rest.slice(0, k)))) k--;
    if (k) { lastFoot = takipTable(rest.slice(0, k)); rest = rest.slice(k); }
    while (rest.length) { let n = rest.length; while (n > 1 && !fitsF([], false, takipTable(rest.slice(0, n), true))) n--; chunks.push(rest.slice(0, n)); rest = rest.slice(n); }
    const total = pages.length + chunks.length;
    return (z, fixed) => pages.map((idx, n) => { const list = idx.map(i => items[i]), first = n === 0, last = n === pages.length - 1;
      return wrap(p.head + (first ? p.first : "") + (list.length ? descBox(group(list)) : first && !items.length ? descBox(NONE) : "") + (last ? lastFoot : ""), z, FIX + (fixed && (n < total - 1) ? "break-after:page;" : ""), `Sayfa ${n + 1}/${total}`); }).join("")
      + chunks.map((rs, n) => wrap(p.head + takipTable(rs, true), z, FIX + (fixed && n < chunks.length - 1 ? "break-after:page;" : ""), `Sayfa ${pages.length + n + 1}/${total}`)).join("");
  };
  const stl = document.createElement("style"); stl.id = "pstyle";
  stl.textContent = `#psheet{display:none}@media print{@page{size:${size} ${orient};margin:${M * 0.2646}mm}html,body{background:#fff!important;margin:0!important;padding:0!important}body>*:not(#psheet){display:none!important}#psheet{display:block!important;width:${cw * z}px;-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
  document.head.appendChild(stl); document.body.appendChild(sh);
  // Gerçek yüksekliği ölç, tek sayfaya sığana kadar grafiği küçült; sığmazsa çok sayfalı düzen
  const base = land ? 300 : 520; let c = base, single = false;
  sh.style.cssText = "display:block;position:fixed;left:-99999px;top:0;visibility:hidden";
  if (!usePics) for (; c >= 140; c -= 15) { sh.innerHTML = build(c, 1); if (sh.firstElementChild.offsetHeight <= avail) { single = true; break; } }
  const clean = () => { sh.remove(); stl.remove(); window.removeEventListener("afterprint", clean); };
  const fit = single ? c : base, ttl = fileTitle(info.title, info.plabel, size);
  const pages = single ? null : await paginate();
  if (file) {
    // İstenirse yazdırmadan doğrudan PDF dosyası olarak indir
    try {
      sh.innerHTML = single ? build(fit, 1, true) : pages(1, false);
      sh.style.cssText = `display:block;position:fixed;left:-99999px;top:0;background:#fff;width:${cw}px`;
      const el = single ? sh.firstElementChild : sh, top0 = el.getBoundingClientRect().top;
      const breaks = (single ? [...el.querySelectorAll("[data-brk]")] : [...sh.children]).map(x => x.getBoundingClientRect().top - top0).filter(t => t > 0);
      await savePdf(el, { size, orient, name: ttl + ".pdf", margin: M * 0.75 * z, scale: size === "A3" ? 3 : 2.5, single, breaks });
      clean(); return;
    } catch (e) { console.warn("PDF üretilemedi, yazdırmaya dönülüyor", e); }
  }
  sh.innerHTML = single ? build(fit, z, true) : pages(z, true); sh.style.cssText = "";
  window.addEventListener("afterprint", clean);
  setTimeout(() => withTitle(ttl, () => window.print()), 150);
}

export function downloadCsv(name, rows) {
  const cell = x => { const t = x === null || x === undefined ? "" : typeof x === "number" ? String(Math.round(x * 10) / 10).replace(".", ",") : String(x); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const blob = new Blob(["\ufeff" + rows.map(r => r.map(cell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name.replace(/[ğĞüÜşŞıİöÖçÇ]/g, c => ({ ğ: "g", Ğ: "G", ü: "u", Ü: "U", ş: "s", Ş: "S", ı: "i", İ: "I", ö: "o", Ö: "O", ç: "c", Ç: "C" }[c])); document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
