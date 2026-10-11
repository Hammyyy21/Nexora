import { gsap } from 'gsap';
import type { Object3D } from 'three';
import type { TransformControls, OrbitControls } from 'three-stdlib';
import { useWorkspaceStore as store } from '../store/useWorkspaceStore';
import { canonicalPosition } from '../lib/transforms';
import { displayedPosition } from '../lib/project';
import type { Vec3 } from '../types/workspace';

// three-stdlib exposes these events/properties at runtime, but its declarations
// still use Object3D's event map and mark the gesture fields private.
type TransformEvents = {
  dragging: boolean;
  axis: string | null;
  addEventListener(type: 'mouseDown' | 'mouseUp' | 'objectChange', listener: () => void): void;
  removeEventListener(type: 'mouseDown' | 'mouseUp' | 'objectChange', listener: () => void): void;
};

// No React roots or project writes during pointer movement. Commit once on release.
export function bindComponentTransform(
  controls: TransformControls,
  object: Object3D,
  id: string,
  orbit: Pick<OrbitControls, 'enabled'> | null,
) {
  const handle = controls as unknown as TransformEvents;
  let active = false;
  let orbitEnabled = true;
  const restorePosition = () => {
    const s = store.getState();
    const c = s.currentProject.components.find((item) => item.id === id);
    if (c) object.position.set(...displayedPosition(c, s.activeViewMode));
  };
  const release = () => {
    active = false;
    handle.dragging = false;
    handle.axis = null;
    if (orbit) orbit.enabled = orbitEnabled;
  };
  const cancel = () => {
    if (!active) return;
    release();
    store.getState().cancelComponentDrag();
    restorePosition();
  };
  const start = () => {
    if (!store.getState().beginComponentDrag(id)) {
      handle.dragging = false;
      return;
    }
    active = true;
    orbitEnabled = orbit?.enabled ?? true;
    if (orbit) orbit.enabled = false;
    gsap.killTweensOf(object.position);
    restorePosition();
  };
  const change = () => {
    if (!active) return;
    const s = store.getState();
    const c = s.currentProject.components.find((item) => item.id === id)!;
    s.previewComponentDrag(
      canonicalPosition(object.position.toArray() as Vec3, c, s.activeViewMode),
    );
    const preview = store.getState().componentDrag;
    if (preview)
      object.position.set(
        ...displayedPosition({ ...c, position: preview.position }, s.activeViewMode),
      );
  };
  const finish = () => {
    if (!active) return;
    release();
    store.getState().finishComponentDrag();
    restorePosition();
  };
  const unsubscribe = store.subscribe((s) => {
    if (active && (!s.componentDrag || s.componentDrag.project !== s.currentProject)) cancel();
  });
  const escape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && active) {
      e.preventDefault();
      e.stopImmediatePropagation();
      cancel();
    }
  };
  handle.addEventListener('mouseDown', start);
  handle.addEventListener('objectChange', change);
  handle.addEventListener('mouseUp', finish);
  window.addEventListener('blur', cancel);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', escape, true);
  return () => {
    unsubscribe();
    cancel();
    handle.removeEventListener('mouseDown', start);
    handle.removeEventListener('objectChange', change);
    handle.removeEventListener('mouseUp', finish);
    window.removeEventListener('blur', cancel);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', escape, true);
  };
}
