import { FileProfileStore, MemoryProfileStore } from '@/profile/store';
import { emptyProfile } from '@/profile/types';

jest.mock('expo-file-system', () => require('../../test-utils/fsMock').createFsMock());

const fs = () => jest.requireMock('expo-file-system') as { __files: Map<string, string> };

describe('profile stores', () => {
  it('starts empty and round-trips a profile on disk', async () => {
    const store = new FileProfileStore();
    expect(await store.load()).toEqual(emptyProfile());
    await store.save({ ...emptyProfile(), age: 24, zones: ['temples'] });
    expect(await new FileProfileStore().load()).toMatchObject({ age: 24, zones: ['temples'] });
  });

  it('survives a corrupt file', async () => {
    fs().__files.set('file:///doc/profile/profile.json', '{nope');
    expect(await new FileProfileStore().load()).toEqual(emptyProfile());
  });

  it('copies picked photos into the profile folder', async () => {
    fs().__files.set('file:///tmp/picked.JPG', 'jpeg-bytes');
    const uri = await new FileProfileStore().keepPhoto('father', 'file:///tmp/picked.JPG');
    expect(uri).toMatch(/^file:\/\/\/doc\/profile\/father-[a-z0-9]+\.jpg$/);
    expect(fs().__files.get(uri)).toBe('jpeg-bytes');
  });

  it('memory store keeps what it is given', async () => {
    const m = new MemoryProfileStore();
    await m.save({ ...emptyProfile(), age: 30 });
    expect((await m.load()).age).toBe(30);
  });
});
