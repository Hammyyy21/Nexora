import { footprintGap } from './placement';
import { boardSpecification } from '../workspace/boardSpecifications';
import { getPart } from '../catalog/catalog';
import { reviewElectrical } from './electrical';
import { assessPosition } from '../lib/transforms';
import type { Project } from '../types/workspace';

/** A design bill of materials, NOT a purchasing quote or fabrication-ready BOM. */
export interface BomLine {
  key: string;
  description: string;
  manufacturer: string;
  manufacturerPartNumber: string;
  references: string[];
  quantity: number;
  status: 'catalog' | 'concept';
  datasheet: string;
}

export interface DesignFinding {
  id: string;
  severity: 'warning' | 'info';
  /** A narrow finding status; 'pass' never certifies the entire assembly. */
  status?: 'pass' | 'fail' | 'unknown';
  source?: string;
  remedy?: string;
  title: string;
  details: string;
  componentId?: string;
}

export function buildBOM(project: Project): BomLine[] {
  const lines = new Map<string, BomLine>();
  for (const component of project.components) {
    const part = getPart(component.catalogId);
    // A concept board is included for visibility, not represented as an orderable PCB.
    const key = part ? `catalog:${part.id}` : `concept:${component.type}:${component.name}`;
    const existing = lines.get(key);
    if (existing) {
      existing.references.push(component.reference);
      existing.quantity++;
    } else {
      lines.set(key, {
        key,
        description: part?.name ?? component.name,
        manufacturer: part?.manufacturer ?? 'Unspecified',
        manufacturerPartNumber: part?.manufacturerPartNumber ?? 'Unspecified',
        references: [component.reference],
        quantity: 1,
        status: part ? 'catalog' : 'concept',
        datasheet: part?.datasheetUrl ?? '',
      });
    }
  }
  return [...lines.values()].sort((a, b) => a.description.localeCompare(b.description));
}

