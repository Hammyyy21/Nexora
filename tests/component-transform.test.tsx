import { StrictMode } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene, Vector3 } from 'three';
import { OrbitControls, TransformControls } from 'three-stdlib';
import { bindComponentTransform } from '../src/three/transformBinding';
import { ComponentTransformControls } from '../src/three/ComponentTransformControls';
import { useWorkspaceStore as store } from '../src/store/useWorkspaceStore';
import { useLibraryStore as library } from '../src/catalog/store';
import { displayedPosition } from '../src/lib/project';

const mock = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('@react-three/fiber', () => ({ useThree: () => mock.state }));
const orbits: OrbitControls[] = [];
afterEach(() => {
  orbits.splice(0).forEach((orbit) => orbit.dispose());
});
beforeEach(() => {
  store.setState(store.getInitialState(), true);
  library.setState(library.getInitialState(), true);
  store.getState().selectComponent('mcu');
  store.getState().setDragMode(true);
});
const component = () => store.getState().currentProject.components.find((c) => c.id === 'mcu')!;

function fixture() {
  const scene = new Scene();
  const object = new Group();
  object.name = 'mcu';
  object.position.set(...displayedPosition(component(), store.getState().activeViewMode));
  scene.add(object);
  const camera = new PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.copy(object.position).add(new Vector3(0, 0, 10));
  camera.lookAt(object.position);
  camera.updateMatrixWorld();
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 600,
    height: 600,
  } as DOMRect);
  canvas.releasePointerCapture = vi.fn();
  Object.defineProperty(canvas, 'clientHeight', { value: 600 });
  const orbit = new OrbitControls(camera, canvas);
  orbit.target.copy(object.position);
  orbit.update();
  orbits.push(orbit);
  const pointer = (target: EventTarget, type: string, x: number, y: number, button: number) => {
    const event = new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true });
    Object.defineProperty(event, 'pointerType', { value: 'mouse' });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    target.dispatchEvent(event);
  };
  const at = (offset: Vector3) => {
    const p = object.position.clone().add(offset).project(camera);
    return { x: (p.x + 1) * 300, y: (1 - p.y) * 300 };
  };
  return { scene, object, camera, canvas, orbit, pointer, at };
}

it.each(['assembly', 'exploded', 'xray'] as const)(
  'drags the real X-axis gizmo in %s with canonical preview and a single undo entry',
  (mode) => {
    store.getState().setViewMode(mode);
    const f = fixture();
    const controls = new TransformControls(f.camera, f.canvas);
    controls.attach(f.object);
    controls.setSize(0.8);
    controls.setSpace('world');
    f.scene.add(controls);
    const unbind = bindComponentTransform(controls, f.object, 'mcu', f.orbit);
    f.scene.updateMatrixWorld(true);
    const start = f.at(new Vector3(0.6, 0, 0));
    const before = [...component().position];
    const cameraBefore = f.camera.position.toArray();
    f.pointer(f.canvas, 'pointerdown', start.x, start.y, 0);
    expect(store.getState().componentDrag).not.toBeNull();
    expect(f.orbit.enabled).toBe(false);
    for (let dx = 1; dx <= 40; dx++)
      f.pointer(document, 'pointermove', start.x + dx, start.y + 12, -1);
    const preview = store.getState().componentDrag!.position;
    expect(preview[0]).toBeGreaterThan(before[0]);
    expect(preview[1]).toBeCloseTo(before[1]);
    expect(preview[2]).toBe(before[2]);
    expect(component().position).toEqual(before);
    expect(f.object.position.x).toBeCloseTo(preview[0]);
    f.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
    expect(f.camera.position.toArray()).toEqual(cameraBefore);
    f.pointer(document, 'pointerup', start.x + 40, start.y + 12, 0);
    expect(f.orbit.enabled).toBe(true);
    expect(component().position).toEqual(preview);
    expect(store.getState().componentDrag).toBeNull();
    expect(store.getState().undoHistory).toHaveLength(1);
    expect(store.getState().transformPointerActive).toBe(true);
    store.getState().undo();
    expect(component().position).toEqual(before);
    store.getState().redo();
    expect(component().position).toEqual(preview);
    f.pointer(f.canvas, 'pointerdown', 100, 500, 0);
    f.pointer(document, 'pointermove', 130, 520, -1);
    f.pointer(document, 'pointerup', 130, 520, 0);
    expect(f.camera.position.toArray()).not.toEqual(cameraBefore);
    const afterOrbit = f.camera.position.clone();
    f.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
    expect(f.camera.position.distanceTo(afterOrbit)).toBeGreaterThan(0.1);
    const targetBefore = f.orbit.target.clone();
    f.pointer(f.canvas, 'pointerdown', 100, 500, 2);
    f.pointer(document, 'pointermove', 130, 520, -1);
    f.pointer(document, 'pointerup', 130, 520, 2);
    expect(f.orbit.target.distanceTo(targetBefore)).toBeGreaterThan(0.01);
    unbind();
    controls.dispose();
  },
);

