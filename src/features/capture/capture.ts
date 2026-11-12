import { useSyncExternalStore } from 'react';
import { toast } from '@/lib/toast';
import type { ShotContext } from './paths';
import { screenshotStorage } from './storage';

/**
 * Screen capture for the timer.
 *
 * The browser asks the user which screen to share (and macOS asks once to allow Screen Recording
 * for the browser). While sharing, a frame is saved every N minutes. Nothing is captured without
 * that prompt, the browser shows its own "sharing" indicator, and the user can stop any time.
 *
 * The MediaStream can't live in Redux, so this is a small module-level store.
 */

export interface CaptureState {
  active: boolean;
  shots: number;
  lastAt: number | null;
  lastPath: string | null;
  error: string | null;
}

let state: CaptureState = { active: false, shots: 0, lastAt: null, lastPath: null, error: null };
const listeners = new Set<() => void>();
const emit = (p: Partial<CaptureState>) => {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
};

let stream: MediaStream | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let video: HTMLVideoElement | null = null;
let getContext: (() => ShotContext | null) | null = null;
let busy = false;

export const isCaptureSupported = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

/** Grabs one frame as a JPEG, at most 1920 px wide. */
async function frame(): Promise<Blob> {
  const track = stream?.getVideoTracks()[0];
  if (!track) throw new Error('Screen sharing has stopped.');
  let source: CanvasImageSource;
  let w: number;
  let h: number;
  if (typeof ImageCapture !== 'undefined') {
    const bmp = await new ImageCapture(track).grabFrame();
    source = bmp;
    w = bmp.width;
    h = bmp.height;
  } else {
    if (!video) throw new Error('Screen sharing has stopped.');
    source = video;
    w = video.videoWidth;
    h = video.videoHeight;
  }
  const scale = Math.min(1, 1920 / (w || 1920));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source && typeof source.close === 'function') source.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode screenshot.'))), 'image/jpeg', 0.78));
}

/** Takes and saves one screenshot now. */
export async function shoot() {
  const ctx = getContext?.();
  if (!stream || !ctx || busy) return;
  busy = true;
  try {
    const at = new Date();
    const path = await screenshotStorage.save(ctx, at, await frame());
    emit({ shots: state.shots + 1, lastAt: at.getTime(), lastPath: path, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    emit({ error: msg });
    toast.error(`Screenshot not saved: ${msg}`);
  } finally {
    busy = false;
  }
}

/**
 * Asks to share the screen and starts the schedule. Call it straight from a click,
 * before any other await, or the browser blocks the prompt.
 */
export async function startCapture(everyMinutes: number, context: () => ShotContext | null): Promise<boolean> {
  if (!isCaptureSupported()) {
    toast.error('This browser can’t share the screen.');
    return false;
  }
  stopCapture(false);
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: false });
  } catch (e) {
    const denied = e instanceof DOMException && e.name === 'NotAllowedError';
    toast.error(
      denied
        ? 'Screen sharing was not allowed. On a Mac, check System Settings → Privacy & Security → Screen Recording.'
        : 'Couldn’t start screen sharing.',
    );
    emit({ active: false, error: denied ? 'Permission denied' : 'Could not start' });
    return false;
  }
  getContext = context;
  const track = stream.getVideoTracks()[0];
  track?.addEventListener('ended', () => {
    if (state.active) toast('Screen sharing stopped. Screenshots are paused.');
    stopCapture(false);
  });
  if (typeof ImageCapture === 'undefined') {
    video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play().catch(() => undefined);
  }
  emit({ active: true, shots: 0, lastAt: null, lastPath: null, error: null });
  // First shot once the stream has a frame, then on schedule.
  setTimeout(() => void shoot(), 1500);
  timer = setInterval(() => void shoot(), Math.max(1, everyMinutes) * 60_000);
  return true;
}

export function stopCapture(resetCount = true) {
  clearInterval(timer);
  timer = undefined;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (video) video.srcObject = null;
  video = null;
  getContext = null;
  emit({ active: false, ...(resetCount ? { shots: 0, lastAt: null } : {}) });
}

export function useCapture() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}
