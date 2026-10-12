import { EngineeringInputs } from './EngineeringInputs';
import { useMemo, useState } from 'react';
import { downloadFile } from '../lib/project';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { buildBOM, exportBOMCsv, reviewDesign } from './insights';
import './engineering.css';

export function EngineeringInsights() {
  const project = useWorkspaceStore((s) => s.currentProject);
  const selectComponent = useWorkspaceStore((s) => s.selectComponent);
  const [view, setView] = useState<'review' | 'bom'>('review');
  const bom = useMemo(() => buildBOM(project), [project]);
  const findings = useMemo(() => reviewDesign(project), [project]);
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  return (
    <section className="engineering-insights" aria-label="Engineering tools">
      <div className="engineering-heading">
        <h3>Engineering tools</h3>
        <p>Review estimated electrical properties, design warnings and the parts inventory.</p>
      </div>
      <div className="engineering-switch" role="group" aria-label="Engineering tool">
        <button
          type="button"
          className={view === 'review' ? 'active' : ''}
          aria-pressed={view === 'review'}
          onClick={() => setView('review')}
        >
          Design review
        </button>
        <button
          type="button"
          className={view === 'bom' ? 'active' : ''}
          aria-pressed={view === 'bom'}
          onClick={() => setView('bom')}
        >
          Bill of materials
        </button>
      </div>
      {view === 'review' ? (
        <div className="engineering-result">
          <EngineeringInputs />
          <div className="engineering-status-summary" role="status">
            <span><strong>{warnings}</strong> design warning(s)</span>
            <span><strong>{findings.length - warnings}</strong> information notice(s)</span>
          </div>
          <ul className="engineering-findings">
            {findings.map((finding) => (
              <li key={finding.id}>
                <strong>
                  {finding.status === 'pass'
                    ? '✓ '
                    : finding.status === 'fail'
                      ? '✕ '
                      : finding.severity === 'warning'
                        ? '⚠ '
                        : 'ⓘ '}
                  {finding.status ? `${finding.status.toUpperCase()} · ` : 'UNKNOWN · '}
                  {finding.title}
                </strong>
                <p>{finding.details}</p>
                {finding.remedy && <p>Next: {finding.remedy}</p>}
                {finding.source && (
                  <a href={finding.source} target="_blank" rel="noopener noreferrer">
                    Manufacturer datasheet
                  </a>
                )}
                {finding.componentId && (
                  <button type="button" onClick={() => selectComponent(finding.componentId!)}>
                    Select component
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="engineering-disclaimer">
            Geometric checks are approximate. This is not electrical DRC, SPICE simulation, or
            manufacturing clearance validation.
          </p>
        </div>
      ) : (
        <div className="engineering-result">
          <p>
            {bom.length} unique line(s) · {project.components.length} object(s)
          </p>
          <ul className="engineering-bom">
            {bom.map((line) => (
              <li key={line.key}>
                <strong>
                  {line.quantity} × {line.description}
                </strong>
                <span>{line.references.join(', ')}</span>
                <small>
                  {line.status === 'concept'
                    ? 'Concept only · no manufacturer part number'
                    : `${line.manufacturer} · ${line.manufacturerPartNumber}`}
                </small>
              </li>
            ))}
          </ul>
          <button
            className="button"
            type="button"
            onClick={() =>
              downloadFile(exportBOMCsv(project), `${project.id}-bom.csv`, 'text/csv;charset=utf-8')
            }
          >
            Export BOM CSV
          </button>
          <p className="engineering-disclaimer">
            Not a purchasing quote: pricing, stock, quantities for fabrication, and electrical
            suitability are unverified.
          </p>
        </div>
      )}
    </section>
  );
}
