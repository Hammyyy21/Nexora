import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { boundedConversation, emptyMemory, rememberUser, restoreMemory } from '../src/ai/memory';
import { useGuideStore, guideContext, EXPLANATION_KEY } from '../src/ai/store';
import { useProjectsStore, loadArchive, PROJECTS_KEY } from '../src/projects/store';
import { useWorkspaceStore } from '../src/store/useWorkspaceStore';
import { createProject } from '../src/projects/templates';

const result = (answer: string, actions: unknown[] = []) =>
  new Response(
    JSON.stringify({
      mode: 'ai',
      request_id: 'mentor-test',
      answer,
      actions,
      missing_data: ['Environment unknown'],
      unverified_recommendations: [],
      cited_catalog_ids: [],
      notice: 'Proposals require approval',
      references: [],
    }),
  );
const fetchMock = vi.fn();
let project: ReturnType<typeof createProject>;
beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  project = createProject('Distance device', 'microcontroller');
  useProjectsStore.setState({
    projects: [project],
    activeId: project.id,
    chats: {},
    mentors: {},
    error: null,
  });
  useWorkspaceStore.getState().activateProject(project);
  useGuideStore.setState({
    busy: false,
    mode: 'ai',
    availability: 'ready',
    pending: null,
    explanationMode: 'beginner',
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('AI-1 project intent and continuity', () => {
  it('A/B: retains physical range and corrections across detection-to-measurement refinement', () => {
    let memory = rememberUser(emptyMemory(), 'I want to detect objects 1–2 meters away.');
    memory = rememberUser(memory, 'Actually, I want to measure their distance.');
    memory = rememberUser(memory, "I don't need a temperature sensor.");
    memory = rememberUser(memory, 'Choose what you think is best.');
    expect(memory.intent.intended_function).toBe('object-distance measurement');
    expect(memory.intent.primary_goal).toBe('Measure distance to physical objects');
    expect(memory.intent.requirements).toContain('I want to detect objects 1–2 meters away.');
    expect(memory.intent.corrections).toContain("I don't need a temperature sensor.");
    expect(memory.intent.unknowns).toContain('Sensor selection unresolved');
  });
  it('distinguishes wireless power, wireless data and explicit PCB spacing', () => {
    for (const [text, kind] of [
      ['I want wireless power transfer', 'wireless power transfer'],
      ['I want wireless data communication', 'wireless data communication'],
      ['Measure distance between PCB components', 'PCB component spacing'],
    ])
      expect(rememberUser(emptyMemory(), text).intent.intended_function).toBe(kind);
  });
  it('C/D: sends the actual preceding question, goal, correction, mode and current component roles', async () => {
    fetchMock
      .mockResolvedValueOnce(
        result(
          'A distance sensor measures how far away an object is. Will you use this indoors or outdoors?',
        ),
      )
      .mockResolvedValueOnce(
        result(
          'I asked about location because sunlight can affect some light-based distance sensors.',
        ),
      )
      .mockResolvedValueOnce(result('We can start with an unverified time-of-flight approach.'));
    await useGuideStore
      .getState()
      .ask('I want to measure the distance to objects 1–2 meters away.');
    await useGuideStore.getState().ask('What did you mean by your last question?');
    let sent = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sent.messages).toHaveLength(3);
    expect(sent.messages[1].content).toContain('indoors or outdoors?');
    expect(sent.context.project_intent.intended_function).toBe('object-distance measurement');
    expect(sent.explanation_mode).toBe('beginner');
    await useGuideStore.getState().ask('I am a beginner. You choose what works best.');
    sent = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(sent.context.project_intent.decisions.join(' ')).toContain('choose what works best');
    expect(sent.context.component_roles.length).toBe(project.components.length);
    expect(useWorkspaceStore.getState().currentProject).toEqual(project);
  });
  it('F: keeps projects and late replies isolated, even after switching away and back', async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((r) => {
        resolve = r;
      }),
    );
    const request = useGuideStore.getState().ask('Measure distance to objects 1–2 meters away');
    useProjectsStore.getState().createNew('Temperature device', 'blank');
    const secondId = useWorkspaceStore.getState().currentProject.id;
    expect(guideContext().project_intent?.primary_goal).toBe('');
    expect(useWorkspaceStore.getState().demoAssistantMessages).toEqual([]);
    useProjectsStore.getState().switchTo(project.id);
    resolve(result('Stale reply', [{ type: 'add_component', catalog_id: 'rp2040' }]));
    expect(await request).toBe('');
    expect(useGuideStore.getState().pending).toBeNull();
    expect(
      useWorkspaceStore.getState().demoAssistantMessages.some((m) => m.text === 'Stale reply'),
    ).toBe(false);
    useProjectsStore.getState().switchTo(secondId);
    fetchMock.mockResolvedValue(result('Temperature guidance'));
    await useGuideStore.getState().ask('I want to measure temperature');
    expect(JSON.stringify(JSON.parse(fetchMock.mock.calls[1][1].body))).not.toContain('1–2');
    useProjectsStore.getState().switchTo(project.id);
    expect(guideContext().project_intent?.intended_function).toBe('object-distance measurement');
  });
  it('G: restores bounded memory, conversation and drafts from the existing archive', async () => {
    fetchMock.mockResolvedValue(result('Which environment will you use?'));
    await useGuideStore.getState().ask('Measure distance to objects 1–2 meters away');
    useGuideStore.getState().setExplanationMode('engineer');
    const saved = useProjectsStore.getState().mentors![project.id];
    useProjectsStore.getState().setMentor(project.id, { ...saved, draft: 'Unsent follow-up' });
    useProjectsStore.getState().saveActive();
    const restored = loadArchive();
    expect(restored.mentors?.[project.id].intent.requirements.join(' ')).toContain('1–2');
    expect(restored.mentors?.[project.id].draft).toBe('Unsent follow-up');
    expect(restored.chats[project.id].at(-1)?.text).toBe('Which environment will you use?');
    expect(localStorage.getItem(EXPLANATION_KEY)).toBe('engineer');
    expect(localStorage.getItem(PROJECTS_KEY)).toContain('object-distance measurement');
  });
  it('H: stores proposals without mutating hardware, and retains revision protection', async () => {
    fetchMock.mockResolvedValue(
      result('Propose a controller', [{ type: 'add_component', catalog_id: 'rp2040' }]),
    );
    await useGuideStore.getState().ask('Add RP2040');
    expect(useWorkspaceStore.getState().currentProject.components).toHaveLength(
      project.components.length,
    );
    expect(useGuideStore.getState().pending).not.toBeNull();
    useGuideStore.getState().approve();
    expect(useWorkspaceStore.getState().currentProject.components).toHaveLength(
      project.components.length + 1,
    );
    await useGuideStore.getState().ask('Add RP2040');
    useWorkspaceStore
      .getState()
      .applyProjectRevision({ ...useWorkspaceStore.getState().currentProject, name: 'Changed' });
    useGuideStore.getState().approve();
    expect(useWorkspaceStore.getState().currentProject.components).toHaveLength(
      project.components.length + 1,
    );
  });
  it('preserves failed questions and drafts without adopting errors as advice', async () => {
    useProjectsStore.getState().setMentor(project.id, { ...emptyMemory(), draft: 'My question' });
    fetchMock.mockRejectedValue(new Error('secret provider exception'));
    await useGuideStore.getState().ask('My question');
    expect(useGuideStore.getState().lastRequestFailed).toBe(true);
    expect(useProjectsStore.getState().mentors?.[project.id].draft).toBe('My question');
    expect(useWorkspaceStore.getState().demoAssistantMessages[0].text).toBe('My question');
    expect(useProjectsStore.getState().mentors?.[project.id].intent.proposed_next_steps).toBe('');
  });
  it('handles hiding inspection as a supported UI action without hardware mutation or AI calls', async () => {
    useGuideStore.setState({ inspection: { projectId: project.id, revision: 0, findings: [] } });
    const reply = await useGuideStore.getState().ask('Hide the Project Inspection table');
    expect(reply).toContain('hidden');
    expect(useGuideStore.getState().inspection).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().currentProject).toEqual(project);
  });
  it('redacts credentials from drafts, memory, conversations and requests', async () => {
    const text = 'api_key=sk-abcdefghijklmnopqrstuvwxyz password="hunter-secret"';
    useProjectsStore.getState().setMentor(project.id, { ...emptyMemory(), draft: text });
    fetchMock.mockResolvedValue(result('Do not share credentials.'));
    await useGuideStore.getState().ask(text);
    const saved = localStorage.getItem(PROJECTS_KEY)!;
    expect(saved).not.toContain('hunter-secret');
    expect(saved).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
    expect(fetchMock.mock.calls[0][1].body).not.toContain('hunter-secret');
  });
  it('reports truncation while retaining goals beyond the recent conversation window', () => {
    let memory = rememberUser(emptyMemory(), 'Measure distance to objects 1–2 meters away');
    for (let i = 0; i < 40; i++)
      memory = rememberUser(memory, `Requirement ${i}: must work indoors`);
    expect(memory.intent.primary_goal).toBe('Measure distance to physical objects');
    expect(memory.intent.requirements).toHaveLength(12);
    expect(memory.intent.omitted_entries).toBeGreaterThan(0);
    const history = Array.from({ length: 20 }, (_, id) => ({
      id,
      role: 'assistant' as const,
      text: 'x'.repeat(5000) + ' Actual last question?',
    }));
    const bounded = boundedConversation(history, 'Explain that');
    expect(bounded.messages.length).toBeLessThanOrEqual(10);
    expect(bounded.messages.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(12000);
    expect(bounded.messages.at(-2)?.content).toContain('Actual last question?');
    expect(bounded.omitted_messages).toBeGreaterThan(0);
    expect(bounded.omitted_characters).toBeGreaterThan(0);
    expect(
      restoreMemory({ intent: { requirements: [null, 'valid'] } }).intent.requirements,
    ).toEqual(['valid']);
  });
});

