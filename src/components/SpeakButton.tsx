import { Volume2 } from 'lucide-react';
import { useSpeech } from '@/hooks/useSpeech';
import { ru } from '@/i18n/ru';

interface SpeakButtonProps {
  text: string;
  rate?: number;
  className?: string;
  label?: string;
  size?: 'md' | 'lg';
}

/** 🔊 button. Hidden entirely when TTS is unavailable. */
export function SpeakButton({ text, rate, className = '', label = ru.a11y.speak, size = 'md' }: SpeakButtonProps) {
  const { supported, speak } = useSpeech();
  if (!supported) return null;
  return (
    <button
      type="button"
      aria-label={`${label}: ${text}`}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        speak(text, rate !== undefined ? { rate } : {});
      }}
      className={`bg-primary-100 text-primary-600 inline-flex shrink-0 items-center justify-center rounded-full active:scale-95 ${
        size === 'lg' ? 'size-14' : 'size-11'
      } ${className}`}
    >
      <Volume2 aria-hidden="true" className={size === 'lg' ? 'size-7' : 'size-5'} />
    </button>
  );
}
