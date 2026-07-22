Kullanıcının o anki haftalık XP’sini hesaplamak, ClickHouse için çocuk oyuncağıdır. Indexer'dan akan tüm trade, airdrop ve klan görev logları zaten anlık olarak ClickHouse'da toplandığı için, kullanıcı "Buy/Sell" butonuna basmadan hemen önce UI arka planda ClickHouse'a çok hafif ve ışık hızında bir sorgu atarak güncel haftalık XP'yi çeker ve doğrudan kontrata parametre olarak gönderir.

Böylece **PostgreSQL'i XP güncelleme ve sıfırlama yükünden tamamen kurtarmış oluruz.** PostgreSQL artık sadece kullanıcı profilleri ve klan bağları gibi statik verileri tutan, neredeyse sıfır yükle çalışan bir veritabanı haline gelir.

Bu harika dokunuşla birlikte, sistemin **en optimize, en sade ve nihai teknik özeti** şudur:

---

**1. %100 On-Chain Likidite ve "Hazır Puan" (XP) Mantığı**

Tüm finansal gerçeklik ve paralar, Solana programının (Anchor) içinde **PDA (Program Derived Address)** adı verilen on-chain hesap defterlerinde kilitli ve güvendedir. Kontrat hiçbir karmaşık XP hesabı yapmaz; sadece istemciden (UI) gelen hazır veriye göre anlık karar verir.

- **İşlem Anı ve Karar Mekanizması:** Kullanıcı "Buy/Sell" butonuna bastığı salisede arayüz (UI), **ClickHouse**'dan kullanıcının o haftaki güncel XP değerini tek bir hafif sorguyla çeker ve kontrata doğrudan parametre olarak gönderir (`user_xp = 1050`).
- **On-Chain Basit IF Bloğu:** Kontrat sadece gelen sayıya bakar:
  - *Gelen Sayı ≥ 1000 mi?* Evet ise, o işlemden ayrılan **%0.1250'lik cashback payını** salisesinde kullanıcının on-chain PDA defterine (`claimable_cashback_sol`) yazar.
  - Eğer gelen sayı `990` ise cashback yazmaz, normal swapı tamamlar. İşlem bitince indexer yeni trade logunu ClickHouse'a yazacağı için, kullanıcının bir sonraki işleminde arayüz ClickHouse'dan otomatik olarak `1000+` XP çekecektir ve cashback on-chain olarak anında başlayacaktır.

---

**2. Haftalık Sıfırlamanın Doğal Çözümü (UTC)**

- **Zaman Dilimi ve Döngü:** Tüm sistem **UTC** saat tabanlıdır. Yarışma her **Pazar gecesi tam 23:59:59 UTC**'de biter. Pazartesi 00:00:00 UTC'de yeni dönem başlar.
- **Sıfırlama Sihri (Sıfır Sunucu Yükü):** ClickHouse üzerinde haftalık XP'leri sıfırlamak için tüm satırları tek tek silmeye veya veritabanını yormaya gerek yoktur. ClickHouse sorgunuzun sonuna sadece o anki haftanın zaman filtresini koyarsınız (Örn: `WHERE timestamp >= start_of_this_week`).
- **Kontratta Sıfırlama Koduna Gerek Yok:** Pazartesi sabahı saat 00:00:01 UTC olduğunda, yeni hafta başladığı için UI'ın ClickHouse'a attığı haftalık XP sorgusu otomatik olarak `0 XP` döndürür. Arayüz kontrata `user_xp = 0` gönderir. Kontrat 0'ı gördüğü için cashback dağıtımını otomatik olarak yapmaz. Kullanıcı trade ettikçe ClickHouse logları birikir, baraj geçilince sonraki işlemlerde kontrata otomatik `1000+` gitmeye başlar.

---

**3. %1.25 Sabit Komisyon (Fee) Paylaşım Planı ve Manuel Claim**

Tüm kontrat ve claims süreçleri **kesinlikle ham SOL (Lamports)** cinsinden çalışır. Hiçbir ödeme otomatik gönderilmez; hepsi kullanıcı tarafından **manuel claim** edilir.

- **%0.3125 (Token Creator):** On-chain her swapta kontrat tarafından anlık olarak geliştiricinin PDA defterine yazılır. Manuel claim edilir.
- **%0.1875 (Referrer):** On-chain her swapta kontrat tarafından anlık olarak davet edenin PDA defterine yazılır. Manuel claim edilir.
- **%0.1250 (Anlık Cashback):** Gelen hazır XP parametresi ≥ 1000 ise kontrat tarafından anlık kullanıcının PDA defterine yazılır. Manuel claim edilir.
- **%0.3125 (Haftalık Klan Havuzu):** En çok hacim yapan **İlk 3 Klan** arasında pazar gecesi bölünür (Lidere %20, üyelere hacim oranında %80). Kontrattaki haftalık deftere kilitlenir, hak sahipleri manuel claim eder.
- **%0.2125 (Haftalık XP Liderlik Havuzu):** Bireysel XP sıralamasında **İlk 100 Kişiye** (Balinalara) ağırlıklarına göre pazar gecesi dağıtılır. Kontrattaki haftalık deftere kilitlenir, manuel claim edilir.
- **%0.1000 (Sizin Kasanız):** Platform net kârı anlık olarak şirket cüzdanınıza veya ana kontrat kasasına akar.

---

**4. En Optimize Performans Stack'i (Maksimum Hız, Sıfır VM Yükü)**

- **Canlı USD Gösterimi (Client-Side):** Veritabanlarında USD fiyatı saklanmaz. Merkezi bir worker fiyatı Jupiter Price API ile çekip **Redis**'e yazar. Ön yüz (Next.js/React) kontrattan gelen tam SOL miktarını alır ve kullanıcının kendi tarayıcısında (Client-Side) dolar fiyatıyla çarparak sadece görsel olarak gösterir.
- **Indexer (Go / Rust):** **Helius Yellowstone gRPC (Geyser)** ile Solana validator'ından canlı veriyi çeker, Redis Stream kuyruğuna atar.
- **ClickHouse (Sistemin Hafızası ve Hesap Motoru):** Redis Stream'deki verileri 3 saniyede bir toplu (**Bulk Insert**) yazar. TradingView grafikleri (OHLC), hold süreleri ve UI'ın kontrata göndereceği anlık "Haftalık XP" değeri doğrudan buradan milisaniyeler içinde çekilir.
- **PostgreSQL:** Sadece kullanıcı profillerini ve klan bağlarını tutar. Artık XP hesabı veya haftalık sıfırlama işleriyle hiç uğraşmaz, tamamen rahatlar.
- **Redis ZSET:** Anlık klan ve ilk 100 sıralamasını sadece UI'da listelemek için RAM'den okutarak sunucu (VM) yükünü sıfırlar.

