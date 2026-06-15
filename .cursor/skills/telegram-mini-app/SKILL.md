---
name: telegram-mini-app
description: >-
  DEPRECATED — Pump is web-only. This skill is kept for historical reference
  only. Do not use for new work. Telegram social links in token metadata are
  marketing URLs, not Mini App integration.
---

# Telegram Mini App — Deprecated

**Status: deprecated.** Pump pivoted to a web-only pro trader terminal. TMA integration files were removed.

## What was removed

- `TelegramProvider`, `OpenInTelegramBanner`, `telegram.d.ts`
- `telegram.org` CSP entries in `next.config.ts`
- Mobile bottom tab bar and TMA safe-area CSS vars

## What remains

- **Telegram as social link** in `CreateMemeForm` and `TokenSocialLinksBar` — external marketing URL only
- `JOIN_TELEGRAM` airdrop task type in `airdrop-social.ts`

## Do not

- Re-add WebApp SDK, `initData`, or TMA lifecycle without an explicit product decision
- Reference this skill from new implementation work — use `pump-tma-ui-ux` instead
