import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createProject } from '../src/projects/templates';
import { PlacementControls } from '../src/catalog/Placement';
import { useLibraryStore } from '../src/catalog/store';
import { useDesignLayout } from '../src/workspace/layout';
import { usePlacementLayout, PLACEMENT_LAYOUT_KEY } from '../src/catalog/placementLayout';
import { useWorkspaceStore } from '../src/store/useWorkspaceStore';

beforeEach(() => {
  usePlacementLayout.setState({ width: 300, collapsed: false });
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  useWorkspaceStore.getState().activateProject(createProject('Board', 'blank'));
});

describe('recommended component positions', () => {
  it('shows optional recommendations and allows manual placement overrides', () => {
    useWorkspaceStore.getState().beginPlacement('tmp102');
    render(<PlacementControls />);
    expect(screen.getByLabelText('Recommended placement areas')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Use suggested placement 1' }));
    const suggested = useWorkspaceStore.getState().placement!.position;
    expect(suggested).not.toEqual([6, 1, 0]);
    expect(screen.getByRole('status')).toHaveTextContent('passes approximate');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Placement position X' }), {
      target: { value: '1.5' },
    });
    expect(useWorkspaceStore.getState().placement!.position[0]).toBe(1.5);
    useWorkspaceStore.getState().cancelPlacement();
    expect(useWorkspaceStore.getState().currentProject.components).toHaveLength(1);
  });
});

it('reveals Design from every workspace, preserves project data and fits without changing the camera on confirmation', () => {
  const original = useWorkspaceStore.getState().currentProject;
  for (const workspace of ['pcb', 'schematic', 'components', 'code'] as const) {
    useLibraryStore.getState().navigate(workspace);
    useDesignLayout.getState().openDrawer('components');
    useWorkspaceStore.getState().beginPlacement('tmp102');
    expect(useLibraryStore.getState().workspace).toBe('design');
    expect(useDesignLayout.getState().drawer).toBeNull();
    expect(useWorkspaceStore.getState().activeViewMode).toBe('assembly');
    expect(useWorkspaceStore.getState().currentProject).toBe(original);
    useWorkspaceStore.getState().cancelPlacement();
    expect(useWorkspaceStore.getState().currentProject).toBe(original);
  }
  useWorkspaceStore.getState().beginPlacement('tmp102');
  const request = useWorkspaceStore.getState().cameraRequest;
  useWorkspaceStore.getState().confirmPlacement();
  useWorkspaceStore.getState().confirmPlacement();
  expect(useWorkspaceStore.getState().currentProject.components).toHaveLength(
    original.components.length + 1,
  );
  expect(useWorkspaceStore.getState().cameraRequest).toBe(request);
  useWorkspaceStore.getState().undo();
  expect(useWorkspaceStore.getState().currentProject.components).toEqual(original.components);
  useWorkspaceStore.getState().redo();
  expect(useWorkspaceStore.getState().currentProject.components).toHaveLength(
    original.components.length + 1,
  );
});
it('resizes accessibly, persists width, collapses without losing preview and keeps target edits separate', () => {
  useWorkspaceStore.getState().beginPlacement('tmp102');
  render(<PlacementControls />);
  const original = useWorkspaceStore.getState().currentProject;
  const separator = screen.getByRole('separator', { name: 'Resize placement panel' });
  fireEvent.keyDown(separator, { key: 'ArrowLeft' });
  expect(separator).toHaveAttribute('aria-valuenow', '320');
  expect(localStorage.getItem(PLACEMENT_LAYOUT_KEY)).toBe('320');
  fireEvent.keyDown(separator, { key: 'End' });
  expect(Number(separator.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(
    window.innerWidth * 0.45 + 1,
  );
  const preview = useWorkspaceStore.getState().placement;
  fireEvent.click(screen.getByRole('button', { name: 'Collapse placement panel' }));
  expect(useWorkspaceStore.getState().placement).toBe(preview);
  expect(screen.queryByRole('spinbutton', { name: 'Placement position X' })).toBeNull();
  const request = useWorkspaceStore.getState().cameraRequest;
  fireEvent.click(screen.getByRole('button', { name: 'Fit PCB to View' }));
  expect(useWorkspaceStore.getState().cameraRequest).toBe(request + 1);
  fireEvent.click(screen.getByRole('button', { name: 'Expand placement panel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use suggested placement 2' }));
  expect(useWorkspaceStore.getState().placement?.position).not.toEqual(preview?.position);
  expect(useWorkspaceStore.getState().currentProject).toBe(original);
  act(() => useWorkspaceStore.getState().cancelPlacement());
});
