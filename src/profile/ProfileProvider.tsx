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
  const [s] = useState<ProfileStore>(() => store ?? new FileProfileStore());
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loaded, setLoaded] = useState(false);
  const current = useRef(profile);

  useEffect(() => {
    let live = true;
    s.load().then((p) => {
      if (!live) return;
      current.current = p;
      setProfile(p);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [s]);

  const update = useCallback(
    async (change: (p: Profile) => Profile) => {
      const next = change(current.current);
      current.current = next;
      setProfile(next);
      await s.save(next);
    },
    [s],
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
