import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { HardwareComponent, Project, Vec3 } from '../types/workspace';
import type { BoardConfiguration } from './boardSpecifications';

export type BoardSide = 'top' | 'bottom';
export type Point = { x: number; z: number };
export type BoardOutline =
  | { kind: 'rectangle' }
  | { kind: 'circle' }
  | { kind: 'rounded-rectangle'; radius: number }
  | { kind: 'polygon'; points: Point[] };
export interface BoardLayer {
  id: string;
  name: string;
  kind: 'copper' | 'mechanical';
  side: BoardSide | 'internal' | 'all';
  visible: boolean;
}
export interface Footprint {
  name: string;
  length: number;
  width: number;
  provenance: 'visual-estimate' | 'user-configured';
}
export const finite = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
export const validEntityId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(id);
export function componentFootprint(c: HardwareComponent): Footprint {
  return (
    (c.footprint?.provenance === 'user-configured' ? c.footprint : undefined) ?? {
      name: 'Visual bounds',
      length: c.dimensions[0] * 10,
      width: c.dimensions[2] * 10,
      provenance: 'visual-estimate',
    }
  );
}
export function validFootprint(f: unknown): f is Footprint {
  if (!f || typeof f !== 'object') return false;
  const v = f as Footprint;
  return (
    Object.keys(v).every((k) => ['name', 'length', 'width', 'provenance'].includes(k)) &&
    typeof v.name === 'string' &&
    v.name.length > 0 &&
    v.name.length <= 80 &&
    finite(v.length, 0.1, 200) &&
    finite(v.width, 0.1, 200) &&
    ['visual-estimate', 'user-configured'].includes(v.provenance)
  );
}
export function defaultLayers(count = 2): BoardLayer[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `copper-${i + 1}`,
    name: `Copper ${i + 1}`,
    kind: 'copper',
    side: i === 0 ? 'top' : i === count - 1 ? 'bottom' : 'internal',
    visible: true,
  }));
}
export function normalizeBoard(c: BoardConfiguration): BoardConfiguration {
  return {
    ...structuredClone(c),
    outline: c.outline ?? { kind: 'rounded-rectangle', radius: 1.8 },
    coordinates: c.coordinates ?? {
      units: 'mm',
      origin: { x: 0, z: 0 },
      xDirection: 1,
      zDirection: 1,
    },
    grid: c.grid ?? { enabled: false, spacing: 1 },
    supportedSides: c.supportedSides ?? ['top', 'bottom'],
    stackup: c.stackup ?? defaultLayers(c.layers ?? 2),
    mountingHoles: c.mountingHoles.map((h, i) => ({ ...h, id: h.id ?? `hole-${i + 1}` })),
    restrictedRegions: c.restrictedRegions.map((r, i) => ({
      ...r,
      id: r.id ?? `region-${i + 1}`,
      side: r.side ?? 'all',
    })),
  };
}
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
function onSegment(p: Point, a: Point, b: Point) {
  return (
    Math.abs(cross(a, b, p)) < 1e-8 &&
    p.x >= Math.min(a.x, b.x) - 1e-8 &&
    p.x <= Math.max(a.x, b.x) + 1e-8 &&
    p.z >= Math.min(a.z, b.z) - 1e-8 &&
    p.z <= Math.max(a.z, b.z) + 1e-8
  );
}
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
    onSegment(a, c, d) ||
    onSegment(b, c, d) ||
    onSegment(c, a, b) ||
    onSegment(d, a, b)
  );
}
export function outlinePoints(c: BoardConfiguration): Point[] {
  const o = c.outline ?? { kind: 'rounded-rectangle', radius: 1.8 };
  const x = c.length / 2,
    z = c.width / 2;
  if (o.kind === 'polygon') return o.points;
  if (o.kind === 'rectangle')
    return [
      { x: -x, z: -z },
      { x, z: -z },
      { x, z },
      { x: -x, z },
    ];
  if (o.kind === 'circle')
    return Array.from({ length: 128 }, (_, i) => ({
      x: x * Math.cos((i * Math.PI) / 64),
      z: x * Math.sin((i * Math.PI) / 64),
    }));
  return [
    [x - o.radius, z - o.radius, 0],
    [-x + o.radius, z - o.radius, 90],
    [-x + o.radius, -z + o.radius, 180],
    [x - o.radius, -z + o.radius, 270],
  ].flatMap(([cx, cz, start]) =>
    Array.from({ length: 17 }, (_, i) => ({
      x: cx + o.radius * Math.cos(((start + (i * 90) / 16) * Math.PI) / 180),
      z: cz + o.radius * Math.sin(((start + (i * 90) / 16) * Math.PI) / 180),
    })),
  );
}
export function pointInside(p: Point, c: BoardConfiguration) {
  if (c.outline?.kind === 'circle') return Math.hypot(p.x, p.z) <= c.length / 2 + 1e-8;
  const pts = outlinePoints(c);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i],
      b = pts[j];
    if (onSegment(p, a, b)) return true;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x)
      inside = !inside;
  }
  return inside;
}
function distance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    denom = dx * dx + dz * dz;
  const t = denom ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / denom)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
