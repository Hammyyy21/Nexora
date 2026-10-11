import { useState } from 'react';
import { FolderOpen, Plus, Copy, Pencil, Trash2, X } from 'lucide-react';
import { projectTemplates, type TemplateId } from './templates';
import { useProjectsStore } from './store';
import './projects.css';

export function ProjectDashboard() {
  const manager = useProjectsStore();
  const [name, setName] = useState('My Hardware Project');
  const [template, setTemplate] = useState<TemplateId>('blank');
  if (!manager.dashboardOpen) return null;
  return (
    <div className="projects-shade" role="presentation">
      <section
        className="projects-hub"
        role="dialog"
        aria-modal="true"
        aria-label="Nexora projects"
      >
        <header className="projects-heading">
          <div>
            <small>NEXORA STUDIO</small>
            <h1>Projects</h1>
            <p>Open a design or begin a new hardware concept.</p>
          </div>
          <button aria-label="Close projects" onClick={() => manager.setDashboardOpen(false)}>
            <X size={20} />
          </button>
        </header>
        {manager.error && (
          <p role="alert" className="projects-error">
            {manager.error}
          </p>
        )}
        <details>
          <summary>Open a connected demonstration project</summary>
          <p>
            Each opens a new saved copy. Demo pin assignments and calculation inputs are labeled;
            Robotics includes a supply-budget overage to correct.
          </p>
          {(['cooling', 'iot', 'robotics'] as const).map((id) => (
            <button
              key={id}
              className="button"
              onClick={() => manager.createNew(projectTemplates.find((t) => t.id === id)!.name, id)}
            >
              Open demo: {projectTemplates.find((t) => t.id === id)!.name}
            </button>
          ))}
        </details>
        <div className="projects-columns">
          <div>
            <h2>
              <FolderOpen size={18} /> Your designs
            </h2>
            <div className="projects-list">
              {manager.projects.map((project) => (
                <article
                  key={project.id}
                  className={project.id === manager.activeId ? 'is-current' : ''}
                >
                  <div>
                    <strong>{project.name}</strong>
                    <small>
                      {project.components.length} objects{' '}
                      {project.id === manager.activeId ? '· Current' : ''}
                    </small>
                  </div>
                  <div className="projects-actions">
                    <button
                      title="Open project"
                      aria-label={`Open ${project.name}`}
                      onClick={() => manager.switchTo(project.id)}
                    >
                      Open
                    </button>
                    <button
                      title="Rename"
                      aria-label={`Rename ${project.name}`}
                      onClick={() => {
                        const value = window.prompt('Project name', project.name);
                        if (value !== null) manager.rename(project.id, value);
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      title="Duplicate"
                      aria-label={`Duplicate ${project.name}`}
                      onClick={() => manager.duplicate(project.id)}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      title="Delete"
                      aria-label={`Delete ${project.name}`}
                      disabled={manager.projects.length <= 1}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete “${project.name}” from this browser? This cannot be undone.`,
                          )
                        )
                          manager.remove(project.id);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
          <form
            className="projects-new"
            onSubmit={(e) => {
              e.preventDefault();
              manager.createNew(name, template);
            }}
          >
            <h2>
              <Plus size={18} /> Create project
            </h2>
            <label>
              Project name
              <input
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <fieldset>
              <legend>Starting template</legend>
              <div className="projects-templates">
                {projectTemplates.map((option) => (
                  <label key={option.id} className={template === option.id ? 'is-selected' : ''}>
                    <input
                      type="radio"
                      name="template"
                      value={option.id}
                      checked={template === option.id}
                      onChange={() => setTemplate(option.id)}
                    />
                    <span>
                      <strong>{option.name}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button className="button primary" type="submit">
              <Plus size={16} /> Create and open
            </button>
            <p className="projects-footnote">
              Local visual concepts only. Part placement does not verify wiring, compatibility, or
              electrical safety.
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}
