import type { HardwareComponent, Project } from '../types/workspace';
import { getPart } from './catalog';
import type { CatalogPart } from './types';
export type CompatibilityStatus = 'Compatible' | 'Incompatible' | 'Not Yet Verified';
export interface RuleResult {
  id: string;
  status: 'pass' | 'fail' | 'unknown';
  explanation: string;
  evidence: string[];
}
export interface CompatibilityResult {
  status: CompatibilityStatus;
  rules: RuleResult[];
  unverified: string[];
  nextAction: string;
  scope: string;
}
export interface IntegrationRequirements {
  instanceType?: string;
  socket?: string;
  supplyV?: number;
  interfaces?: string[];
  memoryGeneration?: string;
  footprint?: string;
  pinoutVerified?: boolean;
  mountingVerified?: boolean;
  boardSupportVerified?: boolean;
  architecture?: string;
}
export function evaluateCompatibility(
  part: CatalogPart,
  needs: IntegrationRequirements,
): CompatibilityResult {
  const evidence = part.sources.map((s) => s.url);
  const rules: RuleResult[] = [];
  const compare = (id: string, actual: string | undefined, required: string | undefined) => {
    rules.push({
      id,
      status: !actual || !required ? 'unknown' : actual === required ? 'pass' : 'fail',
      explanation: `${id}: candidate ${actual ?? 'unknown'}; required ${required ?? 'unknown'}.`,
      evidence,
    });
  };
  compare('Component type', part.instanceType, needs.instanceType);
  if (part.socket || needs.socket) compare('Processor socket', part.socket, needs.socket);
  if (part.memoryGeneration || needs.memoryGeneration)
    compare('Memory generation', part.memoryGeneration, needs.memoryGeneration);
  compare('Footprint', part.package, needs.footprint);
  if (part.architecture || needs.architecture)
    compare('Firmware target', part.architecture, needs.architecture);
  rules.push({
    id: 'Supply voltage',
    status:
      needs.supplyV === undefined || !part.voltageRange
        ? 'unknown'
        : needs.supplyV >= part.voltageRange[0] && needs.supplyV <= part.voltageRange[1]
          ? 'pass'
          : 'fail',
    explanation: `Supply: required ${needs.supplyV ?? 'unknown'} V; candidate range ${part.voltageRange?.join('–') ?? 'unknown'} V.`,
    evidence,
  });
  rules.push({
    id: 'Required interfaces',
    status:
      !needs.interfaces || !part.interfaces.length
        ? 'unknown'
        : needs.interfaces.every((i) => part.interfaces.includes(i))
          ? 'pass'
          : 'unknown',
    explanation: `Required: ${needs.interfaces?.join(', ') ?? 'unknown'}; curated interfaces: ${part.interfaces.join(', ') || 'unknown'}. An unlisted interface is not proof of absence.`,
    evidence,
  });
  for (const [id, verified] of [
    ['Pin assignment / available pins', needs.pinoutVerified],
    ['Physical mounting / clearance', needs.mountingVerified],
    ['Board integration / drivers / power budget', needs.boardSupportVerified],
  ] as const) {
    rules.push({
      id,
      status: verified === true ? 'pass' : verified === false ? 'fail' : 'unknown',
      explanation:
        verified === true
          ? `${id}: verified by integration profile.`
          : `${id}: ${verified === false ? 'known constraint violated' : 'requires board-level review'}.`,
      evidence: ['Integration profile; the demo has no verified netlist or footprint contract.'],
    });
  }
  const status = rules.some((r) => r.status === 'fail')
    ? 'Incompatible'
    : rules.some((r) => r.status === 'unknown')
      ? 'Not Yet Verified'
      : 'Compatible';
  return {
    status,
    rules,
    unverified: rules.filter((r) => r.status === 'unknown').map((r) => r.id),
    scope: 'Only the defined integration profile; not certification or circuit simulation.',
    nextAction:
      status === 'Compatible'
        ? 'Review the full board design before manufacture.'
        : 'Verify the footprint, pin map, supply, interfaces, mounting and target-specific firmware before electrical integration.',
  };
}
export function projectRequirements(
  project: Project,
  existing?: HardwareComponent,
): IntegrationRequirements {
  const target = project.components.find((c) => c.id === (project.firmwareTargetId ?? 'mcu'));
  const current = getPart(existing?.catalogId);
  return {
    instanceType: existing?.type,
    socket: current?.socket,
    memoryGeneration: current?.memoryGeneration,
    architecture:
      existing?.id === target?.id
        ? (getPart(target?.catalogId)?.architecture ?? 'ARM Cortex-M3')
        : undefined,
  };
}
export function canReplace(existing: HardwareComponent | undefined, part: CatalogPart) {
  return (
    !!existing &&
    part.insertionSupported &&
    existing.type === part.instanceType &&
    (!existing.catalogId || getPart(existing.catalogId)?.subcategory === part.subcategory) &&
    (existing.id === 'mcu' ||
      existing.id === 'sensor' ||
      existing.id === 'mosfet' ||
      !!existing.catalogId)
  );
}
export function hardwareBuildState(project: Project): {
  status: 'demo' | 'stale' | 'incompatible';
  target: string;
  explanation: string;
} {
  const target = project.components.find((c) => c.id === (project.firmwareTargetId ?? 'mcu'));
  const part = getPart(target?.catalogId);
  if (!target)
    return {
      status: 'incompatible',
      target: 'No firmware target',
      explanation: 'Select a processor target; the recorded demo build has no matching target.',
    };
  if (!part && project.boardTemplateId !== 'blank-92')
    return {
      status: 'demo',
      target: 'Demo MCU · ARM Cortex-M3',
      explanation: 'Recorded build for the original conceptual controller.',
    };
  const same = !part || part.architecture === 'ARM Cortex-M3';
  return {
    status: same ? 'stale' : 'incompatible',
    target: part
      ? `${part.name} · ${part.architecture ?? 'architecture unknown'}`
      : 'Demo MCU · blank concept PCB',
    explanation: same
      ? 'Hardware configuration changed. Board initialization and pin mapping need review and a new target build. C source is preserved.'
      : 'The selected hardware target differs from the recorded Cortex-M3 build. The old artifacts do not validate this target. C source is preserved.',
  };
}
