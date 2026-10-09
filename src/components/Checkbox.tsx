import { Check } from 'lucide-react';

/** Visual round checkbox (the row itself carries the semantics). */
export function CheckMark({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        checked ? 'border-primary-500 bg-primary-500 text-white' : 'border-[#b7c3dc] bg-white'
      }`}
    >
      {checked && <Check className="size-4" strokeWidth={3} />}
    </span>
  );
}
