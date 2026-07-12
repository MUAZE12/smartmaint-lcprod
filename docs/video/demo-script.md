# 3-minute demo video — script & production notes

**Target duration:** 2:45 – 3:00 (LinkedIn embeds cut past 3:00).
**Recording tool suggestion:** OBS Studio (free, native Windows screen recorder). 1080p @ 30 fps. Cursor highlighting on. Microphone if narrating; otherwise use the provided `.srt` and record silent.
**Save location:** `docs/video/smartmaint-demo.mp4`
**YouTube:** upload as *Unlisted*, title `SmartMaint — L.C PROD — 3-minute demo`.

---

## Scene-by-scene shot list

Each scene has a **time budget**, **what to show**, and **the exact narration** to read (or use as a caption).

### Scene 1 — Hook (0:00 – 0:15) — 15 s

**Show:**
- Full-screen shot of the admin dashboard with real KPI values populated.
- Cursor holds still for 1 s so the viewer registers the shot.

**Narration:**
> "This is SmartMaint — L.C PROD. A GMAO built for a Moroccan edible-oil plant. Real-time sync across 27 tables, offline French voice dictation, Arabic RTL for the shop floor, and a Windows installer with auto-update. Full-stack Next.js and Supabase. Let me show you."

**On-screen caption (bottom):** `Next.js 16 · React 19 · Supabase · Whisper (offline) · Windows installer`

---

### Scene 2 — Admin dashboard (0:15 – 0:45) — 30 s

**Show:**
1. KPI cards close-up: MTBF, MTTR, Availability, Total cost. Hover over one — the tooltip shows.
2. Click "Machines" in the sidebar. Grid of ~15 machines with criticality badges.
3. Click one machine → drill-down. Show tabs: Overview, Historique, Pièces, KPI.
4. Back to Dashboard → click "Interventions". Kanban view. Drag a card from "En cours" to "Terminée".

**Narration:**
> "The admin cockpit — every KPI live-computed from the intervention history. Every machine has a QR code, a criticality score, and a full audit trail. Interventions are Kanban — click and drag to reassign or close. All 27 tables sync in real time — if a technician updates something on their tablet, this dashboard reflects it in about 180 milliseconds."

---

### Scene 3 — Technician view + voice dictation (0:45 – 1:20) — 35 s

**Show:**
1. Log out. Log in as technician (or switch tab if you use two sessions).
2. `/technician/dashboard`. Kanban filtered to the technician's assigned work orders.
3. Click one intervention → report page. Point out the chrono (start / pause).
4. Click the **microphone** button on the "Cause probable" textarea.
5. Speak: "*Fuite au niveau de la garniture mécanique de la pompe.*"
6. Whisper transcribes locally — text appears in the field.
7. Add a photo (drag one in or file-pick).
8. Point out the "Photo avant" pill.

**Narration:**
> "The technician view is mobile-friendly, meant for a tablet on the shop floor. Every text field has a microphone — Whisper-small, 240 megabytes, running entirely in the browser. So the technician can dictate their report in French even in a basement workshop with zero cellular signal. Photos tag automatically as 'before' or 'after'. And there's a QR scanner that jumps straight to the machine card — I'll show that in a second."

---

### Scene 4 — Operator RTL kiosk (1:20 – 1:50) — 30 s

**Show:**
1. Log out. Log in as operator (or switch tab).
2. `/operator/dashboard`. **Interface flips to Arabic RTL.**
3. Point at the three giant buttons: red (panic), purple (quality defect), orange (EPI).
4. Click the orange EPI button → inline form opens with `EPI / مستهلكات / أخرى` chips, quantity buttons, urgent flag.
5. Type into the item field: "قفازات نتريل — مقاس M". Click send.
6. Toast appears in Arabic. Form closes.

**Narration:**
> "The operator interface is Arabic, right-to-left, kiosk-first. Giant tactile buttons for the three most common actions — panic, quality defect, and requesting personal protective equipment or consumables. No training required — a plant operator was able to file their first defect report in under twenty seconds. Every request lands instantly on the admin's screen."

