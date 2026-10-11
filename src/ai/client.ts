import { parseAIAction, type AIAction } from './actions';
export interface ChatContext {
  board_summary?: string;
  connections?: import('../types/workspace').SchematicConnection[];
  project_name?: string;
  selected_component_id?: string;
  selected_component_type?: string;
  catalog_ids: string[];
  engineering_notices?: string[];
  project_components?: {
    id: string;
    name: string;
    catalog_id?: string | null;
    ports?: string[];
    fixed: boolean;
    position: [number, number, number];
  }[];
}
export interface GuideResponse {
  actions?: AIAction[];
  mode: 'ai';
  request_id: string;
  answer: string;
  missing_data: string[];
  unverified_recommendations: string[];
  cited_catalog_ids: string[];
  notice: string;
  references: {
    catalog_id: string;
    name: string;
    verification_status: string;
    sources: { url: string; title: string; license: string }[];
  }[];
}
export class GuideError extends Error {
  constructor(
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}
async function request(path: string, body?: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), body ? 65000 : 4000);
  try {
    const response = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      credentials: 'omit',
    });
    const data = await response.json();
    if (!response.ok) {
      // Do not display arbitrary HTML/proxy errors or raw provider exception text.
      const code = typeof data?.error?.code === 'string' ? data.error.code : 'HTTP_ERROR';
      throw new GuideError(code, errorMessage(code), data?.error?.request_id);
    }
    return data;
  } catch (error) {
    if (error instanceof GuideError) throw error;
    throw new GuideError(
      controller.signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE',
      controller.signal.aborted
        ? 'The AI request timed out.'
        : 'The AI backend is unavailable or returned an invalid response.',
    );
  } finally {
    clearTimeout(timer);
  }
}
function errorMessage(code: string) {
  switch (code) {
    case 'AI_NOT_CONFIGURED':
      return 'Live AI is not configured. Use the local Demo Assistant.';
    case 'RATE_LIMITED':
    case 'UPSTREAM_RATE_LIMIT':
      return 'The AI request or quota limit was reached. Wait before retrying.';
    case 'UPSTREAM_TIMEOUT':
      return 'The AI service timed out. Try again later.';
    case 'UPSTREAM_AUTH_ERROR':
      return 'The server AI credentials or permissions need attention.';
    case 'INVALID_INPUT':
    case 'REQUEST_TOO_LARGE':
      return 'The question or context is too long or invalid.';
    case 'INVALID_CONTEXT':
      return 'The selected catalog context is unavailable. Select a catalog component again.';
    case 'AI_REFUSED':
      return 'The AI guide declined this request. Try a hardware explanation question.';
    default:
      return 'The AI guide could not complete this request. You can retry or choose Demo Assistant.';
  }
}
export async function getGuideHealth() {
  const data = await request('/api/health');
  if (data?.status !== 'ok' || typeof data.ai_configured !== 'boolean') {
    throw new GuideError('INVALID_RESPONSE', 'Invalid health response.');
  }
  return data.ai_configured as boolean;
}
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === 'string');
export async function askGuide(
  message: string,
  context: ChatContext,
  responseLength: ResponseLength = 'auto',
): Promise<GuideResponse> {
  const data = await request('/api/ai/chat', {
    messages: [{ role: 'user', content: message }],
    context,
    response_length: responseLength,
  });
  if (
    data?.mode !== 'ai' ||
    typeof data.answer !== 'string' ||
    typeof data.notice !== 'string' ||
    typeof data.request_id !== 'string' ||
    !strings(data.missing_data) ||
    !strings(data.unverified_recommendations) ||
    !strings(data.cited_catalog_ids) ||
    (data.actions !== undefined && (!Array.isArray(data.actions) || data.actions.length > 5)) ||
    !Array.isArray(data.references) ||
    !data.references.every(
      (r: GuideResponse['references'][number]) =>
        r &&
        typeof r.catalog_id === 'string' &&
        typeof r.name === 'string' &&
        Array.isArray(r.sources) &&
        r.sources.every(
          (s) =>
            s &&
            typeof s.title === 'string' &&
            typeof s.url === 'string' &&
            s.url.startsWith('https://'),
        ),
    )
  ) {
    throw new GuideError('INVALID_RESPONSE', 'The backend returned an invalid structured answer.');
  }
  try {
    data.actions = (data.actions ?? []).map(parseAIAction);
  } catch {
    throw new GuideError('INVALID_RESPONSE', 'The backend proposed invalid design operations.');
  }
  return data;
}
export type ResponseLength = 'auto' | 'concise' | 'detailed';
export function formatGuideResponse(response: GuideResponse, detail: ResponseLength = 'auto') {
  if (detail !== 'detailed') return response.answer.trim();
  return [
    response.answer,
    response.missing_data.length ? 'Missing data: ' + response.missing_data.join('; ') : '',
    response.unverified_recommendations.length
      ? 'Unverified recommendations: ' + response.unverified_recommendations.join('; ')
      : '',
    ...response.references.map(
      (r) =>
        `Catalog: ${r.name} (${r.verification_status}) — ${r.sources.map((s) => s.url).join(', ')}`,
    ),
  ]
    .filter(Boolean)
    .join('\n\n');
}
