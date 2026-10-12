import { useState } from 'react';
import type { Project } from '../types/workspace';
import { componentFootprint, normalizeBoard, outlinePoints, type Point } from './boardGeometry';
import { componentOutlineOnBoard, placedPads, pointOnBoard } from './pcbLayout';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { logicalPorts } from '../schematic/model';
import { workspaceNets } from '../ai/snapshot';
import './pcb-layout.css';

const vertices = (points: Point[]) => points.map((p) => `${p.x},${p.z}`).join(' ');
export function PCBLayoutPreview({ project }: { project: Project }) {
  const config = project.boardConfiguration;
  const board = project.components.find((part) => part.id === 'pcb');
  const [layerFilter, setLayerFilter] = useState('all');
  if (!config || !board) return null;
  const layers = normalizeBoard(config).stackup!.filter((layer) => layer.kind === 'copper');
  const pads = placedPads(project);
  const nets = workspaceNets(project);
  const margin = 8;
  const parts = project.components.filter((part) => part.id !== 'pcb' && part.type !== 'housing');
  const visiblePads = pads.filter((p) => p.layer?.visible && (layerFilter === 'all' || p.layerId === layerFilter));
  return (
    <section className="pcb-layout-preview" aria-label="PCB layout preview">
      <h3>PCB Layout · Footprints & Pads</h3>
      <p>Board-local coordinates in mm. Pads are user configured; schematic wires are not copper routes.</p>
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
          const key = `${pad.componentId}:${pad.portId ?? ''}`;
          const net = pad.portId ? nets.find((n) => n.terminals.includes(key)) : undefined;
          return <g key={`${pad.componentId}:${pad.id}`} className={pad.layer?.side === 'bottom' ? 'pcb-layout-pad bottom' : 'pcb-layout-pad'}>
            <title>{`${pad.reference} / ${pad.id} · ${pad.layer?.name ?? 'Missing copper layer'} · ${terminal?.label ?? 'Unassigned'} · ${net?.id ?? 'No schematic net'} (not routed)`}</title>
            <polygon points={vertices(pad.outline)} />
            {pad.portId && <circle cx={pad.center.x} cy={pad.center.z} r="0.5" />}
          </g>;
        })}
      </svg>
      <p>{parts.length} components · {pads.length} defined pads · {visiblePads.length} shown.</p>
      <small>Click a component outline to edit its footprint and pads in the Inspector. No manufacturing exports yet.</small>
    </section>
  );
}
