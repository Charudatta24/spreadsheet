"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useAuthStore, colorForUid } from "@/lib/sync/authStore";
import type { AppUser } from "@/types";

export function useAuthInit(): void {
  const { setUser, setInitialized } = useAuthStore();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const user: AppUser = {
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
        setUser(user);
      } else {
        setUser(null);
      }
      setInitialized(true);
    });

    return unsub;
  }, [setUser, setInitialized]);
}
