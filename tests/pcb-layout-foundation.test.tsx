import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createProject } from '../src/projects/templates';
import { createInstance } from '../src/catalog/instances';
import { getPart } from '../src/catalog/catalog';
import { applyPCBOperation } from '../src/workspace/pcbOperations';
import { validFootprint, normalizeBoard } from '../src/workspace/boardGeometry';
import { componentOutlineOnBoard, placedPads } from '../src/workspace/pcbLayout';
import { serializeProject, parseProject } from '../src/lib/project';
import { reviewDesign } from '../src/engineering/insights';
import { buildWorkspaceSnapshot } from '../src/ai/snapshot';
import { PCBLayoutPreview } from '../src/workspace/PCBLayoutPreview';
import { PCBComponentEditor } from '../src/workspace/PCBComponentEditor';
import { useWorkspaceStore } from '../src/store/useWorkspaceStore';
import type { Footprint } from '../src/workspace/boardGeometry';

const footprint = (): Footprint => ({
  name: 'User trial layout', length: 12, width: 10, provenance: 'user-configured',
  pads: [
    { id: 'pad-sda', x: -3, z: 0, length: 1.6, width: 1, shape: 'rect', layerId: 'copper-1', portId: 'pin:SDA' },
    { id: 'pad-unassigned', x: 3, z: 0, length: 2, width: 2, shape: 'circle', layerId: 'copper-2' },
  ],
});
function fixture() {
  const p = createProject('Pads');
  p.boardConfiguration = normalizeBoard({ ...p.boardConfiguration!, mountingHoles: [], restrictedRegions: [] });
  p.components.push({ ...createInstance(getPart('tmp102')!, 'part-sensor'), position: [0, 1, 0] });
  return p;
}
describe('PCB layer and pad foundation', () => {
  it('validates IDs, geometry, shape, and pin assignments without inventing manufacturer pads', () => {
    expect(validFootprint(footprint())).toBe(true);
    expect(validFootprint({ ...footprint(), pads: [footprint().pads![0], footprint().pads![0]] })).toBe(false);
    expect(validFootprint({ ...footprint(), pads: [{ ...footprint().pads![0], x: 6 }] })).toBe(false);
    expect(validFootprint({ ...footprint(), pads: [{ ...footprint().pads![1], width: 1 }] })).toBe(false);
    expect(validFootprint({ ...footprint(), pads: [{ ...footprint().pads![0], shell: 'rm' }] })).toBe(false);
  });
  it('saves and restores pads and rejects forged schematic endpoint IDs on import', () => {
    let p = applyPCBOperation(fixture(), { type: 'update_component', component_id: 'part-sensor', footprint: footprint() });
    expect(placedPads(p)).toHaveLength(2);
    expect(placedPads(p)[0].center.x).toBeCloseTo(-3);
    expect(placedPads(p)[1].outline).toHaveLength(24);
    expect(parseProject(serializeProject(p))).toEqual(p);
    p = structuredClone(p);
    p.components[1].footprint!.pads![0].portId = 'pin:does-not-exist';
    expect(() => parseProject(serializeProject(p))).toThrow(/pad layer or terminal/);
    expect(() => applyPCBOperation(fixture(), { type: 'update_component', component_id: 'part-sensor', footprint: p.components[1].footprint! })).toThrow(/terminal/);
  });
  it('does not allow references to non-copper or missing layers', () => {
    const p = fixture();
    expect(() => applyPCBOperation(p, { type: 'update_component', component_id: 'part-sensor', footprint: {
      ...footprint(), pads: [{ ...footprint().pads![0], layerId: 'missing-layer' }],
    } })).toThrow(/non-copper layer/);
  });
  it('warns instead of deleting pad data when board layer count changes', () => {
    const p = applyPCBOperation(fixture(), { type: 'update_component', component_id: 'part-sensor', footprint: footprint() });
    const config = normalizeBoard(p.boardConfiguration!);
    const smaller = applyPCBOperation(p, { type: 'configure_board', configuration: {
      ...config, layers: 1, stackup: config.stackup!.filter((l) => l.id === 'copper-1'),
    } });
    expect(smaller.components[1].footprint?.pads).toHaveLength(2);
    expect(reviewDesign(smaller).some((f) => f.id === 'pad-layer:part-sensor:pad-unassigned')).toBe(true);
  });
  it('represents rotated pad geometry in board-local units and not as a trace', () => {
    const p = applyPCBOperation(fixture(), { type: 'update_component', component_id: 'part-sensor', footprint: footprint(), rotation: [0, 90, 0] });
    const pad = placedPads(p)[0];
    expect(pad.center.x).toBeCloseTo(0);
    expect(Math.abs(pad.center.z)).toBeCloseTo(3);
    expect(componentOutlineOnBoard(p.components[0], p.components[1])).toHaveLength(4);
  });
  it('exposes user pad geometry in a bounded AI snapshot with provenance', () => {
    const p = applyPCBOperation(fixture(), { type: 'update_component', component_id: 'part-sensor', footprint: footprint() });
    const component = buildWorkspaceSnapshot(p).components.find((c) => c.id === 'part-sensor');
    expect(component?.footprint.pads?.map((pad) => pad.id)).toEqual(['pad-sda', 'pad-unassigned']);
    expect(component?.footprint.provenance).toBe('user-configured');
  });
  it('renders the component editor for a legacy board without PCB configuration', () => {
    const originalProject = useWorkspaceStore.getState().currentProject;
    try {
      const project = fixture();
      project.boardConfiguration = undefined;
      useWorkspaceStore.setState({ currentProject: project });
      const html = renderToStaticMarkup(<PCBComponentEditor component={project.components[1]} />);
      expect(html).toContain('PCB placement');
      expect(html).toContain('Add copper pad');
      expect(html).toContain('disabled');
    } finally {
      useWorkspaceStore.setState({ currentProject: originalProject });
    }
  });
  it('renders a board-oriented layout with copper pads and per-component selection', () => {
    const p = applyPCBOperation(fixture(), { type: 'update_component', component_id: 'part-sensor', footprint: footprint() });
    const html = renderToStaticMarkup(<PCBLayoutPreview project={p} />);
    expect(html).toContain('PCB layout preview');
    expect(html).toContain('pad-sda');
    expect(html).toContain('2 defined pads');
    expect(html).toContain('No schematic net');
  });
});
