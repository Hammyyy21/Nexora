import type { Project } from '../types/workspace';
import { electricalNets, endpointKey, logicalPorts } from '../schematic/model';
import { sourceRevision } from '../firmware/model';
import { placedPads } from './pcbLayout';
import { segmentsIntersect, type Point } from './boardGeometry';

/** B2 is a deterministic, advisory *unrouted* layout check, NOT an autorouter or fabrication DRC. */
export const EXAMPLE_COPPER_CLEARANCE_MM = 0.25;
const MAX_REVIEW_PADS = 256;
const MAX_AIRWIRES = 256;
const MAX_CLEARANCE_FINDINGS = 128;
export type PlacedPad = ReturnType<typeof placedPads>[number];
export type ConnectedPad = PlacedPad & {
  netId: string | null;
  netName: string | null;
  terminalStatus: 'unassigned' | 'unconnected' | 'net';
};
export interface Airwire {
  id: string;
  netId: string;
  netName: string;
  from: ConnectedPad;
  to: ConnectedPad;
  requiresLayerTransition: boolean;
}
export interface PCBCheck {
  id: string;
  kind: 'overlap' | 'clearance' | 'unknown-net' | 'layer-side' | 'layer-missing' | 'unrouted';
  componentIds: string[];
  title: string;
  detail: string;
  severity: 'warning' | 'info';
}

function pointInPolygon(p: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x)
      inside = !inside;
  }
  return inside;
}
function segmentDistance(a: Point, b: Point, p: Point) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const denom = dx * dx + dz * dz;
  const t = denom ? Math.max(0, Math.min(1, ((p.x-a.x)*dx + (p.z-a.z)*dz) / denom)) : 0;
  return Math.hypot(p.x-a.x-t*dx, p.z-a.z-t*dz);
}
/** Min perimeter distance in mm for convex user-authored pad polygons (circles approximated by 24 vertices). */
export function padGap(a: Pick<PlacedPad, 'outline'>, b: Pick<PlacedPad, 'outline'>): number {
  const p = a.outline, q = b.outline;
  if (!p.length || !q.length) return Number.POSITIVE_INFINITY;
  if (pointInPolygon(p[0], q) || pointInPolygon(q[0], p)) return 0;
  let closest = Infinity;
  for (let i = 0; i < p.length; i++) {
    const start = p[i], end = p[(i+1)%p.length];
    for (let j = 0; j < q.length; j++) {
      const other = q[j], next = q[(j+1)%q.length];
      if (segmentsIntersect(start, end, other, next)) return 0;
      closest = Math.min(closest,
        segmentDistance(start, end, other), segmentDistance(start, end, next),
        segmentDistance(other, next, start), segmentDistance(other, next, end));
    }
  }
  return closest;
}