export function reviewDesign(project: Project): DesignFinding[] {
  const findings: DesignFinding[] = [];
  const board = project.components.find((c) => c.id === 'pcb');
  if (!board)
    findings.push({
      id: 'board-missing',
      severity: 'warning',
      title: 'No PCB in project',
      details: 'Board bounds and mounting clearances cannot be assessed.',
    });
  if (project.components.length === (board ? 1 : 0))
    findings.push({
      id: 'empty-design',
      severity: 'info',
      title: 'No functional components yet',
      details: 'Add components from the library to begin a hardware concept.',
    });
  for (const c of project.components) {
    const spec = boardSpecification(project, c);
    if (!spec) continue;
    const missing = [
      !spec.length.value && 'length',
      !spec.width.value && 'width',
      !spec.thickness.value && 'thickness',
      !spec.mountingHoles.value && 'mounting coordinates',
      !spec.fabrication.value && 'fabrication rules',
      spec.kind === 'development' && spec.logicVoltage.value === undefined && 'logic voltage',
      !spec.supply.value && 'supply ratings',
      !spec.connectorPositions.value && 'connector positions',
    ].filter(Boolean);
    if (missing.length)
      findings.push({
        id: `board-specifications:${c.id}`,
        severity: 'info',
        title: `${c.reference}: board specifications incomplete`,
        details: `${missing.join(', ')}: Not specified. Geometric checks cannot establish manufacturing or electrical suitability.`,
        componentId: c.id,
      });
  }
  const concept = project.components.filter((c) => !getPart(c.catalogId) && c.id !== 'pcb');
  if (concept.length)
    findings.push({
      id: 'concept-parts',
      severity: 'info',
      title: `${concept.length} concept component(s)`,
      details:
        'These objects have no exact manufacturer part mapping. Select actual catalog parts before purchasing or fabricating.',
    });
  for (const component of project.components) {
    if (component.id === 'pcb' || component.fixed || component.type === 'housing') continue;
    const assessment = assessPosition(project, component, component.position);
    if (!assessment.valid)
      findings.push({
        id: `placement:${component.id}`,
        severity: 'warning',
        title: `${component.reference}: invalid placement`,
        details: assessment.error ?? 'Placement violates the current board rules.',
        status: 'fail',
        remedy: 'Move the component inside the available board region or choose a larger board.',
        componentId: component.id,
      });
    // Only surface geometric findings. They are approximations, not actual copper clearance rules.
    for (const [index, warning] of assessment.warnings.entries())
      findings.push({
        id: `geometry:${component.id}:${index}`,
        severity: 'warning',
        title: `${component.reference}: placement review`,
        details: warning,
        status: 'fail',
        remedy:
          'Move the component away from occupied footprints, board edges, mounting holes and restricted regions.',
        componentId: component.id,
      });
    const part = getPart(component.catalogId);
    if (part && part.verificationStatus !== 'verified')
      findings.push({
        id: `specs:${component.id}`,
        severity: 'info',
        title: `${component.reference}: partial specifications`,
        details: `Catalog verification status: ${part.verificationStatus}. Confirm the exact part datasheet before electrical integration.`,
        componentId: component.id,
      });
  }
  if (board) {
    const parts = project.components.filter((c) => c.id !== 'pcb' && c.type !== 'housing');
    const spacing = project.boardConfiguration?.componentSpacing ?? 0;
    if (spacing > 0)
      for (let i = 0; i < parts.length; i++)
        for (let j = i + 1; j < parts.length; j++) {
          if ((parts[i].side ?? 'top') === (parts[j].side ?? 'top') && footprintGap(parts[i], parts[i].position, parts[j], board) * 10 < spacing)
            findings.push({
              id: `spacing:${parts[i].id}:${parts[j].id}`,
              status: 'fail',
              severity: 'warning',
              componentId: parts[i].id,
              title: `${parts[i].reference} / ${parts[j].reference}: configured spacing not met`,
              details: `Projected footprints are less than ${spacing} mm apart. Demo geometry check; approximate package bounds.`,
              remedy:
                'Separate the components or revise the configured spacing after mechanical review.',
            });
        }
    const occupancy =
      parts.reduce((sum, c) => sum + c.dimensions[0] * c.dimensions[2], 0) /
      (board.dimensions[0] * board.dimensions[2]);
    findings.push({
      id: 'layout-occupancy',
      status: occupancy > 0.7 ? 'fail' : 'pass',
      severity: occupancy > 0.7 ? 'warning' : 'info',
      componentId: 'pcb',
      title: 'Demo check · layout crowding',
      details: `Summed footprint area / board area: ${(occupancy * 100).toFixed(0)}%. Example crowding threshold: 70%; overlaps and off-board components are included.`,
      remedy: 'Spread components across available placement regions or select a larger board.',
    });
  }
  findings.push(...reviewElectrical(project));
  findings.push({
    id: 'no-netlist',
    severity: 'info',
    title: 'Electrical connectivity not verified',
    details: project.connections?.length
      ? `${project.connections.length} schematic wire(s) recorded. Some manufacturer pin and voltage checks may pass or fail for supported parts; complete pin mapping, routing, power integrity and electrical certification remain unverified.`
      : 'No logical schematic wires exist yet. Physical pin mappings, PCB traces and electrical rule checks are not verified.',
  });
  return findings.map((f) => ({
    ...f,
    remedy:
      f.remedy ??
      'Review the supported specifications and configure missing design inputs before evaluating this rule.',
  }));
}

const csvCell = (value: string | number) => {
  // Protect spreadsheet users from formula injection when opening an exported CSV.
  let text = String(value);
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
export function exportBOMCsv(project: Project): string {
  const header = [
    'Description',
    'Manufacturer',
    'MPN',
    'References',
    'Quantity',
    'Status',
    'Datasheet',
  ];
  const rows = buildBOM(project).map((line) => [
    line.description,
    line.manufacturer,
    line.manufacturerPartNumber,
    line.references.join(' '),
    line.quantity,
    line.status,
    line.datasheet,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
