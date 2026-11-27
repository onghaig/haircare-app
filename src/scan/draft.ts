import type { CaptureResult, ScanView } from '@modules/headmap';
import { Directory, File, Paths } from 'expo-file-system';

import { SCAN_ORDER, type HairState } from './session';

/**
 * A scan left part-way. Its photos are kept for a day so the person can pick up at the next
 * view instead of starting again. Nothing in a draft counts toward trends until it is finished.
 */
export interface ScanDraft {
  startedAt: string;
  hairState: HairState;
  captures: Partial<Record<ScanView, CaptureResult>>;
  /** The scan this one replaces once it is saved (a redo). */
  replaces?: string;
}

/** Drafts older than this are dropped, photos and all. */
export const DRAFT_TTL_MS = 24 * 3_600_000;

export function isDraftFresh(d: ScanDraft | null, now: Date): d is ScanDraft {
  return !!d && now.getTime() - new Date(d.startedAt).getTime() < DRAFT_TTL_MS && draftCount(d) > 0;
}

export function draftCount(d: ScanDraft): number {
  return SCAN_ORDER.filter((v) => d.captures[v]).length;
}

/** Views still to take, in order. */
export function draftRemaining(d: ScanDraft): ScanView[] {
  return SCAN_ORDER.filter((v) => !d.captures[v]);
}

export interface DraftStore {
  load(): Promise<ScanDraft | null>;
  save(d: ScanDraft): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryDraftStore implements DraftStore {
  constructor(private draft: ScanDraft | null = null) {}
  async load() {
    return this.draft;
  }
  async save(d: ScanDraft) {
    this.draft = d;
  }
  async clear() {
    this.draft = null;
  }
}

/** One draft at a time, in the app's private documents folder next to the scans. */
export class FileDraftStore implements DraftStore {
  private readonly dir: Directory;
  private readonly file: File;

  constructor(root: Directory = new Directory(Paths.document, 'scans')) {
    this.dir = new Directory(root, 'draft');
    this.file = new File(this.dir, 'draft.json');
  }

  async load(): Promise<ScanDraft | null> {
    if (!this.file.exists) return null;
    try {
      // Synchronous, like the other stores: async reads and writes sometimes never settle on iOS.
      return JSON.parse(this.file.textSync()) as ScanDraft;
    } catch {
      return null;
    }
  }

  async save(d: ScanDraft): Promise<void> {
    if (!this.dir.exists) this.dir.create({ intermediates: true });
    // Move each photo out of the camera's temporary folder so it survives until the draft expires.
    const captures: ScanDraft['captures'] = {};
    for (const [view, c] of Object.entries(d.captures)) {
      if (!c) continue;
      const src = new File(c.uri);
      const ext = c.uri.split('.').pop() ?? 'jpg';
      const dest = new File(this.dir, `${view}.${ext}`);
      if (src.exists && src.uri !== dest.uri) {
        if (dest.exists) dest.delete();
        src.moveSync(dest);
      }
      captures[view as ScanView] = { ...c, uri: dest.uri };
    }
    this.file.writeSync(JSON.stringify({ ...d, captures }));
  }

  async clear(): Promise<void> {
    if (this.dir.exists) this.dir.delete();
  }
}
