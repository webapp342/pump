"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AdminBlock,
  AdminBtn,
  AdminDataRow,
  AdminDataTable,
  AdminGridTable,
  AdminTextButton,
} from "@/components/admin/AdminChrome";
import { ModalPortal } from "@/components/ui/ModalPortal";

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

function statusClass(status: ServiceHealthStatus): string {
  switch (status) {
    case "healthy":
      return "admin-status-ok";
    case "degraded":
      return "admin-status-warn";
    case "down":
      return "admin-status-bad";
  }
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

function HostMetricsTables({ metrics }: { metrics: HostMetrics }) {
  return (
    <>
      <AdminBlock title="Host metrics">
        <AdminDataTable>
          <AdminDataRow label="CPU">
            {metrics.cpu.usagePercent != null ? `${metrics.cpu.usagePercent}%` : "—"}
            <span className="admin-meta">
              {" "}
              · load {metrics.cpu.load1}/{metrics.cpu.load5}/{metrics.cpu.load15} ·{" "}
              {metrics.cpu.cores} cores
            </span>
          </AdminDataRow>
          <AdminDataRow label="RAM">
            {metrics.memory.usedPercent}% · {metrics.memory.usedMb}/{metrics.memory.totalMb} MB
            <span className="admin-meta"> · {metrics.memory.availableMb} MB avail</span>
          </AdminDataRow>
          <AdminDataRow label="Uptime">{metrics.uptime || "—"}</AdminDataRow>
        </AdminDataTable>
      </AdminBlock>
      <AdminBlock title="Disk">
        <AdminGridTable>
          <thead>
            <tr>
              <th>Mount</th>
              <th>FS</th>
              <th>Size</th>
              <th>Used</th>
              <th>Avail</th>
              <th>Use %</th>
            </tr>
          </thead>
          <tbody>
            {metrics.disk.map((d) => (
              <tr key={`${d.filesystem}-${d.mountedOn}`}>
                <td>{d.mountedOn}</td>
                <td className="admin-num">{d.filesystem}</td>
                <td className="admin-num">{d.size}</td>
                <td className="admin-num">{d.used}</td>
                <td className="admin-num">{d.avail}</td>
                <td className="admin-num">{d.usePercent}</td>
              </tr>
            ))}
          </tbody>
        </AdminGridTable>
      </AdminBlock>
    </>
  );
}

function ChecksTable({ checks }: { checks: ServiceHealthCheck[] }) {
  return (
    <AdminBlock title="Service checks">
      <AdminGridTable>
        <thead>
          <tr>
            <th>Service</th>
            <th>Status</th>
            <th>Latency</th>
            <th>Summary</th>
            <th>Timings</th>
            <th>Detail / logs</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((check) => {
            const timingDetail = formatTimings(check.timings);
            return (
              <tr key={check.id}>
                <td>{check.name}</td>
                <td className={statusClass(check.status)}>{statusLabel(check.status)}</td>
                <td className="admin-num">{check.latencyMs != null ? `${check.latencyMs}ms` : "—"}</td>
                <td>{check.summary}</td>
                <td className="admin-num">{timingDetail ?? "—"}</td>
                <td>
                  {check.detail ? <div>{check.detail}</div> : null}
                  <div className="admin-meta">{check.probe}</div>
                  {check.logs && check.logs.length > 0 ? (
                    <pre className="admin-log">{check.logs.join("\n")}</pre>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </AdminGridTable>
    </AdminBlock>
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
    <ModalPortal open={open}>
    <div className="modal-backdrop modal-backdrop-shell z-50" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 cursor-default border-0 bg-transparent p-0"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="admin-page admin-modal relative z-10">
        <div className="admin-modal-head">
          <span>Infrastructure details</span>
          <div className="flex gap-2">
            <AdminBtn onClick={onRefresh} disabled={loading}>
              {loading ? "…" : "Refresh"}
            </AdminBtn>
            <AdminBtn onClick={onClose}>Close</AdminBtn>
          </div>
        </div>
        <div className="admin-modal-body">
          {error ? <div className="admin-alert">{error}</div> : null}
          <AdminDataTable>
            <AdminDataRow label="Overall">
              <span className={statusClass(overall)}>{statusLabel(overall)}</span>
            </AdminDataRow>
            <AdminDataRow label="Checks">
              {report ? `${passing}/${total} passing` : loading ? "Running…" : "—"}
            </AdminDataRow>
            <AdminDataRow label="Script">
              {report?.scriptDurationMs != null ? `${report.scriptDurationMs}ms` : "—"}
            </AdminDataRow>
            <AdminDataRow label="Checked at">
              {report ? formatCheckedAt(report.checkedAt) : "—"}
            </AdminDataRow>
            <AdminDataRow label="Host">{report?.host ?? "—"}</AdminDataRow>
          </AdminDataTable>
          {report?.hostMetrics ? <HostMetricsTables metrics={report.hostMetrics} /> : null}
          {report?.checks.length ? <ChecksTable checks={report.checks} /> : null}
          {loading && !report ? <p className="admin-empty">Running checks…</p> : null}
        </div>
      </div>
    </div>
    </ModalPortal>
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
      <AdminBlock
        title="Infrastructure"
        actions={
          <>
            <AdminBtn onClick={() => void load()} disabled={loading}>
              {loading ? "…" : "Refresh"}
            </AdminBtn>
            <AdminTextButton onClick={() => setModalOpen(true)}>Details</AdminTextButton>
          </>
        }
      >
        <AdminDataTable>
          <AdminDataRow label="Status">
            <span className={statusClass(overall)}>{statusLabel(overall)}</span>
          </AdminDataRow>
          <AdminDataRow label="Checks">{summaryText}</AdminDataRow>
          <AdminDataRow label="Checked at">
            {report ? formatCheckedAt(report.checkedAt) : "—"}
          </AdminDataRow>
        </AdminDataTable>
        {error ? <p className="admin-note admin-status-bad">{error}</p> : null}
      </AdminBlock>

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
