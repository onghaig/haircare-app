/**
 * In-memory stand-in for expo-file-system's File and Directory classes. Use it as:
 *   jest.mock('expo-file-system', () => require('../../test-utils/fsMock').createFsMock());
 * then read `__files` from jest.requireMock('expo-file-system') to inspect what was written.
 */
export function createFsMock() {
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
    textSync() {
      return files.get(this.uri) ?? '';
    }
    /** Async, like SDK 58's File.write: a caller that doesn't await it reads stale data. */
    async write(s: string) {
      await new Promise((r) => setTimeout(r, 0));
      files.set(this.uri, s);
    }
    async copy(dest: File) {
      files.set(dest.uri, files.get(this.uri) ?? '');
    }
    moveSync(dest: File) {
      files.set(dest.uri, files.get(this.uri) ?? '');
      files.delete(this.uri);
      this.uri = dest.uri;
    }
  }
  return { File, Directory, Paths: { document: new Directory('file:///doc') }, __files: files };
}
