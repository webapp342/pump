/** Light tap feedback on supported mobile browsers. */
export function hapticTap(durationMs = 8): void {
  try {
    navigator.vibrate?.(durationMs);
  } catch {
    /* unsupported */
  }
}
