import type { Project } from '../types/workspace';
import type { DesignFinding } from './insights';
import { boardSpecification } from '../workspace/boardSpecifications';
import { demoPins } from './demoElectrical';
import { electricalNets, endpointKey, logicalPorts } from '../schematic/model';

/** All arithmetic is local and deterministic. Inputs belong to actual component instances. */
export function reviewCalculations(project: Project): DesignFinding[] {
  const findings: DesignFinding[] = [];
  const inputs = project.engineeringInputs ?? {};
  const loads = project.components.filter(
    (c) => c.id !== 'pcb' && logicalPorts(c).some((p) => p.kind === 'power'),
  );
  const known = loads.filter(
    (c) => inputs[c.id]?.currentMa !== undefined && inputs[c.id]?.voltage !== undefined,
  );
  const missing = loads.filter((c) => !known.includes(c));
  const totalMa = known.reduce((sum, c) => sum + inputs[c.id].currentMa!, 0);
  const totalW = known.reduce(
    (sum, c) => sum + (inputs[c.id].currentMa! * inputs[c.id].voltage!) / 1000,
    0,
  );
  const budget = project.boardConfiguration?.currentBudgetMa;
  const supply = project.boardConfiguration?.supplyVoltage;
  const sameRail = known.every((c) => inputs[c.id].voltage === supply);
  if (known.length) {
    const over = sameRail && budget !== undefined && totalMa > budget;
    findings.push({
      id: 'power-budget',
      severity: over ? 'warning' : 'info',
      status: over
        ? 'fail'
        : missing.length || budget === undefined || !sameRail
          ? 'unknown'
          : 'pass',
      title: 'Demonstration calculation · supply budget',
      componentId: 'pcb',
      details: `${known.length}/${loads.length} loads specified: ${totalW.toFixed(3)} W; ${totalMa.toFixed(1)} mA${sameRail ? ` at ${supply} V` : ' across different or unspecified rails (currents cannot be compared to a single supply budget)'}. Budget: ${budget ?? 'unspecified'} mA. ${missing.length} load(s) missing inputs. Arithmetic only; no hardware safety established.`,
      remedy: over
        ? 'Reduce loads or configure a sufficient supply budget and verify real ratings.'
        : 'Enter every load and use the same supply rail before interpreting the budget comparison.',
    });
  }
  for (const c of project.components) {
    const i = inputs[c.id];
    if (
      !i ||
      i.dissipationW === undefined ||
      i.thermalResistance === undefined ||
      i.ambientC === undefined
    )
      continue;
    const estimate = i.ambientC + i.dissipationW * i.thermalResistance;
    const fail = i.maxTemperatureC !== undefined && estimate > i.maxTemperatureC;
    findings.push({
      id: `thermal:${c.id}`,
      severity: fail ? 'warning' : 'info',
      status: i.maxTemperatureC === undefined ? 'unknown' : fail ? 'fail' : 'pass',
      componentId: c.id,
      title: `${c.reference}: demonstration thermal estimate`,
      details: `T ≈ ${i.ambientC} °C + ${i.dissipationW} W × ${i.thermalResistance} °C/W = ${estimate.toFixed(1)} °C. ${i.maxTemperatureC === undefined ? 'No temperature limit configured.' : `Configured limit: ${i.maxTemperatureC} °C.`} ${i.provenance === 'demo' ? 'Sample' : 'User-configured'} steady-state inputs; enclosure, airflow and transients unmodeled.`,
      remedy:
        'Verify actual dissipation and thermal resistance in the intended mounting conditions; reduce dissipation or improve cooling if over budget.',
    });
  }
  return findings;
}

