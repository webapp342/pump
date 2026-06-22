"use client";

import { Check, ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/admin-api-client";
import { ADMIN_COPY } from "@/lib/admin/copy";
import type { AdminTodo, AdminTodoPriority } from "@/lib/db/admin-todos";
import {
  AdminAlert,
  AdminBlock,
  AdminBtn,
  AdminEmptyState,
  AdminField,
  AdminIconButton,
  AdminStatusBadge,
} from "@/components/admin/AdminChrome";

type TodoFilter = "all" | "open" | "done";

const PRIORITY_OPTIONS: { value: AdminTodoPriority; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

function priorityTone(priority: AdminTodoPriority): "bad" | "warn" | "neutral" | "ok" {
  switch (priority) {
    case "urgent":
      return "bad";
    case "high":
      return "warn";
    case "low":
      return "ok";
    default:
      return "neutral";
  }
}

function priorityLabel(priority: AdminTodoPriority): string {
  return PRIORITY_OPTIONS.find((o) => o.value === priority)?.label ?? priority;
}

export function AdminTodosTab() {
  const [todos, setTodos] = useState<AdminTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TodoFilter>("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newPriority, setNewPriority] = useState<AdminTodoPriority>("medium");
  const [creating, setCreating] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editPriority, setEditPriority] = useState<AdminTodoPriority>("medium");

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/todos", { cache: "no-store" });
      const json = (await res.json()) as { data?: { todos: AdminTodo[] }; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load todos");
      setTodos(json.data?.todos ?? []);
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

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setCreating(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          body: newBody.trim() || null,
          priority: newPriority,
        }),
      });
      const json = (await res.json()) as { data?: { todo: AdminTodo }; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to create todo");
      setNewTitle("");
      setNewBody("");
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
      const json = (await res.json()) as { data?: { todo: AdminTodo }; error?: string };
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete todo");
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(todo: AdminTodo) {
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

  async function moveTodo(id: string, direction: "up" | "down") {
    const list = [...visibleTodos];
    const index = list.findIndex((t) => t.id === id);
    if (index < 0) return;

    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= list.length) return;

    const reordered = [...list];
    const current = reordered[index]!;
    const swap = reordered[swapIndex]!;
    reordered[index] = swap;
    reordered[swapIndex] = current;

    const orderedIds = reordered.map((t) => t.id);
    const rest = todos.filter((t) => !orderedIds.includes(t.id)).map((t) => t.id);
    const fullOrder = [...orderedIds, ...rest];

    setBusyId(id);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/todos/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: fullOrder }),
      });
      const json = (await res.json()) as { data?: { todos: AdminTodo[] }; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to reorder");
      setTodos(json.data?.todos ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="admin-todos">
      <AdminBlock
        title={ADMIN_COPY.pages.todos.title}
        description={ADMIN_COPY.pages.todos.description}
      >
        <form className="admin-todos-compose" onSubmit={(e) => void onCreate(e)}>
          <div className="admin-todos-compose-row">
            <AdminField label={ADMIN_COPY.todos.fields.title}>
              <input
                className="admin-input"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={ADMIN_COPY.todos.placeholders.title}
                maxLength={200}
              />
            </AdminField>
            <AdminField label={ADMIN_COPY.todos.fields.priority}>
              <select
                className="admin-input"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as AdminTodoPriority)}
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </AdminField>
          </div>
          <AdminField label={ADMIN_COPY.todos.fields.notes}>
            <textarea
              className="admin-input admin-todos-notes"
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder={ADMIN_COPY.todos.placeholders.notes}
              rows={2}
            />
          </AdminField>
          <div className="admin-todos-compose-actions">
            <button type="submit" className="admin-btn" disabled={creating || !newTitle.trim()}>
              <Plus size={14} aria-hidden />
              {creating ? ADMIN_COPY.todos.creating : ADMIN_COPY.todos.add}
            </button>
          </div>
        </form>
      </AdminBlock>

      <AdminBlock title={ADMIN_COPY.todos.listTitle} description={ADMIN_COPY.todos.listDesc}>
        <div className="admin-todos-toolbar">
          <div className="admin-todos-filters" role="tablist" aria-label="Todo filters">
            {(
              [
                ["open", `${ADMIN_COPY.todos.filters.open} (${openCount})`],
                ["done", `${ADMIN_COPY.todos.filters.done} (${doneCount})`],
                ["all", ADMIN_COPY.todos.filters.all],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                className={filter === key ? "admin-todos-filter admin-todos-filter--active" : "admin-todos-filter"}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <AdminBtn onClick={() => void load()} disabled={loading}>
            {loading ? ADMIN_COPY.actions.refreshing : ADMIN_COPY.actions.refresh}
          </AdminBtn>
        </div>

        {error ? <AdminAlert>{error}</AdminAlert> : null}

        {loading && todos.length === 0 ? (
          <p className="admin-note">{ADMIN_COPY.todos.loading}</p>
        ) : visibleTodos.length === 0 ? (
          <AdminEmptyState title={ADMIN_COPY.todos.empty} />
        ) : (
          <ul className="admin-todos-list">
            {visibleTodos.map((todo, index) => {
              const editing = editingId === todo.id;
              const busy = busyId === todo.id;

              return (
                <li
                  key={todo.id}
                  className={`admin-todo-item${todo.isCompleted ? " admin-todo-item--done" : ""}`}
                >
                  {editing ? (
                    <div className="admin-todo-edit">
                      <AdminField label={ADMIN_COPY.todos.fields.title}>
                        <input
                          className="admin-input"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          maxLength={200}
                        />
                      </AdminField>
                      <div className="admin-todos-compose-row">
                        <AdminField label={ADMIN_COPY.todos.fields.notes}>
                          <textarea
                            className="admin-input admin-todos-notes"
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            rows={2}
                          />
                        </AdminField>
                        <AdminField label={ADMIN_COPY.todos.fields.priority}>
                          <select
                            className="admin-input"
                            value={editPriority}
                            onChange={(e) => setEditPriority(e.target.value as AdminTodoPriority)}
                          >
                            {PRIORITY_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </AdminField>
                      </div>
                      <div className="admin-todo-edit-actions">
                        <AdminBtn onClick={() => void saveEdit(todo.id)} disabled={busy || !editTitle.trim()}>
                          <Check size={14} aria-hidden />
                          {ADMIN_COPY.todos.save}
                        </AdminBtn>
                        <AdminBtn onClick={() => setEditingId(null)} disabled={busy}>
                          {ADMIN_COPY.actions.close}
                        </AdminBtn>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="admin-todo-main">
                        <label className="admin-todo-check">
                          <input
                            type="checkbox"
                            checked={todo.isCompleted}
                            disabled={busy}
                            onChange={(e) =>
                              void patchTodo(todo.id, { isCompleted: e.target.checked })
                            }
                          />
                          <span className="admin-todo-check-box" aria-hidden />
                        </label>
                        <div className="admin-todo-text">
                          <p className="admin-todo-title">{todo.title}</p>
                          {todo.body ? <p className="admin-todo-body">{todo.body}</p> : null}
                        </div>
                        <AdminStatusBadge tone={priorityTone(todo.priority)}>
                          {priorityLabel(todo.priority)}
                        </AdminStatusBadge>
                      </div>
                      <div className="admin-todo-actions">
                        <AdminIconButton
                          icon={ChevronUp}
                          label={ADMIN_COPY.todos.moveUp}
                          disabled={busy || index === 0}
                          onClick={() => void moveTodo(todo.id, "up")}
                        />
                        <AdminIconButton
                          icon={ChevronDown}
                          label={ADMIN_COPY.todos.moveDown}
                          disabled={busy || index === visibleTodos.length - 1}
                          onClick={() => void moveTodo(todo.id, "down")}
                        />
                        <AdminIconButton
                          icon={Pencil}
                          label={ADMIN_COPY.todos.edit}
                          disabled={busy}
                          onClick={() => startEdit(todo)}
                        />
                        <AdminIconButton
                          icon={Trash2}
                          label={ADMIN_COPY.actions.delete}
                          disabled={busy}
                          onClick={() => void onDelete(todo.id)}
                        />
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </AdminBlock>
    </div>
  );
}
