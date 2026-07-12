# zugchain-pump-tma

BSC Testnet meme launchpad — Telegram Mini App.

| | |
|---|---|
| VM | `104.207.64.115` |
| SSH port | `22022` |
| Veritabanı | `pump_db` (PostgreSQL 16) |
| Zincir | BSC Testnet (`chainId 97`) |

**Local'de sadece TMA (Next.js) çalışır.** Indexer, keeper, Redis, WebSocket servisi ve PostgreSQL VM'de koşar.

---

## Repo yapısı

```text
pump-tma/
├── .env.example              # Local / VM TMA şablonu
├── ecosystem.config.cjs      # PM2: pump-tma + pump-realtime
├── schema.sql                # VM pump_db şema dump'ı (veri yok)
├── src/                      # Next.js UI + API
├── indexer/                  # Indexer kaynak (VM'de ayrı klasöre sync)
├── indexer/.env.example      # VM indexer + keeper şablonu
├── realtime/                 # WebSocket sunucusu (Redis → tarayıcı)
├── db/
│   ├── migrations/           # PG index + MV SQL (001, 002, 003…)
│   └── refresh/              # MV refresh scriptleri
├── docs/perf-baseline.md     # Performans ölçüm notları
├── scripts/load/ws-smoke.mjs   # WS yük testi
├── contracts/                # Foundry kontratları
└── deploy/
    ├── tma-deploy.sh         # TMA build + static kopya + PM2
    ├── nginx-pump.conf       # nginx şablonu (referans)
    ├── pump-indexer.service
    ├── pump-airdrop-keeper.service
    └── vm/                   # Faz faz VM scriptleri (phase-0 … phase-6)
```

---

## Production mimarisi (VM)

```text
                         Tarayıcı
                            │
              http://104.207.64.115/  (port 80)
              ws://104.207.64.115/ws
                            │
                     nginx (:80)
                     sites-available/pump
                            │
            ┌───────────────┼───────────────┐
            │               │               │
      location /      location /ws    location /assets/
            │               │               │
            ▼               ▼               ▼
    PM2 pump-tma      PM2 pump-realtime   /var/pump/assets/
    :3012             :3013
    Next standalone       │
            │             │ Redis pub/sub
            ▼             ▼
       PostgreSQL    Redis :6379
       pump_db            ▲
            ▲              │
            │         pump-indexer (systemd)
            │              │
            └──────────────┘
                   BSC RPC (eth_getLogs)

pump-airdrop-keeper (systemd) → airdrop finalize tx
```

### VM dizinleri (kritik — karıştırma)

| Yol | Ne | Nasıl güncellenir |
|-----|-----|-------------------|
| `/var/www/pump/tma` | Git repo (TMA + realtime kaynak) | `git pull` / CI |
| `/var/www/pump/tma/.next/standalone` | PM2'nin çalıştırdığı TMA binary | `npm run build` + **static kopya** |
| `/var/www/pump/Indexer` | Indexer **çalışma** dizini (systemd) | `rsync` repo `indexer/` → buraya |
| `/var/www/pump/Indexer/.env` | Indexer + keeper env | **Asla rsync --delete ile silme** |
| `/var/www/pump/tma/.env` | TMA env | PM2 `env_file` |
| `/var/www/pump/tma/realtime/.env` | WS servisi env | PM2 `env_file` |
| `/etc/nginx/sites-available/pump` | Canlı nginx site config | `nano` + `nginx -t` + reload |

### Bileşenler — ne işe yarar

