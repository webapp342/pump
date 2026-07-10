/**
 * UI display status derived from DB/on-chain fields + wall-clock.
 * DB `status` stays coarse (ACTIVE / FINALIZED / CLOSED); this is for labels only.
 */

export type AirdropDisplayStatus =
  | "UPCOMING"
  | "QUALIFYING"
  | "FINALIZING"
  | "CLAIMABLE"
  | "CLOSED";

type StatusInput = {
  /** Raw DB status from indexer */
  status: string;
  qualifyStart: string;
  qualifyEnd: string;
  claimEnd?: string | null;
  merkleRoot?: string | null;
};

const CLAIM_MS = 24 * 60 * 60 * 1000;

export function getAirdropDisplayStatus(input: StatusInput): AirdropDisplayStatus {
  const now = Date.now();
  const qualifyStart = new Date(input.qualifyStart).getTime();
  const qualifyEnd = new Date(input.qualifyEnd).getTime();
  const claimEnd = input.claimEnd
    ? new Date(input.claimEnd).getTime()
    : qualifyEnd + CLAIM_MS;

  if (input.status === "CLOSED" || now > claimEnd) {
    return "CLOSED";
  }

  const finalized =
    input.status === "FINALIZED" || Boolean(input.merkleRoot && input.merkleRoot !== "0x");

  if (finalized) {
    return now >= qualifyEnd && now <= claimEnd ? "CLAIMABLE" : "CLOSED";
  }

  if (now < qualifyStart) {
    return "UPCOMING";
  }

  if (now >= qualifyStart && now <= qualifyEnd) {
    return "QUALIFYING";
  }

  return "FINALIZING";
}

/** Arena gift icon + token detail banner — upcoming or qualifying only. */
export function isPromotableAirdropStatus(status: AirdropDisplayStatus): boolean {
  return status === "UPCOMING" || status === "QUALIFYING";
}

export function formatAirdropDisplayStatus(status: AirdropDisplayStatus): string {
  switch (status) {
    case "UPCOMING":
      return "Upcoming";
    case "QUALIFYING":
      return "Qualifying";
    case "FINALIZING":
      return "Finalizing";
    case "CLAIMABLE":
      return "Claimable";
    case "CLOSED":
      return "Closed";
  }
}

const statusBadgeBase =
  "inline-flex shrink-0 items-center rounded-sm px-2.5 py-1 text-label font-semibold uppercase";

export function airdropStatusBadgeClass(status: AirdropDisplayStatus): string {
  switch (status) {
    case "UPCOMING":
      return `${statusBadgeBase} border border-pump-accent/30 bg-pump-accent/10 text-pump-accent`;
    case "QUALIFYING":
      return `${statusBadgeBase} border border-pump-success/35 bg-pump-success/12 text-pump-success`;
    case "FINALIZING":
      return `${statusBadgeBase} border border-pump-warning/35 bg-pump-warning/15 text-pump-warning`;
    case "CLAIMABLE":
      return `${statusBadgeBase} border border-pump-success/40 bg-pump-success/18 text-pump-success`;
    case "CLOSED":
      return `${statusBadgeBase} border border-pump-border/25 bg-pump-surface/55 text-pump-muted`;
  }
}
