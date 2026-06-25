-- Tüm uygulama verisini siler; şema (tablolar, index, trigger, MV tanımları, fonksiyonlar) aynen kalır.
--
-- Korunan: contract_registry, launchpad_tasks, platform_settings, admin_todos
-- (system mission tanımları, admin platform ayarları, ops todo listesi)
--
-- VM örnek:
--   sudo -u postgres psql -d pump_db -f db/scripts/wipe_all_data.sql
--
-- Migration sonrası tertemiz başlangıç:
--   1) Önce bekleyen migration'ları uygula (004, 005, ...)
--   2) Bu script'i çalıştır
--   3) Indexer cursor: Admin → Environment → set INDEXER_START_BLOCK (head − 1),
--      then Admin → Dashboard → Wipe (seeds indexer_state + restarts indexer)

BEGIN;

TRUNCATE TABLE
  public.airdrop_task_completions,
  public.airdrop_saves,
  public.airdrop_claims,
  public.airdrop_allocations,
  public.airdrop_participants,
  public.airdrop_social_tasks,
  public.airdrops,
  public.bonding_states,
  public.creator_fee_claims,
  public.referrer_fee_claims,
  public.referral_bindings,
  public.creator_follows,
  public.deep_links,
  public.king_history,
  public.launchpad_points_sync_log,
  public.launchpad_user_daily_completions,
  public.launchpad_user_task_completions,
  public.points_audit_log,
  public.trades,
  public.token_favorites,
  public.token_media,
  public.user_positions,
  public.user_volumes,
  public.tokens,
  public.users,
  public.telegram_wallets,
  public.email_wallets,
  public.indexer_state
RESTART IDENTITY CASCADE;

-- MV'ler base tablolardan türetilir; satırları yenile (tanımlar korunur)
REFRESH MATERIALIZED VIEW public.mv_token_trade_stats;
REFRESH MATERIALIZED VIEW public.mv_token_price_anchors;

-- indexer_state boş kalır.
-- contract_registry: Admin wipe API re-syncs from .env (NEXT_PUBLIC_* contract addresses).
-- Indexer cursor: set INDEXER_START_BLOCK in Indexer .env, then Admin → Wipe (seeds indexer_state).

COMMIT;
