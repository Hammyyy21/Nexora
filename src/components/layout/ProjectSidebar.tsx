import { useState } from 'react';
import { useDesignLayout } from '../../workspace/layout';
import {
  Box,
  ChevronDown,
  ChevronRight,
  CircuitBoard,
  Cpu,
  Eye,
  EyeOff,
  Fan,
  Layers3,
  Plug,
  Search,
  SlidersHorizontal,
  Thermometer,
  Zap,
} from 'lucide-react';
import { useWorkspaceStore as useStore } from '../../store/useWorkspaceStore';
import type { ComponentType, HardwareComponent } from '../../types/workspace';
import { IconButton } from '../ui/IconButton';
const icons: Partial<Record<ComponentType, typeof Cpu>> = {
  board: CircuitBoard,
  microcontroller: Cpu,
  sensor: Thermometer,
  mosfet: Zap,
  fan: Fan,
  usb: Plug,
  terminal: Plug,
  header: Plug,
  housing: Box,
};
export function ComponentIcon({ type, size = 15 }: { type: ComponentType; size?: number }) {
  const Icon = icons[type] ?? SlidersHorizontal;
  return <Icon size={size} />;
}
export function ProjectSidebar() {
  const s = useStore();
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<string[]>([]);
  const [rootOpen, setRootOpen] = useState(true);
  const toggle = (id: string) =>
    setClosed((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const renderItem = (c: HardwareComponent) => (
    <div
      className={`tree-item ${s.selectedComponentId === c.id ? 'selected' : ''} ${!c.visible ? 'is-hidden' : ''}`}
      key={c.id}
    >
      <button
        className="tree-select"
        onClick={() => s.selectComponent(c.id)}
        aria-pressed={s.selectedComponentId === c.id}
      >
        <ComponentIcon type={c.type} />
        <span>{c.name}</span>
        <small>{c.reference}</small>
      </button>
      <IconButton
        label={`${c.visible ? 'Hide' : 'Show'} ${c.name}`}
        className="visibility"
        onClick={() => s.editComponent(c.id, { visible: !c.visible })}
      >
        {c.visible ? <Eye size={13} /> : <EyeOff size={13} />}
      </IconButton>
    </div>
  );
  return (
    <aside className="project-sidebar" aria-label="Component explorer">
      <div className="panel-heading">
        <span>EXPLORER</span>
        <span className="count">{s.currentProject.components.length}</span>
        <IconButton
          label="Collapse explorer"
          onClick={() => {
            useDesignLayout.getState().setCollapsed(true);
          }}
        >
          <Layers3 size={15} />
        </IconButton>
      </div>
      <label className="search-input">
        <Search size={14} />
        <input
          placeholder="Find a component…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Find a component"
        />
        <kbd>⌕</kbd>
      </label>
      <div className="project-tree">
        <button
          className="tree-root"
          onClick={() => setRootOpen(!rootOpen)}
          aria-expanded={rootOpen}
        >
          {rootOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Box size={16} />
          <span>Smart Cooling Controller</span>
        </button>
        {(rootOpen || query) &&
          (['structure', 'active', 'connectors', 'passives'] as const).map((group) => {
            const items = s.currentProject.components.filter(
              (c) =>
                c.group === group &&
                (c.name + ' ' + c.reference).toLowerCase().includes(query.toLowerCase()),
            );
            if (!items.length) return null;
            return (
              <div className="tree-group" key={group}>
                <button
                  className="group-title"
                  aria-expanded={!closed.includes(group) || !!query}
                  onClick={() => toggle(group)}
                >
                  {closed.includes(group) && !query ? (
                    <ChevronRight size={12} />
                  ) : (
                    <ChevronDown size={12} />
                  )}
                  <span>
                    {
                      {
                        structure: 'Board & enclosure',
                        active: 'Active components',
                        connectors: 'Connectors',
                        passives: 'Passive components',
                      }[group]
                    }
                  </span>
                  <small>{items.length}</small>
                </button>
                {(!closed.includes(group) || query) && items.map(renderItem)}
              </div>
            );
          })}
        {query &&
          !s.currentProject.components.some((c) =>
            (c.name + ' ' + c.reference).toLowerCase().includes(query.toLowerCase()),
          ) && <p className="empty-search">No matching components.</p>}
      </div>
      <div className="sidebar-bottom">
        <div className="project-thumbnail">
          <CircuitBoard size={25} />
          <div>
            <strong>Designed to explore.</strong>
            <span>A small board. A lot of possibility.</span>
          </div>
        </div>
        <div className="project-facts">
          <span>
            BOARD SIZE<strong>92 × 64 mm</strong>
          </span>
          <span>
            COMPONENTS<strong>{s.currentProject.components.length} objects</strong>
          </span>
        </div>
        <div className="demo-note">
          <span className="dot" /> Concept assembly <span>REV 01</span>
        </div>
      </div>
    </aside>
  );
}