it.each(['escape', 'pointercancel', 'blur', 'unmount'])(
  'cancels a real gesture on %s, restoring the object and orbit without a commit',
  (reason) => {
    const f = fixture();
    const controls = new TransformControls(f.camera, f.canvas);
    controls.attach(f.object);
    controls.setSize(0.8);
    f.scene.add(controls);
    const unbind = bindComponentTransform(controls, f.object, 'mcu', f.orbit);
    f.scene.updateMatrixWorld(true);
    const start = f.at(new Vector3(0.6, 0, 0));
    f.pointer(f.canvas, 'pointerdown', start.x, start.y, 0);
    f.pointer(document, 'pointermove', start.x + 30, start.y, -1);
    expect(store.getState().componentDrag).not.toBeNull();
    if (reason === 'escape') fireEvent.keyDown(window, { key: 'Escape' });
    else if (reason === 'unmount') unbind();
    else window.dispatchEvent(new Event(reason));
    expect(store.getState().componentDrag).toBeNull();
    expect(f.object.position.toArray()).toEqual(component().position);
    expect(f.orbit.enabled).toBe(true);
    f.pointer(document, 'pointerup', start.x + 30, start.y, 0);
    expect(store.getState().undoHistory).toHaveLength(0);
    unbind();
    controls.dispose();
  },
);

it('cleans up geometry and native listeners under StrictMode, mode changes and library navigation', () => {
  const f = fixture();
  mock.state = {
    scene: f.scene,
    camera: f.camera,
    gl: { domElement: f.canvas },
    controls: f.orbit,
    invalidate: vi.fn(),
  };
  const errors = vi.spyOn(console, 'error');
  const view = render(
    <StrictMode>
      <ComponentTransformControls />
    </StrictMode>,
  );
  const gizmos = () =>
    f.scene.children.filter((child) => child.name === 'component-translation-gizmo');
  expect(gizmos()).toHaveLength(1);
  const old = gizmos()[0] as TransformControls;
  const cleanup = vi.spyOn(old, 'dispose');
  act(() => store.getState().setViewMode('exploded'));
  expect(cleanup).toHaveBeenCalledOnce();
  expect(gizmos()).toHaveLength(1);
  act(() => library.getState().navigate('components'));
  expect(gizmos()).toHaveLength(0);
  act(() => library.getState().navigate('design'));
  expect(gizmos()).toHaveLength(1);
  view.unmount();
  expect(gizmos()).toHaveLength(0);
  f.pointer(f.canvas, 'pointerdown', 350, 300, 0);
  expect(store.getState().componentDrag).toBeNull();
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});

it.each([0, 1, 2])(
  'constrains native pointer movement to axis %i and preserves orientation and scale',
  (axis) => {
    const f = fixture();
    f.camera.position.copy(f.object.position).add(new Vector3(10, 10, 10));
    f.orbit.update();
    f.object.rotation.set(0.1, 0.4, 0.2);
    f.object.scale.set(1.1, 1.1, 1.1);
    const rotation = f.object.quaternion.clone(),
      scale = f.object.scale.clone();
    const controls = new TransformControls(f.camera, f.canvas);
    controls.setSize(0.8);
    controls.setSpace('world');
    controls.attach(f.object);
    f.scene.add(controls);
    const unbind = bindComponentTransform(controls, f.object, 'mcu', f.orbit);
    f.scene.updateMatrixWorld(true);
    const factor =
      (f.object.position.distanceTo(f.camera.position) *
        1.9 *
        Math.tan((Math.PI * f.camera.fov) / 360) *
        0.8) /
      7;
    const offset = new Vector3().setComponent(axis, 0.65 * factor);
    const start = f.at(offset),
      end = f.at(offset.clone().setComponent(axis, offset.getComponent(axis) + 1));
    const before = [...component().position];
    f.pointer(f.canvas, 'pointermove', start.x, start.y, -1);
    f.scene.updateMatrixWorld(true);
    f.pointer(f.canvas, 'pointerdown', start.x, start.y, 0);
    expect(f.orbit.enabled).toBe(false);
    f.pointer(document, 'pointermove', end.x, end.y, -1);
    f.pointer(document, 'pointerup', end.x, end.y, 0);
    component().position.forEach((n, i) => expect(n).toBeCloseTo(before[i] + (i === axis ? 1 : 0)));
    expect(f.object.quaternion.toArray()).toEqual(rotation.toArray());
    expect(f.object.scale).toEqual(scale);
    unbind();
    controls.dispose();
  },
);

it('rejects an out-of-board drag and retains the last valid preview', () => {
  store.getState().setPlacementMode('board');
  const f = fixture();
  const controls = new TransformControls(f.camera, f.canvas);
  controls.attach(f.object);
  controls.setSize(0.8);
  f.scene.add(controls);
  const unbind = bindComponentTransform(controls, f.object, 'mcu', f.orbit);
  f.scene.updateMatrixWorld(true);
  const start = f.at(new Vector3(0.6, 0, 0));
  const history = store.getState().undoHistory.length;
  f.pointer(f.canvas, 'pointerdown', start.x, start.y, 0);
  f.pointer(document, 'pointermove', start.x + 20, start.y, -1);
  const valid = f.object.position.clone();
  f.pointer(document, 'pointermove', start.x + 500, start.y, -1);
  expect(store.getState().transformError).toContain('PCB outline');
  expect(f.object.position).toEqual(valid);
  f.pointer(document, 'pointerup', start.x + 500, start.y, 0);
  expect(component().position).toEqual(valid.toArray());
  expect(store.getState().undoHistory).toHaveLength(history + 1);
  unbind();
  controls.dispose();
});
