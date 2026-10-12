import type { Project } from '../types/workspace';
import { componentFootprint, normalizeBoard } from './boardGeometry';
import { presetBoardConfiguration } from './boardSpecifications';
/** v1/v2 positions, rotations, terminal namespaces and firmware remain unchanged. */
export function migrateProject(project: Project): Project {
  const p = structuredClone(project);
  p.schemaVersion = 3;
  p.boardConfiguration = normalizeBoard(
    p.boardConfiguration ?? presetBoardConfiguration(p.boardTemplateId ?? 'cooling-demo'),
  );
  if (p.boardConfigurations)
    for (const id of Object.keys(p.boardConfigurations) as (keyof NonNullable<
      Project['boardConfigurations']
    >)[]) {
      p.boardConfigurations[id] = normalizeBoard(p.boardConfigurations[id]!);
    }
  p.components = p.components.map((c) =>
    c.id === 'pcb' || c.type === 'housing'
      ? c
      : { ...c, side: c.side ?? 'top', footprint: componentFootprint(c) },
  );
  return p;
}