it('bounds the UTF-8 request body and identifies additional omitted context', async () => {
  const { askGuide } = await import('../src/ai/client');
  fetchMock.mockResolvedValue(result('Bounded response'));
  const context = guideContext();
  const text = '界'.repeat(500);
  context.project_intent = {
    ...emptyMemory().intent,
    requirements: Array(12).fill(text),
    decisions: Array(12).fill(text),
    corrections: Array(12).fill(text),
    unknowns: Array(12).fill(text),
  };
  context.component_roles = Array.from({ length: 64 }, (_, i) => ({ id: `part-${i}`, role: text }));
  const history = Array.from({ length: 10 }, (_, id) => ({
    id,
    role: 'assistant' as const,
    text: '界'.repeat(4000),
  }));
  await askGuide('Choose what works best', context, 'auto', history);
  const body = fetchMock.mock.calls[0][1].body;
  expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(190000);
  const sent = JSON.parse(body);
  expect(sent.context.context_omitted).toContain('component_roles');
  expect(context.component_roles).toHaveLength(64);
});

it('retains a marked excerpt of a long detailed answer on reload', () => {
  useWorkspaceStore.getState().addMessage('assistant', 'x'.repeat(11000) + ' Final question?');
  useProjectsStore.getState().saveActive();
  const restored = loadArchive().chats[project.id].at(-1)!;
  expect(restored.text.length).toBeLessThanOrEqual(10000);
  expect(restored.text).toContain('[Earlier message text omitted]');
  expect(restored.text).toContain('Final question?');
});
