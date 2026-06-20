import { http, type HttpTransport } from "viem";
import { getBundlerRpcUrl } from "@/lib/aa/bundler-config";
import { bundlerDebug } from "@/lib/aa/bundler-debug";
import {
  normalizeBundlerRpcPayload,
  type JsonRpcPayload,
} from "@/lib/aa/bundler-rpc-compat";

function readRpcMethod(init?: RequestInit): string {
  if (!init?.body || typeof init.body !== "string") return "?";
  try {
    const parsed = JSON.parse(init.body) as { method?: string };
    return parsed.method ?? "?";
  } catch {
    return "?";
  }
}

export function createBundlerTransport(): HttpTransport {
  const url = getBundlerRpcUrl();

  return http(url, {
    timeout: 30_000,
    fetchFn: async (input, init) => {
      const method = readRpcMethod(init);
      bundlerDebug("info", "→", method, init?.body);

      const response = await fetch(input, init);
      const text = await response.text();

      let payload: JsonRpcPayload;
      try {
        payload = JSON.parse(text) as JsonRpcPayload;
      } catch {
        bundlerDebug("error", "parse", method, text.slice(0, 200));
        return new Response(text, {
          status: response.status,
          headers: response.headers,
        });
      }

      const beforeError = payload.error;
      const normalized = normalizeBundlerRpcPayload(method, payload);

      if (beforeError && !normalized.error && normalized.result === null) {
        bundlerDebug("warn", "pending", method, {
          note: "bundler receipt not ready — treating as null for polling",
          bundlerError: beforeError,
        });
      } else if (normalized.error) {
        bundlerDebug("error", "←", method, normalized);
      } else {
        bundlerDebug("info", "←", method, normalized);
      }

      return new Response(JSON.stringify(normalized), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
}
