import {
  LAST_TRADE_TOKEN_STORAGE_KEY,
} from "@/lib/last-trade-token";
import { LAST_TRADE_TOKEN_COOKIE_NAME } from "@/lib/last-trade-token-cookie";
import { TradeHomeBootstrapClient } from "@/app/trade/TradeHomeBootstrapClient";

type TradeHomeBootstrapProps = {
  fallbackHref: string;
};

const INLINE_BOOTSTRAP = `(function(){try{var k=${JSON.stringify(LAST_TRADE_TOKEN_STORAGE_KEY)};var v=localStorage.getItem(k);if(!v)return;v=v.trim().toLowerCase();if(!/^0x[a-f0-9]{40}$/.test(v))return;var c=${JSON.stringify(LAST_TRADE_TOKEN_COOKIE_NAME)};document.cookie=c+"="+encodeURIComponent(v)+";path=/;max-age=7776000;samesite=lax";location.replace("/token/"+v+"?trade=buy");}catch(e){}})();`;

/**
 * Trade home (`/`, `/trade`) — last visited token from storage, else server top-MCAP fallback.
 * Middleware handles cookie; inline script + client effect cover localStorage-only migration.
 */
export function TradeHomeBootstrap({ fallbackHref }: TradeHomeBootstrapProps) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: INLINE_BOOTSTRAP }} />
      <TradeHomeBootstrapClient fallbackHref={fallbackHref} />
    </>
  );
}
