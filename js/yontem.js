// Kurulum sayfasındaki katlanabilir "Hesaplama Yöntemi" kartı (parametrelerden canlı; PDF indirilebilir)
import { dotCss } from "./tatil.js?v=20261026f";
import { esc, noticeBox } from "./ui.js?v=20261026f";
import { num, c2, empCoef, RISK, DEFAULT_PARAMS } from "./scoring.js?v=20261026f";
import { T as KAZA } from "./kaza.js?v=20261026f";
import { askFormat, savePdf, printCurrent } from "./pdf.js?v=20261026f";

const Y = { open: false };
export const reset = () => { Y.open = false; };
const f = n => String(Math.round(n * 100) / 100).replace(".", ",");
const COL = ["#0B6E4F", "#2A82C4", "#F5B700", "#D6382E"];
const HD = t => `<span class="hd" style="letter-spacing:.8px">${t}</span>`;
const sec = (title, sub, body, first) => `<div class="ys" data-brk style="display:flex;flex-direction:column;gap:12px;${first ? "" : "border-top:1px solid var(--line);padding-top:18px"}"><div class="row sp" style="align-items:baseline;gap:6px 12px"><b style="font:600 15px Sora,sans-serif">${title}</b>${sub ? `<span class="muted" style="font-size:12.5px">${sub}</span>` : ""}</div>${body}</div>`;
const box = (t, bg = "var(--calc)", c = "var(--calct)") => `<div style="background:${bg};color:${c};border-radius:10px;padding:10px 12px;font-weight:700;line-height:1.5">${t}</div>`;
const row2 = (a, b) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--line)"><span>${a}</span><b>${b}</b></div>`;

