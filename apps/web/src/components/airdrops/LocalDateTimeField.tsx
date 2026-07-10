"use client";

import { useId, type ReactNode } from "react";
import { FieldErrorIcon, FieldErrorMessage } from "@/components/ui/FieldError";

type LocalDateTimeFieldProps = {
  id?: string;
  label: ReactNode;
  value: string;
  min?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string | null;
  /** When false, still styles as invalid but skips the message (shared message elsewhere). */
  showErrorMessage?: boolean;
};

function splitLocalDatetime(value: string): { date: string; time: string } {
  if (!value || !value.includes("T")) {
    return { date: "", time: "" };
  }
  const [date = "", timePart = ""] = value.split("T");
  const time = timePart.slice(0, 5);
  return { date, time };
}

function joinLocalDatetime(date: string, time: string): string {
  if (!date) return "";
  const safeTime = time && /^\d{2}:\d{2}$/.test(time) ? time : "00:00";
  return `${date}T${safeTime}`;
}

function splitMin(min?: string): { date?: string; time?: string } {
  if (!min) return {};
  const { date, time } = splitLocalDatetime(min);
  return { date: date || undefined, time: time || undefined };
}

/** Date + time fields that compose the same `YYYY-MM-DDTHH:mm` value as `datetime-local`. */
export function LocalDateTimeField({
  id,
  label,
  value,
  min,
  onChange,
  disabled = false,
  error = null,
  showErrorMessage = true,
}: LocalDateTimeFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const { date, time } = splitLocalDatetime(value);
  const minParts = splitMin(min);
  const timeMin = minParts.date && date === minParts.date ? minParts.time : undefined;
  const hasError = Boolean(error);

  return (
    <div className={`min-w-0 max-w-full${hasError ? " field-group--error" : ""}`}>
      <label className="field-label inline-flex items-center gap-1" htmlFor={`${fieldId}-date`}>
        {label}
      </label>
      <div className="airdrop-local-datetime mt-1 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
        <div className={`field-control min-w-0${hasError ? " field-control--error" : ""}`}>
          <input
            id={`${fieldId}-date`}
            type="date"
            className={`field-input airdrop-local-datetime__input${hasError ? " field-input--error" : ""}`}
            value={date}
            min={minParts.date}
            disabled={disabled}
            aria-invalid={hasError || undefined}
            onChange={(e) => onChange(joinLocalDatetime(e.target.value, time || "00:00"))}
          />
          {hasError ? <FieldErrorIcon /> : null}
        </div>
        <div className={`field-control min-w-0${hasError ? " field-control--error" : ""}`}>
          <input
            id={`${fieldId}-time`}
            type="time"
            className={`field-input airdrop-local-datetime__input${hasError ? " field-input--error" : ""}`}
            value={time}
            min={timeMin}
            disabled={disabled || !date}
            step={60}
            aria-invalid={hasError || undefined}
            onChange={(e) => onChange(joinLocalDatetime(date, e.target.value))}
          />
          {hasError ? <FieldErrorIcon /> : null}
        </div>
      </div>
      <FieldErrorMessage>{showErrorMessage ? error : null}</FieldErrorMessage>
    </div>
  );
}
