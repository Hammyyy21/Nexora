import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { demoProject } from '../src/data/demoProject';
import { cloneProject } from '../src/lib/project';
import { cameraFrame, componentCorners } from '../src/lib/camera';
describe('camera framing', () => {
  for (const aspect of [1.8, 1.3, 0.6])
    for (const mode of ['assembly', 'exploded', 'xray', 'connections'] as const) {
      it(`fits every visible component at aspect ${aspect} in ${mode}`, () => {
        const p = cloneProject(demoProject);
        p.components[2].position = [-13, 7, 4];
        p.components[3].rotation = [45, 30, 80];
        const { target, position } = cameraFrame(p.components, mode, 'fit', null, aspect);
        const camera = new PerspectiveCamera(37, aspect, 0.1, 500);
        camera.position.copy(position);
        camera.lookAt(target);
        camera.updateMatrixWorld();
        for (const component of p.components)
          for (const point of componentCorners(component, mode)) {
            const projected = point.clone().project(camera);
            expect(Math.abs(projected.x)).toBeLessThan(1);
            expect(Math.abs(projected.y)).toBeLessThan(1);
            expect(projected.z).toBeGreaterThan(-1);
            expect(projected.z).toBeLessThan(1);
          }
      });
    }
  it('focuses an exploded component while preserving usable distance', () => {
    const c = demoProject.components.find((c) => c.id === 'mcu')!;
    const frame = cameraFrame(demoProject.components, 'exploded', 'focus', 'mcu', 1.5);
    expect(frame.target.toArray()).toEqual(c.position.map((v, i) => v + c.explodedOffset[i]));
    expect(frame.position.distanceTo(frame.target)).toBeGreaterThanOrEqual(4.99);
  });
  it('provides valid top, front, and empty-model presets', () => {
    for (const view of ['top', 'front', 'isometric'] as const) {
      const frame = cameraFrame(
        demoProject.components.map((c) => ({ ...c, visible: false })),
        'assembly',
        view,
        null,
        1.5,
      );
      expect(frame.position.toArray().every(Number.isFinite)).toBe(true);
      expect(frame.target.toArray().every(Number.isFinite)).toBe(true);
    }
  });
});

it('frames tiny viewports, empty boards, tall parts and changed transforms without changing orientation', () => {
  for (const aspect of [0.12, 0.4, 3.5]) {
    const project = cloneProject(demoProject);
    project.components = project.components.slice(0, 2);
    project.components[0].dimensions = [20, 0.6, 14];
    project.components[1].dimensions = [1, 19, 1];
    project.components[1].position = [12, 10, -6];
    project.components[1].rotation = [20, 45, 10];
    for (const components of [project.components, project.components.slice(0, 1), []]) {
      const direction = new Vector3(-1, 1, -1).normalize();
      const frame = cameraFrame(components, 'exploded', 'fit', null, aspect, 50, direction);
      expect(
        frame.position.clone().sub(frame.target).normalize().distanceTo(direction),
      ).toBeLessThan(1e-8);
      const camera = new PerspectiveCamera(50, aspect, 0.01, 10000);
      camera.position.copy(frame.position);
      camera.lookAt(frame.target);
      camera.updateMatrixWorld();
      for (const c of components)
        for (const corner of componentCorners(c, 'exploded')) {
          const p = corner.project(camera);
          expect(Math.abs(p.x)).toBeLessThan(1);
          expect(Math.abs(p.y)).toBeLessThan(1);
        }
    }
  }
});

it('includes rendered geometry extending beyond the stored package dimensions', () => {
  const extra = new Vector3(-30, 40, 15);
  const frame = cameraFrame(demoProject.components, 'assembly', 'fit', null, 0.5, 37, undefined, [
    extra,
  ]);
  const camera = new PerspectiveCamera(37, 0.5, 0.1, 1000);
  camera.position.copy(frame.position);
  camera.lookAt(frame.target);
  camera.updateMatrixWorld();
  const p = extra.clone().project(camera);
  expect(Math.abs(p.x)).toBeLessThan(1);
  expect(Math.abs(p.y)).toBeLessThan(1);
});
