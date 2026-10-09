// Aylık HSE Raporu · kayıtlı verilerden otomatik grafik + açıklama
import * as S from "./store.js?v=20261009g";
import { esc } from "./ui.js?v=20261009g";
import { CATS } from "./isgcats.js?v=20261009g";
import { bandOf, calcIsg, katsayi, DEFAULT_PARAMS, MONTHS, num } from "./scoring.js?v=20261009g";

const BAND = {
  Mükemmel: { fill: "#17A06F", c: "#0B6E4F", bg: "#D9F1E6" }, İyi: { fill: "#2A82C4", c: "#145F96", bg: "#DCEAF7" },
  Orta: { fill: "#E8A512", c: "#6B3F00", bg: "#FBE9C6" }, Kritik: { fill: "#D6382E", c: "#B3261E", bg: "#FADAD7" }
};
const NONE = { fill: "#D5E0DC", c: "#4A5C57", bg: "#EEF2F0" };
const CCOL = ["#2A82C4", "#17A06F", "#D6382E", "#F5B700", "#2A82C4", "#8A6FD1", "#17A06F", "#E8803A"];
const pad = n => String(n).padStart(2, "0");
const f1 = n => n.toFixed(1).replace(".", ",");
const fin = x => (typeof x === "number" && isFinite(x) ? x : null);
const R = { month: null, key: "" };

async function load(st) {
  const [kz, kn, ib, ig] = await Promise.all(["kaza", "konusma", "isbasi", "isg"].map(c => S.listMonthDocs(st.fid, st.year, c)));
  const by = d => Object.fromEntries(d.map(x => [x.id, x]));
  return { kz: by(kz), kn: by(kn), ib: by(ib), ig: by(ig) };
}

export async function render(v, ctx) {
  const { st } = ctx;
  const setup = await S.getSetup(st.fid, st.year);
  if (!setup?.rows?.length) { v.innerHTML = `<div class="cd"><h2>Önce bölümleri tanımlayın</h2><p class="sub">Rapor için Kurulum ve Kayıtlar sayfasında en az bir bölüm kaydedilmeli.</p><div><a href="#kurulum"><button>Kurulum'a git</button></a></div></div>`; return; }
  v.innerHTML = `<div class="sub">Rapor hazırlanıyor…</div>`;
  const data = await load(st), key = [st.fid, st.year].join("/");
  const has = m => [data.kz, data.kn, data.ib].some(c => c[pad(m)]?.result) || setup.rows.some(r => data.ig[`${pad(m)}_${r.id}`]?.result);
  if (R.key !== key || !R.month) { R.key = key; let l = 0; for (let m = 12; m >= 1; m--) if (has(m)) { l = m; break; } R.month = l || (+st.year === new Date().getFullYear() ? new Date().getMonth() + 1 : 1); }
  draw(v, st, setup, data);
}

const bar = (name, v, w, label, thin, lw) => {
  const b = v === null ? NONE : BAND[label.band];
  return `<div style="display:flex;align-items:center;gap:12px"><span style="width:96px;flex:0 0 96px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</span>
    <div style="flex:1;min-width:40px;height:${thin ? 12 : 14}px;border-radius:999px;background:#E4ECE9;overflow:hidden"><div style="height:100%;border-radius:999px;width:${v === null ? 0 : Math.max(0, Math.min(100, v))}%;background:${b.fill}"></div></div>
    <span style="width:44px;text-align:right;font-weight:700">${v === null ? "–" : f1(v)}</span>
    <span style="width:${lw || 76}px;flex:0 0 ${lw || 76}px;text-align:center;font-size:12px;font-weight:700;padding:3px 0;border-radius:999px;background:${label.bg || b.bg};color:${label.c || b.c}">${esc(label.t)}</span></div>`;
};
const notesBox = list => `<div style="border-top:1px solid var(--line);padding-top:16px;display:flex;flex-direction:column;gap:8px"><div style="font-weight:800;font-size:13px;letter-spacing:.8px;color:var(--muted)">AÇIKLAMA</div>
  ${list.length ? list.map((t, i) => `<div style="display:flex;gap:10px;line-height:1.55"><span style="flex:0 0 22px;font-weight:800;color:#0B6E4F">${i + 1}.</span><span>${t}</span></div>`).join("") : `<div class="muted">Bu ay için açıklama girilmemiş.</div>`}</div>`;
