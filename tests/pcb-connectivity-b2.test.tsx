import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, render, screen, within } from '@testing-library/react';
import { createProject } from '../src/projects/templates';
import { createInstance } from '../src/catalog/instances';
import { getPart } from '../src/catalog/catalog';
import { buildPCBConnectivity, padGap } from '../src/workspace/pcbConnectivity';
import { PCBLayoutPreview } from '../src/workspace/PCBLayoutPreview';
import { reviewDesign } from '../src/engineering/insights';
import { buildWorkspaceSnapshot } from '../src/ai/snapshot';
import { serializeProject, parseProject } from '../src/lib/project';
import { useWorkspaceStore } from '../src/store/useWorkspaceStore';
import { ViewportOverlay } from '../src/components/workspace/ViewportOverlay';
import { ProjectSidebar } from '../src/components/layout/ProjectSidebar';
import type { Project } from '../src/types/workspace';
import type { Footprint } from '../src/workspace/boardGeometry';

function fixture(): Project {
  const project = createProject('PCB Testing', 'blank');
  project.boardConfiguration = { ...project.boardConfiguration!, mountingHoles: [], restrictedRegions: [] };
  for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) {
    const part = createInstance(getPart('tmp102')!, `part-${id}`);
    part.reference = `S${i + 1}`;
    part.position = [i * 0.9, 1, 0];
    project.components.push(part);
  }
  return project;
}
function footprint(layerId: string, portId: string | undefined, x = 0): Footprint {
  return { name: 'User pad', length: 10, width: 9, provenance: 'user-configured',
    pads: [{ id: 'pad-1', x, z: 0, length: 1, width: 1, shape: 'rect', layerId, ...(portId ? { portId } : {}) }] };
}
function wire(from: string, to: string) {
  return { id: `wire-${from}-${to}`, from: { componentId: `part-${from}`, portId: 'pin:SDA' },
    to: { componentId: `part-${to}`, portId: 'pin:SDA' } };
}
function setPad(p: Project, id: string, layer: string, port: string | undefined = 'pin:SDA') {
  p.components.find((part) => part.id === `part-${id}`)!.footprint = footprint(layer, port);
}

