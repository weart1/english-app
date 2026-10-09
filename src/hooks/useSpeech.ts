import { useCallback, useEffect, useState } from 'react';
import { useSettings } from '@/db/queries';

/**
 * Text-to-speech wrapper around window.speechSynthesis.
 * - Voices load asynchronously on iOS: wait for `voiceschanged` (2 s timeout).
 * - Speech only works after a user gesture on iOS; callers must not auto-play on load.
 * - Every speak() cancels the previous utterance so they never stack up.
 */

export function speechApiAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

let unlocked = false;

/**
 * iOS only lets a page speak if the first speak() happens inside a user-gesture
 * handler. Call this from a tap handler (e.g. "Начать"): a silent utterance
 * unlocks speech so later automatic playback works.
 */
export function unlockSpeech(): void {
  if (unlocked || !speechApiAvailable()) return;
  unlocked = true;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    unlocked = false;
  }
}

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;
let cachedVoices: SpeechSynthesisVoice[] = [];
const listeners = new Set<(v: SpeechSynthesisVoice[]) => void>();

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!speechApiAvailable()) return Promise.resolve([]);
  if (voicesPromise) return voicesPromise;
  const synth = window.speechSynthesis;
  // Keep the cache fresh if the system adds voices later.
  synth.addEventListener?.('voiceschanged', () => {
    const v = synth.getVoices();
    if (v.length) {
      cachedVoices = v;
      listeners.forEach((l) => l(v));
    }
  });
  voicesPromise = new Promise((resolve) => {
    const initial = synth.getVoices();
    if (initial.length) {
      cachedVoices = initial;
      resolve(initial);
      return;
    }
    const done = () => {
      window.clearTimeout(timer);
      synth.removeEventListener?.('voiceschanged', onChange);
      cachedVoices = synth.getVoices();
      resolve(cachedVoices);
    };
    const onChange = () => {
      if (synth.getVoices().length) done();
    };
    const timer = window.setTimeout(done, 2000);
    synth.addEventListener?.('voiceschanged', onChange);
  });
  return voicesPromise;
}

export function englishVoices(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices
    .filter((v) => /^en([-_]|$)/i.test(v.lang))
    .sort((a, b) => rankVoice(a) - rankVoice(b) || a.name.localeCompare(b.name));
}

function rankVoice(v: SpeechSynthesisVoice): number {
  const lang = v.lang.replace('_', '-').toLowerCase();
  let r = lang === 'en-us' ? 0 : lang === 'en-gb' ? 1 : 2;
  if (!v.localService) r += 3; // prefer offline voices
  return r;
}

/** Picks the saved voice if still present, else the best English voice. */
export function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  preferredURI: string | undefined,
): SpeechSynthesisVoice | undefined {
  if (preferredURI) {
    const saved = voices.find((v) => v.voiceURI === preferredURI);
    if (saved) return saved;
  }
  return englishVoices(voices)[0];
}

export type SpeechStatus = 'loading' | 'ready' | 'unsupported';

export interface SpeakOptions {
  rate?: number;
}

export function useSpeech() {
  const settings = useSettings();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(cachedVoices);
  const [status, setStatus] = useState<SpeechStatus>(() =>
    !speechApiAvailable() ? 'unsupported' : cachedVoices.length ? 'ready' : 'loading',
  );

  useEffect(() => {
    if (!speechApiAvailable()) return;
    let alive = true;
    const onVoices = (v: SpeechSynthesisVoice[]) => {
      if (!alive) return;
      setVoices(v);
      setStatus('ready');
    };
    listeners.add(onVoices);
    void loadVoices().then((v) => {
      if (!alive) return;
      setVoices(v);
      setStatus(v.length ? 'ready' : 'unsupported');
    });
    return () => {
      alive = false;
      listeners.delete(onVoices);
    };
  }, []);

  const cancel = useCallback(() => {
    if (speechApiAvailable()) window.speechSynthesis.cancel();
  }, []);

  const speak = useCallback(
    (text: string, opts: SpeakOptions = {}) => {
      if (!speechApiAvailable() || !text.trim()) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(voices.length ? voices : synth.getVoices(), settings.ttsVoiceURI);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else {
        u.lang = 'en-US';
      }
      u.rate = opts.rate ?? settings.ttsRate;
      synth.speak(u);
    },
    [voices, settings.ttsVoiceURI, settings.ttsRate],
  );

  return {
    supported: status !== 'unsupported',
    status,
    voices: englishVoices(voices),
    speak,
    cancel,
  };
}
