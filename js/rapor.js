// Aylık HSE Raporu · kayıtlı verilerden otomatik grafik + açıklama
import * as S from "./store.js?v=20261022p";
import { esc } from "./ui.js?v=20261022p";
import * as Gorev from "./gorev.js?v=20261022p";
import * as T from "./tatil.js?v=20261022p";
import { askFormat, printCurrent, saveReportPdf, fileTitle } from "./pdf.js?v=20261022p";
import { CATS } from "./isgcats.js?v=20261022p";
import { lastWeekKey, weekScores, weekLabel } from "./isgweek.js?v=20261022p";
import { bandOf, isgMonth, makTier, katsayi, surecVar, DEFAULT_PARAMS, MONTHS, num, konusmaPct, konusmaSifir } from "./scoring.js?v=20261022p";

const BAND = {
  Mükemmel: { fill: "#17A06F", c: "#0B6E4F", bg: "#D9F1E6" }, İyi: { fill: "#2A82C4", c: "#145F96", bg: "#DCEAF7" },
  Orta: { fill: "#E8A512", c: "#6B3F00", bg: "#FBE9C6" }, Kritik: { fill: "#D6382E", c: "#B3261E", bg: "#FADAD7" }
};
const NONE = { fill: "#D5E0DC", c: "#4A5C57", bg: "#EEF2F0" };
const CCOL = ["#2A82C4", "#17A06F", "#D6382E", "#F5B700", "#2A82C4", "#8A6FD1", "#17A06F", "#E8803A"];
const pad = n => String(n).padStart(2, "0");
const f1 = n => n.toFixed(1).replace(".", ",");
const fin = x => (typeof x === "number" && isFinite(x) ? x : null);
export const reset = () => { R.plOpen = false; };
const R = { wk: false, wkOk: false, plOpen: false, month: null, per: "m", key: "", pics: false, ph: {}, off: new Set(), vert: new Set() };
const PER = { m: "Aylık", q: "3 Aylık (Ç1)", h: "6 Aylık (Ç2)", n: "9 Aylık (Ç3)", y: "Yıllık" };
const PN = { q: "1. çeyrek · Ocak-Mart", h: "2. çeyrek · Ocak-Haziran (kümülatif)", n: "3. çeyrek · Ocak-Eylül (kümülatif)", y: "Ocak-Aralık" };
const LAST = { q: 3, h: 6, n: 9, y: 12 };

async function load(st) {
  const [kz, kn, ib, ig] = await Promise.all(["kaza", "konusma", "isbasi", "isg"].map(c => S.listMonthDocs(st.fid, st.year, c)));
  const by = d => Object.fromEntries(d.map(x => [x.id, x]));
  const _s = {}; ig.forEach(d => { const id = String(d.id).slice(3); (d.sessions || []).forEach(se => { if (se?.date) (_s[id] ||= []).push(se.date); }); });
  return { kz: by(kz), kn: by(kn), ib: by(ib), ig: by(ig), _s, td: await T.yukle(st.fid, st.year).catch(() => ({})) };
}

export async function render(v, ctx) {
  const { st } = ctx;
  const setup = await S.getSetup(st.fid, st.year);
  if (!setup?.rows?.length) { v.innerHTML = `<div class="cd"><h2>Önce bölümleri tanımlayın</h2><p class="sub">Rapor için Kurulum ve Kayıtlar sayfasında en az bir bölüm kaydedilmeli.</p><div><a href="#kurulum"><button>Kurulum'a git</button></a></div></div>`; return; }
  v.innerHTML = `<div class="sub">Rapor hazırlanıyor…</div>`;
  const data = await load(st); await Gorev.whenReady(); const key = [st.fid, st.year].join("/");
  const has = m => [data.kz, data.kn, data.ib].some(c => c[pad(m)]?.result) || setup.rows.some(r => data.ig[`${pad(m)}_${r.id}`]?.result);
  if (R.key !== key || !R.month) { R.key = key; let l = 0; for (let m = 12; m >= 1; m--) if (has(m)) { l = m; break; } R.month = l || (+st.year === new Date().getFullYear() ? new Date().getMonth() + 1 : 1); }
  draw(v, st, setup, data);
}

