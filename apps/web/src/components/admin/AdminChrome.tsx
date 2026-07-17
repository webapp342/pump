"use client";

import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  PumpIcon,
  type PumpIconDefinition,
  faChartColumn,
  faChevronRight,
  faCoins,
  faListUl,
  faLock,
  faMenu,
  faParachuteBox,
  faPencil,
  faCampaign,
  faRefreshCw,
  faSearch,
  faSettings2,
  faWallet,
  faXmark,
} from "@/lib/icons";
import { explorerAddressUrl, pumpChain, shortAddress } from "@/config/chain";
import { PumpLogo } from "@/components/brand/PumpLogo";
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
  desc: string;
  icon: PumpIconDefinition;
};

type NavGroup = {
  id: "overview" | "operations" | "finance" | "system";
  label: string;
  items: NavItem[];
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

const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: ADMIN_COPY.nav.overview,
    items: [
      {
        id: "dashboard",
        label: ADMIN_COPY.nav.items.dashboard.label,
        desc: ADMIN_COPY.nav.items.dashboard.desc,
        icon: faChartColumn,
      },
    ],
  },
  {
    id: "operations",
    label: ADMIN_COPY.nav.operations,
    items: [
      {
        id: "todos",
        label: ADMIN_COPY.nav.items.todos.label,
        desc: ADMIN_COPY.nav.items.todos.desc,
        icon: faListUl,
      },
      {
        id: "airdrops",
        label: ADMIN_COPY.nav.items.airdrops.label,
        desc: ADMIN_COPY.nav.items.airdrops.desc,
        icon: faParachuteBox,
      },
      {
        id: "promo",
        label: ADMIN_COPY.nav.items.promo.label,
        desc: ADMIN_COPY.nav.items.promo.desc,
        icon: faCampaign,
      },
    ],
  },
  {
    id: "finance",
    label: ADMIN_COPY.nav.finance,
    items: [
      {
        id: "treasury",
        label: ADMIN_COPY.nav.items.treasury.label,
        desc: ADMIN_COPY.nav.items.treasury.desc,
        icon: faCoins,
      },
      {
        id: "portfolio",
        label: ADMIN_COPY.nav.items.portfolio.label,
        desc: ADMIN_COPY.nav.items.portfolio.desc,
        icon: faWallet,
      },
    ],
  },
  {
    id: "system",
    label: ADMIN_COPY.nav.system,
    items: [
      {
        id: "contracts",
        label: ADMIN_COPY.nav.items.contracts.label,
        desc: ADMIN_COPY.nav.items.contracts.desc,
        icon: faLock,
      },
      {
        id: "environment",
        label: ADMIN_COPY.nav.items.environment.label,
        desc: ADMIN_COPY.nav.items.environment.desc,
        icon: faSettings2,
      },
    ],
  },
];

function groupForTab(tab: AdminTabId): NavGroup {
  return NAV_GROUPS.find((g) => g.items.some((i) => i.id === tab)) ?? NAV_GROUPS[0]!;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [globalQuery, setGlobalQuery] = useState("");
  const value = useMemo(() => ({ globalQuery, setGlobalQuery }), [globalQuery]);

  return (
    <AdminShellContext.Provider value={value}>
      <div className="admin-page admin-enterprise">{children}</div>
    </AdminShellContext.Provider>
  );
}

