import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createProject } from '../src/projects/templates';
import { PlacementControls } from '../src/catalog/Placement';
import { useWorkspaceStore } from '../src/store/useWorkspaceStore';

beforeEach(() => {
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
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Placement position X' }), { target: { value: '1.5' } });
    expect(useWorkspaceStore.getState().placement!.position[0]).toBe(1.5);
    useWorkspaceStore.getState().cancelPlacement();
    expect(useWorkspaceStore.getState().currentProject.components).toHaveLength(1);
  });
});
