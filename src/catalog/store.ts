import { create } from 'zustand';
import { categories, comparable, emptyFilters, getPart } from './catalog';
import type { CatalogFilters } from './types';
const KEY = 'circuitforge.library.v1';
export function loadLibraryFilters(): CatalogFilters {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (
      p &&
      typeof p.query === 'string' &&
      p.query.length <= 200 &&
      ['all', ...categories.map((c) => c.id)].includes(p.category) &&
      ['subcategory', 'manufacturer', 'interface'].every((k) => typeof p[k] === 'string') &&
      typeof p.insertable === 'boolean'
    )
      return p;
  } catch {
    /* Bad library preferences do not affect project data. */
  }
  return { ...emptyFilters };
}
interface LibraryState {
  workspace: 'design' | 'schematic' | 'components' | 'code';
  filters: CatalogFilters;
  detailId: string | null;
  compareIds: string[];
  compareOpen: boolean;
  advanced: boolean;
  message: string | null;
  navigate: (workspace: LibraryState['workspace']) => void;
  setFilters: (patch: Partial<CatalogFilters>) => void;
  openDetails: (id: string | null) => void;
  toggleCompare: (id: string) => void;
}
export const useLibraryStore = create<LibraryState>((set, get) => ({
  workspace: 'design',
  filters: loadLibraryFilters(),
  detailId: null,
  compareIds: [],
  compareOpen: false,
  advanced: false,
  message: null,
  navigate: (workspace) =>
    set({
      workspace,
      ...(workspace !== 'components' ? { detailId: null, compareOpen: false } : {}),
    }),
  setFilters: (patch) => {
    const filters = { ...get().filters, ...patch };
    let message = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(filters));
    } catch {
      message = 'Library filters could not be saved; this session still works.';
    }
    set({ filters, message });
  },
  openDetails: (detailId) => set({ detailId }),
  toggleCompare: (id) => {
    const ids = get().compareIds;
    if (ids.includes(id)) {
      set({ compareIds: ids.filter((x) => x !== id), message: null });
      return;
    }
    const next = [...ids, id];
    if (!getPart(id) || !comparable(next.map((id) => getPart(id)!))) {
      set({
        message:
          'Compare up to three products from the same subcategory. Clear the comparison to choose another category.',
      });
      return;
    }
    set({ compareIds: next, message: null });
  },
}));
