// Genel Bakış · yıllık özet panosu (gerçek verilerden)
import * as S from "./store.js?v=20261021c";
import { esc, noticeBox } from "./ui.js?v=20261021c";
import { CATS } from "./isgcats.js?v=20261021c";
import { bandOf, calcIsg, makTier, katsayi, surecVar, DEFAULT_PARAMS, MONTHS, num } from "./scoring.js?v=20261021c";
import { load } from "./verim.js?v=20261021c";
import * as T from "./tatil.js?v=20261021c";
import * as Gorev from "./gorev.js?v=20261021c";

const BAND = {
  Mükemmel: { fill: "#17A06F", c: "#0B6E4F", bg: "#D9F1E6" }, İyi: { fill: "#2A82C4", c: "#145F96", bg: "#DCEAF7" },
  Orta: { fill: "#E8A512", c: "#6B3F00", bg: "#FBE9C6" }, Kritik: { fill: "#D6382E", c: "#B3261E", bg: "#FADAD7" }
};
const NONE = { fill: "#D5E0DC", c: "#4A5C57", bg: "#EEF2F0" };
const MS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const SHORT = ["KKD", "Makine", "Bakım ve İzin", "Elektrik", "Yaya Yolu", "5S", "Çevre", "Kimyasal"];
const TONE = [{ bg: "#DDF1E7", c: "#0B6E4F" }, { bg: "#FBE9C6", c: "#6B3F00" }, { bg: "#F6C890", c: "#5C2A00" }, { bg: "#F2B0AA", c: "#7A130E" }];
const f1 = n => n.toFixed(1).replace(".", ",");
const pad = n => String(n).padStart(2, "0");
const iso0 = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();
const G = { cmp: null, key: "", pw: "10", fo: false, po: false };
export const reset = () => { G.fo = false; G.po = false; };
const avgOf = a => { const v = a.filter(x => x !== null && x !== undefined); return v.length ? v.reduce((s, c) => s + c, 0) / v.length : null; };

