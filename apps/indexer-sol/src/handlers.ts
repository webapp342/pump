import type pg from "pg";
import { PUMP_FEEL_DEFAULTS } from "@pump/solana-sdk";
import type { DecodedSolanaEvent } from "./decode.js";
import { withTransaction } from "./db-tx.js";
import {
  seedBoardStatsOnTokenCreated,
  upsertBoardStatsAfterTrade,
  readBoardStatsForPublish,
} from "./board-stats.js";
import {
  commitLiveCandleUpdates,
  computeLiveCandleUpdates,
  persistCandleUpdatesToPg,
} from "./candles.js";
import { enqueueTradeClickHouse } from "./clickhouse.js";
import { fetchIndexerNativeUsdRate } from "./native-usd.js";
import { applyTradeToPositionCost } from "./position-cost.js";
import { publishTrade, publishWalletTrade } from "./redis-publish.js";
import { enqueueCandlesChStream, enqueueTradeChStream } from "./redis-ch-stream.js";
import { enqueueCandlesClickHouse } from "./clickhouse-candles.js";
import { pushHotTapeTrade } from "./redis-hot-cache.js";
import {
  FIRST_SMART_BUY_MIN_LAMPORTS,
  VOLUME_MONSTER_MIN_SOL,
} from "./mission-thresholds.js";
import { PointsBridge, TASK_KEYS } from "./points.js";
import { awardWeeklyXp, lookupClanId } from "./weekly-xp.js";
import { clickhouseViaRedisStream } from "./redis-ch-stream.js";
import {
  asBigInt,
  asBool,
  asString,
  eventId,
  executionPriceSol,
  feeSplitKey,
  lamportsToSol,
  marketCapSolFromSpot,
  spotPriceSolPerToken,
  startingSpotFromVirtual,
  tokenAmountToDecimal,
} from "./units.js";

type FeeSplit = {
  creatorFee: bigint;
  referrerFee: bigint;
  treasuryFee: bigint;
  cashbackFee?: bigint;
  userXp?: number;
};

export type HandlerContext = {
  launchpadPool: pg.Pool;
  chainId: number;
  tokenDecimals: number;
  pointsBridge?: PointsBridge;
};

/**
 * Persist Solana Anchor events into the same Postgres shapes as the EVM indexer.
 * Column names still say `*_zug` (legacy); values are SOL / token decimals.
 */
export class SolanaEventHandlers {
  private readonly pendingFeeSplits = new Map<string, FeeSplit>();

  constructor(private readonly context: HandlerContext) {}

  async dispatch(event: DecodedSolanaEvent): Promise<void> {
    if (!event.handler || !event.fields) {
      if (!event.fields) {
        console.log(
          `[indexer-sol] skip undecoded name=${event.name} sig=${event.signature}`
        );
      }
      return;
    }

    switch (event.handler) {
      case "onTokenCreated":
        await this.onTokenCreated(event);
        break;
      case "onTokenRegistered":
        await this.onTokenRegistered(event);
        break;
      case "onTrade":
        await this.onTrade(event);
        break;
      case "onFeeSplit":
        this.onFeeSplit(event);
        break;
      case "onFeeSplitV2":
        this.onFeeSplitV2(event);
        break;
      case "onReferrerSet":
        await this.onReferrerSet(event);
        break;
      case "onCreatorFeeClaimed":
        await this.onCreatorFeeClaimed(event);
        break;
      case "onReferrerFeeClaimed":
        await this.onReferrerFeeClaimed(event);
        break;
      case "onEmergencyEthSwept":
      case "onTreasuryWithdraw":
        console.log(
          `[indexer-sol] ${event.name} noted sig=${event.signature} (ops only)`
        );
        break;
      default:
        break;
    }
  }

  private onFeeSplit(event: DecodedSolanaEvent): void {
    const f = event.fields!;
    const mint = asString(f.mint);
    this.pendingFeeSplits.set(feeSplitKey(event.signature, mint), {
      creatorFee: asBigInt(f.creatorFee),
      referrerFee: asBigInt(f.referrerFee),
      treasuryFee: asBigInt(f.treasuryFee),
    });
  }

