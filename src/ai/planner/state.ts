import { saveProject } from '../../lib/project';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useProjectsStore } from '../../projects/store';
import { draftFor, useFirmwareStore } from '../../firmware/store';
import { emptyMemory, rememberUser, redactSecrets } from '../memory';
import { createBuildPlan, verifyStep } from './planner';
import type { PlanStage } from './schema';

export function currentBuildPlan() {
  const p = useWorkspaceStore.getState().currentProject;
  const memory = useProjectsStore.getState().mentors?.[p.id];
  const previous = memory?.plan ?? p.buildPlan;
  const goal = memory?.intent.primary_goal ? memory.intent : previous?.goal;
  if (!goal?.primary_goal) return undefined;
  return createBuildPlan(
    p,
    goal,
    previous,
    p.firmwareSource ?? draftFor(useFirmwareStore.getState(), p.id).source,
  );
}
export function editBuildGoal(text: string) {
  if (!text.trim() || text.length > 500)
    throw new Error('Describe the objective in 1–500 characters.');
  const p = useWorkspaceStore.getState().currentProject;
  const previous = useProjectsStore.getState().mentors?.[p.id] ?? emptyMemory();
  const memory = rememberUser(previous, `Actually, my new goal is: ${text}`);
  memory.intent.primary_goal = redactSecrets(text).trim();
  memory.plan = createBuildPlan(
    p,
    memory.intent,
    previous.plan,
    p.firmwareSource ?? draftFor(useFirmwareStore.getState(), p.id).source,
  );
  useProjectsStore.getState().setMentor(p.id, memory);
}
export function setPlanStep(id: PlanStage, complete: boolean, note = '') {
  const p = useWorkspaceStore.getState().currentProject;
  const plan = currentBuildPlan();
  if (!plan) return;
  const memory = useProjectsStore.getState().mentors?.[p.id] ?? {
    ...emptyMemory(),
    intent: plan.goal,
  };
  useProjectsStore
    .getState()
    .setMentor(p.id, { ...memory, plan: verifyStep(plan, id, note, complete) });
}
/** Explicit export/save projection. Hardware state and undo history remain untouched. */
export function projectWithBuildPlan() {
  const s = useWorkspaceStore.getState();
  const plan = currentBuildPlan();
  return {
    ...s.currentProject,
    selectedComponentId: s.selectedComponentId,
    ...(plan ? { buildPlan: plan } : {}),
  };
}

export function saveWorkspaceWithPlan() {
  const s = useWorkspaceStore.getState();
  try {
    saveProject(projectWithBuildPlan());
    useWorkspaceStore.setState({
      savedSnapshot: JSON.stringify(s.currentProject),
      notice: 'Project and Build Plan saved on this device.',
    });
    useProjectsStore.getState().saveActive();
  } catch {
    s.notify('Could not save. Export the project to preserve your work.');
  }
}
