import { redactSecrets } from './privacy';
export { redactSecrets } from './privacy';
import { parseBuildPlan, type BuildPlan } from './planner/schema';
import type { AssistantMessage } from '../types/workspace';

export type ExplanationMode = 'beginner' | 'engineer';
export interface ProjectIntent {
  primary_goal: string;
  intended_function: string;
  requirements: string[];
  decisions: string[];
  corrections: string[];
  unknowns: string[];
  proposed_next_steps: string;
  omitted_entries: number;
  total_messages: number;
}
export interface MentorMemory {
  intent: ProjectIntent;
  draft: string;
  plan?: BuildPlan;
}
export const emptyMemory = (): MentorMemory => ({
  intent: {
    primary_goal: '',
    intended_function: 'unknown',
    requirements: [],
    decisions: [],
    corrections: [],
    unknowns: [],
    proposed_next_steps: '',
    omitted_entries: 0,
    total_messages: 0,
  },
  draft: '',
});

export function restoreMemory(value: unknown): MentorMemory {
  const result = emptyMemory();
  if (!value || typeof value !== 'object') return result;
  const raw = value as Partial<MentorMemory>;
  if (raw.plan !== undefined) result.plan = parseBuildPlan(raw.plan);
  if (typeof raw.draft === 'string') result.draft = redactSecrets(raw.draft).slice(0, 4000);
  const intent = raw.intent;
  if (!intent || typeof intent !== 'object') return result;
  for (const key of ['primary_goal', 'intended_function', 'proposed_next_steps'] as const)
    if (typeof intent[key] === 'string')
      result.intent[key] = redactSecrets(intent[key]).slice(
        0,
        key === 'proposed_next_steps' ? 1600 : 500,
      );
  for (const key of ['requirements', 'decisions', 'corrections', 'unknowns'] as const)
    if (Array.isArray(intent[key]))
      result.intent[key] = intent[key]
        .filter((s): s is string => typeof s === 'string')
        .slice(-12)
        .map((s) => redactSecrets(s).slice(0, 500));
  for (const key of ['omitted_entries', 'total_messages'] as const)
    if (Number.isSafeInteger(intent[key]) && intent[key] >= 0) result.intent[key] = intent[key];
  return result;
}

export function isInterfaceRequest(text: string) {
  return /\b(hide|close|collapse|dismiss|show|open)\b.*\b(table|panel|inspection|sidebar|interface)\b/i.test(
    text,
  );
}
export function rememberUser(
  memory: MentorMemory,
  raw: string,
  precedingAnswer = '',
): MentorMemory {
  const next = restoreMemory(memory);
  const intent = next.intent;
  const text = redactSecrets(raw).trim();
  intent.total_messages++;
  const add = (key: 'requirements' | 'decisions' | 'corrections', value: string) => {
    if (intent[key].includes(value.slice(0, 500))) return;
    if (intent[key].length >= 12) {
      intent[key].splice(key === 'requirements' ? 4 : 0, 1);
      intent.omitted_entries++;
    }
    if (value.length > 500) intent.omitted_entries++;
    intent[key].push(value.slice(0, 500));
  };
  if (isInterfaceRequest(text)) return next;
  // Classify only explicit function language. Ambiguous follow-ups retain the goal.
  let kind = '';
  if (
    /\b(distance|spacing|clearance)\b/i.test(text) &&
    /\b(pcb|pads?|between.*components?)\b/i.test(text)
  )
    kind = 'PCB component spacing';
  else if (
    /\b(distance|how far|measure.*range)\b/i.test(text) &&
    (/\b(objects?|obstacles?|physical|away)\b/i.test(text) ||
      /object/.test(intent.intended_function))
  )
    kind = 'object-distance measurement';
  else if (/\b(detect|detection)\b.*\b(objects?|obstacles?)\b/i.test(text))
    kind = 'object detection';
  else if (/wireless.*\b(power|charg|energy)|inductive.*charg/i.test(text))
    kind = 'wireless power transfer';
  else if (/wireless.*\b(data|communicat|transmit|messages)|\b(bluetooth|wi-?fi)\b/i.test(text))
    kind = 'wireless data communication';
  else if (/\b(measure|monitor|sense)\b.*\btemperature\b/i.test(text))
    kind = 'temperature measurement';
  if (!kind && /\b(actually|instead|new goal)\b/i.test(text) && /\b(want|build|goal)\b/i.test(text))
    kind = 'other hardware goal';
  const correction = /\b(don['’]t|do not|not the|instead|actually|wrong|no longer)\b/i.test(text);
  if (correction) add('corrections', text);
  // Negative requirements are evidence, not a new positive goal.
  if (kind && !/\b(don['’]t|do not|no longer)\b/i.test(text)) {
    if (
      intent.intended_function !== 'unknown' &&
      intent.intended_function !== kind &&
      !(/object/.test(kind) && /object/.test(intent.intended_function))
    ) {
      intent.requirements = [];
      // Controller and other confirmed decisions remain evidence across goal refinements.
      intent.unknowns = [];
      intent.proposed_next_steps = '';
    }
    intent.intended_function = kind;
    intent.primary_goal =
      kind === 'object-distance measurement'
        ? 'Measure distance to physical objects'
        : text.slice(0, 500);
    if (/object/.test(kind) && !intent.unknowns.length)
      intent.unknowns = ['Sensor selection unresolved', 'Environment unknown'];
  } else if (
    !intent.primary_goal &&
    /\b(want|build|goal|need a device)\b/i.test(text) &&
    !correction
  ) {
    intent.primary_goal = text.slice(0, 500);
  }
  if (
    /\d\s*(?:[–-]|to|meters?\b|metres?\b|m\b|cm\b|mm\b|v\b|volts?\b|ma\b|a\b|hz\b|seconds?\b|°|%)/i.test(
      text,
    ) ||
    /\b(require|must|indoors?|outdoors?|battery|accuracy)\b/i.test(text)
  )
    add('requirements', text);
  if (/\b(let['’]s use|choose|use that|use .+ (?:as|for)|decided|go with|prefer)\b/i.test(text)) {
    add('decisions', text);
    if (/\b(that|it|best)\b/i.test(text) && precedingAnswer)
      add('decisions', `Reference (AI suggestion, unverified): ${precedingAnswer}`);
  }
  return next;
}

export function boundedConversation(messages: AssistantMessage[], current: string) {
  const recent = [...messages];
  if (recent.at(-1)?.role === 'user' && recent.at(-1)?.text === current) recent.pop();
  const output: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: redactSecrets(current).slice(0, 4000) },
  ];
  let budget = 12000 - output[0].content.length;
  let omittedCharacters = Math.max(0, current.length - 4000);
  for (const message of recent.reverse()) {
    if (output.length === 10 || !budget) break;
    const safe = redactSecrets(message.text);
    const limit = Math.min(4000, budget);
    const marker = '\n[Earlier text truncated]\n';
    const content =
      safe.length <= limit
        ? safe
        : limit > marker.length
          ? marker + safe.slice(-(limit - marker.length))
          : safe.slice(-limit);
    if (!content.trim()) continue;
    omittedCharacters +=
      safe.length -
      content.length +
      (safe.length > limit && limit > marker.length ? marker.length : 0);
    output.unshift({ role: message.role, content });
    budget -= content.length;
  }
  return {
    messages: output,
    omitted_messages: Math.max(0, recent.length - output.length + 1),
    omitted_characters: omittedCharacters,
  };
}
