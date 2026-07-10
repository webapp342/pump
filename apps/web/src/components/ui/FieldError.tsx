import type { ReactNode } from "react";

/** Circular “!” affordance for invalid field controls (matches form error pattern). */
export function FieldErrorIcon() {
  return (
    <span className="field-error-icon" aria-hidden>
      !
    </span>
  );
}

export function FieldErrorMessage({ children }: { children?: ReactNode }) {
  if (children == null || children === false || children === "") return null;
  return (
    <p className="field-error" role="alert">
      {children}
    </p>
  );
}
