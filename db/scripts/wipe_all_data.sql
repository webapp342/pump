-- Tüm uygulama verisini siler; şema (tablolar, index, trigger, MV tanımları, fonksiyonlar) aynen kalır.
--
-- Korunan: contract_registry, launchpad_tasks, platform_settings, admin_todos
--   (promoted campaigns + system mission tanımları, platform ayarları, ops todo)
--
-- Silinen (özet): users/XP, task completions, perks inventory/redemptions,
--   referral XP claims, airdrop campaigns + leaderboard rows, rewards rollups,
--   trades/tokens/positions, wallets, indexer_state
--
-- Tercih edilen yol: Admin → Environment → Wipe (çağırır: wipe_launchpad_app_data).
-- Bu script aynı kapsamı doğrudan TRUNCATE eder (fonksiyon yoksa / ops CLI).
--
-- VM örnek:
--   sudo -u postgres psql -d pump_db -f db/migrations/052_wipe_launchpad_app_data_comprehensive.sql
--   sudo -u postgres psql -d pump_db -f db/scripts/wipe_all_data.sql
--
-- Migration sonrası tertemiz başlangıç:
--   1) Bekleyen migration'ları uygula (özellikle 052)
--   2) Bu script VEYA Admin Wipe
--   3) Indexer: INDEXER_START_BLOCK ayarla; Admin Wipe seeds indexer_state + restart

BEGIN;

SELECT public.wipe_launchpad_app_data();

COMMIT;
