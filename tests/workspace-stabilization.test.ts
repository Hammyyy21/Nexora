import { beforeEach, describe, expect, it } from 'vitest';
import { demoProject } from '../src/data/demoProject';
import { createProject } from '../src/projects/templates';
import { createInstance } from '../src/catalog/instances';
import { getPart } from '../src/catalog/catalog';
import { reviewDesign } from '../src/engineering/insights';
import { parseProject, serializeProject } from '../src/lib/project';
import { useWorkspaceStore } from '../src/store/useWorkspaceStore';
import { navigateFinding } from '../src/ai/findingNavigation';
import { workspaceNets } from '../src/ai/snapshot';
import { logicalPorts } from '../src/schematic/model';
import { applyPCBOperation, boardPlacementIssues } from '../src/workspace/pcbOperations';
import { defaultBoardConfiguration } from '../src/workspace/boardSpecifications';

const store = useWorkspaceStore;
const customBoard = (length: number, width: number) => ({
  ...defaultBoardConfiguration(),
  length,
  width,
  outline: { kind: 'rectangle' as const },
  mountingHoles: [],
  restrictedRegions: [],
});

beforeEach(() => {
  store.setState(store.getInitialState(), true);
  localStorage.clear();
});

describe('Engineering workspace stabilization', () => {
  it('preserves off-board components after resizing and reports a live placement finding', () => {
    const project = createProject('Board resize');
    project.boardConfiguration = customBoard(80, 60);
    project.components[0].dimensions = [8, 0.16, 6];
    project.components.push({
      ...createInstance(getPart('tmp102')!, 'part-sensor'),
      position: [3, 1, 0],
    });
    store.getState().activateProject(project);
    const before = store.getState().currentProject.components[1].position;
    store.getState().configureBoard(customBoard(20, 20));
    const shrunk = store.getState().currentProject;
    expect(shrunk.components[1].position).toEqual(before);
    expect(store.getState().notice).toMatch(/1 component\(s\) need placement review/);
    expect(boardPlacementIssues(shrunk).map((item) => item.componentId)).toContain('part-sensor');
    expect(reviewDesign(shrunk).some((f) =>
      f.componentId === 'part-sensor' && f.status === 'fail' && /PCB outline/i.test(f.details),
    )).toBe(true);
    store.getState().save();
    store.getState().undo();
    expect(boardPlacementIssues(store.getState().currentProject)).toHaveLength(0);
    store.getState().redo();
    expect(boardPlacementIssues(store.getState().currentProject)).toHaveLength(1);
    store.getState().load();
    expect(boardPlacementIssues(store.getState().currentProject)).toHaveLength(1);
  });

  it('allocates distinct references when duplicating a component or its copy', () => {
    let project = parseProject(serializeProject(demoProject));
    project = applyPCBOperation(project, { type: 'duplicate_component', component_id: 'sensor' });
    const copy = project.components.at(-1)!;
    project = applyPCBOperation(project, { type: 'duplicate_component', component_id: 'sensor' });
    project = applyPCBOperation(project, { type: 'duplicate_component', component_id: copy.id });
    const refs = project.components.map((c) => c.reference.toUpperCase());
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs).toContain(`${demoProject.components.find((c) => c.id === 'sensor')!.reference}-COPY1`.toUpperCase());
    expect(parseProject(serializeProject(project))).toEqual(project);
  });

  it('preserves unique catalog-copy reference designators on import', () => {
    const project = createProject('Catalog copies');
    project.boardConfiguration = customBoard(80, 60);
    project.components[0].dimensions = [8, 0.16, 6];
    project.components.push({
      ...createInstance(getPart('tmp102')!, 'part-sensor'),
      position: [0, 1, 0],
    });
    const copy1 = applyPCBOperation(project, { type: 'duplicate_component', component_id: 'part-sensor' });
    const copy2 = applyPCBOperation(copy1, { type: 'duplicate_component', component_id: 'part-sensor' });
    expect(new Set(copy2.components.map((c) => c.reference)).size).toBe(copy2.components.length);
    expect(parseProject(serializeProject(copy2)).components.map((c) => c.reference)).toEqual(
      copy2.components.map((c) => c.reference),
    );
  });

  it('navigates a net using typed physical endpoints that include colons', () => {
    const project = createProject('Physical net');
    project.components.push({ ...createInstance(getPart('tmp102')!, 'part-sensor'), position: [0, 1, 0] });
    project.components.push({ ...createInstance(getPart('tmp102')!, 'part-sensor2'), position: [1, 1, 0] });
    const a = project.components.find((c) => c.id === 'part-sensor')!;
    const physical = logicalPorts(a).find((port) => port.id.startsWith('pin:'))!;
    expect(physical).toBeDefined();
    project.connections = [{
      id: 'wire-test',
      from: { componentId: 'part-sensor', portId: physical.id },
      to: { componentId: 'part-sensor2', portId: physical.id },
    }];
    store.getState().activateProject(project);
    const net = workspaceNets(project)[0];
    expect(navigateFinding({ kind: 'net', id: net.id })).toBe(true);
    expect(store.getState().selectedComponentId).toBe('part-sensor');
    expect(navigateFinding({ kind: 'net', id: 'net-nonexistent' })).toBe(false);
  });
});