| Bileşen | Process | Port | Ne yapar |
|---------|---------|------|----------|
| **TMA** | PM2 `pump-tma` | 3012 | Next.js UI + REST API; arena/token okur |
| **Realtime** | PM2 `pump-realtime` | 3013 | Redis mesajlarını WebSocket'e iletir |
| **Redis** | systemd `redis-server` | 6379 | Indexer → WS pub/sub köprüsü |
| **Indexer** | systemd `pump-indexer` | — | On-chain event → DB; trade sonrası Redis publish |
| **Airdrop keeper** | systemd `pump-airdrop-keeper` | — | Qualify biten airdrop'ları finalize eder |
| **PostgreSQL** | systemd `postgresql` | 5432 | Tek kaynak: `pump_db` |
| **nginx** | systemd `nginx` | 80 | Reverse proxy: `/` → TMA, `/ws` → realtime |

DB kullanıcıları:

| Rol | Kim kullanır |
|-----|----------------|
| `pump_app` | TMA (`LAUNCHPAD_DATABASE_URL`) |
| `pump_indexer` | Indexer (yazma + MV refresh) |
| `postgres` | Migration'lar (`sudo -u postgres psql`) |

---

## Performans stack (özet)

Plan faz faz deploy edildi; her katman **feature flag** ile açılıp kapatılabilir.

| Faz | Ne | Flag / dosya | Etki |
|-----|-----|--------------|------|
| 0 | `pg_stat_statements` | PG config | Yavaş sorgu ölçümü |
| 1a | Partial indexler | `db/migrations/001_perf_indexes.sql` | Sorgu hızı (flag yok) |
| 1b | `bonding_states` okuma | `USE_BONDING_STATE_COUNTS=true` | Arena API hızlanır |
| 1c | Incremental `holder_count` | Indexer kodu | Indexer CPU ↓ |
| 2 | Materialized views | `USE_MV_TOKEN_STATS=true`, `MV_REFRESH_ENABLED=true` | Arena tek MV okur |
| 3 | Trade tek transaction | Indexer kodu | Yazma tutarlılığı |
| 4 | Redis + realtime | `REDIS_PUBLISH_ENABLED=true` | Canlı trade push |
| 5 | Client WebSocket | `NEXT_PUBLIC_WS_*` + **build** | Poll → WS hybrid |
| 6 | Tuning + load test | `deploy/vm/phase-6-scale.sh` | 1000 WS hedefi |

**Canlı veri akışı (trade):**

```text
Kullanıcı buy/sell → optimistic (0ms, receipt)
       ↓
Indexer trade indexler → PostgreSQL
       ↓
Redis PUBLISH pump:trade:{token}
       ↓
pump-realtime → WS room token:{addr} + arena
       ↓
Tarayıcı fetchLive() / state güncelleme
       ↓
HTTP poll 30s fallback (WS kopunca 4s)
```

Optimistic katman (`src/lib/optimistic-activity.ts`) **değiştirilmedi** — WS sadece indexer verisini hızlandırır.

### Production `.env` flag'leri (tam performans)

**`/var/www/pump/tma/.env`**

```env
USE_BONDING_STATE_COUNTS=true
USE_MV_TOKEN_STATS=true
NEXT_PUBLIC_WS_ENABLED=true
NEXT_PUBLIC_WS_URL=ws://104.207.64.115/ws
NEXT_PUBLIC_APP_URL=http://104.207.64.115
```

**`/var/www/pump/Indexer/.env`**

```env
MV_REFRESH_ENABLED=true
REDIS_PUBLISH_ENABLED=true
REDIS_URL=redis://127.0.0.1:6379
```

**`/var/www/pump/tma/realtime/.env`**

```env
PORT=3013
REDIS_URL=redis://127.0.0.1:6379
ALLOWED_ORIGINS=http://104.207.64.115
MAX_CONNECTIONS=2000
```

> Domain yoksa `ws://IP/ws` ve `ALLOWED_ORIGINS=http://IP` kullan. HTTPS gelince `wss://` + origin güncelle.

---

## Mimari (local geliştirme)

```text
BSC Testnet
    ↓ eth_getLogs
pump-indexer (VM)  →  pump_db  ←  pump_app (local TMA, SSH tunnel :15432)
```

