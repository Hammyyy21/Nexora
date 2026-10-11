import { useLibraryStore } from './store';
import { useFirmwareStore } from '../firmware/store';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { getPart } from './catalog';
import { useDesignLayout, type DesignPanel } from '../workspace/layout';
export function navigateWorkspace(workspace: 'design' | 'schematic' | 'components' | 'code') {
  useDesignLayout.getState().openDrawer(null);
  useLibraryStore.getState().navigate(workspace);
  if (workspace === 'components' && useDesignLayout.getState().compact)
    useDesignLayout.getState().setCollapsed(true);
  if (workspace === 'code') {
    useFirmwareStore.getState().setOpen(true);
    useDesignLayout.getState().setPanel('code');
  }
}
export function openToolPanel(panel: DesignPanel) {
  useDesignLayout.getState().openDrawer(null);
  if (['components', 'schematic'].includes(useLibraryStore.getState().workspace))
    useLibraryStore.getState().navigate('design');
  useDesignLayout.getState().setPanel(panel);
  if (panel === 'code') useFirmwareStore.getState().setOpen(true);
}
export function exploreReplacements() {
  const s = useWorkspaceStore.getState(),
    c = s.currentProject.components.find((c) => c.id === s.selectedComponentId);
  const part = getPart(c?.catalogId);
  const sub = part?.subcategory ?? (c?.type === 'microcontroller' ? 'Microcontrollers' : '');
  useLibraryStore.getState().setFilters({
    query: '',
    category:
      part?.category ??
      (c?.type === 'microcontroller'
        ? 'processors'
        : c?.type === 'sensor'
          ? 'sensors'
          : c?.type === 'mosfet'
            ? 'power'
            : 'all'),
    subcategory: sub,
    manufacturer: '',
    interface: '',
    insertable: true,
  });
  navigateWorkspace('components');
}
