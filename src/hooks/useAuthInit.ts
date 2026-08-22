"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useAuthStore, colorForUid } from "@/lib/sync/authStore";
import { getUserProfile } from "@/lib/firebase/firestore";
import type { AppUser } from "@/types";

export function useAuthInit(): void {
  const { setUser, setInitialized, setRequiresName, setRequiresAccountType, setRequiresWorkType, setRequiresFactoryName } = useAuthStore();

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

        const existingStoreUser = useAuthStore.getState().user;
        const sameUserLocal = existingStoreUser?.uid === firebaseUser.uid ? existingStoreUser : null;

        const effectiveAccountType = savedProfile?.accountType || sameUserLocal?.accountType;
        const effectiveWorkType = savedProfile?.workType || sameUserLocal?.workType;
        const effectiveDisplayName = savedProfile?.displayName || sameUserLocal?.displayName || firebaseUser.displayName || "User";
        const effectiveNickname = savedProfile?.nickname || sameUserLocal?.nickname;
        const effectiveFactoryName = savedProfile?.factoryName || sameUserLocal?.factoryName;

        // Set basic user info first to unblock UI
        const baseUser: AppUser = {
          uid: firebaseUser.uid,
          displayName: effectiveDisplayName,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
          color: colorForUid(firebaseUser.uid),
          isAnonymous: firebaseUser.isAnonymous,
          nickname: effectiveNickname,
          factoryName: effectiveFactoryName,
          accountType: effectiveAccountType,
          workType: effectiveWorkType,
        };

        setUser(baseUser);
        
        if (!firebaseUser.isAnonymous) {
          if (!effectiveDisplayName) {
            setRequiresName(true);
          } else {
            setRequiresName(false);
          }

          if (!effectiveAccountType) {
            setRequiresAccountType(true);
            setRequiresWorkType(false);
          } else {
            setRequiresAccountType(false);
            if (effectiveAccountType === "non-owner" && !effectiveWorkType) {
              setRequiresWorkType(true);
            } else {
              setRequiresWorkType(false);
            }
          }

          if (!effectiveFactoryName) {
            setRequiresFactoryName(true);
          } else {
            setRequiresFactoryName(false);
          }
        } else {
          setRequiresName(false);
          setRequiresAccountType(false);
          setRequiresWorkType(false);
          setRequiresFactoryName(false);
        }
        
        setInitialized(true);
      } else {
        setUser(null);
        setRequiresName(false);
        setRequiresAccountType(false);
        setRequiresFactoryName(false);
        setInitialized(true);
      }
    });

    return unsub;
  }, [setUser, setInitialized, setRequiresName, setRequiresAccountType]);
}
