"use client";

import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  Bell,
  ChevronRight,
  Pencil,
  RefreshCw,
  Search,
} from "lucide-react";
import { explorerAddressUrl, pumpChain, shortAddress } from "@/config/chain";
import { ADMIN_COPY } from "@/lib/admin/copy";

export type AdminTabId =
  | "dashboard"
  | "todos"
  | "portfolio"
  | "treasury"
  | "airdrops"
  | "promo"
  | "contracts"
  | "environment";

type NavItem = {
  id: AdminTabId;
  label: string;
  icon?: React.ElementType;
};

type AdminShellContextValue = {
  globalQuery: string;
  setGlobalQuery: (q: string) => void;
};

const AdminShellContext = createContext<AdminShellContextValue | null>(null);

export function useAdminShell(): AdminShellContextValue {
  const ctx = useContext(AdminShellContext);
  if (!ctx) {
    return { globalQuery: "", setGlobalQuery: () => {} };
  }
  return ctx;
}

export const ADMIN_PAGE_META: Record<AdminTabId, { title: string; description: string }> =
  ADMIN_COPY.pages;

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: ADMIN_COPY.nav.items.dashboard.label },
  { id: "todos", label: ADMIN_COPY.nav.items.todos.label },
  { id: "portfolio", label: ADMIN_COPY.nav.items.portfolio.label },
  { id: "airdrops", label: ADMIN_COPY.nav.items.airdrops.label },
  { id: "promo", label: ADMIN_COPY.nav.items.promo.label },
  { id: "treasury", label: ADMIN_COPY.nav.items.treasury.label },
  { id: "contracts", label: ADMIN_COPY.nav.items.contracts.label },
  { id: "environment", label: ADMIN_COPY.nav.items.environment.label },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const [globalQuery, setGlobalQuery] = useState("");
  const value = useMemo(() => ({ globalQuery, setGlobalQuery }), [globalQuery]);

  return (
    <AdminShellContext.Provider value={value}>
      <div className="admin-page admin-enterprise">{children}</div>
    </AdminShellContext.Provider>
  );
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
  const { globalQuery, setGlobalQuery } = useAdminShell();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(".admin-ent-global-search-input");
        input?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="admin-layout admin-layout--enterprise">
      <header className="admin-ent-header">
        <div className="admin-ent-header-row">
          <div className="admin-ent-brand">
            <span className="admin-ent-brand-title">{ADMIN_COPY.brand.title}</span>
            <span className="admin-ent-env" title={ADMIN_COPY.nav.environment}>
              {ADMIN_COPY.brand.envLabel}
            </span>
          </div>

          <nav className="admin-ent-nav" aria-label="Admin sections">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={
                  activeTab === item.id ? "admin-ent-nav-link admin-ent-nav-link--active" : "admin-ent-nav-link"
                }
                aria-current={activeTab === item.id ? "page" : undefined}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="admin-ent-header-tools">
            <label className="admin-ent-global-search">
              <Search size={14} aria-hidden />
              <input
                type="search"
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                placeholder={ADMIN_COPY.nav.search}
                className="admin-ent-global-search-input"
                aria-label={ADMIN_COPY.nav.search}
              />
              <kbd className="admin-kbd">⌘K</kbd>
            </label>

            <button
              type="button"
              className="admin-ent-icon-btn"
              aria-label={ADMIN_COPY.nav.notifications}
              disabled
              title="No new alerts"
            >
              <Bell size={15} />
            </button>

            {onRefreshAll ? (
              <button
                type="button"
                onClick={onRefreshAll}
                disabled={refreshing}
                className={refreshing ? "admin-btn admin-btn-sm admin-btn-loading" : "admin-btn admin-btn-sm"}
              >
                <RefreshCw size={13} className={refreshing ? "admin-spin" : ""} aria-hidden />
                {refreshing ? ADMIN_COPY.actions.refreshing : ADMIN_COPY.actions.refresh}
              </button>
            ) : null}

            {headerActions}

            <div className="admin-ent-user">
              <button
                type="button"
                className="admin-ent-user-btn"
                onClick={() => setUserMenuOpen((o) => !o)}
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
              >
                <span className="admin-ent-user-dot" aria-hidden />
                <span className="admin-num">{address ? shortAddress(address, true) : "—"}</span>
                <ChevronRight size={12} className="admin-ent-user-chevron" aria-hidden />
              </button>
              {userMenuOpen && address ? (
                <div className="admin-ent-user-menu" role="menu">
                  <a
                    href={explorerAddressUrl(address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-ent-user-menu-item admin-num"
                    role="menuitem"
                  >
                    {shortAddress(address)}
                  </a>
                  <span className="admin-ent-user-menu-meta" role="menuitem">
                    {pumpChain.name} · chain {pumpChain.id}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="admin-ent-main">
        <div className="admin-ent-main-inner">{children}</div>
      </main>
    </div>
  );
}

export function AdminPageGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={["admin-ent-grid", className].filter(Boolean).join(" ")}>{children}</div>;
}

export function AdminPageGridCell({
  span = 12,
  children,
  className,
}: {
  span?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["admin-ent-grid-cell", `admin-ent-grid-cell--${span}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
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

export function AdminKpiGrid({ children, columns = 6 }: { children: ReactNode; columns?: 4 | 5 | 6 }) {
  return (
    <div className={`admin-kpi-grid admin-kpi-grid--${columns}`}>{children}</div>
  );
}

export function AdminKpiCard({
  label,
  value,
  trend,
  tone,
}: {
  label: string;
  value: ReactNode;
  trend?: ReactNode;
  tone?: "ok" | "warn" | "bad";
  /** @deprecated icons removed in enterprise layout */
  icon?: React.ElementType;
  /** @deprecated use trend */
  hint?: ReactNode;
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
    <article className="admin-kpi-card admin-kpi-card--compact">
      <p className="admin-kpi-label">{label}</p>
      <p className={`admin-kpi-value ${toneClass}`.trim()}>{value}</p>
      {trend ? <p className="admin-kpi-trend">{trend}</p> : null}
    </article>
  );
}

export function AdminKpiSkeleton({ count = 6 }: { count?: number }) {
  const cols = count >= 6 ? 6 : count >= 5 ? 5 : 4;
  return (
    <div className={`admin-kpi-grid admin-kpi-grid--${cols}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="admin-kpi-card admin-kpi-card--loading">
          <div className="admin-kpi-card-head">
            <span className="skeleton-shimmer admin-skeleton-label" />
            <span className="skeleton-shimmer admin-skeleton-icon" />
          </div>
          <span className="skeleton-shimmer admin-skeleton-value" />
        </div>
      ))}
    </div>
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
    <div
      className={
        columns === 2
          ? "admin-content-grid admin-content-grid--2"
          : "admin-content-grid"
      }
    >
      {children}
    </div>
  );
}

