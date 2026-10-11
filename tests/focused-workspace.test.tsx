import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../src/app/App';
import {
  useDesignLayout as layout,
  LAYOUT_KEY,
  loadDesignLayout,
  clampPanelWidth,
} from '../src/workspace/layout';
import { useWorkspaceStore as workspace } from '../src/store/useWorkspaceStore';
import { useLibraryStore as library } from '../src/catalog/store';
import { useGuideStore as guide } from '../src/ai/store';
import { useFirmwareStore as firmware, draftFor } from '../src/firmware/store';

vi.mock('../src/three/HardwareScene', () => ({
  HardwareScene: () => <canvas aria-label="Hardware canvas" />,
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
    onChange?: (value: string) => void;
    language: string;
  }) => (
    <textarea
      aria-label={`${language} editor`}
      value={value}
      readOnly={readonly}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));
beforeEach(() => {
  localStorage.clear();
  workspace.setState({ ...workspace.getInitialState(), reducedMotion: true }, true);
  library.setState(library.getInitialState(), true);
  layout.setState(layout.getInitialState(), true);
  firmware.setState(firmware.getInitialState(), true);
  guide.setState({ ...guide.getInitialState(), availability: 'unconfigured' }, true);
});
const tab = (name: string) => {
  const label = name === 'Explorer' ? 'Design' : name === 'AI' ? 'AI Guide' : name;
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name: label }));
};

it('uses one primary navigation and synchronizes Design, Inspector, Code and AI context', async () => {
  render(<App />);
  const canvas = screen.getByLabelText('Hardware canvas');
  const nav = screen.getByRole('navigation', { name: 'Main workspace navigation' });
  expect(within(nav).getAllByRole('button').map((node) => node.textContent)).toEqual([
    'Design', 'Schematic', 'Inspector', 'Workspace', 'Code', 'Components', 'AI Guide',
  ]);
  expect(screen.queryByRole('tablist', { name: 'Design panels' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Microcontroller U1/ }));
  expect(workspace.getState().selectedComponentId).toBe('mcu');
  expect(screen.getByRole('region', { name: 'Position & Transform' })).toBeVisible();
  fireEvent.change(screen.getByLabelText('X position (mm)'), { target: { value: '-17.5' } });
  fireEvent.keyDown(screen.getByLabelText('X position (mm)'), { key: 'Enter' });
  for (const [name, selector] of [
    ['Explorer', '.project-sidebar'],
    ['Workspace', '.workspace-preferences'],
    ['Inspector', '.inspector'],
    ['Code', '.firmware-panel'],
    ['AI', '.command-area'],
  ]) {
    tab(name);
    const openPanel = document.querySelector('.tool-content:not([hidden])')!;
    expect(document.querySelectorAll('.tool-content:not([hidden])')).toHaveLength(1);
    expect(openPanel.querySelector(selector)).toBeVisible();
    expect(screen.getByLabelText('Hardware canvas')).toBe(canvas);
    expect(canvas).toBeVisible();
    expect(screen.getByLabelText('X position (mm)')).toHaveValue(-17.5);
    expect(workspace.getState().selectedComponentId).toBe('mcu');
  }
  tab('Inspector');
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Microcontroller' })).toBeVisible(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'View Code' }));
  expect(layout.getState().panel).toBe('code');
  fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
  expect(layout.getState().panel).toBe('ai');
  expect(screen.getByLabelText('Ask Demo Assistant')).toHaveFocus();
  expect(workspace.getState().selectedComponentId).toBe('mcu');
});

