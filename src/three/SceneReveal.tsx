import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Group } from 'three';
import { gsap } from 'gsap';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
export function SceneReveal({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null);
  const reduced = useWorkspaceStore((s) => s.reducedMotion);
  useEffect(() => {
    if (!ref.current) return;
    const tween = gsap.fromTo(
      ref.current.scale,
      { x: reduced ? 1 : 0.94, y: reduced ? 1 : 0.94, z: reduced ? 1 : 0.94 },
      { x: 1, y: 1, z: 1, duration: reduced ? 0 : 0.8, ease: 'power2.out' },
    );
    return () => {
      tween.kill();
    };
  }, [reduced]);
  return <group ref={ref}>{children}</group>;
}
