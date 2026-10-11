import { BoardSpecifications, fieldText } from './BoardSpecificationsPanel';
import {
  developmentBoardSpecifications,
  specificationStatus,
  templateSpecification,
} from './boardSpecifications';
import { getPart } from '../catalog/catalog';
import { useEffect, useRef, useState } from 'react';
import { categories, emptyFilters, filterCatalog, specText } from '../catalog/catalog';
import type { CatalogFilters } from '../catalog/types';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { useDesignLayout } from './layout';
import { boardTemplates } from './boardTemplates';
export function DesignDrawer() {
  const layout = useDesignLayout();
  const s = useWorkspaceStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const [filters, setFilters] = useState<CatalogFilters>({ ...emptyFilters });
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const node = dialog.current!;
    if (layout.drawer) node.showModal();
    else node.close();
    return () => node.close();
  }, [layout.drawer]);
  const close = () => layout.openDrawer(null);
  const [comparison, setComparison] = useState(['blank-92', 'pico']);
  const specifications = [
    ...boardTemplates.map((b) =>
      templateSpecification(
        b.id,
        b.id === s.currentProject.boardTemplateId
          ? s.currentProject.boardConfiguration
          : s.currentProject.boardConfigurations?.[b.id],
      ),
    ),
    ...developmentBoardSpecifications,
  ];
  const boardName = (id: string) =>
    String(specifications.find((spec) => spec.id === id)!.name.value);
  const compared = comparison.map((id) => specifications.find((spec) => spec.id === id)!);
  return (
    <dialog
      className="design-drawer"
      ref={dialog}
      aria-label={layout.drawer === 'boards' ? 'Choose Board' : 'Add Component'}
      onCancel={close}
    >
      <header>
        <div>
          <small>DESIGN LIBRARY</small>
          <h2>{layout.drawer === 'boards' ? 'Choose Board' : 'Add Component'}</h2>
        </div>
        <button aria-label="Close design drawer" onClick={close}>
          ×
        </button>
      </header>
      {layout.drawer === 'boards' ? (
        <>
          <p>
            Concept PCB templates · no electrical validation. Changing the board preserves
            components and C source. Undo is available.
          </p>
          <section className="board-comparison" aria-label="Compare board specifications">
            <h3>Compare Board Specifications</h3>
            <div>
              {comparison.map((id, index) => (
                <label key={index}>
                  Board {index + 1}
                  <select
                    value={id}
                    onChange={(e) =>
                      setComparison(comparison.map((v, i) => (i === index ? e.target.value : v)))
                    }
                  >
                    {specifications.map((spec) => (
                      <option value={spec.id} key={spec.id}>
                        {spec.name.value}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <section className="board-comparison-scroll">
              <table>
                <caption>Compare before selecting · verification is per field</caption>
                <thead>
                  <tr>
                    <th scope="col">Specification</th>
                    {compared.map((spec, i) => (
                      <th scope="col" key={i}>
                        {spec.name.value}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['length', 'Length', 'mm'],
                      ['width', 'Width', 'mm'],
                      ['thickness', 'Thickness', 'mm'],
                      ['controller', 'Controller', ''],
                      ['supply', 'Supply', ''],
                      ['logicVoltage', 'Logic voltage', 'V'],
                      ['interfaces', 'Interfaces', ''],
                      ['connectors', 'Connectors', ''],
                      ['layers', 'Layers', ''],
                    ] as const
                  ).map(([key, label, unit]) => (
                    <tr key={key}>
                      <th scope="row">{label}</th>
                      {compared.map((spec, i) => (
                        <td key={i}>
                          {fieldText(spec[key], unit)}
                          <small>{specificationStatus[spec[key].status]}</small>
                          {spec[key].source && (
                            <a href={spec[key].source} target="_blank" rel="noreferrer">
                              Source ↗
                            </a>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </section>
          {boardTemplates.map((board) => (
            <article key={board.id}>
              <h3>{boardName(board.id)}</h3>
              <p>{board.description}</p>
              <details>
                <summary>Board Specifications · {boardName(board.id)}</summary>
                <BoardSpecifications spec={specifications.find((spec) => spec.id === board.id)!} />
              </details>
              <button
                className="button primary"
                onClick={() => {
                  s.setBoardTemplate(board.id);
                  layout.setPanel('workspace');
                  close();
                }}
              >
                {(s.currentProject.boardTemplateId ?? 'cooling-demo') === board.id
                  ? 'Use current board'
                  : `Use ${boardName(board.id)}`}
              </button>
            </article>
          ))}
          <p>
            Configure blank PCB dimensions, holes and fabrication design values in Inspector after
            selecting it. Existing components remain in place; review placement warnings after
            resizing.
          </p>
          <h3>Development boards</h3>
          <p>
            Add a development board as a visual assembly component. The carrier PCB remains in
            place. Populated boards are not blank placement surfaces.
          </p>
          {developmentBoardSpecifications.map((spec) => (
            <article key={spec.id}>
              <h3>{spec.name.value}</h3>
              <p>{getPart(spec.id)?.description}</p>
              <details>
                <summary>Board Specifications · {spec.name.value}</summary>
                <BoardSpecifications spec={spec} />
              </details>
              <button
                className="button primary"
                disabled={
                  !getPart(spec.id)?.insertionSupported || s.currentProject.components.length >= 64
                }
                onClick={() => {
                  if (s.beginPlacement(spec.id)) {
                    layout.setPanel('workspace');
                    close();
                  }
                }}
              >
                Add {spec.name.value} to Design
              </button>
              {!getPart(spec.id)?.insertionSupported && (
                <p>Comparison only: select an exact supported variant before placement.</p>
              )}
            </article>
          ))}
        </>
      ) : layout.drawer === 'components' ? (
        <>
          <label className="drawer-search">
            Search components
            <input
              autoFocus
              aria-label="Search drawer components"
              placeholder="Name, manufacturer or part number"
              maxLength={200}
              value={filters.query}
              onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            />
          </label>
          <label className="drawer-category">
            Category
            <select
              aria-label="Drawer component category"
              value={filters.category}
              onChange={(e) =>
                setFilters({ ...filters, category: e.target.value as CatalogFilters['category'] })
              }
            >
              <option value="all">All Components</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <button className="drawer-clear" onClick={() => setFilters({ ...emptyFilters })}>
            Clear drawer filters
          </button>
          <p>
            Visual placement only. Parts are not automatically wired or electrically compatible.
          </p>
          {s.currentProject.components.length >= 64 && (
            <p role="status">
              The project has reached its 64-object limit. Undo an addition or load a smaller
              project to place another part.
            </p>
          )}
          <div className="drawer-results" aria-live="polite">
            {filterCatalog(filters).length} components
          </div>
          {filterCatalog(filters).map((part) => (
            <article key={part.id} className={selected === part.id ? 'selected' : ''}>
              <small>
                {part.manufacturer} · {part.subcategory}
              </small>
              <h3>
                <button
                  aria-expanded={selected === part.id}
                  onClick={() => setSelected(selected === part.id ? null : part.id)}
                >
                  {part.name}
                </button>
              </h3>
              <dl>
                {Object.entries(part.specifications)
                  .slice(0, 3)
                  .map(([key, spec]) => (
                    <div key={key}>
                      <dt>{spec.label}</dt>
                      <dd>{specText(spec)}</dd>
                    </div>
                  ))}
              </dl>
              {selected === part.id && (
                <div>
                  <p>{part.description}</p>
                  <p>{part.caution}</p>
                  <a href={part.productUrl} target="_blank" rel="noreferrer">
                    Manufacturer reference ↗
                  </a>
                </div>
              )}
              <p>{part.insertionNote}</p>
              <small>Manufacturer-sourced facts · partial record</small>
              <button
                className="button primary"
                disabled={!part.insertionSupported || s.currentProject.components.length >= 64}
                onClick={() => {
                  if (s.beginPlacement(part.id)) {
                    layout.setPanel('workspace');
                    close();
                  }
                }}
              >
                Add to Design
              </button>
            </article>
          ))}
          {!filterCatalog(filters).length && (
            <p>No components match. Try another category or clear filters.</p>
          )}
        </>
      ) : null}
    </dialog>
  );
}
