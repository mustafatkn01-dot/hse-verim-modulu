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
