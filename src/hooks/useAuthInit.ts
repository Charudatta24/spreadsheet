"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useAuthStore, colorForUid } from "@/lib/sync/authStore";
import { getUserProfile } from "@/lib/firebase/firestore";
import type { AppUser } from "@/types";

export function useAuthInit(): void {
  const {
    setUser,
    setInitialized,
    setRequiresName,
    setRequiresAccountType,
    setRequiresWorkType,
    setRequiresFactoryName,
    setRequiresNickname,
    setRequiresPhoneNumber,
  } = useAuthStore();

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
        const effectivePhoneNumber = savedProfile?.phoneNumber || sameUserLocal?.phoneNumber;

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
          phoneNumber: effectivePhoneNumber,
          accountType: effectiveAccountType,
          workType: effectiveWorkType,
        };

        setUser(baseUser);
        
        if (!firebaseUser.isAnonymous) {
          // 1. Account type MUST be chosen first
          if (!effectiveAccountType) {
            setRequiresAccountType(true);
            setRequiresWorkType(false);
            setRequiresName(false);
            setRequiresFactoryName(false);
            setRequiresNickname(false);
            setRequiresPhoneNumber(false);
          } else {
            setRequiresAccountType(false);

            if (effectiveAccountType === "non-owner") {
              // Non-owners: ask for Work Type (Cutting / Polish), and Name. Nothing else.
              setRequiresFactoryName(false);
              setRequiresPhoneNumber(false);
              setRequiresNickname(false);

              if (!effectiveWorkType) {
                setRequiresWorkType(true);
                setRequiresName(false);
              } else {
                setRequiresWorkType(false);
                setRequiresName(!effectiveDisplayName);
              }
            } else if (effectiveAccountType === "owner") {
              setRequiresWorkType(false);

              // 2. Factory name is ONLY for OWNER accounts
              if (!effectiveFactoryName) {
                setRequiresFactoryName(true);
              } else {
                setRequiresFactoryName(false);

                // 3. Phone number is ONLY for OWNER accounts (after factory name)
                if (!effectivePhoneNumber) {
                  setRequiresPhoneNumber(true);
                } else {
                  setRequiresPhoneNumber(false);

                  // 4. Nickname for owners who haven't set one yet
                  if (!effectiveNickname) {
                    setRequiresNickname(true);
                  } else {
                    setRequiresNickname(false);
                  }
                }
              }

              // 5. Display name
              if (!effectiveDisplayName) {
                setRequiresName(true);
              } else {
                setRequiresName(false);
              }
            }
          }
        } else {
          setRequiresName(false);
          setRequiresAccountType(false);
          setRequiresWorkType(false);
          setRequiresFactoryName(false);
          setRequiresNickname(false);
          setRequiresPhoneNumber(false);
        }
        
        setInitialized(true);
      } else {
        setUser(null);
        setRequiresName(false);
        setRequiresAccountType(false);
        setRequiresFactoryName(false);
        setRequiresNickname(false);
        setRequiresPhoneNumber(false);
        setInitialized(true);
      }
    });

    return unsub;
  }, [
    setUser,
    setInitialized,
    setRequiresName,
    setRequiresAccountType,
    setRequiresWorkType,
    setRequiresFactoryName,
    setRequiresNickname,
    setRequiresPhoneNumber,
  ]);
}
