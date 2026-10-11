import { reviewCalculations, reviewDemoConnections } from './calculations';
import { boardSpecification } from '../workspace/boardSpecifications';
import { getPart } from '../catalog/catalog';
import { electricalNets, endpointKey, logicalPorts } from '../schematic/model';
import { reviewPhysicalConnections } from './physicalValidation';
import type { DesignFinding } from './insights';
import type { HardwareComponent, Project } from '../types/workspace';

const controller = (c: HardwareComponent) =>
  c.type === 'microcontroller' || Boolean(getPart(c.catalogId)?.architecture);
const functional = (c: HardwareComponent) =>
  ['sensor', 'fan', 'microcontroller', 'mosfet'].includes(c.type);

/** Conservative, actionable concept-level checks. No inference of real pin numbers or signal integrity. */
export function reviewElectrical(project: Project): DesignFinding[] {
  const findings: DesignFinding[] = [];
  const wires = project.connections ?? [];
  const nets = electricalNets(project);
  const netMap = new Map<string, number>();
  nets.forEach((net, index) => net.terminals.forEach((key) => netMap.set(key, index)));
  const components = new Map(project.components.map((c) => [c.id, c]));
  const roles = new Map<string, ReturnType<typeof logicalPorts>[number]['kind']>();
  for (const c of project.components)
    for (const port of logicalPorts(c))
      roles.set(endpointKey({ componentId: c.id, portId: port.id }), port.kind);

  for (const net of nets) {
    const kinds = new Set(net.terminals.map((key) => roles.get(key)));
    if (kinds.has('power') && kinds.has('ground'))
      findings.push({
        id: `net-shorted:${net.name}`,
        severity: 'warning',
        status: 'fail',
        componentId: net.terminals[0].split(':')[0],
        remedy:
          'Remove the direct supply-to-ground wire and review the source and return topology.',
        title: 'Supply and ground share a logical net',
        details: `The conceptual ${net.name} joins power and ground terminals. Check for an accidental direct connection before powering hardware. Exact physical pinouts are unverified.`,
      });
  }
  // A signal hard-wired onto a supply/ground net needs investigation; a pull-up
  // normally has an intervening resistor, which this logical netlist would represent.
  for (const net of nets) {
    const kinds = new Set(net.terminals.map((key) => roles.get(key)));
    if (kinds.has('signal') && (kinds.has('power') || kinds.has('ground')))
      findings.push({
        id: `signal-supply:${net.name}`,
        severity: 'warning',
        title: 'Signal shares a supply rail',
        details: `A signal is wired directly into a power or ground net in ${net.name}. Verify this is intentional and safe for the actual device pins and bus.`,
      });
    const signalBoards = net.terminals
      .filter((key) => roles.get(key) === 'signal')
      .map((key) => components.get(key.slice(0, key.indexOf(':'))))
      .filter((c): c is HardwareComponent => Boolean(c))
      .map((c) => boardSpecification(project, c))
      .filter(
        (spec) => spec?.logicVoltage.status === 'verified' && spec.logicVoltage.value !== undefined,
      );
    const levels = new Set(signalBoards.map((spec) => spec!.logicVoltage.value));
    if (levels.size > 1)
      findings.push({
        id: `board-logic:${net.name}`,
        severity: 'warning',
        title: 'Development-board logic voltages differ',
        details: `This signal net joins boards with documented nominal logic levels of ${[...levels].join(' and ')} V. Check direction, input tolerance and level shifting against the field sources in Board Specifications. Nominal levels alone do not establish pin compatibility.`,
      });
    const supplyParts = net.terminals
      .filter((key) => roles.get(key) === 'power')
      .map((key) => getPart(components.get(key.slice(0, key.indexOf(':')))?.catalogId))
      .filter((part) => part?.voltageRange);
    for (let a = 0; a < supplyParts.length; a++)
      for (let b = a + 1; b < supplyParts.length; b++) {
        const first = supplyParts[a]!,
          second = supplyParts[b]!;
        if (
          Math.max(first.voltageRange![0], second.voltageRange![0]) >
          Math.min(first.voltageRange![1], second.voltageRange![1])
        ) {
          findings.push({
            id: `supply-range:${net.name}`,
            severity: 'warning',
            title: 'Possible supply-voltage range conflict',
            details: `${first.manufacturerPartNumber} and ${second.manufacturerPartNumber} list non-overlapping voltage ranges. Confirm the datasheets and what these supply terminals actually represent before connecting them.`,
          });
          break;
        }
      }
  }
  const signalConnected = (id: string) =>
    wires.some((wire) =>
      [wire.from, wire.to].some(
        (end) => end.componentId === id && roles.get(endpointKey(end)) === 'signal',
      ),
    );
  const powered = (id: string) =>
    ['power', 'ground'].every((kind) =>
      wires.some((wire) =>
        [wire.from, wire.to].some(
          (end) => end.componentId === id && roles.get(endpointKey(end)) === kind,
        ),
      ),
    );

  const controllers = project.components.filter(controller);
  const controllersWithSignals = controllers.filter((c) => signalConnected(c.id));
  for (const c of project.components) {
    if (!c.catalogId || logicalPorts(c).length) continue;
    findings.push({
      id: `terminals-unmodeled:${c.id}`,
      severity: 'info',
      title: `${c.reference}: schematic terminals not modeled`,
      details:
        'This catalog component is available for 3D placement, but its logical terminals are not defined. Verify its datasheet and build an appropriate connection model before checking communication.',
      componentId: c.id,
    });
  }
  for (const c of project.components.filter(functional)) {
    const ports = logicalPorts(c);
    if (!ports.length) continue;
    if (['sensor', 'microcontroller'].includes(c.type) && !powered(c.id))
      findings.push({
        id: `power-unconfirmed:${c.id}`,
        severity: 'info',
        title: `${c.reference}: supply and ground not fully connected`,
        details:
          'Connect symbolic VDD/GND as appropriate. Confirm real supply voltage, power budget and package pin assignments against datasheets.',
        componentId: c.id,
      });
    if (c.type === 'sensor' && !signalConnected(c.id))
      findings.push({
        id: `data-unconnected:${c.id}`,
        severity: 'warning',
        title: `${c.reference}: no data connection recorded`,
        details:
          'The sensor has no schematic signal wire. Its measurements cannot be considered linked to a controller yet.',
        componentId: c.id,
      });
    if (
      c.type === 'fan' &&
      !wires.some((wire) => [wire.from, wire.to].some((end) => end.componentId === c.id))
    )
      findings.push({
        id: `fan-unconnected:${c.id}`,
        severity: 'warning',
        title: `${c.reference}: fan unconnected`,
        details:
          'No logical power connection to this fan is recorded. A suitable driver, power source, current rating and flyback protection (if required) must be reviewed.',
        componentId: c.id,
      });
  }
  // A common concept topology is MCU GPIO -> MOSFET gate -> switched fan return.
  // This check is a design-review prompt, not a requirement for every possible driver design.
  const sameNet = (a: string, ap: string, b: string, bp: string) => {
    const lhs = netMap.get(endpointKey({ componentId: a, portId: ap }));
    return lhs !== undefined && lhs === netMap.get(endpointKey({ componentId: b, portId: bp }));
  };
  const switches = project.components.filter((c) => c.type === 'mosfet');
  for (const fan of project.components.filter((c) => c.type === 'fan')) {
    if (!switches.length || !controllers.length) continue;
    const hasSuggestedPath = switches.some(
      (sw) =>
        sameNet(fan.id, '-', sw.id, 'D') &&
        controllers.some((m) =>
          logicalPorts(m)
            .filter((p) => p.kind === 'signal')
            .some((pin) => sameNet(m.id, pin.id, sw.id, 'G')),
        ),
    );
    if (!hasSuggestedPath)
      findings.push({
        id: `fan-control:${fan.id}`,
        severity: 'info',
        title: `${fan.reference}: review controller-to-fan path`,
        details:
          'For a low-side MOSFET design, consider a controller signal to the gate and fan return to the drain, with appropriate source/ground, power and protection. Other driver topologies may be valid. No switching suitability has been verified.',
        componentId: fan.id,
      });
  }
  for (const c of project.components.filter((c) => c.type === 'sensor')) {
    // Require that a sensor signal and controller signal share a connected net, not merely any wire.
    const signalNets = logicalPorts(c)
      .filter((p) => p.kind === 'signal')
      .map((p) => netMap.get(endpointKey({ componentId: c.id, portId: p.id })))
      .filter((n) => n !== undefined);
    const linked = controllersWithSignals.some((m) =>
      logicalPorts(m)
        .filter((p) => p.kind === 'signal')
        .some((p) =>
          signalNets.includes(netMap.get(endpointKey({ componentId: m.id, portId: p.id })) ?? -1),
        ),
    );
    if (controllers.length && signalNets.length && !linked)
      findings.push({
        id: `controller-path:${c.id}`,
        severity: 'warning',
        title: `${c.reference}: no logical route to controller`,
        details:
          'The sensor has a wire, but no shared signal net with a controller. Inspect the schematic and intended bus topology.',
        componentId: c.id,
      });
    const sensorPart = getPart(c.catalogId);
    if (!sensorPart || !controllers.length) continue;
    if (sensorPart.interfaces.length === 0) continue;
    const controllerInterfaces = controllers.map((m) => {
      const spec = boardSpecification(project, m);
      return spec?.interfaces.status === 'verified'
        ? (spec.interfaces.value ?? [])
        : (getPart(m.catalogId)?.interfaces ?? []);
    });
    if (
      !controllerInterfaces.length ||
      controllerInterfaces.some((interfaces) => interfaces.length === 0)
    )
      continue;
    // Catalog interface strings are product-level capabilities, not verified physical connections.
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const sensorInterfaces = new Set(sensorPart.interfaces.map(norm));
    if (
      !controllerInterfaces.some((interfaces) =>
        interfaces.some((name) => sensorInterfaces.has(norm(name))),
      )
    )
      findings.push({
        id: `interface-review:${c.id}`,
        severity: 'info',
        title: `${c.reference}: interface compatibility needs review`,
        details:
          'No matching interface label is listed in the controller and sensor catalog entries. This does not prove incompatibility; confirm actual bus, voltage levels, pin mapping and firmware support.',
        componentId: c.id,
      });
  }
  if (!wires.length && project.components.some(functional))
    findings.push({
      id: 'no-functional-wiring',
      severity: 'warning',
      title: 'Controller communication not yet established',
      details:
        'Component proximity and 3D arrangement do not create data, power, or control paths. Define logical connections in Schematic, then verify physical pins.',
    });
  if (wires.length)
    findings.push({
      id: 'unverified-pinout',
      severity: 'info',
      title: 'Physical pin mapping and electrical ratings incompletely verified',
      details:
        'Selected catalog parts now expose some manufacturer-sourced physical pins, but remaining symbolic terminals, GPIO drive limits, bus pull-ups, power budgets, EMI, antenna clearance and routed copper still require verification.',
    });
  // Protect against stale external references from imported/legacy data.
  if (wires.some((w) => !components.has(w.from.componentId) || !components.has(w.to.componentId)))
    findings.push({
      id: 'dangling-wires',
      severity: 'warning',
      title: 'Dangling schematic connections',
      details: 'One or more wires reference components no longer in the project.',
    });
  findings.push(...reviewPhysicalConnections(project));
  findings.push(...reviewCalculations(project), ...reviewDemoConnections(project));
  return findings.map((f) => ({
    ...f,
    remedy: f.remedy ?? 'Review the affected schematic net and supported component specifications.',
  }));
}
