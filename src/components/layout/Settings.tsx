import { useEffect, useRef } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { useWorkspaceStore as useStore } from '../../store/useWorkspaceStore';
import { IconButton } from '../ui/IconButton';
export function Settings() {
  const s = useStore();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (s.settingsOpen) d.showModal();
    else d.close();
  }, [s.settingsOpen]);
  return (
    <dialog
      ref={ref}
      className="settings-dialog"
      onCancel={() => {
        if (s.settingsOpen) s.toggle('settingsOpen');
      }}
      onClick={(e) => {
        if (e.target === ref.current) s.toggle('settingsOpen');
      }}
    >
      <div className="settings-heading">
        <SlidersHorizontal size={18} />
        <h2>Make it your workspace.</h2>
        <IconButton label="Close preferences" onClick={() => s.toggle('settingsOpen')}>
          <X size={17} />
        </IconButton>
      </div>
      <p>Display preferences apply to this session.</p>
      <label className="settings-row">
        <span>
          <strong>Rendering quality</strong>
          <small>Lower quality reduces GPU workload.</small>
        </span>
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
        <span>
          <strong>Reduced motion</strong>
          <small>Skip camera and assembly animations.</small>
        </span>
        <input
          type="checkbox"
          className="switch"
          checked={s.reducedMotion}
          onChange={(e) => s.setReducedMotion(e.target.checked)}
        />
      </label>
      <label className="settings-row">
        <span>
          <strong>Component labels</strong>
          <small>Show references in the viewport.</small>
        </span>
        <input
          type="checkbox"
          className="switch"
          checked={s.labelsVisible}
          onChange={() => s.toggle('labelsVisible')}
        />
      </label>
      <label className="settings-row">
        <span>
          <strong>Workspace grid</strong>
          <small>Keep a sense of scale and orientation.</small>
        </span>
        <input
          type="checkbox"
          className="switch"
          checked={s.gridVisible}
          onChange={() => s.toggle('gridVisible')}
        />
      </label>
      <div className="keyboard-help">
        <span>KEYBOARD SHORTCUTS</span>
        <p>
          <kbd>V</kbd>Select <kbd>O</kbd>Orbit <kbd>H</kbd>Pan <kbd>F</kbd>Focus / fit <kbd>0</kbd>
          Reset
        </p>
      </div>
    </dialog>
  );
}
