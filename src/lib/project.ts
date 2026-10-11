import { validPosition } from './transforms';
import { validateConnection } from '../schematic/model';
import { getPart } from '../catalog/catalog';
import { validBoardConfiguration } from '../workspace/boardSpecifications';
import { isBoardTemplate } from '../workspace/boardTemplates';
import { createInstance } from '../catalog/instances';
import { canReplace } from '../catalog/compatibility';
import { demoProject } from '../data/demoProject';
import type { HardwareComponent, Project, Vec3, ViewMode } from '../types/workspace';
// Retain the legacy storage key so existing saves survive the Nexora rebrand.
export const STORAGE_KEY = 'nexora.project.v1';
export const cloneProject = (p: Project): Project => structuredClone(p);
export function displayedPosition(c: HardwareComponent, mode: ViewMode): Vec3 {
  return c.position.map((n, i) => n + (mode === 'exploded' ? c.explodedOffset[i] : 0)) as Vec3;
}
const vector = (v: unknown, limit: number): v is Vec3 =>
  Array.isArray(v) &&
  v.length === 3 &&
  v.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limit);
export function parseProject(text: string): Project {
  if (text.length > 1_500_000)
    throw new Error('Project file is too large (1.5 MB maximum with firmware).');
  let p: Project;
  try {
    p = JSON.parse(text);
  } catch {
    if (text.length > 250_000)
      throw new Error('Project file is too large (250 KB design maximum).');
    throw new Error('This file is not valid JSON.');
  }
  if (
    !p ||
    ![1, 2].includes(p.schemaVersion) ||
    typeof p.id !== 'string' ||
    !/^[a-zA-Z0-9-]{1,100}$/.test(p.id) ||
    typeof p.name !== 'string' ||
    !p.name.trim() ||
    p.name.length > 100 ||
    !Array.isArray(p.components) ||
    p.components.length > 64 ||
    (p.schemaVersion === 1 &&
      (p.id !== demoProject.id || p.components.length !== demoProject.components.length))
  )
    throw new Error('Invalid Nexora project (schema version 1 or 2).');
  if (p.placementMode !== undefined && !['free', 'board'].includes(p.placementMode))
    throw new Error('Unsupported placement mode.');
  if (
    p.firmwareSource !== undefined &&
    (typeof p.firmwareSource !== 'string' || p.firmwareSource.length > 200000)
  )
    throw new Error('Invalid firmware source.');
  if (p.engineeringInputs !== undefined) {
    if (
      !p.engineeringInputs ||
      typeof p.engineeringInputs !== 'object' ||
      Array.isArray(p.engineeringInputs)
    )
      throw new Error('Invalid engineering inputs.');
    for (const [id, input] of Object.entries(p.engineeringInputs)) {
      if (
        !p.components.some((c) => c.id === id) ||
        !input ||
        !['demo', 'configured'].includes(input.provenance) ||
        Object.entries(input).some(
          ([key, value]) =>
            key !== 'provenance' &&
            (![
              'currentMa',
              'voltage',
              'dissipationW',
              'thermalResistance',
              'ambientC',
              'maxTemperatureC',
            ].includes(key) ||
              typeof value !== 'number' ||
              !Number.isFinite(value) ||
              Math.abs(value) > 100000 ||
              (value < 0 && !['ambientC', 'maxTemperatureC'].includes(key))),
        )
      )
        throw new Error('Invalid engineering inputs.');
    }
  }
  if (text.length - JSON.stringify(p.firmwareSource ?? '').length > 250_000)
    throw new Error('Project design is too large (250 KB excluding firmware).');
  const ids = new Set<string>();
  if (p.boardTemplateId !== undefined && !isBoardTemplate(p.boardTemplateId))
    throw new Error('Unsupported PCB template.');
  if (
    p.boardConfiguration !== undefined &&
    (p.schemaVersion !== 2 || !validBoardConfiguration(p.boardConfiguration))
  )
    throw new Error('Invalid board configuration.');
  if (
    p.boardConfigurations !== undefined &&
    (!p.boardConfigurations ||
      typeof p.boardConfigurations !== 'object' ||
      Array.isArray(p.boardConfigurations) ||
      Object.entries(p.boardConfigurations).some(
        ([id, c]) => !isBoardTemplate(id) || !validBoardConfiguration(c),
      ))
  )
    throw new Error('Invalid saved board configurations.');
  const components: HardwareComponent[] = [];
  for (const c of p.components) {
    const original = demoProject.components.find((b) => b.id === c?.id);
    const catalogPart = getPart(c?.catalogId);
    if (
      !c ||
      (c.catalogId && (p.schemaVersion !== 2 || !catalogPart?.insertionSupported)) ||
      (!original && (!catalogPart || !/^part-[a-zA-Z0-9-]{1,80}$/.test(c.id))) ||
      (original && catalogPart && !canReplace(original, catalogPart))
    )
      throw new Error('The project contains an unknown or unsupported catalog component.');
    const base = catalogPart
      ? { ...createInstance(catalogPart, c.id), reference: original?.reference ?? c.reference }
      : original!;
    if (
      !base ||
      ids.has(c.id) ||
      c.type !== base.type ||
      c.group !== base.group ||
      !validPosition(c.position) ||
      !vector(c.rotation, 360) ||
      !vector(c.dimensions, 20) ||
      c.dimensions.some((n) => n <= 0) ||
      !vector(c.explodedOffset, 10) ||
      typeof c.visible !== 'boolean' ||
      (c.fixed !== undefined && typeof c.fixed !== 'boolean') ||
      typeof c.opacity !== 'number' ||
      !Number.isFinite(c.opacity) ||
      c.opacity < 0.05 ||
      c.opacity > 1 ||
      !/^#[0-9a-f]{6}$/i.test(c.color) ||
      !['matte', 'metal', 'polymer'].includes(c.material) ||
      (c.initialPosition !== undefined && !vector(c.initialPosition, 20)) ||
      ['name', 'reference', 'description', 'purpose', 'connectionNotes'].some(
        (k) =>
          typeof c[k as keyof HardwareComponent] !== 'string' ||
          String(c[k as keyof HardwareComponent]).length > 1500,
      )
    )
      throw new Error('The project contains invalid or unsupported component properties.');
    ids.add(c.id);
    components.push({
      ...base,
      ...(c.id === 'pcb' && p.boardTemplateId !== 'cooling-demo' && p.boardConfiguration
        ? {
            dimensions: [
              p.boardConfiguration.length / 10,
              p.boardConfiguration.thickness / 10,
              p.boardConfiguration.width / 10,
            ] as Vec3,
          }
        : {}),
      ...(c.fixed !== undefined ? { fixed: c.fixed } : {}),
      position: c.position,
      rotation: c.rotation,
      color: c.color,
      material: c.material,
      opacity: c.opacity,
      visible: c.visible,
      ...(catalogPart ? { initialPosition: c.initialPosition ?? base.position } : {}),
    });
  }
  if (
    p.schemaVersion === 1 &&
    p.id === demoProject.id &&
    demoProject.components.some((c) => !ids.has(c.id))
  )
    throw new Error('The project is missing required demo components.');
  // Old projects legitimately have no schematic data. New data must be validated
  // rather than silently dropping malformed/dangling wires on import.
  let safeConnections: Project['connections'];
  if (p.connections !== undefined) {
    if (p.schemaVersion !== 2 || !Array.isArray(p.connections) || p.connections.length > 128)
      throw new Error('Invalid schematic connections.');
    const checked: Project = { ...p, components, connections: [] };
    const connectionIds = new Set<string>();
    for (const wire of p.connections) {
      if (
        !wire ||
        typeof wire.id !== 'string' ||
        !/^wire-[a-zA-Z0-9-]{1,80}$/.test(wire.id) ||
        connectionIds.has(wire.id) ||
        !wire.from ||
        !wire.to ||
        typeof wire.from.componentId !== 'string' ||
        typeof wire.from.portId !== 'string' ||
        typeof wire.to.componentId !== 'string' ||
        typeof wire.to.portId !== 'string' ||
        validateConnection(checked, wire.from, wire.to)
      )
        throw new Error('Project contains invalid or dangling schematic wires.');
      connectionIds.add(wire.id);
      checked.connections!.push({
        id: wire.id,
        from: { componentId: wire.from.componentId, portId: wire.from.portId },
        to: { componentId: wire.to.componentId, portId: wire.to.portId },
      });
    }
    safeConnections = checked.connections;
  }
  if (
    p.firmwareTargetId &&
    !components.some(
      (c) => c.id === p.firmwareTargetId && (c.id === 'mcu' || getPart(c.catalogId)?.architecture),
    )
  )
    throw new Error('Invalid firmware target.');
  return {
    ...p,
    schemaVersion: p.schemaVersion,
    ...(p.placementMode ? { placementMode: p.placementMode } : {}),
    name: p.name,
    components,
    ...(safeConnections !== undefined ? { connections: safeConnections } : {}),
    ...(p.boardTemplateId ? { boardTemplateId: p.boardTemplateId } : {}),
    ...(p.selectedComponentId !== undefined
      ? { selectedComponentId: ids.has(p.selectedComponentId ?? '') ? p.selectedComponentId : null }
      : {}),
    ...(p.firmwareTargetId ? { firmwareTargetId: p.firmwareTargetId } : {}),
  };
}
export const serializeProject = (p: Project) => JSON.stringify(p, null, 2);
export function saveProject(p: Project) {
  localStorage.setItem(STORAGE_KEY, serializeProject(p));
}
export function loadProject(): Project {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error('No local save yet. Save this project first.');
  return parseProject(raw);
}
export function downloadFile(contents: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
