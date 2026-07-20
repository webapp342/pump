import type pg from "pg";
import { PUMP_FEEL_DEFAULTS } from "@pump/solana-sdk";
import type { DecodedSolanaEvent } from "./decode.js";
import { withTransaction } from "./db-tx.js";
import {
  seedBoardStatsOnTokenCreated,
  upsertBoardStatsAfterTrade,
  readBoardStatsForPublish,
} from "./board-stats.js";
import { upsertCandlesAfterTrade } from "./candles.js";
import { enqueueTradeClickHouse } from "./clickhouse.js";
import { fetchIndexerNativeUsdRate } from "./native-usd.js";
import { applyTradeToPositionCost } from "./position-cost.js";
import { publishTrade, publishWalletTrade } from "./redis-publish.js";
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
};

export type HandlerContext = {
  launchpadPool: pg.Pool;
  chainId: number;
  tokenDecimals: number;
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
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, now())
        ON CONFLICT (token_address) DO UPDATE
        SET virtual_zug_reserve = EXCLUDED.virtual_zug_reserve,
            last_price_zug = COALESCE(NULLIF(bonding_states.last_price_zug, 0), EXCLUDED.last_price_zug),
            updated_at = now()
      `,
      [
        mint,
        "0",
        mcap,
        spot,
        lamportsToSol(virtualSol),
        tokenAmountToDecimal(virtualToken, decimals),
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

        await client.query(
          `
            UPDATE bonding_states
            SET reserve_zug = $2,
                token_sold = $3,
                last_price_zug = $4,
                market_cap_zug = $5,
                trade_count = trade_count + 1,
                updated_at = now()
            WHERE token_address = $1
          `,
          [
            mint,
            lamportsToSol(reserveSol),
            tokenAmountToDecimal(soldTokens, decimals),
            markPrice,
            mcap,
          ]
        );

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

        const bonding = await client.query<{
          reserve_zug: string;
          token_sold: string;
          trade_count: number;
          holder_count: number;
          progress_bps: number;
        }>(
          `
            SELECT
              COALESCE(reserve_zug, 0)::text AS reserve_zug,
              COALESCE(token_sold, 0)::text AS token_sold,
              COALESCE(trade_count, 0) AS trade_count,
              COALESCE(holder_count, 0) AS holder_count,
              COALESCE(progress_bps, 0) AS progress_bps
            FROM bonding_states
            WHERE token_address = $1
          `,
          [mint]
        );
        const b = bonding.rows[0] ?? {
          reserve_zug: lamportsToSol(reserveSol),
          token_sold: tokenAmountToDecimal(soldTokens, decimals),
          trade_count: 1,
          holder_count: 0,
          progress_bps: 0,
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

        const candleUpdates = await upsertCandlesAfterTrade(client, {
          tokenAddress: mint,
          blockTime,
          isBuy,
          spotBefore,
          spotAfter: spotNum,
          volumeZug: Math.max(0, grossSol - feeSol),
          buyVolumeZug: isBuy ? Math.max(0, grossSol - feeSol) : 0,
          nativeUsdRate: nativeUsdRateValue,
        });

        return { tradeId, bonding: b, candleUpdates, nativeUsdRate: nativeUsdRateValue };
      }
    );

    if (inserted) {
      enqueueTradeClickHouse({
        event_id: tradeEventId,
        token_address: mint,
        trader_address: trader,
        side,
        sol_amount: Number(lamportsToSol(solAmount)),
        token_amount: Number(tokenAmountToDecimal(tokenAmount, decimals)),
        price_sol: Number(executionPrice),
        spot_price_sol: Number(markPrice),
        fee_sol: Number(lamportsToSol(feeLamports)),
        tx_hash: event.signature,
        log_index: event.logIndex,
        slot: Number(event.slot),
        block_time: blockTime,
        native_usd_rate: inserted.nativeUsdRate,
      });

      const boardExtra = await readBoardStatsForPublish(
        this.context.launchpadPool,
        mint
      );
      await publishTrade({
        type: "trade",
        tokenAddress: mint,
        candleUpdates: inserted.candleUpdates,
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
          tradeCount: inserted.bonding.trade_count,
          holderCount: inserted.bonding.holder_count,
          volume24hZug: boardExtra?.volume24hZug,
          traders24h: boardExtra?.traders24h,
        },
      });

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