it('resizes by pointer and keyboard, saves layout, and collapses without changing the scene', () => {
  render(<App />);
  const canvas = screen.getByLabelText('Hardware canvas');
  const handle = screen.getByRole('separator', { name: 'Resize tools panel' });
  const panel = screen.getByRole('complementary', { name: 'Workspace tools panel' });
  const bounds = vi
    .spyOn(panel, 'getBoundingClientRect')
    .mockReturnValue({ width: 360 } as DOMRect);
  handle.setPointerCapture = vi.fn();
  handle.hasPointerCapture = vi.fn(() => true);
  handle.releasePointerCapture = vi.fn();
  const pointer = (type: string, x: number) => {
    const event = new Event(type, { bubbles: true });
    Object.assign(event, { button: 0, pointerId: 1, clientX: x });
    fireEvent(handle, event);
  };
  pointer('pointerdown', 700);
  pointer('pointermove', 640);
  pointer('pointerup', 640);
  expect(layout.getState().width).toBe(420);
  expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
  pointer('pointermove', 100);
  expect(layout.getState().width).toBe(420);
  fireEvent.keyDown(handle, { key: 'ArrowRight' });
  expect(layout.getState().width).toBe(400);
  tab('Workspace');
  fireEvent.click(screen.getByRole('button', { name: 'Focus Mode' }));
  fireEvent.click(screen.getByRole('button', { name: 'Collapse tools panel' }));
  expect(panel).not.toBeVisible();
  expect(canvas).toBeVisible();
  expect(loadDesignLayout()).toEqual({
    panel: 'workspace',
    width: 400,
    collapsed: true,
    focusMode: true,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open tools panel' }));
  expect(panel).toBeVisible();
  expect(workspace.getState().cameraRequest).toBe(0);
  expect(screen.getByLabelText('Hardware canvas')).toBe(canvas);
  bounds.mockRestore();
});

it('retains unsaved C, active language, chat drafts and local design commands across hidden panels', async () => {
  const errors = vi.spyOn(console, 'error');
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  tab('Code');
  fireEvent.click(screen.getByRole('button', { name: 'Edit C' }));
  const editor = screen.getByLabelText('c editor');
  fireEvent.change(editor, { target: { value: 'int retained_draft;' } });
  fireEvent.click(screen.getByRole('tab', { name: 'Assembly' }));
  tab('AI');
  const input = screen.getByLabelText('Ask Demo Assistant');
  fireEvent.change(input, { target: { value: 'Show exploded view' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send command' }));
  await screen.findByText(/Exploded view enabled/);
  expect(workspace.getState().activeViewMode).toBe('exploded');
  const messages = workspace.getState().demoAssistantMessages;
  fireEvent.change(input, { target: { value: 'Unsent question' } });
  const cameraRequest = workspace.getState().cameraRequest;
  for (const name of ['Explorer', 'Workspace', 'Inspector', 'Code', 'AI']) tab(name);
  expect(screen.getByLabelText('Ask Demo Assistant')).toBe(input);
  expect(input).toHaveValue('Unsent question');
  expect(workspace.getState().demoAssistantMessages).toBe(messages);
  expect(workspace.getState().cameraRequest).toBe(cameraRequest);
  tab('Code');
  expect(screen.getByRole('tab', { name: 'Assembly' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('tab', { name: 'C' }));
  expect(screen.getByLabelText('c editor')).toBe(editor);
  expect(editor).toHaveValue('int retained_draft;');
  const draft = draftFor(firmware.getState(), workspace.getState().currentProject.id);
  expect(draft.source).not.toBe(draft.savedSource);
  expect(errors.mock.calls.filter((args) => String(args[0]).includes('unmount a root'))).toEqual(
    [],
  );
  errors.mockRestore();
});

it('applies scene preferences and isolates tool shortcuts from camera controls', () => {
  render(<App />);
  tab('Workspace');
  for (const mode of ['Exploded', 'X-Ray', 'Connections', 'Assembly']) {
    fireEvent.click(screen.getByRole('button', { name: mode }));
    expect(screen.getByRole('button', { name: mode })).toHaveAttribute('aria-pressed', 'true');
  }
  fireEvent.change(screen.getByLabelText('Lighting intensity'), { target: { value: '1.5' } });
  expect(workspace.getState().lightIntensity).toBe(1.5);
  fireEvent.click(screen.getByRole('button', { name: 'Orbit (O)' }));
  expect(workspace.getState().activeTool).toBe('orbit');
  fireEvent.click(screen.getByRole('button', { name: 'Pan (H)' }));
  expect(workspace.getState().activeTool).toBe('pan');
  const cameraRequest = workspace.getState().cameraRequest;
  fireEvent.keyDown(screen.getByLabelText('Lighting intensity'), { key: 'f' });
  expect(workspace.getState().cameraRequest).toBe(cameraRequest);
  fireEvent.click(screen.getByRole('button', { name: 'Fit to Model' }));
  expect(workspace.getState().cameraRequest).toBe(cameraRequest + 1);
});

it('validates saved preferences and tolerates unavailable storage', () => {
  localStorage.setItem(LAYOUT_KEY, '{broken');
  expect(loadDesignLayout().panel).toBe('explorer');
  expect(clampPanelWidth(NaN)).toBe(360);
  expect(clampPanelWidth(100)).toBe(300);
  expect(clampPanelWidth(99999)).toBe(800);
  const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Full');
  });
  act(() => {
    layout.getState().setPanel('ai');
    layout.getState().setWidth(450);
  });
  expect(layout.getState()).toMatchObject({ panel: 'ai', width: 450, collapsed: false });
  save.mockRestore();
});

it('keeps an in-flight AI reply and captured component context while navigating away', async () => {
  guide.setState({ availability: 'ready', mode: 'ai' });
  workspace.getState().selectComponent('mcu');
  const project = workspace.getState().currentProject;
  let resolve!: (response: Response) => void;
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  try {
    render(<App />);
    tab('AI');
    fireEvent.change(screen.getByLabelText('Ask AI Guide'), {
      target: { value: 'Explain this component' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send command' }));
    expect(guide.getState().busy).toBe(true);
    expect(screen.getByRole('button', { name: 'Send command' })).toBeDisabled();
    tab('Code');
    resolve(
      new Response(
        JSON.stringify({
          mode: 'ai',
          request_id: 'retained-request',
          answer: 'A microcontroller executes firmware.',
          missing_data: [],
          unverified_recommendations: [],
          cited_catalog_ids: [],
          references: [],
          notice: 'Read-only explanation.',
        }),
        { status: 200 },
      ),
    );
    await waitFor(() => expect(guide.getState().busy).toBe(false));
    tab('AI');
    expect(screen.getByText(/A microcontroller executes firmware/)).toBeVisible();
    expect(workspace.getState().currentProject).toBe(project);
    expect(workspace.getState().selectedComponentId).toBe('mcu');
    const sent = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    );
    expect(sent.context.selected_component_id).toBe('mcu');
    expect(workspace.getState().demoAssistantMessages).toHaveLength(2);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('keeps Fit to Model in the top viewing row in Focus Mode and scopes F to the viewport', () => {
  render(<App />);
  const project = workspace.getState().currentProject;
  const canvas = screen.getByLabelText('Hardware canvas');
  const button = screen.getByRole('button', { name: 'Fit to Model' });
  expect(button.closest('.mode-bar')).toContainElement(screen.getByRole('button', { name: 'X-Ray' }));
  fireEvent.click(screen.getByRole('button', { name: 'X-Ray' }));
  fireEvent.click(screen.getByRole('button', { name: 'Focus Mode' }));
  fireEvent.click(screen.getByRole('button', { name: 'Collapse tools panel' }));
  expect(button).toBeVisible();
  fireEvent.click(button);
  const request = workspace.getState().cameraRequest;
  expect(workspace.getState().cameraView).toBe('fit');
  expect(workspace.getState().activeViewMode).toBe('xray');
  fireEvent.keyDown(document.body, { key: 'f' });
  expect(workspace.getState().cameraRequest).toBe(request);
  fireEvent.keyDown(canvas, { key: 'f' });
  expect(workspace.getState().cameraRequest).toBe(request + 1);
  expect(workspace.getState().currentProject).toBe(project);
  expect(screen.getByLabelText('Hardware canvas')).toBe(canvas);
});
