import { useState } from 'react';
import { ChevronDown, ChevronUp, Move3D } from 'lucide-react';
import { useWorkspaceStore as useStore } from '../../store/useWorkspaceStore';
import { assessPosition, MM_PER_UNIT, movable } from '../../lib/transforms';
import type { Vec3 } from '../../types/workspace';
import './position-transform.css';

function Coordinate({
  axis,
  value,
  disabled,
  onCommit,
}: {
  axis: string;
  value: number;
  disabled: boolean;
  onCommit: (value: number) => boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const commit = () => {
    if (draft === null) return;
    const number = draft.trim() === '' ? NaN : Number(draft);
    if (!Number.isFinite(number) || !onCommit(number / MM_PER_UNIT)) {
      setError(true);
      return;
    }
    setDraft(null);
    setError(false);
  };
  return (
    <label className={`coordinate coordinate-${axis.toLowerCase()}`}>
      <span>{axis}</span>
      <input
        aria-label={`${axis} position (mm)`}
        aria-invalid={error}
        title={
          error
            ? 'Enter a valid position between −200 and 200 mm.'
            : `${axis} position in millimeters`
        }
        type="number"
        step="0.1"
        min="-200"
        max="200"
        value={
          disabled
            ? Number((value * MM_PER_UNIT).toFixed(6))
            : (draft ?? Number((value * MM_PER_UNIT).toFixed(6)))
        }
        disabled={disabled}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            useStore.setState({ transformError: null });
            setDraft(null);
            setError(false);
          }
        }}
      />
      {error && (
        <span className="transform-warning" role="alert">
          Invalid position
        </span>
      )}
    </label>
  );
}

export function PositionTransform() {
  const s = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const c = s.currentProject.components.find((item) => item.id === s.selectedComponentId);
  if (!c || s.placement) return null;
  const position = s.componentDrag?.id === c.id ? s.componentDrag.position : c.position;
  const fixed = !movable(c);
  const assessment = assessPosition(s.currentProject, c, position);
  return (
    <section
      className="position-transform"
      aria-label="Position & Transform"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <header>
        <Move3D size={15} />
        <strong>Position &amp; Transform</strong>
        <button
          aria-label={collapsed ? 'Expand transform controls' : 'Collapse transform controls'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
      </header>
      <div className="transform-name" title={c.name}>
        {c.name}
      </div>
      {!collapsed && (
        <>
          <div className="transform-modes" role="group" aria-label="Position editing mode">
            <button
              aria-pressed={s.dragMode}
              disabled={fixed || !c.visible}
              title="Drag the colored axes or plane handles. Escape cancels a gesture."
              onClick={() => s.setDragMode(!s.dragMode)}
            >
              Drag Mode
            </button>
            <button aria-pressed={!s.dragMode} onClick={() => s.setDragMode(false)}>
              XYZ Mode
            </button>
          </div>
          <div className="transform-coordinates">
            {(['X', 'Y', 'Z'] as const).map((axis, i) => (
              <Coordinate
                key={`${c.id}-${axis}-${c.position[i]}-${!!s.componentDrag}`}
                axis={axis}
                value={position[i]}
                disabled={fixed || !!s.componentDrag}
                onCommit={(value) => {
                  const next = [...c.position] as Vec3;
                  next[i] = value;
                  return s.moveComponent(c.id, next);
                }}
              />
            ))}
          </div>
          <p className="transform-hint">Millimeters · canonical position</p>
          {!fixed && (
            <label className="transform-placement">
              Placement
              <select
                aria-label="Placement constraints"
                value={s.currentProject.placementMode ?? 'free'}
                disabled={!!s.componentDrag}
                onChange={(e) => s.setPlacementMode(e.target.value as 'free' | 'board')}
              >
                <option value="free">Free workspace</option>
                <option value="board">Within PCB bounds</option>
              </select>
            </label>
          )}
          {fixed ? (
            <p className="transform-hint">Fixed structure — position is locked.</p>
          ) : (
            <>
              {s.transformError && (
                <p className="transform-warning" role="alert">
                  {s.transformError}
                </p>
              )}
              {!s.transformError && !assessment.valid && (
                <p className="transform-warning" role="status">
                  {assessment.error}
                </p>
              )}
              {assessment.warnings.map((warning) => (
                <p className="transform-warning" key={warning}>
                  {warning}
                </p>
              ))}
              <p className="transform-hint">
                {!c.visible
                  ? 'Show this component to use the gizmo. '
                  : s.dragMode
                    ? 'Drag an axis; Esc cancels. '
                    : 'Enter or leave a field to apply. '}
                Visual placement only; wiring is unverified.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
