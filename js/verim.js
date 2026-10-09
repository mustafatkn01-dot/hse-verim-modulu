// Verim Tablosu · gerçek verilerden dönem / gösterge bazlı özet
import * as S from "./store.js?v=20261009r";
import { esc } from "./ui.js?v=20261009r";
import { bandOf, DEFAULT_PARAMS, num } from "./scoring.js?v=20261009r";
import { CATS } from "./isgcats.js?v=20261009r";

const BAND = {
  Mükemmel: { fill: "#17A06F", c: "#0B6E4F", bg: "#D9F1E6" }, İyi: { fill: "#2A82C4", c: "#145F96", bg: "#DCEAF7" },
  Orta: { fill: "#E8A512", c: "#6B3F00", bg: "#FBE9C6" }, Kritik: { fill: "#D6382E", c: "#B3261E", bg: "#FADAD7" }
};
const NONE = { fill: "#D5E0DC", c: "#6A7E79", bg: "#EEF2F0" };
const MS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const MET = [["İş Kazası", "Kaza"], ["Eğitim Konuşması", "Eğitim K."], ["İşbaşı Eğitim", "İşbaşı"], ["İSG Denetim", "İSG"], ["Toplam Verim", "Toplam"]];
const rng = (a, z) => Array.from({ length: z - a + 1 }, (_, i) => a + i);
const f1 = n => n.toFixed(1).replace(".", ",");
const pad = n => String(n).padStart(2, "0");
const avg = (arr, idx) => { const v = idx.map(i => arr[i]).filter(x => x !== null && x !== undefined); return v.length ? v.reduce((a, c) => a + c, 0) / v.length : null; };
const V = { p: "m", sel: null, metric: 4, key: "", data: null };

