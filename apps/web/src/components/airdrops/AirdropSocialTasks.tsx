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

type AirdropSocialTasksEditorProps = {
  tasks: SocialTaskDraft[];
  onToggle: (taskType: SocialTaskDraft["taskType"]) => void;
  onUrlChange: (taskType: SocialTaskDraft["taskType"], targetUrl: string) => void;
  /** When true, render task list only (no outer panel/header). */
  embedded?: boolean;
};

export function AirdropSocialTasksEditor({
  tasks,
  onToggle,
  onUrlChange,
  embedded = false,
}: AirdropSocialTasksEditorProps) {
  const enabledCount = tasks.filter((task) => task.enabled).length;

  const content = (
    <div className={embedded ? "space-y-2" : "space-y-2 p-4 md:p-5"}>
      {enabledCount === 0 ? (
        <p className="field-hint">No social gate — on-chain rules unlock immediately.</p>
      ) : null}

      <ul className="space-y-2">
        {AIRDROP_SOCIAL_TASK_TYPES.map((type) => {
          const task = tasks.find((entry) => entry.taskType === type.value);
          if (!task) return null;
          const enabled = task.enabled;
          const urlError =
            enabled && task.targetUrl.trim()
              ? validateSocialTaskUrl(task.taskType, task.targetUrl)
              : null;

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
                    socialTaskUsesUsernameInput(type.value) ? (
                      <div className="relative mt-2">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body-sm text-pump-muted">
                          @
                        </span>
                        <input
                          className="field-input pl-7"
                          placeholder={socialTaskInputPlaceholder(type.value)}
                          value={task.targetUrl.replace(/^@/, "")}
                          onChange={(e) => onUrlChange(type.value, e.target.value)}
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                        />
                      </div>
                    ) : (
                      <input
                        className="field-input mt-2"
                        placeholder={socialTaskInputPlaceholder(type.value)}
                        value={task.targetUrl}
                        onChange={(e) => onUrlChange(type.value, e.target.value)}
                      />
                    )
                  ) : null}
                  {urlError ? (
                    <p className="mt-1 text-caption text-pump-warning">{urlError}</p>
                  ) : enabled && !task.targetUrl.trim() ? (
                    <p className="mt-1 text-caption text-pump-muted">
                      {socialTaskUrlHint(type.value)}
                    </p>
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
