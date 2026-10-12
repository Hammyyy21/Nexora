import { buildWorkspaceSnapshot, inspectProject, type InspectionFinding } from './snapshot';
import { demoActions } from './demoActions';
import { logicalPorts } from '../schematic/model';
import { boardSpecification } from '../workspace/boardSpecifications';
import { draftFor, useFirmwareStore } from '../firmware/store';
import { useDesignLayout } from '../workspace/layout';
import { create } from 'zustand';
import { reviewDesign } from '../engineering/insights';
import { previewAIChanges, type AIAction } from './actions';
import { useProjectsStore } from '../projects/store';
import type { ResponseLength } from './client';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { useLibraryStore } from '../catalog/store';
import { runDemoCommand } from '../lib/assistant';
import {
  askGuide,
  formatGuideResponse,
  getGuideHealth,
  GuideError,
  type ChatContext,
} from './client';

export function guideContext(catalogId?: string, question = ''): ChatContext {
  const s = useWorkspaceStore.getState();
  const library = useLibraryStore.getState();
  const selected = s.currentProject.components.find((c) => c.id === s.selectedComponentId);
  const activeId = catalogId ?? library.detailId ?? selected?.catalogId;
  const findings = reviewDesign(s.currentProject);
  // A bounded context must not bury verified wiring failures behind low-priority geometry notices.
  const notices = [...findings].sort(
    (a, b) =>
      (a.status === 'fail' ? -2 : a.status === 'pass' ? 0 : -1) -
      (b.status === 'fail' ? -2 : b.status === 'pass' ? 0 : -1),
  );
  const board =
    selected && boardSpecification(s.currentProject, selected)
      ? selected
      : s.currentProject.components.find((c) => c.id === 'pcb');
  const spec = board && boardSpecification(s.currentProject, board);
  return {
    workspace_snapshot: buildWorkspaceSnapshot(s.currentProject,s.projectRevision,s.selectedComponentId,s.currentProject.firmwareSource ?? draftFor(useFirmwareStore.getState(),s.currentProject.id).source),
    board_summary:
      /board|specification/i.test(question) && spec
        ? JSON.stringify(spec).slice(0, 6000)
        : undefined,
    connections: /connect|circuit|firmware/i.test(question)
      ? (s.currentProject.connections ?? []).slice(0, 24)
      : undefined,
    project_name: s.currentProject.name.slice(0, 120),
    engineering_notices: notices
      .slice(0, 8)
      .map((f) => `${f.status ?? 'unknown'}: ${f.title} — ${f.details}`.slice(0, 160)),
    selected_component_id: selected?.id,
    selected_component_type: selected?.type,
    catalog_ids: [
      ...new Set([activeId, ...library.compareIds].filter((id): id is string => !!id)),
    ].slice(0, 3),
    project_components: [...s.currentProject.components]
      .sort((a, b) => {
        const score = (c: typeof a) =>
          Number(c.id === selected?.id) * 4 +
          Number(question.toLowerCase().includes(c.name.toLowerCase())) * 3 +
          Number(c.type === 'microcontroller' || c.type === 'sensor');
        return score(b) - score(a);
      })
      .slice(0, 16)
      .map((c) => ({
        id: c.id,
        name: c.name.slice(0, 140),
        catalog_id: c.catalogId,
        fixed: c.fixed === true || c.id === 'pcb' || c.type === 'housing',
        position: c.position,
        ports: /connect|firmware/i.test(question) ? logicalPorts(c).map((p) => p.id) : undefined,
      })),
  };
}
export const LENGTH_KEY = 'nexora.ai-length.v1';
function initialLength(): ResponseLength {
  try {
    const setting = localStorage.getItem(LENGTH_KEY);
    if (setting === 'auto' || setting === 'concise' || setting === 'detailed') return setting;
  } catch {
    /* Browser storage can be disabled. */
  }
  return 'auto';
}
interface PendingProposal {
  projectId: string;
  revision: number;
  snapshot: string;
  firmwareBefore: string;
  actions: AIAction[];
  summary: string[];
}
interface GuideState {
  inspection: { projectId: string; revision: number; findings: InspectionFinding[] } | null;
  pending: PendingProposal | null;
  responseLength: ResponseLength;
  editPendingSource: (source: string) => void;
  setResponseLength: (length: ResponseLength) => void;
  approve: () => void;
  cancel: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  availability: 'unchecked' | 'checking' | 'ready' | 'unconfigured' | 'offline';
  mode: 'demo' | 'ai';
  busy: boolean;
  status: string;
  check: () => Promise<void>;
  setMode: (mode: 'demo' | 'ai') => void;
  ask: (text: string, options?: { local?: boolean; catalogId?: string }) => Promise<string>;
}
export const useGuideStore = create<GuideState>((set, get) => ({
  inspection: null,
  pending: null,
  editPendingSource: (source) => {
    const pending = get().pending;
    if (pending && source.length <= 20000)
      set({
        pending: {
          ...pending,
          actions: pending.actions.map((a) =>
            a.type === 'generate_firmware' ? { ...a, source } : a,
          ),
        },
      });
  },
  responseLength: initialLength(),
  setResponseLength: (responseLength) => {
    set({ responseLength });
    try {
      localStorage.setItem(LENGTH_KEY, responseLength);
    } catch {
      /* Session setting works. */
    }
  },
  cancel: () => set({ pending: null }),
  approve: () => {
    const pending = get().pending;
    if (!pending) return;
    const workspace = useWorkspaceStore.getState();
    if (
      workspace.currentProject.id !== pending.projectId ||
      workspace.projectRevision !== pending.revision ||
      JSON.stringify(workspace.currentProject) !== pending.snapshot ||
      (pending.actions.some((a) => a.type === 'generate_firmware') &&
        draftFor(useFirmwareStore.getState(), workspace.currentProject.id).source !==
          pending.firmwareBefore)
    ) {
      set({ pending: null });
      workspace.notify(
        'The design changed since the AI proposal. Ask again to generate an updated plan.',
      );
      return;
    }
    try {
      const result = previewAIChanges(workspace.currentProject, pending.actions);
      if (result.createNew) {
        const newProject = result.project;
        useProjectsStore
          .getState()
          .createNew(
            newProject.name,
            pending.actions[0].type === 'create_project'
              ? (pending.actions[0].template_id as import('../projects/templates').TemplateId)
              : 'blank',
          );
      } else if (pending.actions.every((a) => a.type === 'select_component')) {
        workspace.selectComponent(result.project.selectedComponentId ?? null);
      } else {
        if (
          pending.actions.some((a) => a.type === 'generate_firmware') &&
          workspace.currentProject.firmwareSource === undefined
        )
          useWorkspaceStore.setState({
            currentProject: { ...workspace.currentProject, firmwareSource: pending.firmwareBefore },
          });
        useWorkspaceStore.getState().applyProjectRevision(result.project);
      }
      if (pending.actions.some((a) => a.type === 'generate_firmware'))
        useDesignLayout.getState().setPanel('code');
      set({ pending: null });
    } catch (e) {
      workspace.notify(`AI action not applied: ${(e as Error).message}`);
      set({ pending: null });
    }
  },
  open: false,
  setOpen: (open) => set({ open }),
  availability: 'unchecked',
  mode: 'demo',
  busy: false,
  status: 'Demo Assistant · local scripted commands',
  check: async () => {
    if (get().availability === 'checking') return;
    set({ availability: 'checking' });
    try {
      const configured = await getGuideHealth();
      set({
        availability: configured ? 'ready' : 'unconfigured',
        mode: configured ? 'ai' : 'demo',
        status: configured
          ? 'AI Guide · design proposals'
          : 'No API key configured · Demo Assistant is local',
      });
    } catch {
      set({
        availability: 'offline',
        mode: 'demo',
        status: 'Backend unavailable · Demo Assistant is local',
      });
    }
  },
  setMode: (mode) => {
    if (get().busy || (mode === 'ai' && get().availability !== 'ready')) return;
    set({
      mode,
      status:
        mode === 'ai' ? 'AI Guide · design proposals' : 'Demo Assistant · local scripted commands',
    });
  },
  ask: async (text, options) => {
    if (get().busy || !text.trim()) return '';
    const local = options?.local || get().mode === 'demo';
    // Capture context now. Late AI replies never update the project or execute commands.
    const firmwareBefore = draftFor(
      useFirmwareStore.getState(),
      useWorkspaceStore.getState().currentProject.id,
    ).source;
    const context = guideContext(options?.catalogId, text);
    const snapshot = JSON.stringify(useWorkspaceStore.getState().currentProject);
    const projectId = useWorkspaceStore.getState().currentProject.id;
    const revision = useWorkspaceStore.getState().projectRevision;
    const inspectionQuestion = /inspect|review|check|warning|problem|inconsisten|firmware.*match/i.test(text);
    if(inspectionQuestion) set({inspection:{projectId,revision,findings:inspectProject(useWorkspaceStore.getState().currentProject,firmwareBefore)}});
    set({ busy: true, pending: null });
    try {
      if (local) {
        if(inspectionQuestion && !/suggest|move|add|remove|generate|create/i.test(text)) return 'Project inspection completed using deterministic engineering checks. Select a finding to inspect its entities. No complete electrical safety or firmware validation is established.';
        const actions = demoActions(text, useWorkspaceStore.getState().currentProject);
        if (!actions) return 'Demo Assistant · ' + runDemoCommand(text);
        const proposed = previewAIChanges(useWorkspaceStore.getState().currentProject, actions);
        if (actions.every((a) => a.type === 'review_project' || a.type === 'show_specifications'))
          return 'Demo Assistant · ' + proposed.summary.join('\n\n');
        set({
          pending: { projectId, revision, snapshot, firmwareBefore, actions, summary: proposed.summary },
        });
        return 'Demo Assistant · Ready for review. Apply or cancel the proposal.';
      }
      const result = await askGuide(text.trim(), context, get().responseLength);
      if (useWorkspaceStore.getState().projectRevision === revision && useWorkspaceStore.getState().currentProject.id === projectId && result.findings?.length) {
        const evidence=inspectProject(useWorkspaceStore.getState().currentProject,firmwareBefore);
        const explanations=new Map(result.findings.map(f=>[f.evidence_id,f]));
        if(result.findings.some(f=>!evidence.some(e=>e.id===f.evidence_id))) throw new Error('AI finding refers to missing evidence.');
        set({inspection:{projectId,revision,findings:evidence.map(f=>{const note=explanations.get(f.id);return note?{...f,details:`${f.details} AI interpretation: ${note.explanation}`,remedy:note.next_step}:f;})}});
      }
      if (
        useWorkspaceStore.getState().projectRevision === revision &&
        result.actions?.length &&
        useWorkspaceStore.getState().currentProject.id === projectId &&
        JSON.stringify(useWorkspaceStore.getState().currentProject) === snapshot
      ) {
        const proposed = previewAIChanges(
          useWorkspaceStore.getState().currentProject,
          result.actions,
        );
        if (result.actions.every(a => a.type === 'review_project')) return formatGuideResponse(result,get().responseLength);
        if (result.actions.every(a => a.type === 'show_specifications')) return proposed.summary.join('\n\n');
        set({
          pending: {
            projectId,
            revision,
            snapshot,
            firmwareBefore,
            actions: result.actions,
            summary: proposed.summary,
          },
        });
      }
      return formatGuideResponse(result, get().responseLength);
    } catch (error) {
      const failure =
        error instanceof GuideError
          ? error
          : new GuideError(
              'INVALID_PROPOSAL',
              error instanceof Error ? error.message : 'The AI proposal is invalid.',
            );
      if (failure.code === 'AI_NOT_CONFIGURED')
        set({
          availability: 'unconfigured',
          mode: 'demo',
          status: 'No API key configured · Demo Assistant is local',
        });
      return `${failure.message} [${failure.code}]${failure.requestId ? ` Reference: ${failure.requestId}` : ''} No local command was executed.`;
    } finally {
      set({ busy: false });
    }
  },
}));
