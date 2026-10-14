import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AssistantMessage } from '../types/workspace';
import './chat.css';

/** The gateway returns validated JSON. Reveal completed replies, never partial action JSON. */
export function ChatMessage({
  message,
  reducedMotion,
  animate = true,
}: {
  message: AssistantMessage;
  reducedMotion: boolean;
  animate?: boolean;
}) {
  return (
    <article className={`chat-message ${message.role}`} data-animate={animate && !reducedMotion}>
      <strong>{message.role === 'user' ? 'You' : 'Nexora'}</strong>
      {message.role === 'user' ? (
        <div className="chat-user-text">{message.text}</div>
      ) : (
        <div className="chat-markdown">
          <Markdown
            remarkPlugins={[remarkGfm]}
            skipHtml
            components={{ img: ({ alt }) => <span>{alt}</span> }}
          >
            {message.text}
          </Markdown>
        </div>
      )}
    </article>
  );
}
