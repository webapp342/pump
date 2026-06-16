export const PORTFOLIO_LAUNCHED_INITIAL = 5;
export const PORTFOLIO_LAUNCHED_INCREMENT = 5;
export const PORTFOLIO_LAUNCHED_MAX = 200;
export const PORTFOLIO_HOLDINGS_INITIAL = 20;
export const PORTFOLIO_HOLDINGS_INCREMENT = 20;
/** Max creator-launched tokens to scan on-chain per portfolio load (avoids 500+ multicalls). */
export const PORTFOLIO_CREATOR_WALLET_SCAN_MAX = 60;
/** On-chain balanceOf checks for indexer positions on first paint. */
export const PORTFOLIO_ONCHAIN_VERIFY_INITIAL = 20;
/** Batch size for on-chain balance verification (avoids URL length limits). */
export const PORTFOLIO_ONCHAIN_BALANCE_CHUNK = 80;
/** Skip per-token trade replay above this many indexer positions. */
export const PORTFOLIO_DERIVED_LOTS_MAX = 40;
