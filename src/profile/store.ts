import { Directory, File, Paths } from 'expo-file-system';

import { emptyProfile, type FamilyMember, type Profile } from './types';

/** Where the profile lives. On device: one JSON file in the app's private documents folder. */
export interface ProfileStore {
  load(): Promise<Profile>;
  save(profile: Profile): Promise<Profile>;
  /** Copies a picked photo into permanent storage and returns its new URI. */
  keepPhoto(member: FamilyMember, uri: string): Promise<string>;
}

export class MemoryProfileStore implements ProfileStore {
  constructor(private profile: Profile = emptyProfile()) {}
  async load() {
    return this.profile;
  }
  async save(profile: Profile) {
    this.profile = profile;
    return profile;
  }
  async keepPhoto(_member: FamilyMember, uri: string) {
    return uri;
  }
}

export class FileProfileStore implements ProfileStore {
  private readonly root: Directory;
  private readonly file: File;

  constructor(root: Directory = new Directory(Paths.document, 'profile')) {
    this.root = root;
    this.file = new File(root, 'profile.json');
  }

  private ensure() {
    if (!this.root.exists) this.root.create({ intermediates: true });
  }

  async load(): Promise<Profile> {
    if (!this.file.exists) return emptyProfile();
    try {
      return { ...emptyProfile(), ...(JSON.parse(await this.file.text()) as Partial<Profile>) };
    } catch {
      return emptyProfile();
    }
  }

  async save(profile: Profile): Promise<Profile> {
    this.ensure();
    this.file.write(JSON.stringify(profile));
    return profile;
  }

  async keepPhoto(member: FamilyMember, uri: string): Promise<string> {
    this.ensure();
    const src = new File(uri);
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    // A new name each time, so the image cache never shows an old photo for the same person.
    const dest = new File(this.root, `${member}-${Date.now().toString(36)}.${ext}`);
    await src.copy(dest);
    return dest.uri;
  }
}
