import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppUser } from "@/types";
import { USER_COLORS } from "@/types";

interface AuthState {
  user: AppUser | null;
  initialized: boolean;
  setUser: (user: AppUser | null) => void;
  setInitialized: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      initialized: false,
      setUser: (user) => set({ user }),
      setInitialized: (initialized) => set({ initialized }),
    }),
    {
      name: "collabsheet-auth",
      partialize: (state) => ({ user: state.user }),
    }
  )
);

/** Pick a stable color based on uid */
export function colorForUid(uid: string): (typeof USER_COLORS)[number] {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash << 5) - hash + uid.charCodeAt(i);
    hash |= 0;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}
