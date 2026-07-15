"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import {
  USER_AVATAR_IDS,
  USER_AVATAR_LABELS,
  type UserAvatarId,
} from "@/lib/user-avatars";
import { UserAvatar } from "@/components/user/UserAvatar";
import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import { useUserAvatar } from "@/components/user/UserAvatarProvider";
import { PumpIcon, faPen, faX } from "@/lib/icons";
import { resolveDisplayUsername, USERNAME_MAX_LENGTH } from "@/lib/username";

type AvatarPickerModalProps = {
  open: boolean;
  onClose: () => void;
};

export function AvatarPickerModal({ open, onClose }: AvatarPickerModalProps) {
  const { address } = useAccount();
  const { avatarId, username, updateProfile } = useUserAvatar();
  const [selectedId, setSelectedId] = useState<UserAvatarId>(USER_AVATAR_IDS[0]);
  const [usernameInput, setUsernameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedId(avatarId ?? USER_AVATAR_IDS[0]);
    setUsernameInput(username ?? "");
    setError(null);
  }, [open, avatarId, username]);

  if (!open || !address) return null;

  const defaultLabel = resolveDisplayUsername(address, null);

  function focusAvatarPicker() {
    avatarSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function onSave() {
    setError(null);
    setSaving(true);
    try {
      const nextUsername = usernameInput.trim() === "" ? null : usernameInput;
      await updateProfile({
        avatarId: selectedId,
        username: nextUsername,
      });
      onClose();
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Could not save profile. Try again.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppBottomSheet
      open={open}
      onClose={onClose}
      ariaLabel="Update profile"
      zIndex={70}
      panelClassName="profile-editor-modal !p-0"
      header={
        <>
          <button
            type="button"
            className="profile-editor-modal__avatar-trigger"
            onClick={focusAvatarPicker}
            aria-label="Choose avatar"
          >
            <UserAvatar address={address} avatarId={selectedId} size={72} selected />
            <span className="profile-editor-modal__avatar-badge" aria-hidden>
              <PumpIcon icon={faPen} className="h-3 w-3" />
            </span>
          </button>

          <div className="profile-editor-modal__intro">
            <h2 id="profile-editor-title" className="profile-editor-modal__title">
              Update your Pump profile
            </h2>
            <p className="profile-editor-modal__subtitle">
              Don&apos;t be a bot. Complete your profile.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="profile-editor-modal__close"
            aria-label="Close profile editor"
          >
            <PumpIcon icon={faX} className="h-4 w-4" />
          </button>
        </>
      }
      footer={
        <div className="profile-editor-modal__footer !p-0">
          <button
            type="button"
            onClick={() => void onSave()}
            className="primary-button profile-editor-modal__save"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      <div className="profile-editor-modal__body">
        <label className="profile-editor-modal__field">
          <div className="profile-editor-modal__field-head">
            <span className="profile-editor-modal__label">
              Username<span className="profile-editor-modal__required">*</span>
            </span>
            <span className="profile-editor-modal__limit">{USERNAME_MAX_LENGTH} max</span>
          </div>
          <input
            type="text"
            value={usernameInput}
            onChange={(event) => setUsernameInput(event.target.value)}
            maxLength={USERNAME_MAX_LENGTH}
            placeholder={defaultLabel}
            autoComplete="off"
            spellCheck={false}
            className="field-input"
          />
          <span className="field-hint mt-1.5 block">
            {USERNAME_MAX_LENGTH} characters max · letters, numbers, underscores · unique
          </span>
        </label>

        <div ref={avatarSectionRef} className="profile-editor-modal__avatars">
          <span className="profile-editor-modal__label">Avatar</span>
          <div className="profile-editor-modal__avatar-grid">
            {USER_AVATAR_IDS.map((id) => {
              const isSelected = id === selectedId;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={saving}
                  onClick={() => setSelectedId(id)}
                  className={
                    isSelected
                      ? "profile-editor-modal__avatar-option profile-editor-modal__avatar-option--active"
                      : "profile-editor-modal__avatar-option"
                  }
                  aria-label={`${USER_AVATAR_LABELS[id]} avatar`}
                  aria-pressed={isSelected}
                >
                  <UserAvatar address={address} avatarId={id} size={52} selected={isSelected} />
                </button>
              );
            })}
          </div>
        </div>

        {error ? <p className="notice-error text-body-sm">{error}</p> : null}
      </div>
    </AppBottomSheet>
  );
}
