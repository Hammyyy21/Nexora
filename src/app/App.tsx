import { ViewModeSelector } from '../components/workspace/WorkspaceToolbar';
import { SchematicWorkspace } from '../schematic/SchematicWorkspace';
import { PCBWorkspace } from '../workspace/PCBWorkspace';
import { ProjectDashboard } from '../projects/ProjectDashboard';
import { hydrateActiveProject, flushProjects } from '../projects/store';
import { DesignDrawer } from '../workspace/DesignDrawer';
import { useDesignLayout } from '../workspace/layout';
import { ToolsPanel } from '../workspace/ToolsPanel';
import { ComponentsWorkspace } from '../catalog/ComponentsWorkspace';
import { useLibraryStore } from '../catalog/store';
import { PositionTransform } from '../components/workspace/PositionTransform';
import { PlacementControls } from '../catalog/Placement';
import { useEffect, useRef } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Check, X } from 'lucide-react';
import { TopBar, WorkspaceHeader } from '../components/layout/TopBar';
import { ViewportOverlay } from '../components/workspace/ViewportOverlay';
import { HardwareScene } from '../three/HardwareScene';
import { useWorkspaceStore as useStore } from '../store/useWorkspaceStore';
import { useKeyboard } from '../hooks/useKeyboard';
import '../workspace/design.css';
export default function App() {
  const s = useStore();
  const layout = useDesignLayout();
  const workspace = useLibraryStore((v) => v.workspace);
  const viewport = useRef<HTMLDivElement>(null);
  useKeyboard();
  useEffect(() => {
    hydrateActiveProject();
    const unload = () => flushProjects();
    window.addEventListener('pagehide', unload);
    return () => window.removeEventListener('pagehide', unload);
  }, []);
  useEffect(() => {
    if (!s.notice) return;
    const timer = setTimeout(() => useStore.getState().notify(null), 5000);
    return () => clearTimeout(timer);
  }, [s.notice]);
  const screenshot = () => {
    const canvas = viewport.current?.querySelector('canvas');
    if (!canvas) {
      s.notify('The 3D viewport is not ready yet.');
      return;
    }
    try {
      const a = document.createElement('a');
      a.download = 'nexora-viewport.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
      s.notify('Viewport exported as PNG. Labels and interface are excluded.');
    } catch {
      s.notify('Screenshot export is unavailable in this browser.');
    }
  };
  return (
    <MotionConfig reducedMotion={s.reducedMotion ? 'always' : 'user'}>
      <div
        data-reduced-motion={s.reducedMotion}
        className={`app-shell focused-workspace ${layout.focusMode ? 'is-focus-mode' : ''}`}
      >
        <TopBar />
        <WorkspaceHeader />
        <div className="workspace-layout">
          <main
            className={`design-shell ${workspace === 'components' || workspace === 'schematic' || workspace === 'pcb' ? 'workspace-hidden' : ''}`}
            inert={workspace === 'components' || workspace === 'schematic' || workspace === 'pcb'}
            aria-label="3D design workspace"
          >
            <ViewModeSelector />
            <div
              className="viewport"
              ref={viewport}
              tabIndex={0}
              aria-label="3D workspace camera controls"
            >
              <HardwareScene />
              <ViewportOverlay />
              <PlacementControls />
              <PositionTransform />
            </div>
          </main>
          {workspace === 'components' && (
            <div className="library-workspace-shell">
              <ComponentsWorkspace />
            </div>
          )}
          {workspace === 'schematic' && <SchematicWorkspace />}
          {workspace === 'pcb' && <PCBWorkspace />}
          <ToolsPanel onScreenshot={screenshot} />
        </div>
        <DesignDrawer />
        <ProjectDashboard />
        <AnimatePresence>
          {s.notice && (
            <motion.div
              className="toast"
              role="status"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
            >
              <Check size={16} />
              <span>{s.notice}</span>
              <button aria-label="Dismiss notification" onClick={() => s.notify(null)}>
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
