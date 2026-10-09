import { create } from 'zustand';

/** Ephemeral session UI state (never the source of truth). */
interface SessionUiState {
  /** True when the current session was started by a tap in this page lifetime (iOS TTS gesture rule). */
  startedByGesture: boolean;
  setStartedByGesture: (v: boolean) => void;
  /** The resume prompt is shown at most once per app launch. */
  resumePrompted: boolean;
  setResumePrompted: () => void;
}

export const useSessionUi = create<SessionUiState>((set) => ({
  startedByGesture: false,
  setStartedByGesture: (startedByGesture) => set({ startedByGesture }),
  resumePrompted: false,
  setResumePrompted: () => set({ resumePrompted: true }),
}));
