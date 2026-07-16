import type { Hash } from "viem";
import { getActiveToasts, toast } from "@/lib/toast";
import { playTradeSound } from "@/lib/trade-sounds";

/** Single toast for all trade activity — never one toast per order. */
const TRADE_ACTIVITY_ID = "trade-activity";
const LEGACY_ORDER_PREFIX = "trade-order-";
const SUCCESS_MS = 2_500;

type OrderPhase = "submitting" | "confirming" | "confirmed" | "failed";

type OrderRecord = {
  pendingId: string;
  side: "buy" | "sell";
  symbol: string;
  phase: OrderPhase;
  txHash?: string;
  failMessage?: string;
};

const orders = new Map<string, OrderRecord>();
const txHashToPendingId = new Map<string, string>();
const userOpToPendingId = new Map<string, string>();

let clearOrdersTimer: ReturnType<typeof setTimeout> | null = null;

function actionLabel(side: "buy" | "sell", symbol: string): string {
  return side === "buy" ? `Buy ${symbol}` : `Sell ${symbol}`;
}

function purgeLegacyTradeToasts(): void {
  for (const item of getActiveToasts()) {
    if (
      item.id.startsWith(LEGACY_ORDER_PREFIX) ||
      item.id === "trade-orders-aggregate" ||
      item.id === "trade-batch-success"
    ) {
      toast.dismiss(item.id);
    }
  }
}

function scheduleClearOrders(pendingIds: string[], delayMs: number): void {
  if (clearOrdersTimer != null) clearTimeout(clearOrdersTimer);
  clearOrdersTimer = setTimeout(() => {
    for (const id of pendingIds) orders.delete(id);
    clearOrdersTimer = null;
    if (orders.size === 0) toast.dismiss(TRADE_ACTIVITY_ID);
  }, delayMs);
}

function buildSuccessTitle(confirmed: OrderRecord[]): string {
  if (confirmed.length === 1) {
    const order = confirmed[0]!;
    return `${actionLabel(order.side, order.symbol)} confirmed`;
  }
  const buys = confirmed.filter((o) => o.side === "buy").length;
  const sells = confirmed.filter((o) => o.side === "sell").length;
  const parts: string[] = [];
  if (buys > 0) parts.push(`${buys} buy${buys > 1 ? "s" : ""}`);
  if (sells > 0) parts.push(`${sells} sell${sells > 1 ? "s" : ""}`);
  return `${parts.join(" · ")} confirmed`;
}

function renderTradeActivityToast(options?: {
  playSuccessSound?: boolean;
  lastSide?: "buy" | "sell";
}): void {
  purgeLegacyTradeToasts();

  const all = [...orders.values()];
  const inFlight = all.filter((o) => o.phase === "submitting" || o.phase === "confirming");
  const confirmed = all.filter((o) => o.phase === "confirmed");
  const failed = all.filter((o) => o.phase === "failed");

  // Web2 feel: stay silent while orders settle — only terminal success/error toasts.
  if (inFlight.length > 0) {
    toast.dismiss(TRADE_ACTIVITY_ID);
    return;
  }

  if (confirmed.length > 0 && failed.length === 0) {
    toast.success(buildSuccessTitle(confirmed), undefined, {
      id: TRADE_ACTIVITY_ID,
      durationMs: SUCCESS_MS,
    });
    if (options?.playSuccessSound && options.lastSide) {
      playTradeSound(options.lastSide === "buy" ? "buy_confirmed" : "sell_confirmed");
    }
    scheduleClearOrders(
      all.map((o) => o.pendingId),
      SUCCESS_MS + 150
    );
    return;
  }

  if (failed.length > 0 && confirmed.length === 0) {
    const lastFail = failed[failed.length - 1]!;
    toast.error(
      failed.length === 1
        ? `${actionLabel(lastFail.side, lastFail.symbol)} failed`
        : `${failed.length} orders failed`,
      lastFail.failMessage,
      { id: TRADE_ACTIVITY_ID, durationMs: 6_000 }
    );
    playTradeSound("trade_failed");
    scheduleClearOrders(
      all.map((o) => o.pendingId),
      6_150
    );
    return;
  }

  if (confirmed.length > 0 && failed.length > 0) {
    toast.error(
      `${failed.length} failed · ${confirmed.length} confirmed`,
      failed[failed.length - 1]?.failMessage,
      { id: TRADE_ACTIVITY_ID, durationMs: 6_000 }
    );
    scheduleClearOrders(
      all.map((o) => o.pendingId),
      6_150
    );
    return;
  }

  toast.dismiss(TRADE_ACTIVITY_ID);
}

