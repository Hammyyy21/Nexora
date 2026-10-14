import { create } from 'zustand';
import { restoreMemory, redactSecrets, type MentorMemory } from '../ai/memory';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { demoSource } from '../firmware/model';
import { useFirmwareStore } from '../firmware/store';
import { demoProject } from '../data/demoProject';
import { cloneProject, parseProject, STORAGE_KEY } from '../lib/project';
import { createProject, type TemplateId } from './templates';
import type { AssistantMessage, Project } from '../types/workspace';

export const PROJECTS_KEY = 'nexora.projects.v2';
interface Archive {
  version: 2;
  activeId: string;
  projects: Project[];
  chats: Record<string, AssistantMessage[]>;
  mentors?: Record<string, MentorMemory>;
}
function archiveMessage(message: AssistantMessage): AssistantMessage {
  const text = redactSecrets(message.text);
  const marker = '[Earlier message text omitted]\n';
  return {
    ...message,
    text: text.length <= 10000 ? text : marker + text.slice(-(10000 - marker.length)),
  };
}
export function loadArchive(): Archive {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (
        data.version !== 2 ||
        !Array.isArray(data.projects) ||
        data.projects.length > 50 ||
        typeof data.activeId !== 'string'
      )
        throw new Error('Invalid project collection');
      const projects = data.projects.map((p: Project) => parseProject(JSON.stringify(p)));
      if (
        !projects.length ||
        new Set(projects.map((p: Project) => p.id)).size !== projects.length ||
        !projects.some((p: Project) => p.id === data.activeId)
      )
        throw new Error('Invalid project index');
      const chats: Archive['chats'] = {};
      if (data.chats && typeof data.chats === 'object' && !Array.isArray(data.chats)) {
        for (const project of projects) {
          const messages = data.chats[project.id];
          if (Array.isArray(messages))
            chats[project.id] = messages
              .slice(-20)
              .filter(
                (m: AssistantMessage) =>
                  m &&
                  (m.role === 'user' || m.role === 'assistant') &&
                  typeof m.text === 'string' &&
                  Number.isFinite(m.id),
              )
              .map(archiveMessage);
        }
      }
      const mentors = Object.fromEntries(
        projects.map((p: Project) => [
          p.id,
          restoreMemory(
            data.mentors?.[p.id] ??
              (p.buildPlan ? { intent: p.buildPlan.goal, plan: p.buildPlan } : undefined),
          ),
        ]),
      );
      return { version: 2, activeId: data.activeId, projects, chats, mentors };
    }
    const previous = localStorage.getItem(STORAGE_KEY);
    if (previous) {
      const migrated = parseProject(previous);
      return { version: 2, activeId: migrated.id, projects: [migrated], chats: {} };
    }
  } catch {
    // Never delete or rewrite damaged saves automatically. Surface the error in the project hub.
    throw new Error(
      'Saved project data could not be loaded. Export/back up your browser data before making new projects.',
    );
  }
  return { version: 2, activeId: demoProject.id, projects: [cloneProject(demoProject)], chats: {} };
}
let initial: Archive;
let showFirstRun = false;
let hasPersistedProjects = false;
try {
  hasPersistedProjects = Boolean(
    localStorage.getItem(PROJECTS_KEY) || localStorage.getItem(STORAGE_KEY),
  );
  showFirstRun = !hasPersistedProjects;
} catch {
  showFirstRun = false;
}
let loadError: string | null = null;
try {
  initial = loadArchive();
} catch (e) {
  loadError = (e as Error).message;
  initial = {
    version: 2,
    activeId: demoProject.id,
    projects: [cloneProject(demoProject)],
    chats: {},
  };
}
interface ProjectsState extends Archive {
  dashboardOpen: boolean;
  error: string | null;
  setDashboardOpen: (open: boolean) => void;
  createNew: (name: string, template: TemplateId) => void;
  switchTo: (id: string) => void;
  rename: (id: string, name: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  importNew: (project: Project) => void;
  saveActive: () => void;
  setMentor: (id: string, memory: MentorMemory) => void;
}
function write(archive: Archive) {
  // Always validate before writing, and avoid damaging another project on quota errors.
  const json = JSON.stringify(archive);
  if (json.length > 3_500_000)
    throw new Error('Project collection is too large. Export and delete unused projects.');
  localStorage.setItem(PROJECTS_KEY, json);
}
export const useProjectsStore = create<ProjectsState>((set, get) => {
  const commit = (archive: Archive) => {
    if (get().error && loadError) throw new Error(get().error!);
    archive.mentors ??= get().mentors ?? {};
    archive.mentors = Object.fromEntries(
      archive.projects.map((p) => [p.id, restoreMemory(archive.mentors?.[p.id])]),
    );
    write(archive);
    set({ ...archive, error: null });
  };
  const current = () => {
    const s = useWorkspaceStore.getState();
    return { ...cloneProject(s.currentProject), selectedComponentId: s.selectedComponentId };
  };
  const flush = () => {
    const s = get();
    const projects = s.projects.map((p) => (p.id === s.activeId ? current() : p));
    const chats = {
      ...s.chats,
      [s.activeId]: useWorkspaceStore
        .getState()
        .demoAssistantMessages.slice(-20)
        .map(archiveMessage),
    };
    commit({ version: 2, projects, activeId: s.activeId, chats });
  };
  const activate = (p: Project) => {
    const hardware = cloneProject(p);
    delete hardware.buildPlan;
    useWorkspaceStore.getState().activateProject(hardware, get().chats[p.id] ?? []);
    useFirmwareStore.getState().setTab('c');
    set({ dashboardOpen: false });
  };
  return {
    ...initial,
    setMentor: (id, memory) => {
      const registered = get().projects.some((p) => p.id === id);
      if (!registered && useWorkspaceStore.getState().currentProject.id !== id) return;
      // Retain the session state even if browser storage is unavailable.
      set({ mentors: { ...get().mentors, [id]: restoreMemory(memory) } });
      if (registered) {
        try {
          flush();
        } catch (e) {
          set({ error: (e as Error).message });
        }
      }
    },
    error: loadError,
    dashboardOpen: showFirstRun,
    setDashboardOpen: (dashboardOpen) => set({ dashboardOpen }),
    saveActive: () => {
      try {
        flush();
      } catch (e) {
        set({ error: (e as Error).message });
      }
    },
    createNew: (name, template) => {
      try {
        if (get().projects.length >= 50) throw new Error('Maximum of 50 local projects reached.');
        flush();
        const project = createProject(name, template);
        commit({
          version: 2,
          activeId: project.id,
          projects: [...get().projects, project],
          chats: get().chats,
        });
        if (template === 'cooling')
          useFirmwareStore.getState().initializeSource(project.id, demoSource);
        activate(project);
      } catch (e) {
        set({ error: (e as Error).message });
      }
    },
    switchTo: (id) => {
      try {
        flush();
        const project = get().projects.find((p) => p.id === id);
        if (!project) throw new Error('Project not found.');
        commit({ version: 2, activeId: id, projects: get().projects, chats: get().chats });
        activate(project);
      } catch (e) {
        set({ error: (e as Error).message });
      }
    },
    rename: (id, name) => {
      try {
        if (!name.trim() || name.length > 100)
          throw new Error('Project name must be 1–100 characters.');
        flush();
        const projects = get().projects.map((p) => (p.id === id ? { ...p, name: name.trim() } : p));
        commit({ version: 2, activeId: get().activeId, projects, chats: get().chats });
        if (id === get().activeId)
          useWorkspaceStore.setState((state) => ({
            currentProject: { ...state.currentProject, name: name.trim() },
          }));
      } catch (e) {
        set({ error: (e as Error).message });
      }
    },
    duplicate: (id) => {
      try {
        flush();
        if (get().projects.length >= 50) throw new Error('Maximum of 50 local projects reached.');
        const original = get().projects.find((p) => p.id === id);
        if (!original) throw new Error('Project not found.');
        const copy = {
          ...cloneProject(original),
          id: crypto.randomUUID(),
          name: `${original.name.slice(0, 90)} (Copy)`,
          selectedComponentId: null,
        };
        commit({
          version: 2,
          activeId: get().activeId,
          projects: [...get().projects, copy],
          chats: { ...get().chats, [copy.id]: [] },
        });
      } catch (e) {
        set({ error: (e as Error).message });
      }
    },
    remove: (id) => {
      try {
        flush();
        if (get().projects.length <= 1)
          throw new Error('Keep at least one project. Create a replacement first.');
        const wasActive = id === get().activeId;
        const projects = get().projects.filter((p) => p.id !== id);
        const activeId = wasActive ? projects[0].id : get().activeId;
        commit({
          version: 2,
          activeId,
          projects,
          chats: Object.fromEntries(Object.entries(get().chats).filter(([key]) => key !== id)),
        });
        if (wasActive) activate(projects[0]);
      } catch (e) {
        set({ error: (e as Error).message });
      }
    },
    importNew: (project) => {
      try {
        flush();
        const parsed = parseProject(JSON.stringify(project));
        if (get().projects.length >= 50) throw new Error('Maximum of 50 local projects reached.');
        const added = { ...parsed, id: crypto.randomUUID() };
        commit({
          version: 2,
          activeId: added.id,
          projects: [...get().projects, added],
          chats: get().chats,
          mentors: {
            ...get().mentors,
            [added.id]: restoreMemory(
              parsed.buildPlan
                ? { intent: parsed.buildPlan.goal, plan: parsed.buildPlan }
                : undefined,
            ),
          },
        });
        activate(added);
      } catch (e) {
        set({ error: (e as Error).message });
      }
    },
  };
});

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let hydrated = false;
useWorkspaceStore.subscribe((next, prev) => {
  if (!hydrated) return;
  if (
    next.currentProject === prev.currentProject &&
    next.selectedComponentId === prev.selectedComponentId &&
    next.demoAssistantMessages === prev.demoAssistantMessages
  )
    return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => useProjectsStore.getState().saveActive(), 250);
});
export function flushProjects() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = undefined;
  useProjectsStore.getState().saveActive();
  hydrated = false;
}
export function hydrateActiveProject() {
  // Hydrate once per application lifetime. StrictMode remounts effects, and
  // repeated activation would reset selection, undo/redo and camera state.
  if (hydrated) return;
  hydrated = true;
  // For a first-run project there is nothing to restore: the workspace is
  // already initialized with the demo. In particular, do not overwrite work
  // done before the first React effect (e.g. from an imported project).
  if (!hasPersistedProjects || loadError) return;
  const state = useProjectsStore.getState();
  const project = state.projects.find((p) => p.id === state.activeId);
  if (!project) return;
  const workspace = useWorkspaceStore.getState();
  const chats = state.chats[project.id] ?? [];
  if (
    JSON.stringify(workspace.currentProject) !== JSON.stringify(project) ||
    workspace.selectedComponentId !== (project.selectedComponentId ?? null) ||
    JSON.stringify(workspace.demoAssistantMessages) !== JSON.stringify(chats)
  ) {
    const hardware = cloneProject(project);
    delete hardware.buildPlan;
    workspace.activateProject(hardware, chats);
  }
}
