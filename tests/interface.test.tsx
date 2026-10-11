import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useWorkspaceStore as store } from '../src/store/useWorkspaceStore';
import { useDesignLayout as layout } from '../src/workspace/layout';
import App from '../src/app/App';
vi.mock('../src/three/HardwareScene', () => ({
  HardwareScene: () => <div aria-label="Mock 3D viewport" />,
}));
beforeEach(() => {
  store.setState(store.getInitialState(), true);
  localStorage.clear();
  layout.setState(layout.getInitialState(), true);
});
describe('workspace interface', () => {
  it('renders the app, grouped component tree, and honest demo labels', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Smart Cooling Controller' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Component explorer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Microcontroller U1/ })).toBeInTheDocument();
    expect(screen.getByText('Demo Assistant')).toBeInTheDocument();
    expect(screen.getByText(/not electrically verified/)).toBeInTheDocument();
  });
  it('synchronizes tree selection, inspector fields, and visibility', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Microcontroller U1/ }));
    await user.click(within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name: 'Inspector' }));
    const inspector = screen.getByRole('complementary', { name: 'Component inspector' });
    expect(
      await within(inspector).findByRole('heading', { name: 'Microcontroller' }),
    ).toBeInTheDocument();
    await user.click(screen.getByText('Advanced · Transform & appearance'));
    await user.click(screen.getByRole('checkbox', { name: 'Component visibility' }));
    expect(store.getState().currentProject.components.find((c) => c.id === 'mcu')?.visible).toBe(
      false,
    );
    expect(
      screen.getByRole('button', { name: 'Show Microcontroller', hidden: true }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo (⌘/Ctrl Z)' }));
    expect(screen.getByRole('checkbox', { name: 'Component visibility' })).toBeChecked();
  });
  it('filters the explorer and collapses groups', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole('textbox', { name: 'Find a component' }), 'temperature');
    expect(screen.getByRole('button', { name: /Temperature Sensor U3/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Microcontroller U1/ })).not.toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'Find a component' }));
    await user.click(screen.getByRole('button', { name: 'Passive components 5' }));
    expect(screen.queryByRole('button', { name: /Resistor R1 R1/ })).not.toBeInTheDocument();
  });
  it('switches modes and handles supported and unsupported assistant commands', async () => {
    const user = userEvent.setup();
    store.setState({ reducedMotion: true });
    render(<App />);
    await user.click(within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name: 'Workspace' }));
    await user.click(screen.getByRole('button', { name: 'Exploded' }));
    await user.click(within(screen.getByRole('navigation', { name: 'Main workspace navigation' })).getByRole('button', { name: 'AI Guide' }));
    expect(store.getState().activeViewMode).toBe('exploded');
    await user.type(
      screen.getByRole('textbox', { name: 'Ask Demo Assistant' }),
      'Focus on the microcontroller',
    );
    await user.click(screen.getByRole('button', { name: 'Send command' }));
    expect(await screen.findByText(/Microcontroller selected and focused/)).toBeInTheDocument();
    await user.type(
      screen.getByRole('textbox', { name: 'Ask Demo Assistant' }),
      'Generate a circuit',
    );
    await user.click(screen.getByRole('button', { name: 'Send command' }));
    expect(await screen.findByText(/future AI integration/)).toBeInTheDocument();
  });
});
