import { faParachuteBox, faRocket } from "@/lib/pump-icons";
import type { PumpIconDefinition } from "@/components/icons/PumpIcon";

export type CreateDestination = {
  href: "/create" | "/airdrops/create";
  label: string;
  description: string;
  icon: PumpIconDefinition;
};

/** Shared Token / Airdrop destinations — header menu + mobile sheet. */
export const CREATE_DESTINATIONS: readonly CreateDestination[] = [
  {
    href: "/create",
    label: "Token",
    description: "Launch a meme on the bonding curve",
    icon: faRocket,
  },
  {
    href: "/airdrops/create",
    label: "Airdrop",
    description: "Fund and run a reward campaign",
    icon: faParachuteBox,
  },
] as const;