function AdminSidebarNav({
  activeTab,
  onTabChange,
  onNavigate,
}: {
  activeTab: AdminTabId;
  onTabChange: (tab: AdminTabId) => void;
  onNavigate?: () => void;
}) {
  return (
    <nav className="admin-sidebar-nav" aria-label="Admin sections">
      {NAV_GROUPS.map((group) => (
        <div key={group.id} className="admin-sidebar-group">
          <p className="admin-sidebar-group-label">{group.label}</p>
          {group.items.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onTabChange(item.id);
                  onNavigate?.();
                }}
                className={
                  active ? "admin-sidebar-link admin-sidebar-link-active" : "admin-sidebar-link"
                }
                aria-current={active ? "page" : undefined}
              >
                <span className="admin-sidebar-link-icon" aria-hidden>
                  <PumpIcon icon={item.icon} className="h-3.5 w-3.5" />
                </span>
                <span className="admin-sidebar-link-text">
                  <span className="admin-sidebar-link-label">{item.label}</span>
                  <span className="admin-sidebar-link-desc">{item.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AdminLayout({
  activeTab,
  onTabChange,
  address,
  onRefreshAll,
  refreshing,
  onSignOut,
  children,
}: {
  activeTab: AdminTabId;
  onTabChange: (tab: AdminTabId) => void;
  address?: string;
  onRefreshAll?: () => void;
  refreshing?: boolean;
  onSignOut?: () => void;
  children: ReactNode;
}) {
  const { globalQuery, setGlobalQuery } = useAdminShell();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const page = ADMIN_PAGE_META[activeTab];
  const group = groupForTab(activeTab);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(".admin-ent-global-search-input");
        input?.focus();
      }
      if (e.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [activeTab]);

  const sidebarBrand = (
    <div className="admin-sidebar-brand">
      <PumpLogo size={32} variant="rounded" className="admin-sidebar-brand-logo" />
      <div className="admin-sidebar-brand-copy">
        <p className="admin-sidebar-brand-title">{ADMIN_COPY.brand.title}</p>
        <p className="admin-sidebar-brand-sub">
          {ADMIN_COPY.brand.subtitle}
          <span className="admin-sidebar-env" title={ADMIN_COPY.nav.environment}>
            {ADMIN_COPY.brand.envLabel}
          </span>
        </p>
      </div>
    </div>
  );

  const sidebarFoot = (
    <div className="admin-sidebar-foot">
      <div className="admin-wallet-widget">
        <div className="admin-wallet-widget-main">
          <span className="admin-wallet-dot" aria-hidden />
          <div className="admin-wallet-widget-copy">
            <span className="admin-wallet-widget-label">{ADMIN_COPY.auth.sidebarConnected}</span>
            <span className="admin-num admin-wallet-widget-addr">
              {address ? shortAddress(address, true) : "—"}
            </span>
          </div>
        </div>
        <span className="admin-wallet-network">{pumpChain.name}</span>
      </div>
    </div>
  );

  return (
    <div className="admin-layout admin-layout--enterprise">
      <aside className="admin-sidebar admin-sidebar--desktop" aria-label="Console navigation">
        {sidebarBrand}
        <AdminSidebarNav activeTab={activeTab} onTabChange={onTabChange} />
        {sidebarFoot}
      </aside>

      <div
        className={
          mobileOpen ? "admin-mobile-drawer admin-mobile-drawer--open" : "admin-mobile-drawer"
        }
      >
        <button
          type="button"
          className="admin-mobile-drawer-scrim"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        />
        <div className="admin-mobile-drawer-panel">
          <div className="admin-mobile-drawer-head">
            {sidebarBrand}
            <button
              type="button"
              className="admin-mobile-menu-btn"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
            >
              <PumpIcon icon={faXmark} className="h-4 w-4" />
            </button>
          </div>
          <AdminSidebarNav
            activeTab={activeTab}
            onTabChange={onTabChange}
            onNavigate={() => setMobileOpen(false)}
          />
          {sidebarFoot}
        </div>
      </div>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-start">
            <button
              type="button"
              className="admin-mobile-menu-btn"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <PumpIcon icon={faMenu} className="h-4 w-4" />
            </button>
            <div className="admin-topbar-titles">
              <div className="admin-breadcrumb" aria-label="Breadcrumb">
                <span className="admin-breadcrumb-root">{group.label}</span>
                <PumpIcon icon={faChevronRight} className="admin-breadcrumb-sep h-3 w-3" />
                <span className="admin-breadcrumb-current">{page.title}</span>
              </div>
              <h1 className="admin-topbar-title">{page.title}</h1>
              {page.description ? <p className="admin-topbar-desc">{page.description}</p> : null}
            </div>
          </div>

          <div className="admin-topbar-actions">
            <label className="admin-ent-global-search">
              <PumpIcon icon={faSearch} className="h-3.5 w-3.5" />
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

            {onRefreshAll ? (
              <button
                type="button"
                onClick={onRefreshAll}
                disabled={refreshing}
                className={
                  refreshing ? "admin-btn admin-btn-sm admin-btn-loading" : "admin-btn admin-btn-sm"
                }
              >
                <PumpIcon
                  icon={faRefreshCw}
                  className={`h-3.5 w-3.5 ${refreshing ? "admin-spin" : ""}`}
                />
                {refreshing ? ADMIN_COPY.actions.refreshing : ADMIN_COPY.actions.refresh}
              </button>
            ) : null}

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
                <PumpIcon icon={faChevronRight} className="h-3 w-3 admin-ent-user-chevron" />
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
                  <span className="admin-ent-user-menu-meta">
                    {pumpChain.name} · chain {pumpChain.id}
                  </span>
                  {onSignOut ? (
                    <button
                      type="button"
                      className="admin-ent-user-menu-item admin-ent-user-menu-item--danger"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onSignOut();
                      }}
                    >
                      {ADMIN_COPY.actions.signOut}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="admin-content">
          <div className="admin-content-inner">{children}</div>
        </main>
      </div>
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
  padded,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <AdminCard title={title} description={description} actions={actions} padded={padded}>
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
      <AdminIconButton icon={faPencil} onClick={onEdit} label={editLabel} />
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
  icon?: PumpIconDefinition;
}) {
  const classes = ["admin-btn"];
  if (primary) classes.push("admin-btn-primary");
  if (danger) classes.push("admin-btn-danger");
  if (ghost) classes.push("admin-btn-ghost");
  if (size === "sm") classes.push("admin-btn-sm");

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={classes.join(" ")}
    >
      {icon ? <PumpIcon icon={icon} className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}

export function AdminIconButton({
  icon,
  onClick,
  disabled,
  label,
}: {
  icon: PumpIconDefinition;
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
      <PumpIcon icon={icon} className="h-4 w-4" />
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

/** @deprecated Legacy horizontal tabs — use AdminLayout sidebar. */
export function AdminTabs({
  active,
  onChange,
}: {
  active: AdminTabId;
  onChange: (tab: AdminTabId) => void;
}) {
  const items = NAV_GROUPS.flatMap((g) => g.items);
  return (
    <nav className="admin-tabs" aria-label="Admin sections">
      {items.map((tab) => (
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
