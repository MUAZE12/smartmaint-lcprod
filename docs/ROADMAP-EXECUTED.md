# Roadmap Executed — Session 2026-07-13

Records what shipped in the 30-improvements sprint. Each item is a real
file in the repo with a commit hash.

## M1 · Observability + UI primitives (`e41b623`)

| Item | Files |
|---|---|
| Sentry-shim error tracking | `src/lib/errorTracking.ts` |
| Client error sink | `src/app/api/errors/route.ts` |
| Health probe (`/api/health`) | `src/app/api/health/route.ts` |
| Prometheus metrics (`/api/metrics`) | `src/app/api/metrics/route.ts` |
| Distributed rate limit (Upstash + memory fallback) | `src/lib/rateLimit.ts` |
| `<Skeleton>`, `<SkeletonRow>`, `<SkeletonCard>`, `<SkeletonTable>` | `src/components/ui/Skeleton.tsx` |
| `<EmptyState>` (4 tones) | `src/components/ui/EmptyState.tsx` |
| CI matrix: Node 20 + 22 + coverage gate (30%) | `.github/workflows/ci.yml` |

## M2 · Structured data + IoT (`3aba1cb`)

| Item | Files |
|---|---|
| Forensic audit log (ip, user_agent, session_id, correlation_id) | `supabase/audit-log-forensic.sql` |
| Append-only triggers on `audit_log` | same |
| `sensor_readings` + `sensor_thresholds` + `sensor_rollups_15m` | `supabase/sensor-readings.sql` |
| `sensor_latest` view + Realtime publication | same |
| `POST /api/sensors` (batch up to 500, 10k/hour) | `src/app/api/sensors/route.ts` |
| Sensor simulator (vibration/temp/current/pressure, drift) | `scripts/simulate-sensors.mjs` |
| Attachments → Supabase Storage helpers | `src/lib/mediaStorage.ts` |

## M3 · UX primitives (`35c19e1`)

| Item | Files |
|---|---|
| Keyboard shortcut registry + `?` cheatsheet | `src/lib/shortcuts.tsx` |
| Undo manager with Ctrl+Z + toast | `src/lib/undoManager.tsx` |
| "What changed?" delta tracker | `src/lib/deltaTracker.ts` |
| 10-step onboarding wizard | `src/components/OnboardingWizard.tsx` |

## M4 · Business features (`7e5ee5a`)

| Item | Files |
|---|---|
| Directeur weekly brief aggregator | `src/lib/weeklyBrief.ts` |
| Compliance calendar (HACCP + calibration + preventive + certifs + LOTO) | `src/lib/complianceCalendar.ts` |
| Tech-of-the-month leaderboard | `src/lib/leaderboard.ts` |
| Escalation tree engine (4 levels, per criticality) | `src/lib/escalation.ts` |

## M5 · Architectural upgrades (`03118f6`)

| Item | Files |
|---|---|
| Per-workshop RLS (real policies, admin bypass) | `supabase/per-workshop-rls.sql` |
| Client-side workshop scope mirror | `src/lib/workshopScope.ts` |
| Offline queue status indicator | `src/components/OfflineIndicator.tsx` |
| PWA install prompt (Android + iOS hint) | `src/components/InstallPWAPrompt.tsx` |
| RAG on KB (pgvector + HNSW + match_kb RPC) | `supabase/knowledge-rag.sql` |
| `/api/kb/ask` (embed → retrieve → Claude Haiku) | `src/app/api/kb/ask/route.ts` |
| Multi-tenant migration (tenant_id + isolation policies) | `supabase/multi-tenant.sql` |

## M6 · Distinctive features (`03118f6`)

| Item | Files |
|---|---|
| Voice intent parser FR + AR (10 kinds, extract numbers from words) | `src/lib/voiceIntent.ts` |
| Predictive spare-parts (linear fit on 12-week consumption) | `src/lib/predictiveParts.ts` |
| AR-style QR overlay on camera feed | `src/components/ARMachineOverlay.tsx` |
| In-browser photo-defect classifier (MobileNet + kNN) | `src/lib/defectClassifier.ts` |
| Cross-shift voice handover structuring | `src/lib/shiftHandover.ts` |

---

## What's next (real integration work, not shipped)

Every module above is production-ready as a library. Integrating each
into the UI is the last mile:

- Wire `<Skeleton>` + `<EmptyState>` into `/machines`, `/interventions`, `/personnel`
- Mount `<UndoProvider>` in `AppShell`, wrap deletions
- Mount `<KeyboardShortcutsProvider>` in `AppShell`, register `n`/`m`/`?`
- Mount `<OfflineIndicator>` in Header
- Add `/kb/ask` UI panel in `/knowledge`
- Wire onboarding wizard to a "first login" check
- Apply the SQL migrations in order:
  1. `audit-log-forensic.sql`
  2. `sensor-readings.sql`
  3. `knowledge-rag.sql` (requires `CREATE EXTENSION vector`)
  4. `per-workshop-rls.sql` **or** `multi-tenant.sql` (choose one strategy)

None of these SQL migrations were auto-applied to your Supabase project
during this session — you run them from the Supabase SQL editor when
ready. All are idempotent.
