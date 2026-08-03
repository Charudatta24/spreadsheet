/**
 * src/lib/firebase/friends.ts
 *
 * Data model
 * ──────────
 * users/{uid}/friends/{friendUid}      ← accepted friends (per-user sub-collection)
 * friendRequests/{requestId}           ← pending requests (top-level collection)
 */

import {
    collection,
    doc,
    setDoc,
    deleteDoc,
    getDocs,
    query,
    where,
    onSnapshot,
    writeBatch,
    serverTimestamp,
    Timestamp,
    limit,
} from "firebase/firestore";
import type { Unsubscribe } from "firebase/firestore";
import { db } from "./client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FriendEntry = {
    uid: string;
    name: string;
    nickname?: string;
    email?: string;
    createdAt: number;
};

export type FriendRequest = {
    id: string;
    from: string;
    to: string;
    fromName: string;
    fromNickname?: string;
    fromEmail?: string;
    toName: string;
    toNickname?: string;
    status: "pending";
    createdAt: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const USERS = "users";
const FRIEND_REQS = "friendRequests";

const friendsCol = (uid: string) =>
    collection(db, USERS, uid, "friends");

const friendDoc = (uid: string, friendUid: string) =>
    doc(db, USERS, uid, "friends", friendUid);

function toMillis(val: unknown): number {
    if (val instanceof Timestamp) return val.toMillis();
    if (typeof val === "number") return val;
    return Date.now();
}

function toRequest(id: string, data: Record<string, unknown>): FriendRequest {
    return {
        id,
        from: data.from as string,
        to: data.to as string,
        fromName: data.fromName as string,
        fromNickname: (data.fromNickname as string | null) ?? undefined,
        fromEmail: (data.fromEmail as string | null) ?? undefined,
        toName: data.toName as string,
        toNickname: (data.toNickname as string | null) ?? undefined,
        status: "pending",
        createdAt: toMillis(data.createdAt),
    };
}

// ── Send a friend request ─────────────────────────────────────────────────────

export async function sendFriendRequest(
    fromUid: string,
    fromName: string,
    fromNickname: string | undefined,
    fromEmail: string | null,
    toUid: string,
    toName: string,
    toNickname: string | undefined,
): Promise<void> {
    // Prevent duplicate pending request in same direction
    const existing = await getDocs(
        query(
            collection(db, FRIEND_REQS),
            where("from", "==", fromUid),
            where("to", "==", toUid),
            where("status", "==", "pending"),
            limit(1),
        )
    );
    if (!existing.empty) return;

    const reqRef = doc(collection(db, FRIEND_REQS));
    await setDoc(reqRef, {
        from: fromUid,
        to: toUid,
        fromName,
        fromNickname: fromNickname ?? null,
        fromEmail: fromEmail ?? null,
        toName,
        toNickname: toNickname ?? null,
        status: "pending",
        createdAt: serverTimestamp(),
    });
}

// ── Accept a friend request ───────────────────────────────────────────────────

export async function acceptFriendRequest(req: FriendRequest): Promise<void> {
    const batch = writeBatch(db);

    // Sender appears in recipient's list
    batch.set(friendDoc(req.to, req.from), {
        uid: req.from,
        name: req.fromName,
        nickname: req.fromNickname ?? null,
        email: req.fromEmail ?? null,
        createdAt: serverTimestamp(),
    });

    // Recipient appears in sender's list
    batch.set(friendDoc(req.from, req.to), {
        uid: req.to,
        name: req.toName,
        nickname: req.toNickname ?? null,
        email: null,
        createdAt: serverTimestamp(),
    });

    // Delete the request
    batch.delete(doc(db, FRIEND_REQS, req.id));

    await batch.commit();
}

// ── Decline / cancel a friend request ────────────────────────────────────────

export async function declineFriendRequest(requestId: string): Promise<void> {
    await deleteDoc(doc(db, FRIEND_REQS, requestId));
}

// ── Remove a friend (bidirectional) ──────────────────────────────────────────

export async function removeFriend(
    myUid: string,
    friendUid: string,
): Promise<void> {
    const batch = writeBatch(db);
    batch.delete(friendDoc(myUid, friendUid));
    batch.delete(friendDoc(friendUid, myUid));
    await batch.commit();
}

// ── Subscribe: accepted friends ───────────────────────────────────────────────

export function subscribeFriends(
    uid: string,
    callback: (friends: FriendEntry[]) => void,
): Unsubscribe {
    return onSnapshot(friendsCol(uid), (snap) => {
        const list: FriendEntry[] = snap.docs.map((d) => {
            const data = d.data();
            return {
                uid: d.id,
                name: data.name as string,
                nickname: (data.nickname as string | null) ?? undefined,
                email: (data.email as string | null) ?? undefined,
                createdAt: toMillis(data.createdAt),
            };
        });
        list.sort((a, b) => b.createdAt - a.createdAt);
        callback(list);
    });
}

// ── Subscribe: pending friend requests (incoming + outgoing) ─────────────────
//
// Firestore does not support OR across different fields without a composite
// index, so we run two separate listeners and merge the results.

export function subscribeFriendRequests(
    uid: string,
    callback: (requests: FriendRequest[]) => void,
): Unsubscribe {
    const map = new Map<string, FriendRequest>();

    function emit() {
        const list = Array.from(map.values());
        list.sort((a, b) => b.createdAt - a.createdAt);
        callback(list);
    }

    // Requests where I am the RECIPIENT (incoming)
    const unsubIncoming = onSnapshot(
        query(
            collection(db, FRIEND_REQS),
            where("to", "==", uid),
            where("status", "==", "pending"),
        ),
        (snap) => {
            // Remove any previously tracked incoming entries, re-add current ones
            map.forEach((r, k) => {
                if (r.to === uid) map.delete(k);
            });
            snap.docs.forEach((d) => map.set(d.id, toRequest(d.id, d.data() as Record<string, unknown>)));
            emit();
        },
    );

    // Requests where I am the SENDER (outgoing)
    const unsubOutgoing = onSnapshot(
        query(
            collection(db, FRIEND_REQS),
            where("from", "==", uid),
            where("status", "==", "pending"),
        ),
        (snap) => {
            map.forEach((r, k) => {
                if (r.from === uid) map.delete(k);
            });
            snap.docs.forEach((d) => map.set(d.id, toRequest(d.id, d.data() as Record<string, unknown>)));
            emit();
        },
    );

    return () => {
        unsubIncoming();
        unsubOutgoing();
    };
}