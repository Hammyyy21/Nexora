import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/app/App';
import { useDesignLayout as layout } from '../src/workspace/layout';
import { useWorkspaceStore as workspace } from '../src/store/useWorkspaceStore';
import { useLibraryStore as library } from '../src/catalog/store';
import { useFirmwareStore as firmware, draftFor } from '../src/firmware/store';
import { parseProject, serializeProject } from '../src/lib/project';
import { hardwareBuildState } from '../src/catalog/compatibility';
vi.mock('../src/three/HardwareScene', () => ({
  HardwareScene: () => (
    <div aria-label="Mock 3D viewport">
      <canvas aria-label="Orbit gesture surface" />
    </div>
  ),
}));
vi.mock('../src/firmware/CodeEditor', () => ({
  CodeEditor: () => <textarea aria-label="Mock C editor" />,
}));
beforeEach(() => {
  localStorage.clear();
  workspace.setState(workspace.getInitialState(), true);
  library.setState(library.getInitialState(), true);
  layout.setState(layout.getInitialState(), true);
  firmware.setState(firmware.getInitialState(), true);
  workspace.setState({ reducedMotion: true });
});

// First-time users start in the Projects dashboard. These tests exercise
// component/board editing, so enter the editor through the supported UI first.
// Existing sessions may already have dismissed the dashboard.
async function enterDesignWorkspace(user: ReturnType<typeof userEvent.setup>) {
  const projects = screen.queryByRole('dialog', { name: 'Nexora projects' });
  if (projects) {
    await user.click(within(projects).getByRole('button', { name: 'Open Smart Cooling Controller' }));
    expect(screen.queryByRole('dialog', { name: 'Nexora projects' })).not.toBeInTheDocument();
  }
}
it('exposes Add Component immediately and reuses searched catalog placement with cancel and confirm', async () => {
  const user = userEvent.setup();
  render(<App />);
  await enterDesignWorkspace(user);
  expect(screen.getByRole('button', { name: '+ Add Component' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: '+ Add Component' }));
  const drawer = screen.getByRole('dialog', { name: 'Add Component' });
  await user.selectOptions(
    within(drawer).getByRole('combobox', { name: 'Drawer component category' }),
    'sensors',
  );
  await user.type(
    within(drawer).getByRole('textbox', { name: 'Search drawer components' }),
    'TMP102',
  );
  expect(within(drawer).getAllByRole('article')).toHaveLength(1);
  expect(within(drawer).getByText('12 bits')).toBeVisible();
  await user.click(within(drawer).getByRole('button', { name: 'Add to Design' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(workspace.getState().placement?.catalogId).toBe('tmp102');
  expect(workspace.getState().currentProject.components).toHaveLength(14);
  await user.click(screen.getByRole('button', { name: 'Cancel placement' }));
  await user.click(within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name: 'Design' }));
  expect(workspace.getState().placement).toBeNull();
  await user.click(screen.getByRole('button', { name: '+ Add Component' }));
  expect(within(drawer).getByRole('textbox', { name: 'Search drawer components' })).toHaveValue(
    'TMP102',
  );
  await user.click(within(drawer).getByRole('button', { name: 'Add to Design' }));
  await user.click(screen.getByRole('button', { name: 'Confirm visual placement' }));
  expect(workspace.getState().currentProject.components).toHaveLength(15);
  await user.click(within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name: 'Design' }));
  expect(screen.getByRole('button', { name: /TMP102 temperature sensor LIB-/ })).toBeVisible();
  await user.click(within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name: 'Inspector' }));
  expect(await screen.findByRole('heading', { name: 'TMP102 temperature sensor' })).toBeVisible();
});
it('explains unsupported placement and closes one drawer before opening another', async () => {
  const user = userEvent.setup();
  render(<App />);
  await enterDesignWorkspace(user);
  await user.click(screen.getByRole('button', { name: '+ Add Component' }));
  const drawer = screen.getByRole('dialog', { name: 'Add Component' });
  await user.type(
    within(drawer).getByRole('textbox', { name: 'Search drawer components' }),
    'i5-12400',
  );
  expect(within(drawer).getByRole('button', { name: 'Add to Design' })).toBeDisabled();
  expect(within(drawer).getByText(/no supported integration path/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Close design drawer' }));
  await user.click(screen.getByRole('button', { name: 'Choose Board' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getByRole('dialog', { name: 'Choose Board' })).toBeVisible();
});
it('keeps scene identity, selection, camera request, transforms, placement and firmware through focus tabs', async () => {
  workspace.getState().selectComponent('mcu');
  workspace.getState().setViewMode('xray');
  firmware.getState().editSource('smart-cooling-01', 'int retained;');
  firmware.getState().setTab('machine');
  firmware.getState().setOpen(true);
  const user = userEvent.setup();
  render(<App />);
  const canvas = screen.getByLabelText('Orbit gesture surface');
  const before = workspace.getState().cameraRequest;
  const project = workspace.getState().currentProject;
  await user.click(screen.getByRole('button', { name: 'Focus Mode' }));
  for (const name of ['Design', 'Inspector', 'Workspace']) {
    const item = within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name });
    await user.click(item);
    expect(item).toHaveAttribute('aria-current', 'page');
  }
  expect(screen.getByLabelText('Orbit gesture surface')).toBe(canvas);
  expect(workspace.getState()).toMatchObject({
    selectedComponentId: 'mcu',
    cameraRequest: before,
    activeViewMode: 'xray',
  });
  expect(workspace.getState().currentProject).toBe(project);
  expect(draftFor(firmware.getState(), 'smart-cooling-01').source).toBe('int retained;');
  expect(firmware.getState()).toMatchObject({ tab: 'machine', open: true });
  act(() => workspace.getState().beginPlacement('rp2040'));
  const pending = workspace.getState().placement;
  await user.click(within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name: 'Design' }));
  await user.click(within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name: 'Workspace' }));
  expect(workspace.getState().placement).toBe(pending);
  await user.click(screen.getByRole('button', { name: 'Focus Mode' }));
  expect(screen.getByLabelText('Orbit gesture surface')).toBeVisible();
  expect(
    screen.queryByRole('complementary', { name: 'Component explorer' }),
  ).not.toBeInTheDocument();
});
it('supports one scrollable main navigation and keyboard section switching', () => {
  layout.setState({ panel: 'workspace' });
  render(<App />);
  const nav = screen.getByRole('navigation', { name: 'Main workspace navigation' });
  const canvas = screen.getByLabelText('Orbit gesture surface');
  expect(screen.queryByRole('tablist', { name: 'Design panels' })).not.toBeInTheDocument();
  fireEvent.wheel(canvas, { deltaX: 100, deltaY: 0 });
  fireEvent.wheel(nav, { deltaX: 100, deltaY: 0 });
  expect(layout.getState().panel).toBe('workspace');
  const workspaceButton = within(nav).getByRole('button', { name: 'Workspace' });
  fireEvent.keyDown(workspaceButton, { key: 'ArrowLeft' });
  expect(layout.getState().panel).toBe('inspector');
  expect(within(nav).getByRole('button', { name: 'Inspector' })).toHaveFocus();
  fireEvent.keyDown(within(nav).getByRole('button', { name: 'Inspector' }), { key: 'End' });
  expect(layout.getState().panel).toBe('ai');
  expect(within(nav).getByRole('button', { name: 'AI Guide' })).toHaveFocus();
  fireEvent.keyDown(within(nav).getByRole('button', { name: 'AI Guide' }), { key: 'Home' });
  expect(layout.getState().panel).toBe('explorer');
  expect(within(nav).getByRole('button', { name: 'Design' })).toHaveFocus();
});
it('uses a dismissible tools drawer on compact screens without hiding the canvas', () => {
  const original = window.matchMedia;
  window.matchMedia = (query) => ({ ...original(query), matches: query.includes('900') });
  render(<App />);
  expect(layout.getState().compact).toBe(true);
  expect(screen.getByRole('button', { name: '+ Add Component' })).toBeVisible();
  expect(screen.getByLabelText('Orbit gesture surface')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Close tools drawer' }));
  expect(layout.getState().collapsed).toBe(true);
  expect(screen.getByLabelText('Orbit gesture surface')).toBeVisible();
  window.matchMedia = original;
});
it('presents truthful inspector tabs with expandable advanced controls', async () => {
  layout.setState({ panel: 'inspector' });
  workspace.getState().selectComponent('mcu');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('tab', { name: 'Electrical' }));
  expect(
    screen.getByText('No verified electrical specifications are available for this component.'),
  ).toBeVisible();
  await user.click(screen.getByRole('tab', { name: 'Connections' }));
  expect(screen.getByText('ILLUSTRATIVE DEMO PATHS')).toBeVisible();
  expect(document.querySelector('.inspector-advanced')).not.toHaveAttribute('open');
  await user.click(screen.getByText('Advanced · Transform & appearance'));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'position X' }), {
    target: { value: '2' },
  });
  expect(
    workspace.getState().currentProject.components.find((c) => c.id === 'mcu')?.position[0],
  ).toBe(2);
  act(() => {
    workspace.getState().beginPlacement('tmp102');
    workspace.getState().confirmPlacement();
  });
  await user.click(within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name: 'Inspector' }));
  await screen.findByRole('heading', { name: 'TMP102 temperature sensor' });
  await user.click(screen.getByRole('tab', { name: 'Electrical' }));
  await waitFor(() => expect(screen.getByText('Operating supply: 1.4–3.6 V')).toBeVisible());
  expect(screen.getAllByRole('link', { name: 'Specification source ↗' }).length).toBeGreaterThan(0);
});
it('changes board templates with undo, persistence and honest firmware invalidation', async () => {
  firmware.getState().editSource('smart-cooling-01', 'int user_code;');
  const before = workspace.getState().currentProject.components;
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Choose Board' }));
  await user.click(screen.getByRole('button', { name: 'Use Blank 92 × 64 mm PCB' }));
  const changed = workspace.getState().currentProject;
  expect(changed.boardTemplateId).toBe('blank-92');
  expect(changed.components).toBe(before);
  expect(hardwareBuildState(changed).status).toBe('stale');
  expect(parseProject(serializeProject(changed)).boardTemplateId).toBe('blank-92');
  expect(() =>
    parseProject(serializeProject({ ...changed, boardTemplateId: 'invalid' } as never)),
  ).toThrow('Unsupported PCB template');
  act(() => workspace.getState().undo());
  expect(workspace.getState().currentProject.boardTemplateId).toBeUndefined();
  expect(draftFor(firmware.getState(), 'smart-cooling-01').source).toBe('int user_code;');
});
