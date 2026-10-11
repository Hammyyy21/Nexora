import {
  Box,
  Layers3,
  Scan,
  Waypoints,
  MousePointer2,
  Rotate3D,
  Hand,
  Maximize,
  RotateCcw,
  Grid2X2,
  Tags,
  Camera,
  PanelRightOpen,
} from 'lucide-react';
import { useWorkspaceStore as useStore } from '../../store/useWorkspaceStore';
import { useDesignLayout } from '../../workspace/layout';
import type { ViewMode } from '../../types/workspace';
import { IconButton } from '../ui/IconButton';
export const modes: { id: ViewMode; label: string; icon: typeof Box }[] = [
  { id: 'assembly', label: 'Assembly', icon: Box },
  { id: 'exploded', label: 'Exploded', icon: Layers3 },
  { id: 'xray', label: 'X-Ray', icon: Scan },
  { id: 'connections', label: 'Connections', icon: Waypoints },
];
export function ViewModeSelector() {
  const s = useStore();
  return (
    <div className="mode-bar">
      <div className="mode-tabs" role="group" aria-label="Viewing mode">
        {modes.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => s.setViewMode(id)}
            className={s.activeViewMode === id ? 'active' : ''}
            aria-pressed={s.activeViewMode === id}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="mode-right">
        <button
          className="fit-model-button"
          onClick={() => s.requestCamera('fit')}
          title="Fit to Model (F in the 3D workspace)"
        >
          <Maximize size={15} aria-hidden="true" />
          <span>Fit to Model</span>
        </button>
        {!s.inspectorOpen && (
          <IconButton
            label="Open inspector"
            onClick={() => {
              s.toggle('inspectorOpen');
              useDesignLayout.getState().setPanel('inspector');
            }}
          >
            <PanelRightOpen size={16} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
export function WorkspaceToolbar({ onScreenshot }: { onScreenshot: () => void }) {
  const s = useStore();
  return (
    <div className="floating-toolbar" role="toolbar" aria-label="Viewport tools">
      <IconButton
        label="Select (V)"
        active={s.activeTool === 'select'}
        onClick={() => s.setTool('select')}
      >
        <MousePointer2 size={17} />
      </IconButton>
      <IconButton
        label="Orbit (O)"
        active={s.activeTool === 'orbit'}
        onClick={() => s.setTool('orbit')}
      >
        <Rotate3D size={18} />
      </IconButton>
      <IconButton label="Pan (H)" active={s.activeTool === 'pan'} onClick={() => s.setTool('pan')}>
        <Hand size={17} />
      </IconButton>
      <span className="toolbar-divider" />
      <IconButton label="Reset camera (0)" onClick={() => s.requestCamera('isometric')}>
        <RotateCcw size={16} />
      </IconButton>
      <span className="toolbar-divider" />
      <IconButton
        label="Toggle grid (G)"
        active={s.gridVisible}
        onClick={() => s.toggle('gridVisible')}
      >
        <Grid2X2 size={17} />
      </IconButton>
      <IconButton
        label="Toggle labels (L)"
        active={s.labelsVisible}
        onClick={() => s.toggle('labelsVisible')}
      >
        <Tags size={17} />
      </IconButton>
      <span className="toolbar-divider" />
      <IconButton label="Export viewport PNG" onClick={onScreenshot}>
        <Camera size={17} />
      </IconButton>
    </div>
  );
}
