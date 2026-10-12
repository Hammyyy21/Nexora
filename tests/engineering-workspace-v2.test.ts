import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/projects/templates';
import { demoProject } from '../src/data/demoProject';
import { parseProject, serializeProject } from '../src/lib/project';
import {
  validBoardConfiguration,
  defaultBoardConfiguration,
} from '../src/workspace/boardSpecifications';
import {
  normalizeBoard,
  pointInside,
  rectangleInside,
  snapPosition,
} from '../src/workspace/boardGeometry';
import { applyPCBOperation } from '../src/workspace/pcbOperations';
import { assessPosition } from '../src/lib/transforms';
import { createInstance } from '../src/catalog/instances';
import { getPart } from '../src/catalog/catalog';
import { useWorkspaceStore as store } from '../src/store/useWorkspaceStore';
import {
  buildWorkspaceSnapshot,
  inspectProject,
  workspaceNets,
  SNAPSHOT_MAX_BYTES,
} from '../src/ai/snapshot';
import { parseAIAction, previewAIChanges } from '../src/ai/actions';
import { useGuideStore as guide } from '../src/ai/store';
import { navigateFinding } from '../src/ai/findingNavigation';
import { useLibraryStore } from '../src/catalog/store';
import { logicalPorts } from '../src/schematic/model';
import type { BoardConfiguration } from '../src/workspace/boardSpecifications';
const rectangle = (): BoardConfiguration =>
  normalizeBoard({
    ...defaultBoardConfiguration(),
    length: 80,
    width: 60,
    outline: { kind: 'rectangle' },
    mountingHoles: [],
  });
