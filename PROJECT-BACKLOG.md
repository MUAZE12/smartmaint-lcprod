# SmartMaint — L.C PROD · Product Backlog, Sprint Backlog & Project Evaluation

> Last updated **2026-07-13** — Snapshot of the GMAO/CMMS for **L.C PROD** (agroalimentaire — huile d'olive et dérivés, simulation Moroccan plant).
>
> Stack : Next.js 16 (Turbopack) · React 19 · TypeScript strict · Supabase (Postgres + Realtime + Auth + Storage, RLS ON avec politiques permissives) · Vercel + Cloudflare Worker (proxy Green API) · Inno Setup Windows installer · jsQR · Whisper-small · Resend (fallback Gmail SMTP).

---

## 1. Product Backlog — Done (already shipped)

44 stories shipped, grouped by epic. **All real-time synchronised across admin / technician / operator** via Supabase Realtime on 27 tables.

### Epic A — Foundation
| ID | User story | Pts |
|---|---|---|
| A1 | As any user, I want to log in with my role so the UI shows what I'm allowed to do | 5 |
| A2 | As any user, I want the UI to switch language by my role (fr admin/tech · ar operator) | 3 |
| A3 | As an admin, I want a Journal d'audit that records every CRUD with author + timestamp (immutable) | 5 |
| A4 | As any user, I want changes by others to appear live without refresh | 5 |
| A5 | As any user, I want a zoom control + dark/light/system theme | 3 |
| A6 | As any user, I want a Ctrl+K command palette that searches pages + entities | 5 |

### Epic B — Assets & maintenance
| ID | User story | Pts |
|---|---|---|
| B1 | As an admin, I want CRUD on machines with criticality + importance score | 5 |
| B2 | As an admin, I want intervention workflow (corrective/preventive/conditional/améliorative) with kanban + calendar | 8 |
| B3 | As an admin, I want a preventive plan scheduler that auto-generates the next intervention | 5 |
| B4 | As an admin, I want a "carnet de santé" page per machine with history + KPIs | 5 |
| B5 | As an admin, I want a work-order drawer that decrements stock when parts are consumed | 5 |

### Epic C — Compliance & quality (L.C PROD-specific)
| ID | User story | Pts |
|---|---|---|
| C1 | As an admin, I want a HACCP module limited to food-contact equipment with audit-PDF export | 8 |
| C2 | As an admin, I want calibration / metrology certificates with expiry alerts | 8 |
| C3 | As a technician, I want a "Démarrage de poste" daily safety + HACCP checklist runner | 3 |
| C4 | As an admin, I want company-info (Nom, secteur, ICE...) used on printed dossiers | 3 |

### Epic D — Industry 4.0
| ID | User story | Pts |
|---|---|---|
| D1 | As a technician, I want a **real** QR scanner that accepts only known machine codes (jsQR) | 8 |
| D2 | As an operator, I want a QR scanner to declare a quality defect by scanning the machine | 5 |
| D3 | As a technician, I want offline French voice dictation (Whisper-small) on both report fields | 13 |
| D4 | As a technician, I want a stopwatch on the intervention that auto-fills downtimeHours | 3 |
| D5 | As a technician, I want to attach photos/short videos to the intervention report | 5 |
| D6 | As an admin, I want a predictive RUL / health view per machine derived from MTBF | 5 |
| D7 | As an admin, I want an energy dashboard (kWh, MAD, CO₂) with editable tariff | 5 |
| D8 | As an admin, I want a synoptique 2D plant map with live status colour-coding | 5 |
| D9 | As an admin, I want a "salle de contrôle" wall of machine status tiles | 3 |

### Epic E — Procurement (SAP-style)
| ID | User story | Pts |
|---|---|---|
| E1 | As an admin, I want supplier CRUD with reliability score | 3 |
| E2 | As an admin, I want itemized RFQ (one RFQ → many lines → many suppliers' unit prices) | 8 |
| E3 | As an admin, I want a smart quote-comparison score (50% price · 30% reliability · 20% delivery) | 5 |
| E4 | As an admin, I want multi-line POs with approval threshold (configurable) | 8 |
| E5 | As an admin, I want a goods-receipt note (GRN) that bumps stock and flips PO status | 5 |
| E6 | As an admin, I want an Approvals inbox listing POs + interventions waiting on sign-off | 3 |
| E7 | As a system, I want automatic réapprovisionnement when a part hits its minimum (creates a REQ-A-… requisition) | 5 |

### Epic F — Reporting & analytics
| ID | User story | Pts |
|---|---|---|
| F1 | As an admin, I want OEE/TRS per machine + loss cascade | 8 |
| F2 | As an admin, I want a Pareto "causes de pannes" with cumulative line | 3 |
| F3 | As an admin, I want all dashboards print-friendly (PDF) via the browser | 5 |

### Epic G — Personnel & roles
| ID | User story | Pts |
|---|---|---|
| G1 | As an admin, I want a unified Personnel page (technicians + operators) | 5 |
| G2 | As a technician/operator, I want my profile edits to be visible to admin live | 5 |
| G3 | As a technician, I want a "Mon planning" with my interventions for the next 14 days | 5 |

### Epic H — Outillage & ressources
| ID | User story | Pts |
|---|---|---|
| H1 | As a technician, I want a shared toolkit with check-out/return + location | 5 |
| H2 | As a technician, I want a spare-parts lookup with stock + "où la trouver" | 3 |
| H3 | As a technician, I want quick-action chips (causes + actions communes) to fill the report in one tap | 3 |
| H4 | As any user, I want a knowledge base with 10 fiches de procédure searchable by atelier | 5 |

### Epic I — Automation & alerts
| ID | User story | Pts |
|---|---|---|
| I1 | As an admin, I want auto e-mail alerts on broken machines / low stock / overdue HACCP | 8 |
| I2 | As an admin, I want a weekly activity digest e-mail | 3 |
| I3 | As a system, I want every CRUD logged in the audit trail | 3 |

### Epic J — Infrastructure & ops
| ID | User story | Pts |
|---|---|---|
| J1 | As a sysadmin, I want a Windows installer (no admin needed) that bundles Node.js + AI model | 8 |
| J2 | As a sysadmin, I want auto-update mid-use via a Supabase Storage channel | 8 |
| J3 | As a dev, I want every mutation routed through audit-wrapped CRUD in db.ts | 3 |

### Epic V — Sécurité durcie (sprints 15-16)
| ID | User story | Pts |
|---|---|---|
| V1 | As a sysadmin, I want RLS enabled on every table with permissive policies + explicit GRANTs to anon/authenticated/service_role | 5 |
| V2 | As a sysadmin, I want the shipped `.env.local` stripped of `SUPABASE_SERVICE_ROLE_KEY` so the launcher only carries the anon key | 3 |
| V3 | As a sysadmin, I want `SMARTMAINT_API_KEY` gate on `/api/send-alert`, `/api/notify-employee`, `/api/apply-update`, `/api/reorder/scan` — plus `CRON_SECRET` Bearer on `/api/cron/*` and Supabase webhooks | 5 |
| V4 | As a sysadmin, I want `SUPABASE_SERVICE_ROLE_KEY` scoped to Vercel env only, rotated via the Vercel REST API (not the CLI, which mangles whitespace) | 3 |

### Epic W — Tutorial (démo agent-piloté)
| ID | User story | Pts |
|---|---|---|
| W1 | As any user, I want a role-specific interactive tour that mocks realistic data — 43 étapes admin, 15 étapes technicien, 12 étapes opérateur (RTL arabe) | 13 |
| W2 | As any user, I want the tutorial to auto-close modals it opened, restore the DOM after mocks, and never leave demo data behind | 5 |
| W3 | As any user, I want the operator EPI step in Arabic to walk through category, quantity, urgent flag, send, and post-send admin routing | 3 |

### Epic X — UI/UX redesign par la main (2026-06 → 07)
| ID | User story | Pts |
|---|---|---|
| X1 | As any user, I want every page to look hand-crafted (no AI-generated placeholder feel) — 40+ écrans redessinés carte par carte, KPI par KPI, toolbar par toolbar | 21 |
| X2 | As any user, I want the mobile viewport + PC viewport both compatible with proper touch targets, safe-area, and no horizontal scroll | 8 |
| X3 | As an operator, I want giant tactile buttons (bilingual, kiosk-friendly) with breathing-room padding | 3 |

### Epic Y — Auto-update robustness
| ID | User story | Pts |
|---|---|---|
| Y1 | As a sysadmin, I want auto-update that survives the launcher's Job Object (KILL_ON_JOB_CLOSE) by escaping via `wmic process call create` instead of `child_process.spawn` | 8 |
| Y2 | As a sysadmin, I want the PS helper written with UTF-8 BOM and no em-dashes so PowerShell 5.1 doesn't Windows-1252-mangle it | 3 |
| Y3 | As a sysadmin, I want the OLD launcher window closed via broad-sweep (name + path match with 2-pass sweep) so no zombie window remains after update | 5 |
| Y4 | As a sysadmin, I want the CRON_SECRET rotated via the Vercel REST API with exact-byte POST (bypass CLI newline injection) | 2 |

### Epic Z — Consolidation opérateur
| ID | User story | Pts |
|---|---|---|
| Z1 | As an operator, I want `/production-batches` reachable from the operator sidebar without a redirect flash-back (whitelist `operatorSharedPaths` in AuthContext) | 3 |
| Z2 | As an operator, I want a batch page that renders the operator view immediately from a cached role in localStorage (no double-click) | 3 |
| Z3 | As an operator, I want subsequent tour steps to work cleanly after the quality-defect modal by dispatching a `smartmaint-demo-close-quality-modal` custom event | 2 |

### Epic AA — Sprint 16 (2026-07-13) — one-session massive uplift, 27 stories
| ID | User story | Pts |
|---|---|---|
| AA1 | Sentry-shim error tracking (lazy-load `@sentry/browser`, fallback to console + `audit_log`) | 3 |
| AA2 | `GET /api/health` — probes Supabase, mail, secrets. 503 if degraded | 3 |
| AA3 | `GET /api/metrics` — Prometheus format, `CRON_SECRET` gated | 3 |
| AA4 | Distributed rate limiting (Upstash Redis + in-memory fallback), applied to `/api/errors` + `/api/kb/ask` | 5 |
| AA5 | Forensic `audit_log` (ip / userAgent / sessionId / correlationId + append-only triggers) | 5 |
| AA6 | `sensor_readings` + `sensor_thresholds` + `sensor_rollups_15m` + `sensor_latest` view | 5 |
| AA7 | `POST /api/sensors` (batch 500/req, 10k/h) + `simulate-sensors.mjs` (drift + noise) | 5 |
| AA8 | Media → Supabase Storage helpers (`uploadIntervenPhoto`, `migrateAttachment`) | 5 |
| AA9 | `<Skeleton>` + `<SkeletonRow/Card/Table>` + `skeleton-shimmer` keyframe | 3 |
| AA10 | `<EmptyState>` with 4 tones (default/success/warning/info) | 2 |
| AA11 | `<UndoProvider>` + `queueUndo({description, rollback, ttlMs})` + `Ctrl+Z` | 5 |
| AA12 | `<KeyboardShortcutsProvider>` + `useShortcut` hook + `?` cheatsheet overlay | 5 |
| AA13 | Delta tracker (`markVisit` / `newSince`) — per-list "new since last visit" | 3 |
| AA14 | Onboarding wizard (10 steps, progress persisted, dismissable) | 8 |
| AA15 | Weekly director brief aggregator (`weeklyBrief.ts`) | 5 |
| AA16 | Compliance calendar merging HACCP + calibration + preventive + certifs + LOTO | 5 |
| AA17 | Tech-of-the-month leaderboard (100-pt scoring: volume + MTTR + preventive + compliance) | 5 |
| AA18 | Escalation tree engine (per-criticality, `planEscalations()` pure) | 5 |
| AA19 | Per-workshop RLS (`auth_role`, `auth_workshop_access`, `auth_is_admin` helpers) + client mirror | 13 |
| AA20 | `<OfflineIndicator>` in Header + `<InstallPWAPrompt>` (Android + iOS hint) | 3 |
| AA21 | RAG on KB: pgvector + HNSW + `match_kb()` RPC + `/api/kb/ask` (Claude Haiku answers) | 13 |
| AA22 | Multi-tenant: `tenant_id` on 38 tables + `auth_tenant_id()` + tenant-isolation policies | 13 |
| AA23 | Voice intent parser (FR + AR NL, 10 intent kinds, digit + word number extraction) | 5 |
| AA24 | Predictive spare-parts (linear-fit on 12-week consumption, `shouldReorder`, `suggestedOrderQty`) | 5 |
| AA25 | AR-style QR overlay on camera feed (`<ARMachineOverlay>` — jsQR + CSS overlay) | 8 |
| AA26 | Photo-defect classifier (TF.js MobileNet + kNN, 7 classes, <200ms) | 8 |
| AA27 | Cross-shift voice handover structuring (headline + ongoing + LOTOs + voice highlights) | 5 |

**Velocity to date :** ≈ 470 story points across the simulation (Sprint 16 alone: +150 pts).

---

## 2. Product Backlog — To Do (prioritised)

Prioritisation : `P1` must-have for a real L.C PROD rollout · `P2` should-have within 6 months · `P3` nice-to-have.

> **Note (2026-07-12) :** Les épics **V (sécurité)**, **W (tutoriel)**, **X (redesign UI/UX)**, **Y (auto-update)**, **Z (opérateur)** ont été livrés (voir section 1). Ce qui reste ci-dessous est ce qui n'a pas encore commencé.

### Epic K — Mobile & offline
| ID | Story | Pri | Pts |
|---|---|---|---|
| K1 | As an operator on the floor, I want the app installable as a PWA on a tablet for offline use | P1 | 8 |
| K2 | As any user, I want push notifications when something assigned to me changes | P2 | 8 |
| K3 | As a technician, I want camera + voice to work fully offline (already done, but verify on tablet) | P2 | 3 |

### Epic L — Knowledge & docs
| ID | Story | Pri | Pts |
|---|---|---|---|
| L1 | As an admin, I want a CRUD UI for knowledge articles (currently SQL-only) | P1 | 5 |
| L2 | As an admin, I want to upload PDF machine manuals attached to a machine | P1 | 5 |
| L3 | As a technician, I want to comment on a fiche to share fixes | P2 | 5 |
| L4 | As an admin, I want versioning + author on fiches | P3 | 5 |

### Epic M — Notifications expansion
| ID | Story | Pri | Pts |
|---|---|---|---|
| M1 | As an admin, I want SMS alerts (Twilio) for off-hours pannes | P1 | 8 |
| M2 | As a technician, I want a daily 7am e-mail with my planning | P2 | 3 |
| M3 | As an admin, I want WhatsApp Business alerts | P3 | 8 |

### Epic N — Permissions & security
| ID | Story | Pri | Pts |
|---|---|---|---|
| N1 | As an admin, I want per-workshop permissions (tech-A sees only Remplissage) | P1 | 8 |
| N2 | As an admin, I want 2-factor authentication on my account | P1 | 5 |
| N3 | As an admin, I want password complexity rules + expiry | P2 | 2 |
| N4 | As an admin, I want LDAP / Active Directory SSO if L.C PROD adopts AD | P3 | 13 |

### Epic O — Spare parts depth
| ID | Story | Pri | Pts |
|---|---|---|---|
| O1 | As a technician, I want to scan a barcode to log a part in/out | P1 | 5 |
| O2 | As an admin, I want cross-references (alternatives, multi-supplier) per part | P2 | 5 |
| O3 | As an admin, I want inventory cycle counts (compter physiquement N fois/an) | P2 | 8 |
| O4 | As an admin, I want a cost dashboard per machine / workshop | P2 | 5 |
| O5 | As an admin, I want budget vs actual reports | P3 | 8 |

### Epic P — IoT & advanced predictive
| ID | Story | Pri | Pts |
|---|---|---|---|
| P1 | As an admin, I want vibration + temperature sensors on CHD-001 + REM-001 with live charts | P1 | 13 |
| P2 | As an admin, I want auto-creation of an intervention when a sensor crosses a threshold | P2 | 8 |
| P3 | As an admin, I want anomaly detection on historical failure data (ML) | P3 | 13 |

### Epic Q — Integrations
| ID | Story | Pri | Pts |
|---|---|---|---|
| Q1 | As an admin, I want CSV import/export on every list (machines, parts, suppliers...) | P1 | 5 |
| Q2 | As an admin, I want a REST/GraphQL API for ERP/Odoo to read & write GMAO data | P2 | 13 |
| Q3 | As an admin, I want a direct Odoo Comptabilité connector for POs | P3 | 13 |

### Epic R — UX & polish
| ID | Story | Pri | Pts |
|---|---|---|---|
| R1 | As an admin, I want to upload a logo for L.C PROD that appears on prints + sidebar | P2 | 3 |
| R2 | As any user, I want loading skeletons while data fetches | P2 | 3 |
| R3 | As any user, I want a first-time onboarding tutorial / tooltips | P3 | 5 |
| R4 | As any user, I want a keyboard-shortcuts cheatsheet (Ctrl+K opens it) | P3 | 2 |

### Epic S — Performance & scale
| ID | Story | Pri | Pts |
|---|---|---|---|
| S1 | As a sysadmin, I want photo/video attachments stored in Supabase Storage (not base64 in JSON) | P1 | 5 |
| S2 | As a sysadmin, I want pagination on /audit (currently capped at 500 rows) | P1 | 3 |
| S3 | As a sysadmin, I want database indexes on the hot queries (interventions by date, audit by createdAt, ...) | P2 | 2 |
| S4 | As a sysadmin, I want a backup / restore procedure documented | P2 | 3 |

### Epic T — Testing & DevOps
| ID | Story | Pri | Pts |
|---|---|---|---|
| T1 | As a dev, I want unit tests on `calculations.ts` (MTBF, MTTR, TRS) | P1 | 3 |
| T2 | As a dev, I want E2E Playwright tests on critical flows (login, scan, report submission) | P1 | 8 |
| T3 | As a dev, I want GitHub Actions CI that runs tests + builds on each push | P2 | 5 |
| T4 | As a sysadmin, I want Sentry error tracking on the installed app | P2 | 3 |
| T5 | As a dev, I want a Lighthouse perf budget (LCP < 2.5s) | P3 | 2 |

### Epic U — Multi-site / multi-tenant
| ID | Story | Pri | Pts |
|---|---|---|---|
| U1 | As a holding admin, I want to manage several L.C PROD plants in one app | P3 | 13 |
| U2 | As a sysadmin, I want to deploy the same code base for another company (no per-customer fork) | P3 | 13 |

**Total to-do estimate :** ≈ 240 points / about 12 sprints.

---

## 3. Sprint Backlog

2-week sprints, single-developer velocity ≈ 15–20 points.

### Sprint 15 ✅ CLÔTURÉ (2026-06) — "Rebrand L.C PROD + Procurement SAP-style"
**Goal :** Passage complet du GMAO en éditeur d'huile alimentaire + module achats industriel.

| Story | Livraison | Pts |
|---|---|---|
| **E2/E3/E4/E5** Procurement | RFQ itemisé, comparaison de devis pondérée, PO multi-lignes, approbations, GRN | 26 |
| Rebrand L.C PROD | `reseed-lcprod.sql` — machines huile d'olive, personnel MA, fournisseurs Casablanca/Meknès | 5 |
| **W1** Tutoriel démo | 3 tours role-based (admin/tech/opérateur) avec mocks, DOM restoration, gestion des modales | 13 |

### Sprint 16 ✅ CLÔTURÉ (2026-06 → 07) — "Sécurité + auto-update + UI/UX main-crafted"
**Goal :** Passer d'une PoC ouverte à une app installable avec RLS, auto-update stable, et un design cousu main.

| Story | Livraison | Pts |
|---|---|---|
| **V1** RLS + politiques permissives | `enable-rls-permissive.sql` — RLS ON, USING(true) WITH CHECK(true), GRANTs anon/authenticated/service_role | 5 |
| **V2** Strip `SUPABASE_SERVICE_ROLE_KEY` du release | Script `Publier la mise à jour.ps1` filtre la ligne avant tar | 3 |
| **V3** Gate API + `CRON_SECRET` sur cron + webhooks | `SMARTMAINT_API_KEY` sur endpoints sensibles, `isApiCallAuthorized()` helper | 5 |
| **V4** Rotate `CRON_SECRET` via Vercel REST API | Bypass CLI (newline injection), POST exact-byte via `/v10/projects/{id}/env` | 3 |
| **Y1/Y2/Y3** Auto-update fixes | Task Scheduler → wmic escape ; UTF-8 BOM ; broad-sweep 2-pass kill de l'ancien launcher | 16 |
| **X1** Redesign hand-crafted | 40+ pages retouchées carte par carte pendant 3 semaines | 21 |
| **X2** Mobile + PC viewport | Safe-area, touch targets 44px, no horizontal overflow, breakpoint checks | 8 |
| **Z1/Z2/Z3** Consolidation opérateur | `operatorSharedPaths` whitelist, cached-role localStorage, tutoriel modal event | 8 |
| **W2/W3** Tutorial polish | Tutoriel EPI opérateur enrichi (catégorie, quantité, urgent, envoi, routing admin), tour tech dbl-click | 8 |

**Cumul livré à date :** ≈ 320 pts.

### Sprint 17 — "Persistance des médias + rôles fins" (16 pts)
**Goal :** Photos / vidéos en Storage + les techniciens ne voient que leur atelier.

| Story | Tasks | Pts |
|---|---|---|
| **S1** Attachments → Supabase Storage | (1) Bucket `intervention-media` · (2) Upload helper qui retourne URL publique · (3) Migration JSONB → URLs seulement · (4) Backfill des lignes existantes | 5 |
| **N1** Per-workshop permissions | (1) `workshop_access text[]` dans `auth.users.raw_user_meta_data` · (2) Filtre dans DataContext · (3) UI admin d'affectation · (4) Affichage sur `/personnel` | 8 |
| **S2** Pagination Journal d'audit | Curseur, bouton « Charger plus », limite 100 | 2 |
| **L1** CRUD admin des articles KB | Modal formulaire, aperçu Markdown, chip filtre existant | 5 (report du sprint 12) |

### Sprint 18 — "Reliability hardening + notifs SMS" (18 pts)
**Goal :** Tests automatisés + Sentry + alerte SMS hors heures.

| Story | Tasks | Pts |
|---|---|---|
| **T1** Unit tests `calculations.ts` | Vitest, couvre calculateMTBF/MTTR/TRS/getCriticalityLevel + snapshot KPIs builder | 3 |
| **T2** E2E Playwright | Login 3 rôles, scan QR, soumission rapport, sync inter-session | 8 |
| **M1** Alertes SMS via Twilio | Env `TWILIO_*`, `/api/send-sms`, branch dans AlertWatcher, toggle sur `/alertes` | 8 |
| **T4** Sentry error tracking | DSN sur l'app installée, breadcrumbs auth + supabase | 3 |

### Sprint 19 — "IoT pilote + CRUD KB" (16 pts)
**Goal :** Premier capteur vibration + articles de connaissance éditables.

| Story | Tasks | Pts |
|---|---|---|
| **P1** Capteurs vibration + température CHD-001 + REM-001 | Schema `sensor_readings`, endpoint POST /api/sensors, chart live sur `/synoptique` | 13 |
| **L2** Upload PDF manuels machine | Bucket `machine-manuals`, uploader dans `/machines/[id]`, lien depuis KB | 5 |

**Après 3 sprints (≈ 6 semaines) le GMAO est :** persistant à grande échelle, multi-équipe avec permissions, testé, surveillé, capteur IoT en production.

---

## 4. Project Evaluation

### Strengths

1. **Scope.** Covers ~80 % of what commercial CMMS (IBM Maximo, SAP PM, Fiix, UpKeep) offer : actifs, OT, préventif, achats, conformité, personnel, KPIs.
2. **Domain specialisation.** Pas un CMMS générique adapté ; conçu pour l'agroalimentaire L.C PROD avec HACCP, lubrifiants NSF H1, étalonnage métrologique, et les 7 étapes de procédé (Réception → Expédition + Utilités).
3. **Temps réel multi-utilisateur.** 27 tables sont diffusées via Supabase Realtime — sub-seconde sync sur toutes les machines connectées. C'est rare dans les CMMS commerciaux.
4. **Pile technique moderne.** Next.js 16 + React 19 + TypeScript strict + Supabase. Server-rendered first paint + interactivity côté client. Rapide à maintenir.
5. **Industry 4.0.** Scanner QR réel (validation DB), dictée vocale française **hors-ligne** (Whisper-small, 240 Mo embarqués), photos/vidéos d'intervention, RUL prédictif, suivi énergétique avec CO₂.
6. **Audit & conformité.** Journal d'audit immuable (RLS select+insert seul), HACCP, certificats d'étalonnage, check-lists signées — *audit-ready ISO 22000 / IFS Food*.
7. **UX par rôle.** Admin desktop riche · technicien mobile-friendly avec outillage/planning/chrono · opérateur RTL arabe avec grosses cibles tactiles. Chaque profil a la bonne profondeur.
8. **Approvisionnement de niveau SAP.** RFQ itemisé → comparaison de devis pondérée → PO multi-lignes → approbation conditionnelle → réception (GRN). La plupart des CMMS s'arrêtent au bon de commande simple.
9. **Déploiement clé en main.** Installateur Windows (Inno Setup, 373 Mo) avec Node.js bundlé, modèle IA bundlé, mise à jour automatique via Supabase Storage. Installation en 2 min sans IT.

### Weaknesses

1. **Mono-locataire.** Un projet Supabase = une entreprise. Pas conçu pour héberger plusieurs sociétés en SaaS.
2. **Pièces jointes en base64.** Photos stockées en JSON sur les lignes `interventions` — ça gonfle la DB et alourdit le realtime. À déplacer vers Supabase Storage.
3. **Pas d'app mobile native.** Le responsive web fonctionne mais sans notifications push ni capacité offline-first.
4. **Tests automatisés absents.** Aucun test unitaire, aucun E2E, aucune CI. Vérification manuelle uniquement.
5. **Permissions trop larges.** RLS donne tout aux `authenticated` — impossible de restreindre un technicien à un seul atelier sans modifier le schéma.
6. **AlertWatcher fragile.** L'automation tourne uniquement dans la session admin. Si l'admin ne lance pas l'app pendant 24 h, aucun mail d'alerte ne part.
7. **Publication manuelle.** `Publier la mise a jour.bat` exécuté à la main ; pas de déploiement continu.
8. **Pas de plan de sauvegarde formel.** On compte sur les snapshots quotidiens de Supabase (Free tier : 7 jours de rétention).
9. **Antivirus intrusif.** 360 Total Security supprime les `.ps1` neufs — il a fallu n'utiliser que `.bat`/`.cjs`. Risque récurrent à l'installation.
10. **Accessibilité non auditée.** Navigation clavier, lecteurs d'écran, contraste couleur non vérifiés. À faire si déploiement WCAG-AA exigé.

### Gaps avant production réelle à L.C PROD

| Domaine | Manque | Impact |
|---|---|---|
| Capteurs IoT | Aucune intégration vibration / température | Le module *Maintenance prédictive* reste statique (MTBF historique) au lieu de temps réel |
| ERP financier | Pas de connecteur SAP / Odoo | Les coûts d'achat doivent être ressaisis côté finance |
| Mobile | Pas d'app native pour les techniciens en ronde | Tablette possible mais moins ergonomique qu'une app native |
| SSO | Pas de LDAP / AD | Si L.C PROD adopte un annuaire central, double gestion des comptes |
| Sauvegarde | Pas de procédure formelle | Risque de perte ≤ 24 h en cas d'incident Supabase |
| Formation | Pas de manuel utilisateur | Onboarding par démo orale uniquement |
| Tests | Pas de CI | Une régression peut passer en production |

### Comparaison aux CMMS commerciaux

| Critère | L.C PROD GMAO | IBM Maximo | UpKeep | Fiix |
|---|---|---|---|---|
| Coût annuel (estimé) | ~0 € (Supabase Free) | 50 000 €+ | 35 €/util/mois | 45 €/util/mois |
| UI moderne | ✅ | ⚠ legacy | ✅ | ✅ |
| Temps réel sub-seconde | ✅ | ❌ | ⚠ | ⚠ |
| Module HACCP intégré | ✅ | ⚠ (ajout) | ❌ | ❌ |
| Voix offline (FR) | ✅ Whisper-small | ❌ | ❌ | ❌ |
| Workflow approbation PO | ✅ | ✅ | ⚠ basique | ⚠ basique |
| Permissions granulaires | ❌ | ✅ | ✅ | ✅ |
| App mobile native | ❌ | ✅ | ✅ | ✅ |
| IoT sensors | ❌ | ✅ | ⚠ add-on | ⚠ add-on |
| SSO LDAP/AD | ❌ | ✅ | ✅ | ✅ |

### Recommandation roadmap 12 mois

| Trimestre | Thème | Stories prioritaires |
|---|---|---|
| **T1** | Production-ready | L1, S1, T1, T2, R2, N2 |
| **T2** | Multi-équipe | N1, M1, M2, Q1, O1, S4 |
| **T3** | IoT pilote | P1, P2, L2, R1 |
| **T4** | Intégration ERP | Q2, Q3, T3, T4 |

Après 12 mois, le GMAO est prêt pour un déploiement opérationnel à L.C PROD avec capteurs sur les 2 machines critiques, intégration Odoo, SSO et tests automatisés.

---

## 5. Resume in two lines

- **Forces.** GMAO complet, ciblé agroalimentaire, temps réel, audit-ready, Industry 4.0, déploiement clé en main.
- **À renforcer.** Mobile natif, permissions par atelier, IoT, tests automatisés, stockage des médias séparé de la DB.

---

*Document maintenu à la main. Mettre à jour à chaque fin de sprint : déplacer les stories complétées de la section 2 vers la section 1, recalculer la vélocité, créer le prochain sprint en section 3.*