  private onFeeSplitV2(event: DecodedSolanaEvent): void {
    const f = event.fields!;
    const mint = asString(f.mint);
    const platformFee = asBigInt(f.platformFee);
    const seasonPoolFee = asBigInt(f.seasonPoolFee);
    const clanPoolFee = asBigInt(f.clanPoolFee);
    const userXp = typeof f.userXp === "number" ? f.userXp : 0;
    this.pendingFeeSplits.set(feeSplitKey(event.signature, mint), {
      creatorFee: asBigInt(f.creatorFee),
      referrerFee: asBigInt(f.referrerFee),
      treasuryFee: platformFee + seasonPoolFee + clanPoolFee,
      cashbackFee: asBigInt(f.cashbackFee),
      userXp,
    });
    if (userXp > 0) {
      console.log(
        `[indexer-sol] fee_v2 user_xp=${userXp} cashback=${String(f.cashbackFee)} sig=${event.signature}`
      );
    }
  }

  async onTokenCreated(event: DecodedSolanaEvent): Promise<void> {
    const f = event.fields!;
    const mint = asString(f.mint);
    const creator = asString(f.creator);
    const virtualSol = asBigInt(f.virtualSolReserve);
    const decimals =
      typeof f.decimals === "number" ? f.decimals : this.context.tokenDecimals;
    const virtualToken = PUMP_FEEL_DEFAULTS.virtualTokenReserves;
    const spot = startingSpotFromVirtual(virtualSol, virtualToken, decimals);
    const mcap = marketCapSolFromSpot(spot);
    const blockTime = new Date();

    await this.context.launchpadPool.query(
      `
        INSERT INTO tokens (
          address,
          chain_id,
          creator_address,
          name,
          symbol,
          metadata_uri,
          launch_tx_hash,
          launch_block_number,
          status,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'BONDING', $9, now())
        ON CONFLICT (address) DO UPDATE
        SET creator_address = EXCLUDED.creator_address,
            name = COALESCE(NULLIF(EXCLUDED.name, ''), tokens.name),
            symbol = COALESCE(NULLIF(EXCLUDED.symbol, ''), tokens.symbol),
            metadata_uri = COALESCE(NULLIF(EXCLUDED.metadata_uri, ''), tokens.metadata_uri),
            updated_at = now()
      `,
      [
        mint,
        this.context.chainId,
        creator,
        asString(f.name),
        asString(f.symbol),
        asString(f.uri),
        event.signature,
        String(event.slot),
        blockTime,
      ]
    );

    await this.context.launchpadPool.query(
      `
        INSERT INTO bonding_states (
          token_address,
          target_zug,
          market_cap_zug,
          last_price_zug,
          virtual_zug_reserve,
          virtual_token_reserve,
          vault_token_reserve,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
        ON CONFLICT (token_address) DO UPDATE
        SET virtual_zug_reserve = EXCLUDED.virtual_zug_reserve,
            last_price_zug = COALESCE(NULLIF(bonding_states.last_price_zug, 0), EXCLUDED.last_price_zug),
            vault_token_reserve = COALESCE(bonding_states.vault_token_reserve, EXCLUDED.vault_token_reserve),
            updated_at = now()
      `,
      [
        mint,
        "0",
        mcap,
        spot,
        lamportsToSol(virtualSol),
        tokenAmountToDecimal(virtualToken, decimals),
        String(PUMP_FEEL_DEFAULTS.totalSupply / 10n ** BigInt(decimals)),
      ]
    );

    await seedBoardStatsOnTokenCreated(this.context.launchpadPool, {
      tokenAddress: mint,
      marketCapZug: mcap,
      spotPriceZug: spot,
      reserveZug: "0",
      tokenSold: "0",
      progressBps: 0,
    });

    await this.context.pointsBridge?.award({
      address: creator,
      taskKey: TASK_KEYS.deployMeme,
      eventId: eventId(event.signature, event.logIndex),
      txHash: event.signature,
      blockTime,
      metadata: { token: mint, source: "TokenCreated" },
    });

    console.log(
      `[indexer-sol] TokenCreated mint=${mint} symbol=${asString(f.symbol)}`
    );
  }