---

### Scene 5 — Auto-update (1:50 – 2:25) — 35 s

**Show:**
1. Cut to the Windows installer running (double-click the `.exe` to open a fresh install).
2. App loads, admin logs in.
3. Wait for the "Nouvelle mise à jour disponible" banner (bottom-right).
4. Click "**Mettre à jour**".
5. Show the banner text change: `Installation de la version 20260712-171000 — l'application va se fermer puis se rouvrir toute seule…`
6. Screen dims for ~2 s → app auto-restarts with the new version.
7. Optional: quickly cut to Process Explorer or Task Manager showing the old launcher gone and a new one running.

**Narration:**
> "And the piece I'm most proud of technically — auto-update, on Windows. Getting this to work was a two-week deep dive. The launcher wraps Node in a Windows Job Object, which normally kills every child process when the launcher exits — so my restart script kept dying with its parent. I solved it by asking the WMI service to spawn PowerShell instead of asking Node — the child ends up outside the Job Object, immune to our death. Full write-up on my blog."

**On-screen caption during this scene:** `Full write-up: [link to your blog post]`

---

### Scene 6 — Closing (2:25 – 3:00) — 35 s

**Show:**
1. Cut back to the admin dashboard, full-screen.
2. Slow zoom-out or fade to a title card with:
   - Repo URL
   - Demo URL
   - Your LinkedIn handle

**Narration:**
> "The whole thing — 55,000 lines of TypeScript, 80 user stories over 15 sprints, three roles, three languages, one platform. Full source, architecture doc, and blog write-ups are on GitHub. Live demo in the description. If you're hiring a full-stack engineer for industrial software, or if you just want to talk about the auto-update war story, my LinkedIn is on screen. Thanks for watching."

**Title card:**
```
SmartMaint — L.C PROD

Repo:       github.com/MUAZE12/smartmaint-lcprod
Live demo:  demo.smartmaint-lcprod.vercel.app
LinkedIn:   linkedin.com/in/baroudi-mustapha
```

---

## Post-production checklist

- [ ] Cursor is visible in every scene (OBS: enable cursor highlight).
- [ ] Zoom into KPI cards and code snippets so mobile viewers can read.
- [ ] Add background music at low volume (Epidemic Sound / YouTube Audio Library, corporate-tech genre).
- [ ] Add captions (SRT below) — 80% of LinkedIn watches are muted.
- [ ] Trim silences over 2 seconds.
- [ ] Export at 1080p 30 fps, H.264, ~10 Mbps. YouTube-safe.
- [ ] Upload as **Unlisted** so it's linkable but not indexed.
- [ ] In the YouTube description: repo URL + demo URL + LinkedIn URL (in that order).
- [ ] Add to the README's "Video demo" section.

---

## LinkedIn post to accompany the video

Paste the video URL + this text:

> **What I built:** a GMAO/CMMS for a Moroccan edible-oil plant. Real-time sync across 27 Postgres tables, offline French voice dictation (Whisper), Arabic RTL operator UI, and a Windows installer with in-app auto-update.
>
> **Stack:** Next.js 16 · React 19 · TypeScript strict · Supabase (Postgres + Realtime + Auth + Storage) · Vercel · Cloudflare Worker · Whisper-small · Inno Setup.
>
> **The technical story I liked the most:** the launcher wraps Node in a Windows Job Object with KILL_ON_JOB_CLOSE. Every child of Node inherited that Job — so my auto-update restart script kept dying with the parent. Fix: spawn the helper via `wmic process call create` so the WMI service (outside the Job) runs it. That's the piece I'm most proud of.
>
> **What's next:** per-workshop RLS, migration of media to Supabase Storage, and a real E2E test suite. Feedback welcome — repo and demo in the video description.
>
> #FullStack #NextJS #Supabase #TypeScript #IndustrialSoftware #CMMS #GMAO
