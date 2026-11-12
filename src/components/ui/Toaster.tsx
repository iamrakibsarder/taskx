import { useEffect, useState } from 'react';
import { onToast, toast, type ToastMsg } from '@/lib/toast';
import { cn } from '@/lib/utils';

export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const off = onToast((t) => {
      setItems((xs) => [...xs.slice(-2), t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 3000);
    });
    const onSync = (e: Event) => toast.error(`Not saved: ${(e as CustomEvent).detail}`);
    window.addEventListener('taskx:sync-error', onSync);
    return () => {
      off();
      window.removeEventListener('taskx:sync-error', onSync);
    };
  }, []);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 z-[70] flex w-[min(440px,calc(100%-2rem))] -translate-x-1/2 flex-col items-center gap-2 max-md:bottom-24"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={cn('animate-pop rounded-lg px-4 py-2.5 text-[13.5px] text-white shadow-pop', t.tone === 'error' ? 'bg-[#e5484d]' : 'bg-night')}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
