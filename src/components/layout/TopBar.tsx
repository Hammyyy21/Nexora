import { projectWithBuildPlan, saveWorkspaceWithPlan } from '../../ai/planner/state';
import { useProjectsStore } from '../../projects/store';
import { useLibraryStore } from '../../catalog/store';
import { useDesignLayout } from '../../workspace/layout';
import { navigateWorkspace, openToolPanel } from '../../catalog/navigation';
import { DesignNavigation } from '../../workspace/DesignNavigation';
import { useRef } from 'react';
import {
  Undo2,
  Redo2,
  Save,
  SlidersHorizontal,
  ChevronDown,
  Download,
  Upload,
  FolderOpen,
  RotateCcw,
  Box,
} from 'lucide-react';
import { useWorkspaceStore as useStore } from '../../store/useWorkspaceStore';
import { downloadFile, loadProject, parseProject, serializeProject } from '../../lib/project';
import { IconButton } from '../ui/IconButton';
export function TopBar() {
  const s = useStore();
  const projects = useProjectsStore();
  const input = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const saved = s.savedSnapshot === JSON.stringify(s.currentProject);
  return (
    <header className="topbar">
      <div className="brand" aria-label="Nexora design studio">
        <span className="brand-mark">
          <svg viewBox="0 0 28 28" fill="none">
            <path
              d="M22 7H10L6 11V17L10 21H22"
              stroke="currentColor"
              strokeWidth="2.7"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span>
          Nexora<span className="brand-sub">DESIGN INTELLIGENCE</span>
        </span>
      </div>
      <div className="top-divider" />
      <button
        className="project-switch"
        aria-label="Open projects"
        onClick={() => projects.setDashboardOpen(true)}
      >
        <Box size={15} />
        <span>{s.currentProject.name}</span>
        <span className="version-tag">v1.0</span>
      </button>
      <span className="save-status">
        <i className={saved ? 'saved' : ''} />
        {saved ? 'Saved locally' : 'Local project'}
      </span>
      <div className="top-actions">
        <div className="history-actions">
          <IconButton label="Undo (⌘/Ctrl Z)" onClick={s.undo} disabled={!s.undoHistory.length}>
            <Undo2 size={16} />
          </IconButton>
          <IconButton
            label="Redo (⌘/Ctrl Shift Z)"
            onClick={s.redo}
            disabled={!s.redoHistory.length}
          >
            <Redo2 size={16} />
          </IconButton>
        </div>
        <IconButton label="Reset workspace" onClick={s.reset}>
          <RotateCcw size={16} />
        </IconButton>
        <IconButton label="Display preferences" onClick={() => openToolPanel('workspace')}>
          <SlidersHorizontal size={16} />
        </IconButton>
        <div className="save-group">
          <button className="button primary small" onClick={saveWorkspaceWithPlan}>
            <Save size={14} />
            <span>Save project</span>
          </button>
          <details className="file-menu" ref={menu}>
            <summary aria-label="Project file actions" title="Project file actions">
              <ChevronDown size={14} />
            </summary>
            <div className="dropdown">
              <button
                onClick={() => {
                  try {
                    projects.importNew(loadProject());
                  } catch (error) {
                    s.notify((error as Error).message);
                  }
                  menu.current!.open = false;
                }}
              >
                <FolderOpen size={15} />
                Load local save
              </button>
              <button
                onClick={() => {
                  downloadFile(
                    serializeProject(projectWithBuildPlan()),
                    'nexora-project.json',
                    'application/json',
                  );
                  s.notify('Project exported as JSON.');
                  menu.current!.open = false;
                }}
              >
                <Download size={15} />
                Export project JSON
              </button>
              <button
                onClick={() => {
                  input.current?.click();
                  menu.current!.open = false;
                }}
              >
                <Upload size={15} />
                Import project JSON
              </button>
              <p>Files stay on your device.</p>
            </div>
          </details>
        </div>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="Import project file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              try {
                if (file.size > 250000)
                  throw new Error('Project file is too large (250 KB maximum).');
                projects.importNew(parseProject(await file.text()));
              } catch (error) {
                s.notify((error as Error).message);
              }
              e.target.value = '';
            }
          }}
        />
      </div>
    </header>
  );
}
export function WorkspaceHeader() {
  const layout = useDesignLayout();
  const workspace = useLibraryStore((v) => v.workspace);
  return (
    <div className="workspace-header">
      <div className="breadcrumb">
        <span>Workspace</span>
        <span className="slash">/</span>
        <strong>
          {workspace === 'components'
            ? 'Hardware library'
            : workspace === 'schematic'
              ? '2D schematic'
              : workspace === 'pcb'
                ? 'PCB layout'
                : '3D design'}
        </strong>
      </div>
      <nav
        className="main-navigation"
        aria-label="Main workspace navigation"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
          const index = buttons.indexOf(event.target as HTMLButtonElement);
          if (index < 0) return;
          event.preventDefault();
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : Math.max(
                    0,
                    Math.min(buttons.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)),
                  );
          buttons[next].focus();
          buttons[next].click();
          buttons[next].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        }}
      >
        {(
          [
            ['design', 'Design', 'explorer'],
            ['pcb', 'PCB Layout', null],
            ['schematic', 'Schematic', null],
            ['inspector', 'Inspector', 'inspector'],
            ['workspace', 'Workspace', 'workspace'],
            ['code', 'Code', 'code'],
            ['components', 'Components', null],
            ['ai', 'AI Guide', 'ai'],
          ] as const
        ).map(([view, label, panel]) => {
          const active =
            view === 'components' || view === 'schematic' || view === 'pcb'
              ? workspace === view
              : workspace !== 'components' && workspace !== 'schematic' && layout.panel === panel;
          const dockOpen =
            panel !== null &&
            workspace !== 'components' &&
            workspace !== 'schematic' &&
            layout.panel === panel &&
            !layout.collapsed;
          return (
            <button
              key={view}
              type="button"
              aria-current={active ? 'page' : undefined}
              aria-expanded={panel !== null ? dockOpen : undefined}
              aria-controls={panel !== null ? `design-panel-${panel}` : undefined}
              onClick={() => {
                if (view === 'design') {
                  navigateWorkspace('design');
                  openToolPanel('explorer');
                } else if (view === 'components' || view === 'schematic' || view === 'pcb')
                  navigateWorkspace(view);
                else if (view === 'code') navigateWorkspace('code');
                else openToolPanel(panel!);
              }}
            >
              {label}
            </button>
          );
        })}
      </nav>
      <DesignNavigation />
    </div>
  );
}
