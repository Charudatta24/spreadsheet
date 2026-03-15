"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useAuthStore, colorForUid } from "@/lib/sync/authStore";
import { getUserNickname } from "@/lib/firebase/firestore";
import type { AppUser } from "@/types";

export function useAuthInit(): void {
  const { setUser, setInitialized } = useAuthStore();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Set basic user info first to unblock UI
        const baseUser: AppUser = {
          uid: firebaseUser.uid,
          displayName:
            firebaseUser.displayName ??
            (firebaseUser.isAnonymous
              ? (typeof localStorage !== "undefined"
                  ? (localStorage.getItem("collabsheet-displayname") ?? "Anonymous")
                  : "Anonymous")
              : "User"),
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
          color: colorForUid(firebaseUser.uid),
          isAnonymous: firebaseUser.isAnonymous,
        };
        setUser(baseUser);
        setInitialized(true);

        // Fetch nickname in the background if not anonymous
        if (!firebaseUser.isAnonymous) {
          getUserNickname(firebaseUser.uid).then((saved) => {
            if (saved) {
              setUser({ ...baseUser, nickname: saved });
            }
          }).catch(console.error);
        }
      } else {
        setUser(null);
        setInitialized(true);
      }
    });

    return unsub;
  }, [setUser, setInitialized]);
}