  async onTokenRegistered(event: DecodedSolanaEvent): Promise<void> {
    const f = event.fields!;
    const mint = asString(f.mint);
    const virtualSol = asBigInt(f.virtualSolReserve);
    const virtualToken = asBigInt(f.virtualTokenReserve);
    const decimals = this.context.tokenDecimals;

    await this.context.launchpadPool.query(
      `
        UPDATE bonding_states
        SET virtual_zug_reserve = $2,
            virtual_token_reserve = $3,
            updated_at = now()
        WHERE token_address = $1
      `,
      [
        mint,
        lamportsToSol(virtualSol),
        tokenAmountToDecimal(virtualToken, decimals),
      ]
    );
  }

  async onTrade(event: DecodedSolanaEvent): Promise<void> {
    const f = event.fields!;
    const mint = asString(f.mint);
    const trader = asString(f.trader);
    const isBuy = asBool(f.isBuy);
    const solAmount = asBigInt(f.solAmount);
    const tokenAmount = asBigInt(f.tokenAmount);
    const feeLamports = asBigInt(f.feeLamports);
    const reserveSol = asBigInt(f.reserveSol);
    const soldTokens = asBigInt(f.soldTokens);
    const spotRaw = asBigInt(f.spotPrice);
    const decimals = this.context.tokenDecimals;

    const exists = await this.context.launchpadPool.query(
      `SELECT 1 FROM tokens WHERE address = $1 LIMIT 1`,
      [mint]
    );
    if (!exists.rowCount) {
      console.warn(
        `[indexer-sol] skip Trade: token ${mint} missing (sig ${event.signature})`
      );
      return;
    }

    const feeSplit = this.pendingFeeSplits.get(
      feeSplitKey(event.signature, mint)
    ) ?? { creatorFee: 0n, referrerFee: 0n, treasuryFee: 0n };
    this.pendingFeeSplits.delete(feeSplitKey(event.signature, mint));

    const side = isBuy ? "BUY" : "SELL";
    const executionPrice = executionPriceSol(solAmount, tokenAmount, decimals);
    const spotFromChain = spotPriceSolPerToken(spotRaw, decimals);
    const markPrice =
      Number(spotFromChain) > 0 ? spotFromChain : executionPrice;
    const tradeEventId = eventId(event.signature, event.logIndex);
    const blockTime = new Date();
    const mcap = marketCapSolFromSpot(markPrice);
    const nativeUsdRate = await fetchIndexerNativeUsdRate();
    const nativeUsdRateValue =
      nativeUsdRate != null && nativeUsdRate > 0 ? nativeUsdRate : null;

    const priorSpotRow = await this.context.launchpadPool.query<{
      last_price_zug: string | null;
    }>(
      `SELECT last_price_zug::text FROM bonding_states WHERE token_address = $1`,
      [mint]
    );
    const priorSpot = Number(priorSpotRow.rows[0]?.last_price_zug ?? 0);
    const spotBefore =
      Number.isFinite(priorSpot) && priorSpot > 0 ? priorSpot : Number(markPrice);

    const inserted = await withTransaction(
      this.context.launchpadPool,
      async (client) => {
        const tradeIns = await client.query<{ id: string }>(
          `
            INSERT INTO trades (
              event_id,
              token_address,
              trader_address,
              side,
              zug_amount,
              token_amount,
              price_zug,
              spot_price_zug,
              fee_zug,
              creator_fee_zug,
              treasury_fee_zug,
              referrer_fee_zug,
              tx_hash,
              log_index,
              block_number,
              block_time,
              native_usd_rate
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            ON CONFLICT (tx_hash, log_index) DO NOTHING
            RETURNING id
          `,
          [
            tradeEventId,
            mint,
            trader,
            side,
            lamportsToSol(solAmount),
            tokenAmountToDecimal(tokenAmount, decimals),
            executionPrice,
            markPrice,
            lamportsToSol(feeLamports),
            lamportsToSol(feeSplit.creatorFee),
            lamportsToSol(feeSplit.treasuryFee),
            lamportsToSol(feeSplit.referrerFee),
            event.signature,
            event.logIndex,
            String(event.slot),
            blockTime,
            nativeUsdRateValue,
          ]
        );

        if (!tradeIns.rowCount || !tradeIns.rows[0]) return null;

        const tradeId = tradeIns.rows[0].id;

        const tokenSoldHuman = tokenAmountToDecimal(soldTokens, decimals);
        const tokenDeltaHuman = tokenAmountToDecimal(tokenAmount, decimals);
        const tokenSoldNum = Number(tokenSoldHuman);

        await client.query(
          `
            UPDATE bonding_states
            SET reserve_zug = $2,
                token_sold = $3,
                progress_bps = LEAST(
                  10000,
                  CASE
                    WHEN $3::numeric >= 793100000 THEN 10000
                    ELSE floor(($3::numeric / 793100000) * 10000)::integer
                  END
                ),
                curve_complete = CASE
                  WHEN $3::numeric >= 793100000 THEN true
                  ELSE curve_complete
                END,
                vault_token_reserve = GREATEST(
                  0,
                  COALESCE(vault_token_reserve, 1000000000)
                    + CASE WHEN $4 THEN -$5::numeric ELSE $5::numeric END
                ),
                last_price_zug = $6,
                market_cap_zug = $7,
                trade_count = trade_count + 1,
                updated_at = now()
            WHERE token_address = $1
          `,
          [
            mint,
            lamportsToSol(reserveSol),
            tokenSoldHuman,
            isBuy,
            tokenDeltaHuman,
            markPrice,
            mcap,
          ]
        );

        const progressBps = Math.min(
          10000,
          tokenSoldNum >= 793_100_000
            ? 10000
            : Math.floor((tokenSoldNum / 793_100_000) * 10000)
        );
        const isGraduated = progressBps >= 10000;

        if (isGraduated) {
          await client.query(
            `
              UPDATE tokens
              SET status = 'GRADUATED', updated_at = now()
              WHERE address = $1 AND status = 'BONDING'
            `,
            [mint]
          );
        }

        await this.updatePosition(
          client,
          mint,
          trader,
          isBuy,
          solAmount,
          feeLamports,
          tokenAmount,
          decimals,
          nativeUsdRateValue
        );

        await this.upsertUserVolume(client, trader, solAmount, isBuy);

        const bonding = await client.query<{
          reserve_zug: string;
          token_sold: string;
          trade_count: number;
          holder_count: number;
          progress_bps: number;
          curve_complete: boolean;
          vault_token_reserve: string | null;
        }>(
          `
            SELECT
              COALESCE(reserve_zug, 0)::text AS reserve_zug,
              COALESCE(token_sold, 0)::text AS token_sold,
              COALESCE(trade_count, 0) AS trade_count,
              COALESCE(holder_count, 0) AS holder_count,
              COALESCE(progress_bps, 0) AS progress_bps,
              COALESCE(curve_complete, false) AS curve_complete,
              vault_token_reserve::text AS vault_token_reserve
            FROM bonding_states
            WHERE token_address = $1
          `,
          [mint]
        );
        const b = bonding.rows[0] ?? {
          reserve_zug: lamportsToSol(reserveSol),
          token_sold: tokenSoldHuman,
          trade_count: 1,
          holder_count: 0,
          progress_bps: isGraduated ? 10000 : progressBps,
          curve_complete: isGraduated,
          vault_token_reserve: null,
        };

        const grossSol = Number(lamportsToSol(solAmount));
        const feeSol = Number(lamportsToSol(feeLamports));
        const tradeNetZug = String(Math.max(0, grossSol - feeSol));
        const spotNum = Number(markPrice);

        await upsertBoardStatsAfterTrade(client, {
          tokenAddress: mint,
          reserveZug: b.reserve_zug,
          tokenSold: b.token_sold,
          spotPriceZug: markPrice,
          marketCapZug: mcap,
          progressBps: b.progress_bps,
          tradeCount: b.trade_count,
          holderCount: b.holder_count,
          tradeNetZug,
          blockTime,
          traderAddress: trader,
        });

        // Dual-path: OHLC lives outside this TX (Redis/WS first, PG/CH after).
        return {
          tradeId,
          bonding: b,
          nativeUsdRate: nativeUsdRateValue,
          volumeZug: Math.max(0, grossSol - feeSol),
          spotAfter: spotNum,
        };
      }
    );

    if (inserted) {
      const candleInput = {
        tokenAddress: mint,
        blockTime,
        isBuy,
        spotBefore,
        spotAfter: inserted.spotAfter,
        volumeZug: inserted.volumeZug,
        buyVolumeZug: isBuy ? inserted.volumeZug : 0,
        nativeUsdRate: inserted.nativeUsdRate,
      };

      // LIVE PATH: compute once → seal hot tip → WS (never wait on PG candles).
      const [candleUpdates, boardExtra] = await Promise.all([
        computeLiveCandleUpdates(candleInput),
        readBoardStatsForPublish(this.context.launchpadPool, mint),
      ]);
      await commitLiveCandleUpdates(mint, candleUpdates);
      await publishTrade({
        type: "trade",
        tokenAddress: mint,
        candleUpdates,
        trade: {
          id: inserted.tradeId,
          side,
          traderAddress: trader,
          zugAmount: lamportsToSol(solAmount),
          feeZug: lamportsToSol(feeLamports),
          tokenAmount: tokenAmountToDecimal(tokenAmount, decimals),
          priceZug: executionPrice,
          txHash: event.signature,
          logIndex: event.logIndex,
          blockTime: blockTime.toISOString(),
          nativeUsdRate:
            inserted.nativeUsdRate != null && inserted.nativeUsdRate > 0
              ? String(inserted.nativeUsdRate)
              : undefined,
        },
        bonding: {
          reserveZug: inserted.bonding.reserve_zug,
          tokenSold: inserted.bonding.token_sold,
          marketCapZug: mcap,
          spotPriceZug: markPrice,
          lastPriceZug: markPrice,
          progressBps: inserted.bonding.progress_bps,
          graduated: inserted.bonding.curve_complete,
          curveComplete: inserted.bonding.curve_complete,
          vaultTokenReserve: inserted.bonding.vault_token_reserve ?? undefined,
          tradeCount: inserted.bonding.trade_count,
          holderCount: inserted.bonding.holder_count,
          volume24hZug: boardExtra?.volume24hZug,
          traders24h: boardExtra?.traders24h,
        },
      });
      void pushHotTapeTrade(mint, {
        id: inserted.tradeId,
        side,
        traderAddress: trader,
        zugAmount: lamportsToSol(solAmount),
        feeZug: lamportsToSol(feeLamports),
        tokenAmount: tokenAmountToDecimal(tokenAmount, decimals),
        priceZug: executionPrice,
        txHash: event.signature,
        logIndex: event.logIndex,
        blockTime: blockTime.toISOString(),
      });

      // DURABLE PATH: CH + optional PG mirror (same OHLC payload; must not block tip).
      const chTradeRow = {
        event_id: tradeEventId,
        token_address: mint,
        trader_address: trader,
        side,
        sol_amount: Number(lamportsToSol(solAmount)),
        token_amount: Number(tokenAmountToDecimal(tokenAmount, decimals)),
        price_sol: Number(executionPrice),
        spot_price_sol: Number(markPrice),
        spot_before_sol: Number(spotBefore),
        fee_sol: Number(lamportsToSol(feeLamports)),
        tx_hash: event.signature,
        log_index: event.logIndex,
        slot: Number(event.slot),
        block_time: blockTime,
        native_usd_rate: inserted.nativeUsdRate,
      };
      if (clickhouseViaRedisStream()) {
        enqueueTradeChStream(chTradeRow);
      } else {
        enqueueTradeClickHouse(chTradeRow);
      }
      if (clickhouseViaRedisStream()) {
        enqueueCandlesChStream(
          candleUpdates.map((c) => ({
            token_address: mint,
            candle_interval: c.interval,
            bucket_start: new Date(c.time * 1000)
              .toISOString()
              .replace("T", " ")
              .replace("Z", ""),
            open_sol: Number(c.open),
            high_sol: Number(c.high),
            low_sol: Number(c.low),
            close_sol: Number(c.close),
            volume_sol: Number(c.volume),
            buy_volume_sol: Number(c.buyVolume),
            trade_count: c.tradeCount,
          }))
        );
      } else {
        enqueueCandlesClickHouse(mint, candleUpdates);
      }
      void persistCandleUpdatesToPg(
        this.context.launchpadPool,
        mint,
        candleUpdates,
        inserted.nativeUsdRate
      );

      const positionRow = await this.context.launchpadPool.query<{
        token_balance: string;
        remaining_cost_basis_zug: string;
        realized_pnl_zug: string;
        remaining_cost_basis_usd: string;
        realized_pnl_usd: string;
      }>(
        `
          SELECT
            token_balance::text,
            COALESCE(remaining_cost_basis_zug, 0)::text AS remaining_cost_basis_zug,
            realized_pnl_zug::text,
            COALESCE(remaining_cost_basis_usd, 0)::text AS remaining_cost_basis_usd,
            COALESCE(realized_pnl_usd, 0)::text AS realized_pnl_usd
          FROM user_positions
          WHERE token_address = $1 AND address = $2
        `,
        [mint, trader]
      );
      const position = positionRow.rows[0];
      if (position) {
        await publishWalletTrade({
          type: "wallet_trade",
          walletAddress: trader,
          tokenAddress: mint,
          trade: {
            id: inserted.tradeId,
            side,
            traderAddress: trader,
            zugAmount: lamportsToSol(solAmount),
            feeZug: lamportsToSol(feeLamports),
            tokenAmount: tokenAmountToDecimal(tokenAmount, decimals),
            priceZug: executionPrice,
            txHash: event.signature,
            logIndex: event.logIndex,
            blockTime: blockTime.toISOString(),
          },
          position: {
            tokenBalance: position.token_balance,
            remainingCostBasisZug: position.remaining_cost_basis_zug,
            realizedPnlZug: position.realized_pnl_zug,
            remainingCostBasisUsd: position.remaining_cost_basis_usd,
            realizedPnlUsd: position.realized_pnl_usd,
          },
          bonding: {
            reserveZug: inserted.bonding.reserve_zug,
            tokenSold: inserted.bonding.token_sold,
            lastPriceZug: markPrice,
            marketCapZug: mcap,
            spotPriceZug: markPrice,
          },
        });
      }

      await this.awardTradeMissions(
        mint,
        trader,
        isBuy,
        solAmount,
        tradeEventId,
        event.signature,
        blockTime
      );

      void lookupClanId(this.context.launchpadPool, trader).then((clanId) => {
        awardWeeklyXp({
          walletAddress: trader,
          volumeSolNet: inserted.volumeZug,
          clanId,
        });
      });

      console.log(
        `[indexer-sol] Trade ${side} mint=${mint} trader=${trader} sol=${lamportsToSol(solAmount)}`
      );
    }
  }

