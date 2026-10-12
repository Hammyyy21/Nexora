import { useState } from 'react';
import { Vector3 } from 'three';
import type { HardwareComponent, Vec3 } from '../types/workspace';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { boardMatrix, componentFootprint } from './boardGeometry';
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
