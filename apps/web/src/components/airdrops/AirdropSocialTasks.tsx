"use client";

import {
  AIRDROP_SOCIAL_TASK_TYPES,
  openSocialTaskParticipantUrl,
  socialTaskActionLabel,
  socialTaskInputPlaceholder,
  socialTaskPreviewLabel,
  socialTaskUrlHint,
  socialTaskUsesUsernameInput,
  validateSocialTaskUrl,
  type SocialTaskDraft,
} from "@/lib/airdrop-social";
import type { AirdropSocialTaskInput } from "@/lib/airdrop-rules";
import { FieldErrorIcon, FieldErrorMessage } from "@/components/ui/FieldError";

type AirdropSocialTasksEditorProps = {
  tasks: SocialTaskDraft[];
  onToggle: (taskType: SocialTaskDraft["taskType"]) => void;
  onUrlChange: (taskType: SocialTaskDraft["taskType"], targetUrl: string) => void;
  /** When true, render task list only (no outer panel/header). */
  embedded?: boolean;
  /** Flat task rows matching airdrop detail (no tinted cards). */
  compact?: boolean;
  /** After failed Continue — show required/invalid errors on enabled tasks. */
  showFieldErrors?: boolean;
};

export function AirdropSocialTasksEditor({
  tasks,
  onToggle,
  onUrlChange,
  embedded = false,
  compact = false,
  showFieldErrors = false,
}: AirdropSocialTasksEditorProps) {
  const enabledCount = tasks.filter((task) => task.enabled).length;

  const content = (
    <div className={embedded ? (compact ? "" : "space-y-2") : "space-y-2 p-4 md:p-5"}>
      {enabledCount === 0 && !compact ? (
        <p className="field-hint">No social gate — on-chain rules unlock immediately.</p>
      ) : null}

      <ul className={compact ? "airdrop-detail-task-list" : "space-y-2"}>
        {AIRDROP_SOCIAL_TASK_TYPES.map((type) => {
          const task = tasks.find((entry) => entry.taskType === type.value);
          if (!task) return null;
          const enabled = task.enabled;
        const urlError =
          enabled && (showFieldErrors || task.targetUrl.trim())
            ? validateSocialTaskUrl(task.taskType, task.targetUrl)
            : null;

          if (compact) {
            return (
              <li key={type.value} className="airdrop-create-social-task-row">
                <label className="airdrop-create-social-task-row__toggle">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-pump-accent"
                    checked={enabled}
                    onChange={() => onToggle(type.value)}
                  />
                  <span className="min-w-0 truncate text-body-sm font-medium text-pump-text">
                    {type.label}
                  </span>
                </label>
                {enabled ? (
                  <div
                    className={`airdrop-create-social-task-row__field${urlError ? " field-group--error" : ""}`}
                  >
                    <div className={`field-control${urlError ? " field-control--error" : ""}`}>
                      {socialTaskUsesUsernameInput(type.value) ? (
                        <div className="relative min-w-0 w-full">
                          <span className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2 text-caption text-pump-muted">
                            @
                          </span>
                          <input
                            className={`field-input airdrop-create-social-task-row__input w-full min-w-0 pl-7${urlError ? " field-input--error" : ""}`}
                            placeholder={socialTaskInputPlaceholder(type.value)}
                            value={task.targetUrl.replace(/^@/, "")}
                            onChange={(e) => onUrlChange(type.value, e.target.value)}
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-invalid={urlError ? true : undefined}
                          />
                        </div>
                      ) : (
                        <input
                          className={`field-input airdrop-create-social-task-row__input min-w-0${urlError ? " field-input--error" : ""}`}
                          placeholder={socialTaskInputPlaceholder(type.value)}
                          value={task.targetUrl}
                          onChange={(e) => onUrlChange(type.value, e.target.value)}
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          aria-invalid={urlError ? true : undefined}
                        />
                      )}
                      {urlError ? <FieldErrorIcon /> : null}
                    </div>
                    <FieldErrorMessage>{urlError}</FieldErrorMessage>
                  </div>
                ) : null}
              </li>
            );
          }

          return (
            <li
              key={type.value}
              className={`rounded-md border p-3 transition ${
                enabled
                  ? "border-pump-accent/25 bg-pump-surface/35"
                  : "border-pump-border/15 bg-pump-surface/20"
              }`}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-pump-accent"
                  checked={enabled}
                  onChange={() => onToggle(type.value)}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-body-sm font-medium text-pump-text">{type.label}</span>
                  {enabled ? (
                    <div className={`mt-2${urlError ? " field-group--error" : ""}`}>
                      <div className={`field-control${urlError ? " field-control--error" : ""}`}>
                        {socialTaskUsesUsernameInput(type.value) ? (
                          <div className="relative min-w-0 w-full">
                            <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-body-sm text-pump-muted">
                              @
                            </span>
                            <input
                              className={`field-input w-full min-w-0 pl-7${urlError ? " field-input--error" : ""}`}
                              placeholder={socialTaskInputPlaceholder(type.value)}
                              value={task.targetUrl.replace(/^@/, "")}
                              onChange={(e) => onUrlChange(type.value, e.target.value)}
                              autoCapitalize="none"
                              autoCorrect="off"
                              spellCheck={false}
                              aria-invalid={urlError ? true : undefined}
                            />
                          </div>
                        ) : (
                          <input
                            className={`field-input min-w-0${urlError ? " field-input--error" : ""}`}
                            placeholder={socialTaskInputPlaceholder(type.value)}
                            value={task.targetUrl}
                            onChange={(e) => onUrlChange(type.value, e.target.value)}
                            aria-invalid={urlError ? true : undefined}
                          />
                        )}
                        {urlError ? <FieldErrorIcon /> : null}
                      </div>
                      {urlError ? (
                        <FieldErrorMessage>{urlError}</FieldErrorMessage>
                      ) : enabled && !task.targetUrl.trim() && !showFieldErrors ? (
                        <p className="mt-1 text-caption text-pump-muted">
                          {socialTaskUrlHint(type.value)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );

  if (embedded) return content;

  return (
    <section className="panel-surface overflow-hidden">
      <div className="border-b border-pump-border/15 px-4 py-3.5 md:px-5">
        <p className="section-label">Social tasks</p>
        <p className="mt-0.5 field-hint">
          Optional gate before on-chain rules unlock. One task per platform (max{" "}
          {AIRDROP_SOCIAL_TASK_TYPES.length}).
        </p>
      </div>
      {content}
    </section>
  );
}

type AirdropSocialTasksPreviewProps = {
  tasks: AirdropSocialTaskInput[];
};

export function AirdropSocialTasksPreview({ tasks }: AirdropSocialTasksPreviewProps) {
  if (tasks.length === 0) return null;

  return (
    <div className="border-t border-pump-border/15 pt-2">
      <p className="text-pump-muted">Social</p>
      <ul className="mt-1 space-y-1">
        {tasks.map((task) => (
            <li
              key={task.taskType}
              className="flex min-w-0 items-center justify-between gap-1.5 text-[11px]"
            >
              <span className="min-w-0 truncate font-medium text-pump-text">
                {socialTaskPreviewLabel(task.taskType, task.targetUrl)}
              </span>
              <button
                type="button"
                className="shrink-0 text-pump-accent hover:underline"
                onClick={() => openSocialTaskParticipantUrl(task.taskType, task.targetUrl)}
              >
                {socialTaskActionLabel(task.taskType)}
              </button>
            </li>
        ))}
      </ul>
    </div>
  );
}
