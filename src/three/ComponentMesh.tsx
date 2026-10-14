import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Group, Mesh, MeshStandardMaterial, MathUtils } from 'three';
import { useWorkspaceStore as useStore } from '../store/useWorkspaceStore';
import { displayedPosition } from '../lib/project';
import type { HardwareComponent } from '../types/workspace';
import { Appearance } from './Primitives';
import { ComponentPackage } from './ComponentPackages';
export function ComponentMesh({ component: c }: { component: HardwareComponent }) {
  const group = useRef<Group>(null);
  const mode = useStore((s) => s.activeViewMode);
  const placing = useStore((s) => Boolean(s.placement));
  const visible = placing && c.id === 'pcb' ? true : c.visible;
  const dragMode = useStore((s) => s.dragMode);
  const preview = useStore((s) => (s.componentDrag?.id === c.id ? s.componentDrag.position : null));
  const previousMode = useRef(mode);
  const selected = useStore((s) => s.selectedComponentId === c.id);
  const reduced = useStore((s) => s.reducedMotion);
  const tool = useStore((s) => s.activeTool);
  const select = useStore((s) => s.selectComponent);
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (!group.current) return;
    const p = displayedPosition(preview ? { ...c, position: preview } : c, mode);
    const animate = previousMode.current !== mode && !dragMode;
    previousMode.current = mode;
    if (reduced || !animate) {
      group.current.position.set(...p);
      return;
    }
    const tween = gsap.to(group.current.position, {
      x: p[0],
      y: p[1],
      z: p[2],
      duration: 1.05,
      ease: 'power3.inOut',
      overwrite: true,
    });
    return () => {
      tween.kill();
    };
  }, [c, mode, reduced, preview, dragMode]);
  useEffect(() => {
    const tweens: gsap.core.Tween[] = [];
    group.current?.traverse((o) => {
      if (o instanceof Mesh && o.material instanceof MeshStandardMaterial) {
        const m = o.material;
        const opacity =
          mode === 'xray'
            ? c.type === 'housing'
              ? 0.07
              : c.type === 'board'
                ? 0.42
                : 0.45
            : mode === 'connections' && !selected
              ? 0.3
              : c.opacity;
        m.depthWrite = opacity > 0.5;
        tweens.push(gsap.to(m, { opacity, duration: reduced ? 0 : 0.45, overwrite: true }));
      }
    });
    return () => tweens.forEach((t) => t.kill());
  }, [mode, c.opacity, c.type, c.visible, selected, reduced]);
  // Removing hidden geometry also removes its raycast targets and HTML labels.
  if (!visible || (placing && c.type === 'housing')) return null;
  return (
    <group
      name={c.id}
      ref={group}
      position={c.position}
      rotation={c.rotation.map((v) => MathUtils.degToRad(v)) as [number, number, number]}
      visible={visible}
      onClick={(e) => {
        if (mode === 'xray' && c.type === 'housing') return;
        e.stopPropagation();
        if (!useStore.getState().transformPointerActive && e.delta < 5 && tool === 'select')
          select(c.id);
      }}
      onPointerOver={(e) => {
        if (mode === 'xray' && c.type === 'housing') return;
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <Appearance.Provider
        value={{
          color: mode === 'connections' && !selected ? '#293d49' : c.color,
          opacity: c.opacity,
          material: c.material,
          selected: selected || hovered,
        }}
      >
        <group name={`geometry:${c.id}`}>
          <ComponentPackage component={c} />
        </group>
      </Appearance.Provider>
      {selected && c.footprint && c.id !== 'pcb' && (
        <mesh position={[0,-c.dimensions[1]/2-0.003,0]} rotation={[-Math.PI/2,0,0]}>
          <planeGeometry args={[c.footprint.length/10,c.footprint.width/10]} />
          <meshBasicMaterial color="#65a2ff" transparent opacity={0.25} side={2} depthWrite={false} />
        </mesh>
      )}
      {(selected || hovered) && (
        <mesh
          position={[0, c.type === 'board' ? 0.13 : c.dimensions[1] / 2 + 0.06, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry
            args={[
              Math.max(c.dimensions[0], c.dimensions[2]) * 0.61,
              Math.max(c.dimensions[0], c.dimensions[2]) * 0.61 + 0.025,
              64,
            ]}
          />
          <meshBasicMaterial color="#65a2ff" transparent opacity={0.8} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
