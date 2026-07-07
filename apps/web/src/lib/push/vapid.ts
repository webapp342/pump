const VAPID_PUBLIC_KEY_ENV = "NEXT_PUBLIC_VAPID_PUBLIC_KEY";
const VAPID_PRIVATE_KEY_ENV = "VAPID_PRIVATE_KEY";
const VAPID_SUBJECT_ENV = "VAPID_SUBJECT";

export function getVapidPublicKey(): string | null {
  const value = process.env[VAPID_PUBLIC_KEY_ENV]?.trim();
  return value || null;
}

export function getVapidPrivateKey(): string | null {
  const value = process.env[VAPID_PRIVATE_KEY_ENV]?.trim();
  return value || null;
}

export function getVapidSubject(): string {
  const explicit = process.env[VAPID_SUBJECT_ENV]?.trim();
  if (explicit) return explicit;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) return appUrl;

  return "mailto:support@pump.local";
}

export function isVapidConfigured(): boolean {
  return Boolean(getVapidPublicKey() && getVapidPrivateKey());
}
