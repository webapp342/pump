import { NextResponse, type NextRequest } from "next/server";
import {
  LAST_TRADE_TOKEN_COOKIE_NAME,
  parseLastTradeTokenCookie,
} from "@/lib/last-trade-token-cookie";

const TRADE_ENTRY_PATHS = new Set(["/", "/trade"]);

export function middleware(request: NextRequest) {
  if (!TRADE_ENTRY_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const last = parseLastTradeTokenCookie(request.cookies.get(LAST_TRADE_TOKEN_COOKIE_NAME)?.value);
  if (!last) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/token/${last}`;
  url.search = "trade=buy";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/", "/trade"],
};