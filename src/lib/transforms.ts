import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { boardSpecification } from '../workspace/boardSpecifications';
import type { HardwareComponent, Project, Vec3, ViewMode } from '../types/workspace';

export const MM_PER_UNIT = 10;
export const POSITION_LIMIT = 20;
export const validPosition = (value: unknown): value is Vec3 =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= POSITION_LIMIT);
export const movable = (c: HardwareComponent) => c.id !== 'pcb' && c.type !== 'housing' && !c.fixed;
export function canonicalPosition(position: Vec3, c: HardwareComponent, mode: ViewMode): Vec3 {
  return position.map((n, i) => {
    const value = n - (mode === 'exploded' ? c.explodedOffset[i] : 0);
    // Offset subtraction must not turn an untouched axis into a spurious edit.
    return Math.abs(value - c.position[i]) < 1e-10 ? c.position[i] : value;
  }) as Vec3;
}
function matrix(c: HardwareComponent, position = c.position) {
  return new Matrix4().compose(
    new Vector3(...position),
    new Quaternion().setFromEuler(
      new Euler(...(c.rotation.map((n) => (n * Math.PI) / 180) as Vec3)),
    ),
    new Vector3(1, 1, 1),
  );
}
function bounds(c: HardwareComponent, position: Vec3, relativeTo?: Matrix4) {
  const transform = matrix(c, position);
  if (relativeTo) transform.premultiply(relativeTo);
  const box = new Box3();
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1]) {
        box.expandByPoint(
          new Vector3(
            (x * c.dimensions[0]) / 2,
            (y * c.dimensions[1]) / 2,
            (z * c.dimensions[2]) / 2,
          ).applyMatrix4(transform),
        );
      }
  return box;
}
/** Full rotated box projected into a board's local coordinates. */
export function placementBounds(c: HardwareComponent, position: Vec3, board?: HardwareComponent) {
  return bounds(c, position, board ? matrix(board).invert() : undefined);
}
export interface PositionAssessment {
  valid: boolean;
  error?: string;
  warnings: string[];
}
export function assessPosition(
  project: Project,
  c: HardwareComponent,
  position: Vec3,
): PositionAssessment {
  const warnings: string[] = [];
  if (!validPosition(position))
    return { valid: false, error: 'Enter finite coordinates between −200 and 200 mm.', warnings };
  const board = project.components.find((item) => item.id === 'pcb');
  if (board) {
    const box = bounds(c, position, matrix(board).invert());
    const spec = boardSpecification(project, board);
    const edge = (spec?.edgeClearance.value ?? 0) / MM_PER_UNIT;
    const halfX = board.dimensions[0] / 2 - edge;
    const halfZ = board.dimensions[2] / 2 - edge;
    const outside =
      box.min.x < -halfX - 1e-6 || box.max.x > halfX + 1e-6 ||
      box.min.z < -halfZ - 1e-6 || box.max.z > halfZ + 1e-6;
    // Rounded concept outline: reject AABB corners outside its 1.8 mm corner radius.
    const radius = Math.max(0, 0.18 - edge);
    const roundedCorner = [box.min.x, box.max.x].some((x) => [box.min.z, box.max.z].some((z) =>
      Math.hypot(Math.max(0, Math.abs(x) - (halfX - radius)), Math.max(0, Math.abs(z) - (halfZ - radius))) > radius + 1e-6));
    const hole = spec?.mountingHoles.value?.some((h) => {
      const x = h.x / MM_PER_UNIT, z = h.z / MM_PER_UNIT;
      return Math.hypot(x - Math.max(box.min.x, Math.min(x, box.max.x)), z - Math.max(box.min.z, Math.min(z, box.max.z))) < h.diameter / (2 * MM_PER_UNIT) - 1e-6;
    });
    const restricted = spec?.restrictedRegions.value?.some((r) =>
      box.max.x > (r.x - r.length / 2) / MM_PER_UNIT && box.min.x < (r.x + r.length / 2) / MM_PER_UNIT &&
      box.max.z > (r.z - r.width / 2) / MM_PER_UNIT && box.min.z < (r.z + r.width / 2) / MM_PER_UNIT);
    if (hole || restricted || (!outside && roundedCorner)) {
      const message = hole ? 'Component footprint intersects a mounting hole.' : restricted
        ? 'Component footprint intersects a configured restricted region.' : 'Component footprint crosses a rounded PCB corner.';
      if (project.placementMode === 'board') return { valid: false, error: message, warnings };
      warnings.push(message);
    }
    const below = box.min.y < board.dimensions[1] / 2 - 1e-6;
    if (project.placementMode === 'board' && (outside || below))
      return {
        valid: false,
        warnings,
        error: outside
          ? 'Keep the whole component inside the PCB outline, or choose Free workspace.'
          : 'Keep the component above the PCB surface, or choose Free workspace.',
      };
    if (outside)
      warnings.push('Outside the PCB outline; Free workspace allows off-board visual placement.');
    if (below && !outside) warnings.push('Component overlaps or sits below the PCB surface.');
  } else if (project.placementMode === 'board')
    return { valid: false, error: 'No PCB bounds are available for board placement.', warnings };
  const box = bounds(c, position);
  const overlaps = project.components
    .filter(
      (other) =>
        other.id !== c.id && other.id !== 'pcb' && other.type !== 'housing' && other.visible,
    )
    .filter((other) => {
      const b = bounds(other, other.position);
      return (['x', 'y', 'z'] as const).every(
        (axis) => box.max[axis] > b.min[axis] + 1e-6 && box.min[axis] < b.max[axis] - 1e-6,
      );
    });
  if (overlaps.length)
    warnings.push(
      `Possible overlap with ${overlaps.map((other) => other.name).join(', ')}. Bounds are approximate.`,
    );
  return { valid: true, warnings };
}