| Bileşen | Nerede | Ne yapar |
|---------|--------|----------|
| TMA | Local `:3012` | UI + API, DB okur/yazar |
| Indexer | VM | Trade, token, airdrop event → DB |
| Airdrop keeper | VM | Süresi dolan airdrop'ları finalize eder |
| PostgreSQL | VM | Tek kaynak: `pump_db` |

---

## 1. Local geliştirme (TMA)

### 1.1 Ortam dosyası

```powershell
cd C:\Users\DARK\Desktop\pump-tma
copy .env.example .env
# .env içinde pump_app şifresini ve R2 bilgilerini doldur
```

### 1.2 DB tunnel (ayrı terminal — açık kalsın)

```powershell
ssh -p 22022 -L 15432:127.0.0.1:5432 root@104.207.64.115
```

`.env` içinde:

```env
DATABASE_URL=postgres://pump_app:SIFRE@127.0.0.1:15432/pump_db
```

### 1.3 Uygulamayı başlat

```powershell
npm install
npm run dev
```

→ http://localhost:3012

---

## 2. VM'den şema dump al (schema.sql)

Canlı DB şemasını local'e çekmek için. **Sadece şema, veri yok.**

### Yöntem A — Tek komut (önerilen, PowerShell)

Repo kökünde çalıştır; mevcut `schema.sql` üzerine yazar:

```powershell
cd C:\Users\DARK\Desktop\pump-tma

ssh -p 22022 root@104.207.64.115 "sudo -u postgres pg_dump -d pump_db --schema-only --no-owner --no-privileges" | Out-File -FilePath schema.sql -Encoding utf8
```

### Yöntem B — Önce VM'de dosya, sonra scp

VM'de:

```bash
sudo -u postgres pg_dump -d pump_db --schema-only --no-owner --no-privileges -f /tmp/pump_schema.sql
```

Local'de:

```powershell
scp -P 22022 root@104.207.64.115:/tmp/pump_schema.sql C:\Users\DARK\Desktop\zugchain-pump-tma\schema.sql
```

### Doğrulama

```powershell
Select-String -Path schema.sql -Pattern "CREATE TABLE" | Measure-Object
```

VM ile karşılaştırma:

```bash
ssh -p 22022 root@104.207.64.115 "sudo -u postgres psql -d pump_db -c '\dt'"
```

> Şema değişikliği yaptıktan sonra bu adımı tekrarla; `schema.sql` her zaman VM ile senkron kalsın.

---

## 3. Indexer + keeper güncelleme (VM)

Kaynak repoda `indexer/`; **çalıştırma** `/var/www/pump/Indexer` (systemd `WorkingDirectory`).

### 3.1 Dosyaları sync et (VM'de — önerilen)

```bash
cd /var/www/pump/tma
git pull

# .env ve node_modules SİLİNMEZ — --delete KULLANMA .env için
rsync -a --exclude '.env' --exclude 'node_modules' indexer/ /var/www/pump/Indexer/

cd /var/www/pump/Indexer
npm ci
npm run build
systemctl restart pump-indexer pump-airdrop-keeper
journalctl -u pump-indexer -n 20 --no-pager
```

> **Uyarı (2026-06-12 olayı):** `rsync -a --delete indexer/ /var/www/pump/Indexer/` komutu
> `/var/www/pump/Indexer/.env` dosyasını **sildi** çünkü kaynak klasörde `.env` yoktu.
> Indexer `Failed to load environment files` ile başlamadı. **Her zaman `--exclude '.env'` kullan.**

İlk kurulumda veya `.env` kaybolursa:

```bash
cd /var/www/pump/Indexer
cp .env.example .env
nano .env   # LAUNCHPAD_DATABASE_URL, BSC_RPC_URL, INDEXER_STATE_KEY, keeper key…
```

### 3.1b Dosyaları gönder (PowerShell, alternatif)

