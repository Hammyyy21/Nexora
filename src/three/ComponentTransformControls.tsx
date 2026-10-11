import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { TransformControls, type OrbitControls } from 'three-stdlib';
import { useWorkspaceStore as useStore } from '../store/useWorkspaceStore';
import { useLibraryStore } from '../catalog/store';
import { movable } from '../lib/transforms';
import { bindComponentTransform } from './transformBinding';

export function ComponentTransformControls() {
  const { camera, gl, scene, controls: orbit, invalidate } = useThree();
  const id = useStore((s) => s.selectedComponentId);
  const mode = useStore((s) => s.activeViewMode);
  const enabled = useStore((s) => {
    const c = s.currentProject.components.find((item) => item.id === s.selectedComponentId);
    return s.dragMode && !s.placement && !!c?.visible && movable(c);
  });
  const visible = useLibraryStore((s) => s.workspace !== 'components');
  useEffect(() => {
    // Keep the release click from selecting through the gizmo. A new gesture clears it.
    const reset = () => {
      if (!useStore.getState().componentDrag) useStore.setState({ transformPointerActive: false });
    };
    gl.domElement.addEventListener('pointerdown', reset, true);
    return () => gl.domElement.removeEventListener('pointerdown', reset, true);
  }, [gl]);
  useEffect(() => {
    if (!id || !enabled || !visible) return;
    const object = scene.getObjectByName(id);
    if (!object) return;
    const touchAction = gl.domElement.style.touchAction;
    const controls = new TransformControls(camera, gl.domElement);
    controls.name = 'component-translation-gizmo';
    controls.setMode('translate');
    controls.setSpace('world');
    controls.setSize(0.8);
    controls.attach(object);
    scene.add(controls);
    const unbind = bindComponentTransform(controls, object, id, orbit as OrbitControls | null);
    invalidate();
    return () => {
      unbind();
      controls.detach();
      scene.remove(controls);
      controls.dispose();
      gl.domElement.style.touchAction = touchAction;
      invalidate();
    };
  }, [camera, gl, scene, orbit, id, mode, enabled, visible, invalidate]);
  return null;
}
