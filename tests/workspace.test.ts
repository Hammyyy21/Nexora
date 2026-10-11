import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore as store } from '../src/store/useWorkspaceStore';
import {
  cloneProject,
  displayedPosition,
  loadProject,
  parseProject,
  saveProject,
  serializeProject,
  STORAGE_KEY,
} from '../src/lib/project';
import { demoProject } from '../src/data/demoProject';
import { runDemoCommand } from '../src/lib/assistant';
beforeEach(() => {
  store.setState(store.getInitialState(), true);
  localStorage.clear();
});
describe('workspace editing', () => {
  it('initializes a complete demo with unique stable IDs', () => {
    expect(store.getState().currentProject.components).toHaveLength(14);
    expect(new Set(demoProject.components.map((c) => c.id)).size).toBe(14);
    expect(store.getState().activeViewMode).toBe('assembly');
  });
  it('synchronizes selection and requests focus without adding undo entries', () => {
    store.getState().selectComponent('mcu');
    expect(store.getState().selectedComponentId).toBe('mcu');
    expect(store.getState().cameraView).toBe('focus');
    expect(store.getState().inspectorOpen).toBe(true);
    expect(store.getState().undoHistory).toHaveLength(0);
  });
  it('toggles visibility, undoes and redoes design changes', () => {
    store.getState().editComponent('sensor', { visible: false });
    expect(store.getState().currentProject.components.find((c) => c.id === 'sensor')?.visible).toBe(
      false,
    );
    store.getState().undo();
    expect(store.getState().currentProject.components.find((c) => c.id === 'sensor')?.visible).toBe(
      true,
    );
    store.getState().redo();
    expect(store.getState().currentProject.components.find((c) => c.id === 'sensor')?.visible).toBe(
      false,
    );
  });
  it('clears redo after a new edit and supports resetting with undo', () => {
    store.getState().editComponent('mcu', { color: '#ff0000' });
    store.getState().undo();
    store.getState().editComponent('mcu', { color: '#00ff00' });
    expect(store.getState().redoHistory).toHaveLength(0);
    store.getState().reset();
    expect(store.getState().currentProject).toEqual(demoProject);
    store.getState().undo();
    expect(store.getState().currentProject.components.find((c) => c.id === 'mcu')?.color).toBe(
      '#00ff00',
    );
  });
  it('never mutates canonical transforms when modes are rapidly switched', () => {
    store.getState().editComponent('mcu', { position: [1, 2, 3] });
    const original = cloneProject(store.getState().currentProject);
    for (const mode of [
      'exploded',
      'assembly',
      'xray',
      'exploded',
      'connections',
      'assembly',
    ] as const) {
      store.getState().setViewMode(mode);
      for (const c of store.getState().currentProject.components) {
        const p = displayedPosition(c, mode);
        expect(p).toEqual(
          mode === 'exploded' ? c.position.map((n, i) => n + c.explodedOffset[i]) : c.position,
        );
      }
    }
    expect(store.getState().currentProject).toEqual(original);
    expect(store.getState().undoHistory).toHaveLength(1);
  });
  it('caps edit history at fifty states', () => {
    for (let i = 0; i < 80; i++) store.getState().editComponent('mcu', { opacity: 0.5 });
    expect(store.getState().undoHistory).toHaveLength(50);
  });
});
describe('project files and local persistence', () => {
  it('round-trips supported editable fields', () => {
    const p = cloneProject(demoProject);
    p.components[1].position = [2, 3, 4];
    p.components[1].visible = false;
    p.components[1].opacity = 0.4;
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
  it('saves and explicitly loads locally with undo', () => {
    store.getState().editComponent('sensor', { color: '#aabbcc' });
    store.getState().save();
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    store.getState().reset();
    store.getState().load();
    expect(store.getState().currentProject.components.find((c) => c.id === 'sensor')?.color).toBe(
      '#aabbcc',
    );
    expect(store.getState().savedSnapshot).toBe(JSON.stringify(store.getState().currentProject));
  });
  it('reports unavailable storage without throwing', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    store.getState().save();
    expect(store.getState().notice).toContain('Could not save');
    spy.mockRestore();
  });
  it('rejects missing saves and corrupted local data', () => {
    expect(() => loadProject()).toThrow('No local save');
    localStorage.setItem(STORAGE_KEY, 'broken');
    store.getState().load();
    expect(store.getState().notice).toContain('not valid JSON');
  });
  it.each(['{}', 'null', '[]', 'not json', JSON.stringify({ ...demoProject, schemaVersion: 99 })])(
    'rejects invalid project data: %s',
    (raw) => {
      expect(() => parseProject(raw)).toThrow();
    },
  );
  it('rejects duplicate components and nonfinite or out-of-range transforms', () => {
    const p = cloneProject(demoProject);
    p.components[1] = p.components[0];
    expect(() => parseProject(serializeProject(p))).toThrow();
    const q = cloneProject(demoProject);
    q.components[0].position = [Infinity, 0, 0];
    expect(() => parseProject(serializeProject(q))).toThrow();
    q.components[0].position = [999, 0, 0];
    expect(() => parseProject(serializeProject(q))).toThrow();
  });
  it('rejects oversized files and unsafe colors', () => {
    expect(() => parseProject(' '.repeat(250001))).toThrow('too large');
    const p = cloneProject(demoProject);
    p.components[0].color = 'url(https://example.com)';
    expect(() => parseProject(serializeProject(p))).toThrow();
  });
  it('keeps bundled geometry authoritative when importing', () => {
    const p = cloneProject(demoProject);
    p.components[0].dimensions = [1, 1, 1];
    expect(parseProject(serializeProject(p)).components[0].dimensions).toEqual(
      demoProject.components[0].dimensions,
    );
    saveProject(demoProject);
    expect(loadProject()).toEqual(demoProject);
  });
});
describe('local demo commands', () => {
  it.each([
    ['Show exploded view.', 'exploded'],
    ['Switch to X-ray mode', 'xray'],
    ['Show connections', 'connections'],
    ['Switch to assembly', 'assembly'],
  ])('applies %s', (command, mode) => {
    expect(runDemoCommand(command)).not.toContain('future AI');
    expect(store.getState().activeViewMode).toBe(mode);
  });
  it('focuses and unhides a named component', () => {
    store.getState().editComponent('sensor', { visible: false });
    runDemoCommand('Highlight the temperature sensor.');
    expect(store.getState().selectedComponentId).toBe('sensor');
    expect(store.getState().currentProject.components.find((c) => c.id === 'sensor')?.visible).toBe(
      true,
    );
    runDemoCommand('Focus on the microcontroller');
    expect(store.getState().selectedComponentId).toBe('mcu');
  });
  it('shows all components and resets the camera', () => {
    store.getState().editComponent('fan', { visible: false });
    runDemoCommand('Show all components');
    expect(store.getState().currentProject.components.every((c) => c.visible)).toBe(true);
    runDemoCommand('Reset camera');
    expect(store.getState().cameraView).toBe('fit');
  });
  it('does not pretend to generate designs or calculate electrical values', () => {
    const before = cloneProject(store.getState().currentProject);
    expect(runDemoCommand('Calculate the current draw')).toContain('future AI integration');
    expect(runDemoCommand('Focus on the quantum chip')).toContain('supports viewing');
    expect(store.getState().currentProject).toEqual(before);
  });
});