export async function load(st, setup) {
  const rows = setup.rows, out = {};
  rows.forEach(r => { out[r.id] = Array.from({ length: 12 }, () => [null, null, null, null]); });
  const [kz, kn, ib, ig] = await Promise.all(["kaza", "konusma", "isbasi", "isg"].map(c => S.listMonthDocs(st.fid, st.year, c)));
  const num0 = x => (typeof x === "number" && isFinite(x) ? x : null);
  const put = (docs, k, pick) => docs.forEach(d => {
    const m = parseInt(String(d.id).slice(0, 2), 10) - 1; if (!(m >= 0 && m < 12) || !d.result) return;
    if (k === 3) { const id = String(d.id).slice(3); if (out[id]) out[id][m][3] = num0(d.result.score); return; }
    rows.forEach(r => { const x = d.result.per?.[r.id]; if (x) out[r.id][m][k] = num0(pick(x)); });
  });
  put(kz, 0, x => x.verim); put(kn, 1, x => x.pct); put(ib, 2, x => (x.state === "ok" ? x.verim : null)); put(ig, 3);
  // Kullanıcının girdiği açıklamalar (bölüm · ay · modül)
  const p = setup.params || DEFAULT_PARAMS, notes = [], mOf = d => parseInt(String(d.id).slice(0, 2), 10) - 1, low = x => x !== null && ["Orta", "Kritik"].includes(bandOf(x, p));
  const nt = (d, id) => String(d.rows?.[id]?.note || "").trim();
  kz.forEach(d => rows.forEach(r => { const x = d.result?.per?.[r.id], t = nt(d, r.id); if (x?.count > 0 && t) notes.push({ m: mOf(d), k: 0, id: r.id, t, x: `${x.count} olay` }); }));
  kn.forEach(d => rows.forEach(r => { const x = num0(d.result?.per?.[r.id]?.pct), t = nt(d, r.id); if (low(x) && t) notes.push({ m: mOf(d), k: 1, id: r.id, t, x: `verim ${f1(x)}` }); }));
  ib.forEach(d => rows.forEach(r => { const x = d.result?.per?.[r.id], t = nt(d, r.id); if (x?.state === "ok" && x.verim < 99.995 && t) notes.push({ m: mOf(d), k: 2, id: r.id, t, x: `verim ${f1(x.verim)}` }); }));
  ig.forEach(d => { const id = String(d.id).slice(3); if (!out[id] || !d.sessions?.length) return; const items = {};
    d.sessions.forEach(se => Object.entries(se.fails || {}).forEach(([key, arr]) => { (items[key] ||= { n: new Set(), c: 0 }).c++; (arr || []).forEach(t => items[key].n.add(t)); }));
    Object.entries(items).forEach(([key, o]) => { const mm = /^c(\d+)i(\d+)$/.exec(key); if (!mm) return; const c = CATS[+mm[1]]; if (!c) return;
      notes.push({ m: mOf(d), k: 3, id, t: `${c.name}: ${o.n.size ? [...o.n].join("; ") : c.items[+mm[2]]}`, x: `${o.c} denetimde uygunsuz` }); }); });
  out._n = notes;
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
    m: { t: "Aylık", items: MS.map((n, i) => ({ t: n, idx: [i] })), name: i => MS[i] + " " + y, title: "AY SEÇİN" },
    q: { t: "3 Aylık (Ç1)", items: [{ t: "Ç1", idx: rng(0, 2) }], name: () => "1. çeyrek · Ocak-Mart " + y, title: "" },
    h: { t: "6 Aylık (Ç2)", items: [{ t: "Ç2", idx: rng(0, 5) }], name: () => "2. çeyrek · Ocak-Haziran " + y + " (kümülatif)", title: "" },
    n: { t: "9 Aylık (Ç3)", items: [{ t: "Ç3", idx: rng(0, 8) }], name: () => "3. çeyrek · Ocak-Eylül " + y + " (kümülatif)", title: "" },
    y: { t: "Yıllık", items: [{ t: String(y), idx: rng(0, 11) }], name: () => y + " yılı", title: "" }
  };
  const defSel = { m: Math.max(0, lastM), q: 0, h: 0, n: 0, y: 0 };
  if (V.sel === null || V.sel >= PER[V.p].items.length) V.sel = defSel[V.p];
  const cur = PER[V.p].items[V.sel], have = cur.idx.filter(i => hasM[i]).length, partial = have > 0 && have < cur.idx.length;
  const mk = V.metric, val = (id, k) => avg(series(id, k), cur.idx);
  const seg = on => (on ? "background:#0B2230;color:#fff;border-color:#0B2230" : "background:var(--card);color:var(--text);border-color:var(--inl)");
  const vals = rows.map(r => val(r.id, mk)), ok = vals.filter(x => x !== null);
  const av = ok.length ? ok.reduce((a, c) => a + c, 0) / ok.length : null, ab = band(av);
  const cell = x => (x === null ? { t: "–", bg: NONE.bg, c: NONE.c } : { t: f1(x), bg: band(x).bg, c: band(x).c });
  const t0 = 30, H = 2.4;

  const bars = rows.map((r, i) => { const x = vals[i]; return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:330px">
    <div style="font-size:14px;font-weight:800;margin-bottom:4px">${x === null ? "–" : f1(x)}</div>
    <div style="width:70%;max-width:64px;height:${x === null ? 3 : Math.round(x * H)}px;background:${band(x).fill};border-radius:8px 8px 2px 2px"></div>
    <div style="height:30px;line-height:30px;font-size:12.5px;font-weight:600;color:var(--muted);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</div></div>`; }).join("");

  const e1 = vals.map((x, i) => [x, i]).filter(x => x[0] !== null).sort((a, z) => z[0] - a[0]), notes = [];
  if (e1.length) {
    const top = e1[0], low = e1[e1.length - 1], nm = i => rows[i].name;
    notes.push(`${PER[V.p].name(V.sel)} için ${MET[mk][0]} ortalaması ${f1(av)} (${bname(av)}).`);
    notes.push(`En yüksek: ${nm(top[1])} (${f1(top[0])}); en düşük: ${nm(low[1])} (${f1(low[0])}).`);
    const lo = e1.filter(x => bandOf(x[0], p) === "Kritik").map(x => nm(x[1])), mid = e1.filter(x => bandOf(x[0], p) === "Orta").map(x => nm(x[1]));
    if (lo.length) notes.push(`Kritik seviyede: ${lo.join(", ")}. Öncelikli aksiyon gerekir.`);
    if (mid.length) notes.push(`Orta seviyede: ${mid.join(", ")}.`);
    if (!lo.length && !mid.length) notes.push(`Tüm bölümler "İyi" veya üzerinde.`);
    if (V.p === "m" && V.sel > 0) { const pv = avg(rows.map(r => series(r.id, mk)[V.sel - 1]), rng(0, rows.length - 1)); if (pv !== null) notes.push(`Bir önceki aya göre ${av >= pv ? "artış" : "düşüş"}: ${f1(Math.abs(av - pv)).replace(",", ",")} puan.`); }
  }
  const nonEmpty = rows.some(r => V.data[r.id].some(m => m.some(x => x !== null)));

  const heads = [], mr = rows.map(() => []);
  const addCol = (label, idx, flex, kind, pp, i) => {
    const on = V.p === pp && V.sel === i, bg = on ? "#0B2230" : kind === "y" ? "#D9F1E6" : kind === "n" || kind === "h" ? "#DCEAF7" : kind === "q" ? "#EEF3F1" : "#F6FAF8";
    heads.push(`<button data-go="${pp}:${i}" aria-pressed="${on}" style="flex:${flex};min-width:0;height:38px;border-radius:8px;border:1px solid ${on ? "#0B2230" : "#D5E0DC"};background:${bg};color:${on ? "#fff" : "#2A3F3A"};font:inherit;font-size:12px;font-weight:800;padding:0 2px">${label}</button>`);
    rows.forEach((r, b) => { const c = cell(avg(series(r.id, mk), idx)); mr[b].push(`<div style="flex:${flex};min-width:0;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;background:${c.bg};color:${c.c}">${c.t}</div>`); });
  };
  MS.forEach((n, i) => addCol(n, [i], 1, "m", "m", i));
  addCol("3 Ay (Ç1)", rng(0, 2), 1.4, "q", "q", 0);
  addCol("6 Ay (Ç2)", rng(0, 5), 1.4, "h", "h", 0);
  addCol("9 Ay (Ç3)", rng(0, 8), 1.4, "n", "n", 0);
  addCol("Yıllık", rng(0, 11), 1.4, "y", "y", 0);

  const gc = "100px repeat(5,1fr) 110px";
  const line = (v0, lab) => `<div style="position:absolute;left:34px;right:0;bottom:${t0 + v0 * H}px;border-top:1px dashed #B5C5BF"></div><div style="position:absolute;left:0;bottom:${t0 + v0 * H - 7}px;font-size:11px;color:var(--muted)">${lab}</div>`;
  V.v.innerHTML = `
  <div class="col1" style="gap:6px"><h1 class="ttl">Verim Tablosu</h1>
    <div class="sub">Aylık, çeyreklik (3-6-9 aylık, kümülatif) ve yıllık verimi sütun grafik ve tablo olarak görün. Dönemi ve göstergeyi seçin, grafik ile tablo birlikte güncellenir. Veriler aylık giriş sayfalarında kaydedilen sonuçlardan gelir.</div></div>
  ${nonEmpty ? "" : `<div class="warn">${y} yılı için henüz kayıtlı veri yok. Aylık giriş sayfalarından veri kaydedildikçe tablo dolar.</div>`}
  <div class="cd" style="padding:18px 20px;gap:14px">
    <div class="row" style="gap:20px 28px;align-items:flex-start">
      <div class="col1" style="gap:8px"><span class="hd">DÖNEM</span><div class="row" style="gap:8px">${["m", "q", "h", "n", "y"].map(k => `<button data-p="${k}" aria-pressed="${V.p === k}" style="height:44px;padding:0 18px;border-radius:12px;border:1px solid;font-weight:700;${seg(V.p === k)}">${PER[k].t}</button>`).join("")}</div></div>
      <div class="col1" style="gap:8px"><span class="hd">GÖSTERGE</span><div class="row" style="gap:8px">${MET.map((m, k) => `<button data-m="${k}" aria-pressed="${mk === k}" style="height:44px;padding:0 16px;border-radius:12px;border:1px solid;font-weight:700;${seg(mk === k)}">${m[0]}</button>`).join("")}</div></div></div>
    ${V.p === "m" ? `<div class="col1" style="gap:8px"><span class="hd">${PER[V.p].title}</span><div class="row" style="gap:8px">${PER[V.p].items.map((it, i) => `<button data-s="${i}" aria-pressed="${V.sel === i}" style="min-width:56px;height:40px;padding:0 14px;border-radius:10px;border:1px solid;font-weight:700;${seg(V.sel === i)};opacity:${V.p === "m" && !hasM[i] ? .45 : 1}">${it.t}</button>`).join("")}</div></div>` : ""}</div>
  <div class="cd">
    <div class="row sp"><div><h2>${MET[mk][0]} · Bölüm Karşılaştırması</h2><div class="muted" style="font-size:13px;margin-top:4px">${PER[V.p].name(V.sel)}</div></div>
      <div class="row" style="gap:10px;flex-wrap:nowrap"><span class="muted" style="font-size:13px">Tesis ortalaması</span><b style="font:700 22px Sora,sans-serif">${av === null ? "–" : f1(av)}</b><span class="pill" style="background:${ab.bg};color:${ab.c}">${bname(av)}</span>
        <button data-pdf class="sec" style="height:40px;padding:0 16px;border-radius:10px;font-weight:700;white-space:nowrap">PDF indir</button></div></div>
    ${partial ? `<div class="warn">Kısmi dönem: ${cur.idx.length} aydan ${have} tanesi için veri var. Değerler mevcut aylar üzerinden hesaplandı.</div>` : ""}
    <div style="overflow-x:auto"><div style="min-width:${Math.max(260, rows.length * 70 + 40)}px;position:relative;height:330px">
      ${line(50, 50)}${line(75, 75)}${line(90, 90)}
      <div style="position:absolute;left:34px;right:0;top:0;bottom:0;display:flex;gap:10px">${bars}</div></div></div>
    <div class="row" style="gap:14px;font-size:12.5px;color:var(--muted)">${[["Mükemmel", "≥ 90"], ["İyi", "75-89"], ["Orta", "50-74"], ["Kritik", "< 50"]].map(([n, r]) => `<span class="row" style="gap:6px;flex-wrap:nowrap"><span style="width:12px;height:12px;border-radius:3px;background:${BAND[n].fill}"></span>${n} ${r}</span>`).join("")}</div>
    ${notes.length ? `<div style="border-top:1px solid var(--line);padding-top:16px;display:flex;flex-direction:column;gap:8px"><div style="font-weight:800;font-size:13px;letter-spacing:.8px;color:var(--muted)">AÇIKLAMA</div>${notes.map((t, i) => `<div style="display:flex;gap:10px;line-height:1.55"><span style="flex:0 0 22px;font-weight:800;color:#0B6E4F">${i + 1}.</span><span>${esc(t)}</span></div>`).join("")}</div>` : ""}
    <div data-detslot></div></div>
  <div class="cd" style="gap:14px">
    <div class="row sp"><h2>Tablo · ${PER[V.p].name(V.sel)}</h2><div class="muted" style="font-size:13px">Modül verimleri ve toplam verim</div></div>
    <div style="overflow-x:auto"><div style="min-width:700px;display:flex;flex-direction:column;gap:6px">
      <div style="display:grid;grid-template-columns:${gc};gap:6px"><span class="hd">Bölüm</span>${MET.map((m, k) => `<span style="font-size:12px;font-weight:800;padding:6px 8px;border-radius:8px;text-align:center;background:${mk === k ? "#0B2230" : "#EEF3F1"};color:${mk === k ? "#fff" : "#3E534E"}">${m[1]}</span>`).join("")}<span class="hd" style="text-align:center">Durum</span></div>
      ${rows.map(r => { const tv = val(r.id, 4), sb = band(tv); return `<div style="display:grid;grid-template-columns:${gc};gap:6px;align-items:center"><span style="font-weight:700;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</span>
        ${[0, 1, 2, 3, 4].map(k => { const c = cell(val(r.id, k)); return `<span style="height:38px;display:flex;align-items:center;justify-content:center;border-radius:9px;font-weight:800;background:${c.bg};color:${c.c}">${c.t}</span>`; }).join("")}
        <span style="text-align:center;font-size:12px;font-weight:800;padding:6px 0;border-radius:999px;background:${sb.bg};color:${sb.c}">${bname(tv)}</span></div>`; }).join("")}
      <div style="display:grid;grid-template-columns:${gc};gap:6px;align-items:center;border-top:2px solid var(--line);padding-top:8px;margin-top:2px"><span style="font-weight:800">Tesis</span>
        ${[0, 1, 2, 3, 4].map(k => { const a = rows.map(r => val(r.id, k)).filter(x => x !== null); return `<span style="height:38px;display:flex;align-items:center;justify-content:center;border-radius:9px;font-weight:800;background:#0B2230;color:#fff">${a.length ? f1(a.reduce((s, c) => s + c, 0) / a.length) : "–"}</span>`; }).join("")}<span></span></div></div></div></div>
  <div class="cd" style="gap:14px">
    <div class="row sp"><h2>Tüm Dönemler · ${MET[mk][0]}</h2><div class="muted" style="font-size:13px">Dönem başlığına tıklayarak yukarıdaki grafiği o döneme getirin.</div></div>
    <div style="overflow-x:auto"><div style="min-width:1260px;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;gap:6px;align-items:flex-end"><div style="width:96px;flex:0 0 96px"></div>${heads.join("")}</div>
      ${rows.map((r, b) => `<div style="display:flex;gap:6px;align-items:center"><div style="width:96px;flex:0 0 96px;font-weight:700;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</div>${mr[b].join("")}</div>`).join("")}</div></div>
    <div class="muted" style="font-size:12.5px;line-height:1.6">Veri girilmeyen aylar "–" gösterir. Eksik aylı dönemler mevcut aylar üzerinden hesaplanır ve "kısmi" olarak işaretlenir. Bir bölümde değerlendirilen modül yoksa (örn. işe giriş yok) toplam verimde ağırlıklar kalan modüllere yeniden dağıtılır (ağırlıklar: İş Kazası ${W[0]}, Konuşma ${W[1]}, İşbaşı ${W[2]}, İSG ${W[3]}).</div></div>`;
  const rowIx = Object.fromEntries(rows.map((r, i) => [r.id, i])), MODN = ["İş Kazası", "Eğitim Konuşması", "İşbaşı Eğitim", "İSG Denetim"];
  const sel = (V.data._n || []).filter(n => (mk === 4 || n.k === mk) && cur.idx.includes(n.m) && rowIx[n.id] !== undefined).sort((a, b) => a.k - b.k || rowIx[a.id] - rowIx[b.id] || a.m - b.m);
  const details = [0, 1, 2, 3].map(k => ({ mod: MODN[k], items: sel.filter(n => n.k === k).map(n => ({ dept: rows[rowIx[n.id]].name, text: n.t, extra: n.x, mon: cur.idx.length > 1 ? MS[n.m] : "" })) })).filter(g => g.items.length);
  const detHtml = `<div style="border-top:1px solid var(--line);padding-top:16px;display:flex;flex-direction:column;gap:12px"><div style="font-weight:800;font-size:13px;letter-spacing:.8px;color:var(--muted)">BÖLÜM AÇIKLAMALARI <span style="font-weight:600;letter-spacing:0">· denetim ve eğitim kayıtlarında yazılanlar</span></div>
    ${details.length ? details.map(g => `<div class="col1" style="gap:6px">${mk === 4 ? `<div style="font-weight:800;color:#145F96">${g.mod}</div>` : ""}${g.items.map((a, i) => `<div style="display:flex;gap:10px;line-height:1.55"><span style="flex:0 0 22px;font-weight:800;color:#0B6E4F">${i + 1}.</span><span>${a.mon ? `<span class="muted">${a.mon} · </span>` : ""}<b>${esc(a.dept)}</b> — ${esc(a.text)} <span class="muted" style="white-space:nowrap">· ${esc(a.extra)}</span></span></div>`).join("")}</div>`).join("") : `<div class="muted">Bu dönem için girilmiş açıklama yok.</div>`}</div>`;
  const info = { details, mk4: mk === 4, fname: st.factories.find(f => f.id === st.fid)?.name || "", title: `${MET[mk][0]} · Bölüm Karşılaştırması`, plabel: PER[V.p].name(V.sel), av, abn: bname(av), ab, names: rows.map(r => r.name), vals, bandOf: x => (x === null ? NONE : band(x)), notes, partial: partial ? `Kısmi dönem: ${cur.idx.length} aydan ${have} tanesi için veri var. Değerler mevcut aylar üzerinden hesaplandı.` : "", esik: p.esik };
  V.v.querySelector("[data-detslot]").innerHTML = detHtml;
  V.v.querySelector("[data-pdf]").onclick = () => pdfDialog(info);
  const rd = () => draw();
  V.v.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { V.p = b.dataset.p; V.sel = null; rd(); });
  V.v.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { V.metric = +b.dataset.m; rd(); });
  V.v.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { V.sel = +b.dataset.s; rd(); });
  V.v.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { const [a, i] = b.dataset.go.split(":"); V.p = a; V.sel = +i; rd(); scrollTo({ top: 0, behavior: "smooth" }); });
}

// ---- Tek sayfalık grafik + açıklama PDF'i (A4/A3, dikey/yatay) ----
function pdfDialog(info) {
  const n = info.names.length;
  const o = { size: "A4", orient: n > 7 ? "landscape" : "portrait" };
  const m = document.createElement("div"); m.className = "mod";
  const seg = (k, items) => items.map(([v, t]) => `<button class="sec" data-k="${k}" data-v="${v}" style="flex:1;height:44px;border-radius:10px;font-weight:700">${t}</button>`).join("");
  m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" style="gap:16px"><h2>PDF indir</h2>
    <div class="muted" style="line-height:1.5">${esc(info.title)} · ${esc(info.plabel)}. Tek sayfalık grafik ve açıklamalar; yöneticinize göndermek için hazırlanır.</div>
    <div class="col1" style="gap:8px"><span class="hd">KÂĞIT BOYUTU</span><div class="row" style="gap:8px;flex-wrap:nowrap">${seg("size", [["A4", "A4"], ["A3", "A3"]])}</div></div>
    <div class="col1" style="gap:8px"><span class="hd">SAYFA DÜZENİ</span><div class="row" style="gap:8px;flex-wrap:nowrap">${seg("orient", [["portrait", "Dikey"], ["landscape", "Yatay"]])}</div>
      <span class="muted" style="font-size:12.5px">${n > 7 ? `${n} bölüm olduğu için yatay düzen önerilir.` : "Az sayıda bölümde dikey düzen yeterlidir."}</span></div>
    <div class="muted" style="font-size:12.5px;line-height:1.5">Açılan yazdırma penceresinde hedef olarak "PDF olarak kaydet" seçin. Ölçek "Varsayılan", kenar boşlukları "Varsayılan" kalsın.</div>
    <div class="row" style="justify-content:flex-end"><button class="sec" data-no>İptal</button><button data-yes>PDF oluştur</button></div></div>`;
  document.body.appendChild(m);
  const paint = () => m.querySelectorAll("[data-k]").forEach(b => { const on = o[b.dataset.k] === b.dataset.v; b.style.background = on ? "#0B2230" : ""; b.style.color = on ? "#fff" : ""; b.setAttribute("aria-pressed", on); });
  m.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { o[b.dataset.k] = b.dataset.v; paint(); });
  paint();
  m.querySelector("[data-no]").onclick = () => m.remove();
  m.addEventListener("mousedown", e => { if (e.target === m) m.remove(); });
  m.querySelector("[data-yes]").onclick = () => { m.remove(); printSheet(info, o); };
}

