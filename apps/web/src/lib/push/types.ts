export type PushPlatform = "desktop" | "android" | "ios" | "unknown";

export type PushDisplayMode = "standalone" | "browser";

export type PushSubscriptionKeys = {
  p256dh: string;
  auth: string;
};

export type PushSubscriptionPayload = {
  endpoint: string;
  keys: PushSubscriptionKeys;
  expirationTime?: number | null;
};

export type PushPreferences = {
  airdropUpdates: boolean;
  tradeAlerts: boolean;
  favoriteMoves: boolean;
  followerAnnouncements: boolean;
};

export type PushNotificationPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
};

export type PushStatus = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  /** Any device registered for this wallet (legacy aggregate). */
  subscribed: boolean;
  /** This browser/PWA install is registered on the server. */
  subscribedOnThisDevice: boolean;
  /** Another device is registered, but not this one. */
  subscribedOnOtherDevice: boolean;
  platform: PushPlatform;
  standalone: boolean;
  needsInstall: boolean;
  preferences: PushPreferences;
};
