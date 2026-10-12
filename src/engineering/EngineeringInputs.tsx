import { useState } from 'react';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { EngineeringInput } from '../types/workspace';

const electricalFields = [
  { key: 'voltage', label: 'Load voltage (V)', name: 'Load voltage', unit: 'V' },
  { key: 'currentMa', label: 'Load current (mA)', name: 'Load current', unit: 'mA' },
  { key: 'dissipationW', label: 'Heat dissipation (W)', name: 'Heat dissipation', unit: 'W' },
] as const;
const thermalFields = [
  { key: 'thermalResistance', label: 'Thermal resistance (°C/W)', name: 'Thermal resistance', unit: '°C/W' },
  { key: 'ambientC', label: 'Ambient temperature (°C)', name: 'Ambient temperature', unit: '°C' },
  { key: 'maxTemperatureC', label: 'Temperature limit (°C)', name: 'Temperature limit', unit: '°C' },
] as const;

type InputKey = (typeof electricalFields)[number]['key'] | (typeof thermalFields)[number]['key'];
type Field = { readonly key: InputKey; readonly label: string; readonly name: string; readonly unit: string };

export function EngineeringInputs() {
  const project = useWorkspaceStore((s) => s.currentProject);
  const [id, setId] = useState('');
  const component =
    project.components.find((c) => c.id === id) ?? project.components.find((c) => c.id !== 'pcb');
  if (!component) return null;
  return (
    <details className="engineering-calculation-card">
      <summary>Power & thermal calculation inputs</summary>
      <div className="engineering-calculation-content">
        <p className="engineering-calculation-note">
          Enter estimated design values for one component. These are not measured readings or proof
          that the circuit is electrically safe.
        </p>
        <label className="engineering-component-picker">
          <span>Component</span>
          <select value={component.id} onChange={(e) => setId(e.target.value)}>
            {project.components
              .filter((c) => c.id !== 'pcb')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <InputForm
          key={`${project.id}:${component.id}:${JSON.stringify(project.engineeringInputs?.[component.id])}`}
          id={component.id}
          input={project.engineeringInputs?.[component.id]}
        />
      </div>
    </details>
  );
}

function InputForm({ id, input }: { id: string; input?: EngineeringInput }) {
  const [draft, setDraft] = useState<EngineeringInput>(input ?? { provenance: 'configured' });
  const renderField = ({ key, label, name, unit }: Field) => (
    <label className="engineering-input-field" key={key}>
      <span className="engineering-field-name">{name}</span>
      <span className="engineering-input-control">
        <input
          aria-label={label}
          type="number"
          step="any"
          min={key === 'ambientC' || key === 'maxTemperatureC' ? -273.15 : 0}
          max={100000}
          placeholder="Not set"
          value={draft[key] ?? ''}
          onChange={(e) => {
            const next = { ...draft };
            if (e.target.value === '') delete next[key];
            else next[key] = e.target.valueAsNumber;
            setDraft(next);
          }}
        />
        <span className="engineering-input-unit" aria-hidden="true">{unit}</span>
      </span>
    </label>
  );
  return (
    <form
      className="engineering-input-form"
      onSubmit={(e) => {
        e.preventDefault();
        const s = useWorkspaceStore.getState();
        s.applyProjectRevision({
          ...s.currentProject,
          engineeringInputs: {
            ...s.currentProject.engineeringInputs,
            [id]: { ...draft, provenance: 'configured' },
          },
        });
      }}
    >
      <fieldset className="engineering-input-group">
        <legend>Electrical load</legend>
        <p>Planned voltage, current and power for this component.</p>
        <div className="engineering-input-grid">{electricalFields.map(renderField)}</div>
      </fieldset>
      <fieldset className="engineering-input-group">
        <legend>Thermal estimates</legend>
        <p>Optional temperature assumptions for the design review.</p>
        <div className="engineering-input-grid">{thermalFields.map(renderField)}</div>
      </fieldset>
      <div className="engineering-input-actions">
        <button className="button" type="submit">Apply calculation inputs</button>
        <small>Saved to the active project · no simulation performed</small>
      </div>
    </form>
  );
}
