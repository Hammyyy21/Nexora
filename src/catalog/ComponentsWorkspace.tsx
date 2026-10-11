import { useGuideStore } from '../ai/store';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Cpu, CircuitBoard, Database, Fan, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  catalog,
  categories,
  comparisonSummary,
  emptyFilters,
  filterCatalog,
  getPart,
  specText,
} from './catalog';
import { useLibraryStore as useLibrary } from './store';
import { useWorkspaceStore as useWorkspace } from '../store/useWorkspaceStore';
import { canReplace, evaluateCompatibility, projectRequirements } from './compatibility';
import type { CatalogPart } from './types';
import { ComponentPreview } from './ComponentPreview';
import './catalog.css';

function Modal({
  label,
  children,
  close,
}: {
  label: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className="catalog-dialog" aria-label={label} onCancel={close}>
      <button className="catalog-close" aria-label={`Close ${label}`} onClick={close}>
        <X size={18} />
      </button>
      {children}
    </dialog>
  );
}
function Thumbnail({ part }: { part: CatalogPart }) {
  const Icon =
    part.model === 'board'
      ? CircuitBoard
      : part.model === 'memory' || part.model === 'drive'
        ? Database
        : part.model === 'fan'
          ? Fan
          : Cpu;
  return (
    <div className={`catalog-thumbnail ${part.model}`} aria-label="Generic component illustration">
      <div>
        <Icon size={44} />
        <i />
        <i />
        <i />
      </div>
      <small>CONCEPT MODEL</small>
    </div>
  );
}
function Compatibility({ part }: { part: CatalogPart }) {
  const s = useWorkspace();
  const existing = s.currentProject.components.find((c) => c.id === s.selectedComponentId);
  const result = evaluateCompatibility(part, projectRequirements(s.currentProject, existing));
  return (
    <section className="compatibility-card">
      <h3>Integration: {result.status}</h3>
      <p>
        {existing
          ? `Evaluating against ${existing.name}.`
          : 'No verified electrical integration profile is defined for the active concept board.'}
      </p>
      <p>{result.nextAction}</p>
      <details>
        <summary>Rules & evidence ({result.rules.length})</summary>
        {result.rules.map((r) => (
          <div className="compatibility-rule" key={r.id}>
            <strong>
              {r.status.toUpperCase()} · {r.id}
            </strong>
            <p>{r.explanation}</p>
            {r.evidence.map((url, i) =>
              url.startsWith('https://') ? (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  Manufacturer evidence ↗
                </a>
              ) : (
                <small key={i}>{url}</small>
              ),
            )}
          </div>
        ))}
      </details>
      <small>{result.scope}</small>
    </section>
  );
}
function PartDetails({ part }: { part: CatalogPart }) {
  const lib = useLibrary(),
    s = useWorkspace();
  const [replacement, setReplacement] = useState(false);
  const guide = useGuideStore();
  const [explanation, setExplanation] = useState<string | null>(null);
  const existing = s.currentProject.components.find((c) => c.id === s.selectedComponentId);
  const replaceable = canReplace(existing, part);
  function insert() {
    if (s.beginPlacement(part.id)) {
      lib.openDetails(null);
      lib.navigate('design');
    }
  }
  return (
    <Modal label="component details" close={() => lib.openDetails(null)}>
      <div className="detail-heading">
        <small>
          {part.manufacturer} · {part.kind}
        </small>
        <h2>{part.name}</h2>
        <p>
          {part.manufacturerPartNumber} · {part.subcategory}
        </p>
      </div>
      <div className="detail-layout">
        <div>
          <ComponentPreview part={part} />
          <div className="catalog-source-note">
            Generic visualization. Geometry and pin counts are illustrative, not manufacturer CAD or
            a physical-fit model.
          </div>
          <Compatibility part={part} />
        </div>
        <div className="detail-explanation">
          <h3>What is this?</h3>
          <p>{part.description}</p>
          <h3>What does it do?</h3>
          <p>{part.useCase}</p>
          <h3>When would I use it?</h3>
          <p>
            Consider it when your design calls for {part.subcategory.toLowerCase()}. Confirm the
            requirements below before choosing hardware.
          </p>
          <h3>How does it connect?</h3>
          <p>
            {part.interfaces.length
              ? `Curated interfaces: ${part.interfaces.join(', ')}. Match the exact pins, signal levels and board routing.`
              : 'Connection and pin details have not been curated. Consult the manufacturer reference.'}
          </p>
          <h3>What should I be careful about?</h3>
          <p>{part.caution}</p>
          <details open={lib.advanced}>
            <summary>Technical details</summary>
            <dl className="catalog-specs">
              {Object.entries(part.specifications).map(([key, spec]) => (
                <div key={key}>
                  <dt>{spec.label}</dt>
                  <dd>
                    {specText(spec)}{' '}
                    <a
                      href={spec.source}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Source for ${spec.label}`}
                    >
                      ↗
                    </a>
                  </dd>
                </div>
              ))}
              {[
                ['Architecture', part.architecture],
                [
                  'Operating supply',
                  part.voltageRange ? `${part.voltageRange.join('–')} V` : undefined,
                ],
                ['Package', part.package],
                ['Socket', part.socket],
                ['Memory generation', part.memoryGeneration],
                [
                  'Physical dimensions',
                  part.specifications.size ? specText(part.specifications.size) : undefined,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value ?? 'Unknown'}</dd>
                </div>
              ))}
            </dl>
          </details>
          <section className="catalog-sources">
            <h3>Sources & verification</h3>
            <p>
              Manufacturer-sourced facts · partial record. Checked {part.lastVerifiedAt}. Unlisted
              specifications remain unknown.
            </p>
            {part.sources.map((source) => (
              <p key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title} ↗
                </a>
                <small>{source.license}</small>
              </p>
            ))}
            {part.datasheetUrl ? (
              <a href={part.datasheetUrl} target="_blank" rel="noreferrer">
                Open datasheet / technical reference ↗
              </a>
            ) : (
              <p>Datasheet link not separately curated; use the manufacturer product reference.</p>
            )}
          </section>
        </div>
      </div>
      <section className="catalog-guide">
        <h3>
          {guide.mode === 'ai'
            ? 'AI Guide · unverified explanation'
            : 'Demo Guide · local, no live AI'}
        </h3>
        <button
          className="button"
          disabled={guide.busy}
          onClick={async () =>
            setExplanation(await guide.ask('Explain this component', { catalogId: part.id }))
          }
        >
          {guide.busy ? 'Asking guide…' : 'Explain this component'}
        </button>
        {guide.mode === 'ai' && (
          <small>
            This question and catalog context are sent to OpenAI. Recommendations are unverified.
          </small>
        )}
        {explanation && (
          <p className="guide-explanation" role="status">
            {explanation}
          </p>
        )}
      </section>
      <div className="detail-actions">
        <span>
          <strong>Visual-Only</strong> · {part.insertionNote}
        </span>
        <button className="button primary" disabled={!part.insertionSupported} onClick={insert}>
          Add to Design
        </button>
        <button
          className="button"
          aria-pressed={lib.compareIds.includes(part.id)}
          onClick={() => lib.toggleCompare(part.id)}
        >
          Compare
        </button>
        {replaceable && (
          <button className="button" onClick={() => setReplacement(true)}>
            Replace selected component
          </button>
        )}
      </div>
      {!replaceable && existing && (
        <p className="catalog-source-note">
          Visual replacement of {existing.name} is unsupported for this item. You can add supported
          items separately.
        </p>
      )}
      {replacement && replaceable && (
        <section className="replacement-confirm" role="region" aria-label="Confirm replacement">
          <h3>
            Replace {existing!.name} with {part.name}?
          </h3>
          <p>
            This changes the conceptual object only. Footprint, voltage, interfaces, pinout and
            board integration are not established. Any affected recorded firmware is flagged; your C
            source is kept. Existing illustrative paths to this object will be hidden.
          </p>
          <p>
            Potential benefit: {part.useCase} Tradeoff: {part.caution}
          </p>
          <button
            className="button primary"
            onClick={() => {
              if (s.replaceComponent(existing!.id, part.id)) {
                lib.openDetails(null);
                lib.navigate('design');
              }
            }}
          >
            Apply visual replacement
          </button>
          <button className="button" onClick={() => setReplacement(false)}>
            Cancel replacement
          </button>
        </section>
      )}
      {lib.message && (
        <p role="status" className="catalog-alert">
          {lib.message}
        </p>
      )}
    </Modal>
  );
}
function Comparison() {
  const lib = useLibrary(),
    s = useWorkspace();
  const parts = lib.compareIds.map((id) => getPart(id)!).filter(Boolean);
  const keys = [...new Set(parts.flatMap((p) => Object.keys(p.specifications)))];
  return (
    <Modal label="component comparison" close={() => useLibrary.setState({ compareOpen: false })}>
      <h2>Compare components</h2>
      <p>{comparisonSummary(parts)}</p>
      <div className="comparison-scroll">
        <table>
          <thead>
            <tr>
              <th>Specification</th>
              {parts.map((p) => (
                <th key={p.id}>
                  {p.name}
                  <button
                    onClick={() => lib.toggleCompare(p.id)}
                    aria-label={`Remove ${p.name} from comparison`}
                  >
                    ×
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              'Manufacturer',
              'Part number',
              'Architecture',
              'Interfaces',
              'Package',
              'Memory generation',
              'Integration',
              ...keys,
            ].map((key) => (
              <tr key={key}>
                <th>{key}</th>
                {parts.map((p) => (
                  <td key={p.id}>
                    {key === 'Manufacturer'
                      ? p.manufacturer
                      : key === 'Part number'
                        ? p.manufacturerPartNumber
                        : key === 'Architecture'
                          ? (p.architecture ?? 'Unknown')
                          : key === 'Interfaces'
                            ? p.interfaces.join(', ') || 'Unknown'
                            : key === 'Package'
                              ? (p.package ?? 'Unknown')
                              : key === 'Memory generation'
                                ? (p.memoryGeneration ?? 'Unknown')
                                : key === 'Integration'
                                  ? evaluateCompatibility(
                                      p,
                                      projectRequirements(
                                        s.currentProject,
                                        s.currentProject.components.find(
                                          (c) => c.id === s.selectedComponentId,
                                        ),
                                      ),
                                    ).status
                                  : specText(p.specifications[key])}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th>References</th>
              {parts.map((p) => (
                <td key={p.id}>
                  <a href={p.productUrl} target="_blank" rel="noreferrer">
                    Manufacturer ↗
                  </a>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
export function ComponentsWorkspace() {
  const lib = useLibrary();
  const s = useWorkspace();
  const parts = filterCatalog(lib.filters);
  const detail = getPart(lib.detailId ?? undefined);
  return (
    <main className="components-workspace" aria-label="Components workspace">
      <aside className="catalog-categories" aria-label="Catalog categories">
        <h2>HARDWARE LIBRARY</h2>
        <button
          aria-pressed={lib.filters.category === 'all'}
          onClick={() => lib.setFilters({ category: 'all', subcategory: '' })}
        >
          All Components <span>{catalog.length}</span>
        </button>
        {categories.map((category) => (
          <div key={category.id}>
            <button
              aria-pressed={lib.filters.category === category.id}
              onClick={() => lib.setFilters({ category: category.id, subcategory: '' })}
            >
              {category.label}
              <span>{catalog.filter((p) => p.category === category.id).length}</span>
            </button>
            {lib.filters.category === category.id && (
              <div className="catalog-subcategories">
                {category.children.map((sub) => (
                  <button
                    key={sub}
                    aria-pressed={lib.filters.subcategory === sub}
                    onClick={() =>
                      lib.setFilters({ subcategory: lib.filters.subcategory === sub ? '' : sub })
                    }
                  >
                    {sub}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <p>
          Curated locally.
          <br />
          No account or API key needed.
        </p>
      </aside>
      <section className="catalog-main">
        <header className="catalog-heading">
          <div>
            <small>DISCOVER · UNDERSTAND · CREATE</small>
            <h1>Hardware, made approachable.</h1>
            <p>
              Explore {catalog.length} curated parts. Build a concept with confidence about what is
              known.
            </p>
          </div>
          <label className="catalog-mode">
            <SlidersHorizontal size={15} />
            <input
              type="checkbox"
              checked={lib.advanced}
              onChange={(e) => useLibrary.setState({ advanced: e.target.checked })}
            />
            Advanced details
          </label>
        </header>
        <div className="catalog-filters">
          <label className="catalog-search">
            <Search size={17} />
            <input
              aria-label="Search components"
              placeholder="Search names, manufacturers or part numbers…"
              value={lib.filters.query}
              maxLength={200}
              onChange={(e) => lib.setFilters({ query: e.target.value })}
            />
          </label>
          <select
            aria-label="Filter manufacturer"
            value={lib.filters.manufacturer}
            onChange={(e) => lib.setFilters({ manufacturer: e.target.value })}
          >
            <option value="">All manufacturers</option>
            {[...new Set(catalog.map((p) => p.manufacturer))].sort().map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select
            aria-label="Filter interface"
            value={lib.filters.interface}
            onChange={(e) => lib.setFilters({ interface: e.target.value })}
          >
            <option value="">All interfaces</option>
            {[...new Set(catalog.flatMap((p) => p.interfaces))].sort().map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
          <label>
            <input
              type="checkbox"
              checked={lib.filters.insertable}
              onChange={(e) => lib.setFilters({ insertable: e.target.checked })}
            />
            Visual placement supported
          </label>
          <button onClick={() => lib.setFilters(emptyFilters)}>Clear filters</button>
        </div>
        <div className="catalog-results">
          <span>{parts.length} components · manufacturer-sourced facts, partial records</span>
          <button
            className="button"
            disabled={lib.compareIds.length < 2}
            onClick={() => useLibrary.setState({ compareOpen: true })}
          >
            Compare ({lib.compareIds.length}/3)
          </button>
          {lib.compareIds.length > 0 && (
            <button onClick={() => useLibrary.setState({ compareIds: [], message: null })}>
              Clear comparison
            </button>
          )}
        </div>
        {lib.message && (
          <p role="status" className="catalog-alert">
            {lib.message}
          </p>
        )}
        <div className="catalog-grid">
          {parts.map((part) => (
            <article className="catalog-card" key={part.id}>
              <button
                className="thumbnail-button"
                onClick={() => lib.openDetails(part.id)}
                aria-label={`Preview ${part.name}`}
              >
                <Thumbnail part={part} />
              </button>
              <div className="catalog-card-body">
                <small>{part.manufacturer}</small>
                <h2>{part.name}</h2>
                <span>
                  {part.subcategory} · {part.kind}
                </span>
                <div className="catalog-facts">
                  {Object.values(part.specifications)
                    .slice(0, lib.advanced ? 4 : 2)
                    .map((spec) => (
                      <p key={spec.label}>
                        <span>{spec.label}</span>
                        <strong>{specText(spec)}</strong>
                      </p>
                    ))}
                </div>
                <div className="catalog-verified">◈ Sourced facts · partial record</div>
                <div className="catalog-card-actions">
                  <button onClick={() => lib.openDetails(part.id)}>View Details</button>
                  <button
                    aria-label={`Compare ${part.name}`}
                    aria-pressed={lib.compareIds.includes(part.id)}
                    onClick={() => lib.toggleCompare(part.id)}
                  >
                    Compare
                  </button>
                  <button
                    className="catalog-add"
                    disabled={!part.insertionSupported}
                    title={part.insertionNote}
                    onClick={() => {
                      if (s.beginPlacement(part.id)) lib.navigate('design');
                    }}
                  >
                    Add to Design
                  </button>
                </div>
                <p className="catalog-card-note">
                  {part.insertionSupported ? 'Visual-only · no wiring implied' : part.insertionNote}
                </p>
              </div>
            </article>
          ))}
        </div>
        {!parts.length && (
          <div className="catalog-empty">
            <h2>No curated matches yet</h2>
            <p>
              This category is supported by the catalog structure, but no verified entries match
              these filters.
            </p>
            <button className="button" onClick={() => lib.setFilters(emptyFilters)}>
              Clear filters
            </button>
          </div>
        )}
      </section>
      {detail && <PartDetails key={detail.id} part={detail} />} {lib.compareOpen && <Comparison />}
    </main>
  );
}
