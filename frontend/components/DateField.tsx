import React, { useRef } from "react";
import { APPLICATION_DATE_FORMAT, formatDate } from "../utils/dateFormat";
import "./DateField.css";

/**
 * Application-standard date input.
 *
 * A native `<input type="date">` renders its visible text using the operating
 * system's regional format — the browser gives no API to override it, so the
 * same field reads 08/15/2026 on a US machine and 15/08/2026 on an Indian one.
 * That is precisely the ambiguity the application standard forbids.
 *
 * So the visible layer is our own text showing `DD/Mon/YYYY`, and a native date
 * input sits transparently on top to supply the real calendar picker, keyboard
 * support, and validation. The value contract is unchanged: `YYYY-MM-DD` in and
 * out, exactly like the native element it replaces.
 */
export interface DateFieldProps {
  /** Machine-readable `YYYY-MM-DD`, same as a native date input. */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  /** Accessible name; also the tooltip. */
  title?: string;
  placeholder?: string;
}

const DateField: React.FC<DateFieldProps> = ({
  value,
  onChange,
  min,
  max,
  disabled,
  className,
  title,
  placeholder = APPLICATION_DATE_FORMAT,
}) => {
  const nativeRef = useRef<any>(null);

  // Chromium/Safari expose showPicker(); elsewhere the transparent overlay still
  // receives the click and opens the picker on its own.
  const openPicker = () => {
    const input = nativeRef.current;
    if (!input || disabled) return;
    try { input.showPicker?.(); } catch { /* not supported — overlay handles it */ }
  };

  return (
    <span className={`date-field${disabled ? " disabled" : ""}${className ? ` ${className}` : ""}`}>
      <span className={`date-field-text${value ? "" : " placeholder"}`} aria-hidden="true">
        {value ? formatDate(value) : placeholder}
      </span>
      <svg className="date-field-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
      <input
        ref={nativeRef}
        className="date-field-native"
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        title={title ? `${title} (${APPLICATION_DATE_FORMAT})` : APPLICATION_DATE_FORMAT}
        aria-label={title || `Date, ${APPLICATION_DATE_FORMAT}`}
        onClick={openPicker}
        onFocus={openPicker}
        onChange={(event: any) => onChange(event.target.value)}
      />
    </span>
  );
};

export default DateField;
