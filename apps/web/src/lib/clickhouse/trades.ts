import type { TradeItem } from "@/lib/db/launchpad";
import { clickhouseCandlesEnabled, clickhouseQueryJson } from "@/lib/clickhouse/client";
import { dbStorageAddress } from "@/lib/address";

type ChTradeRow = {
  id: string;
  side: string;
  trader_address: string;
  sol_amount: number;
  fee_sol: number;
  token_amount: number;
  price_sol: number;
  spot_price_sol: number;
  native_usd_rate: number | null;
  tx_hash: string;
  block_time: string;
};

function mapChTradeRow(row: ChTradeRow): TradeItem {
  const gross = Number(row.sol_amount);
  const fee = Number(row.fee_sol);
  const net = Math.max(0, gross - fee);
  return {
    id: row.id,
    side: row.side,
    traderAddress: row.trader_address,
    nativeAmount: String(gross),
    feeBnb: String(fee),
    netBnb: String(net),
    tokenAmount: String(row.token_amount),
    priceBnb: String(row.price_sol),
    spotPriceBnb:
      row.spot_price_sol != null && Number(row.spot_price_sol) > 0
        ? String(row.spot_price_sol)
        : undefined,
    nativeUsdRate:
      row.native_usd_rate != null && Number(row.native_usd_rate) > 0
        ? String(row.native_usd_rate)
        : undefined,
    txHash: row.tx_hash,
    blockTime: new Date(row.block_time).toISOString(),
  };
}

/** Deep tape pages — ClickHouse trades_raw (newest first). */
export async function listTradesFromClickHouse(
  address: string,
  limit: number,
  offset: number
): Promise<TradeItem[] | null> {
  if (!clickhouseCandlesEnabled()) return null;

  const addr = dbStorageAddress(address).replace(/'/g, "\\'");
  const capped = Math.min(Math.max(limit, 1), 50);
  const off = Math.max(offset, 0);

  try {
    const rows = await clickhouseQueryJson<ChTradeRow>(
      `
      SELECT
        event_id AS id,
        side,
        trader_address,
        sol_amount,
        fee_sol,
        token_amount,
        price_sol,
        spot_price_sol,
        native_usd_rate,
        tx_hash,
        block_time
      FROM trades_raw
      WHERE token_address = '${addr}'
      ORDER BY block_time DESC, slot DESC, log_index DESC
      LIMIT ${capped} OFFSET ${off}
      `
    );
    return rows.map(mapChTradeRow);
  } catch (error) {
    console.warn("[clickhouse] trades_raw query failed", error);
    return null;
  }
}