const bar = (name, v, w, label, thin, lw, hf, sub) => {
  const b = v === null ? NONE : BAND[label.band];
  return `<div style="display:flex;align-items:center;gap:12px"><span style="width:96px;flex:0 0 96px;min-width:0;display:flex;flex-direction:column"><span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</span>${sub === undefined ? "" : `<span ${sub.t ? `title="${esc(sub.title)}"` : ""} style="font-size:10.5px;font-weight:700;line-height:13px;height:13px;color:#8E1B16;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sub.t || "")}</span>`}</span>
    <div style="flex:1;min-width:40px;position:relative"><div style="height:${thin ? 12 : 14}px;border-radius:999px;background:#E4ECE9;overflow:hidden"><div style="height:100%;border-radius:999px;width:${v === null ? 0 : Math.max(0, Math.min(100, v))}%;background:${b.fill}"></div></div>${hf ? `<span style="position:absolute;left:${hf}%;top:-3px;bottom:-3px;width:2px;margin-left:-1px;background:#0B6E4F"></span>` : ""}</div>
    <span style="width:44px;text-align:right;font-weight:700">${v === null ? "–" : f1(v)}</span>
    <span style="width:${lw || 76}px;flex:0 0 ${lw || 76}px;text-align:center;font-size:12px;font-weight:700;padding:3px 0;border-radius:999px;background:${label.bg || b.bg};color:${label.c || b.c}">${esc(label.t)}</span></div>`;
};
const notesBox = list => `<div style="border-top:1px solid var(--line);padding-top:16px;display:flex;flex-direction:column;gap:8px"><div style="font-weight:800;font-size:13px;letter-spacing:.8px;color:var(--muted)">AÇIKLAMA</div>
  ${list.length ? list.map((t, i) => `<div style="display:flex;gap:10px;line-height:1.55"><span style="flex:0 0 22px;font-weight:800;color:#0B6E4F">${i + 1}.</span><span>${t}</span></div>`).join("") : `<div class="muted">Bu dönem için açıklama girilmemiş.</div>`}</div>`;
// Dikey sütun grafiği (yatay çubuğun alternatifi); items: [{ name, v, label }]
const vbars = (items, hf) => {
  const mw = Math.max(items.length * 72, 240);
  return `<div style="overflow-x:auto"><div style="min-width:${mw}px;display:flex;flex-direction:column;gap:8px">
    <div style="display:flex;gap:12px;align-items:flex-end;height:236px;position:relative;border-bottom:1.5px solid #9FB4AE;background:repeating-linear-gradient(to top,transparent 0,transparent 49px,#E4ECE9 49px,#E4ECE9 50px)">
      ${items.map(i => { const b = i.v === null ? NONE : BAND[i.label.band], h = i.v === null ? 0 : Math.round(Math.max(0, Math.min(100, i.v)) * 2);
        return `<div style="flex:1;min-width:56px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end"><span style="font-weight:700;font-size:13px;margin-bottom:4px">${i.v === null ? "–" : f1(i.v)}</span><div style="width:min(46px,72%);height:${h}px;min-height:${i.v === null ? 0 : 3}px;border-radius:8px 8px 0 0;background:${b.fill}"></div></div>`; }).join("")}${hf ? `<span style="position:absolute;left:0;right:0;bottom:${Math.round(hf * 2)}px;border-top:2px solid #0B6E4F;pointer-events:none"></span>` : ""}</div>
    <div style="display:flex;gap:12px">${items.map(i => { const b = i.v === null ? NONE : BAND[i.label.band];
      return `<div style="flex:1;min-width:56px;display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center"><span style="font-size:12px;font-weight:600;line-height:1.25;word-break:break-word">${esc(i.name)}</span>${i.sub === undefined ? "" : `<span ${i.sub.t ? `title="${esc(i.sub.title)}"` : ""} style="font-size:10.5px;font-weight:700;line-height:13px;min-height:13px;color:#8E1B16;text-align:center">${esc(i.sub.t || "")}</span>`}<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:${i.label.bg || b.bg};color:${i.label.c || b.c}">${esc(i.label.t)}</span></div>`; }).join("")}</div></div></div>`;
};
// Grafik görünümü seçici: yatay çubuk / dikey sütun (yazdırmada gizlenir, seçilen görünüm basılır)
const toggle = id => { const v = R.vert.has(id), btn = (on, vt, title, svg) => `<button class="sec" data-vt="${id}" data-to="${vt}" title="${title}" aria-label="${title}" aria-pressed="${on}" style="height:30px;width:34px;min-width:0;padding:0;border-radius:8px;display:flex;align-items:center;justify-content:center;${on ? "background:#0B6E4F;color:#fff;border-color:#0B6E4F" : "background:#fff;color:#546964"}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">${svg}</svg></button>`;
  return `<span class="noprint" style="display:inline-flex;gap:4px;margin-left:12px;vertical-align:middle">${btn(!v, "h", "Yatay çubuk", '<path d="M4 6h14M4 12h10M4 18h16"/>')}${btn(v, "v", "Dikey sütun", '<path d="M6 20V10M12 20V4M18 20v-7"/>')}${id === "isg" && R.wkOk ? `<button class="sec" data-wk="1" title="Son hafta" aria-label="Son hafta" aria-pressed="${R.wk}" style="height:30px;min-width:0;padding:0 10px;border-radius:8px;font-size:12.5px;font-weight:700;${R.wk ? "background:#0B6E4F;color:#fff;border-color:#0B6E4F" : "background:#fff;color:#546964"}">Son hafta</button>` : ""}</span>`; };
const card = (title, sub, body, tg) => `<div class="cd" style="gap:18px"><div class="row sp" style="align-items:baseline"><h2>${title}${tg ? toggle(tg) : ""}</h2><div class="muted" style="font-size:13px">${sub}</div></div>${body}</div>`;

const imgH = p => `<img data-pid="${p.id}" src="${R.ph[p.id] || p.t}" alt="Fotoğraf" style="height:227px;width:auto;max-width:100%;border-radius:8px;border:1px solid #C3D1CC;background:#EEF2F0">`;
const fxDate = at => { const d = new Date(at); return at ? `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}` : ""; };
const fxTick = '<span style="flex:0 0 16px;width:16px;height:16px;border-radius:4px;background:#0B6E4F;display:inline-flex;align-items:center;justify-content:center;margin-top:2px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l5 5L20 6"/></svg></span>';
// Aksiyon alındı satırı: kişi adı yazılmaz; yalnızca tarih ve aksiyon açıklaması
const fxLine = fx => `<span style="display:flex;gap:8px;align-items:flex-start;padding:7px 10px;border-radius:6px;border-left:4px solid #0B6E4F;background:#EAF7F1">${fxTick}<span><b style="color:#0B6E4F">Aksiyon alındı</b>${fx.at ? ` <span class="muted" style="white-space:nowrap">· ${fxDate(fx.at)}</span>` : ""}<br>${esc(fx.tx)}</span></span>`;
const fxCol = (lbl, list, c) => `<span style="display:flex;flex-direction:column;gap:4px"><span style="font-size:11px;font-weight:800;letter-spacing:.6px;color:${c}">${lbl}</span><span style="display:flex;flex-wrap:wrap;gap:10px">${list.map(imgH).join("")}</span></span>`;
function g6Body(a, mpre) {
  const tail = `<b style="white-space:nowrap">${esc(a.dept)}</b> <span class="muted" style="white-space:nowrap">· sıklık ${a.f}</span>`;
  const anyFx = a.notes.some(n => n.fx);
  if (!anyFx && (!R.pics || !a.notes.some(n => n.pics.length))) return `${mpre(a.mi)}${esc(a.notes.length ? a.notes.map(n => n.t).join("; ") : a.text)} ${tail}`;
  return `<span style="display:flex;flex-direction:column;gap:8px">${a.notes.map((n, i) => `<span data-brk style="display:flex;flex-direction:column;gap:6px"><span>${i ? "" : mpre(a.mi)}${esc(n.t)}${anyFx || i === a.notes.length - 1 ? " " + tail : ""}</span>${n.fx ? fxLine(n.fx) : ""}${R.pics && n.fx && (n.pics.length || n.fx.ph.length) ? `<span style="display:flex;flex-wrap:wrap;gap:16px">${n.pics.length ? fxCol("AKSİYON ÖNCESİ", n.pics, "#B3261E") : ""}${n.fx.ph.length ? fxCol("AKSİYON SONRASI", n.fx.ph, "#0B6E4F") : ""}</span>` : R.pics && n.pics.length ? `<span style="display:flex;flex-wrap:wrap;gap:10px">${n.pics.map(imgH).join("")}</span>` : ""}</span>`).join("")}</span>`;
}
// Resimlerin tam boyutlu hâlini yükle (küçük resimle başlar)
async function hydrate(v, st) {
  const imgs = [...v.querySelectorAll("img[data-pid]")];
  await Promise.all(imgs.map(async im => {
    const id = im.dataset.pid; if (!R.ph[id]) { try { R.ph[id] = await S.getPhoto(st.fid, st.year, id); } catch { } }
    if (R.ph[id]) { im.src = R.ph[id]; try { await im.decode(); } catch { } }
  }));
}
function draw(v, st, setup, data) {
  const p = setup.params || DEFAULT_PARAMS, rows = setup.rows, y = st.year, fname = st.factories.find(f => f.id === st.fid)?.name || "";
  const multi = R.per !== "m", ms = multi ? Array.from({ length: LAST[R.per] }, (_, i) => i + 1) : [R.month], m = R.month;
  const plabel = multi ? `${PN[R.per]} ${y}` : `${MONTHS[m - 1]} ${y}`;
  const bn = s => bandOf(s, p), bl = s => (s === null ? { t: "Veri yok" } : { t: bn(s), ...BAND[bn(s)] });
  const W = [num(p.w.kaza), num(p.w.konusma), num(p.w.isbasi), num(p.w.isg)];
  const avgOf = a => (a.length ? a.reduce((s, c) => s + c, 0) / a.length : null);
  const mpre = mi => (multi ? `<b>${MONTHS[mi - 1]}:</b> ` : "");
  // Yıllık rapor: yıl içinde 20+ gün kayıplı, uzuv kaybı veya ölümlü kaza olan bölüm için bayrak (puanı etkilemez)
  const FK = [[5, "Ölüm", "Ölümlü kaza"], [4, "Uzuv", "Uzuv kaybı"], [3, "20+ gün", "20+ gün kayıplı kaza"]];
  const flags = {};
  if (R.per === "y") rows.forEach(r => {
    const ev = [];
    ms.forEach(mi => { const c = data.kz[pad(mi)]?.rows?.[r.id]?.c || []; FK.forEach(([k, s, l]) => { if (+c[k] > 0) ev.push({ k, s, l, mi, n: +c[k] }); }); });
    if (!ev.length) { flags[r.id] = { t: "" }; return; }
    ev.sort((a, b) => b.k - a.k || a.mi - b.mi);
    const e = ev[0], more = ev.length - 1;
    flags[r.id] = { t: `⚑ ${e.s} · ${MONTHS[e.mi - 1].slice(0, 3)}${more ? " +" + more : ""}`, title: ev.map(x => `${MONTHS[x.mi - 1]}: ${x.l}${x.n > 1 ? " ×" + x.n : ""}`).join("; ") };
  });
  const sub = r => (R.per === "y" ? flags[r.id] : undefined);
  const mv = { kaza: {}, konusma: {}, isbasi: {}, isg: {} }, val = { kaza: {}, konusma: {}, isbasi: {}, isg: {} }, isgList = [], monthsWith = new Set();
  rows.forEach(r => { ["kaza", "konusma", "isbasi", "isg"].forEach(k => { mv[k][r.id] = []; }); });
  ms.forEach(mi => {
    const mm = pad(mi), kz = data.kz[mm], kn = data.kn[mm], ib = data.ib[mm];
    if (kz?.result || kn?.result || ib?.result) monthsWith.add(mi);
    rows.forEach(r => {
      const a = fin(kz?.result?.per?.[r.id]?.verim); if (a !== null) mv.kaza[r.id].push(a);
      const b = fin(konusmaPct(kn?.result?.per?.[r.id], st.year, mi)); if (b !== null) mv.konusma[r.id].push(b);
      const x = ib?.result?.per?.[r.id]; if (x?.state === "ok" && fin(x.verim) !== null) mv.isbasi[r.id].push(x.verim);
      const d = data.ig[`${mm}_${r.id}`];
      const mo = d && d.sessions?.length ? isgMonth({ cats: CATS, sessions: d.sessions, freqOv: d.freq || {}, bonusIdx: d.bonus || 0, F: katsayi(r, +mm), p, yog: surecVar(st.year, +mm), mak: makTier(r) }) : null, cc = mo ? mo.c : null;
      const sc = mo ? fin(+mo.score.toFixed(2)) : fin(d?.result?.score);
      if (sc !== null) { mv.isg[r.id].push(sc); monthsWith.add(mi); }
      if (cc) isgList.push({ mi, r, d, c: cc });
    });
  });
  rows.forEach(r => { ["kaza", "konusma", "isbasi", "isg"].forEach(k => { val[k][r.id] = avgOf(mv[k][r.id]); }); });
  const partial = multi && monthsWith.size > 0 && monthsWith.size < ms.length;
  const KEYS = ["kaza", "konusma", "isbasi", "isg"], TITLE = ["İş Kazası", "Eğitim Konuşması", "İşbaşı Eğitim", "İSG Denetim"];
  const modHas = KEYS.map(k => rows.some(r => val[k][r.id] !== null));
  const total = {};
  rows.forEach(r => { let a = 0, dn = 0; KEYS.forEach((k, i) => { const x = val[k][r.id]; if (x !== null) { a += x * W[i]; dn += W[i]; } }); total[r.id] = dn > 0 ? a / dn : null; });
  const tv = rows.filter(r => total[r.id] !== null);
  const avg = avgOf(tv.map(r => total[r.id]));
  const anyData = tv.length > 0;

  const hedef = num(p.esik.h ?? "90") || 90, hitN = tv.filter(r => total[r.id] >= hedef).length;
  // Grafik 1
  const rank = tv.slice().sort((a, b) => total[b.id] - total[a.id]);
  const c1 = [];
  if (anyData) {
    c1.push(`Tesis ortalaması ${f1(avg)} ile "${bn(avg)}" seviyesindedir.${rank.filter(r => total[r.id] >= num(p.esik.m)).length ? ` ${rank.filter(r => total[r.id] >= num(p.esik.m)).map(r => esc(r.name)).join(", ")} "Mükemmel" eşiğinin üzerindedir.` : ""}`);
    const top = rank[0], low = rank[rank.length - 1];
    if (rank.length > 1) c1.push(`En yüksek verim ${esc(top.name)} (${f1(total[top.id])}), en düşük verim ${esc(low.name)} (${f1(total[low.id])}).`);
    const crit = rank.filter(r => bn(total[r.id]) === "Kritik"), mid = rank.filter(r => bn(total[r.id]) === "Orta");
    if (crit.length) c1.push(`${crit.map(r => `${esc(r.name)} (${f1(total[r.id])})`).join(", ")} "Kritik" seviyededir; öncelikli aksiyon gerekir.`);
    if (mid.length) c1.push(`${mid.map(r => `${esc(r.name)} (${f1(total[r.id])})`).join(", ")} "Orta" seviyededir.`);
    const nodata = rows.filter(r => total[r.id] === null);
    if (nodata.length) c1.push(`Bu dönemde verisi olmayan bölümler: ${nodata.map(r => esc(r.name)).join(", ")}.`);
  }

  // Grafik 2
  const mavg = KEYS.map((k, i) => avgOf(rows.map(r => val[k][r.id]).filter(x => x !== null)));
  const wTot = (() => { let a = 0, d = 0; mavg.forEach((x, i) => { if (x !== null) { a += x * W[i]; d += W[i]; } }); return d ? a / d : null; })();
  const c2 = [`Toplam verim, modül verimlerinin Ayarlar'daki ağırlıklarla (${W.join(" / ")}) hesaplanan ortalamasıdır; verisi olmayan modül (ör. işe giriş olmayan bölümde işbaşı eğitim) hesaba katılmaz ve ağırlıklar kalan modüllere yeniden dağıtılır.`];
  const ord = KEYS.map((k, i) => [mavg[i], i]).filter(x => x[0] !== null).sort((a, b) => a[0] - b[0]);
  if (ord.length > 1) c2.push(`En düşük modül ${TITLE[ord[0][1]]} (${f1(ord[0][0])}); iyileştirme çalışması öncelikle bu alana yönelmelidir.`);
  const g2v = vbars(KEYS.map((k, i) => mavg[i] === null ? null : ({ name: TITLE[i], v: mavg[i], label: { band: bn(mavg[i]), t: "Ağırlık %" + W[i], c: "#2A3F3A", bg: "#E4ECE9" } })).filter(Boolean));
  const g2 = KEYS.map((k, i) => (mavg[i] === null ? "" : bar(TITLE[i], mavg[i], 0, { band: bn(mavg[i]), t: "Ağırlık %" + W[i], c: "#2A3F3A", bg: "#E4ECE9" }, true))).join("");

  // modül kartları
  // İSG · "Son hafta" sekmesi: dönemin son denetim haftası; puanlar ay başından o haftanın sonuna birikimli, yalnız o hafta denetlenen bölümler
  const WD = rows.flatMap(r => ms.map(mi => { const d = data.ig[`${pad(mi)}_${r.id}`]; return d?.sessions?.length ? { m: mi, id: r.id, sessions: d.sessions, freq: d.freq, bonus: d.bonus } : null; })).filter(Boolean);
  const wk = lastWeekKey(WD, ms); R.wkOk = !!wk;
  const wmode = !!wk && R.wk, wsc = wmode ? weekScores(WD, rows, p, y, wk) : {}, wlab = wmode ? weekLabel(WD, wk, y) : "";
  const modBars = (k, vid) => vid && R.vert.has(vid) ? vbars(rows.map(r => { const x = k === "isg" && wmode ? (wsc[r.id] ?? null) : val[k][r.id]; return { name: r.name, sub: k === "kaza" ? sub(r) : undefined, v: x, label: x === null ? { t: k === "isbasi" && !multi && data.ib[pad(m)]?.result?.per?.[r.id]?.state === "none" ? "Giriş yok" : k === "isg" ? (wmode ? "Denetlenmedi" : "Denetim yok") : "Veri yok", band: "İyi" } : { t: bn(x), band: bn(x) } }; })) : `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr));gap:10px 36px">${rows.map(r => { const x = k === "isg" && wmode ? (wsc[r.id] ?? null) : val[k][r.id]; return bar(r.name, x, 0, x === null ? { t: k === "isbasi" && !multi && data.ib[pad(m)]?.result?.per?.[r.id]?.state === "none" ? "Giriş yok" : k === "isg" ? (wmode ? "Denetlenmedi" : "Denetim yok") : "Veri yok", band: "İyi", ...NONE } : { t: bn(x), band: bn(x) }, true, undefined, undefined, k === "kaza" ? sub(r) : undefined); }).join("")}</div>`;
  const noteTxt = (r, n) => `${esc(n)} <b style="white-space:nowrap">— ${esc(r.name)}</b>`;
  const nk = [], nn = [], ni = [];
  let kT = 0, kL = 0, kAny = false, hired = 0, trained = 0, oos = 0, ibAny = false, cnCnt = 0, cnHit = 0, knAny = false;
  ms.forEach(mi => {
    const mm = pad(mi), kz = data.kz[mm], kn = data.kn[mm], ib = data.ib[mm];
    if (kz?.result) { kAny = true; kT += kz.result.total || 0; kL += kz.result.lost || 0;
      rows.forEach(r => { const x = kz.result.per?.[r.id]; if (x?.count > 0) { const n = (kz.rows?.[r.id]?.note || "").trim(); nk.push(`${mpre(mi)}${n ? noteTxt(r, n) : `<i>Açıklama girilmemiş</i> <b>— ${esc(r.name)}</b>`} <span class="muted" style="white-space:nowrap">· ${x.count} olay · verim ${f1(x.verim)}</span>`); } }); }
    if (kn?.result) { knAny = true; cnCnt += (kn.result.counted || 0) + rows.filter(r => konusmaSifir(kn.result.per?.[r.id], st.year, mi)).length; cnHit += kn.result.hit || 0;
      rows.forEach(r => { const x = fin(konusmaPct(kn.result.per?.[r.id], st.year, mi)); if (x !== null && bn(x) !== "Mükemmel" && bn(x) !== "İyi") { const n = (kn.rows?.[r.id]?.note || "").trim(); nn.push(`${mpre(mi)}${n ? noteTxt(r, n) : `<i>Açıklama girilmemiş</i> <b>— ${esc(r.name)}</b>`} <span class="muted" style="white-space:nowrap">· verim ${f1(x)}</span>`); } }); }
    if (ib?.result) { ibAny = true; hired += ib.result.hired || 0; trained += ib.result.trained || 0; oos += ib.result.outOfScope || 0;
      rows.forEach(r => {
        const x = ib.result.per?.[r.id]; if (x?.state !== "ok") return;
        const g = x.g ?? 0, e = x.e ?? 0, w = Math.max(0, g - e), low = x.verim < 99.995;
        const sent = e === 0 ? `${g} işe girişin hiçbirine işbaşı eğitimi verilmedi, ${w} kişi işbaşı eğitim beklemektedir.`
          : w === 0 ? `${g} işe girişin ${e} tanesine işbaşı eğitimi verildi.`
          : `${g} işe girişin ${e} tanesine işbaşı eğitimi verildi, ${w} kişi işbaşı eğitim beklemektedir.`;
        const n = (ib.rows?.[r.id]?.note || "").trim().replace(/[.\s]+$/, "");
        ni.push(`${mpre(mi)}<b>${esc(r.name)}:</b> ${sent}${low ? ` ${n ? esc(n) + "." : "<i>Açıklama girilmemiş.</i>"} <span class="muted" style="white-space:nowrap">${e}/${g} eğitim - verim ${f1(x.verim)}</span>` : ""}`);
      }); }
  });
  if (kAny) nk.unshift(`Toplam ${kT} kaza/olay kaydedildi${kT ? `, bunun ${kL} tanesi iş günü kayıplı` : ""}.`);
  if (knAny) nn.unshift(multi ? `Dönem içinde değerlendirilen bölüm-ay kayıtlarının ${cnCnt} tanesinin ${cnHit} tanesi hedef konuşma süresine ulaştı.` : `Değerlendirilen ${cnCnt} bölümün ${cnHit} tanesi hedef konuşma süresine ulaştı.`);
  if (ibAny && oos) ni.push(`${oos} bölüm-ay kaydında işe giriş olmadığı için değerlendirme dışı bırakıldı (toplam verime katılmaz).`);
  const modCard = (k, i, title, sub, notes, vid) => modHas[i] ? card(title, sub, modBars(k, vid) + notesBox(notes), vid) : card(title, sub, `<div class="muted">${plabel} için ${TITLE[i]} verisi girilmemiş.</div>`);

  // Grafik 6 · İSG bulguları
  const catRows = CATS.map((c, ci) => ({ c, ci, items: [] })), phIds = new Set();
  isgList.forEach(({ mi, r, d, c }) => c.catInfo.forEach((info, ci) => info.items.forEach((it, ii) => {
    if (it.cnt > 0) {
      const nm = new Map();
      d.sessions.forEach(s => (s.fails[it.id] || []).forEach((t, j) => { const e = nm.get(t) || { t, pics: [] }; ((s.photos || {})[it.id + "|" + j] || []).forEach(p => { if (!e.pics.some(x => x.id === p.id)) { e.pics.push(p); phIds.add(p.id); } }); const fx = (s.fixed || {})[it.id + "|" + j]; if (fx && fx.st === "ok" && fx.t === t && (fx.tx || "").trim()) { e.fx = { tx: fx.tx.trim(), ph: (fx.ph || []).map(p => ({ ...p })), at: fx.at || 0 }; e.fx.ph.forEach(p => phIds.add(p.id)); } nm.set(t, e); }));
      const notes = [...nm.values()];
      catRows[ci].items.push({ dept: r.name, mi, text: CATS[ci].items[ii], notes, f: it.cnt });
    }
  })));
  const mx = Math.max(1, ...catRows.map(x => x.items.length)), anyIsg = isgList.length > 0;
  const fxTotal = catRows.reduce((a, x) => a + x.items.reduce((b, it) => b + it.notes.filter(n => n.fx).length, 0), 0), fxAny = fxTotal > 0;
  const g6 = anyIsg ? card("Grafik 6 · İSG Bulgu Dağılımı", `Kategori bazında uygunsuz madde sayısı${fxAny ? ` · ${fxTotal} aksiyon alındı` : ""}`,
    `<div class="col1" style="gap:10px">${catRows.map(x => `<div style="display:flex;align-items:center;gap:12px"><span style="width:min(190px,34%);flex:0 0 min(190px,34%);font-weight:600;font-size:13.5px">${esc(x.c.name)}</span>
      <div style="flex:1;min-width:40px;height:14px;border-radius:999px;background:#E4ECE9;overflow:hidden"><div style="height:100%;border-radius:999px;width:${Math.round(x.items.length / mx * 100)}%;background:${CCOL[x.ci % 8]}"></div></div><span style="width:28px;text-align:right;font-weight:700">${x.items.length}</span>${fxAny ? `<span style="width:84px;flex:0 0 84px;font-size:11.5px;font-weight:700;color:#0B6E4F">${(n => n ? "✓ " + n + " aksiyon" : "")(x.items.reduce((a, it) => a + it.notes.filter(n => n.fx).length, 0))}</span>` : ""}</div>`).join("")}</div>
    <div style="border-top:1px solid var(--line);padding-top:16px;display:flex;flex-direction:column;gap:16px"><div style="font-weight:800;font-size:13px;letter-spacing:.8px;color:var(--muted)">AÇIKLAMA</div>
    ${catRows.filter(x => x.items.length).map(x => `<div class="col1" style="gap:6px"><div data-brk style="display:flex;align-items:center;gap:10px;break-after:avoid"><span style="width:10px;height:10px;border-radius:3px;background:${CCOL[x.ci % 8]}"></span><span style="font-weight:800">${esc(x.c.name)}</span></div>
      ${x.items.map((a, k) => `<div data-brk style="display:flex;gap:10px;line-height:1.55;padding-left:20px"><span style="flex:0 0 22px;font-weight:800;color:#145F96">${k + 1}.</span><span>${g6Body(a, mpre)}</span></div>`).join("")}</div>`).join("") || `<div class="muted">Bu ay uygunsuz bulgu yok.</div>`}</div>`) : "";

  // Kapsam + ramak kala
  let scope = "";
  if (anyIsg) {
    const full = [], lines = [];
    rows.forEach(r => {
      const os = isgList.filter(x => x.r.id === r.id); if (!os.length) return;
      const ydc = new Set(), reasons = new Map();
      os.forEach(o => { o.c.catInfo.forEach((i, ci) => { if (i.allYD) ydc.add(ci); }); o.d.sessions.forEach(s => Object.entries(s.yd || {}).forEach(([ci, t]) => { if (t) reasons.set(+ci, t); })); });
      if (!ydc.size) { full.push(r.name); return; }
      const pct = Math.round(os.reduce((a, o) => a + o.c.ydPct, 0) / os.length), low = pct > 50;
      lines.push(`<div style="display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:10px 12px;border-radius:12px;background:${low ? "#FBE9C6" : "#EEF3F1"}"><b style="color:${low ? "#5A3300" : "#2A3F3A"}">${esc(r.name)}</b>
        <span style="color:${low ? "#5A3300" : "#2A3F3A"};flex:1 1 260px">${[...ydc].map(ci => `${esc(CATS[ci].name)}: tüm maddeler Y.D.${reasons.get(ci) ? ` · "${esc(reasons.get(ci))}"` : ""}`).join(" · ")}</span>
        <span style="margin-left:auto;font-size:12px;font-weight:800;padding:3px 10px;border-radius:999px;background:#fff;color:${low ? "#5A3300" : "#2A3F3A"}">Y.D. oranı %${pct}${low ? " · kapsam düşük" : ""}</span></div>`);
    });
    const bonus = rows.filter(r => isgList.some(x => x.r.id === r.id)).map(r => { const b = isgList.filter(x => x.r.id === r.id).reduce((a, o) => a + o.c.bonus, 0); return `<span style="font-size:12.5px;font-weight:700;padding:4px 10px;border-radius:999px;background:#E4ECE9;color:#2A3F3A">${esc(r.name)} · ${b ? "+" + b : "0"}${multi ? " (toplam)" : ""}</span>`; }).join("");
    scope = `<div class="cd" style="gap:12px"><div class="row sp" style="align-items:baseline"><h2 style="font-size:16px">İSG Denetimi · Değerlendirme Kapsamı ve Ramak Kala</h2><div class="muted" style="font-size:13px">Y.D. gerekçeleri ve bildirim bonusu</div></div>
      ${lines.join("")}${full.length ? `<div style="padding:10px 12px;border-radius:12px;background:#EEF3F1;color:#2A3F3A">Tüm kategoriler değerlendirildi: <b>${full.map(esc).join(", ")}</b></div>` : ""}
      <div class="row" style="gap:8px"><span style="font-weight:700;font-size:13px;color:var(--muted)">Ramak kala bonusu:</span>${bonus}</div></div>`;
  }

  const gs = Gorev.summary(st.fid, y, ms);
  const gdonem = gs ? (gs.m0 === gs.m1 ? `${MONTHS[gs.m0 - 1]} ${y} Bulguları` : `${MONTHS[gs.m0 - 1]}-${MONTHS[gs.m1 - 1]} ${y} Bulguları`) : "";
  const gcell = (l, t) => `<div><span class="hd">${l}</span><div style="font-weight:800;font-size:18px">${t}</div></div>`;
  const grow = (name, o) => o.n ? `<div class="col1" style="gap:10px"><b>${name}</b><div class="fg">${gcell("AKTARILAN", o.n)}${gcell("KAPANAN", o.kapali)}${gcell("KAPATMA ORANI", "%" + Math.round(100 * o.kapali / o.n))}${gcell("ORT. KAPANIŞ SÜRESİ", o.nSure ? f1(o.topSure / o.nSure).replace(/,0$/, "") + " gün" : "–")}</div></div>` : "";
  const gorevCard = gs && !R.off.has("Görev takibi") ? card("Görev Takibi · Kapatma", gdonem, `<div class="col1" style="gap:18px">${grow("İSG Denetim bulguları", gs.d)}${grow("İş kazası olayları", gs.k)}</div><div class="muted" style="font-size:12.5px">Yalnızca bilgi amaçlıdır; HSE puanına dahil edilmez. Süre, görevin açılışından kapanışına kadar geçen ortalama gündür.</div>`) : "";
  const gNote = !gs && Gorev.enabled() && ["giris", "hazir", "hata"].includes(Gorev.state())
    ? `<div class="warn noprint">${Gorev.state() === "giris" ? "Görev Takibi · Kapatma kartı için görev takip programına bağlı değilsiniz. Ayarlar → Uygulama ve Senkronizasyon bölümünden \"Görev programına bağlan\" deyin."
      : Gorev.state() === "hata" ? "Görev takip programına ulaşılamadı; Görev Takibi · Kapatma kartı gösterilemiyor."
      : `${plabel} için görev programına aktarılmış denetim bulgusu veya kaza kaydı yok; Görev Takibi · Kapatma kartı bu yüzden gösterilmiyor.`}</div>` : "";
  // Denetim planı uyumu (haftalık plan · yalnızca gösterim, puanı etkilemez)
  const tmap = T.takvim(data.td), pl = rows.map(r => ({ r, u: T.donem(T.planUyum(data._s?.[r.id], y, { map: tmap, karar: data.td?.karar }), ms) })), u0 = pl[0]?.u;
  const pd = pl.reduce((a, x) => a + x.u.done + x.u.offPast, 0), pc = pl.reduce((a, x) => a + x.u.plan + x.u.offPast, 0), pt = pc ? pd / pc * 100 : null;
  const sd = (k, n) => `<span style="${T.dotCss(k, n)}"></span>`;
  const used = new Set(pl.flatMap(x => x.u.weeks.map(w => w.st))), LG = [["ok", "Zamanında (Pzt–Çar)"], ["late", "Geç (Per–Paz)"], ["miss", "Yapılmadı"], ["off", "Tatil (plan dışı)"], ["wait", "Bu hafta"], ["ask", "Karar bekliyor"], ["future", "Gelecek"]].filter(([k]) => used.has(k));
  const planRow = ({ r, u }) => `<div class="col1" style="gap:6px"><div style="display:flex;align-items:center;gap:10px"><span style="flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.name)}</span><span style="flex:0 0 auto;display:flex;align-items:baseline;gap:8px;white-space:nowrap"><span class="muted" style="font-size:12.5px">${u.plan + u.offPast ? (u.done + u.offPast) + "/" + (u.plan + u.offPast) : "–"}</span><b style="min-width:34px;text-align:right">${u.pct === null ? "–" : "%" + Math.round(u.pct)}</b></span></div>
    <div style="display:flex;flex-wrap:wrap;gap:4px">${u.weeks.map(w => `<span title="${T.range(w.a, w.z)}${w.ad ? " · " + esc(w.ad) : ""}" style="display:inline-flex">${sd(w.st, 11)}</span>`).join("")}</div></div>`;
  const planBody = `<div class="row" style="gap:14px;font-size:12px;color:var(--muted)">${LG.map(([k, t]) => `<span class="row" style="gap:6px;flex-wrap:nowrap">${sd(k, 10)}${t}</span>`).join("")}</div><div class="col1" style="gap:16px">${pl.map(planRow).join("")}</div>
    <div class="muted" style="font-size:12.5px">Haftalık denetim planıdır; her hafta pazartesisinin ayına bağlanır. Tatil, plan dışı haftalar muaf sayılır (yapıldı gibi) ve yüzdeyi düşürmez. Bu kart puanı etkilemez.</div>`;
  const planCard = u0 && u0.total && !R.off.has("Denetim planı") ? `<div class="cd" style="gap:18px"><div class="row sp" style="align-items:center;flex-wrap:nowrap;gap:12px"><div style="min-width:0"><h2>Denetim Planı Uyumu</h2><div class="muted" style="font-size:13px;margin-top:4px">${plabel} · ${u0.total} hafta${u0.off ? ` · ${u0.off} tatil (muaf)` : ""}${pt === null ? "" : ` · tesis %${Math.round(pt)} (${pd}/${pc})`}</div></div>
    <button class="sec noprint" data-pl aria-expanded="${R.plOpen}" aria-label="${R.plOpen ? "Kartı kapat" : "Kartı aç"}" style="width:40px;height:40px;padding:0;flex:0 0 40px;display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${R.plOpen ? 180 : 0}deg)"><path d="M6 9l6 6 6-6"/></svg></button></div>
    <div class="col1 plc" ${R.plOpen ? "" : "hidden"} style="gap:14px;border-top:1px solid var(--line);padding-top:14px">${planBody}</div></div>` : "";
  const inc = ["Genel verim", "Modül verimleri", ...TITLE.filter((_, i) => modHas[i]), ...(anyIsg ? ["İSG bulgu dağılımı"] : []), ...(u0?.total ? ["Denetim planı"] : []), ...(gs ? ["Görev takibi"] : []), plabel];
  const incKeys = inc.filter(t => t !== plabel), incAllOff = incKeys.length > 0 && incKeys.every(t => R.off.has(t));
  const incOn = incKeys.filter(t => !R.off.has(t)), scopeTxt = !incOn.length ? "" : incOn.length === incKeys.length ? "Genel HSE performans değerlendirmesi" : "Kapsam: " + incOn.join(", ");
  const first1 = tv.length ? (R.vert.has("g1") ? vbars(rank.map(r => ({ name: r.name, sub: sub(r), v: total[r.id], label: { t: bn(total[r.id]), band: bn(total[r.id]) } })), hedef) : `<div class="col1" style="gap:10px">${rank.map(r => bar(r.name, total[r.id], 0, { t: bn(total[r.id]), band: bn(total[r.id]) }, false, 72, hedef, sub(r))).join("")}</div>`) : `<div class="muted">Bu dönem için henüz kayıtlı veri yok.</div>`;
  const hLeg = tv.length ? `<div class="muted" style="display:flex;align-items:center;gap:8px;font-size:12.5px"><span style="width:18px;border-top:2px solid #0B6E4F"></span>Hedef ${hedef}</div>` : "";

  v.innerHTML = `
  <div class="row sp"><div class="col1" style="gap:6px"><h1 class="ttl">${multi ? PER[R.per] : "Aylık"} HSE Raporu</h1>
    <div class="sub">${esc(fname)} · ${plabel} · ${rows.length} bölüm${scopeTxt ? " · " + esc(scopeTxt) : ""}</div></div>
    <div class="row noprint" style="gap:12px"><select id="rPer" class="inp" style="width:auto;min-width:150px;font-weight:600">${Object.entries(PER).map(([k, n]) => `<option value="${k}" ${k === R.per ? "selected" : ""}>${n}</option>`).join("")}</select>
      ${multi ? "" : `<select id="rAy" class="inp" style="width:auto;min-width:150px;font-weight:600">${MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === m ? "selected" : ""}>${n} ${y}</option>`).join("")}</select>`}
      ${phIds.size ? `<label class="row" style="gap:8px;flex-wrap:nowrap;font-weight:600;cursor:pointer"><input type="checkbox" id="rPic" ${R.pics ? "checked" : ""} style="width:20px;height:20px"> Resimleri ekle (${phIds.size})</label>` : ""}
      <button id="rPdf" style="height:44px;padding:0 20px;border-radius:12px;background:#0B6E4F;color:#fff;font-weight:700">PDF indir</button></div></div>
  ${partial ? `<div class="warn">Kısmi dönem: ${ms.length} aydan ${monthsWith.size} tanesi için veri var. Değerler mevcut aylar üzerinden hesaplandı.</div>` : ""}
  ${anyData ? "" : `<div class="warn">${plabel} için kayıtlı veri bulunamadı. Başka bir ay seçin veya aylık giriş sayfalarından veri kaydedin.</div>`}
  <div class="cd" style="gap:12px;padding:14px 18px"><div class="row sp" style="flex-wrap:nowrap;align-items:center"><span style="font-weight:700">Rapora dahil:</span>
    <button type="button" id="incClr" class="sec noprint" style="display:flex;align-items:center;gap:6px;height:34px;min-height:0;padding:0 12px;border-radius:999px;font-size:13px;font-weight:700" title="${incAllOff ? "Tümünü rapora ekle" : "Tüm seçimleri temizle"}">${incAllOff ? "&#10003; Tümünü seç" : "&#10005; Temizle"}</button></div>
    <div class="row" style="gap:12px;flex-wrap:wrap">${inc.map(t => t === plabel ? `<span style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:#D9F1E6;color:#0B6E4F;font-weight:700;font-size:13px">&#10003; ${esc(t)}</span>`
    : R.off.has(t) ? `<button class="incb noprint" data-inc="${esc(t)}" aria-pressed="false" title="Rapora eklemek için dokunun" style="display:flex;align-items:center;gap:8px;padding:6px 12px;height:auto;min-height:0;border-radius:999px;background:#fff;color:#10201C;border:1px solid #C3D1CC;font-weight:600;font-size:13px">${esc(t)}</button>`
    : `<button class="incb" data-inc="${esc(t)}" aria-pressed="true" title="Rapordan çıkarmak için dokunun" style="display:flex;align-items:center;gap:8px;padding:6px 12px;height:auto;min-height:0;border-radius:999px;background:#D9F1E6;color:#0B6E4F;border:1px solid #D9F1E6;font-weight:700;font-size:13px">&#10003; ${esc(t)}</button>`).join("")}</div></div>
  ${!R.off.has("Genel verim") ? card("Grafik 1 · Bölüm HSE Verimi (Genel)", `${plabel} · tesis ortalaması ${avg === null ? "–" : f1(avg)} · hedef ${hedef}: ${hitN}/${tv.length} bölüm`, first1 + hLeg + (anyData ? notesBox(c1) : ""), "g1") : ""}
  ${anyData && !R.off.has("Modül verimleri") ? card("Grafik 2 · Modül Verimleri", `Ağırlıklı toplam ${wTot === null ? "–" : f1(wTot)} · ağırlıklar ${W.join(" / ")}`, (R.vert.has("g2") ? g2v : `<div class="col1" style="gap:10px">${g2}</div>`) + notesBox(c2), "g2") : ""}
  ${anyData && !R.off.has(TITLE[0]) ? modCard("kaza", 0, "Grafik 3 · İş Kazası Verimi", `${plabel} · kaza ceza puanı × bölüm katsayısı`, nk, "g3") : ""}
  ${anyData && !R.off.has(TITLE[1]) ? modCard("konusma", 1, "Grafik 4 · Eğitim Konuşması Verimi", `${plabel} · gerçekleşen süre / (kişi × hedef süre × katsayı)`, nn) : ""}
  ${anyData && !R.off.has(TITLE[2]) ? modCard("isbasi", 2, "Grafik 5 · İşbaşı Eğitim Verimi", `${plabel} · eğitim oranı × ZTF (gecikme) × TC (düzensizlik)`, ni) : ""}
  ${anyData && modHas[3] && !R.off.has(TITLE[3]) ? card("İSG Denetim Verimi", wmode ? `${wlab} · en son denetimin puanı; denetlenmeyen bölümler "Denetlenmedi"` : `${plabel} · dönemdeki denetimlerin puan ortalaması`, modBars("isg", "isg"), "isg") : ""}
  ${R.off.has("İSG bulgu dağılımı") ? "" : g6}${R.off.has(TITLE[3]) ? "" : scope}
  ${planCard}${gorevCard}${gNote}
  <div class="muted noprint" style="font-size:13px;line-height:1.6">Dönem raporlarında bölüm değerleri, verisi olan ayların ortalamasıdır (kümülatif: Ç1 Ocak-Mart, Ç2 Ocak-Haziran, Ç3 Ocak-Eylül). Açıklamalar, aylık giriş sayfalarında yazılan notlardan derlenir (İSG için "Uygunsuz" işaretli maddelerin notları). Metni değiştirmek için ilgili kaydı güncelleyin; rapor kendiliğinden yenilenir. PDF için tarayıcının yazdırma penceresinde "PDF olarak kaydet" seçin.</div>`;
  v.querySelector("#incClr")?.addEventListener("click", () => { incKeys.forEach(k => incAllOff ? R.off.delete(k) : R.off.add(k)); draw(v, st, setup, data); });
  v.querySelectorAll("[data-inc]").forEach(b => b.onclick = () => { const k = b.dataset.inc; R.off.has(k) ? R.off.delete(k) : R.off.add(k); draw(v, st, setup, data); });
  v.querySelectorAll("[data-wk]").forEach(b => b.onclick = () => { R.wk = !R.wk; draw(v, st, setup, data); });
  v.querySelectorAll("[data-vt]").forEach(b => b.onclick = () => { if (b.dataset.to === "v") R.vert.add(b.dataset.vt); else R.vert.delete(b.dataset.vt); draw(v, st, setup, data); });
  const rp = document.getElementById("rPic"); if (rp) rp.onchange = e => { R.pics = e.target.checked; draw(v, st, setup, data); };
  if (R.pics) hydrate(v, st);
  const pb = v.querySelector("[data-pl]"); if (pb) { const hd = pb.parentElement; hd.style.cursor = "pointer"; hd.onclick = () => { R.plOpen = !R.plOpen; draw(v, st, setup, data); }; }
  document.getElementById("rPer").onchange = e => { R.per = e.target.value; draw(v, st, setup, data); };
  const ay = document.getElementById("rAy"); if (ay) ay.onchange = e => { R.month = +e.target.value; draw(v, st, setup, data); };
  document.getElementById("rPdf").onclick = async () => {
    const o = await askFormat({ title: "Raporu PDF indir", text: `${plabel} raporu. Birden fazla sayfa olabilir; kartlar sayfa sonlarında bölünmez.`, defOrient: "portrait", hint: "Çok bölümlü tesislerde yatay düzen grafik satırlarını genişletir.", pics: phIds.size });
    if (!o) return;
    if (o.pics !== R.pics) { R.pics = o.pics; const cb = document.getElementById("rPic"); if (cb) cb.checked = o.pics; draw(v, st, setup, data); }
    const pls = [...v.querySelectorAll(".plc[hidden]")]; pls.forEach(e => { e.hidden = false; });
    const restore = () => pls.forEach(e => { e.hidden = true; });
    if (R.pics) await hydrate(v, st);
    const ttl = fileTitle(`${multi ? PER[R.per] : "Aylık"} HSE Raporu`, plabel, o.size), header = `${fname} · ${multi ? PER[R.per] : "Aylık"} HSE Raporu · ${plabel}`;
    if (o.file) { try { await saveReportPdf(document.getElementById("view") || v, { ...o, name: ttl + ".pdf", header }); restore(); return; } catch (e) { console.warn("PDF üretilemedi, yazdırmaya dönülüyor", e); } }
    printCurrent({ ...o, name: ttl, header }); window.addEventListener("afterprint", restore, { once: true });
  };
}
