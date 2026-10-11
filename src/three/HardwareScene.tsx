import { PlacementGhost, PlacementZones } from '../catalog/Placement';
import { useLibraryStore } from '../catalog/store';
import { Component, Suspense, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, AdaptiveDpr } from '@react-three/drei';
import { ACESFilmicToneMapping } from 'three';
import { AlertTriangle, LoaderCircle } from 'lucide-react';
import { useWorkspaceStore as useStore } from '../store/useWorkspaceStore';
import { ComponentMesh } from './ComponentMesh';
import { ComponentLabels, LabelProjection } from './ComponentLabels';
import { ComponentTransformControls } from './ComponentTransformControls';
import { CameraController } from './CameraController';
import { Connections } from './Connections';
import { SceneReveal } from './SceneReveal';
function Ready({ onReady }: { onReady: () => void }) {
  useEffect(onReady, [onReady]);
  return null;
}
function ContextMonitor() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const lost = (e: Event) => {
      e.preventDefault();
      useStore
        .getState()
        .notify(
          'Graphics context paused. Reload the page if the viewport does not recover; export JSON first to retain edits.',
        );
    };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => gl.domElement.removeEventListener('webglcontextlost', lost);
  }, [gl]);
  return null;
}
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="scene-error">
        <AlertTriangle size={30} />
        <h2>3D rendering is unavailable</h2>
        <p>
          Enable hardware acceleration and reload. You can still explore components, edit
          properties, and export your project.
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function HardwareScene() {
  const labels = useRef<HTMLDivElement>(null);
  const workspaceVisible = useLibraryStore((s) => s.workspace !== 'components');
  const project = useStore((s) => s.currentProject);
  const grid = useStore((s) => s.gridVisible);
  const quality = useStore((s) => s.quality);
  const lightIntensity = useStore((s) => s.lightIntensity);
  const mode = useStore((s) => s.activeViewMode);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(!document.hidden);
  useEffect(() => {
    const change = () => setActive(!document.hidden);
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  return (
    <SceneBoundary>
      <Canvas
        className="hardware-canvas"
        aria-label="Interactive 3D hardware workspace"
        shadows={quality === 'high'}
        dpr={quality === 'high' ? [1, 1.75] : 1}
        frameloop={active && workspaceVisible ? 'always' : 'never'}
        camera={{ position: [12, 14, 17], fov: 37, near: 0.1, far: 500 }}
        gl={{
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
          toneMapping: ACESFilmicToneMapping,
        }}
        onPointerMissed={(e) => {
          if (
            e.type === 'click' &&
            !useStore.getState().transformPointerActive &&
            useStore.getState().activeTool === 'select'
          )
            useStore.getState().selectComponent(null);
        }}
        fallback={
          <div className="scene-error">
            WebGL is unavailable. Try a browser with hardware acceleration.
          </div>
        }
      >
        <ambientLight intensity={0.85 * lightIntensity} />
        <hemisphereLight args={['#cadfff', '#384d52', 1.2 * lightIntensity]} />
        <directionalLight
          position={[0, 12, 4]}
          intensity={3 * lightIntensity}
          castShadow={quality === 'high'}
          shadow-mapSize={quality === 'high' ? [2048, 2048] : [512, 512]}
          shadow-camera-left={-9}
          shadow-camera-right={9}
          shadow-camera-top={9}
          shadow-camera-bottom={-9}
          shadow-bias={-0.0005}
        />
        <directionalLight position={[-9, 6, -4]} color="#7cc7e4" intensity={2 * lightIntensity} />
        <directionalLight position={[8, 3, -5]} color="#a7b6ef" intensity={2.3 * lightIntensity} />
        <Suspense fallback={null}>
          <SceneReveal>
            {project.components.map((c) => (
              <ComponentMesh key={c.id} component={c} />
            ))}
          </SceneReveal>
          <PlacementZones />
          <PlacementGhost />
          {mode === 'connections' && project.boardTemplateId !== 'blank-92' && <Connections />}
          <Ready onReady={() => setReady(true)} />
        </Suspense>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.25, 0]} receiveShadow>
          <planeGeometry args={[150, 150]} />
          <shadowMaterial transparent opacity={0.23} />
        </mesh>
        {grid && (
          <Grid
            position={[0, -1.24, 0]}
            args={[50, 50]}
            cellSize={1}
            cellThickness={0.45}
            cellColor="#324450"
            sectionSize={5}
            sectionThickness={0.6}
            sectionColor="#405a68"
            fadeDistance={32}
            fadeStrength={2}
            infiniteGrid
          />
        )}
        <CameraController />
        <ComponentTransformControls />
        <LabelProjection container={labels} />
        <AdaptiveDpr pixelated />
        <ContextMonitor />
      </Canvas>
      <ComponentLabels container={labels} />
      {!ready && (
        <div className="scene-loading">
          <LoaderCircle size={22} className="spin" />
          <span>Assembling your workspace…</span>
        </div>
      )}
    </SceneBoundary>
  );
}
