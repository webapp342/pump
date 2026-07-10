"use client";

import type { TokenSocialLinks } from "@/lib/token-social";
import { FieldErrorIcon, FieldErrorMessage } from "@/components/ui/FieldError";

export type TokenSocialLinkKey = keyof TokenSocialLinks;

export type TokenSocialLinkDraft = {
  enabled: boolean;
  value: string;
};

export type TokenSocialLinksState = Record<TokenSocialLinkKey, TokenSocialLinkDraft>;

export const TOKEN_SOCIAL_LINK_FIELDS: {
  key: TokenSocialLinkKey;
  label: string;
  placeholder: string;
}[] = [
  { key: "twitter", label: "X (Twitter)", placeholder: "https://x.com/yourcoin" },
  { key: "telegram", label: "Telegram", placeholder: "https://t.me/yourcoin" },
  { key: "website", label: "Website", placeholder: "https://yourcoin.com" },
  { key: "discord", label: "Discord", placeholder: "https://discord.gg/yourcoin" },
];

export function createEmptyTokenSocialLinksState(): TokenSocialLinksState {
  return {
    twitter: { enabled: false, value: "" },
    website: { enabled: false, value: "" },
    telegram: { enabled: false, value: "" },
    discord: { enabled: false, value: "" },
  };
}

export function tokenSocialLinksToPayload(links: TokenSocialLinksState): TokenSocialLinks {
  const out: TokenSocialLinks = {};
  for (const field of TOKEN_SOCIAL_LINK_FIELDS) {
    if (!links[field.key].enabled) continue;
    const trimmed = links[field.key].value.trim();
    if (trimmed) out[field.key] = trimmed;
  }
  return out;
}

function validateSocialUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Enter a URL";
  if (!/^https?:\/\//i.test(trimmed)) return "URL must start with http:// or https://";
  return null;
}

type TokenSocialLinksEditorProps = {
  links: TokenSocialLinksState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (key: TokenSocialLinkKey) => void;
  onChange: (key: TokenSocialLinkKey, value: string) => void;
  showFieldErrors?: boolean;
};

export function TokenSocialLinksEditor({
  links,
  open,
  onOpenChange,
  onToggle,
  onChange,
  showFieldErrors = false,
}: TokenSocialLinksEditorProps) {
  const enabledCount = TOKEN_SOCIAL_LINK_FIELDS.filter((field) => links[field.key].enabled).length;

  return (
    <div className="token-create-social-field token-create-field-cell min-w-0">
      <label className="field-label" htmlFor="token-social-trigger">
        Social links <span className="font-normal text-pump-muted">(optional)</span>
      </label>
      <button
        id="token-social-trigger"
        type="button"
        onClick={() => onOpenChange(!open)}
        className="token-create-social-trigger field-control w-full text-left"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate text-body-sm text-pump-text">
          {enabledCount > 0 ? `${enabledCount} selected` : "Add links"}
        </span>
        <span className="shrink-0 text-caption text-pump-muted" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>

      {open ? (
        <div className="token-create-social-panel">
          <ul className="token-create-social-panel__list">
            {TOKEN_SOCIAL_LINK_FIELDS.map((field) => {
              const draft = links[field.key];
              const urlError =
                draft.enabled && (showFieldErrors || draft.value.trim())
                  ? validateSocialUrl(draft.value)
                  : null;

              return (
                <li key={field.key} className="airdrop-create-social-task-row">
                  <label className="airdrop-create-social-task-row__toggle">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-pump-accent"
                      checked={draft.enabled}
                      onChange={() => onToggle(field.key)}
                    />
                    <span className="min-w-0 truncate text-body-sm font-medium text-pump-text">
                      {field.label}
                    </span>
                  </label>
                  {draft.enabled ? (
                    <div
                      className={`airdrop-create-social-task-row__field${urlError ? " field-group--error" : ""}`}
                    >
                      <div className={`field-control${urlError ? " field-control--error" : ""}`}>
                        <input
                          type="url"
                          inputMode="url"
                          className={`field-input airdrop-create-social-task-row__input min-w-0${urlError ? " field-input--error" : ""}`}
                          placeholder={field.placeholder}
                          value={draft.value}
                          onChange={(e) => onChange(field.key, e.target.value)}
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          aria-invalid={urlError ? true : undefined}
                        />
                        {urlError ? <FieldErrorIcon /> : null}
                      </div>
                      <FieldErrorMessage>{urlError}</FieldErrorMessage>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
