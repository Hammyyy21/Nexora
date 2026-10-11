import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  // Re-import the stores with the same storage state a fresh browser load sees.
  vi.resetModules();
});

describe('startup project hydration', () => {
  it('does not reactivate an unsaved first-run workspace or reset navigation state', async () => {
    const { useWorkspaceStore } = await import('../src/store/useWorkspaceStore');
    const { hydrateActiveProject, useProjectsStore } = await import('../src/projects/store');
    useWorkspaceStore.getState().selectComponent('sensor');
    const project = useWorkspaceStore.getState().currentProject;
    const cameraRequest = useWorkspaceStore.getState().cameraRequest;

    hydrateActiveProject();
    hydrateActiveProject(); // StrictMode may mount effects twice.

    expect(useWorkspaceStore.getState().currentProject).toBe(project);
    expect(useWorkspaceStore.getState().selectedComponentId).toBe('sensor');
    expect(useWorkspaceStore.getState().cameraRequest).toBe(cameraRequest);
    expect(useProjectsStore.getState().dashboardOpen).toBe(true);
  });

  it('restores saved projects once, including selection, without repeated camera resets', async () => {
    const { demoProject } = await import('../src/data/demoProject');
    const saved = {
      ...structuredClone(demoProject),
      schemaVersion: 2 as const,
      name: 'Restored test project',
      selectedComponentId: 'sensor',
    };
    localStorage.setItem(
      'nexora.projects.v2',
      JSON.stringify({ version: 2, activeId: saved.id, projects: [saved], chats: {} }),
    );
    const { hydrateActiveProject, useProjectsStore } = await import('../src/projects/store');
    const { useWorkspaceStore } = await import('../src/store/useWorkspaceStore');

    hydrateActiveProject();
    const currentProject = useWorkspaceStore.getState().currentProject;
    const cameraRequest = useWorkspaceStore.getState().cameraRequest;
    hydrateActiveProject();

    expect(currentProject.name).toBe('Restored test project');
    expect(useWorkspaceStore.getState().selectedComponentId).toBe('sensor');
    expect(useWorkspaceStore.getState().currentProject).toBe(currentProject);
    expect(useWorkspaceStore.getState().cameraRequest).toBe(cameraRequest);
    expect(useProjectsStore.getState().dashboardOpen).toBe(false);
  });
});
