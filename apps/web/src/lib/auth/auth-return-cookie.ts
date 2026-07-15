import type { NextRequest, NextResponse } from "next/server";
import { authCookieOptions } from "@/lib/auth/session-cookie";
import { safeReturnPath } from "@/lib/safe-return-path";

export const AUTH_RETURN_COOKIE = "pump_auth_return";
const AUTH_RETURN_COOKIE_MAX_AGE_SECONDS = 600;

export function setAuthReturnCookie(
  response: NextResponse,
  request: NextRequest,
  path: string | null | undefined
): void {
  const safe = safeReturnPath(path);
  if (!safe) return;
  response.cookies.set(AUTH_RETURN_COOKIE, safe, {
    ...authCookieOptions(request),
    maxAge: AUTH_RETURN_COOKIE_MAX_AGE_SECONDS,
  });
}

export function readAuthReturnCookie(request: NextRequest): string | null {
  return safeReturnPath(request.cookies.get(AUTH_RETURN_COOKIE)?.value);
}

export function clearAuthReturnCookie(response: NextResponse, request: NextRequest): void {
  response.cookies.set(AUTH_RETURN_COOKIE, "", {
    ...authCookieOptions(request),
    maxAge: 0,
  });
}

/** Attach cookie `next` (if any) onto a complete-page URL and clear the cookie on `response`. */
export function applyAuthReturnToCompleteUrl(
  completeUrl: URL,
  request: NextRequest,
  response: NextResponse
): void {
  const path = readAuthReturnCookie(request);
  if (path) completeUrl.searchParams.set("next", path);
  clearAuthReturnCookie(response, request);
}
