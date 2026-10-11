import { createContext, useContext, useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { Vec3 } from '../types/workspace';
export const Appearance = createContext({
  color: '#252c36',
  opacity: 1,
  material: 'matte',
  selected: false,
});
export function Finish({ color, metal = false }: { color?: string; metal?: boolean }) {
  const a = useContext(Appearance);
  return (
    <meshStandardMaterial
      color={color ?? a.color}
      metalness={metal ? 0.8 : a.material === 'metal' ? 0.75 : 0.18}
      roughness={metal ? 0.28 : a.material === 'polymer' ? 0.32 : 0.65}
      transparent
      opacity={a.opacity}
      emissive={a.selected ? '#397dff' : '#000000'}
      emissiveIntensity={a.selected ? 0.11 : 0}
    />
  );
}
export function BoxPart({
  size,
  position = [0, 0, 0],
  color,
  metal = false,
  rotation = [0, 0, 0],
}: {
  size: Vec3;
  position?: Vec3;
  color?: string;
  metal?: boolean;
  rotation?: Vec3;
}) {
  return (
    <mesh castShadow receiveShadow position={position} rotation={rotation}>
      <boxGeometry args={size} />
      <Finish color={color} metal={metal} />
    </mesh>
  );
}
export function CylinderPart({
  radius,
  height,
  position = [0, 0, 0],
  color,
  metal = false,
}: {
  radius: number;
  height: number;
  position?: Vec3;
  color?: string;
  metal?: boolean;
}) {
  return (
    <mesh castShadow receiveShadow position={position}>
      <cylinderGeometry args={[radius, radius, height, 32]} />
      <Finish color={color} metal={metal} />
    </mesh>
  );
}
export function PrintedText({
  text,
  position,
  width = 0.7,
  color = '#dde5d9',
}: {
  text: string;
  position: Vec3;
  width?: number;
  color?: string;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 96);
    ctx.font = '500 56px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, 256, 48);
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, (width * 96) / 512]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}
export function Screw({ position, radius = 0.13 }: { position: Vec3; radius?: number }) {
  return (
    <group position={position}>
      <CylinderPart radius={radius} height={0.06} color="#a6b5c0" metal />
      <BoxPart size={[radius * 1.4, 0.012, 0.025]} position={[0, 0.036, 0]} color="#38434c" />
      <BoxPart size={[0.025, 0.012, radius * 1.4]} position={[0, 0.036, 0]} color="#38434c" />
    </group>
  );
}
