"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import { CyclopsLogo } from "@/components/brand/CyclopsLogo";
import { SignInProviders } from "@/components/wallet/SignInProviders";
import { PumpIcon, faArrowLeft } from "@/lib/icons";

type SignInModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function SignInModal({ open, onClose, onSuccess }: SignInModalProps) {
  const onSuccessRef = useRef(onSuccess);
  const pathname = usePathname();

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  if (!open) return null;

  return (
    <AppBottomSheet
      open={open}
      onClose={onClose}
      ariaLabel="Sign in"
      zIndex={110}
      hideCloseButton
      dragEntirePanel
      panelClassName="sign-in-modal shadow-xl shadow-black/30"
      bodyClassName="!p-0"
      footer={
        <p className="sign-in-modal__trust">
          By continuing, you agree to our{" "}
          <strong>Terms of Service</strong> and <strong>Privacy Policy</strong>
        </p>
      }
    >
      <div className="sign-in-modal__layout">
        <button
          type="button"
          onClick={onClose}
          className="sign-in-modal__back"
          aria-label="Back"
        >
          <PumpIcon icon={faArrowLeft} className="sign-in-modal__back-icon" aria-hidden />
        </button>

        <div className="sign-in-modal__stack">
          <div className="sign-in-modal__brand" aria-label="Cyclops">
            <CyclopsLogo variant="lockup" />
          </div>

          <h2 id="sign-in-title" className="sign-in-modal__title">
            Welcome back!
          </h2>

          <SignInProviders
            active={open}
            returnPath={pathname}
            onBeforeRedirect={() => onSuccessRef.current()}
            className="sign-in-modal__providers"
          />
        </div>
      </div>
    </AppBottomSheet>
  );
}

/** @deprecated use SignInModal */
export const TelegramLoginModal = SignInModal;