export function body(p0) {
  const p = p0 || DEFAULT_PARAMS, w = ["kaza", "konusma", "isbasi", "isg"].map(k => num(p.w[k])), tot = w.reduce((a, x) => a + x, 0) || 1;
  const MOD = [["İş Kazası", "Bölümdeki kaza adedi ve türü"], ["Eğitim Konuşması", "Hedef süreye göre gerçekleşen eğitim"], ["İşbaşı Eğitim", "İşe girenlerin eğitim oranı ve zamanlaması"], ["İSG Denetim", "Denetimde bulunan uygunsuzlukların sıklığı"]];
  const e = p.esik, h = num(e.h), az = p.isg.azami;
  const FORM = [
    ["İş Kazası", "Verim = 100 − Σ(adet × tür puanı) × F  (en az 0)", "Her kaza türüne göre puan götürür; büyük ve riskli bölümde bölüm katsayısı kadar ağır sayılır."],
    ["Eğitim Konuşması", `Verim = gerçekleşen dk ÷ (çalışan × ${f(num(p.egitim.hedef))} dk × F) × 100  (en fazla 100)`, "Hedef süre Parametreler'deki \"Hedef süre\" değeridir. Boş girilen bölüm hesaba katılmaz."],
    ["İşbaşı Eğitim", "Verim = eğitim oranı × ZTF faktörü × TC faktörü", `Oran = eğitim verilen ÷ işe giren. ZTF, kayıtlardaki işe başlama ve eğitim tarihlerinden kişi bazında hesaplanan eğitim gecikmesini (şiddet ${f(num(p.egitim.kztf))}), TC kalıcılığı (şiddet ${f(num(p.egitim.ktc))}) yansıtır. İşe giriş yoksa modül hesaba girmez.`],
    ["İSG Denetim", "Denetim skoru = 100 − ceza; ay skoru = denetim skorlarının ortalaması + ramak kala bonusu (en çok 100)", `Her denetim 100 puandan başlar. Ceza = 100 × Σ(sıklık × kategori ağırlığı) ÷ (azami ${az} × Σ ağırlık) × F; yalnız o denetimde uygunsuzluk çıkan kategoriler ceza alır, önceki denetimin cezası taşınmaz. Sıklık, uygunsuzluğun aydaki farklı gün sayısıdır (1 gün = 1, 2-3 gün = 2, 4+ gün = 3, kritik kategoride en az 2); aynı gün yapılan denetimler tek sayılır, önceki denetimlerdeki bulgular sıklık olarak takip edilir. Y.D. işaretli kategoriden ceza gelmez; ağırlıklar sabit kalır, böylece aynı bulgu her bölümde ve her haftada aynı cezayı alır. Kurulum'daki makine sayısı: 1 makinede makine maddelerinden (koruyucu, acil durdurma, sıkışma) gelen tek bulgu, 2-3 makinede aynı denetimde 2 bulgu sıklığı 1 basamak artırır. Aksiyon alındı: misafirin bildirdiği aksiyon yetkili tarafından kabul edilince o açıklama cezada Uygun gibi sayılır (bir maddenin tüm açıklamalarında aksiyon onaylanmalı; kategoride açık bulgu kalmazsa kategori cezası kalkar). İlk tespit, fotoğrafı ve sıklık takibi aynen sürer; onay bekleyen veya reddedilen aksiyon puana yansımaz. Ramak kala bonusu: ayda 1 = ${f(num(p.isg.r1))}, 2 haftada 1 = ${f(num(p.isg.r2))}, haftada 1 = ${f(num(p.isg.r3))} puan.`]
  ];
  const BAND = [["Kritik", `${f(num(e.o))} altı`, "#FADAD7", "#B3261E"], ["Orta", `${f(num(e.o))} – ${f(num(e.i) - 1)}`, "#FBE9C6", "#6B3F00"], ["İyi", `${f(num(e.i))} – ${f(num(e.m) - 1)}`, "#DCEAF7", "#145F96"], ["Mükemmel", `${f(num(e.m))} ve üzeri`, "#D9F1E6", "#0B6E4F"]];
  const RULES = ["Hafta Pazartesi–Pazar arasıdır. Her hafta, her bölüm için bir denetim planlanır; yıl 52 hafta olarak görünür.", "İdeal gün Pzt–Çar'dır. O günlerde yapılan denetim \"zamanında\", Per–Paz arası \"geç\" sayılır; ikisi de yapıldı sayılır.", "Pzt–Çar'da hiç iş günü kalmıyorsa (bayram, resmi tatil) program tesis sahibine sorar: \"Tatil, plan dışı\" veya \"Denetim yapılacak\".", "Tatil seçilir ve denetim yapılmazsa hafta gri görünür ve muaf sayılır (yapıldı gibi); yüzdeyi düşürmez, hafta sayacı değişmez (örn. 2/40).", "Tatil haftasında denetim yapıldıysa hafta normal \"yapıldı\" sayılır."];
  const dot = (k, t) => `<span style="display:flex;align-items:center;gap:6px;white-space:nowrap"><span style="${dotCss(k, 10)}"></span>${t}</span>`;
  return [
    sec("1 · Toplam skor nasıl oluşur", "Ağırlıklar Parametreler'den gelir", `<div style="display:flex;height:16px;border-radius:999px;overflow:hidden;gap:2px">${w.map((x, i) => `<div style="flex:${x || 0.001};background:${COL[i]}"></div>`).join("")}</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px 16px">${MOD.map((m, i) => `<div style="flex:1 1 220px;min-width:0;display:flex;gap:10px"><span style="width:12px;height:12px;border-radius:4px;background:${COL[i]};margin-top:5px;flex:0 0 12px"></span><div><b>${m[0]}</b> <span class="muted">· %${f(w[i])}</span><div class="muted" style="font-size:13px">${m[1]}</div></div></div>`).join("")}</div>
      ${box(`Toplam skor = Σ (modül puanı × ağırlık) ÷ Σ ağırlık. Verisi girilmemiş modül hesaptan çıkarılır; ağırlık kalan modüllere yeniden dağıtılır.${Math.round(tot) !== 100 ? " (Şu an ağırlık toplamı " + f(tot) + ".)" : ""}`, "var(--info)", "var(--infot)")}`, true),
    sec("2 · Modül formülleri", "", `<div style="display:flex;flex-wrap:wrap;gap:12px">${FORM.map((x, i) => `<div style="flex:1 1 300px;min-width:0;border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px"><div style="display:flex;align-items:center;gap:8px"><span style="width:12px;height:12px;border-radius:4px;background:${COL[i]}"></span><b>${x[0]}</b></div>${box(x[1])}<div class="muted" style="line-height:1.55;font-size:13px">${x[2]}</div></div>`).join("")}</div>
      ${HD("KAZA TÜRÜ PUANLARI")}<div style="display:flex;flex-wrap:wrap;gap:8px">${KAZA.map(k => `<div style="flex:1 1 120px;min-width:0;border-radius:10px;background:var(--calc);padding:8px 10px;display:flex;justify-content:space-between;gap:8px"><span style="color:var(--calct)">${k[0]}</span><b>${k[1]}</b></div>`).join("")}</div>`),
    sec("3 · Bölüm katsayısı (F)", "Aynı olay büyük ve riskli bölümde daha ağır sayılır", `${box("F = 1 + (çalışan katsayısı − 0,05) + (risk katsayısı − 0,05)")}
      <div style="display:flex;flex-wrap:wrap;gap:16px"><div style="flex:1 1 240px;min-width:0">${HD("ÇALIŞAN SAYISI")}${[[1, "1-5 kişi"], [6, "6-10 kişi"], [11, "11-15 kişi"], [16, "16-20 kişi"], [21, "21-25 kişi"], [26, "26+ kişi"]].map(x => row2(x[1], c2(empCoef(x[0])))).join("")}</div>
      <div style="flex:1 1 240px;min-width:0">${HD("RİSK SKORU")}${Object.entries(RISK).map(x => row2("Risk skoru " + x[0], c2(x[1]))).join("")}</div></div>`),
    sec("4 · Durum eşikleri ve yıllık hedef", "Parametreler'den gelir", `<div style="display:flex;flex-wrap:wrap;gap:8px">${BAND.map(b => `<div style="flex:1 1 140px;min-width:0;border-radius:10px;padding:10px 12px;background:${b[2]};color:${b[3]};display:flex;justify-content:space-between;gap:8px"><b>${b[0]}</b><span>${b[1]}</span></div>`).join("")}</div>
      <div class="muted" style="line-height:1.6;font-size:13px">Yıllık hedef <b>${f(h)}</b>. Yalnızca gösterim içindir: Genel Bakış'ta Aylık Trend grafiğinde çizgi olarak görünür ve kaç ayın hedefte kaldığı sayılır; skoru değiştirmez.</div>`),
    sec("5 · Haftalık denetim planı ve tatil kuralı", "", `<div style="display:flex;flex-direction:column;gap:8px">${RULES.map((t, i) => `<div style="display:flex;gap:10px"><span style="width:22px;height:22px;border-radius:50%;background:var(--navy);color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex:0 0 22px">${i + 1}</span><div style="line-height:1.55">${t}</div></div>`).join("")}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px 16px;font-size:12px;color:var(--muted)">${dot("ok", "Zamanında")}${dot("late", "Geç")}${dot("miss", "Yapılmadı")}${dot("off", "Tatil (plan dışı)")}${dot("wait", "Bu hafta")}${dot("future", "Gelecek")}</div>`),
    sec("6 · Skoru etkilemeyenler", "", `<div style="display:flex;flex-wrap:wrap;gap:8px">${[["Görev takibi", "Görev programındaki kapatma durumu yalnızca bilgidir."], ["Denetim planı uyumu", "Haftalık plan yüzdesi ve gri tatil haftaları skora girmez."], ["Tatil kararları", "\"Tatil, plan dışı\" kararı hiçbir puanı değiştirmez."], ["Yıllık hedef çizgisi", "Trend grafiğindeki hedef yalnızca karşılaştırma içindir."]].map(n => `<div style="flex:1 1 220px;min-width:0;border-radius:10px;background:var(--calc);padding:10px 12px"><b>${n[0]}</b><div class="muted" style="font-size:13px">${n[1]}</div></div>`).join("")}</div>`)
  ].join("");
}

