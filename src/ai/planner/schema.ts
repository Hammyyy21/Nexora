import type { ProjectIntent } from '../memory';
import { redactSecrets } from '../privacy';

export const stages = [
  'objective',
  'inventory',
  'missing',
  'selection',
  'power',
  'schematic',
  'pcb',
  'firmware',
  'testing',
] as const;
export type PlanStage = (typeof stages)[number];
export const statuses = [
  'not_started',
  'in_progress',
  'blocked',
  'needs_verification',
  'completed',
] as const;
export type PlanStatus = (typeof statuses)[number];
export interface Recommendation {
  role: string;
  name: string;
  availability: 'present' | 'addable' | 'unavailable';
  qualification: 'unverified';
  catalog_id: string | null;
  entity_ids: string[];
  reason: string;
}
export interface PlanStep {
  id: PlanStage;
  stage: PlanStage;
  title: string;
  explanation: string;
  technical: string;
  status: PlanStatus;
  dependencies: PlanStage[];
  entities: string[];
  evidence: string[];
  assumptions: string[];
  unresolved: string[];
  criteria: string[];
  fingerprint: string;
  verification: { source: 'user'; note: string; fingerprint: string } | null;
}
export interface BuildPlan {
  version: 1;
  goal: ProjectIntent;
  goal_revision: number;
  goal_fingerprint: string;
  steps: PlanStep[];
  recommendations: Recommendation[];
  next_step_id: PlanStage;
  omitted: number;
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const string = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max;
const strings = (v: unknown, count = 12, max = 500): v is string[] =>
  Array.isArray(v) && v.length <= count && v.every((s) => string(s, max));
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
/** Reject malformed/unknown plans instead of silently replacing saved user progress. */
export function parseBuildPlan(value: unknown): BuildPlan {
  const fail = () => {
    throw new Error('Invalid or unsupported Build Plan. Keep the original project file.');
  };
  if (!object(value) || new TextEncoder().encode(JSON.stringify(value)).length > 64000)
    return fail();
  if (
    !keys(value, [
      'version',
      'goal',
      'goal_revision',
      'goal_fingerprint',
      'steps',
      'recommendations',
      'next_step_id',
      'omitted',
    ]) ||
    value.version !== 1 ||
    !string(value.goal_fingerprint, 40) ||
    !Number.isSafeInteger(value.goal_revision) ||
    (value.goal_revision as number) < 1 ||
    !Number.isSafeInteger(value.omitted) ||
    (value.omitted as number) < 0
  )
    return fail();
  const g = value.goal;
  if (
    !object(g) ||
    !keys(g, [
      'primary_goal',
      'intended_function',
      'requirements',
      'decisions',
      'corrections',
      'unknowns',
      'proposed_next_steps',
      'omitted_entries',
      'total_messages',
    ]) ||
    !string(g.primary_goal) ||
    !string(g.intended_function) ||
    !string(g.proposed_next_steps, 1600) ||
    !['requirements', 'decisions', 'corrections', 'unknowns'].every((k) => strings(g[k])) ||
    !['omitted_entries', 'total_messages'].every(
      (k) => Number.isSafeInteger(g[k]) && (g[k] as number) >= 0,
    )
  )
    return fail();
  if (
    !Array.isArray(value.steps) ||
    value.steps.length !== stages.length ||
    !stages.includes(value.next_step_id as PlanStage)
  )
    return fail();
  for (const [index, s] of value.steps.entries()) {
    if (
      !object(s) ||
      !keys(s, [
        'id',
        'stage',
        'title',
        'explanation',
        'technical',
        'status',
        'dependencies',
        'entities',
        'evidence',
        'assumptions',
        'unresolved',
        'criteria',
        'fingerprint',
        'verification',
      ]) ||
      s.id !== stages[index] ||
      s.stage !== s.id ||
      !statuses.includes(s.status as PlanStatus) ||
      !string(s.title, 100) ||
      !string(s.explanation, 1000) ||
      !string(s.technical, 1000) ||
      !string(s.fingerprint, 40) ||
      !strings(s.entities, 64, 100) ||
      !['evidence', 'assumptions', 'unresolved', 'criteria'].every((k) => strings(s[k], 12)) ||
      !Array.isArray(s.dependencies) ||
      s.dependencies.length > 9 ||
      s.dependencies.some((d) => !stages.slice(0, index).includes(d))
    )
      return fail();
    const v = s.verification;
    if (
      v !== null &&
      (!object(v) ||
        !keys(v, ['source', 'note', 'fingerprint']) ||
        v.source !== 'user' ||
        !string(v.note) ||
        !v.note.trim() ||
        !string(v.fingerprint, 40))
    )
      return fail();
    if (s.status === 'completed' && !v) return fail();
  }
  if (!Array.isArray(value.recommendations) || value.recommendations.length > 8) return fail();
  for (const r of value.recommendations)
    if (
      !object(r) ||
      !keys(r, [
        'role',
        'name',
        'availability',
        'qualification',
        'catalog_id',
        'entity_ids',
        'reason',
      ]) ||
      !string(r.role, 100) ||
      !string(r.name, 140) ||
      !string(r.reason) ||
      !['present', 'addable', 'unavailable'].includes(r.availability as string) ||
      r.qualification !== 'unverified' ||
      !(r.catalog_id === null || string(r.catalog_id, 100)) ||
      !strings(r.entity_ids, 64, 100)
    )
      return fail();
  // Plans contain only data; sanitize all text including imported user verification notes.
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'string' ? redactSecrets(v) : v)),
  ) as BuildPlan;
}
