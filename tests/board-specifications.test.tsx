import { migrateProject } from '../src/workspace/migrations';
import { InspectorPanel } from '../src/components/layout/InspectorPanel';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import parts from '../src/catalog/parts';
import { getPart } from '../src/catalog/catalog';
import { createInstance } from '../src/catalog/instances';
import { boardTemplates } from '../src/workspace/boardTemplates';
import {
  boardSpecification,
  defaultBoardConfiguration,
  developmentBoardSpecifications,
  templateSpecification,
  validBoardConfiguration,
} from '../src/workspace/boardSpecifications';
import {
  BoardSpecifications,
  BoardConfigurationEditor,
} from '../src/workspace/BoardSpecificationsPanel';
import { DesignDrawer } from '../src/workspace/DesignDrawer';
import { useDesignLayout } from '../src/workspace/layout';
import { useWorkspaceStore as store } from '../src/store/useWorkspaceStore';
import { createProject, projectTemplates } from '../src/projects/templates';
import { cloneProject, parseProject, serializeProject } from '../src/lib/project';
import { demoProject } from '../src/data/demoProject';
import { assessPosition } from '../src/lib/transforms';
import { suggestPlacements } from '../src/engineering/placement';
import { reviewDesign } from '../src/engineering/insights';
import { reviewElectrical } from '../src/engineering/electrical';
import { validateConnection } from '../src/schematic/model';

