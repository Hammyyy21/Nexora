import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../src/app/App';
import { useWorkspaceStore as workspace } from '../src/store/useWorkspaceStore';
import { useLibraryStore as library } from '../src/catalog/store';
import { useDesignLayout as layout } from '../src/workspace/layout';
import { useProjectsStore as projects } from '../src/projects/store';
import { useGuideStore as guide } from '../src/ai/store';
import { useFirmwareStore as firmware } from '../src/firmware/store';

vi.mock('../src/three/HardwareScene', () => ({
  HardwareScene: () => <canvas aria-label="Persistent 3D scene" />,
}));
vi.mock('../src/firmware/CodeEditor', () => ({
  CodeEditor: () => <textarea aria-label="Firmware editor" />,
}));
beforeEach(() => {
  localStorage.clear();
  workspace.setState({ ...workspace.getInitialState(), reducedMotion: true }, true);
  library.setState(library.getInitialState(), true);
  layout.setState(layout.getInitialState(), true);
  firmware.setState(firmware.getInitialState(), true);
  guide.setState(guide.getInitialState(), true);
  projects.setState({ ...projects.getInitialState(), dashboardOpen: false, error: null }, true);
});
it('switches 3D to schematic, wires terminals, synchronizes selection and returns to the same scene', () => {
  render(<App />);
  const scene = screen.getByLabelText('Persistent 3D scene');
  const nav = screen.getByRole('navigation', { name: 'Main workspace navigation' });
  fireEvent.click(within(nav).getByRole('button', { name: 'Schematic' }));
  expect(screen.getByRole('region', { name: '2D schematic workspace' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Connections' })).toBeVisible();
  expect(screen.getByLabelText('Persistent 3D scene')).toBe(scene);
  fireEvent.click(screen.getByRole('button', { name: 'Select U1 in schematic' }));
  expect(workspace.getState().selectedComponentId).toBe('mcu');
  fireEvent.click(screen.getByRole('button', { name: 'Terminal U3 DATA' }));
  fireEvent.click(screen.getByRole('button', { name: 'Terminal U1 IO-A' }));
  expect(workspace.getState().currentProject.connections).toHaveLength(1);
  expect(screen.getByText(/U3 · DATA → U1 · IO-A/)).toBeVisible();
  fireEvent.click(within(nav).getByRole('button', { name: 'Design' }));
  expect(screen.getByLabelText('Persistent 3D scene')).toBe(scene);
  expect(workspace.getState().selectedComponentId).toBe('mcu');
  fireEvent.click(within(nav).getByRole('button', { name: 'Schematic' }));
  expect(screen.getByText(/U3 · DATA → U1 · IO-A/)).toBeVisible();
});
