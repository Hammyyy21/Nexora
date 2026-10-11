import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  association,
  buildStatus,
  demoBuild,
  demoSource,
  exportContent,
  hexBytes,
  sourceRevision,
} from '../src/firmware/model';
import {
  clampPanelHeight,
  draftFor,
  FIRMWARE_KEY,
  loadFirmware,
  useFirmwareStore as firmware,
} from '../src/firmware/store';
import { useWorkspaceStore as workspace } from '../src/store/useWorkspaceStore';
import { runDemoCommand } from '../src/lib/assistant';
import { useDesignLayout as layout } from '../src/workspace/layout';
import App from '../src/app/App';
import { useLibraryStore } from '../src/catalog/store';

vi.mock('../src/three/HardwareScene', () => ({
  HardwareScene: () => <div aria-label="Mock 3D viewport" />,
}));
vi.mock('../src/firmware/CodeEditor', () => ({
  CodeEditor: ({
    value,
    readonly,
    onChange,
    language,
  }: {
    value: string;
    readonly: boolean;
    language: string;
    onChange?: (value: string) => void;
  }) => (
    <textarea
      aria-label={`${language} test editor`}
      value={value}
      readOnly={readonly}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));
const project = 'smart-cooling-01';
beforeEach(() => {
  localStorage.clear();
  layout.setState(layout.getInitialState(), true);
  firmware.setState({ ...firmware.getInitialState(), drafts: {}, storageError: null }, true);
  workspace.setState(workspace.getInitialState(), true);
  useLibraryStore.setState(useLibraryStore.getInitialState(), true);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
});

describe('firmware provenance and exports', () => {
  it('records the exact source revision and SHA-256 of the compiled source', () => {
    expect(demoBuild.sourceRevision).toBe(sourceRevision(demoSource));
    expect(demoBuild.sourceSha256).toBe(createHash('sha256').update(demoSource).digest('hex'));
    expect(demoBuild.assembly).toBe(readFileSync('assets/firmware/cooling.s', 'utf8'));
    const recorded = JSON.parse(readFileSync('src/firmware/demoBuild.json', 'utf8'));
    expect(createHash('sha256').update(new Uint8Array(demoBuild.machineCode!)).digest('hex')).toBe(
      recorded.machineSha256,
    );
    expect(demoBuild.targetArchitecture).toContain('Cortex-M3');
    expect(demoBuild.compilerFlags).toContain('--target=arm-none-eabi');
  });
  it('exports exact edited C, compiler assembly, and section-offset hex text', () => {
    expect(exportContent('c', 'int x;')).toEqual({ filename: 'cooling.c', text: 'int x;' });
    expect(exportContent('assembly', 'edited').text).toBe(demoBuild.assembly);
    const hex = exportContent('machine', 'edited');
    expect(hex.filename).toBe('cooling.demo.hex.txt');
    expect(hex.text).toContain('NOT Intel HEX or physical flash addresses');
    expect(hex.text).toContain('00000000  00 68 70 47 01 60 70 47');
    expect(hex.text).toContain('00000010  64 22 0A 60 70 47');
    expect(hexBytes(demoBuild.machineCode!)).toBe(
      '00 68 70 47 01 60 70 47 00 68 00 22 1E 28 C8 BF 64 22 0A 60 70 47',
    );
  });
  it.each(['mcu', 'sensor', 'mosfet', 'fan'])('maps stable component ID %s to MCU code', (id) => {
    expect(association(project, id)?.symbol).toBeTruthy();
  });
  it('has a project overview and honest empty states', () => {
    expect(association(project, null)?.description).toContain('Project firmware');
    expect(association(project, 'sensor')?.description).toContain('does not execute');
    expect(association(project, 'mosfet')?.description).toContain('no executable');
    for (const id of ['r1', 'r2', 'r3', 'c1', 'c2', 'housing', 'unknown'])
      expect(association(project, id)).toBeNull();
    expect(association('other-project', 'mcu')).toBeNull();
  });
});

describe('firmware drafts and build validity', () => {
  it('retains edits, detects unsaved changes, and never validates a build on save', () => {
    firmware.getState().editSource(project, 'int modified;');
    let draft = draftFor(firmware.getState(), project);
    expect(draft.source).not.toBe(draft.savedSource);
    expect(buildStatus(draft.source)).toBe('stale');
    firmware.getState().saveSource(project);
    draft = draftFor(firmware.getState(), project);
    expect(draft.source).toBe(draft.savedSource);
    expect(buildStatus(draft.source)).toBe('stale');
    firmware.getState().hydrate();
    expect(draftFor(firmware.getState(), project).source).toBe('int modified;');
    expect(buildStatus(draftFor(firmware.getState(), project).source)).toBe('stale');
    firmware.getState().resetSource(project);
    expect(buildStatus(draftFor(firmware.getState(), project).source)).toBe('demo');
  });
  it('persists panel state and unsaved drafts across reloads', () => {
    firmware.getState().setTab('machine');
    firmware.getState().setHeight(440);
    firmware.getState().setOpen(false);
    firmware.getState().editSource(project, 'draft');
    const loaded = loadFirmware();
    expect(loaded).toMatchObject({ open: false, tab: 'machine', height: 440 });
    expect(loaded.drafts[project]).toEqual({ source: 'draft', savedSource: demoSource });
  });
  it('isolates projects and preserves drafts through hardware reset/import', () => {
    firmware.getState().editSource(project, 'draft A');
    firmware.getState().editSource('another-project', 'draft B');
    workspace.getState().reset();
    workspace.getState().importProject(workspace.getState().currentProject);
    expect(draftFor(firmware.getState(), project).source).toBe('draft A');
    expect(draftFor(firmware.getState(), 'another-project').source).toBe('draft B');
  });
  it.each([
    'broken',
    'null',
    '{}',
    JSON.stringify({
      version: 1,
      open: true,
      height: 400,
      activeFile: 'cooling',
      tab: 'c',
      drafts: { a: { source: 5 } },
    }),
  ])('recovers from corrupt local data %s', (raw) => {
    localStorage.setItem(FIRMWARE_KEY, raw);
    const loaded = loadFirmware();
    expect(loaded.storageError).toContain('could not be loaded');
    expect(draftFor(loaded, project).source).toBe(demoSource);
    expect(localStorage.getItem(FIRMWARE_KEY)).toBe(raw);
    firmware.getState().hydrate();
    firmware.getState().setOpen(true);
    expect(firmware.getState().storageError).toContain('could not be loaded');
    expect(localStorage.getItem(FIRMWARE_KEY)).toBe(raw);
  });
  it('keeps session edits when browser storage fails', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    firmware.getState().editSource(project, 'session draft');
    expect(draftFor(firmware.getState(), project).source).toBe('session draft');
    expect(firmware.getState().storageError).toContain('download C');
    firmware.getState().saveSource(project);
    expect(draftFor(firmware.getState(), project).savedSource).toBe(demoSource);
    spy.mockRestore();
  });
  it('clamps rapid resize and corrupted height inputs', () => {
    expect(clampPanelHeight(10000, 400)).toBe(400);
    expect(clampPanelHeight(-100, 400)).toBe(230);
    expect(clampPanelHeight(300, 120)).toBe(120);
    expect(clampPanelHeight(NaN, 400)).toBe(310);
    for (let h = -400; h < 1000; h += 31) firmware.getState().setHeight(h);
    expect(firmware.getState().height).toBeLessThanOrEqual(680);
  });
});

describe('firmware commands', () => {
  it.each([
    ['Show C code.', 'c'],
    ['Show assembly.', 'assembly'],
    ['Show machine code.', 'machine'],
  ])('applies %s without changing the 3D viewing mode', (command, tab) => {
    workspace.getState().setViewMode('xray');
    runDemoCommand(command);
    expect(firmware.getState()).toMatchObject({ open: true, tab });
    expect(workspace.getState().activeViewMode).toBe('xray');
  });
  it('opens, closes, selects MCU, and leaves assembly view command intact', () => {
    runDemoCommand('Open firmware.');
    expect(firmware.getState().open).toBe(true);
    runDemoCommand('Close firmware explorer.');
    expect(firmware.getState().open).toBe(false);
    runDemoCommand('Show microcontroller firmware.');
    expect(workspace.getState().selectedComponentId).toBe('mcu');
    expect(workspace.getState().cameraView).toBe('focus');
    expect(firmware.getState()).toMatchObject({ open: true, tab: 'c' });
    runDemoCommand('Switch to assembly');
    expect(workspace.getState().activeViewMode).toBe('assembly');
    expect(runDemoCommand('Generate optimized C firmware for my new motherboard.')).toContain(
      'planned for a later phase',
    );
  });
});

describe('firmware interface integration', () => {
  beforeEach(() => layout.getState().setPanel('code'));
  it('labels replacement targets incompatible and restores recorded validity on hardware undo', async () => {
    firmware.getState().setOpen(true);
    workspace.getState().replaceComponent('mcu', 'atmega328p');
    render(<App />);
    expect(screen.getByText('Incompatible target')).toBeVisible();
    expect(screen.queryByText('Verified demo build')).not.toBeInTheDocument();
    expect(screen.getByText(/has not been ported to the replacement hardware/)).toBeVisible();
    expect(await screen.findByRole('textbox', { name: 'c test editor' })).toHaveValue(demoSource);
    act(() => workspace.getState().undo());
    expect(screen.getByText('Verified demo build')).toBeVisible();
    act(() => workspace.getState().replaceComponent('mcu', 'stm32f103c8'));
    expect(screen.getByText('Outdated build')).toBeVisible();
  });
  it('opens, edits, navigates tabs and collapses without unmounting source state', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name: 'Code' }));
    const editor = await screen.findByRole('textbox', { name: 'c test editor' });
    expect(editor).toHaveAttribute('readonly');
    await user.click(screen.getByRole('button', { name: 'Edit C' }));
    fireEvent.change(editor, { target: { value: 'int revised;' } });
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
    expect(screen.getByText('Outdated build')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Assembly' }));
    expect(screen.getByRole('textbox', { name: 'assembly test editor' })).toHaveAttribute(
      'readonly',
    );
    await user.click(screen.getByRole('tab', { name: 'Machine Code' }));
    expect(screen.getByRole('columnheader', { name: 'HEX BYTES' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close tools panel' }));
    expect(screen.queryByRole('tab', { name: 'C' })).not.toBeInTheDocument();
    expect(editor).toBeInTheDocument();
    await user.click(within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name: 'Code' }));
    expect(screen.getByRole('tab', { name: 'Machine Code' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('tab', { name: 'C' }));
    expect(screen.getByRole('textbox', { name: 'c test editor' })).toBe(editor);
    expect(editor).toHaveValue('int revised;');
    await user.click(screen.getByRole('button', { name: 'Save C' }));
    expect(screen.queryByText(/Unsaved changes/)).not.toBeInTheDocument();
    expect(screen.getByText('Outdated build')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset sample' }));
    await user.click(screen.getByRole('button', { name: 'Reset C source' }));
    expect(editor).toHaveValue(demoSource);
    expect(screen.getByText('Verified demo build')).toBeInTheDocument();
  });
  it('synchronizes component associations, passive empty state, and project navigation', async () => {
    const user = userEvent.setup();
    firmware.getState().setOpen(true);
    render(<App />);
    await user.click(within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name: 'Design' }));
    await user.click(screen.getByRole('button', { name: /Temperature Sensor U3/ }));
    await user.click(within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name: 'Code' }));
    expect(screen.getByText(/The sensor does not execute firmware/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Go to sensor_read_celsius ↗' }));
    expect(firmware.getState().tab).toBe('c');
    await user.click(within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name: 'Design' }));
    await user.click(screen.getByRole('button', { name: /Resistor R1 R1/ }));
    await user.click(within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name: 'Code' }));
    expect(screen.getByText('No firmware associated with this component.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'View project firmware' }));
    expect(workspace.getState().selectedComponentId).toBeNull();
  });
  it('supports keyboard resizing, expanded mode, and isolates editor shortcuts', async () => {
    const user = userEvent.setup();
    firmware.getState().setOpen(true);
    render(<App />);
    const handle = screen.getByRole('separator', { name: 'Resize tools panel' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(layout.getState().width).toBe(380);
    fireEvent.keyDown(handle, { key: 'End' });
    expect(layout.getState().width).toBe(Math.min(800, window.innerWidth - 420));
    await user.click(screen.getByRole('button', { name: 'Expand editor' }));
    expect(layout.getState().expanded).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Restore editor size' }));
    expect(layout.getState().expanded).toBe(false);
    const before = workspace.getState().cameraRequest;
    const editor = screen.getByRole('textbox', { name: 'c test editor' });
    fireEvent.keyDown(editor, { key: 'g' });
    fireEvent.keyDown(editor, { key: 'f' });
    expect(workspace.getState().gridVisible).toBe(true);
    expect(workspace.getState().cameraRequest).toBe(before);
    await user.click(within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name: 'Workspace' }));
    for (const mode of ['Exploded', 'X-Ray', 'Connections', 'Assembly']) {
      await user.click(screen.getByRole('button', { name: mode }));
      expect(screen.getByRole('button', { name: mode })).toHaveAttribute('aria-pressed', 'true');
    }
    expect(screen.getByLabelText('Mock 3D viewport')).toBeInTheDocument();
    await user.click(within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name: 'AI Guide' }));
    expect(screen.getByRole('textbox', { name: 'Ask Demo Assistant' })).toBeVisible();
  });
  it('copies actual source and reports clipboard failure', async () => {
    const user = userEvent.setup();
    firmware.getState().setOpen(true);
    render(<App />);
    const spy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(spy).toHaveBeenCalledWith(demoSource);
    spy.mockRejectedValue(new Error('denied'));
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(workspace.getState().notice).toContain('Clipboard unavailable');
    spy.mockRestore();
  });
});
