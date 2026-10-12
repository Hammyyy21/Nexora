import { InspectionFindings } from '../../ai/InspectionFindings';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, ChevronDown, LoaderCircle, Sparkles, X } from 'lucide-react';
import { useWorkspaceStore as useStore } from '../../store/useWorkspaceStore';
import { useGuideStore } from '../../ai/store';
import { IconButton } from '../ui/IconButton';
export function CommandBar({
  docked = false,
  active = true,
}: {
  docked?: boolean;
  active?: boolean;
}) {
  const s = useStore();
  const [input, setInput] = useState('');
  const guide = useGuideStore();
  const busy = guide.busy;
  const title = guide.mode === 'ai' ? 'AI Guide' : 'Demo Assistant';
  const { open, setOpen } = guide;
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Keep keyboard focus in the primary navigation when it opens the AI panel.
    // The old role="tab" check alone misses the new button-based navigation.
    const focused = document.activeElement;
    const inNavigation = focused instanceof HTMLElement && focused.closest('.main-navigation');
    if (active && (docked || open) && focused?.getAttribute('role') !== 'tab' && !inNavigation)
      inputRef.current?.focus();
  }, [active, docked, open]);
  useEffect(() => {
    if (useGuideStore.getState().availability === 'unchecked')
      void useGuideStore.getState().check();
  }, []);
  useEffect(() => {
    if (active) messagesEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [s.demoAssistantMessages.length, busy, active]);
  async function submit(text: string, local = false) {
    if (!text.trim() || busy) return;
    const projectId = useStore.getState().currentProject.id;
    s.addMessage('user', text.trim());
    setInput('');
    setOpen(true);
    const reply = await guide.ask(text, { local });
    if (reply && useStore.getState().currentProject.id === projectId)
      useStore.getState().addMessage('assistant', reply);
  }
  return (
    <div className="command-area">
      <AnimatePresence>
        {(docked || open) && (
          <motion.div
            id="assistant-conversation"
            role="region"
            aria-label="Assistant conversation"
            className="assistant-response"
            initial={docked ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: s.reducedMotion ? 0 : 0.2 }}
          >
            <div className="response-heading">
              <span>
                <Sparkles size={14} />
                {title}{' '}
                <small>
                  {guide.mode === 'ai' ? 'PROPOSALS REQUIRE APPROVAL' : 'LOCAL · SCRIPTED COMMANDS'}
                </small>
              </span>
              {!docked && (
                <IconButton label="Close assistant responses" onClick={() => setOpen(false)}>
                  <X size={14} />
                </IconButton>
              )}
            </div>
            <div className="response-messages" aria-live="polite">
              <button className="button" disabled={busy} onClick={()=>void submit("Inspect my entire project.")}>Inspect entire project</button>
              {!s.demoAssistantMessages.length && (
                <p className="assistant">
                  Ask about the selected component or your project. Choose a local shortcut to
                  change the view.
                </p>
              )}
              {s.demoAssistantMessages.map((m) => (
                <p key={m.id} className={m.role}>
                  <strong>{m.role === 'user' ? 'You' : 'Nexora'}</strong>
                  {m.text}
                </p>
              ))}
              {busy && (
                <p className="assistant">
                  <LoaderCircle size={13} className="spin" />
                  {guide.mode === 'ai' ? 'Asking AI Guide…' : 'Applying local command…'}
                </p>
              )}
              <InspectionFindings />
              {guide.pending && guide.pending.projectId === s.currentProject.id && (
                <section className="ai-proposal" aria-label="AI design proposal">
                  <strong>Proposed design changes · Review before applying</strong>
                  <ul>
                    {guide.pending.summary.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                  {guide.pending.actions.some(a=>['configure_board','update_component','duplicate_component'].includes(a.type)) && <details><summary>Review PCB operation data</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(guide.pending.actions,null,2)}</pre></details>}
                  {guide.pending.actions
                    .filter((a) => a.type === 'generate_firmware')
                    .map(
                      (action, index) =>
                        action.type === 'generate_firmware' && (
                          <label key={index}>
                            Editable firmware preview
                            <textarea
                              aria-label="Editable firmware preview"
                              rows={12}
                              style={{ width: '100%', fontFamily: 'monospace' }}
                              value={action.source}
                              onChange={(e) => guide.editPendingSource(e.target.value)}
                            />
                          </label>
                        ),
                    )}
                  <p>
                    Review proposed changes. Electrical safety and generated firmware are not
                    certified.
                  </p>
                  <div>
                    <button className="button primary" disabled={busy} onClick={guide.approve}>
                      Apply changes
                    </button>
                    <button className="button" onClick={guide.cancel}>
                      Cancel
                    </button>
                  </div>
                </section>
              )}
              <div ref={messagesEnd} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!docked && (
        <div className="command-caption">
          <span>
            <Sparkles size={13} />A little guidance. A lot of possibility.
          </span>
          <button
            aria-expanded={open}
            aria-controls="assistant-conversation"
            onClick={() => setOpen(!open)}
          >
            {title}
            <ChevronDown size={12} />
          </button>
        </div>
      )}
      <div className="guide-controls">
        <label>
          Guide mode{' '}
          <select
            aria-label="Guide mode"
            value={guide.mode}
            disabled={busy}
            onChange={(e) => guide.setMode(e.target.value as 'ai' | 'demo')}
          >
            <option value="demo">Demo Assistant · local</option>
            <option value="ai" disabled={guide.availability !== 'ready'}>
              AI Guide · online
            </option>
          </select>
        </label>
        <label>
          Response length{' '}
          <select
            aria-label="AI response length"
            value={guide.responseLength}
            onChange={(e) =>
              guide.setResponseLength(e.target.value as 'auto' | 'concise' | 'detailed')
            }
          >
            <option value="auto">Auto</option>
            <option value="concise">Concise</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
        <span role="status">{guide.status}</span>
        <button
          type="button"
          disabled={busy || guide.availability === 'checking'}
          onClick={() => void guide.check()}
        >
          Check AI connection
        </button>
      </div>
      {guide.mode === 'ai' && (
        <p className="guide-disclosure">
          Sends this question, component names/IDs and positions to OpenAI. Firmware source is not
          sent. Proposed edits need your approval.
        </p>
      )}
      <form
        className="command-input"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <Sparkles size={19} />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            guide.mode === 'ai'
              ? 'Ask AI to add, move, remove or explain hardware…'
              : 'Enter a local command or ask about a catalog component…'
          }
          aria-label={`Ask ${title}`}
          maxLength={4000}
        />
        <span className="local-badge">{guide.mode === 'ai' ? 'AI' : 'DEMO'}</span>
        <button type="submit" aria-label="Send command" disabled={busy || !input.trim()}>
          {busy ? <LoaderCircle size={17} className="spin" /> : <ArrowUp size={18} />}
        </button>
      </form>
      <div className="suggestions">
        <span>LOCAL SHORTCUTS</span>
        {['Show exploded view', 'Focus on the microcontroller', 'Open firmware'].map((text) => (
          <button key={text} disabled={busy} onClick={() => void submit(text, true)}>
            {text}
            <span>↗</span>
          </button>
        ))}
      </div>
    </div>
  );
}
