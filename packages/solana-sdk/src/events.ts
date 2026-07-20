/**
 * Anchor event names emitted by Pump Solana programs.
 * Indexer maps these → same Postgres shapes as the EVM indexer where possible.
 */

export const FACTORY_EVENTS = {
  TokenCreated: "TokenCreated",
} as const;

export const CURVE_EVENTS = {
  TokenRegistered: "TokenRegistered",
  TradeEvent: "TradeEvent",
  FeeSplitEvent: "FeeSplitEvent",
  ReferrerSetEvent: "ReferrerSetEvent",
  /** Base CreatorFeeClaimed parity — pending fees require claim. */
  CreatorFeeClaimed: "CreatorFeeClaimed",
  /** Base ReferrerFeeClaimed parity. */
  ReferrerFeeClaimed: "ReferrerFeeClaimed",
  /** Base EmergencyEthSwept parity (liquidity vault drain). */
  EmergencyEthSwept: "EmergencyEthSwept",
} as const;

export const TREASURY_EVENTS = {
  TreasuryWithdraw: "TreasuryWithdraw",
} as const;

export type FactoryEventName = (typeof FACTORY_EVENTS)[keyof typeof FACTORY_EVENTS];
export type CurveEventName = (typeof CURVE_EVENTS)[keyof typeof CURVE_EVENTS];
export type TreasuryEventName = (typeof TREASURY_EVENTS)[keyof typeof TREASURY_EVENTS];

/** Logical board/trade handlers used by apps/indexer-sol. */
export const EVENT_TO_HANDLER = {
  TokenCreated: "onTokenCreated",
  TokenRegistered: "onTokenRegistered",
  TradeEvent: "onTrade",
  FeeSplitEvent: "onFeeSplit",
  ReferrerSetEvent: "onReferrerSet",
  CreatorFeeClaimed: "onCreatorFeeClaimed",
  ReferrerFeeClaimed: "onReferrerFeeClaimed",
  EmergencyEthSwept: "onEmergencyEthSwept",
  TreasuryWithdraw: "onTreasuryWithdraw",
} as const;

export type SolanaHandlerName = (typeof EVENT_TO_HANDLER)[keyof typeof EVENT_TO_HANDLER];
