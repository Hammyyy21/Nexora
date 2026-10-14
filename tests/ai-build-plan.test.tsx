import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createBuildPlan, stepGuidance, verifyStep } from '../src/ai/planner/planner';
import { parseBuildPlan, stages } from '../src/ai/planner/schema';
import {
  currentBuildPlan,
  editBuildGoal,
  projectWithBuildPlan,
  setPlanStep,
  saveWorkspaceWithPlan,
} from '../src/ai/planner/state';
import { BuildPlan } from '../src/ai/planner/BuildPlan';
import { emptyMemory, rememberUser } from '../src/ai/memory';
import { createProject } from '../src/projects/templates';
import { useProjectsStore, loadArchive } from '../src/projects/store';
import { useWorkspaceStore } from '../src/store/useWorkspaceStore';
import { useGuideStore } from '../src/ai/store';
import { parseProject, serializeProject, loadProject } from '../src/lib/project';
import { useLibraryStore } from '../src/catalog/store';

const question =
  'I want to build a device that measures how far away objects are, about 1–2 meters away. Help me build it.';
let project = createProject('Ranging device', 'microcontroller');
beforeEach(() => {
  localStorage.clear();
  project = createProject('Ranging device', 'microcontroller');
  useProjectsStore.setState({
    projects: [project],
    activeId: project.id,
    mentors: {},
    chats: {},
    error: null,
  });
  useWorkspaceStore.getState().activateProject(project);
  useGuideStore.setState({
    mode: 'demo',
    availability: 'unconfigured',
    busy: false,
    explanationMode: 'beginner',
    pending: null,
  });
});
afterEach(() => vi.unstubAllGlobals());
const goal = () => rememberUser(emptyMemory(), question).intent;

it('A/B/C/D: creates nine stages, retains range, reuses RP2040 and blocks the missing distance sensor', async () => {
  const response = await useGuideStore.getState().ask(question);
  const plan = currentBuildPlan()!;
  expect(plan.steps.map((s) => s.stage)).toEqual(stages);
  expect(plan.goal.primary_goal).toBe('Measure distance to physical objects');
  expect(plan.goal.requirements.join(' ')).toContain('1–2 meters');
  expect(plan.recommendations[0]).toMatchObject({
    catalog_id: 'rp2040',
    availability: 'present',
    qualification: 'unverified',
  });
  expect(plan.recommendations[1]).toMatchObject({ catalog_id: null, availability: 'unavailable' });
  expect(plan.steps.find((s) => s.id === 'missing')?.status).toBe('blocked');
  expect(plan.next_step_id).toBe('missing');
  expect(response).toContain('reflected light');
  expect(response).toContain('sound echo');
  expect(response).not.toMatch(/TMP102|BME280/);
  expect(plan.steps.some((s) => s.status === 'completed')).toBe(false);
  expect(useWorkspaceStore.getState().currentProject).toEqual(project);
});

it('uses the same stages for temperature, wireless data, wireless power and generic goals', () => {
  for (const [text, available] of [
    ['I want to measure temperature', true],
    ['I want wireless data communication', true],
    ['I want wireless power transfer', false],
    ['I want to build an unusual instrument', false],
  ] as const) {
    const intent = rememberUser(emptyMemory(), text).intent;
    const plan = createBuildPlan(project, intent);
    expect(plan.steps.map((s) => s.id)).toEqual(stages);
    expect(plan.recommendations[1].availability === 'addable').toBe(available);
    expect(plan.recommendations[1].qualification).toBe('unverified');
    expect(plan.goal.primary_goal).toBeTruthy();
  }
});

it('E: refines detection to measurement and reopens affected checks while preserving inventory and decisions', () => {
  let memory = rememberUser(emptyMemory(), 'I want to detect objects');
  memory = rememberUser(memory, 'Use RP2040 as the controller');
  let plan = createBuildPlan(project, memory.intent);
  plan = verifyStep(plan, 'objective', 'Reviewed presence-detection goal', true);
  plan = verifyStep(plan, 'inventory', 'Confirmed my RP2040 identity', true);
  memory = rememberUser(
    { ...memory, plan },
    'Actually, I want to measure their exact distance, up to 2 meters.',
  );
  const updated = createBuildPlan(project, memory.intent, plan);
  expect(updated.goal.intended_function).toBe('object-distance measurement');
  expect(updated.goal.requirements.join(' ')).toContain('2 meters');
  expect(updated.goal.decisions).toContain('Use RP2040 as the controller');
  expect(updated.steps[0].status).toBe('needs_verification');
  expect(updated.steps[1].status).toBe('completed');
  expect(updated.goal_revision).toBe(2);
});

