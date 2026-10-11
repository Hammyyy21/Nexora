import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useWorkspaceStore as workspace } from '../src/store/useWorkspaceStore';
import { loadLibraryFilters, useLibraryStore as library } from '../src/catalog/store';
import { draftFor, useFirmwareStore as firmware } from '../src/firmware/store';
import { getPart } from '../src/catalog/catalog';
import { canReplace, hardwareBuildState } from '../src/catalog/compatibility';
import { cloneProject, parseProject, serializeProject } from '../src/lib/project';
import { demoProject } from '../src/data/demoProject';
import { runDemoCommand } from '../src/lib/assistant';
import { ComponentsWorkspace } from '../src/catalog/ComponentsWorkspace';
import { PlacementControls } from '../src/catalog/Placement';
import { InspectorPanel } from '../src/components/layout/InspectorPanel';
import { navigateWorkspace } from '../src/catalog/navigation';
vi.mock('../src/catalog/ComponentPreview', () => ({
  ComponentPreview: ({ part }: { part: { name: string } }) => (
    <div role="img" aria-label={`3D preview of ${part.name}`} />
  ),
}));
beforeEach(() => {
  localStorage.clear();
  workspace.setState(workspace.getInitialState(), true);
  library.setState(library.getInitialState(), true);
  firmware.setState(firmware.getInitialState(), true);
});
describe('visual placement and replacement', () => {
  it('keeps pending placement out of project, persistence and history until confirmation', () => {
    expect(workspace.getState().beginPlacement('tmp102')).toBe(true);
    workspace.getState().movePlacement([7, 2, 1], [0, 45, 0]);
    expect(workspace.getState().currentProject.components).toHaveLength(14);
    workspace.getState().save();
    expect(localStorage.getItem('nexora.project.v1')).not.toContain('tmp102');
    expect(workspace.getState().undoHistory).toHaveLength(0);
    workspace.getState().confirmPlacement();
    const s = workspace.getState(),
      part = s.currentProject.components.at(-1)!;
    expect(s.currentProject.schemaVersion).toBe(2);
    expect(part.position).toEqual([7, 2, 1]);
    expect(part.integration).toBe('visual-only');
    expect(part.catalogId).toBe('tmp102');
    expect(s.selectedComponentId).toBe(part.id);
    expect(s.placement).toBeNull();
    s.undo();
    expect(workspace.getState().currentProject.components).toHaveLength(14);
    workspace.getState().redo();
    expect(workspace.getState().currentProject.components).toHaveLength(15);
  });
  it('resets and cancels previews without editing catalog definitions', () => {
    const part = structuredClone(getPart('rp2040'));
    workspace.getState().beginPlacement('rp2040');
    workspace.getState().movePlacement([9, 3, 0]);
    workspace.getState().resetPlacement();
    expect(workspace.getState().placement?.position).toEqual([6, 1, 0]);
    workspace.getState().cancelPlacement();
    expect(workspace.getState().placement).toBeNull();
    expect(workspace.getState().currentProject).toEqual(demoProject);
    expect(getPart('rp2040')).toEqual(part);
  });
  it('rejects unsupported insertions, invalid transforms and type-mismatched replacements', () => {
    expect(workspace.getState().beginPlacement('i5-12400')).toBe(false);
    expect(workspace.getState().beginPlacement('unknown')).toBe(false);
    expect(workspace.getState().replaceComponent('mcu', 'tmp102')).toBe(false);
    expect(workspace.getState().replaceComponent('pcb', 'pico')).toBe(false);
    workspace.getState().beginPlacement('rp2040');
    workspace.getState().movePlacement([Infinity, 0, 0]);
    expect(workspace.getState().placement?.position).toEqual([6, 1, 0]);
    workspace.getState().beginPlacement('ddr4-8');
    workspace.getState().confirmPlacement();
    const id = workspace.getState().selectedComponentId!;
    expect(workspace.getState().replaceComponent(id, 'tmp102')).toBe(false);
    expect(workspace.getState().replaceComponent(id, 'ddr5-16')).toBe(false);
  });
  it('replaces an MCU with stable selection, preserves C, flags artifacts and supports undo', () => {
    firmware.getState().editSource(demoProject.id, 'int user_source;');
    expect(workspace.getState().replaceComponent('mcu', 'atmega328p')).toBe(true);
    expect(workspace.getState().selectedComponentId).toBe('mcu');
    expect(
      workspace.getState().currentProject.components.find((c) => c.id === 'mcu')?.catalogId,
    ).toBe('atmega328p');
    expect(hardwareBuildState(workspace.getState().currentProject).status).toBe('incompatible');
    expect(draftFor(firmware.getState(), demoProject.id).source).toBe('int user_source;');
    workspace.getState().undo();
    expect(hardwareBuildState(workspace.getState().currentProject).status).toBe('demo');
    workspace.getState().replaceComponent('mcu', 'stm32f103c8');
    expect(hardwareBuildState(workspace.getState().currentProject).status).toBe('stale');
  });
  it('allows explicit targeting of an added processor without silently changing the original target', () => {
    workspace.getState().beginPlacement('rp2040');
    workspace.getState().confirmPlacement();
    expect(hardwareBuildState(workspace.getState().currentProject).status).toBe('demo');
    workspace.getState().setFirmwareTarget(workspace.getState().selectedComponentId!);
    expect(hardwareBuildState(workspace.getState().currentProject).status).toBe('incompatible');
    workspace.getState().undo();
    expect(hardwareBuildState(workspace.getState().currentProject).status).toBe('demo');
  });
  it('persists added transforms, visibility, selection, replacement and firmware target', () => {
    workspace.getState().beginPlacement('rp2040');
    workspace.getState().confirmPlacement();
    const id = workspace.getState().selectedComponentId!;
    workspace.getState().editComponent(id, { position: [8, 2, 1], visible: false });
    workspace.getState().setFirmwareTarget(id);
    workspace.getState().replaceComponent('mcu', 'stm32f401cc');
    workspace.getState().selectComponent(id);
    workspace.getState().save();
    workspace.getState().reset();
    workspace.getState().load();
    expect(workspace.getState().selectedComponentId).toBe(id);
    expect(workspace.getState().currentProject.firmwareTargetId).toBe(id);
    expect(workspace.getState().currentProject.components.find((c) => c.id === id)).toMatchObject({
      position: [8, 2, 1],
      visible: false,
    });
    expect(
      workspace.getState().currentProject.components.find((c) => c.id === 'mcu')?.catalogId,
    ).toBe('stm32f401cc');
  });
});
describe('schema compatibility', () => {
  it('restores library preferences and recovers from malformed storage independently of the project', () => {
    library.getState().setFilters({ query: 'Microchip', interface: 'SPI', insertable: true });
    expect(loadLibraryFilters()).toMatchObject({
      query: 'Microchip',
      interface: 'SPI',
      insertable: true,
    });
    localStorage.setItem('circuitforge.library.v1', '{bad');
    expect(loadLibraryFilters()).toMatchObject({ query: '', category: 'all' });
    expect(workspace.getState().currentProject).toEqual(demoProject);
  });
  it('reads v1 unchanged and normalizes v2 instances against authoritative catalog data', () => {
    expect(parseProject(serializeProject(demoProject))).toEqual(demoProject);
    workspace.getState().beginPlacement('tmp102');
    workspace.getState().confirmPlacement();
    const modified = cloneProject(workspace.getState().currentProject);
    modified.components.at(-1)!.name = 'Fabricated';
    modified.components.at(-1)!.dimensions = [8, 8, 8];
    const restored = parseProject(serializeProject(modified));
    expect(restored.components.at(-1)!.name).toBe(getPart('tmp102')!.name);
    expect(restored.components.at(-1)!.dimensions).toEqual(getPart('tmp102')!.visualSize);
  });
  it('rejects unsupported identities, incompatible replacements and fabricated targets', () => {
    workspace.getState().beginPlacement('tmp102');
    workspace.getState().confirmPlacement();
    const p = cloneProject(workspace.getState().currentProject);
    p.components.at(-1)!.catalogId = 'not-curated';
    expect(() => parseProject(serializeProject(p))).toThrow();
    p.components.at(-1)!.catalogId = 'tmp102';
    p.firmwareTargetId = p.components.at(-1)!.id;
    expect(() => parseProject(serializeProject(p))).toThrow('firmware target');
    const mcu = demoProject.components.find((c) => c.id === 'mcu')!;
    expect(canReplace(mcu, getPart('ddr4-8')!)).toBe(false);
  });
});
describe('component library interface', () => {
  it('requires an explicit visual replacement action and supports cancellation', async () => {
    workspace.getState().selectComponent('mcu');
    library.getState().openDetails('atmega328p');
    render(<ComponentsWorkspace />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Replace selected component' }));
    expect(hardwareBuildState(workspace.getState().currentProject).status).toBe('demo');
    await user.click(screen.getByRole('button', { name: 'Cancel replacement' }));
    expect(screen.queryByRole('region', { name: 'Confirm replacement' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Replace selected component' }));
    await user.click(screen.getByRole('button', { name: 'Apply visual replacement' }));
    expect(hardwareBuildState(workspace.getState().currentProject).status).toBe('incompatible');
    expect(library.getState().workspace).toBe('design');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('searches by part number, exposes details, sources, education and preview', async () => {
    const user = userEvent.setup();
    render(<ComponentsWorkspace />);
    await user.type(screen.getByRole('textbox', { name: 'Search components' }), 'TMP102');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    const detail = screen.getByRole('dialog', { name: 'component details' });
    expect(
      within(detail).getByRole('img', { name: '3D preview of TMP102 temperature sensor' }),
    ).toBeInTheDocument();
    expect(within(detail).getByText('What should I be careful about?')).toBeInTheDocument();
    expect(
      within(detail).getByRole('link', { name: 'Texas Instruments manufacturer reference ↗' }),
    ).toHaveAttribute('href', 'https://www.ti.com/product/TMP102');
    expect(within(detail).getByText('Integration: Not Yet Verified')).toBeInTheDocument();
    await user.click(within(detail).getByRole('button', { name: 'Add to Design' }));
    expect(workspace.getState().placement?.catalogId).toBe('tmp102');
    expect(library.getState().workspace).toBe('design');
  });
  it('compares two controllers and blocks cross-category comparison', async () => {
    const user = userEvent.setup();
    render(<ComponentsWorkspace />);
    await user.click(screen.getByRole('button', { name: 'Compare RP2040' }));
    await user.click(screen.getByRole('button', { name: 'Compare STM32F103C8' }));
    await user.click(screen.getByRole('button', { name: 'Compare ValueRAM DDR4 · 8GB' }));
    expect(screen.getByRole('status')).toHaveTextContent('same subcategory');
    await user.click(screen.getByRole('button', { name: 'Compare (2/3)' }));
    expect(screen.getByRole('dialog', { name: 'component comparison' })).toBeInTheDocument();
  });
  it('shows empty categories and clears filters', async () => {
    const user = userEvent.setup();
    render(<ComponentsWorkspace />);
    await user.click(screen.getByRole('button', { name: 'Memory 4' }));
    await user.click(screen.getByRole('button', { name: 'LPDDR5' }));
    expect(screen.getByText('No curated matches yet')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]);
    expect(screen.getAllByRole('article')).toHaveLength(29);
  });
  it('confirms numeric placement and permits inspector transform reset on added parts', async () => {
    workspace.getState().beginPlacement('rp2040');
    const user = userEvent.setup();
    const view = render(<PlacementControls />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Placement position X' }), {
      target: { value: '9' },
    });
    await user.click(screen.getByRole('button', { name: 'Confirm visual placement' }));
    view.unmount();
    render(<InspectorPanel />);
    await user.click(screen.getByText('Advanced · Transform & appearance'));
    await user.click(screen.getByRole('button', { name: 'Reset selected transform' }));
    expect(workspace.getState().currentProject.components.at(-1)!.position).toEqual([9, 1, 0]);
  });
});
describe('Demo Guide and navigation', () => {
  it('opens actual Components and Code state and responds from selected catalog context', () => {
    expect(runDemoCommand('Show microcontrollers.')).toContain('Showing');
    expect(library.getState().workspace).toBe('components');
    expect(library.getState().filters.subcategory).toBe('Microcontrollers');
    library.getState().openDetails('tmp102');
    expect(runDemoCommand('Explain this component')).toContain('TMP102');
    workspace.getState().replaceComponent('mcu', 'rp2040');
    navigateWorkspace('design');
    expect(library.getState().detailId).toBeNull();
    expect(runDemoCommand('Focus on the microcontroller')).toContain('RP2040 selected');
    expect(workspace.getState().selectedComponentId).toBe('mcu');
  });
  it('reports unknown integration and never invents a driver', () => {
    workspace.getState().selectComponent('mcu');
    expect(runDemoCommand('Show compatible options')).toContain('No drop-in');
    expect(runDemoCommand('What is RAM?')).toContain('temporary working memory');
    workspace.getState().beginPlacement('tmp102');
    workspace.getState().confirmPlacement();
    expect(runDemoCommand('View related code')).toContain('No firmware module');
    navigateWorkspace('code');
    expect(library.getState().workspace).toBe('code');
    expect(firmware.getState().open).toBe(true);
  });
});
