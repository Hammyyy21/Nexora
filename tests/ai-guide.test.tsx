import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandBar } from '../src/components/layout/CommandBar';
import { askGuide, getGuideHealth, GuideError } from '../src/ai/client';
import { guideContext, useGuideStore } from '../src/ai/store';
import { useWorkspaceStore } from '../src/store/useWorkspaceStore';
import { useProjectsStore } from '../src/projects/store';
import { ChatMessage } from '../src/ai/ChatMessage';
import { createProject } from '../src/projects/templates';
import { useLibraryStore } from '../src/catalog/store';

const answer = {
  mode: 'ai',
  request_id: 'test-request',
  answer: 'The RP2040 is a microcontroller.',
  missing_data: ['Exact wiring unknown'],
  unverified_recommendations: ['Check pin levels'],
  cited_catalog_ids: ['rp2040'],
  notice: 'AI explanation, not engineering verification.',
  references: [
    {
      catalog_id: 'rp2040',
      name: 'RP2040',
      verification_status: 'partial',
      sources: [
        { url: 'https://www.raspberrypi.com/', title: 'Manufacturer', license: 'Linked only' },
      ],
    },
  ],
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  useProjectsStore.setState({ mentors: {} });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  useGuideStore.setState({
    availability: 'unchecked',
    mode: 'demo',
    busy: false,
    status: '',
    open: false,
    failedRequest: null,
  });
  useWorkspaceStore.setState({
    demoAssistantMessages: [],
    reducedMotion: true,
    selectedComponentId: null,
    activeViewMode: 'assembly',
  });
  useLibraryStore.setState({ detailId: null, compareIds: [] });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('AI gateway client and state', () => {
  it('uses a same-origin request with only bounded project identifiers and user text', async () => {
    fetchMock.mockResolvedValue(json(answer));
    useLibraryStore.setState({ detailId: 'rp2040', compareIds: ['atmega328p'] });
    const context = guideContext();
    await askGuide('Explain this component', context);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/chat',
      expect.objectContaining({ method: 'POST', credentials: 'omit' }),
    );
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.context.catalog_ids).toEqual(['rp2040', 'atmega328p']);
    expect(sent.context.components).toBeUndefined();
    expect(sent.context.source).toBeUndefined();
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
  });
  it('rejects malformed response data and health responses', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ status: 'ok' }))
      .mockResolvedValueOnce(json({ ...answer, references: [null] }));
    await expect(getGuideHealth()).rejects.toBeInstanceOf(GuideError);
    await expect(askGuide('hello', { catalog_ids: [] })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
  it('formats structured rate limits without displaying arbitrary server text', async () => {
    fetchMock.mockResolvedValue(
      json(
        { error: { code: 'UPSTREAM_RATE_LIMIT', message: 'RAW SECRET', request_id: 'r1' } },
        429,
      ),
    );
    useGuideStore.setState({ availability: 'ready', mode: 'ai' });
    const result = await useGuideStore.getState().ask('hello');
    expect(result).toContain('UPSTREAM_RATE_LIMIT');
    expect(result).toContain('r1');
    expect(result).not.toContain('RAW SECRET');
    expect(useGuideStore.getState().busy).toBe(false);
  });
  it('aborts a hanging request and recovers its busy state', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    useGuideStore.setState({ mode: 'ai' });
    const pending = useGuideStore.getState().ask('Explain RAM');
    await vi.advanceTimersByTimeAsync(65000);
    expect(await pending).toContain('TIMEOUT');
    expect(useGuideStore.getState().busy).toBe(false);
  });
  it('never executes AI text or a failed AI request as a local command', async () => {
    const project = useWorkspaceStore.getState().currentProject;
    fetchMock
      .mockResolvedValueOnce(json({ ...answer, answer: 'Show exploded view' }))
      .mockResolvedValueOnce(json({ error: { code: 'AI_NOT_CONFIGURED' } }, 503));
    useGuideStore.setState({ availability: 'ready', mode: 'ai' });
    await useGuideStore.getState().ask('Show exploded view');
    await useGuideStore.getState().ask('Show exploded view');
    expect(useWorkspaceStore.getState().activeViewMode).toBe('assembly');
    expect(useWorkspaceStore.getState().currentProject).toBe(project);
    expect(useGuideStore.getState().mode).toBe('demo');
  });
});

