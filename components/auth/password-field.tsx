"use client";

import { useState } from "react";

/**
 * A password input with a reveal toggle.
 *
 * The toggle is a real `<button type="button">` so it never submits the form
 * and stays reachable from the keyboard. Its accessible name is deliberately
 * "Show password" / "Hide password" rather than an icon alone — a bare eye
 * glyph tells a screen reader nothing.
 *
 * Visibility is local state and resets on every mount, so a revealed password
 * is never carried across a navigation.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error,
  hint,
  autoFocus,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  error?: string;
  hint?: string;
  autoFocus?: boolean;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          className="password-field__toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          // The field itself already takes focus on tab; the toggle sits after
          // it in DOM order, so no tabIndex juggling is needed.
          title={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="form-error">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function EyeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg {...iconProps}>
      <path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17.9 17.9 0 0 1-3.1 3.9M6.2 6.2A17.7 17.7 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </svg>
  );
}
