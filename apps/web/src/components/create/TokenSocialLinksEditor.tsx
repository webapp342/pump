"use client";

import type { TokenSocialLinks } from "@/lib/token-social";
import { FieldErrorIcon, FieldErrorMessage } from "@/components/ui/FieldError";
import { InfoTip } from "@/components/ui/InfoTip";
import { PumpIcon, faChevronDown } from "@/lib/icons";

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
    const trimmed = links[field.key].value.trim();
    if (trimmed) out[field.key] = trimmed;
  }
  return out;
}

export function validateSocialUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return "URL must start with http:// or https://";
  return null;
}

type TokenSocialLinksEditorProps = {
  links: TokenSocialLinksState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (key: TokenSocialLinkKey, value: string) => void;
  showFieldErrors?: boolean;
};

export function TokenSocialLinksEditor({
  links,
  open,
  onOpenChange,
  onChange,
  showFieldErrors = false,
}: TokenSocialLinksEditorProps) {
  const filledCount = TOKEN_SOCIAL_LINK_FIELDS.filter((field) => links[field.key].value.trim()).length;
  const summary =
    filledCount === 0
      ? "None added"
      : filledCount === 1
        ? "1 link added"
        : `${filledCount} links added`;

  return (
    <div className="token-create-social">
      <div className="token-create-social__toggle-row">
        <span id="token-social-toggle-label" className="field-label mb-0 inline-flex items-center gap-1">
          Social links <span className="font-normal text-pump-muted">(optional)</span>
          <InfoTip label="About social links">
            Shown on your coin page after launch. Leave blank if you don&apos;t have them yet. URLs must
            start with http:// or https://
          </InfoTip>
        </span>
        <button
          type="button"
          id="token-social-toggle"
          className="token-create-social__toggle"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-controls="token-social-panel"
          aria-labelledby="token-social-toggle-label"
        >
          <span className="token-create-social__toggle-meta">
            {!open ? <span className="text-caption text-pump-muted">{summary}</span> : null}
            <PumpIcon
              icon={faChevronDown}
              className={`h-3.5 w-3.5 shrink-0 text-pump-muted transition-transform${open ? " rotate-180" : ""}`}
            />
          </span>
        </button>
      </div>

      {open ? (
        <div id="token-social-panel" className="token-create-social__grid">
          {TOKEN_SOCIAL_LINK_FIELDS.map((field) => {
            const draft = links[field.key];
            const error = validateSocialUrl(draft.value);
            const showError = Boolean(error && (showFieldErrors || draft.value.trim()));

            return (
              <div
                key={field.key}
                className={`token-create-field-cell${showError ? " field-group--error" : ""}`}
              >
                <label className="field-label" htmlFor={`token-social-${field.key}`}>
                  {field.label}
                </label>
                <div className={`field-control${showError ? " field-control--error" : ""}`}>
                  <input
                    id={`token-social-${field.key}`}
                    type="url"
                    inputMode="url"
                    className={`field-input${showError ? " field-input--error" : ""}`}
                    placeholder={field.placeholder}
                    value={draft.value}
                    onChange={(e) => onChange(field.key, e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-invalid={showError ? true : undefined}
                  />
                  {showError ? <FieldErrorIcon /> : null}
                </div>
                <FieldErrorMessage>{showError ? error : null}</FieldErrorMessage>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