it('F/G: exports and imports goals, corrections and manual progress under a new project ID', async () => {
  await useGuideStore.getState().ask(question);
  await useGuideStore.getState().ask("I don't need a temperature sensor.");
  setPlanStep('objective', true, 'Range and intended function reviewed');
  const file = serializeProject(projectWithBuildPlan());
  const restored = parseProject(file);
  expect(restored.buildPlan?.goal.corrections).toContain("I don't need a temperature sensor.");
  expect(restored.buildPlan?.steps[0].verification?.source).toBe('user');
  useProjectsStore.getState().importNew(restored);
  const importedId = useWorkspaceStore.getState().currentProject.id;
  expect(importedId).not.toBe(project.id);
  expect(currentBuildPlan()?.steps[0].status).toBe('completed');
  editBuildGoal('I want to measure temperature');
  useProjectsStore.getState().switchTo(project.id);
  expect(currentBuildPlan()?.goal.intended_function).toBe('object-distance measurement');
  useProjectsStore.getState().rename(project.id, 'Renamed ranging device');
  expect(currentBuildPlan()?.steps[0].status).toBe('completed');
  saveWorkspaceWithPlan();
  expect(loadProject().buildPlan?.goal.requirements.join(' ')).toContain('1–2');
  expect(loadArchive().mentors?.[project.id].plan?.goal.corrections).toContain(
    "I don't need a temperature sensor.",
  );
});

it('H: schematic lines, pads, and firmware source never imply routed copper or working hardware', () => {
  const p = createProject('Connected demo', 'cooling');
  p.firmwareSource = 'int main(void) { return 0; }';
  const plan = createBuildPlan(
    p,
    rememberUser(emptyMemory(), 'I want to measure temperature').intent,
  );
  const pcb = plan.steps.find((s) => s.id === 'pcb')!;
  expect(pcb.status).not.toBe('completed');
  expect(pcb.evidence.join(' ')).toContain('Copper routing is unavailable');
  const firmware = plan.steps.find((s) => s.id === 'firmware')!;
  expect(firmware.evidence.join(' ')).toContain('No compiler or hardware test');
  expect(firmware.status).not.toBe('completed');
  expect(plan.steps.find((s) => s.id === 'testing')?.status).not.toBe('completed');
});

it('blocks unsupported completion and invalidates manual verification when evidence changes', () => {
  let plan = createBuildPlan(project, goal());
  expect(() => verifyStep(plan, 'missing', 'AI said sensor is present', true)).toThrow();
  expect(() => verifyStep(plan, 'objective', '', true)).toThrow();
  plan = verifyStep(plan, 'inventory', 'Verified the actual parts', true);
  project.components = project.components.filter((c) => c.catalogId !== 'rp2040');
  plan = createBuildPlan(project, goal(), plan);
  expect(plan.steps[1].status).toBe('needs_verification');
  expect(plan.recommendations[0].availability).toBe('addable');
});

it('rejects malformed, oversized and unsupported imported plan schemas without altering the existing project', () => {
  const plan = createBuildPlan(project, goal());
  expect(parseBuildPlan(plan)).toEqual(plan);
  for (const invalid of [
    { ...plan, version: 2 },
    { ...plan, steps: [] },
    { ...plan, execute: 'shell' },
    { ...plan, goal: { ...plan.goal, requirements: Array(13).fill('x') } },
    { ...plan, steps: plan.steps.map((s, i) => (i === 0 ? { ...s, status: 'completed' } : s)) },
  ]) {
    expect(() =>
      parseProject(serializeProject({ ...project, buildPlan: invalid as typeof plan })),
    ).toThrow(/Build Plan/);
  }
  expect(useWorkspaceStore.getState().currentProject).toEqual(project);
});

