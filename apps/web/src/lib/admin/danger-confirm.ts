/** Typed confirmation phrases for admin destructive actions. */

export const ADMIN_DANGER_PHRASES = {
  curveRecover: "RECOVER ESCROW",
  resumeTrading: "RESUME TRADING",
  pendingFee: "SWEEP PENDING FEE",
  pendingFeesAll: "SWEEP ALL PENDING FEES",
  withdrawProtocol: "WITHDRAW PROTOCOL",
  airdropSweep: "SWEEP AIRDROP",
  deletePromo: "DELETE CAMPAIGN",
} as const;

export type AdminDangerPhraseKey = keyof typeof ADMIN_DANGER_PHRASES;
