// İSG Denetim Listesi sayfası
import * as S from "./store.js?v=20261010h";
import { esc, ic, toast, noteEditor, compressImage, showPhoto } from "./ui.js?v=20261010h";
import { CATS } from "./isgcats.js?v=20261010h";
import { calcIsg, katsayi, bandOf, num, MONTHS, DEFAULT_PARAMS } from "./scoring.js?v=20261010h";

const COLL = "isg";
const D = { key: "", setup: null, doc: null, dept: null, month: null, open: { 0: true }, ro: false, timer: null, saved: true, msg: "" };
const W = { 3: ["Kritik ×3", "#FADAD7", "#8E1B16"], 2: ["Major ×2", "#FBE9C6", "#6B3F00"], 1: ["Minor ×1", "#DCEAF7", "#145F96"] };
const FT = [["#0B6E4F", "#FFF"], ["#F5B700", "#2B2000"], ["#F28C28", "#2B1500"], ["#B3261E", "#FFF"]];
const BAND = { Mükemmel: ["#17A06F", "#0B6E4F", "#D9F1E6"], İyi: ["#2A82C4", "#145F96", "#DCEAF7"], Orta: ["#F5B700", "#6B3F00", "#FBE9C6"], Kritik: ["#D6382E", "#B3261E", "#FADAD7"] };
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dm = s => `${s.slice(8, 10)}.${s.slice(5, 7)}`;
const dmy = s => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
const addDays = (s, n) => { const d = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); d.setDate(d.getDate() + n); return iso(d); };

function defaultMonth(year) { const n = new Date(); return +year === n.getFullYear() ? n.getMonth() + 1 : 1; }
function defaultDate(year, month) { const n = new Date(); return (+year === n.getFullYear() && month === n.getMonth() + 1) ? iso(n) : `${year}-${pad(month)}-01`; }
const blank = (year, month, auditor) => ({ sessions: [], draft: { marks: {}, notes: {}, ydNotes: {}, date: defaultDate(year, month) }, freq: {}, bonus: 0, auditor: auditor || "" });

const emptyDraft = (date, on) => ({ marks: {}, notes: {}, ydNotes: {}, photos: {}, date, on, edit: null });
// Denetim durumu: açık (devam eden) denetim varsa form onu düzenler; hepsi tamamlandıysa yeni denetim yalnızca kullanıcı isteyince başlar
function settle(doc, year, month) {
  const ss = doc.sessions, dr = doc.draft;
  ss.forEach((x, i) => { if (x.closed === undefined && i < ss.length - 1) x.closed = true; });
  if (dr.on === undefined) { const has = Object.keys(dr.marks || {}).length > 0; dr.on = has || !ss.length; if (has && ss.length) ss[ss.length - 1].closed = true; }
  if (dr.edit != null && !ss.some(x => x.no === dr.edit)) dr.edit = null;
  const last = ss[ss.length - 1];
  if (!dr.on && last && !last.closed) {
    const marks = { ...(last.marks || {}) }, notes = {}, ydNotes = {};
    CATS.forEach((cat, ci) => {
      cat.items.forEach((_, ii) => {
        const id = `c${ci}i${ii}`;
        if (last.fails && last.fails[id]) { marks[id] = "x"; notes[id] = last.fails[id].length ? last.fails[id].slice() : [""]; }
        else if (!marks[id] && last.app && last.app[ci]) marks[id] = "u";
        else if (!marks[id] && last.yd && ci in last.yd) marks[id] = "n";
      });
      if (last.yd && last.yd[ci]) ydNotes[ci] = last.yd[ci];
    });
    doc.draft = { marks, notes, ydNotes, photos: JSON.parse(JSON.stringify(last.photos || {})), date: last.date, on: true, edit: last.no };
  } else if (!dr.on && !last) { doc.draft = emptyDraft(defaultDate(year, month), true); }
}

