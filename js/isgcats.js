// İSG Denetim kategorileri (ağırlık: 3 kritik, 2 major, 1 minor)
export const CATS = [
  { name: "KKD Kullanmama", sub: "Kişisel koruyucu donanım", w: 2, items: [
    "Göreve uygun KKD (baret, gözlük, eldiven, ayakkabı) kullanılıyor",
    "Zorunlu KKD işaretleri ve uyarı levhaları yerinde",
    "Hasarlı veya süresi geçmiş KKD kullanılmıyor"] },
  { name: "Makine, Ekipman ve Kaldırma-Taşıma Emniyeti", sub: "Koruyucular, acil durdurma, forklift ve vinç", w: 2, items: [
    "Makine koruyucuları ve emniyet donanımı yerinde, devre dışı bırakılmamış",
    "Acil durdurma butonları çalışır ve erişilebilir",
    "Forklift ve vinç yalnızca yetkili operatör tarafından kullanılıyor",
    "Sapan, zincir ve kaldırma aparatları kontrol etiketli"] },
  { name: "Arıza, Bakım ve İzinli İşler", sub: "LOTO, iş izni, yüksekte / sıcak / kapalı alan çalışma", w: 3, items: [
    "Bakım ve arıza müdahalesinde LOTO (kilitleme-etiketleme) uygulanıyor",
    "Sıcak iş, kapalı alan ve yüksekte çalışma için iş izni alınmış",
    "Yüksekte çalışmada korkuluk, yaşam hattı veya emniyet kemeri kullanılıyor",
    "Sıcak işte yangın önlemi (söndürücü, yangın battaniyesi) alınmış"] },
  { name: "Elektrik Güvenliği", sub: "Kablo, pano, topraklama, yalıtım paspası", w: 2, items: [
    "Ekli veya yamalı kablo kullanılmıyor",
    "Pano kapakları kapalı, uyarı etiketleri yerinde",
    "Topraklama ve kaçak akım koruması sağlıklı",
    "Pano ve elektrik ekipmanı önünde yalıtım paspası bulunuyor",
    "Yalıtım paspasının fiziksel durumu uygun (yırtık, çatlak, delik, aşınma yok; paspas yoksa Y.D.)"] },
  { name: "Yaya Yolu ve Acil Durum Ekipman/Çıkış Erişimi", sub: "Yaya yolları, acil çıkışlar, yangın dolabı ve söndürücüler", w: 2, items: [
    "Yaya yolları malzemeden arındırılmış",
    "Acil çıkış kapıları ve çıkış yolları açık",
    "Yangın dolabı ve söndürücü önü açık, erişilebilir"] },
  { name: "5S Kurallarına Uymama", sub: "Düzen ve temizlik", w: 1, items: [
    "Alan düzenli, malzemeler yerlerinde ve etiketli",
    "Zemin ve çalışma alanları temiz"] },
  { name: "Çevre ve Atık Yönetimine Uymama", sub: "Atık ayrıştırma ve geçici atık alanı", w: 1, items: [
    "Atıklar ayrıştırılarak ilgili kaplara atılıyor",
    "Atık kapları etiketli, geçici atık alanı düzenli"] },
  { name: "Kimyasal Güvenlik", sub: "Etiketleme, sızıntı, kimyasal tavası, SDS", w: 2, items: [
    "Tüm kimyasal kaplar etiketli, tanımsız (etiketsiz) kimyasal bulunmuyor",
    "Yere veya zemine kimyasal sızıntısı / dökülmesi yok",
    "Kimyasallar sızdırmaz tava (kimyasal tavası) üzerinde depolanıyor",
    "Güncel SDS (Güvenlik Bilgi Formu) kullanım noktasında mevcut ve erişilebilir",
    "Uyumsuz kimyasallar ayrı depolanıyor",
    "Sızıntı müdahale malzemesi (emici, kit) yerinde ve eksiksiz"] }
];