function printSheet(info, { size, orient }) {
  // Tasarım A4 ölçüsünde (96 dpi) yapılır; A3 için √2 büyütülür.
  const land = orient === "landscape", W = land ? 1123 : 794, Hh = land ? 794 : 1123, M = 38, z = size === "A3" ? 1.4142 : 1;
  const cw = W - 2 * M, cpl = Math.floor(cw / 6.3);
  const lines = it => Math.ceil((it.dept.length + it.text.length + it.extra.length + 12) / cpl);
  const dl = info.details.reduce((a, g) => a + (info.mk4 ? 1 : 0) + g.items.reduce((b, it) => b + lines(it), 0), 0) + (info.details.length ? 0 : 1);
  const fixed = 80 + 30 + (info.partial ? 40 : 0) + info.notes.reduce((a, t) => a + Math.ceil(t.length / cpl), 0) * 19 + 30 + 40 + 6 * 14;
  const ch = land ? 300 : 520;
  const n = info.names.length, gap = n > 12 ? 6 : 10, fs = n > 12 ? 11 : 13;
  const now = new Date(), ds = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
  const sh = document.createElement("div"); sh.id = "psheet";
  const build = (ch, z) => { const s = (ch - 60) / 100;
    const line = (v, l) => `<div style="position:absolute;left:30px;right:0;bottom:${30 + v * s}px;border-top:1px dashed #B5C5BF"></div><div style="position:absolute;left:0;bottom:${30 + v * s - 7}px;font-size:11px;color:#6A7E79">${l}</div>`;
    const bars = info.names.map((nm, i) => { const x = info.vals[i], b = info.bandOf(x); return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:${ch}px">
      <div style="font-size:${fs + 1}px;font-weight:800;margin-bottom:4px">${x === null ? "–" : f1(x)}</div>
      <div style="width:70%;max-width:56px;height:${x === null ? 3 : Math.max(3, Math.round(x * s))}px;background:${b.fill};border-radius:7px 7px 2px 2px"></div>
      <div style="height:30px;line-height:30px;font-size:${fs - 0.5}px;font-weight:600;color:#3E534E;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis">${esc(nm)}</div></div>`; }).join("");
    return `<div style="width:${cw}px;zoom:${z};font-family:Manrope,system-ui,sans-serif;color:#10201C;display:flex;flex-direction:column;gap:14px;font-size:13px">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0B2230;padding-bottom:10px;gap:16px">
      <div><div style="font:700 11px Manrope;letter-spacing:1px;color:#546964">HSE VERİM MODÜLÜ · ${esc(info.fname)}</div><div style="font:700 22px Sora,sans-serif;margin-top:4px">${esc(info.title)}</div><div style="color:#546964;margin-top:2px">${esc(info.plabel)}</div></div>
      <div style="display:flex;align-items:center;gap:10px;white-space:nowrap"><span style="color:#546964">Tesis ortalaması</span><b style="font:700 26px Sora,sans-serif">${info.av === null ? "–" : f1(info.av)}</b><span style="font-size:12px;font-weight:800;padding:4px 12px;border-radius:999px;background:${info.ab.bg};color:${info.ab.c}">${esc(info.abn)}</span></div></div>
    ${info.partial ? `<div style="padding:8px 12px;border-radius:8px;background:#FBE9C6;color:#5A3300;font-weight:600">${esc(info.partial)}</div>` : ""}
    <div style="position:relative;height:${ch}px"><div style="position:absolute;inset:0">${line(50, 50)}${line(75, 75)}${line(90, 90)}</div><div style="position:absolute;left:30px;right:0;top:0;bottom:0;display:flex;gap:${gap}px">${bars}</div></div>
    <div style="display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:#546964">${[["Mükemmel", `≥ ${num(info.esik.m)}`], ["İyi", `${num(info.esik.i)}-${num(info.esik.m) - 1}`], ["Orta", `${num(info.esik.o)}-${num(info.esik.i) - 1}`], ["Kritik", `< ${num(info.esik.o)}`]].map(([k, r]) => `<span style="display:flex;align-items:center;gap:6px"><span style="width:11px;height:11px;border-radius:3px;background:${BAND[k].fill}"></span>${k} ${r}</span>`).join("")}</div>
    <div style="border-top:1px solid #D5E0DC;padding-top:10px;display:flex;flex-direction:column;gap:5px"><div style="font-weight:800;font-size:12px;letter-spacing:.8px;color:#3E534E">AÇIKLAMA</div>
      ${info.details.length ? info.details.map(g => `<div style="display:flex;flex-direction:column;gap:4px">${info.mk4 ? `<div style="font-weight:800;color:#145F96">${esc(g.mod)}</div>` : ""}${g.items.map((a, i) => `<div style="display:flex;gap:8px;line-height:1.45;font-size:12px"><span style="flex:0 0 20px;font-weight:800;color:#0B6E4F">${i + 1}.</span><span>${a.mon ? `<span style="color:#546964">${a.mon} · </span>` : ""}<b>${esc(a.dept)}</b> — ${esc(a.text)} <span style="color:#546964">· ${esc(a.extra)}</span></span></div>`).join("")}</div>`).join("") : `<div style="color:#546964">Bu dönem için girilmiş açıklama yok.</div>`}</div>
    <div style="color:#6A7E79;font-size:11px;border-top:1px solid #E4ECE9;padding-top:6px">Oluşturma tarihi: ${ds} · HSE Verim Modülü</div></div>`; };
  sh.innerHTML = build(ch, z);
  const stl = document.createElement("style"); stl.id = "pstyle";
  stl.textContent = `#psheet{display:none}@media print{@page{size:${size} ${orient};margin:${M * 0.2646}mm}html,body{background:#fff!important;margin:0!important;padding:0!important}body>*:not(#psheet){display:none!important}#psheet{display:block!important;width:${cw * z}px;-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
  document.head.appendChild(stl); document.body.appendChild(sh);
  // Gerçek yüksekliği ölç, tek sayfaya sığana kadar grafiği küçült
  const base = land ? 300 : 520, avail = Hh - 2 * M - 6; let c = base;
  sh.style.cssText = "display:block;position:fixed;left:-99999px;top:0;visibility:hidden";
  for (; c >= 140; c -= 15) { sh.innerHTML = build(c, 1); if (sh.firstElementChild.offsetHeight <= avail) break; }
  sh.innerHTML = build(Math.max(140, c), z); sh.style.cssText = "";
  const clean = () => { sh.remove(); stl.remove(); window.removeEventListener("afterprint", clean); };
  window.addEventListener("afterprint", clean);
  setTimeout(() => window.print(), 150);
}
