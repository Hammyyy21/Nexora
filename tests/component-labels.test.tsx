import { StrictMode, createRef } from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene } from 'three';
import { ComponentLabels, LabelProjection } from '../src/three/ComponentLabels';
import { useWorkspaceStore as workspace } from '../src/store/useWorkspaceStore';

const frame = vi.hoisted(() => ({ update: vi.fn<(state: unknown) => void>() }));
vi.mock('@react-three/fiber', () => ({
  useFrame: (update: (state: unknown) => void) => {
    frame.update.mockImplementation(update);
  },
}));
beforeEach(() => workspace.setState(workspace.getInitialState(), true));
it('projects animated component labels and hides labels behind the camera or missing geometry', () => {
  workspace.setState({ labelsVisible: true });
  const container = createRef<HTMLDivElement>();
  render(
    <>
      <ComponentLabels container={container} />
      <LabelProjection container={container} />
    </>,
  );
  const scene = new Scene();
  const object = new Group();
  object.name = 'mcu';
  scene.add(object);
  const camera = new PerspectiveCamera(37, 800 / 600, 0.1, 500);
  camera.position.set(0, 0, 10);
  camera.updateMatrixWorld();
  const state = { scene, camera, size: { width: 800, height: 600 } };
  frame.update(state);
  const label = container.current!.querySelector<HTMLElement>('[data-component-id="mcu"]')!;
  expect(label.style.visibility).toBe('visible');
  expect(label.style.transform).toContain('translate3d(400px,');
  const position = label.style.transform;
  object.position.x = 2;
  frame.update(state);
  expect(label.style.transform).not.toBe(position);
  object.position.z = 20;
  frame.update(state);
  expect(label.style.visibility).toBe('hidden');
  object.position.z = 0;
  frame.update({ ...state, size: { width: 0, height: 0 } });
  expect(label.style.visibility).toBe('hidden');
  scene.remove(object);
  frame.update(state);
  expect(label.style.visibility).toBe('hidden');
});
it('mounts and removes labels under StrictMode without nested React roots or cleanup warnings', () => {
  const error = vi.spyOn(console, 'error');
  const container = createRef<HTMLDivElement>();
  workspace.setState({ labelsVisible: true });
  const view = render(
    <StrictMode>
      <ComponentLabels container={container} />
    </StrictMode>,
  );
  expect(container.current!.children.length).toBeGreaterThan(0);
  act(() => workspace.getState().selectComponent('pcb'));
  expect(container.current!.querySelector('[data-component-id="pcb"]')).not.toBeNull();
  act(() => workspace.getState().editComponent('pcb', { visible: false }));
  expect(container.current!.querySelector('[data-component-id="pcb"]')).toBeNull();
  act(() => workspace.setState({ labelsVisible: false }));
  expect(container.current!.children).toHaveLength(0);
  act(() => workspace.setState({ labelsVisible: true }));
  view.unmount();
  expect(container.current).toBeNull();
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});
