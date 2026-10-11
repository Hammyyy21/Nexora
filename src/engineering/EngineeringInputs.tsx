import { useState } from 'react';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { EngineeringInput } from '../types/workspace';

export function EngineeringInputs() {
  const project = useWorkspaceStore((s) => s.currentProject);
  const [id, setId] = useState('');
  const component =
    project.components.find((c) => c.id === id) ?? project.components.find((c) => c.id !== 'pcb');
  if (!component) return null;
  return (
    <details>
      <summary>Power & thermal calculation inputs</summary>
      <p>User-configured design values. These calculations do not establish hardware safety.</p>
      <label>
        Component{' '}
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
    </details>
  );
}
function InputForm({ id, input }: { id: string; input?: EngineeringInput }) {
  const [draft, setDraft] = useState<EngineeringInput>(input ?? { provenance: 'configured' });
  const fields = {
    currentMa: 'Load current (mA)',
    voltage: 'Load voltage (V)',
    dissipationW: 'Heat dissipation (W)',
    thermalResistance: 'Thermal resistance (°C/W)',
    ambientC: 'Ambient temperature (°C)',
    maxTemperatureC: 'Temperature limit (°C)',
  } as const;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const s = useWorkspaceStore.getState();
        s.applyProjectRevision({
          ...s.currentProject,
          schemaVersion: 2,
          engineeringInputs: {
            ...s.currentProject.engineeringInputs,
            [id]: { ...draft, provenance: 'configured' },
          },
        });
      }}
    >
      {Object.entries(fields).map(([key, label]) => (
        <label key={key} style={{ display: 'block' }}>
          {label}
          <input
            type="number"
            step="any"
            min={key === 'ambientC' || key === 'maxTemperatureC' ? -273.15 : 0}
            max={100000}
            value={draft[key as keyof typeof fields] ?? ''}
            onChange={(e) => {
              const next = { ...draft };
              if (e.target.value === '') delete next[key as keyof typeof fields];
              else next[key as keyof typeof fields] = e.target.valueAsNumber;
              setDraft(next);
            }}
          />
        </label>
      ))}
      <button className="button" type="submit">
        Apply calculation inputs
      </button>
    </form>
  );
}
