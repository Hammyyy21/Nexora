import { WorkspaceToolbar } from '../components/workspace/WorkspaceToolbar';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { EngineeringInsights } from '../engineering/EngineeringInsights';
export function WorkspaceSettings({ onScreenshot }: { onScreenshot: () => void }) {
  const s = useWorkspaceStore();
  return (
    <section className="workspace-preferences" aria-label="Scene preferences">
      <h2>Workspace</h2>
      <p>Choose a view, then drag the model to explore. Scroll to zoom; right-drag to pan.</p>
      <h3>Camera & tools</h3>
      <WorkspaceToolbar onScreenshot={onScreenshot} />
      <div className="camera-presets">
        {(['isometric', 'top', 'front'] as const).map((view) => (
          <button className="button" key={view} onClick={() => s.requestCamera(view)}>
            {`${view[0].toUpperCase()}${view.slice(1)}`}
          </button>
        ))}
      </div>
      <h3>Scene appearance</h3>
      <label className="settings-row">
        <span>Lighting intensity</span>
        <input
          aria-label="Lighting intensity"
          type="range"
          min="0.25"
          max="2"
          step="0.05"
          value={s.lightIntensity}
          onChange={(e) => useWorkspaceStore.setState({ lightIntensity: Number(e.target.value) })}
        />
      </label>
      <label className="settings-row">
        <span>Rendering quality</span>
        <select
          aria-label="Rendering quality"
          value={s.quality}
          onChange={(e) => s.setQuality(e.target.value as 'high' | 'low')}
        >
          <option value="high">High</option>
          <option value="low">Performance</option>
        </select>
      </label>
      <label className="settings-row">
        <span>Component labels</span>
        <input
          type="checkbox"
          checked={s.labelsVisible}
          onChange={() => s.toggle('labelsVisible')}
        />
      </label>
      <label className="settings-row">
        <span>Workspace grid</span>
        <input type="checkbox" checked={s.gridVisible} onChange={() => s.toggle('gridVisible')} />
      </label>
      <label className="settings-row">
        <span>Reduced motion</span>
        <input
          type="checkbox"
          checked={s.reducedMotion}
          onChange={(e) => s.setReducedMotion(e.target.checked)}
        />
      </label>
      <EngineeringInsights />
      <p>Concept model · not electrically verified. No electrical simulation is running.</p>
    </section>
  );
}