export async function render(v, ctx) {
  const { st } = ctx;
  const setup = await S.getSetup(st.fid, st.year);
  if (!setup?.rows?.length) { v.innerHTML = `<div class="cd"><h2>Önce bölümleri tanımlayın</h2><p class="sub">Denetim girişi için Kurulum ve Kayıtlar sayfasında en az bir bölüm kaydedilmeli.</p><div><a href="#kurulum"><button>Kurulum'a git</button></a></div></div>`; return; }
  D.setup = setup;
  if (!D.month) D.month = defaultMonth(st.year);
  if (!setup.rows.find(r => r.id === D.dept)) D.dept = setup.rows[0].id;
  const key = [st.fid, st.year, D.month, D.dept].join("/");
  if (D.key !== key) {
    clearTimeout(D.timer);
    const doc = await S.getMonthDoc(st.fid, st.year, COLL, `${pad(D.month)}_${D.dept}`);
    D.doc = doc ? { ...blank(st.year, D.month), ...doc, draft: { ...blank(st.year, D.month).draft, ...(doc.draft || {}) } } : blank(st.year, D.month, ctx.st.profile?.name);
    settle(D.doc, st.year, D.month);
    D.key = key; D.saved = true; D.msg = "";
  }
  D.ro = String(st.year) !== String(st.active);
  D.ctx = ctx; D.v = v;
  draw();
}

function persist(now = false) {
  if (D.ro) return;
  D.saved = false; setSv();
  clearTimeout(D.timer);
  const run = async () => {
    const { st } = D.ctx, [f, y, m, d] = D.key.split("/");
    const p = D.setup.params || DEFAULT_PARAMS, row = D.setup.rows.find(r => r.id === d);
    let result = null;
    if (D.doc.sessions.length) {
      const c = calcIsg({ cats: CATS, sessions: D.doc.sessions, draft: { marks: {}, notes: {}, ydNotes: {} }, freqOv: D.doc.freq, bonusIdx: D.doc.bonus, F: katsayi(row), p });
      result = { score: +c.score.toFixed(2), penalty: +c.penalty.toFixed(2), bonus: c.bonus, den: c.den, total: c.total, ydPct: c.ydPct, band: bandOf(c.score, p), F: +katsayi(row).toFixed(2), sessions: D.doc.sessions.length };
    }
    try { await S.saveMonthDoc(f, y, COLL, `${pad(+m)}_${d}`, { ...D.doc, result, dept: d, month: +m }); D.saved = true; } catch (e) { D.msg = "Kaydedilemedi: " + e.message; }
    setSv();
  };
  if (now) return run();
  D.timer = setTimeout(run, 700);
}
const setSv = () => { const e = document.getElementById("sv"); if (e) e.textContent = D.msg || (D.saved ? "Taslak kayıtlı" : "Kaydediliyor…"); };

const seg = (on, bg, c) => on ? `background:${bg};color:${c};border-color:${bg}` : "background:var(--card);color:var(--calct);border-color:var(--inl)";
const TONE = { u: ["#0B6E4F", "#FFF"], x: ["#B3261E", "#FFF"], n: ["#4A5C57", "#FFF"] };

