import { useEffect, useMemo, useRef, useState } from 'react';
import { placementWidths, usePlacementLayout } from './placementLayout';
import { assessPosition } from '../lib/transforms';
import { suggestPlacements } from '../engineering/placement';
import { useWorkspaceStore as useStore } from '../store/useWorkspaceStore';
import { getPart } from './catalog';
import { CatalogModel } from './CatalogModel';
import { Appearance } from '../three/Primitives';
import type { Vec3 } from '../types/workspace';
/** Highlight computed low-overlap board regions while placing; suggestions can be ignored. */
export function PlacementZones() {
  const pending = useStore((s) => s.placement);
  const project = useStore((s) => s.currentProject);
  const move = useStore((s) => s.movePlacement);
  const suggestions = useMemo(
    () => (pending ? suggestPlacements(project, pending) : []),
    [project, pending],
  );
  const board = project.components.find((c) => c.id === 'pcb');
  if (!pending || !board || !suggestions.length) return null;
  return (
    <group>
      {suggestions.map((spot, i) => (
        <group
          key={spot.id}
          position={[
            spot.position[0],
            board.position[1] + board.dimensions[1] / 2 + 0.015,
            spot.position[2],
          ]}
        >
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={(event) => {
              event.stopPropagation();
              move(spot.position);
            }}
          >
            <planeGeometry args={[pending.dimensions[0] + 0.3, pending.dimensions[2] + 0.3]} />
            <meshBasicMaterial
              color={i === 0 ? '#57e5b5' : '#6caeff'}
              transparent
              opacity={0.22}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-2}
              side={2}
            />
          </mesh>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={(event) => {
              event.stopPropagation();
              move(spot.position);
            }}
          >
            <ringGeometry args={[0.12, 0.19, 32]} />
            <meshBasicMaterial
              color={i === 0 ? '#74ffd2' : '#9bc6ff'}
              transparent
              opacity={0.95}
              depthWrite={false}
              side={2}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
export function PlacementGhost() {
  const pending = useStore((s) => s.placement);
  const part = getPart(pending?.catalogId);
  if (!pending || !part) return null;
  return (
    <group
      position={pending.position}
      rotation={pending.rotation.map((n) => (n * Math.PI) / 180) as Vec3}
    >
      <Appearance.Provider
        value={{ color: '#30d7e8', opacity: 0.45, material: 'matte', selected: true }}
      >
        <CatalogModel part={part} />
      </Appearance.Provider>
      <mesh>
        <boxGeometry args={pending.dimensions.map((n) => n + 0.15) as Vec3} />
        <meshBasicMaterial color="#30d7e8" wireframe transparent opacity={0.7} />
      </mesh>
    </group>
  );
}
export function PlacementControls() {
  const s = useStore();
  const layout = usePlacementLayout();
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [available, setAvailable] = useState(window.innerWidth);
  const placing = Boolean(s.placement);
  useEffect(() => {
    const parent = panel.current?.parentElement;
    if (!parent) return;
    const update = () => setAvailable(parent.getBoundingClientRect().width || window.innerWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [placing]);
  const { min, max } = placementWidths(available);
  const width = Math.max(min, Math.min(max, layout.width));
  const resize = (value: number) => layout.setWidth(Math.max(min, Math.min(max, value)));
  const suggestions = useMemo(
    () => (s.placement ? suggestPlacements(s.currentProject, s.placement) : []),
    [s.currentProject, s.placement],
  );
  const assessment = s.placement
    ? assessPosition(s.currentProject, s.placement, s.placement.position)
    : null;
  if (!s.placement) return null;
  return (
    <div
      ref={panel}
      className={`placement-controls ${layout.collapsed ? 'is-collapsed' : ''}`}
      role="region"
      aria-label="Component placement"
      style={{ width: layout.collapsed ? 64 : width }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {!layout.collapsed && (
        <div
          className="placement-resizer"
          role="separator"
          tabIndex={0}
          aria-label="Resize placement panel"
          aria-orientation="vertical"
          aria-valuemin={Math.round(min)}
          aria-valuemax={Math.round(max)}
          aria-valuenow={Math.round(width)}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, width };
          }}
          onPointerMove={(e) => {
            if (drag.current) resize(drag.current.width + drag.current.x - e.clientX);
          }}
          onPointerUp={(e) => {
            drag.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onKeyDown={(e) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault();
            e.stopPropagation();
            resize(
              e.key === 'Home'
                ? min
                : e.key === 'End'
                  ? max
                  : width + (e.key === 'ArrowLeft' ? 20 : -20),
            );
          }}
        />
      )}
      <header className="placement-heading">
        {!layout.collapsed && <strong>Place {s.placement.name}</strong>}
        <button
          className="button"
          aria-expanded={!layout.collapsed}
          aria-controls="placement-details"
          aria-label={layout.collapsed ? 'Expand placement panel' : 'Collapse placement panel'}
          onClick={() => layout.setCollapsed(!layout.collapsed)}
        >
          {layout.collapsed ? 'Expand' : 'Collapse'}
        </button>
        <button className="button" onClick={() => s.requestCamera('fit')}>
          Fit PCB to View
        </button>
      </header>
      <div id="placement-details" hidden={layout.collapsed} className="placement-details">
        <span>Preview only · coordinates × 10 mm · no electrical connections</span>
        <div className="placement-recommendations" aria-label="Recommended placement areas">
          <strong>Suggested board areas</strong>
          <p>
            Highlighted zones in the 3D workspace indicate approximate clear footprints. These are
            optional visual suggestions, not verified PCB keepouts, wiring, EMI or antenna
            clearance.
          </p>
          {suggestions.length ? (
            <div className="placement-options">
              {suggestions.map((spot, index) => (
                <button
                  type="button"
                  key={spot.id}
                  aria-label={`Use suggested placement ${index + 1}`}
                  aria-pressed={spot.position.every((n, i) => n === s.placement!.position[i])}
                  onClick={() => s.movePlacement(spot.position)}
                >
                  <strong>Area {index + 1}</strong>
                  <small>
                    XYZ {spot.position.map((n) => (n * 10).toFixed(1)).join(', ')} mm · ~
                    {spot.clearanceMm} mm spacing
                  </small>
                  <small>{spot.reason}</small>
                </button>
              ))}
            </div>
          ) : (
            <p>
              No clear board positions found for this part. You can enter other coordinates or use
              Free workspace; check dimensions and component clearances.
            </p>
          )}
          {assessment && (
            <p
              role="status"
              className={
                assessment.valid && assessment.warnings.length === 0
                  ? 'placement-ok'
                  : 'placement-caution'
              }
            >
              {!assessment.valid
                ? assessment.error
                : assessment.warnings.length
                  ? assessment.warnings.join(' ')
                  : 'Current visual position passes approximate board and overlap checks.'}
            </p>
          )}
        </div>
        <div className="placement-fields">
          {(['position', 'rotation'] as const).map((kind) => (
            <fieldset key={kind}>
              <legend>{kind === 'position' ? 'Position' : 'Rotation (degrees)'}</legend>
              {['X', 'Y', 'Z'].map((axis, i) => (
                <label key={axis}>
                  {axis}
                  <input
                    type="number"
                    step={kind === 'position' ? 0.1 : 5}
                    min={kind === 'position' ? -20 : -360}
                    max={kind === 'position' ? 20 : 360}
                    aria-label={`Placement ${kind} ${axis}`}
                    value={s.placement![kind][i]}
                    onChange={(e) => {
                      const v = [...s.placement![kind]] as Vec3;
                      v[i] = Number(e.target.value);
                      s.movePlacement(
                        kind === 'position' ? v : s.placement!.position,
                        kind === 'rotation' ? v : undefined,
                      );
                    }}
                  />
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <div>
          <button className="button primary" onClick={s.confirmPlacement}>
            Confirm visual placement
          </button>
          <button className="button" onClick={s.resetPlacement}>
            Reset placement
          </button>
          <button className="button" onClick={s.cancelPlacement}>
            Cancel placement
          </button>
        </div>
      </div>
    </div>
  );
}