  async onReferrerSet(event: DecodedSolanaEvent): Promise<void> {
    const f = event.fields!;
    const trader = asString(f.trader);
    const referrer = asString(f.referrer);
    await this.context.launchpadPool.query(
      `
        INSERT INTO referral_bindings (invitee_address, referrer_address, bound_tx_hash, bound_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (invitee_address) DO NOTHING
      `,
      [trader, referrer, event.signature]
    );
    console.log(
      `[indexer-sol] ReferrerSet trader=${trader} referrer=${referrer}`
    );
  }

  async onCreatorFeeClaimed(event: DecodedSolanaEvent): Promise<void> {
    const f = event.fields!;
    const amountLamports = asBigInt(f.amount);
    if (amountLamports <= 0n) return;

    const creator = asString(f.creator);
    const amount = lamportsToSol(amountLamports);
    await this.context.launchpadPool.query(
      `
        INSERT INTO creator_fee_claims (
          creator_address,
          amount_bnb,
          tx_hash,
          log_index,
          block_number,
          block_time
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tx_hash, log_index) DO NOTHING
      `,
      [
        creator,
        amount,
        event.signature,
        event.logIndex,
        String(event.slot),
        new Date(),
      ]
    );
    console.log(
      `[indexer-sol] CreatorFeeClaimed creator=${creator} amount=${amount} sig=${event.signature}`
    );
  }

