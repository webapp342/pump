"use client";

import {
  type ReactNode,
  useMemo,
  useState,
} from "react";
import { PumpIcon, faChevronDown, faChevronUp, faSearch } from "@/lib/icons";

export type AdminTableColumn<T> = {
  id: string;
  header: string;
  align?: "left" | "right" | "center";
  width?: string;
  minWidth?: string;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  cell: (row: T) => ReactNode;
  /** Extra class on th/td (e.g. admin-table-col--action) */
  className?: string;
};

type AdminEnterpriseTableProps<T> = {
  title?: string;
  subtitle?: string;
  rows: T[];
  columns: AdminTableColumn<T>[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
  searchFilter?: (row: T, query: string) => boolean;
  toolbar?: ReactNode;
  footer?: ReactNode;
  pageSize?: number;
  zebra?: boolean;
};

function defaultSort<T>(a: T, b: T, col: AdminTableColumn<T>, dir: "asc" | "desc"): number {
  const av = col.sortValue?.(a) ?? "";
  const bv = col.sortValue?.(b) ?? "";
  if (av === bv) return 0;
  if (av < bv) return dir === "asc" ? -1 : 1;
  return dir === "asc" ? 1 : -1;
}

export function AdminEnterpriseTable<T>({
  title,
  subtitle,
  rows,
  columns,
  rowKey,
  loading,
  emptyMessage = "No records",
  searchPlaceholder = "Search…",
  searchQuery: controlledQuery,
  onSearchQueryChange,
  searchFilter,
  toolbar,
  footer,
  pageSize = 25,
  zebra = true,
}: AdminEnterpriseTableProps<T>) {
  const [internalQuery, setInternalQuery] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const query = controlledQuery ?? internalQuery;
  const setQuery = onSearchQueryChange ?? setInternalQuery;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !searchFilter) return rows;
    return rows.filter((row) => searchFilter(row, q));
  }, [query, rows, searchFilter]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    const col = columns.find((c) => c.id === sortCol);
    if (!col?.sortable) return filtered;
    return [...filtered].sort((a, b) => defaultSort(a, b, col, sortDir));
  }, [columns, filtered, sortCol, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function toggleSort(id: string) {
    if (sortCol === id) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortCol(id);
    setSortDir("asc");
  }

  const showHead = Boolean(title || subtitle || toolbar || searchFilter);

  return (
    <section className="admin-ent-table">
      {showHead ? (
        <div
          className={
            subtitle
              ? "admin-ent-table-head"
              : "admin-ent-table-head admin-ent-table-head--compact"
          }
        >
          {title || subtitle ? (
            <div className="admin-ent-table-head-text">
              {title ? <h2 className="admin-ent-table-title">{title}</h2> : null}
              {subtitle ? <p className="admin-ent-table-sub">{subtitle}</p> : null}
            </div>
          ) : (
            <span aria-hidden />
          )}
          <div className="admin-ent-table-toolbar">
            {searchFilter ? (
              <label className="admin-ent-search">
                <PumpIcon icon={faSearch} className="h-3.5 w-3.5" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                  placeholder={searchPlaceholder}
                  className="admin-ent-search-input"
                  aria-label="Search table"
                />
              </label>
            ) : null}
            {toolbar}
          </div>
        </div>
      ) : null}

      <div className="admin-ent-table-scroll">
        <table className={`admin-ent-data-grid${zebra ? " admin-ent-data-grid--zebra" : ""}`}>
          <thead>
            <tr>
              {columns.map((col) => {
                const alignClass =
                  col.align === "right"
                    ? "admin-ent-align-right"
                    : col.align === "center"
                      ? "admin-ent-align-center"
                      : undefined;
                const thClass = [alignClass, col.className].filter(Boolean).join(" ") || undefined;
                return (
                <th
                  key={col.id}
                  className={thClass}
                  style={{
                    ...(col.width ? { width: col.width } : {}),
                    ...(col.minWidth ? { minWidth: col.minWidth } : {}),
                  }}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      className="admin-ent-sort-btn"
                      onClick={() => toggleSort(col.id)}
                    >
                      <span>{col.header}</span>
                      {sortCol === col.id ? (
                        sortDir === "asc" ? (
                          <PumpIcon icon={faChevronUp} className="h-3 w-3" />
                        ) : (
                          <PumpIcon icon={faChevronDown} className="h-3 w-3" />
                        )
                      ) : (
                        <PumpIcon icon={faChevronDown} className="h-3 w-3 admin-ent-sort-idle" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="admin-ent-empty">
                  Loading…
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="admin-ent-empty">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((col) => {
                    const alignClass =
                      col.align === "right"
                        ? "admin-ent-align-right admin-num"
                        : col.align === "center"
                          ? "admin-ent-align-center"
                          : undefined;
                    const tdClass = [alignClass, col.className].filter(Boolean).join(" ") || undefined;
                    return (
                    <td key={col.id} className={tdClass}>
                      {col.cell(row)}
                    </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-ent-table-foot">
        <span className="admin-ent-table-meta">
          {sorted.length} record{sorted.length === 1 ? "" : "s"}
          {query ? ` · filtered` : ""}
        </span>
        <div className="admin-ent-pagination">
          <button
            type="button"
            className="admin-btn admin-btn-sm"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </button>
          <span className="admin-ent-page-label">
            Page {safePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="admin-btn admin-btn-sm"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next
          </button>
        </div>
        {footer}
      </div>
    </section>
  );
}