export function edgeDistance(p: Point, c: BoardConfiguration) {
  if (c.outline?.kind === 'circle') return c.length / 2 - Math.hypot(p.x, p.z);
  const pts = outlinePoints(c);
  return Math.min(...pts.map((a, i) => distance(p, a, pts[(i + 1) % pts.length])));
}
/** Conservative footprint rectangle, including concave outline crossings and edge clearance. */
export function rectangleInside(min: Point, max: Point, c: BoardConfiguration, clearance = 0) {
  const corners = [min, { x: max.x, z: min.z }, max, { x: min.x, z: max.z }];
  if (corners.some((p) => !pointInside(p, c) || edgeDistance(p, c) < clearance - 1e-6))
    return false;
  const pts = outlinePoints(c);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    if (a.x > min.x + 1e-6 && a.x < max.x - 1e-6 && a.z > min.z + 1e-6 && a.z < max.z - 1e-6)
      return false;
    for (let j = 0; j < 4; j++) {
      const p = corners[j],
        q = corners[(j + 1) % 4];
      if (cross(a, b, p) * cross(a, b, q) < -1e-8 && cross(p, q, a) * cross(p, q, b) < -1e-8)
        return false;
      if (Math.min(distance(a, p, q), distance(b, p, q)) < clearance - 1e-6) return false;
    }
  }
  return true;
}
export function validBoardExtensions(c: BoardConfiguration) {
  const o = c.outline;
  if (o) {
    if (!['rectangle', 'circle', 'rounded-rectangle', 'polygon'].includes(o.kind)) return false;
    if (o.kind === 'circle' && c.length !== c.width) return false;
    if (o.kind === 'rounded-rectangle' && !finite(o.radius, 0.01, Math.min(c.length, c.width) / 2))
      return false;
    if (o.kind === 'polygon') {
      const p = o.points;
      if (
        !Array.isArray(p) ||
        p.length < 3 ||
        p.length > 64 ||
        p.some(
          (v) =>
            !v ||
            !finite(v.x, -c.length / 2, c.length / 2) ||
            !finite(v.z, -c.width / 2, c.width / 2),
        )
      )
        return false;
      if (
        Math.abs(
          p.reduce(
            (a, v, i) => a + v.x * p[(i + 1) % p.length].z - p[(i + 1) % p.length].x * v.z,
            0,
          ),
        ) < 0.01
      )
        return false;
      for (let i = 0; i < p.length; i++)
        for (let j = i + 1; j < p.length; j++) {
          if (j === i + 1 || (i === 0 && j === p.length - 1)) continue;
          if (segmentsIntersect(p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length]))
            return false;
        }
    }
  }
  const coord = c.coordinates;
  if (
    coord &&
    (coord.units !== 'mm' ||
      !coord.origin ||
      !finite(coord.origin.x, -200, 200) ||
      !finite(coord.origin.z, -200, 200) ||
      ![1, -1].includes(coord.xDirection) ||
      ![1, -1].includes(coord.zDirection))
  )
    return false;
  if (c.grid && (typeof c.grid.enabled !== 'boolean' || !finite(c.grid.spacing, 0.1, 50)))
    return false;
  if (
    c.supportedSides &&
    (!Array.isArray(c.supportedSides) ||
      !c.supportedSides.length ||
      c.supportedSides.length > 2 ||
      new Set(c.supportedSides).size !== c.supportedSides.length ||
      c.supportedSides.some((s) => !['top', 'bottom'].includes(s)))
  )
    return false;
  if (
    c.stackup &&
    (!Array.isArray(c.stackup) ||
      !c.stackup.length ||
      c.stackup.length > 64 ||
      new Set(c.stackup.map((l) => l?.id)).size !== c.stackup.length ||
      c.stackup.some(
        (l) =>
          !l ||
          !validEntityId(l.id) ||
          typeof l.name !== 'string' ||
          !l.name.length ||
          l.name.length > 80 ||
          !['copper', 'mechanical'].includes(l.kind) ||
          !['top', 'bottom', 'internal', 'all'].includes(l.side) ||
          typeof l.visible !== 'boolean',
      ) ||
      !c.stackup.some((l) => l.kind === 'copper') ||
      (c.layers !== undefined && c.layers !== c.stackup.filter((l) => l.kind === 'copper').length))
  )
    return false;
  for (const items of [c.mountingHoles, c.restrictedRegions]) {
    const ids = items.flatMap((v) => (v.id ? [v.id] : []));
    if (ids.some((id) => !validEntityId(id)) || new Set(ids).size !== ids.length) return false;
  }
  return (
    c.mountingHoles.every(
      (h) => pointInside(h, c) && edgeDistance(h, c) >= h.diameter / 2 - 1e-6,
    ) &&
    c.restrictedRegions.every(
      (r) =>
        (!r.side || ['top', 'bottom', 'all'].includes(r.side)) &&
        rectangleInside(
          { x: r.x - r.length / 2, z: r.z - r.width / 2 },
          { x: r.x + r.length / 2, z: r.z + r.width / 2 },
          c,
        ),
    )
  );
}
export function boardMatrix(board: HardwareComponent) {
  return new Matrix4().compose(
    new Vector3(...board.position),
    new Quaternion().setFromEuler(
      new Euler(...(board.rotation.map((n) => (n * Math.PI) / 180) as Vec3)),
    ),
    new Vector3(1, 1, 1),
  );
}
export function snapPosition(project: Project, position: Vec3): Vec3 {
  const c = project.boardConfiguration,
    b = project.components.find((c) => c.id === 'pcb');
  if (!c?.grid?.enabled || !b) return position;
  const local = new Vector3(...position).applyMatrix4(boardMatrix(b).invert());
  const origin = c.coordinates?.origin ?? { x: 0, z: 0 };
  for (const axis of ['x', 'z'] as const)
    local[axis] =
      (Math.round((local[axis] * 10 - origin[axis]) / c.grid.spacing) * c.grid.spacing +
        origin[axis]) /
      10;
  return local.applyMatrix4(boardMatrix(b)).toArray() as Vec3;
}
