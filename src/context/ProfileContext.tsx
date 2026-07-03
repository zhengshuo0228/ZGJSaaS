import { createContext, useContext, useEffect, useState } from 'react';
import { useSession } from '@/ctx';
import { getMyProfile } from '@/db/api';
import type { Profile } from '@/types/types';

const GUEST_PROFILE: Profile = {
  id: 'guest',
  email: null,
  display_name: '访客',
  role: 'guest',
  position: null,
  account_id: null,
  expo_push_token: null,
  created_at: '',
} as unknown as Profile;

type ProfileContextType = {
  profile: Profile | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  isGuest: boolean;
};

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  isLoading: true,
  refresh: async () => {},
  isGuest: false,
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { session, isGuestMode } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    if (isGuestMode) {
      setProfile(GUEST_PROFILE);
      setIsLoading(false);
      return;
    }
    if (!session) {
      setProfile(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const p = await getMyProfile();
    setProfile(p);
    setIsLoading(false);
  };

  useEffect(() => {
    load();
  }, [session, isGuestMode]);

  return (
    <ProfileContext.Provider value={{ profile, isLoading, refresh: load, isGuest: isGuestMode || profile?.role === 'guest' }}>
      {children}
    </ProfileContext.Provider>
  );
}

export const useProfile = () => useContext(ProfileContext);