export async function render(v, ctx) {
  const { st } = ctx;
  const setup = await S.getSetup(st.fid, st.year);
  const fname = st.factories.find(f => f.id === st.fid)?.name || "";
  if (!setup?.rows?.length) { v.innerHTML = `<div><h1 class="ttl">Genel Bakış</h1><div class="sub">${esc(fname)} · ${st.year}</div></div><div class="cd"><h2>Kurulum bekleniyor</h2><p class="sub">Bu yıl için henüz bölüm kaydı yok.</p><div><a href="#kurulum"><button>Kurulum ve Kayıtlar'a git</button></a></div></div>`; return; }
  v.innerHTML = `<div class="sub">Veriler yükleniyor…</div>`;
  await Gorev.whenReady();
  const rows = setup.rows, p = setup.params || DEFAULT_PARAMS, data = await load(st, setup);
  const W = [num(p.w.kaza), num(p.w.konusma), num(p.w.isbasi), num(p.w.isg)];
  const bn = s => bandOf(s, p), bb = s => (s === null ? NONE : BAND[bn(s)]);
  const total = (id, m) => { let a = 0, d = 0; data[id][m].forEach((x, k) => { if (x !== null) { a += x * W[k]; d += W[k]; } }); return d ? a / d : null; };
  const yearOf = id => avgOf(Array.from({ length: 12 }, (_, m) => total(id, m)));
  const modYear = (id, k) => avgOf(data[id].map(m => m[k]));
  const dy = rows.map(r => ({ r, v: yearOf(r.id) })), have = dy.filter(x => x.v !== null);
  const overall = avgOf(have.map(x => x.v));
  const MODN = ["İş Kazası", "Eğitim Konuşması", "İşbaşı Eğitim", "İSG Denetim"];
  const mods = MODN.map((n, k) => ({ n, v: avgOf(rows.map(r => modYear(r.id, k))) }));
  const trend = Array.from({ length: 12 }, (_, m) => avgOf(rows.map(r => total(r.id, m))));
  const hedef = num(p.esik.h ?? "90") || 90, hit = trend.filter(x => x !== null && x >= hedef).length;
  const lastM = trend.reduce((a, x, i) => (x !== null ? i : a), -1);
  const ro = String(st.year) !== String(st.active);
  const ob = bb(overall), CIRC = 2 * Math.PI * 74;

  // İSG bulgu haritası: son denetim verisi olan ay
  let hm = -1; for (let m = 11; m >= 0; m--) if (rows.some(r => data[r.id][m][3] !== null)) { hm = m; break; }
  const docs = hm >= 0 ? await Promise.all(rows.map(r => S.getMonthDoc(st.fid, st.year, "isg", `${pad(hm + 1)}_${r.id}`))) : [];
  const heat = rows.map((r, i) => {
    const d = docs[i]; if (!d?.sessions?.length) return { r, f: null };
    const c = calcIsg({ cats: CATS, sessions: d.sessions, draft: { marks: {}, notes: {}, ydNotes: {} }, freqOv: d.freq || {}, bonusIdx: d.bonus || 0, F: katsayi(r, hm + 1), p, yog: surecVar(st.year, hm + 1), mak: makTier(r) });
    return { r, f: c.catInfo.map(x => x.freq) };
  });

  // Öncelikli aksiyonlar
  const acts = [], rk = have.slice().sort((a, b) => a.v - b.v);
  rk.filter(x => bn(x.v) === "Kritik").concat(rk.filter(x => bn(x.v) === "Orta")).slice(0, 4).forEach(x => {
    const kr = bn(x.v) === "Kritik", h = heat.find(z => z.r.id === x.r.id);
    const worst = h?.f ? h.f.map((f, ci) => [f, ci]).filter(z => z[0] >= 2).sort((a, b) => b[0] - a[0]).slice(0, 2).map(z => `${CATS[z[1]].name} (sıklık ${z[0]})`) : [];
    acts.push({ t: `${esc(x.r.name)} · ${bn(x.v)}`, d: `Yıllık verim ${f1(x.v)}.${worst.length ? ` ${MONTHS[hm]} denetiminde ${esc(worst.join(", "))}.` : ""}${kr ? " Saha denetimi önerilir." : ""}`, bg: kr ? "#FADAD7" : "#FBE9C6", c: kr ? "#6E1511" : "#5A3300", c2: kr ? "#5A1A16" : "#4A2D05", ic: kr ? "M12 3l9 16H3L12 3z|M12 10v4M12 17h0" : "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M12 7v5l3 2" });
  });
  mods.forEach((m, k) => { if (acts.length < 5 && m.v !== null && m.v < num(p.esik.i)) acts.push({ t: m.n, d: `Yıllık ortalama ${f1(m.v)} (${bn(m.v)}); hedefin altında.`, bg: "#DCEAF7", c: "#0F4A75", c2: "#143B5B", ic: "M4 12l5 5L20 6" }); });
  // Açık kritik/major bulgular: görev programı bağlıysa görevi kapanmamış olanlar (+ son ayda henüz aktarılmamışlar), değilse son denetim ayındakiler
  const conn = Gorev.linked(), allIsg = hm >= 0 ? await S.listMonthDocs(st.fid, st.year, "isg").catch(() => []) : [], fnd = [], nowMs = Date.now();
  allIsg.forEach(d => {
    const mm = +String(d.id).slice(0, 2), rid = String(d.id).slice(3), r = rows.find(x => x.id === rid); if (!r) return;
    (d.sessions || []).forEach(s => Object.entries(s.fails || {}).forEach(([id, list]) => {
      const q = /^c(\d+)i(\d+)$/.exec(id), cat = q && CATS[+q[1]]; if (!cat || cat.w < 2) return;
      (list || []).forEach((t, j) => {
        const tx = String(t || "").trim(); if (!tx) return;
        const key = Gorev.noteKey("d", st.fid, st.year, mm, rid, `${id}_${s.no}`, tx, list.slice(0, j).filter(x => String(x || "").trim() === tx).length);
        const du = conn ? Gorev.durumOf(key) : null; if (du?.durum === "kapali") return;
        const tk = du?.durum === "acik"; if (!tk && mm !== hm + 1) return;
        const t0 = tk && du.acilis ? du.acilis : s.date ? new Date(s.date + "T00:00:00").getTime() : null, days = t0 ? Math.max(0, Math.floor((nowMs - t0) / 864e5)) : null;
        fnd.push({ r, cat, tx, w: cat.w, days, tk, ph: (s.photos || {})[id + "|" + j] || [] });
      });
    }));
  });
  fnd.sort((a, b) => b.w - a.w || (b.days ?? -1) - (a.days ?? -1));
  if (!acts.length && have.length) acts.push({ t: "Durum iyi", d: "Tüm bölümler ve modüller \"İyi\" veya üzerinde.", bg: "#D9F1E6", c: "#0B6E4F", c2: "#0B6E4F", ic: "M4 12l5 5L20 6" });
  if (!have.length) acts.push({ t: "Veri bekleniyor", d: "Aylık giriş sayfalarından veri kaydedildikçe burada özet ve aksiyonlar görünür.", bg: "#EEF2F0", c: "#2A3F3A", c2: "#2A3F3A", ic: "M12 8v4M12 16h0" });

  // Yıllar arası karşılaştırma: seçili yılda verisi olan aylar iki yılda da aynı alınır
  let cmpHtml = "";
  const ph = t => `<div class="cd" style="gap:8px"><h2>Yıllar Arası Karşılaştırma</h2><div class="muted" style="font-size:13.5px;line-height:1.55">${t}</div></div>`;
  const others = st.years.filter(y => String(y) !== String(st.year));
  if (others.length) {
    const fk = st.fid + "/" + st.year; if (G.key !== fk) { G.key = fk; G.cmp = null; }
    const ix = st.years.map(String).indexOf(String(st.year));
    if (!G.cmp || !others.map(String).includes(String(G.cmp))) G.cmp = String(ix > 0 ? st.years[ix - 1] : st.years[ix + 1]);
    const setupB = await S.getSetup(st.fid, G.cmp), M = trend.map((x, i) => (x !== null ? i : -1)).filter(i => i >= 0);
    if (setupB?.rows?.length && M.length) {
      const dataB = await load({ fid: st.fid, year: G.cmp }, setupB), pB = setupB.params || DEFAULT_PARAMS;
      const WB = [num(pB.w.kaza), num(pB.w.konusma), num(pB.w.isbasi), num(pB.w.isg)];
      const totB = (id, m) => { let a = 0, d = 0; dataB[id][m].forEach((x, k) => { if (x !== null) { a += x * WB[k]; d += WB[k]; } }); return d ? a / d : null; };
      const sideA = r => avgOf(M.map(m => total(r.id, m)));
      const rb = r => setupB.rows.find(x => x.id === r.id) || setupB.rows.find(x => x.name.trim().toLowerCase() === r.name.trim().toLowerCase());
      const pairs = rows.map(r => { const b = rb(r); return { r, a: sideA(r), b: b ? avgOf(M.map(m => totB(b.id, m))) : null }; });
      const both = pairs.filter(x => x.a !== null && x.b !== null);
      const tA = avgOf(pairs.map(x => x.a)), tB = avgOf(pairs.map(x => x.b));
      const mod = MODN.map((n, k) => ({ n, a: avgOf(rows.map(r => avgOf(M.map(m => data[r.id][m][k])))), b: avgOf(rows.map(r => { const b = rb(r); return b ? avgOf(M.map(m => dataB[b.id][m][k])) : null; })) }));
      const dl = (a, b) => { if (a === null || b === null) return `<span class="pill" style="background:#EEF2F0;color:#4A5C57;align-self:center">–</span>`; const d = a - b, up = d >= 0.05, dn = d <= -0.05; return `<span class="pill" style="align-self:center;background:${up ? "#D9F1E6" : dn ? "#FADAD7" : "#EEF2F0"};color:${up ? "#0B6E4F" : dn ? "#B3261E" : "#4A5C57"}">${up ? "▲" : dn ? "▼" : "="} ${f1(Math.abs(d))}</span>`; };
      const two = (a, b) => `<div class="col1" style="flex:1;min-width:40px;gap:4px"><div style="height:9px;border-radius:999px;background:#E4ECE9;overflow:hidden"><div style="height:100%;width:${b === null ? 0 : Math.min(100, b)}%;background:#9DB5AE;border-radius:999px"></div></div><div style="height:9px;border-radius:999px;background:#E4ECE9;overflow:hidden"><div style="height:100%;width:${a === null ? 0 : Math.min(100, a)}%;background:${bb(a).fill};border-radius:999px"></div></div></div>`;
      const mlabel = M.length === 12 ? "tüm yıl" : M.length === 1 ? MONTHS[M[0]] : `${MONTHS[M[0]]}–${MONTHS[M[M.length - 1]]}`;
      cmpHtml = `<div class="cd" style="gap:16px"><div class="row sp" style="align-items:baseline"><div><h2>Yıllar Arası Karşılaştırma</h2><div class="muted" style="font-size:13px;margin-top:4px">${st.year} ile ${G.cmp} · her iki yılda aynı aylar (${mlabel}) karşılaştırılır</div></div>
        <select id="cmpY" class="inp noprint" style="width:auto;min-width:110px;font-weight:700" aria-label="Karşılaştırılacak yıl">${others.map(y => `<option value="${y}" ${String(y) === G.cmp ? "selected" : ""}>${y} ile kıyasla</option>`).join("")}</select></div>
        <div class="row" style="gap:16px;align-items:stretch">
          <div class="col1" style="flex:1 1 90px;gap:2px"><span class="hd">${G.cmp}</span><b style="font:700 28px Sora,sans-serif">${tB === null ? "–" : f1(tB)}</b></div>
          <div class="col1" style="flex:1 1 90px;gap:2px"><span class="hd">${st.year}</span><b style="font:700 28px Sora,sans-serif">${tA === null ? "–" : f1(tA)}</b></div>
          <div class="col1" style="flex:1 1 90px;gap:6px"><span class="hd">DEĞİŞİM</span>${dl(tA, tB)}</div></div>
        <div class="col1" style="gap:10px"><div class="row" style="gap:14px;font-size:12.5px;color:var(--muted)"><span class="row" style="gap:6px;flex-wrap:nowrap"><span style="width:12px;height:12px;border-radius:3px;background:#9DB5AE"></span>${G.cmp}</span><span class="row" style="gap:6px;flex-wrap:nowrap"><span style="width:12px;height:12px;border-radius:3px;background:#2A82C4"></span>${st.year} (durum rengi)</span></div>
          ${pairs.map(x => `<div style="display:flex;align-items:center;gap:10px"><span style="width:112px;flex:0 0 112px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.r.name)}</span>${two(x.a, x.b)}<span style="width:44px;text-align:right;font-size:12.5px;color:var(--muted)">${x.b === null ? "–" : f1(x.b)}</span><b style="width:44px;text-align:right">${x.a === null ? "–" : f1(x.a)}</b><span style="width:76px;flex:0 0 76px;text-align:center">${dl(x.a, x.b)}</span></div>`).join("")}</div>
        <div style="border-top:1px solid var(--line);padding-top:12px" class="col1"><span class="hd">MODÜLLER</span>${mod.map(m => `<div style="display:flex;align-items:center;gap:10px"><span style="width:140px;flex:0 0 140px;font-weight:600">${m.n}</span>${two(m.a, m.b)}<span style="width:44px;text-align:right;font-size:12.5px;color:var(--muted)">${m.b === null ? "–" : f1(m.b)}</span><b style="width:44px;text-align:right">${m.a === null ? "–" : f1(m.a)}</b><span style="width:76px;flex:0 0 76px;text-align:center">${dl(m.a, m.b)}</span></div>`).join("")}</div>
        ${both.length < pairs.length ? `<div class="muted" style="font-size:12.5px">Bazı bölümler iki yılda da bulunmadığı veya veri girilmediği için karşılaştırılamadı.</div>` : ""}<div class="muted" style="font-size:12.5px">Toplam verim, o yılda verisi girilen modüllerle hesaplanır; modül sayısı iki yılda farklıysa modül satırlarına bakın.</div></div>`;
    } else cmpHtml = !M.length ? ph(`${st.year} yılında henüz veri girilmedi; veri girildikçe ${G.cmp} ile aynı aylar karşılaştırılır.`) : ph(`${G.cmp} yılı için kurulum (bölüm listesi) bulunamadı. Ayarlar → Yıllar bölümünden o yılı başlatın.`);
  } else cmpHtml = ph("Karşılaştırma için en az iki yıl gerekir. Şu an yalnızca " + st.year + " yılı var. <b>Ayarlar → Yıllar → “" + (Number(st.year) + 1) + " yılını başlat”</b> ile yeni yıl açıldığında, her iki yılda veri girilen aynı aylar bölüm ve modül bazında burada kıyaslanır.");
  // Denetim planı uyumu (haftalık plan · yalnızca gösterim, puanı etkilemez)
  const td = await T.yukle(st.fid, st.year), tmap = T.takvim(td), canDecide = st.role !== "guest" && !ro;
  const pl = rows.map(r => ({ r, u: T.planUyum(data._s?.[r.id], st.year, { map: tmap, karar: td.karar }) })), all = G.pw === "all", NW = 10;
  const pd = pl.reduce((a, x) => a + x.u.done + x.u.offPast, 0), pc = pl.reduce((a, x) => a + x.u.plan + x.u.offPast, 0), pt = pc ? pd / pc * 100 : null, u0 = pl[0]?.u;
  const dot = (w, fx) => w ? `<span title="${T.range(w.a, w.z)}${w.ad ? " · " + esc(w.ad) : ""}" style="${fx ? T.dotCss(w.st, 11) : T.dotCss(w.st, 11).replace("flex:0 0 11px;width:11px;height:11px", "flex:1 1 0;min-width:0;max-width:11px;aspect-ratio:1")}"></span>` : `<span style="flex:1 1 0;min-width:0;max-width:11px"></span>`;
  const legend = [["ok", "Zamanında (Pzt–Çar)"], ["late", "Geç (Per–Paz)"], ["miss", "Yapılmadı"], ["off", "Tatil (plan dışı)"], ["wait", "Bu hafta"], ["future", "Gelecek"]].concat(u0?.ask.length ? [["ask", "Karar bekliyor"]] : []);
  const ask = (u0?.ask || []).map(w => `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px;border-radius:14px;background:#FBE9C6"><div style="flex:1 1 220px;min-width:0;color:#5A3300;line-height:1.5"><b>${T.range(w.a, w.z)}</b> haftası tatilden etkileniyor${w.ad ? ` (${esc(w.ad)})` : ""}. Pzt–Çar iş günü yok; bu hafta denetim planlansın mı?</div>
    ${canDecide ? `<div class="row" style="gap:8px;flex-wrap:nowrap"><button class="sec" data-tk="${w.a}|tatil">Tatil, plan dışı</button><button data-tk="${w.a}|yap">Denetim yapılacak</button></div>` : ""}</div>`).join("");
  const rowOf = ({ r, u }) => { const ws = all ? u.weeks : Array.from({ length: NW }, (_, i) => { const k = u.weeks.reduce((x, w, j) => (w.a <= iso0 ? j : x), u.weeks.length - 1); const e = Math.min(u.weeks.length - 1, k + 2); return u.weeks[e - NW + 1 + i]; });
    const info = `<span style="flex:0 0 auto;display:flex;align-items:baseline;gap:8px;white-space:nowrap"><span class="muted" style="font-size:12.5px">${u.plan + u.offPast ? (u.done + u.offPast) + "/" + (u.plan + u.offPast) : "–"}</span><b style="min-width:34px;text-align:right">${u.pct === null ? "–" : "%" + Math.round(u.pct)}</b></span>`;
    return all ? `<div class="col1" style="gap:6px"><div style="display:flex;align-items:center;gap:10px"><span style="flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.name)}</span>${info}</div><div style="display:flex;flex-wrap:wrap;gap:4px">${ws.map(w => dot(w, all)).join("")}</div></div>`
      : `<div style="display:flex;align-items:center;gap:10px"><span style="width:84px;flex:0 0 84px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.name)}</span><span style="flex:1;min-width:0;display:flex;gap:3px;align-items:center">${ws.map(w => dot(w, all)).join("")}</span>${info}</div>`; };
  const pOpen = !!G.po, pch = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .15s;transform:rotate(${pOpen ? 180 : 0}deg)"><path d="M6 9l6 6 6-6"/></svg>`;
  const planHtml = `<div class="cd" style="gap:14px"><button type="button" data-po aria-expanded="${pOpen}" aria-label="Denetim planı uyumu kartını ${pOpen ? "kapat" : "aç"}" style="display:flex;align-items:center;gap:12px;width:100%;min-height:40px;height:auto;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer"><span style="flex:1;min-width:0"><h2 style="margin:0">Denetim Planı Uyumu</h2><div class="muted" style="font-size:13px;margin-top:4px;font-weight:400">Haftalık plan · ${st.year} · ${u0 ? u0.total : 52} hafta${u0?.off ? ` · ${u0.off} tatil (muaf)` : ""}${pt === null ? "" : ` · tesis %${Math.round(pt)} (${pd}/${pc})`}</div></span><span style="flex:0 0 40px;width:40px;height:40px;border-radius:12px;border:1.5px solid var(--gd);color:var(--gd);box-sizing:border-box;display:flex;align-items:center;justify-content:center">${pch}</span></button>
    ${ask}
    <div class="col1" data-pob${pOpen ? "" : " hidden"} style="gap:14px;border-top:1px solid var(--line);padding-top:14px"><div class="row sp noprint" style="gap:10px"><div class="row" style="gap:14px;font-size:12px;color:var(--muted)">${legend.map(([k, t]) => `<span class="row" style="gap:6px;flex-wrap:nowrap"><span style="${T.dotCss(k, 10)}"></span>${t}</span>`).join("")}</div>
      <div class="seg" role="group" aria-label="Görünüm">${[["10", "10 hafta"], ["all", "Tüm yıl"]].map(([k, t]) => `<button data-pw="${k}" style="height:30px;padding:0 12px;border-radius:8px;font-size:12.5px;${G.pw === k ? "background:#0B6E4F;color:#fff" : "background:#EEF2F0;color:#2A3F3A"}">${t}</button>`).join("")}</div></div>
    <div class="col1" style="gap:${all ? 16 : 10}px">${pl.map(rowOf).join("")}</div>
    <div class="muted" style="font-size:12.5px">Her hafta (Pzt–Paz) için bölüm başına bir denetim planlanır; ideal gün Pzt–Çar'dır. Tatil, plan dışı denilen ve denetimi yapılmayan hafta gri görünür, muaf sayılır (yapıldı gibi) ve yüzdeyi düşürmez; sayaç hafta düzenini korur (örn. 2/40). Bu kart puanı etkilemez.</div></div></div>`;
  const label = s => (s === null ? "Veri yok" : bn(s));
  const rank = have.slice().sort((a, b) => b.v - a.v);
  const SH = 5, wp = { 3: ["Kritik", "#FADAD7", "#8E1B16"], 2: ["Major", "#FBE9C6", "#6B3F00"] }, shown = fnd.slice(0, SH);
  const fRow = (f, i) => { const [wt, wb, wc] = wp[f.w], st1 = f.tk ? `Görevde · ${f.days === null ? "açık" : f.days < 1 ? "bugün açıldı" : f.days + " gündür açık"}` : conn ? "Göreve aktarılmadı" : f.days === null ? "" : f.days < 1 ? "Bugün tespit edildi" : f.days + " gün önce tespit";
    const th = f.ph.length ? `<button type="button" data-fp="${i}" aria-label="Fotoğrafı büyüt" style="position:relative;width:72px;height:72px;flex:0 0 72px;padding:0;min-width:0;border-radius:10px;overflow:hidden;border:1px solid var(--line);background:var(--calc)"><img src="${f.ph[0].t}" alt="Fotoğraf" style="width:100%;height:100%;object-fit:cover;display:block">${f.ph.length > 1 ? `<span style="position:absolute;right:4px;bottom:4px;padding:1px 6px;border-radius:999px;background:rgba(16,32,28,.78);color:#fff;font-size:11px;font-weight:700">+${f.ph.length - 1}</span>` : ""}</button>`
      : `<span aria-hidden="true" style="width:72px;height:72px;flex:0 0 72px;border-radius:10px;border:1px dashed var(--line);display:grid;place-items:center;color:var(--muted)"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span>`;
    return `<div style="display:flex;gap:12px;align-items:stretch;padding:10px;border-radius:14px;background:var(--calc)">${th}<div class="col1" style="gap:4px;min-width:0;flex:1;justify-content:center"><div style="display:flex;align-items:center;gap:8px;min-width:0"><b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.r.name)}</b><span class="pill" style="flex:0 0 auto;background:${wb};color:${wc}">${wt}</span></div>
      <div class="muted" style="font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.cat.name)}</div>
      <div style="line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(f.tx)}</div>${st1 ? `<div class="muted" style="font-size:12px">${st1}</div>` : ""}</div></div>`; };
  const fOpen = !!G.fo, chev = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 20px;transition:transform .15s;transform:rotate(${fOpen ? 180 : 0}deg)"><path d="M6 9l6 6 6-6"/></svg>`;
  const findHtml = `<div class="col1" style="gap:10px;border-top:1px solid var(--line);padding-top:6px"><button type="button" data-fg aria-expanded="${fOpen}" aria-label="Açık kritik bulgular listesini ${fOpen ? "kapat" : "aç"}" style="display:flex;align-items:center;gap:10px;width:100%;min-height:40px;height:auto;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer"><span class="hd" style="flex:1;min-width:0">AÇIK KRİTİK BULGULAR</span><span class="muted" style="font-size:12.5px;font-weight:600">${fnd.length ? fnd.length + " bulgu" : "Yok"}</span>${chev}</button>
    <div class="col1" data-fgb style="gap:10px"${fOpen ? "" : " hidden"}>${shown.length ? shown.map(fRow).join("") : `<div class="muted" style="line-height:1.5">${conn ? "Görevi kapanmamış kritik veya major bulgu yok." : "Son denetim ayında kritik veya major bulgu yok."}</div>`}
    ${fnd.length > SH ? `<a href="#denetim" class="muted" style="font-size:12.5px;font-weight:700;text-decoration:none">+${fnd.length - SH} bulgu daha · İSG Denetim sayfasında</a>` : ""}
    ${conn ? "" : `<div class="muted" style="font-size:12px;line-height:1.5">Görev programı bağlı olmadığından yalnızca son denetim ayındaki bulgular listelenir; kapanış durumu bilinmez.</div>`}</div></div>`;
  v.innerHTML = `
  <div class="row sp"><div class="col1" style="gap:6px"><h1 class="ttl">Genel Bakış</h1>
    <div class="sub">${esc(fname)} · ${st.year} · ${rows.length} aktif bölüm · Yıllık görünüm</div>
    ${ro ? `<span class="pill" style="background:#DCEAF7;color:#145F96">Geçmiş yıl · salt okunur</span>` : ""}</div>
    <a href="#rapor" class="noprint"><button style="height:44px;padding:0 20px;border-radius:12px;background:#0B6E4F;color:#fff;font-weight:700">Rapor oluştur</button></a></div>
  ${have.length ? "" : `<div class="warn">${st.year} için henüz kayıtlı veri yok. Aylık giriş sayfalarından veri kaydedin.</div>`}
  <div class="row" style="gap:20px;align-items:stretch">
    <div class="cd" style="flex:2 1 520px;min-width:0;flex-direction:row;flex-wrap:wrap;gap:28px;align-items:center">
      <div style="position:relative;width:176px;height:176px;flex:0 0 176px"><svg width="176" height="176" viewBox="0 0 176 176"><circle cx="88" cy="88" r="74" fill="none" stroke="#E4ECE9" stroke-width="14"/>
        <circle cx="88" cy="88" r="74" fill="none" stroke="${ob.fill}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${overall === null ? 0 : Math.min(100, overall) / 100 * CIRC} ${CIRC}" transform="rotate(-90 88 88)"/></svg>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px"><div style="font:700 38px Sora,sans-serif;letter-spacing:-1px">${overall === null ? "–" : f1(overall)}</div>
          <span class="pill" style="background:${ob.bg};color:${ob.c};align-self:center">${label(overall)}</span></div></div>
      <div class="col1" style="flex:1 1 260px;min-width:0;gap:16px"><div><h2>Tesis HSE Verimi</h2><div class="muted" style="margin-top:4px">Dört modülün bölüm bazlı ağırlıklı ortalaması (${W.join(" / ")})</div></div>
        <div class="col1" style="gap:12px">${mods.map(m => `<div class="col1" style="gap:6px"><div class="row sp" style="flex-wrap:nowrap"><span style="font-weight:600">${m.n}</span><b>${m.v === null ? "–" : f1(m.v)}</b></div>
          <div style="height:8px;border-radius:999px;background:#E4ECE9;overflow:hidden"><div style="height:100%;border-radius:999px;width:${m.v === null ? 0 : Math.min(100, m.v)}%;background:${bb(m.v).fill}"></div></div></div>`).join("")}</div></div></div>
    <div style="flex:1 1 300px;min-width:0;background:#0B2230;color:#E6F0ED;border-radius:18px;padding:24px;display:flex;flex-direction:column;gap:14px">
      <div style="font:600 18px Sora,sans-serif;color:#fff">Durum Eşikleri</div>
      <div class="col1" style="gap:10px">${[["Mükemmel", `${num(p.esik.m)} ve üzeri`, "#17A06F"], ["İyi", `${num(p.esik.i)} – ${num(p.esik.m) - 1}`, "#2A82C4"], ["Orta", `${num(p.esik.o)} – ${num(p.esik.i) - 1}`, "#F5B700"], ["Kritik", `${num(p.esik.o)} altı`, "#D6382E"]].map(([n, r, c]) => `<div style="display:flex;align-items:center;gap:12px"><span style="width:14px;height:14px;border-radius:4px;background:${c}"></span><span style="font-weight:700;flex:1">${n}</span><span style="color:#9DB5AE">${r}</span></div>`).join("")}</div>
      <div style="margin-top:auto;padding-top:14px;border-top:1px solid rgba(255,255,255,.12);font-size:12px;line-height:1.6;color:#9DB5AE">Renkler güvenlik işaretleri mantığını izler; her durum renkle birlikte metin etiketiyle de gösterilir.</div></div></div>
  <div class="row" style="gap:20px;align-items:stretch">
    <div class="cd" style="flex:1 1 420px;min-width:0;gap:18px"><div class="row sp" style="align-items:baseline"><h2>Bölüm Sıralaması</h2><div class="muted" style="font-size:13px">Yıllık verim</div></div>
      <div class="col1" style="gap:12px">${rank.length ? rank.map((x, i) => { const b = bb(x.v); return `<div style="display:flex;align-items:center;gap:10px"><span style="width:20px;flex:0 0 20px;color:#6A7E79;font-weight:700;font-size:13px">${i + 1}</span><span style="width:112px;flex:0 0 112px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.r.name)}</span>
        <div style="flex:1;min-width:30px;height:12px;border-radius:999px;background:#E4ECE9;overflow:hidden"><div style="height:100%;border-radius:999px;width:${Math.min(100, x.v)}%;background:${b.fill}"></div></div><b style="width:40px;text-align:right">${f1(x.v)}</b>
        <span style="width:68px;flex:0 0 68px;text-align:center;font-size:12px;font-weight:700;padding:3px 0;border-radius:999px;background:${b.bg};color:${b.c}">${bn(x.v)}</span></div>`; }).join("") : `<div class="muted">Henüz veri yok.</div>`}</div></div>
    <div class="cd" style="flex:1.3 1 460px;min-width:0;gap:14px"><div class="row sp" style="align-items:baseline"><h2>Aylık Trend</h2><div class="muted" style="font-size:13px">Tesis HSE verimi · ${st.year} · 0–100 puan · hedef ${f1(hedef).replace(/,0$/, "")} · ${hit}/${trend.filter(x => x !== null).length} ay hedefte</div></div>
      <div style="position:relative;height:236px">${(() => { const Y = v => 24 + v * 1.8, GX = 24, kr = num(p.esik.o), hs = f1(hedef).replace(/,0$/, ""), ks = f1(kr).replace(/,0$/, ""),
          lbl = (v, c, txt) => `<div style="position:absolute;left:${GX + 4}px;bottom:${Y(v) + 2}px;font-size:8.5px;font-style:italic;font-weight:600;line-height:1.2;color:${c};z-index:2;white-space:nowrap;-webkit-text-stroke:2.5px var(--card);paint-order:stroke fill;text-shadow:0 0 2px var(--card)">${txt}</div>`,
          ax = (v, c, b, txt = v) => `<div style="position:absolute;left:0;bottom:${Y(v) - 7}px;width:${GX - 3}px;text-align:right;font-size:11px;${b ? `font-weight:800;color:${c}` : "color:var(--muted)"}">${txt}</div>`;
        return [25, 75, 100].map(a => `<div style="position:absolute;left:${GX}px;right:0;bottom:${Y(a)}px;border-top:1px dashed #B5C5BF"></div>`).join("")
          + `<div style="position:absolute;left:${GX}px;right:0;bottom:${Y(0)}px;border-top:1.5px solid #9FB4AE"></div>`
          + [0, 25, 75, 100].filter(a => Math.abs(a - hedef) >= 7 && Math.abs(a - kr) >= 7).map(a => ax(a)).join("")
          + `<div style="position:absolute;left:${GX}px;right:0;bottom:${Y(kr)}px;border-top:2px solid #D6382E;z-index:1"></div>${ax(kr, "#D6382E", true, ks)}${lbl(kr, "#B3261E", "Kritik Puan Çizgisi")}`
          + `<div style="position:absolute;left:${GX}px;right:0;bottom:${Y(hedef)}px;border-top:2px solid #0B6E4F;z-index:1"></div>${ax(hedef, "#0B6E4F", true, hs)}${lbl(hedef, "#0B6E4F", "Hedef Puan Çizgisi")}`; })()}
        <div style="position:absolute;left:24px;right:0;top:0;bottom:0;display:flex;gap:5px;align-items:flex-end">${trend.map((x, i) => `<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:236px">
          ${(() => { const H = x === null ? 3 : Math.round(x * 1.8), inn = x !== null && H >= 44, lab = x === null ? "" : `<span style="font-size:10.5px;font-weight:700;writing-mode:vertical-rl;transform:rotate(180deg);${inn ? `color:${bn(x) === "Orta" ? "#3A2800" : "#fff"}` : ""}">${f1(x)}</span>`;
            return `${inn ? "" : `<div style="margin-bottom:4px">${lab}</div>`}<div style="width:68%;max-width:34px;height:${H}px;background:${bb(x).fill};border-radius:7px 7px 2px 2px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:6px;box-sizing:border-box">${inn ? lab : ""}</div>`; })()}
          <div style="height:24px;line-height:24px;font-size:10.5px;color:var(--muted)">${MS[i]}</div></div>`).join("")}</div></div></div></div>
  <div class="row" style="gap:20px;align-items:stretch">
    <div class="cd" style="flex:2 1 560px;min-width:0"><div class="row sp" style="align-items:baseline"><h2>İSG Bulgu Haritası</h2><div class="muted" style="font-size:13px">${hm >= 0 ? `${MONTHS[hm]} ${st.year}` : "Veri yok"} · kategori sıklığı (0 = uygun, 3 = çok sık, – = uygulanmaz)</div></div>
      ${hm >= 0 ? `<div style="overflow-x:auto"><div style="min-width:${Math.max(420, 100 + CATS.length * 56)}px;display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;gap:6px;align-items:flex-end"><div style="width:96px;flex:0 0 96px"></div>${CATS.map((c, i) => `<div style="flex:1;min-width:0;text-align:center;font-size:12px;font-weight:700;color:var(--muted);padding-bottom:4px">${SHORT[i] || esc(c.name)}</div>`).join("")}</div>
        ${heat.map(h => `<div style="display:flex;gap:6px;align-items:center"><div style="width:96px;flex:0 0 96px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(h.r.name)}</div>${CATS.map((c, i) => { const f = h.f ? h.f[i] : null, t = f === null ? { bg: "#EEF2F0", c: "#6A7E79" } : TONE[Math.min(3, f)]; return `<div style="flex:1;min-width:0;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-weight:800;background:${t.bg};color:${t.c}">${f === null ? "–" : f}</div>`; }).join("")}</div>`).join("")}</div></div>` : `<div class="muted">Henüz İSG denetim kaydı yok.</div>`}</div>
    <div class="cd" style="flex:1 1 300px;min-width:0"><h2>Öncelikli Aksiyonlar</h2><div class="col1" style="gap:12px">${acts.map(a => `<div style="display:flex;gap:12px;padding:14px;border-radius:14px;background:${a.bg}">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${a.c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 22px">${a.ic.split("|").map(d => `<path d="${d}"/>`).join("")}</svg>
      <div class="col1" style="gap:3px"><div style="font-weight:800;color:${a.c}">${a.t}</div><div style="color:${a.c2};line-height:1.5">${a.d}</div></div></div>`).join("")}</div>
      ${have.length ? findHtml : ""}</div></div>${planHtml}${cmpHtml}`;
  const po = v.querySelector("[data-po]"); if (po) po.onclick = () => { G.po = !G.po; const b = v.querySelector("[data-pob]"); b.hidden = !G.po; po.setAttribute("aria-expanded", G.po); po.setAttribute("aria-label", "Denetim planı uyumu kartını " + (G.po ? "kapat" : "aç")); po.querySelector("svg").style.transform = `rotate(${G.po ? 180 : 0}deg)`; };
  const fg = v.querySelector("[data-fg]"); if (fg) fg.onclick = () => { G.fo = !G.fo; const b = v.querySelector("[data-fgb]"); b.hidden = !G.fo; fg.setAttribute("aria-expanded", G.fo); fg.setAttribute("aria-label", "Açık kritik bulgular listesini " + (G.fo ? "kapat" : "aç")); fg.querySelector("svg").style.transform = `rotate(${G.fo ? 180 : 0}deg)`; };
  v.querySelectorAll("[data-fp]").forEach(b => b.onclick = () => lightbox(shown[+b.dataset.fp].ph, st));
  v.querySelectorAll("[data-pw]").forEach(b => b.onclick = () => { G.pw = b.dataset.pw; render(v, ctx); });
  v.querySelectorAll("[data-tk]").forEach(b => b.onclick = async () => { const [mon, k] = b.dataset.tk.split("|"); b.disabled = true; try { await T.karar(st.fid, st.year, mon, k); } catch (e) { noticeBox("Kaydedilemedi", e.message); } render(v, ctx); });
  const cy = document.getElementById("cmpY"); if (cy) cy.onchange = e => { G.cmp = e.target.value; render(v, ctx); };
}

// Fotoğraf büyütme (Denetim sayfasındaki ile aynı düzen): çarpı, Kapat veya dışına dokunma ile kapanır
function lightbox(list, st, i0 = 0) {
  let i = i0; const lb = document.createElement("div"); lb.className = "mod"; lb.style.zIndex = 70;
  const show = async () => {
    lb.innerHTML = `<div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;max-width:96vw"><button data-x aria-label="Kapat" style="position:absolute;top:-14px;right:-6px;z-index:2;width:34px;height:34px;min-width:0;padding:0;background:#B3261E;border-color:#B3261E;color:#fff;font-size:24px;line-height:1;display:grid;place-items:center;border-radius:50%">×</button><img src="${list[i].t}" alt="Fotoğraf" style="max-width:96vw;max-height:78vh;border-radius:10px;background:#000"><div class="row" style="gap:10px;justify-content:center;${list.length < 2 ? "display:none" : ""}"><button class="sec" data-p>‹ Önceki</button><span style="color:#fff;font-weight:700">${i + 1} / ${list.length}</span><button class="sec" data-n>Sonraki ›</button></div></div>`;
    lb.querySelector("[data-x]").onclick = () => lb.remove();
    const p = lb.querySelector("[data-p]"), n = lb.querySelector("[data-n]");
    if (p) p.onclick = () => { i = (i + list.length - 1) % list.length; show(); }; if (n) n.onclick = () => { i = (i + 1) % list.length; show(); };
    const at = i, full = await S.getPhoto(st.fid, st.year, list[i].id).catch(() => null); if (full && at === i && lb.isConnected) lb.querySelector("img")?.setAttribute("src", full);
  };
  document.body.appendChild(lb); show(); lb.addEventListener("mousedown", e => { if (e.target === lb) lb.remove(); });
}
