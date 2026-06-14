"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ServiceHealthStatus = "healthy" | "degraded" | "down";

type ServiceHealthCheck = {
  id: string;
  name: string;
  status: ServiceHealthStatus;
  summary: string;
  probe: string;
  detail?: string;
  latencyMs?: number;
  logs?: string[];
  timings?: Record<string, number | null>;
};

type HostDiskMetric = {
  filesystem: string;
  size: string;
  used: string;
  avail: string;
  usePercent: string;
  mountedOn: string;
};

type HostMetrics = {
  disk: HostDiskMetric[];
  memory: {
    totalMb: number;
    usedMb: number;
    freeMb: number;
    availableMb: number;
    usedPercent: number;
  };
  cpu: {
    cores: number;
    usagePercent: number | null;
    load1: number;
    load5: number;
    load15: number;
    loadPercent1: number;
  };
  uptime: string;
};

type SystemHealthReport = {
  overall: ServiceHealthStatus;
  checkedAt: string;
  host?: string;
  scriptDurationMs?: number;
  hostMetrics?: HostMetrics;
  checks: ServiceHealthCheck[];
};

function statusLabel(status: ServiceHealthStatus): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "degraded":
      return "Degraded";
    case "down":
      return "Down";
  }
}

function statusBadgeClass(status: ServiceHealthStatus): string {
  switch (status) {
    case "healthy":
      return "status-badge border-pump-accent/30 bg-pump-accent/10 text-pump-accent";
    case "degraded":
      return "status-badge border-pump-warning/30 bg-pump-warning/10 text-pump-warning";
    case "down":
      return "status-badge border-pump-danger/30 bg-pump-danger/10 text-pump-danger";
  }
}

function overallBannerClass(status: ServiceHealthStatus): string {
  switch (status) {
    case "healthy":
      return "border-pump-accent/25 bg-pump-accent/5";
    case "degraded":
      return "border-pump-warning/25 bg-pump-warning/5";
    case "down":
      return "border-pump-danger/25 bg-pump-danger/5";
  }
}

function latencyClass(ms: number): string {
  if (ms >= 500) return "text-pump-danger font-semibold";
  if (ms >= 150) return "text-pump-warning font-semibold";
  return "text-pump-accent font-semibold";
}

function usageBarClass(percent: number): string {
  if (percent >= 90) return "bg-pump-danger";
  if (percent >= 75) return "bg-pump-warning";
  return "bg-pump-accent";
}

function parseDiskPercent(pcent: string): number {
  const n = Number(String(pcent).replace("%", ""));
  return Number.isFinite(n) ? n : 0;
}

function formatCheckedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatTimings(timings?: Record<string, number | null>): string | null {
  if (!timings) return null;
  const parts = Object.entries(timings)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k} ${v}ms`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.replace(/\s+/g, " ").slice(0, 120);
    throw new Error(
      preview.startsWith("<")
        ? `Server returned HTML instead of JSON (${res.status}). Redeploy or check nginx.`
        : `Invalid JSON response (${res.status}): ${preview}`
    );
  }
}

function HostMetricsPanel({ metrics }: { metrics: HostMetrics }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-lg border border-pump-border/15 bg-pump-surface/25 p-3">
          <p className="section-label text-[10px]">CPU</p>
          <p className="financial-value mt-1 text-lg font-semibold text-pump-text">
            {metrics.cpu.usagePercent != null ? `${metrics.cpu.usagePercent}%` : "—"}
          </p>
          <p className="text-caption text-pump-muted">
            load {metrics.cpu.load1}/{metrics.cpu.load5}/{metrics.cpu.load15} ·{" "}
            {metrics.cpu.cores} cores ({metrics.cpu.loadPercent1}%)
          </p>
        </div>
        <div className="rounded-lg border border-pump-border/15 bg-pump-surface/25 p-3">
          <p className="section-label text-[10px]">RAM</p>
          <p className="financial-value mt-1 text-lg font-semibold text-pump-text">
            {metrics.memory.usedPercent}%
          </p>
          <p className="text-caption text-pump-muted">
            {metrics.memory.usedMb} / {metrics.memory.totalMb} MB · {metrics.memory.availableMb} MB
            avail
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-pump-border/20">
            <div
              className={`h-full ${usageBarClass(metrics.memory.usedPercent)}`}
              style={{ width: `${Math.min(metrics.memory.usedPercent, 100)}%` }}
            />
          </div>
        </div>
        <div className="col-span-2 rounded-lg border border-pump-border/15 bg-pump-surface/25 p-3">
          <p className="section-label text-[10px]">Uptime</p>
          <p className="mt-1 text-body-sm text-pump-text">{metrics.uptime || "—"}</p>
        </div>
      </div>

      <div className="rounded-lg border border-pump-border/15 bg-pump-surface/25 p-3">
        <p className="section-label text-[10px]">Disk (df -h)</p>
        <div className="mt-2 space-y-2">
          {metrics.disk.map((d) => {
            const pct = parseDiskPercent(d.usePercent);
            return (
              <div key={`${d.filesystem}-${d.mountedOn}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-caption">
                  <span className="font-medium text-pump-text">
                    {d.mountedOn}{" "}
                    <span className="font-normal text-pump-muted">({d.filesystem})</span>
                  </span>
                  <span className="text-pump-muted">
                    {d.used} / {d.size} · <span className="text-pump-text">{d.avail} free</span>
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-pump-border/20">
                    <div
                      className={`h-full ${usageBarClass(pct)}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <span className="financial-value w-10 text-right text-caption font-semibold text-pump-text">
                    {d.usePercent}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChecksList({ checks }: { checks: ServiceHealthCheck[] }) {
  return (
    <div className="space-y-3">
      {checks.map((check) => {
        const timingDetail = formatTimings(check.timings);
        return (
          <div
            key={check.id}
            className="rounded-lg border border-pump-border/15 bg-pump-surface/25 p-3 md:p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-pump-text">{check.name}</p>
                <p className="mt-0.5 text-body-sm text-pump-muted">{check.summary}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {check.latencyMs != null ? (
                  <span
                    className={`financial-value rounded-md border border-pump-border/20 bg-pump-bg/50 px-2 py-0.5 text-sm tabular-nums ${latencyClass(check.latencyMs)}`}
                  >
                    {check.latencyMs}ms
                  </span>
                ) : null}
                <span className={statusBadgeClass(check.status)}>{statusLabel(check.status)}</span>
              </div>
            </div>
            {timingDetail ? (
              <p className="mt-2 text-caption text-pump-muted">
                <span className="text-pump-text">Breakdown:</span> {timingDetail}
              </p>
            ) : null}
            {check.detail ? (
              <p className="mt-1 break-all text-caption text-pump-muted">{check.detail}</p>
            ) : null}
            <p className="mt-1 break-all text-caption text-pump-muted/80">
              <span className="text-pump-muted">Probe:</span> {check.probe}
            </p>
            {check.logs && check.logs.length > 0 ? (
              <pre className="mt-2 max-h-36 overflow-auto rounded-md border border-pump-border/15 bg-pump-bg/60 p-2 text-[11px] leading-relaxed text-pump-muted">
                {check.logs.join("\n")}
              </pre>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SystemHealthDetailModal({
  open,
  onClose,
  report,
  error,
  loading,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  report: SystemHealthReport | null;
  error: string | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (!open) return null;

  const overall = report?.overall ?? "down";
  const passing = report?.checks.filter((c) => c.status === "healthy").length ?? 0;
  const total = report?.checks.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-system-health-title"
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="panel-surface relative flex max-h-[min(92dvh,900px)] w-full max-w-3xl flex-col overflow-hidden shadow-panel">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-pump-border/15 px-4 py-3.5 md:px-5">
          <div>
            <h2 id="admin-system-health-title" className="text-h2 font-semibold text-pump-text">
              System health
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={statusBadgeClass(overall)}>{statusLabel(overall)}</span>
              <span className="text-body-sm text-pump-text">
                {report ? `${passing}/${total} checks passing` : loading ? "Running checks…" : "No data"}
              </span>
              {report?.scriptDurationMs != null ? (
                <span className={`financial-value text-caption ${latencyClass(report.scriptDurationMs)}`}>
                  script {report.scriptDurationMs}ms
                </span>
              ) : null}
            </div>
            {report ? (
              <p className="mt-1 text-caption text-pump-muted">
                {report.host ? `${report.host} · ` : ""}
                Last checked {formatCheckedAt(report.checkedAt)}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="rounded-md border border-pump-border/25 bg-pump-surface/50 px-3 py-1.5 text-caption font-medium text-pump-text transition hover:border-pump-border/40 disabled:opacity-60"
            >
              {loading ? "Running…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-pump-border/25 px-2.5 py-1.5 text-caption text-pump-muted hover:text-pump-text"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-4 py-4 md:px-5">
          {error ? (
            <div className="notice-error mb-4 rounded-lg border border-pump-danger/30 bg-pump-danger/5 px-3 py-2 text-body-sm">
              {error}
            </div>
          ) : null}

          {report?.hostMetrics ? (
            <div className="mb-4">
              <HostMetricsPanel metrics={report.hostMetrics} />
            </div>
          ) : null}

          {report?.checks.length ? <ChecksList checks={report.checks} /> : null}

          {loading && !report ? (
            <p className="py-8 text-center text-pump-muted">Running VM health checks…</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AdminSystemHealth({ address }: { address: string }) {
  const [report, setReport] = useState<SystemHealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const initialLoad = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/system-health?address=${address}`, { cache: "no-store" });
      const json = await parseJsonResponse<{ data?: SystemHealthReport; error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Failed to load system health");
      setReport(json.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load system health");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (initialLoad.current) return;
    initialLoad.current = true;
    void load();
  }, [load]);

  const overall = report?.overall ?? "down";
  const passing = report?.checks.filter((c) => c.status === "healthy").length ?? 0;
  const total = report?.checks.length ?? 0;

  const summaryText =
    loading && !report
      ? "Checking…"
      : report
        ? `${passing}/${total} checks passing`
        : error
          ? "Check failed"
          : "No data";

  return (
    <>
      <section className="panel-surface overflow-hidden">
        <div
          className={`flex items-center justify-between gap-3 px-4 py-3.5 md:px-5 ${overallBannerClass(overall)}`}
        >
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="min-w-0 flex-1 text-left transition hover:opacity-90"
          >
            <p className="section-label">System health</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className={statusBadgeClass(overall)}>{statusLabel(overall)}</span>
              <span className="text-body-sm font-medium text-pump-text">{summaryText}</span>
            </div>
            {report ? (
              <p className="mt-0.5 text-caption text-pump-muted">
                Tap for VM metrics, ms timings &amp; logs
              </p>
            ) : error ? (
              <p className="mt-0.5 text-caption text-pump-danger">{error}</p>
            ) : null}
          </button>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-md border border-pump-border/25 bg-pump-surface/50 px-3 py-1.5 text-caption font-medium text-pump-text transition hover:border-pump-border/40 disabled:opacity-60"
            >
              {loading ? "…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-md border border-pump-border/25 px-2.5 py-1.5 text-caption text-pump-muted hover:text-pump-text"
              aria-label="Open system health details"
            >
              ›
            </button>
          </div>
        </div>
      </section>

      <SystemHealthDetailModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        report={report}
        error={error}
        loading={loading}
        onRefresh={() => void load()}
      />
    </>
  );
}
