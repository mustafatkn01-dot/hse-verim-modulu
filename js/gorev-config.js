// Görev takip programı bağlantısı (İSTEĞE BAĞLI).
// Görev takip programınız yoksa dosyanın tamamını şu tek satırla değiştirin:
//   export const GOREV_CFG = null;
// "Göreve ekle" düğmeleri yine görünür; basınca "bu kurulumda tanımlı değil" uyarısı çıkar.
// Bağlı kullanım için görev programının Firebase web yapılandırması (herkese açık bilgi) ve veritabanı kökü girilir.
export const GOREV_CFG = {
  firebase: {
    apiKey: "AIzaSyCQ4diQJjtB-Gemm21XUTqwvFboSJj6hLc",
    authDomain: "mtgorev.firebaseapp.com",
    databaseURL: "https://mtgorev-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "mtgorev",
    appId: "1:430164752160:web:07be49bc3c52dd48aa0945"
  },
  root: "isg"
};
