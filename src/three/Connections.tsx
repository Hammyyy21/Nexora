import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { CatmullRomCurve3, Vector3, Mesh } from 'three';
import { demoConnections } from '../data/demoProject';
import { useWorkspaceStore as useStore } from '../store/useWorkspaceStore';
function ConnectionPath({
  from,
  to,
  color,
  active,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  active: boolean;
}) {
  const ref = useRef<Mesh>(null);
  const reduced = useStore((s) => s.reducedMotion);
  const curve = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(...from),
        new Vector3(from[0], 1.15, from[2]),
        new Vector3((from[0] + to[0]) / 2, 1.45, (from[2] + to[2]) / 2),
        new Vector3(to[0], 1.15, to[2]),
        new Vector3(...to),
      ]),
    [from, to],
  );
  const points = useMemo(() => curve.getPoints(50), [curve]);
  useFrame(({ clock }) => {
    if (ref.current)
      ref.current.position.copy(curve.getPointAt(reduced ? 0.5 : (clock.elapsedTime * 0.16) % 1));
  });
  return (
    <>
      <Line
        points={points}
        color={color}
        lineWidth={active ? 2.4 : 1}
        transparent
        opacity={active ? 0.9 : 0.18}
      />
      {active && (
        <mesh ref={ref}>
          <sphereGeometry args={[0.065, 12, 8]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
    </>
  );
}
export function Connections() {
  const components = useStore((s) => s.currentProject.components);
  const wires = useStore((s) => s.currentProject.connections);
  const selected = useStore((s) => s.selectedComponentId);
  return (
    <group>
      {(wires !== undefined
        ? wires.map((w) => ({
            id: w.id,
            from: w.from.componentId,
            to: w.to.componentId,
            color: '#30d7e8',
          }))
        : demoConnections
      ).map((c) => {
        const from = components.find((v) => v.id === c.from)!,
          to = components.find((v) => v.id === c.to)!;
        if (
          !from?.visible ||
          !to?.visible ||
          (wires === undefined && (from.catalogId || to.catalogId))
        )
          return null;
        return (
          <ConnectionPath
            key={c.id}
            from={from.position}
            to={to.position}
            color={c.color}
            active={!selected || selected === c.from || selected === c.to}
          />
        );
      })}
    </group>
  );
}
