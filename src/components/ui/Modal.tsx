import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalApi {
  open: (render: (close: () => void) => ReactNode) => void;
  close: () => void;
}
const ModalCtx = createContext<ModalApi | null>(null);

/** Hosts one modal at a time. `useModal().open(close => <Dialog .../>)` from anywhere. */
export function ModalProvider({ children }: { children: ReactNode }) {
  const [render, setRender] = useState<((close: () => void) => ReactNode) | null>(null);
  const close = useCallback(() => setRender(null), []);
  const api = useMemo<ModalApi>(() => ({ open: (r) => setRender(() => r), close }), [close]);
  useEffect(() => {
    if (!render) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [render, close]);
  return (
    <ModalCtx.Provider value={api}>
      {children}
      {render && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 animate-fade bg-canvas/60 backdrop-blur-sm" onClick={close} />
          {render(close)}
        </div>
      )}
    </ModalCtx.Provider>
  );
}

export const useModal = () => {
  const ctx = useContext(ModalCtx);
  if (!ctx) throw new Error('useModal needs ModalProvider');
  return ctx;
};

interface DialogProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  onSubmit?: () => void;
}

/** The modal card. Wrap form content; `onSubmit` makes Enter submit. */
export function Dialog({ title, onClose, children, footer, wide, onSubmit }: DialogProps) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=date]):not([type=checkbox]), textarea, select');
    el?.focus();
  }, []);
  return (
    <form
      ref={ref}
      role="dialog"
      aria-modal="true"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
      className={cn(
        'relative flex max-h-[calc(100vh-2rem)] w-full animate-pop flex-col rounded-xl border border-line bg-surface shadow-pop',
        wide ? 'max-w-[760px]' : 'max-w-[540px]',
      )}
    >
      <header className="flex items-center gap-3 px-5 pt-4 pb-1">
        <h2 className="mr-auto text-[16px] font-semibold">{title}</h2>
        <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
          <X />
        </button>
      </header>
      <div className="flex flex-col gap-4 overflow-y-auto px-5 pt-3 pb-5">{children}</div>
      {footer && (
        <footer className="flex flex-wrap justify-end gap-2 rounded-b-xl border-t border-line bg-surface-2/60 px-5 py-3">{footer}</footer>
      )}
    </form>
  );
}

/** Two-button confirm dialog. */
export function Confirm({
  title, body, confirm, danger, onConfirm, onClose,
}: { title: string; body: ReactNode; confirm: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      onSubmit={() => {
        onConfirm();
        onClose();
      }}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className={cn('btn', danger ? 'btn-danger' : 'btn-dark')}>{confirm}</button>
        </>
      }
    >
      <div className="text-[14px] text-muted">{body}</div>
    </Dialog>
  );
}
