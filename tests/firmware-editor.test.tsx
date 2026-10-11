import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CodeEditor } from '../src/firmware/CodeEditor';
vi.mock('../src/firmware/monaco', () => {
  throw new Error('Editor chunk unavailable');
});
describe('editor initialization recovery', () => {
  it('offers editable plain source and retry when Monaco cannot initialize', async () => {
    const change = vi.fn();
    render(<CodeEditor value="int sample;" language="c" readonly={false} onChange={change} />);
    const fallback = await screen.findByRole('textbox', { name: 'C source fallback editor' });
    expect(screen.getByRole('alert')).toHaveTextContent('Advanced editor unavailable');
    fireEvent.change(fallback, { target: { value: 'int recovered;' } });
    expect(change).toHaveBeenCalledWith('int recovered;');
    expect(screen.getByRole('button', { name: 'Retry editor' })).toBeInTheDocument();
  });
  it('keeps compiler output read only even in the fallback', async () => {
    render(<CodeEditor value="bx lr" language="assembly" readonly />);
    expect(
      await screen.findByRole('textbox', { name: 'Assembly fallback viewer' }),
    ).toHaveAttribute('readonly');
  });
});
