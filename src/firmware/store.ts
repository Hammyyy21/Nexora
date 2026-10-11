import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { create } from 'zustand';
import { demoSource, type FirmwareLanguage } from './model';

// Retain the legacy storage key so existing saves survive the CircuitForge rename.
export const FIRMWARE_KEY = 'nexora.firmware.v1';
export const MIN_PANEL_HEIGHT = 230;
export const MAX_PANEL_HEIGHT = 680;
export function clampPanelHeight(height: number, available = MAX_PANEL_HEIGHT) {
  const max = Math.max(0, Math.min(MAX_PANEL_HEIGHT, available));
  return Math.min(
    max,
    Math.max(Math.min(MIN_PANEL_HEIGHT, max), Number.isFinite(height) ? height : 310),
  );
}
interface Draft {
  source: string;
  savedSource: string;
}
interface Data {
  open: boolean;
  height: number;
  tab: FirmwareLanguage;
  activeFile: 'cooling';
  drafts: Record<string, Draft>;
}
const defaults: Data = { open: false, height: 310, tab: 'c', activeFile: 'cooling', drafts: {} };
export function loadFirmware(): Data & { storageError: string | null } {
  try {
    const raw = localStorage.getItem(FIRMWARE_KEY);
    if (!raw) return { ...defaults, drafts: {}, storageError: null };
    const data = JSON.parse(raw);
    if (
      data.version !== 1 ||
      typeof data.open !== 'boolean' ||
      !Number.isFinite(data.height) ||
      !['c', 'assembly', 'machine'].includes(data.tab) ||
      data.activeFile !== 'cooling' ||
      !data.drafts ||
      typeof data.drafts !== 'object' ||
      Array.isArray(data.drafts) ||
      Object.entries(data.drafts).length > 20 ||
      Object.entries(data.drafts).some(([key, draft]) => {
        const d = draft as Draft;
        return (
          key === '__proto__' ||
          !d ||
          typeof d.source !== 'string' ||
          typeof d.savedSource !== 'string' ||
          d.source.length > 200000 ||
          d.savedSource.length > 200000
        );
      })
    )
      throw new Error('Invalid saved firmware');
    return {
      open: data.open,
      height: clampPanelHeight(data.height),
      tab: data.tab,
      activeFile: 'cooling',
      drafts: data.drafts,
      storageError: null,
    };
  } catch {
    return {
      ...defaults,
      drafts: {},
      storageError:
        'Saved firmware could not be loaded. The demo is available; reset the source to replace damaged data, or download your edits before leaving.',
    };
  }
}
interface State extends Data {
  expanded: boolean;
  editing: boolean;
  storageError: string | null;
  setOpen: (open: boolean) => void;
  setTab: (tab: FirmwareLanguage) => void;
  setHeight: (height: number) => void;
  setExpanded: (expanded: boolean) => void;
  setEditing: (editing: boolean) => void;
  editSource: (project: string, source: string) => void;
  initializeSource: (project: string, source: string) => void;
  saveSource: (project: string) => void;
  resetSource: (project: string) => void;
  hydrate: () => void;
}
export const genericSource = `// Nexora project firmware (starter C)\n// Select a target and implement real board-specific drivers before compiling.\n\nint main(void) {\n  while (1) {\n    // TODO: application logic\n  }\n}\n`;
export const defaultSourceFor = (project: string) =>
  project === 'smart-cooling-01' ? demoSource : genericSource;
export const draftFor = (state: Pick<Data, 'drafts'>, project: string): Draft =>
  Object.hasOwn(state.drafts, project)
    ? state.drafts[project]
    : { source: defaultSourceFor(project), savedSource: defaultSourceFor(project) };
export const useFirmwareStore = create<State>((set, get) => {
  const update = (patch: Partial<Data>) => {
    // Do not erase unreadable drafts merely by opening or resizing the panel.
    if (get().storageError && !patch.drafts) {
      set(patch);
      return;
    }
    const next = { ...get(), ...patch };
    try {
      localStorage.setItem(
        FIRMWARE_KEY,
        JSON.stringify({
          version: 1,
          open: next.open,
          height: next.height,
          tab: next.tab,
          activeFile: next.activeFile,
          drafts: next.drafts,
        }),
      );
      set({ ...patch, storageError: null });
    } catch {
      set({
        ...patch,
        ...(patch.drafts
          ? {
              drafts: Object.fromEntries(
                Object.entries(patch.drafts).map(([id, draft]) => [
                  id,
                  { ...draft, savedSource: draftFor(get(), id).savedSource },
                ]),
              ),
            }
          : {}),
        storageError:
          'Browser storage is unavailable or full. Your edits remain in this session; download C to keep them.',
      });
    }
  };
  return {
    ...loadFirmware(),
    expanded: false,
    editing: false,
    setOpen: (open) => update({ open }),
    setTab: (tab) => update({ tab, open: true }),
    setHeight: (height) => update({ height: clampPanelHeight(height) }),
    setExpanded: (expanded) => set({ expanded }),
    setEditing: (editing) => set({ editing }),
    initializeSource: (project, source) => {
      if (source.length <= 200000 && !Object.hasOwn(get().drafts, project))
        update({ drafts: { ...get().drafts, [project]: { source, savedSource: source } } });
    },
    editSource: (project, source) => {
      if (source.length > 200000) {
        set({
          storageError: 'Source exceeds the 200 KB demo limit. Download or shorten your source.',
        });
        return;
      }
      update({ drafts: { ...get().drafts, [project]: { ...draftFor(get(), project), source } } });
      const workspace = useWorkspaceStore.getState();
      if (
        workspace.currentProject.id === project &&
        workspace.currentProject.firmwareSource !== source
      )
        useWorkspaceStore.setState({
          currentProject: { ...workspace.currentProject, firmwareSource: source },
        });
    },
    saveSource: (project) => {
      const { source } = draftFor(get(), project);
      update({ drafts: { ...get().drafts, [project]: { source, savedSource: source } } });
    },
    resetSource: (project) => {
      get().editSource(project, defaultSourceFor(project));
      get().saveSource(project);
    },
    hydrate: () => set(loadFirmware()),
  };
});

// Project revisions (including AI approval, undo and import) restore the editable source.
useWorkspaceStore.subscribe((state, previous) => {
  const project = state.currentProject;
  if (
    project !== previous.currentProject &&
    project.firmwareSource !== undefined &&
    draftFor(useFirmwareStore.getState(), project.id).source !== project.firmwareSource
  )
    useFirmwareStore.getState().editSource(project.id, project.firmwareSource);
});