beforeEach(() => {
  store.setState(store.getInitialState(), true);
  useDesignLayout.setState(useDesignLayout.getInitialState(), true);
});
describe('board specification coverage and provenance', () => {
  for (const template of boardTemplates)
    it(`renders ${template.id} as concept design values`, () => {
      const spec = templateSpecification(template.id);
      render(<BoardSpecifications spec={spec} />);
      expect(screen.getByText(`${spec.length.value} mm`)).toBeVisible();
      expect(screen.getByText(`${spec.width.value} mm`)).toBeVisible();
      expect(screen.getByText('1.6 mm')).toBeVisible();
      expect(spec.layers.status).toBe(
        ['blank-92', 'cooling-demo'].includes(template.id) ? 'unspecified' : 'concept',
      );
      expect(spec.mountingHoles.value).toHaveLength(4);
      expect(spec.length.status).toBe('concept');
    });
  for (const part of parts.filter((p) => p.category === 'boards'))
    it(`provides a sourced record for ${part.id}`, () => {
      const spec = developmentBoardSpecifications.find((s) => s.id === part.id)!;
      expect(spec.kind).toBe('development');
      expect(spec.documentation.length).toBeGreaterThan(0);
      for (const field of Object.values(spec)) {
        if (
          field &&
          typeof field === 'object' &&
          'status' in field &&
          field.status === 'verified'
        ) {
          expect(field).toHaveProperty('source', expect.stringMatching(/^https:\/\//));
        }
      }
      render(<BoardSpecifications spec={spec} />);
      expect(screen.getByRole('heading', { name: 'Board Specifications' })).toBeVisible();
      expect(screen.queryByText('PCB material')).not.toBeInTheDocument();
    });
  for (const template of projectTemplates)
    it(`loads specification defaults for project template ${template.id}`, () => {
      const p = parseProject(serializeProject(createProject(template.name, template.id)));
      expect(boardSpecification(p, p.components[0])?.length.value).toBe(
        p.components[0].dimensions[0] * 10,
      );
      for (const c of p.components.filter((c) => c.type === 'board'))
        expect(boardSpecification(p, c)).toBeDefined();
    });
  it('never reports model height as verified PCB thickness or fills missing fabrication data', () => {
    const spec = developmentBoardSpecifications.find((s) => s.id === 'uno-r3')!;
    expect(spec.thickness.value).toBeUndefined();
    expect(spec.layers.value).toBeUndefined();
    const instance = createInstance(getPart('uno-r3')!, 'part-uno');
    expect(instance.dimensions[0]).toBeCloseTo(6.86);
    expect(instance.dimensions[2]).toBeCloseTo(5.34);
    const pico = developmentBoardSpecifications.find((s) => s.id === 'pico')!;
    render(
      <BoardSpecifications
        spec={{ ...pico, material: { value: 'Legacy material claim', status: 'unverified' } }}
      />,
    );
    fireEvent.click(screen.getByText('Manufacturing / Documentation'));
    expect(screen.getByText('Unverified')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Length source' })).toHaveAttribute(
      'href',
      'https://datasheets.raspberrypi.com/pico/pico-datasheet.pdf',
    );
  });
  it('compares before selection and exposes development boards without replacing Components', () => {
    useDesignLayout.setState({ drawer: 'boards' });
    const initial = store.getState().currentProject;
    render(<DesignDrawer />);
    const comparison = screen.getByRole('region', { name: 'Compare board specifications' });
    fireEvent.change(within(comparison).getByLabelText('Board 2'), { target: { value: 'uno-r3' } });
    expect(within(comparison).getByText('68.6 mm')).toBeVisible();
    expect(store.getState().currentProject).toBe(initial);
    fireEvent.click(screen.getByRole('button', { name: 'Add Raspberry Pi Pico to Design' }));
    expect(store.getState().placement?.catalogId).toBe('pico');
    expect(store.getState().currentProject).toBe(initial);
  });
});
describe('configured board geometry and persistence', () => {
  it('applies dimensions through the editor with undo, redo, board switches and save/load', () => {
    store.getState().setBoardTemplate('blank-92');
    const originalParts = store.getState().currentProject.components.slice(1);
    render(<BoardConfigurationEditor />);
    fireEvent.click(screen.getByText('Configure blank PCB'));
    fireEvent.change(screen.getByLabelText('Length (mm)'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('PCB material'), { target: { value: 'FR-4' } });
    fireEvent.change(screen.getByLabelText('Layer count'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply board configuration' }));
    const p = store.getState().currentProject;
    expect(p.components[0].dimensions).toEqual([12, 0.16, 6.4]);
    expect(p.components.slice(1)).toEqual(migrateProject({ ...p, components: originalParts }).components);
    expect(boardSpecification(p, p.components[0])?.material).toMatchObject({
      value: 'FR-4',
      status: 'configured',
    });
    expect(parseProject(serializeProject(p))).toEqual(migrateProject(p));
    store.getState().undo();
    expect(store.getState().currentProject.components[0].dimensions[0]).toBe(9.2);
    store.getState().redo();
    expect(store.getState().currentProject.components[0].dimensions[0]).toBe(12);
    store.getState().setBoardTemplate('cooling-demo');
    expect(store.getState().currentProject.components[0].dimensions[0]).toBe(9.2);
    store.getState().setBoardTemplate('blank-92');
    expect(store.getState().currentProject.components[0].dimensions[0]).toBe(12);
  });
  it('uses safe defaults for legacy v1/v2 and rejects malformed configuration', () => {
    expect(parseProject(serializeProject(demoProject))).toEqual(migrateProject(demoProject));
    expect(
      parseProject(serializeProject(createProject('Legacy'))).boardConfiguration,
    ).toMatchObject({ outline: { kind: 'rounded-rectangle', radius: 1.8 } });
    for (const patch of [
      { length: NaN },
      { thickness: 0 },
      { layers: 2.5 },
      { material: {} },
      { edgeClearance: 500 },
      { mountingHoles: [{ x: 1000, z: 0, diameter: 3 }] },
      { restrictedRegions: null },
    ]) {
      const config = { ...defaultBoardConfiguration(), ...patch };
      expect(validBoardConfiguration(config)).toBe(false);
      expect(() =>
        parseProject(JSON.stringify({ ...createProject('Invalid'), boardConfiguration: config })),
      ).toThrow('Invalid board configuration');
    }
  });
  it('updates boundaries and suggestions after resizing, while leaving electrical review separate', () => {
    const project = createProject('Geometry');
    project.placementMode = 'board';
    const c = createInstance(getPart('tmp102')!, 'part-test');
    project.components.push(c);
    store.setState({ currentProject: project });
    const pos: [number, number, number] = [3.5, 1, 0];
    expect(assessPosition(project, c, pos).valid).toBe(true);
    store.getState().configureBoard({
      ...defaultBoardConfiguration(),
      length: 40,
      width: 30,
      mountingHoles: [],
      restrictedRegions: [{ name: 'Center keepout', x: 0, z: 0, length: 10, width: 10 }],
    });
    const changed = store.getState().currentProject;
    expect(assessPosition(changed, c, pos).valid).toBe(false);
    const suggestions = suggestPlacements(changed, c);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions)
      expect(assessPosition(changed, c, suggestion.position)).toEqual({
        valid: true,
        warnings: [],
      });
    expect(reviewElectrical(changed)).toEqual(reviewElectrical(project));
  });
  it('rejects footprints over holes and configured regions, including in a rotated board frame', () => {
    const p = createProject('Holes');
    p.placementMode = 'board';
    const c = {
      ...createInstance(getPart('tmp102')!, 'part-test'),
      dimensions: [0.1, 0.1, 0.1] as [number, number, number],
    };
    expect(assessPosition(p, c, [4.15, 1, 2.75]).error).toMatch(/mounting hole/);
    p.boardConfiguration = {
      ...defaultBoardConfiguration(),
      restrictedRegions: [{ name: 'Radio keepout', x: 10, z: 0, length: 10, width: 10 }],
    };
    expect(assessPosition(p, c, [1, 1, 0]).error).toMatch(/restricted region/);
    p.components[0].rotation = [0, 90, 0];
    expect(assessPosition(p, c, [0, 1, -1]).error).toMatch(/restricted region/);
    p.placementMode = 'free';
    expect(assessPosition(p, c, [0, 1, -1]).warnings).toContain(
      'Component footprint intersects a configured restricted region.',
    );
  });
  it('warns about missing data and linked board logic domains without interpreting proximity as communication', () => {
    const p = cloneProject(demoProject);
    p.schemaVersion = 2;
    const uno = createInstance(getPart('uno-r3')!, 'part-uno');
    const pico = createInstance(getPart('pico')!, 'part-pico');
    p.components = [p.components[0], uno, pico];
    const from = { componentId: uno.id, portId: 'IO-A' },
      to = { componentId: pico.id, portId: 'IO-A' };
    expect(validateConnection(p, from, to)).toBeNull();
    expect(reviewElectrical(p).some((f) => f.id.startsWith('board-logic:'))).toBe(false);
    p.connections = [{ id: 'wire-test', from, to }];
    expect(reviewElectrical(p).some((f) => f.id.startsWith('board-logic:'))).toBe(true);
    expect(reviewDesign(p).some((f) => f.id === 'board-specifications:part-uno')).toBe(true);
    expect(parseProject(serializeProject(p)).connections).toEqual(p.connections);
  });
});

it('loads the selected board record in Inspector without hiding the component catalog controls', async () => {
  const p = createProject('Inspect');
  const pico = createInstance(getPart('pico')!, 'part-inspect');
  p.components.push(pico);
  store.setState({ currentProject: p, selectedComponentId: pico.id, reducedMotion: true });
  render(<InspectorPanel />);
  await waitFor(() =>
    expect(
      screen.getByRole('region', { name: 'Board Specifications: Raspberry Pi Pico' }),
    ).toBeVisible(),
  );
  expect(screen.getByText('51 mm')).toBeVisible();
  expect(screen.getByRole('button', { name: 'View catalog details' })).toBeVisible();
});
