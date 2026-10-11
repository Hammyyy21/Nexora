import { useDesignLayout } from '../workspace/layout';
import { getPart } from '../catalog/catalog';
import { hardwareBuildState } from '../catalog/compatibility';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Code2, Copy, Download, Maximize2, Minimize2 } from 'lucide-react';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { downloadFile } from '../lib/project';
import {
  association,
  buildStatus,
  demoBuild,
  exportContent,
  hexBytes,
  hexRows,
  type FirmwareLanguage,
} from './model';
import { clampPanelHeight, draftFor, useFirmwareStore } from './store';
import { CodeEditor } from './CodeEditor';
import './firmware.css';

class FirmwareBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="firmware-empty" role="alert">
        Firmware Explorer encountered an error. Your 3D workspace is available and local drafts are
        retained.{' '}
        <button onClick={() => this.setState({ failed: false })}>Retry Firmware Explorer</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
interface ExplorerProps {
  docked?: boolean;
  active?: boolean;
}
export function FirmwareExplorer(props: ExplorerProps) {
  return (
    <FirmwareBoundary>
      <Explorer {...props} />
    </FirmwareBoundary>
  );
}
const tabs: { id: FirmwareLanguage; label: string }[] = [
  { id: 'c', label: 'C' },
  { id: 'assembly', label: 'Assembly' },
  { id: 'machine', label: 'Machine Code' },
];
function Explorer({ docked = false, active = false }: ExplorerProps) {
  const layout = useDesignLayout();
  const f = useFirmwareStore();
  const open = docked || f.open;
  const expanded = docked ? layout.expanded : f.expanded;
  const project = useWorkspaceStore((s) => s.currentProject);
  const projectId = project.id;
  const hardware = hardwareBuildState(project);
  const selected = useWorkspaceStore((s) => s.selectedComponentId);
  const notify = useWorkspaceStore((s) => s.notify);
  const panel = useRef<HTMLElement>(null);
  const [available, setAvailable] = useState(400);
  const [visited, setVisited] = useState(false);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const [navigation, setNavigation] = useState({ symbol: '', request: 0 });
  const [resetPending, setResetPending] = useState(false);
  const draft = draftFor(f, projectId);
  const related = association(projectId, selected);
  const symbolAvailable = related
    ? new RegExp(`\\b${related.symbol}\\s*\\(`).test(draft.source)
    : false;
  const status = hardware.status === 'demo' ? buildStatus(draft.source) : hardware.status;
  const dirty = draft.source !== draft.savedSource;
  const height = clampPanelHeight(f.expanded ? available : f.height, available);
  useEffect(() => {
    if (docked) return;
    const parent = panel.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() => setAvailable(Math.max(0, parent.clientHeight - 180)));
    observer.observe(parent);
    setAvailable(Math.max(0, parent.clientHeight - 180));
    return () => observer.disconnect();
  }, [docked]);
  useEffect(() => {
    if (f.open || (docked && active)) setVisited(true);
  }, [f.open, docked, active]);
  useEffect(() => {
    setResetPending(false);
  }, [projectId]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        f.tab === 'machine'
          ? hexBytes(demoBuild.machineCode ?? [])
          : exportContent(f.tab, draft.source).text,
      );
      notify(
        f.tab === 'c'
          ? 'C source copied.'
          : 'Recorded demo artifact copied. It is not a rebuild of your edits.',
      );
    } catch {
      notify('Clipboard unavailable. Use Download to keep this file.');
    }
  };
  const download = () => {
    const content = exportContent(f.tab, draft.source);
    try {
      downloadFile(content.text, content.filename, 'text/plain;charset=utf-8');
    } catch {
      notify('Download unavailable in this browser. Use Copy instead.');
    }
  };
  useEffect(() => {
    const target = association(projectId, selected);
    if (target) setNavigation((n) => ({ symbol: target.symbol, request: n.request + 1 }));
  }, [projectId, selected]);
  const navigate = () => {
    if (!related) return;
    f.setTab('c');
    setNavigation({ symbol: related.symbol, request: navigation.request + 1 });
  };
  return (
    <section
      ref={panel}
      aria-label="Firmware Explorer"
      className={`firmware-panel ${resizing ? 'is-resizing' : ''}`}
      style={docked ? undefined : { height: f.open ? height : 36 }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          f.saveSource(projectId);
        }
      }}
    >
      {!docked && f.open && (
        <div
          className="firmware-resizer"
          role="separator"
          aria-label="Resize firmware panel"
          aria-orientation="horizontal"
          aria-valuemin={Math.min(230, available)}
          aria-valuemax={Math.min(680, available)}
          aria-valuenow={Math.round(height)}
          tabIndex={0}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { y: e.clientY, height };
            setResizing(true);
            f.setExpanded(false);
          }}
          onPointerMove={(e) => {
            if (drag.current)
              f.setHeight(
                clampPanelHeight(drag.current.height + drag.current.y - e.clientY, available),
              );
          }}
          onPointerUp={(e) => {
            drag.current = null;
            setResizing(false);
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setResizing(false);
          }}
          onLostPointerCapture={() => {
            drag.current = null;
            setResizing(false);
          }}
          onKeyDown={(e) => {
            if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
              e.preventDefault();
              f.setExpanded(false);
              f.setHeight(
                clampPanelHeight(
                  e.key === 'Home'
                    ? 230
                    : e.key === 'End'
                      ? available
                      : height + (e.key === 'ArrowUp' ? 20 : -20),
                  available,
                ),
              );
            }
          }}
        />
      )}
      <header className="firmware-header">
        <button
          className="firmware-toggle"
          aria-expanded={open}
          aria-controls="firmware-content"
          onClick={() => (docked ? layout.setCollapsed(true) : f.setOpen(!f.open))}
        >
          <Code2 size={14} />
          <span>Firmware Explorer</span>
          {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
        <span className="firmware-demo">DEMO</span>
        {open && (
          <>
            <span className={`firmware-status ${status}`} role="status">
              {!related
                ? 'No mapped firmware'
                : status === 'incompatible'
                  ? 'Incompatible target'
                  : status === 'stale'
                    ? 'Outdated build'
                    : 'Verified demo build'}
            </span>
            <button
              className="firmware-expand"
              aria-label={expanded ? 'Restore editor size' : 'Expand editor'}
              onClick={() => (docked ? layout.setExpanded(!expanded) : f.setExpanded(!expanded))}
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </>
        )}
      </header>
      <div id="firmware-content" className="firmware-content" inert={!open} aria-hidden={!open}>
        <div className="catalog-target">
          <label>
            Firmware target
            <select
              aria-label="Firmware target"
              value={project.firmwareTargetId ?? 'mcu'}
              onChange={(e) => useWorkspaceStore.getState().setFirmwareTarget(e.target.value)}
            >
              {project.components
                .filter((c) => c.id === 'mcu' || getPart(c.catalogId)?.architecture)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <span> · {hardware.target}</span>
        </div>
        {hardware.status !== 'demo' && (
          <p className="firmware-warning" role="status">
            {hardware.explanation}
          </p>
        )}
        {f.storageError && (
          <p className="firmware-warning" role="alert">
            {f.storageError}
          </p>
        )}
        {!related && (
          <div className="firmware-empty">
            <strong>No firmware associated with this component.</strong>
            <p>
              No firmware module has been authored for this object. Adding a visual part does not
              generate drivers. No control module is mapped to this selection.
            </p>
            <button onClick={() => useWorkspaceStore.getState().selectComponent(null)}>
              View project firmware
            </button>
          </div>
        )}
        <div className="firmware-associated" hidden={!related}>
          <div className="firmware-association">
            <span>
              {project.components.find((c) => c.id === selected)?.catalogId
                ? 'Original cooling.c demonstration association. This code has not been ported to the replacement hardware.'
                : related?.description}
            </span>
            <button
              onClick={navigate}
              disabled={!symbolAvailable}
              title={
                symbolAvailable ? undefined : 'This function is absent from the edited C source.'
              }
            >
              {symbolAvailable ? `Go to ${related?.symbol} ↗` : 'Function absent from edited C'}
            </button>
          </div>
          <div className="firmware-tabbar">
            <div
              role="tablist"
              aria-label="Firmware language"
              onKeyDown={(e) => {
                const index = tabs.findIndex((t) => t.id === f.tab);
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                  e.preventDefault();
                  const next =
                    e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? 2
                        : (index + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
                  f.setTab(tabs[next].id);
                  document.getElementById(`firmware-tab-${tabs[next].id}`)?.focus();
                }
              }}
            >
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  id={`firmware-tab-${tab.id}`}
                  role="tab"
                  aria-selected={f.tab === tab.id}
                  aria-controls={`firmware-view-${tab.id}`}
                  tabIndex={f.tab === tab.id ? 0 : -1}
                  onClick={() => f.setTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="firmware-actions">
              <button onClick={copy} aria-label={f.tab === 'machine' ? 'Copy bytes' : 'Copy code'}>
                <Copy size={13} />
              </button>
              <button onClick={download} aria-label="Download firmware file">
                <Download size={13} />
              </button>
            </div>
          </div>
          <div className="firmware-filebar">
            <span>
              {f.tab === 'c'
                ? 'cooling.c · C'
                : f.tab === 'assembly'
                  ? 'cooling.demo.s · ARM Assembly · read only'
                  : 'cooling.demo.hex.txt · read only'}
              {f.tab === 'c' &&
                (dirty ? ' · Unsaved changes (draft retained locally)' : ' · Saved locally')}
            </span>
            {f.tab === 'c' && (
              <div>
                <button aria-pressed={f.editing} onClick={() => f.setEditing(!f.editing)}>
                  {f.editing ? 'Lock C' : 'Edit C'}
                </button>
                <button onClick={() => f.saveSource(projectId)} disabled={!dirty}>
                  Save C
                </button>
                <button onClick={() => setResetPending(true)}>Reset sample</button>
              </div>
            )}
          </div>
          {resetPending && (
            <div className="firmware-warning" role="alert">
              Replace your C edits with the original demo?{' '}
              <button
                onClick={() => {
                  f.resetSource(projectId);
                  setResetPending(false);
                }}
              >
                Reset C source
              </button>
              <button onClick={() => setResetPending(false)}>Keep edits</button>
            </div>
          )}
          {status === 'stale' && (
            <p className="firmware-warning">
              C source changed. Assembly and bytes below belong to the original demo build.
              Target-specific recompilation is unavailable.
            </p>
          )}
          <div className="firmware-code-region">
            <div
              id="firmware-view-c"
              role="tabpanel"
              aria-labelledby="firmware-tab-c"
              hidden={f.tab !== 'c'}
            >
              {visited && (
                <CodeEditor
                  key={projectId}
                  language="c"
                  value={draft.source}
                  readonly={!f.editing}
                  onChange={(source) => f.editSource(projectId, source)}
                  navigation={navigation}
                />
              )}
            </div>
            <div
              id="firmware-view-assembly"
              role="tabpanel"
              aria-labelledby="firmware-tab-assembly"
              hidden={f.tab !== 'assembly'}
            >
              {visited &&
                (demoBuild.assembly ? (
                  <CodeEditor language="assembly" value={demoBuild.assembly} readonly />
                ) : (
                  <p className="firmware-empty">Assembly unavailable for this build.</p>
                ))}
            </div>
            <div
              id="firmware-view-machine"
              role="tabpanel"
              aria-labelledby="firmware-tab-machine"
              hidden={f.tab !== 'machine'}
              className="machine-view"
            >
              <p>
                .text section offsets, starting at 0 · {demoBuild.machineCode?.length ?? 0} bytes ·
                Not file offsets, virtual addresses, or physical flash addresses.
              </p>
              {demoBuild.machineCode?.length ? (
                <>
                  <table>
                    <thead>
                      <tr>
                        <th>OFFSET</th>
                        <th>HEX BYTES</th>
                        <th>ASCII</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hexRows(demoBuild.machineCode).map((row) => (
                        <tr key={row.offset}>
                          <td>{row.offset}</td>
                          <td>{row.hex}</td>
                          <td>{row.ascii}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <details>
                    <summary>Verified disassembly · instruction offsets</summary>
                    <pre>{demoBuild.disassembly}</pre>
                  </details>
                </>
              ) : (
                <p className="firmware-empty">
                  Machine-code data is unavailable. No binary has been generated.
                </p>
              )}
            </div>
          </div>
          <details className="firmware-build">
            <summary>{demoBuild.targetArchitecture} · Build details & assumptions</summary>
            <p>{demoBuild.compiler}</p>
            <code>{demoBuild.compilerFlags.join(' ')}</code>
            <p>Original source revision: {demoBuild.sourceRevision}</p>
            <p>Source SHA-256: {demoBuild.sourceSha256}</p>
            <p>
              Offline compiled demo .text, verified by reassembling the compiler output. RAM
              adapters only; no startup, sensor driver, GPIO/PWM configuration, vector table, linker
              layout, or flash image. Live compilation and AI generation are planned for a later
              phase. Hardware reset/import preserves firmware drafts; Reset sample resets C
              separately.
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}
