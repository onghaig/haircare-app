import { Directory, File, Paths } from 'expo-file-system';

import type { ScanRecord } from './session';
import { isUpload } from './upload';

/** Where scans live. On device: the app's private documents folder, never synced by default. */
export interface ScanStore {
  list(): Promise<ScanRecord[]>;
  /** Moves each view's temporary photo into permanent storage and saves the record. */
  save(record: ScanRecord): Promise<ScanRecord>;
  remove(id: string): Promise<void>;
}

/** Oldest first. */
function sortByDate(r: ScanRecord[]): ScanRecord[] {
  return [...r].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

/** The first guided scan good enough for trends. Everything is compared with it. Library photos never are. */
export function baselineOf(records: ScanRecord[]): ScanRecord | undefined {
  return sortByDate(records).find((r) => !r.lowConfidence && !isUpload(r));
}

/** The latest guided scan. Library photos are history, so they don't reset the weekly scan. */
export function latestOf(records: ScanRecord[]): ScanRecord | undefined {
  return sortByDate(records.filter((r) => !isUpload(r))).at(-1);
}

/** Days until the next weekly scan is due (0 = today or overdue). */
export function daysUntilNextScan(records: ScanRecord[], now: Date): number {
  const last = latestOf(records);
  if (!last) return 0;
  const due = new Date(last.takenAt).getTime() + 7 * 86_400_000;
  return Math.max(0, Math.ceil((due - now.getTime()) / 86_400_000));
}

export class MemoryScanStore implements ScanStore {
  private records: ScanRecord[] = [];
  constructor(seed: ScanRecord[] = []) {
    this.records = sortByDate(seed);
  }
  async list() {
    return [...this.records];
  }
  async save(record: ScanRecord) {
    this.records = sortByDate([...this.records.filter((r) => r.id !== record.id), record]);
    return record;
  }
  async remove(id: string) {
    this.records = this.records.filter((r) => r.id !== id);
  }
}

export class FileScanStore implements ScanStore {
  private readonly root: Directory;
  private readonly index: File;

  constructor(root: Directory = new Directory(Paths.document, 'scans')) {
    this.root = root;
    this.index = new File(root, 'index.json');
  }

  private ensure() {
    if (!this.root.exists) this.root.create({ intermediates: true });
  }

  async list(): Promise<ScanRecord[]> {
    if (!this.index.exists) return [];
    try {
      // Read synchronously: a small file, and one less native round trip that a busy finish
      // screen can wait on.
      return sortByDate(JSON.parse(this.index.textSync()) as ScanRecord[]);
    } catch {
      return [];
    }
  }

  async save(record: ScanRecord): Promise<ScanRecord> {
    this.ensure();
    const dir = new Directory(this.root, record.id);
    if (!dir.exists) dir.create();
    const views: ScanRecord['views'] = {};
    for (const [view, v] of Object.entries(record.views)) {
      if (!v) continue;
      const src = new File(v.uri);
      const ext = v.uri.split('.').pop() ?? 'jpg';
      const dest = new File(dir, `${view}.${ext}`);
      if (src.exists && src.uri !== dest.uri) src.moveSync(dest);
      views[view as keyof ScanRecord['views']] = { ...v, uri: dest.uri };
    }
    // The panorama's frames move in with the photos (a redo carries the old scan's over).
    const panorama = record.panorama?.map((f) => {
      const src = new File(f.uri);
      const dest = new File(dir, `pano-${f.cell}.jpg`);
      if (src.exists && src.uri !== dest.uri) src.moveSync(dest);
      return { ...f, uri: dest.uri };
    });
    const saved = { ...record, views, ...(panorama ? { panorama } : {}) };
    const all = (await this.list()).filter((r) => r.id !== record.id);
    // Synchronous on purpose: the async write sometimes never settled on the simulator right
    // after a capture, leaving the finish screen on "Saving your scan".
    this.index.writeSync(JSON.stringify(sortByDate([...all, saved])));
    return saved;
  }

  async remove(id: string): Promise<void> {
    const dir = new Directory(this.root, id);
    if (dir.exists) dir.delete();
    const all = (await this.list()).filter((r) => r.id !== id);
    if (this.root.exists) this.index.writeSync(JSON.stringify(all));
  }
}
