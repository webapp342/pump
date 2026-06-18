export type ClientMessage =
  | { type: "subscribe"; room: string }
  | { type: "unsubscribe"; room: string }
  | { type: "ping" };

export type ServerMessage =
  | { type: "subscribed"; room: string }
  | { type: "replay"; room: string; events: unknown[] }
  | { type: "pong" }
  | { type: "trade"; tokenAddress: string; trade: unknown; bonding: unknown }
  | { type: "wallet_trade"; walletAddress: string; tokenAddress: string; trade: unknown; position: unknown; bonding: unknown }
  | { type: "board_delta"; tokens?: unknown[] }
  | { type: "koth"; [key: string]: unknown };

export const REDIS_CHANNELS = {
  board: "pump:board",
  koth: "pump:koth",
  tradePrefix: "pump:trade:",
  walletPrefix: "pump:wallet:",
} as const;

export function tradeRoom(tokenAddress: string): string {
  return `token:${tokenAddress.toLowerCase()}`;
}

export function walletRoom(walletAddress: string): string {
  return `wallet:${walletAddress.toLowerCase()}`;
}

export function arenaRoom(): string {
  return "arena";
}

export function redisChannelToRooms(channel: string, payload: string): string[] {
  if (channel === REDIS_CHANNELS.board) return [arenaRoom()];
  if (channel === REDIS_CHANNELS.koth) return [arenaRoom()];
  if (channel.startsWith(REDIS_CHANNELS.tradePrefix)) {
    const token = channel.slice(REDIS_CHANNELS.tradePrefix.length);
    return [tradeRoom(token), arenaRoom()];
  }
  if (channel.startsWith(REDIS_CHANNELS.walletPrefix)) {
    const wallet = channel.slice(REDIS_CHANNELS.walletPrefix.length);
    return [walletRoom(wallet)];
  }
  return [];
}

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const data = JSON.parse(raw) as ClientMessage;
    if (data.type === "subscribe" || data.type === "unsubscribe") {
      if (typeof data.room !== "string" || !data.room.trim()) return null;
      return data;
    }
    if (data.type === "ping") return data;
    return null;
  } catch {
    return null;
  }
}
