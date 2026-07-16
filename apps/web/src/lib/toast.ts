export type ToastTone = "success" | "error" | "info" | "loading";

export type ToastAction = {
  label: string;
  href: string;
};

export type ToastItem = {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  durationMs: number;
  /** Stays visible until updated to a terminal tone or explicitly dismissed. */
  persistent?: boolean;
  action?: ToastAction;
};

export type ToastEvent =
  | { type: "push"; item: ToastItem }
  | { type: "update"; id: string; item: ToastItem }
  | { type: "dismiss"; id: string };

type ToastListener = (event: ToastEvent) => void;

const store = new Map<string, ToastItem>();
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<ToastListener>();

const DEFAULT_DURATION_MS: Record<ToastTone, number> = {
  success: 2_500,
  error: 6_000,
  info: 4_000,
  loading: 0,
};

const MAX_SUCCESS_TOASTS = 2;

function emit(event: ToastEvent) {
  for (const listener of listeners) {
    listener(event);
  }
}

function createToastId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clearAutoDismiss(id: string) {
  const timer = dismissTimers.get(id);
  if (timer != null) {
    clearTimeout(timer);
    dismissTimers.delete(id);
  }
}

function scheduleAutoDismiss(item: ToastItem) {
  clearAutoDismiss(item.id);
  if (item.persistent || item.durationMs <= 0) return;
  dismissTimers.set(
    item.id,
    setTimeout(() => {
      dismissToast(item.id);
    }, item.durationMs)
  );
}

function enforceSuccessLimit() {
  const successItems = [...store.values()].filter((item) => item.tone === "success");
  while (successItems.length > MAX_SUCCESS_TOASTS) {
    const oldest = successItems.shift();
    if (!oldest) break;
    dismissToast(oldest.id);
  }
}

function commitToast(item: ToastItem, eventType: "push" | "update") {
  // Re-insert so updated toasts rise to the newest end of the map (display stack).
  if (store.has(item.id)) store.delete(item.id);
  store.set(item.id, item);
  if (item.tone === "success") enforceSuccessLimit();
  if (eventType === "push") {
    emit({ type: "push", item });
  } else {
    emit({ type: "update", id: item.id, item });
  }
  scheduleAutoDismiss(item);
}

function findMatchingToastId(
  tone: ToastTone,
  title: string,
  description?: string
): string | undefined {
  for (const item of store.values()) {
    if (item.tone === tone && item.title === title && item.description === description) {
      return item.id;
    }
  }
  return undefined;
}

function normalizeToastItem(
  tone: ToastTone,
  title: string,
  description?: string,
  options?: {
    id?: string;
    durationMs?: number;
    persistent?: boolean;
    action?: ToastAction;
  }
): ToastItem {
  const durationMs = options?.durationMs ?? DEFAULT_DURATION_MS[tone];
  const dedupedId =
    options?.id ??
    (tone === "error" || tone === "info"
      ? findMatchingToastId(tone, title, description)
      : undefined);
  return {
    id: dedupedId ?? createToastId(),
    tone,
    title,
    description,
    durationMs,
    persistent: options?.persistent ?? tone === "loading",
    action: options?.action,
  };
}

function dismissToast(id: string) {
  if (!store.has(id)) return;
  store.delete(id);
  clearAutoDismiss(id);
  emit({ type: "dismiss", id });
}

function mergeToast(id: string, patch: Partial<Omit<ToastItem, "id">>): ToastItem {
  const existing = store.get(id);
  if (existing) {
    return { ...existing, ...patch, id };
  }
  const tone = patch.tone ?? "info";
  return {
    id,
    tone,
    title: patch.title ?? "",
    description: patch.description,
    durationMs: patch.durationMs ?? DEFAULT_DURATION_MS[tone],
    persistent: patch.persistent ?? tone === "loading",
    action: patch.action,
  };
}

export function getActiveToasts(): ToastItem[] {
  return [...store.values()];
}

export function subscribeToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function pushToast(
  tone: ToastTone,
  title: string,
  description?: string,
  options?: {
    id?: string;
    durationMs?: number;
    persistent?: boolean;
    action?: ToastAction;
  }
) {
  const item = normalizeToastItem(tone, title, description, options);
  commitToast(item, store.has(item.id) ? "update" : "push");
}

export const toast = {
  success(title: string, description?: string, options?: { id?: string; durationMs?: number }) {
    if (options?.id) {
      const item = mergeToast(options.id, {
        tone: "success",
        title,
        description,
        durationMs: options.durationMs ?? DEFAULT_DURATION_MS.success,
        persistent: false,
        action: undefined,
      });
      commitToast(item, store.has(options.id) ? "update" : "push");
      return;
    }
    pushToast("success", title, description, options);
  },
  error(title: string, description?: string, options?: { id?: string; durationMs?: number }) {
    if (options?.id) {
      const item = mergeToast(options.id, {
        tone: "error",
        title,
        description,
        durationMs: options.durationMs ?? DEFAULT_DURATION_MS.error,
        persistent: false,
        action: undefined,
      });
      commitToast(item, store.has(options.id) ? "update" : "push");
      return;
    }
    pushToast("error", title, description, options);
  },
  info(title: string, description?: string, options?: { id?: string; durationMs?: number }) {
    pushToast("info", title, description, options);
  },
  loading(title: string, description?: string, options?: { id?: string; action?: ToastAction }) {
    pushToast("loading", title, description, {
      id: options?.id,
      persistent: true,
      action: options?.action,
    });
  },
  update(id: string, patch: Partial<Omit<ToastItem, "id">>) {
    const item = mergeToast(id, patch);
    commitToast(item, store.has(id) ? "update" : "push");
  },
  dismiss(id: string) {
    dismissToast(id);
  },
};
