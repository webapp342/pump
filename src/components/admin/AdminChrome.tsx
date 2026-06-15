"use client";

import { type ReactNode } from "react";
import { explorerAddressUrl, shortAddress } from "@/config/chain";

export type AdminTabId = "dashboard" | "treasury" | "airdrops" | "promo" | "contracts";

const TAB_ITEMS: { id: AdminTabId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "treasury", label: "Treasury & fees" },
  { id: "airdrops", label: "Airdrop sweeps" },
  { id: "promo", label: "Promo tasks" },
  { id: "contracts", label: "Contracts" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  return <div className="admin-page">{children}</div>;
}

export function AdminPageHeader({
  address,
  onRefreshAll,
  refreshing,
}: {
  address?: string;
  onRefreshAll?: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="page-intro admin-toolbar">
      <div>
        <p className="page-kicker">Operations</p>
        <h1 className="page-title">Admin</h1>
        <p className="page-copy">Protocol operations console — fees, treasury, sweeps, and promo tasks.</p>
      </div>
      <div className="flex items-center gap-3">
        {address ? (
          <a
            href={explorerAddressUrl(address)}
            target="_blank"
            rel="noopener noreferrer"
            className="admin-link admin-num"
          >
            {shortAddress(address)}
          </a>
        ) : null}
        {onRefreshAll ? (
          <button type="button" onClick={onRefreshAll} disabled={refreshing} className="admin-btn">
            {refreshing ? "Refreshing…" : "Refresh all"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function AdminTabs({
  active,
  onChange,
}: {
  active: AdminTabId;
  onChange: (tab: AdminTabId) => void;
}) {
  return (
    <nav className="admin-tabs" aria-label="Admin sections">
      {TAB_ITEMS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={active === tab.id ? "admin-tab admin-tab-active" : "admin-tab"}
          aria-current={active === tab.id ? "page" : undefined}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

export function AdminTabPanel({
  id,
  active,
  children,
}: {
  id: AdminTabId;
  active: AdminTabId;
  children: ReactNode;
}) {
  if (active !== id) return null;
  return (
    <div role="tabpanel" className="admin-panel">
      {children}
    </div>
  );
}

export function AdminBlock({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="admin-block">
      <div className="admin-block-head">
        <span>{title}</span>
        {actions ? <div>{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function AdminScroll({ children }: { children: ReactNode }) {
  return <div className="admin-scroll">{children}</div>;
}

export function AdminGridTable({ children }: { children: ReactNode }) {
  return (
    <AdminScroll>
      <table className="admin-grid">{children}</table>
    </AdminScroll>
  );
}

export function AdminKvTable({ children }: { children: ReactNode }) {
  return (
    <table className="admin-grid">
      <tbody>{children}</tbody>
    </table>
  );
}

export function AdminKvRow({
  label,
  children,
  action,
  loading,
}: {
  label: string;
  children: ReactNode;
  action?: ReactNode;
  loading?: boolean;
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{loading ? <span className="admin-meta">…</span> : children}</td>
      <td className="whitespace-nowrap">{action ?? null}</td>
    </tr>
  );
}

export function AdminDataTable({ children }: { children: ReactNode }) {
  return <AdminKvTable>{children}</AdminKvTable>;
}

export const AdminDataRow = AdminKvRow;

export function AdminNum({ children }: { children: ReactNode }) {
  return <span className="admin-num">{children}</span>;
}

export function AdminTextButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="admin-btn-link">
      {children}
    </button>
  );
}

export function AdminBtn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="admin-btn">
      {children}
    </button>
  );
}

export function AdminEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="empty-state admin-empty">
      <p className="empty-state-copy">{children}</p>
    </div>
  );
}

export function AdminAlert({ children }: { children: ReactNode }) {
  return <div className="admin-alert">{children}</div>;
}

/** @deprecated use AdminGridTable */
export function AdminTableWrap({ children }: { children: ReactNode }) {
  return <AdminScroll>{children}</AdminScroll>;
}

/** @deprecated use AdminBlock */
export function AdminSection(props: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  compact?: boolean;
}) {
  return <AdminBlock title={props.title} actions={props.actions}>{props.children}</AdminBlock>;
}

/** @deprecated use AdminEmpty */
export function AdminEmptyState({ title }: { title: string }) {
  return <AdminEmpty>{title}</AdminEmpty>;
}
