"use client";

import { Check, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/admin-api-client";
import { ADMIN_COPY } from "@/lib/admin/copy";
import type { AdminTodo, AdminTodoPriority, AdminTodoSortMode } from "@/lib/db/admin-todos";
import { AdminAlert, AdminBtn } from "@/components/admin/AdminChrome";
import { ModalPortal } from "@/components/ui/ModalPortal";

type TodoFilter = "all" | "open" | "done";

const PRIORITY_OPTIONS: { value: AdminTodoPriority; label: string; short: string }[] = [
  { value: "urgent", label: "Urgent", short: "URG" },
  { value: "high", label: "High", short: "HI" },
  { value: "medium", label: "Medium", short: "MED" },
  { value: "low", label: "Low", short: "LOW" },
];

function priorityShort(priority: AdminTodoPriority): string {
  return PRIORITY_OPTIONS.find((o) => o.value === priority)?.short ?? priority.toUpperCase();
}

function priorityClass(priority: AdminTodoPriority): string {
  return `admin-todo-pri admin-todo-pri--${priority}`;
}

function reorderList<T extends { id: string }>(list: T[], fromId: string, toId: string): T[] {
  const from = list.findIndex((item) => item.id === fromId);
  const to = list.findIndex((item) => item.id === toId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

function formatTodoWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function AdminTodoDetailModal({
  todo,
  busy,
  onClose,
  onEdit,
  onToggleComplete,
  onDelete,
}: {
  todo: AdminTodo;
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onToggleComplete: () => void;
  onDelete: () => void;
}) {
  return (
    <ModalPortal open>
      <div className="modal-backdrop modal-backdrop-shell z-50" role="dialog" aria-modal="true">
        <button
          type="button"
          className="absolute inset-0 cursor-default border-0 bg-transparent p-0"
          aria-label={ADMIN_COPY.actions.close}
          onClick={onClose}
        />
        <div className="admin-page admin-modal admin-todo-modal relative z-10">
          <div className="admin-modal-head">
            <div className="admin-todo-modal-head">
              <span className={priorityClass(todo.priority)}>{priorityShort(todo.priority)}</span>
              <h2 className="admin-todo-modal-title">{todo.title}</h2>
            </div>
            <button type="button" className="admin-icon-btn" aria-label={ADMIN_COPY.actions.close} onClick={onClose}>
              <X size={16} />
            </button>
          </div>
          <div className="admin-modal-body admin-todo-modal-body">
            <div className="admin-todo-modal-meta">
              <span>
                {todo.isCompleted ? "Done" : "Open"}
                {todo.completedAt ? ` · ${formatTodoWhen(todo.completedAt)}` : ""}
              </span>
              <span className="admin-meta">
                Updated {formatTodoWhen(todo.updatedAt)}
                {todo.createdAt !== todo.updatedAt ? ` · Created ${formatTodoWhen(todo.createdAt)}` : ""}
              </span>
            </div>
            {todo.body ? (
              <div className="admin-todo-modal-notes">{todo.body}</div>
            ) : (
              <p className="admin-todo-modal-empty">—</p>
            )}
          </div>
          <div className="admin-todo-modal-foot">
            <AdminBtn onClick={onToggleComplete} disabled={busy}>
              {todo.isCompleted ? ADMIN_COPY.todos.filters.open : ADMIN_COPY.todos.filters.done}
            </AdminBtn>
            <AdminBtn onClick={onEdit} disabled={busy}>
              {ADMIN_COPY.todos.edit}
            </AdminBtn>
            <AdminBtn danger onClick={onDelete} disabled={busy}>
              {ADMIN_COPY.actions.delete}
            </AdminBtn>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export function AdminTodosTab() {
  const [todos, setTodos] = useState<AdminTodo[]>([]);
  const [sortMode, setSortMode] = useState<AdminTodoSortMode>("priority");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TodoFilter>("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<AdminTodoPriority>("medium");
  const [creating, setCreating] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editPriority, setEditPriority] = useState<AdminTodoPriority>("medium");
  const [viewingId, setViewingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/todos", { cache: "no-store" });
      const json = (await res.json()) as {
        data?: { todos: AdminTodo[]; sortMode: AdminTodoSortMode };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load todos");
      setTodos(json.data?.todos ?? []);
      setSortMode(json.data?.sortMode ?? "priority");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load todos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleTodos = useMemo(() => {
    if (filter === "open") return todos.filter((t) => !t.isCompleted);
    if (filter === "done") return todos.filter((t) => t.isCompleted);
    return todos;
  }, [filter, todos]);

  const openCount = todos.filter((t) => !t.isCompleted).length;
  const doneCount = todos.filter((t) => t.isCompleted).length;
  const viewingTodo = viewingId ? (todos.find((t) => t.id === viewingId) ?? null) : null;

  async function persistOrder(orderedVisible: AdminTodo[]) {
    const orderedIds = orderedVisible.map((t) => t.id);
    const rest = todos.filter((t) => !orderedIds.includes(t.id)).map((t) => t.id);
    const fullOrder = [...orderedIds, ...rest];

    const res = await adminFetch("/api/admin/todos/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: fullOrder }),
    });
    const json = (await res.json()) as {
      data?: { todos: AdminTodo[]; sortMode: AdminTodoSortMode };
      error?: string;
    };
    if (!res.ok) throw new Error(json.error ?? "Failed to reorder");
    setTodos(json.data?.todos ?? []);
    setSortMode(json.data?.sortMode ?? "manual");
  }

  async function setSortModeRemote(mode: AdminTodoSortMode) {
    setBusyId("__sort__");
    setError(null);
    try {
      const res = await adminFetch("/api/admin/todos/sort-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const json = (await res.json()) as {
        data?: { todos: AdminTodo[]; sortMode: AdminTodoSortMode };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to update sort mode");
      setTodos(json.data?.todos ?? []);
      setSortMode(json.data?.sortMode ?? mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update sort mode");
    } finally {
      setBusyId(null);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setCreating(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), priority: newPriority }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to create todo");
      setNewTitle("");
      setNewPriority("medium");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create todo");
    } finally {
      setCreating(false);
    }
  }

  async function patchTodo(id: string, patch: Partial<AdminTodo>) {
    setBusyId(id);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: patch.title,
          body: patch.body,
          priority: patch.priority,
          isCompleted: patch.isCompleted,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to update todo");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update todo");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm(ADMIN_COPY.todos.deleteConfirm)) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/todos/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to delete todo");
      if (editingId === id) setEditingId(null);
      if (viewingId === id) setViewingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete todo");
    } finally {
      setBusyId(null);
    }
  }

  function openView(todo: AdminTodo) {
    setViewingId(todo.id);
  }

  function startEdit(todo: AdminTodo) {
    setViewingId(null);
    setEditingId(todo.id);
    setEditTitle(todo.title);
    setEditBody(todo.body ?? "");
    setEditPriority(todo.priority);
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) return;
    await patchTodo(id, {
      title: editTitle.trim(),
      body: editBody.trim() || null,
      priority: editPriority,
    });
    setEditingId(null);
  }

  async function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = reorderList(visibleTodos, dragId, targetId);
    setTodos((prev) => {
      const ids = new Set(next.map((t) => t.id));
      const rest = prev.filter((t) => !ids.has(t.id));
      return [...next, ...rest];
    });
    setDragId(null);
    setDragOverId(null);
    setBusyId(dragId);
    try {
      await persistOrder(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
    <div className="admin-todos-shell">
        <div className="admin-todos-shell-bar">
          <div className="admin-todos-filters" role="tablist" aria-label="Todo filters">
            {(
              [
                ["open", `${ADMIN_COPY.todos.filters.open} ${openCount}`],
                ["done", `${ADMIN_COPY.todos.filters.done} ${doneCount}`],
                ["all", ADMIN_COPY.todos.filters.all],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                className={
                  filter === key ? "admin-todos-filter admin-todos-filter--active" : "admin-todos-filter"
                }
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="admin-todos-sort-toggle" role="group" aria-label="Sort mode">
            <button
              type="button"
              className={
                sortMode === "priority"
                  ? "admin-todos-sort-btn admin-todos-sort-btn--active"
                  : "admin-todos-sort-btn"
              }
              disabled={busyId === "__sort__"}
              onClick={() => void setSortModeRemote("priority")}
              title={ADMIN_COPY.todos.sortPriorityHint}
            >
              {ADMIN_COPY.todos.sortPriority}
            </button>
            <button
              type="button"
              className={
                sortMode === "manual"
                  ? "admin-todos-sort-btn admin-todos-sort-btn--active"
                  : "admin-todos-sort-btn"
              }
              disabled={busyId === "__sort__"}
              onClick={() => void setSortModeRemote("manual")}
            >
              {ADMIN_COPY.todos.sortManual}
            </button>
          </div>

          <AdminBtn onClick={() => void load()} disabled={loading}>
            {loading ? ADMIN_COPY.actions.refreshing : ADMIN_COPY.actions.refresh}
          </AdminBtn>
        </div>

        <form className="admin-todos-prompt" onSubmit={(e) => void onCreate(e)}>
          <span className="admin-todos-prompt-prefix" aria-hidden>
            +
          </span>
          <input
            className="admin-todos-prompt-input"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={ADMIN_COPY.todos.placeholders.title}
            maxLength={200}
          />
          <select
            className="admin-todos-prompt-pri"
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as AdminTodoPriority)}
            aria-label={ADMIN_COPY.todos.fields.priority}
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.short}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="admin-todos-prompt-add"
            disabled={creating || !newTitle.trim()}
          >
            <Plus size={13} aria-hidden />
            {creating ? "…" : ADMIN_COPY.todos.add}
          </button>
        </form>

        {error ? <AdminAlert>{error}</AdminAlert> : null}

        {loading && todos.length === 0 ? (
          <p className="admin-todos-shell-empty">{ADMIN_COPY.todos.loading}</p>
        ) : visibleTodos.length === 0 ? (
          <p className="admin-todos-shell-empty">{ADMIN_COPY.todos.empty}</p>
        ) : (
          <ul className="admin-todos-shell-list" role="list">
            {visibleTodos.map((todo) => {
              const editing = editingId === todo.id;
              const busy = busyId === todo.id;
              const dragging = dragId === todo.id;
              const over = dragOverId === todo.id && dragId !== todo.id;

              if (editing) {
                return (
                  <li key={todo.id} className="admin-todo-row admin-todo-row--edit">
                    <input
                      className="admin-todos-prompt-input"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      maxLength={200}
                      autoFocus
                    />
                    <textarea
                      className="admin-todo-edit-notes"
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      placeholder={ADMIN_COPY.todos.placeholders.notes}
                      rows={2}
                    />
                    <div className="admin-todo-edit-bar">
                      <select
                        className="admin-todos-prompt-pri"
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value as AdminTodoPriority)}
                      >
                        {PRIORITY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="admin-todos-row-btn"
                        disabled={busy || !editTitle.trim()}
                        onClick={() => void saveEdit(todo.id)}
                      >
                        <Check size={13} aria-hidden />
                        {ADMIN_COPY.todos.save}
                      </button>
                      <button
                        type="button"
                        className="admin-todos-row-btn"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                      >
                        <X size={13} aria-hidden />
                        {ADMIN_COPY.actions.close}
                      </button>
                    </div>
                  </li>
                );
              }

              return (
                <li
                  key={todo.id}
                  className={`admin-todo-row${todo.isCompleted ? " admin-todo-row--done" : ""}${dragging ? " admin-todo-row--drag" : ""}${over ? " admin-todo-row--over" : ""}`}
                  draggable={!busy}
                  onDragStart={(e) => {
                    setDragId(todo.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOverId(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragId && dragId !== todo.id) setDragOverId(todo.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverId === todo.id) setDragOverId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    void onDrop(todo.id);
                  }}
                >
                  <button
                    type="button"
                    className="admin-todo-grip"
                    aria-label={ADMIN_COPY.todos.drag}
                    tabIndex={-1}
                  >
                    <GripVertical size={14} aria-hidden />
                  </button>

                  <label className="admin-todo-check admin-todo-check--compact">
                    <input
                      type="checkbox"
                      checked={todo.isCompleted}
                      disabled={busy}
                      onChange={(e) => void patchTodo(todo.id, { isCompleted: e.target.checked })}
                    />
                    <span className="admin-todo-check-box" aria-hidden />
                  </label>

                  <span className={priorityClass(todo.priority)} title={todo.priority}>
                    {priorityShort(todo.priority)}
                  </span>

                  <button
                    type="button"
                    className="admin-todo-line admin-todo-line--open"
                    onClick={() => openView(todo)}
                  >
                    <span className="admin-todo-line-title">{todo.title}</span>
                    {todo.body ? (
                      <span className="admin-todo-line-note">{todo.body}</span>
                    ) : null}
                  </button>

                  <div className="admin-todo-row-actions">
                    <button
                      type="button"
                      className="admin-todos-row-btn admin-todos-row-btn--icon"
                      disabled={busy}
                      aria-label={ADMIN_COPY.todos.edit}
                      onClick={() => startEdit(todo)}
                    >
                      <Pencil size={13} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="admin-todos-row-btn admin-todos-row-btn--icon admin-todos-row-btn--danger"
                      disabled={busy}
                      aria-label={ADMIN_COPY.actions.delete}
                      onClick={() => void onDelete(todo.id)}
                    >
                      <Trash2 size={13} aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {viewingTodo ? (
        <AdminTodoDetailModal
          todo={viewingTodo}
          busy={busyId === viewingTodo.id}
          onClose={() => setViewingId(null)}
          onEdit={() => startEdit(viewingTodo)}
          onToggleComplete={() =>
            void patchTodo(viewingTodo.id, { isCompleted: !viewingTodo.isCompleted })
          }
          onDelete={() => void onDelete(viewingTodo.id)}
        />
      ) : null}
    </>
  );
}
