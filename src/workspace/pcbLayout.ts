import { Euler, Vector3 } from 'three';
import type { HardwareComponent, Project } from '../types/workspace';
import { boardMatrix, componentFootprint, normalizeBoard, type FootprintPad, type Point } from './boardGeometry';

/** User-authored pad/footprint placement in board-local millimeters, not copper routing. */
export function pointOnBoard(board: HardwareComponent, component: HardwareComponent, offset: Point): Point {
  const componentRotation = new Euler(
    ...component.rotation.map((angle) => angle * Math.PI / 180) as [number, number, number],
  );
  const point = new Vector3(offset.x / 10, 0, offset.z / 10)
    .applyEuler(componentRotation)
    .add(new Vector3(...component.position))
    .applyMatrix4(boardMatrix(board).invert());
  return { x: point.x * 10, z: point.z * 10 };
}
export function componentOutlineOnBoard(board: HardwareComponent, component: HardwareComponent): Point[] {
  const { length, width } = componentFootprint(component);
  return [
    { x: -length / 2, z: -width / 2 },
    { x: length / 2, z: -width / 2 },
    { x: length / 2, z: width / 2 },
    { x: -length / 2, z: width / 2 },
  ].map((point) => pointOnBoard(board, component, point));
}
export function placedPads(project: Project) {
  const board = project.components.find((part) => part.id === 'pcb');
  if (!board || !project.boardConfiguration) return [];
  const layers = new Map(normalizeBoard(project.boardConfiguration).stackup!
    .filter((l) => l.kind === 'copper').map((l) => [l.id, l]));
  return project.components.filter((part) => part.id !== 'pcb' && part.type !== 'housing')
    .flatMap((part) => (part.footprint?.pads ?? []).map((pad: FootprintPad) => ({
      ...pad,
      componentId: part.id,
      reference: part.reference,
      center: pointOnBoard(board, part, pad),
      layer: layers.get(pad.layerId),
      // Board-space corners allow correctly rotated/underside geometry.
      outline: (pad.shape === 'circle'
        ? Array.from({ length: 24 }, (_, i) => ({
            x: pad.x + pad.length / 2 * Math.cos(2 * Math.PI * i / 24),
            z: pad.z + pad.length / 2 * Math.sin(2 * Math.PI * i / 24),
          }))
        : [
            { x: pad.x - pad.length / 2, z: pad.z - pad.width / 2 },
            { x: pad.x + pad.length / 2, z: pad.z - pad.width / 2 },
            { x: pad.x + pad.length / 2, z: pad.z + pad.width / 2 },
            { x: pad.x - pad.length / 2, z: pad.z + pad.width / 2 },
          ]).map((point) => pointOnBoard(board, part, point)),
    })));
}
