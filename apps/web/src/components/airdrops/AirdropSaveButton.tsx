"use client";

import { useAirdropSaves } from "@/components/airdrops/AirdropSavesProvider";
import { PumpIcon, faBookmarkRegular, faBookmarkSolid } from "@/lib/icons";

export function AirdropSaveButton({
  airdropId,
  className = "",
}: {
  airdropId: string;
  className?: string;
}) {
  const { isSaved, toggleSave } = useAirdropSaves();
  const saved = isSaved(airdropId);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleSave(airdropId);
      }}
      className={`airdrops-list__save inline-flex h-7 w-7 shrink-0 items-center justify-center transition ${
        saved ? "text-pump-accent" : "text-pump-muted hover:text-pump-text"
      }${className ? ` ${className}` : ""}`}
      aria-label={saved ? "Remove from saved" : "Save campaign"}
    >
      <PumpIcon icon={saved ? faBookmarkSolid : faBookmarkRegular} className="h-3.5 w-3.5" />
    </button>
  );
}
