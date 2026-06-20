import { NextResponse, type NextRequest } from "next/server";
import { getBundlerUpstreamUrl } from "@/lib/aa/bundler-config";
import { bundlerDebug } from "@/lib/aa/bundler-debug";
import {
  normalizeBundlerRpcPayload,
  parseJsonRpcRequestBody,
  type JsonRpcPayload,
} from "@/lib/aa/bundler-rpc-compat";

export async function POST(request: NextRequest) {
  try {
    const upstream = getBundlerUpstreamUrl();
    const body = await request.text();
    const rpcRequest = parseJsonRpcRequestBody(body);
    const method = rpcRequest?.method ?? "?";

    bundlerDebug("info", "proxy →", method, body);

    const response = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });

    const text = await response.text();
    let payload: JsonRpcPayload;
    try {
      payload = JSON.parse(text) as JsonRpcPayload;
    } catch {
      bundlerDebug("error", "proxy parse", method, text.slice(0, 200));
      return new NextResponse(text, {
        status: response.status,
        headers: {
          "Content-Type": response.headers.get("Content-Type") ?? "application/json",
          "Cache-Control": "no-store",
        },
      });
    }

    const normalized = normalizeBundlerRpcPayload(method, payload);
    if (payload.error && !normalized.error && normalized.result === null) {
      bundlerDebug("warn", "proxy pending", method, {
        note: "normalized pending bundler receipt to null",
        bundlerError: payload.error,
      });
    } else {
      bundlerDebug("info", "proxy ←", method, normalized);
    }

    return new NextResponse(JSON.stringify(normalized), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const upstream = getBundlerUpstreamUrl();
    const base =
      error instanceof Error ? error.message : "Bundler proxy failed";
    const refused =
      base.includes("ECONNREFUSED") ||
      base.includes("fetch failed") ||
      base.includes("Failed to fetch");
    const tunnelHint =
      refused && upstream.includes("127.0.0.1")
        ? " Alto bundler unreachable at " +
          upstream +
          ". Local dev: open SSH tunnel — ssh -p 22022 -L 4337:127.0.0.1:4337 root@104.207.64.115"
        : refused
          ? ` Bundler upstream unreachable: ${upstream}`
          : "";
    const message = base + tunnelHint;
    bundlerDebug("error", "proxy", "?", { message, upstream });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