```powershell
cd C:\Users\DARK\Desktop\pump-tma

ssh -p 22022 root@104.207.64.115 "mkdir -p /var/www/pump/Indexer"

scp -P 22022 -r indexer\* root@104.207.64.115:/var/www/pump/Indexer/

# ABI — local'de bir kez build:
cd contracts
forge build
cd ..

scp -P 22022 -r contracts\out root@104.207.64.115:/var/www/pump/contracts/
```

### 3.2 VM'de build + restart

```bash
ssh -p 22022 root@104.207.64.115

cd /var/www/pump/Indexer
npm install
npm run build
systemctl restart pump-indexer pump-airdrop-keeper
systemctl status pump-indexer pump-airdrop-keeper
journalctl -u pump-indexer -f
```

### 3.3 VM `.env` (indexer + keeper)

Tek dosya — her iki systemd servisi de bunu okur: `/var/www/pump/Indexer/.env`

```bash
cd /var/www/pump/Indexer
cp .env.example .env
nano .env
```

Şablon: repo içinde `indexer/.env.example` (git'te). Özet:

| Değişken | Kim kullanır |
|----------|----------------|
| `LAUNCHPAD_DATABASE_URL`, `VM1_MAIN_DB_URL` | Indexer + keeper |
| `BSC_RPC_URL`, `INDEXER_*` | Indexer |
| `CONTRACT_ARTIFACTS_DIR` | Indexer (forge `out/`) |
| `AIRDROP_KEEPER_PRIVATE_KEY`, `AIRDROP_KEEPER_POLL_MS` | Airdrop keeper |
| `MV_REFRESH_ENABLED`, `REDIS_PUBLISH_ENABLED`, `REDIS_URL` | Performans / WS (Faz 2–4) |

`VM1_MAIN_DB_URL` boş kalırsa trade indexlenir ama **mission puanı yazılmaz**.

Keeper key **asla** root `.env`'ye (TMA) yazılmaz — sadece VM'deki bu dosyada.

### 3.4 systemd (ilk kurulum)

```powershell
scp -P 22022 deploy\pump-indexer.service root@104.207.64.115:/etc/systemd/system/
scp -P 22022 deploy\pump-airdrop-keeper.service root@104.207.64.115:/etc/systemd/system/
```

```bash
systemctl daemon-reload
systemctl enable --now pump-indexer pump-airdrop-keeper
```

---

## 4. Kontrat deploy (Foundry)

Sadece yeni deploy veya `PumpAirdropManager` eklerken. Private key **sadece** shell'de, dosyaya yazma.

```powershell
cd C:\Users\DARK\Desktop\pump-tma\contracts

$env:DEPLOYER_PRIVATE_KEY="0x..."
$env:LAUNCHPAD_OWNER_ADDRESS="0x..."
$env:BSC_TESTNET_RPC="https://bsc-testnet-rpc.publicnode.com"

forge test -vv
forge script script/DeployPumpBsc.s.sol:DeployPumpBsc --rpc-url $env:BSC_TESTNET_RPC --broadcast -vvv

# Sadece airdrop manager:
forge script script/DeployAirdropBsc.s.sol:DeployAirdropBsc --rpc-url $env:BSC_TESTNET_RPC --broadcast -vvv
```

Çıktı: `contracts/deployments/bsc-testnet-pump.json`, `bsc-testnet-airdrop.json`

### Mevcut testnet adresleri

| Kontrat | Adres |
|---------|-------|
| MemeFactory | `0x2Fa07dFd25f1C2F3E2C0b6084bc5e0b87c9997A2` |
| BondingCurveManager | `0xd59D34e98f1437507fb45D6960BF8d06EB986B33` |
| PumpAirdropManager | `0xA943566a158355504f089e37062145c0f67D1d2a` |
| Admin / keeper | `0x11Ea71d1BEb04Aece4d06a585D9dbc6F58836880` |

Deploy sonrası: VM indexer `.env` → `INDEXER_START_BLOCK`, local `.env` → `NEXT_PUBLIC_*` güncelle.

---

## 5. Airdrop keeper akışı

1. Kullanıcı TMA'dan kampanya oluşturur (on-chain tx)
2. Indexer `AirdropCreated` → `pump_db`
3. Qualify süresi biter
4. Keeper DB'den adayları okur → `finalizeAirdrop` tx gönderir
5. Indexer `AirdropFinalized` → DB (`merkle_root`, allocations)
6. TMA claim ekranı güncellenir

---

## 6. Yeni VM kurulumu (ilk kez)

Tek seferlik bootstrap script — PostgreSQL, nginx + Cloudflare Origin SSL, PM2, indexer systemd, CI/CD deploy key.

**VM'de (root):**

```bash
# 1) Repo
git clone https://github.com/CadaFinance/pump.git /var/www/pump/tma
cd /var/www/pump/tma

# 2) Cloudflare Origin cert (local cloudflare.txt — asla git'e ekleme)
# scp cloudflare.txt root@YENI_IP:/root/cloudflare.txt

# 3) Bootstrap config
cp deploy/vm/bootstrap.env.example deploy/vm/bootstrap.env
nano deploy/vm/bootstrap.env   # ALCHEMY_RPC_KEY, AUTH secrets, domain, CF path

# 4) Preflight (değişiklik yapmaz)
bash deploy/vm/bootstrap-production.sh

# 5) Kurulum
bash deploy/vm/bootstrap-production.sh --confirm
```

Script bittiğinde ekranda **GitHub Secrets**, Cloudflare DNS ve `.env` checklist'i çıkar.  
Sonraki deploy'lar: `main` push → `.github/workflows/deploy.yml` (eskisi gibi).

Eski manuel yol: `deploy/vm-setup.sh` + `schema.sql` (bootstrap bunları otomatik yapar).

---

## 8. Production deploy rehberi

### 8.1 Push sonrası ne otomatik olur?

`main` → GitHub Actions → `deploy/tma-deploy.sh` (**sadece TMA**):

```text
git pull → npm ci → npm run build → static kopyala → pm2 restart pump-tma
```

Tetikleyici path'ler (`.github/workflows/deploy-tma.yml`):

`src/**`, `public/**`, `package.json`, `next.config.ts`, `ecosystem.config.cjs`, `deploy/tma-deploy.sh`

**CI deploy ETMEZ:**

| Değişiklik | Sen yapmalısın |
|------------|----------------|
| `indexer/` | rsync → `/var/www/pump/Indexer` + build + systemctl restart |
| `realtime/` | `npm ci && npm run build` + `pm2 restart pump-realtime` |
| `db/migrations/*.sql` | `sudo -u postgres psql -d pump_db -f …` |
| nginx `/ws` | `/etc/nginx/sites-available/pump` düzenle + reload |
| `.env` flag değişikliği | Dosyayı düzenle + restart (aşağıya bak) |
| `NEXT_PUBLIC_*` değişikliği | **Build şart** (CI veya manuel static kopya) |

### 8.2 Push sonrası kontrol listesi

```bash
# 1) CI bitti mi — GitHub Actions yeşil mi?

# 2) VM'de servisler
pm2 status                              # pump-tma, pump-realtime online
systemctl is-active pump-indexer nginx redis-server

# 3) Health
curl -sf http://127.0.0.1:3012/api/health
curl -sf http://127.0.0.1:3013          # pump-realtime ok
curl -sf http://127.0.0.1/api/health    # nginx → TMA

# 4) Static (chunk 404 olmasın)
CHUNK=$(ls /var/www/pump/tma/.next/standalone/.next/static/chunks/ 2>/dev/null | head -1)
curl -s -o /dev/null -w "chunk=%{http_code}\n" "http://127.0.0.1/_next/static/chunks/$CHUNK"
# chunk=200 olmalı
```

Tam performans doğrulama script'i:

```bash
check() { printf "%-40s" "$1"; eval "$2" && echo OK || echo FAIL; }
check "TMA health"           "curl -sf http://127.0.0.1:3012/api/health"
check "Realtime"             "curl -sf http://127.0.0.1:3013"
check "Nginx health"         "curl -sf http://127.0.0.1/api/health"
check "Indexer active"       "systemctl is-active -q pump-indexer"
check "Redis PONG"           "redis-cli ping | grep -q PONG"
check "Static chunks exist"  "test $(ls /var/www/pump/tma/.next/standalone/.next/static/chunks/ 2>/dev/null | wc -l) -gt 0"
check "MV exists"            "sudo -u postgres psql -d pump_db -tAc \"SELECT 1 FROM pg_matviews WHERE matviewname='mv_token_trade_stats'\" | grep -q 1"
check "Bonding flag"         "grep -q '^USE_BONDING_STATE_COUNTS=true' /var/www/pump/tma/.env"
check "MV read flag"         "grep -q '^USE_MV_TOKEN_STATS=true' /var/www/pump/tma/.env"
check "WS client flag"       "grep -q '^NEXT_PUBLIC_WS_ENABLED=true' /var/www/pump/tma/.env"
check "Redis publish"        "grep -q '^REDIS_PUBLISH_ENABLED=true' /var/www/pump/Indexer/.env"
check "MV refresh"           "grep -q '^MV_REFRESH_ENABLED=true' /var/www/pump/Indexer/.env"
```

### 8.3 Manuel TMA deploy (VM)

**Her zaman `tma-deploy.sh` kullan** — sadece `npm run build` yetmez:

```bash
cd /var/www/pump/tma
./deploy/tma-deploy.sh
```

Script içeriği: build + `.next/static` → `.next/standalone/.next/static` kopyası + PM2 restart.

> **Dikkat:** `tma-deploy.sh` `git reset --hard origin/main` yapar. VM'de commit edilmemiş tracked değişiklikler silinir.
> `.env` git'te olmadığı için korunur.

### 8.4 Manuel build (NEXT_PUBLIC_* veya acil fix)

CI beklemeden build alırken **static kopyalamayı unutma** — aksi halde site boş kalır (Bölüm 9.1).

```bash
cd /var/www/pump/tma
npm run build
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
pm2 restart pump-tma --update-env
```

### 8.5 Flag değişince ne restart gerekir?

| Değişken | Restart | Build |
|----------|---------|-------|
| `USE_BONDING_STATE_COUNTS`, `USE_MV_TOKEN_STATS` | `pm2 restart pump-tma --update-env` | Hayır |
| `NEXT_PUBLIC_WS_*`, `NEXT_PUBLIC_APP_URL` | `pm2 restart pump-tma` | **Evet** + static kopya |
| `MV_REFRESH_*`, `REDIS_*` (indexer) | `systemctl restart pump-indexer` | Hayır |
| `realtime/.env` | `pm2 restart pump-realtime --update-env` | Hayır (kod değiştiyse `npm run build`) |

### 8.6 Realtime + nginx (ilk kurulum / güncelleme)

```bash
# Realtime
cd /var/www/pump/tma/realtime
cp .env.example .env && nano .env
npm ci && npm run build
cd /var/www/pump/tma
pm2 start ecosystem.config.cjs --only pump-realtime || pm2 restart pump-realtime
pm2 save

# nginx — CANLI dosya: /etc/nginx/sites-available/pump
# deploy/nginx-pump.conf şablon; location /ws bloğu location / 'dan ÖNCE olmalı
sudo nano /etc/nginx/sites-available/pump
sudo nginx -t && sudo systemctl reload nginx
```

Faz script'leri: `deploy/vm/phase-0-observability.sh` … `phase-6-scale.sh`

### 8.7 DB migration (VM)

```bash
cd /var/www/pump/tma
sudo -u postgres psql -d pump_db -f db/migrations/001_perf_indexes.sql
sudo -u postgres psql -d pump_db -f db/migrations/002_materialized_views.sql
sudo -u postgres psql -d pump_db -f db/refresh/refresh_mvs.sql
sudo -u postgres psql -d pump_db -f db/migrations/003_mv_ownership.sql   # pump_indexer owner
```

Migration sonrası `schema.sql` dump'ını güncelle (Bölüm 2).

### 8.8 Otomatik TMA deploy (GitHub Actions)

`main` branch'e push edilince GitHub Actions VM'ye SSH ile bağlanır, `deploy/tma-deploy.sh` çalıştırır.

Sadece UI dosyaları değişince tetiklenir. Indexer/kontrat/db push'ları TMA'yı deploy etmez.

#### Tek seferlik kurulum

**1) Deploy SSH key (local PowerShell)**

