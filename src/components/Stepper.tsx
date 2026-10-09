import { Minus, Plus } from 'lucide-react';
import { ru } from '@/i18n/ru';

interface StepperProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
}

export function Stepper({ value, min, max, step = 1, onChange, label }: StepperProps) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={ru.a11y.decrease}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
        className="bg-primary-100 text-primary-600 flex size-11 items-center justify-center rounded-[14px] disabled:opacity-40"
      >
        <Minus aria-hidden="true" className="size-5" />
      </button>
      <output aria-live="polite" className="min-w-12 text-center text-[1.15rem] font-semibold tabular-nums">
        {value}
      </output>
      <button
        type="button"
        aria-label={ru.a11y.increase}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
        className="bg-primary-100 text-primary-600 flex size-11 items-center justify-center rounded-[14px] disabled:opacity-40"
      >
        <Plus aria-hidden="true" className="size-5" />
      </button>
    </div>
  );
}