  async onReferrerFeeClaimed(event: DecodedSolanaEvent): Promise<void> {
    const f = event.fields!;
    const amountLamports = asBigInt(f.amount);
    if (amountLamports <= 0n) return;

    const referrer = asString(f.referrer);
    const amount = lamportsToSol(amountLamports);
    await this.context.launchpadPool.query(
      `
        INSERT INTO referrer_fee_claims (
          referrer_address,
          amount_bnb,
          tx_hash,
          log_index,
          block_number,
          block_time
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tx_hash, log_index) DO NOTHING
      `,
      [
        referrer,
        amount,
        event.signature,
        event.logIndex,
        String(event.slot),
        new Date(),
      ]
    );
    console.log(
      `[indexer-sol] ReferrerFeeClaimed referrer=${referrer} amount=${amount} sig=${event.signature}`
    );
  }

  private async updatePosition(
    client: pg.PoolClient,
    mint: string,
    trader: string,
    isBuy: boolean,
    solAmount: bigint,
    feeLamports: bigint,
    tokenAmount: bigint,
    decimals: number,
    nativeUsdRate: number | null
  ): Promise<void> {
    const grossSol = Number(lamportsToSol(solAmount));
    const fee = Number(lamportsToSol(feeLamports));
    const tokens = Number(tokenAmountToDecimal(tokenAmount, decimals));

    const existing = await client.query<{
      token_balance: string;
      total_bought_zug: string;
      total_sold_zug: string;
      remaining_cost_basis_zug: string;
      realized_pnl_zug: string;
      remaining_cost_basis_usd: string;
      realized_pnl_usd: string;
    }>(
      `
        SELECT
          token_balance::text,
          total_bought_zug::text,
          total_sold_zug::text,
          COALESCE(remaining_cost_basis_zug, 0)::text AS remaining_cost_basis_zug,
          realized_pnl_zug::text,
          COALESCE(remaining_cost_basis_usd, 0)::text AS remaining_cost_basis_usd,
          COALESCE(realized_pnl_usd, 0)::text AS realized_pnl_usd
        FROM user_positions
        WHERE token_address = $1 AND address = $2
      `,
      [mint, trader]
    );

    const row = existing.rows[0];
    const prior = {
      tokenBalance: Number(row?.token_balance ?? 0),
      totalBought: Number(row?.total_bought_zug ?? 0),
      totalSold: Number(row?.total_sold_zug ?? 0),
      remainingCostBasis: Number(row?.remaining_cost_basis_zug ?? 0),
      realizedPnl: Number(row?.realized_pnl_zug ?? 0),
      remainingCostBasisUsd: Number(row?.remaining_cost_basis_usd ?? 0),
      realizedPnlUsd: Number(row?.realized_pnl_usd ?? 0),
    };
    const oldBalance = prior.tokenBalance;

    const next = applyTradeToPositionCost(
      prior,
      isBuy,
      grossSol,
      fee,
      tokens,
      nativeUsdRate
    );

    await client.query(
      `
        INSERT INTO user_positions (
          token_address,
          address,
          token_balance,
          total_bought_zug,
          total_sold_zug,
          remaining_cost_basis_zug,
          realized_pnl_zug,
          remaining_cost_basis_usd,
          realized_pnl_usd,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
        ON CONFLICT (token_address, address) DO UPDATE
        SET token_balance = EXCLUDED.token_balance,
            total_bought_zug = EXCLUDED.total_bought_zug,
            total_sold_zug = EXCLUDED.total_sold_zug,
            remaining_cost_basis_zug = EXCLUDED.remaining_cost_basis_zug,
            realized_pnl_zug = EXCLUDED.realized_pnl_zug,
            remaining_cost_basis_usd = EXCLUDED.remaining_cost_basis_usd,
            realized_pnl_usd = EXCLUDED.realized_pnl_usd,
            updated_at = now()
      `,
      [
        mint,
        trader,
        String(next.tokenBalance),
        String(next.totalBought),
        String(next.totalSold),
        String(next.remainingCostBasis),
        String(next.realizedPnl),
        String(next.remainingCostBasisUsd),
        String(next.realizedPnlUsd),
      ]
    );

    await this.updateHolderCountIncremental(client, mint, oldBalance, next.tokenBalance);
  }

