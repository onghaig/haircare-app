import { baselineOf, daysUntilNextScan, FileScanStore, latestOf, MemoryScanStore } from '@/scan/store';

import { record } from '../../test-utils/scanFixtures';

// In-memory stand-in for expo-file-system's File and Directory classes.
jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const join = (parts: unknown[]) => {
    const raw = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
    const [proto, rest] = raw.split('://');
    return `${proto}://${rest.replace(/\/+/g, '/')}`;
  };
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return dirs.has(this.uri);
    }
    create() {
      dirs.add(this.uri);
    }
    delete() {
      dirs.delete(this.uri);
      for (const k of [...files.keys()]) if (k.startsWith(this.uri + '/')) files.delete(k);
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return files.has(this.uri);
    }
    async text() {
      return files.get(this.uri) ?? '';
    }
    // Async, like SDK 58's File.write: a caller that doesn't await it reads stale data.
    async write(s: string) {
      await new Promise((r) => setTimeout(r, 0));
      files.set(this.uri, s);
    }
    moveSync(dest: File) {
      files.set(dest.uri, files.get(this.uri) ?? '');
      files.delete(this.uri);
      this.uri = dest.uri;
    }
  }
  return { File, Directory, Paths: { document: new Directory('file:///doc') }, __files: files };
});

describe('scan history helpers', () => {
  const a = record('a', '2026-10-01T10:00:00Z', { lowConfidence: true, quality: 40 });
  const b = record('b', '2026-10-08T10:00:00Z');
  const c = record('c', '2026-10-15T10:00:00Z');

  it('uses the first good scan as the baseline', () => {
    expect(baselineOf([c, a, b])?.id).toBe('b');
    expect(baselineOf([a])).toBeUndefined();
  });

  it('finds the latest scan', () => {
    expect(latestOf([b, c, a])?.id).toBe('c');
  });

  it('counts days until the next weekly scan', () => {
    expect(daysUntilNextScan([], new Date())).toBe(0);
    expect(daysUntilNextScan([c], new Date('2026-10-17T10:00:00Z'))).toBe(5);
    expect(daysUntilNextScan([c], new Date('2026-10-30T10:00:00Z'))).toBe(0);
  });
});

describe('MemoryScanStore', () => {
  it('saves, lists oldest first, replaces by id and removes', async () => {
    const s = new MemoryScanStore();
    await s.save(record('2', '2026-10-08T10:00:00Z'));
    await s.save(record('1', '2026-10-01T10:00:00Z'));
    await s.save(record('2', '2026-10-08T10:00:00Z', { quality: 70 }));
    expect((await s.list()).map((r) => [r.id, r.quality])).toEqual([['1', 95], ['2', 70]]);
    await s.remove('1');
    expect((await s.list()).map((r) => r.id)).toEqual(['2']);
  });
});

describe('FileScanStore', () => {
  it('moves photos into the scan folder and persists the index', async () => {
    const fs = jest.requireMock('expo-file-system') as { __files: Map<string, string> };
    fs.__files.set('file:///tmp/front.heic', 'jpegdata');
    const store = new FileScanStore();
    const saved = await store.save(record('s1', '2026-11-01T10:00:00Z', { views: { front: { uri: 'file:///tmp/front.heic', score: 90 } } }));
    expect(saved.views.front?.uri).toBe('file:///doc/scans/s1/front.heic');
    expect(fs.__files.has('file:///tmp/front.heic')).toBe(false);
    expect(fs.__files.get('file:///doc/scans/s1/front.heic')).toBe('jpegdata');

    const again = new FileScanStore();
    expect((await again.list()).map((r) => r.id)).toEqual(['s1']);
    await again.remove('s1');
    expect(await again.list()).toEqual([]);
    expect(fs.__files.has('file:///doc/scans/s1/front.heic')).toBe(false);
  });

  it('survives a corrupt index', async () => {
    const fs = jest.requireMock('expo-file-system') as { __files: Map<string, string> };
    fs.__files.set('file:///doc/scans/index.json', '{not json');
    expect(await new FileScanStore().list()).toEqual([]);
  });
});
