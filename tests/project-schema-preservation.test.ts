import { beforeEach, describe, expect, it } from 'vitest';
import { demoProject } from '../src/data/demoProject';
import { parseProject, serializeProject } from '../src/lib/project';
import { useProjectsStore } from '../src/projects/store';
import { useWorkspaceStore } from '../src/store/useWorkspaceStore';
import { applyPCBOperation } from '../src/workspace/pcbOperations';

function pcbV3WithConceptCopy() {
  const project = parseProject(serializeProject(demoProject));
  const updated = applyPCBOperation(project, {
    type: 'duplicate_component',
    component_id: 'sensor',
  });
  expect(updated.schemaVersion).toBe(3);
  expect(updated.components.some((c) => c.conceptSourceId === 'sensor')).toBe(true);
  return updated;
}

beforeEach(() => {
  localStorage.clear();
  const original = pcbV3WithConceptCopy();
  useProjectsStore.setState({
    projects: [original],
    activeId: original.id,
    chats: {},
    mentors: {},
    error: null,
  });
  useWorkspaceStore.getState().activateProject(original);
});

describe('PCB schema preservation in the project dashboard', () => {
  it('duplicates v3 projects with concept copies without downgrading them', () => {
    const sourceId = useProjectsStore.getState().activeId;
    useProjectsStore.getState().duplicate(sourceId);
    const copy = useProjectsStore.getState().projects.find((p) => p.id !== sourceId);
    expect(copy).toBeDefined();
    expect(copy!.schemaVersion).toBe(3);
    expect(copy!.components.some((c) => c.conceptSourceId === 'sensor')).toBe(true);
    expect(parseProject(serializeProject(copy!)).schemaVersion).toBe(3);
  });

  it('imports v3 projects and reloads them with their concept copies intact', () => {
    const original = pcbV3WithConceptCopy();
    const sourceId = useProjectsStore.getState().activeId;
    useProjectsStore.getState().importNew(original);
    const imported = useWorkspaceStore.getState().currentProject;
    expect(imported.id).not.toBe(sourceId);
    expect(imported.schemaVersion).toBe(3);
    expect(imported.components.some((c) => c.conceptSourceId === 'sensor')).toBe(true);
    expect(parseProject(serializeProject(imported)).schemaVersion).toBe(3);
  });
});
