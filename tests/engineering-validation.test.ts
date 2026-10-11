import { describe, expect, it } from 'vitest';
import { createInstance } from '../src/catalog/instances';
import { getPart } from '../src/catalog/catalog';
import { createProject } from '../src/projects/templates';
import { assessPosition } from '../src/lib/transforms';
import { suggestPlacements } from '../src/engineering/placement';
import { reviewDesign } from '../src/engineering/insights';
import { reviewElectrical } from '../src/engineering/electrical';
import { demoProject } from '../src/data/demoProject';
import type { Project, SchematicConnection } from '../src/types/workspace';

const wire = (id: string, a: string, ap: string, b: string, bp: string): SchematicConnection => ({
  id: `wire-${id}`, from: { componentId: a, portId: ap }, to: { componentId: b, portId: bp },
});

describe('engineering review and visual placement suggestions', () => {
  it('reports missing controller communication and non-confirmed supply paths without inventing physical pinouts', () => {
    const project = structuredClone(demoProject);
    const first = reviewElectrical(project);
    expect(first.some((f) => f.id === 'data-unconnected:sensor')).toBe(true);
    expect(first.some((f) => f.id === 'no-functional-wiring')).toBe(true);
    project.connections = [wire('data', 'sensor', 'DATA', 'mcu', 'IO-A')];
    const after = reviewElectrical(project);
    expect(after.some((f) => f.id === 'data-unconnected:sensor')).toBe(false);
    expect(after.some((f) => f.id === 'controller-path:sensor')).toBe(false);
    expect(after.some((f) => f.id === 'unverified-pinout')).toBe(true);
    expect(reviewDesign(project).some((f) => f.id === 'no-netlist')).toBe(true);
  });

  it('warns on a supply-ground net and direct signal-to-ground shorts', () => {
    const project = structuredClone(demoProject);
    project.connections = [wire('short', 'sensor', 'VDD', 'mcu', 'GND'), wire('sig', 'sensor', 'DATA', 'mcu', 'GND')];
    const issues = reviewElectrical(project);
    expect(issues.some((f) => f.id.startsWith('net-shorted:'))).toBe(true);
    expect(issues.some((f) => f.id.startsWith('signal-supply:'))).toBe(true);
    expect(issues.some((f) => f.title.includes('Physical pin mapping'))).toBe(true);
  });

  it('suggests distinct, valid, repeatable clear board positions with approximate margins', () => {
    const project = createProject('My board', 'blank');
    project.placementMode = 'board';
    const part = createInstance(getPart('tmp102')!, 'preview');
    const suggestions = suggestPlacements(project, part);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    expect(suggestions).toEqual(suggestPlacements(project, part));
    for (const suggestion of suggestions) {
      expect(assessPosition(project, part, suggestion.position)).toEqual({ valid: true, warnings: [] });
      expect(suggestion.clearanceMm).toBeGreaterThanOrEqual(2);
    }
    expect(suggestPlacements(project, project.components[0])).toEqual([]);
  });

  it('does not recommend footprints intersecting existing components or a board too small for the part', () => {
    const project: Project = createProject('My board', 'blank');
    const part = createInstance(getPart('tmp102')!, 'preview');
    project.components.push({ ...part, id: 'part-existing', position: [0, 0.28, 0], reference: 'U1' });
    const spots = suggestPlacements(project, part);
    expect(spots.length).toBeGreaterThan(0);
    for (const spot of spots) expect(spot.clearanceMm).toBeGreaterThanOrEqual(2);
    part.dimensions = [15, 0.3, 15];
    expect(suggestPlacements(project, part)).toEqual([]);
  });
});
