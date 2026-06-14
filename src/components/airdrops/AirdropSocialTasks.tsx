"use client";

import {
  AIRDROP_SOCIAL_TASK_TYPES,
  socialTaskActionLabel,
  socialTaskInputPlaceholder,
  socialTaskParticipantUrl,
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
};

export function AirdropSocialTasksEditor({
  tasks,
  onToggle,
  onUrlChange,
}: AirdropSocialTasksEditorProps) {
  const enabledCount = tasks.filter((task) => task.enabled).length;

  return (
    <section className="panel-surface overflow-hidden">
      <div className="border-b border-pump-border/15 px-4 py-3.5 md:px-5">
        <p className="section-label">Social tasks</p>
        <p className="mt-0.5 field-hint">
          Optional gate before on-chain rules unlock. One task per platform (max{" "}
          {AIRDROP_SOCIAL_TASK_TYPES.length}).
        </p>
      </div>

      <div className="space-y-2 p-4 md:p-5">
        {enabledCount === 0 ? (
          <p className="field-hint">
            No social gate — on-chain rules unlock immediately for everyone.
          </p>
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
    </section>
  );
}

type AirdropSocialTasksPreviewProps = {
  tasks: AirdropSocialTaskInput[];
};

export function AirdropSocialTasksPreview({ tasks }: AirdropSocialTasksPreviewProps) {
  if (tasks.length === 0) return null;

  return (
    <>
      <dt className="col-span-2 border-t border-pump-border/15 pt-2 section-label">
        Step 1 — Social
      </dt>
      <dd className="col-span-2">
        <ul className="grid grid-cols-2 gap-1.5">
          {tasks.map((task) => {
            const participantUrl = socialTaskParticipantUrl(task.taskType, task.targetUrl);

            return (
              <li
                key={task.taskType}
                className="flex min-w-0 items-center justify-between gap-1.5 rounded-md border border-pump-border/15 bg-pump-surface/35 px-2 py-1.5"
              >
                <span className="min-w-0 truncate text-[11px] font-medium text-pump-text">
                  {socialTaskPreviewLabel(task.taskType, task.targetUrl)}
                </span>
                <a
                  href={participantUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chip-button shrink-0 whitespace-nowrap px-2 py-0.5 text-[10px]"
                >
                  {socialTaskActionLabel(task.taskType)}
                </a>
              </li>
            );
          })}
        </ul>
      </dd>
    </>
  );
}
