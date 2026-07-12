import pg from "pg";
import type { Hash, PublicClient, Address } from "viem";
import { parseEventLogs } from "viem";
import { memeFactoryAbi } from "./abi.js";
import { withTransaction } from "./db.js";
import { dbAddress, eventId, ratioWeiToDecimal, weiToDecimal } from "./utils.js";
import { applyTradeToPositionCost } from "./position-cost.js";
import { PointsBridge, TASK_KEYS } from "./points.js";
import { recomputeKingAfterTrade } from "./king.js";
import {
  markParticipantClaimedIndexer,
  refreshParticipantSnapshotIndexer,
} from "./airdrop-participant-snapshot.js";
import { publishTrade, publishWalletTrade } from "./redis-publish.js";
import {
  incrementalBoardStatsEnabled,
  marketCapZugFromSpot,
  readBoardStatsForPublish,
  seedBoardStatsOnTokenCreated,
  upsertBoardStatsAfterTrade,
} from "./board-stats.js";
import { upsertCandlesAfterTrade } from "./candles.js";
import { fetchIndexerNativeUsdRate } from "./native-usd.js";
import { invalidateArenaCaches } from "./redis-cache.js";
import { dispatchTradePushNotifications } from "./push-dispatch.js";
import { FIRST_SMART_BUY_MIN_WEI, VOLUME_MONSTER_MIN_BNB } from "./mission-thresholds.js";

type ParsedLaunchpadLog = {
  eventName: string;
  args: Record<string, unknown>;
  address: string;
  blockNumber: bigint;
  transactionHash?: Hash;
  logIndex?: number;
};

type FeeSplit = {
  creatorFee: bigint;
  referrerFee: bigint;
  treasuryFee: bigint;
};

export type HandlerContext = {
  launchpadPool: pg.Pool;
  pointsBridge: PointsBridge;
  publicClient: PublicClient;
};

export class LaunchpadEventHandlers {
  private readonly blockTimeCache = new Map<string, Date>();
  private readonly pendingFeeSplits = new Map<string, FeeSplit>();

  constructor(private readonly context: HandlerContext) {}

  async handle(log: ParsedLaunchpadLog): Promise<void> {
    switch (log.eventName) {
      case "TokenCreated":
        await this.handleTokenCreated(log);
        return;
      case "TokenRegistered":
        await this.handleTokenRegistered(log);
        return;
      case "Trade":
        await this.handleTrade(log);
        return;
      case "FeeSplit":
        this.handleFeeSplit(log);
        return;
      case "CreatorFeeClaimed":
        await this.handleCreatorFeeClaimed(log);
        return;
      case "ReferrerSet":
        await this.handleReferrerSet(log);
        return;
      case "ReferrerFeeClaimed":
        await this.handleReferrerFeeClaimed(log);
        return;
      case "AirdropCreated":
        await this.handleAirdropCreated(log);
        return;
      case "AirdropFinalized":
        await this.handleAirdropFinalized(log);
        return;
      case "AirdropClaimed":
        await this.handleAirdropClaimed(log);
        return;
      case "AirdropRemainderSwept":
        await this.handleAirdropRemainderSwept(log);
        return;
      default:
        return;
    }
  }

