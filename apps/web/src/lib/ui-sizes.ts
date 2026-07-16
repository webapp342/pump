/**
 * Central media sizes — avatars, token/chain logos, icons.
 * CSS mirror: `apps/web/src/app/size-theme.css`
 * Prefer named roles over raw px in components.
 */

/** Corporate 4px-grid steps used across the app. */
export const UI_SIZE_STEPS = [12, 16, 20, 24, 28, 32, 36, 40, 48, 52, 64] as const;
export type UiSizeStep = (typeof UI_SIZE_STEPS)[number];

/** Snap any px to nearest corporate step (avoids 14/18/22/26/44 drift). */
export function snapUiSize(px: number): UiSizeStep {
  let best: UiSizeStep = UI_SIZE_STEPS[0];
  let bestDist = Math.abs(px - best);
  for (const step of UI_SIZE_STEPS) {
    const dist = Math.abs(px - step);
    if (dist < bestDist) {
      best = step;
      bestDist = dist;
    }
  }
  return best;
}

/** User avatars — circle only. */
export const USER_AVATAR_SIZE = {
  /** Dense meta (arena creator chip) */
  xs: 16,
  sm: 20,
  /** Header wallet chip */
  md: 24,
  /** Feed / announcements */
  lg: 32,
  /** Portfolio identity / follow list */
  xl: 36,
  /** Sheet profile head */
  "2xl": 40,
  /** Portfolio hero */
  "3xl": 48,
  /** Avatar picker grid cell */
  picker: 52,
  /** Avatar picker preview */
  preview: 64,
} as const;

export type UserAvatarSizeRole = keyof typeof USER_AVATAR_SIZE;

/** Token / chain logos — square tile (`TokenAvatar` rounded / `NativeLogo`). */
export const TOKEN_LOGO_SIZE = {
  /** Metrics, order-value inline */
  xs: 16,
  /** Tables / holdings / creator sheet rows */
  sm: 20,
  /** Compact list rows */
  md: 24,
  /** Toolbar / detail header */
  lg: 28,
  xl: 32,
  /** Token mobile hero */
  "2xl": 36,
  /** Sidebar / large list */
  "3xl": 40,
  /** Arena mobile card row */
  row: 52,
  /** Campaign / hero card */
  hero: 52,
} as const;

export type TokenLogoSizeRole = keyof typeof TOKEN_LOGO_SIZE;

/** Material / PumpIcon glyph sizes. */
export const ICON_SIZE = {
  xs: 12,
  sm: 16,
  /** Default UI icon */
  md: 20,
  /** Nav / header actions */
  lg: 24,
  xl: 28,
} as const;

export type IconSizeRole = keyof typeof ICON_SIZE;

/** CSS utility class for PumpIcon / CDS icon sizes. */
export function iconSizeClass(role: IconSizeRole = "md"): `icon-${IconSizeRole}` {
  return `icon-${role}`;
}

/* ── Back-compat aliases (existing imports) ── */
export const TOKEN_LOGO_SIZE_INLINE = TOKEN_LOGO_SIZE.sm;
export const TOKEN_LOGO_SIZE_ROW = TOKEN_LOGO_SIZE.row;
export const TOKEN_LOGO_SIZE_TOOLBAR = TOKEN_LOGO_SIZE.lg;
