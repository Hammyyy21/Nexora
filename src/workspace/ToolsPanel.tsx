import { useEffect, useRef, useState } from 'react';
import { useDesignLayout, designPanels, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH } from './layout';
import { panelLabels } from './DesignNavigation';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { ProjectSidebar } from '../components/layout/ProjectSidebar';
import { InspectorPanel } from '../components/layout/InspectorPanel';
import { CommandBar } from '../components/layout/CommandBar';
import { FirmwareExplorer } from '../firmware/FirmwareExplorer';
import { WorkspaceSettings } from './WorkspaceSettings';
import { navigateWorkspace, openToolPanel } from '../catalog/navigation';

export function ToolsPanel({ onScreenshot }: { onScreenshot: () => void }) {
  const layout = useDesignLayout();
  const selected = useWorkspaceStore((s) =>
    s.currentProject.components.find((c) => c.id === s.selectedComponentId),
  );
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const maxWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, viewportWidth - 420));
  const collapse = () => {
    layout.setCollapsed(true);
    document.querySelector<HTMLElement>(`.main-navigation button[aria-controls="design-panel-${layout.panel}"]`)?.focus();
  };
  const finish = () => {
    drag.current = null;
    setResizing(false);
  };
  return (
    <>
      {layout.compact && !layout.collapsed && (
        <button className="tools-backdrop" aria-label="Close tools drawer" onClick={collapse} />
      )}
      <aside
        ref={panel}
        id="workspace-tools-panel"
        aria-label="Workspace tools panel"
        hidden={layout.collapsed}
        className={`tools-panel ${layout.expanded ? 'is-expanded' : ''} ${resizing ? 'is-resizing' : ''}`}
        style={{ width: layout.expanded ? undefined : layout.width }}
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            collapse();
          }
        }}
      >
        <div
          className="tools-resizer"
          role="separator"
          aria-label="Resize tools panel"
          aria-orientation="vertical"
          aria-valuemin={MIN_PANEL_WIDTH}
          aria-valuemax={maxWidth}
          aria-valuenow={Math.min(layout.width, maxWidth)}
          tabIndex={layout.compact ? -1 : 0}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, width: panel.current!.getBoundingClientRect().width };
            layout.setExpanded(false);
            setResizing(true);
          }}
          onPointerMove={(e) => {
            if (drag.current)
              layout.setWidth(Math.min(maxWidth, drag.current.width + drag.current.x - e.clientX));
          }}
          onPointerUp={(e) => {
            finish();
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
          onKeyDown={(e) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault();
            e.stopPropagation();
            layout.setExpanded(false);
            layout.setWidth(
              e.key === 'Home'
                ? MIN_PANEL_WIDTH
                : e.key === 'End'
                  ? maxWidth
                  : Math.min(maxWidth, layout.width + (e.key === 'ArrowLeft' ? 20 : -20)),
            );
          }}
        />
        <header className="tools-heading">
          <h2>{panelLabels[layout.panel]}</h2>
          <button
            title="More room for code, properties or chat"
            aria-label={layout.expanded ? 'Restore tools panel width' : 'Expand tools panel'}
            aria-pressed={layout.expanded}
            onClick={() => layout.setExpanded(!layout.expanded)}
          >
            {layout.expanded ? 'Restore' : 'Expand'}
          </button>
          <button title="Collapse panel (Escape)" aria-label="Close tools panel" onClick={collapse}>
            ×
          </button>
        </header>
        {selected && (
          <div className="selected-tools">
            <span title={selected.name}>
              {selected.reference} · {selected.name}
            </span>
            <button onClick={() => navigateWorkspace('code')}>View Code</button>
            <button onClick={() => openToolPanel('ai')}>Ask AI</button>
          </div>
        )}
        {designPanels.map((id) => (
          <div
            key={id}
            id={`design-panel-${id}`}
            className="tool-content"
            role="region"
            aria-label={`${panelLabels[id]} tools`}
            hidden={id !== layout.panel}
            inert={id !== layout.panel}
          >
            {id === 'explorer' && (
              <>
                <div className="design-actions">
                  <button
                    className="button primary"
                    onClick={() => layout.openDrawer('components')}
                  >
                    + Add Component
                  </button>
                  <button className="button" onClick={() => layout.openDrawer('boards')}>
                    Choose Board
                  </button>
                </div>
                <ProjectSidebar />
              </>
            )}
            {id === 'workspace' && <WorkspaceSettings onScreenshot={onScreenshot} />}
            {id === 'inspector' && <InspectorPanel />}
            {id === 'code' && (
              <FirmwareExplorer docked active={!layout.collapsed && layout.panel === 'code'} />
            )}
            {id === 'ai' && (
              <CommandBar docked active={!layout.collapsed && layout.panel === 'ai'} />
            )}
          </div>
        ))}
      </aside>
    </>
  );
}
