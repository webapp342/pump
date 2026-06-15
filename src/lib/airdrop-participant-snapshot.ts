import type { AirdropDisplayStatus } from "@/lib/airdrop-status";

export type ParticipantProgressInput = {
  socialTasksTotal: number;
  socialTasksCompleted: number;
  socialGatePassed: boolean;
  hasHoldRule: boolean;
  hasBuyRule: boolean;
  minHoldTarget: number;
  minBuyTarget: number;
  holdCurrent: number;
  buyCurrent: number;
};

export type ParticipantProgressResult = {
  holdMet: boolean;
  buyMet: boolean;
  onchainQualified: boolean;
  progressPct: number;
};

export function computeParticipantProgress(
  input: ParticipantProgressInput
): ParticipantProgressResult {
  const socialPct =
    input.socialTasksTotal > 0
      ? (input.socialTasksCompleted / input.socialTasksTotal) * 100
      : 100;

  const onchainUnlocked = input.socialGatePassed;
  let holdMet = !input.hasHoldRule;
  let buyMet = !input.hasBuyRule;
  let holdPct = 100;
  let buyPct = 100;

  if (onchainUnlocked && input.hasHoldRule && input.minHoldTarget > 0) {
    holdMet = input.holdCurrent >= input.minHoldTarget;
    holdPct = Math.min(100, (input.holdCurrent / input.minHoldTarget) * 100);
  }

  if (onchainUnlocked && input.hasBuyRule && input.minBuyTarget > 0) {
    buyMet = input.buyCurrent >= input.minBuyTarget;
    buyPct = Math.min(100, (input.buyCurrent / input.minBuyTarget) * 100);
  }

  const hasOnchain = input.hasHoldRule || input.hasBuyRule;
  const onchainPct =
    !hasOnchain || !onchainUnlocked
      ? 0
      : input.hasHoldRule && input.hasBuyRule
        ? (holdPct + buyPct) / 2
        : input.hasHoldRule
          ? holdPct
          : buyPct;

  const onchainQualified = onchainUnlocked && hasOnchain && holdMet && buyMet;

  let progressPct: number;
  if (input.socialTasksTotal > 0 && hasOnchain) {
    progressPct = Math.round(socialPct * 0.3 + onchainPct * 0.7);
  } else if (input.socialTasksTotal > 0) {
    progressPct = Math.round(socialPct);
  } else if (hasOnchain) {
    progressPct = Math.round(onchainPct);
  } else {
    progressPct = 100;
  }

  return {
    holdMet,
    buyMet,
    onchainQualified,
    progressPct: Math.min(100, Math.max(0, progressPct)),
  };
}

export type AirdropNextAction = "continue" | "claim" | "wait" | "view";

export function deriveAirdropNextAction(
  displayStatus: AirdropDisplayStatus,
  opts: {
    viewerRank: number | null;
    claimedAt: string | null;
    onchainQualified?: boolean;
  }
): AirdropNextAction {
  if (opts.claimedAt) return "view";
  if (displayStatus === "CLAIMABLE" && opts.viewerRank != null) return "claim";
  if (displayStatus === "FINALIZING") return "wait";
  if (displayStatus === "QUALIFYING" && opts.onchainQualified) return "wait";
  if (displayStatus === "QUALIFYING" || displayStatus === "UPCOMING") return "continue";
  return "view";
}

export function airdropCountdownMeta(item: {
  displayStatus: AirdropDisplayStatus;
  qualifyStart: string;
  qualifyEnd: string;
  claimEnd: string | null;
}): { label: string; time: string | null } {
  switch (item.displayStatus) {
    case "UPCOMING":
      return { label: "Qualify starts in", time: item.qualifyStart };
    case "QUALIFYING":
      return { label: "Qualify ends in", time: item.qualifyEnd };
    case "CLAIMABLE":
      return {
        label: item.claimEnd ? "Claim ends in" : "Claim open",
        time: item.claimEnd,
      };
    case "FINALIZING":
      return { label: "Allocating winners", time: null };
    default:
      return { label: "", time: null };
  }
}

export function formatParticipantRankLabel(
  viewerRank: number | null,
  opts: { displayStatus: AirdropDisplayStatus; onchainQualified: boolean }
): string {
  if (viewerRank != null) return `#${viewerRank}`;
  if (opts.displayStatus === "QUALIFYING" && opts.onchainQualified) return "100+";
  if (opts.displayStatus === "QUALIFYING") return "—";
  return "—";
}

export function nextActionLabel(action: AirdropNextAction): string {
  switch (action) {
    case "continue":
      return "Continue";
    case "claim":
      return "Claim";
    case "wait":
      return "Pending";
    case "view":
      return "View";
  }
}
