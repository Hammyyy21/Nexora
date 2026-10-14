import { useMemo, useState } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useProjectsStore } from '../../projects/store';
import { useFirmwareStore, draftFor } from '../../firmware/store';
import { navigateWorkspace } from '../../catalog/navigation';
import { useGuideStore } from '../store';
import { createBuildPlan } from './planner';
import { editBuildGoal, setPlanStep } from './state';
import type { PlanStep } from './schema';
import './build-plan.css';

const labels = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  needs_verification: 'Needs verification',
  completed: 'User verified',
};
export function BuildPlan() {
  const project = useWorkspaceStore((s) => s.currentProject);
  const memory = useProjectsStore((s) => s.mentors?.[project.id]);
  const firmware = useFirmwareStore((s) => draftFor(s, project.id).source);
  const mode = useGuideStore((s) => s.explanationMode);
  const busy = useGuideStore((s) => s.busy);
  const previous = memory?.plan ?? project.buildPlan;
  const goal = memory?.intent.primary_goal ? memory.intent : previous?.goal;
  const plan = useMemo(
    () =>
      goal?.primary_goal
        ? createBuildPlan(project, goal, previous, project.firmwareSource ?? firmware)
        : undefined,
    [project, goal, previous, firmware],
  );
  const [error, setError] = useState('');
  const completed = plan?.steps.filter((s) => s.status === 'completed').length ?? 0;
  const next = plan?.steps.find((s) => s.id === plan.next_step_id);
  async function help(step: PlanStep) {
    await useGuideStore
      .getState()
      .ask(
        `Help with build-plan step ${step.id}: ${step.title}. Explain why it matters and the next practical action using my current plan.`,
      );
  }
  return (
    <section className="build-plan" aria-label="Build Plan">
      <header>
        <strong>Build Plan</strong>
        {plan && (
          <span>
            {completed}/{plan.steps.length} user verified
          </span>
        )}
      </header>
      {plan ? (
        <>
          <p className="build-objective">{plan.goal.primary_goal}</p>
          <p>
            <strong>Next: {next?.title}</strong>
            <br />
            {next?.unresolved[0] ?? next?.explanation}
          </p>
          <button
            className="button small"
            disabled={busy}
            onClick={() => void useGuideStore.getState().ask('What should I do next?')}
          >
            What should I do next?
          </button>
          <details>
            <summary>View {plan.steps.length} engineering steps</summary>
            <p className="plan-scope">
              Progress records your review. It does not certify a working circuit.
            </p>
            {plan.goal.requirements.length > 0 && (
              <div>
                <strong>User requirements</strong>
                <ul>
                  {plan.goal.requirements.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <strong>Component candidates</strong>
              {plan.recommendations.map((r, i) => (
                <p key={i}>
                  <b>{r.name}</b> —{' '}
                  {r.availability === 'present'
                    ? 'Already present'
                    : r.availability === 'addable'
                      ? 'Available to add'
                      : 'Unavailable in catalog'}
                  <br />
                  {r.reason}
                  <br />
                  <small>Unverified compatibility · Manufacturer documentation required</small>
                </p>
              ))}
            </div>
            {plan.steps.map((step) => (
              <details key={step.id} className="build-step">
                <summary>
                  {step.title}
                  <span className={`plan-status ${step.status}`}>{labels[step.status]}</span>
                </summary>
                <p>{mode === 'beginner' ? step.explanation : step.technical}</p>
                <strong>Current evidence</strong>
                <ul>
                  {step.evidence.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
                {step.unresolved.length > 0 && (
                  <>
                    <strong>Still needed</strong>
                    <ul>
                      {step.unresolved.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </>
                )}
                <p>
                  <strong>Verify:</strong> {step.criteria.join(' ')}
                </p>
                {step.dependencies.length > 0 && (
                  <p>
                    Prerequisites:{' '}
                    {step.dependencies
                      .map((id) => plan.steps.find((s) => s.id === id)?.title)
                      .join(', ')}
                  </p>
                )}
                {step.verification && (
                  <p>
                    User evidence: {step.verification.note}
                    {step.status !== 'completed'
                      ? ' · Needs review after project or requirement changes.'
                      : ''}
                  </p>
                )}
                <div className="plan-actions">
                  <button className="button small" disabled={busy} onClick={() => void help(step)}>
                    Help with {step.title.toLowerCase()}
                  </button>
                  {['schematic', 'pcb', 'firmware', 'inventory', 'missing'].includes(step.id) && (
                    <button
                      className="button small"
                      onClick={() =>
                        navigateWorkspace(
                          step.id === 'firmware'
                            ? 'code'
                            : step.id === 'inventory' || step.id === 'missing'
                              ? 'components'
                              : (step.id as 'pcb' | 'schematic'),
                        )
                      }
                    >
                      Open{' '}
                      {step.id === 'firmware'
                        ? 'Code'
                        : step.id === 'inventory' || step.id === 'missing'
                          ? 'Components'
                          : step.id === 'pcb'
                            ? 'PCB Layout'
                            : 'Schematic'}
                    </button>
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const note = new FormData(e.currentTarget).get('evidence') as string;
                    try {
                      setPlanStep(step.id, true, note);
                      setError('');
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                >
                  <label>
                    What did you verify?
                    <textarea
                      name="evidence"
                      aria-label={`Verification evidence for ${step.title}`}
                      maxLength={500}
                      rows={2}
                      defaultValue={step.verification?.note ?? ''}
                      required
                    />
                  </label>
                  <button
                    className="button small"
                    disabled={
                      step.status === 'blocked' ||
                      step.status === 'completed' ||
                      step.dependencies.some(
                        (id) => plan.steps.find((s) => s.id === id)?.status !== 'completed',
                      )
                    }
                  >
                    Mark manually verified
                  </button>
                  {(step.verification || step.status === 'completed') && (
                    <button
                      type="button"
                      className="button small"
                      onClick={() => setPlanStep(step.id, false)}
                    >
                      Reopen step
                    </button>
                  )}
                </form>
              </details>
            ))}
            {plan.omitted > 0 && (
              <p>
                Context is incomplete: {plan.omitted} memory/evidence entries were shortened or
                omitted. Review original requirements before proceeding.
              </p>
            )}
          </details>
        </>
      ) : (
        <p>Describe what you want to build to start a plan.</p>
      )}
      <details>
        <summary>{plan ? 'Edit project goal' : 'Set project goal'}</summary>
        <form
          key={project.id + ':' + (plan?.goal_revision ?? 0)}
          onSubmit={(e) => {
            e.preventDefault();
            try {
              editBuildGoal(new FormData(e.currentTarget).get('goal') as string);
              setError('');
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <label>
            Project objective
            <textarea
              aria-label="Project objective"
              name="goal"
              rows={3}
              maxLength={500}
              defaultValue={plan?.goal.primary_goal ?? ''}
              required
            />
          </label>
          <p>
            Include numerical requirements and units. Changed requirements reopen affected reviews;
            hardware is unchanged.
          </p>
          <button className="button small" disabled={busy}>
            Save goal
          </button>
        </form>
      </details>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
