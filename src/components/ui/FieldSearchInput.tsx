import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { Search } from "lucide-react";
import { ICON_STROKE } from "@/lib/icons";

type FieldSearchInputProps = InputHTMLAttributes<HTMLInputElement> & {
  wrapperClassName?: string;
  /** Renders inside the input border on the right (e.g. view toggle). */
  endAdornment?: ReactNode;
  /** Removes outer border — parent `.arena-search-group` provides the shell. */
  embedded?: boolean;
  /** Input + icon only; parent supplies `.arena-search-group` shell and siblings. */
  fieldOnly?: boolean;
};

export const FieldSearchInput = forwardRef<HTMLInputElement, FieldSearchInputProps>(
  function FieldSearchInput(
    { className = "", wrapperClassName = "", endAdornment, embedded = false, fieldOnly = false, ...props },
    ref
  ) {
    const inputClass = embedded
      ? `arena-search-input h-9 w-full min-w-0 bg-transparent pl-9 pr-2 ${className}`
      : `field-input h-9 w-full bg-pump-surface/75 pl-9 ${className}`;

    const searchField = (
      <div className="arena-search-field relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pump-muted"
          strokeWidth={ICON_STROKE}
          aria-hidden
        />
        <input ref={ref} type="search" className={inputClass} {...props} />
      </div>
    );

    if (fieldOnly) {
      return searchField;
    }

    if (endAdornment) {
      return (
        <div className={`arena-search-group ${wrapperClassName}`}>
          {searchField}
          <div className="arena-search-end">{endAdornment}</div>
        </div>
      );
    }

    return (
      <div className={`relative ${wrapperClassName}`}>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pump-muted"
          strokeWidth={ICON_STROKE}
          aria-hidden
        />
        <input ref={ref} type="search" className={inputClass} {...props} />
      </div>
    );
  }
);
