import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import App from '../src/app/App';
import { useWorkspaceStore as workspace } from '../src/store/useWorkspaceStore';
import { useLibraryStore as library } from '../src/catalog/store';
import { useDesignLayout as layout } from '../src/workspace/layout';
import { useFirmwareStore as firmware } from '../src/firmware/store';
import { useGuideStore as guide } from '../src/ai/store';
import { useProjectsStore as projects } from '../src/projects/store';
import { createProject } from '../src/projects/templates';
import { createInstance } from '../src/catalog/instances';
import { getPart } from '../src/catalog/catalog';

vi.mock('../src/three/HardwareScene', () => ({ HardwareScene: () => <canvas aria-label="Preserved 3D canvas" /> }));
vi.mock('../src/firmware/CodeEditor', () => ({ CodeEditor: () => <textarea aria-label="Firmware editor" /> }));

beforeEach(() => {
  localStorage.clear();
  const project = createProject('PCB Shortcut Test');
  project.components.push({ ...createInstance(getPart('rp2040')!, 'rp'), position: [0, 1, 0] });
  workspace.setState({ ...workspace.getInitialState(), currentProject: project, reducedMotion: true }, true);
  library.setState(library.getInitialState(), true);
  layout.setState(layout.getInitialState(), true);
  firmware.setState(firmware.getInitialState(), true);
  guide.setState(guide.getInitialState(), true);
  projects.setState({ ...projects.getInitialState(), dashboardOpen: false, error: null }, true);
});

it('opens PCB Layout directly, selects a footprint for Inspector editing, and preserves the 3D scene', () => {
  render(<App />);
  const scene = screen.getByLabelText('Preserved 3D canvas');
  const nav = screen.getByRole('navigation', { name: 'Main workspace navigation' });
  fireEvent.click(within(nav).getByRole('button', { name: 'PCB Layout' }));
  expect(library.getState().workspace).toBe('pcb');
  expect(screen.getByRole('main', { name: 'PCB layout workspace' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'PCB layout preview' })).toBeVisible();
  expect(within(nav).getByRole('button', { name: 'PCB Layout' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByLabelText('Preserved 3D canvas')).toBe(scene);
  fireEvent.click(within(screen.getByRole('group', { name: 'PCB component shortcuts' })).getByRole('button'));
  expect(workspace.getState().selectedComponentId).toBe('rp');
  expect(layout.getState().panel).toBe('inspector');
  expect(screen.getByRole('complementary', { name: 'Workspace tools panel' })).toBeVisible();
  fireEvent.click(within(nav).getByRole('button', { name: 'Schematic' }));
  expect(screen.getByRole('region', { name: '2D schematic workspace' })).toBeVisible();
  fireEvent.click(within(nav).getByRole('button', { name: 'PCB Layout' }));
  expect(workspace.getState().selectedComponentId).toBe('rp');
  fireEvent.click(screen.getByRole('button', { name: '3D Design' }));
  expect(screen.getByLabelText('Preserved 3D canvas')).toBe(scene);
  expect(scene).toBeVisible();
});

it('keeps PCB Layout accessible when project has no board configuration', () => {
  workspace.setState((state) => ({ currentProject: { ...state.currentProject, boardConfiguration: undefined } }));
  render(<App />);
  const nav = screen.getByRole('navigation', { name: 'Main workspace navigation' });
  fireEvent.click(within(nav).getByRole('button', { name: 'PCB Layout' }));
  expect(screen.getByRole('heading', { name: 'No editable PCB configured' })).toBeVisible();
  fireEvent.click(within(screen.getByRole('main', { name: 'PCB layout workspace' })).getByRole('button', { name: 'Choose Board' }));
  expect(layout.getState().drawer).toBe('boards');
});
