import { useGuideStore } from './store';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { navigateFinding } from './findingNavigation';
import { classificationLabel } from './snapshot';
export function InspectionFindings() {
  const inspection = useGuideStore((s) => s.inspection);
  const workspace = useWorkspaceStore();
  if (!inspection || inspection.projectId !== workspace.currentProject.id) return null;
  const stale = inspection.revision !== workspace.projectRevision;
  return (
    <section className="ai-proposal" aria-label="Project inspection findings">
      <strong>Project inspection</strong>
      <p>
        {stale
          ? 'Design changed. Run inspection again for current findings.'
          : 'Deterministic evidence · no complete electrical safety certification.'}
      </p>
      {inspection.findings.map((f) => (
        <details key={f.id}>
          <summary>
            {classificationLabel[f.classification]} · {f.title}
          </summary>
          <p>{f.details}</p>
          <p>{f.remedy}</p>
          {f.entities.map((e) => (
            <button
              className="button"
              key={`${e.kind}:${e.id}`}
              disabled={stale}
              aria-pressed={
                workspace.selectedEntity?.kind === e.kind && workspace.selectedEntity.id === e.id
              }
              onClick={() => {
                if (!navigateFinding(e))
                  workspace.notify('This finding entity is no longer available.');
              }}
            >
              Inspect {e.kind}: {e.id}
            </button>
          ))}
        </details>
      ))}
    </section>
  );
}
