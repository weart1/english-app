import { useId, type ReactNode } from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}

/** iOS-style switch row. */
export function Toggle({ checked, onChange, label, hint, disabled }: ToggleProps) {
  const id = useId();
  return (
    <div className="flex min-h-12 items-center gap-3 py-1">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block font-medium">
          {label}
        </label>
        {hint && <p className="text-muted text-caption mt-0.5">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors disabled:opacity-40 ${
          checked ? 'bg-success-500' : 'bg-[#d5dceb]'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[20px]' : ''
          }`}
        />
      </button>
    </div>
  );
}
