import { Component, Suspense, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { CatalogPart } from './types';
import { CatalogModel } from './CatalogModel';
import { Appearance } from '../three/Primitives';
class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="status">
        3D preview unavailable. Specifications and visual placement controls remain available.
      </p>
    ) : (
      this.props.children
    );
  }
}
export function ComponentPreview({ part }: { part: CatalogPart }) {
  const [camera, setCamera] = useState(0);
  const radius = Math.max(...part.visualSize) * 2;
  return (
    <div className="catalog-preview">
      <PreviewBoundary key={`${part.id}-${camera}`}>
        <Suspense fallback={<p>Loading 3D preview…</p>}>
          <Canvas
            key={`${part.id}-${camera}`}
            aria-label={`3D preview of ${part.name}`}
            frameloop="demand"
            dpr={[1, 1.5]}
            camera={{ position: [radius, radius * 0.85, radius], fov: 38 }}
            fallback={<p>WebGL is unavailable; manufacturer information remains accessible.</p>}
          >
            <ambientLight intensity={1.2} />
            <directionalLight position={[5, 8, 6]} intensity={3} />
            <directionalLight position={[-5, 3, -4]} intensity={2} color="#72bddb" />
            <Appearance.Provider
              value={{
                color: part.model === 'board' ? '#1d8071' : '#34445c',
                opacity: 1,
                material: 'matte',
                selected: false,
              }}
            >
              <CatalogModel part={part} />
            </Appearance.Provider>
            <OrbitControls
              makeDefault
              enableDamping
              minDistance={radius * 0.5}
              maxDistance={radius * 4}
            />
          </Canvas>
        </Suspense>
      </PreviewBoundary>
      <button onClick={() => setCamera((n) => n + 1)}>Reset / fit preview</button>
      <span>Generic visualization · not to scale · orbit / zoom</span>
    </div>
  );
}
