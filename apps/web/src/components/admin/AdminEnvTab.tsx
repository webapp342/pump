"use client";

import {
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Trash2,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/admin-api-client";
import { isSensitiveEnvKey } from "@/lib/admin/env-parse";
import { ADMIN_COPY } from "@/lib/admin/copy";
import {
  AdminAlert,
  AdminBlock,
  AdminBtn,
  AdminCallout,
  AdminEmptyState,
  AdminStatusBadge,
  AdminTextButton,
} from "@/components/admin/AdminChrome";

type EnvFileMeta = {
  id: string;
  label: string;
  description: string;
  service: string;
  reloadHint: string;
  path: string;
  exists: boolean;
  sizeBytes: number | null;
  modifiedAt: string | null;
};

type EnvVariable = {
  key: string;
  value: string;
  sensitive: boolean;
  scope: "client" | "server";
};

type EnvFilter = "all" | "client" | "server" | "sensitive";

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function variablesEqual(a: EnvVariable[], b: EnvVariable[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x.key.localeCompare(y.key));
  const sortedB = [...b].sort((x, y) => x.key.localeCompare(y.key));
  return sortedA.every((row, i) => row.key === sortedB[i].key && row.value === sortedB[i].value);
}

function maskValue(value: string): string {
  if (!value) return "—";
  return ADMIN_COPY.environment.masked;
}

export function AdminEnvTab() {
  const [files, setFiles] = useState<EnvFileMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [meta, setMeta] = useState<EnvFileMeta | null>(null);
  const [variables, setVariables] = useState<EnvVariable[]>([]);
  const [baseline, setBaseline] = useState<EnvVariable[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingApply, setPendingApply] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EnvFilter>("all");
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [addKey, setAddKey] = useState("");
  const [addValue, setAddValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const dirty = !variablesEqual(variables, baseline);

  const loadList = useCallback(async () => {
    setError(null);
    try {
      const res = await adminFetch("/api/admin/env-files", { cache: "no-store" });
      const json = (await res.json()) as { data?: EnvFileMeta[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load services");
      const list = json.data ?? [];
      setFiles(list);
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load services");
    }
  }, []);

  const loadVariables = useCallback(
    async (id: string) => {
      setError(null);
      setNotice(null);
      setLoading(true);
      setEditingKey(null);
      setRevealed(new Set());
      try {
        const res = await adminFetch(`/api/admin/env-files/${id}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          data?: EnvFileMeta & { variables: EnvVariable[] };
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Failed to load variables");
        const data = json.data;
        if (!data) throw new Error("Failed to load variables");
        const rows = data.variables ?? [];
        setMeta(data);
        setVariables(rows);
        setBaseline(rows);
        setPendingApply(false);
      } catch (err) {
        setMeta(null);
        setVariables([]);
        setBaseline([]);
        setError(err instanceof Error ? err.message : "Failed to load variables");
      } finally {
        setLoading(false);
      }
    },
    [selectedId]
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadVariables(selectedId);
  }, [selectedId, loadVariables]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return variables.filter((row) => {
      if (filter === "client" && row.scope !== "client") return false;
      if (filter === "server" && row.scope !== "server") return false;
      if (filter === "sensitive" && !row.sensitive) return false;
      if (q && !row.key.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [variables, search, filter]);

  function selectService(id: string) {
    if (id === selectedId) return;
    if (dirty && !window.confirm(ADMIN_COPY.environment.unsaved)) return;
    setSelectedId(id);
    setSearch("");
    setFilter("all");
    setAddKey("");
    setAddValue("");
    setAddError(null);
  }

  function toggleReveal(key: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function startEdit(row: EnvVariable) {
    setEditingKey(row.key);
    setEditValue(row.value);
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditValue("");
  }

  function commitEdit(key: string) {
    setVariables((prev) =>
      prev.map((row) => (row.key === key ? { ...row, value: editValue } : row))
    );
    setEditingKey(null);
    setEditValue("");
  }

  function removeVariable(key: string) {
    if (!window.confirm(ADMIN_COPY.environment.deleteConfirm)) return;
    setVariables((prev) => prev.filter((row) => row.key !== key));
    if (editingKey === key) cancelEdit();
  }

  function onAddVariable() {
    const key = addKey.trim();
    setAddError(null);
    if (!KEY_PATTERN.test(key)) {
      setAddError(ADMIN_COPY.environment.addErrorKey);
      return;
    }
    if (variables.some((row) => row.key === key)) {
      setAddError(ADMIN_COPY.environment.addErrorDuplicate);
      return;
    }
    const row: EnvVariable = {
      key,
      value: addValue,
      sensitive: isSensitiveEnvKey(key),
      scope: key.startsWith("NEXT_PUBLIC_") ? "client" : "server",
    };
    setVariables((prev) => [...prev, row].sort((a, b) => a.key.localeCompare(b.key)));
    setAddKey("");
    setAddValue("");
  }

  function discardChanges() {
    setVariables(baseline);
    setEditingKey(null);
    setAddError(null);
  }

  async function onSave() {
    if (!selectedId || !dirty) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await adminFetch(`/api/admin/env-files/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables }),
      });
      const json = (await res.json()) as {
        data?: { variables: EnvVariable[]; backupPath: string | null; needsReload?: boolean };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      const saved = json.data?.variables ?? variables;
      setVariables(saved);
      setBaseline(saved);
      setPendingApply(true);
      setNotice(ADMIN_COPY.environment.savedToDisk);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onApply() {
    if (!selectedId) return;
    setApplying(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/env-files/${selectedId}/reload`, {
        method: "POST",
      });
      const json = (await res.json()) as { data?: { message: string }; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Apply failed");
      setPendingApply(false);
      setNotice(json.data?.message ?? ADMIN_COPY.environment.applied);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  }

  const selectedMeta = meta ?? files.find((f) => f.id === selectedId) ?? null;

  return (
    <div className="admin-env-studio">
      {error ? <AdminAlert>{error}</AdminAlert> : null}
      {notice && !pendingApply ? <AdminCallout tone="info">{notice}</AdminCallout> : null}

      {ADMIN_COPY.environment.callout ? (
        <AdminCallout tone="info">{ADMIN_COPY.environment.callout}</AdminCallout>
      ) : null}

      {pendingApply ? (
        <div className="admin-env-apply-banner" role="status">
          <div className="admin-env-apply-banner-text">
            <strong>{ADMIN_COPY.environment.applyTitle}</strong>
            <p>{ADMIN_COPY.environment.applyBody}</p>
          </div>
          <AdminBtn primary onClick={() => void onApply()} disabled={applying || dirty}>
            <Zap size={14} aria-hidden />
            {applying ? ADMIN_COPY.environment.applying : ADMIN_COPY.environment.applyButton}
          </AdminBtn>
        </div>
      ) : null}

      <div className="admin-env-service-tabs" role="tablist" aria-label={ADMIN_COPY.environment.servicesTitle}>
        {files.map((file) => (
          <button
            key={file.id}
            type="button"
            role="tab"
            aria-selected={selectedId === file.id}
            className={
              selectedId === file.id ? "admin-env-service-tab admin-env-service-tab--active" : "admin-env-service-tab"
            }
            onClick={() => selectService(file.id)}
          >
            <span className="admin-env-service-tab-label">{file.label}</span>
            <span className="admin-meta">{file.service}</span>
          </button>
        ))}
      </div>

      {selectedMeta ? (
        <AdminBlock
          title={
            variables.length > 0
              ? `${ADMIN_COPY.environment.variablesTitle} (${variables.length})`
              : ADMIN_COPY.environment.variablesTitle
          }
          actions={
            <div className="admin-env-toolbar-actions">
              {dirty ? (
                <>
                  <AdminTextButton onClick={discardChanges} disabled={saving}>
                    {ADMIN_COPY.environment.discard}
                  </AdminTextButton>
                  <AdminBtn primary onClick={() => void onSave()} disabled={saving}>
                    {saving ? ADMIN_COPY.environment.saving : ADMIN_COPY.environment.saveChanges}
                  </AdminBtn>
                </>
              ) : (
                <AdminTextButton onClick={() => selectedId && void loadVariables(selectedId)} disabled={loading}>
                  <RotateCw size={14} aria-hidden />
                  {ADMIN_COPY.actions.refresh}
                </AdminTextButton>
              )}
            </div>
          }
        >
          <div className="admin-env-add-card">
            <p className="admin-env-add-title">{ADMIN_COPY.environment.addTitle}</p>
            <div className="admin-env-add-form">
              <input
                className="admin-input admin-num"
                placeholder={ADMIN_COPY.environment.addKeyPlaceholder}
                value={addKey}
                onChange={(e) => setAddKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
                spellCheck={false}
                aria-label="Variable name"
              />
              <input
                className="admin-input"
                placeholder={ADMIN_COPY.environment.addValuePlaceholder}
                value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
                spellCheck={false}
                aria-label="Variable value"
              />
              <AdminBtn onClick={onAddVariable}>
                <Plus size={14} aria-hidden />
                {ADMIN_COPY.environment.addButton}
              </AdminBtn>
            </div>
            {addError ? <p className="admin-note admin-status-bad">{addError}</p> : null}
          </div>

          <div className="admin-env-filters">
            <label className="admin-env-search">
              <Search size={15} aria-hidden />
              <input
                className="admin-input"
                placeholder={ADMIN_COPY.environment.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={ADMIN_COPY.environment.searchPlaceholder}
              />
            </label>
            <div className="admin-env-filter-chips" role="group" aria-label="Filter variables">
              {(
                [
                  ["all", ADMIN_COPY.environment.filterAll],
                  ["client", ADMIN_COPY.environment.filterClient],
                  ["server", ADMIN_COPY.environment.filterServer],
                  ["sensitive", ADMIN_COPY.environment.filterSensitive],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={filter === id ? "admin-env-chip admin-env-chip--active" : "admin-env-chip"}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="admin-empty">{ADMIN_COPY.empty.loading}</p>
          ) : filtered.length === 0 ? (
            <AdminEmptyState
              title={variables.length === 0 ? ADMIN_COPY.environment.empty : ADMIN_COPY.environment.emptySearch}
            />
          ) : (
            <div className="admin-env-table-wrap">
              <table className="admin-env-table">
                <thead>
                  <tr>
                    <th>{ADMIN_COPY.environment.colName}</th>
                    <th>{ADMIN_COPY.environment.colValue}</th>
                    <th>{ADMIN_COPY.environment.colScope}</th>
                    <th className="admin-env-table-actions-col">{ADMIN_COPY.environment.colActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const isEditing = editingKey === row.key;
                    const isRevealed = revealed.has(row.key) || !row.sensitive;
                    return (
                      <tr key={row.key} className={isEditing ? "admin-env-row--editing" : undefined}>
                        <td>
                          <code className="admin-env-key admin-num">{row.key}</code>
                          {row.sensitive ? (
                            <AdminStatusBadge tone="warn">{ADMIN_COPY.environment.sensitiveBadge}</AdminStatusBadge>
                          ) : null}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              className="admin-input admin-num"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              autoFocus
                              spellCheck={false}
                              aria-label={`Value for ${row.key}`}
                            />
                          ) : (
                            <span className="admin-env-value admin-num">
                              {isRevealed ? row.value || "—" : maskValue(row.value)}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="admin-pill">
                            {row.scope === "client"
                              ? ADMIN_COPY.environment.scopeClient
                              : ADMIN_COPY.environment.scopeServer}
                          </span>
                        </td>
                        <td>
                          <div className="admin-env-row-actions">
                            {isEditing ? (
                              <>
                                <AdminTextButton onClick={() => commitEdit(row.key)}>
                                  {ADMIN_COPY.actions.update}
                                </AdminTextButton>
                                <AdminTextButton onClick={cancelEdit}>{ADMIN_COPY.actions.close}</AdminTextButton>
                              </>
                            ) : (
                              <>
                                {row.sensitive ? (
                                  <button
                                    type="button"
                                    className="admin-env-icon-btn"
                                    onClick={() => toggleReveal(row.key)}
                                    title={isRevealed ? ADMIN_COPY.environment.hide : ADMIN_COPY.environment.reveal}
                                    aria-label={isRevealed ? ADMIN_COPY.environment.hide : ADMIN_COPY.environment.reveal}
                                  >
                                    {isRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="admin-env-icon-btn"
                                  onClick={() => startEdit(row)}
                                  title={ADMIN_COPY.environment.edit}
                                  aria-label={ADMIN_COPY.environment.edit}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="admin-env-icon-btn admin-env-icon-btn--danger"
                                  onClick={() => removeVariable(row.key)}
                                  title={ADMIN_COPY.environment.delete}
                                  aria-label={ADMIN_COPY.environment.delete}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="admin-note admin-num">{selectedMeta.path}</p>
          {dirty ? <p className="admin-note admin-status-warn">{ADMIN_COPY.environment.unsaved}</p> : null}
        </AdminBlock>
      ) : (
        <AdminEmptyState title={ADMIN_COPY.environment.selectFile} />
      )}
    </div>
  );
}
