import { workspaceNets } from '../ai/snapshot';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { reviewElectrical } from '../engineering/electrical';
import { verifiedPinout } from '../engineering/pins';
import { connectionLabel, electricalNets, endpointKey, logicalPorts } from './model';
import type { SchematicEndpoint } from '../types/workspace';
import './schematic.css';

const COLS = 3;
const X_STEP = 320;
const Y_STEP = 480;
const BOX_WIDTH = 218;
const BOX_HEIGHT = 440;
const offset = { x: 65, y: 60 };
export function SchematicWorkspace() {
  const project = useWorkspaceStore((s) => s.currentProject);
  const selectedEntity=useWorkspaceStore(s=>s.selectedEntity);
  const selectedId = useWorkspaceStore((s) => s.selectedComponentId);
  const select = useWorkspaceStore((s) => s.selectComponent);
  const connect = useWorkspaceStore((s) => s.connectPorts);
  const remove = useWorkspaceStore((s) => s.removeConnection);
  const [source, setSource] = useState<SchematicEndpoint | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetWidth, setSheetWidth] = useState(0);
  // Responsive schematic canvas layout. Measure its real available width, not the window.
  useEffect(() => {
    const node = sheetRef.current;
    if (!node) return;
    const measure = () => {
      const nextWidth = node.clientWidth;
      setSheetWidth((previous) => Math.abs(previous - nextWidth) > 1 ? nextWidth : previous);
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  useEffect(() => {
    setSource(null);
    setMessage(null);
  }, [project.id]);
  const symbols = useMemo(
    () => project.components.filter((c) => logicalPorts(c).length),
    [project],
  );
  const nets = useMemo(() => electricalNets(project), [project]);
  const electricalFindings = useMemo(() => reviewElectrical(project), [project]);
  const columns = Math.max(1, Math.min(COLS, symbols.length));
  const rows = Math.max(1, Math.ceil(symbols.length / COLS));
  const naturalWidth = Math.max(450, offset.x * 2 + (columns - 1) * X_STEP + BOX_WIDTH);
  const width = Math.max(naturalWidth, sheetWidth > 0 ? sheetWidth - 2 : 0);
  // Spread large drawings across their pane; cap the gap so symbols remain related.
  const stepX = columns > 1
    ? Math.min(540, Math.max(X_STEP, (width - 2 * offset.x - BOX_WIDTH) / (columns - 1)))
    : X_STEP;
  const symbolX = (index: number) => {
    const row = Math.floor(index / COLS);
    const countOnRow = Math.min(COLS, symbols.length - row * COLS);
    const rowWidth = BOX_WIDTH + Math.max(0, countOnRow - 1) * stepX;
    return Math.max(offset.x, (width - rowWidth) / 2) + (index % COLS) * stepX;
  };
  const portXY = (index: number, portIndex: number) => {
    const left = portIndex % 2 === 0;
    return {
      x: symbolX(index) + (left ? 0 : BOX_WIDTH),
      y: offset.y + Math.floor(index / COLS) * Y_STEP + 60 + Math.floor(portIndex / 2) * 29,
    };
  };
  const height = Math.max(280, offset.y * 2 + (rows - 1) * Y_STEP + BOX_HEIGHT);
  const wirePoint = (id: string, portId: string) => {
    const index = symbols.findIndex((c) => c.id === id);
    if (index < 0) return null;
    const terminals = logicalPorts(symbols[index]);
    const portIndex = terminals.findIndex((p) => p.id === portId);
    return portIndex < 0 ? null : portXY(index, portIndex);
  };
  const pick = (point: SchematicEndpoint) => {
    const component = project.components.find((c) => c.id === point.componentId);
    if (!component) {
      setSource(null);
      return;
    }
    select(component.id);
    if (!source) {
      setSource(point);
      setMessage(`Choose a destination terminal for ${connectionLabel(project, point)}.`);
      return;
    }
    const error = connect(source, point);
    setMessage(
      error ??
        'Connection saved. Only manufacturer-mapped terminals support pin-level checks; complete circuit behavior is not verified.',
    );
    if (!error || endpointKey(source) === endpointKey(point)) setSource(null);
  };
  return (
    <section className="schematic-shell" aria-label="2D schematic workspace">
      <header className="schematic-header">
        <div>
          <small>ENGINEERING / SCHEMATIC</small>
          <h1>{project.name}</h1>
          <p>
            Verified pins appear when exact manufacturer documentation is available; older symbolic
            ports remain unverified. No PCB routing or simulation.
          </p>
        </div>
        <div className="schematic-zoom" role="group" aria-label="Schematic zoom">
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoom <= 60}
            onClick={() => setZoom((v) => Math.max(60, v - 20))}
          >
            −
          </button>
          <output>{zoom}%</output>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoom >= 160}
            onClick={() => setZoom((v) => Math.min(160, v + 20))}
          >
            +
          </button>
        </div>
      </header>
      <div className="schematic-body">
        <div ref={sheetRef} className="schematic-sheet" aria-label="Schematic drawing" tabIndex={0}>
          {symbols.length ? (
            <svg
              width={(width * zoom) / 100}
              height={(height * zoom) / 100}
              viewBox={`0 0 ${width} ${height}`}
              aria-label="Connected symbols in the active project"
            >
              <defs>
                <pattern id="schematic-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="#30425b" />
                </pattern>
              </defs>
              <rect width={width} height={height} fill="url(#schematic-grid)" />
              {(project.connections ?? []).map((wire) => {
                const a = wirePoint(wire.from.componentId, wire.from.portId);
                const b = wirePoint(wire.to.componentId, wire.to.portId);
                if (!a || !b) return null;
                const midX = (a.x + b.x) / 2;
                return (
                  <path
                    key={wire.id}
                    d={`M ${a.x} ${a.y} H ${midX} V ${b.y} H ${b.x}`}
                    fill="none"
                    stroke={selectedEntity?.kind==='net' && workspaceNets(project).find(n=>n.id===selectedEntity.id)?.terminals.includes(`${wire.from.componentId}:${wire.from.portId}`) ? '#ffd075' : '#6fd6a4'}
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    pointerEvents="none"
                  />
                );
              })}
              {symbols.map((component, index) => {
                const x = symbolX(index);
                const y = offset.y + Math.floor(index / COLS) * Y_STEP;
                const ports = logicalPorts(component);
                return (
                  <g key={component.id}>
                    <rect
                      x={x}
                      y={y}
                      width={BOX_WIDTH}
                      height={BOX_HEIGHT}
                      rx="9"
                      fill={selectedId === component.id ? '#203756' : '#18283c'}
                      stroke={selectedId === component.id ? '#75a8ff' : '#456481'}
                      strokeWidth="1.5"
                    />
                    <g
                      role="button"
                      tabIndex={0}
                      aria-label={`Select ${component.reference} in schematic`}
                      onClick={() => select(component.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          select(component.id);
                        }
                      }}
                    >
                      <rect
                        x={x + 8}
                        y={y + 8}
                        width={BOX_WIDTH - 16}
                        height="43"
                        fill="transparent"
                      />
                      <text x={x + 12} y={y + 25} fill="#f1f6ff" fontWeight="600" fontSize="13">
                        {component.reference}
                      </text>
                      <text x={x + 12} y={y + 43} fill="#a4bdd9" fontSize="10">
                        {component.name.slice(0, 29)}
                      </text>
                    </g>
                    <text
                      x={x + BOX_WIDTH / 2}
                      y={y + BOX_HEIGHT - 15}
                      fill="#718fac"
                      fontSize="9"
                      textAnchor="middle"
                    >
                      {verifiedPinout(component)
                        ? 'VERIFIED + LEGACY PORTS'
                        : 'CONCEPTUAL TERMINALS · DEMO'}
                    </text>
                    {ports.map((port, portIndex) => {
                      const pos = portXY(index, portIndex);
                      const left = portIndex % 2 === 0;
                      const chosen =
                        source?.componentId === component.id && source.portId === port.id;
                      return (
                        <g
                          key={port.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Terminal ${component.reference} ${port.label}`}
                          onClick={() => pick({ componentId: component.id, portId: port.id })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              pick({ componentId: component.id, portId: port.id });
                            }
                          }}
                        >
                          <circle
                            cx={pos.x}
                            cy={pos.y}
                            r={chosen ? 10 : 8}
                            fill={
                              chosen
                                ? '#edbd66'
                                : port.kind === 'power'
                                  ? '#d57979'
                                  : port.kind === 'ground'
                                    ? '#8ba7c2'
                                    : '#71aefa'
                            }
                            stroke="#101b29"
                            strokeWidth="2"
                          />
                          <text
                            x={pos.x + (left ? 12 : -12)}
                            y={pos.y + 4}
                            textAnchor={left ? 'start' : 'end'}
                            fontSize="11"
                            fill={port.verification === 'physical' ? '#9decc5' : '#a4b2c4'}
                          >
                            {port.label}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          ) : (
            <p className="schematic-empty">
              There are no components with logical terminals yet. Add parts in Design first.
            </p>
          )}
        </div>
        <aside className="schematic-net-panel" aria-label="Schematic connections">
          <h2>Connections</h2>
          <p>
            Click one terminal, then another to create a wire. Click a symbol title to select the
            same component in 3D.
          </p>
          {source && (
            <button
              type="button"
              className="schematic-cancel"
              onClick={() => {
                setSource(null);
                setMessage(null);
              }}
            >
              Cancel wire from {connectionLabel(project, source)}
            </button>
          )}
          {message && (
            <p role="status" className="schematic-message">
              {message}
            </p>
          )}
          {selectedId &&
            (() => {
              const selected = project.components.find((c) => c.id === selectedId);
              const pinout = selected && verifiedPinout(selected);
              return pinout ? (
                <div className="schematic-pinout" aria-label="Verified manufacturer pins">
                  <strong>
                    {selected?.reference} · Verified {pinout.package} pins
                  </strong>
                  <p>
                    Only the listed pins are curated, not the entire footprint or powered circuit.
                  </p>
                  <ul>
                    {pinout.pins.map((pin) => (
                      <li key={pin.id}>
                        Pin {pin.number}: {pin.id} · {pin.role}
                        {pin.interface
                          ? ` · ${pin.interface}${pin.function ? ` ${pin.function}` : ''}`
                          : ''}
                      </li>
                    ))}
                  </ul>
                  <a href={pinout.source} target="_blank" rel="noopener noreferrer">
                    Manufacturer datasheet · {pinout.sourceSection}
                  </a>
                </div>
              ) : null;
            })()}
          <h3>Wires ({project.connections?.length ?? 0})</h3>
          {project.connections?.length ? (
            <ul className="schematic-wire-list">
              {project.connections.map((wire) => (
                <li key={wire.id}>
                  <span>
                    {connectionLabel(project, wire.from)} → {connectionLabel(project, wire.to)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove wire ${connectionLabel(project, wire.from)} to ${connectionLabel(project, wire.to)}`}
                    onClick={() => remove(wire.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="schematic-empty-net">No logical connections yet.</p>
          )}
          <h3>
            Electrical review ({electricalFindings.filter((f) => f.severity === 'warning').length}{' '}
            warnings)
          </h3>
          <ul className="schematic-review-list">
            {[...electricalFindings]
              .sort((a, b) => Number(b.status === 'fail') - Number(a.status === 'fail'))
              .map((finding) => (
                <li key={finding.id}>
                  <strong>
                    {finding.status === 'pass'
                      ? '✓ '
                      : finding.status === 'fail'
                        ? '✕ '
                        : finding.severity === 'warning'
                          ? '⚠ '
                          : 'ⓘ '}
                    {finding.status ? `${finding.status.toUpperCase()} · ` : 'UNKNOWN · '}
                    {finding.title}
                  </strong>
                  <p>{finding.details}</p>
                  {finding.remedy && <p>Next: {finding.remedy}</p>}
                  {finding.source && (
                    <a href={finding.source} target="_blank" rel="noopener noreferrer">
                      Manufacturer reference
                    </a>
                  )}
                  {finding.componentId && (
                    <button type="button" onClick={() => select(finding.componentId!)}>
                      Select part
                    </button>
                  )}
                </li>
              ))}
          </ul>
          {electricalFindings.length > 15 && (
            <p>More findings are available in Workspace → Design review.</p>
          )}
          <h3>Logical nets ({nets.length})</h3>
          <ul className="schematic-net-list">
            {nets.map((net) => (
              <li key={net.name}>
                <strong>{net.name}</strong> · {net.terminals.length} terminal(s)
              </li>
            ))}
          </ul>
          <p className="schematic-warning">
            Partial pin-level checks are available for supported manufacturer parts. Unknown
            findings are not passes. This is not complete ERC, simulation, routing or fabrication
            verification.
          </p>
        </aside>
      </div>
    </section>
  );
}