export function AdminCard({
  title,
  description,
  actions,
  children,
  padded,
  footer,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  footer?: ReactNode;
}) {
  const hasHead = Boolean(title || description || actions);
  return (
    <section className="admin-card">
      {hasHead ? (
        <div
          className={
            description
              ? "admin-card-head"
              : "admin-card-head admin-card-head--compact"
          }
        >
          <div className="admin-card-head-text">
            {title ? <h2 className="admin-card-title">{title}</h2> : null}
            {description ? <p className="admin-section-desc">{description}</p> : null}
          </div>
          {actions ? <div className="admin-card-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div
        className={
          padded ? "admin-card-body admin-card-body--padded" : "admin-card-body"
        }
      >
        {children}
      </div>
      {footer ? <div className="admin-card-foot">{footer}</div> : null}
    </section>
  );
}

export function AdminBlock({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AdminCard title={title} description={description} actions={actions}>
      {children}
    </AdminCard>
  );
}

/** Section with optional callout banner above body content. */
export function AdminSection({
  title,
  description,
  actions,
  callout,
  calloutTone = "info",
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  callout?: ReactNode;
  calloutTone?: "info" | "warn" | "danger";
  children: ReactNode;
}) {
  return (
    <AdminCard title={title} description={description} actions={actions}>
      {callout ? <AdminCallout tone={calloutTone}>{callout}</AdminCallout> : null}
      {children}
    </AdminCard>
  );
}

export function AdminCallout({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warn" | "danger";
}) {
  return <div className={`admin-callout admin-callout--${tone}`}>{children}</div>;
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
  onEdit,
  editLabel = "Edit",
  loading,
}: {
  label: string;
  children: ReactNode;
  action?: ReactNode;
  onEdit?: () => void;
  editLabel?: string;
  loading?: boolean;
}) {
  const actionCell =
    action ??
    (onEdit ? (
      <AdminIconButton icon={Pencil} onClick={onEdit} label={editLabel} />
    ) : null);

  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{loading ? <span className="admin-meta">…</span> : children}</td>
      <td className="admin-kv-action">{actionCell}</td>
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
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="admin-btn-link"
    >
      {children}
    </button>
  );
}

export function AdminBtn({
  children,
  onClick,
  disabled,
  primary,
  danger,
  ghost,
  size = "md",
  icon,
}: {
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  ghost?: boolean;
  size?: "sm" | "md";
  icon?: React.ElementType;
}) {
  const classes = ["admin-btn"];
  if (primary) classes.push("admin-btn-primary");
  if (danger) classes.push("admin-btn-danger");
  if (ghost) classes.push("admin-btn-ghost");
  if (size === "sm") classes.push("admin-btn-sm");

  const Icon = icon;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={classes.join(" ")}
    >
      {Icon ? <Icon size={14} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function AdminIconButton({
  icon: Icon,
  onClick,
  disabled,
  label,
}: {
  icon: React.ElementType;
  onClick?: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="admin-icon-btn"
      aria-label={label}
    >
      <Icon size={16} />
    </button>
  );
}

export function AdminField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="admin-compact-field">
      <span className="admin-field-label">{label}</span>
      {children}
      {hint ? <span className="admin-compact-hint">{hint}</span> : null}
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

export function AdminStatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "ok" | "warn" | "bad" | "neutral";
}) {
  return <span className={`admin-status-badge admin-status-badge--${tone}`}>{children}</span>;
}

export function AdminPill({ children }: { children: ReactNode }) {
  return <span className="admin-pill">{children}</span>;
}

/** @deprecated use AdminLayout top navigation */
export function AdminTabs({
  active,
  onChange,
}: {
  active: AdminTabId;
  onChange: (tab: AdminTabId) => void;
}) {
  return (
    <nav className="admin-tabs" aria-label="Admin sections">
      {NAV_ITEMS.map((tab) => (
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
        <p className="page-copy">
          Protocol operations — on-chain fees, treasury, emergency tools, and promo tasks.
        </p>
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
