import { useState } from 'react';
import type { BoardConfiguration } from './boardSpecifications';
import { defaultLayers, normalizeBoard, type BoardOutline } from './boardGeometry';
export function PCBSettings({
  draft,
  onChange,
}: {
  draft: BoardConfiguration;
  onChange: (c: BoardConfiguration) => void;
}) {
  const c = normalizeBoard(draft);
  const [polygon, setPolygon] = useState(
    c.outline?.kind === 'polygon'
      ? c.outline.points.map((p) => `${p.x},${p.z}`).join('\n')
      : '-40,-25\n40,-25\n40,25\n-40,25',
  );
  const [error, setError] = useState('');
  return (
    <fieldset>
      <legend>PCB geometry & layers</legend>
      <label>
        Board outline
        <select
          aria-label="Board outline"
          value={c.outline!.kind}
          onChange={(e) => {
            const kind = e.target.value as BoardOutline['kind'];
            const outline: BoardOutline =
              kind === 'polygon'
                ? {
                    kind,
                    points: [
                      { x: -c.length / 2, z: -c.width / 2 },
                      { x: c.length / 2, z: -c.width / 2 },
                      { x: c.length / 2, z: c.width / 2 },
                      { x: -c.length / 2, z: c.width / 2 },
                    ],
                  }
                : kind === 'rounded-rectangle'
                  ? { kind, radius: 1.8 }
                  : { kind };
            onChange({ ...c, outline, ...(kind === 'circle' ? { width: c.length } : {}) });
          }}
        >
          <option value="rectangle">Rectangle</option>
          <option value="circle">Circle (length = diameter)</option>
          <option value="rounded-rectangle">Rounded rectangle</option>
          <option value="polygon">Custom polygon</option>
        </select>
      </label>
      {c.outline?.kind === 'rounded-rectangle' && (
        <label>
          Corner radius (mm)
          <input
            type="number"
            step="any"
            value={c.outline.radius}
            onChange={(e) =>
              onChange({
                ...c,
                outline: { kind: 'rounded-rectangle', radius: e.target.valueAsNumber },
              })
            }
          />
        </label>
      )}
      {c.outline?.kind === 'polygon' && (
        <label>
          Polygon vertices · x,z mm per line
          <textarea
            aria-label="Polygon vertices"
            value={polygon}
            onChange={(e) => {
              setPolygon(e.target.value);
              const points = e.target.value
                .trim()
                .split('\n')
                .map((l) => {
                  const [x, z] = l.split(',').map(Number);
                  return { x, z };
                });
              onChange({ ...c, outline: { kind: 'polygon', points } });
              setError(points.length < 3 ? 'At least three vertices are required.' : '');
            }}
          />
          {error}
        </label>
      )}
      <p>
        Coordinates use board-local X/Z, in mm. Origin affects coordinate entry and snapping; it
        does not move existing parts.
      </p>
      {(['x', 'z'] as const).map((axis) => (
        <label key={axis}>
          Origin {axis.toUpperCase()} (mm)
          <input
            type="number"
            step="any"
            value={c.coordinates!.origin[axis]}
            onChange={(e) =>
              onChange({
                ...c,
                coordinates: {
                  ...c.coordinates!,
                  origin: { ...c.coordinates!.origin, [axis]: e.target.valueAsNumber },
                },
              })
            }
          />
        </label>
      ))}
      {(['xDirection', 'zDirection'] as const).map((axis) => (
        <label key={axis}>
          {axis[0].toUpperCase()} direction
          <select
            value={c.coordinates![axis]}
            onChange={(e) =>
              onChange({
                ...c,
                coordinates: { ...c.coordinates!, [axis]: Number(e.target.value) as 1 | -1 },
              })
            }
          >
            <option value={1}>Positive</option>
            <option value={-1}>Reversed</option>
          </select>
        </label>
      ))}
      <label>
        Snap to grid
        <input
          type="checkbox"
          checked={c.grid!.enabled}
          onChange={(e) => onChange({ ...c, grid: { ...c.grid!, enabled: e.target.checked } })}
        />
      </label>
      <label>
        Grid spacing (mm)
        <input
          type="number"
          min="0.1"
          max="50"
          step="0.1"
          value={c.grid!.spacing}
          onChange={(e) =>
            onChange({ ...c, grid: { ...c.grid!, spacing: e.target.valueAsNumber } })
          }
        />
      </label>
      <label>
        Supported board sides
        <select
          value={c.supportedSides!.join(',')}
          onChange={(e) =>
            onChange({
              ...c,
              supportedSides: e.target.value === 'top' ? ['top'] : ['top', 'bottom'],
            })
          }
        >
          <option value="top,bottom">Top and bottom</option>
          <option value="top">Top only</option>
        </select>
      </label>
      <label>
        Layer count
        <input
          type="number"
          min="1"
          max="32"
          value={c.stackup!.filter((l) => l.kind === 'copper').length}
          onChange={(e) => {
            const count = e.target.valueAsNumber;
            if (Number.isInteger(count) && count >= 1 && count <= 32)
              onChange({
                ...c,
                layers: count,
                stackup: [
                  ...defaultLayers(count),
                  ...c.stackup!.filter((l) => l.kind === 'mechanical'),
                ],
              });
          }}
        />
      </label>
      {c.stackup!.map((layer, i) => (
        <div key={layer.id} className="board-hole-editor">
          <label>
            Layer name
            <input
              aria-label={`Layer ${i + 1} name`}
              maxLength={80}
              value={layer.name}
              onChange={(e) =>
                onChange({
                  ...c,
                  stackup: c.stackup!.map((l) =>
                    l.id === layer.id ? { ...l, name: e.target.value } : l,
                  ),
                })
              }
            />
          </label>
          <label>
            Side
            <select
              aria-label={`Layer ${i + 1} side`}
              value={layer.side}
              onChange={(e) =>
                onChange({
                  ...c,
                  stackup: c.stackup!.map((l) =>
                    l.id === layer.id ? { ...l, side: e.target.value as typeof l.side } : l,
                  ),
                })
              }
            >
              {['top', 'bottom', 'internal', 'all'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>Visible in PCB layout
            <input type="checkbox" aria-label={`Layer ${i + 1} visible`}
              checked={layer.visible}
              onChange={(e) => onChange({ ...c, stackup: c.stackup!.map((l) =>
                l.id === layer.id ? { ...l, visible: e.target.checked } : l) })}/>
          </label>
          {layer.kind === 'mechanical' && (
            <button
              type="button"
              onClick={() =>
                onChange({ ...c, stackup: c.stackup!.filter((l) => l.id !== layer.id) })
              }
            >
              Remove layer
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="button"
        onClick={() =>
          onChange({
            ...c,
            stackup: [
              ...c.stackup!,
              {
                id: `mechanical-${crypto.randomUUID()}`,
                name: 'Mechanical',
                kind: 'mechanical',
                side: 'all',
                visible: true,
              },
            ],
          })
        }
      >
        Add mechanical layer
      </button>
    </fieldset>
  );
}