it('I: grounds online requests in the plan and rejects approval after the goal changes', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        mode: 'ai',
        request_id: 'plan-test',
        answer: 'I propose adding EEPROM.',
        actions: [{ type: 'add_component', catalog_id: 'eeprom24lc' }],
        missing_data: [],
        unverified_recommendations: [],
        cited_catalog_ids: [],
        references: [],
        notice: 'Approval required',
      }),
    ),
  );
  vi.stubGlobal('fetch', fetch);
  editBuildGoal(question);
  useGuideStore.setState({ mode: 'ai', availability: 'ready' });
  await useGuideStore.getState().ask('What should I do next?');
  const sent = JSON.parse(fetch.mock.calls[0][1].body);
  expect(sent.context.build_plan.next_step_id).toBe('missing');
  expect(sent.context.build_plan.recommendations[0].catalog_id).toBe('rp2040');
  expect(useWorkspaceStore.getState().currentProject).toEqual(project);
  expect(useGuideStore.getState().pending).not.toBeNull();
  editBuildGoal('I want to measure temperature');
  useGuideStore.getState().approve();
  expect(useGuideStore.getState().pending).toBeNull();
  expect(useWorkspaceStore.getState().currentProject).toEqual(project);
});

it('J: integrates readable steps, evidence, reopening, help, goal editing and existing navigation', () => {
  editBuildGoal(question);
  render(<BuildPlan />);
  expect(screen.getByRole('region', { name: 'Build Plan' })).toBeVisible();
  fireEvent.click(screen.getByText('View 9 engineering steps'));
  fireEvent.click(screen.getByText('Confirm the objective', { selector: 'summary' }));
  fireEvent.change(screen.getByLabelText('Verification evidence for Confirm the objective'), {
    target: { value: 'Checked the range and objective' },
  });
  const details = screen
    .getByLabelText('Verification evidence for Confirm the objective')
    .closest('details')!;
  fireEvent.click(within(details).getByRole('button', { name: 'Mark manually verified' }));
  expect(currentBuildPlan()?.steps[0].status).toBe('completed');
  fireEvent.click(within(details).getByRole('button', { name: 'Reopen step' }));
  expect(currentBuildPlan()?.steps[0].status).not.toBe('completed');
  fireEvent.click(screen.getByText('Implement the schematic', { selector: 'summary' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open Schematic' }));
  expect(useLibraryStore.getState().workspace).toBe('schematic');
  expect(stepGuidance(currentBuildPlan()!, 'beginner', 'schematic')).toContain('two-wire data bus');
  expect(stepGuidance(currentBuildPlan()!, 'engineer', 'schematic')).toContain('physical');
});

it('next-step guidance uses current PCB, schematic and firmware evidence without clearing a draft', async () => {
  editBuildGoal('I want to measure temperature');
  const initial = currentBuildPlan()!;
  const withWire = createProject('Connected', 'cooling');
  withWire.firmwareSource = 'int main(void) { return 0; }';
  const updated = createBuildPlan(withWire, initial.goal, initial);
  for (const id of ['schematic', 'pcb', 'firmware'] as const) {
    const guidance = stepGuidance(updated, 'beginner', id);
    expect(guidance).toContain(updated.steps.find((s) => s.id === id)!.evidence[0]);
    expect(guidance).toContain('Verification:');
  }
  const memory = useProjectsStore.getState().mentors![project.id];
  useProjectsStore
    .getState()
    .setMentor(project.id, { ...memory, draft: 'Keep my separate question' });
  render(<BuildPlan />);
  fireEvent.click(screen.getByRole('button', { name: 'What should I do next?' }));
  await vi.waitFor(() => expect(useGuideStore.getState().busy).toBe(false));
  expect(useProjectsStore.getState().mentors![project.id].draft).toBe('Keep my separate question');
  expect(useWorkspaceStore.getState().currentProject).toEqual(project);
  expect(useWorkspaceStore.getState().demoAssistantMessages.at(-1)?.text).toContain(
    'Current project evidence:',
  );
});
