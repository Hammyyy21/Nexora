import { useState } from 'react';
import type { HardwareComponent, Project } from '../types/workspace';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import {
  boardSpecification,
  defaultBoardConfiguration,
  specificationStatus,
  validBoardConfiguration,
  type BoardConfiguration,
  type BoardField,
  type BoardSpecification,
} from './boardSpecifications';
import './board-specifications.css';

export function fieldText(field: BoardField<unknown>, unit = ''): string {
  return field.value === undefined
    ? specificationStatus[field.status]
    : `${Array.isArray(field.value) ? field.value.join(', ') : field.value}${unit ? ` ${unit}` : ''}`;
}
function Row({ label, field, unit }: { label: string; field: BoardField<unknown>; unit?: string }) {
  if (field.value === undefined) return null;
  return (
    <div className="board-spec-row">
      <dt>{label}</dt>
      <dd>
        <span>{fieldText(field, unit)}</span>
        {field.value !== undefined && <small>{specificationStatus[field.status]}</small>}
        {field.note && <small>{field.note}</small>}
        {field.source && (
          <a href={field.source} target="_blank" rel="noreferrer" aria-label={`${label} source`}>
            Source ↗
          </a>
        )}
      </dd>
    </div>
  );
}
export function BoardSpecifications({
  spec,
  component,
}: {
  spec: BoardSpecification;
  component?: HardwareComponent;
}) {
  return (
    <section
      className="board-specifications"
      aria-label={`Board Specifications: ${spec.name.value}`}
    >
      <h3>Board Specifications</h3>
      <p>
        {spec.kind === 'development'
          ? 'Manufacturer board · partial specification record'
          : spec.kind === 'blank'
            ? 'Blank PCB · configurable design values'
            : ['cooling-demo', 'blank-92'].includes(spec.id)
              ? 'Concept PCB · illustrative design values'
              : 'Demo preset · configurable design values'}
      </p>
      <h4>Overview</h4>
      <dl>
        <Row label="Board name" field={spec.name} />
        <Row label="Model" field={spec.model} />
        <Row label="Manufacturer" field={spec.manufacturer} />
        <Row label="Part number" field={spec.partNumber} />
        <Row label="Controller / processor" field={spec.controller} />
      </dl>
      <h4>Dimensions & Mechanical</h4>
      <dl className="board-dimensions">
        <Row label="Length" field={spec.length} unit="mm" />
        <Row label="Width" field={spec.width} unit="mm" />
        <Row label="Thickness" field={spec.thickness} unit="mm" />
      </dl>
      <details>
        <summary>Mechanical details & placement area</summary>
        <dl>
          <Row label="Mounting holes" field={spec.mountingSummary} />
          <Row
            label="Hole positions (X, Z) / diameter"
            field={{
              ...spec.mountingHoles,
              value:
                spec.mountingHoles.value
                  ?.map((h) => `(${h.x}, ${h.z}) / Ø${h.diameter} mm`)
                  .join('; ') || (spec.mountingHoles.value ? 'None configured' : undefined),
            }}
          />
          <Row
            label="Restricted regions"
            field={{
              ...spec.restrictedRegions,
              value:
                spec.restrictedRegions.value
                  ?.map((r) => `${r.name}: (${r.x}, ${r.z}), ${r.length} × ${r.width} mm`)
                  .join('; ') || (spec.restrictedRegions.value ? 'None configured' : undefined),
            }}
          />
          <Row label="Edge clearance" field={spec.edgeClearance} unit="mm" />
          <Row label="Mechanical restrictions" field={spec.restrictions} />
        </dl>
        <p>
          Local origin: PCB center, mid-thickness. Length along X, width along Z, Y up.
          Right-handed; 1 scene unit = 10 mm. This is Nexora’s coordinate convention.
        </p>
        {component && (
          <p>
            World origin: {component.position.map((v) => Number((v * 10).toFixed(3))).join(', ')}{' '}
            mm. Rotation X/Y/Z: {component.rotation.join(', ')}°.
          </p>
        )}
        {spec.length.value !== undefined && spec.width.value !== undefined && (
          <p>
            Boundary envelope: X ±{spec.length.value / 2} mm, Z ±{spec.width.value / 2} mm.
            {spec.kind === 'development'
              ? ' Populated board; available placement area is not specified. Outline alone does not establish a mounting surface.'
              : ` Placement area: ${spec.length.value - 2 * (spec.edgeClearance.value ?? 0)} × ${spec.width.value - 2 * (spec.edgeClearance.value ?? 0)} mm, excluding holes and restricted regions. Rounded corners are also excluded.`}
          </p>
        )}
        <p>
          Missing coordinates and component heights are unverified. Generic component models do not
          establish connector fit.
        </p>
      </details>
      <details
        hidden={[
          spec.supply,
          spec.logicVoltage,
          spec.currentLimits,
          spec.powerInterfaces,
          spec.peripherals,
        ].every((f) => f.value === undefined)}
      >
        <summary>Electrical</summary>
        <dl>
          <Row label="Supply / input voltage" field={spec.supply} />
          <Row label="Logic voltage" field={spec.logicVoltage} unit="V" />
          <Row label="Power / current limits" field={spec.currentLimits} />
          <Row label="Ground & power interfaces" field={spec.powerInterfaces} />
          <Row label="Built-in peripherals" field={spec.peripherals} />
        </dl>
        <p>
          Supply voltage and GPIO voltage are separate constraints. Placement does not establish
          electrical compatibility.
        </p>
      </details>
      <details
        hidden={[spec.interfaces, spec.connectors, spec.connectorPositions].every(
          (f) => f.value === undefined,
        )}
      >
        <summary>Interfaces & Connectors</summary>
        <dl>
          <Row label="Available interfaces" field={spec.interfaces} />
          <Row label="Connectors & expansion" field={spec.connectors} />
          <Row label="Connector / header positions" field={spec.connectorPositions} />
        </dl>
      </details>
      <details>
        <summary>Manufacturing / Documentation</summary>
        {spec.reviewedAt && (
          <p>
            Record reviewed: {spec.reviewedAt}. Manufacturer verification applies only to
            individually sourced fields.
          </p>
        )}
        <dl>
          <Row label="PCB material" field={spec.material} />
          <Row label="Layer count" field={spec.layers} />
          <Row label="Stackup" field={spec.stackup} />
          <Row label="Fabrication rules / tolerances" field={spec.fabrication} />
        </dl>
        <p>
          Verification is per field. Not specified means no supported value in this record, not a
          zero or a manufacturing approval.
        </p>
        {spec.documentation.length ? (
          <ul>
            {spec.documentation.map((url, i) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer">
                  Manufacturer document {i + 1} ↗
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>Manufacturer documentation: Not specified.</p>
        )}
      </details>
    </section>
  );
}
export function SelectedBoardSpecifications({
  project,
  component,
}: {
  project: Project;
  component: HardwareComponent;
}) {
  const spec = boardSpecification(project, component);
  if (!spec) return null;
  return (
    <>
      <BoardSpecifications spec={spec} component={component} />
      {component.id === 'pcb' && (project.boardTemplateId ?? 'cooling-demo') !== 'cooling-demo' && (
        <BoardConfigurationEditor
          key={JSON.stringify(project.boardConfiguration)}
          configuration={project.boardConfiguration}
        />
      )}
    </>
  );
}
export function BoardConfigurationEditor({
  configuration,
}: {
  configuration?: BoardConfiguration;
}) {
  const [draft, setDraft] = useState(configuration ?? defaultBoardConfiguration());
  const [error, setError] = useState('');
  return (
    <details className="board-configuration">
      <summary>Configure blank PCB</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!validBoardConfiguration(draft)) {
            setError(
              'Check dimensions, clearance and holes. Holes and restricted regions must fit inside the board.',
            );
            return;
          }
          useWorkspaceStore.getState().configureBoard(draft);
          setError('');
        }}
      >
        <p>
          User design values, not verified fabrication properties. Dimensions 10–200 mm; thickness
          0.2–10 mm.
        </p>
        {(
          [
            'length',
            'width',
            'thickness',
            'edgeClearance',
            'componentSpacing',
            'supplyVoltage',
            'currentBudgetMa',
          ] as const
        ).map((key) => (
          <label key={key}>
            {key === 'edgeClearance' ? 'Edge clearance' : key[0].toUpperCase() + key.slice(1)} (
            {key === 'supplyVoltage' ? 'V' : key === 'currentBudgetMa' ? 'mA' : 'mm'})
            <input
              type="number"
              required={['length', 'width', 'thickness', 'edgeClearance'].includes(key)}
              step="any"
              value={Number.isFinite(draft[key]) ? draft[key] : ''}
              onChange={(e) => {
                const next = { ...draft };
                if (
                  e.target.value === '' &&
                  ['componentSpacing', 'supplyVoltage', 'currentBudgetMa'].includes(key)
                )
                  delete next[key];
                else next[key] = e.target.valueAsNumber;
                setDraft(next);
              }}
            />
          </label>
        ))}
        <label>
          PCB material
          <input
            maxLength={80}
            placeholder="Not specified"
            value={draft.material ?? ''}
            onChange={(e) => setDraft({ ...draft, material: e.target.value || undefined })}
          />
        </label>
        <label>
          Layer count
          <input
            type="number"
            min="1"
            max="64"
            placeholder="Not specified"
            value={draft.layers ?? ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                layers: e.target.value === '' ? undefined : e.target.valueAsNumber,
              })
            }
          />
        </label>
        <fieldset>
          <legend>Mounting holes · mm from board center</legend>
          {draft.mountingHoles.map((h, i) => (
            <div className="board-hole-editor" key={i}>
              {(['x', 'z', 'diameter'] as const).map((key) => (
                <label key={key}>
                  {key === 'diameter' ? 'Diameter' : key.toUpperCase()}
                  <input
                    aria-label={`Hole ${i + 1} ${key}`}
                    type="number"
                    required
                    step="any"
                    value={Number.isFinite(h[key]) ? h[key] : ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        mountingHoles: draft.mountingHoles.map((hole, n) =>
                          n === i ? { ...hole, [key]: e.target.valueAsNumber } : hole,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <button
                type="button"
                aria-label={`Remove hole ${i + 1}`}
                onClick={() =>
                  setDraft({
                    ...draft,
                    mountingHoles: draft.mountingHoles.filter((_, n) => n !== i),
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button"
            disabled={draft.mountingHoles.length >= 32}
            onClick={() =>
              setDraft({
                ...draft,
                mountingHoles: [...draft.mountingHoles, { x: 0, z: 0, diameter: 2.6 }],
              })
            }
          >
            Add mounting hole
          </button>
        </fieldset>
        <fieldset>
          <legend>Restricted regions · mm</legend>
          {draft.restrictedRegions.map((r, i) => (
            <div key={i}>
              <label>
                Region name
                <input
                  value={r.name}
                  maxLength={80}
                  required
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      restrictedRegions: draft.restrictedRegions.map((region, n) =>
                        n === i ? { ...region, name: e.target.value } : region,
                      ),
                    })
                  }
                />
              </label>
              <div className="board-hole-editor">
                {(['x', 'z', 'length', 'width'] as const).map((key) => (
                  <label key={key}>
                    {key}
                    <input
                      aria-label={`Region ${i + 1} ${key}`}
                      type="number"
                      required
                      step="any"
                      value={Number.isFinite(r[key]) ? r[key] : ''}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          restrictedRegions: draft.restrictedRegions.map((region, n) =>
                            n === i ? { ...region, [key]: e.target.valueAsNumber } : region,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    restrictedRegions: draft.restrictedRegions.filter((_, n) => n !== i),
                  })
                }
              >
                Remove region {i + 1}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button"
            disabled={draft.restrictedRegions.length >= 32}
            onClick={() =>
              setDraft({
                ...draft,
                restrictedRegions: [
                  ...draft.restrictedRegions,
                  { name: 'Keepout', x: 0, z: 0, length: 5, width: 5 },
                ],
              })
            }
          >
            Add restricted region
          </button>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <button className="button primary" type="submit">
          Apply board configuration
        </button>
      </form>
    </details>
  );
}