function upsertOrder(
  pendingId: string,
  side: "buy" | "sell",
  symbol: string,
  phase: OrderPhase,
  patch?: Partial<Pick<OrderRecord, "txHash" | "failMessage">>
): void {
  const existing = orders.get(pendingId);
  orders.set(pendingId, {
    pendingId,
    side,
    symbol,
    phase,
    txHash: patch?.txHash ?? existing?.txHash,
    failMessage: patch?.failMessage ?? existing?.failMessage,
  });
}

export function isTradeOrderSettled(pendingId: string): boolean {
  const phase = orders.get(pendingId)?.phase;
  return phase === "confirmed" || phase === "failed";
}

export function resolvePendingIdFromTxHash(txHash: string): string | undefined {
  return txHashToPendingId.get(txHash.toLowerCase());
}

export function resolvePendingIdFromUserOp(userOpHash: string): string | undefined {
  return userOpToPendingId.get(userOpHash.toLowerCase());
}

export function registerTradeOrderUserOp(pendingId: string, userOpHash: Hash): void {
  userOpToPendingId.set(userOpHash.toLowerCase(), pendingId);
}

export function registerTradeOrderTxHash(pendingId: string, txHash: Hash): void {
  txHashToPendingId.set(txHash.toLowerCase(), pendingId);
  const record = orders.get(pendingId);
  if (record) record.txHash = txHash;
}

export function trackTradeOrderPending(
  pendingId: string,
  side: "buy" | "sell",
  symbol: string
): void {
  upsertOrder(pendingId, side, symbol, "submitting");
  renderTradeActivityToast();
}

export function trackTradeOrderSubmitted(
  pendingId: string,
  side: "buy" | "sell",
  symbol: string,
  userOpHash?: Hash
): void {
  if (isTradeOrderSettled(pendingId)) return;
  if (userOpHash) registerTradeOrderUserOp(pendingId, userOpHash);
  upsertOrder(pendingId, side, symbol, "confirming");
  renderTradeActivityToast();
}

export function trackTradeOrderIncluded(pendingId: string, txHash: string): void {
  if (isTradeOrderSettled(pendingId)) return;
  registerTradeOrderTxHash(pendingId, txHash as Hash);
  const record = orders.get(pendingId);
  if (!record) return;
  record.phase = "confirming";
  record.txHash = txHash;
  renderTradeActivityToast();
}

export function trackTradeOrderConfirmed(
  pendingId: string,
  side: "buy" | "sell",
  symbol: string
): void {
  if (orders.get(pendingId)?.phase === "confirmed") return;
  upsertOrder(pendingId, side, symbol, "confirmed");
  const stillInFlight = [...orders.values()].some(
    (o) => o.phase === "submitting" || o.phase === "confirming"
  );
  renderTradeActivityToast({
    playSuccessSound: !stillInFlight,
    lastSide: side,
  });
}

export function trackTradeOrderFailed(pendingId: string, message: string): void {
  if (orders.get(pendingId)?.phase === "failed") return;
  const existing = orders.get(pendingId);
  upsertOrder(
    pendingId,
    existing?.side ?? "buy",
    existing?.symbol ?? "",
    "failed",
    { failMessage: message }
  );
  const stillInFlight = [...orders.values()].some(
    (o) => o.phase === "submitting" || o.phase === "confirming"
  );
  if (!stillInFlight) {
    playTradeSound("trade_failed");
  }
  renderTradeActivityToast();
}

export function forceDismissTradeOrderToast(pendingId: string): void {
  orders.delete(pendingId);
  renderTradeActivityToast();
}

export function untrackTradeOrder(pendingId: string): void {
  if (!orders.delete(pendingId)) return;
  renderTradeActivityToast();
}

export function isTradeOrderActive(pendingId: string): boolean {
  const phase = orders.get(pendingId)?.phase;
  return phase === "submitting" || phase === "confirming";
}

export function getActiveTradeOrderIds(): string[] {
  return [...orders.values()]
    .filter((o) => o.phase === "submitting" || o.phase === "confirming")
    .map((o) => o.pendingId);
}
