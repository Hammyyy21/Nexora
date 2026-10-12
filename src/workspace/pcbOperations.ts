import { Vector3 } from 'three';
import type { HardwareComponent, Project, Vec3 } from '../types/workspace';
import { assessPosition, movable } from '../lib/transforms';
import {
  boardMatrix,
  normalizeBoard,
  snapPosition,
  validFootprint,
  type BoardSide,
  type Footprint,
} from './boardGeometry';
import { validBoardConfiguration, type BoardConfiguration } from './boardSpecifications';
import { migrateProject } from './migrations';
export type PCBOperation =
  | { type: 'configure_board'; configuration: BoardConfiguration }
  | {
      type: 'update_component';
      component_id: string;
      rotation?: Vec3;
      side?: BoardSide;
      footprint?: Footprint;
    }
  | { type: 'duplicate_component'; component_id: string };
/** Board-related placement violations after edits or project import.
 * The user's geometry is never silently moved or discarded. Collision-only
 * warnings remain in the normal engineering review rather than this count. */
export function boardPlacementIssues(project: Project) {
  return project.components
    .filter((c) => c.id !== 'pcb' && c.type !== 'housing')
    .flatMap((component) => {
      const assessment = assessPosition(project, component, component.position);
      const boardWarnings = assessment.warnings.filter((warning) =>
        /PCB outline|PCB surface|mounting hole|restricted region|rounded PCB corner/i.test(warning),
      );
      const issues = [...(assessment.error ? [assessment.error] : []), ...boardWarnings];
      return issues.length
        ? [{ componentId: component.id, reference: component.reference, issues }]
        : [];
    });
}

/** Pure transaction: failure cannot mutate the caller or leave a partial edit. */
export function applyPCBOperation(current: Project, op: PCBOperation): Project {
  const p = migrateProject(current);
  if (op.type === 'configure_board') {
    if (!validBoardConfiguration(op.configuration))
      throw new Error('Invalid board geometry, layer settings, grid or regions.');
    p.boardConfiguration = normalizeBoard(op.configuration);
    if ((p.boardTemplateId ?? 'cooling-demo') === 'cooling-demo') p.boardTemplateId = 'blank-92';
    const b = p.components.find((c) => c.id === 'pcb');
    if (!b) throw new Error('Project has no PCB.');
    b.dimensions = [
      op.configuration.length / 10,
      op.configuration.thickness / 10,
      op.configuration.width / 10,
    ];
    return p;
  }
  const c = p.components.find((c) => c.id === op.component_id);
  if (!c || !movable(c)) throw new Error('Target component is missing or fixed.');
  if (op.type === 'duplicate_component') {
    if (p.components.length >= 64) throw new Error('Project has reached its 64-component limit.');
    // Retain a recognizable root while allocating a unique designator, even
    // when users duplicate a duplicate. Match case-insensitively for clarity.
    const root = c.reference.replace(/-COPY\d+$/i, '').slice(0, 60);
    const used = new Set(p.components.map((item) => item.reference.toUpperCase()));
    let suffix = 1;
    while (used.has(`${root}-COPY${suffix}`.toUpperCase())) suffix++;
    const copy: HardwareComponent = {
      ...structuredClone(c),
      id: `part-${crypto.randomUUID()}`,
      reference: `${root}-COPY${suffix}`,
      ...(!c.catalogId ? { conceptSourceId: c.conceptSourceId ?? c.id } : {}),
    };
    copy.position = snapPosition(p, [
      c.position[0] + (p.boardConfiguration?.grid?.spacing ?? 1) / 10,
      c.position[1],
      c.position[2],
    ]);
    const check = assessPosition(p, copy, copy.position);
    if (!check.valid) throw new Error(check.error);
    p.components.push(copy);
    p.selectedComponentId = copy.id;
    return p;
  }
  if (op.rotation) {
    if (
      !Array.isArray(op.rotation) ||
      op.rotation.length !== 3 ||
      op.rotation.some((n) => !Number.isFinite(n) || Math.abs(n) > 360)
    )
      throw new Error('Invalid rotation.');
    c.rotation = [...op.rotation];
  }
  if (op.footprint) {
    if (!validFootprint(op.footprint)) throw new Error('Invalid footprint.');
    c.footprint = { ...op.footprint, provenance: 'user-configured' };
  }
  if (op.side) {
    if (
      !['top', 'bottom'].includes(op.side) ||
      !p.boardConfiguration?.supportedSides?.includes(op.side)
    )
      throw new Error('Unsupported board side.');
    const b = p.components.find((c) => c.id === 'pcb')!;
    c.side = op.side;
    c.rotation[0] = op.side === 'bottom' ? 180 : 0;
    const local = new Vector3(...c.position).applyMatrix4(boardMatrix(b).invert());
    local.y = ((b.dimensions[1] + c.dimensions[1]) / 2) * (op.side === 'bottom' ? -1 : 1);
    c.position = local.applyMatrix4(boardMatrix(b)).toArray() as Vec3;
  }
  const check = assessPosition(p, c, c.position);
  if (!check.valid) throw new Error(check.error);
  return p;
}
