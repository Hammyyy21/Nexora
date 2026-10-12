import { useState } from 'react';
import { Vector3 } from 'three';
import type { HardwareComponent, Vec3 } from '../types/workspace';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { boardMatrix, componentFootprint, normalizeBoard, type FootprintPad } from './boardGeometry';
import { logicalPorts } from '../schematic/model';
import { assessPosition, movable } from '../lib/transforms';
export function PCBComponentEditor({ component: c }: { component: HardwareComponent }) {
  const s = useWorkspaceStore();
  const [footprint, setFootprint] = useState(componentFootprint(c));
  if (!movable(c)) return null;
  const b = s.currentProject.components.find((c) => c.id === 'pcb');
  const coord = s.currentProject.boardConfiguration?.coordinates;
  const local = b
    ? new Vector3(...c.position).applyMatrix4(boardMatrix(b).invert())
    : new Vector3(...c.position);
  const assessment = assessPosition(s.currentProject, c, c.position);
  // Legacy/demo projects may have no editable PCB configuration. Keep the inspector usable.
  const copperLayers = s.currentProject.boardConfiguration
    ? normalizeBoard(s.currentProject.boardConfiguration).stackup!.filter((layer) => layer.kind === 'copper')
    : [];
  const terminals = logicalPorts(c);
  const updatePad = (id: string, patch: Partial<FootprintPad>) =>
    setFootprint((old) => ({
      ...old,
      pads: (old.pads ?? []).map((pad) => pad.id === id ? { ...pad, ...patch } : pad),
    }));

  return (
    <section className="board-configuration" aria-label="PCB component placement">
      <h3>PCB placement</h3>
      <label>
        Board side
        <select
          aria-label="Board side"
          value={c.side ?? 'top'}
          onChange={(e) =>
            s.applyPCBEdit({
              type: 'update_component',
              component_id: c.id,
              side: e.target.value as 'top' | 'bottom',
            })
          }
        >
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </select>
      </label>
      {(['x', 'z'] as const).map((axis) => (
        <label key={axis}>
          Board {axis.toUpperCase()} (mm)
          <input
            type="number"
            step="any"
            value={Number(
              (
                (local[axis] * 10 - (coord?.origin[axis] ?? 0)) *
                (coord?.[axis === 'x' ? 'xDirection' : 'zDirection'] ?? 1)
              ).toFixed(3),
            )}
            onChange={(e) => {
              const v = local.clone();
              v[axis] =
                (e.target.valueAsNumber *
                  (coord?.[axis === 'x' ? 'xDirection' : 'zDirection'] ?? 1) +
                  (coord?.origin[axis] ?? 0)) /
                10;
              s.moveComponent(c.id, (b ? v.applyMatrix4(boardMatrix(b)) : v).toArray() as Vec3);
            }}
          />
        </label>
      ))}
      <label>
        PCB rotation (degrees)
        <input
          type="number"
          min="-360"
          max="360"
          value={c.rotation[1]}
          onChange={(e) =>
            s.applyPCBEdit({
              type: 'update_component',
              component_id: c.id,
              rotation: [c.rotation[0], e.target.valueAsNumber, c.rotation[2]],
            })
          }
        />
      </label>
      <details>
        <summary>Edit footprint envelope</summary>
        <p>
          User dimensions describe clearance bounds, not physical pads or a verified pin mapping.
        </p>
        <label>
          Footprint name
          <input
            maxLength={80}
            value={footprint.name}
            onChange={(e) => setFootprint({ ...footprint, name: e.target.value })}
          />
        </label>
        {(['length', 'width'] as const).map((k) => (
          <label key={k}>
            Footprint {k} (mm)
            <input
              type="number"
              min="0.1"
              max="200"
              step="any"
              value={footprint[k]}
              onChange={(e) => setFootprint({ ...footprint, [k]: e.target.valueAsNumber })}
            />
          </label>
        ))}
        <fieldset className="pcb-pad-editor">
          <legend>Copper pads (user-configured)</legend>
          <p>Local X/Z in mm. Assign an exact terminal to associate a pad with the schematic. No traces are routed.</p>
          {(footprint.pads ?? []).map((pad, i) => (
            <div className="board-hole-editor pcb-pad-row" key={pad.id}>
              <strong>Pad {i + 1}</strong>
              <label>Layer
                <select aria-label={`Pad ${i + 1} layer`} value={pad.layerId}
                  onChange={(e) => updatePad(pad.id, { layerId: e.target.value })}>
                  {copperLayers.map((layer) => (
                    <option key={layer.id} value={layer.id}>{layer.name} ({layer.side})</option>
                  ))}
                  {!copperLayers.some((layer) => layer.id === pad.layerId) &&
                    <option value={pad.layerId}>Missing: {pad.layerId}</option>}
                </select>
              </label>
              <label>Schematic terminal
                <select aria-label={`Pad ${i + 1} terminal`} value={pad.portId ?? ''}
                  onChange={(e) => updatePad(pad.id, { portId: e.target.value || undefined })}>
                  <option value="">Unassigned</option>
                  {terminals.map((port) => (
                    <option key={port.id} value={port.id}>
                      {port.label} ({port.verification === 'physical' ? 'documented pin' : 'conceptual'})
                    </option>
                  ))}
                </select>
              </label>
              {(['x','z','length','width'] as const).map((axis) => (
                <label key={axis}>{axis.toUpperCase()} (mm)
                  <input aria-label={`Pad ${i + 1} ${axis}`} type="number" step="0.1"
                    value={Number.isFinite(pad[axis]) ? pad[axis] : ''}
                    onChange={(e) => updatePad(pad.id, {
                      [axis]: e.target.valueAsNumber,
                      ...(pad.shape === 'circle' && (axis === 'length' || axis === 'width')
                        ? { length: e.target.valueAsNumber, width: e.target.valueAsNumber } : {}),
                    })}/>
                </label>
              ))}
              <label>Shape
                <select aria-label={`Pad ${i + 1} shape`} value={pad.shape}
                  onChange={(e) => {
                    const shape = e.target.value as FootprintPad['shape'];
                    updatePad(pad.id, { shape, ...(shape === 'circle' ? { width: pad.length } : {}) });
                  }}>
                  <option value="rect">Rectangle</option>
                  <option value="circle">Circle</option>
                </select>
              </label>
              <button type="button" onClick={() => setFootprint((old) => ({
                ...old, pads: (old.pads ?? []).filter((p) => p.id !== pad.id),
              }))}>Remove pad</button>
            </div>
          ))}
          <button type="button" disabled={!!(!copperLayers.length || (footprint.pads?.length ?? 0) >= 64)}
            onClick={() => setFootprint((old) => ({
              ...old, pads: [...(old.pads ?? []), {
                id: `pad-${crypto.randomUUID()}`, x: 0, z: 0,
                length: Math.min(1, old.length, old.width),
                width: Math.min(1, old.length, old.width), shape: 'rect', layerId: copperLayers[0].id,
              }],
            }))}>
            Add copper pad
          </button>
        </fieldset>
        <button
          className="button"
          onClick={() =>
            s.applyPCBEdit({ type: 'update_component', component_id: c.id, footprint })
          }
        >
          Apply footprint
        </button>
      </details>
      <button
        className="button"
        onClick={() => s.applyPCBEdit({ type: 'duplicate_component', component_id: c.id })}
      >
        Duplicate component
      </button>
      <button className="button" onClick={() => s.removeComponent(c.id)}>
        Remove component
      </button>
      {!assessment.valid && <p role="alert">{assessment.error}</p>}
      {assessment.warnings.map((w) => (
        <p key={w} role="status">
          {w}
        </p>
      ))}
    </section>
  );
}