const card = (title, sub, body) => `<div class="cd" style="gap:18px"><div class="row sp" style="align-items:baseline"><h2>${title}</h2><div class="muted" style="font-size:13px">${sub}</div></div>${body}</div>`;

function draw(v, st, setup, data) {
  const p = setup.params || DEFAULT_PARAMS, rows = setup.rows, m = R.month, mm = pad(m), y = st.year, fname = st.factories.find(f => f.id === st.fid)?.name || "";
  const bn = s => bandOf(s, p), bl = s => (s === null ? { t: "Veri yok" } : { t: bn(s), ...BAND[bn(s)] });
  const W = [num(p.w.kaza), num(p.w.konusma), num(p.w.isbasi), num(p.w.isg)];
  const kz = data.kz[mm], kn = data.kn[mm], ib = data.ib[mm];
  const val = { kaza: {}, konusma: {}, isbasi: {}, isg: {} }, isgInfo = {};
  rows.forEach(r => {
    val.kaza[r.id] = fin(kz?.result?.per?.[r.id]?.verim);
    val.konusma[r.id] = fin(kn?.result?.per?.[r.id]?.pct);
    const x = ib?.result?.per?.[r.id]; val.isbasi[r.id] = x?.state === "ok" ? fin(x.verim) : null;
    const d = data.ig[`${mm}_${r.id}`];
    val.isg[r.id] = fin(d?.result?.score);
    if (d && d.sessions?.length) isgInfo[r.id] = { d, c: calcIsg({ cats: CATS, sessions: d.sessions, draft: { marks: {}, notes: {}, ydNotes: {} }, freqOv: d.freq || {}, bonusIdx: d.bonus || 0, F: katsayi(r), p }) };
  });
  const KEYS = ["kaza", "konusma", "isbasi", "isg"], TITLE = ["İş Kazası", "Eğitim Konuşması", "İşbaşı Eğitim", "İSG Denetim"];
  const modHas = KEYS.map(k => rows.some(r => val[k][r.id] !== null));
  const total = {};
  rows.forEach(r => { let a = 0, dn = 0; KEYS.forEach((k, i) => { const x = val[k][r.id]; if (x !== null) { a += x * W[i]; dn += W[i]; } }); total[r.id] = dn > 0 ? a / dn : null; });
  const tv = rows.filter(r => total[r.id] !== null), avgOf = a => (a.length ? a.reduce((s, c) => s + c, 0) / a.length : null);
  const avg = avgOf(tv.map(r => total[r.id]));
  const anyData = tv.length > 0;

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
    if (nodata.length) c1.push(`Bu ay verisi olmayan bölümler: ${nodata.map(r => esc(r.name)).join(", ")}.`);
  }

  // Grafik 2
  const mavg = KEYS.map((k, i) => avgOf(rows.map(r => val[k][r.id]).filter(x => x !== null)));
  const wTot = (() => { let a = 0, d = 0; mavg.forEach((x, i) => { if (x !== null) { a += x * W[i]; d += W[i]; } }); return d ? a / d : null; })();
  const c2 = [`Toplam verim, modül verimlerinin Ayarlar'daki ağırlıklarla (${W.join(" / ")}) hesaplanan ortalamasıdır; verisi olmayan modül (ör. işe giriş olmayan bölümde işbaşı eğitim) hesaba katılmaz ve ağırlıklar kalan modüllere yeniden dağıtılır.`];
  const ord = KEYS.map((k, i) => [mavg[i], i]).filter(x => x[0] !== null).sort((a, b) => a[0] - b[0]);
  if (ord.length > 1) c2.push(`En düşük modül ${TITLE[ord[0][1]]} (${f1(ord[0][0])}); iyileştirme çalışması öncelikle bu alana yönelmelidir.`);
  const g2 = KEYS.map((k, i) => (mavg[i] === null ? "" : bar(TITLE[i], mavg[i], 0, { band: bn(mavg[i]), t: "Ağırlık %" + W[i], c: "#2A3F3A", bg: "#E4ECE9" }, true))).join("");

  // modül kartları
  const modBars = k => `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr));gap:10px 36px">${rows.map(r => { const x = val[k][r.id]; return bar(r.name, x, 0, x === null ? { t: k === "isbasi" && ib?.result?.per?.[r.id]?.state === "none" ? "Giriş yok" : "Veri yok", band: "İyi", ...NONE } : { t: bn(x), band: bn(x) }, true); }).join("")}</div>`;
  const noteTxt = (r, n) => `${esc(n)} <b style="white-space:nowrap">— ${esc(r.name)}</b>`;
  const nk = [], nn = [], ni = [];
  if (kz?.result) {
    nk.push(`Toplam ${kz.result.total || 0} kaza/olay kaydedildi${kz.result.total ? `, bunun ${kz.result.lost || 0} tanesi iş günü kayıplı` : ""}.`);
    rows.forEach(r => { const x = kz.result.per?.[r.id]; if (x?.count > 0) { const n = (kz.rows?.[r.id]?.note || "").trim(); nk.push(`${n ? noteTxt(r, n) : `<i>Açıklama girilmemiş</i> <b>— ${esc(r.name)}</b>`} <span class="muted" style="white-space:nowrap">· ${x.count} olay · verim ${f1(x.verim)}</span>`); } });
  }
  if (kn?.result) {
    nn.push(`Değerlendirilen ${kn.result.counted} bölümün ${kn.result.hit} tanesi hedef konuşma süresine ulaştı; ortalama ${fin(kn.result.avg) === null ? "–" : f1(kn.result.avg)}.`);
    rows.forEach(r => { const x = val.konusma[r.id]; if (x !== null && bn(x) !== "Mükemmel" && bn(x) !== "İyi") { const n = (kn.rows?.[r.id]?.note || "").trim(); nn.push(`${n ? noteTxt(r, n) : `<i>Açıklama girilmemiş</i> <b>— ${esc(r.name)}</b>`} <span class="muted" style="white-space:nowrap">· verim ${f1(x)}</span>`); } });
  }
  if (ib?.result) {
    ni.push(`${ib.result.hired} işe girişin ${ib.result.trained} tanesine işbaşı eğitimi verildi.${ib.result.outOfScope ? ` ${ib.result.outOfScope} bölümde işe giriş olmadığı için değerlendirme dışı bırakıldı (toplam verime katılmaz).` : ""}`);
    rows.forEach(r => { const x = ib.result.per?.[r.id]; if (x?.state === "ok" && x.verim < 99.995) { const n = (ib.rows?.[r.id]?.note || "").trim(); ni.push(`${n ? noteTxt(r, n) : `<i>Açıklama girilmemiş</i> <b>— ${esc(r.name)}</b>`} <span class="muted" style="white-space:nowrap">· ${x.e}/${x.g} eğitim · verim ${f1(x.verim)}</span>`); } });
  }
  const modCard = (k, i, title, sub, notes) => modHas[i] ? card(title, sub, modBars(k) + notesBox(notes)) : card(title, sub, `<div class="muted">${MONTHS[m - 1]} ${y} için ${TITLE[i]} verisi girilmemiş.</div>`);

  // Grafik 6 · İSG bulguları
  const catRows = CATS.map((c, ci) => ({ c, ci, items: [] }));
  Object.entries(isgInfo).forEach(([id, o]) => {
    const r = rows.find(x => x.id === id);
    o.c.catInfo.forEach((info, ci) => info.items.forEach((it, ii) => {
      if (it.cnt > 0) {
        const notes = [...new Set(o.d.sessions.flatMap(s => s.fails[it.id] || []))];
        catRows[ci].items.push({ dept: r.name, text: CATS[ci].items[ii], notes, f: it.cnt });
      }
    }));
  });
  const mx = Math.max(1, ...catRows.map(x => x.items.length)), anyIsg = Object.keys(isgInfo).length > 0;
  const g6 = anyIsg ? card("Grafik 6 · İSG Bulgu Dağılımı", "Kategori bazında uygunsuz madde sayısı",
    `<div class="col1" style="gap:10px">${catRows.map(x => `<div style="display:flex;align-items:center;gap:12px"><span style="width:min(190px,34%);flex:0 0 min(190px,34%);font-weight:600;font-size:13.5px">${esc(x.c.name)}</span>
      <div style="flex:1;min-width:40px;height:14px;border-radius:999px;background:#E4ECE9;overflow:hidden"><div style="height:100%;border-radius:999px;width:${Math.round(x.items.length / mx * 100)}%;background:${CCOL[x.ci % 8]}"></div></div><span style="width:28px;text-align:right;font-weight:700">${x.items.length}</span></div>`).join("")}</div>
    <div style="border-top:1px solid var(--line);padding-top:16px;display:flex;flex-direction:column;gap:16px"><div style="font-weight:800;font-size:13px;letter-spacing:.8px;color:var(--muted)">AÇIKLAMA</div>
    ${catRows.filter(x => x.items.length).map(x => `<div class="col1" style="gap:6px"><div style="display:flex;align-items:center;gap:10px"><span style="width:10px;height:10px;border-radius:3px;background:${CCOL[x.ci % 8]}"></span><span style="font-weight:800">${esc(x.c.name)}</span></div>
      ${x.items.map((a, k) => `<div style="display:flex;gap:10px;line-height:1.55;padding-left:20px"><span style="flex:0 0 22px;font-weight:800;color:#145F96">${k + 1}.</span><span>${esc(a.notes.length ? a.notes.join("; ") : a.text)} <b style="white-space:nowrap">${esc(a.dept)}</b> <span class="muted" style="white-space:nowrap">· sıklık ${a.f}</span></span></div>`).join("")}</div>`).join("") || `<div class="muted">Bu ay uygunsuz bulgu yok.</div>`}</div>`) : "";

  // Kapsam + ramak kala
  let scope = "";
  if (anyIsg) {
    const full = [], lines = [];
    rows.forEach(r => {
      const o = isgInfo[r.id]; if (!o) return;
      const yds = o.c.catInfo.map((i, ci) => [i, ci]).filter(x => x[0].allYD);
      if (!yds.length) { full.push(r.name); return; }
      const reasons = new Map(); o.d.sessions.forEach(s => Object.entries(s.yd || {}).forEach(([ci, t]) => { if (t) reasons.set(+ci, t); }));
      const low = o.c.ydPct > 50;
      lines.push(`<div style="display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:10px 12px;border-radius:12px;background:${low ? "#FBE9C6" : "#EEF3F1"}"><b style="color:${low ? "#5A3300" : "#2A3F3A"}">${esc(r.name)}</b>
        <span style="color:${low ? "#5A3300" : "#2A3F3A"};flex:1 1 260px">${yds.map(([i, ci]) => `${esc(CATS[ci].name)}: tüm maddeler Y.D.${reasons.get(ci) ? ` · "${esc(reasons.get(ci))}"` : ""}`).join(" · ")}</span>
        <span style="margin-left:auto;font-size:12px;font-weight:800;padding:3px 10px;border-radius:999px;background:#fff;color:${low ? "#5A3300" : "#2A3F3A"}">Y.D. oranı %${o.c.ydPct}${low ? " · kapsam düşük" : ""}</span></div>`);
    });
    const bonus = rows.filter(r => isgInfo[r.id]).map(r => { const b = isgInfo[r.id].c.bonus; return `<span style="font-size:12.5px;font-weight:700;padding:4px 10px;border-radius:999px;background:#E4ECE9;color:#2A3F3A">${esc(r.name)} · ${b ? "+" + b : "0"}</span>`; }).join("");
    scope = `<div class="cd" style="gap:12px"><div class="row sp" style="align-items:baseline"><h2 style="font-size:16px">İSG Denetimi · Değerlendirme Kapsamı ve Ramak Kala</h2><div class="muted" style="font-size:13px">Y.D. gerekçeleri ve bildirim bonusu</div></div>
      ${lines.join("")}${full.length ? `<div style="padding:10px 12px;border-radius:12px;background:#EEF3F1;color:#2A3F3A">Tüm kategoriler değerlendirildi: <b>${full.map(esc).join(", ")}</b></div>` : ""}
      <div class="row" style="gap:8px"><span style="font-weight:700;font-size:13px;color:var(--muted)">Ramak kala bonusu:</span>${bonus}</div></div>`;
  }

  const inc = ["Genel verim", "Modül verimleri", ...TITLE.filter((_, i) => modHas[i]), ...(anyIsg ? ["İSG bulgu dağılımı"] : []), `${MONTHS[m - 1]} ${y}`];
  const first1 = tv.length ? `<div class="col1" style="gap:10px">${rank.map(r => bar(r.name, total[r.id], 0, { t: bn(total[r.id]), band: bn(total[r.id]) }, false, 72)).join("")}</div>` : `<div class="muted">Bu ay için henüz kayıtlı veri yok.</div>`;

  v.innerHTML = `
  <div class="row sp"><div class="col1" style="gap:6px"><h1 class="ttl">Aylık HSE Raporu</h1>
    <div class="sub">${esc(fname)} · ${MONTHS[m - 1]} ${y} · ${rows.length} bölüm · grafikler ve açıklamalar kayıtlı verilerden otomatik hazırlanır</div></div>
    <div class="row noprint" style="gap:12px"><select id="rAy" class="inp" style="width:auto;min-width:150px;font-weight:600">${MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === m ? "selected" : ""}>${n} ${y}</option>`).join("")}</select>
      <button id="rPdf" style="height:44px;padding:0 20px;border-radius:12px;background:#0B6E4F;color:#fff;font-weight:700">PDF indir</button></div></div>
  ${anyData ? "" : `<div class="warn">${MONTHS[m - 1]} ${y} için kayıtlı veri bulunamadı. Başka bir ay seçin veya aylık giriş sayfalarından veri kaydedin.</div>`}
  <div class="cd" style="flex-direction:row;flex-wrap:wrap;gap:12px;align-items:center;padding:14px 18px"><span style="font-weight:700">Rapora dahil:</span>${inc.map(t => `<span style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:#D9F1E6;color:#0B6E4F;font-weight:700;font-size:13px">&#10003; ${esc(t)}</span>`).join("")}</div>
  ${card("Grafik 1 · Bölüm HSE Verimi (Genel)", `${MONTHS[m - 1]} ${y} · tesis ortalaması ${avg === null ? "–" : f1(avg)}`, first1 + (anyData ? notesBox(c1) : ""))}
  ${anyData ? card("Grafik 2 · Modül Verimleri", `Ağırlıklı toplam ${wTot === null ? "–" : f1(wTot)} · ağırlıklar ${W.join(" / ")}`, `<div class="col1" style="gap:10px">${g2}</div>` + notesBox(c2)) : ""}
  ${anyData ? modCard("kaza", 0, "Grafik 3 · İş Kazası Verimi", `${MONTHS[m - 1]} ${y} · kaza ceza puanı × bölüm katsayısı`, nk) : ""}
  ${anyData ? modCard("konusma", 1, "Grafik 4 · Eğitim Konuşması Verimi", `${MONTHS[m - 1]} ${y} · gerçekleşen süre / (kişi × hedef süre × katsayı)`, nn) : ""}
  ${anyData ? modCard("isbasi", 2, "Grafik 5 · İşbaşı Eğitim Verimi", `${MONTHS[m - 1]} ${y} · eğitim oranı × ZTF (gecikme) × TC (düzensizlik)`, ni) : ""}
  ${anyData && modHas[3] ? card("İSG Denetim Verimi", `${MONTHS[m - 1]} ${y} · denetim sıklığı × kategori ağırlığı × bölüm katsayısı + ramak kala bonusu`, modBars("isg")) : ""}
  ${g6}${scope}
  <div class="muted" style="font-size:13px;line-height:1.6">Açıklamalar, aylık giriş sayfalarında yazılan notlardan derlenir (İSG için "Uygunsuz" işaretli maddelerin notları). Metni değiştirmek için ilgili kaydı güncelleyin; rapor kendiliğinden yenilenir. PDF için tarayıcının yazdırma penceresinde "PDF olarak kaydet" seçin.</div>`;
  document.getElementById("rAy").onchange = e => { R.month = +e.target.value; draw(v, st, setup, data); };
  document.getElementById("rPdf").onclick = () => window.print();
}
