import { useState } from 'react';
import type { Project } from '../types/workspace';
import { componentFootprint, normalizeBoard, outlinePoints, type Point } from './boardGeometry';
import { componentOutlineOnBoard, pointOnBoard } from './pcbLayout';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { logicalPorts } from '../schematic/model';
import { buildPCBConnectivity } from './pcbConnectivity';
import './pcb-layout.css';

const vertices = (points: Point[]) => points.map((p) => `${p.x},${p.z}`).join(' ');
export function PCBLayoutPreview({ project }: { project: Project }) {
  const config = project.boardConfiguration;
  const board = project.components.find((part) => part.id === 'pcb');
  const [layerFilter, setLayerFilter] = useState('all');
  if (!config || !board) return null;
  const layers = normalizeBoard(config).stackup!.filter((layer) => layer.kind === 'copper');
  const connectivity = buildPCBConnectivity(project);
  const { pads, airwires, checks } = connectivity;
  const margin = 8;
  const parts = project.components.filter((part) => part.id !== 'pcb' && part.type !== 'housing');
  const visiblePads = pads.filter((p) => p.layer?.visible && (layerFilter === 'all' || p.layerId === layerFilter));
  const visiblePadIds = new Set(visiblePads.map((p) => `${p.componentId}/${p.id}`));
  const shownAirwires = airwires.filter((wire) =>
    visiblePadIds.has(`${wire.from.componentId}/${wire.from.id}`) &&
    visiblePadIds.has(`${wire.to.componentId}/${wire.to.id}`));
  return (
    <section className="pcb-layout-preview" aria-label="PCB layout preview">
      <h3>PCB Layout · Footprints & Pads</h3>
      <p>Board-local coordinates in mm. Dashed airwires show intended net connections only; no copper traces, vias or manufacturing validation.</p>
      <label>Visible copper
        <select aria-label="Preview copper layer" value={layerFilter} onChange={(e) => setLayerFilter(e.target.value)}>
          <option value="all">All visible layers</option>
          {layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name} ({layer.side})</option>)}
        </select>
      </label>
      <svg role="img" aria-label="Top-down PCB layout with component footprints and copper pads"
        viewBox={`${-config.length / 2 - margin} ${-config.width / 2 - margin} ${config.length + margin * 2} ${config.width + margin * 2}`}>
        <polygon className="pcb-layout-outline" points={vertices(outlinePoints(config))} />
        {config.mountingHoles.map((hole, i) => <circle key={hole.id ?? i}
          className="pcb-layout-hole" cx={hole.x} cy={hole.z} r={hole.diameter / 2} />)}
        {config.restrictedRegions.map((r, i) => <rect key={r.id ?? i}
          className="pcb-layout-keepout" x={r.x - r.length / 2} y={r.z - r.width / 2}
          width={r.length} height={r.width} />)}
        {shownAirwires.map((wire) => (
          <line key={wire.id} className={wire.requiresLayerTransition ? 'pcb-airwire needs-via' : 'pcb-airwire'}
            x1={wire.from.center.x} y1={wire.from.center.z}
            x2={wire.to.center.x} y2={wire.to.center.z}>
            <title>{`${wire.netName}: ${wire.from.reference}/${wire.from.id} to ${wire.to.reference}/${wire.to.id} · unrouted airwire${wire.requiresLayerTransition ? ' · layer transition required' : ''}`}</title>
          </line>
        ))}
        {parts.map((part) => {
          const bounds = componentOutlineOnBoard(board, part);
          const center = pointOnBoard(board, part, { x: 0, z: 0 });
          return <g key={part.id} className="pcb-layout-part" onClick={() => useWorkspaceStore.getState().selectComponent(part.id)}>
            <title>{`${part.reference}: ${componentFootprint(part).name} (select component)`}</title>
            <polygon points={vertices(bounds)} />
            <text x={center.x} y={center.z} textAnchor="middle" fontSize="2.8">{part.reference}</text>
          </g>;
        })}
        {visiblePads.map((pad) => {
          const component = project.components.find((part) => part.id === pad.componentId)!;
          const terminal = logicalPorts(component).find((port) => port.id === pad.portId);
          return <g key={`${pad.componentId}:${pad.id}`} className={pad.layer?.side === 'bottom' ? 'pcb-layout-pad bottom' : 'pcb-layout-pad'}>
            <title>{`${pad.reference} / ${pad.id} · ${pad.layer?.name ?? 'Missing copper layer'} · ${terminal?.label ?? 'Unassigned'} · ${pad.netName ?? 'No schematic net'} (not routed)`}</title>
            <polygon points={vertices(pad.outline)} />
            {pad.portId && <circle cx={pad.center.x} cy={pad.center.z} r="0.5" />}
          </g>;
        })}
      </svg>
      <p>{parts.length} components · {pads.length} defined pads · {visiblePads.length} shown · {airwires.length} unrouted airwires.</p>
      <details className="pcb-connectivity-review">
        <summary>Connectivity & pad clearance review ({checks.filter((check) => check.severity === 'warning').length} warnings)</summary>
        <p>Clearance threshold: {connectivity.clearanceMm} mm (illustrative default, not a fabrication specification).</p>
        {pads.filter((pad) => pad.terminalStatus !== 'net').length > 0 &&
          <p>{pads.filter((pad) => pad.terminalStatus === 'unassigned').length} unassigned pad(s); {pads.filter((pad) => pad.terminalStatus === 'unconnected').length} bound terminal(s) without schematic nets.</p>}
        {checks.length ? <ul>{checks.map((check) => <li key={check.id}>
          <strong>{check.title}</strong>: {check.detail}
        </li>)}</ul> : <p>No modeled pad-to-pad violations found; unmodeled copper and missing bindings are not certified.</p>}
      </details>
      <small>Click a component outline to edit its footprint and pads in the Inspector. Airwires are not routed copper. No manufacturing exports yet.</small>
    </section>
  );
}