  private async upsertUserVolume(
    client: pg.PoolClient,
    trader: string,
    solAmount: bigint,
    isBuy: boolean
  ): Promise<void> {
    const volumeSol = lamportsToSol(solAmount);
    await client.query(
      `
        INSERT INTO user_volumes (
          address,
          total_volume_zug,
          buy_volume_zug,
          sell_volume_zug,
          last_trade_at,
          updated_at
        ) VALUES (
          $1,
          $2,
          CASE WHEN $3 THEN $2::numeric ELSE 0 END,
          CASE WHEN $3 THEN 0 ELSE $2::numeric END,
          now(),
          now()
        )
        ON CONFLICT (address) DO UPDATE
        SET total_volume_zug = user_volumes.total_volume_zug + EXCLUDED.total_volume_zug,
            buy_volume_zug = user_volumes.buy_volume_zug + EXCLUDED.buy_volume_zug,
            sell_volume_zug = user_volumes.sell_volume_zug + EXCLUDED.sell_volume_zug,
            last_trade_at = now(),
            updated_at = now()
      `,
      [trader, volumeSol, isBuy]
    );
  }

  private async awardTradeMissions(
    token: string,
    trader: string,
    isBuy: boolean,
    solAmount: bigint,
    tradeEventId: string,
    txHash: string,
    blockTime: Date
  ): Promise<void> {
    if (!this.context.pointsBridge) return;

    await this.context.pointsBridge.award({
      address: trader,
      taskKey: TASK_KEYS.dailySwap,
      eventId: tradeEventId,
      txHash,
      blockTime,
      daily: true,
      metadata: { token, side: isBuy ? "BUY" : "SELL" },
    });

    if (isBuy && solAmount >= FIRST_SMART_BUY_MIN_LAMPORTS) {
      const tokenResult = await this.context.launchpadPool.query<{
        creator_address: string;
      }>("SELECT creator_address FROM tokens WHERE address = $1", [token]);
      const creator = tokenResult.rows[0]?.creator_address;

      if (creator && creator !== trader) {
        await this.context.pointsBridge.award({
          address: trader,
          taskKey: TASK_KEYS.firstSmartBuy,
          eventId: tradeEventId,
          txHash,
          blockTime,
          metadata: { token, side: "BUY", threshold_sol: "0.01" },
        });
      }
    }

    const volumeResult = await this.context.launchpadPool.query<{
      total_volume_zug: string;
    }>("SELECT total_volume_zug FROM user_volumes WHERE address = $1", [trader]);
    if (Number(volumeResult.rows[0]?.total_volume_zug ?? 0) >= VOLUME_MONSTER_MIN_SOL) {
      await this.context.pointsBridge.award({
        address: trader,
        taskKey: TASK_KEYS.volumeMonster,
        eventId: `${trader}:volume-monster`,
        txHash,
        blockTime,
        metadata: { threshold_sol: String(VOLUME_MONSTER_MIN_SOL) },
      });
    }
  }

  private async updateHolderCountIncremental(
    client: pg.PoolClient,
    token: string,
    oldBalance: number,
    newBalance: number
  ): Promise<void> {
    if (oldBalance <= 0 && newBalance > 0) {
      await client.query(
        `
          UPDATE bonding_states
          SET holder_count = holder_count + 1,
              updated_at = now()
          WHERE token_address = $1
        `,
        [token]
      );
      return;
    }

    if (oldBalance > 0 && newBalance <= 0) {
      await client.query(
        `
          UPDATE bonding_states
          SET holder_count = GREATEST(holder_count - 1, 0),
              updated_at = now()
          WHERE token_address = $1
        `,
        [token]
      );
    }
  }
}
