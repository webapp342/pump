"use client";

import { type ReactNode } from "react";
import { explorerAddressUrl, shortAddress } from "@/config/chain";

export type AdminTabId =
  | "dashboard"
  | "portfolio"
  | "treasury"
  | "airdrops"
  | "promo"
  | "contracts";

type NavItem = {
  id: AdminTabId;
  label: string;
  description: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

export const ADMIN_PAGE_META: Record<AdminTabId, { title: string; description: string }> = {
  dashboard: {
    title: "Dashboard",
    description: "Platform KPIs, infrastructure health, and fee overview.",
  },
  portfolio: {
    title: "Portfolio",
    description: "Admin wallet token holdings and bulk sell tools.",
  },
  treasury: {
    title: "Treasury & fees",
    description: "Protocol fee settings, treasury balances, and withdrawals.",
  },
  airdrops: {
    title: "Airdrop sweeps",
    description: "Recover unclaimed escrow after the on-chain claim window.",
  },
  promo: {
    title: "Promo tasks",
    description: "Create and manage off-chain link tasks for launchpad points.",
  },
  contracts: {
    title: "Contracts",
    description: "UUPS proxy addresses referenced by the app and indexer.",
  },
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ id: "dashboard", label: "Dashboard", description: "KPIs & health" }],
  },
  {
    label: "Operations",
    items: [
      { id: "portfolio", label: "Portfolio", description: "Wallet holdings" },
      { id: "airdrops", label: "Airdrop sweeps", description: "Escrow recovery" },
      { id: "promo", label: "Promo tasks", description: "Points campaigns" },
    ],
  },
  {
    label: "Finance",
    items: [{ id: "treasury", label: "Treasury & fees", description: "Fees & withdraw" }],
  },
  {
    label: "System",
    items: [{ id: "contracts", label: "Contracts", description: "On-chain refs" }],
  },
];

export function AdminShell({ children }: { children: ReactNode }) {
  return <div className="admin-page">{children}</div>;
}

export function AdminLayout({
  activeTab,
  onTabChange,
  address,
  onRefreshAll,
  refreshing,
  headerActions,
  children,
}: {
  activeTab: AdminTabId;
  onTabChange: (tab: AdminTabId) => void;
  address?: string;
  onRefreshAll?: () => void;
  refreshing?: boolean;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  const meta = ADMIN_PAGE_META[activeTab];

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <div className="admin-sidebar-brand">
          <p className="admin-sidebar-brand-title">Pump Admin</p>
          <p className="admin-sidebar-brand-sub">BSC Testnet · Operations</p>
        </div>

        <nav className="admin-sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="admin-sidebar-group">
              <p className="admin-sidebar-group-label">{group.label}</p>
              {group.items.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onTabChange(item.id)}
                    className={
                      isActive
                        ? "admin-sidebar-link admin-sidebar-link-active"
                        : "admin-sidebar-link"
                    }
                    aria-current={isActive ? "page" : undefined}
                  >
                    <span className="admin-sidebar-link-label">{item.label}</span>
                    <span className="admin-sidebar-link-desc">{item.description}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {address ? (
          <div className="admin-sidebar-foot">
            Connected{" "}
            <a
              href={explorerAddressUrl(address)}
              target="_blank"
              rel="noopener noreferrer"
              className="admin-link admin-num"
            >
              {shortAddress(address)}
            </a>
          </div>
        ) : null}
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="min-w-0">
            <h1 className="admin-topbar-title">{meta.title}</h1>
            <p className="admin-topbar-desc">{meta.description}</p>
          </div>
          {onRefreshAll || headerActions ? (
            <div className="admin-topbar-actions">
              {headerActions}
              {onRefreshAll ? (
                <button
                  type="button"
                  onClick={onRefreshAll}
                  disabled={refreshing}
                  className="admin-btn"
                >
                  {refreshing ? "Refreshing…" : "Refresh all"}
                </button>
              ) : null}
            </div>
          ) : null}
        </header>

        <div className="admin-content">
          <div className="admin-content-inner">{children}</div>
        </div>
      </div>
    </div>
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
    <div role="tabpanel" id={`admin-panel-${id}`} className="admin-panel">
      {children}
    </div>
  );
}

export function AdminKpiGrid({ children }: { children: ReactNode }) {
  return <div className="admin-kpi-grid">{children}</div>;
}

export function AdminKpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "ok" | "warn" | "bad";
}) {
  const toneClass =
    tone === "ok"
      ? "admin-status-ok"
      : tone === "warn"
        ? "admin-status-warn"
        : tone === "bad"
          ? "admin-status-bad"
          : "";

  return (
    <article className="admin-kpi-card">
      <p className="admin-kpi-label">{label}</p>
      <p className={`admin-kpi-value ${toneClass}`.trim()}>{value}</p>
      {hint ? <p className="admin-kpi-hint">{hint}</p> : null}
    </article>
  );
}

export function AdminContentGrid({
  columns = 1,
  children,
}: {
  columns?: 1 | 2;
  children: ReactNode;
}) {
  return (
    <div className={columns === 2 ? "admin-content-grid admin-content-grid--2" : "admin-content-grid"}>
      {children}
    </div>
  );
}

export function AdminCard({
  title,
  actions,
  children,
  padded,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <h2 className="admin-card-title">{title}</h2>
        {actions ? <div className="admin-card-actions">{actions}</div> : null}
      </div>
      <div className={padded ? "admin-card-body admin-card-body--padded" : "admin-card-body"}>
        {children}
      </div>
    </section>
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
    <AdminCard title={title} actions={actions}>
      {children}
    </AdminCard>
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
    <div className="admin-data-table-wrap">
      <table className="admin-grid">
        <tbody>{children}</tbody>
      </table>
    </div>
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
  primary,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={primary ? "admin-btn admin-btn-primary" : "admin-btn"}
    >
      {children}
    </button>
  );
}

export function AdminField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="admin-field-label">{label}</span>
      {children}
    </label>
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

/** @deprecated use AdminLayout sidebar navigation */
export function AdminTabs({
  active,
  onChange,
}: {
  active: AdminTabId;
  onChange: (tab: AdminTabId) => void;
}) {
  return (
    <nav className="admin-tabs" aria-label="Admin sections">
      {NAV_GROUPS.flatMap((g) => g.items).map((tab) => (
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

/** @deprecated use AdminLayout topbar */
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
        <p className="page-copy">Protocol operations — on-chain fees, treasury, emergency tools, and promo tasks.</p>
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

/** @deprecated use AdminScroll */
export function AdminTableWrap({ children }: { children: ReactNode }) {
  return <AdminScroll>{children}</AdminScroll>;
}

/** @deprecated use AdminEmpty */
export function AdminEmptyState({ title }: { title: string }) {
  return <AdminEmpty>{title}</AdminEmpty>;
}

/** @deprecated use AdminCard */
export function AdminSection(props: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  compact?: boolean;
}) {
  return <AdminBlock title={props.title} actions={props.actions}>{props.children}</AdminBlock>;
}
