import { catalog, getPart } from '../../catalog/catalog';
import { logicalPorts } from '../../schematic/model';
import { buildPCBConnectivity } from '../../workspace/pcbConnectivity';
import { inspectProject } from '../snapshot';
import { sourceRevision } from '../../firmware/model';
import type { Project } from '../../types/workspace';
import type { ProjectIntent, ExplanationMode } from '../memory';
import { redactSecrets } from '../privacy';
import {
  stages,
  type BuildPlan,
  type PlanStage,
  type PlanStep,
  type Recommendation,
} from './schema';

function recommend(project: Project, goal: ProjectIntent): Recommendation[] {
  const identity = `${goal.intended_function} ${goal.primary_goal}`;
  const distance = /object.*(distance|detection)|distance.*object/i.test(identity);
  const profile = distance
    ? {
        role: 'distance sensor',
        pattern: /time.of.flight|ultrasonic|lidar|range.?finder|distance sensor/i,
        advice:
          'Start by evaluating time-of-flight sensing, which times reflected light. Ultrasonic sensing times a sound echo and is an alternative. Check the required range and environment in manufacturer documentation; sunlight, target surfaces and angles can affect results. No 2-meter capability is verified.',
      }
    : /temperature|humidity|environment/i.test(identity)
      ? {
          role: 'measurement sensor',
          pattern: /temperature sensor|local temperature|humidity.*temperature/i,
          advice:
            'Choose a sensor for the stated quantity and accuracy. Confirm its operating conditions and interface in manufacturer documentation.',
        }
      : /wireless.*power/i.test(identity)
        ? {
            role: 'wireless power system',
            pattern: /wireless power|inductive charg/i,
            advice:
              'Choose a documented transmitter and receiver pair. Confirm required power, alignment and heating limits before planning connections.',
          }
        : /wireless|bluetooth|wi-fi/i.test(identity)
          ? {
              role: 'wireless communication',
              pattern: /wireless|wi-fi|bluetooth/i,
              advice:
                'Choose a radio or controller with the required communication protocol; confirm power consumption and antenna constraints.',
            }
          : /motor|robot/i.test(identity)
            ? {
                role: 'motor driver',
                pattern: /motor direction|motor driver|h-bridge/i,
                advice:
                  'Choose a motor driver after checking the motor supply and stall current. A controller pin cannot directly power a motor.',
              }
            : /display/i.test(identity)
              ? {
                  role: 'display',
                  pattern: /display/i,
                  advice:
                    'Choose a display with a documented controller interface and power requirements.',
                }
              : {
                  role: 'function-specific hardware',
                  pattern: null,
                  advice:
                    'Identify the input or output device needed for this objective and obtain its manufacturer documentation before selecting a part.',
                };
  const make = (role: string, matches: typeof catalog, advice: string): Recommendation => {
    const present = project.components.find((c) => matches.some((p) => p.id === c.catalogId));
    const part = present ? getPart(present.catalogId) : matches.find((p) => p.insertionSupported);
    return {
      role,
      name: part?.name ?? role,
      availability: present ? 'present' : part ? 'addable' : 'unavailable',
      qualification: 'unverified',
      catalog_id: part?.id ?? null,
      entity_ids: present
        ? project.components.filter((c) => c.catalogId === part?.id).map((c) => c.id)
        : [],
      reason: advice.slice(0, 500),
    };
  };
  const controller = make(
    'controller',
    catalog.filter(
      (p) => p.architecture && (p.instanceType === 'microcontroller' || p.category === 'boards'),
    ),
    'The controller runs the program and reads or controls connected hardware. A bare chip needs support circuitry; confirm supply, interface and physical pins for the actual part. Existing hardware is a candidate, not verified compatibility.',
  );
  const candidates = profile.pattern
    ? catalog.filter((p) => profile.pattern!.test(`${p.name} ${p.description} ${p.useCase}`))
    : [];
  return [controller, make(profile.role, candidates, profile.advice)];
}
const definitions: [string, string, string, string][] = [
  [
    'Confirm the objective',
    'Describe what the device should do and the numbers it must meet. Keep units with each number.',
    'Define measurable acceptance limits, operating environment and tolerances.',
    'Record the function, range, accuracy and operating conditions.',
  ],
  [
    'Review existing hardware',
    'Check what you already have. A part placed in the editor is not yet a working circuit.',
    'Confirm catalog identities, packages and required support circuitry.',
    'Confirm the actual controller and reusable hardware identities.',
  ],
  [
    'Resolve missing hardware',
    'Find the missing parts and their documentation. An unavailable part cannot be added by Nexora.',
    'Obtain a supported device record with source-backed specifications; do not substitute a different sensing function.',
    'All required roles have a suitable candidate present in the project.',
  ],
  [
    'Check component compatibility',
    'Check that the parts can safely work together before connecting them.',
    'Review supply ranges, logic levels, protocol, timing and physical pin provenance against manufacturer documents.',
    'Record documentation supporting operating range, interfaces and compatibility.',
  ],
  [
    'Plan power and signals',
    'Voltage is the electrical potential supplied to a part. Ground is its common reference. Check power needs before connecting signals.',
    'Calculate supply/current budgets and check decoupling, level shifting and pull-up requirements.',
    'Record supply voltage, current budget, ground scheme and signal-level compatibility.',
  ],
  [
    'Implement the schematic',
    'Use Schematic to record intended connections. If using I²C, a two-wire data bus, verify the sensor’s data and clock pins. Pull-up resistors hold those lines high when idle. GPIO means a programmable input/output pin.',
    'Map documented physical supply, ground and protocol terminals. Symbolic terminals are not verified physical pins; inspect net assignments and electrical findings.',
    'Verify each required supply, ground and signal connection against documented physical terminals.',
  ],
  [
    'Review PCB placement and layout',
    'Place parts and check their connection guides. Airwires show connections still needing copper; they are not copper traces.',
    'Review pad-to-terminal bindings, nets, layer sides, clearance assumptions and remaining airwires. Routing must be completed and checked in an external PCB tool.',
    'Review placement and record external routing/DRC evidence; Nexora does not route copper.',
  ],
  [
    'Develop and verify firmware',
    'Write the controller program to read or drive your device, report results and handle errors. Existing text in the editor is not a tested program.',
    'Confirm target architecture and schematic pin assignments; implement peripheral drivers, compile for the actual target and test outside Nexora.',
    'Record a target-specific build and real-device firmware test; source existence alone is insufficient.',
  ],
  [
    'Test the physical device',
    'Test the real device against known inputs and your original requirements. Start with safe power checks, then test expected and failure conditions.',
    'Record calibration, repeatability, accuracy, environmental limits and failure behavior using measured evidence.',
    'Record physical measurements against each numerical requirement, including units and conditions.',
  ],
];
export function createBuildPlan(
  project: Project,
  goal: ProjectIntent,
  previous?: BuildPlan,
  firmware = project.firmwareSource ?? '',
): BuildPlan {
  const recommendations = recommend(project, goal);
  const relevant = recommendations.flatMap((r) => r.entity_ids);
  const missing = recommendations.filter((r) => r.availability !== 'present');
  const unavailable = missing.filter((r) => r.availability === 'unavailable');
  const pcb = buildPCBConnectivity(project);
  const findings = inspectProject(project, firmware);
  const verifiedIssues = findings.filter(
    (f) =>
      f.classification === 'verified-issue' &&
      !f.id.startsWith('firmware:') &&
      f.entities.some((e) => relevant.includes(e.id)),
  );
  const validTarget = project.components.some(
    (c) =>
      c.id === project.firmwareTargetId &&
      Boolean(getPart(c.catalogId)?.architecture || c.type === 'microcontroller'),
  );
  const ports = project.components
    .filter((c) => relevant.includes(c.id))
    .flatMap((c) => logicalPorts(c));
  const relevantWires = (project.connections ?? []).filter(
    (w) => relevant.includes(w.from.componentId) && relevant.includes(w.to.componentId),
  );
  const isolated = relevant.filter(
    (id) => !relevantWires.some((w) => w.from.componentId === id || w.to.componentId === id),
  );
  const goalKey = (g: ProjectIntent) =>
    JSON.stringify([
      g.primary_goal,
      g.intended_function,
      g.requirements,
      g.corrections,
      g.decisions,
    ]);
  const goalFingerprint = sourceRevision(goalKey(goal));
  const changed = previous && previous.goal_fingerprint !== goalFingerprint;
  const hardware = project.components.map((c) => ({
    id: c.id,
    catalogId: c.catalogId,
    footprint: c.footprint,
  }));
  const evidence: Record<PlanStage, string[]> = {
    objective: [goal.primary_goal, ...goal.requirements],
    inventory: project.components
      .filter((c) => c.id !== 'pcb' && c.type !== 'housing')
      .map(
        (c) =>
          `${c.name} (${c.id}); ${c.catalogId ? `catalog ${c.catalogId}` : 'concept, identity unverified'}`,
      ),
    missing: recommendations.map((r) => `${r.role}: ${r.name} — ${r.availability}`),
    selection: recommendations.map(
      (r) =>
        `${r.name}: compatibility unverified; ${r.catalog_id ? (getPart(r.catalog_id)?.verificationStatus ?? 'unknown') : 'no catalog identity'}`,
    ),
    power: findings
      .filter((f) => /supply|power|voltage|current/i.test(f.title))
      .map((f) => `${f.id}: ${f.title} — ${f.classification}`),
    schematic: [
      `${relevantWires.length} recorded connections between required project entities. ${isolated.length} required entities have no relevant connections.`,
      `${ports.filter((p) => p.verification === 'physical').length}/${ports.length} terminals have documented physical mappings. Connections do not establish electrical correctness.`,
    ],
    pcb: [
      `${pcb.pads.length} pads; ${pcb.nets.length} nets; ${pcb.airwires.length} remaining airwires. Copper routing is unavailable.`,
      ...pcb.checks.slice(0, 3).map((c) => c.title),
    ],
    firmware: [
      `${firmware.trim() ? 'Source exists' : 'No source recorded'}; target ${project.firmwareTargetId ?? 'not explicitly associated'}. No compiler or hardware test has run in Nexora.`,
    ],
    testing: ['No physical test evidence is available from the editor.'],
  };
  const unresolved: Record<PlanStage, string[]> = {
    objective: goal.requirements.length
      ? []
      : ['Add measurable requirements and operating conditions.'],
    inventory: [],
    missing: missing.map((r) =>
      r.availability === 'unavailable'
        ? `${r.role}: unavailable in the catalog. Obtain documented hardware; request a verified catalog addition or prototype externally.`
        : `${r.name} is addable but not present. Review compatibility, then request an approved addition.`,
    ),
    selection: missing.length
      ? ['Required hardware has not been selected and placed.']
      : ['Manufacturer compatibility review required.'],
    power: missing.length
      ? ['Required hardware missing; its power and signal requirements are unknown.']
      : ['Supply/current budgets and signal levels require user verification.'],
    schematic: missing.length
      ? ['Required hardware missing.']
      : isolated.length
        ? ['Relevant schematic wiring is incomplete.']
        : [
            'Verify all required supply, ground and signal connections, not just the recorded lines.',
          ],
    pcb: ['Unrouted design: no copper-routing implementation in Nexora.'],
    firmware: !project.firmwareTargetId
      ? ['Associate source with the intended controller; compilation and testing remain external.']
      : ['Compile and test the exact source on the associated target externally.'],
    testing: ['Measure real hardware against the stated requirements.'],
  };
  for (const stage of ['selection', 'power', 'schematic'] as const) {
    evidence[stage].push(...verifiedIssues.map((f) => `${f.id}: ${f.title} — source-backed issue`));
    unresolved[stage].push(...verifiedIssues.slice(0, 4).map((f) => f.remedy.slice(0, 500)));
  }
  const deps: PlanStage[][] = [
    [],
    [],
    ['inventory'],
    ['missing'],
    ['selection'],
    ['power'],
    ['schematic'],
    ['schematic'],
    ['pcb', 'firmware'],
  ];
  const stamps = [
    goalKey(goal),
    JSON.stringify(hardware),
    JSON.stringify([hardware, recommendations]),
    JSON.stringify([goalKey(goal), hardware]),
    JSON.stringify([goalKey(goal), hardware, project.engineeringInputs]),
    JSON.stringify([goalKey(goal), hardware, project.connections]),
    JSON.stringify([
      goalKey(goal),
      hardware,
      project.connections,
      project.boardConfiguration,
      project.components.map((c) => [c.id, c.position, c.rotation, c.side]),
    ]),
    JSON.stringify([
      goalKey(goal),
      hardware,
      project.connections,
      project.firmwareTargetId,
      firmware,
    ]),
    JSON.stringify([
      goalKey(goal),
      hardware,
      project.connections,
      project.boardConfiguration,
      firmware,
    ]),
  ];
  let omitted = goal.omitted_entries + Math.max(0, pcb.checks.length - 3);
  const steps: PlanStep[] = stages.map((id, index) => {
    const old = previous?.steps.find((s) => s.id === id);
    const fingerprint = sourceRevision(stamps[index]);
    const verification = old?.verification ?? null;
    const hardBlock =
      (['missing', 'selection', 'power', 'schematic'].includes(id) && missing.length > 0) ||
      (id === 'schematic' && isolated.length > 0) ||
      (['selection', 'power', 'schematic'].includes(id) && verifiedIssues.length > 0) ||
      (id === 'firmware' && (!validTarget || !firmware.trim()));
    let status: PlanStep['status'] = hardBlock
      ? 'blocked'
      : id === 'objective' || id === 'inventory'
        ? 'in_progress'
        : 'needs_verification';
    if (verification && !hardBlock)
      status = verification.fingerprint === fingerprint ? 'completed' : 'needs_verification';
    if (old && changed && id !== 'inventory' && !hardBlock) status = 'needs_verification';
    if (evidence[id].length > 12) omitted += evidence[id].length - 12;
    return {
      id,
      stage: id,
      title: definitions[index][0],
      explanation: definitions[index][1],
      technical: definitions[index][2],
      criteria: [definitions[index][3]],
      dependencies: deps[index],
      entities: relevant.slice(0, 16),
      evidence: evidence[id].slice(0, 12).map((s) => redactSecrets(s).slice(0, 500)),
      assumptions: ['Catalog presence and user verification are not an electrical certification.'],
      unresolved: unresolved[id],
      status,
      fingerprint,
      verification,
    };
  });
  // Dependencies are explicit gates. An old user check cannot bypass an reopened prerequisite.
  for (const step of steps)
    if (step.dependencies.some((id) => steps.find((s) => s.id === id)?.status !== 'completed')) {
      if (step.status === 'completed') step.status = 'needs_verification';
      if (step.status !== 'blocked')
        step.unresolved = [
          ...step.unresolved,
          'Verify prerequisite steps before marking this step complete.',
        ];
    }
  const next =
    steps.find((s) => s.id === 'missing' && s.status === 'blocked') ??
    steps.find((s) => s.status !== 'completed') ??
    steps.at(-1)!;
  if (unavailable.length)
    steps[2].explanation +=
      ' Missing catalog hardware blocks in-editor implementation; finding and checking a real device is a useful next step.';
  const plan: BuildPlan = {
    version: 1,
    goal: structuredClone(goal),
    goal_revision: (previous?.goal_revision ?? 1) + (changed ? 1 : 0),
    goal_fingerprint: goalFingerprint,
    recommendations,
    steps,
    next_step_id: next.id,
    omitted: omitted + Math.max(0, relevant.length - 16),
  };
  // Preserve the objective and first/latest requirements when unusual text exceeds the byte budget.
  while (new TextEncoder().encode(JSON.stringify(plan)).length > 60000) {
    const list = [
      plan.goal.unknowns,
      plan.goal.decisions,
      plan.goal.corrections,
      plan.goal.requirements,
    ].find((a) => a.length > 2);
    if (list) {
      list.splice(1, 1);
      plan.omitted++;
    } else if (plan.goal.proposed_next_steps) {
      plan.goal.proposed_next_steps = '';
      plan.omitted++;
    } else
      throw new Error(
        'Build Plan exceeds its bounded storage budget. Shorten the objective or requirements.',
      );
  }
  return plan;
}
export function verifyStep(
  plan: BuildPlan,
  id: PlanStage,
  note: string,
  complete: boolean,
): BuildPlan {
  const result = structuredClone(plan),
    step = result.steps.find((s) => s.id === id)!;
  if (
    complete &&
    (step.status === 'blocked' ||
      step.dependencies.some(
        (dep) => result.steps.find((s) => s.id === dep)?.status !== 'completed',
      ))
  )
    throw new Error('Resolve missing evidence and verify prerequisite steps first.');
  if (complete && !note.trim())
    throw new Error('Record what you checked before marking this step verified.');
  step.verification = complete
    ? {
        source: 'user',
        note: redactSecrets(note).trim().slice(0, 500),
        fingerprint: step.fingerprint,
      }
    : null;
  step.status = complete ? 'completed' : 'not_started';
  return result;
}
export function stepGuidance(plan: BuildPlan, mode: ExplanationMode, id = plan.next_step_id) {
  const step = plan.steps.find((s) => s.id === id)!;
  const recommendation =
    id === 'missing' || id === 'selection'
      ? plan.recommendations.map((r) => `${r.name}: ${r.availability}. ${r.reason}`).join('\n\n')
      : '';
  return `${step.title}: ${mode === 'beginner' ? step.explanation : step.technical}\n\n${step.unresolved[0] ?? step.criteria[0]}${recommendation ? '\n\n' + recommendation : ''}\n\nCurrent project evidence: ${step.evidence.join(' ')}\n\nVerification: ${step.criteria[0]}`;
}
