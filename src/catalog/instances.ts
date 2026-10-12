import { boardVisualSize } from '../workspace/boardSpecifications';
import type { HardwareComponent, Vec3 } from '../types/workspace';
import type { CatalogPart } from './types';
export const placementOrigin: Vec3 = [6, 1, 0];
export function createInstance(part: CatalogPart, id: string): HardwareComponent {
  return {
    id,
    side: 'top',
    footprint: { name: 'Visual bounds', length: boardVisualSize(part.id, part.visualSize)[0] * 10,
      width: boardVisualSize(part.id, part.visualSize)[2] * 10, provenance: 'visual-estimate' },
    catalogId: part.id,
    integration: 'visual-only',
    initialPosition: [...placementOrigin],
    name: part.name,
    reference: id.startsWith('part-') ? `LIB-${id.slice(5, 11).toUpperCase()}` : 'PREVIEW',
    type: part.instanceType,
    group: part.category === 'boards' ? 'structure' : 'active',
    description: part.description,
    purpose: `${part.useCase} Generic visualization, not a manufacturer-accurate digital twin.`,
    connectionNotes:
      'Visual-only placement. No electrical connections or board integration have been established.',
    position: [...placementOrigin],
    rotation: [0, 0, 0],
    dimensions: boardVisualSize(part.id, part.visualSize),
    color: part.model === 'board' || part.model === 'memory' ? '#177c69' : '#34445c',
    material: 'matte',
    opacity: 1,
    visible: true,
    explodedOffset: [0, 1.5, 0],
  };
}
