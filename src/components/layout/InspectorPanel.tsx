import { PCBComponentEditor } from '../../workspace/PCBComponentEditor';
import { SelectedBoardSpecifications } from '../../workspace/BoardSpecificationsPanel';
import { useState } from 'react';
import { demoConnections } from '../../data/demoProject';
import { specText } from '../../catalog/catalog';
import { useDesignLayout } from '../../workspace/layout';
import { getPart } from '../../catalog/catalog';
import { useLibraryStore } from '../../catalog/store';
import { exploreReplacements, navigateWorkspace } from '../../catalog/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Box, Crosshair, Eye, Info, MousePointer2, PanelRightClose, RotateCcw } from 'lucide-react';
import { useWorkspaceStore as useStore } from '../../store/useWorkspaceStore';
import { demoProject } from '../../data/demoProject';
import type { Vec3 } from '../../types/workspace';
import { ComponentIcon } from './ProjectSidebar';
import { IconButton } from '../ui/IconButton';
export function InspectorPanel() {
  const s = useStore();
  const [tab, setTab] = useState<'overview' | 'electrical' | 'connections'>('overview');
  const [advanced, setAdvanced] = useState(false);
  const c = s.currentProject.components.find((c) => c.id === s.selectedComponentId);
  const part = getPart(c?.catalogId);
  const electrical = Object.values(part?.specifications ?? {}).filter((spec) =>
    /voltage|supply|current|resistance|power|tdp/i.test(spec.label),
  );
  const blankBoard = s.currentProject.boardTemplateId === 'blank-92';
  const paths =
    c?.catalogId || blankBoard
      ? []
      : demoConnections.filter(
          (path) =>
            (path.from === c?.id || path.to === c?.id) &&
            [path.from, path.to].every(
              (id) => !s.currentProject.components.find((item) => item.id === id)?.catalogId,
            ),
        );
  return (
    <aside className="inspector" aria-label="Component inspector">
      <div className="panel-heading">
        <span>INSPECTOR</span>
        <IconButton
          label="Collapse inspector"
          onClick={() => {
            useDesignLayout.getState().setCollapsed(true);
          }}
        >
          <PanelRightClose size={15} />
        </IconButton>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          className="inspector-content"
          key={c?.id ?? 'empty'}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: s.reducedMotion ? 0 : 0.18 }}
        >
          {c ? (
            <>
              <div className="component-heading">
                <div className="component-avatar">
                  <ComponentIcon type={c.type} size={25} />
                </div>
                <div>
                  <span className="eyebrow">
                    {c.reference} <span> / </span> COMPONENT
                  </span>
                  <h2>{c.name}</h2>
                </div>
              </div>
              <div className="component-tags">
                <span>{c.type.replace('microcontroller', 'Integrated circuit')}</span>
                <span className="blue-tag">Selected</span>
              </div>
              <SelectedBoardSpecifications project={s.currentProject} component={c} />
              <PCBComponentEditor key={`${c.id}:${JSON.stringify(c.footprint)}`} component={c} />
              <div
                className="inspector-tabs"
                role="tablist"
                aria-label="Inspector sections"
                onKeyDown={(e) => {
                  const tabs = ['overview', 'electrical', 'connections'] as const;
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                  e.preventDefault();
                  const next =
                    e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? 2
                        : (tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
                  setTab(tabs[next]);
                  document.getElementById(`inspector-tab-${tabs[next]}`)?.focus();
                }}
              >
                {(['overview', 'electrical', 'connections'] as const).map((id) => (
                  <button
                    key={id}
                    role="tab"
                    id={`inspector-tab-${id}`}
                    aria-controls={`inspector-view-${id}`}
                    aria-selected={tab === id}
                    tabIndex={tab === id ? 0 : -1}
                    onClick={() => setTab(id)}
                  >
                    {id[0].toUpperCase() + id.slice(1)}
                  </button>
                ))}
              </div>
              <div
                role="tabpanel"
                id="inspector-view-overview"
                aria-labelledby="inspector-tab-overview"
                hidden={tab !== 'overview'}
              >
                <section className="inspector-section">
                  <h3>About this component</h3>
                  <p>
                    {c.id === 'pcb' && blankBoard
                      ? 'Blank concept PCB. See Board Specifications for current dimensions. No routing or electrical integration is defined.'
                      : c.description}
                  </p>
                  <div className="info-callout">
                    <Info size={14} />
                    <p>{c.purpose}</p>
                  </div>
                </section>
                <div className="inspector-library-actions">
                  {c.catalogId && (
                    <>
                      <p>Visual-Only · generic model · no verified wiring.</p>
                      <button
                        onClick={() => {
                          useLibraryStore.getState().openDetails(c.catalogId!);
                          navigateWorkspace('components');
                        }}
                      >
                        View catalog details
                      </button>
                    </>
                  )}
                  {(['microcontroller', 'sensor', 'mosfet'].includes(c.type) || c.catalogId) && (
                    <button onClick={exploreReplacements}>Explore replacements</button>
                  )}
                  {(c.id === 'mcu' || getPart(c.catalogId)?.architecture) && (
                    <button
                      onClick={() => {
                        s.setFirmwareTarget(c.id);
                        navigateWorkspace('code');
                      }}
                    >
                      Use as firmware target
                    </button>
                  )}
                  {['mcu', 'sensor', 'mosfet', 'fan'].includes(c.id) ? (
                    <button onClick={() => navigateWorkspace('code')}>View related code</button>
                  ) : (
                    <p>No firmware module is associated with this object.</p>
                  )}
                </div>
              </div>
              <section
                className="inspector-section"
                role="tabpanel"
                id="inspector-view-electrical"
                aria-labelledby="inspector-tab-electrical"
                hidden={tab !== 'electrical'}
              >
                <h3>Electrical specifications</h3>
                <p>Manufacturer specifications, where curated. These are not simulated readings.</p>
                {part?.voltageRange && <p>Operating supply: {part.voltageRange.join('–')} V</p>}
                {electrical.map((spec) => (
                  <p key={spec.label}>
                    <strong>
                      {spec.label}: {specText(spec)}
                    </strong>
                    <br />
                    <a href={spec.source} target="_blank" rel="noreferrer">
                      Specification source ↗
                    </a>
                  </p>
                ))}
                {!electrical.length && !part?.voltageRange && (
                  <p>No verified electrical specifications are available for this component.</p>
                )}
                <p>Unlisted voltage, current, resistance and power properties remain unknown.</p>
              </section>
              <section
                className="inspector-section"
                role="tabpanel"
                id="inspector-view-connections"
                aria-labelledby="inspector-tab-connections"
                hidden={tab !== 'connections'}
              >
                <h3>Interfaces & pins</h3>
                <p>
                  {part?.interfaces.length
                    ? `Curated interfaces: ${part.interfaces.join(', ')}`
                    : 'Interfaces: not verified for this concept object.'}
                </p>
                <p>Pin assignments: unknown. Consult the exact part datasheet before wiring.</p>
                <h4>CONNECTION NOTES</h4>
                <p>
                  {blankBoard
                    ? 'Blank PCB template: no routing or electrical connections are defined.'
                    : c.connectionNotes}
                </p>
                {paths.length > 0 && (
                  <>
                    <h4>ILLUSTRATIVE DEMO PATHS</h4>
                    <ul>
                      {paths.map((path) => (
                        <li key={`${path.from}-${path.to}`}>
                          {s.currentProject.components.find(
                            (item) => item.id === (path.from === c.id ? path.to : path.from),
                          )?.name ?? 'Unknown component'}
                        </li>
                      ))}
                    </ul>
                    <p>Visual metadata only; not verified wiring or a pin map.</p>
                  </>
                )}
                {part && (
                  <a href={part.productUrl} target="_blank" rel="noreferrer">
                    Manufacturer connection reference ↗
                  </a>
                )}
              </section>
              <details
                className="inspector-advanced"
                open={advanced}
                onToggle={(e) => setAdvanced(e.currentTarget.open)}
              >
                <summary>Advanced · Transform & appearance</summary>
                <section className="inspector-section">
                  <div className="section-heading">
                    <h3>Transform</h3>
                    <IconButton
                      label="Reset selected transform"
                      onClick={() => {
                        const base = c.catalogId
                          ? {
                              position: c.initialPosition ?? ([6, 1, 0] as Vec3),
                              rotation: [0, 0, 0] as Vec3,
                            }
                          : demoProject.components.find((b) => b.id === (c.conceptSourceId ?? c.id))!;
                        s.editComponent(c.id, {
                          position: [...base.position],
                          rotation: [...base.rotation],
                        });
                      }}
                    >
                      <RotateCcw size={12} />
                    </IconButton>
                  </div>
                  {(['position', 'rotation'] as const).map((kind) => (
                    <div className="transform-control" key={kind}>
                      <label>
                        {kind === 'position' ? 'Position' : 'Rotation'}
                        <span>{kind === 'position' ? '× 10 mm' : 'deg'}</span>
                      </label>
                      <div className="vector-inputs">
                        {['X', 'Y', 'Z'].map((axis, i) => (
                          <label className={`axis-field axis-${axis.toLowerCase()}`} key={axis}>
                            <span>{axis}</span>
                            <input
                              aria-label={`${kind} ${axis}`}
                              type="number"
                              min={kind === 'position' ? -20 : -360}
                              max={kind === 'position' ? 20 : 360}
                              step={kind === 'position' ? 0.1 : 5}
                              value={Number(c[kind][i].toFixed(2))}
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                if (
                                  !Number.isFinite(n) ||
                                  Math.abs(n) > (kind === 'position' ? 20 : 360)
                                )
                                  return;
                                const v = [...c[kind]] as Vec3;
                                v[i] = n;
                                s.editComponent(c.id, { [kind]: v });
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
                <section className="inspector-section">
                  <h3>Appearance</h3>
                  <label className="property-row">
                    Material
                    <select
                      value={c.material}
                      aria-label="Material"
                      onChange={(e) =>
                        s.editComponent(c.id, { material: e.target.value as typeof c.material })
                      }
                    >
                      <option value="matte">Matte finish</option>
                      <option value="metal">Brushed metal</option>
                      <option value="polymer">Polymer</option>
                    </select>
                  </label>
                  <label className="property-row">
                    Base color
                    <div className="color-field">
                      <input
                        type="color"
                        aria-label="Component color"
                        value={c.color}
                        onChange={(e) => s.editComponent(c.id, { color: e.target.value })}
                      />
                      <span>{c.color.toUpperCase()}</span>
                    </div>
                  </label>
                  <label className="property-row">
                    Opacity
                    <div className="opacity-control">
                      <input
                        type="range"
                        aria-label="Opacity"
                        min="0.05"
                        max="1"
                        step="0.05"
                        value={c.opacity}
                        onChange={(e) => s.editComponent(c.id, { opacity: Number(e.target.value) })}
                      />
                      <span>{Math.round(c.opacity * 100)}%</span>
                    </div>
                  </label>
                  <label className="property-row">
                    <span>
                      <Eye size={13} />
                      Visibility
                    </span>
                    <input
                      className="switch"
                      type="checkbox"
                      aria-label="Component visibility"
                      checked={c.visible}
                      onChange={(e) => s.editComponent(c.id, { visible: e.target.checked })}
                    />
                  </label>
                </section>
              </details>
              <button
                className="button focus-button"
                disabled={!c.visible}
                onClick={() => {
                  s.requestCamera('focus');
                  useDesignLayout.getState().setPanel('workspace');
                }}
              >
                <Crosshair size={14} />
                Focus component <kbd>F</kbd>
              </button>
            </>
          ) : (
            <>
              <div className="overview-illustration">
                <div className="overview-orbit" />
                <CpuIllustration />
              </div>
              <div className="inspector-empty">
                <span className="eyebrow">YOUR NEXT IDEA, IN DIMENSION</span>
                <h2>Meet your design.</h2>
                <p>Select a component on the board or in the explorer to see what makes it work.</p>
                <button className="button" onClick={() => s.selectComponent('mcu')}>
                  <MousePointer2 size={14} />
                  Inspect microcontroller
                </button>
              </div>
              <section className="inspector-section overview-section">
                <h3>Project overview</h3>
                <div className="overview-row">
                  <span>Assembly</span>
                  <strong>Cooling controller</strong>
                </div>
                <div className="overview-row">
                  <span>Board dimensions</span>
                  <strong>92 × 64 mm</strong>
                </div>
                <div className="overview-row">
                  <span>Objects</span>
                  <strong>{s.currentProject.components.length} components</strong>
                </div>
                <div className="overview-row">
                  <span>Revision</span>
                  <strong>Concept 01</strong>
                </div>
              </section>
              <div className="inspector-hint">
                <Box size={16} />
                <p>
                  A hands-on design concept.
                  <br />
                  Explore freely. Every edit is reversible.
                </p>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="inspector-footer">
        <span className="dot" />
        Frontend preview<span>No simulation</span>
      </div>
    </aside>
  );
}
function CpuIllustration() {
  return (
    <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
      <path d="M50 12 85 31v38L50 89 15 69V31Z" stroke="#397dff" strokeWidth="1" />
      <path
        d="m15 31 35 20 35-20M50 51v38M32 22l35 20v38M67 21 32 42v37"
        stroke="#397dff"
        strokeOpacity=".4"
      />
      <path d="m50 33 17 10-17 10-17-10Z" fill="#397dff" fillOpacity=".3" />
      <path d="M33 43v18l17 10 17-10V43M50 53v18" stroke="#79a7ff" />
    </svg>
  );
}
