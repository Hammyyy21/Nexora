import type { ButtonHTMLAttributes, ReactNode } from 'react';
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  children: ReactNode;
}
export function IconButton({ label, active, children, className = '', ...props }: Props) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? 'active' : ''} ${className}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      {...props}
    >
      {children}
    </button>
  );
}
