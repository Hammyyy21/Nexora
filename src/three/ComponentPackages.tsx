import { getPart } from '../catalog/catalog';
import { CatalogModel } from '../catalog/CatalogModel';
import { useMemo } from 'react';
import { Shape, ExtrudeGeometry } from 'three';
import type { HardwareComponent } from '../types/workspace';
import { BoxPart, CylinderPart, Finish, PrintedText, Screw } from './Primitives';
import { HardwareBoard } from './HardwareBoard';
function Chip({
  size = [1.5, 0.24, 1.5],
  pins = 16,
}: {
  size?: [number, number, number];
  pins?: number;
}) {
  return (
    <>
      <BoxPart size={size} />
      {[0, 1, 2, 3].map((side) => (
        <group key={side} rotation={[0, (side * Math.PI) / 2, 0]}>
          {Array.from({ length: pins }, (_, i) => (
            <group
              key={i}
              position={[(i - (pins - 1) / 2) * (size[0] / (pins + 1)), -0.05, size[2] / 2 + 0.08]}
            >
              <BoxPart size={[0.045, 0.055, 0.22]} color="#bbc7cc" metal />
              <BoxPart
                size={[0.052, 0.045, 0.1]}
                position={[0, -0.11, 0.075]}
                color="#d0d5d4"
                metal
              />
              <BoxPart
                size={[0.045, 0.14, 0.04]}
                position={[0, -0.045, 0.075]}
                color="#bbc7cc"
                metal
              />
            </group>
          ))}
        </group>
      ))}
      <CylinderPart
        radius={0.055}
        height={0.005}
        position={[-size[0] * 0.32, size[1] / 2 + 0.004, size[2] * 0.32]}
        color="#687582"
      />
      <PrintedText
        text={pins === 16 ? 'ST  STM32' : 'TMP  117'}
        position={[0, size[1] / 2 + 0.005, -0.12]}
        width={size[0] * 0.82}
      />
      {pins === 16 && (
        <PrintedText text="ARM · CORTEX" position={[0, size[1] / 2 + 0.005, 0.15]} width={1.1} />
      )}
    </>
  );
}
function FanPackage() {
  const geometry = useMemo(() => {
    const s = new Shape();
    s.moveTo(-1.55, -1.55);
    s.lineTo(1.55, -1.55);
    s.lineTo(1.55, 1.55);
    s.lineTo(-1.55, 1.55);
    s.closePath();
    const hole = new Shape();
    hole.absarc(0, 0, 1.3, 0, Math.PI * 2, true);
    s.holes.push(hole);
    return new ExtrudeGeometry(s, {
      depth: 0.9,
      bevelEnabled: true,
      bevelSize: 0.06,
      bevelThickness: 0.035,
      bevelSegments: 2,
      steps: 1,
    });
  }, []);
  return (
    <>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.45, 0]} castShadow>
        <Finish />
      </mesh>
      <CylinderPart radius={0.49} height={0.43} position={[0, 0.07, 0]} color="#485563" />
      {Array.from({ length: 7 }, (_, i) => (
        <group key={i} rotation={[0, (i * Math.PI * 2) / 7, 0]}>
          <mesh
            position={[0.69, 0.04, 0.15]}
            rotation={[0, 0.45, -0.1]}
            scale={[0.8, 0.12, 0.43]}
            castShadow
          >
            <sphereGeometry args={[1, 20, 10]} />
            <Finish color="#64717e" />
          </mesh>
        </group>
      ))}
      <CylinderPart radius={0.35} height={0.01} position={[0, 0.295, 0]} color="#b4c0c6" metal />
      <PrintedText text="CircuitForge" position={[0, 0.306, 0]} width={0.51} color="#1e2b38" />
      {[-1.32, 1.32].flatMap((x) =>
        [-1.32, 1.32].map((z) => <Screw key={`${x}${z}`} position={[x, 0.49, z]} radius={0.105} />),
      )}
      {[0, 1, 2, 3].map((i) => (
        <BoxPart
          key={i}
          size={[0.12, 0.09, 2.6]}
          position={[0, -0.36, 0]}
          rotation={[0, (i * Math.PI) / 4, 0]}
          color="#28333c"
        />
      ))}
    </>
  );
}
export function ComponentPackage({ component: c }: { component: HardwareComponent }) {
  const part = getPart(c.catalogId);
  if (part) return <CatalogModel part={part} />;
  switch (c.type) {
    case 'board':
      return <HardwareBoard />;
    case 'microcontroller':
      return <Chip />;
    case 'sensor':
      return <Chip size={[0.65, 0.24, 0.5]} pins={2} />;
    case 'fan':
      return <FanPackage />;
    case 'mosfet':
      return (
        <>
          <BoxPart size={[0.72, 0.3, 0.75]} />
          <BoxPart size={[0.62, 0.06, 0.48]} position={[0, -0.13, -0.45]} metal color="#bdc8ce" />
          {[-0.23, 0, 0.23].map((x) => (
            <BoxPart
              key={x}
              size={[0.1, 0.07, 0.4]}
              position={[x, -0.12, 0.5]}
              metal
              color="#c0cbd1"
            />
          ))}
          <PrintedText text="Q1" position={[0, 0.154, 0]} width={0.4} />
        </>
      );
    case 'resistor':
      return (
        <>
          <BoxPart size={c.dimensions} />
          {[-1, 1].map((i) => (
            <BoxPart
              key={i}
              size={[0.12, 0.17, 0.25]}
              position={[i * 0.2, 0, 0]}
              color="#c7cccd"
              metal
            />
          ))}
          <PrintedText text="103" position={[0, 0.078, 0]} width={0.24} />
        </>
      );
    case 'capacitor':
      return (
        <>
          <CylinderPart radius={c.dimensions[0] / 2} height={c.dimensions[1]} />
          <CylinderPart
            radius={c.dimensions[0] / 2 - 0.02}
            height={0.025}
            position={[0, c.dimensions[1] / 2, 0]}
            color="#c2cacc"
            metal
          />
          <BoxPart
            size={[c.dimensions[0] * 0.7, 0.01, 0.025]}
            position={[0, c.dimensions[1] / 2 + 0.015, 0]}
            color="#66727c"
          />
          <BoxPart
            size={[0.025, 0.01, c.dimensions[0] * 0.7]}
            position={[0, c.dimensions[1] / 2 + 0.016, 0]}
            color="#66727c"
          />
          <BoxPart
            size={[0.12, c.dimensions[1] * 0.8, 0.035]}
            position={[0, 0, c.dimensions[0] / 2]}
            color="#b9c4ca"
          />
        </>
      );
    case 'usb':
      return (
        <>
          <BoxPart size={[0.85, 0.1, 1.05]} position={[0, -0.2, 0]} metal />
          <BoxPart size={[0.85, 0.1, 1.05]} position={[0, 0.2, 0]} metal />
          {[-0.48, 0.48].map((z) => (
            <BoxPart key={z} size={[0.85, 0.35, 0.08]} position={[0, 0, z]} metal />
          ))}
          <BoxPart size={[0.15, 0.3, 0.95]} position={[0.34, 0, 0]} color="#27313b" />
          <BoxPart size={[0.63, 0.05, 0.64]} color="#252b33" />
          {Array.from({ length: 8 }, (_, i) => (
            <BoxPart
              key={i}
              size={[0.45, 0.02, 0.035]}
              position={[-0.1, 0.035, (i - 3.5) * 0.075]}
              color="#d7b876"
              metal
            />
          ))}
        </>
      );
    case 'terminal':
      return (
        <>
          <BoxPart size={c.dimensions} />
          {[-0.3, 0.3].map((x) => (
            <group key={x}>
              <CylinderPart radius={0.2} height={0.015} position={[x, 0.356, 0]} color="#243d52" />
              <Screw position={[x, 0.37, 0]} radius={0.13} />
              <BoxPart size={[0.36, 0.32, 0.04]} position={[x, -0.06, 0.36]} color="#182b37" />
              <BoxPart size={[0.2, 0.05, 0.12]} position={[x, -0.19, 0.32]} color="#b3a873" metal />
            </group>
          ))}
        </>
      );
    case 'header':
      return (
        <>
          <BoxPart size={[1.85, 0.25, 0.48]} />
          {Array.from({ length: 6 }, (_, i) => (
            <BoxPart
              key={i}
              size={[0.085, 0.55, 0.085]}
              position={[(i - 2.5) * 0.29, 0.16, 0]}
              color="#d8bd7b"
              metal
            />
          ))}
        </>
      );
    case 'housing':
      return (
        <>
          <BoxPart size={[9.65, 0.1, 6.85]} position={[0, -0.3, 0]} />
          {[-3.4, 3.4].map((z) => (
            <BoxPart key={z} size={[9.65, 0.65, 0.08]} position={[0, 0.01, z]} />
          ))}
          {[-4.8, 4.8].map((x) => (
            <BoxPart key={x} size={[0.08, 0.65, 6.85]} position={[x, 0.01, 0]} />
          ))}
          <BoxPart size={[2.6, 0.045, 1.95]} position={[-0.85, 1.15, 1.65]} />
          {[-2.12, 0.42].flatMap((x) =>
            [0.7, 2.6].map((z) => (
              <CylinderPart
                key={`${x}${z}`}
                radius={0.045}
                height={1.4}
                position={[x, 0.43, z]}
                color="#8c9caa"
                metal
              />
            )),
          )}
        </>
      );
  }
}
