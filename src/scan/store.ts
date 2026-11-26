import { Directory, File, Paths } from 'expo-file-system';

import type { ScanRecord } from './session';

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

/** The first scan good enough for trends. Everything is compared with it. */
export function baselineOf(records: ScanRecord[]): ScanRecord | undefined {
  return sortByDate(records).find((r) => !r.lowConfidence);
}

export function latestOf(records: ScanRecord[]): ScanRecord | undefined {
  return sortByDate(records).at(-1);
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
      return sortByDate(JSON.parse(await this.index.text()) as ScanRecord[]);
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
    const saved = { ...record, views };
    const all = (await this.list()).filter((r) => r.id !== record.id);
    await this.index.write(JSON.stringify(sortByDate([...all, saved])));
    return saved;
  }

  async remove(id: string): Promise<void> {
    const dir = new Directory(this.root, id);
    if (dir.exists) dir.delete();
    const all = (await this.list()).filter((r) => r.id !== id);
    if (this.root.exists) await this.index.write(JSON.stringify(all));
  }
}
