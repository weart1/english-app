import { useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { ru } from '@/i18n/ru';
import { splitTranslations } from '@/lib/normalize';

interface ChipInputProps {
  id: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  lang?: string;
  invalid?: boolean;
  describedBy?: string;
  /** Exposes the uncommitted text so the form can include it on save. */
  onPendingChange?: (text: string) => void;
}

/** Type a value and press Enter or comma to turn it into a chip. */
export function ChipInput({ id, values, onChange, placeholder, lang, invalid, describedBy, onPendingChange }: ChipInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (raw: string) => {
    const parts = splitTranslations(raw);
    if (parts.length) {
      const existing = new Set(values.map((v) => v.toLowerCase()));
      onChange([...values, ...parts.filter((p) => !existing.has(p.toLowerCase()))]);
    }
    setText('');
    onPendingChange?.('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (text.trim()) commit(text);
    } else if (e.key === 'Backspace' && !text && values.length) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div
      className={`flex min-h-12 flex-wrap items-center gap-1.5 rounded-[14px] border bg-white px-2 py-1.5 ${
        invalid ? 'border-danger-500' : 'focus-within:border-primary-500 border-[#dfe6f3]'
      }`}
      onClick={() => inputRef.current?.focus()}
    >
      {values.map((v) => (
        <span key={v} lang={lang} className="bg-primary-100 text-primary-600 inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-3 font-medium">
          {v}
          <button
            type="button"
            aria-label={ru.editor.removeChip(v)}
            onClick={(e) => {
              e.stopPropagation();
              onChange(values.filter((x) => x !== v));
            }}
            className="flex size-7 items-center justify-center rounded-full active:bg-white/60"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        lang={lang}
        value={text}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="enter"
        placeholder={values.length ? '' : placeholder}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={(e) => {
          const v = e.target.value;
          if (/[,;]/.test(v)) {
            commit(v);
          } else {
            setText(v);
            onPendingChange?.(v);
          }
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (text.trim()) commit(text);
        }}
        className="h-9 min-w-[8rem] flex-1 bg-transparent px-1 outline-none"
      />
    </div>
  );
}
