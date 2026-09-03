import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppUser } from "@/types";
import { USER_COLORS } from "@/types";

interface AuthState {
  user: AppUser | null;
  initialized: boolean;
  requiresName: boolean;
  requiresAccountType: boolean;
  requiresWorkType: boolean;
  requiresFactoryName: boolean;
  requiresNickname: boolean;
  requiresPhoneNumber: boolean;
  setUser: (user: AppUser | null) => void;
  setInitialized: (v: boolean) => void;
  setRequiresName: (v: boolean) => void;
  setRequiresAccountType: (v: boolean) => void;
  setRequiresWorkType: (v: boolean) => void;
  setRequiresFactoryName: (v: boolean) => void;
  setRequiresNickname: (v: boolean) => void;
  setRequiresPhoneNumber: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      initialized: false,
      requiresName: false,
      requiresAccountType: false,
      requiresWorkType: false,
      requiresFactoryName: false,
      requiresNickname: false,
      requiresPhoneNumber: false,
      setUser: (user) => {
        if (typeof window !== "undefined") {
          try {
            if (user) {
              localStorage.setItem("collabsheet_is_logged_in", "true");
            } else {
              localStorage.removeItem("collabsheet_is_logged_in");
            }
          } catch (_) {}
        }
        set({ user });
      },
      setInitialized: (initialized) => set({ initialized }),
      setRequiresName: (requiresName) => set({ requiresName }),
      setRequiresAccountType: (requiresAccountType) => set({ requiresAccountType }),
      setRequiresWorkType: (requiresWorkType) => set({ requiresWorkType }),
      setRequiresFactoryName: (requiresFactoryName) => set({ requiresFactoryName }),
      setRequiresNickname: (requiresNickname) => set({ requiresNickname }),
      setRequiresPhoneNumber: (requiresPhoneNumber) => set({ requiresPhoneNumber }),
    }),
    {
      name: "collabsheet-auth",
      partialize: (state) => ({
        user: state.user,
        requiresName: state.requiresName,
        requiresAccountType: state.requiresAccountType,
        requiresWorkType: state.requiresWorkType,
        requiresFactoryName: state.requiresFactoryName,
        requiresNickname: state.requiresNickname,
        requiresPhoneNumber: state.requiresPhoneNumber,
      }),
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
