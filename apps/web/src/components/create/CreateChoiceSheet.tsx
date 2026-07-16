"use client";

import Link from "next/link";
import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import { CREATE_DESTINATIONS } from "@/lib/create-destinations";
import { PumpIcon, faChevronRight } from "@/lib/icons";

type CreateChoiceSheetProps = {
  open: boolean;
  onClose: () => void;
};

/** Mobile bottom sheet — choose Token or Airdrop before navigating. */
export function CreateChoiceSheet({ open, onClose }: CreateChoiceSheetProps) {
  return (
    <AppBottomSheet
      open={open}
      onClose={onClose}
      ariaLabel="Create"
      title="Create"
      zIndex={100}
      panelClassName="max-h-[min(70dvh,28rem)] lg:hidden"
      bodyClassName="create-choice-sheet__body"
    >
      <nav className="create-choice-sheet__nav" aria-label="Create options">
        {CREATE_DESTINATIONS.map(({ href, label, description, icon }) => (
          <Link
            key={href}
            href={href}
            prefetch
            className="create-choice-sheet__option"
            onClick={onClose}
          >
            <PumpIcon icon={icon} className="create-choice-sheet__option-icon" aria-hidden />
            <span className="create-choice-sheet__option-copy">
              <span className="create-choice-sheet__option-label">{label}</span>
              <span className="create-choice-sheet__option-desc">{description}</span>
            </span>
            <PumpIcon
              icon={faChevronRight}
              className="create-choice-sheet__option-chevron"
              aria-hidden
            />
          </Link>
        ))}
      </nav>
    </AppBottomSheet>
  );
}