export function mount(el, getParams, meta = {}) {
  const draw = () => {
    el.innerHTML = `<div class="cd" style="gap:16px"><div class="row sp" style="align-items:center;flex-wrap:nowrap;gap:12px"><div style="min-width:0"><h2>Hesaplama Yöntemi</h2><div class="muted" style="font-size:13px;margin-top:4px">Skor, hedef ve haftalık plan nasıl çalışır. Değerler yukarıdaki parametrelerden canlı gelir.</div></div>
      <div class="row" style="gap:8px;flex-wrap:nowrap;flex:0 0 auto"><button class="sec" data-y="pdf" style="height:40px">PDF indir</button>
        <button class="sec" data-y="tg" aria-expanded="${Y.open}" aria-label="${Y.open ? "Kartı kapat" : "Kartı aç"}" style="width:40px;height:40px;padding:0;display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${Y.open ? 180 : 0}deg)"><path d="M6 9l6 6 6-6"/></svg></button></div></div>
      ${Y.open ? `<div class="col1" style="gap:18px;border-top:1px solid var(--line);padding-top:18px">${body(getParams())}</div>` : ""}</div>`;
    { const hd = el.querySelector('[data-y="tg"]').closest(".row.sp"); hd.style.cursor = "pointer"; hd.onclick = e => { if (e.target.closest('[data-y="pdf"]')) return; Y.open = !Y.open; draw(); }; }
    el.querySelector('[data-y="pdf"]').onclick = async () => {
      const o = await askFormat({ title: "Hesaplama yöntemini PDF indir", text: "Programın skoru nasıl hesapladığını anlatan özet. Birden fazla sayfa olabilir.", defOrient: "portrait" });
      if (!o) return;
      const W = (o.orient === "landscape" ? 1123 : 794) - 76, b = document.createElement("div"); b.className = "lightbox";
      b.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;background:#fff;color:#10201C;display:flex;flex-direction:column;gap:18px`;
      b.innerHTML = `<div data-brk><h1 class="ttl" style="margin:0">Hesaplama Yöntemi</h1><div class="sub">${esc(meta.fname || "")}${meta.year ? " · " + esc(String(meta.year)) : ""} · HSE Verim Modülü</div></div>${body(getParams())}`;
      document.body.appendChild(b);
      if (!o.file) {
        b.classList.add("ytprint"); document.body.classList.add("ytp"); b.style.cssText = "position:fixed;left:-99999px;top:0;background:#fff;color:#10201C;display:flex;flex-direction:column;gap:18px;width:" + W + "px";
        const done = () => { b.remove(); document.body.classList.remove("ytp"); window.removeEventListener("afterprint", done); }; window.addEventListener("afterprint", done);
        printCurrent({ size: o.size, orient: o.orient, name: "HSE Hesaplama Yöntemi", header: `${meta.fname || ""} · Hesaplama Yöntemi` }); return;
      }
      try {
        const top0 = b.getBoundingClientRect().top, breaks = [...b.querySelectorAll("[data-brk]")].map(c => c.getBoundingClientRect().top - top0).filter(t => t > 0);
        await savePdf(b, { size: o.size, orient: o.orient, name: `HSE Hesaplama Yöntemi (${o.size}).pdf`, margin: 28.5 * (o.size === "A3" ? 1.4142 : 1), scale: o.size === "A3" ? 3 : 2.5, breaks, header: `${meta.fname || ""} · Hesaplama Yöntemi`, pageNo: true });
      } catch (e) { noticeBox("PDF üretilemedi", e.message); } finally { b.remove(); }
    };
  };
  draw();
}
