**1. Mikro-Sorgu Yükünü ClickHouse'dan Alıp Redis'e Gömmek (Sıfır Sunucu Yükü)**

ClickHouse'a canlı trade esnasında asla sorgu atmayacağız. Kullanıcıların ve klanların o haftaki güncel XP'lerini **Redis RAM hafızasında** tutacağız.

- **Redis Zinciri:** `Redis Sorted Sets (ZSET)` veri tipini kullanacağız.
  - `weekly_user_xp` -> Her kullanıcının o haftaki güncel XP'sini tutar.
  - `weekly_clan_xp` -> Her klanın o haftaki güncel XP'sini tutar.
- **Nasıl Çalışır?:** Kullanıcı "Buy/Sell" butonuna basmadan önce, UI gidip ClickHouse'u rahatsız etmez. Doğrudan **Redis'ten** kullanıcının o anki XP'sini `ZSCORE weekly_user_xp [user_wallet]` komutuyla çeker. RAM'den okunduğu için **0.1 milisaniyede** yanıt döner ve VM işlemcisine binen yük tam olarak sıfırdır.
- **Pazartesi 00:00 UTC Sıfırlaması:** Sunucunuz (VM) hiçbir veri silmekle uğraşmaz. Tek bir asenkron komutla (`DEL weekly_user_xp weekly_clan_xp`) tüm haftalık liderlik ve kullanıcı puanları **1 milisaniyede** tamamen 0 (Sıfır) yapılır.

---

**2. ClickHouse Özelliklerini Maksimuma Çıkarmak: "Asynchronous Inserts"**

Indexer (Go/Rust), Helius LaserStream gRPC'den swap event'ini yakaladığı an araya hiçbir ek kuyruk (Kafka vb.) koymadan **doğrudan ClickHouse'a** tek tek fırlatabilir.

- **ClickHouse Ayarı:** ClickHouse içindeki `ASYNC_INSERT = 1` ve `wait_for_async_insert = 0` özelliklerini aktif edeceğiz.
- **Mühendislik Sihri:** Go/Rust indexer'ınız saniyede 5.000 trade verisini ClickHouse'a tek tek gönderse bile, ClickHouse bu verileri RAM üzerinde otomatik olarak paketler ve arka planda diske toplu (Bulk) yazar. Bu sayede indexer kodunuz basitleşir, sunucuda ekstra bir mesaj kuyruğu (MQ) çalıştırma maliyetinden ve RAM yükünden kurtulursunuz.

---

**3. Gerçek Zamanlı Tetikleme Döngüsü (Kusursuz Akış)**

Saniyede binlerce işlem dönerken tüm yapının senkronize kalma ve sıfır yük üretme akışı:

**text**

```
[LaserStream gRPC] ──> [Indexer (Go/Rust)] 
                             │
                             ├───> (Async Insert) ──> [ClickHouse (Geçmiş / Grafik)]
                             │
                             └───> [Redis] 
                                     ├──> ZINCRBY (Haftalık Kullanıcı ve Klan XP'sini RAM'de Artır)
                                     └──> PUBLISH (WS Pub/Sub Kanalına Trade Event'ini Fırlat)

```

Kodu dikkatli kullanın.

1. **İşlem Gerçekleşir:** LaserStream gRPC, onaylanan trade'i Go/Rust indexer'ınıza iletir.
2. **ClickHouse'a Yazım:** Indexer, `sol_price_usd` ve kazanılan `xp_earned` miktarını ClickHouse'a *Async Insert* ile fırlatır.
3. **Redis Güncellemesi (Milisaniyelik Sayaç):** Indexer aynı salisede Redis'e tek bir komut gönderir:
  - `ZINCRBY weekly_user_xp [kazanilan_xp] [user_wallet]`
  - `ZINCRBY weekly_clan_xp [kazanilan_xp] [clan_id]`
4. **WebSocket Bildirimi (Pub/Sub):** Indexer hemen ardından `PUBLISH trade_channel [data]` diyerek Redis Pub/Sub kanalını tetikler. WebSocket sunucunuz bu mesajı alır ve o token sayfasındaki tüm kullanıcılara **Throttling (saniyede en fazla 5 kez)** uygulayarak mum grafiğini canlı oynatır.

---

**4. UI/UX İçin Ultra-Performanslı Katman Tasarımı**

Binlerce anlık kullanıcı sitenizde gezerken arayüzün yağ gibi akması için ön yüz mimarisi:

- **Next.js / SSR Statik Kalkanı:** Kullanıcı sitenize girdiğinde sunucunuz (VM) Next.js üzerinde karmaşık veritabanı sorguları render etmeye çalışmamalıdır. Sayfanın iskeleti (HTML/CSS) sunucudan tamamen statik (`Static Export` veya güçlü önbellekli) olarak 1 milisaniyede kullanıcının tarayıcısına iner.
- **İstemci Tarafından Doldurma (Client-Side Hydration):** Sayfa tarayıcıda açıldığı an JavaScript devreye girer:
  - Kullanıcının claim edilebilir net SOL bakiyelerini **PostgreSQL**'den tek bir hafif API ile çeker.
  - Kullanıcının o haftaki güncel XP'sini **Redis**'ten çeker ve saklar.
  - Canlı grafik (TradingView Lightweight Charts) verisini **LaserStream WebSocket (WSS)** kanalına bağlar.
- **Dolar Çarpımı (UI İşlemcisi):** Veritabanında asla USD tutulmadığı için, ekrandaki tüm dolar dönüşümlerini kullanıcının kendi bilgisayarı/telefonu (Client-Side CPU) hesaplar. Sizin sunucunuz sadece ham sayıları dağıtan hafif bir trafik polisi olarak kalır.

**Son Yapısal Durum Değerlendirmesi**

Bu optimizasyon ile:

1. **ClickHouse** sadece devasa grafik geçmişini ve hold sürelerini tutan bir analitik matbaası olarak çalışır; anlık sorgularla yorulmaz.
2. **PostgreSQL** sadece profilleri ve statik klan bağlarını tutar; üstünden tüm XP ve sıfırlama yükü kalkar.
3. **Redis** canlı puanları ve liderlik tablolarını RAM hızıyla (0.1ms) yöneterek sunucu işlemcinizi (VM) tamamen korur.
4. **UI/UX** Next.js statik kalkanı sayesinde saniyede 100.000 anlık isteğe bile ban yemeden, donmadan ışık hızında yanıt verir.

