"use client";

import Link from "next/link";
import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import { CREATE_DESTINATIONS } from "@/lib/create-destinations";
import { PumpIcon, faPlus } from "@/lib/icons";

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
      panelClassName="max-h-[min(70dvh,28rem)]"
      bodyClassName="create-choice-sheet__body"
      headerLeading={
        <span className="create-choice-sheet__title-icon" aria-hidden>
          <PumpIcon icon={faPlus} className="h-4 w-4" />
        </span>
      }
    >
      <ul className="create-choice-sheet__list" role="list">
        {CREATE_DESTINATIONS.map(({ href, label, description, icon }) => (
          <li key={href}>
            <Link
              href={href}
              prefetch
              className="create-choice-sheet__option"
              onClick={onClose}
            >
              <span className="create-choice-sheet__option-icon" aria-hidden>
                <PumpIcon icon={icon} className="create-choice-sheet__option-glyph" />
              </span>
              <span className="create-choice-sheet__option-copy">
                <span className="create-choice-sheet__option-label">{label}</span>
                <span className="create-choice-sheet__option-desc">{description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </AppBottomSheet>
  );
}
