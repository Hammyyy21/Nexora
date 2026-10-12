import { demoPins } from '../engineering/demoElectrical';
import { getPart } from '../catalog/catalog';
import { verifiedPinout } from '../engineering/pins';
import type { HardwareComponent, Project, SchematicConnection } from '../types/workspace';

/** Logical interfaces for concept design, NOT manufacturer package pin numbers. */
export interface LogicalPort {
  id: string;
  label: string;
  kind: 'power' | 'ground' | 'signal' | 'passive';
  verification?: 'physical' | 'logical';
  number?: string;
  source?: string;
}
const ports = (spec: readonly (readonly [string, LogicalPort['kind']])[]): LogicalPort[] =>
  spec.map(([id, kind]) => ({ id, label: id, kind, verification: 'logical' }));

function conceptPorts(component: HardwareComponent): LogicalPort[] {
  // Catalog instances often use approximate 3D models. These are symbolic logical terminals.
  // Never treat these names as verified datasheet pin numbers or footprints.
  switch (component.type) {
    case 'board':
      // Development-board logical endpoints, not physical pins or a power rail assignment.
      return component.catalogId && getPart(component.catalogId)?.architecture
        ? ports([
            ['SUPPLY', 'power'],
            ['GND', 'ground'],
            ['IO-A', 'signal'],
            ['IO-B', 'signal'],
          ])
        : [];
    case 'housing':
      return [];
    case 'microcontroller':
      return ports([
        ['VDD', 'power'],
        ['GND', 'ground'],
        ['IO-A', 'signal'],
        ['IO-B', 'signal'],
      ]);
    case 'sensor':
      return ports([
        ['VDD', 'power'],
        ['GND', 'ground'],
        ['DATA', 'signal'],
      ]);
    case 'fan':
      return ports([
        ['+', 'power'],
        ['-', 'ground'],
      ]);
    case 'mosfet':
      return ports([
        ['G', 'signal'],
        ['D', 'passive'],
        ['S', 'passive'],
      ]);
    case 'resistor':
    case 'capacitor':
      return ports([
        ['1', 'passive'],
        ['2', 'passive'],
      ]);
    case 'usb':
      return ports([
        ['VBUS', 'power'],
        ['GND', 'ground'],
        ['D+', 'signal'],
        ['D-', 'signal'],
      ]);
    case 'terminal':
      return ports([
        ['1', 'passive'],
        ['2', 'passive'],
      ]);
    case 'header':
      return ports([
        ['1', 'passive'],
        ['2', 'passive'],
        ['3', 'passive'],
        ['4', 'passive'],
        ['5', 'passive'],
        ['6', 'passive'],
      ]);
    default:
      return ports([
        ['A', 'passive'],
        ['B', 'passive'],
      ]);
  }
}
/** Manufacturer pins and legacy symbolic terminals are separate namespaces.
 * No implicit physical-to-symbolic migration is ever performed. */
export function logicalPorts(component: HardwareComponent): LogicalPort[] {
  if(component.conceptSourceId) component={...component,id:component.conceptSourceId};
  const legacy = [
    ...conceptPorts(component),
    ...demoPins(component).map((p) => ({
      id: p.id,
      label: `${p.id.slice(5)} (demo)`,
      kind: p.kind,
      verification: 'logical' as const,
    })),
  ];
  const pinout = verifiedPinout(component);
  if (!pinout) return legacy;
  const physical: LogicalPort[] = pinout.pins.map((pin) => ({
    id: `pin:${pin.id}`,
    label: `${pin.id} [${pin.number}]`,
    kind:
      pin.role === 'ground'
        ? 'ground'
        : pin.role.startsWith('power-')
          ? 'power'
          : pin.role === 'passive'
            ? 'passive'
            : 'signal',
    number: pin.number,
    verification: 'physical',
    source: pinout.source,
  }));
  return [...physical, ...legacy];
}
export const endpointKey = (p: { componentId: string; portId: string }) =>
  `${p.componentId}:${p.portId}`;
export function validateConnection(
  project: Project,
  from: SchematicConnection['from'],
  to: SchematicConnection['to'],
): string | null {
  if (endpointKey(from) === endpointKey(to)) return 'Choose two different terminals.';
  for (const point of [from, to]) {
    const component = project.components.find((c) => c.id === point.componentId);
    if (!component || !logicalPorts(component).some((p) => p.id === point.portId))
      return 'This component or logical terminal no longer exists.';
  }
  if (
    (project.connections ?? []).some(
      (w) =>
        (endpointKey(w.from) === endpointKey(from) && endpointKey(w.to) === endpointKey(to)) ||
        (endpointKey(w.from) === endpointKey(to) && endpointKey(w.to) === endpointKey(from)),
    )
  )
    return 'Those terminals are already connected.';
  if ((project.connections ?? []).length >= 128)
    return 'This project supports at most 128 logical wires.';
  return null;
}
export function connectionLabel(project: Project, point: SchematicConnection['from']): string {
  const component = project.components.find((c) => c.id === point.componentId);
  return `${component?.reference ?? point.componentId} · ${point.portId}`;
}

/** Wires are conceptual logical edges; no routing, voltage or ERC has been performed. */
export function electricalNets(project: Project) {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    const previous = parent.get(key);
    if (!previous || previous === key) {
      parent.set(key, key);
      return key;
    }
    const root = find(previous);
    parent.set(key, root);
    return root;
  };
  for (const wire of project.connections ?? []) {
    const a = find(endpointKey(wire.from)),
      b = find(endpointKey(wire.to));
    if (a !== b) parent.set(b, a);
  }
  const groups = new Map<string, Set<string>>();
  for (const key of parent.keys()) {
    const root = find(key);
    if (!groups.has(root)) groups.set(root, new Set());
    groups.get(root)!.add(key);
  }
  return Array.from(groups.values()).map((set, i) => ({
    name: `NET-${i + 1}`,
    terminals: [...set],
  }));
}
