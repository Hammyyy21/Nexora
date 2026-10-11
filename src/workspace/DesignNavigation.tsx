import { useEffect } from 'react';
import { useDesignLayout, type DesignPanel } from './layout';

export const panelLabels: Record<DesignPanel, string> = {
  explorer: 'Design',
  workspace: 'Workspace',
  inspector: 'Inspector',
  code: 'Code',
  ai: 'AI Guide',
};

/** Viewport controls are part of the main header, not a second navigation bar. */
export function DesignNavigation() {
  const layout = useDesignLayout();
  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)');
    const update = () => useDesignLayout.getState().setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return (
    <div className="workspace-quick-actions">
      <button
        className="design-focus"
        aria-pressed={layout.focusMode}
        onClick={() => layout.setFocusMode(!layout.focusMode)}
        title="Hide viewport annotations for a clearer view"
      >
        Focus Mode
      </button>
      <button
        className="design-focus"
        aria-label={layout.collapsed ? 'Open tools panel' : 'Collapse tools panel'}
        aria-expanded={!layout.collapsed}
        aria-controls="workspace-tools-panel"
        onClick={() => layout.setCollapsed(!layout.collapsed)}
      >
        {layout.collapsed ? 'Show tools' : 'Hide tools'}
      </button>
    </div>
  );
}
