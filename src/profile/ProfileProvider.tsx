import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { FileProfileStore, type ProfileStore } from './store';
import { emptyProfile, type FamilyMember, type Profile } from './types';

interface ProfileContextValue {
  profile: Profile;
  loaded: boolean;
  onboarded: boolean;
  /** Saves at once, so a half-finished onboarding resumes where it stopped. */
  update(change: (p: Profile) => Profile): Promise<void>;
  keepPhoto(member: FamilyMember, uri: string): Promise<string>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ store, children }: { store?: ProfileStore; children: ReactNode }) {
  // One load per provider. Every update is chained after it, so a change made before the file
  // has loaded (for example by a screen's mount effect) applies on top of the saved profile
  // instead of overwriting it with an empty one.
  const [s] = useState<ProfileStore>(() => store ?? new FileProfileStore());
  const chain = useRef<Promise<Profile> | null>(null);
  const after = useCallback(() => (chain.current ??= s.load().catch(() => emptyProfile())), [s]);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    void after().then((p) => {
      if (!live) return;
      setProfile(p);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [after]);

  const update = useCallback(
    async (change: (p: Profile) => Profile) => {
      const next = after().then(async (p) => {
        const n = change(p);
        setProfile(n);
        try {
          await s.save(n);
        } catch {
          // Keep the in-memory answer; the next change tries to save again.
        }
        return n;
      });
      chain.current = next;
      await next;
    },
    [after, s],
  );

  const keepPhoto = useCallback((member: FamilyMember, uri: string) => s.keepPhoto(member, uri), [s]);

  const value = useMemo(
    () => ({ profile, loaded, onboarded: !!profile.completedAt, update, keepPhoto }),
    [profile, loaded, update, keepPhoto],
  );
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const v = useContext(ProfileContext);
  if (!v) throw new Error('useProfile must be used inside <ProfileProvider>');
  return v;
}
