"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useAuthStore, colorForUid } from "@/lib/sync/authStore";
import { getUserProfile } from "@/lib/firebase/firestore";
import type { AppUser } from "@/types";

export function useAuthInit(): void {
  const { setUser, setInitialized, setRequiresName } = useAuthStore();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch saved profile in Firestore first
        let savedProfile = null;
        if (!firebaseUser.isAnonymous) {
          try {
            savedProfile = await getUserProfile(firebaseUser.uid);
          } catch (e) {
            console.error("Failed to fetch user profile", e);
          }
        }

        // Set basic user info first to unblock UI
        const baseUser: AppUser = {
          uid: firebaseUser.uid,
          displayName: savedProfile?.displayName || 
            firebaseUser.displayName || 
            (firebaseUser.isAnonymous
              ? (typeof localStorage !== "undefined"
                  ? (localStorage.getItem("collabsheet-displayname") ?? "Anonymous")
                  : "Anonymous")
              : "User"),
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
          color: colorForUid(firebaseUser.uid),
          isAnonymous: firebaseUser.isAnonymous,
          nickname: savedProfile?.nickname,
        };

        setUser(baseUser);
        
        if (!firebaseUser.isAnonymous) {
          // If the user doesn't have a profile in DB yet, ask for name
          if (!savedProfile || !savedProfile.displayName) {
            setRequiresName(true);
          } else {
            setRequiresName(false);
          }
        } else {
          setRequiresName(false);
        }
        
        setInitialized(true);
      } else {
        setUser(null);
        setRequiresName(false);
        setInitialized(true);
      }
    });

    return unsub;
  }, [setUser, setInitialized, setRequiresName]);
}
