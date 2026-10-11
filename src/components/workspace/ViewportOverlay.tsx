import { MoveUpRight, Mouse, Rotate3D } from 'lucide-react';
import { useWorkspaceStore as useStore } from '../../store/useWorkspaceStore';
export function ViewportOverlay() {
  const s = useStore();
  return (
    <>
      <div className="viewport-title">
        <div>
          <span className="live-dot" />
          LIVE WORKSPACE
        </div>
        <h1>Smart Cooling Controller</h1>
        <p>Hardware, from a different perspective.</p>
      </div>
      <div className="view-cube" aria-label="Camera views">
        <button
          className="cube-top"
          title="Top view"
          aria-label="Top view"
          onClick={() => s.requestCamera('top')}
        >
          TOP
        </button>
        <button
          className="cube-front"
          title="Front view"
          aria-label="Front view"
          onClick={() => s.requestCamera('front')}
        >
          FRONT
        </button>
        <button
          className="cube-iso"
          title="Isometric view"
          aria-label="Isometric view"
          onClick={() => s.requestCamera('isometric')}
        >
          <MoveUpRight size={12} />
        </button>
        <span>
          <i className="axis-x">X</i>
          <i className="axis-y">Y</i>
          <i className="axis-z">Z</i>
        </span>
      </div>
      {s.activeViewMode === 'connections' && (
        <div className="mode-annotation">
          <span className="dot cyan" />
          Demo connections · illustrative paths, not simulation
        </div>
      )}
      {s.activeViewMode === 'exploded' && (
        <div className="mode-annotation">
          <span className="dot" />
          Exploded assembly · original transforms preserved
        </div>
      )}
      {s.activeViewMode === 'xray' && (
        <div className="mode-annotation">
          <span className="dot cyan" />
          X-ray · transparent housing and component packages
        </div>
      )}
      <div className="viewport-bottom">
        <span className="scene-scale">1 unit = 10 mm</span>
        <div>
          <Mouse size={12} />
          Scroll to zoom<span>·</span>
          <Rotate3D size={13} />
          Drag to orbit<span>·</span>Right-drag to pan
        </div>
        <span className="units">mm</span>
      </div>
    </>
  );
}