export function buildPCBConnectivity(project: Project, clearanceMm = EXAMPLE_COPPER_CLEARANCE_MM) {
  const nets = electricalNets(project).map((net) => ({
    ...net,
    id: `net-${sourceRevision([...net.terminals].sort().join('|'))}`,
  }));
  const byTerminal = new Map(nets.flatMap((net) => net.terminals.map((terminal) => [terminal, net] as const)));
  const components = new Map(project.components.map((component) => [component.id, component]));
  const pads: ConnectedPad[] = placedPads(project).map((pad) => {
    const terminal = pad.portId && components.get(pad.componentId) &&
      logicalPorts(components.get(pad.componentId)!).some((port) => port.id === pad.portId);
    const net = terminal ? byTerminal.get(endpointKey({ componentId: pad.componentId, portId: pad.portId! })) : undefined;
    return { ...pad, netId: net?.id ?? null, netName: net?.name ?? null,
      terminalStatus: !terminal ? 'unassigned' : net ? 'net' : 'unconnected' };
  });
  const checks: PCBCheck[] = [];
  const unassigned = pads.filter((pad) => pad.terminalStatus === 'unassigned');
  const disconnected = pads.filter((pad) => pad.terminalStatus === 'unconnected');
  if (unassigned.length || disconnected.length) checks.push({
    id: 'pcb-net-bindings', kind: 'unknown-net', severity: 'info',
    componentIds: [...new Set([...unassigned, ...disconnected].map((pad) => pad.componentId))],
    title: 'PCB pad connectivity is incomplete',
    detail: `${unassigned.length} pad(s) have no assigned terminal; ${disconnected.length} pad(s) are bound to terminals without a schematic net. No net is inferred from physical distance.`,
  });
  for (const pad of pads) {
    if (!pad.layer) checks.push({ id: `pcb-layer:${pad.componentId}:${pad.id}`, kind: 'layer-missing',
      severity: 'warning', componentIds: [pad.componentId], title: `${pad.reference}: pad layer unavailable`,
      detail: `${pad.id} references ${pad.layerId}, which is not an active copper layer.` });
    const component = components.get(pad.componentId);
    if (pad.layer && component && (pad.layer.side === 'top' || pad.layer.side === 'bottom') &&
      pad.layer.side !== (component.side ?? 'top'))
      checks.push({ id: `pcb-side:${pad.componentId}:${pad.id}`, kind: 'layer-side',
        severity: 'warning', componentIds: [pad.componentId], title: `${pad.reference}: pad and component sides differ`,
        detail: `${pad.id} is on ${pad.layer.side} copper while the component is on ${component.side ?? 'top'}. Confirm the intended physical footprint.` });
  }
  const reviewed = pads.slice(0, MAX_REVIEW_PADS);
  const bounds = reviewed.map((pad) => ({
    minX: Math.min(...pad.outline.map((point) => point.x)),
    maxX: Math.max(...pad.outline.map((point) => point.x)),
    minZ: Math.min(...pad.outline.map((point) => point.z)),
    maxZ: Math.max(...pad.outline.map((point) => point.z)),
  }));
  if (pads.length > reviewed.length) checks.push({ id: 'pcb-review-truncated', kind: 'unknown-net',
    severity: 'warning', componentIds: [], title: 'PCB pad review is incomplete',
    detail: `${pads.length - reviewed.length} pad(s) exceed the ${MAX_REVIEW_PADS}-pad interactive check limit. No complete copper clearance assessment is available.` });
  // Compare only pads that share a physical copper layer. Pads on other layers are not shorted
  // by 2D overlap alone; vias, plated holes and traces have not yet been modeled.
  let clearanceFindings = 0;
  outer: for (let i = 0; i < reviewed.length; i++) for (let j = i+1; j < reviewed.length; j++) {
    if (clearanceFindings >= MAX_CLEARANCE_FINDINGS) break outer;
    const a = reviewed[i], b = reviewed[j];
    if (!a.layer || !b.layer || a.layerId !== b.layerId || (a.netId && a.netId === b.netId)) continue;
    const x = bounds[i], y = bounds[j];
    if (x.maxX + clearanceMm < y.minX || y.maxX + clearanceMm < x.minX ||
      x.maxZ + clearanceMm < y.minZ || y.maxZ + clearanceMm < x.minZ) continue;
    const gap = padGap(a, b);
    if (gap >= clearanceMm - 1e-7) continue;
    const assigned = Boolean(a.netId && b.netId && a.netId !== b.netId);
    const overlapping = gap < 1e-7;
    const name = `${a.reference}/${a.id} ↔ ${b.reference}/${b.id}`;
    clearanceFindings++;
    checks.push({
      id: `pcb-gap:${a.componentId}:${a.id}:${b.componentId}:${b.id}`,
      kind: assigned ? (overlapping ? 'overlap' : 'clearance') : 'unknown-net',
      severity: 'warning', componentIds: [...new Set([a.componentId, b.componentId])],
      title: `${name}: ${assigned ? overlapping ? 'possible copper short' : 'pad clearance below example threshold' : 'unverified pad separation'}`.slice(0, 400),
      detail: `${gap.toFixed(3)} mm estimated copper separation on ${a.layer.name}; provisional ${clearanceMm} mm review threshold. ${assigned ? `Different schematic nets (${a.netName}, ${b.netName}).` : 'One or both pads lack a connected schematic net.'} No fabrication DRC has run.`.slice(0, 3000),
    });
  }
  if (clearanceFindings === MAX_CLEARANCE_FINDINGS) checks.push({
    id: 'pcb-clearance-truncated', kind: 'clearance', severity: 'warning', componentIds: [],
    title: 'PCB clearance findings limited',
    detail: `Only the first ${MAX_CLEARANCE_FINDINGS} close pad pairs were reported. The clearance review is incomplete.`,
  });
  // Deterministic shortest spanning tree per net: dashed *airwires*, never copper routing.
  const airwires: Airwire[] = [];
  for (const net of nets) {
    const matching = pads.filter((pad) => pad.netId === net.id && pad.layer).sort((a,b) =>
      `${a.componentId}/${a.id}`.localeCompare(`${b.componentId}/${b.id}`));
    const pending = matching.slice(0, Math.max(0, MAX_AIRWIRES - airwires.length + 1));
    if (pending.length < 2) continue;
    const visited = [pending.shift()!];
    while (pending.length) {
      let bestDistance = Infinity, bestFrom = 0, bestTo = 0;
      for (let i = 0; i < visited.length; i++) for (let j = 0; j < pending.length; j++) {
        const dist = Math.hypot(visited[i].center.x-pending[j].center.x,
          visited[i].center.z-pending[j].center.z);
        if (dist < bestDistance - 1e-8) { bestDistance = dist; bestFrom = i; bestTo = j; }
      }
      const from = visited[bestFrom], to = pending.splice(bestTo, 1)[0];
      if (airwires.length < MAX_AIRWIRES) airwires.push({ id: `airwire:${net.id}:${from.componentId}:${from.id}:${to.componentId}:${to.id}`,
        netId: net.id, netName: net.name, from, to,
        requiresLayerTransition: from.layerId !== to.layerId });
      visited.push(to);
    }
  }
  if (airwires.length === MAX_AIRWIRES) checks.push({
    id: 'pcb-airwires-truncated', kind: 'unrouted', severity: 'warning', componentIds: [],
    title: 'PCB connectivity guides may be incomplete',
    detail: `Only the first ${MAX_AIRWIRES} airwires are displayed. This is not a complete route status.`,
  });
  if (airwires.length)
    checks.push({ id: 'pcb-unrouted', kind: 'unrouted', severity: 'info', componentIds: [],
      title: `${airwires.length} unrouted PCB airwire(s)`,
      detail: 'Dashed connectivity guides are inferred from schematic nets and explicit pad bindings, not manufactured traces. Inter-layer connections require vias not yet modeled.' });
  return { pads, nets, airwires, checks, clearanceMm };
}
