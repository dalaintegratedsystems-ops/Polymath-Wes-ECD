'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChildrenScreen, type ChildRow } from '@wes/ui';
import { nextRenderLink } from '@/lib/render-link';
import type { WesOfflineDb } from '@/lib/offline/db';

type SyncState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'waiting'; count: number }
  | { kind: 'conflict'; count: number };

interface Props {
  centreId: string;
  day: string;
  childrenList: ChildRow[];
  groups: string[];
  todayIso: string;
  canAdd: boolean;
  canMark: boolean;
  exportHref: string | null;
}

let dbPromise: Promise<WesOfflineDb> | null = null;
/** Dexie loads only when the register is used, keeping it off the first paint. */
function offlineDb() {
  dbPromise ??= import('@/lib/offline/db').then((m) => new m.WesOfflineDb());
  return dbPromise;
}

type Marks = Record<string, { present: boolean; at: string }>;

/**
 * The register, offline-first: every tap is saved on the phone (a draft for this day plus a
 * queued write with a fixed idempotency key), then synced through /api/sync when there is
 * signal. If someone else changed a child more recently, their mark is kept and shown here.
 */
export function RegisterView(props: Props) {
  const { centreId, day } = props;
  const draftKey = `register:${centreId}:${day}`;
  const [rows, setRows] = useState(props.childrenList);
  const [version, setVersion] = useState(0);
  const [sync, setSync] = useState<SyncState>({ kind: 'idle' });
  const flushing = useRef(false);

  const flushNow = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      const db = await offlineDb();
      const { flush } = await import('@/lib/offline/outbox');
      let conflicts = 0;
      const result = await flush(db, async (item) => {
        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(item),
        });
        const out = (await res.json()) as {
          status: number;
          body?: { conflicts?: { childId: string; kept: string }[] };
        };
        if (out.status === 503) throw new Error('offline');
        const lost = out.body?.conflicts ?? [];
        if (lost.length) {
          conflicts += lost.length;
          // Show the newer mark someone else made, and remember it locally.
          setRows((r) =>
            r.map((c) => {
              const hit = lost.find((l) => l.childId === c.id);
              return hit ? { ...c, present: hit.kept === 'present' } : c;
            }),
          );
          setVersion((v) => v + 1);
        }
        return { status: out.status, body: out.body };
      });
      if (conflicts > 0) setSync({ kind: 'conflict', count: conflicts });
      else if (result.remaining > 0) setSync({ kind: 'waiting', count: result.remaining });
      else setSync({ kind: 'saved' });
    } catch {
      const db = await offlineDb();
      setSync({ kind: 'waiting', count: await db.outbox.count() });
    } finally {
      flushing.current = false;
    }
  }, []);

  // On load: put back marks made on this phone that the server has not seen yet.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const db = await offlineDb();
      const draft = (await db.drafts.get(draftKey))?.value as Marks | undefined;
      if (draft && alive) {
        setRows((r) => r.map((c) => (draft[c.id] ? { ...c, present: draft[c.id]!.present } : c)));
        setVersion((v) => v + 1);
      }
      if ((await db.outbox.count()) > 0) void flushNow();
    })();
    const online = () => void flushNow();
    window.addEventListener('online', online);
    return () => {
      alive = false;
      window.removeEventListener('online', online);
    };
  }, [draftKey, flushNow]);

  const onToggle = useCallback(
    (childId: string, present: boolean) => {
      setSync({ kind: 'saving' });
      setRows((r) => r.map((c) => (c.id === childId ? { ...c, present } : c)));
      void (async () => {
        const at = new Date().toISOString();
        const db = await offlineDb();
        const { enqueue } = await import('@/lib/offline/outbox');
        const draft = ((await db.drafts.get(draftKey))?.value as Marks | undefined) ?? {};
        draft[childId] = { present, at };
        await db.drafts.put({ key: draftKey, value: draft, updatedAt: Date.now() });
        await enqueue(db, {
          method: 'POST',
          path: `/v1/centres/${centreId}/attendance`,
          body: {
            day,
            marks: [{ childId, status: present ? 'present' : 'absent', clientUpdatedAt: at }],
          },
        });
        await flushNow();
      })();
    },
    [centreId, day, draftKey, flushNow],
  );

  const note =
    sync.kind === 'saving' ? (
      <span className="text-ink-muted">Saving…</span>
    ) : sync.kind === 'saved' ? (
      <span role="status" className="font-bold text-success">
        Saved
      </span>
    ) : sync.kind === 'waiting' ? (
      <span role="status" className="font-bold text-ink">
        Saved on this phone. {sync.count === 1 ? '1 change' : `${sync.count} changes`} will sync
        when you have signal.
      </span>
    ) : sync.kind === 'conflict' ? (
      <span role="status" className="font-bold text-accent">
        {sync.count === 1 ? '1 child was' : `${sync.count} children were`} marked more recently on
        another phone. The newer marks are shown.
      </span>
    ) : null;

  return (
    <ChildrenScreen
      key={version}
      childrenList={rows}
      groups={props.groups}
      today={new Date(props.todayIso)}
      attendance={props.canMark}
      canAdd={props.canAdd}
      renderLink={nextRenderLink}
      onToggle={onToggle}
      registerNote={note}
      exportHref={props.exportHref}
    />
  );
}
