import { applyPCBOperation, type PCBOperation } from '../workspace/pcbOperations';
import { validBoardConfiguration } from '../workspace/boardSpecifications';
import { validFootprint, snapPosition } from '../workspace/boardGeometry';
import { migrateProject } from '../workspace/migrations';
import { validateConnection, connectionLabel } from '../schematic/model';
import { suggestPlacements } from '../engineering/placement';
import { reviewDesign } from '../engineering/insights';
import { boardSpecification, specificationStatus } from '../workspace/boardSpecifications';
import type { Project, Vec3 } from '../types/workspace';
import { getPart } from '../catalog/catalog';
import { createInstance } from '../catalog/instances';
import { assessPosition, movable, validPosition } from '../lib/transforms';
import { cloneProject } from '../lib/project';
import { createProject, projectTemplates } from '../projects/templates';

export type AIAction =
  | PCBOperation
  | { type: 'add_component'; catalog_id: string; position?: Vec3 | null }
  | { type: 'move_component'; component_id: string; position: Vec3 }
  | { type: 'remove_component'; component_id: string }
  | { type: 'select_component'; component_id: string }
  | {
      type: 'connect_components';
      component_id: string;
      port_id: string;
      target_component_id: string;
      target_port_id: string;
    }
  | { type: 'generate_firmware'; component_id: string; source: string }
  | {
      type: 'review_project' | 'show_specifications' | 'suggest_placements';
      component_id?: string | null;
    }
  | { type: 'create_project'; template_id: string; project_name: string };

