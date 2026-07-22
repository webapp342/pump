**1. "Tampon Zaman" ve Kusursuz Sezon Geçiş Mimarisi**

Pazar gecesi geçiş anında sunucunun (VM) kilitlenmesini önlemek için süreç şu şekilde asenkron (paralel) olarak zamana yayılır:

1. **Saniyeler İçinde Sıfırlama (Pazar 23:59:59 UTC):** Saat tam bu ana geldiğinde, backend sunucunuz Redis üzerindeki `weekly_user_xp` ve `weekly_clan_xp` anahtarlarının (keys) ismini milisaniyede değiştirir (Örn: `weekly_user_xp_season_3` yapar). Hemen ardından, canlı trafik için boş ve yeni `weekly_user_xp` ve `weekly_clan_xp` setlerini oluşturur.
  - **Sonuç:** Kullanıcılar Pazartesi 00:00:00 olduğunda sıfır gecikmeyle yeni sezona (0 XP ile) başlarlar. Canlı trade trafiği kesintisiz devam eder, sunucuya hiçbir yük binmez.
2. **Arka Planda Hesaplama (Hesaplaşma Dönemi):** Backend sunucunuz, ismi değişen o eski sezonun Redis datasına bakar. İlk 100 balinayı, ilk 3 klanı ve klan içi yüzde kırılımlarını arka planda acele etmeden, tamamen asenkron olarak hesaplar.
3. **Zamana Yayılmış On-Chain Kayıt (Milisaniyede Değil!):** Hesaplanan bu kesin liste, Pazartesi günü gün boyunca (örneğin sonraki 12 saat içinde) backend tarafından **parça parça paketler halinde (chunked transactions)** Solana kontratına yazılır.
4. **Claim'e Açılma Zamanı:** Kontratta o sezonun verileri tamamen dolup kilitlendiğinde backend bir "Aktif" bayrağı tetikler. Kullanıcılar için eski sezonun ödüllerini claim etme hakkı örneğin **Pazartesi günü öğlen 12:00 UTC**'de başlar. Böylece saniyelik bir karmaşa tamamen önlenir.

---

**2. Redis Çift Sayaç Mimarisi (Canlı Trafik Kalkanı)**

Klan puanlarını hesaplarken VM'e tek bir milisaniye bile yük bindirmemek için **Redis Sorted Sets (ZSET)** üzerinde iki adet bağımsız paralel sayaç tutulur:

- `weekly_user_xp` -> Her cüzdanın o haftaki güncel bireysel XP'sini tutar.
- `weekly_clan_xp` -> Her klanın o haftaki güncel toplam XP'sini tutar.
- **Görevlerde Puan Ekleme:** Kullanıcı X/Telegram görevini yaptığında backend Redis'te bu iki sayacı birden `ZINCRBY` ile RAM hızıyla (0.1ms) artırır. Böylece klan sıralaması için veritabanında asla toplama (`SUM`) yapılmaz.

---

**3. %1.25 Sabit Komisyon (Fee) Paylaşım Planı (Sadece SOL)**

Tüm kontrat ve claims süreçleri **kesinlikle ham SOL (Lamports)** cinsinden çalışır. Hiçbir ödeme otomatik gönderilmez; hepsi kullanıcı tarafından **manuel claim** edilir.

- **%0.3125 (Token Creator):** On-chain her swapta kontrat tarafından anlık olarak geliştiricinin PDA defterine yazılır. Manuel claim edilir.
- **%0.1875 (Referrer):** On-chain her swapta kontrat tarafından anlık olarak davet edenin PDA defterine yazılır. Manuel claim edilir.
- **%0.1250 (Anlık Cashback):** ClickHouse'dan gelen hazır XP parametresi ≥ 1000 ise kontrat tarafından anlık kullanıcının PDA defterine yazılır. İstediği an manuel claim edilir.
- **%0.3125 (Haftalık Klan Havuzu):** İlk 3 klan arasında bölünbr (Lidere %20, üyelere klan içi XP ağırlığına göre %80). Yukarıda anlattığımız "Tampon Zaman" sonrasında kontrata kilitlenir, manuel claim edilir.
- **%0.2125 (Haftalık XP Liderlik Havuzu):** Bireysel XP sıralamasında İlk 100 Kişiye (Balinalara) pazar gecesi kesinleşen oranlarına göre tampon zaman sonrasında dağıtılır. Manuel claim edilir.
- **%0.1000 (Sizin Kasanız):** Platform net kârı anlık olarak şirket cüzdanınıza veya ana kontrat kasasına akar.

