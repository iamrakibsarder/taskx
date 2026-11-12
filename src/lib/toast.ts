export type ToastTone = 'default' | 'error';
export interface ToastMsg {
  id: number;
  text: string;
  tone: ToastTone;
}

type Listener = (t: ToastMsg) => void;
const listeners = new Set<Listener>();
let n = 0;

/** Shows a short message at the bottom of the screen. Works from anywhere, not only components. */
export function toast(text: string, tone: ToastTone = 'default') {
  const msg = { id: ++n, text, tone };
  listeners.forEach((l) => l(msg));
}
toast.error = (text: string) => toast(text, 'error');

export function onToast(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
