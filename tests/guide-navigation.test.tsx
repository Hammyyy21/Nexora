import { StrictMode, useEffect } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../src/app/App';
import { useWorkspaceStore as workspace } from '../src/store/useWorkspaceStore';
import { useLibraryStore as library } from '../src/catalog/store';
import { useGuideStore as guide } from '../src/ai/store';
import { useFirmwareStore as firmware, draftFor } from '../src/firmware/store';
import { useDesignLayout as layout } from '../src/workspace/layout';

const lifecycle = vi.hoisted(() => ({ mount: vi.fn(), unmount: vi.fn() }));
vi.mock('../src/three/HardwareScene', () => ({
  HardwareScene: () => {
    useEffect(() => {
      lifecycle.mount();
      return lifecycle.unmount;
    }, []);
    return <canvas aria-label="Persistent scene" />;
  },
}));
vi.mock('../src/firmware/CodeEditor', () => ({
  CodeEditor: ({ value }: { value: string }) => (
    <textarea aria-label="Retained editor" value={value} readOnly />
  ),
}));
beforeEach(() => {
  localStorage.clear();
  workspace.setState(workspace.getInitialState(), true);
  library.setState(library.getInitialState(), true);
  firmware.setState(firmware.getInitialState(), true);
  layout.setState(layout.getInitialState(), true);
  guide.setState({ ...guide.getInitialState(), availability: 'ready', mode: 'ai' }, true);
  workspace.setState({ reducedMotion: true });
  lifecycle.mount.mockClear();
  lifecycle.unmount.mockClear();
});
it('opens the existing guide from navigation and retains a single chat through workspace changes', async () => {
  workspace.getState().selectComponent('pcb');
  const project = workspace.getState().currentProject;
  const request = workspace.getState().cameraRequest;
  firmware.getState().editSource(project.id, 'int unsaved_draft;');
  firmware.getState().setOpen(true);
  const view = render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  const nav = screen.getByRole('navigation', { name: 'Main workspace navigation' });
  const canvas = screen.getByLabelText('Persistent scene');
  const editors = screen.getAllByLabelText('Retained editor');
  const mounts = lifecycle.mount.mock.calls.length;
  const unmounts = lifecycle.unmount.mock.calls.length;
  fireEvent.click(within(nav).getByRole('button', { name: 'AI Guide' }));
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Assistant conversation' })).toBeVisible(),
  );
  const input = screen.getByLabelText('Ask AI Guide');
  fireEvent.change(input, { target: { value: 'My unfinished question' } });
  for (const name of ['Components', 'Code', 'Design', 'Components', 'Design']) {
    fireEvent.click(within(nav).getByRole('button', { name }));
    expect(screen.getAllByLabelText('Ask AI Guide')).toHaveLength(1);
    expect(screen.getByLabelText('Ask AI Guide')).toBe(input);
    expect(input).toHaveValue('My unfinished question');
    expect(
      screen.getByRole('region', { name: 'Assistant conversation', hidden: true }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Persistent scene')).toBe(canvas);
    screen.getAllByLabelText('Retained editor').forEach((editor, index) => {
      expect(editor).toBe(editors[index]);
    });
    expect(workspace.getState().currentProject.components).toBe(project.components);
    expect(workspace.getState().currentProject.firmwareSource).toBe('int unsaved_draft;');
    expect(workspace.getState().selectedComponentId).toBe('pcb');
    expect(workspace.getState().cameraRequest).toBe(request);
    expect(draftFor(firmware.getState(), project.id).source).toBe('int unsaved_draft;');
  }
  fireEvent.click(within(nav).getByRole('button', { name: 'AI Guide' }));
  expect(screen.getByRole('region', { name: 'Assistant conversation' })).toBeVisible();
  expect(input).toHaveValue('My unfinished question');
  expect(lifecycle.mount).toHaveBeenCalledTimes(mounts);
  expect(lifecycle.unmount).toHaveBeenCalledTimes(unmounts);
  view.unmount();
  expect(lifecycle.unmount).toHaveBeenCalledTimes(unmounts + 1);
});
it('keeps the guide draft when moving from design to the library', () => {
  render(<App />);
  const input = screen.getByLabelText('Ask AI Guide');
  fireEvent.change(input, { target: { value: 'Unsent question' } });
  fireEvent.click(screen.getByRole('button', { name: 'Components' }));
  expect(screen.getAllByLabelText('Ask AI Guide')).toHaveLength(1);
  expect(screen.getByLabelText('Ask AI Guide')).toBe(input);
});
