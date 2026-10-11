import { beforeEach, expect, it, vi } from 'vitest';
import { createProject } from '../src/projects/templates';
import { useWorkspaceStore as workspace } from '../src/store/useWorkspaceStore';
import { useGuideStore as guide, guideContext } from '../src/ai/store';
import { useFirmwareStore, draftFor } from '../src/firmware/store';
import { parseProject, serializeProject } from '../src/lib/project';
import { previewAIChanges, parseAIAction } from '../src/ai/actions';
import { reviewCalculations, reviewDemoConnections } from '../src/engineering/calculations';
import { reviewDesign } from '../src/engineering/insights';
import { boardTemplates } from '../src/workspace/boardTemplates';
import { boardSpecification } from '../src/workspace/boardSpecifications';

beforeEach(() => {
  workspace.setState(workspace.getInitialState(), true);
  guide.setState(guide.getInitialState(), true);
  vi.unstubAllGlobals();
});
it('round trips connected demo assemblies and deterministic calculations', () => {
  for (const id of ['cooling', 'iot', 'robotics'] as const) {
    const p = createProject(id, id);
    expect(p.connections!.length).toBeGreaterThan(3);
    expect(parseProject(serializeProject(p))).toEqual(p);
    expect(reviewDesign(p)).toEqual(reviewDesign(p));
  }
  const p = createProject('Motor', 'robotics');
  expect(reviewCalculations(p).find((f) => f.id === 'power-budget')?.status).toBe('fail');
  p.engineeringInputs![p.components[2].id].currentMa = 100;
  expect(reviewCalculations(p).find((f) => f.id === 'power-budget')?.status).toBe('pass');
  delete p.engineeringInputs![p.components[2].id];
  expect(reviewCalculations(p).find((f) => f.id === 'power-budget')?.status).toBe('unknown');
});
it('calculates thermal estimates only with complete parameters', () => {
  const p = createProject('Thermal', 'robotics'),
    id = p.components[1].id;
  p.engineeringInputs = {
    [id]: {
      provenance: 'demo',
      dissipationW: 2,
      thermalResistance: 40,
      ambientC: 25,
      maxTemperatureC: 80,
    },
  };
  expect(reviewCalculations(p).find((f) => f.id === `thermal:${id}`)).toMatchObject({
    status: 'fail',
    details: expect.stringContaining('105.0'),
  });
  delete p.engineeringInputs[id].ambientC;
  expect(reviewCalculations(p).some((f) => f.id === `thermal:${id}`)).toBe(false);
});
it('switches every generic board preset and preserves geometry through import, undo and redo', () => {
  workspace.getState().activateProject(createProject('Boards', 'blank'));
  expect(boardTemplates.length).toBeGreaterThanOrEqual(10);
  for (const t of boardTemplates) {
    workspace.getState().setBoardTemplate(t.id);
    const p = workspace.getState().currentProject;
    expect(boardSpecification(p, p.components[0])?.length.value).toBe(
      p.components[0].dimensions[0] * 10,
    );
    expect(parseProject(serializeProject(p)).components[0].dimensions).toEqual(
      p.components[0].dimensions,
    );
  }
  workspace.getState().undo();
  expect(workspace.getState().currentProject.boardTemplateId).toBe('power');
  workspace.getState().redo();
  expect(workspace.getState().currentProject.boardTemplateId).toBe('display');
});
it('detects crossed demo buses and missing controller lanes', () => {
  const p = createProject('IoT', 'iot');
  expect(
    reviewDemoConnections(p)
      .filter((f) => f.id.startsWith('required-signal:'))
      .every((f) => f.status === 'pass'),
  ).toBe(true);
  p.connections = p.connections!.filter((w) => w.from.portId !== 'demo:SCL');
  expect(
    reviewDemoConnections(p).some((f) => f.id.endsWith('demo:SCL') && f.status === 'fail'),
  ).toBe(true);
  p.connections![2].from.portId = 'demo:PWM';
  expect(
    reviewDemoConnections(p).some((f) => f.id.startsWith('demo-interface:') && f.status === 'fail'),
  ).toBe(true);
});
it('previews, cancels, applies and undoes actual connection actions from mocked AI', async () => {
  const p = createProject('IoT', 'iot');
  p.connections = [];
  workspace.getState().activateProject(p);
  const [a, b] = p.components.slice(1);
  const action = {
    type: 'connect_components',
    component_id: a.id,
    port_id: 'demo:SDA',
    target_component_id: b.id,
    target_port_id: 'demo:SDA',
  };
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          mode: 'ai',
          request_id: 'test',
          answer: 'Connection ready to review.',
          actions: [action],
          notice: 'Review',
          references: [],
          missing_data: [],
          unverified_recommendations: [],
          cited_catalog_ids: [],
        }),
      }),
  );
  guide.setState({ mode: 'ai', availability: 'ready' });
  await guide.getState().ask('Connect the temperature sensor to the controller.');
  expect(workspace.getState().currentProject.connections).toHaveLength(0);
  guide.getState().cancel();
  expect(guide.getState().pending).toBeNull();
  await guide.getState().ask('Connect the temperature sensor to the controller.');
  guide.getState().approve();
  expect(workspace.getState().currentProject.connections).toHaveLength(1);
  workspace.getState().undo();
  expect(workspace.getState().currentProject.connections).toHaveLength(0);
  workspace.getState().redo();
  expect(
    parseProject(serializeProject(workspace.getState().currentProject)).connections,
  ).toHaveLength(1);
});
it('edits generated firmware in preview and restores prior source on undo', async () => {
  const p = createProject('IoT', 'iot');
  workspace.getState().activateProject(p);
  useFirmwareStore.getState().editSource(p.id, '// my existing source');
  await guide.getState().ask('Generate basic firmware for this controller.');
  expect(draftFor(useFirmwareStore.getState(), p.id).source).toBe('// my existing source');
  guide.getState().editPendingSource('// reviewed starter\nint main(void) { return 0; }');
  guide.getState().approve();
  expect(draftFor(useFirmwareStore.getState(), p.id).source).toContain('reviewed starter');
  workspace.getState().undo();
  expect(draftFor(useFirmwareStore.getState(), p.id).source).toBe('// my existing source');
  workspace.getState().redo();
  expect(
    parseProject(serializeProject(workspace.getState().currentProject)).firmwareSource,
  ).toContain('reviewed starter');
});
it('rejects stale proposals and malformed pins without modifying state', async () => {
  const p = createProject('IoT', 'iot');
  workspace.getState().activateProject(p);
  await guide.getState().ask('Add a temperature sensor.');
  workspace.getState().setBoardTemplate('large');
  const before = workspace.getState().currentProject;
  guide.getState().approve();
  expect(workspace.getState().currentProject).toBe(before);
  expect(() =>
    previewAIChanges(p, [
      {
        type: 'connect_components',
        component_id: p.components[1].id,
        port_id: 'invented',
        target_component_id: p.components[2].id,
        target_port_id: 'demo:SDA',
      },
    ]),
  ).toThrow();
  expect(() => parseAIAction({ type: 'execute_shell', command: 'whoami' })).toThrow();
});
it('sends real supported ports only when relevant', () => {
  workspace.getState().activateProject(createProject('IoT', 'iot'));
  expect(
    guideContext(undefined, 'Connect sensor to controller').project_components?.find(
      (c) => c.catalog_id === 'bme280',
    )?.ports?.length,
  ).toBeGreaterThan(0);
  expect(
    guideContext(undefined, 'Hello').project_components?.find((c) => c.catalog_id === 'bme280')
      ?.ports,
  ).toBeUndefined();
});
