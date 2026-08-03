"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useAuthStore, colorForUid } from "@/lib/sync/authStore";
import { getUserProfile } from "@/lib/firebase/firestore";
import type { AppUser } from "@/types";

export function useAuthInit(): void {
  const { setUser, setInitialized, setRequiresName, setRequiresAccountType, setRequiresWorkType } = useAuthStore();

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
          accountType: savedProfile?.accountType,
          workType: savedProfile?.workType,
        };

        setUser(baseUser);
        
        if (!firebaseUser.isAnonymous) {
          if (!savedProfile || !savedProfile.displayName) {
            setRequiresName(true);
          } else {
            setRequiresName(false);
          }

          if (!savedProfile || !savedProfile.accountType) {
            setRequiresAccountType(true);
            setRequiresWorkType(false);
          } else {
            setRequiresAccountType(false);
            if (savedProfile.accountType === "non-owner" && !savedProfile.workType) {
              setRequiresWorkType(true);
            } else {
              setRequiresWorkType(false);
            }
          }
        } else {
          setRequiresName(false);
          setRequiresAccountType(false);
          setRequiresWorkType(false);
        }
        
        setInitialized(true);
      } else {
        setUser(null);
        setRequiresName(false);
        setRequiresAccountType(false);
        setInitialized(true);
      }
    });

    return unsub;
  }, [setUser, setInitialized, setRequiresName, setRequiresAccountType]);
}
