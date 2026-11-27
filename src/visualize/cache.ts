import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Finished previews live only on this phone, one file per preview key. */
export interface PreviewStore {
  get(key: string): string | null;
  put(key: string, imageBase64: string, mimeType: string): Promise<string>;
  /** Previews made from one scan's photo (when that scan is deleted). */
  removeForScan(scanId: string): void;
  removeAll(): void;
}

export class FilePreviewStore implements PreviewStore {
  constructor(private readonly root: Directory = new Directory(Paths.document, 'ai-previews')) {}

  private file(key: string, ext: string) {
    return new File(this.root, `${key}.${ext}`);
  }

  get(key: string): string | null {
    for (const ext of ['png', 'jpg', 'webp']) {
      const f = this.file(key, ext);
      if (f.exists) return f.uri;
    }
    return null;
  }

  async put(key: string, imageBase64: string, mimeType: string): Promise<string> {
    if (!this.root.exists) this.root.create({ intermediates: true });
    const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'png';
    const f = this.file(key, ext);
    await f.write(imageBase64, { encoding: 'base64' });
    return f.uri;
  }

  removeForScan(scanId: string) {
    if (!this.root.exists) return;
    for (const entry of this.root.list()) {
      if (entry instanceof File && entry.name.startsWith(`${scanId}-`)) entry.delete();
    }
  }

  removeAll() {
    if (this.root.exists) this.root.delete();
  }
}

/** The photo that leaves the phone is small: 768 px wide JPEG, no metadata. */
export async function preparePhoto(uri: string): Promise<string> {
  const rendered = await ImageManipulator.manipulate(uri).resize({ width: 768 }).renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
  if (!saved.base64) throw new Error('Couldn’t prepare your photo');
  return saved.base64;
}