```powershell
ssh-keygen -t ed25519 -C "github-actions-pump-tma" -f $env:USERPROFILE\.ssh\pump_tma_deploy -N '""'
Get-Content $env:USERPROFILE\.ssh\pump_tma_deploy.pub
```

**2) Public key'i VM'ye ekle**

```bash
# VM'de — çıktıyı yapıştır
echo "ssh-ed25519 AAAA... github-actions-pump-tma" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

**3) GitHub repo secrets** ([Settings → Secrets → Actions](https://github.com/CadaFinance/pump/settings/secrets/actions))

| Secret | Değer |
|--------|--------|
| `VM_HOST` | `104.207.64.115` |
| `VM_USER` | `root` |
| `VM_SSH_PORT` | `22022` |
| `VM_SSH_KEY` | `pump_tma_deploy` dosyasının **private** içeriği |

**4) İlk kez script'i VM'ye al**

```bash
cd /var/www/pump/tma
git pull
chmod +x deploy/tma-deploy.sh
```

Sonraki deploy'lar tamamen otomatik (TMA için).

#### Manuel deploy (VM)

```bash
cd /var/www/pump/tma
./deploy/tma-deploy.sh
```

#### Kontrol

GitHub → **Actions** sekmesi → `Deploy TMA to VM` workflow run.

---

## 9. Bilinen sorunlar ve dikkat edilecekler

### 9.1 Static chunk 404 (boş sayfa / ChunkLoadError)

**Belirti:** HTML gelir (`200`) ama `/_next/static/chunks/*.js` → `404`, tarayıcı Console'da `ChunkLoadError`.

**Sebep:** Next.js `output: "standalone"` modunda PM2 `.next/standalone/server.js` çalıştırır.
Build sonrası chunk dosyaları `.next/static/` altında kalır; standalone klasörüne **manuel kopyalanmalı**.

**Çözüm:**

```bash
cd /var/www/pump/tma
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
pm2 restart pump-tma --update-env
```

Veya `./deploy/tma-deploy.sh` (kopyalamayı otomatik yapar).

**Kural:** VM'de `npm run build` yaptıysan → static kopyala. CI deploy'da script halleder.

### 9.2 Indexer `.env` silindi (rsync --delete)

**Belirti:** `systemctl restart pump-indexer` → `Failed to load environment files`.

**Sebep:** `rsync --delete` hedefteki `.env`'i siler.

**Çözüm:** `.env.example`'dan yeniden oluştur; `--exclude '.env'` kullan (Bölüm 3.1).

### 9.3 MV refresh: must be owner

**Belirti:** Indexer log: `mv refresh failed: must be owner of materialized view`.

**Sebep:** MV'ler `postgres` ile oluşturuldu, indexer `pump_indexer` ile refresh ediyor.

**Çözüm:**

```bash
sudo -u postgres psql -d pump_db -f db/migrations/003_mv_ownership.sql
```

### 9.4 WS bağlı ama mesaj yok (yavaş poll)

**Belirti:** F12 WS `101` ama Messages boş; sayfa 30s'de bir güncellenir.

**Sebep:** `NEXT_PUBLIC_WS_ENABLED=true` ama `REDIS_PUBLISH_ENABLED=false`.

**Çözüm:** Indexer `.env` → `REDIS_PUBLISH_ENABLED=true` + restart.
Veya WS'yi kapat: `NEXT_PUBLIC_WS_ENABLED=false` + rebuild.

### 9.5 nginx.conf vs sites-available/pump

`nginx -t` her zaman `/etc/nginx/nginx.conf syntax is ok` der — bu normal.
Canlı site config: `/etc/nginx/sites-enabled/pump` → `sites-available/pump`.

`/ws` bloğu `location /` **öncesinde** olmalı.

### 9.6 Kod değiştirirken dikkat

| Alan | Dikkat |
|------|--------|
| `src/lib/optimistic-activity.ts` | Optimistic receipt akışına dokunma — WS bunu replace etmez |
| `mergeTrades()` txHash dedup | Korunmalı |
| `NEXT_PUBLIC_*` | Build-time; deploy sonrası build kontrol et |
| `indexer/` | VM'de ayrı sync; push tek başına yetmez |
| `db/migrations/` | Production'da `CONCURRENTLY` indexler; MV owner grant unutma |
| `.env` | Git'e commit etme; rsync'te exclude |

---

## 10. Faydalı komutlar

### VM — servisler

```bash
pm2 status
pm2 logs pump-tma --lines 30 --nostream
pm2 logs pump-realtime --lines 20 --nostream
systemctl status pump-indexer pump-airdrop-keeper nginx --no-pager
journalctl -u pump-indexer -n 50 --no-pager
journalctl -u pump-indexer -f   # canlı trade / mv refresh / redis hataları
redis-cli ping
bash deploy/vm/phase-0-observability.sh   # API süresi + pg_stat_statements
```

### VM — performans

```bash
# Arena API süresi
curl -sf -w "tokens time=%{time_total}s\n" -o /dev/null http://127.0.0.1:3012/api/tokens

# trade_count tutarlılığı
sudo -u postgres psql -d pump_db -c "
SELECT t.address, b.trade_count,
       (SELECT count(*) FROM trades WHERE token_address=t.address) AS actual
FROM tokens t JOIN bonding_states b ON b.token_address=t.address
ORDER BY t.created_at DESC LIMIT 5;"

# WS smoke test
cd /var/www/pump/tma/realtime && node ../scripts/load/ws-smoke.mjs --connections 50 --url ws://127.0.0.1:3013
```

### VM — DB

```bash
sudo -u postgres psql -d pump_db -c "SELECT * FROM indexer_state;"
sudo -u postgres psql -d pump_db -c "\dt"
sudo -u postgres psql -d pump_db -c "\dm"
cd /var/www/pump/Indexer && npm run sync-king
cd /var/www/pump/Indexer && npm run sync-missions
```

### Local

```powershell
Invoke-WebRequest http://localhost:3012/api/tokens -UseBasicParsing
```

---

## 11. Notlar

- Local `.env` → sadece TMA. Indexer/keeper → `/var/www/pump/Indexer/.env`.
- Realtime → `/var/www/pump/tma/realtime/.env`.
- `schema.sql` → VM şema referansı; Bölüm 2 ile güncelle.
- `docs/perf-baseline.md` → deploy öncesi/sonrası API süreleri.
- Graduation keeper BSC pump'ta **kullanılmaz**.
- Foundry: `contracts/remappings.txt` → `zugchain-configuration/latest-uniswap/lib`.

---

## 12. GitHub

Repo: [github.com/CadaFinance/pump](https://github.com/CadaFinance/pump.git)

```powershell
cd C:\Users\DARK\Desktop\pump-tma
git add .
git status   # .env ve node_modules listede OLMAMALI
git commit -m "your message"
git push origin main
```