function fixture() {
  const p = createProject('PCB');
  p.boardConfiguration = rectangle();
  p.components[0].dimensions = [8, 0.16, 6];
  p.components.push({ ...createInstance(getPart('tmp102')!, 'part-sensor'), position: [0, 1, 0] });
  return p;
}
beforeEach(() => {
  store.setState(store.getInitialState(), true);
  guide.setState({ ...guide.getInitialState(), availability: 'unconfigured', mode: 'demo' }, true);
  localStorage.clear();
});
describe('PCB schema and geometry', () => {
  it('migrates v1 and v2 without altering transforms, firmware, or symbolic terminal namespaces', () => {
    for (const schemaVersion of [1, 2] as const) {
      const old = { ...structuredClone(demoProject), schemaVersion };
      const migrated = parseProject(JSON.stringify(old));
      expect(migrated.schemaVersion).toBe(3);
      expect(migrated.boardConfiguration?.outline).toEqual({
        kind: 'rounded-rectangle',
        radius: 1.8,
      });
      expect(migrated.components.map((c) => c.position)).toEqual(
        old.components.map((c) => c.position),
      );
      expect(migrated.components.map((c) => c.rotation)).toEqual(
        old.components.map((c) => c.rotation),
      );
      expect(parseProject(serializeProject(migrated))).toEqual(migrated);
    }
    const cooling = createProject('Cooling', 'cooling');
    const migrated = parseProject(
      JSON.stringify({ ...cooling, schemaVersion: 2, firmwareSource: 'int main(void) {}' }),
    );
    expect(migrated.connections).toEqual(cooling.connections);
    expect(migrated.firmwareSource).toBe('int main(void) {}');
    expect(migrated.connections?.some((w) => w.from.portId.startsWith('demo:'))).toBe(true);
  });
  it('supports rectangle, circle, rounded rectangle and a concave polygon', () => {
    const c = rectangle();
    expect(validBoardConfiguration(c)).toBe(true);
    const circle = { ...c, width: 80, outline: { kind: 'circle' as const } };
    expect(validBoardConfiguration(circle)).toBe(true);
    expect(pointInside({ x: 39, z: 39 }, circle)).toBe(false);
    expect(validBoardConfiguration({ ...circle, width: 60 })).toBe(false);
    const polygon = {
      ...c,
      outline: {
        kind: 'polygon' as const,
        points: [
          { x: -40, z: -30 },
          { x: 40, z: -30 },
          { x: 40, z: 30 },
          { x: 5, z: 30 },
          { x: 5, z: 0 },
          { x: -5, z: 0 },
          { x: -5, z: 30 },
          { x: -40, z: 30 },
        ],
      },
    };
    expect(validBoardConfiguration(polygon)).toBe(true);
    expect(rectangleInside({ x: -10, z: 10 }, { x: 10, z: 20 }, polygon)).toBe(false); // corners alone would pass
    expect(
      validBoardConfiguration({ ...c, outline: { kind: 'rounded-rectangle', radius: 50 } }),
    ).toBe(false);
  });
  it('rejects self intersections, invalid numbers, oversized outlines, and holes outside curved boards', () => {
    const c = rectangle();
    expect(
      validBoardConfiguration({
        ...c,
        outline: {
          kind: 'polygon',
          points: [
            { x: -10, z: -10 },
            { x: 10, z: 10 },
            { x: 10, z: -10 },
            { x: -10, z: 10 },
          ],
        },
      }),
    ).toBe(false);
    expect(validBoardConfiguration({ ...c, length: Infinity })).toBe(false);
    expect(
      validBoardConfiguration({
        ...c,
        outline: { kind: 'polygon', points: Array(65).fill({ x: 1, z: 1 }) },
      }),
    ).toBe(false);
    expect(
      validBoardConfiguration({
        ...c,
        width: 80,
        outline: { kind: 'circle' },
        mountingHoles: [{ x: 35, z: 35, diameter: 3 }],
      }),
    ).toBe(false);
    expect(validBoardConfiguration({ ...c, grid: { enabled: true, spacing: 0 } })).toBe(false);
  });
  it('places on both surfaces, respects side-specific regions and unsupported sides', () => {
    const p = fixture();
    p.placementMode = 'board';
    const bottom = applyPCBOperation(p, {
      type: 'update_component',
      component_id: 'part-sensor',
      side: 'bottom',
    });
    const c = bottom.components[1];
    expect(c.position[1]).toBeLessThan(0);
    expect(c.rotation[0]).toBe(180);
    expect(assessPosition(bottom, c, c.position).valid).toBe(true);
    bottom.boardConfiguration!.restrictedRegions = [
      { id: 'region-top', name: 'Top only', x: 0, z: 0, length: 20, width: 20, side: 'top' },
    ];
    expect(assessPosition(bottom, c, c.position).valid).toBe(true);
    expect(() =>
      applyPCBOperation(bottom, { type: 'update_component', component_id: c.id, side: 'top' }),
    ).toThrow(/restricted/);
    bottom.boardConfiguration!.supportedSides = ['top'];
    expect(assessPosition(bottom, c, c.position).valid).toBe(false);
  });
  it('snaps in a rotated board frame around the configured origin', () => {
    const p = fixture();
    p.components[0].rotation = [0, 90, 0];
    p.boardConfiguration!.grid = { enabled: true, spacing: 2 };
    p.boardConfiguration!.coordinates!.origin = { x: 1, z: 1 };
    const result = snapPosition(p, [0.22, 1, -0.22]);
    expect(result[0]).toBeCloseTo(0.3);
    expect(result[2]).toBeCloseTo(-0.3);
  });
  it('edits footprints, duplicates concept components without copying connectivity, and round-trips', () => {
    let p = parseProject(serializeProject(demoProject));
    p.connections = [];
    p = applyPCBOperation(p, {
      type: 'update_component',
      component_id: 'sensor',
      footprint: { name: 'Custom body', length: 9, width: 7, provenance: 'user-configured' },
    });
    const wires = p.connections?.length;
    p = applyPCBOperation(p, { type: 'duplicate_component', component_id: 'sensor' });
    expect(p.connections).toHaveLength(wires!);
    const copy = p.components.at(-1)!;
    expect(copy.conceptSourceId).toBe('sensor');
    expect(logicalPorts(copy)).toEqual(logicalPorts(p.components.find((c) => c.id === 'sensor')!));
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
  it('undoes and redoes board and component edits and persists them', () => {
    store.getState().activateProject(fixture());
    const original = store.getState().currentProject;
    store.getState().configureBoard({ ...rectangle(), thickness: 2.4 });
    store
      .getState()
      .applyPCBEdit({ type: 'update_component', component_id: 'part-sensor', side: 'bottom' });
    const saved = store.getState().currentProject;
    store.getState().save();
    store.getState().undo();
    store.getState().undo();
    expect(store.getState().currentProject).toEqual(original);
    store.getState().redo();
    store.getState().redo();
    expect(store.getState().currentProject).toEqual(saved);
    store.getState().load();
    expect(store.getState().currentProject).toEqual({ ...saved, selectedComponentId: null });
  });
});
describe('Inspection and safe proposals', () => {
  it('uses project-wide topology, firmware and catalog identities with consistent entity references', () => {
    const p = createProject('Cooling', 'cooling');
    p.firmwareTargetId = 'mcu';
    p.firmwareSource = '// current draft';
    const s = buildWorkspaceSnapshot(p, 7, 'sensor');
    expect(s.project.revision).toBe(7);
    expect(s.firmware.source).toBe(p.firmwareSource);
    expect(s.firmware.targetId).toBe('mcu');
    expect(s.schematic.wires).toEqual(p.connections);
    expect(s.schematic.nets.length).toBeGreaterThan(0);
    expect(s.components[0].id).toBe('sensor');
    expect(s.findings.every((f) => f.entities.length)).toBe(true);
    for (const f of s.findings)
      for (const e of f.entities)
        if (e.kind === 'component') expect(p.components.some((c) => c.id === e.id)).toBe(true);
    const reversed = { ...p, connections: [...p.connections!].reverse() };
    expect(
      workspaceNets(reversed)
        .map((n) => n.id)
        .sort(),
    ).toEqual(
      workspaceNets(p)
        .map((n) => n.id)
        .sort(),
    );
  });
  it('reports missing connections and distinguishes a recorded target mismatch from source validation', () => {
    const p = fixture();
    p.firmwareTargetId = 'part-sensor';
    const findings = inspectProject(p);
    expect(findings.some((f) => f.id === 'unconnected:part-sensor')).toBe(true);
    expect(findings.find((f) => f.id === 'firmware:source')?.classification).toBe(
      'missing-information',
    );
    expect(findings.every((f) => !f.details.includes('electrically safe'))).toBe(true);
  });
  it('excludes arbitrary state and redacts recognizable credentials and paths, marking truncated source', () => {
    const p = fixture();
    Object.assign(p, { api_key: 'PRIVATE', otherProjects: [{ name: 'HIDDEN' }] });
    p.firmwareSource =
      'const char *api_key = "secret-value";\n// /Users/alice/.env\n' + '🙂'.repeat(90000);
    const s = buildWorkspaceSnapshot(p);
    const json = JSON.stringify(s);
    expect(json).not.toContain('secret-value');
    expect(json).not.toContain('PRIVATE');
    expect(json).not.toContain('HIDDEN');
    expect(json).not.toContain('/Users/alice');
    expect(s.omitted.redacted).toBe(true);
    expect(s.omitted.firmwareCharacters).toBeGreaterThan(0);
    expect(new TextEncoder().encode(json).length).toBeLessThanOrEqual(SNAPSHOT_MAX_BYTES);
  });
  it('navigates findings to components, actual nets, regions and firmware in the existing workspace', () => {
    const p = createProject('Cooling', 'cooling');
    p.boardConfiguration!.restrictedRegions = [
      { id: 'region-test', name: 'Keep-out', x: 0, z: 0, length: 5, width: 5 },
    ];
    store.getState().activateProject(p);
    expect(navigateFinding({ kind: 'component', id: 'sensor' })).toBe(true);
    expect(store.getState().selectedComponentId).toBe('sensor');
    const net = workspaceNets(p)[0];
    expect(navigateFinding({ kind: 'net', id: net.id })).toBe(true);
    expect(useLibraryStore.getState().workspace).toBe('schematic');
    expect(store.getState().selectedEntity?.id).toBe(net.id);
    expect(navigateFinding({ kind: 'region', id: 'region-test' })).toBe(true);
    expect(store.getState().selectedComponentId).toBe('pcb');
    expect(navigateFinding({ kind: 'firmware', id: 'cooling' })).toBe(true);
    expect(useLibraryStore.getState().workspace).toBe('code');
    expect(navigateFinding({ kind: 'component', id: 'nonexistent' })).toBe(false);
  });
  it('rejects malformed new actions and fails an entire batch without mutations', () => {
    expect(() =>
      parseAIAction({ type: 'update_component', component_id: 'sensor', rotation: [0, NaN, 0] }),
    ).toThrow();
    expect(() =>
      parseAIAction({ type: 'update_component', component_id: 'sensor', side: 'internal' }),
    ).toThrow();
    expect(() =>
      parseAIAction({ type: 'configure_board', configuration: { ...rectangle(), thickness: -1 } }),
    ).toThrow();
    expect(() =>
      parseAIAction({ type: 'duplicate_component', component_id: 'sensor', command: 'shell' }),
    ).toThrow();
    const p = fixture(),
      before = serializeProject(p);
    expect(() =>
      previewAIChanges(p, [
        { type: 'configure_board', configuration: rectangle() },
        { type: 'remove_component', component_id: 'pcb' },
      ]),
    ).toThrow();
    expect(serializeProject(p)).toBe(before);
  });
  it('binds proposals to a monotonic revision, including edit then undo', async () => {
    store.getState().activateProject(fixture());
    await guide.getState().ask('add sensor');
    expect(guide.getState().pending).not.toBeNull();
    store.getState().editComponent('part-sensor', { color: '#ffffff' });
    store.getState().undo();
    const before = serializeProject(store.getState().currentProject);
    guide.getState().approve();
    expect(serializeProject(store.getState().currentProject)).toBe(before);
    expect(store.getState().notice).toMatch(/changed/);
  });
  it('returns inspection evidence locally without creating an approval or mutating the project', async () => {
    store.getState().activateProject(fixture());
    const before = serializeProject(store.getState().currentProject);
    await guide.getState().ask('Does my firmware match my selected controller?');
    expect(guide.getState().inspection?.findings.length).toBeGreaterThan(0);
    expect(guide.getState().pending).toBeNull();
    expect(serializeProject(store.getState().currentProject)).toBe(before);
  });
  it('does not accept a late live proposal after a project edit', async () => {
    store.getState().activateProject(fixture());
    guide.setState({ mode: 'ai', availability: 'ready' });
    let resolve!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((r) => {
            resolve = r;
          }),
      ),
    );
    const pending = guide.getState().ask('Change board thickness');
    store.getState().editComponent('part-sensor', { color: '#ffffff' });
    resolve(
      new Response(
        JSON.stringify({
          mode: 'ai',
          request_id: 'test',
          answer: 'Review this proposal',
          notice: '',
          missing_data: [],
          unverified_recommendations: [],
          cited_catalog_ids: [],
          references: [],
          actions: [{ type: 'configure_board', configuration: rectangle() }],
        }),
      ),
    );
    await pending;
    expect(guide.getState().pending).toBeNull();
    vi.unstubAllGlobals();
  });
});
