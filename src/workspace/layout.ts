import { create } from 'zustand';
export const designPanels = ['explorer', 'workspace', 'inspector', 'code', 'ai'] as const;
export type DesignPanel = (typeof designPanels)[number];
export const LAYOUT_KEY = 'nexora.workspace-layout.v1';
export const MIN_PANEL_WIDTH = 300;
export const MAX_PANEL_WIDTH = 800;
export function clampPanelWidth(width: number) {
  return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, Number.isFinite(width) ? width : 360));
}
const defaults = {
  panel: 'explorer' as DesignPanel,
  width: 360,
  collapsed: false,
  focusMode: false,
};
export function loadDesignLayout() {
  try {
    const data = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null');
    if (
      data &&
      designPanels.includes(data.panel) &&
      typeof data.width === 'number' &&
      Number.isFinite(data.width) &&
      typeof data.collapsed === 'boolean' &&
      typeof data.focusMode === 'boolean'
    ) {
      return {
        panel: data.panel as DesignPanel,
        width: clampPanelWidth(data.width),
        collapsed: data.collapsed,
        focusMode: data.focusMode,
      };
    }
  } catch {
    /* Unavailable or damaged preferences must not prevent opening the workspace. */
  }
  return { ...defaults };
}
interface DesignLayout {
  panel: DesignPanel;
  width: number;
  collapsed: boolean;
  expanded: boolean;
  focusMode: boolean;
  compact: boolean;
  drawer: 'components' | 'boards' | null;
  setPanel: (panel: DesignPanel) => void;
  setWidth: (width: number) => void;
  setCollapsed: (collapsed: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  setFocusMode: (focusMode: boolean) => void;
  setCompact: (compact: boolean) => void;
  openDrawer: (drawer: DesignLayout['drawer']) => void;
}
export const useDesignLayout = create<DesignLayout>((set, get) => {
  const update = (patch: Partial<typeof defaults>) => {
    set(patch);
    const { panel, width, collapsed, focusMode } = get();
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ panel, width, collapsed, focusMode }));
    } catch {
      /* Session state remains usable if storage is full or disabled. */
    }
  };
  return {
    ...loadDesignLayout(),
    expanded: false,
    compact: false,
    drawer: null,
    setPanel: (panel) => update({ panel, collapsed: false }),
    setWidth: (width) => update({ width: clampPanelWidth(width) }),
    setCollapsed: (collapsed) => update({ collapsed }),
    setExpanded: (expanded) => set({ expanded }),
    setFocusMode: (focusMode) => update({ focusMode }),
    setCompact: (compact) => set({ compact }),
    openDrawer: (drawer) => set({ drawer }),
  };
});
export function adjacentPanel(panel: DesignPanel, direction: number): DesignPanel {
  return designPanels[
    Math.max(0, Math.min(designPanels.length - 1, designPanels.indexOf(panel) + direction))
  ];
}