export function parseAIAction(value: unknown): AIAction {
  if (!value || typeof value !== 'object') throw new Error('Invalid AI action.');
  const v = value as Record<string, unknown>;
  const validId = (id: unknown): id is string =>
    typeof id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(id);
  const allowed = [
    'configuration', 'rotation', 'side', 'footprint',
    'type',
    'component_id',
    'catalog_id',
    'position',
    'template_id',
    'project_name',
    'port_id',
    'target_component_id',
    'target_port_id',
    'source',
  ];
  if (Object.keys(v).some((key) => !allowed.includes(key)))
    throw new Error('Unknown action fields.');
  const fields: Record<string, string[]> = {
    configure_board: ['configuration'],
    update_component: ['component_id','rotation','side','footprint'],
    duplicate_component: ['component_id'],
    add_component: ['catalog_id', 'position'],
    move_component: ['component_id', 'position'],
    remove_component: ['component_id'],
    select_component: ['component_id'],
    create_project: ['template_id', 'project_name'],
    connect_components: ['component_id', 'port_id', 'target_component_id', 'target_port_id'],
    generate_firmware: ['component_id', 'source'],
    review_project: ['component_id'],
    show_specifications: ['component_id'],
    suggest_placements: ['component_id'],
  };
  if (
    Object.entries(v).some(
      ([key, value]) => key !== 'type' && value != null && !fields[String(v.type)]?.includes(key),
    )
  )
    throw new Error('Unexpected arguments for this action.');
  switch (v.type) {
    case 'configure_board':
      if(!validBoardConfiguration(v.configuration)) break;
      return {type:v.type,configuration:structuredClone(v.configuration)};
    case 'duplicate_component':
      if(!validId(v.component_id)) break;
      return {type:v.type,component_id:v.component_id};
    case 'update_component': {
      if(!validId(v.component_id) || (v.side != null && !['top','bottom'].includes(String(v.side))) ||
        (v.footprint != null && !validFootprint(v.footprint)) ||
        (v.rotation != null && (!Array.isArray(v.rotation)||v.rotation.length!==3||v.rotation.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>360))) ||
        (v.side == null && v.footprint == null && v.rotation == null)) break;
      return {type:v.type,component_id:v.component_id,...(v.side?{side:v.side as 'top'|'bottom'}:{}),...(v.footprint?{footprint:v.footprint as import('../workspace/boardGeometry').Footprint}:{}),...(v.rotation?{rotation:v.rotation as Vec3}:{})};
    }

    case 'review_project':
    case 'show_specifications':
    case 'suggest_placements':
      if (v.component_id != null && !validId(v.component_id)) break;
      return { type: v.type, component_id: v.component_id as string | null };
    case 'connect_components':
      if (
        !validId(v.component_id) ||
        !validId(v.target_component_id) ||
        typeof v.port_id !== 'string' ||
        typeof v.target_port_id !== 'string' ||
        v.port_id.length > 100 ||
        v.target_port_id.length > 100
      )
        break;
      return {
        type: v.type,
        component_id: v.component_id,
        target_component_id: v.target_component_id,
        port_id: v.port_id,
        target_port_id: v.target_port_id,
      };
    case 'generate_firmware':
      if (
        !validId(v.component_id) ||
        typeof v.source !== 'string' ||
        !v.source.trim() ||
        v.source.length > 20000
      )
        break;
      return { type: v.type, component_id: v.component_id, source: v.source };
    case 'add_component':
      if (!validId(v.catalog_id) || (v.position != null && !validPosition(v.position))) break;
      return {
        type: 'add_component',
        catalog_id: v.catalog_id,
        position: (v.position as Vec3 | null) ?? null,
      };
    case 'move_component':
      if (!validId(v.component_id) || !validPosition(v.position)) break;
      return { type: 'move_component', component_id: v.component_id, position: v.position };
    case 'remove_component':
    case 'select_component':
      if (!validId(v.component_id)) break;
      return { type: v.type, component_id: v.component_id };
    case 'create_project':
      if (
        typeof v.project_name !== 'string' ||
        !v.project_name.trim() ||
        v.project_name.length > 100 ||
        !projectTemplates.some((t) => t.id === v.template_id)
      )
        break;
      return {
        type: 'create_project',
        template_id: v.template_id as string,
        project_name: v.project_name,
      };
  }
  throw new Error('The AI proposed an unknown or invalid operation.');
}
export interface ProposedRevision {
  project: Project;
  summary: string[];
  createNew: boolean;
}
export function previewAIChanges(current: Project, actions: readonly AIAction[]): ProposedRevision {
  if (!actions.length || actions.length > 5)
    throw new Error('AI must propose between 1 and 5 operations.');
  let project = cloneProject(current);
  const summary: string[] = [];
  actions = actions.map(parseAIAction);
  const createAction = actions.find((a) => a.type === 'create_project');
  if (createAction) {
    if (actions.length !== 1 || createAction.type !== 'create_project')
      throw new Error('Create-project cannot be combined with other actions.');
    const template = projectTemplates.find((t) => t.id === createAction.template_id);
    if (!template) throw new Error('Unknown template.');
    const newProject = createProject(createAction.project_name, template.id);
    return {
      project: newProject,
      summary: [`Create “${newProject.name}” from ${template.name}`],
      createNew: true,
    };
  }
  for (const raw of actions) {
    const action = parseAIAction(raw);
    switch (action.type) {
      case 'configure_board':
      case 'update_component':
      case 'duplicate_component':
        project=applyPCBOperation(project,action);
        summary.push(action.type==='configure_board'?`Configure PCB: ${action.configuration.length} × ${action.configuration.width} × ${action.configuration.thickness} mm, ${action.configuration.outline?.kind??'rounded-rectangle'}; ${action.configuration.mountingHoles.length} holes, ${action.configuration.restrictedRegions.length} keep-outs. Review layer settings and geometry.`:`${action.type==='duplicate_component'?'Duplicate':'Update placement / footprint of'} ${action.component_id}.`);
        break;

      case 'connect_components': {
        const from = { componentId: action.component_id, portId: action.port_id };
        const to = { componentId: action.target_component_id, portId: action.target_port_id };
        const error = validateConnection(project, from, to);
        if (error) throw new Error(error);
        project.connections = [
          ...(project.connections ?? []),
          { id: `wire-${crypto.randomUUID()}`, from, to },
        ];
        summary.push(`Connect ${connectionLabel(project, from)} → ${connectionLabel(project, to)}`);
        break;
      }
      case 'generate_firmware': {
        const c = project.components.find((c) => c.id === action.component_id);
        if (!c || !(c.type === 'microcontroller' || getPart(c.catalogId)?.architecture))
          throw new Error('Choose a supported controller for firmware.');
        project.firmwareTargetId = c.id;
        project.firmwareSource = action.source;
        summary.push(
          `Replace C source for ${c.name}. Review and edit the generated starter before approval; no compilation or execution.`,
        );
        break;
      }
      case 'review_project':
        summary.push(
          ...reviewDesign(project).map(
            (f) =>
              `${f.status?.toUpperCase() ?? 'UNKNOWN'}: ${f.title}. ${f.details} ${f.remedy ?? ''}`,
          ),
        );
        break;
      case 'show_specifications': {
        const c = project.components.find(
          (c) => c.id === (action.component_id ?? project.selectedComponentId ?? 'pcb'),
        );
        const spec = c && boardSpecification(project, c);
        if (!spec) throw new Error('Select a board with a specification record.');
        summary.push(
          ...Object.entries(spec).flatMap(([key, field]) =>
            field && typeof field === 'object' && 'value' in field && field.value !== undefined
              ? [
                  `${key}: ${JSON.stringify(field.value)} (${specificationStatus[field.status as keyof typeof specificationStatus]})`,
                ]
              : [],
          ),
        );
        break;
      }
      case 'suggest_placements': {
        const candidates = project.components
          .filter((c) => movable(c) && (!action.component_id || c.id === action.component_id))
          .slice(0, 3);
        for (const c of candidates) {
          const suggestion = suggestPlacements(project, c)[0];
          if (!suggestion) {
            summary.push(
              `${c.name}: no clear PCB region found. Manual placement remains available.`,
            );
            continue;
          }
          c.position = suggestion.position;
          summary.push(
            `Move ${c.name} to ${suggestion.position.map((n) => (n * 10).toFixed(1)).join(', ')} mm: ${suggestion.reason}`,
          );
        }
        break;
      }

      case 'add_component': {
        const catalogPart = getPart(action.catalog_id);
        if (!catalogPart?.insertionSupported)
          throw new Error('This catalog part cannot be placed.');
        if (project.components.length >= 64)
          throw new Error('Project has reached its 64-component limit.');
        const id = `part-${crypto.randomUUID()}`;
        const component = createInstance(catalogPart, id);
        // Prefer a clear computed PCB footprint; allow a manual off-board fallback in free mode.
        const position = snapPosition(project,
          action.position ??
          suggestPlacements(project, component)[0]?.position ??
          ([6, 1, 0] as Vec3));
        const assessment = assessPosition(project, component, position);
        if (!assessment.valid)
          throw new Error(assessment.error ?? 'Unsupported component placement.');
        component.position = [...position];
        component.initialPosition = [...position];
        project.components.push(component);
        project.selectedComponentId = id;
        summary.push(`Add ${catalogPart.name} at ${position.join(', ')} (world units)`);
        break;
      }
      case 'move_component': {
        const part = project.components.find((c) => c.id === action.component_id);
        if (!part || !movable(part)) throw new Error('Target component is missing or fixed.');
        const assessment = assessPosition(project, part, snapPosition(project,action.position));
        if (!assessment.valid) throw new Error(assessment.error ?? 'Invalid placement.');
        part.position = snapPosition(project,action.position);
        project.selectedComponentId = part.id;
        summary.push(`Move ${part.name} to ${action.position.join(', ')} (world units)`);
        break;
      }
      case 'remove_component': {
        const part = project.components.find((c) => c.id === action.component_id);
        if (!part || !movable(part)) throw new Error('Target component is missing or fixed.');
        project.components = project.components.filter((c) => c.id !== part.id);
        project.connections = (project.connections ?? []).filter(
          (wire) => wire.from.componentId !== part.id && wire.to.componentId !== part.id,
        );
        if (project.selectedComponentId === part.id) project.selectedComponentId = null;
        if (project.engineeringInputs) delete project.engineeringInputs[part.id];
        if (project.firmwareTargetId === part.id) delete project.firmwareTargetId;
        summary.push(`Remove ${part.name}`);
        break;
      }
      case 'select_component': {
        const part = project.components.find((c) => c.id === action.component_id);
        if (!part) throw new Error('Target component is missing.');
        project.selectedComponentId = part.id;
        summary.push(`Select ${part.name}`);
        break;
      }
    }
  }
  project = migrateProject(project);
  return { project, summary, createNew: false };
}