describe('B2 advisory net-aware PCB connectivity', () => {
  it('never creates a net or airwire based on pad proximity alone', () => {
    const p = fixture();
    p.components[1].position = [0, 1, 0];
    p.components[2].position = [0, 1, 0];
    setPad(p, 'a', 'copper-1'); setPad(p, 'b', 'copper-1');
    const layout = buildPCBConnectivity(p);
    expect(layout.airwires).toHaveLength(0);
    expect(layout.pads.slice(0, 2).map((pad) => pad.terminalStatus)).toEqual(['unconnected', 'unconnected']);
    expect(layout.checks.some((check) => check.kind === 'unknown-net')).toBe(true);
  });
  it('connects explicitly bound terminals, builds stable airwires and labels them as unrouted', () => {
    const p = fixture();
    p.connections = [wire('a', 'b')];
    setPad(p, 'a', 'copper-1'); setPad(p, 'b', 'copper-1');
    const layout = buildPCBConnectivity(p);
    expect(layout.airwires).toHaveLength(1);
    expect(layout.airwires[0].netId).toBe(layout.pads[0].netId);
    expect(layout.airwires[0].requiresLayerTransition).toBe(false);
    expect(buildPCBConnectivity(parseProject(serializeProject(p))).airwires[0].netId).toBe(layout.airwires[0].netId);
    expect(reviewDesign(p).some((f) => f.id === 'pcb-unrouted')).toBe(true);
    expect(buildWorkspaceSnapshot(p).findings.some((f) => f.id === 'pcb-unrouted')).toBe(true);
    const html = renderToStaticMarkup(<PCBLayoutPreview project={p}/>);
    expect(html).toContain('pcb-airwire');
    expect(html).toContain('NET-1');
    expect(html).toContain('unrouted airwire');
  });
  it('reports different-net copper overlap but does not infer shorts across distinct layers', () => {
    const p = fixture();
    p.connections = [wire('a', 'c'), wire('b', 'd')];
    p.components[1].position = [0, 1, 0];
    p.components[2].position = [0, 1, 0];
    setPad(p, 'a', 'copper-1'); setPad(p, 'b', 'copper-1');
    const single = buildPCBConnectivity(p);
    expect(single.checks.some((c) => c.kind === 'overlap')).toBe(true);
    setPad(p, 'b', 'copper-2');
    expect(buildPCBConnectivity(p).checks.some((c) => c.kind === 'overlap')).toBe(false);
  });
  it('marks airwires across layers as requiring a transition, never as connected copper', () => {
    const p = fixture();
    p.connections = [wire('a', 'b')];
    setPad(p, 'a', 'copper-1'); setPad(p, 'b', 'copper-2');
    const result = buildPCBConnectivity(p);
    expect(result.airwires[0].requiresLayerTransition).toBe(true);
    expect(renderToStaticMarkup(<PCBLayoutPreview project={p}/>)).toContain('needs-via');
  });
  it('preserves geometry and net bindings through JSON, without modifying source projects', () => {
    const p = fixture();
    p.connections = [wire('a', 'b')];
    setPad(p, 'a', 'copper-1'); setPad(p, 'b', 'copper-1');
    const original = structuredClone(p);
    buildPCBConnectivity(p);
    expect(p).toEqual(original);
    const loaded = parseProject(serializeProject(p));
    expect(loaded.name).toBe('PCB Testing');
    expect(buildPCBConnectivity(loaded).airwires).toHaveLength(1);
  });
  it('computes pad-to-pad perimeter gap rather than center-to-center separation', () => {
    const square = (start: number) => ({ outline: [
      { x: start, z: 0 }, { x: start + 1, z: 0 },
      { x: start + 1, z: 1 }, { x: start, z: 1 },
    ] });
    expect(padGap(square(0), square(1))).toBe(0);
    expect(padGap(square(0), square(1.2))).toBeCloseTo(0.2);
    expect(padGap(square(0), square(0.5))).toBe(0);
  });
  it('synchronizes active project title and board name without changing one into the other', () => {
    const state = useWorkspaceStore.getState();
    const p = fixture();
    const previous = state.currentProject;
    let unmount: (() => void) | undefined;
    try {
      // Zustand useSyncExternalStore reads getInitialState() during server rendering.
      // Test browser-visible state/reactivity through the client renderer instead.
      act(() => useWorkspaceStore.setState({ currentProject: p }));
      ({ unmount } = render(<><ViewportOverlay/><ProjectSidebar/></>));
      const sidebar = screen.getByRole('complementary', { name: 'Component explorer' });
      expect(screen.getByRole('heading', { name: 'PCB Testing' })).toBeInTheDocument();
      expect(within(sidebar).getByRole('button', { name: 'PCB Testing' })).toBeInTheDocument();
      expect(sidebar).not.toHaveTextContent('Smart Cooling Controller');

      act(() => useWorkspaceStore.getState().editComponent('pcb', { name: 'Distance Sensor Board' }));
      const updated = useWorkspaceStore.getState().currentProject;
      expect(updated.name).toBe('PCB Testing');
      expect(updated.components[0].name).toBe('Distance Sensor Board');
      expect(parseProject(serializeProject(updated)).components[0].name).toBe('Distance Sensor Board');
      expect(within(sidebar).getByRole('button', { name: /^Distance Sensor Board(?:\s+PCB1)?$/ })).toBeInTheDocument();

      act(() => useWorkspaceStore.setState((current) => ({
        currentProject: { ...current.currentProject, name: 'PCB Testing Renamed' },
      })));
      expect(screen.getByRole('heading', { name: 'PCB Testing Renamed' })).toBeInTheDocument();
      expect(within(sidebar).getByRole('button', { name: 'PCB Testing Renamed' })).toBeInTheDocument();
      expect(useWorkspaceStore.getState().currentProject.components[0].name).toBe('Distance Sensor Board');

      act(() => useWorkspaceStore.getState().undo());
      expect(useWorkspaceStore.getState().currentProject.components[0].name).not.toBe('Distance Sensor Board');
    } finally {
      unmount?.();
      useWorkspaceStore.setState({ currentProject: previous, undoHistory: state.undoHistory, redoHistory: state.redoHistory });
    }
  });
});
