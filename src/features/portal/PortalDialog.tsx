import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import type { Client } from '@/types/domain';
import { Dialog } from '@/components/ui/Modal';
import { can, useAccount } from '@/data/session';
import { portalApi, type PortalLink } from '@/data/portalApi';
import { longDate } from '@/lib/format';
import { toast } from '@/lib/toast';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Turn a client's private invoice page on or off, copy its link, or replace the link. */
export function PortalDialog({ client, onClose }: { client: Client; onClose: () => void }) {
  const admin = can(useAccount(), 'admin');
  const [link, setLink] = useState<PortalLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    portalApi.link(client.id).then(setLink).catch((e: unknown) => (toast.error(message(e)), onClose()));
    // Load once per client; onClose doesn't change what's shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  const run = async (p: Promise<PortalLink>, ok: string) => {
    setBusy(true);
    try {
      setLink(await p);
      setCopied(false);
      toast(ok);
    } catch (e) {
      toast.error(message(e));
    }
    setBusy(false);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link!.url!);
      setCopied(true);
    } catch {
      toast.error('Couldn’t copy. Select the link and copy it.');
    }
  };

  return (
    <Dialog
      title={`Client portal · ${client.name}`}
      onClose={onClose}
      footer={
        link && admin ? (
          link.enabled ? (
            <>
              <button type="button" className="btn btn-danger mr-auto" disabled={busy} onClick={() => void run(portalApi.disable(client.id), 'Portal turned off')}>
                Turn off
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void run(portalApi.enable(client.id, true), 'New link made. The old one no longer works.')}>
                <RefreshCw /> New link
              </button>
              <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
            </>
          ) : (
            <>
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(portalApi.enable(client.id), 'Portal turned on')}>
                {busy && <LoaderCircle className="animate-spin" />} Turn on
              </button>
            </>
          )
        ) : (
          <button type="button" className="btn" onClick={onClose}>Close</button>
        )
      }
    >
      <p className="text-[13.5px] text-muted">
        A private page where {client.contact || client.name} can see every invoice you’ve sent them, what’s paid and what’s due, and download the PDFs. No account needed.
      </p>
      {!link ? (
        <div className="grid place-items-center py-6 text-faint"><LoaderCircle className="size-5 animate-spin" /></div>
      ) : link.enabled && link.url ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input className="input num flex-1 text-[12px]" readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label="Portal link" />
            <button type="button" className="btn" onClick={() => void copy()}>{copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}</button>
            <a className="btn w-9 px-0" href={link.url} target="_blank" rel="noreferrer" aria-label="Open portal"><ExternalLink /></a>
          </div>
          <p className="text-[12.5px] text-faint">
            Invoice emails and reminders to this client include the link.
            {link.lastViewedAt ? ` Last opened ${longDate(link.lastViewedAt.slice(0, 10))}.` : ' Not opened yet.'}
          </p>
        </div>
      ) : (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-muted">
          {admin ? 'Off. Turn it on to get a link to share.' : 'Off. An owner or admin can turn it on.'}
        </p>
      )}
    </Dialog>
  );
}
