import { beforeEach, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import {
  Box3,
  BoxGeometry,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three';
import { StrictMode } from 'react';
import { CameraController } from '../src/three/CameraController';
import { useWorkspaceStore as workspace } from '../src/store/useWorkspaceStore';
const mocks = vi.hoisted(() => ({
  frames: vi.fn(),
  durations: vi.fn(),
  state: {} as Record<string, unknown>,
  control: {} as Record<string, unknown>,
}));
vi.mock('@react-three/fiber', () => ({
  useThree: (select: (s: unknown) => unknown) => select(mocks.state),
}));
vi.mock('@react-three/drei', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  return {
    OrbitControls: forwardRef((_props, ref) => {
      useImperativeHandle(ref, () => mocks.control);
      return null;
    }),
  };
});
vi.mock('gsap', () => ({
  gsap: {
    timeline: () => {
      mocks.frames();
      const chain = {
        kill: vi.fn(),
        to: (object: Vector3, value: { x: number; y: number; z: number; duration: number }) => {
          mocks.durations(value.duration);
          object.set(value.x, value.y, value.z);
          return chain;
        },
      };
      return chain;
    },
  },
}));
beforeEach(() => {
  workspace.setState(workspace.getInitialState(), true);
  mocks.frames.mockClear();
  mocks.durations.mockClear();
  mocks.state = {
    camera: new PerspectiveCamera(37),
    size: { width: 800, height: 600 },
    gl: { domElement: document.createElement('canvas') },
  };
  mocks.control = { target: new Vector3(), update: vi.fn(), enabled: true, enableDamping: true };
});
it('preserves camera position and OrbitControls target through layout resizes and zero-size hiding', () => {
  const view = render(<CameraController />);
  expect(mocks.frames).toHaveBeenCalledTimes(1);
  const camera = mocks.state.camera as PerspectiveCamera,
    target = mocks.control.target as Vector3;
  camera.position.set(4, 8, -6);
  target.set(1, 0.2, -1);
  for (const [width, height] of [
    [1440, 780],
    [0, 0],
    [800, 600],
    [390, 400],
  ]) {
    mocks.state.size = { width, height };
    view.rerender(<CameraController />);
    expect(camera.position.toArray()).toEqual([4, 8, -6]);
    expect(target.toArray()).toEqual([1, 0.2, -1]);
  }
  expect(mocks.frames).toHaveBeenCalledTimes(1);
  act(() => workspace.getState().requestCamera('fit'));
  expect(mocks.frames).toHaveBeenCalledTimes(2);
  expect(camera.position.toArray()).not.toEqual([4, 8, -6]);
});
it('defers an explicit camera request until the viewport has usable dimensions', () => {
  mocks.state.size = { width: 0, height: 0 };
  const view = render(<CameraController />);
  act(() => workspace.getState().requestCamera('top'));
  expect(mocks.frames).not.toHaveBeenCalled();
  mocks.state.size = { width: 1366, height: 768 };
  view.rerender(<CameraController />);
  expect(mocks.frames).toHaveBeenCalledTimes(1);
});
it('restarts the initial camera transition when StrictMode replays mount effects', () => {
  render(
    <StrictMode>
      <CameraController />
    </StrictMode>,
  );
  expect(mocks.frames).toHaveBeenCalledTimes(2);
});

it('does not let wheel input re-enable OrbitControls while moving a component', () => {
  render(<CameraController />);
  const gl = mocks.state.gl as { domElement: HTMLCanvasElement };
  gl.domElement.dispatchEvent(new Event('pointerdown'));
  expect(mocks.control.enabled).toBe(true);
  act(() => {
    workspace.getState().selectComponent('mcu');
    workspace.getState().setDragMode(true);
    workspace.getState().beginComponentDrag('mcu');
  });
  mocks.control.enabled = false;
  gl.domElement.dispatchEvent(new Event('wheel'));
  expect(mocks.control.enabled).toBe(false);
});

it('preserves an orthographic camera and fits actual scene geometry after part transforms', () => {
  const camera = new OrthographicCamera(-5, 5, 4, -4, 0.01, 500);
  const scene = new Scene();
  const mesh = new Mesh(new BoxGeometry(2, 20, 2));
  mesh.name = 'geometry:mcu';
  mesh.position.set(10, 12, -5);
  scene.add(mesh);
  mocks.state.camera = camera;
  mocks.state.scene = scene;
  render(<CameraController />);
  const zoom = camera.zoom;
  mesh.position.set(-18, 25, 8);
  mesh.rotation.set(0.4, 0.8, 0.2);
  act(() => workspace.getState().requestCamera('fit'));
  camera.lookAt(mocks.control.target as Vector3);
  camera.updateMatrixWorld();
  expect(mocks.state.camera).toBe(camera);
  expect(camera.zoom).not.toBe(zoom);
  const bounds = new Box3().setFromObject(mesh);
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const p = new Vector3(x, y, z).project(camera);
        expect(Math.abs(p.x)).toBeLessThan(1);
        expect(Math.abs(p.y)).toBeLessThan(1);
      }
  mesh.geometry.dispose();
});

it('uses immediate camera transitions when reduced motion is enabled', () => {
  workspace.setState({ reducedMotion: true });
  render(<CameraController />);
  act(() => workspace.getState().requestCamera('fit'));
  expect(mocks.durations.mock.calls.flat()).toEqual([0, 0, 0, 0]);
});
