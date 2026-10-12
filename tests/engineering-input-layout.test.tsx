import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { EngineeringInputs } from '../src/engineering/EngineeringInputs';
import { EngineeringInsights } from '../src/engineering/EngineeringInsights';
import { useWorkspaceStore } from '../src/store/useWorkspaceStore';

beforeEach(() => useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true));

describe('Engineering Workspace input layout', () => {
  it('groups six editable engineering values into labeled electrical and thermal cards', () => {
    render(<EngineeringInputs />);
    fireEvent.click(screen.getByText('Power & thermal calculation inputs'));
    const electrical = screen.getByRole('group', { name: 'Electrical load' });
    const thermal = screen.getByRole('group', { name: 'Thermal estimates' });
    expect(within(electrical).getByLabelText('Load voltage (V)')).toBeInTheDocument();
    expect(within(electrical).getByLabelText('Load current (mA)')).toBeInTheDocument();
    expect(within(electrical).getByLabelText('Heat dissipation (W)')).toBeInTheDocument();
    expect(within(thermal).getByLabelText('Thermal resistance (°C/W)')).toBeInTheDocument();
    expect(within(thermal).getByLabelText('Ambient temperature (°C)')).toBeInTheDocument();
    expect(within(thermal).getByLabelText('Temperature limit (°C)')).toBeInTheDocument();
    expect(screen.getAllByText('°C').length).toBe(2);
  });

  it('saves inputs without downgrading the active project schema', () => {
    act(() => useWorkspaceStore.setState((s) => ({
      currentProject: { ...s.currentProject, schemaVersion: 3 },
    })));
    render(<EngineeringInsights />);
    fireEvent.click(screen.getByText('Power & thermal calculation inputs'));
    const componentId = useWorkspaceStore.getState().currentProject.components.find((c) => c.id !== 'pcb')!.id;
    fireEvent.change(screen.getByLabelText('Load voltage (V)'), { target: { value: '3.3' } });
    fireEvent.change(screen.getByLabelText('Load current (mA)'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply calculation inputs' }));
    const project = useWorkspaceStore.getState().currentProject;
    expect(project.schemaVersion).toBe(3);
    expect(project.engineeringInputs?.[componentId]).toMatchObject({
      provenance: 'configured', voltage: 3.3, currentMa: 25,
    });
  });
});