function draw() {
  const { st } = D.ctx, v = D.v, doc = D.doc, setup = D.setup, p = setup.params || DEFAULT_PARAMS;
  const row = setup.rows.find(r => r.id === D.dept), F = katsayi(row);
  const on = doc.draft.on !== false, editNo = doc.draft.edit;
  const calcSessions = doc.sessions.filter(x => x.no !== editNo);
  const c = calcIsg({ cats: CATS, sessions: on ? calcSessions : doc.sessions, draft: on ? doc.draft : { marks: {}, notes: {}, ydNotes: {} }, freqOv: doc.freq, bonusIdx: doc.bonus, F, p });
  const band = bandOf(c.score, p), B = BAND[band];
  const curNo = editNo ?? (doc.sessions.length + 1), date = doc.draft.date;
  const dateOk = date && +date.slice(0, 4) === +st.year && +date.slice(5, 7) === D.month;
  const canSave = c.canSave && dateOk && !D.ro;
  const canPart = c.missing === 0 && c.ydMissing === 0 && c.curMarked && dateOk && !D.ro;
  const f1 = n => n.toFixed(1).replace(".", ",");
  const catHtml = CATS.map((cat, ci) => {
    const info = c.catInfo[ci], w = W[cat.w], open = !!D.open[ci];
    const [fb, fc] = info.hasFreq ? FT[info.freq] : ["#E4ECE9", "#4A5C57"];
    const items = cat.items.map((txt, ii) => {
      const it = info.items[ii], id = it.id, mk = it.mk, notes = doc.draft.notes[id] && doc.draft.notes[id].length ? doc.draft.notes[id] : [""];
      const prevDates = it.prev.map(s => dm(s.date));
      const fq = Math.min(c.azami, it.cnt === 0 ? 0 : it.cnt === 1 ? 1 : it.cnt <= 3 ? 2 : 3);
      const sb = k => { const [bg, col] = TONE[k]; return seg(mk === k, bg, col); };
      return `<div class="ci"><div class="cir"><div class="grow"><span>${esc(txt)}</span>
        ${prevDates.length && !it.isX ? `<span class="pill" style="background:#FBE9C6;color:#6B3F00">Önceki denetimde uygunsuzdu: ${prevDates.join(", ")}</span>` : ""}</div>
        <div class="row" style="gap:6px;flex-wrap:nowrap">${[["u", "Uygun"], ["x", "Uygunsuz"], ["n", "Y.D."]].map(([k, t]) => `<button class="mk" data-mk="${id}|${k}" style="${sb(k)}" aria-pressed="${mk === k}">${t}</button>`).join("")}</div></div>
        ${it.isX ? `<div class="xbox"><div class="row"><span class="pill" style="background:${FT[fq][0]};color:${FT[fq][1]}">Sıklık ${fq} · otomatik</span>
          <span style="font-size:12.5px;color:#5A1A16">${it.cnt === 1 ? "Bu ay ilk kez tespit edildi" : `Bu ay ${it.cnt} denetimde uygunsuz (${prevDates.concat([dm(date || "0000-00-00")]).join(", ")})`}</span></div>
          <div class="hd">AÇIKLAMA · Hangi makine veya alanda, ne gibi bir uygunsuzluk var?</div>
          ${notes.map((t, k) => `<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span style="flex:0 0 28px;padding-top:10px;font-weight:800;color:#8E1B16">${k + 1}.</span>
            <button class="nb" data-note="${id}|${k}" aria-label="Açıklamayı yaz veya düzenle"><span class="nt" style="color:${t.trim() ? "var(--text)" : "#8A6A66"}">${esc(t.trim() ? t : "Dokunun ve yazın: hangi makine veya alanda, ne gibi uygunsuzluk var?")}</span>${ic('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>', 18)}</button>
            <button class="nx" data-nrm="${id}|${k}" aria-label="Açıklamayı sil">×</button></div>
          <div class="phs">${(doc.draft.photos?.[id + "|" + k] || []).map(p => `<span class="pth"><img src="${p.t}" data-pv="${p.id}" alt="Fotoğraf"><button class="px" data-prm="${id}|${k}|${p.id}" aria-label="Fotoğrafı sil">×</button></span>`).join("")}
            ${D.ro ? "" : `<label class="pbtn">${ic('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 20)}<i>Fotoğraf çek</i><input type="file" accept="image/*" capture="environment" data-ph="${id}|${k}" hidden></label><label class="pbtn">${ic('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 9"/>', 20)}<i>Resim ekle</i><input type="file" accept="image/*" multiple data-ph="${id}|${k}" hidden></label>`}</div>`).join("")}
          <button class="sec" style="align-self:flex-start;height:38px;color:#8E1B16;border-color:#B3261E" data-nadd="${id}">+ Benzer uygunsuzluk ekle</button></div>` : ""}</div>`;
    }).join("");
    const ydBox = info.allYD ? `<div class="ydbox"><span class="hd">BU KATEGORİDE TÜM MADDELER Y.D. · KISA GEREKÇE</span>
      <input class="inp" data-yd="${ci}" value="${esc(doc.draft.ydNotes?.[ci] || "")}" aria-label="Y.D. gerekçesi" placeholder="Örn. Bölümde kimyasal kullanılmıyor">
      <span class="muted" style="font-size:12.5px">Bu kategori puanı etkilemez (ceza 0), ancak bölümün tüm kategorilerindeki payı sabit kalır. Gerekçe raporda görünür.</span></div>` : "";
    const freqBox = info.hasFreq ? `<div class="fbox"><div style="min-width:200px"><span class="hd">KATEGORİ SIKLIĞI (BU AY)</span><div class="muted" style="font-size:12.5px">${info.hasOverride ? `Elle seçildi (otomatik öneri: ${info.auto})` : `Otomatik: bu ay ${info.catCount} denetimde bulgu → sıklık ${info.auto}${cat.w === 3 ? " (kritik kategoride bulgu varsa en az 2)" : ""}`}</div></div>
      <div class="row">${[0, 1, 2, 3].filter(k => k <= c.azami).map(k => `<button class="fq" data-freq="${ci}|${k}" style="${seg(info.freq === k, FT[k][0], FT[k][1])}">${k}</button>`).join("")}
      ${info.hasOverride ? `<button class="sec" style="height:40px;color:#0F3F63;border-color:var(--inl)" data-freqreset="${ci}">Otomatiğe dön</button>` : ""}</div>
      <div class="muted" style="flex-basis:100%;font-size:12px">0 Uygun · 1 Nadiren (ayda 1) · 2 Sık (ayda 2-3) · 3 Haftalık</div></div>` : "";
    return `<div class="cat"><div class="cath"><button class="cht" data-tog="${ci}" aria-expanded="${open}"><span class="cno">${ci + 1}</span>
      <span class="grow"><b style="font-size:15px;line-height:1.35">${esc(cat.name)}</b><span class="muted" style="display:block;font-size:12.5px">${!info.hasFreq ? "Tüm maddeler Y.D. · bu dönem değerlendirme dışı" : `${esc(cat.sub)} · bu ay ${info.catCount} denetimde bulgu`}</span></span>
      <span style="transform:rotate(${open ? 180 : 0}deg);display:flex">${ic('<path d="M6 9l6 6 6-6"/>')}</span></button>
      <span class="pill" style="background:${w[1]};color:${w[2]}">${w[0]}</span>
      <span class="pill" style="min-width:74px;text-align:center;background:${fb};color:${fc}">${info.hasFreq ? "Sıklık " + info.freq : "Dışı"}</span></div>
      ${open ? `<div class="catb">${items}${ydBox}${freqBox}</div>` : ""}</div>`;
  }).join("");

  v.innerHTML = `
  <div><div class="hd" style="letter-spacing:.8px">AYLIK VERİ GİRİŞİ</div><h1 class="ttl">İSG Denetim Listesi</h1>
    <div class="muted" style="font-size:12.5px" id="sv">${D.msg || (D.saved ? "Taslak kayıtlı" : "Kaydediliyor…")}</div></div>
  ${D.ro ? `<div class="warn">${st.year} geçmiş bir yıldır, salt okunur. Değişiklik için güncel yılı seçin.</div>` : ""}
  <div class="cd" style="flex-direction:row;flex-wrap:wrap;gap:16px;padding:18px 20px">
    <div class="sf" style="flex:1 1 180px"><label class="hd" for="bolum">BÖLÜM</label><select id="bolum" class="inp">${setup.rows.map(r => `<option value="${r.id}" ${r.id === D.dept ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select></div>
    <div class="sf" style="flex:1 1 150px"><label class="hd" for="ay">DÖNEM</label><select id="ay" class="inp">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === D.month ? "selected" : ""}>${m} ${st.year}</option>`).join("")}</select></div>
    <div class="sf" style="flex:1 1 150px"><label class="hd" for="tarih">DENETİM TARİHİ</label><input id="tarih" class="inp" type="date" value="${esc(date)}" ${D.ro ? "disabled" : ""}></div>
    <div class="sf" style="flex:1 1 200px"><label class="hd" for="denetci">DENETÇİ</label><input id="denetci" class="inp" value="${esc(doc.auditor)}" placeholder="Ad Soyad" ${D.ro ? "disabled" : ""}></div></div>
  <div class="cd" style="padding:18px 20px;gap:14px"><div class="row sp"><b style="font:600 16px Sora,sans-serif">Bu Ayın Denetim Kayıtları</b>
    <span class="muted" style="font-size:12.5px">Aynı bulgu sonraki denetimlerde tekrarlanırsa sıklık otomatik artar: 1 denetim → 1 · 2-3 denetim → 2 · 4 ve üzeri → 3</span></div>
    <div class="row" style="gap:12px">${doc.sessions.map(s => { const isEd = on && s.no === editNo, lastS = s.no === doc.sessions.length;
      const stt = isEd ? "açık · düzenleniyor" : s.closed ? "tamamlandı" : "kaydedildi";
      return `<div class="sess ${isEd ? "cur" : ""}">${isEd ? '<span class="sw" style="background:#0B6E4F;border-radius:50%;margin:0"></span>' : ic('<path d="M4 12l5 5L20 6"/>').replace("currentColor", "#0B6E4F")}<div><b>${s.no}. Denetim</b><div class="muted" style="font-size:12.5px">${dmy(s.date)} · ${Object.keys(s.fails).length} uygunsuz · ${stt}</div></div>
      ${!D.ro && lastS ? `<div class="row" style="gap:6px;margin-left:auto;flex-wrap:nowrap">${!on ? `<button class="sm" data-reopen="${s.no}" style="white-space:nowrap" title="Bu denetimi tekrar açıp işaretlemeye devam et">Yeniden aç</button>` : ""}<button class="sm sec" data-delsess="${s.no}" style="white-space:nowrap" title="Bu denetimi sil">Sil</button></div>` : ""}</div>`; }).join("")}
      ${on && editNo == null ? `<div class="sess cur"><span class="sw" style="background:#0B6E4F;border-radius:50%;margin:0"></span><div><b>${curNo}. Denetim</b><div style="font-size:12.5px">${date ? dmy(date) : "—"} · ${c.curMarked ? c.curFails + " uygunsuz (taslak)" : "henüz işaretleme yok"} · yeni, kaydedilmedi</div></div></div>` : ""}</div></div>
  <div class="helpbox" style="flex-direction:row;gap:14px;align-items:flex-start">${ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h0"/>', 22)}<div style="line-height:1.6">Her maddeyi <b>Uygun</b>, <b>Uygunsuz</b> veya <b>Y.D.</b> (yok / değerlendirilmedi) olarak işaretleyin. Uygunsuz seçtiğinizde sıklık otomatik görünür ve açıklama yazmanız istenir: hangi makine veya alanda ne gibi bir uygunsuzluk var? Aynı bölümde benzer bir uygunsuzluk daha varsa yeni madde ekleyin. Açıklamalar raporda grafiklerin altında bölüm adıyla yayınlanır.</div></div>
  <fieldset class="fs" ${D.ro ? "disabled" : ""}><div class="two" style="align-items:flex-start">
    <div class="colw" style="flex:2 1 600px;gap:14px">${catHtml}</div>
    <div class="colw side" style="flex:1 1 320px;gap:16px">
      <div class="save" style="gap:16px"><h2 style="font-size:16px">Anlık İSG Skoru · Bu Ay</h2>
        <div class="row" style="gap:14px;flex-wrap:nowrap"><div style="font:700 56px/1 Sora,sans-serif;letter-spacing:-2px;color:#fff">${f1(c.score)}</div>
          <span class="pill" style="background:${B[2]};color:${B[1]}">${band}</span></div>
        <div style="position:relative;height:12px;border-radius:99px;background:rgba(255,255,255,.14)"><div style="height:12px;border-radius:99px;width:${c.score.toFixed(1)}%;background:${B[0]}"></div>
          ${[num(p.esik.o), num(p.esik.i), num(p.esik.m)].map(x => `<div style="position:absolute;top:-3px;left:${x}%;width:2px;height:18px;background:rgba(255,255,255,.55)"></div>`).join("")}</div>
        <div class="row sp" style="font-size:11px;color:#8FA8A1;margin-top:-6px"><span>0</span><span>${p.esik.o}</span><span>${p.esik.i}</span><span>${p.esik.m}</span><span>100</span></div>
        <div class="col1" style="padding-top:6px;border-top:1px solid rgba(255,255,255,.12);gap:10px">
          ${[["Değerlendirme kapsamı (ağırlık)", `<b>${c.den} / ${c.total}</b>`], ["Bölüm katsayısı", `<b>×${F.toFixed(2).replace(".", ",")}</b>`], ["Ceza puanı", `<b style="color:#FFB4AB">−${f1(c.penalty)}</b>`], ["Ramak kala bonusu", `<b style="color:#7FE3B8">+${c.bonus}</b>`], ["Y.D. işaretli madde", `<b>${c.nCount} · %${c.ydPct}</b>`]].map(([a, b]) => `<div class="row sp"><span style="color:#9DB5AE">${a}</span>${b}</div>`).join("")}
          ${c.ydPct > 50 ? `<div style="padding:10px 12px;border-radius:10px;background:#FBE9C6;color:#5A3300;font-size:12.5px;line-height:1.5;font-weight:600">Değerlendirme kapsamı düşük: maddelerin yarısından fazlası Y.D. Skor yüksek görünebilir, raporda uyarı olarak yer alır.</div>` : ""}</div></div>
      <div class="cd" style="padding:20px;gap:12px"><b style="font:600 16px Sora,sans-serif">Ramak Kala Bildirim</b>
        <div class="muted" style="font-size:12.5px;line-height:1.5">Bu dönemde bölümün bildirim sıklığı. Ceza değil, bonus puandır.</div>
        <div class="row">${["Yok", "Ayda 1", "2 Haftada 1", "Haftalık"].map((l, i) => `<button class="bn" data-bonus="${i}" style="${seg(doc.bonus === i, "#0B2230", "#FFF")}"><span>${l}</span><span style="font-size:12px;font-weight:600">+${c.bonusVals[i]} puan</span></button>`).join("")}</div></div>
      <div class="cd" style="padding:20px;gap:12px"><b style="font:600 16px Sora,sans-serif">${curNo}. Denetim · Kaydetmeden Önce</b>
        ${[["İşaretlenmeyen madde", c.unmarked], ["Açıklaması eksik uygunsuz madde", c.missing], ["Gerekçesi eksik Y.D. kategori", c.ydMissing], ["Tarih dönem dışında", dateOk ? 0 : 1]].map(([t, n]) => `<div class="row sp"><span>${t}</span><span class="pill" style="min-width:34px;text-align:center;background:${n === 0 ? "#D9F1E6" : "#FADAD7"};color:${n === 0 ? "#0B6E4F" : "#B3261E"}">${n}</span></div>`).join("")}
        <button class="go2" id="saveSess" ${canPart ? "" : "disabled"}>${curNo}. Denetimi Kaydet</button>
        <button class="sec" id="doneSess" style="height:44px;font-weight:700" ${canSave ? "" : "disabled"}>Kaydet ve Denetimi Tamamla</button>
        <div class="muted" style="font-size:12.5px;line-height:1.5"><b>Kaydet:</b> işaretlediğiniz kadarını saklar, denetim açık kalır; sonra kaldığınız yerden devam edebilirsiniz (tüm maddelerin işaretlenmesi gerekmez). <b>Tamamla:</b> tüm maddeler işaretliyken denetimi kapatır. Yeni denetim ancak siz başlatınca açılır.</div></div>
    </div></div></fieldset>`;
  if (!on) {
    v.querySelector("fieldset.fs")?.remove(); v.querySelector(".helpbox")?.remove();
    const last = doc.sessions[doc.sessions.length - 1];
    v.insertAdjacentHTML("beforeend", `<div class="cd" style="gap:12px;padding:20px"><b style="font:600 16px Sora,sans-serif">Bu ay için tüm denetimler tamamlandı</b>
      <div class="muted" style="line-height:1.55">${last ? `${last.no}. denetim ${dmy(last.date)} tarihinde tamamlandı. ` : ""}Bu bölümün aylık İSG skoru <b>${f1(c.score)}</b> (${band}). Saha turunda yeni bir eksiklik görürseniz “Yeniden aç” ile son denetime ekleyin; ayrı bir tekrar denetimi yapacaksanız aşağıdan başlatın.</div>
      ${D.ro ? "" : `<div><button id="newSess">${doc.sessions.length + 1}. Denetimi Başlat</button></div>`}</div>`);
  }
  bind(v, c);
}

function bind(v, c) {
  const { st } = D.ctx, doc = D.doc, d = doc.draft;
  const again = () => { draw(); persist(); };
  const on = (sel, fn) => v.querySelectorAll(sel).forEach(el => el.onclick = () => fn(el));
  $("bolum").onchange = e => { D.dept = e.target.value; render(D.v, D.ctx); };
  $("ay").onchange = e => { D.month = +e.target.value; render(D.v, D.ctx); };
  $("tarih").onchange = e => { d.date = e.target.value; again(); };
  $("denetci").onchange = e => { doc.auditor = e.target.value.trim(); persist(); };
  on("[data-tog]", el => { D.open[el.dataset.tog] = !D.open[el.dataset.tog]; draw(); });
  on("[data-mk]", el => {
    const [id, k] = el.dataset.mk.split("|"); d.marks[id] = k;
    if (k === "x" && !(d.notes[id] && d.notes[id].length)) d.notes[id] = [""];
    again();
  });
  on("[data-nadd]", el => { (d.notes[el.dataset.nadd] ||= [""]).push(""); again(); });
  on("[data-nrm]", el => {
    const [id, k] = el.dataset.nrm.split("|"), kk = +k; const a = d.notes[id] || [""]; d.photos ||= {};
    (d.photos[id + "|" + kk] || []).forEach(p => S.deletePhoto(st.fid, st.year, p.id).catch(() => {}));
    if (a.length <= 1) { d.notes[id] = [""]; delete d.photos[id + "|0"]; }
    else { a.splice(kk, 1); for (let j = kk; j <= a.length; j++) { const nx = d.photos[id + "|" + (j + 1)]; if (nx) d.photos[id + "|" + j] = nx; else delete d.photos[id + "|" + j]; } }
    again();
  });
  v.querySelectorAll("input[data-ph]").forEach(inp => inp.onchange = async () => {
    const key = inp.dataset.ph, files = [...inp.files]; inp.value = ""; if (!files.length) return;
    D.msg = "Fotoğraf hazırlanıyor…"; setSv(); let n = 0;
    for (const f of files) {
      try {
        const { full, thumb } = await compressImage(f), pid = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await S.savePhoto(st.fid, st.year, pid, full); ((d.photos ||= {})[key] ||= []).push({ id: pid, t: thumb }); n++;
      } catch (e) { toast("Fotoğraf eklenemedi: " + (e.message || e)); }
    }
    D.msg = ""; if (n) toast(n + " fotoğraf eklendi"); again();
  });
  on("[data-prm]", el => {
    const [id, k, pid] = el.dataset.prm.split("|"), key = id + "|" + k;
    d.photos[key] = (d.photos[key] || []).filter(p => p.id !== pid); S.deletePhoto(st.fid, st.year, pid).catch(() => {}); again();
  });
  on("[data-pv]", async el => { showPhoto(el.getAttribute("src")); const full = await S.getPhoto(st.fid, st.year, el.dataset.pv).catch(() => null); if (full) { document.querySelector(".mod img")?.setAttribute("src", full); } });
  on("[data-note]", async el => {
    const [id, k] = el.dataset.note.split("|"), m = /^c(\d+)i(\d+)$/.exec(id), cat = CATS[+m[1]];
    const r = await noteEditor({ title: `Açıklama ${cat.name} · ${+k + 1}.`, item: cat.items[+m[2]], text: (d.notes[id] || [""])[+k] || "" });
    if (r === null) return; (d.notes[id] ||= [""])[+k] = r; again();
  });
  v.querySelectorAll("[data-yd]").forEach(el => el.onchange = () => { (d.ydNotes ||= {})[el.dataset.yd] = el.value; again(); });
  on("[data-freq]", el => { const [ci, k] = el.dataset.freq.split("|"); doc.freq[ci] = +k; again(); });
  on("[data-freqreset]", el => { delete doc.freq[el.dataset.freqreset]; again(); });
  on("[data-bonus]", el => { doc.bonus = +el.dataset.bonus; again(); });
  on("[data-reopen]", () => { const last = doc.sessions[doc.sessions.length - 1]; if (!last) return; last.closed = false; doc.draft.on = false; settle(doc, st.year, D.month); persist(true); draw(); toast(`${last.no}. denetim yeniden açıldı; eksiklikleri ekleyip kaydedin.`); });
  const nw = document.getElementById("newSess");
  if (nw) nw.onclick = () => { doc.draft = emptyDraft(defaultDate(st.year, D.month), true); persist(true); draw(); };
  on("[data-delsess]", async el => {
    const { confirmBox } = await import("./ui.js?v=20261010h");
    if (!(await confirmBox("Son denetim silinsin mi?", "Kayıtlı denetim silinir; skor ve sıklıklar yeniden hesaplanır.", "Evet, sil", true))) return;
    const gone = doc.sessions.pop(); Object.values(gone.photos || {}).flat().forEach(p => S.deletePhoto(st.fid, st.year, p.id).catch(() => {})); if (doc.draft.edit === gone.no) doc.draft = emptyDraft(defaultDate(st.year, D.month), false);
    if (!doc.sessions.length) doc.draft = emptyDraft(defaultDate(st.year, D.month), true); else if (doc.draft.on) { /* devam eden taslak korunur */ }
    settle(doc, st.year, D.month); await persist(true); draw();
  });
  const dOk = d.date && +d.date.slice(0, 4) === +st.year && +d.date.slice(5, 7) === D.month;
  const doSave = async close => {
    if (D.ro || !dOk || c.missing || c.ydMissing || !c.curMarked || (close && !c.canSave)) return;
    const fails = {}, app = {}, yd = {};
    CATS.forEach((cat, ci) => {
      const info = c.catInfo[ci]; app[ci] = info.items.some(it => it.mk === "u" || it.mk === "x");
      info.items.forEach(it => { if (it.isX) fails[it.id] = (d.notes[it.id] || []).map(t => t.trim()).filter(Boolean); });
      if (info.allYD) yd[ci] = (d.ydNotes?.[ci] || "").trim();
    });
    const photos = {};
    CATS.forEach((cat, ci) => c.catInfo[ci].items.forEach(it => {
      if (!it.isX) return; let fi = 0;
      (d.notes[it.id] || []).forEach((t, k) => { if (!t.trim()) return; const ps = d.photos?.[it.id + "|" + k]; if (ps?.length) photos[it.id + "|" + fi] = ps.map(p => ({ ...p })); fi++; });
    }));
    const rec = { date: d.date, fails, app, yd, marks: { ...d.marks }, photos };
    let no;
    if (d.edit != null) { const ix = doc.sessions.findIndex(x => x.no === d.edit); no = d.edit; doc.sessions[ix] = { ...doc.sessions[ix], ...rec }; }
    else { no = doc.sessions.length + 1; doc.sessions.push({ no, ...rec, closed: false }); d.edit = no; }
    if (close) { doc.sessions.find(x => x.no === no).closed = true; doc.draft = emptyDraft(defaultDate(st.year, D.month), false); }
    await persist(true); draw();
    toast(close ? `${no}. denetim tamamlandı. Yeni denetim için “Denetimi Başlat”a basın.` : `${no}. denetim kaydedildi; açık kaldı, kaldığınız yerden devam edebilirsiniz.`);
  };
  const sv = document.getElementById("saveSess"); if (sv) sv.onclick = () => doSave(false);
  const dn = document.getElementById("doneSess"); if (dn) dn.onclick = () => doSave(true);
}
const $ = id => document.getElementById(id);
