interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
}

/** Segmented control (radio group). */
export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="bg-primary-100/70 flex rounded-[15px] p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={`min-h-11 flex-1 rounded-[12px] px-2 text-[0.94rem] font-semibold transition-colors disabled:opacity-40 ${
              active ? 'text-primary-600 bg-white shadow-card' : 'text-muted'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
