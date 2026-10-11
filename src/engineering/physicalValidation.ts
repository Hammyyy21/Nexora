import { verifiedPin, verifiedPinout, busFamily } from './pins';
import { electricalNets, endpointKey } from '../schematic/model';
import type { DesignFinding } from './insights';
import type { HardwareComponent, Project } from '../types/workspace';
import type { PhysicalPin } from '../catalog/types';

type Terminal = { component: HardwareComponent; pin: PhysicalPin; key: string; source: string };
const supplyIn = (p: PhysicalPin) => p.role === 'power-input';
const supplyOut = (p: PhysicalPin) => p.role === 'power-output';
const outputPushPull = (p: PhysicalPin) => p.role === 'output' && p.drive === 'push-pull';

/** Scope is deliberately narrow: only facts backed by package-specific manufacturer sources. */
export function reviewPhysicalConnections(project: Project): DesignFinding[] {
  const results: DesignFinding[] = [];
  const components = new Map(project.components.map((c) => [c.id, c]));
  for (const c of project.components) {
    if (verifiedPinout(c)) continue;
    if (!c.catalogId) continue;
    if (
      (project.connections ?? []).some(
        (w) => w.from.componentId === c.id || w.to.componentId === c.id,
      )
    ) {
      results.push({
        id: `physical-unknown:${c.id}`,
        status: 'unknown',
        severity: 'info',
        title: `${c.reference}: physical pinout unavailable`,
        componentId: c.id,
        details:
          'Only conceptual terminals are recorded for this catalog part. Its exact package/pin mapping is not verified.',
        remedy:
          'Select an exact manufacturer part and package with a published pinout before wiring physical pins.',
      });
    }
  }
  for (const net of electricalNets(project)) {
    const terminals: Terminal[] = net.terminals.flatMap((key) => {
      const ix = key.indexOf(':');
      if (ix < 0) return [];
      const component = components.get(key.slice(0, ix));
      if (!component) return [];
      const pin = verifiedPin(component, key.slice(ix + 1));
      const source = verifiedPinout(component)?.source;
      return pin && source ? [{ component, pin, key, source }] : [];
    });
    const unknownCount = net.terminals.length - terminals.length;
    if (terminals.length && unknownCount)
      results.push({
        id: `mixed-net:${net.name}`,
        status: 'unknown',
        severity: 'info',
        title: `${net.name}: legacy pin mapping unknown`,
        details: `${unknownCount} terminal(s) are symbolic or lack a verified physical pin mapping. Never assume equivalence with a physical pin.`,
        remedy:
          'Use documented physical pins for new connections; leave old symbolic wires in place until reviewed.',
      });
    if (terminals.length < 2) continue;
    const fail = (
      key: string,
      title: string,
      details: string,
      remedy: string,
      componentId?: string,
    ) =>
      results.push({
        id: `${key}:${net.name}`,
        status: 'fail',
        severity: 'warning',
        title,
        details,
        remedy,
        componentId: componentId ?? terminals[0].component.id,
        source: terminals[0].source,
      });
    const pass = (
      key: string,
      title: string,
      details: string,
      source: string,
      componentId?: string,
    ) =>
      results.push({
        id: `${key}:${net.name}`,
        status: 'pass',
        severity: 'info',
        title,
        details,
        componentId,
        source,
      });
    const outputs = terminals.filter((t) => outputPushPull(t.pin));
    if (outputs.length > 1)
      fail(
        'physical-output-conflict',
        'Multiple fixed push-pull outputs on one net',
        'Two documented output drivers connect directly to the same net. Driving opposing levels risks damage.',
        'Use a single output driver or a suitable bus/tri-state interface.',
      );
    const grounded = terminals.filter((t) => t.pin.role === 'ground');
    const poweredOutputs = terminals.filter((t) => supplyOut(t.pin));
    if (grounded.length && poweredOutputs.length)
      fail(
        'physical-ground-short',
        'Power output directly tied to ground',
        'A documented power-output terminal and a ground terminal share the same schematic net.',
        'Remove the direct short and review the actual power return topology.',
      );
    const sources = terminals.filter((t) => supplyOut(t.pin) && t.pin.nominalVoltage !== undefined);
    for (const source of sources)
      for (const target of terminals) {
        if (source.key === target.key) continue;
        if (supplyIn(target.pin) && target.pin.supplyRange) {
          const voltage = source.pin.nominalVoltage!;
          const [low, high] = target.pin.supplyRange;
          const permitted = voltage >= low && voltage <= high;
          if (!permitted)
            fail(
              `physical-supply:${source.key}:${target.key}`,
              `Supply voltage outside ${target.component.reference} operating range`,
              `${source.component.reference} provides nominal ${voltage} V but ${target.component.reference} requires ${low}–${high} V on its listed supply terminal.`,
              'Choose a suitable regulator/supply or a component rated for that voltage.',
              target.component.id,
            );
          else
            pass(
              `physical-supply:${source.key}:${target.key}`,
              'Documented supply range contains connected nominal voltage',
              `${source.component.reference} ${voltage} V lies within ${target.component.reference} ${low}–${high} V operating range. This checks nominal voltage only, not current, transient or reverse-feed safety.`,
              target.source,
              target.component.id,
            );
        }
      }
    for (let i = 0; i < sources.length; i++)
      for (let j = i + 1; j < sources.length; j++) {
        if (sources[i].pin.nominalVoltage !== sources[j].pin.nominalVoltage)
          fail(
            'different-supplies',
            'Different fixed supply outputs directly joined',
            `${sources[i].pin.nominalVoltage} V and ${sources[j].pin.nominalVoltage} V output terminals share a net.`,
            'Separate the supplies or design an appropriate power-sharing circuit.',
          );
      }
    const signals = terminals.filter((t) => t.pin.interface && t.pin.function);
    for (let i = 0; i < signals.length; i++)
      for (let j = i + 1; j < signals.length; j++) {
        const a = signals[i],
          b = signals[j];
        if (a.component.id === b.component.id) continue;
        const interfaceA = busFamily(a.pin.interface),
          interfaceB = busFamily(b.pin.interface);
        if (interfaceA !== interfaceB) {
          fail(
            `protocol-mismatch:${a.key}:${b.key}`,
            'Documented interface functions differ',
            `${a.pin.id} is ${a.pin.interface}, while ${b.pin.id} is ${b.pin.interface}. This net does not match their documented bus capabilities.`,
            'Use matching manufacturer-supported interfaces and check firmware configuration.',
            b.component.id,
          );
        } else if (
          interfaceA === 'UART'
            ? a.pin.function === b.pin.function
            : a.pin.function !== b.pin.function
        ) {
          fail(
            `bus-lane-mismatch:${a.key}:${b.key}`,
            'Bus data and clock functions crossed',
            `${a.pin.id} (${a.pin.function}) connects directly to ${b.pin.id} (${b.pin.function}).`,
            'Match bus functions: I²C SDA to SDA, SCL to SCL; UART TX to RX; check the SPI controller/peripheral directions.',
            b.component.id,
          );
        } else {
          pass(
            `bus-lane-match:${a.key}:${b.key}`,
            'Documented signal functions match',
            `${a.pin.id} and ${b.pin.id} both support ${interfaceA} ${a.pin.function}. Firmware mode, pull-ups and voltage levels remain unverified.`,
            b.source,
            b.component.id,
          );
        }
      }
  }
  const nets = electricalNets(project);
  for (const sensor of project.components.filter((c) => c.type === 'sensor')) {
    const pinout = verifiedPinout(sensor);
    const lanes = pinout?.pins.filter((pin) => busFamily(pin.interface) === 'I2C') ?? [];
    // Only evaluate this selected physical interface after at least one lane is wired.
    if (
      !lanes.some((pin) =>
        nets.some((n) =>
          n.terminals.includes(endpointKey({ componentId: sensor.id, portId: `pin:${pin.id}` })),
        ),
      )
    )
      continue;
    for (const pin of lanes) {
      const net = nets.find((n) =>
        n.terminals.includes(endpointKey({ componentId: sensor.id, portId: `pin:${pin.id}` })),
      );
      const linked = net?.terminals.some((key) => {
        const ix = key.indexOf(':'),
          c = components.get(key.slice(0, ix));
        const other = c && verifiedPin(c, key.slice(ix + 1));
        return (
          c &&
          c.id !== sensor.id &&
          (c.type === 'board' || c.type === 'microcontroller') &&
          other &&
          busFamily(other.interface) === 'I2C' &&
          other.function === pin.function
        );
      });
      results.push({
        id: `physical-required:${sensor.id}:${pin.id}`,
        status: linked ? 'pass' : 'fail',
        severity: linked ? 'info' : 'warning',
        componentId: sensor.id,
        title: `${sensor.reference}: physical ${pin.function} controller path ${linked ? 'recorded' : 'missing'}`,
        details:
          'Evaluates the documented signal function and shared net only. Does not verify bus address, firmware or pull-up configuration.',
        remedy: 'Connect all required bus lanes to matching documented controller functions.',
        source: pinout!.source,
      });
    }
  }
  return results;
}