  private async handleTokenCreated(log: ParsedLaunchpadLog): Promise<void> {
    const txHash = requiredTxHash(log);
    const blockTime = await this.getBlockTime(log.blockNumber);
    const token = dbAddress(asString(log.args.token));
    const creator = dbAddress(asString(log.args.creator));
    const virtualEthReserve = asBigInt(
      log.args.virtualEthReserve ?? log.args.virtualZugReserve ?? defaultVirtualEthWei()
    );

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
            name = EXCLUDED.name,
            symbol = EXCLUDED.symbol,
            metadata_uri = EXCLUDED.metadata_uri,
            updated_at = now()
      `,
      [
        token,
        Number(process.env.CHAIN_ID ?? 84532),
        creator,
        asString(log.args.name),
        asString(log.args.symbol),
        asString(log.args.metadataURI),
        txHash.toLowerCase(),
        log.blockNumber.toString(),
        blockTime
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
        token,
        "0",
        startingMarketCapZug(virtualEthReserve),
        startingSpotPriceZug(virtualEthReserve),
        weiToDecimal(virtualEthReserve),
        weiToDecimal(defaultVirtualTokenWei()),
      ]
    );

    await this.context.pointsBridge.award({
      address: creator,
      taskKey: TASK_KEYS.deployMeme,
      eventId: eventId(txHash, requiredLogIndex(log)),
      txHash,
      blockTime,
      metadata: { token, source: "TokenCreated" }
    });

    if (incrementalBoardStatsEnabled()) {
      await seedBoardStatsOnTokenCreated(this.context.launchpadPool, {
        tokenAddress: token,
        marketCapZug: startingMarketCapZug(virtualEthReserve),
        spotPriceZug: startingSpotPriceZug(virtualEthReserve),
      });
    }
    // KOTH only after trades — create has no real price discovery yet.
  }

  private async handleTokenRegistered(log: ParsedLaunchpadLog): Promise<void> {
    const token = dbAddress(asString(log.args.token));
    const virtualEthReserve = asBigInt(log.args.virtualEthReserve ?? log.args.virtualZugReserve);
    const virtualTokenReserve = asBigInt(log.args.virtualTokenReserve);

    await this.context.launchpadPool.query(
      `
        UPDATE bonding_states
        SET virtual_zug_reserve = $2,
            virtual_token_reserve = $3,
            updated_at = now()
        WHERE token_address = $1
      `,
      [
        token,
        weiToDecimal(virtualEthReserve),
        weiToDecimal(virtualTokenReserve),
      ]
    );
  }

  /** Trade FK requires tokens row — replay TokenCreated in same block if decode order missed it. */
  private async ensureTokenRowForTrade(token: string, log: ParsedLaunchpadLog): Promise<boolean> {
    const exists = await this.context.launchpadPool.query(`SELECT 1 FROM tokens WHERE address = $1 LIMIT 1`, [
      token,
    ]);
    if (exists.rowCount) return true;

    const reg = await this.context.launchpadPool.query<{ address: string }>(
      `SELECT address FROM contract_registry WHERE contract_key = 'meme_factory' AND is_active = true LIMIT 1`
    );
    const factory = reg.rows[0]?.address as Address | undefined;
    if (!factory) return false;

    try {
      const rawLogs = await this.context.publicClient.getLogs({
        address: factory,
        fromBlock: log.blockNumber,
        toBlock: log.blockNumber,
      });
      const decoded = parseEventLogs({ abi: memeFactoryAbi, logs: rawLogs, strict: false });
      for (const entry of decoded) {
        if (entry.eventName !== "TokenCreated") continue;
        const created = dbAddress(asString(entry.args.token));
        if (created !== token) continue;
        await this.handleTokenCreated({
          eventName: entry.eventName,
          args: entry.args as Record<string, unknown>,
          address: entry.address,
          blockNumber: entry.blockNumber,
          transactionHash: entry.transactionHash,
          logIndex: entry.logIndex,
        });
        const again = await this.context.launchpadPool.query(`SELECT 1 FROM tokens WHERE address = $1 LIMIT 1`, [
          token,
        ]);
        if (again.rowCount) return true;
      }
    } catch (error) {
      console.warn(`ensureTokenRowForTrade backfill failed for ${token}:`, error);
    }

    return false;
  }

  private async handleTrade(log: ParsedLaunchpadLog): Promise<void> {
    const txHash = requiredTxHash(log);
    const logIndex = requiredLogIndex(log);
    const blockTime = await this.getBlockTime(log.blockNumber);
    const token = dbAddress(asString(log.args.token));
    if (!(await this.ensureTokenRowForTrade(token, log))) {
      console.warn(
        `skip Trade: token ${token} missing at block ${log.blockNumber} (tx ${txHash}) — pre-start launch or backfill gap`
      );
      return;
    }
    const trader = dbAddress(asString(log.args.trader));
    const isBuy = Boolean(log.args.isBuy);
    const zugAmount = asBigInt(log.args.ethAmount ?? log.args.zugAmount);
    const tokenAmount = asBigInt(log.args.tokenAmount);
    const reserveZug = asBigInt(log.args.reserveEth ?? log.args.reserveZug);
    const soldTokens = asBigInt(log.args.soldTokens);
    const feeZug = asBigInt(log.args.feeEth ?? log.args.feeZug);
    const spotPriceWeiArg = log.args.spotPriceWei != null ? asBigInt(log.args.spotPriceWei) : null;
    const feeSplit = this.pendingFeeSplits.get(feeSplitKey(txHash, token)) ?? {
      creatorFee: 0n,
      referrerFee: 0n,
      treasuryFee: 0n
    };
    this.pendingFeeSplits.delete(feeSplitKey(txHash, token));

    const tradeEventId = eventId(txHash, logIndex);
    const side = isBuy ? "BUY" : "SELL";
    const executionPrice = ratioWeiToDecimal(zugAmount, tokenAmount);
    const spotPriceStr =
      spotPriceWeiArg != null && spotPriceWeiArg > 0n
        ? ratioWeiToDecimal(spotPriceWeiArg, 10n ** 18n)
        : spotPriceBnbFromReserves(reserveZug, soldTokens);
    const markPrice =
      Number(spotPriceStr) > 0 ? spotPriceStr : executionPrice;

    const nativeUsdRate = await fetchIndexerNativeUsdRate();

    const tradeResult = await withTransaction(this.context.launchpadPool, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `
          WITH inserted_trade AS (
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
          )
          SELECT id FROM inserted_trade
        `,
        [
          tradeEventId,
          token,
          trader,
          side,
          weiToDecimal(zugAmount),
          weiToDecimal(tokenAmount),
          executionPrice,
          markPrice,
          weiToDecimal(feeZug),
          weiToDecimal(feeSplit.creatorFee),
          weiToDecimal(feeSplit.treasuryFee),
          weiToDecimal(feeSplit.referrerFee),
          txHash.toLowerCase(),
          logIndex,
          log.blockNumber.toString(),
          blockTime,
          nativeUsdRate != null && nativeUsdRate > 0 ? nativeUsdRate : null,
        ]
      );

      if (!inserted.rowCount || !inserted.rows[0]) return null;

      const prevBalance = await client.query<{ token_balance: string }>(
        `
          SELECT token_balance::text
          FROM user_positions
          WHERE token_address = $1 AND address = $2
        `,
        [token, trader]
      );
      const oldBalance = Number(prevBalance.rows[0]?.token_balance ?? 0);

      await client.query(
        `
          UPDATE bonding_states
          SET reserve_zug = $2,
              token_sold = $3,
              progress_bps = LEAST(
                10000,
                floor(($2::numeric / NULLIF(target_zug, 0)) * 10000)::integer
              ),
              last_price_zug = $4,
              market_cap_zug = $4::numeric * 1000000000,
              trade_count = trade_count + 1,
              updated_at = now()
          WHERE token_address = $1
        `,
        [token, weiToDecimal(reserveZug), weiToDecimal(soldTokens), markPrice]
      );

      await this.updateUserAggregates(
        client,
        token,
        trader,
        isBuy,
        zugAmount,
        feeZug,
        tokenAmount,
        nativeUsdRate
      );
      await this.updateHolderCountIncremental(client, token, trader, oldBalance);

      if (isBuy) {
        await client.query(
          `
            INSERT INTO airdrop_participants (airdrop_id, address, first_onchain_at, updated_at)
            SELECT a.id, $2, $3, now()
            FROM airdrops a
            WHERE a.linked_token = $1
              AND a.qualify_start <= $3::timestamptz
              AND a.qualify_end >= $3::timestamptz
            ON CONFLICT (airdrop_id, address) DO UPDATE
            SET first_onchain_at = COALESCE(airdrop_participants.first_onchain_at, EXCLUDED.first_onchain_at),
                updated_at = now()
          `,
          [token, trader, blockTime]
        );
      }

      const bonding = await client.query<{
        reserve_zug: string;
        token_sold: string;
        market_cap_zug: string;
        last_price_zug: string;
        progress_bps: number;
        trade_count: number;
        holder_count: number;
      }>(
        `
          SELECT reserve_zug::text, token_sold::text, market_cap_zug::text, last_price_zug::text,
                 progress_bps, trade_count, holder_count
          FROM bonding_states
          WHERE token_address = $1
        `,
        [token]
      );

      const b = bonding.rows[0];
      if (!b) return null;

      const tradeNetZug = weiToDecimal(zugAmount - feeZug);
      await upsertBoardStatsAfterTrade(client, {
        tokenAddress: token,
        reserveZug: b.reserve_zug,
        tokenSold: b.token_sold,
        spotPriceZug: markPrice,
        marketCapZug: marketCapZugFromSpot(markPrice),
        progressBps: b.progress_bps,
        tradeCount: b.trade_count,
        holderCount: b.holder_count,
        tradeNetZug,
        blockTime,
        traderAddress: trader,
      });

      const candleUpdates = await upsertCandlesAfterTrade(client, {
        tokenAddress: token,
        blockTime,
        isBuy,
        reserveAfter: reserveZug,
        soldAfter: soldTokens,
        zugAmount,
        feeZug,
        tokenAmount,
      });

      return {
        tradeId: inserted.rows[0].id,
        bonding: b,
        candleUpdates,
        nativeUsdRate,
      };
    });

    if (!tradeResult) return;

    if (isBuy) {
      const activeAirdrops = await this.context.launchpadPool.query<{ id: string }>(
        `
          SELECT id::text
          FROM airdrops
          WHERE linked_token = $1
            AND qualify_start <= $2::timestamptz
            AND qualify_end >= $2::timestamptz
        `,
        [token, blockTime]
      );
      for (const row of activeAirdrops.rows) {
        await refreshParticipantSnapshotIndexer(
          this.context.launchpadPool,
          row.id,
          trader
        ).catch(() => undefined);
      }
    }

    await this.awardTradeMissions(token, trader, isBuy, zugAmount, tradeEventId, txHash, blockTime);
    await recomputeKingAfterTrade(this.context, blockTime, txHash, token);

    const boardStats = await readBoardStatsForPublish(this.context.launchpadPool, token);

    await publishTrade({
      type: "trade",
      tokenAddress: token,
      candleUpdates: tradeResult.candleUpdates,
      trade: {
        id: tradeResult.tradeId,
        side,
        traderAddress: trader,
        zugAmount: weiToDecimal(zugAmount),
        feeZug: weiToDecimal(feeZug),
        tokenAmount: weiToDecimal(tokenAmount),
        priceZug: markPrice,
        txHash: txHash.toLowerCase(),
        logIndex,
        blockTime: blockTime.toISOString(),
        nativeUsdRate:
          tradeResult.nativeUsdRate != null && tradeResult.nativeUsdRate > 0
            ? String(tradeResult.nativeUsdRate)
            : undefined,
      },
      bonding: {
        reserveZug: tradeResult.bonding.reserve_zug,
        tokenSold: tradeResult.bonding.token_sold,
        marketCapZug: tradeResult.bonding.market_cap_zug,
        lastPriceZug: tradeResult.bonding.last_price_zug,
        progressBps: tradeResult.bonding.progress_bps,
        tradeCount: tradeResult.bonding.trade_count,
        holderCount: tradeResult.bonding.holder_count,
        volume24hZug: boardStats?.volume24hZug,
        traders24h: boardStats?.traders24h,
      },
    });

    await invalidateArenaCaches(token);

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
      [token, trader]
    );
    const position = positionRow.rows[0];
    if (position) {
      await publishWalletTrade({
        type: "wallet_trade",
        walletAddress: trader,
        tokenAddress: token,
        trade: {
          id: tradeResult.tradeId,
          side,
          traderAddress: trader,
          zugAmount: weiToDecimal(zugAmount),
          tokenAmount: weiToDecimal(tokenAmount),
          priceZug: markPrice,
          txHash: txHash.toLowerCase(),
          logIndex,
          blockTime: blockTime.toISOString(),
          nativeUsdRate:
            tradeResult.nativeUsdRate != null && tradeResult.nativeUsdRate > 0
              ? String(tradeResult.nativeUsdRate)
              : undefined,
        },
        position: {
          tokenBalance: position.token_balance,
          remainingCostBasisZug: position.remaining_cost_basis_zug,
          realizedPnlZug: position.realized_pnl_zug,
          remainingCostBasisUsd: position.remaining_cost_basis_usd,
          realizedPnlUsd: position.realized_pnl_usd,
        },
        bonding: {
          reserveZug: tradeResult.bonding.reserve_zug,
          tokenSold: tradeResult.bonding.token_sold,
          lastPriceZug: tradeResult.bonding.last_price_zug,
          marketCapZug: tradeResult.bonding.market_cap_zug,
        },
      });
    }

    void dispatchTradePushNotifications(this.context.launchpadPool, {
      tradeId: tradeResult.tradeId,
      tokenAddress: token,
      traderAddress: trader,
      side: side as "BUY" | "SELL",
      zugAmount: weiToDecimal(zugAmount),
      tokenAmount: weiToDecimal(tokenAmount),
      txHash: txHash.toLowerCase(),
    }).catch((error) => {
      console.warn(
        "trade push dispatch failed:",
        error instanceof Error ? error.message : error
      );
    });
  }

  private handleFeeSplit(log: ParsedLaunchpadLog): void {
    const txHash = requiredTxHash(log);
    const token = dbAddress(asString(log.args.token));

    this.pendingFeeSplits.set(feeSplitKey(txHash, token), {
      creatorFee: asBigInt(log.args.creatorFee),
      referrerFee: log.args.referrerFee != null ? asBigInt(log.args.referrerFee) : 0n,
      treasuryFee: asBigInt(log.args.treasuryFee)
    });
  }

  private async handleAirdropCreated(log: ParsedLaunchpadLog): Promise<void> {
    const txHash = requiredTxHash(log);
    const blockTime = await this.getBlockTime(log.blockNumber);
    const onChainId = asBigInt(log.args.airdropId).toString();
    const creator = dbAddress(asString(log.args.creator));
    const linkedToken = dbAddress(asString(log.args.linkedToken));
    const rewardTokenRaw = asString(log.args.rewardToken);
    const rewardToken =
      rewardTokenRaw === "0x0000000000000000000000000000000000000000" ? null : dbAddress(rewardTokenRaw);
    const totalFunded = weiToDecimal(asBigInt(log.args.totalFunded));
    const rulesHash = bytes32ToHex(log.args.rulesHash);
    const qualifyStart = unixToDate(asBigInt(log.args.qualifyStart));
    const qualifyEnd = unixToDate(asBigInt(log.args.qualifyEnd));
    const claimStart = unixToDate(asBigInt(log.args.claimStart));
    const claimEnd = unixToDate(asBigInt(log.args.claimEnd));

    await this.context.launchpadPool.query(
      `
        INSERT INTO airdrops (
          on_chain_id,
          creator_address,
          linked_token,
          reward_token,
          total_funded,
          rules_json,
          rules_hash,
          qualify_start,
          qualify_end,
          claim_start,
          claim_end,
          status,
          create_tx_hash,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, 'ACTIVE', $12, $13, now())
        ON CONFLICT (on_chain_id) DO UPDATE
        SET creator_address = EXCLUDED.creator_address,
            linked_token = EXCLUDED.linked_token,
            reward_token = EXCLUDED.reward_token,
            total_funded = EXCLUDED.total_funded,
            qualify_start = EXCLUDED.qualify_start,
            qualify_end = EXCLUDED.qualify_end,
            claim_start = EXCLUDED.claim_start,
            claim_end = EXCLUDED.claim_end,
            create_tx_hash = EXCLUDED.create_tx_hash,
            rules_json = CASE
              WHEN airdrops.rules_json = '{}'::jsonb THEN EXCLUDED.rules_json
              ELSE airdrops.rules_json
            END,
            updated_at = now()
      `,
      [
        onChainId,
        creator,
        linkedToken,
        rewardToken,
        totalFunded,
        JSON.stringify({}),
        rulesHash,
        qualifyStart,
        qualifyEnd,
        claimStart,
        claimEnd,
        txHash.toLowerCase(),
        blockTime
      ]
    );
  }

  private async handleAirdropFinalized(log: ParsedLaunchpadLog): Promise<void> {
    const onChainId = asBigInt(log.args.airdropId).toString();
    const merkleRoot = bytes32ToHex(log.args.merkleRoot);
    const totalAllocated = weiToDecimal(asBigInt(log.args.totalAllocated));

    await this.context.launchpadPool.query(
      `
        UPDATE airdrops
        SET merkle_root = $2,
            total_allocated = $3,
            status = 'FINALIZED',
            updated_at = now()
        WHERE on_chain_id = $1::bigint
      `,
      [onChainId, merkleRoot, totalAllocated]
    );
  }

  private async handleAirdropClaimed(log: ParsedLaunchpadLog): Promise<void> {
    const txHash = requiredTxHash(log);
    const blockTime = await this.getBlockTime(log.blockNumber);
    const onChainId = asBigInt(log.args.airdropId).toString();
    const claimant = dbAddress(asString(log.args.claimant));
    const amount = weiToDecimal(asBigInt(log.args.amount));

    const airdrop = await this.context.launchpadPool.query<{ id: string }>(
      "SELECT id FROM airdrops WHERE on_chain_id = $1::bigint",
      [onChainId]
    );
    const airdropId = airdrop.rows[0]?.id;
    if (!airdropId) return;

    await this.context.launchpadPool.query(
      `
        INSERT INTO airdrop_claims (airdrop_id, claimant, amount, tx_hash, block_time)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (airdrop_id, claimant) DO NOTHING
      `,
      [airdropId, claimant, amount, txHash.toLowerCase(), blockTime]
    );

    await markParticipantClaimedIndexer(
      this.context.launchpadPool,
      airdropId,
      claimant,
      blockTime
    ).catch(() => undefined);
  }

  private async handleAirdropRemainderSwept(log: ParsedLaunchpadLog): Promise<void> {
    const onChainId = asBigInt(log.args.airdropId).toString();

    await this.context.launchpadPool.query(
      `
        UPDATE airdrops
        SET status = 'CLOSED',
            updated_at = now()
        WHERE on_chain_id = $1::bigint
      `,
      [onChainId]
    );
  }

  private async handleCreatorFeeClaimed(log: ParsedLaunchpadLog): Promise<void> {
    const amountWei = asBigInt(log.args.amount);
    if (amountWei <= 0n) {
      // Contract emits CreatorFeeClaimed even when pending balance was 0.
      return;
    }

    const txHash = requiredTxHash(log);
    const logIndex = requiredLogIndex(log);
    const blockTime = await this.getBlockTime(log.blockNumber);
    const creator = dbAddress(asString(log.args.creator));
    const amount = weiToDecimal(amountWei);

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
        txHash.toLowerCase(),
        logIndex,
        log.blockNumber.toString(),
        blockTime
      ]
    );
  }

  private async handleReferrerSet(log: ParsedLaunchpadLog): Promise<void> {
    const txHash = requiredTxHash(log);
    const invitee = dbAddress(asString(log.args.trader));
    const referrer = dbAddress(asString(log.args.referrer));

    await this.context.launchpadPool.query(
      `
        INSERT INTO referral_bindings (
          invitee_address,
          referrer_address,
          bound_tx_hash,
          bound_at
        ) VALUES ($1, $2, $3, now())
        ON CONFLICT (invitee_address) DO NOTHING
      `,
      [invitee, referrer, txHash.toLowerCase()]
    );
  }

  private async handleReferrerFeeClaimed(log: ParsedLaunchpadLog): Promise<void> {
    const amountWei = asBigInt(log.args.amount);
    if (amountWei <= 0n) return;

    const txHash = requiredTxHash(log);
    const logIndex = requiredLogIndex(log);
    const blockTime = await this.getBlockTime(log.blockNumber);
    const referrer = dbAddress(asString(log.args.referrer));
    const amount = weiToDecimal(amountWei);

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
        txHash.toLowerCase(),
        logIndex,
        log.blockNumber.toString(),
        blockTime
      ]
    );
  }

  private async updateUserAggregates(
    client: pg.Pool | pg.PoolClient,
    token: string,
    trader: string,
    isBuy: boolean,
    zugAmount: bigint,
    feeZug: bigint,
    tokenAmount: bigint,
    nativeUsdRate: number | null
  ): Promise<void> {
    const grossZug = Number(weiToDecimal(zugAmount));
    const fee = Number(weiToDecimal(feeZug));
    const tokens = Number(weiToDecimal(tokenAmount));

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
      [token, trader]
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

    const next = applyTradeToPositionCost(
      prior,
      isBuy,
      grossZug,
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
        token,
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
      [trader, weiToDecimal(zugAmount), isBuy]
    );
  }

  private async updateHolderCountIncremental(
    client: pg.PoolClient,
    token: string,
    trader: string,
    oldBalance: number
  ): Promise<void> {
    const nextBalance = await client.query<{ token_balance: string }>(
      `
        SELECT token_balance::text
        FROM user_positions
        WHERE token_address = $1 AND address = $2
      `,
      [token, trader]
    );
    const newBalance = Number(nextBalance.rows[0]?.token_balance ?? 0);

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

  /** @deprecated full scan — use updateHolderCountIncremental in trade path */
  private async updateHolderCount(token: string): Promise<void> {
    await this.context.launchpadPool.query(
      `
        UPDATE bonding_states
        SET holder_count = (
              SELECT count(*)::integer
              FROM user_positions
              WHERE token_address = $1
                AND token_balance > 0
            ),
            updated_at = now()
        WHERE token_address = $1
      `,
      [token]
    );
  }

  private async awardTradeMissions(
    token: string,
    trader: string,
    isBuy: boolean,
    zugAmount: bigint,
    tradeEventId: string,
    txHash: Hash,
    blockTime: Date
  ): Promise<void> {
    await this.context.pointsBridge.award({
      address: trader,
      taskKey: TASK_KEYS.dailySwap,
      eventId: tradeEventId,
      txHash,
      blockTime,
      daily: true,
      metadata: { token, side: isBuy ? "BUY" : "SELL" }
    });

    if (isBuy && zugAmount >= FIRST_SMART_BUY_MIN_WEI) {
      const tokenResult = await this.context.launchpadPool.query<{ creator_address: string }>(
        "SELECT creator_address FROM tokens WHERE address = $1",
        [token]
      );
      const creator = tokenResult.rows[0]?.creator_address;

      if (creator && creator !== trader) {
        await this.context.pointsBridge.award({
          address: trader,
          taskKey: TASK_KEYS.firstSmartBuy,
          eventId: tradeEventId,
          txHash,
          blockTime,
          metadata: { token, side: "BUY", threshold_bnb: "0.01" }
        });
      }
    }

    const volumeResult = await this.context.launchpadPool.query<{ total_volume_zug: string }>(
      "SELECT total_volume_zug FROM user_volumes WHERE address = $1",
      [trader]
    );
    if (Number(volumeResult.rows[0]?.total_volume_zug ?? 0) >= VOLUME_MONSTER_MIN_BNB) {
      await this.context.pointsBridge.award({
        address: trader,
        taskKey: TASK_KEYS.volumeMonster,
        eventId: `${trader}:volume-monster`,
        txHash,
        blockTime,
        metadata: { threshold_bnb: String(VOLUME_MONSTER_MIN_BNB) }
      });
    }
  }

  private async getBlockTime(blockNumber: bigint): Promise<Date> {
    const key = blockNumber.toString();
    const cached = this.blockTimeCache.get(key);
    if (cached) return cached;

    const block = await this.context.publicClient.getBlock({ blockNumber });
    const date = new Date(Number(block.timestamp) * 1000);
    this.blockTimeCache.set(key, date);

    return date;
  }
}

function feeSplitKey(txHash: Hash, token: string): string {
  return `${txHash.toLowerCase()}:${token}`;
}

function requiredTxHash(log: ParsedLaunchpadLog): Hash {
  if (!log.transactionHash) {
    throw new Error(`Missing transaction hash for ${log.eventName}`);
  }

  return log.transactionHash;
}

function requiredLogIndex(log: ParsedLaunchpadLog): number {
  if (log.logIndex === undefined) {
    throw new Error(`Missing log index for ${log.eventName}`);
  }

  return log.logIndex;
}

function asString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Expected string event argument");
  }

  return value;
}

function asBigInt(value: unknown): bigint {
  if (typeof value !== "bigint") {
    throw new Error("Expected bigint event argument");
  }

  return value;
}

function bytes32ToHex(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "bigint") {
    throw new Error("Expected bytes32 event argument");
  }
  const hex = typeof value === "bigint" ? `0x${value.toString(16).padStart(64, "0")}` : value;
  return hex.toLowerCase();
}

function unixToDate(seconds: bigint): Date {
  return new Date(Number(seconds) * 1000);
}

/** Marginal spot BNB/token after trade (matches chart + holders P/L). */
function spotPriceBnbFromReserves(reserveZug: bigint, soldTokens: bigint): string {
  const virtualZug = defaultVirtualZugWei();
  const virtualToken = defaultVirtualTokenWei();
  const poolZug = virtualZug + reserveZug;
  const poolTokens = virtualToken - soldTokens;
  if (poolTokens <= 0n || poolZug <= 0n) return "0";
  return ratioWeiToDecimal(poolZug, poolTokens);
}

function defaultVirtualEthWei(): bigint {
  return BigInt(process.env.BONDING_VIRTUAL_ETH_RESERVE_WEI ?? process.env.BONDING_VIRTUAL_ZUG_RESERVE_WEI ?? `${5n * 10n ** 18n}`);
}

function defaultVirtualZugWei(): bigint {
  return defaultVirtualEthWei();
}

function defaultVirtualTokenWei(): bigint {
  return 1_000_000_000n * 10n ** 18n;
}

/** Factory defaults: virtualEth / 1B token virtual → spot price per token. */
function startingSpotPriceZug(virtualEthWei: bigint = defaultVirtualEthWei()): string {
  const virtualToken = defaultVirtualTokenWei();
  return ratioWeiToDecimal(virtualEthWei, virtualToken);
}

function startingMarketCapZug(virtualEthWei: bigint = defaultVirtualEthWei()): string {
  const price = Number(startingSpotPriceZug(virtualEthWei));
  return (price * 1_000_000_000).toString();
}
