import { defaultBoardConfiguration } from '../workspace/boardSpecifications';
import { useEffect, useMemo } from 'react';
import { Shape, Path, ExtrudeGeometry, CanvasTexture, SRGBColorSpace } from 'three';
import { Finish, CylinderPart, PrintedText } from './Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
export function HardwareBoard() {
  const blank = useWorkspaceStore(
    (s) => (s.currentProject.boardTemplateId ?? 'cooling-demo') !== 'cooling-demo',
  );
  const configuration = useWorkspaceStore((s) =>
    (s.currentProject.boardTemplateId ?? 'cooling-demo') !== 'cooling-demo'
      ? s.currentProject.boardConfiguration
      : undefined,
  );
  const board = useMemo(() => configuration ?? defaultBoardConfiguration(), [configuration]);
  const geometry = useMemo(() => {
    const s = new Shape();
    const x = board.length / 20,
      z = board.width / 20,
      r = 0.18;
    s.moveTo(-x + r, -z);
    s.lineTo(x - r, -z);
    s.quadraticCurveTo(x, -z, x, -z + r);
    s.lineTo(x, z - r);
    s.quadraticCurveTo(x, z, x - r, z);
    s.lineTo(-x + r, z);
    s.quadraticCurveTo(-x, z, -x, z - r);
    s.lineTo(-x, -z + r);
    s.quadraticCurveTo(-x, -z, -x + r, -z);
    for (const h of board.mountingHoles) {
      const hole = new Path();
      hole.absarc(h.x / 10, -h.z / 10, h.diameter / 20, 0, Math.PI * 2, true);
      s.holes.push(hole);
    }
    return new ExtrudeGeometry(s, {
      depth: board.thickness / 10,
      bevelEnabled: false,
      curveSegments: 16,
    });
  }, [board]);
  const texture = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = 2048;
    cv.height = 1424;
    const ctx = cv.getContext('2d')!;
    const sx = 2048 / 9.2,
      sz = 1424 / 6.4;
    const xy = (x: number, z: number) => [(x + 4.6) * sx, (z + 3.2) * sz];
    ctx.clearRect(0, 0, cv.width, cv.height);
    const route = (pts: number[][], color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach(([x, z], i) => {
        const [a, b] = xy(x, z);
        if (i === 0) ctx.moveTo(a, b);
        else ctx.lineTo(a, b);
      });
      ctx.stroke();
    };
    for (let i = 0; i < 11; i++) {
      const d = i * 0.13;
      route(
        [
          [-1.85 + d, -1.03],
          [-1.85 + d, -1.5 - d * 0.3],
          [-1.5 + d, -1.85 - d * 0.3],
          [0.4 + d, -1.85 - d * 0.3],
          [0.75 + d, -2.2],
          [2.5 + d, -2.2],
        ],
        i % 3 === 0 ? '#67ac94' : '#3c8a78',
        2.3,
      );
      route(
        [
          [-1.85 + d, 0.55],
          [-1.85 + d, 1.02 + d * 0.2],
          [-2.1 + d, 1.27 + d * 0.2],
          [-2.1 + d, 2.12],
          [-2.4 + d, 2.4],
        ],
        '#448e74',
        2.2,
      );
    }
    for (let i = 0; i < 8; i++) {
      const d = i * 0.12;
      route(
        [
          [-2.03, -0.85 + d],
          [-2.35 - d * 0.25, -0.85 + d],
          [-2.58 - d * 0.25, -1.08 + d],
          [-3.6, -1.08 + d],
          [-3.95, -1.43 + d],
          [-3.95, -2.2 + d * 0.16],
        ],
        '#549d7e',
        2.2,
      );
      route(
        [
          [-0.47, -0.9 + d],
          [0.1 + d * 0.2, -0.9 + d],
          [0.4 + d * 0.2, -1.2 + d],
          [1.3, -1.2 + d],
          [1.65, -0.85 + d],
          [3.9, -0.85 + d],
        ],
        '#4d947d',
        2.2,
      );
    }
    route(
      [
        [-3, 2.4],
        [-3, 1.8],
        [-2.6, 1.4],
        [-2.6, 0.7],
        [-3.2, 0.1],
        [-4.2, 0.1],
      ],
      '#9faa75',
      5,
    );
    route(
      [
        [3.8, 2.3],
        [1.6, 2.3],
        [1, 1.7],
        [1, 0.6],
      ],
      '#a5b881',
      6,
    );
    route(
      [
        [-3.7, -2.5],
        [-3.7, -1.9],
        [-3.2, -1.4],
        [-2, -1.4],
        [-1.5, -0.9],
      ],
      '#b5bb79',
      3,
    );
    for (let i = 0; i < 35; i++) {
      const x = -3.8 + (i % 12) * 0.65,
        z = 2.9 - Math.floor(i / 12) * 0.24;
      const [a, b] = xy(x, z);
      ctx.fillStyle = '#c2b879';
      ctx.beginPath();
      ctx.arc(a, b, 4, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#132d2a';
      ctx.beginPath();
      ctx.arc(a, b, 1.7, 0, 7);
      ctx.fill();
    }
    ctx.strokeStyle = '#9bc3ae';
    ctx.lineWidth = 2;
    for (const [x, z, w, h] of [
      [-2.24, -1.25, 1.98, 2],
      [-3.5, -2.28, 1, 0.8],
      [0.1, 0.45, 1.1, 1.3],
    ]) {
      const [a, b] = xy(x, z);
      ctx.strokeRect(a, b, w * sx, h * sz);
    }
    const t = new CanvasTexture(cv);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -board.thickness / 20, 0]}
        geometry={geometry}
        castShadow
        receiveShadow
      >
        <Finish />
      </mesh>
      {!blank && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.083, 0]}>
          <planeGeometry args={[9.18, 6.38]} />
          <meshStandardMaterial
            map={texture}
            transparent
            depthWrite={false}
            roughness={0.57}
            metalness={0.3}
          />
        </mesh>
      )}
      {board.mountingHoles.map((hole, i) => (
        <group key={i} position={[hole.x / 10, board.thickness / 20 + 0.006, hole.z / 10]}>
          {!blank && (
            <>
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[hole.diameter / 20, hole.diameter / 20 + 0.11, 32]} />
                <meshStandardMaterial color="#ceba83" metalness={0.8} roughness={0.3} />
              </mesh>
              <CylinderPart
                radius={0.09}
                height={0.55}
                position={[0, -0.4, 0]}
                metal
                color="#b2b8c0"
              />
            </>
          )}
        </group>
      ))}
      {!blank && (
        <>
          <PrintedText text="NEXORA" position={[1.7, 0.09, 2.68]} width={1.7} />
          <PrintedText text="SMART COOLING  /  REV 01" position={[1.55, 0.09, 2.91]} width={2.2} />
          <PrintedText text="USB-C" position={[-3.72, 0.09, 1.6]} width={0.7} />
          <PrintedText text="12V   GND" position={[-2.8, 0.09, 1.98]} width={0.92} />
          <PrintedText text="SWD · DEBUG" position={[-0.3, 0.09, -2.95]} width={1.6} />
          <PrintedText text="OPEN HARDWARE" position={[2.45, 0.09, -2.76]} width={1.7} />
        </>
      )}
    </group>
  );
}
