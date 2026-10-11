import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CommandBar } from '../src/components/layout/CommandBar';
import { useGuideStore } from '../src/ai/store';
import { useWorkspaceStore } from '../src/store/useWorkspaceStore';
import { useFirmwareStore, draftFor } from '../src/firmware/store';
import { createProject } from '../src/projects/templates';

afterEach(() => vi.unstubAllGlobals());
it('offers editable firmware preview, cancel and explicit apply through the real guide UI', async () => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  const p = createProject('Review firmware', 'iot');
  useWorkspaceStore.getState().activateProject(p);
  useGuideStore.setState(
    { ...useGuideStore.getInitialState(), availability: 'ready', mode: 'ai' },
    true,
  );
  const response = {
    mode: 'ai',
    request_id: 'mock-firmware',
    answer: 'Firmware ready for review.',
    notice: 'Proposal',
    references: [],
    missing_data: [],
    unverified_recommendations: [],
    cited_catalog_ids: [],
    actions: [
      {
        type: 'generate_firmware',
        component_id: p.components[1].id,
        source: '// Generated preview\nint main(void) {}',
      },
    ],
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => response }));
  render(<CommandBar />);
  const old = draftFor(useFirmwareStore.getState(), p.id).source;
  fireEvent.change(screen.getByLabelText('Ask AI Guide'), {
    target: { value: 'Generate basic firmware for this controller.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send command' }));
  const preview = await screen.findByLabelText('Editable firmware preview');
  expect(useWorkspaceStore.getState().currentProject).toEqual(p);
  fireEvent.change(preview, { target: { value: '// reviewed C' } });
  expect(draftFor(useFirmwareStore.getState(), p.id).source).toBe(old);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(useWorkspaceStore.getState().currentProject).toEqual(p);
  fireEvent.change(screen.getByLabelText('Ask AI Guide'), {
    target: { value: 'Generate basic firmware for this controller.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send command' }));
  await screen.findByLabelText('Editable firmware preview');
  fireEvent.change(screen.getByLabelText('Editable firmware preview'), {
    target: { value: '// approved C' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
  await waitFor(() =>
    expect(draftFor(useFirmwareStore.getState(), p.id).source).toBe('// approved C'),
  );
  act(() => useWorkspaceStore.getState().undo());
  expect(draftFor(useFirmwareStore.getState(), p.id).source).toBe(old);
});
