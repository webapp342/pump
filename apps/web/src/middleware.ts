import { NextResponse, type NextRequest } from "next/server";

/**
 * Trade last-token redirect is client-only (localStorage + cookie via inline script /
 * TradeHomeBootstrap). Edge middleware must not redirect on cookie alone — a stale cookie
 * can beat fresher localStorage and force the top-MCAP default token.
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/trade"],
};
