const PREFIX = "[pump:trade-timing]";

export type TradeTraceSide = "buy" | "sell" | "approve";

type TraceStep = {
  label: string;
  sincePrevMs: number;
  totalMs: number;
  detail?: Record<string, unknown>;
};

type ActiveTrace = {
  id: string;
  side: TradeTraceSide;
  startedAt: number;
  lastAt: number;
  steps: TraceStep[];
};

let activeTrace: ActiveTrace | null = null;

export function isTradeTimingEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_TRADE_TIMING === "0") return false;
  if (process.env.NEXT_PUBLIC_TRADE_TIMING === "1") return true;
  return process.env.NODE_ENV === "development";
}

function roundMs(ms: number): number {
  return Math.round(ms);
}

export function startTradeTrace(
  side: TradeTraceSide,
  detail?: Record<string, unknown>
): string | null {
  if (!isTradeTimingEnabled()) return null;

  const id = `${side}-${Date.now().toString(36)}`;
  const now = performance.now();
  activeTrace = {
    id,
    side,
    startedAt: now,
    lastAt: now,
    steps: [],
  };

  pushStep("ui.button_click", detail);
  console.info(`${PREFIX} ▶ trace=${id} side=${side}`, detail ?? {});
  return id;
}

function pushStep(label: string, detail?: Record<string, unknown>): void {
  if (!activeTrace) return;

  const now = performance.now();
  const sincePrevMs = roundMs(now - activeTrace.lastAt);
  const totalMs = roundMs(now - activeTrace.startedAt);
  activeTrace.lastAt = now;
  activeTrace.steps.push({ label, sincePrevMs, totalMs, detail });

  console.info(
    `${PREFIX} +${sincePrevMs}ms (Σ ${totalMs}ms) ${label}`,
    detail ?? ""
  );
}

export function tradeTraceStep(label: string, detail?: Record<string, unknown>): void {
  if (!isTradeTimingEnabled() || !activeTrace) return;
  pushStep(label, detail);
}

export function endTradeTrace(label: string, detail?: Record<string, unknown>): void {
  if (!isTradeTimingEnabled() || !activeTrace) return;

  pushStep(label, detail);
  const trace = activeTrace;
  const totalMs = roundMs(performance.now() - trace.startedAt);

  console.info(`${PREFIX} ✓ DONE trace=${trace.id} side=${trace.side} total=${totalMs}ms`, {
    summary: trace.steps.map(
      (s) => `${s.label} +${s.sincePrevMs}ms @${s.totalMs}ms`
    ),
    ...detail,
  });

  activeTrace = null;
}

export function failTradeTrace(label: string, error: unknown): void {
  if (!isTradeTimingEnabled() || !activeTrace) return;

  const message = error instanceof Error ? error.message : String(error);
  pushStep(label, { error: message });
  const trace = activeTrace;
  const totalMs = roundMs(performance.now() - trace.startedAt);

  console.error(`${PREFIX} ✗ FAIL trace=${trace.id} side=${trace.side} total=${totalMs}ms`, {
    error: message,
    summary: trace.steps.map(
      (s) => `${s.label} +${s.sincePrevMs}ms @${s.totalMs}ms`
    ),
  });

  activeTrace = null;
}

export function hasActiveTradeTrace(): boolean {
  return activeTrace !== null;
}
