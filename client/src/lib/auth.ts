import { create } from 'zustand';
import type { UserDto } from '@courtbook/shared';

/**
 * Session state (§2.7): the 15-min access token lives ONLY in memory —
 * never localStorage (XSS). The httpOnly refresh cookie restores the
 * session across reloads via /auth/refresh.
 */
interface AuthState {
  user: UserDto | null;
  accessToken: string | null;
  /** true once the initial silent-refresh attempt has settled */
  ready: boolean;
  setSession: (user: UserDto, accessToken: string) => void;
  clear: () => void;
  setReady: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  ready: false,
  setSession: (user, accessToken) => set({ user, accessToken, ready: true }),
  clear: () => set({ user: null, accessToken: null, ready: true }),
  setReady: () => set({ ready: true }),
}));
