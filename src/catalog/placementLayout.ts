import { create } from 'zustand';

export const PLACEMENT_LAYOUT_KEY = 'nexora.placement-layout.v1';
export function placementWidths(available: number) {
  const max = Math.max(180, Math.min(480, available * 0.45));
  return { min: Math.min(260, max), max };
}
function preferredWidth() {
  try {
    const value = Number(localStorage.getItem(PLACEMENT_LAYOUT_KEY));
    if (value >= 180 && value <= 480) return value;
  } catch {
    /* Session settings work without storage. */
  }
  return 300;
}
export const usePlacementLayout = create<{
  width: number;
  collapsed: boolean;
  setWidth: (width: number) => void;
  setCollapsed: (collapsed: boolean) => void;
}>((set) => ({
  width: preferredWidth(),
  collapsed: false,
  setWidth: (width) => {
    if (!Number.isFinite(width)) return;
    set({ width });
    try {
      localStorage.setItem(PLACEMENT_LAYOUT_KEY, String(width));
    } catch {
      /* Session settings work without storage. */
    }
  },
  setCollapsed: (collapsed) => set({ collapsed }),
}));