export function reviewDemoConnections(project: Project): DesignFinding[] {
  const findings: DesignFinding[] = [];
  const nets = electricalNets(project);
  const netOf = (componentId: string, portId: string) =>
    nets.findIndex((n) => n.terminals.includes(endpointKey({ componentId, portId })));
  const byId = new Map(project.components.map((c) => [c.id, c]));
  for (const net of nets) {
    const terminals = net.terminals.flatMap((key) => {
      const split = key.indexOf(':');
      const c = byId.get(key.slice(0, split));
      const pin = c && demoPins(c).find((p) => p.id === key.slice(split + 1));
      return c && pin ? [{ c, pin }] : [];
    });
    const outputs = terminals.filter((t) => t.pin.direction === 'output');
    if (outputs.length > 1)
      findings.push({
        id: `demo-output:${net.name}`,
        status: 'fail',
        severity: 'warning',
        componentId: outputs[0].c.id,
        title: 'Demo check · conflicting driven outputs',
        details: 'Multiple demo output drivers share a net.',
        remedy: 'Connect one driver to inputs; review actual pin modes.',
      });
    for (let a = 0; a < terminals.length; a++)
      for (let b = a + 1; b < terminals.length; b++) {
        const x = terminals[a],
          y = terminals[b];
        if (!x.pin.protocol || !y.pin.protocol || x.c.id === y.c.id) continue;
        const compatible =
          x.pin.protocol === y.pin.protocol &&
          (x.pin.protocol === 'UART'
            ? x.pin.signal !== y.pin.signal
            : x.pin.signal === y.pin.signal);
        findings.push({
          id: `demo-interface:${net.name}:${a}:${b}`,
          status: compatible ? 'pass' : 'fail',
          severity: compatible ? 'info' : 'warning',
          componentId: y.c.id,
          title: `Demo check · ${compatible ? 'matching' : 'incompatible'} interface functions`,
          details: `${x.c.reference} ${x.pin.protocol}/${x.pin.signal} → ${y.c.reference} ${y.pin.protocol}/${y.pin.signal}. Conceptual pin assignments only.`,
          remedy:
            'Use matching bus functions (UART TX to RX); verify physical pins, voltage and firmware configuration.',
        });
      }
  }
  for (const c of project.components) {
    const all = logicalPorts(c);
    if (!all.length) continue;
    for (const kind of ['power', 'ground'] as const) {
      if (!all.some((p) => p.kind === kind)) continue;
      const connected = all.some((p) => p.kind === kind && netOf(c.id, p.id) >= 0);
      findings.push({
        id: `required-${kind}:${c.id}`,
        status: connected ? 'pass' : 'fail',
        severity: connected ? 'info' : 'warning',
        componentId: c.id,
        title: `${c.reference}: ${connected ? 'recorded' : 'missing'} ${kind} connection`,
        details:
          'Checks presence of a schematic wire only; does not prove that the net supplies power or a valid return.',
        remedy: `Connect the intended ${kind} terminal and verify the source/return topology.`,
      });
    }
    const required = demoPins(c).filter(
      (p) => p.kind === 'signal' && (c.type === 'sensor' || c.catalogId === 'drv8833'),
    );
    // Once using demo signals, require all modeled lanes to reach the matching controller function.
    if (!required.some((p) => netOf(c.id, p.id) >= 0)) continue;
    for (const pin of required) {
      const net = netOf(c.id, pin.id);
      const linked =
        net >= 0 &&
        project.components.some(
          (m) =>
            m.id !== c.id &&
            (m.type === 'microcontroller' || boardSpecification(project, m)?.controller.value) &&
            demoPins(m).some(
              (p) =>
                p.protocol === pin.protocol && p.signal === pin.signal && netOf(m.id, p.id) === net,
            ),
        );
      findings.push({
        id: `required-signal:${c.id}:${pin.id}`,
        status: linked ? 'pass' : 'fail',
        severity: linked ? 'info' : 'warning',
        componentId: c.id,
        title: `Demo check · ${c.reference} ${pin.signal} controller path ${linked ? 'recorded' : 'missing'}`,
        details:
          'Checks a shared logical net and matching signal function, not physical proximity or working communication.',
        remedy: 'Connect every required signal to its matching controller function.',
      });
    }
  }
  return findings;
}
