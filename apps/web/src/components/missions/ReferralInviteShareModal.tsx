"use client";

import { useMemo } from "react";
import { ShareSheetModal } from "@/components/ui/ShareSheetModal";
import { referralSharePayload } from "@/lib/share-links";
import { REWARDS_REFERRAL_INVITE } from "@/lib/rewards-copy";

type ReferralInviteShareModalProps = {
  open: boolean;
  onClose: () => void;
  address: string;
};

export function ReferralInviteShareModal({
  open,
  onClose,
  address,
}: ReferralInviteShareModalProps) {
  const sharePayload = useMemo(() => referralSharePayload(address), [address]);

  const footnote = (
    <>
      <p className="share-sheet-footnote-line">
        <strong>Challenge XP:</strong> {REWARDS_REFERRAL_INVITE.xpNote}
      </p>
      <p className="share-sheet-footnote-line">
        <strong>Referral earnings:</strong> {REWARDS_REFERRAL_INVITE.earningsNote}
      </p>
    </>
  );

  return (
    <ShareSheetModal
      open={open}
      onClose={onClose}
      payload={sharePayload}
      title={REWARDS_REFERRAL_INVITE.modalTitle}
      description={REWARDS_REFERRAL_INVITE.modalSubtitle}
      footnote={footnote}
    />
  );
}
