import { assessPosition, movable, validPosition } from '../lib/transforms';
import { getPart } from '../catalog/catalog';
import { logicalPorts, validateConnection } from '../schematic/model';
import { canReplace } from '../catalog/compatibility';
import { createInstance, placementOrigin } from '../catalog/instances';
import { create } from 'zustand';
import {
  validBoardConfiguration,
  presetBoardConfiguration,
  type BoardConfiguration,
} from '../workspace/boardSpecifications';
import { isBoardTemplate, type BoardTemplateId } from '../workspace/boardTemplates';
import { useDesignLayout } from '../workspace/layout';
import { demoProject } from '../data/demoProject';
import { cloneProject, loadProject, saveProject } from '../lib/project';
import type {
  AssistantMessage,
  CameraView,
  HardwareComponent,
  Project,
  SchematicEndpoint,
  Tool,
  ViewMode,
  Vec3,
} from '../types/workspace';
interface WorkspaceState {
  dragMode: boolean;
  transformPointerActive: boolean;
  transformError: string | null;
  componentDrag: { id: string; position: Vec3; project: Project; mode: ViewMode } | null;
  setDragMode: (enabled: boolean) => void;
  setPlacementMode: (mode: 'free' | 'board') => void;
  moveComponent: (id: string, position: Vec3) => boolean;
  beginComponentDrag: (id: string) => boolean;
  previewComponentDrag: (position: Vec3) => boolean;
  finishComponentDrag: () => void;
  cancelComponentDrag: () => void;
  currentProject: Project;
  connectPorts: (from: SchematicEndpoint, to: SchematicEndpoint) => string | null;
  removeConnection: (id: string) => boolean;
  selectedComponentId: string | null;
  activeViewMode: ViewMode;
  activeTool: Tool;
  cameraView: CameraView;
  cameraRequest: number;
  lightIntensity: number;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  labelsVisible: boolean;
  gridVisible: boolean;
  quality: 'high' | 'low';
  reducedMotion: boolean;
  settingsOpen: boolean;
  demoAssistantMessages: AssistantMessage[];
  undoHistory: Project[];
  redoHistory: Project[];
  savedSnapshot: string | null;
  notice: string | null;
  placement: HardwareComponent | null;
  beginPlacement: (catalogId: string) => boolean;
  movePlacement: (
    position: HardwareComponent['position'],
    rotation?: HardwareComponent['rotation'],
  ) => void;
  resetPlacement: () => void;
  cancelPlacement: () => void;
  confirmPlacement: () => void;
  replaceComponent: (id: string, catalogId: string) => boolean;
  setFirmwareTarget: (id: string) => void;
  configureBoard: (configuration: BoardConfiguration) => void;
  setBoardTemplate: (id: BoardTemplateId) => void;
  selectComponent: (id: string | null) => void;
  editComponent: (
    id: string,
    patch: Partial<
      Pick<
        HardwareComponent,
        'position' | 'rotation' | 'material' | 'color' | 'opacity' | 'visible'
      >
    >,
  ) => void;
  setViewMode: (mode: ViewMode) => void;
  setTool: (tool: Tool) => void;
  requestCamera: (view: CameraView) => void;
  toggle: (
    key: 'sidebarOpen' | 'inspectorOpen' | 'labelsVisible' | 'gridVisible' | 'settingsOpen',
  ) => void;
  setQuality: (value: 'high' | 'low') => void;
  setReducedMotion: (value: boolean) => void;
  undo: () => void;
  redo: () => void;
  save: () => void;
  load: () => void;
  importProject: (p: Project) => void;
  activateProject: (p: Project, messages?: AssistantMessage[]) => void;
  applyProjectRevision: (p: Project) => void;
  reset: () => void;
  showAll: () => void;
  notify: (text: string | null) => void;
  addMessage: (role: AssistantMessage['role'], text: string) => void;
}
export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  dragMode: false,
  transformPointerActive: false,
  transformError: null,
  componentDrag: null,
  setDragMode: (dragMode) => set({ dragMode, componentDrag: null, transformError: null }),
  cancelComponentDrag: () => set({ componentDrag: null, transformError: null }),
  setPlacementMode: (placementMode) =>
    set((s) =>
      s.currentProject.placementMode === placementMode
        ? {}
        : {
            componentDrag: null,
            transformError: null,
            currentProject: { ...s.currentProject, placementMode },
            undoHistory: [...s.undoHistory.slice(-49), cloneProject(s.currentProject)],
            redoHistory: [],
          },
    ),
  moveComponent: (id, position) => {
    const s = get();
    const c = s.currentProject.components.find((item) => item.id === id);
    if (!c || !movable(c)) {
      set({ transformError: 'This component is fixed.' });
      return false;
    }
    if (s.componentDrag || s.placement) {
      set({ transformError: 'Finish or cancel the current placement first.' });
      return false;
    }
    const result = assessPosition(s.currentProject, c, position);
    if (!result.valid) {
      set({ transformError: result.error });
      return false;
    }
    if (c.position.every((n, i) => n === position[i])) {
      set({ transformError: null });
      return true;
    }
    set({
      currentProject: {
        ...s.currentProject,
        components: s.currentProject.components.map((item) =>
          item.id === id ? { ...item, position: [...position] as Vec3 } : item,
        ),
      },
      undoHistory: [...s.undoHistory.slice(-49), cloneProject(s.currentProject)],
      redoHistory: [],
      transformError: null,
    });
    return true;
  },
  beginComponentDrag: (id) => {
    const s = get();
    const c = s.currentProject.components.find((item) => item.id === id);
    if (
      !s.dragMode ||
      s.placement ||
      s.componentDrag ||
      s.selectedComponentId !== id ||
      !c?.visible ||
      !movable(c)
    )
      return false;
    set({
      componentDrag: {
        id,
        position: [...c.position],
        project: s.currentProject,
        mode: s.activeViewMode,
      },
      transformPointerActive: true,
      transformError: null,
    });
    return true;
  },
  previewComponentDrag: (position) => {
    const s = get(),
      drag = s.componentDrag;
    if (!drag || drag.project !== s.currentProject || drag.mode !== s.activeViewMode) return false;
    const c = s.currentProject.components.find((item) => item.id === drag.id)!;
    const result = assessPosition(s.currentProject, c, position);
    if (!result.valid) {
      set({ transformError: result.error });
      return false;
    }
    set({ componentDrag: { ...drag, position: [...position] }, transformError: null });
    return true;
  },
  finishComponentDrag: () => {
    const s = get(),
      drag = s.componentDrag;
    if (!drag) return;
    set({ componentDrag: null });
    if (
      drag.project === s.currentProject &&
      drag.mode === s.activeViewMode &&
      drag.id === s.selectedComponentId
    )
      get().moveComponent(drag.id, drag.position);
  },
  currentProject: cloneProject(demoProject),
  connectPorts: (from, to) => {
    const project = get().currentProject;
    const error = validateConnection(project, from, to);
    if (error) return error;
    const next = {
      ...project,
      schemaVersion: 2 as const,
      connections: [
        ...(project.connections ?? []),
        { id: `wire-${crypto.randomUUID()}`, from, to },
      ],
    };
    set((s) => ({
      currentProject: next,
      undoHistory: [...s.undoHistory.slice(-49), cloneProject(s.currentProject)],
      redoHistory: [],
      notice: 'Logical wire recorded. Physical pinout and electrical validity are not verified.',
    }));
    return null;
  },
  removeConnection: (id) => {
    const project = get().currentProject;
    if (!(project.connections ?? []).some((wire) => wire.id === id)) return false;
    set((s) => ({
      currentProject: {
        ...project,
        connections: (project.connections ?? []).filter((w) => w.id !== id),
      },
      undoHistory: [...s.undoHistory.slice(-49), cloneProject(s.currentProject)],
      redoHistory: [],
      notice: 'Logical wire removed.',
    }));
    return true;
  },
  selectedComponentId: null,
  activeViewMode: 'assembly',
  activeTool: 'select',
  cameraView: 'isometric',
  cameraRequest: 0,
  lightIntensity: 1,
  sidebarOpen: true,
  inspectorOpen: true,
  labelsVisible: true,
  gridVisible: true,
  quality: 'high',
  reducedMotion:
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  settingsOpen: false,
  demoAssistantMessages: [],
  undoHistory: [],
  redoHistory: [],
  savedSnapshot: null,
  notice: null,
  placement: null,
  configureBoard: (configuration) => {
    if (
      !validBoardConfiguration(configuration) ||
      (get().currentProject.boardTemplateId ?? 'cooling-demo') === 'cooling-demo'
    )
      return;
    get().cancelComponentDrag();
    set((s) => ({
      currentProject: {
        ...s.currentProject,
        schemaVersion: 2,
        boardConfiguration: structuredClone(configuration),
        components: s.currentProject.components.map((c) =>
          c.id === 'pcb'
            ? {
                ...c,
                dimensions: [
                  configuration.length / 10,
                  configuration.thickness / 10,
                  configuration.width / 10,
                ] as Vec3,
              }
            : c,
        ),
      },
      undoHistory: [...s.undoHistory.slice(-49), cloneProject(s.currentProject)],
      redoHistory: [],
      cameraView: 'fit',
      cameraRequest: s.cameraRequest + 1,
      notice:
        'Board configuration applied. Review updated placement warnings; fabrication remains unverified.',
    }));
  },
  setBoardTemplate: (id) => {
    if (!isBoardTemplate(id)) return;
    get().cancelComponentDrag();
    const state = get().currentProject;
    const saved = {
      ...state.boardConfigurations,
      ...(state.boardConfiguration && state.boardTemplateId
        ? { [state.boardTemplateId]: state.boardConfiguration }
        : {}),
    };
    const cfg = saved[id] ?? presetBoardConfiguration(id);
    set((s) => ({
      ...(id === (s.currentProject.boardTemplateId ?? 'cooling-demo')
        ? {}
        : {
            currentProject: {
              ...s.currentProject,
              schemaVersion: 2,
              boardTemplateId: id,
              boardConfiguration: cfg,
              boardConfigurations: saved,
              components: s.currentProject.components
                .find((c) => c.id === 'pcb')
                ?.dimensions.every(
                  (n, i) => n === [cfg.length / 10, cfg.thickness / 10, cfg.width / 10][i],
                )
                ? s.currentProject.components
                : s.currentProject.components.map((c) =>
                    c.id === 'pcb'
                      ? {
                          ...c,
                          dimensions: [cfg.length / 10, cfg.thickness / 10, cfg.width / 10] as Vec3,
                        }
                      : c,
                  ),
            },
            undoHistory: [...s.undoHistory.slice(-49), cloneProject(s.currentProject)],
            redoHistory: [],
          }),
      selectedComponentId: 'pcb',
      inspectorOpen: true,
      cameraView: 'fit',
      cameraRequest: s.cameraRequest + 1,
      notice:
        'Concept board selected. Components and C source are preserved; no wiring is established.',
    }));
  },
  beginPlacement: (catalogId) => {
    get().cancelComponentDrag();
    const part = getPart(catalogId);
    if (get().currentProject.components.length >= 64) {
      set({
        notice:
          'This local project supports up to 64 components. Start from the demo or load a smaller project to place more parts.',
      });
      return false;
    }
    if (!part?.insertionSupported) {
      set({ notice: part?.insertionNote ?? 'Unsupported catalog item.' });
      return false;
    }
    useDesignLayout.getState().setPanel('workspace');
    set({
      placement: createInstance(part, 'preview'),
      activeViewMode: 'assembly',
      cameraView: 'fit',
      cameraRequest: get().cameraRequest + 1,
    });
    return true;
  },
  movePlacement: (position, rotation) => {
    if (!validPosition(position) || rotation?.some((n) => !Number.isFinite(n) || Math.abs(n) > 360))
      return;
    set((s) =>
      s.placement
        ? { placement: { ...s.placement, position, rotation: rotation ?? s.placement.rotation } }
        : {},
    );
  },
  resetPlacement: () =>
    set((s) =>
      s.placement
        ? { placement: { ...s.placement, position: [...placementOrigin], rotation: [0, 0, 0] } }
        : {},
    ),
  cancelPlacement: () => set({ placement: null }),
  confirmPlacement: () =>
    set((s) => {
      if (!s.placement || s.currentProject.components.length >= 64) return {};
      const validation = assessPosition(s.currentProject, s.placement, s.placement.position);
      if (!validation.valid) return { notice: validation.error };
      const id = `part-${crypto.randomUUID()}`;
      const part = {
        ...s.placement,
        id,
        reference: `LIB-${id.slice(5, 11).toUpperCase()}`,
        initialPosition: [...s.placement.position] as HardwareComponent['position'],
      };
      return {
        currentProject: {
          ...s.currentProject,
          schemaVersion: 2,
          components: [...s.currentProject.components, part],
        },
        placement: null,
        componentDrag: null,
        selectedComponentId: id,
        transformError: null,
        inspectorOpen: true,
        undoHistory: [...s.undoHistory.slice(-49), cloneProject(s.currentProject)],
        redoHistory: [],
        cameraView: 'focus',
        cameraRequest: s.cameraRequest + 1,
        notice: 'Visual object added. No electrical connection was created.',
      };
    }),
  replaceComponent: (id, catalogId) => {
    const s = get(),
      existing = s.currentProject.components.find((c) => c.id === id),
      part = getPart(catalogId);
    if (!part || !canReplace(existing, part) || !existing) {
      set({ notice: 'Visual replacement is unsupported for this component type.' });
      return false;
    }
    const replacement = {
      ...createInstance(part, id),
      reference: existing.reference,
      position: [...existing.position] as HardwareComponent['position'],
      rotation: [...existing.rotation] as HardwareComponent['rotation'],
      initialPosition:
        existing.initialPosition ?? ([...existing.position] as HardwareComponent['position']),
    };
    set({
      currentProject: {
        ...s.currentProject,
        schemaVersion: 2,
        components: s.currentProject.components.map((c) => (c.id === id ? replacement : c)),
        connections: (s.currentProject.connections ?? []).filter((wire) =>
          [wire.from, wire.to].every(
            (end) =>
              end.componentId !== id ||
              logicalPorts(replacement).some((port) => port.id === end.portId),
          ),
        ),
      },
      selectedComponentId: id,
      componentDrag: null,
      transformError: null,
      placement: null,
      undoHistory: [...s.undoHistory.slice(-49), cloneProject(s.currentProject)],
      redoHistory: [],
      notice:
        'Visual replacement applied. Board integration is unverified; source files are preserved.',
    });
    return true;
  },
  setFirmwareTarget: (id) =>
    set((s) => {
      const c = s.currentProject.components.find((c) => c.id === id);
      if (!c || (c.id !== 'mcu' && !getPart(c.catalogId)?.architecture)) return {};
      return {
        currentProject: { ...s.currentProject, schemaVersion: 2, firmwareTargetId: id },
        undoHistory: [...s.undoHistory.slice(-49), cloneProject(s.currentProject)],
        redoHistory: [],
        notice:
          'Firmware target selected. Recorded build validity has been reevaluated; C is unchanged.',
      };
    }),
  selectComponent: (id) =>
    set((s) => ({
      selectedComponentId: id,
      componentDrag: null,
      transformError: null,
      inspectorOpen: id ? true : s.inspectorOpen,
      sidebarOpen:
        id && typeof window !== 'undefined' && window.innerWidth < 760 ? false : s.sidebarOpen,
      cameraView: id ? 'focus' : s.cameraView,
      cameraRequest: id ? s.cameraRequest + 1 : s.cameraRequest,
    })),
  editComponent: (id, patch) => {
    const s = get();
    const c = s.currentProject.components.find((item) => item.id === id);
    if (!c) return;
    if (patch.rotation?.some((n) => !Number.isFinite(n) || Math.abs(n) > 360)) {
      set({ notice: 'Enter finite rotations between −360 and 360 degrees.' });
      return;
    }
    if (patch.position || patch.rotation) {
      if (!movable(c)) {
        set({ notice: 'This component is fixed.' });
        return;
      }
      const result = assessPosition(
        s.currentProject,
        { ...c, ...patch },
        patch.position ?? c.position,
      );
      if (!result.valid) {
        set({ notice: result.error });
        return;
      }
    }
    set({
      componentDrag: null,
      currentProject: {
        ...s.currentProject,
        components: s.currentProject.components.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      },
      undoHistory: [...s.undoHistory.slice(-49), cloneProject(s.currentProject)],
      redoHistory: [],
    });
  },
  setViewMode: (activeViewMode) =>
    set((s) => ({
      componentDrag: null,
      transformError: null,
      activeViewMode,
      cameraView: 'fit',
      cameraRequest: s.cameraRequest + 1,
    })),
  setTool: (activeTool) => set({ activeTool }),
  requestCamera: (cameraView) => set((s) => ({ cameraView, cameraRequest: s.cameraRequest + 1 })),
  toggle: (key) => set((s) => ({ [key]: !s[key] })),
  setQuality: (quality) => set({ quality }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  undo: () => {
    get().cancelComponentDrag();
    set((s) => {
      if (!s.undoHistory.length) return {};
      return {
        currentProject: s.undoHistory.at(-1)!,
        placement: null,
        componentDrag: null,
        selectedComponentId: s.undoHistory
          .at(-1)!
          .components.some((c) => c.id === s.selectedComponentId)
          ? s.selectedComponentId
          : null,
        undoHistory: s.undoHistory.slice(0, -1),
        redoHistory: [...s.redoHistory, cloneProject(s.currentProject)],
      };
    });
  },
  redo: () => {
    get().cancelComponentDrag();
    set((s) => {
      if (!s.redoHistory.length) return {};
      return {
        currentProject: s.redoHistory.at(-1)!,
        placement: null,
        componentDrag: null,
        selectedComponentId: s.redoHistory
          .at(-1)!
          .components.some((c) => c.id === s.selectedComponentId)
          ? s.selectedComponentId
          : null,
        redoHistory: s.redoHistory.slice(0, -1),
        undoHistory: [...s.undoHistory, cloneProject(s.currentProject)],
      };
    });
  },
  save: () => {
    try {
      saveProject({ ...get().currentProject, selectedComponentId: get().selectedComponentId });
      set({
        savedSnapshot: JSON.stringify(get().currentProject),
        notice: 'Project saved on this device.',
      });
    } catch {
      set({
        notice:
          'Could not save. Browser storage may be full or unavailable. Export JSON to keep your project.',
      });
    }
  },
  load: () => {
    try {
      const p = loadProject();
      get().importProject(p);
      set({ savedSnapshot: JSON.stringify(p), notice: 'Local project loaded.' });
    } catch (e) {
      set({ notice: (e as Error).message });
    }
  },
  activateProject: (currentProject, messages = []) =>
    set((s) => ({
      currentProject: cloneProject(currentProject),
      selectedComponentId: currentProject.selectedComponentId ?? null,
      undoHistory: [],
      redoHistory: [],
      placement: null,
      componentDrag: null,
      transformError: null,
      activeViewMode: 'assembly',
      cameraView: 'fit',
      cameraRequest: s.cameraRequest + 1,
      demoAssistantMessages: messages,
      savedSnapshot: JSON.stringify(currentProject),
      notice: null,
    })),
  applyProjectRevision: (currentProject) =>
    set((s) => ({
      currentProject: cloneProject(currentProject),
      selectedComponentId: currentProject.selectedComponentId ?? null,
      undoHistory: [...s.undoHistory.slice(-49), cloneProject(s.currentProject)],
      redoHistory: [],
      placement: null,
      componentDrag: null,
      cameraView: 'fit',
      cameraRequest: s.cameraRequest + 1,
      notice: 'Approved AI design changes applied. Visual placement only; no wiring verified.',
    })),
  importProject: (currentProject) =>
    set((s) => ({
      currentProject,
      undoHistory: [...s.undoHistory.slice(-49), cloneProject(s.currentProject)],
      redoHistory: [],
      selectedComponentId: currentProject.selectedComponentId ?? null,
      placement: null,
      componentDrag: null,
      notice: 'Project imported.',
      cameraView: 'fit',
      cameraRequest: s.cameraRequest + 1,
    })),
  reset: () =>
    set((s) => ({
      currentProject:
        s.currentProject.id === demoProject.id
          ? cloneProject(demoProject)
          : {
              ...cloneProject(demoProject),
              schemaVersion: 2 as const,
              id: s.currentProject.id,
              name: s.currentProject.name,
              boardTemplateId: 'blank-92' as const,
              placementMode: 'free' as const,
              components: [cloneProject(demoProject).components[0]],
            },
      selectedComponentId: null,
      placement: null,
      componentDrag: null,
      activeViewMode: 'assembly',
      activeTool: 'select',
      labelsVisible: true,
      gridVisible: true,
      undoHistory: [...s.undoHistory.slice(-49), cloneProject(s.currentProject)],
      redoHistory: [],
      cameraView: 'isometric',
      cameraRequest: s.cameraRequest + 1,
      notice: 'Demo defaults restored. You can undo this change.',
    })),
  showAll: () =>
    set((s) => ({
      currentProject: {
        ...s.currentProject,
        components: s.currentProject.components.map((c) => ({ ...c, visible: true })),
      },
      undoHistory: [...s.undoHistory.slice(-49), cloneProject(s.currentProject)],
      redoHistory: [],
      notice: 'All components are visible.',
    })),
  notify: (notice) => set({ notice }),
  addMessage: (role, text) =>
    set((s) => ({
      demoAssistantMessages: [
        ...s.demoAssistantMessages.slice(-19),
        { id: Date.now() + s.demoAssistantMessages.length, role, text },
      ],
    })),
}));
