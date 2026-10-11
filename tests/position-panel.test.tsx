import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { PositionTransform } from '../src/components/workspace/PositionTransform';
import { useWorkspaceStore as store } from '../src/store/useWorkspaceStore';
import { useKeyboard } from '../src/hooks/useKeyboard';

beforeEach(() => store.setState(store.getInitialState(), true));
const component = () => store.getState().currentProject.components.find((c) => c.id === 'mcu')!;
const select = (id: string | null) => act(() => store.getState().selectComponent(id));

it('shows the selected name and mm coordinates immediately, collapses, and hides on deselection', () => {
  render(<PositionTransform />);
  expect(screen.queryByRole('region', { name: 'Position & Transform' })).not.toBeInTheDocument();
  select('mcu');
  expect(screen.getByRole('region', { name: 'Position & Transform' })).toBeVisible();
  expect(screen.getByText('Microcontroller')).toBeVisible();
  expect(screen.getByLabelText('X position (mm)')).toHaveValue(-12.5);
  expect(screen.getByLabelText('Y position (mm)')).toHaveValue(2.9);
  fireEvent.click(screen.getByRole('button', { name: 'Collapse transform controls' }));
  expect(screen.queryByLabelText('X position (mm)')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Expand transform controls' }));
  expect(screen.getByLabelText('X position (mm)')).toBeVisible();
  select(null);
  expect(screen.queryByRole('region', { name: 'Position & Transform' })).not.toBeInTheDocument();
});

it('commits complete numeric edits on Enter or blur, rejects invalid values, and follows undo/redo', () => {
  select('mcu');
  render(<PositionTransform />);
  const input = () => screen.getByLabelText('X position (mm)');
  fireEvent.change(input(), { target: { value: '-25.125' } });
  expect(component().position[0]).toBe(-1.25);
  fireEvent.keyDown(input(), { key: 'Enter' });
  expect(component().position[0]).toBe(-2.5125);
  expect(store.getState().undoHistory).toHaveLength(1);
  act(() => store.getState().undo());
  expect(input()).toHaveValue(-12.5);
  act(() => store.getState().redo());
  expect(input()).toHaveValue(-25.125);
  for (const value of ['', '201', '-201', 'Infinity']) {
    fireEvent.change(input(), { target: { value } });
    fireEvent.blur(input());
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(component().position[0]).toBe(-2.5125);
  }
  fireEvent.keyDown(input(), { key: 'Escape' });
  expect(input()).toHaveValue(-25.125);
  expect(input()).toHaveAttribute('aria-invalid', 'false');
  fireEvent.change(input(), { target: { value: '-15' } });
  fireEvent.blur(input());
  expect(component().position[0]).toBe(-1.5);
  expect(store.getState().undoHistory).toHaveLength(2);
});

it('keeps live canonical fields visible in Drag Mode and enforces board constraints', () => {
  select('mcu');
  render(<PositionTransform />);
  fireEvent.click(screen.getByRole('button', { name: 'Drag Mode' }));
  expect(store.getState().dragMode).toBe(true);
  expect(screen.getByLabelText('X position (mm)')).toBeEnabled();
  act(() => {
    store.getState().beginComponentDrag('mcu');
    store.getState().previewComponentDrag([-1.75, 0.5, -1]);
  });
  expect(screen.getByLabelText('X position (mm)')).toHaveValue(-17.5);
  expect(screen.getByLabelText('Y position (mm)')).toHaveValue(5);
  act(() => store.getState().finishComponentDrag());
  expect(screen.getByLabelText('X position (mm)')).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'XYZ Mode' }));
  expect(store.getState().dragMode).toBe(false);
  fireEvent.change(screen.getByLabelText('Placement constraints'), { target: { value: 'board' } });
  fireEvent.change(screen.getByLabelText('X position (mm)'), { target: { value: '100' } });
  fireEvent.blur(screen.getByLabelText('X position (mm)'));
  expect(screen.getByText(/Keep the whole component inside/)).toBeVisible();
  expect(component().position[0]).toBe(-1.75);
});

it('disables movement for fixed structures and gizmos for hidden parts', () => {
  select('pcb');
  render(<PositionTransform />);
  expect(screen.getByRole('button', { name: 'Drag Mode' })).toBeDisabled();
  expect(screen.getByLabelText('X position (mm)')).toBeDisabled();
  expect(screen.getByText(/position is locked/)).toBeVisible();
  select('mcu');
  act(() => store.getState().editComponent('mcu', { visible: false }));
  expect(screen.getByRole('button', { name: 'Drag Mode' })).toBeDisabled();
  expect(screen.getByText(/Show this component/)).toBeVisible();
});

it('isolates panel keyboard shortcuts and pointer gestures from the viewport', () => {
  function Keyboard() {
    useKeyboard();
    return <PositionTransform />;
  }
  select('mcu');
  let pointerEvents = 0;
  render(
    <div onPointerDown={() => pointerEvents++}>
      <Keyboard />
    </div>,
  );
  fireEvent.pointerDown(screen.getByLabelText('X position (mm)'));
  expect(pointerEvents).toBe(0);
  const before = store.getState().cameraRequest;
  fireEvent.keyDown(screen.getByRole('button', { name: 'Drag Mode' }), { key: 'f' });
  expect(store.getState().cameraRequest).toBe(before);
});
