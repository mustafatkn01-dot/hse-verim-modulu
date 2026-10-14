# HSE Verim Modülü
Statik web uygulaması (GitHub Pages) + Firebase (Auth e-posta/şifre, Firestore).

- `index.html`, `css/`, `js/` — uygulama
- `firestore.rules` — güvenlik kuralları (Firebase konsolunda Firestore → Rules'a yapıştırılır)
- Veri yapısı: `users/{uid}/factories/{fid}/years/{yıl}/departments/{did}`

## İsteğe bağlı: Görev takip programı bağlantısı

Denetim ve kaza açıklamalarındaki "+ Göreve ekle" düğmesi, ayrı bir görev takip programına (mtisggorev) kayıt bırakır.
Bağlantı bilgileri `js/gorev-config.js` içindedir. Görev takip programı kullanmayan kurulumlarda dosyayı şu hale getirin:

```js
export const GOREV_CFG = null;
```

Düğme yine görünür, ancak basılınca "bu kurulumda tanımlı değil" uyarısı verir; uygulamanın geri kalanı etkilenmez.
Görev programına Ayarlar → Uygulama ve Senkronizasyon bölümünden bir kez e-posta/şifre ile bağlanılır (şifre saklanmaz).
Fabrika adı iki programda aynı olmalıdır (büyük/küçük harf ve Türkçe karakter farkı yok sayılır).

## Sürüm notları

### 1.6.2
- İş Kazası da aynı sistemde: kazalar + ile (tür, açıklama) eklenir; misafir kaydı onay bekler (kazag).
- Çalışan sayısı aylıktır: Kurulum'da değiştirilen sayı kaydedildiği aydan itibaren geçerlidir, önceki aylar değişmez (r.nm). Yıl başlatılırken Aralık değeri yeni yılın tabanı olur.
- Eğitim Konuşması ve İşbaşı Eğitim: aylık toplam, eklenen kayıtların toplamıdır (+ düğmesi). Misafir kaydı "Onay bekliyor" olarak gelir; yetkili onaylar / reddeder. Misafir aylık kaydı değiştiremez (firestore.rules güncellendi: konusmag, isbasig).

### 1.6.1
- Misafir kayıt ekranı: e-posta kaldırıldı, "Bölüm / Görev" zorunlu alan eklendi (* işaretli); onay kartında ad düzenlenebilir.
- Geri bildirim: misafir menüsünde "Geri Bildirim Gönder", sahip menüsünde "Mesaj Kutusu" ("Mesajınız var" uyarısı).
- İSG Denetim: başlık altında açık kalan / denetlenmeyen bölüm hatırlatması, tatil günü işareti, kategoriler varsayılan kapalı.
- firestore.rules güncellendi (unit alanı, feedback koleksiyonu): Firebase Konsolu'nda yayınlanmalıdır.

### 1.6.0
- **Haftalık denetim düzeni (Adım A):** Denetimler tarihine göre haftaya bağlanır (Pzt–Paz, ISO hafta no). Kayıt kartında "1. Denetim · 42. hafta", tarih alanında hafta bilgisi görünür.
- **Yeni denetim kilidi:** Bu haftanın denetimi tamamlandıysa "Denetimi Başlat" pasiftir ve başlatılabileceği Pazartesi yazar; yeni haftada otomatik aktif olur. Hafta içinde yeni bulgu için "Yeniden aç" kullanılır.
- **Eski açık denetim uyarısı:** Önceki haftadan açık kalmış denetim için formun üstünde uyarı çıkar.
- **Bu hafta şeridi (Adım B):** İSG Denetim sayfasının üstünde açılır kart (varsayılan kapalı): bugünün haftasında her bölümün durumu (tamamlandı / açık / başlanmadı) ve bekleyen misafir taslağı sayısı; bölüme dokununca o bölüme geçilir.
- **Bu hafta şeridinde gün satırı:** Pzt–Paz yedi nokta; denetim yapılan günler sayıyla dolu yeşil, yalnızca açık olanlar sarı, bugün lacivert çerçeveli.
- **Misafir taslağını haftaya birleştirme (Adım C):** Taslağın tarihi hangi haftaya düşüyorsa o haftanın denetim kaydı varsa taslak ona eklenir (yeni denetim açılmaz); yoksa önceki gibi yeni denetim olur. Aynı maddede bu haftaki bulgu varsa "Aynı madde" etiketiyle **Birleştir** (açıklama tekrar yazılmaz, fotoğraflar mevcut bulguya eklenir) veya **Ayrı bulgu** (açıklama aynı maddeye eklenir) seçilir. Skor ve sıklık hesabı değişmez, tarih haftanın denetiminin tarihi olarak kalır.
- **Özel tarih seçici:** Tatil Takvimi (başlangıç/bitiş aralığı, tatil noktaları) ve Denetim Tarihi için bilgi kartı düzeninde takvim; tarayıcının yerleşik takvimi kullanılmaz.

### 1.5.0
- **Haftalık denetim planı:** Her bölüm için yıl boyunca 52 hafta; ideal gün Pzt–Çar ("zamanında"), Per–Paz "geç". Genel Bakış'ta ve raporlarda gösterilir; puanı etkilemez.
- **Tatil Takvimi (Kurulum):** Resmi tatiller (2025–2045) ve dini bayramlar (2025–2027) hazır gelir; özel gün/tarih aralığı eklenebilir, istenmeyen gün kaldırılabilir. Pzt–Çar'da iş günü kalmayan hafta için "Tatil, plan dışı" / "Denetim yapılacak" kararı sorulur. Tatil haftası gri (çizgili) görünür ve **muaf** sayılır: yüzdeyi düşürmez, hafta sayısı korunur.
- **Senkronizasyon:** Yeni yılın resmi/dini günleri Nager.Date servisinden önizlemeyle eklenir (Diyanet takvimiyle karşılaştırın).
- **Yıllık hedef:** %90 (yalnızca gösterim); Aylık Trend ve rapor Grafik 1'de "Hedef" çizgisi.
- **Raporlar:** Denetim Planı Uyumu kartı (açılır; yazdırma/PDF'te açık basılır) ve Grafik 1'de hedef çizgisi.
- **Hesaplama Yöntemi (Kurulum):** Skorun nasıl hesaplandığını anlatan katlanır kart; önizleme/yazdır veya PDF indir.
- **Yedek:** Yedek dosyasına yıl bazında tatil takvimi (`tatil`) eklendi.
- **Genel Bakış · Açık kritik bulgular:** Öncelikli Aksiyonlar kartında kritik (×3) ve major (×2) bulgular; küçük resim (dokununca büyür), bölüm, kategori, açıklama ve görev durumu (görevde · X gündür açık / göreve aktarılmadı). Görev programı bağlıysa kapanmış görevler gizlenir; bağlı değilse yalnızca son denetim ayı listelenir.

### Yeni yıl kontrol listesi
1. Ayarlar → Yıllar'dan yeni yılı başlatın.
2. Kurulum → Tatil Takvimi: dini bayramlar o yıl için hazır değilse uyarı çıkar; senkronize simgesiyle ekleyin veya Diyanet takvimine göre özel gün girin.
3. Kalıcı hazır liste için `js/tatil.js` içindeki `DINI` listesine yeni yılın bayram tarihlerini ekleyin.

### Veri yapısı eki
- `users/{uid}/factories/{fid}/years/{yıl}/setup/tatil`: `{ ozel, kaldir, karar, sync }`

- 1.6.3: İSG Denetim – her denetim (son olmasa da) silinebilir / yeniden açılabilir, silinince numaralar yeniden dizilir; misafir taslakları için "Sil" / "Tamamen sil" (hiç yapılmamış gibi temizler).
- 1.6.4: İSG denetim kategorileri akordeon (tek kategori açık); Verim sayfasında "İSG Denetim · Aylık Kıyas" kartı (son 2/3 ay, değişim, en çok düşenler üstte).
- 1.6.5: "Önceki denetimde uygunsuzdu" yalnızca daha eski denetimleri sayar (eski bir denetim düzenlenirken); Y.D. gerekçe örneği genel hale getirildi.
