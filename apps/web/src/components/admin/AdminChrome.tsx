"use client";

import { type ReactNode, useMemo, useState } from "react";
import {
  Boxes,
  ChevronRight,
  CreditCard,
  FileCode2,
  Gift,
  KeyRound,
  Landmark,
  LayoutDashboard,
  ListTodo,
  Menu,
  RefreshCw,
  Wallet,
  X,
} from "lucide-react";
import { explorerAddressUrl, shortAddress } from "@/config/chain";
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
  description: string;
  icon: React.ElementType;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

export const ADMIN_PAGE_META: Record<AdminTabId, { title: string; description: string }> =
  ADMIN_COPY.pages;

const NAV_GROUPS: NavGroup[] = [
  {
    label: ADMIN_COPY.nav.overview,
    items: [
      {
        id: "dashboard",
        label: ADMIN_COPY.nav.items.dashboard.label,
        description: ADMIN_COPY.nav.items.dashboard.desc,
        icon: LayoutDashboard,
      },
      {
        id: "todos",
        label: ADMIN_COPY.nav.items.todos.label,
        description: ADMIN_COPY.nav.items.todos.desc,
        icon: ListTodo,
      },
    ],
  },
  {
    label: ADMIN_COPY.nav.operations,
    items: [
      {
        id: "portfolio",
        label: ADMIN_COPY.nav.items.portfolio.label,
        description: ADMIN_COPY.nav.items.portfolio.desc,
        icon: Wallet,
      },
      {
        id: "airdrops",
        label: ADMIN_COPY.nav.items.airdrops.label,
        description: ADMIN_COPY.nav.items.airdrops.desc,
        icon: Gift,
      },
      {
        id: "promo",
        label: ADMIN_COPY.nav.items.promo.label,
        description: ADMIN_COPY.nav.items.promo.desc,
        icon: CreditCard,
      },
    ],
  },
  {
    label: ADMIN_COPY.nav.finance,
    items: [
      {
        id: "treasury",
        label: ADMIN_COPY.nav.items.treasury.label,
        description: ADMIN_COPY.nav.items.treasury.desc,
        icon: Landmark,
      },
    ],
  },
  {
    label: ADMIN_COPY.nav.system,
    items: [
      {
        id: "contracts",
        label: ADMIN_COPY.nav.items.contracts.label,
        description: ADMIN_COPY.nav.items.contracts.desc,
        icon: FileCode2,
      },
      {
        id: "environment",
        label: ADMIN_COPY.nav.items.environment.label,
        description: ADMIN_COPY.nav.items.environment.desc,
        icon: KeyRound,
      },
    ],
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
  const [mobileOpen, setMobileOpen] = useState(false);

  const navGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.map((item) => ({
          ...item,
          isActive: activeTab === item.id,
        })),
      })),
    [activeTab]
  );

  const handleNavClick = (id: AdminTabId) => {
    onTabChange(id);
    setMobileOpen(false);
  };

  const renderSidebarContent = () => (
    <>
      <div className="admin-sidebar-brand">
        <div className="admin-sidebar-brand-mark">
          <Boxes className="admin-sidebar-brand-icon" aria-hidden="true" />
        </div>
        <div>
          <p className="admin-sidebar-brand-title">{ADMIN_COPY.brand.title}</p>
          <p className="admin-sidebar-brand-sub">{ADMIN_COPY.brand.subtitle}</p>
        </div>
      </div>

      <nav className="admin-sidebar-nav">
        {navGroups.map((group) => (
          <div key={group.label} className="admin-sidebar-group">
            <p className="admin-sidebar-group-label">{group.label}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={
                    item.isActive
                      ? "admin-sidebar-link admin-sidebar-link-active"
                      : "admin-sidebar-link"
                  }
                  aria-current={item.isActive ? "page" : undefined}
                >
                  <span className="admin-sidebar-link-icon" aria-hidden="true">
                    <Icon size={18} strokeWidth={1.8} />
                  </span>
                  <span className="admin-sidebar-link-text">
                    <span className="admin-sidebar-link-label">{item.label}</span>
                    <span className="admin-sidebar-link-desc">{item.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="admin-sidebar-foot">
        {address ? (
          <div className="admin-wallet-widget">
            <div className="admin-wallet-widget-main">
              <span className="admin-wallet-dot" aria-hidden="true" />
              <a
                href={explorerAddressUrl(address)}
                target="_blank"
                rel="noopener noreferrer"
                className="admin-link admin-num"
              >
                {shortAddress(address)}
              </a>
            </div>
            <span className="admin-wallet-network">{ADMIN_COPY.auth.sidebarConnected}</span>
          </div>
        ) : (
          <span className="admin-sidebar-foot-note">No wallet connected</span>
        )}
      </div>
    </>
  );

  return (
    <div className="admin-layout">
      {/* Desktop sidebar */}
      <aside className="admin-sidebar" aria-label="Admin navigation">
        {renderSidebarContent()}
      </aside>

      {/* Mobile drawer */}
      <div
        className={mobileOpen ? "admin-mobile-drawer admin-mobile-drawer--open" : "admin-mobile-drawer"}
        aria-hidden={!mobileOpen}
      >
        <div className="admin-mobile-drawer-scrim" onClick={() => setMobileOpen(false)} />
        <aside className="admin-mobile-drawer-panel" aria-label="Admin navigation mobile">
          <div className="admin-mobile-drawer-head">
            <div className="admin-sidebar-brand">
              <div className="admin-sidebar-brand-mark">
                <Boxes className="admin-sidebar-brand-icon" aria-hidden="true" />
              </div>
              <div>
                <p className="admin-sidebar-brand-title">{ADMIN_COPY.brand.title}</p>
                <p className="admin-sidebar-brand-sub">BSC Testnet</p>
              </div>
            </div>
            <button
              type="button"
              className="admin-icon-btn"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          </div>
          {renderSidebarContent()}
        </aside>
      </div>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-start">
            <button
              type="button"
              className="admin-mobile-menu-btn"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <nav className="admin-breadcrumb" aria-label="Breadcrumb">
                <span className="admin-breadcrumb-root">{ADMIN_COPY.brand.breadcrumbRoot}</span>
                <ChevronRight size={14} className="admin-breadcrumb-sep" aria-hidden="true" />
                <span className="admin-breadcrumb-current" aria-current="page">
                  {meta.title}
                </span>
              </nav>
              <h1 className="admin-topbar-title">{meta.title}</h1>
              <p className="admin-topbar-desc">{meta.description}</p>
            </div>
          </div>

          <div className="admin-topbar-actions">
            {headerActions}

            {onRefreshAll ? (
              <button
                type="button"
                onClick={onRefreshAll}
                disabled={refreshing}
                className={refreshing ? "admin-btn admin-btn-loading" : "admin-btn"}
              >
                <RefreshCw
                  size={14}
                  className={refreshing ? "admin-spin" : ""}
                  aria-hidden="true"
                />
                <span>{refreshing ? ADMIN_COPY.actions.refreshing : ADMIN_COPY.actions.refresh}</span>
              </button>
            ) : null}
          </div>
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
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "ok" | "warn" | "bad";
  icon?: React.ElementType;
}) {
  const toneClass =
    tone === "ok"
      ? "admin-status-ok"
      : tone === "warn"
        ? "admin-status-warn"
        : tone === "bad"
          ? "admin-status-bad"
          : "";

  const Icon = icon;

  return (
    <article className="admin-kpi-card">
      <div className="admin-kpi-card-head">
        <p className="admin-kpi-label">{label}</p>
        {Icon ? (
          <span className="admin-kpi-icon" aria-hidden="true">
            <Icon size={16} />
          </span>
        ) : null}
      </div>
      <p className={`admin-kpi-value ${toneClass}`.trim()}>{value}</p>
      {hint ? <p className="admin-kpi-hint">{hint}</p> : null}
    </article>
  );
}

export function AdminKpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="admin-kpi-grid">
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
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  footer?: ReactNode;
}) {
  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <div className="admin-card-head-text">
          <h2 className="admin-card-title">{title}</h2>
          {description ? <p className="admin-section-desc">{description}</p> : null}
        </div>
        {actions ? <div className="admin-card-actions">{actions}</div> : null}
      </div>
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
  title: string;
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