describe('AI Guide interface', () => {
  it('labels no-key fallback and retains working local shortcuts', async () => {
    fetchMock.mockResolvedValue(json({ status: 'ok', ai_configured: false }));
    render(<CommandBar />);
    await screen.findByText('No API key configured · Demo Assistant is local');
    expect(screen.getByLabelText('Ask Demo Assistant')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Show exploded view/ }));
    await waitFor(() => expect(useWorkspaceStore.getState().activeViewMode).toBe('exploded'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('shows offline fallback when the backend cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network failure'));
    render(<CommandBar />);
    await screen.findByText('Backend unavailable · Demo Assistant is local');
    expect(screen.getByLabelText('Ask Demo Assistant')).toBeEnabled();
  });
  it('connects live guide, keeps replies brief and supports explicit demo mode', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ status: 'ok', ai_configured: true }))
      .mockResolvedValueOnce(json(answer));
    render(<CommandBar />);
    const input = await screen.findByLabelText('Ask AI Guide');
    fireEvent.change(input, { target: { value: 'Explain RP2040' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send command' }));
    await screen.findByText(/The RP2040 is a microcontroller/);
    expect(screen.queryByText(/Missing data: Exact wiring unknown/)).not.toBeInTheDocument();
    expect(screen.getByText(/including redacted firmware source/)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Guide mode'), { target: { value: 'demo' } });
    expect(screen.getByLabelText('Ask Demo Assistant')).toBeVisible();
  });
});

