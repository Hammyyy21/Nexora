import { beforeEach, expect, it } from 'vitest';
import { useWorkspaceStore as store } from '../src/store/useWorkspaceStore';
import { assessPosition, canonicalPosition, MM_PER_UNIT } from '../src/lib/transforms';
import { displayedPosition, parseProject, serializeProject, loadProject } from '../src/lib/project';
import type { Vec3 } from '../src/types/workspace';

beforeEach(() => {
  store.setState(store.getInitialState(), true);
  localStorage.clear();
});
const component = () => store.getState().currentProject.components.find((c) => c.id === 'mcu')!;
const start = () => {
  store.getState().selectComponent('mcu');
  store.getState().setDragMode(true);
  expect(store.getState().beginComponentDrag('mcu')).toBe(true);
};

it('keeps previews out of project saves and commits a continuous drag as one undo action', () => {
  const original = component();
  const project = store.getState().currentProject;
  start();
  for (let i = 0; i < 100; i++) store.getState().previewComponentDrag([i / 100, 0.5, -1]);
  expect(store.getState().currentProject).toBe(project);
  expect(store.getState().undoHistory).toHaveLength(0);
  store.getState().save();
  expect(loadProject().components.find((c) => c.id === 'mcu')).toEqual(original);
  store.getState().finishComponentDrag();
  expect(component().position).toEqual([0.99, 0.5, -1]);
  expect(component().rotation).toEqual(original.rotation);
  expect(component().dimensions).toEqual(original.dimensions);
  expect(store.getState().undoHistory).toHaveLength(1);
  store.getState().undo();
  expect(component()).toEqual(original);
  store.getState().redo();
  expect(component().position).toEqual([0.99, 0.5, -1]);
  expect(store.getState().selectedComponentId).toBe('mcu');
});

it.each([
  [NaN, 1, 0],
  [Infinity, 0, 0],
  [20.01, 0, 0],
  [-20.01, 0, 0],
] as Vec3[])(
  'rejects invalid positions (%s, %s, %s) without history or project changes',
  (x, y, z) => {
    const project = store.getState().currentProject;
    expect(store.getState().moveComponent('mcu', [x, y, z])).toBe(false);
    expect(store.getState().currentProject).toBe(project);
    start();
    expect(store.getState().previewComponentDrag([x, y, z])).toBe(false);
    store.getState().finishComponentDrag();
    expect(store.getState().undoHistory).toHaveLength(0);
  },
);

it('uses the complete rotated footprint and PCB surface for optional board constraints', () => {
  store.getState().setPlacementMode('board');
  expect(store.getState().moveComponent('mcu', [3.85, 0.5, 0])).toBe(true);
  expect(store.getState().moveComponent('mcu', [3.86, 0.5, 0])).toBe(false);
  expect(store.getState().moveComponent('mcu', [0, 0.1, 0])).toBe(false);
  expect(store.getState().moveComponent('mcu', [-3, 0.5, -2])).toBe(true);
  const p = store.getState().currentProject;
  const rotated = { ...component(), rotation: [0, 45, 0] as Vec3 };
  expect(assessPosition(p, rotated, [3.7, 0.5, 0]).valid).toBe(false);
  const shiftedBoard = {
    ...p,
    components: p.components.map((c) =>
      c.id === 'pcb' ? { ...c, position: [2, 0, 0] as Vec3, rotation: [0, 90, 0] as Vec3 } : c,
    ),
  };
  expect(assessPosition(shiftedBoard, component(), [4.6, 0.5, 0]).valid).toBe(false);
  expect(assessPosition(shiftedBoard, component(), [2, 0.5, 3.8]).valid).toBe(true);
  store.getState().setPlacementMode('free');
  expect(store.getState().moveComponent('mcu', [-10, -1, 0])).toBe(true);
  expect(
    assessPosition(
      store.getState().currentProject,
      component(),
      component().position,
    ).warnings.join(),
  ).toContain('Outside the PCB');
});

it('warns about approximate collision bounds without claiming electrical connectivity', () => {
  const p = store.getState().currentProject;
  const sensor = p.components.find((c) => c.id === 'sensor')!;
  const result = assessPosition(p, component(), sensor.position);
  expect(result.valid).toBe(true);
  expect(result.warnings.join()).toContain('Possible overlap with Temperature Sensor');
});

it('locks the PCB, housing and explicitly fixed components', () => {
  for (const id of ['pcb', 'housing'])
    expect(store.getState().moveComponent(id, [1, 2, 3])).toBe(false);
  const p = store.getState().currentProject;
  store.setState({
    currentProject: {
      ...p,
      components: p.components.map((c) => (c.id === 'mcu' ? { ...c, fixed: true } : c)),
    },
  });
  expect(store.getState().moveComponent('mcu', [1, 2, 3])).toBe(false);
  store.getState().selectComponent('mcu');
  store.getState().setDragMode(true);
  expect(store.getState().beginComponentDrag('mcu')).toBe(false);
  expect(store.getState().undoHistory).toHaveLength(0);
});

it.each(['cancel', 'selection', 'mode', 'undo', 'disabled'])(
  'discards an interrupted gesture (%s) without recording history',
  (action) => {
    const original = component();
    start();
    store.getState().previewComponentDrag([2, 1, -2]);
    if (action === 'cancel') store.getState().cancelComponentDrag();
    if (action === 'selection') store.getState().selectComponent('sensor');
    if (action === 'mode') store.getState().setViewMode('exploded');
    if (action === 'undo') store.getState().undo();
    if (action === 'disabled') store.getState().setDragMode(false);
    store.getState().finishComponentDrag();
    expect(store.getState().componentDrag).toBeNull();
    expect(component()).toEqual(original);
    expect(store.getState().undoHistory).toHaveLength(0);
  },
);

it('round-trips precise canonical coordinates and placement mode through save/load and all view modes', () => {
  expect(MM_PER_UNIT).toBe(10);
  const position: Vec3 = [-2.123456, 0.512345, 1.23];
  store.getState().moveComponent('mcu', position);
  store.getState().setPlacementMode('board');
  for (const mode of ['exploded', 'xray', 'assembly', 'connections'] as const) {
    store.getState().setViewMode(mode);
    expect(canonicalPosition(displayedPosition(component(), mode), component(), mode)).toEqual(
      position,
    );
    expect(component().position).toEqual(position);
  }
  store.getState().save();
  store.getState().reset();
  store.getState().load();
  expect(component().position).toEqual(position);
  expect(store.getState().currentProject.placementMode).toBe('board');
  expect(parseProject(serializeProject(store.getState().currentProject))).toEqual(
    store.getState().currentProject,
  );
});
