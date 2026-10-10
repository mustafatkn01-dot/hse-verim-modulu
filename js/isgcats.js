// İSG Denetim kategorileri (ağırlık: 3 kritik, 2 major, 1 minor)
export const CATS = [
  { name: "KKD Kullanmama", ex: "Örn. Taşlama bölümünde iki operatör koruyucu gözlük takmadan çalışıyor.", sub: "Kişisel koruyucu donanım", w: 2, items: [
    "Çalışmaya uygun KKD (baret, gözlük, eldiven, kulaklık, ayakkabı) kullanılıyor",
    "Zorunlu KKD işaretleri ve uyarı levhaları yerinde",
    "Hasarlı veya süresi geçmiş KKD kullanılmıyor"] },
  { name: "Makine, Ekipman ve Kaldırma-Taşıma Emniyeti", ex: "Örn. Pres-2 koruyucu kapağı açık bırakılmış; operatör müdahale ediyor.", sub: "Koruyucular, acil durdurma, forklift, vinç, konveyör", w: 3, items: [
    "Makine koruyucuları ve emniyet donanımı yerinde, devre dışı bırakılmamış",
    "Acil durdurma butonları çalışır ve erişilebilir",
    "Forklift ve vinç yalnızca yetkili operatör tarafından kullanılıyor",
    "Kaldırma araçlarının (caraskal, vinç) ve bağlı aparatların (sapan, zincir, kanca) fiziksel durumu uygun (hasar, aşınma, deformasyon yok; kullanılmıyorsa Y.D.)",
    "Konveyör ve silindir sıkışma noktaları korunmuş (konveyör yoksa Y.D.)"] },
  { name: "Arıza, Bakım ve İzinli İşler", ex: "Örn. Bakım yapılan makinede kilitleme-etiketleme (LOTO) uygulanmamış.", sub: "LOTO, iş izni, yüksekte / sıcak / kapalı alan çalışma", w: 3, items: [
    "Bakım ve arıza müdahalesinde LOTO (kilitleme-etiketleme) uygulanıyor",
    "Sıcak iş, kapalı alan ve yüksekte çalışma için iş izni alınmış",
    "Yüksekte çalışmada; merdiven, korkuluk, yaşam hattı veya emniyet kemeri kullanılıyor",
    "Sıcak işte yangın önlemi (söndürücü, yangın battaniyesi) alınmış"] },
  { name: "Elektrik Güvenliği", ex: "Örn. Elektrik panosunun kapağı açık, önünde malzeme var; kablolar çıplak.", sub: "Kablo, pano, topraklama, yalıtım paspası", w: 2, items: [
    "Ekli veya yamalı kablo kullanılmıyor",
    "Pano kapakları kapalı, uyarı etiketleri yerinde",
    "Topraklama ve kaçak akım koruması sağlıklı",
    "Pano ve elektrik ekipmanı önünde yalıtım paspası bulunuyor",
    "Yalıtım paspasının fiziksel durumu uygun (yırtık, çatlak, delik, aşınma yok; paspas yoksa Y.D.)"] },
  { name: "Yaya Yolu ve Acil Durum Ekipman/Çıkış Erişimi", ex: "Örn. Yaya yolu paletlerle kapatılmış; yangın söndürücünün önü kapalı.", sub: "Yaya yolları, acil çıkışlar, söndürücü, ilk yardım, forklift trafiği", w: 2, items: [
    "Yaya yolları malzemeden arındırılmış",
    "Acil çıkış kapıları ve çıkış yolları açık",
    "Yangın dolabı ve söndürücü önü açık, erişilebilir",
    "Yangın söndürücülerin kontrol etiketi güncel, basınç göstergesi yeşil bölgede",
    "İlk yardım dolabı eksiksiz ve erişilebilir",
    "Forklift trafiği ile yaya yolu ayrılmış; yönlendirme ve hız kuralına uyuluyor"] },
  { name: "5S Kurallarına Uymama", ex: "Örn. Montaj hattı çevresinde takımlar yerinde değil, zeminde atık parçalar var.", sub: "Düzen ve temizlik", w: 1, items: [
    "Alan düzenli, malzemeler yerlerinde ve etiketli",
    "Zemin ve çalışma alanları temiz"] },
  { name: "Çevre ve Atık Yönetimine Uymama", ex: "Örn. Atık yağ kovası etiketsiz ve kapağı açık; atıklar karışık atılmış.", sub: "Atık ayrıştırma ve geçici atık alanı", w: 1, items: [
    "Atıklar ayrıştırılarak ilgili kaplara atılıyor",
    "Atık kapları etiketli, geçici atık alanı düzenli"] },
  { name: "Kimyasal Güvenlik", ex: "Örn. Kimyasal varil etiketsiz, altında kimyasal tavası yok; SDS bulunmuyor.", sub: "Etiketleme, sızıntı, kimyasal tavası, SDS, göz duşu", w: 2, items: [
    "Tüm kimyasal kaplar etiketli, tanımsız (etiketsiz) kimyasal bulunmuyor",
    "Yere veya zemine kimyasal sızıntısı / dökülmesi yok",
    "Kimyasallar sızdırmaz tava (kimyasal tavası) üzerinde depolanıyor",
    "Güncel SDS (Güvenlik Bilgi Formu) kullanım noktasında mevcut ve erişilebilir",
    "Uyumsuz kimyasallar ayrı depolanıyor",
    "Sızıntı müdahale malzemesi (emici, kit) yerinde ve eksiksiz",
    "Kullanılmayan kimyasal kapları kapalı",
    "Göz yıkama / acil duş istasyonu erişilebilir ve çalışır"] }
];