it('shows pending submission, blocks duplicate sends and recovers from a FastAPI error', async () => {
  useGuideStore.setState({ availability: 'ready', mode: 'ai', open: false });
  let resolve!: (response: Response) => void;
  fetchMock.mockReturnValue(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  render(<CommandBar />);
  fireEvent.change(screen.getByLabelText('Ask AI Guide'), { target: { value: 'Explain RAM' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send command' }));
  expect(screen.getByLabelText('Ask AI Guide')).toHaveValue('');
  await waitFor(() => expect(screen.getByText('Explain RAM')).toBeVisible());
  await waitFor(() => expect(screen.getByText('Asking AI Guide…')).toBeVisible());
  expect(screen.getByLabelText('Guide mode')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Send command' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Send command' }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  resolve(json({ error: { code: 'UPSTREAM_TIMEOUT', request_id: 'timeout-reference' } }, 504));
  await screen.findByText(/UPSTREAM_TIMEOUT.*timeout-reference/);
  expect(screen.queryByText('Asking AI Guide…')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Guide mode')).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Ask AI Guide'), { target: { value: 'Retry' } });
  expect(screen.getByRole('button', { name: 'Send command' })).toBeEnabled();
});

for (const method of ['click', 'enter'] as const) {
  it(`clears immediately on ${method}, preserves a new draft through failure and retries without duplicate messages`, async () => {
    useGuideStore.setState({ availability: 'ready', mode: 'ai' });
    let finish!: (r: Response) => void;
    fetchMock
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValueOnce(json(answer));
    render(<CommandBar docked />);
    const input = screen.getByLabelText('Ask AI Guide');
    const text = '  Explain RAM:\n  ' + 'long message '.repeat(200);
    fireEvent.change(input, { target: { value: text } });
    if (method === 'click') fireEvent.click(screen.getByRole('button', { name: 'Send command' }));
    else fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue('');
    expect(useWorkspaceStore.getState().demoAssistantMessages.at(-1)?.text).toBe(text);
    expect(useGuideStore.getState().busy).toBe(true);
    fireEvent.submit(input.closest('form')!);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.messages).toEqual([{ role: 'user', content: text }]);
    fireEvent.change(input, { target: { value: 'My next question' } });
    await act(async () => finish(json({ error: { code: 'UPSTREAM_TIMEOUT' } }, 504)));
    expect(input).toHaveValue('My next question');
    expect(screen.getByText(/UPSTREAM_TIMEOUT/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry last message' }));
    await screen.findByText(/The RP2040 is a microcontroller/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      useWorkspaceStore.getState().demoAssistantMessages.filter((m) => m.role === 'user'),
    ).toHaveLength(1);
    expect(input).toHaveValue('My next question');
  });
}
it('renders Markdown, code and diagrams without executing HTML and disables message effects', () => {
  const text =
    '**Power**\n\n```c\nint main(void) { return 0; }\n```\n\n```mermaid\ngraph LR; A-->B\n```\n<script>alert(1)</script>';
  const { container } = render(
    <ChatMessage message={{ id: 9001, role: 'assistant', text }} reducedMotion />,
  );
  expect(screen.getByText('Power').tagName).toBe('STRONG');
  expect(container.querySelector('code.language-c')).toHaveTextContent('int main');
  expect(container.querySelector('code.language-mermaid')).toHaveTextContent('A-->B');
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('article')).toHaveAttribute('data-animate', 'false');
});
it('does not scroll a reader away from older messages on a response', async () => {
  useGuideStore.setState({ availability: 'ready', mode: 'ai' });
  let finish!: (r: Response) => void;
  fetchMock.mockReturnValue(
    new Promise<Response>((resolve) => {
      finish = resolve;
    }),
  );
  const { container } = render(<CommandBar docked />);
  const scroller = container.querySelector('.response-messages')!;
  Object.defineProperties(scroller, {
    scrollHeight: { value: 2000 },
    clientHeight: { value: 300 },
  });
  scroller.scrollTop = 200;
  fireEvent.scroll(scroller);
  fireEvent.change(screen.getByLabelText('Ask AI Guide'), { target: { value: 'Explain RAM' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send command' }));
  await act(async () => finish(json(answer)));
  expect(scroller.scrollTop).toBe(200);
});
it('keeps cleared input and independent drafts when a request finishes after project switching', async () => {
  useGuideStore.setState({ availability: 'ready', mode: 'ai' });
  let finish!: (r: Response) => void;
  fetchMock.mockReturnValue(
    new Promise<Response>((resolve) => {
      finish = resolve;
    }),
  );
  render(<CommandBar docked />);
  fireEvent.change(screen.getByLabelText('Ask AI Guide'), { target: { value: 'Explain RAM' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send command' }));
  const other = createProject('Independent project', 'blank');
  act(() => useWorkspaceStore.getState().activateProject(other));
  fireEvent.change(screen.getByLabelText('Ask AI Guide'), {
    target: { value: 'Independent draft' },
  });
  await act(async () => finish(json(answer)));
  expect(screen.getByLabelText('Ask AI Guide')).toHaveValue('Independent draft');
  expect(screen.queryByText(/The RP2040 is a microcontroller/)).not.toBeInTheDocument();
  expect(useGuideStore.getState().pending).toBeNull();
});

it('never turns an online retry into a local command after configuration failure', async () => {
  useGuideStore.setState({ availability: 'ready', mode: 'ai' });
  fetchMock.mockResolvedValue(json({ error: { code: 'AI_NOT_CONFIGURED' } }, 503));
  await useGuideStore.getState().ask('Show exploded view');
  expect(useGuideStore.getState().mode).toBe('demo');
  await useGuideStore.getState().retry();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(useWorkspaceStore.getState().activeViewMode).toBe('assembly');
  expect(
    useWorkspaceStore.getState().demoAssistantMessages.filter((m) => m.role === 'user'),
  ).toHaveLength(1);
});
