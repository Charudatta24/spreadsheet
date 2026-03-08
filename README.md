# CollabSheet

A lightweight real-time collaborative spreadsheet built with Next.js 14, Firebase, and Zustand.

**Live demo**: [collabsheet.vercel.app](https://collabsheet.vercel.app)

---

## Architecture Decisions

### Where state lives

State is split across two tiers:

1. **Zustand (client, in-memory)** — the source of truth for the current editing session. All grid interactions (keystrokes, cell navigation, formula input) go through the Zustand store first, making the UI instantaneous. This store is ephemeral — it rehydrates from Firestore on mount.

2. **Firebase (persistent, synced)** — the durable source of truth across sessions. Two Firebase products are used for different purposes:
   - **Firestore**: Document metadata and cell data. Cells are stored as a subcollection (`/documents/{id}/cells/{cellId}`) so Firestore's real-time listeners deliver granular change deltas rather than shipping the full grid on every keystroke.
   - **Realtime Database**: Presence only. RTDB's native `onDisconnect()` hook gives us free ephemeral cleanup when a user drops off — exactly what presence needs. Firestore doesn't have this.

### How contention is handled

Cell updates use **last-write-wins at cell granularity**. Each cell write is debounced (400ms) then persisted as an independent Firestore document. Concurrent edits to *different* cells merge cleanly. Concurrent edits to the *same* cell — the common case when two people are truly fighting over one cell — resolve to whichever timestamp Firestore commits last.

This is a pragmatic choice. Full OT or CRDT (e.g. Automerge, Yjs) would give character-level merge for the same cell, but adds significant complexity for marginal gain in a spreadsheet context — cell-level contention is rare, and when it occurs, last-write-wins is understandable to users. If this were a Google Docs-style text editor, the decision would be different.

Writes flow through a `CustomEvent` bridge (`sheet:cell-write`) from the grid component to the sync hook. This keeps the grid component free of async Firebase concerns and makes the write path testable.

### Formula evaluation

The formula engine (`src/lib/formula/index.ts`) is a hand-rolled parser with:
- `=SUM`, `=AVERAGE`, `=MIN`, `=MAX`, `=COUNT`, `=IF`, `=ABS`, `=SQRT`, `=ROUND`
- Arbitrary arithmetic (`=A1*B2+C3/2`)
- Cell references and ranges (`A1:C3`)
- Multi-pass dependency resolution (up to 10 iterations to handle DAG chains like `=A1+B1` where B1=`=C1`)

**What I chose not to build**: A full dependency graph / topo-sort. The 10-pass approach handles chains up to depth 10, which covers virtually all real-world spreadsheet formulas. A proper topo-sort would be needed for very deep chains or circular reference detection. Circular refs currently produce `#VALUE!` after 10 passes without crashing, which is acceptable.

**Security note**: The arithmetic evaluator uses `new Function(...)` with strict sanitization — only digits, whitespace, and math operators (`+−*/%.()`) pass the regex gate before eval. Cell references are resolved to numbers *before* reaching the Function constructor.

### What was intentionally not built

- **Virtual scrolling**: The grid renders all 100 rows × 26 cols as CSS grid. At this scale (~2600 cells) the DOM is manageable. For 10k+ rows, a windowed renderer (react-virtual) would be required.
- **Undo/redo**: Would require an operation log per session. Valuable but out of scope.
- **Conflict UI**: No visual indicator when two users write the same cell simultaneously. The last-write-wins resolution is silent.
- **Named ranges / absolute refs**: `$A$1` notation not supported.
- **Cell validation**: No data types or constraints.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 App Router | Server components for initial load, client components for the interactive grid |
| State | Zustand + Immer | Minimal boilerplate, immer for safe mutations in the grid store |
| Database | Firestore | Subcollection design enables cell-granular real-time listeners |
| Presence | Firebase RTDB | `onDisconnect()` for automatic cleanup |
| Auth | Firebase Auth | Google OAuth + anonymous (guest) |
| Styling | Tailwind CSS + custom CSS | Tailwind for layout, raw CSS for grid performance-critical styles |
| TypeScript | Strict mode | Zero `any`, no `@ts-ignore` |

---

## Setup

### 1. Firebase project

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Firestore**, **Realtime Database**, and **Authentication** (Google + Anonymous providers)
3. Copy your config into `.env.local` (see `.env.example`)
4. Deploy Firestore rules: `firebase deploy --only firestore:rules`
5. Deploy RTDB rules: `firebase deploy --only database`

### 2. Local development

```bash
npm install
cp .env.example .env.local
# Fill in your Firebase config
npm run dev
```

### 3. Deploy to Vercel

```bash
vercel --prod
# Add environment variables in Vercel dashboard
```

---

## Formula reference

| Formula | Example |
|---|---|
| SUM | `=SUM(A1:A10)` |
| AVERAGE | `=AVERAGE(B1:B5)` |
| MIN / MAX | `=MIN(A1:D1)` |
| COUNT | `=COUNT(A1:A20)` |
| IF | `=IF(A1, B1, C1)` |
| ABS | `=ABS(A1-B1)` |
| SQRT | `=SQRT(A1)` |
| ROUND | `=ROUND(A1, 2)` |
| Arithmetic | `=A1*B2+(C3/2)` |
| Cell ref | `=A1+B1` |

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| Arrow keys | Navigate cells |
| Enter | Edit cell / confirm + move down |
| Tab / Shift+Tab | Confirm + move right/left |
| Escape | Cancel edit |
| Any printable key | Start editing |
| Backspace/Delete | Clear cell |
| Shift+Arrow | Extend selection |

---

## Bonus features implemented

- ✅ Cell formatting (bold, italic, underline, text colour, background colour, alignment)
- ✅ Column resize (drag resize handle)
- ✅ Row resize (drag resize handle)
- ✅ Keyboard navigation (arrows, Tab, Enter, Shift+extend)
- ✅ Column reorder (drag column headers)
- ✅ Export to CSV

---

## Commit narrative

Commits follow a deliberate progression:
1. `feat: project scaffold and TypeScript types` — establish shape before code
2. `feat: Firebase setup (Firestore, RTDB, Auth)` — infrastructure
3. `feat: formula engine with SUM, arithmetic, range expansion`
4. `feat: Zustand editor store with immer`
5. `feat: real-time sync hook and cell debounce`
6. `feat: presence system via RTDB`
7. `feat: auth (Google + anonymous guest flow)`
8. `feat: SpreadsheetGrid with keyboard nav, resize, reorder`
9. `feat: toolbar formatting (bold/italic/color/align)`
10. `feat: dashboard, document list, CSV export`
11. `fix: strict TypeScript pass, no ts-ignore`
12. `chore: README, .env.example, security rules`
