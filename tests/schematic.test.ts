import { migrateProject } from '../src/workspace/migrations';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoProject } from '../src/data/demoProject';
import { cloneProject, parseProject, serializeProject } from '../src/lib/project';
import { endpointKey, electricalNets, logicalPorts } from '../src/schematic/model';
import { useWorkspaceStore as workspace } from '../src/store/useWorkspaceStore';
import { previewAIChanges } from '../src/ai/actions';
import { createProject } from '../src/projects/templates';

const sensor = { componentId: 'sensor', portId: 'DATA' };
const mcu = { componentId: 'mcu', portId: 'IO-A' };
beforeEach(() => workspace.setState(workspace.getInitialState(), true));

describe('Phase 2 logical schematic foundation', () => {
  it('has stable symbolic logical interfaces rather than fabricated physical pin numbers', () => {
    expect(logicalPorts(demoProject.components[0])).toHaveLength(0);
    expect(logicalPorts(demoProject.components.find((c) => c.id === 'fan')!).map((p) => p.id))
      .toEqual(['+', '-']);
    expect(logicalPorts(demoProject.components.find((c) => c.id === 'mcu')!).map((p) => p.id))
      .toContain('IO-A');
  });
  it('connects, saves, undoes, redoes and removes wires as one project edit', () => {
    const s = workspace.getState();
    expect(s.connectPorts(sensor, mcu)).toBeNull();
    let project = workspace.getState().currentProject;
    expect(project.schemaVersion).toBe(3);
    expect(project.connections).toHaveLength(1);
    expect(parseProject(serializeProject(project))).toEqual(migrateProject(project));
    expect(electricalNets(project)).toHaveLength(1);
    expect(electricalNets(project)[0].terminals).toEqual(expect.arrayContaining([endpointKey(sensor), endpointKey(mcu)]));
    expect(workspace.getState().undoHistory).toHaveLength(1);
    workspace.getState().undo();
    expect(workspace.getState().currentProject.connections).toBeUndefined();
    workspace.getState().redo();
    project = workspace.getState().currentProject;
    expect(project.connections).toHaveLength(1);
    expect(workspace.getState().removeConnection(project.connections![0].id)).toBe(true);
    expect(workspace.getState().currentProject.connections).toEqual([]);
    workspace.getState().undo();
    expect(workspace.getState().currentProject.connections).toHaveLength(1);
  });
  it('rejects nonexistent pins, duplicate/reversed wires, self-links and invalid saves', () => {
    expect(workspace.getState().connectPorts(sensor, sensor)).toContain('different');
    expect(workspace.getState().connectPorts(sensor, { componentId: 'fan', portId: 'DATA' })).toContain('no longer exists');
    expect(workspace.getState().connectPorts(sensor, mcu)).toBeNull();
    expect(workspace.getState().connectPorts(mcu, sensor)).toContain('already connected');
    const valid = cloneProject(workspace.getState().currentProject);
    const invalid = cloneProject(valid);
    invalid.connections![0].to.portId = 'INVENTED';
    expect(() => parseProject(serializeProject(invalid))).toThrow(/schematic wires/);
    const duplicate = cloneProject(valid);
    duplicate.connections!.push({ ...duplicate.connections![0], id: 'wire-other' });
    expect(() => parseProject(serializeProject(duplicate))).toThrow(/schematic wires/);
    const badId = cloneProject(valid);
    badId.connections![0].id = '../bad';
    expect(() => parseProject(serializeProject(badId))).toThrow(/schematic wires/);
  });
  it('keeps wires separate per project and prunes affected wires on AI removal', () => {
    expect(workspace.getState().connectPorts(sensor, mcu)).toBeNull();
    const wired = cloneProject(workspace.getState().currentProject);
    const blank = createProject('Blank', 'blank');
    workspace.getState().activateProject(blank);
    expect(workspace.getState().currentProject.connections).toBeUndefined();
    workspace.getState().activateProject(wired);
    expect(workspace.getState().currentProject.connections).toHaveLength(1);
    const revision = previewAIChanges(wired, [{ type: 'remove_component', component_id: 'sensor' }]);
    expect(revision.project.connections).toEqual([]);
    expect(revision.project.components.some((c) => c.id === 'sensor')).toBe(false);
    expect(wired.connections).toHaveLength(1);
    expect(parseProject(serializeProject(revision.project))).toEqual(revision.project);
  });
  it('preserves logical connectivity when components move in 3D', () => {
    workspace.getState().connectPorts(sensor, mcu);
    const oldWire = cloneProject(workspace.getState().currentProject).connections![0];
    workspace.getState().moveComponent('sensor', [-2, 0.25, -1.9]);
    expect(workspace.getState().currentProject.connections![0]).toEqual(oldWire);
  });
});