---

**4. "Portfolio" (Profil) Sayfası Akışı ve Doğru Veri Sorguları**

Kullanıcı portfolio sayfasına tıkladığı an, arayüz (UI) arka planda **sadece bizim platformumuz tarafından oluşturulan tokenları içeren** şu hafif API isteklerini fırlatır:

1. **API 1 (PostgreSQL):** Kullanıcının on-chain kontrattan çekebileceği (claim edilebilir) anlık ve geçmiş haftalık sezon bazlı birikmiş net **SOL** bakiyelerini çeker (`creator_fee_sol`, `cashback_sol` vb.).
2. **API 2 (LaserStream WSS / Helius Assets API):** Kullanıcının cüzdanında tuttuğu, **sadece bizim platformumuz tarafından üretilmiş olan tokenların güncel bakiyelerini** listeler.
3. **API 3 (ClickHouse):** Kullanıcının sadece bizim platformumuzdaki tokenlarda yaptığı geçmiş al-sat işlemlerinin listesini (Trading History) çeker. (Portföy sayfasında grafik yükü olmaz).

- **Canlı USD Gösterimi (Client-Side):** Veritabanlarında asla USD fiyatı saklanmaz. Merkezi bir worker fiyatı Jupiter Price API ile çekip Redis'e yazar. UI, gelen saf SOL ve platform token miktarlarını kullanıcının kendi cihazında (Client-Side) anlık dolar fiyatıyla çarparak sadece görsel olarak gösterir.

---

**5. "Missions" (Görevler) Sistemi ve İlerleme Durumu**

- **Tür A: Off-Chain Görevler (X/Twitter, Telegram):** Backend onayıyla anlık olarak hem `weekly_user_xp` hem de `weekly_clan_xp` Redis sayaçlarına RAM hızıyla eklenir. Pazar gecesi bu anahtarların ismi değiştirilerek (`rename`) dondurulur ve yeni sezon için temiz sayaçlar açılır.
- **Tür B: On-Chain Kalıcı Başarı Görevleri (Volume Monster, First Token vb.):** Bu görevler **haftalık sıfırlanmaz ve ilerlemesi silinmez.** Kullanıcının ömür boyu (lifetime) ilerlemesi **ClickHouse** üzerinde kalıcı olarak saklanır. Görev bittiği an, backend tek seferlik devasa ödül XP'sini o haftanın aktif yarışma havuzuna (Redis'teki iki sayaca birden) anında fırlatır.

---

**6. En Optimize Performans Stack'i (Özet)**

- **Indexer (Go / Rust):** **Helius LaserStream gRPC (Geyser)** ile Solana validator'ından canlı event loglarını yakalar, hiçbir hesaplama yapmadan sadece **Redis Stream** kuyruğuna atar.
- **ClickHouse (Hesap Motoru):** Verileri 3 saniyede bir toplu (**Bulk Insert**) yazar. Sadece bizim platformun token geçmişini, ömür boyu görev ilerlemelerini (Volume Monster) ve UI'dan kontrata gidecek "Haftalık XP" değerini milisaniyeler içinde üretir.
- **PostgreSQL:** Kullanıcı profillerini ve kalıcı klan bağlarını tutar. Finansal netliği sağlar.
- **Redis ZSET:** Bireysel ve klan XP'lerini iki paralel canlı sayaç olarak RAM'de tutar. Pazar gecesi `RENAME` taktiği ile canlı trafiği kesintiye uğratmadan sezon geçişini saniyesinde tamamlar.

Sezon geçiş anına **"Tampon Zaman" (Settlement Period) ve Redis** `RENAME` **mekanizmasını** ekleyerek, o kritik saniyedeki tüm kilitlenme risklerini ve karmaşayı tamamen yok ettik.