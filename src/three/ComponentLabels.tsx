import { useMemo, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

type Props = { container: RefObject<HTMLDivElement | null> };

// DOM labels belong to the application root, not a separate root per scene object.
export function ComponentLabels({ container }: Props) {
  const components = useWorkspaceStore((s) => s.currentProject.components);
  const selected = useWorkspaceStore((s) => s.selectedComponentId);
  const visible = useWorkspaceStore((s) => s.labelsVisible);
  return (
    <div className="component-labels" ref={container}>
      {visible &&
        components
          .filter(
            (c) => c.visible && (c.id === selected || ['sensor', 'mcu', 'fan'].includes(c.id)),
          )
          .map((c) => (
            <div
              key={c.id}
              data-component-id={c.id}
              data-label-height={c.dimensions[1] / 2 + 0.6}
              className="component-label-anchor"
              style={{ visibility: 'hidden' }}
            >
              <span className={`component-label ${selected === c.id ? 'selected' : ''}`}>
                <i />
                {c.reference}
                <span>{c.name}</span>
              </span>
            </div>
          ))}
    </div>
  );
}

// Read the animated world transforms each frame without scheduling React renders.
export function LabelProjection({ container }: Props) {
  const point = useMemo(() => new Vector3(), []);
  useFrame(({ scene, camera, size }) => {
    for (const node of Array.from(container.current?.children ?? [])) {
      const label = node as HTMLDivElement;
      const object = scene.getObjectByName(label.dataset.componentId!);
      if (!object || size.width <= 0 || size.height <= 0) {
        label.style.visibility = 'hidden';
        continue;
      }
      object.updateWorldMatrix(true, false);
      point.set(0, Number(label.dataset.labelHeight), 0);
      object.localToWorld(point).project(camera);
      label.style.visibility = point.z >= -1 && point.z <= 1 ? 'visible' : 'hidden';
      label.style.transform = `translate3d(${((point.x + 1) * size.width) / 2}px,${((1 - point.y) * size.height) / 2}px,0) translate(-50%,-50%)`;
    }
  });
  return null;
}
