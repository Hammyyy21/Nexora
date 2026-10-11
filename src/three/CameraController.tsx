import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Box3, MOUSE, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { gsap } from 'gsap';
import { useWorkspaceStore as useStore } from '../store/useWorkspaceStore';
import { cameraFrame } from '../lib/camera';
export function CameraController() {
  const ref = useRef<OrbitControlsImpl>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const scene = useThree((s) => s.scene);
  const request = useStore((s) => s.cameraRequest);
  const tool = useStore((s) => s.activeTool);
  const reduced = useStore((s) => s.reducedMotion);
  const appliedRequest = useRef<{ request: number; camera: typeof camera } | null>(null);
  // StrictMode replays mount effects; allow its second setup to restart the killed tween.
  useEffect(
    () => () => {
      appliedRequest.current = null;
    },
    [],
  );
  useEffect(() => {
    const control = ref.current;
    if (!control || size.width <= 0 || size.height <= 0) return;
    // Layout changes update projection through R3F, but must not reset an orbited pose.
    if (appliedRequest.current?.request === request && appliedRequest.current.camera === camera)
      return;
    appliedRequest.current = { request, camera };
    const s = useStore.getState();
    const geometryPoints: Vector3[] = [];
    for (const c of s.currentProject.components) {
      if (!c.visible || (s.cameraView === 'focus' && c.id !== s.selectedComponentId)) continue;
      const object = scene?.getObjectByName(`geometry:${c.id}`);
      if (!object) continue;
      object.updateWorldMatrix(true, true);
      const bounds = new Box3().setFromObject(object, true);
      if (bounds.isEmpty()) continue;
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) geometryPoints.push(new Vector3(x, y, z));
    }
    const { target, position, points, right, up } = cameraFrame(
      s.placement ? [...s.currentProject.components, s.placement] : s.currentProject.components,
      s.activeViewMode,
      s.cameraView,
      s.selectedComponentId,
      size.width / Math.max(1, size.height),
      camera instanceof PerspectiveCamera ? camera.getEffectiveFOV() : 37,
      camera.position.clone().sub(control.target),
      geometryPoints,
    );
    // Keep the active projection. Orthographic framing changes zoom, not camera type.
    if (camera instanceof OrthographicCamera) {
      const offsets = points.map((p) => p.clone().sub(target));
      const width = Math.max(0.1, ...offsets.map((p) => Math.abs(p.dot(right)) * 2.56));
      const height = Math.max(0.1, ...offsets.map((p) => Math.abs(p.dot(up)) * 2.56));
      camera.zoom = Math.min(
        (camera.right - camera.left) / width,
        (camera.top - camera.bottom) / height,
      );
    }
    const distance = position.distanceTo(target);
    control.maxDistance = Math.max(300, distance * 2);
    camera.far = Math.max(camera.far, distance * 4);
    camera.updateProjectionMatrix();
    timeline.current?.kill();
    // Flush residual orbit damping before the timeline owns camera and target.
    control.enableDamping = false;
    control.update();
    control.enableDamping = true;
    control.enabled = false;
    const t = gsap.timeline({
      onUpdate: () => {
        camera.lookAt(control.target);
      },
      onComplete: () => {
        control.enabled = !useStore.getState().componentDrag;
        control.update();
      },
    });
    timeline.current = t;
    t.to(
      camera.position,
      {
        x: position.x,
        y: position.y,
        z: position.z,
        duration: reduced ? 0 : 0.75,
        ease: 'power3.inOut',
      },
      0,
    ).to(
      control.target,
      { x: target.x, y: target.y, z: target.z, duration: reduced ? 0 : 0.75, ease: 'power3.inOut' },
      0,
    );
    return () => {
      t.kill();
      control.enabled = !useStore.getState().componentDrag;
    };
  }, [request, camera, scene, reduced, size.width, size.height]);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const interrupt = () => {
      timeline.current?.kill();
      if (ref.current) ref.current.enabled = !useStore.getState().componentDrag;
    };
    gl.domElement.addEventListener('pointerdown', interrupt, true);
    gl.domElement.addEventListener('wheel', interrupt, { capture: true, passive: true });
    return () => {
      gl.domElement.removeEventListener('pointerdown', interrupt, true);
      gl.domElement.removeEventListener('wheel', interrupt, true);
    };
  }, [gl]);
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      enableDamping
      dampingFactor={0.09}
      minDistance={2}
      maxDistance={300}
      maxPolarAngle={Math.PI * 0.88}
      mouseButtons={{
        LEFT: tool === 'pan' ? MOUSE.PAN : MOUSE.ROTATE,
        MIDDLE: MOUSE.DOLLY,
        RIGHT: MOUSE.PAN,
      }}
    />
  );
}
