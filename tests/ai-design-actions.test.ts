import { describe, expect, it } from 'vitest';
import { createProject, projectTemplates } from '../src/projects/templates';
import { parseProject, serializeProject } from '../src/lib/project';
import { parseAIAction, previewAIChanges } from '../src/ai/actions';

describe('independent hardware projects', () => {
  it('builds valid catalog-backed templates with unique ids', () => {
    const ids = new Set<string>();
    for (const template of projectTemplates) {
      const project = createProject(template.name, template.id);
      expect(parseProject(serializeProject(project))).toEqual(project);
      expect(project.components[0].id).toBe('pcb');
      ids.add(project.id);
    }
    expect(ids.size).toBe(projectTemplates.length);
  });
  it('does not mutate project during AI preview, validates and applies removals', () => {
    const base = createProject('Test', 'blank');
    const added = previewAIChanges(base, [
      { type: 'add_component', catalog_id: 'rp2040', position: [0, 1, 0] },
    ]);
    expect(base.components).toHaveLength(1);
    expect(added.project.components).toHaveLength(2);
    const part = added.project.components[1];
    const moved = previewAIChanges(added.project, [
      { type: 'move_component', component_id: part.id, position: [2, 1, 0] },
    ]);
    expect(moved.project.components[1].position).toEqual([2, 1, 0]);
    expect(added.project.components[1].position).toEqual([0, 1, 0]);
    const removed = previewAIChanges(moved.project, [
      { type: 'remove_component', component_id: part.id },
    ]);
    expect(removed.project.components).toHaveLength(1);
    expect(parseProject(serializeProject(removed.project))).toEqual(removed.project);
  });
  it('rejects unknown parts, fixed objects, arbitrary actions and invalid positions', () => {
    const p = createProject('Test', 'blank');
    expect(() =>
      previewAIChanges(p, [{ type: 'add_component', catalog_id: 'invented' }]),
    ).toThrow();
    expect(() =>
      previewAIChanges(p, [{ type: 'remove_component', component_id: 'pcb' }]),
    ).toThrow();
    expect(() => parseAIAction({ type: 'execute_shell', command: 'anything' })).toThrow();
    expect(() =>
      parseAIAction({ type: 'move_component', component_id: 'pcb', position: [Infinity, 0, 0] }),
    ).toThrow();
    expect(() =>
      previewAIChanges(p, [
        { type: 'create_project', template_id: 'blank', project_name: 'New' },
        { type: 'select_component', component_id: 'pcb' },
      ]),
    ).toThrow();
  });
});
