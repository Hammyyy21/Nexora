import type { Project, SchematicConnection, Vec3 } from '../types/workspace';
import { reviewDesign } from '../engineering/insights';
import { electricalNets, endpointKey, logicalPorts } from '../schematic/model';
import { getPart } from '../catalog/catalog';
import { hardwareBuildState } from '../catalog/compatibility';
import { sourceRevision, buildStatus } from '../firmware/model';
import { defaultSourceFor } from '../firmware/store';
import { componentFootprint, normalizeBoard, type Footprint } from '../workspace/boardGeometry';
import {
  presetBoardConfiguration,
  type BoardConfiguration,
} from '../workspace/boardSpecifications';
export type EntityRef = { kind: 'component' | 'net' | 'region' | 'firmware'; id: string };
export type FindingClass =
  'verified-issue' | 'potential-issue' | 'missing-information' | 'passed-specific-check';
export interface InspectionFinding {
  id: string;
  classification: FindingClass;
  title: string;
  details: string;
  remedy: string;
  entities: EntityRef[];
  source?: string;
}
export const classificationLabel: Record<FindingClass, string> = {
  'verified-issue': 'Verified issue',
  'potential-issue': 'Potential issue',
  'missing-information': 'Missing information',
  'passed-specific-check': 'Passed specific check',
};
export function workspaceNets(p: Project) {
  return electricalNets(p).map((n) => ({
    ...n,
    id: `net-${sourceRevision([...n.terminals].sort().join('|'))}`,
  }));
}
export function inspectProject(
  p: Project,
  source = p.firmwareSource ?? defaultSourceFor(p.id),
): InspectionFinding[] {
  const nets = workspaceNets(p);
  const findings = reviewDesign(p).map((f) => {
    const net = nets.find((n) => f.id.endsWith(`:${n.name}`));
    const entities: EntityRef[] = [];
    if (f.componentId) entities.push({ kind: 'component', id: f.componentId });
    if (net) entities.push({ kind: 'net', id: net.id });
    if (!entities.length && p.components.some((c) => c.id === 'pcb'))
      entities.push({ kind: 'component', id: 'pcb' });
    // Approximate packages, symbolic ratings and demo calculations are never verified hardware issues.
    const verified =
      f.status === 'fail' &&
      Boolean(f.source) &&
      /^(physical-|different-supplies|protocol-mismatch|bus-lane-mismatch)/.test(f.id);
    const classification: FindingClass =
      f.status === 'pass'
        ? 'passed-specific-check'
        : verified
          ? 'verified-issue'
          : f.status === 'fail' || f.severity === 'warning'
            ? 'potential-issue'
            : 'missing-information';
    return {
      id: net ? f.id.replace(/NET-\d+$/, net.id) : f.id,
      classification,
      title: f.title,
      details: f.details,
      remedy: f.remedy ?? 'Review the affected entities and supply missing design evidence.',
      entities,
      ...(f.source ? { source: f.source } : {}),
    };
  });
  for (const c of p.components.filter((c) => c.id !== 'pcb' && c.type !== 'housing')) {
    const ports = logicalPorts(c),
      connected = new Set(
        (p.connections ?? []).flatMap((w) => [endpointKey(w.from), endpointKey(w.to)]),
      );
    if (
      ports.length &&
      !ports.some((port) => connected.has(endpointKey({ componentId: c.id, portId: port.id })))
    )
      findings.push({
        id: `unconnected:${c.id}`,
        classification: 'missing-information',
        title: `${c.reference}: no schematic connections`,
        details:
          'This placed component has no recorded logical connections. Visual wires do not establish electrical connectivity.',
        remedy:
          'Connect intended endpoints in Schematic; verify the physical pin mapping separately.',
        entities: [{ kind: 'component', id: c.id }],
      });
  }
  const target = p.components.find((c) => c.id === (p.firmwareTargetId ?? 'mcu'));
  const hardware = hardwareBuildState(p);
  findings.push({
    id: 'firmware:target',
    classification: !target
      ? 'missing-information'
      : hardware.status === 'incompatible'
        ? 'verified-issue'
        : 'missing-information',
    title: !target
      ? 'Firmware target is missing'
      : hardware.status === 'incompatible'
        ? 'Recorded build does not match selected target'
        : 'Firmware target requires a fresh build',
    details: hardware.explanation + ' Source compatibility has not been compiled or validated.',
    remedy:
      'Select the intended controller, implement its drivers and obtain a target-specific build outside this editor.',
    entities: [
      { kind: 'firmware', id: 'cooling' },
      ...(target ? [{ kind: 'component' as const, id: target.id }] : []),
    ],
  });
  findings.push({
    id: 'firmware:source',
    classification: 'missing-information',
    title:
      buildStatus(source) === 'demo'
        ? 'Recorded demonstration source'
        : 'Edited or starter firmware',
    details:
      'No compiler or static analyzer has run. Recorded demonstration artifacts cannot validate the current project.',
    remedy:
      'Review source, target-specific peripherals and schematic pin assignments before compiling.',
    entities: [{ kind: 'firmware', id: 'cooling' }],
  });
  for (const r of p.boardConfiguration?.restrictedRegions ?? [])
    if (r.id)
      findings.push({
        id: `region:${r.id}`,
        classification: 'missing-information',
        title: `${r.name}: configured keep-out`,
        details: `${r.length} × ${r.width} mm on ${r.side ?? 'all'} side(s). A mechanical exclusion does not establish copper clearance.`,
        remedy: 'Review footprint placement and define copper rules in the routing milestone.',
        entities: [{ kind: 'region', id: r.id }],
      });
  return findings;
}
export interface WorkspaceSnapshot {
  version: 1;
  project: {
    id: string;
    name: string;
    schemaVersion: number;
    revision: number;
    placementMode: string;
  };
  board: BoardConfiguration;
  components: {
    id: string;
    name: string;
    reference: string;
    catalogId: string | null;
    position: Vec3;
    rotation: Vec3;
    side: string;
    footprint: Footprint;
    verification: string;
    datasheet: string | null;
    ports: { id: string; verification: string; source?: string }[];
  }[];
  schematic: { wires: SchematicConnection[]; nets: ReturnType<typeof workspaceNets> };
  findings: InspectionFinding[];
  firmware: {
    id: 'cooling';
    language: 'c';
    targetId: string | null;
    targetArchitecture: string | null;
    source: string;
    sourceRevision: string;
    buildStatus: string;
    staticDiagnostics: string[];
  };
  omitted: {
    components: number;
    ports: number;
    wires: number;
    nets: number;
    findings: number;
    firmwareCharacters: number;
    redacted: boolean;
  };
  scope: string;
}
export const SNAPSHOT_MAX_BYTES = 96000;
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
/** Only known active-project fields cross the boundary, never store objects or browser state. */
export function buildWorkspaceSnapshot(
  p: Project,
  revision = 0,
  selectedId: string | null = null,
  source = p.firmwareSource ?? defaultSourceFor(p.id),
): WorkspaceSnapshot {
  const cfg = normalizeBoard(
    p.boardConfiguration ?? presetBoardConfiguration(p.boardTemplateId ?? 'cooling-demo'),
  );
  const board: BoardConfiguration = {
    length: cfg.length,
    width: cfg.width,
    thickness: cfg.thickness,
    edgeClearance: cfg.edgeClearance,
    componentSpacing: cfg.componentSpacing,
    layers: cfg.layers,
    material: cfg.material,
    supplyVoltage: cfg.supplyVoltage,
    currentBudgetMa: cfg.currentBudgetMa,
    outline:
      cfg.outline?.kind === 'polygon'
        ? { kind: 'polygon', points: cfg.outline.points.map(({ x, z }) => ({ x, z })) }
        : cfg.outline?.kind === 'rounded-rectangle'
          ? { kind: 'rounded-rectangle', radius: cfg.outline.radius }
          : { kind: cfg.outline!.kind },
    grid: { enabled: cfg.grid!.enabled, spacing: cfg.grid!.spacing },
    coordinates: {
      units: 'mm',
      origin: { x: cfg.coordinates!.origin.x, z: cfg.coordinates!.origin.z },
      xDirection: cfg.coordinates!.xDirection,
      zDirection: cfg.coordinates!.zDirection,
    },
    supportedSides: cfg.supportedSides?.map((s) => s),
    stackup: cfg.stackup!.map(({ id, name, kind, side, visible }) => ({
      id,
      name,
      kind,
      side,
      visible,
    })),
    mountingHoles: cfg.mountingHoles.map(({ id, x, z, diameter }) => ({ id, x, z, diameter })),
    restrictedRegions: cfg.restrictedRegions.map(({ id, name, x, z, length, width, side }) => ({
      id,
      name,
      x,
      z,
      length,
      width,
      side,
    })),
  };
  const findings = inspectProject(p, source);
  const priority: Record<FindingClass, number> = {
    'verified-issue': 0,
    'potential-issue': 1,
    'missing-information': 2,
    'passed-specific-check': 3,
  };
  findings.sort(
    (a, b) =>
      priority[a.classification] - priority[b.classification] ||
      Number(b.entities.some((e) => e.id === selectedId)) -
        Number(a.entities.some((e) => e.id === selectedId)) ||
      a.id.localeCompare(b.id),
  );
  // Redact recognizable credentials and absolute local paths embedded in user source.
  const safeSource = source
    .replace(
      /((?:api[_-]?key|token|password|secret)\s*(?:=|:)\s*)["'][^"'\n]*["']/gi,
      '$1"[REDACTED]"',
    )
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .replace(/(?:\/(?:Users|home|private|tmp)\/|[A-Z]:\\Users\\)[^\s"'<>]+/g, '[LOCAL PATH]');
  const target = p.components.find((c) => c.id === (p.firmwareTargetId ?? 'mcu'));
  const snapshot: WorkspaceSnapshot = {
    version: 1,
    project: {
      id: p.id,
      name: p.name,
      schemaVersion: p.schemaVersion,
      revision,
      placementMode: p.placementMode ?? 'free',
    },
    board,
    components: [...p.components]
      .sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId))
      .slice(0, 64)
      .map((c) => {
        const part = getPart(c.catalogId);
        const fp = componentFootprint(c);
        return {
          id: c.id,
          name: c.name.slice(0, 140),
          reference: c.reference.slice(0, 80),
          catalogId: c.catalogId ?? null,
          position: [...c.position],
          rotation: [...c.rotation],
          side: c.side ?? 'top',
          footprint: {
            name: fp.name,
            length: fp.length,
            width: fp.width,
            provenance: fp.provenance,
          },
          verification: part?.verificationStatus ?? 'concept',
          datasheet: part?.datasheetUrl ?? null,
          ports: logicalPorts(c)
            .slice(0, 64)
            .map(({ id, verification, source }) => ({
              id,
              verification: verification ?? 'logical',
              ...(source ? { source } : {}),
            })),
        };
      }),
    schematic: {
      wires: (p.connections ?? [])
        .slice(0, 128)
        .map((w) => ({
          id: w.id,
          from: { componentId: w.from.componentId, portId: w.from.portId },
          to: { componentId: w.to.componentId, portId: w.to.portId },
        })),
      nets: workspaceNets(p),
    },
    findings: findings.slice(0, 64),
    firmware: {
      id: 'cooling',
      language: 'c',
      targetId: target?.id ?? null,
      targetArchitecture:
        getPart(target?.catalogId)?.architecture ??
        (target?.id === 'mcu' ? 'ARM Cortex-M3 (concept)' : null),
      source: safeSource.slice(0, 12000),
      sourceRevision: sourceRevision(source),
      buildStatus: buildStatus(source),
      staticDiagnostics: ['Unavailable: no compiler/static analyzer run.'],
    },
    omitted: {
      components: Math.max(0, p.components.length - 64),
      ports: 0,
      wires: Math.max(0, (p.connections?.length ?? 0) - 128),
      nets: 0,
      findings: Math.max(0, findings.length - 64),
      firmwareCharacters: Math.max(0, safeSource.length - 12000),
      redacted: source !== safeSource,
    },
    scope:
      'Deterministic checks cover stated rules only. Omitted context is not reviewed by AI. No complete electrical safety, simulation, routing, manufacturing or firmware validation.',
  };
  snapshot.omitted.ports = p.components.reduce(
    (n, c) => n + Math.max(0, logicalPorts(c).length - 64),
    0,
  );
  // Prefer topology and identities over prose. Counts remain accurate after every reduction.
  while (bytes(snapshot) > SNAPSHOT_MAX_BYTES) {
    if (snapshot.findings.length > 8) {
      snapshot.findings.pop();
      snapshot.omitted.findings++;
    } else if (snapshot.firmware.source.length) {
      snapshot.omitted.firmwareCharacters += snapshot.firmware.source.length;
      snapshot.firmware.source = '';
    } else {
      const c = [...snapshot.components].reverse().find((c) => c.ports.length);
      if (c) {
        snapshot.omitted.ports += c.ports.length;
        c.ports = [];
      } else throw new Error('Project snapshot exceeds the bounded context budget.');
    }
  }
  return snapshot;
}
