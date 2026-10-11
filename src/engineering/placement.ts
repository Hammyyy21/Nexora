import { Euler, Vector3 } from 'three';
import { assessPosition, placementBounds, validPosition } from '../lib/transforms';
import type { HardwareComponent, Project, Vec3 } from '../types/workspace';

export interface PlacementSuggestion {
  id: string;
  position: Vec3;
  /** Concept-stage space estimate, not manufacturing clearance. */
  clearanceMm: number;
  reason: string;
}

const footprint = (part: HardwareComponent, board: HardwareComponent) => {
  const box = placementBounds(part, board.position, board);
  return { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z };
};

/** Board-local projected footprint gap; negative means overlap. */
export function footprintGap(
  candidate: HardwareComponent,
  position: Vec3,
  other: HardwareComponent,
  board: HardwareComponent,
): number {
  const a = placementBounds(candidate, position, board),
    b = placementBounds(other, other.position, board);
  const dx = Math.max(a.min.x - b.max.x, b.min.x - a.max.x);
  const dz = Math.max(a.min.z - b.max.z, b.min.z - a.max.z);
  return dx > 0 && dz > 0 ? Math.hypot(dx, dz) : Math.max(dx, dz);
}

/** Suggest visual board regions, never electrical, thermal, antenna or fabrication approval.
 * Candidate positions are evaluated with the existing placement checks, and footprint keepouts.
 * Capped deterministic grid makes recommendations stable and fast enough for the preview UI.
 */
export function suggestPlacements(
  project: Project,
  component: HardwareComponent,
  limit = 3,
): PlacementSuggestion[] {
  if (component.id === 'pcb' || component.fixed || component.type === 'housing' || limit <= 0)
    return [];
  const board = project.components.find((c) => c.id === 'pcb');
  if (!board || board.dimensions[0] <= 0 || board.dimensions[2] <= 0) return [];
  const [width, height, depth] = board.dimensions;
  const f = footprint(component, board);
  const edgeKeepout = Math.max(0.22, (project.boardConfiguration?.edgeClearance ?? 0) / 10); // 2.2 mm concept margin; no plated holes or copper rules encoded.
  const radiusX = width / 2 - f.x / 2 - edgeKeepout;
  const radiusZ = depth / 2 - f.z / 2 - edgeKeepout;
  if (radiusX < 0 || radiusZ < 0) return [];
  const neighbors = project.components.filter(
    (c) => c.id !== component.id && c.id !== 'pcb' && c.type !== 'housing',
  );
  const relatedIds = new Set(
    (project.connections ?? []).flatMap((w) =>
      w.from.componentId === component.id
        ? [w.to.componentId]
        : w.to.componentId === component.id
          ? [w.from.componentId]
          : [],
    ),
  );
  const related = neighbors.filter((c) => relatedIds.has(c.id));
  const steps = 17; // <= 289 possible sites
  const options: { position: Vec3; score: number; clearance: number; nearby: boolean }[] = [];
  const transform = new Euler(...(board.rotation.map((n) => (n * Math.PI) / 180) as Vec3));
  for (let i = 0; i < steps; i++)
    for (let j = 0; j < steps; j++) {
      const x = -radiusX + (2 * radiusX * i) / (steps - 1);
      const z = -radiusZ + (2 * radiusZ * j) / (steps - 1);
      // Mount the box above the board's top face, retaining its current rotation.
      const pos = new Vector3(x, height / 2 + f.y / 2 + 0.04, z)
        .applyEuler(transform)
        .add(new Vector3(...board.position));
      const candidate: Vec3 = [
        Number(pos.x.toFixed(4)),
        Number(pos.y.toFixed(4)),
        Number(pos.z.toFixed(4)),
      ];
      if (!validPosition(candidate)) continue;
      const assessment = assessPosition(project, component, candidate);
      if (!assessment.valid || assessment.warnings.length) continue;
      const gaps = neighbors.map((n) => footprintGap(component, candidate, n, board));
      const edgeClearance = Math.min(
        width / 2 - Math.abs(x) - f.x / 2,
        depth / 2 - Math.abs(z) - f.z / 2,
      );
      const clearance = Math.min(edgeClearance, ...(gaps.length ? gaps : [edgeClearance]));
      if (clearance < Math.max(0.22, (project.boardConfiguration?.componentSpacing ?? 0) / 10))
        continue; // minimum suggested 2.2 mm footprint space
      const relatedDistance = related.length
        ? Math.min(
            ...related.map((p) =>
              Math.hypot(candidate[0] - p.position[0], candidate[2] - p.position[2]),
            ),
          )
        : 0;
      // Prefer useful empty areas. Nearness reduces possible *visual* path length, not signal validity.
      const score =
        Math.min(clearance, 1.4) * 3 -
        (related.length ? relatedDistance * 0.4 : 0) -
        Math.hypot(x, z) * 0.02;
      options.push({ position: candidate, score, clearance, nearby: related.length > 0 });
    }
  options.sort(
    (a, b) => b.score - a.score || a.position[0] - b.position[0] || a.position[2] - b.position[2],
  );
  const chosen: typeof options = [];
  for (const option of options) {
    if (
      chosen.every(
        (picked) =>
          Math.hypot(
            picked.position[0] - option.position[0],
            picked.position[2] - option.position[2],
          ) >= 0.8,
      )
    )
      chosen.push(option);
    if (chosen.length >= Math.min(limit, 3)) break;
  }
  return chosen.map((p, index) => ({
    id: `suggestion-${index + 1}`,
    position: p.position,
    clearanceMm: Math.round(p.clearance * 10),
    reason: p.nearby
      ? 'Open footprint near a logically connected component (routing unverified)'
      : 'Available board space with room around other parts',
  }));
}
