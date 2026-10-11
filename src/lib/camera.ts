import { Box3, Euler, MathUtils, Quaternion, Vector3 } from 'three';
import type { CameraView, HardwareComponent, ViewMode } from '../types/workspace';
import { displayedPosition } from './project';

/** Includes package leads and the service cover, without storing Three.js objects in state. */
export function componentCorners(component: HardwareComponent, mode: ViewMode): Vector3[] {
  const [w, h, d] = component.dimensions;
  const allowance = component.type === 'board' ? 0 : 0.22;
  const low = new Vector3(-w / 2 - allowance, -h / 2 - allowance, -d / 2 - allowance);
  const high = new Vector3(w / 2 + allowance, h / 2 + allowance, d / 2 + allowance);
  if (component.type === 'housing') {
    low.y = -0.36;
    high.y = 1.2;
  }
  const rotation = new Quaternion().setFromEuler(
    new Euler(...(component.rotation.map(MathUtils.degToRad) as [number, number, number])),
  );
  const center = new Vector3(...displayedPosition(component, mode));
  return [low.x, high.x].flatMap((x) =>
    [low.y, high.y].flatMap((y) =>
      [low.z, high.z].map((z) => new Vector3(x, y, z).applyQuaternion(rotation).add(center)),
    ),
  );
}

export function cameraFrame(
  components: HardwareComponent[],
  mode: ViewMode,
  view: CameraView,
  selectedId: string | null,
  aspect: number,
  fov = 37,
  fitDirection?: Vector3,
  geometryPoints: Vector3[] = [],
) {
  const selected = components.find((c) => c.id === selectedId && c.visible);
  const focused = view === 'focus' && selected;
  const visible = focused ? [selected] : components.filter((c) => c.visible);
  const points = [...visible.flatMap((c) => componentCorners(c, mode)), ...geometryPoints].filter(
    (p) => p.toArray().every(Number.isFinite),
  );
  const bounds = new Box3().setFromPoints(
    points.length ? points : [new Vector3(-1, -1, -1), new Vector3(1, 1, 1)],
  );
  const target = focused
    ? new Vector3(...displayedPosition(selected, mode))
    : bounds.getCenter(new Vector3());
  const direction = (
    view === 'fit' && fitDirection && fitDirection.lengthSq() > 1e-8
      ? fitDirection.clone()
      : view === 'top'
        ? new Vector3(0, 1, 0.001)
        : view === 'front'
          ? new Vector3(0, 0.14, 1)
          : new Vector3(1.05, 1.3, 1.5)
  ).normalize();
  const worldUp = Math.abs(direction.y) > 0.99999 ? new Vector3(0, 0, -1) : new Vector3(0, 1, 0);
  const right = new Vector3().crossVectors(worldUp, direction).normalize();
  const up = new Vector3().crossVectors(direction, right).normalize();
  const vertical = Math.tan(MathUtils.degToRad(fov / 2));
  const horizontal = vertical * Math.max(0.01, Number.isFinite(aspect) ? aspect : 1);
  let distance = focused ? 5 : 10;
  for (const p of points) {
    const offset = p.clone().sub(target);
    const depth = offset.dot(direction);
    distance = Math.max(
      distance,
      depth + (Math.abs(offset.dot(up)) * 1.28) / vertical,
      depth + (Math.abs(offset.dot(right)) * 1.28) / horizontal,
    );
  }
  return {
    target,
    position: target.clone().addScaledVector(direction, distance),
    points,
    right,
    up,
  };
}
