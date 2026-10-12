import { CircuitBoard, Box, Cable, Plus, SlidersHorizontal } from 'lucide-react';
import { navigateWorkspace, openToolPanel } from '../catalog/navigation';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { useDesignLayout } from './layout';
import { PCBLayoutPreview } from './PCBLayoutPreview';
import './pcb-workspace.css';

/** Dedicated 2D PCB view. Reuses the same authoritative project and pad preview as the Inspector. */
export function PCBWorkspace() {
  const project = useWorkspaceStore((state) => state.currentProject);
  const selected = useWorkspaceStore((state) => state.selectedComponentId);
  const board = project.components.find((part) => part.id === 'pcb');
  const selectedPart = project.components.find((part) => part.id === selected);

  const inspect = (componentId: string) => {
    useWorkspaceStore.getState().selectComponent(componentId);
    openToolPanel('inspector');
  };

  return (
    <main className="pcb-workspace" aria-label="PCB layout workspace">
      <header className="pcb-workspace-heading">
        <div>
          <span className="pcb-workspace-eyebrow">2D BOARD EDITOR</span>
          <h1>PCB Layout</h1>
          <p>{project.name} · {board?.name ?? 'No board selected'} · View pads, airwires and clearance findings in one place.</p>
        </div>
        <div className="pcb-workspace-actions">
          <button type="button" onClick={() => { navigateWorkspace('design'); openToolPanel('explorer'); }}><Box size={15} /> 3D Design</button>
          <button type="button" onClick={() => navigateWorkspace('schematic')}><Cable size={15} /> Schematic</button>
          <button type="button" onClick={() => useDesignLayout.getState().openDrawer('components')}><Plus size={15} /> Add Component</button>
          {board && (
            <button type="button" onClick={() => inspect(board.id)}><SlidersHorizontal size={15} /> Board Settings</button>
          )}
        </div>
      </header>
      {board && project.boardConfiguration ? (
        <>
          <p className="pcb-workspace-selection" role="status">
            <CircuitBoard size={15} aria-hidden="true" />
            {selectedPart && selectedPart.id !== 'pcb'
              ? `${selectedPart.reference} selected. Click another footprint to inspect or edit its pads.`
              : 'Click any footprint or pad to inspect and edit its properties. Use Schematic to define electrical nets.'}
            {selectedPart && selectedPart.id !== 'pcb' &&
              <button type="button" onClick={() => inspect(selectedPart.id)}>Edit selected footprint</button>}
          </p>
          <div className="pcb-workspace-part-list" role="group" aria-label="PCB component shortcuts">
            <span>EDIT FOOTPRINT</span>
            {project.components.filter((part) => part.id !== 'pcb' && part.type !== 'housing').map((part) => (
              <button key={part.id} type="button" aria-pressed={selected === part.id}
                onClick={() => inspect(part.id)} title={`Inspect ${part.name} footprint and copper pads`}>
                {part.reference}
              </button>
            ))}
            {project.components.filter((part) => part.id !== 'pcb' && part.type !== 'housing').length === 0 &&
              <span>No components yet. Use Add Component to start.</span>}
          </div>
          <PCBLayoutPreview project={project} onComponentSelect={inspect} selectedComponentId={selected} />
        </>
      ) : (
        <div className="pcb-workspace-empty">
          <h2>No editable PCB configured</h2>
          <p>Choose a PCB template before configuring footprints and copper pads.</p>
          <button type="button" onClick={() => useDesignLayout.getState().openDrawer('boards')}>Choose Board</button>
        </div>
      )}
    </main>
  );
}
