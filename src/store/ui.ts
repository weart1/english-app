import { create } from 'zustand';
import { EMPTY_FILTERS, type LibraryFilters, type LibrarySort } from '@/lib/library';
import type { SelectionCriteria } from '@/db/types';

interface LibraryState {
  query: string;
  filters: LibraryFilters;
  sort: LibrarySort;
  selecting: boolean;
  /** Selected word ids. Survives search/filter changes. */
  selected: ReadonlySet<string>;
  openRowId: string | null;
  setQuery: (q: string) => void;
  setFilters: (f: Partial<LibraryFilters>) => void;
  resetFilters: () => void;
  setSort: (s: LibrarySort) => void;
  startSelecting: (firstId?: string) => void;
  stopSelecting: () => void;
  toggle: (id: string) => void;
  selectMany: (ids: readonly string[]) => void;
  replaceSelection: (ids: readonly string[]) => void;
  clearSelection: () => void;
  setOpenRow: (id: string | null) => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  query: '',
  filters: EMPTY_FILTERS,
  sort: 'created',
  selecting: false,
  selected: new Set(),
  openRowId: null,
  setQuery: (query) => set({ query }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  resetFilters: () => set({ filters: EMPTY_FILTERS }),
  setSort: (sort) => set({ sort }),
  startSelecting: (firstId) =>
    set((s) => ({
      selecting: true,
      openRowId: null,
      selected: firstId ? new Set([...s.selected, firstId]) : s.selected,
    })),
  stopSelecting: () => set({ selecting: false, selected: new Set() }),
  toggle: (id) =>
    set((s) => {
      const next = new Set(s.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selected: next };
    }),
  selectMany: (ids) => set((s) => ({ selected: new Set([...s.selected, ...ids]) })),
  replaceSelection: (ids) => set({ selected: new Set(ids) }),
  clearSelection: () => set({ selected: new Set() }),
  setOpenRow: (openRowId) => set({ openRowId }),
}));

interface EditorState {
  open: boolean;
  wordId: string | null;
  /** Increments on every open so the form remounts with fresh state. */
  nonce: number;
  openNew: () => void;
  openEdit: (id: string) => void;
  close: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  open: false,
  wordId: null,
  nonce: 0,
  openNew: () => set((s) => ({ open: true, wordId: null, nonce: s.nonce + 1 })),
  openEdit: (id) => set((s) => ({ open: true, wordId: id, nonce: s.nonce + 1 })),
  close: () => set({ open: false }),
}));

/** Pre-fill for the session builder (from library selection, stats, word detail). */
interface BuilderPrefillState {
  prefill: Partial<SelectionCriteria> | null;
  setPrefill: (p: Partial<SelectionCriteria> | null) => void;
}

export const useBuilderPrefill = create<BuilderPrefillState>((set) => ({
  prefill: null,
  setPrefill: (prefill) => set({ prefill }),
}));
