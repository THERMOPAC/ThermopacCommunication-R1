/**
 * DateInput — shared DD/MM/YYYY date input component.
 *
 * Part of the global date standard (see client/src/lib/date-format.ts).
 *
 * - Displays and accepts dates in DD/MM/YYYY format (project UI standard).
 * - The `value` prop and `onChange` callback use YYYY-MM-DD (DB/API standard).
 * - Never use <input type="date"> directly in the UI — use this component instead.
 *
 * Usage:
 *   import { DateInput } from '@/components/ui/date-input';
 *
 *   <DateInput
 *     value={isoDate}          // "2026-05-14" or ""
 *     onChange={setIsoDate}    // receives "2026-05-14" or "" when incomplete
 *     className="h-8 w-36"
 *   />
 */

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';

interface DateInputProps {
  value: string;
  onChange: (isoDate: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

function displayToIso(display: string): string {
  const match = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function DateInput({
  value,
  onChange,
  className,
  disabled,
  placeholder = 'DD/MM/YYYY',
}: DateInputProps) {
  const [display, setDisplay] = useState(() => isoToDisplay(value));

  useEffect(() => {
    setDisplay(isoToDisplay(value));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setDisplay(raw);
    onChange(displayToIso(raw));
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={display}
      onChange={handleChange}
      maxLength={10}
      disabled={disabled}
      className={className}
    />
  );
}
