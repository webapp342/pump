"use client";

import { useEffect, useRef, useState } from "react";
import { useWebSocketLive, webSocketUrl } from "@/lib/db/perf-flags";

export type LiveChannelOptions = {
  room: string;
  onMessage: (data: unknown) => void;
  enabled?: boolean;
};

type ReplayMessage = {
  type: "replay";
  room: string;
  events: unknown[];
};

function isReplayMessage(data: unknown): data is ReplayMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as ReplayMessage;
  return msg.type === "replay" && Array.isArray(msg.events);
}

export function useLiveChannel({ room, onMessage, enabled = true }: LiveChannelOptions) {
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled || !useWebSocketLive()) {
      setConnected(false);
      return;
    }

    const url = webSocketUrl();
    if (!url) {
      setConnected(false);
      return;
    }

    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;

    const connect = () => {
      if (closed) return;

      ws = new WebSocket(url);

      ws.onopen = () => {
        setConnected(true);
        ws?.send(JSON.stringify({ type: "subscribe", room }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as unknown;
          if (isReplayMessage(data)) {
            for (const item of data.events) {
              onMessageRef.current(item);
            }
            return;
          }
          onMessageRef.current(data);
        } catch {
          // Ignore malformed payloads.
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!closed) {
          reconnectTimer = setTimeout(connect, 3_000);
        }
      };

      ws.onerror = () => {
        setConnected(false);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      setConnected(false);
    };
  }, [room, enabled]);

  return { connected };
}

export const POLL_MS = 4_000;
export const BURST_POLL_MS = 1_500;
export const WS_FALLBACK_POLL_MS = 30_000;

export function resolveLivePollDelay(
  connected: boolean,
  hasLivePending: boolean,
  burstUntilMs = 0
): number {
  if (hasLivePending || Date.now() < burstUntilMs) {
    return BURST_POLL_MS;
  }
  if (useWebSocketLive() && connected) {
    return WS_FALLBACK_POLL_MS;
  }
  return POLL_MS;
}
