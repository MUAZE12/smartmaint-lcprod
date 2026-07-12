'use client';

// ============================================================
// TutorialTour — interactive guided tour.
//
// Each step can target a real on-screen element via a CSS
// selector (usually [data-tour="..."]). The tour then:
//   1. Navigates to the right route if needed
//   2. Scrolls the element into view
//   3. Darkens the rest of the screen with a 4-panel overlay
//   4. Pulses a glowing ring around the element
//   5. Floats a popover with the explanation next to it
//
// Steps without a selector show a centered card with full overlay
// (used for the welcome / outro steps).
//
// Persistence: localStorage key `smartmaint-tutorial-done-<userId>`
// so each user sees it exactly once per machine. A "Revoir le
// tutoriel" button (Settings + UserProfile) clears the key.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname } from 'next/navigation';
import {
    Sparkles, ChevronLeft, ChevronRight, X, CheckCircle2,
    LayoutDashboard, Cpu, Wrench, CalendarClock, Gauge, ShieldCheck, Award,
    Notebook, Megaphone, BellRing, BookOpen, Package, History, Settings,
    ScanLine, ListChecks, AlertTriangle, Lock, BarChart3, Briefcase,
    Camera, Target, ShieldAlert,
    Workflow, MonitorPlay, Radar, Zap, FileBarChart, Ruler, Users, BadgeCheck,
    CalendarDays, AlertOctagon, Bell, FileCheck, ClipboardList,
} from 'lucide-react';
import { useAuth, UserRole } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';

// ────────────────────────────────────────────────────────────
// Step shape
// ────────────────────────────────────────────────────────────
interface Step {
    icon: React.ElementType;
    color: string;
    title: string;
    whatFor: string;
    howTo: string;
    helps: string;
    align: string;
    /** CSS selector for the element to spotlight. Omitted ⇒ centered card. */
    selector?: string;
    /** Route to navigate to before measuring the element. */
    route?: string;
    /** Scripted demo sequence — when present, popover shows a « Voir la démo »
     *  button that runs each action in order. The demo doesn't actually persist
     *  anything (clicks open modals that the user can examine, then auto-closes). */
    demo?: DemoAction[];
}

/** One step in a scripted demo. Actions are executed sequentially with a wait
 *  between them so the user can see what's happening. */
type DemoAction =
    | { type: 'click'; selector: string; pulse?: boolean; wait?: number }
    /** Visual click animation only — moves the cursor and ripples but DOES NOT
     *  fire the real click. Use for buttons that would cause side effects
     *  (DB rows, navigation away, real submission). */
    | { type: 'pretend-click'; selector: string; wait?: number }
    | { type: 'type'; selector: string; value: string; wait?: number; index?: number }
    | { type: 'wait'; ms: number }
    | { type: 'move'; selector: string; wait?: number; index?: number }
    | { type: 'caption'; text: string; ms?: number }
    | { type: 'esc'; wait?: number }
    /** Inject a fake DOM element inside `container` so the demo has something
     *  to point at when the real data is empty. Removed automatically when
     *  the demo finishes or the step changes. */
    | { type: 'mock'; container: string; html: string; tag?: string; wait?: number }
    /** Navigate to a different route mid-demo (e.g. operator panic → wizard page).
     *  Wait gives the page time to mount before the next action runs. */
    | { type: 'navigate'; route: string; wait?: number }
    /** Dispatch a CustomEvent on the window so a page's listener can update
     *  its own React state directly — escape hatch for inputs where the
     *  prototype-setter + 'input' event path doesn't reliably sync (long
     *  controlled textareas in particular). The page registers a listener
     *  for `eventName` and reads `detail`. */
    | { type: 'event'; eventName: string; detail?: unknown; wait?: number }
    /** Actually CHANGE a <select> value and fire the change event so the
     *  React handler runs and the page state updates. Use this (not click)
     *  when the demo needs to demonstrate filtering.
     *  - `value`: exact match for one of the <option> values
     *  - `index`: positional pick into the <option> list (0-based)
     *  - `elementIndex`: when the selector matches multiple <select>s, pick
     *    the Nth one (e.g. 0 = first select on the page, 1 = second). */
    | { type: 'select'; selector: string; value?: string; index?: number; elementIndex?: number; wait?: number }
    /** Synthesize an HTML5 drag-and-drop sequence from `selector` (source)
     *  to `target`. Fires dragstart on the source, dragenter/dragover/drop
     *  on the target, then dragend on the source. The React handlers on
     *  the kanban / calendar wire up the DB change automatically. */
    | { type: 'drag'; selector: string; target: string; wait?: number };

const POPOVER_WIDTH = 380;
const POPOVER_MARGIN = 16;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ─── Voice narration — reads each caption out loud via the
// browser's SpeechSynthesis. Locks to a SINGLE gender (female by
// default) across all three languages so the narrator's voice
// doesn't switch between FR and AR. Prefers Microsoft Online
// (Natural) neural voices when present, with multi-locale Arabic
// fallback (Saudi → Egyptian → Emirati → any). ───
let _voicesLoaded = false;
let _frVoice: SpeechSynthesisVoice | null = null;
let _arVoice: SpeechSynthesisVoice | null = null;
let _enVoice: SpeechSynthesisVoice | null = null;

/** Known voice first-names by gender — used to lock the narrator to
 *  one consistent gender across all languages so the user doesn't
 *  hear a male voice for French and a female voice for Arabic. */
const FEMALE_NAMES = new Set([
    // FR
    'denise', 'vivienne', 'brigitte', 'marie', 'audrey', 'eloise', 'yvette', 'celeste',
    'amelie', 'caroline', 'julie', 'sophie', 'lea', 'jacqueline', 'hortense',
    // AR
    'salma', 'zariyah', 'layla', 'amal', 'fatima', 'amina', 'shakir', 'aisha',
    'noura', 'sana', 'iman', 'rana', 'mona',
    // EN
    'aria', 'jenny', 'michelle', 'amber', 'ava', 'emma', 'elizabeth', 'libby',
    'jane', 'sara', 'samantha', 'susan', 'zira', 'eva', 'cora', 'natasha',
    'clara', 'catherine', 'heera', 'linda', 'kate', 'serena',
]);
const MALE_NAMES = new Set([
    'henri', 'jerome', 'paul', 'maurice', 'claude', 'antoine', 'thomas', 'guillaume',
    'naayf', 'hamed', 'khalid', 'maged', 'shakir', 'youssef', 'omar', 'ali',
    'andrew', 'jacob', 'brian', 'ryan', 'guy', 'david', 'mark', 'eric', 'james',
    'william', 'liam', 'tony', 'george', 'paul',
]);

function voiceGender(v: SpeechSynthesisVoice): 'F' | 'M' | '?' {
    const n = v.name.toLowerCase();
    // explicit annotations first (rare but cleanest)
    if (/\bfemale\b/.test(n) || /\(female\)/.test(n)) return 'F';
    if (/\bmale\b/.test(n) || /\(male\)/.test(n)) return 'M';
    for (const name of FEMALE_NAMES) if (n.includes(name)) return 'F';
    for (const name of MALE_NAMES) if (n.includes(name)) return 'M';
    return '?';
}

/** Score a voice by how "natural" it sounds based on its name.
 *  Higher score = better. We deliberately do NOT give multilingual
 *  voices a big bonus — they exist primarily for English and tend to
 *  speak French/Arabic with a strong English accent. A native single-
 *  language neural voice always sounds better for its target language. */
function voiceQualityScore(v: SpeechSynthesisVoice): number {
    const n = v.name.toLowerCase();
    const lang = (v.lang || '').toLowerCase();
    let s = 0;
    if (/neural|natural/.test(n)) s += 80;
    if (/online/.test(n)) s += 35;
    if (/premium|enhanced|wavenet|studio/.test(n)) s += 25;
    if (/google/.test(n)) s += 15;
    if (/microsoft/.test(n)) s += 10;
    // Multilingual: small bonus when the voice's primary lang is English
    // (their strong suit), HEAVY penalty for non-English targets — they
    // routinely apply an English accent to French and Arabic captions.
    if (/multilingual/.test(n)) {
        if (lang.startsWith('en')) s += 15;
        else s -= 60;
    }
    // Penalize obviously synthetic / robotic-sounding voices
    if (/(desktop|sapi|espeak)/.test(n)) s -= 20;
    return s;
}

/** The gender we lock to — female by default (slightly clearer in
 *  most TTS engines and what most users expect from a narrator).
 *  All language picks favor this gender; if none of that gender is
 *  available for a language, we fall back to any voice. */
const PREFERRED_GENDER: 'F' | 'M' = 'F';

function pickBestVoiceFor(localePrefixes: string[], voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    // Step 1: voices that match ANY of the locale prefixes (e.g. ['ar-SA','ar-EG','ar'])
    const matching = voices.filter(v =>
        localePrefixes.some(p => v.lang.toLowerCase().startsWith(p.toLowerCase())),
    );

    if (matching.length === 0) {
        // No native voice for this language. Return null — speakCaption
        // will still set utterance.lang correctly, and the browser will
        // pick the best available match itself. Returning a multilingual
        // voice here is what caused the English-accented French issue.
        return null;
    }

    // Step 2: prefer the chosen gender; fall back to anything if none.
    const preferred = matching.filter(v => voiceGender(v) === PREFERRED_GENDER);
    const pool = preferred.length > 0 ? preferred : matching;

    return pool.slice().sort((a, b) => voiceQualityScore(b) - voiceQualityScore(a))[0];
}

function ensureVoicesLoaded() {
    if (_voicesLoaded || typeof window === 'undefined') return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    const refresh = () => {
        const all = synth.getVoices();
        if (all.length === 0) return;
        _frVoice = pickBestVoiceFor(['fr-FR', 'fr-CA', 'fr-BE', 'fr'], all);
        // Arabic: try Saudi / Egyptian / Emirati / Moroccan / generic — Win
        // typically ships ar-SA legacy + ar-EG Natural online, depending on
        // what neural voices are installed.
        _arVoice = pickBestVoiceFor(['ar-SA', 'ar-EG', 'ar-AE', 'ar-MA', 'ar'], all);
        _enVoice = pickBestVoiceFor(['en-US', 'en-GB', 'en'], all);
        _voicesLoaded = true;
    };
    refresh();
    if (!_voicesLoaded) synth.onvoiceschanged = refresh;
}

/** Async version: actually WAIT for the voice list to populate. The
 *  browser exposes getVoices() asynchronously on first call — the very
 *  first speakCaption() often runs before voices are loaded, and would
 *  fall back to whatever default the browser picks (frequently an
 *  English voice). Awaiting here guarantees the first caption uses the
 *  correct language voice from the start.
 *
 *  CRITICAL: once we've successfully picked voices, we DO NOT re-pick.
 *  Edge loads additional voices asynchronously (e.g. Microsoft Online
 *  Natural voices arrive later than legacy SAPI voices); re-running
 *  the picker on each speakCaption would silently switch the chosen
 *  voice mid-tour — that's the "TRS speaks English then French" bug. */
function ensureVoicesLoadedAsync(): Promise<void> {
    if (_voicesLoaded) return Promise.resolve();
    return new Promise(resolve => {
        if (typeof window === 'undefined') { resolve(); return; }
        const synth = window.speechSynthesis;
        if (!synth) { resolve(); return; }
        const tryLoad = () => {
            if (_voicesLoaded) return true;
            const all = synth.getVoices();
            if (all.length === 0) return false;
            _frVoice = pickBestVoiceFor(['fr-FR', 'fr-CA', 'fr-BE', 'fr'], all);
            _arVoice = pickBestVoiceFor(['ar-SA', 'ar-EG', 'ar-AE', 'ar-MA', 'ar'], all);
            _enVoice = pickBestVoiceFor(['en-US', 'en-GB', 'en'], all);
            _voicesLoaded = true;
            return true;
        };
        if (tryLoad()) { resolve(); return; }
        // Subscribe to voiceschanged + poll as a safety net (some Chromium
        // builds don't fire the event reliably).
        const onChange = () => { if (tryLoad()) { synth.onvoiceschanged = null; clearInterval(poll); resolve(); } };
        synth.onvoiceschanged = onChange;
        const poll = setInterval(onChange, 100);
        // Hard cap so we never block forever.
        setTimeout(() => { synth.onvoiceschanged = null; clearInterval(poll); resolve(); }, 1500);
    });
}

/** Pre-process the caption text for speech: replace math/comparison
 *  symbols with their spoken-language equivalent so the engine doesn't
 *  read "> 0" as "greater than zero" (or skip it entirely) and force
 *  the language detection astray. */
function preprocessForSpeech(text: string, lang: 'fr' | 'ar'): string {
    if (lang === 'ar') {
        return text
            .replace(/>=/g, ' أكبر أو يساوي ')
            .replace(/<=/g, ' أصغر أو يساوي ')
            .replace(/>/g, ' أكبر من ')
            .replace(/</g, ' أصغر من ')
            .replace(/×/g, ' في ')
            .replace(/&/g, ' و ')
            .replace(/%/g, ' بالمئة ')
            .replace(/[—–]/g, '،');
    }
    return text
        .replace(/>=/g, ' supérieur ou égal à ')
        .replace(/<=/g, ' inférieur ou égal à ')
        .replace(/>/g, ' supérieur à ')
        .replace(/</g, ' inférieur à ')
        .replace(/×/g, ' fois ')
        .replace(/&/g, ' et ')
        .replace(/%/g, ' pour cent ')
        .replace(/[—–]/g, ',');
}

/** Caller-supplied forced language. Set by the TutorialTour component
 *  based on the current user's role so admin/tech captions never get
 *  mis-detected as English even when a caption happens to be all-ASCII. */
let _forcedLang: 'fr' | 'ar' | null = null;
function setTutorialVoiceLang(lang: 'fr' | 'ar' | null) {
    _forcedLang = lang;
}

/** Global reference to the currently-speaking utterance — keeping a live
 *  ref prevents Chromium from GC'ing it before `onend` fires, which is a
 *  well-known cause of the "speech cuts out / events don't fire" bug. */
let _currentUtterance: SpeechSynthesisUtterance | null = null;

/** Speak a caption out loud. Returns a Promise that resolves only when
 *  the utterance has actually finished — uses THREE end signals so we
 *  never advance the demo while the voice is still mid-sentence:
 *   1. `onend` / `onerror` events (primary, when they fire)
 *   2. polling `synth.speaking` with a 2-tick stability check (backup)
 *   3. generous safety timeout based on text length (last resort) */
async function speakCaption(text: string): Promise<void> {
    if (typeof window === 'undefined') return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    // BLOCK on voices being loaded. The first speakCaption on a fresh
    // page used to fire before getVoices() had populated, leaving
    // _frVoice null and letting the browser pick whatever English voice
    // it felt like. That's the "first caption is in English" bug.
    await ensureVoicesLoadedAsync();

    // Aggressively kill the previous utterance, then WAIT for the engine
    // to confirm silence before starting the new one. Without the wait,
    // the new voice overlaps with whatever the old voice was finishing —
    // the user hears the previous step's caption "leaking" into the new
    // step's narration.
    stopSpeaking();
    await waitForSpeechStop(700);

    return new Promise<void>(resolve => {
        // Language picking:
        //   1. _forcedLang (set by the tour based on user role) wins —
        //      admin/tech → 'fr', operator → 'ar'. This eliminates the
        //      per-caption auto-detection bug where short all-ASCII
        //      captions like "MTTR moyen" got tagged as English.
        //   2. Fallback to script detection if no forced lang.
        const isArabic = /[؀-ۿ]/.test(text);
        const detectedLang: 'fr' | 'ar' = isArabic ? 'ar' : 'fr';
        const lang = _forcedLang ?? detectedLang;
        const spokenText = preprocessForSpeech(text, lang);
        const u = new SpeechSynthesisUtterance(spokenText);
        u.lang = lang === 'ar' ? 'ar-SA' : 'fr-FR';
        const v = lang === 'ar' ? _arVoice : _frVoice;
        if (v) u.voice = v;
        // Slightly slower than default reads more clearly and gives the
        // ghost cursor time to be observed.
        u.rate = 0.92;
        u.pitch = 1.0;
        u.volume = 0.95;

        _currentUtterance = u;
        let done = false;
        let interval: ReturnType<typeof setInterval> | null = null;
        let safetyT: ReturnType<typeof setTimeout> | null = null;

        const finish = () => {
            if (done) return;
            done = true;
            if (interval) clearInterval(interval);
            if (safetyT) clearTimeout(safetyT);
            if (_currentUtterance === u) _currentUtterance = null;
            resolve();
        };

        u.onend = finish;
        u.onerror = finish;

        try { synth.speak(u); }
        catch { finish(); return; }

        // Backup: poll synth.speaking. Some Chromium / Edge builds never
        // fire onend on long utterances or after focus changes — polling
        // the engine status catches those. Require 2 consecutive "silent"
        // ticks (~500 ms) so a momentary lull between sentences doesn't
        // cause a false early resolve.
        let silentTicks = 0;
        let everSpoke = false;
        interval = setInterval(() => {
            if (done) return;
            if (synth.speaking) { everSpoke = true; silentTicks = 0; return; }
            // If the engine never started (autoplay blocked), keep waiting
            // until the safety timeout — don't resolve on initial silence.
            if (!everSpoke) return;
            silentTicks += 1;
            if (silentTicks >= 2) finish();
        }, 250);

        // Last-resort safety. Generous: 2 s base + 200 ms per char (slow
        // natural voices can take ~150-180 ms per char including pauses).
        const safety = 2000 + text.length * 200;
        safetyT = setTimeout(finish, safety);
    });
}

/** Aggressive cancel sequence — synth.cancel() alone often leaves the OS
 *  voice engine playing already-buffered audio for 200–600 ms. Pausing
 *  before cancel forces the engine to flush; resume+cancel handles cases
 *  where the engine ignores cancel while paused. Empirically this kills
 *  Microsoft Online (Natural) voices in <50 ms vs ~500 ms for a single
 *  cancel(). */
function stopSpeaking() {
    if (typeof window === 'undefined') return;
    const s = window.speechSynthesis;
    if (!s) return;
    try { s.cancel(); } catch { /* ignore */ }
    try { s.pause(); } catch { /* ignore */ }
    try { s.cancel(); } catch { /* ignore */ }
    try { s.resume(); } catch { /* ignore */ }
    try { s.cancel(); } catch { /* ignore */ }
    _currentUtterance = null;
}

/** Wait until the speech engine reports both speaking=false and pending=false,
 *  with a safety cap. Used by speakCaption before starting a new utterance
 *  so we never overlap the previous voice. */
async function waitForSpeechStop(maxMs = 800): Promise<void> {
    if (typeof window === 'undefined') return;
    const s = window.speechSynthesis;
    if (!s) return;
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
        if (!s.speaking && !s.pending) return;
        await new Promise(r => setTimeout(r, 30));
    }
}

// ─── Sound effect — soft "tap" on click pulse ────────────────
let _audioCtx: AudioContext | null = null;
let _soundEnabled = true;
function setSoundEnabled(on: boolean) { _soundEnabled = on; }
function playTapSound() {
    if (!_soundEnabled || typeof window === 'undefined') return;
    try {
        if (!_audioCtx) {
            const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            if (!AC) return;
            _audioCtx = new AC();
        }
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        const ctx = _audioCtx;
        const now = ctx.currentTime;
        // Two-tone "blip" — quick high pop, soft body.
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(380, now + 0.065);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.10, now + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
    } catch { /* silent — sound is non-essential */ }
}

// ─── Demo helpers ────────────────────────────────────────────
/** Build a multi-stop walk-through demo: cursor moves to each selector
 *  and the corresponding caption fades in. `wait` is the dwell per stop. */
function walkThrough(stops: Array<{ selector: string; text: string; ms?: number }>): DemoAction[] {
    const actions: DemoAction[] = [];
    for (const s of stops) {
        actions.push({ type: 'move', selector: s.selector, wait: 350 });
        actions.push({ type: 'caption', text: s.text, ms: s.ms ?? 2200 });
    }
    return actions;
}

/** Convert a step's narrative fields into spoken captions that play around the
 *  demo. The popover used to show four labelled blocks (À quoi ça sert / Comment
 *  l'utiliser / Ce que ça vous apporte / Lien avec les autres rôles); they now
 *  become caption voice-over so the user reads them WHILE the cursor moves. */
function narrate(step: { whatFor: string; howTo: string; helps: string; align: string }): {
    intro: DemoAction[]; outro: DemoAction[];
} {
    return {
        intro: [
            { type: 'caption', text: step.whatFor, ms: 2700 },
            { type: 'caption', text: step.howTo, ms: 2900 },
        ],
        outro: [
            { type: 'caption', text: step.helps, ms: 2400 },
            { type: 'caption', text: step.align, ms: 2400 },
        ],
    };
}

/** Modal demo that ACTUALLY uses the feature: opens the modal, types into
 *  the first 1-2 form fields, hovers the save button, then closes via X.
 *  Each `field` is one input the cursor visits + types into, with its own caption. */
function modalDemo(opts: {
    open: string;
    intro: string;
    openedCaption?: string;
    fields: Array<{ selector?: string; value: string; caption: string; index?: number; isTextarea?: boolean }>;
    saveCaption: string;
}): DemoAction[] {
    const actions: DemoAction[] = [
        { type: 'caption', text: opts.intro, ms: 900 },
        { type: 'click', selector: opts.open, pulse: true, wait: 700 },
        { type: 'caption', text: opts.openedCaption || 'Le formulaire s\'ouvre.', ms: 1100 },
    ];
    for (const f of opts.fields) {
        const sel = f.selector || (f.isTextarea
            ? '[data-tour="modal-body"] textarea'
            : '[data-tour="modal-body"] input.input');
        actions.push({ type: 'caption', text: f.caption, ms: 1200 });
        actions.push({ type: 'type', selector: sel, value: f.value, wait: 250, index: f.index });
    }
    actions.push({ type: 'move', selector: '[data-tour="modal-footer"] button:last-child', wait: 600 });
    actions.push({ type: 'caption', text: opts.saveCaption, ms: 1900 });
    actions.push({ type: 'click', selector: '[data-tour="modal-close"]', pulse: true, wait: 400 });
    return actions;
}

/** Generic page-explore demo when only the page header has a tour anchor.
 *  Cursor visits the header then walks through `main .card` blocks. */
function explorePage(texts: string[]): DemoAction[] {
    const targets = [
        '[data-tour="page-header"]',
        'main .card:nth-of-type(1)',
        'main .card:nth-of-type(2)',
        'main .card:nth-of-type(3)',
        'main .card:nth-of-type(4)',
    ];
    const actions: DemoAction[] = [];
    texts.forEach((text, i) => {
        actions.push({ type: 'move', selector: targets[Math.min(i, targets.length - 1)], wait: 350 });
        actions.push({ type: 'caption', text, ms: 2200 });
    });
    return actions;
}

function storageKey(userId: string | undefined): string {
    return `smartmaint-tutorial-done-${userId ?? 'unknown'}`;
}

export function hasFinishedTutorial(userId: string | undefined): boolean {
    if (typeof window === 'undefined') return true;
    try { return localStorage.getItem(storageKey(userId)) === '1'; } catch { return true; }
}

export function resetTutorial(userId: string | undefined) {
    try { localStorage.removeItem(storageKey(userId)); } catch { /* ignore */ }
}

// ────────────────────────────────────────────────────────────
// Step scripts per role
// ────────────────────────────────────────────────────────────
// Default page anchor when there's no feature-specific data-tour on the page.
const PAGE = '[data-tour="page-header"]';

const adminSteps: Step[] = [
    {
        icon: Sparkles, color: '#3b82f6',
        title: 'Bienvenue dans SmartMaint — L.C PROD',
        // route so that clicking "Revoir le tutoriel" from any module
        // bounces the user back to the dashboard before the welcome plays.
        // Without this, replay started in /personnel (or wherever the user
        // happened to be) and the captions felt disconnected from the page.
        route: '/dashboard',
        whatFor: 'GMAO complet pour l\'agroalimentaire — pilotage maintenance, conformité HACCP, équipe, achats.',
        howTo: 'Ce tour vous montre chaque fonctionnalité une par une. Le projecteur se déplace tout seul vers l\'endroit dont je parle. « Suivant » pour avancer, « Passer » à tout moment.',
        helps: 'À la fin, vous saurez précisément où cliquer pour piloter votre usine.',
        align: 'Vos techniciens et opérateurs voient des interfaces simplifiées adaptées à leur rôle — vous avez l\'agrégation complète.',
    },

    // ─── Dashboard ───
    {
        icon: LayoutDashboard, color: '#3b82f6',
        title: 'Tableau de bord',
        selector: '[data-tour="admin-actions"]', route: '/dashboard',
        whatFor: 'Page d\'accueil — votre poste de pilotage : centre d\'action en haut, KPI globaux au milieu, graphiques et historique en bas.',
        howTo: 'Vous arrivez ici à chaque connexion. Les tuiles « À traiter » vous disent ce qui doit être fait maintenant. Les KPI résument l\'état du parc. Cliquez n\'importe quelle carte pour ouvrir la page liée.',
        helps: 'Vous voyez en 5 secondes : ce qui brûle, où concentrer vos efforts, ce qui coûte le plus, et ce qui s\'améliore.',
        align: 'C\'est votre vue exclusive — techniciens et opérateurs ont leur propre tableau de bord adapté.',
        demo: [
            // ── Toolbar : Power BI report button — first thing the admin sees ──
            { type: 'move', selector: '[data-tour="admin-toolbar"]', wait: 500 },
            { type: 'caption', text: 'En haut, votre bandeau de bord. Le bouton orange à droite « Générer rapport Power BI » télécharge un PDF multi-pages complet du parc — KPI, pannes, coûts, criticité, méthodologie. Idéal pour vos réunions hebdo.', ms: 7500 },
            { type: 'move', selector: '[data-tour="admin-report-export"]', wait: 400 },
            { type: 'caption', text: 'Je clique pour vous montrer — un seul clic et le PDF est généré côté navigateur puis téléchargé.', ms: 4500 },
            // pretend-click instead of click so the demo doesn't actually
            // trigger a real PDF download every time the tutorial plays.
            { type: 'pretend-click', selector: '[data-tour="admin-report-export"]', wait: 1200 },
            { type: 'caption', text: 'Le PDF apparaît dans vos téléchargements. Aucune saisie nécessaire — il puise les chiffres en temps réel dans la base.', ms: 5000 },

            // ── Top: "À traiter" command center — walk each tile ──
            { type: 'move', selector: '[data-tour="admin-actions"]', wait: 400 },
            { type: 'caption', text: 'Section À traiter en haut. Votre centre d\'action. Chaque tuile compte un type de problème qui demande votre attention maintenant.', ms: 3500 },
            { type: 'move', selector: '[data-tour="admin-actions"] a:nth-of-type(1)', wait: 350 },
            { type: 'caption', text: 'Première tuile : bons de commande en attente de votre approbation.', ms: 2900 },
            { type: 'move', selector: '[data-tour="admin-actions"] a:nth-of-type(2)', wait: 350 },
            { type: 'caption', text: 'Deuxième tuile : interventions à valider. Un technicien a terminé, vous clôturez.', ms: 3000 },
            { type: 'move', selector: '[data-tour="admin-actions"] a:nth-of-type(3)', wait: 350 },
            { type: 'caption', text: 'Troisième tuile : plans préventifs en retard. Ne laissez pas la dette technique s\'accumuler.', ms: 3200 },
            { type: 'move', selector: '[data-tour="admin-actions"] a:nth-of-type(4)', wait: 350 },
            { type: 'caption', text: 'Quatrième tuile : pièces en stock critique. Sous le seuil mini, à recommander avant rupture.', ms: 3200 },
            { type: 'move', selector: '[data-tour="admin-actions"] a:nth-of-type(5)', wait: 350 },
            { type: 'caption', text: 'Cinquième tuile : machines actuellement en panne. Je clique pour ouvrir le mur de salle de contrôle.', ms: 3300 },
            { type: 'click', selector: '[data-tour="admin-actions"] a:nth-of-type(5)', pulse: true, wait: 1400 },
            { type: 'caption', text: 'La page Machines s\'ouvre avec le filtre « statut = en panne » déjà appliqué. Seules les machines hors-service s\'affichent.', ms: 4500 },
            { type: 'navigate', route: '/dashboard', wait: 1200 },
            // ── KPI grid — walk all 11 and click the most important ones ──
            { type: 'move', selector: '[data-tour="admin-kpis"]', wait: 400 },
            { type: 'caption', text: 'En dessous, les KPI. Onze cartes qui résument l\'état réel de l\'usine. Chaque carte est cliquable.', ms: 3700 },
            { type: 'move', selector: '.kpi-card:nth-of-type(1)', wait: 300 },
            { type: 'caption', text: 'Première carte : total des machines dans le parc.', ms: 2700 },
            { type: 'move', selector: '.kpi-card:nth-of-type(2)', wait: 300 },
            { type: 'caption', text: 'Deuxième carte : machines opérationnelles. Celles qui produisent en ce moment.', ms: 2900 },
            { type: 'move', selector: '.kpi-card:nth-of-type(3)', wait: 300 },
            { type: 'caption', text: 'Troisième carte : machines en panne. Je clique pour voir la liste filtrée.', ms: 3000 },
            { type: 'click', selector: '.kpi-card:nth-of-type(3)', pulse: true, wait: 1400 },
            { type: 'caption', text: 'La page Machines s\'ouvre avec le filtre statut « en panne » déjà appliqué. Toutes les machines hors-service visibles immédiatement.', ms: 3900 },
            { type: 'navigate', route: '/dashboard', wait: 1200 },
            { type: 'move', selector: '.kpi-card:nth-of-type(4)', wait: 300 },
            { type: 'caption', text: 'Quatrième carte : interventions totales. Je clique pour ouvrir la liste complète.', ms: 3000 },
            { type: 'click', selector: '.kpi-card:nth-of-type(4)', pulse: true, wait: 1400 },
            { type: 'caption', text: 'La page Interventions s\'affiche, avec tous les ordres de travail et leurs filtres.', ms: 3300 },
            { type: 'navigate', route: '/dashboard', wait: 1200 },
            { type: 'move', selector: '.kpi-card:nth-of-type(5)', wait: 300 },
            { type: 'caption', text: 'Cinquième carte : interventions en cours. Celles qu\'un technicien est en train de traiter.', ms: 3100 },
            { type: 'move', selector: '.kpi-card:nth-of-type(6)', wait: 300 },
            { type: 'caption', text: 'Sixième carte : MTBF moyen. Heures entre deux pannes. Plus c\'est haut, mieux c\'est.', ms: 3100 },
            { type: 'move', selector: '.kpi-card:nth-of-type(7)', wait: 300 },
            { type: 'caption', text: 'Septième carte : MTTR moyen. Temps moyen pour réparer une panne. Plus c\'est bas, mieux c\'est.', ms: 3200 },
            { type: 'move', selector: '.kpi-card:nth-of-type(8)', wait: 300 },
            { type: 'caption', text: 'Huitième carte : disponibilité. Pourcentage du temps où les machines tournent réellement. Je clique pour voir l\'analyse FMD complète.', ms: 3700 },
            { type: 'click', selector: '.kpi-card:nth-of-type(8)', pulse: true, wait: 1500 },
            { type: 'caption', text: 'Onglet Analyse FMD ouvert directement. Vous voyez MTBF, MTTR, disponibilité, nombre de pannes et arrêt total par machine.', ms: 4200 },
            { type: 'navigate', route: '/dashboard', wait: 1200 },
            { type: 'move', selector: '.kpi-card:nth-of-type(9)', wait: 300 },
            { type: 'caption', text: 'Neuvième carte : coût total de maintenance du mois. Je clique pour ouvrir l\'analyse économique.', ms: 3400 },
            { type: 'click', selector: '.kpi-card:nth-of-type(9)', pulse: true, wait: 1500 },
            { type: 'caption', text: 'Onglet Analyse Économique ouvert. Coût par machine, répartition par type d\'OT, détail des coûts. C\'est ici que vous justifiez les budgets.', ms: 4200 },
            { type: 'navigate', route: '/dashboard', wait: 1200 },
            { type: 'move', selector: '.kpi-card:nth-of-type(10)', wait: 300 },
            { type: 'caption', text: 'Dixième carte : machines critiques. Je clique pour ouvrir le classement par score de criticité.', ms: 3500 },
            { type: 'click', selector: '.kpi-card:nth-of-type(10)', pulse: true, wait: 1500 },
            { type: 'caption', text: 'Onglet Machines Critiques ouvert. Classement, formule de criticité et machines à surveiller en priorité.', ms: 3700 },
            { type: 'navigate', route: '/dashboard', wait: 1200 },
            { type: 'move', selector: '.kpi-card:nth-of-type(11)', wait: 300 },
            { type: 'caption', text: 'Onzième carte : TRS global. Le produit de la disponibilité, de la performance et de la qualité.', ms: 3300 },
            // ── Atelier filter — actually CHANGE the value (positional pick) ──
            { type: 'move', selector: '[data-tour="admin-atelier"]', wait: 400 },
            { type: 'caption', text: 'Au-dessus des graphiques : un filtre par atelier. Je le change pour vous montrer comment tous les graphiques se recalculent en direct.', ms: 4000 },
            // Pick an atelier with broader data. Index 1 lands on Utilités
            // which has only support equipment (chaudière, compresseur) and
            // few interventions logged — charts come out empty. Index 3 is
            // typically a production-line atelier with much more activity.
            { type: 'select', selector: '[data-tour="admin-atelier"]', index: 3, wait: 1500 },
            { type: 'caption', text: 'Filtre appliqué. Maintenant je cursor-walk chaque graphique pour vous montrer le changement.', ms: 3700 },
            // Walk all six charts so the user sees the cursor land on each AFTER the filter
            { type: 'move', selector: '[data-tour="admin-charts"] .card:nth-of-type(1)', wait: 700 },
            { type: 'caption', text: 'Premier graphique : pannes par mois. Moins de barres et plus basses qu\'avant — il ne compte que les pannes de cet atelier.', ms: 4500 },
            { type: 'move', selector: '[data-tour="admin-charts"] .card:nth-of-type(2)', wait: 700 },
            { type: 'caption', text: 'Deuxième graphique : interventions par type. Les barres se sont raccourcies — moins d\'OT au total parce qu\'on a restreint le périmètre.', ms: 4500 },
            { type: 'move', selector: '[data-tour="admin-charts"] .card:nth-of-type(3)', wait: 700 },
            { type: 'caption', text: 'Troisième graphique : coût par machine. Seules les machines de cet atelier apparaissent.', ms: 4200 },
            { type: 'move', selector: '[data-tour="admin-charts"] .card:nth-of-type(4)', wait: 700 },
            { type: 'caption', text: 'Quatrième graphique : top 5 par criticité. Le radar n\'affiche que les machines de cet atelier.', ms: 4000 },
            { type: 'move', selector: '[data-tour="admin-charts"] .card:nth-of-type(5)', wait: 700 },
            { type: 'caption', text: 'Cinquième graphique : disponibilité par machine. La courbe ne couvre que les machines de l\'atelier sélectionné.', ms: 4200 },
            { type: 'move', selector: '[data-tour="admin-charts"] .card:nth-of-type(6)', wait: 700 },
            { type: 'caption', text: 'Sixième graphique : la part correctif vs préventif est recalculée elle aussi.', ms: 3700 },

            // ── Zoom Power BI focus mode ──
            { type: 'caption', text: 'Astuce Power BI : chaque graphique est zoomable. Je clique sur le premier pour vous montrer le mode focus plein écran.', ms: 5500 },
            { type: 'move', selector: '[data-tour="admin-charts"] .card:nth-of-type(1)', wait: 500 },
            { type: 'click', selector: '[data-tour="admin-charts"] .card:nth-of-type(1)', pulse: true, wait: 1500 },
            { type: 'caption', text: 'Le graphique s\'ouvre en plein écran avec tous les détails. Survolez les barres pour les tooltips précis. Cliquez en dehors ou Échap pour fermer.', ms: 7500 },
            { type: 'move', selector: '[data-tour="admin-zoom-close"]', wait: 600 },
            { type: 'click', selector: '[data-tour="admin-zoom-close"]', pulse: true, wait: 1200 },
            { type: 'caption', text: 'Retour à la vue normale. Vous pouvez zoomer n\'importe quel graphique pour le présenter en réunion.', ms: 4500 },

            { type: 'move', selector: '[data-tour="admin-atelier"]', wait: 500 },
            { type: 'caption', text: 'Je remets sur Tous les ateliers pour revenir à la vue globale.', ms: 3000 },
            { type: 'select', selector: '[data-tour="admin-atelier"]', value: 'all', wait: 900 },
            // ── Industry 4.0 widgets — Consommables interactive walk ──
            { type: 'move', selector: '[data-tour="admin-consommables"]', wait: 500 },
            { type: 'caption', text: 'En bas du tableau de bord, deux widgets industrie 4.0. À gauche : le suivi des consommables. Vérifiez en direct le niveau d\'huile, savon, papier, filtres.', ms: 4500 },
            { type: 'move', selector: '[data-tour="admin-consommables"] .card-header h3', wait: 350 },
            { type: 'caption', text: 'Chaque ligne représente un consommable avec sa barre d\'usure, un pourcentage et la durée estimée avant remplacement.', ms: 4000 },
            { type: 'move', selector: '[data-tour="cons-add"]', wait: 400 },
            { type: 'caption', text: 'Le bouton Ajouter en haut à droite permet d\'enregistrer un nouveau consommable à suivre.', ms: 3500 },
            { type: 'click', selector: '[data-tour="cons-add"]', pulse: true, wait: 1200 },
            { type: 'caption', text: 'Le formulaire s\'ouvre. Je remplis le nom et je choisis un atelier.', ms: 3500 },
            // Type for visual effect, then fire the escape hatch so the
            // form state is guaranteed populated before the save click —
            // the typing race used to leave the form blank → save fails →
            // cursor wanders to a row that never renders.
            { type: 'type', selector: '[data-tour="modal-body"] input:not([type="file"])', value: 'TUTO-DEMO consommable', wait: 400 },
            { type: 'event', eventName: 'smartmaint-demo-set-consumable-form', detail: { name: 'TUTO-DEMO consommable', atelier: 'Production' }, wait: 600 },
            { type: 'caption', text: 'Maintenant je clique sur Enregistrer pour créer réellement le consommable.', ms: 3500 },
            // Specific anchor cons-save instead of :last-of-type — the latter
            // can match the wrong button when multiple modal-footers stack
            // (rare but reproducible from a previous step's leftover modal).
            { type: 'move', selector: '[data-tour="cons-save"]', wait: 500 },
            { type: 'click', selector: '[data-tour="cons-save"]', pulse: true, wait: 1800 },
            { type: 'caption', text: 'Voilà, le consommable est créé et apparaît dans la liste.', ms: 3000 },
            // Target the row by its exact name attribute, then click the trash
            // button inside it. Far more reliable than positional selectors.
            { type: 'move', selector: '[data-tour="cons-row"][data-cons-name="TUTO-DEMO consommable"] [data-tour="cons-delete"]', wait: 600 },
            { type: 'caption', text: 'Maintenant je supprime mon consommable de démonstration en cliquant sur l\'icône poubelle de sa ligne.', ms: 3700 },
            { type: 'click', selector: '[data-tour="cons-row"][data-cons-name="TUTO-DEMO consommable"] [data-tour="cons-delete"]', pulse: true, wait: 900 },
            { type: 'caption', text: 'Confirmation de suppression — je valide.', ms: 2700 },
            { type: 'move', selector: '[data-tour="cons-delete-confirm"]', wait: 400 },
            { type: 'click', selector: '[data-tour="cons-delete-confirm"]', pulse: true, wait: 1500 },
            { type: 'caption', text: 'Supprimé. Voilà comment fonctionne le suivi des consommables : créer, surveiller la barre d\'usure, supprimer quand obsolète.', ms: 4500 },
            // ── Handover widget — show how to USE it ──
            { type: 'move', selector: '[data-tour="admin-handover"]', wait: 500 },
            { type: 'caption', text: 'À droite : le tableau des relèves de poste. Les messages laissés par les équipes entre les trois-huit.', ms: 4000 },
            { type: 'move', selector: '[data-tour="admin-handover"] .card > div:nth-of-type(2) > div:first-of-type', wait: 400 },
            { type: 'caption', text: 'Chaque carte montre le technicien sortant, l\'heure de fin, les tâches restantes avec leur priorité, et une note sur les particularités de la machine.', ms: 4700 },
            { type: 'caption', text: 'Voici comment l\'équipe arrivante prend en charge. Je clique sur le bouton vert « Pointer & accepter le poste ».', ms: 4200 },
            { type: 'move', selector: '[data-tour="handover-accept"]', wait: 500 },
            { type: 'click', selector: '[data-tour="handover-accept"]', pulse: true, wait: 1300 },
            { type: 'caption', text: 'Voilà. Le badge passe de « En attente » à « Accepté ». La carte sait maintenant que la relève est prise en charge.', ms: 4500 },
            { type: 'caption', text: 'Pour ne pas modifier vos données, je clique sur « annuler » dans le badge pour revenir à l\'état d\'origine.', ms: 4200 },
            { type: 'move', selector: '[data-tour="handover-revert"]', wait: 500 },
            { type: 'click', selector: '[data-tour="handover-revert"]', pulse: true, wait: 1200 },
            { type: 'caption', text: 'Le badge est revenu à « En attente ». L\'état est restauré exactement comme avant.', ms: 3800 },
        ],
    },

    // ─── Maintenance ───
    {
        icon: Cpu, color: '#0891b2',
        title: 'Machines',
        selector: '[data-tour="machines-grid"]', route: '/machines',
        whatFor: 'L\'inventaire complet de votre parc — chaque équipement avec son code, son atelier, son statut, sa criticité et son historique.',
        howTo: 'Cherchez par nom, filtrez par statut ou type, cliquez une carte pour ouvrir la fiche détaillée, ou « + Ajouter » pour créer une nouvelle machine.',
        helps: 'Toute la maintenance s\'articule autour de cette liste — chaque intervention, chaque pièce, chaque préventif y est rattaché.',
        align: 'Les techniciens consultent ces fiches en lecture seule. Les opérateurs scannent le QR au lieu de chercher.',
        demo: [
            // ─── Grid intro ───
            { type: 'move', selector: '[data-tour="machines-grid"]', wait: 400 },
            { type: 'caption', text: 'Bienvenue dans l\'inventaire des machines. Chaque carte représente un équipement de votre parc.', ms: 3700 },
            // ── Walk the first card's elements one by one ──
            { type: 'move', selector: '[data-tour="machines-grid"] .card:nth-of-type(1)', wait: 350 },
            { type: 'caption', text: 'Examinons la première carte ensemble. Vous y trouvez tout ce qu\'il faut savoir en un coup d\'œil.', ms: 3700 },
            { type: 'move', selector: '[data-tour="machines-grid"] .card:nth-of-type(1) img, [data-tour="machines-grid"] .card:nth-of-type(1) > div:first-of-type > div:first-of-type > div:first-of-type', wait: 400 },
            { type: 'caption', text: 'À gauche, la photo de la machine ou un avatar par défaut si aucune photo n\'a été ajoutée.', ms: 3400 },
            { type: 'move', selector: '[data-tour="machines-grid"] .card:nth-of-type(1) > div:first-of-type > div:first-of-type div:nth-of-type(2)', wait: 400 },
            { type: 'caption', text: 'À côté, le code de la machine en gras suivi de son nom complet juste en dessous.', ms: 3500 },
            { type: 'move', selector: '[data-tour="machines-grid"] .card:nth-of-type(1) span:first-of-type', wait: 400 },
            { type: 'caption', text: 'En haut à droite, le badge de statut. Vert pour opérationnelle, orange pour en maintenance, rouge pour en panne.', ms: 4200 },
            { type: 'move', selector: '[data-tour="machines-grid"] .card:nth-of-type(1) > div:first-of-type > div:nth-of-type(2)', wait: 400 },
            { type: 'caption', text: 'En dessous, l\'atelier de localisation et le coût d\'arrêt par heure en dirhams. Cette information dimensionne l\'urgence en cas de panne.', ms: 4500 },
            { type: 'move', selector: '[data-tour="machines-grid"] .card:nth-of-type(1) > div:nth-of-type(2)', wait: 400 },
            { type: 'caption', text: 'En bas, le badge de criticité avec le score numérique. Plus il est élevé, plus la machine est critique pour la production.', ms: 4500 },
            // ─── Search — clear then real type then clear ───
            { type: 'move', selector: '[data-tour="machines-search"] input', wait: 400 },
            { type: 'caption', text: 'Passons aux outils de recherche. La barre en haut filtre instantanément par code ou nom.', ms: 3700 },
            { type: 'type', selector: '[data-tour="machines-search"] input', value: 'rem', wait: 300 },
            { type: 'caption', text: 'Je tape « rem ». La grille ne montre plus que les machines dont le code ou le nom contient ces lettres.', ms: 4000 },
            { type: 'move', selector: '[data-tour="machines-grid"] .card:nth-of-type(1)', wait: 400 },
            { type: 'caption', text: 'Voyez le résultat : un sous-ensemble très réduit. Très utile quand vous savez ce que vous cherchez.', ms: 3700 },
            { type: 'type', selector: '[data-tour="machines-search"] input', value: '', wait: 300 },
            { type: 'caption', text: 'J\'efface la recherche pour revenir à la grille complète.', ms: 2900 },
            // ─── Filter status — REAL change + walk filtered result ───
            { type: 'move', selector: '[data-tour="machines-filter-status"]', wait: 400 },
            { type: 'caption', text: 'Filtre par statut. Je vais choisir « en panne » pour cibler les actions urgentes.', ms: 3500 },
            { type: 'select', selector: '[data-tour="machines-filter-status"]', value: 'en panne', wait: 900 },
            { type: 'move', selector: '[data-tour="machines-grid"]', wait: 500 },
            { type: 'caption', text: 'La grille s\'est instantanément réduite aux machines en panne. C\'est votre liste de priorité du jour.', ms: 4000 },
            { type: 'select', selector: '[data-tour="machines-filter-status"]', value: 'all', wait: 600 },
            { type: 'caption', text: 'Je remets sur « Tous » pour revenir à la vue complète.', ms: 2900 },
            // ─── Filter type — REAL change + walk filtered result ───
            { type: 'move', selector: '[data-tour="machines-filter-type"]', wait: 400 },
            { type: 'caption', text: 'Filtre par famille d\'équipement — réception, production, remplissage, conditionnement. Je change la sélection.', ms: 4000 },
            { type: 'select', selector: '[data-tour="machines-filter-type"]', index: 1, wait: 1100 },
            { type: 'move', selector: '[data-tour="machines-grid"]', wait: 500 },
            { type: 'caption', text: 'La grille ne montre que les équipements de cette famille. Utile pour gérer par poste de production.', ms: 4000 },
            { type: 'select', selector: '[data-tour="machines-filter-type"]', value: 'all', wait: 700 },
            // ─── Open detail page by clicking the eye icon ───
            { type: 'move', selector: '[data-tour="machines-grid"] .card:nth-of-type(1) a', wait: 400 },
            { type: 'caption', text: 'Maintenant je clique sur l\'icône œil de la première carte pour ouvrir le carnet de santé de la machine.', ms: 4000 },
            { type: 'click', selector: '[data-tour="machines-grid"] .card:nth-of-type(1) a', pulse: true, wait: 3200 },
            // 3.2 s is enough for Next.js to swap the route + DataContext
            // to land + the machine page to mount past the "Chargement…"
            // gate. Without this wait the cursor used to look like it
            // disappeared because waitForElement timed out on md-info.
            // ── Detail page walk ──
            { type: 'move', selector: '[data-tour="md-info"]', wait: 500 },
            { type: 'caption', text: 'Le carnet de santé s\'ouvre. En haut, le bandeau avec le nom et les deux badges : statut opérationnel et niveau de criticité.', ms: 4500 },
            { type: 'move', selector: '[data-tour="md-info"] > div:nth-of-type(2)', wait: 400 },
            { type: 'caption', text: 'Une grille d\'informations clés : code, type d\'équipement, emplacement, date d\'installation, coût d\'arrêt par heure et indice d\'importance sur 10.', ms: 5000 },
            { type: 'move', selector: '[data-tour="md-qr"]', wait: 400 },
            { type: 'caption', text: 'À droite, le QR code unique de cette machine. Imprimez-le et collez-le sur l\'équipement pour que les techniciens le scannent.', ms: 4500 },
            { type: 'move', selector: '[data-tour="md-kpis"]', wait: 400 },
            { type: 'caption', text: 'En dessous, les indicateurs clés de performance — MTBF, MTTR, disponibilité, nombre de pannes, coût total de maintenance.', ms: 4500 },
            { type: 'move', selector: '[data-tour="md-kpis"] .kpi-card:nth-of-type(1)', wait: 350 },
            { type: 'caption', text: 'Première carte : MTBF — temps moyen entre deux pannes. Plus c\'est haut, plus la machine est fiable.', ms: 4000 },
            { type: 'move', selector: '[data-tour="md-kpis"] .kpi-card:nth-of-type(2)', wait: 350 },
            { type: 'caption', text: 'Deuxième carte : MTTR — temps moyen pour réparer. Plus c\'est bas, plus l\'équipe est réactive.', ms: 4000 },
            { type: 'move', selector: '[data-tour="md-kpis"] .kpi-card:nth-of-type(3)', wait: 350 },
            { type: 'caption', text: 'Troisième carte : disponibilité — pourcentage du temps où la machine est opérationnelle. Votre objectif est de tendre vers 95 % minimum.', ms: 4700 },
            { type: 'move', selector: '[data-tour="md-plans"]', wait: 500 },
            { type: 'caption', text: 'En dessous, les plans de maintenance préventive associés à cette machine. Vous voyez la fréquence et la prochaine échéance de chaque plan.', ms: 4700 },
            { type: 'move', selector: '[data-tour="md-history"]', wait: 500 },
            { type: 'caption', text: 'En bas, l\'historique complet des interventions sur cette machine. Date, type, description, technicien, durée, coût et statut.', ms: 4700 },
            // ── Back to grid ──
            { type: 'navigate', route: '/machines', wait: 1300 },
            { type: 'caption', text: 'Retour à la liste. Maintenant je vais créer une nouvelle machine de démonstration, l\'enregistrer, puis la supprimer — pour vous montrer tout le cycle.', ms: 5000 },
            // ── Create flow ──
            { type: 'move', selector: '[data-tour="page-add"]', wait: 400 },
            { type: 'caption', text: 'Le bouton bleu Ajouter une machine en haut à droite.', ms: 2900 },
            { type: 'click', selector: '[data-tour="page-add"]', pulse: true, wait: 1300 },
            { type: 'caption', text: 'Le formulaire s\'ouvre. Je remplis le code unique, le nom complet, l\'atelier et le lieu pour vous montrer.', ms: 4500 },
            // Fill all fields in one shot via the escape hatch. Per-input
            // `type` actions were racing React state in this multi-tab
            // form AND sending the cursor off-screen under page zoom <100%.
            // Single event = single React state update = predictable.
            { type: 'event', eventName: 'smartmaint-demo-set-machine-form', detail: { code: 'TUTO-DEMO', name: 'Machine de démonstration tutoriel', type: 'Production', workshop: 'Ligne de démonstration', location: 'Hall production — démo tutoriel' }, wait: 800 },
            // Briefly show the cursor parking on the code input so the user
            // sees where the form was filled in.
            { type: 'move', selector: '[data-tour="modal-body"] input:not([type="file"])', wait: 600 },
            { type: 'caption', text: 'Tous les champs essentiels sont remplis. Je clique sur Enregistrer.', ms: 3500 },
            { type: 'move', selector: '[data-tour="machine-form-save"]', wait: 700 },
            { type: 'click', selector: '[data-tour="machine-form-save"]', pulse: true, wait: 2200 },
            { type: 'caption', text: 'La machine est créée et apparaît dans la grille avec son propre QR code unique. Je la cherche pour la supprimer ensuite.', ms: 4500 },
            // ── Delete via search + trash ──
            { type: 'type', selector: '[data-tour="machines-search"] input', value: 'TUTO-DEMO', wait: 600 },
            { type: 'caption', text: 'Je filtre par TUTO-DEMO pour l\'isoler immédiatement.', ms: 3000 },
            { type: 'move', selector: '[data-tour="machines-card"][data-machine-code="TUTO-DEMO"]', wait: 400 },
            { type: 'caption', text: 'La voilà. Maintenant je clique sur l\'icône poubelle rouge en bas à droite de la carte.', ms: 3700 },
            { type: 'click', selector: '[data-tour="machines-card"][data-machine-code="TUTO-DEMO"] [data-tour="machines-card-delete"]', pulse: true, wait: 900 },
            { type: 'caption', text: 'Une confirmation s\'ouvre pour éviter les suppressions accidentelles. Je confirme.', ms: 3500 },
            { type: 'move', selector: '[data-tour="machine-delete-confirm"]', wait: 400 },
            { type: 'click', selector: '[data-tour="machine-delete-confirm"]', pulse: true, wait: 1500 },
            { type: 'caption', text: 'Machine supprimée. J\'efface la recherche pour revenir à l\'état initial.', ms: 3500 },
            { type: 'type', selector: '[data-tour="machines-search"] input', value: '', wait: 400 },
        ],
    },
    {
        icon: Wrench, color: '#22c55e',
        title: 'Interventions',
        selector: '[data-tour="intv-tabs"]', route: '/interventions',
        whatFor: 'Tous les ordres de travail — créés, en cours, terminés, clôturés. Quatre statuts, quatre types : correctif, préventif, conditionnel, amélioratif.',
        howTo: 'Filtrez par statut en haut, choisissez votre vue (Tableau / Kanban / Calendrier), cherchez par texte, puis « Planifier une intervention » pour en créer une nouvelle.',
        helps: 'Le poumon du GMAO. C\'est ici que vous voyez la charge réelle de l\'équipe, qui fait quoi, et ce qui attend votre validation.',
        align: 'L\'OT que vous créez ici apparaît instantanément dans le Kanban du technicien assigné.',
        demo: [
            // ─── TOOLBAR walk ───────────────────────────────
            { type: 'move', selector: '[data-tour="intv-tabs"]', wait: 400 },
            { type: 'caption', text: 'Bienvenue dans le module Interventions — le cœur du GMAO. Commençons par la barre d\'outils du haut.', ms: 4200 },
            { type: 'move', selector: '[data-tour="intv-tab-all"]', wait: 350 },
            { type: 'caption', text: 'Premier onglet : Toutes. Affiche chaque ordre de travail, quel que soit son statut. C\'est la vue par défaut.', ms: 4200 },
            { type: 'click', selector: '[data-tour="intv-tab-all"]', pulse: true, wait: 800 },
            { type: 'move', selector: '[data-tour="intv-tab-inprogress"]', wait: 350 },
            { type: 'caption', text: 'Deuxième onglet : En cours. Limite la liste aux OT planifiés ou en cours — ce que l\'équipe traite aujourd\'hui.', ms: 4500 },
            { type: 'click', selector: '[data-tour="intv-tab-inprogress"]', pulse: true, wait: 900 },
            { type: 'move', selector: '[data-tour="intv-table"]', wait: 400 },
            { type: 'caption', text: 'Voyez le résultat dans le tableau : moins de lignes, uniquement les OT actifs. Idéal pour le briefing du matin.', ms: 4400 },
            { type: 'move', selector: '[data-tour="intv-tab-validate"]', wait: 350 },
            { type: 'caption', text: 'Troisième onglet : À valider. Les OT que le technicien a marqués terminée. Vous validez ici pour les clôturer définitivement.', ms: 4700 },
            { type: 'click', selector: '[data-tour="intv-tab-validate"]', pulse: true, wait: 900 },
            { type: 'click', selector: '[data-tour="intv-tab-all"]', pulse: true, wait: 700 },

            // ─── SEARCH ────────────────────────────────────
            { type: 'move', selector: '[data-tour="intv-search"] input', wait: 400 },
            { type: 'caption', text: 'À côté des onglets, la recherche. Elle filtre instantanément sur description, identifiant d\'OT, code machine ou nom du technicien.', ms: 4500 },
            { type: 'type', selector: '[data-tour="intv-search"] input', value: 'fuite', wait: 400 },
            { type: 'move', selector: '[data-tour="intv-table"]', wait: 500 },
            { type: 'caption', text: 'Je tape « fuite » et la liste se réduit aux ordres de travail dont la description contient ce mot. Très utile pour retrouver un incident rapidement.', ms: 5000 },
            { type: 'type', selector: '[data-tour="intv-search"] input', value: '', wait: 400 },
            { type: 'caption', text: 'J\'efface pour revenir à la vue complète.', ms: 2800 },

            // ─── VIEW SWITCHER ─────────────────────────────
            { type: 'move', selector: '[data-tour="intv-views"]', wait: 400 },
            { type: 'caption', text: 'Trois vues du même contenu sont disponibles à droite : Tableau, Kanban, Calendrier. Le choix dépend de votre besoin.', ms: 4500 },

            // ─── TABLE VIEW walk ──────────────────────────
            { type: 'move', selector: '[data-tour="intv-view-table"]', wait: 350 },
            { type: 'caption', text: 'Commençons par la vue Tableau — c\'est la plus dense en information.', ms: 3500 },
            { type: 'move', selector: '[data-tour="intv-table"] thead', wait: 400 },
            { type: 'caption', text: 'Les colonnes : Machine, Type, Description, Technicien, Date, Durée, Statut, Actions. Tout ce qu\'il faut pour piloter.', ms: 4700 },
            { type: 'move', selector: '[data-tour="intv-table"] tbody tr:first-of-type', wait: 400 },
            { type: 'caption', text: 'Chaque ligne représente un ordre de travail. Je vais vous montrer un peu plus loin comment cliquer pour démarrer, terminer et valider — sur l\'OT de démonstration que je créerai.', ms: 5700 },
            { type: 'move', selector: '[data-tour="intv-table"] tbody tr:first-of-type td:nth-of-type(2) span', wait: 400 },
            { type: 'caption', text: 'Le type est codé par couleur — rouge pour correctif, vert pour préventif, orange conditionnel, bleu amélioratif.', ms: 4700 },
            { type: 'move', selector: '[data-tour="intv-table"] tbody tr:first-of-type td:nth-of-type(7)', wait: 400 },
            { type: 'caption', text: 'Le badge de statut à droite : planifiée, en cours, terminée, clôturée. Chaque statut a sa couleur.', ms: 4300 },
            { type: 'move', selector: '[data-tour="intv-table"] tbody tr:first-of-type td:last-of-type', wait: 400 },
            { type: 'caption', text: 'Dans la colonne Actions, l\'icône poubelle rouge pour supprimer. Le bouton Valider apparaît uniquement sur les OT terminés.', ms: 4700 },

            // ─── KANBAN VIEW ───────────────────────────────
            { type: 'move', selector: '[data-tour="intv-view-kanban"]', wait: 400 },
            { type: 'caption', text: 'Passons maintenant à la vue Kanban — pour gérer le flux par glisser-déposer.', ms: 3700 },
            { type: 'click', selector: '[data-tour="intv-view-kanban"]', pulse: true, wait: 1200 },
            { type: 'move', selector: '[data-tour="intv-kanban"]', wait: 400 },
            { type: 'caption', text: 'Quatre colonnes représentant les quatre statuts. Le compteur en haut de chaque colonne montre le nombre d\'OT.', ms: 4700 },
            { type: 'move', selector: '[data-tour="intv-col-planifiee"]', wait: 400 },
            { type: 'caption', text: 'Colonne Planifiée — les OT en attente d\'exécution.', ms: 3500 },
            { type: 'move', selector: '[data-tour="intv-col-en-cours"]', wait: 400 },
            { type: 'caption', text: 'Colonne En cours — les OT que le technicien traite actuellement.', ms: 3700 },
            { type: 'move', selector: '[data-tour="intv-col-terminee"]', wait: 400 },
            { type: 'caption', text: 'Colonne Terminée — le technicien a fini, mais ça attend votre validation pour passer en clôturée.', ms: 4500 },
            { type: 'move', selector: '[data-tour="intv-col-cloturee"]', wait: 400 },
            { type: 'caption', text: 'Colonne Clôturée — l\'OT est validé et archivé. Le cycle de vie est terminé.', ms: 4000 },
            { type: 'move', selector: '[data-tour="intv-col-planifiee"] [draggable="true"]:first-of-type', wait: 400 },
            { type: 'caption', text: 'Chaque carte Kanban montre l\'essentiel : code machine, description courte, type et durée. Pour la déplacer, glissez-la simplement.', ms: 5000 },
            { type: 'caption', text: 'Je vous montre le glisser-déposer : je prends une carte de Planifiée et je la dépose dans En cours.', ms: 4500 },
            { type: 'drag', selector: '[data-tour="intv-col-planifiee"] [draggable="true"]:first-of-type', target: '[data-tour="intv-col-en-cours"]', wait: 1500 },
            { type: 'caption', text: 'Voilà — le statut a changé en base de données instantanément. Le technicien reçoit la notification.', ms: 4500 },
            { type: 'caption', text: 'Je la remets dans Planifiée pour ne pas modifier vos données.', ms: 3500 },
            { type: 'drag', selector: '[data-tour="intv-col-en-cours"] [draggable="true"]:first-of-type', target: '[data-tour="intv-col-planifiee"]', wait: 1500 },
            { type: 'caption', text: 'Retour à l\'origine. Maintenant je clique simplement sur une carte pour voir son détail complet.', ms: 4200 },
            { type: 'click', selector: '[data-tour="intv-col-planifiee"] [draggable="true"]:first-of-type', pulse: true, wait: 1700 },
            { type: 'caption', text: 'Le compte-rendu de l\'intervention s\'ouvre — rapport du technicien, durée prévue versus réelle, coût et technicien assigné.', ms: 5300 },
            // Close via event hatch — synthetic ESC isn't always trusted by
            // the SlideOver's onKeyDown.
            { type: 'event', eventName: 'smartmaint-demo-close-validation', detail: {}, wait: 700 },
            { type: 'caption', text: 'Je ferme le panneau pour continuer.', ms: 2700 },

            // ─── CALENDAR VIEW ────────────────────────────
            { type: 'move', selector: '[data-tour="intv-view-calendar"]', wait: 400 },
            { type: 'caption', text: 'Passons maintenant à la vue Calendrier — pour visualiser la charge dans le temps.', ms: 3700 },
            { type: 'click', selector: '[data-tour="intv-view-calendar"]', pulse: true, wait: 1200 },
            // Jump to a past month that's guaranteed to have interventions
            // (the demo data sits in April-May 2025-2026 depending on
            // installation date). Without this the current month often
            // shows zero events and the drag demo has nothing to grab.
            { type: 'event', eventName: 'smartmaint-demo-set-cal-month', detail: { offset: -1 }, wait: 600 },
            { type: 'move', selector: '[data-tour="intv-calendar"]', wait: 400 },
            { type: 'caption', text: 'Grille mensuelle. Chaque case correspond à un jour ; les chips colorées sont les ordres de travail planifiés ce jour-là.', ms: 5000 },
            { type: 'move', selector: '[data-tour="intv-calendar"] [draggable="true"]:first-of-type', wait: 400 },
            { type: 'caption', text: 'Je clique sur un événement existant pour ouvrir son détail.', ms: 3200 },
            { type: 'click', selector: '[data-tour="intv-calendar"] [draggable="true"]:first-of-type', pulse: true, wait: 1700 },
            { type: 'caption', text: 'Même panneau de compte-rendu que depuis le Kanban — rapport, durée prévue versus réelle, coût, technicien.', ms: 5000 },
            // Close via event hatch — the SlideOver's onClose listens for
            // ESC but synthetic Escape isn't always trusted; the hatch is
            // bulletproof.
            { type: 'event', eventName: 'smartmaint-demo-close-validation', detail: {}, wait: 700 },
            { type: 'caption', text: 'Je ferme le panneau.', ms: 2400 },
            { type: 'caption', text: 'Le calendrier supporte aussi le glisser-déposer pour reprogrammer un OT. Regardez.', ms: 4000 },
            { type: 'drag', selector: '[data-tour="intv-calendar"] [draggable="true"]:first-of-type', target: '[data-tour="intv-calendar"] > div:last-of-type > div:nth-of-type(20)', wait: 1500 },
            { type: 'caption', text: 'L\'OT a changé de date. Le technicien reçoit la nouvelle date automatiquement.', ms: 4000 },
            { type: 'caption', text: 'Je le remets à sa date d\'origine pour ne pas modifier vos données.', ms: 3500 },
            { type: 'drag', selector: '[data-tour="intv-calendar"] [draggable="true"]:first-of-type', target: '[data-tour="intv-calendar"] > div:last-of-type > div:nth-of-type(15)', wait: 1500 },
            { type: 'caption', text: 'Voilà, replanifié à sa date initiale.', ms: 3000 },

            // Back to table view
            { type: 'click', selector: '[data-tour="intv-view-table"]', pulse: true, wait: 900 },

            // ─── CREATE + DELETE cycle ────────────────────
            { type: 'move', selector: '[data-tour="page-add"]', wait: 400 },
            { type: 'caption', text: 'Pour créer un nouvel ordre de travail, le bouton vert Planifier une intervention en haut à droite.', ms: 4000 },
            { type: 'click', selector: '[data-tour="page-add"]', pulse: true, wait: 1400 },
            { type: 'caption', text: 'Le formulaire s\'ouvre en panneau latéral. Il est découpé en quatre sections — Détails, Affectation, Planification, Ressources.', ms: 5000 },
            // Use explicit anchors so the cursor goes to the EXACT description
            // input even when multiple SlideOver panels live in document.body.
            { type: 'move', selector: '[data-tour="plan-desc"]', wait: 500 },
            { type: 'caption', text: 'Première section : la description. C\'est le titre court qui résume l\'intervention.', ms: 3700 },
            { type: 'type', selector: '[data-tour="plan-desc"]', value: 'TUTO-DEMO — intervention de démonstration', wait: 600 },
            { type: 'caption', text: 'Description remplie. Le type de maintenance et le niveau d\'urgence se choisissent juste en dessous avec des boutons colorés.', ms: 4700 },
            { type: 'move', selector: '[data-tour="plan-machine"]', wait: 500 },
            { type: 'caption', text: 'Deuxième section : Affectation. Je choisis la machine concernée.', ms: 3700 },
            { type: 'select', selector: '[data-tour="plan-machine"]', index: 1, wait: 900 },
            { type: 'move', selector: '[data-tour="plan-tech"]', wait: 500 },
            { type: 'caption', text: 'Machine sélectionnée. Maintenant le technicien assigné.', ms: 3300 },
            { type: 'select', selector: '[data-tour="plan-tech"]', index: 1, wait: 900 },
            { type: 'caption', text: 'Technicien assigné. La troisième section — Planification — contient date, heure et durée estimée, avec des valeurs par défaut.', ms: 5000 },
            { type: 'move', selector: '[data-tour="plan-save"]', wait: 500 },
            { type: 'caption', text: 'Tout est prêt. Je clique sur Créer l\'intervention pour enregistrer l\'OT.', ms: 3700 },
            { type: 'click', selector: '[data-tour="plan-save"]', pulse: true, wait: 2200 },
            { type: 'caption', text: 'L\'ordre de travail est créé. Il apparaît dans la liste et le technicien assigné le voit instantanément dans son planning.', ms: 5000 },

            // ─── FULL LIFECYCLE WALK on the TUTO-DEMO row ───
            // Isolate it via search so the "first row" selector is unambiguous.
            { type: 'type', selector: '[data-tour="intv-search"] input', value: 'TUTO-DEMO', wait: 600 },
            { type: 'caption', text: 'Maintenant je vous montre tout le cycle de vie d\'un OT — démarrer, terminer, valider, clôturer — sur notre OT de démonstration.', ms: 5500 },
            { type: 'move', selector: '[data-tour="intv-table"] tbody tr:first-of-type', wait: 500 },
            { type: 'caption', text: 'Je clique sur la ligne pour ouvrir le panneau Ordre de travail.', ms: 3500 },
            { type: 'click', selector: '[data-tour="intv-table"] tbody tr:first-of-type', pulse: true, wait: 1700 },
            // Walk WO panel
            { type: 'move', selector: '[data-tour="wo-start"]', wait: 600 },
            { type: 'caption', text: 'Le panneau Ordre de travail s\'ouvre avec l\'OT au statut Planifiée. Le gros bouton orange Démarrer l\'ordre de travail enclenche le chrono.', ms: 5500 },
            { type: 'click', selector: '[data-tour="wo-start"]', pulse: true, wait: 1500 },
            { type: 'caption', text: 'Voilà — le statut passe à En cours. Le technicien est notifié et peut commencer.', ms: 4500 },
            // ── Add a spare part to show the parts workflow ──
            { type: 'move', selector: '[data-tour="wo-part-select"]', wait: 600 },
            { type: 'caption', text: 'Pendant l\'intervention, le technicien consomme des pièces. Je sélectionne une pièce dans le menu déroulant.', ms: 4700 },
            { type: 'select', selector: '[data-tour="wo-part-select"]', index: 1, wait: 800 },
            { type: 'move', selector: '[data-tour="wo-part-add"]', wait: 500 },
            { type: 'caption', text: 'La pièce est sélectionnée. Je laisse la quantité à 1 et je clique sur Ajouter.', ms: 4200 },
            { type: 'click', selector: '[data-tour="wo-part-add"]', pulse: true, wait: 1500 },
            { type: 'caption', text: 'Voilà — la pièce est enregistrée, le stock est décrémenté automatiquement et le coût matière apparaît dans le récapitulatif.', ms: 5500 },
            // Now the button becomes "Marquer comme terminé"
            { type: 'move', selector: '[data-tour="wo-finish"]', wait: 600 },
            { type: 'caption', text: 'Une fois la réparation faite, je clique sur Marquer comme terminé.', ms: 4000 },
            { type: 'click', selector: '[data-tour="wo-finish"]', pulse: true, wait: 1500 },
            { type: 'caption', text: 'Le statut passe à Terminée. L\'OT attend maintenant votre validation pour être clôturé.', ms: 4700 },
            // Now the button becomes "Valider et clôturer"
            { type: 'move', selector: '[data-tour="wo-validate-open"]', wait: 600 },
            { type: 'caption', text: 'Je clique sur Valider et clôturer pour ouvrir le compte-rendu.', ms: 4000 },
            { type: 'click', selector: '[data-tour="wo-validate-open"]', pulse: true, wait: 1700 },
            // Compte-rendu validation panel
            { type: 'move', selector: '[data-tour="wo-validate-confirm"]', wait: 600 },
            { type: 'caption', text: 'Le compte-rendu s\'affiche. Je vérifie le rapport, la durée prévue versus réelle et les coûts, puis je clique sur Valider et Clôturer.', ms: 5500 },
            { type: 'click', selector: '[data-tour="wo-validate-confirm"]', pulse: true, wait: 2000 },
            { type: 'caption', text: 'L\'OT est clôturé. Cycle de vie complet : Planifiée → En cours → Terminée → Clôturée.', ms: 5000 },

            // ─── DELETE the TUTO-DEMO row ────────────────
            { type: 'esc', wait: 500 },
            { type: 'caption', text: 'Maintenant je supprime l\'OT de démonstration pour ne pas polluer vos données.', ms: 4200 },
            { type: 'move', selector: '[data-tour="intv-table"] tbody tr:first-of-type', wait: 500 },
            { type: 'caption', text: 'Voilà la ligne TUTO-DEMO. Je clique sur l\'icône poubelle rouge dans la colonne Actions.', ms: 4500 },
            { type: 'click', selector: '[data-tour="intv-table"] tbody tr:first-of-type button:last-of-type', pulse: true, wait: 1200 },
            { type: 'move', selector: '[data-tour="intv-delete-confirm"]', wait: 500 },
            { type: 'caption', text: 'Une confirmation s\'ouvre. Je clique sur Supprimer pour valider.', ms: 3700 },
            { type: 'click', selector: '[data-tour="intv-delete-confirm"]', pulse: true, wait: 1700 },
            { type: 'caption', text: 'Supprimée. J\'efface la recherche pour revenir à l\'état initial.', ms: 3500 },
            { type: 'type', selector: '[data-tour="intv-search"] input', value: '', wait: 400 },
        ],
    },
    {
        icon: CalendarClock, color: '#f59e0b',
        title: 'Plans préventifs',
        selector: '[data-tour="plans-kpis"]', route: '/maintenance-plans',
        whatFor: 'Tâches récurrentes (graissage, contrôle, étalonnage, vidange) qui se déclenchent automatiquement à échéance — sans que vous y pensiez.',
        howTo: 'Définissez machine + fréquence (en jours). Le système calcule la prochaine échéance et génère l\'OT préventif quand la date arrive.',
        helps: 'Évitez les pannes : le préventif coûte 5× moins cher qu\'un correctif sur la même machine.',
        align: 'Les techniciens voient les OT préventifs apparaître automatiquement dans leur planning, comme tout autre OT.',
        demo: [
            // ── KPIs walk ──
            { type: 'move', selector: '[data-tour="plans-kpis"]', wait: 500 },
            { type: 'caption', text: 'En haut, trois KPI résument l\'état du préventif : Plans actifs, À générer, En retard.', ms: 4200 },
            { type: 'move', selector: '[data-tour="plans-kpis"] > div:nth-of-type(1)', wait: 400 },
            { type: 'caption', text: 'Plans actifs : le nombre total de plans en service. Désactiver un plan le sort de ce compteur sans le supprimer.', ms: 4800 },
            { type: 'move', selector: '[data-tour="plans-kpis"] > div:nth-of-type(2)', wait: 400 },
            { type: 'caption', text: 'À générer : plans dont l\'échéance arrive dans 7 jours ou moins. Devient orange dès qu\'il y a du travail — c\'est votre signal d\'action.', ms: 5500 },
            { type: 'move', selector: '[data-tour="plans-kpis"] > div:nth-of-type(3)', wait: 400 },
            { type: 'caption', text: 'En retard : plans dont l\'échéance est dépassée. Devient rouge si vous avez laissé glisser — à traiter en priorité absolue.', ms: 5200 },

            // ── Table walk ──
            { type: 'move', selector: '[data-tour="plans-table"]', wait: 400 },
            { type: 'caption', text: 'En dessous, le tableau de tous les plans. Colonnes : Machine, Intitulé, Fréquence, Dernier, Prochaine échéance, Statut, Actions.', ms: 5500 },
            { type: 'move', selector: '[data-tour="plans-table"] tbody tr:first-of-type', wait: 500 },
            { type: 'caption', text: 'Chaque ligne est triée par échéance la plus proche en premier — la plus urgente toujours en haut.', ms: 4500 },
            { type: 'caption', text: 'Le badge Statut a trois états : vert « À jour », orange « Échéance proche », rouge « En retard ».', ms: 4500 },
            { type: 'caption', text: 'À droite, les actions : Générer l\'OT, Modifier le plan, ou Supprimer.', ms: 3800 },

            // ── CREATE a plan ──
            { type: 'move', selector: '[data-tour="page-add"]', wait: 500 },
            { type: 'caption', text: 'Pour créer un nouveau plan préventif, le bouton bleu Nouveau plan en haut à droite.', ms: 4200 },
            { type: 'click', selector: '[data-tour="page-add"]', pulse: true, wait: 1500 },
            { type: 'caption', text: 'Le formulaire s\'ouvre. Quatre choses à renseigner : machine cible, intitulé, type, fréquence.', ms: 4800 },
            { type: 'move', selector: '[data-tour="plan-form-machine"]', wait: 500 },
            { type: 'caption', text: 'D\'abord la machine concernée par l\'entretien récurrent.', ms: 3500 },
            { type: 'select', selector: '[data-tour="plan-form-machine"]', index: 1, wait: 900 },
            { type: 'move', selector: '[data-tour="plan-form-title"]', wait: 500 },
            { type: 'caption', text: 'Ensuite l\'intitulé : court et explicite, ce qui apparaîtra dans l\'OT généré.', ms: 4000 },
            { type: 'type', selector: '[data-tour="plan-form-title"]', value: 'TUTO-DEMO plan préventif', wait: 600 },
            { type: 'caption', text: 'Le bloc Fréquence propose des préréglages : Hebdomadaire, Mensuel, Trimestriel, Semestriel, Annuel — ou un nombre de jours libre.', ms: 5500 },
            { type: 'move', selector: '[data-tour="plan-form-due"]', wait: 500 },
            { type: 'caption', text: '« Prochaine échéance » se calcule automatiquement mais reste modifiable. Pour la démo, je la cale sur aujourd\'hui — comme ça le plan est immédiatement « dû » et le bouton Générer apparaît.', ms: 7000 },
            { type: 'type', selector: '[data-tour="plan-form-due"]', value: '__TODAY__', wait: 600 },
            { type: 'move', selector: '[data-tour="plan-form-save"]', wait: 500 },
            { type: 'caption', text: 'Tout est prêt. Je clique sur Enregistrer.', ms: 3200 },
            { type: 'click', selector: '[data-tour="plan-form-save"]', pulse: true, wait: 2000 },
            { type: 'caption', text: 'Plan créé. Désormais, à chaque échéance, l\'OT préventif sera proposé automatiquement.', ms: 4500 },

            // ── GENERATE the OT manually from the demo row ──
            { type: 'move', selector: '[data-tour="plan-row"][data-plan-title="TUTO-DEMO plan préventif"]', wait: 600 },
            { type: 'caption', text: 'Voilà notre plan de démonstration — échéance aujourd\'hui, donc le bouton vert Générer est visible dans la colonne Actions.', ms: 6000 },
            { type: 'move', selector: '[data-tour="plan-row"][data-plan-title="TUTO-DEMO plan préventif"] [data-tour="plan-generate"]', wait: 600 },
            { type: 'caption', text: 'Ce bouton force la création de l\'OT préventif tout de suite, sans attendre l\'échéance — utile si la machine est de toute façon arrêtée, autant en profiter.', ms: 6500 },
            { type: 'caption', text: 'Je clique sur Générer.', ms: 2500 },
            { type: 'click', selector: '[data-tour="plan-row"][data-plan-title="TUTO-DEMO plan préventif"] [data-tour="plan-generate"]', pulse: true, wait: 2500 },
            { type: 'caption', text: 'L\'OT vient d\'être créé : un toast confirme « Intervention préventive créée », la date « Dernier » de la ligne passe à aujourd\'hui et la prochaine échéance se décale automatiquement.', ms: 6800 },
            { type: 'caption', text: 'L\'OT généré est désormais dans le module Interventions. Je vais vous le montrer puis le supprimer aussi.', ms: 5200 },

            // ── Navigate to Interventions to clean up the generated OT ──
            { type: 'navigate', route: '/interventions', wait: 1800 },
            { type: 'type', selector: '[data-tour="intv-search"] input', value: 'TUTO-DEMO plan préventif', wait: 800 },
            { type: 'move', selector: '[data-tour="intv-table"] tbody tr:first-of-type', wait: 600 },
            { type: 'caption', text: 'La voilà — l\'OT préventif issu du plan, libellé « [Préventif] TUTO-DEMO plan préventif », statut Planifiée.', ms: 5500 },
            { type: 'caption', text: 'Je le supprime pour rétablir l\'état initial.', ms: 3500 },
            { type: 'click', selector: '[data-tour="intv-table"] tbody tr:first-of-type button:last-of-type', pulse: true, wait: 1400 },
            { type: 'move', selector: '[data-tour="intv-delete-confirm"]', wait: 600 },
            { type: 'click', selector: '[data-tour="intv-delete-confirm"]', pulse: true, wait: 1700 },
            { type: 'type', selector: '[data-tour="intv-search"] input', value: '', wait: 500 },

            // ── Navigate back to Plans and delete the demo plan ──
            { type: 'navigate', route: '/maintenance-plans', wait: 1800 },
            { type: 'caption', text: 'Retour aux plans. Maintenant je supprime le plan de démonstration lui-même.', ms: 4500 },
            { type: 'move', selector: '[data-tour="plan-row"][data-plan-title="TUTO-DEMO plan préventif"] [data-tour="plan-delete"]', wait: 700 },
            { type: 'click', selector: '[data-tour="plan-row"][data-plan-title="TUTO-DEMO plan préventif"] [data-tour="plan-delete"]', pulse: true, wait: 1400 },
            { type: 'move', selector: '[data-tour="plan-delete-confirm"]', wait: 600 },
            { type: 'caption', text: 'Une confirmation s\'ouvre. Je clique sur Supprimer pour valider.', ms: 3700 },
            { type: 'click', selector: '[data-tour="plan-delete-confirm"]', pulse: true, wait: 1700 },
            { type: 'caption', text: 'Plan supprimé, OT supprimé — l\'état initial est entièrement rétabli.', ms: 4500 },
        ],
    },
    {
        icon: Briefcase, color: '#0891b2',
        title: 'Projets de maintenance',
        selector: '[data-tour="projet-new"]', route: '/projets',
        whatFor: 'Regroupez plusieurs OT sous un même projet — révision annuelle, grand arrêt de production, mise en service d\'une nouvelle machine — avec avancement, budget, échéance et responsables assignés.',
        howTo: 'Créez un projet, ajoutez-lui des tâches, associez-lui des machines et un chef de projet, suivez la barre d\'avancement en % au fil des tâches cochées. Un budget et une date-cible permettent d\'alerter en cas de dérive.',
        helps: 'Vous pilotez les gros chantiers (au-delà d\'un simple OT) sans quitter la GMAO — plus de tableur Excel séparé, tout est en base de données synchronisée.',
        align: 'L\'admin définit et suit le projet ; les techniciens voient les projets où ils sont assignés et peuvent cocher les tâches qui leur reviennent depuis leur écran.',
        demo: [
            { type: 'caption', text: 'Bienvenue dans Projets. Cette page centralise tous les gros chantiers de maintenance de l\'usine — au-delà des OT unitaires.', ms: 5500 },
            { type: 'caption', text: 'Les 4 tuiles en haut résument l\'état du portefeuille : nombre de projets, avancement moyen, budget cumulé, projets en retard.', ms: 6500 },
            { type: 'caption', text: 'En dessous, la barre de recherche + les filtres par statut : Tous, Planifié, En cours, Terminé, Annulé. Combinez avec la recherche par titre / pilote.', ms: 7500 },
            { type: 'caption', text: 'Chaque carte représente un projet : titre, description, avancement en %, budget, dates début / fin, priorité, statut, techniciens assignés.', ms: 8000 },
            { type: 'caption', text: 'Un projet en retard (échéance dépassée + statut ≠ Terminé) apparaît avec un liseré rouge et un badge « En retard ». Impossible de le rater.', ms: 7500 },
            // ── Create the demo project ──
            { type: 'move', selector: '[data-tour="projet-new"]', wait: 500 },
            { type: 'caption', text: 'Le bouton bleu « Nouveau projet » en haut à droite ouvre le formulaire de création. Je clique pour vous montrer.', ms: 6000 },
            { type: 'click', selector: '[data-tour="projet-new"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="projet-form-title"]', wait: 500 },
            { type: 'caption', text: 'Premier champ : le titre. C\'est le nom du chantier, court et parlant.', ms: 5000 },
            { type: 'type', selector: '[data-tour="projet-form-title"] input', value: 'TUTO-DEMO révision annuelle', wait: 1200 },
            { type: 'move', selector: '[data-tour="projet-form-description"]', wait: 500 },
            { type: 'caption', text: 'La description libre : objectifs, livrables, contraintes de sécurité — tout ce qui aide un nouveau venu à comprendre le chantier.', ms: 7000 },
            { type: 'type', selector: '[data-tour="projet-form-description"] textarea', value: 'Arrêt général — révision toutes lignes, budget serré, respect strict des règles HACCP.', wait: 1500 },
            { type: 'caption', text: 'En dessous : statut initial (Planifié), priorité, budget prévisionnel, dates de début et d\'échéance.', ms: 6000 },
            { type: 'caption', text: 'Puis le chef de projet, les machines concernées (chips cliquables) et les techniciens affectés (chips violettes) — tous filtrables depuis la même liste.', ms: 8000 },
            { type: 'move', selector: '[data-tour="projet-form-save"]', wait: 500 },
            { type: 'caption', text: 'Je clique sur « Créer le projet » pour enregistrer.', ms: 4000 },
            { type: 'click', selector: '[data-tour="projet-form-save"]', pulse: true, wait: 2200 },
            // ── Show the new card ──
            { type: 'move', selector: '[data-tour="projet-card"][data-projet-title="TUTO-DEMO révision annuelle"]', wait: 800 },
            { type: 'caption', text: 'Voilà notre projet de démo dans la liste. Bordure gauche bleue = Planifié. La barre de progression est à 0 %.', ms: 7000 },

            // ── LIFECYCLE STEP 1: passer en « En cours » ──
            { type: 'caption', text: 'Passons au CYCLE DE VIE : je clique sur le crayon pour éditer et faire passer le projet en « En cours ».', ms: 6500 },
            { type: 'move', selector: '[data-tour="projet-card"][data-projet-title="TUTO-DEMO révision annuelle"] [data-tour="projet-edit"]', wait: 600 },
            { type: 'click', selector: '[data-tour="projet-card"][data-projet-title="TUTO-DEMO révision annuelle"] [data-tour="projet-edit"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="projet-form-status"]', wait: 500 },
            { type: 'caption', text: 'Le champ Statut : je le passe de « Planifié » à « En cours » — le projet devient orange dans la liste.', ms: 6500 },
            { type: 'event', eventName: 'smartmaint-demo-set-projet-form', detail: { status: 'in-progress' }, wait: 800 },
            { type: 'move', selector: '[data-tour="projet-form-save"]', wait: 500 },
            { type: 'click', selector: '[data-tour="projet-form-save"]', pulse: true, wait: 2000 },
            { type: 'move', selector: '[data-tour="projet-card"][data-projet-title="TUTO-DEMO révision annuelle"]', wait: 700 },
            { type: 'caption', text: 'Bordure gauche maintenant orange, badge « EN COURS ». Sur le terrain, c\'est le signal aux techniciens que le chantier a démarré.', ms: 8000 },

            // ── LIFECYCLE STEP 2: marquer comme terminé ──
            { type: 'caption', text: 'À la fin du chantier, je repasse en édition pour marquer « Terminé ».', ms: 5500 },
            { type: 'move', selector: '[data-tour="projet-card"][data-projet-title="TUTO-DEMO révision annuelle"] [data-tour="projet-edit"]', wait: 600 },
            { type: 'click', selector: '[data-tour="projet-card"][data-projet-title="TUTO-DEMO révision annuelle"] [data-tour="projet-edit"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="projet-form-status"]', wait: 500 },
            { type: 'caption', text: 'Statut → « Terminé ». Le système horodate automatiquement la clôture pour l\'audit.', ms: 6500 },
            { type: 'event', eventName: 'smartmaint-demo-set-projet-form', detail: { status: 'completed' }, wait: 800 },
            { type: 'move', selector: '[data-tour="projet-form-save"]', wait: 500 },
            { type: 'click', selector: '[data-tour="projet-form-save"]', pulse: true, wait: 2000 },
            { type: 'move', selector: '[data-tour="projet-card"][data-projet-title="TUTO-DEMO révision annuelle"]', wait: 700 },
            { type: 'caption', text: 'Bordure verte, badge « TERMINÉ ». Le projet reste dans l\'historique — visible pour audit, KPI, retour d\'expérience.', ms: 8500 },
            { type: 'caption', text: 'Cas d\'usage typique L.C PROD : « Arrêt général usine du 15 août » avec 20 tâches sur 3 techniciens et budget 45 000 MAD — un projet, tout le monde aligné, suivi de A à Z.', ms: 10500 },

            // ── LIFECYCLE STEP 3: nettoyer la démo ──
            { type: 'move', selector: '[data-tour="projet-card"][data-projet-title="TUTO-DEMO révision annuelle"] [data-tour="projet-delete"]', wait: 700 },
            { type: 'caption', text: 'Je supprime le projet de démonstration pour rétablir l\'état initial.', ms: 4500 },
            { type: 'click', selector: '[data-tour="projet-card"][data-projet-title="TUTO-DEMO révision annuelle"] [data-tour="projet-delete"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="projet-delete-confirm"]', wait: 500 },
            { type: 'click', selector: '[data-tour="projet-delete-confirm"]', pulse: true, wait: 1800 },
            { type: 'caption', text: 'Projet supprimé. État initial rétabli.', ms: 3500 },
        ],
    },
    {
        icon: Workflow, color: '#06b6d4',
        title: 'Synoptique usine',
        selector: '[data-tour="synoptique-flow"]', route: '/synoptique',
        whatFor: 'Le plan visuel du process L.C PROD — réception → préparation → production → remplissage → conditionnement → expédition — avec l\'état live de chaque machine.',
        howTo: 'Suivez le flux gauche-droite. Cliquez une machine pour ouvrir sa fiche. Cliquez une pastille de statut en haut pour isoler toutes les machines de ce statut.',
        helps: 'Comprenez instantanément où se trouve le goulot d\'étranglement ou la machine bloquante du jour.',
        align: 'Vue d\'ensemble réservée à l\'admin — les autres rôles voient leur poste, pas tout le process.',
        demo: [
            // ── Live banner + status legend walk ──
            { type: 'move', selector: '[data-tour="synoptique-legend"]', wait: 500 },
            { type: 'caption', text: 'En haut, la bannière FLUX TEMPS RÉEL avec le point vert pulsant — la page se synchronise toute seule à chaque changement.', ms: 5000 },
            { type: 'caption', text: 'À droite, quatre compteurs cliquables par statut : Opérationnelle, En panne, En maintenance, Arrêtée.', ms: 4500 },

            // Click "En panne" filter chip
            { type: 'move', selector: '[data-tour="synoptique-status-chip"][data-status="en panne"]', wait: 500 },
            { type: 'caption', text: 'Je clique sur « En panne » pour mettre en évidence ces machines partout dans le flux.', ms: 4200 },
            { type: 'click', selector: '[data-tour="synoptique-status-chip"][data-status="en panne"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="synoptique-flow"]', wait: 500 },
            { type: 'caption', text: 'Les machines en panne ressortent ; les autres s\'estompent en filigrane. D\'un coup d\'œil, vous voyez où sont les problèmes dans le process.', ms: 5800 },

            // Revert the filter
            { type: 'move', selector: '[data-tour="synoptique-status-chip"][data-status="en panne"]', wait: 500 },
            { type: 'caption', text: 'Je re-clique pour retirer le filtre et revoir tout le flux.', ms: 3500 },
            { type: 'click', selector: '[data-tour="synoptique-status-chip"][data-status="en panne"]', pulse: true, wait: 1500 },

            // ── Process flow walk ──
            { type: 'move', selector: '[data-tour="synoptique-flow"]', wait: 500 },
            { type: 'caption', text: 'En dessous, le flux de production en 6 étapes, lecture gauche-droite — comme la matière qui circule dans l\'usine.', ms: 5500 },
            { type: 'move', selector: '[data-tour="synoptique-stage"][data-stage-type="Réception"]', wait: 500 },
            { type: 'caption', text: 'Étape 1 — Réception MP : les cuves d\'arrivée de matière première. Une panne ici bloque toute la ligne en aval.', ms: 5500 },
            { type: 'move', selector: '[data-tour="synoptique-stage"][data-stage-type="Préparation"]', wait: 500 },
            { type: 'caption', text: 'Étape 2 — Préparation : raffinage, neutralisation, désodorisation de l\'huile brute.', ms: 4800 },
            { type: 'move', selector: '[data-tour="synoptique-stage"][data-stage-type="Production"]', wait: 500 },
            { type: 'caption', text: 'Étape 3 — Production : le cœur du process. Si une étape est bloquée, son contour passe au rouge.', ms: 5200 },
            { type: 'move', selector: '[data-tour="synoptique-stage"][data-stage-type="Remplissage"]', wait: 500 },
            { type: 'caption', text: 'Étape 4 — Remplissage : la mise en bouteille. Une flèche rouge entre deux étapes signale un blocage de flux.', ms: 5500 },
            { type: 'move', selector: '[data-tour="synoptique-stage"][data-stage-type="Conditionnement"]', wait: 500 },
            { type: 'caption', text: 'Étape 5 — Conditionnement : étiquetage, palettisation.', ms: 4200 },
            { type: 'move', selector: '[data-tour="synoptique-stage"][data-stage-type="Expédition"]', wait: 500 },
            { type: 'caption', text: 'Étape 6 — Expédition : sortie produit fini. Fin du process.', ms: 4000 },

            // ── Machine card detail ──
            { type: 'move', selector: '[data-tour="synoptique-flow"] a:first-of-type', wait: 500 },
            { type: 'caption', text: 'Dans chaque étape, les cartes machines : code en gros, nom en dessous, bordure gauche colorée selon le statut.', ms: 5500 },
            { type: 'caption', text: 'Le petit chiffre orange = nombre d\'OT en cours ou planifiés sur cette machine.', ms: 4500 },
            { type: 'caption', text: 'Une machine en panne a un halo rouge qui pulse pour attirer l\'œil. Je clique sur cette carte pour ouvrir la fiche machine.', ms: 5500 },
            { type: 'click', selector: '[data-tour="synoptique-flow"] a:first-of-type', pulse: true, wait: 3200 },
            { type: 'move', selector: '[data-tour="md-info"]', wait: 700 },
            { type: 'caption', text: 'Voilà la fiche machine complète : informations, KPI, recommandations IA, plans préventifs, historique des interventions.', ms: 5800 },
            { type: 'caption', text: 'Je retourne au synoptique pour finir la visite.', ms: 3500 },
            { type: 'navigate', route: '/synoptique', wait: 1500 },

            // ── Utilités band ──
            { type: 'caption', text: 'Tout en bas du synoptique, la bande pointillée Utilités regroupe air comprimé, vapeur, électricité — services qui alimentent toute la ligne.', ms: 6000 },
        ],
    },
    {
        icon: MonitorPlay, color: '#8b5cf6',
        title: 'Salle de contrôle',
        selector: '[data-tour="control-summary"]', route: '/control-room',
        whatFor: 'Mur d\'état temps réel : chaque machine en grosses pastilles colorées, prête à être projetée sur un écran d\'atelier.',
        howTo: 'Surveillance — aucune action requise. Cliquez une pastille de statut en haut pour ne voir qu\'une famille (ex : seulement les en panne).',
        helps: 'Décision rapide quand quelque chose dévie : vous voyez tout sans cliquer, depuis 10 mètres si nécessaire.',
        align: 'C\'est le tableau de bord d\'usine que vos équipes peuvent regarder de loin — pas besoin d\'être devant l\'écran.',
        demo: [
            // ── Summary banner walk ──
            { type: 'move', selector: '[data-tour="control-summary"]', wait: 500 },
            { type: 'caption', text: 'En haut, la bannière SYNCHRONISATION TEMPS RÉEL avec le point vert pulsant : la page se met à jour toute seule.', ms: 5000 },
            { type: 'caption', text: 'À droite, quatre compteurs par statut — chacun est en réalité un filtre cliquable.', ms: 4500 },

            // Walk each status chip
            { type: 'move', selector: '[data-tour="control-status-chip"][data-status="opérationnelle"]', wait: 500 },
            { type: 'caption', text: 'Opérationnelle (vert) : machines en marche normale. La cible — plus le chiffre est haut, mieux c\'est.', ms: 5000 },
            { type: 'move', selector: '[data-tour="control-status-chip"][data-status="en panne"]', wait: 500 },
            { type: 'caption', text: 'En panne (rouge) : machines arrêtées sur défaut — votre priorité absolue.', ms: 4500 },
            { type: 'move', selector: '[data-tour="control-status-chip"][data-status="en maintenance"]', wait: 500 },
            { type: 'caption', text: 'En maintenance (orange) : intervention en cours, arrêt planifié.', ms: 4200 },
            { type: 'move', selector: '[data-tour="control-status-chip"][data-status="arrêtée"]', wait: 500 },
            { type: 'caption', text: 'Arrêtée (gris) : machine volontairement à l\'arrêt — fin de série, attente d\'OF, week-end.', ms: 4800 },

            // Filter to broken machines
            { type: 'move', selector: '[data-tour="control-status-chip"][data-status="en panne"]', wait: 500 },
            { type: 'caption', text: 'Je clique sur le compteur rouge pour filtrer le mur sur les machines en panne uniquement.', ms: 4500 },
            { type: 'click', selector: '[data-tour="control-status-chip"][data-status="en panne"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="control-wall"]', wait: 500 },
            { type: 'caption', text: 'Le mur ne montre plus que les machines en panne — vous voyez exactement ce qui demande une action.', ms: 5000 },

            // Revert filter
            { type: 'move', selector: '[data-tour="control-status-chip"][data-status="en panne"]', wait: 500 },
            { type: 'caption', text: 'Je re-clique pour retirer le filtre et revoir tout le mur.', ms: 3800 },
            { type: 'click', selector: '[data-tour="control-status-chip"][data-status="en panne"]', pulse: true, wait: 1500 },

            // ── Machine wall walk ──
            { type: 'move', selector: '[data-tour="control-wall"]', wait: 500 },
            { type: 'caption', text: 'Le mur : chaque machine en grosse pastille, lisible depuis 10 mètres. La couleur résume le statut instantanément.', ms: 5500 },
            { type: 'move', selector: '[data-tour="control-machine-card"]:first-of-type', wait: 500 },
            { type: 'caption', text: 'Sur chaque carte : code machine en très gros, atelier en dessous, nom complet, badge statut.', ms: 5200 },
            { type: 'caption', text: 'L\'indication « X en cours » signale combien d\'OT actifs ou planifiés concernent cette machine.', ms: 4800 },
            { type: 'caption', text: 'Les machines en panne sont triées en premier avec un halo rouge — la page guide naturellement vers les problèmes.', ms: 5500 },
            { type: 'caption', text: 'Je clique sur cette carte pour vous montrer la fiche machine.', ms: 4000 },
            { type: 'click', selector: '[data-tour="control-machine-card"]:first-of-type', pulse: true, wait: 3200 },
            { type: 'move', selector: '[data-tour="md-info"]', wait: 700 },
            { type: 'caption', text: 'La fiche machine s\'ouvre — mêmes informations que partout ailleurs : KPI, recommandations IA, plans, historique.', ms: 5500 },
            { type: 'caption', text: 'Je retourne à la salle de contrôle.', ms: 3000 },
            { type: 'navigate', route: '/control-room', wait: 1500 },
            { type: 'caption', text: 'La page est conçue pour rester affichée sur un écran d\'atelier — elle se rafraîchit toute seule, sans interaction.', ms: 5500 },
        ],
    },

    // ─── Performance ───
    {
        icon: Gauge, color: '#8b5cf6',
        title: 'TRS / OEE',
        selector: '[data-tour="oee-kpis"]', route: '/oee',
        whatFor: 'Le Taux de Rendement Synthétique — Disponibilité × Performance × Qualité — pour chaque machine et pour l\'usine entière.',
        howTo: 'Lisez les 4 KPI globaux, filtrez par verdict (classe mondiale / acceptable / à améliorer), cliquez une barre du graphique ou une ligne du tableau pour décomposer.',
        helps: 'Norme universelle pour comparer les machines à la cible secteur (> 75 %, classe mondiale 85 %).',
        align: 'Calculé depuis les interventions des techniciens et les lots des opérateurs — vous récoltez le résultat consolidé.',
        demo: [
            // ── KPI walk ──
            { type: 'move', selector: '[data-tour="oee-kpis"]', wait: 500 },
            { type: 'caption', text: 'En haut, quatre KPI globaux : TRS moyen et ses trois composants — Disponibilité, Performance, Qualité.', ms: 5000 },
            { type: 'move', selector: '[data-tour="oee-kpis"] .kpi-card:nth-of-type(1)', wait: 400 },
            { type: 'caption', text: 'TRS moyen : moyenne arithmétique de toutes les machines avec données de production. Vert ≥ 85 % (classe mondiale), orange 65-85 %, rouge en dessous.', ms: 6500 },
            { type: 'move', selector: '[data-tour="oee-kpis"] .kpi-card:nth-of-type(2)', wait: 400 },
            { type: 'caption', text: 'Disponibilité : pourcentage du temps où la machine tournait quand elle aurait dû. Les pannes et arrêts non planifiés font chuter ce chiffre.', ms: 6000 },
            { type: 'move', selector: '[data-tour="oee-kpis"] .kpi-card:nth-of-type(3)', wait: 400 },
            { type: 'caption', text: 'Performance : vitesse réelle par rapport à la vitesse nominale du constructeur. Détecte les ralentissements et micro-arrêts.', ms: 5500 },
            { type: 'move', selector: '[data-tour="oee-kpis"] .kpi-card:nth-of-type(4)', wait: 400 },
            { type: 'caption', text: 'Qualité : pourcentage de production conforme aux specs. Tout rebut, reprise ou refus tire ce chiffre vers le bas.', ms: 5500 },

            // ── Verdict filter walk ──
            { type: 'move', selector: '[data-tour="oee-verdicts"]', wait: 500 },
            { type: 'caption', text: 'Sous les KPI, trois chips de filtrage par verdict. Le chiffre à côté de chaque label montre combien de machines tombent dans cette catégorie.', ms: 6000 },
            { type: 'move', selector: '[data-tour="oee-verdict-chip"][data-label="À améliorer"]', wait: 500 },
            { type: 'caption', text: 'Je clique sur « À améliorer » pour isoler les machines en dessous de 65 % — celles qui demandent une action corrective prioritaire.', ms: 6000 },
            { type: 'click', selector: '[data-tour="oee-verdict-chip"][data-label="À améliorer"]', pulse: true, wait: 1800 },
            { type: 'move', selector: '[data-tour="oee-chart"]', wait: 500 },
            { type: 'caption', text: 'Le graphique et le tableau se restreignent immédiatement à ces machines. Utile pour préparer un plan d\'action ciblé.', ms: 5500 },

            // Revert filter
            { type: 'move', selector: '[data-tour="oee-verdict-chip"][data-label="À améliorer"]', wait: 500 },
            { type: 'caption', text: 'Je re-clique pour retirer le filtre et revoir l\'ensemble des machines.', ms: 4000 },
            { type: 'click', selector: '[data-tour="oee-verdict-chip"][data-label="À améliorer"]', pulse: true, wait: 1500 },

            // ── Chart walk ──
            { type: 'move', selector: '[data-tour="oee-chart"]', wait: 500 },
            { type: 'caption', text: 'Le graphique TRS par machine. Chaque barre est colorée selon son verdict, et la ligne tirée verte représente le seuil classe mondiale à 85 %.', ms: 6500 },
            { type: 'caption', text: 'Les barres sont triées de la meilleure à la pire — vous voyez tout de suite le podium et la queue de peloton.', ms: 5000 },

            // ── Table walk + select a row ──
            { type: 'move', selector: '[data-tour="oee-table"]', wait: 500 },
            { type: 'caption', text: 'À gauche en bas, le détail par machine : code, Disponibilité, Performance, Qualité, TRS, verdict. Chaque ligne est cliquable.', ms: 5800 },
            { type: 'move', selector: '[data-tour="oee-table"] tbody tr:first-of-type', wait: 500 },
            { type: 'caption', text: 'Je clique sur la première ligne — la machine la plus performante.', ms: 3700 },
            { type: 'click', selector: '[data-tour="oee-table"] tbody tr:first-of-type', pulse: true, wait: 1800 },

            // ── Cascade des pertes ──
            { type: 'move', selector: '[data-tour="oee-cascade"]', wait: 500 },
            { type: 'caption', text: 'À droite, la cascade des pertes pour la machine sélectionnée — du temps planifié à 100 % jusqu\'au temps réellement utile.', ms: 6000 },
            { type: 'caption', text: 'Quatre catégories : pertes de disponibilité (orange), pertes de performance (violet), pertes de qualité (rouge), TRS — temps utile (vert).', ms: 6500 },
            { type: 'caption', text: 'Le bouton flèche en haut à droite ouvre la fiche machine pour creuser l\'historique et planifier une amélioration.', ms: 5500 },
        ],
    },
    {
        icon: Radar, color: '#10b981',
        title: 'Maintenance prédictive',
        selector: '[data-tour="pred-kpis"]', route: '/predictif',
        whatFor: 'L\'IA estime la durée de vie restante (RUL) de chaque machine à partir du MTBF et du temps écoulé depuis la dernière panne.',
        howTo: 'Lisez les 3 KPI globaux, scrutez le graphique d\'indice de santé, puis utilisez le tableau pour voir l\'action recommandée par machine.',
        helps: 'Anticipez 3 à 6 semaines avant la panne — vous planifiez plutôt que de subir l\'arrêt en production.',
        align: 'Les techniciens reçoivent les recommandations dans leur dashboard ; vous validez le plan d\'action ici.',
        demo: [
            // ── KPI walk ──
            { type: 'move', selector: '[data-tour="pred-kpis"]', wait: 500 },
            { type: 'caption', text: 'En haut, trois KPI globaux résument l\'état prédictif du parc.', ms: 4500 },
            { type: 'move', selector: '[data-tour="pred-kpis"] .kpi-card:nth-of-type(1)', wait: 400 },
            { type: 'caption', text: 'Machines à risque : le nombre de machines en risque modéré ou élevé. Devient rouge dès qu\'au moins une est concernée — votre signal d\'action.', ms: 6500 },
            { type: 'move', selector: '[data-tour="pred-kpis"] .kpi-card:nth-of-type(2)', wait: 400 },
            { type: 'caption', text: 'Santé moyenne du parc : moyenne pondérée de tous les indices de santé. Vert ≥ 70 %, orange 45-70 %, rouge en dessous.', ms: 6000 },
            { type: 'move', selector: '[data-tour="pred-kpis"] .kpi-card:nth-of-type(3)', wait: 400 },
            { type: 'caption', text: 'Prochaine panne estimée : la machine la plus à risque, avec sa date prévue de défaillance. Le rendez-vous à inscrire au calendrier.', ms: 6200 },

            // ── Chart walk ──
            { type: 'move', selector: '[data-tour="pred-chart"]', wait: 500 },
            { type: 'caption', text: 'En dessous, le graphique de l\'indice de santé par machine. 100 % = sain, 0 % = panne imminente.', ms: 5800 },
            { type: 'caption', text: 'Les deux lignes tirées sont des seuils d\'alerte : orange à 55 % et rouge à 25 %. Toute barre en dessous de la rouge demande une action immédiate.', ms: 6800 },
            { type: 'caption', text: 'Les couleurs des barres suivent le risque calculé par l\'IA — vert (sain), orange (à surveiller), rouge (risque élevé).', ms: 5800 },

            // ── Table walk ──
            { type: 'move', selector: '[data-tour="pred-table"]', wait: 600 },
            { type: 'caption', text: 'En bas, le tableau détaillé : Machine, Santé, Durée de vie restante, Panne estimée, Pannes passées, Risque, Action recommandée.', ms: 6800 },
            { type: 'move', selector: '[data-tour="pred-row"]:first-of-type', wait: 600 },
            { type: 'caption', text: 'Chaque ligne expose la machine, sa barre de santé, son RUL en jours, et l\'action que l\'IA recommande — graissage, inspection, remplacement, etc.', ms: 7000 },

            // ── Click the Planifier action recommended by the AI ──
            { type: 'move', selector: '[data-tour="pred-row"]:first-of-type a[title="Planifier un entretien"]', wait: 600 },
            { type: 'caption', text: 'À droite de la ligne, le bouton « Planifier » applique directement l\'action recommandée par l\'IA. Je clique dessus.', ms: 5800 },
            { type: 'click', selector: '[data-tour="pred-row"]:first-of-type a[title="Planifier un entretien"]', pulse: true, wait: 2200 },
            { type: 'move', selector: '[data-tour="plans-kpis"]', wait: 700 },
            { type: 'caption', text: 'On atterrit dans le module Plans préventifs, prêt à créer le plan recommandé. En un clic, l\'IA et l\'action humaine se rejoignent.', ms: 6500 },
            { type: 'caption', text: 'Je retourne au module prédictif pour finir la visite.', ms: 3800 },
            { type: 'navigate', route: '/predictif', wait: 1700 },

            // ── Click the machine code to show the fiche ──
            { type: 'move', selector: '[data-tour="pred-row"]:first-of-type [data-tour="pred-row-link"]', wait: 600 },
            { type: 'caption', text: 'Je clique aussi sur le code machine pour vous montrer sa fiche complète.', ms: 4500 },
            { type: 'click', selector: '[data-tour="pred-row"]:first-of-type [data-tour="pred-row-link"]', pulse: true, wait: 3200 },
            { type: 'move', selector: '[data-tour="md-info"]', wait: 700 },
            { type: 'caption', text: 'La fiche machine s\'ouvre : informations, KPI, recommandations IA, plans préventifs, historique des interventions — tout ce qu\'il faut pour décider.', ms: 6500 },
            { type: 'caption', text: 'Je retourne au module prédictif.', ms: 3000 },
            { type: 'navigate', route: '/predictif', wait: 1700 },
            { type: 'caption', text: 'Anticipez 3 à 6 semaines avant la panne — vous planifiez plutôt que de subir l\'arrêt en production.', ms: 5500 },
        ],
    },
    {
        icon: Zap, color: '#eab308',
        title: 'Suivi énergétique',
        selector: '[data-tour="energy-kpis"]', route: '/energie',
        whatFor: 'Consommation électrique par machine, coût en MAD, et impact CO₂ — pour repérer les surconsommateurs.',
        howTo: 'Configurez tarif et heures en haut, lisez les 4 KPI, filtrez par atelier, puis analysez machine par machine dans le graphique et le tableau.',
        helps: 'Économies directes : un moteur sur-consommateur coûte souvent plus cher en énergie qu\'en pièces — le remplacer s\'amortit en quelques mois.',
        align: 'Indicateur réservé à l\'admin — input dans le calcul du TRS qualité énergétique.',
        demo: [
            // ── Tariff settings walk + LIVE change + revert ──
            { type: 'move', selector: '[data-tour="energy-tariff"]', wait: 500 },
            { type: 'caption', text: 'Tout en haut, deux paramètres pilotent tous les calculs : le tarif électrique MAD/kWh et les heures de marche par jour.', ms: 6000 },
            { type: 'move', selector: '[data-tour="energy-tariff-input"]', wait: 500 },
            { type: 'caption', text: 'Pour vous montrer l\'effet, je passe le tarif à 1.80 MAD/kWh — par exemple si votre contrat change après une hausse réglementaire.', ms: 6500 },
            { type: 'type', selector: '[data-tour="energy-tariff-input"]', value: '1.80', wait: 800 },
            { type: 'move', selector: '[data-tour="energy-kpis"] .kpi-card:nth-of-type(3)', wait: 700 },
            { type: 'caption', text: 'Le KPI « Coût mensuel estimé » se recalcule en direct. Toute la facture du parc évolue d\'un coup.', ms: 5800 },
            { type: 'move', selector: '[data-tour="energy-tariff-input"]', wait: 600 },
            { type: 'caption', text: 'Je remets le tarif à 1.20 pour rétablir l\'état initial — je n\'ai pas cliqué sur Enregistrer, donc rien n\'a été persisté.', ms: 6500 },
            { type: 'type', selector: '[data-tour="energy-tariff-input"]', value: '1.2', wait: 800 },
            { type: 'move', selector: '[data-tour="energy-tariff-save"]', wait: 500 },
            { type: 'caption', text: 'Le bouton Enregistrer pousse les nouvelles valeurs vers tous les autres postes — un seul changement, tout le monde voit le même résultat.', ms: 6500 },

            // ── KPI walk ──
            { type: 'move', selector: '[data-tour="energy-kpis"]', wait: 500 },
            { type: 'caption', text: 'En dessous, quatre KPI résument la consommation du parc.', ms: 4200 },
            { type: 'move', selector: '[data-tour="energy-kpis"] .kpi-card:nth-of-type(1)', wait: 400 },
            { type: 'caption', text: 'Conso. quotidienne : somme des kWh consommés par l\'ensemble du parc en une journée.', ms: 5000 },
            { type: 'move', selector: '[data-tour="energy-kpis"] .kpi-card:nth-of-type(2)', wait: 400 },
            { type: 'caption', text: 'Conso. mensuelle : projection sur 22 jours ouvrés. C\'est la valeur qu\'on retrouve sur votre facture électricité.', ms: 5800 },
            { type: 'move', selector: '[data-tour="energy-kpis"] .kpi-card:nth-of-type(3)', wait: 400 },
            { type: 'caption', text: 'Coût mensuel estimé : kWh × tarif. Repérez les machines surconsommatrices — un moteur sur-âgé coûte souvent plus cher en énergie qu\'en pièces.', ms: 6800 },
            { type: 'move', selector: '[data-tour="energy-kpis"] .kpi-card:nth-of-type(4)', wait: 400 },
            { type: 'caption', text: 'Empreinte CO₂ : à 0,61 kg CO₂/kWh (moyenne réseau marocain). Utile pour vos rapports RSE et certifications ISO 14001.', ms: 6500 },

            // ── Top consumer + idle banner ──
            { type: 'caption', text: 'Sous les KPI, deux bandeaux : le plus gros consommateur du parc avec son coût, et le nombre de machines hors service qui ne consomment rien.', ms: 6500 },

            // ── Atelier filter walk ──
            { type: 'move', selector: '[data-tour="energy-stages"]', wait: 500 },
            { type: 'caption', text: 'Filtres par atelier : isolez une zone du process — Préparation, Production, Remplissage — pour voir sa part dans la consommation.', ms: 6000 },
            { type: 'move', selector: '[data-tour="energy-stages"] button:nth-of-type(2)', wait: 500 },
            { type: 'caption', text: 'Je clique sur le premier atelier pour filtrer la vue.', ms: 3800 },
            { type: 'click', selector: '[data-tour="energy-stages"] button:nth-of-type(2)', pulse: true, wait: 1700 },
            { type: 'move', selector: '[data-tour="energy-chart"]', wait: 500 },
            { type: 'caption', text: 'Le graphique se restreint aux machines de cet atelier. Vous voyez immédiatement quels postes pèsent le plus.', ms: 5500 },

            // Revert filter
            { type: 'move', selector: '[data-tour="energy-stages"] button:first-of-type', wait: 500 },
            { type: 'caption', text: 'Je clique sur « Tous les ateliers » pour revoir l\'ensemble.', ms: 4000 },
            { type: 'click', selector: '[data-tour="energy-stages"] button:first-of-type', pulse: true, wait: 1700 },

            // ── Chart walk ──
            { type: 'move', selector: '[data-tour="energy-chart"]', wait: 600 },
            { type: 'caption', text: 'Le graphique : consommation mensuelle barre par barre, du plus gros au plus petit. Les machines arrêtées, en panne ou en maintenance apparaissent à zéro.', ms: 7000 },
            { type: 'caption', text: 'Repérez le top 3 des surconsommateurs et planifiez un audit énergétique — remplacement de moteur, variateur de fréquence, optimisation des cycles.', ms: 7000 },

            // ── Répartition par atelier ──
            { type: 'move', selector: '[data-tour="energy-byStage"]', wait: 600 },
            { type: 'caption', text: 'En dessous, « Répartition par atelier » : une barre par étape du process — Réception, Préparation, Production, Remplissage, Conditionnement, Expédition.', ms: 7000 },
            { type: 'caption', text: 'À droite de chaque barre, kWh et coût en MAD. Vous voyez instantanément quel atelier pèse le plus dans votre facture.', ms: 6500 },
            { type: 'caption', text: 'Utile pour les décisions d\'investissement énergétique : isoler thermiquement la zone Production rapporte plus que la zone Expédition.', ms: 6800 },

            // ── Détail par machine ──
            { type: 'move', selector: '[data-tour="energy-detail"]', wait: 600 },
            { type: 'caption', text: 'Tout en bas, « Détail par machine » : ligne par ligne — code, atelier, puissance kW, état, kWh quotidien et mensuel, coût mensuel.', ms: 7000 },
            { type: 'caption', text: 'Le badge « En marche » / « Hors service » montre qui consomme actuellement. La colonne Coût/mois est triée du plus cher au moins cher.', ms: 6800 },
            { type: 'caption', text: 'Cliquer le code machine ouvre sa fiche — utile pour vérifier le carnet d\'entretien si la consommation paraît anormale.', ms: 6000 },
        ],
    },
    {
        icon: FileBarChart, color: '#3b82f6',
        title: 'Rapports',
        selector: '[data-tour="reports-tabs"]', route: '/reports',
        whatFor: 'Vos analyses agrégées : 8 onglets — FMD, économique, TPM/TRS, criticité, recommandations IA, Pareto pannes, TCO achats…',
        howTo: 'Naviguez entre onglets en haut. Chaque onglet affiche graphes + tables. Bouton imprimer/export PDF en haut.',
        helps: 'Préparation directe des réunions de direction et des audits annuels — vos chiffres sont prêts en 2 clics.',
        align: 'Compile les données de tous les rôles — vous obtenez la vue de synthèse pour piloter l\'usine.',
        demo: [
            // ── Tabs row walk ──
            { type: 'move', selector: '[data-tour="reports-tabs"]', wait: 500 },
            { type: 'caption', text: 'Le module Rapports rassemble neuf analyses dans des onglets — toute la matière dont vous avez besoin pour la réunion mensuelle et l\'audit annuel.', ms: 7000 },

            // ═══════════════════════════════════════════════════════
            // ── VUE D'ENSEMBLE (analytics) ───────────────────────
            // ═══════════════════════════════════════════════════════
            { type: 'move', selector: '[data-tour="reports-tab-analytics"]', wait: 500 },
            { type: 'caption', text: 'On commence par « Vue d\'ensemble », l\'onglet par défaut — votre tableau de bord exécutif.', ms: 5500 },
            { type: 'click', selector: '[data-tour="reports-tab-analytics"]', pulse: true, wait: 1800 },
            { type: 'move', selector: '[data-tour="reports-analytics-kpis"] > div:nth-of-type(1)', wait: 700 },
            { type: 'caption', text: 'Première carte : OEE global. Le grand chiffre, la variation vs mois précédent, et une mini-courbe sparkline d\'évolution.', ms: 7000 },
            { type: 'move', selector: '[data-tour="reports-analytics-kpis"] > div:nth-of-type(2)', wait: 700 },
            { type: 'caption', text: 'Deuxième carte : MTTR moyen — le temps moyen de réparation, en heures. Sa sparkline orange montre la tendance.', ms: 6500 },
            { type: 'move', selector: '[data-tour="reports-analytics-kpis"] > div:nth-of-type(3)', wait: 700 },
            { type: 'caption', text: 'Troisième carte : MTBF moyen — le temps moyen entre pannes. Sparkline verte, et la mention du gain de fiabilité.', ms: 6500 },

            // ── Atelier filter — show the KPIs visibly change ──
            { type: 'move', selector: '[data-tour="reports-atelier"]', wait: 600 },
            { type: 'caption', text: 'En haut, le filtre « Atelier » restreint tous les calculs à une zone du process. Je sélectionne un atelier pour vous montrer l\'effet sur les KPI.', ms: 7500 },
            { type: 'select', selector: '[data-tour="reports-atelier"]', index: 1, wait: 1500 },
            { type: 'move', selector: '[data-tour="reports-analytics-kpis"]', wait: 700 },
            { type: 'caption', text: 'Les trois cartes KPI se recalculent immédiatement sur les machines de cet atelier — les valeurs et les sparklines changent en direct.', ms: 7500 },
            { type: 'move', selector: '[data-tour="reports-atelier"]', wait: 500 },
            { type: 'caption', text: 'Je remets « Tous les ateliers » pour revoir l\'ensemble.', ms: 4000 },
            { type: 'select', selector: '[data-tour="reports-atelier"]', index: 0, wait: 1500 },

            // ═══════════════════════════════════════════════════════
            // ── FMD ──────────────────────────────────────────────
            // ═══════════════════════════════════════════════════════
            { type: 'move', selector: '[data-tour="reports-tab-fmd"]', wait: 500 },
            { type: 'caption', text: 'On passe à « Analyse FMD » — la norme métier pour benchmarker votre parc.', ms: 5500 },
            { type: 'click', selector: '[data-tour="reports-tab-fmd"]', pulse: true, wait: 1800 },
            { type: 'move', selector: '[data-tour="reports-fmd-kpis"] > div:nth-of-type(1)', wait: 700 },
            { type: 'caption', text: 'MTBF Moyen : Mean Time Between Failures — temps moyen entre deux pannes successives, en heures.', ms: 6500 },
            { type: 'move', selector: '[data-tour="reports-fmd-kpis"] > div:nth-of-type(2)', wait: 700 },
            { type: 'caption', text: 'MTTR Moyen : Mean Time To Repair — temps moyen de remise en service après défaillance.', ms: 6000 },
            { type: 'move', selector: '[data-tour="reports-fmd-kpis"] > div:nth-of-type(3)', wait: 700 },
            { type: 'caption', text: 'Disponibilité : la formule MTBF divisé par (MTBF + MTTR). C\'est le pourcentage de temps où la machine est censée tourner.', ms: 7500 },
            { type: 'move', selector: '[data-tour="reports-fmd-table"]', wait: 700 },
            { type: 'caption', text: 'En dessous, le tableau « FMD par machine » : MTBF, MTTR, Disponibilité avec barre colorée, nombre de pannes, et arrêt total cumulé. Chaque ligne est cliquable pour ouvrir la fiche.', ms: 9500 },

            // ═══════════════════════════════════════════════════════
            // ── ÉCONOMIQUE ────────────────────────────────────────
            // ═══════════════════════════════════════════════════════
            { type: 'move', selector: '[data-tour="reports-tab-economic"]', wait: 500 },
            { type: 'caption', text: 'On passe à « Analyse Économique » — où va l\'argent de la maintenance.', ms: 5500 },
            { type: 'click', selector: '[data-tour="reports-tab-economic"]', pulse: true, wait: 1800 },
            { type: 'move', selector: '[data-tour="reports-eco-kpis"] > div:nth-of-type(1)', wait: 700 },
            { type: 'caption', text: 'Coût total maintenance : la facture globale, toutes interventions confondues.', ms: 5500 },
            { type: 'move', selector: '[data-tour="reports-eco-kpis"] > div:nth-of-type(2)', wait: 700 },
            { type: 'caption', text: 'Coût corrective : ce que vous ont coûté les réparations imprévues. Plus c\'est haut, plus vous subissez.', ms: 6500 },
            { type: 'move', selector: '[data-tour="reports-eco-kpis"] > div:nth-of-type(3)', wait: 700 },
            { type: 'caption', text: 'Coût préventive : ce que vous a coûté l\'anticipation. Le ratio entre les deux mesure votre maturité maintenance.', ms: 7000 },
            { type: 'move', selector: '[data-tour="reports-eco-bar"]', wait: 700 },
            { type: 'caption', text: 'À gauche, « Coût par machine » : une barre violette par machine. Repérez les gouffres financiers en un coup d\'œil.', ms: 7000 },
            { type: 'move', selector: '[data-tour="reports-eco-pie"]', wait: 700 },
            { type: 'caption', text: 'À droite, le camembert « Répartition des coûts par type » — Main-d\'œuvre, Pièces, Arrêt — pour savoir où concentrer les économies.', ms: 7500 },
            { type: 'move', selector: '[data-tour="reports-eco-table"]', wait: 700 },
            { type: 'caption', text: 'Tout en bas, le tableau « Détail des coûts par machine » avec les trois colonnes ventilées et le total — exportable pour la compta.', ms: 7500 },

            // ═══════════════════════════════════════════════════════
            // ── TPM / TRS ────────────────────────────────────────
            // ═══════════════════════════════════════════════════════
            { type: 'move', selector: '[data-tour="reports-tab-tpm"]', wait: 500 },
            { type: 'caption', text: 'On passe à « TPM / TRS » — la vue maintenance productive totale.', ms: 5500 },
            { type: 'click', selector: '[data-tour="reports-tab-tpm"]', pulse: true, wait: 1800 },
            { type: 'move', selector: '[data-tour="reports-tpm-kpis"]', wait: 700 },
            { type: 'caption', text: 'KPI TRS Moyen en haut avec sa formule rappelée : Disponibilité × Performance × Qualité.', ms: 5500 },
            { type: 'move', selector: '[data-tour="reports-tpm-table"]', wait: 700 },
            { type: 'caption', text: 'Tableau « TRS par machine » : Disponibilité, Performance, Qualité, TRS et une évaluation Excellent (≥ 85 %), Acceptable (≥ 60 %), Insuffisant.', ms: 8000 },
            { type: 'move', selector: '[data-tour="reports-tpm-losses"]', wait: 700 },
            { type: 'caption', text: '« Les 6 pertes principales » — nomenclature historique TPM : Pannes, Réglages, Micro-arrêts, Ralentissements, Défauts qualité, Pertes au démarrage. Chaque case montre le compteur.', ms: 11000 },

            // ═══════════════════════════════════════════════════════
            // ── MACHINES CRITIQUES ────────────────────────────────
            // ═══════════════════════════════════════════════════════
            { type: 'move', selector: '[data-tour="reports-tab-criticality"]', wait: 500 },
            { type: 'caption', text: 'On passe à « Machines Critiques » — qui mérite votre attention prioritaire.', ms: 5500 },
            { type: 'click', selector: '[data-tour="reports-tab-criticality"]', pulse: true, wait: 1800 },
            { type: 'move', selector: '[data-tour="reports-crit-radar"]', wait: 700 },
            { type: 'caption', text: 'À gauche, un radar de criticité par machine — vue holistique. Plus le polygone s\'étend vers une pointe, plus cette machine est critique.', ms: 7500 },
            { type: 'move', selector: '[data-tour="reports-crit-formula"]', wait: 700 },
            { type: 'caption', text: 'À droite, la formule de criticité est explicitée : 40 % Fréquence des pannes + 30 % Durée d\'arrêt + 20 % Coût d\'arrêt + 10 % Importance machine.', ms: 9000 },
            { type: 'caption', text: 'En dessous, les trois niveaux d\'alerte : 0-40 Faible (vert), 41-70 Moyen (orange), 71-100 Élevé (rouge).', ms: 6500 },
            { type: 'move', selector: '[data-tour="reports-crit-table"]', wait: 700 },
            { type: 'caption', text: '« Classement des machines par criticité » trié du plus critique au moins critique, avec barre de score, niveau, pannes, arrêt, coût et importance.', ms: 8500 },

            // ═══════════════════════════════════════════════════════
            // ── RECOMMANDATIONS IA ────────────────────────────────
            // ═══════════════════════════════════════════════════════
            { type: 'move', selector: '[data-tour="reports-tab-recommendations"]', wait: 500 },
            { type: 'caption', text: 'On passe à « Recommandations IA » — où l\'algorithme vous propose des actions concrètes.', ms: 6500 },
            { type: 'click', selector: '[data-tour="reports-tab-recommendations"]', pulse: true, wait: 1800 },
            { type: 'move', selector: '[data-tour="reports-reco-banner"]', wait: 700 },
            { type: 'caption', text: 'En haut, le bandeau bleu « Moteur d\'Intelligence SmartMaint » avec trois compteurs : alertes critiques (rouge), avertissements (orange), informations (bleu).', ms: 8500 },
            { type: 'move', selector: '[data-tour="reports-reco-list"]', wait: 700 },
            { type: 'caption', text: 'En dessous, la liste des recommandations — chaque carte montre la machine concernée, le message d\'analyse, et un tag catégorie. La couleur de la bordure gauche reprend le niveau.', ms: 9500 },
            { type: 'move', selector: '[data-tour="reports-reco-vision"]', wait: 700 },
            { type: 'caption', text: 'Tout en bas, « Vision future » — quatre piliers de la maintenance prédictive : Capteurs IoT, Analyse vibratoire, Thermographie, Deep Learning.', ms: 8500 },

            // SPC section retired batch 7 — the previous chart was a
            // Math.random() simulation with no link to real sensor data.
            // Removed from the report tabs; the tour goes straight to Pareto.

            // ═══════════════════════════════════════════════════════
            // ── PARETO ────────────────────────────────────────────
            // ═══════════════════════════════════════════════════════
            { type: 'move', selector: '[data-tour="reports-tab-pareto"]', wait: 500 },
            { type: 'caption', text: 'On passe à « Causes de pannes » — l\'outil qualité classique de Vilfredo Pareto.', ms: 6500 },
            { type: 'click', selector: '[data-tour="reports-tab-pareto"]', pulse: true, wait: 1800 },
            { type: 'move', selector: '[data-tour="reports-pareto-insights"]', wait: 700 },
            { type: 'caption', text: 'Trois cartes en haut : nombre total de pannes correctives, nombre de causes distinctes, et la fameuse insight « vital few » — combien de causes génèrent 80 % des pannes.', ms: 9500 },
            { type: 'move', selector: '[data-tour="reports-pareto-chart"]', wait: 700 },
            { type: 'caption', text: 'Le diagramme de Pareto au centre : barres rouges = nombre de pannes par cause (axe gauche), courbe bleue = cumul en pourcentage (axe droit). La règle 80/20 saute aux yeux.', ms: 10500 },
            { type: 'move', selector: '[data-tour="reports-pareto-table"]', wait: 700 },
            { type: 'caption', text: 'En dessous, le tableau des causes triées de la plus fréquente à la plus rare — celles en rouge tombent dans les premiers 80 %, focalisez-y vos actions correctives.', ms: 9000 },

            // ═══════════════════════════════════════════════════════
            // ── TCO & ACHATS ─────────────────────────────────────
            // ═══════════════════════════════════════════════════════
            { type: 'move', selector: '[data-tour="reports-tab-tco"]', wait: 500 },
            { type: 'caption', text: 'On termine par « TCO & Achats » — le coût total de possession et l\'optimisation côté procurement.', ms: 7000 },
            { type: 'click', selector: '[data-tour="reports-tab-tco"]', pulse: true, wait: 1800 },
            { type: 'move', selector: '[data-tour="reports-tco-forecast"]', wait: 700 },
            { type: 'caption', text: 'En haut, « Prévision des approvisionnements » : par pièce, stock actuel, consommation moyenne par jour, délai fournisseur, seuil de réappro calculé.', ms: 9500 },
            { type: 'caption', text: 'La colonne « Statut » affiche un badge rouge « Commander (Xj) » dès que le stock passe sous le seuil — vous savez quoi commander, à quel rythme.', ms: 9000 },
            { type: 'move', selector: '[data-tour="reports-tco-card"]', wait: 700 },
            { type: 'caption', text: 'En bas, « Coût total de possession (TCO) par machine » : un sélecteur en haut à droite vous permet de choisir la machine pour voir sa décomposition.', ms: 8500 },

            // ── Back to Vue d'ensemble ──
            { type: 'move', selector: '[data-tour="reports-tab-analytics"]', wait: 500 },
            { type: 'caption', text: 'Je reviens à la vue d\'ensemble pour finir.', ms: 3500 },
            { type: 'click', selector: '[data-tour="reports-tab-analytics"]', pulse: true, wait: 1500 },

            // ── Imprimer — pretend-click then mock a print preview overlay + close ──
            { type: 'move', selector: '[data-tour="reports-print"]', wait: 500 },
            { type: 'caption', text: 'Le bouton « Imprimer / Exporter PDF » en haut à droite. Je clique pour ouvrir l\'aperçu.', ms: 5500 },
            { type: 'pretend-click', selector: '[data-tour="reports-print"]', wait: 1500 },
            { type: 'mock', container: 'body', html: '<div data-tour-mock-print style="position:fixed;inset:0;background:rgba(15,23,42,0.65);z-index:99998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);animation:fadeIn 0.2s ease"><div style="background:white;border-radius:16px;padding:24px 26px;max-width:620px;width:90%;box-shadow:0 24px 60px rgba(0,0,0,0.35);font-family:inherit"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px"><div style="display:flex;align-items:center;gap:10px"><div style="width:36px;height:36px;border-radius:9px;background:#eff6ff;display:flex;align-items:center;justify-content:center;color:#3b82f6;font-size:18px">🖨️</div><div><h3 style="font-size:17px;font-weight:700;color:#0f172a;margin:0">Aperçu d\'impression</h3><div style="font-size:12px;color:#64748b;margin-top:2px">Vue d\'ensemble · format A4 · couleur</div></div></div><button data-tour-mock-close style="width:34px;height:34px;border-radius:9px;background:#f1f5f9;border:none;cursor:pointer;font-size:16px;color:#475569;display:flex;align-items:center;justify-content:center" onclick="this.closest(\'[data-tutorial-mock]\').remove()" title="Fermer">✕</button></div><div style="border:1px dashed #cbd5e1;border-radius:12px;padding:30px 24px;background:linear-gradient(180deg,#f8fafc,#f1f5f9);text-align:center"><div style="font-size:48px;margin-bottom:12px;opacity:0.6">📄</div><div style="font-size:13.5px;color:#475569;font-weight:600;margin-bottom:6px">Mise en page PDF prête</div><div style="font-size:12px;color:#64748b;line-height:1.6;max-width:380px;margin:0 auto">Graphes et tables formatés pour impression. Choisissez « Enregistrer au format PDF » dans la destination pour exporter, ou imprimez directement.</div></div><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button data-tour-mock-cancel style="padding:9px 18px;border-radius:9px;background:white;border:1px solid #e2e8f0;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit" onclick="this.closest(\'[data-tutorial-mock]\').remove()">Annuler</button><button style="padding:9px 18px;border-radius:9px;background:linear-gradient(135deg,#3b82f6,#1e40af);border:none;color:white;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Imprimer</button></div></div></div>', wait: 1200 },
            { type: 'caption', text: 'L\'aperçu s\'ouvre : graphes et tables formatés pour impression, prêts à exporter en PDF pour vos réunions et audits annuels.', ms: 7500 },
            { type: 'move', selector: '[data-tour-mock-close]', wait: 700 },
            { type: 'caption', text: 'Je ferme l\'aperçu en cliquant sur la croix pour revenir au rapport.', ms: 4500 },
            { type: 'click', selector: '[data-tour-mock-close]', pulse: true, wait: 1500 },
            { type: 'caption', text: 'Toutes ces analyses se compilent à la volée à partir des données saisies par les techniciens et opérateurs — vous récoltez le résultat consolidé.', ms: 6500 },
        ],
    },

    // ─── Conformité ───
    {
        icon: ShieldCheck, color: '#10b981',
        title: 'Conformité HACCP',
        selector: '[data-tour="haccp-kpis"]', route: '/haccp',
        whatFor: 'Le registre des contrôles sanitaires obligatoires — sanitation, calibration, lubrification, inspection — pour toutes les machines en contact produit.',
        howTo: 'Surveillez le taux de conformité, repérez les non-conformes, programmez un nouveau contrôle, et exportez le dossier d\'audit en PDF.',
        helps: 'Preuve directe en cas d\'audit ISO 22000 / IFS Food / FSSC 22000. Vos auditeurs reçoivent le PDF en 2 clics.',
        align: 'Le technicien remplit les contrôles sur le terrain, vous validez et archivez ici.',
        demo: [
            // ── KPI walk (5 cards) ──
            { type: 'move', selector: '[data-tour="haccp-kpis"]', wait: 500 },
            { type: 'caption', text: 'En haut, cinq KPI résument votre conformité HACCP en un coup d\'œil.', ms: 5000 },
            { type: 'move', selector: '[data-tour="haccp-kpis"] > div:nth-of-type(1)', wait: 400 },
            { type: 'caption', text: 'Taux de conformité : moyenne pondérée des contrôles. Vert ≥ 90 %, orange 70-90 %, rouge en dessous. Le chiffre à surveiller chaque semaine pour piloter l\'hygiène.', ms: 7500 },
            { type: 'move', selector: '[data-tour="haccp-kpis"] > div:nth-of-type(2)', wait: 400 },
            { type: 'caption', text: 'Machines suivies : le nombre d\'équipements en contact produit qui sont dans le périmètre HACCP.', ms: 5500 },
            { type: 'move', selector: '[data-tour="haccp-kpis"] > div:nth-of-type(3)', wait: 400 },
            { type: 'caption', text: 'Contrôles effectués : total cumulé des contrôles enregistrés. Plus le chiffre monte, plus l\'historique est riche pour l\'auditeur.', ms: 6500 },
            { type: 'move', selector: '[data-tour="haccp-kpis"] > div:nth-of-type(4)', wait: 400 },
            { type: 'caption', text: 'Non conformes : devient rouge dès qu\'un contrôle échoue. Déclenche une action corrective et tracée — votre filet de sécurité réglementaire.', ms: 7000 },
            { type: 'move', selector: '[data-tour="haccp-kpis"] > div:nth-of-type(5)', wait: 400 },
            { type: 'caption', text: 'En retard : signale les contrôles dont la périodicité est dépassée. À traiter avant la visite des auditeurs.', ms: 6000 },

            // ── Matrix walk ──
            { type: 'move', selector: '[data-tour="haccp-matrix"]', wait: 600 },
            { type: 'caption', text: 'La matrice de conformité : chaque ligne une machine en contact produit, chaque colonne un type de contrôle — sanitation, calibration, lubrification, inspection.', ms: 8500 },
            { type: 'caption', text: 'Code couleur des cellules : vert = conforme et à jour, orange = à corriger, rouge = non conforme, cases en pointillés « + à contrôler » = jamais contrôlé.', ms: 8500 },
            { type: 'caption', text: 'Cliquer une cellule existante ouvre le détail du dernier contrôle pour modification. Cliquer « + à contrôler » crée directement un nouveau contrôle ciblé.', ms: 8500 },

            // ── Create a demo HACCP record ──
            { type: 'move', selector: '[data-tour="page-add"]', wait: 500 },
            { type: 'caption', text: 'Pour créer un nouveau contrôle générique, le bouton vert « Nouveau contrôle » en haut à droite.', ms: 5500 },
            { type: 'click', selector: '[data-tour="page-add"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="haccp-form-machine"]', wait: 500 },
            { type: 'caption', text: 'Formulaire : d\'abord la machine concernée — uniquement les équipements en contact produit apparaissent dans la liste.', ms: 7000 },
            { type: 'select', selector: '[data-tour="haccp-form-machine"]', index: 1, wait: 900 },
            { type: 'caption', text: 'Puis le type de contrôle et le résultat — Conforme / À corriger / Non conforme.', ms: 5000 },
            { type: 'move', selector: '[data-tour="haccp-form-controller"]', wait: 500 },
            { type: 'caption', text: 'Le contrôleur — j\'inscris le nom de la démo.', ms: 4000 },
            { type: 'type', selector: '[data-tour="haccp-form-controller"]', value: 'TUTO-DEMO contrôleur', wait: 600 },
            { type: 'caption', text: 'Date du contrôle et prochaine échéance — l\'app calcule automatiquement les contrôles « En retard » à partir de la prochaine date.', ms: 7000 },
            { type: 'caption', text: 'Notes pour qualifier l\'observation, et une zone photo pour joindre des preuves.', ms: 5500 },
            { type: 'move', selector: '[data-tour="haccp-form-save"]', wait: 500 },
            { type: 'caption', text: 'Je clique sur Enregistrer.', ms: 3000 },
            { type: 'click', selector: '[data-tour="haccp-form-save"]', pulse: true, wait: 2000 },
            { type: 'caption', text: 'Contrôle enregistré : horodaté, signé du nom du contrôleur, archivé immuablement. Il apparaît dans la matrice et dans le journal en bas.', ms: 8000 },

            // ── History walk ──
            { type: 'move', selector: '[data-tour="haccp-history"]', wait: 600 },
            { type: 'caption', text: 'En bas, le « Journal des contrôles » — l\'historique complet : Date, Machine, Type, Résultat, Contrôleur, Prochaine échéance, Notes.', ms: 8000 },
            { type: 'caption', text: 'C\'est ce journal qui sert de preuve d\'audit ISO 22000, IFS Food ou FSSC 22000.', ms: 6000 },

            // ── Click Dossier d'audit (print) — mock preview + close ──
            { type: 'move', selector: '[data-tour="haccp-print"]', wait: 600 },
            { type: 'caption', text: 'Le bouton « Dossier d\'audit » en haut imprime tout proprement en PDF. Je clique pour ouvrir l\'aperçu.', ms: 6500 },
            { type: 'pretend-click', selector: '[data-tour="haccp-print"]', wait: 1500 },
            { type: 'mock', container: 'body', html: '<div data-tour-mock-print style="position:fixed;inset:0;background:rgba(15,23,42,0.65);z-index:99998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)"><div style="background:white;border-radius:16px;padding:24px 26px;max-width:620px;width:90%;box-shadow:0 24px 60px rgba(0,0,0,0.35);font-family:inherit"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px"><div style="display:flex;align-items:center;gap:10px"><div style="width:36px;height:36px;border-radius:9px;background:#f0fdf4;display:flex;align-items:center;justify-content:center;color:#16a34a;font-size:18px">🛡️</div><div><h3 style="font-size:17px;font-weight:700;color:#0f172a;margin:0">Dossier de conformité HACCP</h3><div style="font-size:12px;color:#64748b;margin-top:2px">Aperçu d\'audit · format A4 · couleur</div></div></div><button data-tour-mock-close style="width:34px;height:34px;border-radius:9px;background:#f1f5f9;border:none;cursor:pointer;font-size:16px;color:#475569;display:flex;align-items:center;justify-content:center" onclick="this.closest(\'[data-tutorial-mock]\').remove()" title="Fermer">✕</button></div><div style="border:1px dashed #cbd5e1;border-radius:12px;padding:30px 24px;background:linear-gradient(180deg,#f0fdf4,#f1f5f9);text-align:center"><div style="font-size:48px;margin-bottom:12px;opacity:0.6">📋</div><div style="font-size:13.5px;color:#475569;font-weight:600;margin-bottom:6px">Dossier prêt pour l\'auditeur</div><div style="font-size:12px;color:#64748b;line-height:1.6;max-width:380px;margin:0 auto">Matrice de conformité + journal complet, horodaté et signé. Choisissez « Enregistrer au format PDF » pour envoyer à votre auditeur ISO 22000.</div></div><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button style="padding:9px 18px;border-radius:9px;background:white;border:1px solid #e2e8f0;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit" onclick="this.closest(\'[data-tutorial-mock]\').remove()">Annuler</button><button style="padding:9px 18px;border-radius:9px;background:linear-gradient(135deg,#16a34a,#15803d);border:none;color:white;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Imprimer</button></div></div></div>', wait: 1200 },
            { type: 'caption', text: 'L\'aperçu du dossier s\'ouvre — matrice de conformité et journal complet, prêts pour l\'auditeur.', ms: 6500 },
            { type: 'move', selector: '[data-tour-mock-close]', wait: 700 },
            { type: 'caption', text: 'Je ferme l\'aperçu pour revenir au registre.', ms: 4000 },
            { type: 'click', selector: '[data-tour-mock-close]', pulse: true, wait: 1500 },

            // ── DELETE the demo record (workflow rule) ──
            { type: 'caption', text: 'Je supprime le contrôle de démonstration pour ne pas polluer vos données.', ms: 4500 },
            { type: 'move', selector: '[data-tour="haccp-row"][data-haccp-controller="TUTO-DEMO contrôleur"] [data-tour="haccp-row-delete"]', wait: 600 },
            { type: 'click', selector: '[data-tour="haccp-row"][data-haccp-controller="TUTO-DEMO contrôleur"] [data-tour="haccp-row-delete"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="haccp-delete-confirm"]', wait: 500 },
            { type: 'caption', text: 'Confirmation, puis Supprimer.', ms: 3000 },
            { type: 'click', selector: '[data-tour="haccp-delete-confirm"]', pulse: true, wait: 1800 },
            { type: 'caption', text: 'Contrôle supprimé. État initial rétabli.', ms: 3500 },
        ],
    },
    {
        icon: Ruler, color: '#f59e0b',
        title: 'Étalonnage',
        selector: '[data-tour="cal-filters"]', route: '/calibration',
        whatFor: 'Le registre des certificats d\'étalonnage : thermomètres, balances, pH-mètres, capteurs de pression — chacun avec sa date d\'expiration.',
        howTo: 'Filtrez par état (valide / à étalonner / expiré). Imprimez le registre pour les audits. Ajoutez de nouveaux instruments avec leur certificat.',
        helps: 'Mesures fiables = qualité produit garantie. Obligation réglementaire et conformité ISO 17025.',
        align: 'Les techniciens consultent pour savoir si un instrument est encore valide avant utilisation.',
        demo: [
            // ── Filter walk ──
            { type: 'move', selector: '[data-tour="cal-filters"]', wait: 500 },
            { type: 'caption', text: 'En haut, quatre chips de filtrage par état du certificat : Tous, Valides, À étalonner, Expirés.', ms: 6000 },
            { type: 'move', selector: '[data-tour="cal-filter"][data-status="expiré"]', wait: 500 },
            { type: 'caption', text: 'Je clique sur « Expirés » pour isoler les instruments hors validité — interdits de mesure jusqu\'au ré-étalonnage.', ms: 6500 },
            { type: 'click', selector: '[data-tour="cal-filter"][data-status="expiré"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="cal-table"]', wait: 500 },
            { type: 'caption', text: 'La table se restreint immédiatement. Pratique pour préparer un planning de ré-étalonnage avec l\'organisme accrédité.', ms: 6500 },
            { type: 'move', selector: '[data-tour="cal-filter"][data-status="à étalonner"]', wait: 500 },
            { type: 'caption', text: 'Je passe sur « À étalonner » — les instruments dont l\'échéance arrive dans moins de 30 jours, à programmer en avance.', ms: 6500 },
            { type: 'click', selector: '[data-tour="cal-filter"][data-status="à étalonner"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="cal-filter"][data-status="all"]', wait: 500 },
            { type: 'caption', text: 'Je remets « Tous » pour revoir l\'ensemble du parc d\'instruments.', ms: 4500 },
            { type: 'click', selector: '[data-tour="cal-filter"][data-status="all"]', pulse: true, wait: 1500 },

            // ── Table walk ──
            { type: 'move', selector: '[data-tour="cal-table"]', wait: 600 },
            { type: 'caption', text: 'Le parc d\'instruments : Instrument, Type, Machine liée (ou Laboratoire), Dernier étalonnage, Prochaine échéance, n° de certificat, État.', ms: 9000 },
            { type: 'caption', text: 'La colonne « Prochaine échéance » devient rouge en gras dès qu\'un certificat expire dans moins de 60 jours — votre signal d\'action avant la mesure HACCP.', ms: 8500 },
            { type: 'caption', text: 'Tout en haut, un bandeau d\'alerte rouge s\'affiche dès qu\'au moins un instrument est expiré — impossible de le rater.', ms: 7000 },

            // ── Create instrument ──
            { type: 'move', selector: '[data-tour="page-add"]', wait: 500 },
            { type: 'caption', text: 'Pour enregistrer un nouvel équipement de mesure, le bouton cyan « Nouvel instrument » en haut à droite.', ms: 5500 },
            { type: 'click', selector: '[data-tour="page-add"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="cal-form-name"]', wait: 500 },
            { type: 'caption', text: 'Formulaire : d\'abord le nom de l\'instrument.', ms: 4500 },
            { type: 'type', selector: '[data-tour="cal-form-name"]', value: 'TUTO-DEMO sonde de mesure', wait: 700 },
            { type: 'caption', text: 'Puis le repère métier, le type (thermomètre, balance, pH-mètre, capteur de pression…), la machine liée, le n° de certificat, les dates et l\'organisme émetteur.', ms: 9500 },
            { type: 'move', selector: '[data-tour="cal-form-save"]', wait: 500 },
            { type: 'caption', text: 'Une fois enregistré, le système calcule la date « 60 jours avant échéance » et envoie un email d\'alerte automatique. Je clique sur Enregistrer.', ms: 7500 },
            { type: 'click', selector: '[data-tour="cal-form-save"]', pulse: true, wait: 2000 },

            // ── DELETE the demo instrument ──
            { type: 'caption', text: 'L\'instrument apparaît dans la table. Je le supprime pour ne pas polluer vos données.', ms: 5500 },
            { type: 'move', selector: '[data-tour="cal-row"][data-instrument="TUTO-DEMO sonde de mesure"] [data-tour="cal-row-delete"]', wait: 600 },
            { type: 'click', selector: '[data-tour="cal-row"][data-instrument="TUTO-DEMO sonde de mesure"] [data-tour="cal-row-delete"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="cal-delete-confirm"]', wait: 500 },
            { type: 'click', selector: '[data-tour="cal-delete-confirm"]', pulse: true, wait: 1800 },
            { type: 'caption', text: 'Instrument supprimé. État initial rétabli.', ms: 3500 },

            // ── Click Registre d'étalonnage (print) — mock preview + close ──
            { type: 'move', selector: '[data-tour="cal-print"]', wait: 600 },
            { type: 'caption', text: 'Le bouton « Registre d\'étalonnage » imprime tout le parc d\'instruments avec leurs certificats — preuve directe pour ISO 17025.', ms: 7500 },
            { type: 'pretend-click', selector: '[data-tour="cal-print"]', wait: 1500 },
            { type: 'mock', container: 'body', html: '<div data-tour-mock-print style="position:fixed;inset:0;background:rgba(15,23,42,0.65);z-index:99998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)"><div style="background:white;border-radius:16px;padding:24px 26px;max-width:620px;width:90%;box-shadow:0 24px 60px rgba(0,0,0,0.35);font-family:inherit"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px"><div style="display:flex;align-items:center;gap:10px"><div style="width:36px;height:36px;border-radius:9px;background:#ecfeff;display:flex;align-items:center;justify-content:center;color:#0891b2;font-size:18px">📐</div><div><h3 style="font-size:17px;font-weight:700;color:#0f172a;margin:0">Registre d\'étalonnage</h3><div style="font-size:12px;color:#64748b;margin-top:2px">Parc d\'instruments + certificats · format A4</div></div></div><button data-tour-mock-close style="width:34px;height:34px;border-radius:9px;background:#f1f5f9;border:none;cursor:pointer;font-size:16px;color:#475569;display:flex;align-items:center;justify-content:center" onclick="this.closest(\'[data-tutorial-mock]\').remove()" title="Fermer">✕</button></div><div style="border:1px dashed #cbd5e1;border-radius:12px;padding:30px 24px;background:linear-gradient(180deg,#ecfeff,#f1f5f9);text-align:center"><div style="font-size:48px;margin-bottom:12px;opacity:0.6">📋</div><div style="font-size:13.5px;color:#475569;font-weight:600;margin-bottom:6px">Registre prêt à archiver</div><div style="font-size:12px;color:#64748b;line-height:1.6;max-width:380px;margin:0 auto">Liste complète des instruments avec n° de certificat, organisme, dates et état. Conforme aux exigences ISO 17025.</div></div><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button style="padding:9px 18px;border-radius:9px;background:white;border:1px solid #e2e8f0;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit" onclick="this.closest(\'[data-tutorial-mock]\').remove()">Annuler</button><button style="padding:9px 18px;border-radius:9px;background:linear-gradient(135deg,#0891b2,#0e7490);border:none;color:white;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Imprimer</button></div></div></div>', wait: 1200 },
            { type: 'caption', text: 'L\'aperçu du registre — toutes les sondes du parc avec n° de certificat et organisme. Prêt à archiver.', ms: 6500 },
            { type: 'move', selector: '[data-tour-mock-close]', wait: 700 },
            { type: 'caption', text: 'Je ferme l\'aperçu pour revenir au parc.', ms: 4000 },
            { type: 'click', selector: '[data-tour-mock-close]', pulse: true, wait: 1500 },
        ],
    },
    {
        icon: ListChecks, color: '#06b6d4',
        title: 'Check-lists OT',
        selector: '[data-tour="cl-kpis"]', route: '/checklists',
        whatFor: 'Vos modèles de check-lists réutilisables — démarrage ligne, nettoyage, fin de poste — exécutables par les techniciens étape par étape.',
        howTo: 'Surveillez les KPI (modèles, exécutions, % complétion). Créez un modèle, le tech le lance et coche chaque étape — résultat archivé.',
        helps: 'Standardisation : pas d\'étape oubliée même par un débutant. Trace immuable pour l\'audit HACCP.',
        align: 'L\'admin créé les modèles, les techniciens les exécutent.',
        demo: [
            // ── KPI walk ──
            { type: 'move', selector: '[data-tour="cl-kpis"]', wait: 500 },
            { type: 'caption', text: 'En haut, trois KPI résument la santé du système de check-lists.', ms: 4500 },
            { type: 'move', selector: '[data-tour="cl-kpis"] > div:nth-of-type(1)', wait: 400 },
            { type: 'caption', text: 'Modèles : le nombre de check-lists réutilisables disponibles pour vos techniciens.', ms: 5000 },
            { type: 'move', selector: '[data-tour="cl-kpis"] > div:nth-of-type(2)', wait: 400 },
            { type: 'caption', text: 'Check-lists réalisées : compteur cumulé des exécutions terminées — votre trace d\'audit.', ms: 6000 },
            { type: 'move', selector: '[data-tour="cl-kpis"] > div:nth-of-type(3)', wait: 400 },
            { type: 'caption', text: 'Complétion moyenne : si < 90 % devient orange — signe que certaines étapes sont régulièrement sautées et qu\'il faut alléger le modèle ou former l\'équipe.', ms: 8500 },

            // ── Templates walk ──
            { type: 'move', selector: '[data-tour="cl-templates"]', wait: 600 },
            { type: 'caption', text: 'En dessous, les modèles de check-list — une carte par modèle.', ms: 5000 },
            { type: 'move', selector: '[data-tour="cl-tpl"]:first-of-type', wait: 500 },
            { type: 'caption', text: 'Chaque carte affiche : titre, machine cible (ou « toutes machines »), nombre d\'étapes, et un aperçu des 4 premières.', ms: 8000 },
            { type: 'caption', text: 'Bouton vert « Exécuter » : le tech ouvre le runner — une fenêtre avec checkbox par étape, observation, barre de progression, et bouton « Terminer ».', ms: 8500 },
            { type: 'caption', text: 'Bouton bleu = modifier le modèle. Bouton rouge = supprimer le modèle. Les check-lists déjà réalisées avec ce modèle restent archivées même après suppression.', ms: 8500 },

            // ── Create template ──
            { type: 'move', selector: '[data-tour="page-add"]', wait: 500 },
            { type: 'caption', text: 'Pour créer un nouveau modèle, le bouton bleu « Nouveau modèle » en haut à droite.', ms: 5500 },
            { type: 'click', selector: '[data-tour="page-add"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="cl-form-title"]', wait: 500 },
            { type: 'caption', text: 'Formulaire : titre de la check-list, machine concernée (ou « Toutes machines »), et la liste des étapes — ajoutables une par une.', ms: 8500 },
            { type: 'type', selector: '[data-tour="cl-form-title"]', value: 'TUTO-DEMO check-list', wait: 700 },

            // ── Add at least one step (required by the validator) ──
            { type: 'move', selector: '[data-tour="cl-form-step"]', wait: 500 },
            { type: 'caption', text: 'La validation exige au moins une étape. Je remplis la première ligne d\'étape.', ms: 6500 },
            { type: 'type', selector: '[data-tour="cl-form-step"]', value: 'TUTO-DEMO étape de contrôle', wait: 700 },
            { type: 'move', selector: '[data-tour="cl-form-add-step"]', wait: 500 },
            { type: 'caption', text: 'Le bouton « Ajouter une étape » insère une nouvelle ligne en bas — autant que nécessaire pour cadrer la procédure.', ms: 7500 },

            // Escape hatch: guarantee the title + at least one non-empty
            // step land in React state before save fires, even if the
            // dynamic-input typing path was de-synced.
            { type: 'event', eventName: 'smartmaint-demo-set-checklist-form', detail: { title: 'TUTO-DEMO check-list', items: ['TUTO-DEMO étape de contrôle'] }, wait: 400 },

            { type: 'move', selector: '[data-tour="cl-form-save"]', wait: 500 },
            { type: 'caption', text: 'Je clique sur Enregistrer — le modèle devient disponible pour tous les techniciens.', ms: 5500 },
            { type: 'click', selector: '[data-tour="cl-form-save"]', pulse: true, wait: 2000 },

            // ── EXECUTE the new template — show how the technician would run it ──
            { type: 'move', selector: '[data-tour="cl-tpl"][data-cl-title="TUTO-DEMO check-list"] [data-tour="cl-tpl-run"]', wait: 700 },
            { type: 'caption', text: 'Le modèle est créé. Avant de le supprimer, je vous montre comment le technicien le déroule. Je clique sur le bouton vert « Exécuter ».', ms: 8000 },
            { type: 'click', selector: '[data-tour="cl-tpl"][data-cl-title="TUTO-DEMO check-list"] [data-tour="cl-tpl-run"]', pulse: true, wait: 2000 },
            { type: 'caption', text: 'Le runner s\'ouvre : choix de la machine, nom du technicien qui exécute, barre de progression en haut, et la liste des étapes en bas — chacune avec sa case à cocher et un champ d\'observation libre.', ms: 10000 },
            { type: 'move', selector: '[data-tour="cl-runner-step"][data-step-index="0"]', wait: 600 },
            { type: 'caption', text: 'Je coche la première étape pour vous montrer comment ça fonctionne.', ms: 5000 },
            { type: 'click', selector: '[data-tour="cl-runner-step"][data-step-index="0"]', pulse: true, wait: 1500 },
            { type: 'caption', text: 'La barre de progression monte immédiatement. À 100 % le bouton « Terminer la check-list » archive le run avec horodatage — preuve d\'audit HACCP.', ms: 8000 },
            { type: 'move', selector: '[data-tour="cl-runner-cancel"]', wait: 600 },
            { type: 'caption', text: 'Pour la démo, je clique sur Annuler — pas de run sauvegardé.', ms: 5000 },
            { type: 'click', selector: '[data-tour="cl-runner-cancel"]', pulse: true, wait: 1500 },

            // ── DELETE the demo template ──
            { type: 'caption', text: 'Je supprime le modèle de démonstration pour ne pas polluer la liste.', ms: 4500 },
            { type: 'move', selector: '[data-tour="cl-tpl"][data-cl-title="TUTO-DEMO check-list"] [data-tour="cl-tpl-delete"]', wait: 600 },
            { type: 'click', selector: '[data-tour="cl-tpl"][data-cl-title="TUTO-DEMO check-list"] [data-tour="cl-tpl-delete"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="cl-delete-confirm"]', wait: 500 },
            { type: 'click', selector: '[data-tour="cl-delete-confirm"]', pulse: true, wait: 1800 },
            { type: 'caption', text: 'Modèle supprimé. État initial rétabli.', ms: 3500 },

            // ── Completed runs section ──
            { type: 'caption', text: 'Tout en bas, « Check-lists réalisées » : tableau de l\'historique avec date, modèle, machine, exécutant, barre de complétion. Cliquez « Voir » pour ouvrir le détail étape par étape.', ms: 9500 },
        ],
    },
    {
        icon: Lock, color: '#dc2626',
        title: 'LOTO — consignations',
        selector: '[data-tour="loto-kpis"]', route: '/loto',
        whatFor: 'Le registre des machines actuellement verrouillées par un technicien — Lock-Out Tag-Out, sécurité électrique obligatoire.',
        howTo: 'Vue agrégée : qui consigne quoi, depuis quand, motif. Chaque consignation a un cadenas physique numéroté. Le tech lève sa propre consigne.',
        helps: 'Évite les accidents : aucun collègue ne peut redémarrer une machine consignée par erreur.',
        align: 'Posée et levée par les techniciens. Vous supervisez l\'historique et auditez la conformité.',
        demo: [
            // ── KPI walk ──
            { type: 'move', selector: '[data-tour="loto-kpis"]', wait: 500 },
            { type: 'caption', text: 'En haut, trois KPI résument l\'état du registre LOTO.', ms: 4500 },
            { type: 'move', selector: '[data-tour="loto-kpis"] > div:nth-of-type(1)', wait: 400 },
            { type: 'caption', text: 'Machines consignées : combien sont actuellement verrouillées. Devient rouge dès qu\'une machine est en intervention — production impactée.', ms: 7000 },
            { type: 'move', selector: '[data-tour="loto-kpis"] > div:nth-of-type(2)', wait: 400 },
            { type: 'caption', text: 'Consignations passées : nombre de consignations terminées et archivées — votre journal de sécurité.', ms: 6000 },
            { type: 'move', selector: '[data-tour="loto-kpis"] > div:nth-of-type(3)', wait: 400 },
            { type: 'caption', text: 'Total registre : cumul depuis le début. Plus le chiffre est élevé, plus la culture LOTO est ancrée chez vos équipes.', ms: 6500 },

            // ── Active section walk ──
            { type: 'move', selector: '[data-tour="loto-active"]', wait: 600 },
            { type: 'caption', text: 'En dessous, « Machines actuellement consignées ». Chaque carte est rouge — code couleur de l\'arrêt de production.', ms: 7000 },
            { type: 'caption', text: 'Sur chaque carte : code machine, technicien qui a posé la consigne, durée écoulée, n° de cadenas physique, motif de l\'intervention.', ms: 8000 },
            { type: 'caption', text: 'Le bouton vert « Déconsigner » n\'est cliquable que par le technicien qui a posé la consigne — ou par un admin. Personne d\'autre ne peut lever par erreur.', ms: 8500 },

            // ── Consigner une machine ──
            { type: 'move', selector: '[data-tour="loto-action"]', wait: 500 },
            { type: 'caption', text: 'Pour consigner une nouvelle machine, le gros bouton rouge « Consigner une machine ».', ms: 5500 },
            { type: 'click', selector: '[data-tour="loto-action"]', pulse: true, wait: 1500 },

            // Form walk
            { type: 'move', selector: '[data-tour="loto-form-machine"]', wait: 500 },
            { type: 'caption', text: 'Le formulaire — d\'abord la machine. Seules les machines NON consignées sont proposées dans la liste.', ms: 6500 },
            { type: 'select', selector: '[data-tour="loto-form-machine"]', index: 1, wait: 900 },
            { type: 'move', selector: '[data-tour="loto-form-reason"]', wait: 500 },
            { type: 'caption', text: 'Puis le motif de l\'intervention — précis, pour que vos collègues sachent pourquoi la machine est arrêtée.', ms: 6500 },
            { type: 'type', selector: '[data-tour="loto-form-reason"]', value: 'TUTO-DEMO consignation démonstration', wait: 800 },
            { type: 'move', selector: '[data-tour="loto-form-padlock"]', wait: 500 },
            { type: 'caption', text: 'Le n° du cadenas physique posé sur le sectionneur — c\'est lui qui fait foi.', ms: 5500 },
            { type: 'type', selector: '[data-tour="loto-form-padlock"]', value: 'CAD-TUTO', wait: 700 },
            { type: 'caption', text: 'Le nom du technicien est pré-rempli, vous pouvez ajouter des notes libres.', ms: 5000 },
            { type: 'move', selector: '[data-tour="loto-form-save"]', wait: 500 },
            { type: 'caption', text: 'Je clique sur Consigner. La machine passe en « consignée » partout dans l\'app — impossible de la démarrer en production tant que la consigne tient.', ms: 8000 },
            { type: 'click', selector: '[data-tour="loto-form-save"]', pulse: true, wait: 2000 },

            // ── Walk the new active card ──
            { type: 'move', selector: '[data-tour="loto-card"][data-loto-padlock="CAD-TUTO"]', wait: 700 },
            { type: 'caption', text: 'Voilà notre carte de démonstration apparue dans la liste active — avec le n° de cadenas CAD-TUTO et le motif renseigné.', ms: 6500 },

            // ── REVERT — Déconsigner the demo lockout ──
            { type: 'caption', text: 'Je déconsigne pour rétablir l\'état initial.', ms: 3500 },
            { type: 'move', selector: '[data-tour="loto-card"][data-loto-padlock="CAD-TUTO"] [data-tour="loto-unlock"]', wait: 600 },
            { type: 'click', selector: '[data-tour="loto-card"][data-loto-padlock="CAD-TUTO"] [data-tour="loto-unlock"]', pulse: true, wait: 1400 },
            // Une fenêtre de confirmation s'ouvre — l'app ne déconsigne plus
            // sans double-check. Le tutoriel doit cliquer « Déconsigner » dans
            // le modal, sinon la machine reste consignée.
            { type: 'move', selector: '[data-tour="loto-unlock-confirm"]', wait: 500 },
            { type: 'caption', text: 'Une fenêtre demande confirmation — sécurité anti-erreur. Je clique « Déconsigner » pour valider.', ms: 5500 },
            { type: 'click', selector: '[data-tour="loto-unlock-confirm"]', pulse: true, wait: 1800 },
            { type: 'caption', text: 'Déconsignée. La machine est de nouveau disponible et la consignation rejoint l\'historique en bas — trace immuable conservée.', ms: 7000 },

            // ── History note ──
            { type: 'caption', text: 'Tout en bas, l\'« Historique des consignations » garde les 30 dernières avec durée totale — preuve d\'audit en cas d\'inspection sécurité.', ms: 7500 },
        ],
    },
    {
        icon: Award, color: '#f97316',
        title: 'Habilitations',
        selector: '[data-tour="cert-kpis"]', route: '/certifications',
        whatFor: 'Le carnet numérique des habilitations réglementaires de vos techniciens : B1V, BR, risque chimique, espaces confinés, travail en hauteur…',
        howTo: 'Surveillez les KPI (valides / expirent / expirées). Ajoutez chaque habilitation avec sa date d\'expiration — l\'app alerte 60 j avant échéance.',
        helps: 'Vous ne risquez plus d\'assigner un tech non-habilité à un OT sensible — légalement vous protège en cas d\'accident.',
        align: 'Vous gérez ; les techniciens voient leurs habilitations dans leur profil.',
        demo: [
            // ── KPI walk ──
            { type: 'move', selector: '[data-tour="cert-kpis"]', wait: 500 },
            { type: 'caption', text: 'En haut, trois KPI résument l\'état des habilitations de vos techniciens.', ms: 5000 },
            { type: 'move', selector: '[data-tour="cert-kpis"] > div:nth-of-type(1)', wait: 400 },
            { type: 'caption', text: 'Valides : toutes les habilitations actuellement en cours de validité — votre coussin de sécurité légale.', ms: 6000 },
            { type: 'move', selector: '[data-tour="cert-kpis"] > div:nth-of-type(2)', wait: 400 },
            { type: 'caption', text: 'Expirent < 60 j : la fenêtre pour replanifier le recyclage avant échéance — devient orange dès qu\'au moins une habilitation est concernée.', ms: 7500 },
            { type: 'move', selector: '[data-tour="cert-kpis"] > div:nth-of-type(3)', wait: 400 },
            { type: 'caption', text: 'Expirées : compteur rouge des habilitations dépassées. Si > 0, vous avez des techniciens qui interviennent peut-être sur des OT pour lesquels ils ne sont plus légalement couverts.', ms: 9000 },

            // ── Table walk ──
            { type: 'move', selector: '[data-tour="cert-table"]', wait: 600 },
            { type: 'caption', text: 'Le tableau des habilitations : Technicien, Type (B1V, BR, risque chimique, travail en hauteur, espaces confinés…), N° certificat, Organisme émetteur, dates, Statut coloré.', ms: 10000 },
            { type: 'caption', text: 'La colonne « Expire le » indique « dans X jours » ou « X jours de retard » — vous voyez immédiatement l\'urgence sans calcul mental.', ms: 8000 },
            { type: 'caption', text: 'Le badge Statut a quatre états : vert « valide », orange « à renouveler », rouge « expirée », gris « sans expiration ».', ms: 7500 },

            // ── KPI cards are clickable filters — demo it ──
            { type: 'move', selector: '[data-tour="cert-kpi-card"][data-status="à renouveler"]', wait: 600 },
            { type: 'caption', text: 'Chaque carte KPI est cliquable : elle filtre le tableau. Je clique sur « Expirent < 60 j » pour isoler les habilitations à renouveler.', ms: 8000 },
            { type: 'click', selector: '[data-tour="cert-kpi-card"][data-status="à renouveler"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="cert-table"]', wait: 600 },
            { type: 'caption', text: 'Le tableau se restreint à cette catégorie — pratique pour préparer la liste des recyclages à programmer.', ms: 6500 },
            { type: 'move', selector: '[data-tour="cert-kpi-card"][data-status="à renouveler"]', wait: 600 },
            { type: 'caption', text: 'Je re-clique pour retirer le filtre.', ms: 3500 },
            { type: 'click', selector: '[data-tour="cert-kpi-card"][data-status="à renouveler"]', pulse: true, wait: 1500 },

            // ── Real save: create a TUTO-DEMO habilitation ──
            { type: 'move', selector: '[data-tour="cert-add"]', wait: 500 },
            { type: 'caption', text: 'Pour enregistrer une nouvelle habilitation, le bouton bleu « Ajouter une habilitation » en haut à droite.', ms: 6500 },
            { type: 'click', selector: '[data-tour="cert-add"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="cert-form-number"]', wait: 500 },
            { type: 'caption', text: 'Formulaire : Technicien, Type (B1V / BR / chimique / hauteur…), n° de certificat — j\'inscris un numéro de démo.', ms: 8000 },
            { type: 'type', selector: '[data-tour="cert-form-number"]', value: 'TUTO-DEMO-CERT', wait: 700 },
            { type: 'caption', text: 'Puis dates d\'émission et d\'expiration, Organisme émetteur (APAVE, Bureau Veritas…), zone Notes. À terme, l\'app bloquera l\'assignation d\'un OT électrique à un technicien sans B1V valide.', ms: 10500 },
            { type: 'move', selector: '[data-tour="cert-form-save"]', wait: 500 },
            { type: 'caption', text: 'Je clique sur Enregistrer.', ms: 3000 },
            { type: 'click', selector: '[data-tour="cert-form-save"]', pulse: true, wait: 2000 },
            { type: 'caption', text: 'Habilitation enregistrée — un email d\'alerte sera envoyé 60 jours avant l\'échéance.', ms: 5500 },

            // ── DELETE the demo habilitation ──
            { type: 'caption', text: 'Je supprime l\'habilitation de démo pour ne pas polluer vos données.', ms: 4500 },
            { type: 'move', selector: '[data-tour="cert-row"][data-cert-number="TUTO-DEMO-CERT"] [data-tour="cert-row-delete"]', wait: 600 },
            { type: 'click', selector: '[data-tour="cert-row"][data-cert-number="TUTO-DEMO-CERT"] [data-tour="cert-row-delete"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="cert-delete-confirm"]', wait: 500 },
            { type: 'click', selector: '[data-tour="cert-delete-confirm"]', pulse: true, wait: 1800 },
            { type: 'caption', text: 'Habilitation supprimée. État initial rétabli.', ms: 3500 },
        ],
    },
    {
        icon: Package, color: '#06b6d4',
        title: 'Lots de production',
        selector: '[data-tour="batch-kpis"]', route: '/production-batches',
        whatFor: 'Toute la traçabilité HACCP au même endroit : chaque lot lié à machine, opérateur, dates, quantité planifiée vs produite, photos qualité.',
        howTo: 'Section haute : lots en cours avec barre de progression. Section basse : historique complet. Démarrez un nouveau lot avec le bouton vert.',
        helps: 'En cas de rappel produit, vous remontez en 5 secondes : bouteille → lot → machine → opérateur → heure exacte.',
        align: 'L\'opérateur démarre les lots sur sa tablette depuis son dashboard. Vous voyez le tout consolidé ici.',
        demo: [
            // ── KPI walk ──
            { type: 'move', selector: '[data-tour="batch-kpis"]', wait: 500 },
            { type: 'caption', text: 'En haut, trois KPI résument l\'activité production.', ms: 4500 },
            { type: 'move', selector: '[data-tour="batch-kpis"] > div:nth-of-type(1)', wait: 400 },
            { type: 'caption', text: 'Lots en cours : combien de productions tournent en ce moment sur le parc. C\'est votre photo instantanée d\'activité.', ms: 6500 },
            { type: 'move', selector: '[data-tour="batch-kpis"] > div:nth-of-type(2)', wait: 400 },
            { type: 'caption', text: 'Lots terminés : compteur cumulé des productions clôturées — base statistique pour vos calculs de rendement.', ms: 6500 },
            { type: 'move', selector: '[data-tour="batch-kpis"] > div:nth-of-type(3)', wait: 400 },
            { type: 'caption', text: 'Total enregistrés : grand cumul depuis le début. La preuve de profondeur de votre historique de traçabilité.', ms: 7000 },

            // ── Active batches walk ──
            { type: 'move', selector: '[data-tour="batch-active"]', wait: 600 },
            { type: 'caption', text: 'En dessous, « Lots en cours » — une carte bleue par lot actif.', ms: 5500 },
            { type: 'caption', text: 'Sur chaque carte : n° de lot, produit, machine de production, opérateur, date de démarrage. La barre de progression bleue montre la quantité produite vs planifiée — elle devient verte à 100 %.', ms: 11000 },
            { type: 'caption', text: 'L\'opérateur peut mettre à jour la quantité produite directement dans le champ, sans ouvrir de fenêtre. Le bouton rouge « Terminer » clôt le lot et le déplace dans l\'historique.', ms: 9500 },

            // ── Mode supervision : pas de bouton « Démarrer un lot »,
            //    pas d'édition de quantité, pas de Terminer.
            //    L'admin/technicien voit le flux production en lecture
            //    seule — toute action production est sur la tablette
            //    opérateur. On confirme ça avec un caption explicite.
            { type: 'caption', text: 'Important : en tant qu\'admin responsable maintenance, je ne pilote PAS la production. Pas de bouton « Démarrer un lot », pas d\'édition de quantité, pas de Terminer — tout ça reste exclusif à l\'opérateur depuis sa tablette.', ms: 13500 },
            { type: 'move', selector: '[data-tour="batch-active"]', wait: 700 },
            { type: 'caption', text: 'Sur chaque carte de lot en cours je vois les mêmes infos que l\'opérateur — n° de lot, produit, machine, opérateur, barre de progression — mais avec la mention « Mise à jour + clôture côté opérateur » au lieu des contrôles éditables.', ms: 13000 },

            // ── History walk ──
            { type: 'move', selector: '[data-tour="batch-history"]', wait: 600 },
            { type: 'caption', text: 'Tout en bas, « Lots terminés — historique ». Tableau complet avec n° de lot, produit, machine, opérateur, dates, quantité.', ms: 8000 },
            { type: 'caption', text: 'La barre de recherche en haut filtre par n° de lot, produit ou opérateur — utile quand un client appelle pour réclamer.', ms: 7500 },
            { type: 'caption', text: 'En cas de rappel produit, vous remontez en 5 secondes : bouteille → n° de lot → machine → opérateur → heure exacte. C\'est la base de votre conformité HACCP.', ms: 9000 },
        ],
    },

    // ─── Équipe ───
    {
        icon: Users, color: '#06b6d4',
        title: 'Personnel',
        selector: '[data-tour="personnel-tabs"]', route: '/personnel',
        whatFor: 'Annuaire de l\'équipe : techniciens et opérateurs, spécialités, contacts. Plus un onglet Réunions pour planifier vos points techniciens.',
        howTo: 'Onglet Employés : ajouter, modifier, ou convoquer une personne au bureau. Onglet Réunions : planifier une réunion technique, tous les conviés reçoivent un email + rappel.',
        helps: 'Source unique de vérité pour l\'équipe — assignation des OT, ack des consignes, convocations, audit, tout y est rattaché.',
        align: 'Chaque personne créée ici peut se connecter à son interface dédiée (technicien ou opérateur).',
        demo: [
            // ═══════════════════════════════════════════════════════
            // ── 1) KPI walk (3 cards) ────────────────────────────
            // ═══════════════════════════════════════════════════════
            { type: 'move', selector: '[data-tour="personnel-kpis"]', wait: 500 },
            { type: 'caption', text: 'En haut, trois KPI résument votre équipe.', ms: 4000 },
            { type: 'move', selector: '[data-tour="personnel-kpis"] > div:nth-of-type(1)', wait: 400 },
            { type: 'caption', text: 'Personnel total : la taille de votre équipe — techniciens + opérateurs cumulés.', ms: 5500 },
            { type: 'move', selector: '[data-tour="personnel-kpis"] > div:nth-of-type(2)', wait: 400 },
            { type: 'caption', text: 'Techniciens : ceux qui interviennent sur les machines. Ce sont eux qui exécutent vos OT et reçoivent les habilitations B1V, BR, hauteur…', ms: 7500 },
            { type: 'move', selector: '[data-tour="personnel-kpis"] > div:nth-of-type(3)', wait: 400 },
            { type: 'caption', text: 'Opérateurs : ceux qui pilotent les machines en production — ils enregistrent les lots, déclarent les pannes, accusent les consignes.', ms: 7500 },

            // ═══════════════════════════════════════════════════════
            // ── 2) Tabs walk ─────────────────────────────────────
            // ═══════════════════════════════════════════════════════
            { type: 'move', selector: '[data-tour="personnel-tabs"]', wait: 500 },
            { type: 'caption', text: 'Deux onglets : Employés (l\'annuaire complet) et Réunions (les points techniques planifiés). Le compteur à côté du label indique combien d\'éléments figurent dans chaque onglet.', ms: 9500 },

            // ═══════════════════════════════════════════════════════
            // ── 3) Search bar ────────────────────────────────────
            // ═══════════════════════════════════════════════════════
            { type: 'move', selector: '[data-tour="personnel-search"]', wait: 500 },
            { type: 'caption', text: 'À gauche, la barre de recherche : je tape une partie de nom pour filtrer l\'annuaire à la volée.', ms: 6500 },
            { type: 'type', selector: '[data-tour="personnel-search"] input', value: 'TUTO', wait: 700 },
            { type: 'caption', text: 'La liste se restreint instantanément aux résultats correspondants. J\'efface pour revoir tout le monde.', ms: 6000 },
            { type: 'type', selector: '[data-tour="personnel-search"] input', value: '', wait: 500 },

            // ═══════════════════════════════════════════════════════
            // ── 4) Role filter chips (each one walked) ───────────
            // ═══════════════════════════════════════════════════════
            { type: 'move', selector: '[data-tour="personnel-role-filters"]', wait: 500 },
            { type: 'caption', text: 'À droite de la recherche, trois chips de filtre par rôle : Tous, Techniciens, Opérateurs.', ms: 6500 },
            { type: 'move', selector: '[data-tour="personnel-role-filter"][data-role="technicien"]', wait: 500 },
            { type: 'caption', text: 'Je clique sur « Techniciens » pour isoler cette population — utile pour préparer une réunion technique.', ms: 7500 },
            { type: 'click', selector: '[data-tour="personnel-role-filter"][data-role="technicien"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="personnel-role-filter"][data-role="operateur"]', wait: 500 },
            { type: 'caption', text: 'Puis « Opérateurs » — pour identifier qui est sur quelle ligne.', ms: 6000 },
            { type: 'click', selector: '[data-tour="personnel-role-filter"][data-role="operateur"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="personnel-role-filter"][data-role="all"]', wait: 500 },
            { type: 'caption', text: 'Et « Tous » pour revoir l\'annuaire complet.', ms: 4500 },
            { type: 'click', selector: '[data-tour="personnel-role-filter"][data-role="all"]', pulse: true, wait: 1500 },

            // ═══════════════════════════════════════════════════════
            // ── 5) Row action: NOTIFY (real send) ─────────────────
            // ═══════════════════════════════════════════════════════
            { type: 'move', selector: '[data-tour="personnel-notify"]', wait: 600 },
            { type: 'caption', text: 'Sur chaque ligne, trois actions. D\'abord le bouton violet avion en papier — pour convoquer la personne ou lui envoyer un message libre.', ms: 8000 },
            { type: 'click', selector: '[data-tour="personnel-notify"]', pulse: true, wait: 1800 },
            { type: 'caption', text: 'La fenêtre de notification s\'ouvre : choix du motif (convocation au bureau / message libre), zone de texte, et envoi simultané email + notification in-app horodatés.', ms: 11000 },
            { type: 'move', selector: '[data-tour="personnel-notify-message"]', wait: 600 },
            { type: 'caption', text: 'Je rédige le message — visible dans la boîte mail et dans l\'app de l\'employé.', ms: 6000 },
            { type: 'type', selector: '[data-tour="personnel-notify-message"]', value: 'TUTO-DEMO message de notification', wait: 700 },
            // Escape hatch to guarantee notifyMessage is in React state.
            { type: 'event', eventName: 'smartmaint-demo-set-notify-form', detail: { message: 'TUTO-DEMO message de notification' }, wait: 400 },
            { type: 'move', selector: '[data-tour="personnel-notify-send"]', wait: 500 },
            { type: 'caption', text: 'Je clique sur Envoyer — l\'email part et la notification in-app apparaît instantanément.', ms: 6500 },
            { type: 'click', selector: '[data-tour="personnel-notify-send"]', pulse: true, wait: 2000 },
            { type: 'caption', text: 'Envoyé. Note : la notification est conservée comme trace — pas de « annuler envoi » côté admin (comme un email réel).', ms: 7500 },

            // ═══════════════════════════════════════════════════════
            // ── 6) Row action: EDIT (full modal walk + cancel) ───
            // ═══════════════════════════════════════════════════════
            { type: 'move', selector: '[data-tour="personnel-row-edit"]', wait: 600 },
            { type: 'caption', text: 'Le deuxième bouton de la ligne — l\'icône crayon bleue — ouvre la fiche en mode édition.', ms: 6500 },
            { type: 'click', selector: '[data-tour="personnel-row-edit"]', pulse: true, wait: 1800 },
            { type: 'caption', text: 'Tous les champs deviennent modifiables : photo, nom, rôle (Technicien ↔ Opérateur — la migration de table est automatique), spécialité, téléphone, email.', ms: 11000 },
            { type: 'move', selector: '[data-tour="personnel-form-cancel"]', wait: 500 },
            { type: 'caption', text: 'Je clique sur Annuler pour ne rien changer.', ms: 4500 },
            { type: 'click', selector: '[data-tour="personnel-form-cancel"]', pulse: true, wait: 1500 },

            // ═══════════════════════════════════════════════════════
            // ── 7) Row action: DELETE — mention only, walked
            //       fully on the demo row we'll create below.
            // ═══════════════════════════════════════════════════════
            { type: 'caption', text: 'Le troisième bouton — la corbeille rouge — supprime l\'employé avec confirmation. Je vous le montre sur l\'employé de démonstration créé juste après.', ms: 9500 },

            // ═══════════════════════════════════════════════════════
            // ── 8) ADD employee — full create + visible save ─────
            // ═══════════════════════════════════════════════════════
            { type: 'move', selector: '[data-tour="page-add"]', wait: 600 },
            { type: 'caption', text: 'Pour ajouter un nouvel employé, le bouton bleu « Ajouter » en haut à droite de la toolbar.', ms: 6000 },
            { type: 'click', selector: '[data-tour="page-add"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="personnel-form-name"]', wait: 500 },
            { type: 'caption', text: 'Formulaire : photo en haut (upload depuis votre disque), Nom complet, Rôle (Technicien ou Opérateur — deux pastilles), Spécialité ou zone, téléphone et email.', ms: 10500 },
            { type: 'type', selector: '[data-tour="personnel-form-name"]', value: 'TUTO-DEMO employé', wait: 700 },
            // Escape hatch — guarantee form.nom is in React state before
            // save fires, so handleSave's nom.trim() validation passes and
            // setIsModalOpen(false) is reached. Without this the modal
            // would silently stay open and the row never get created.
            { type: 'event', eventName: 'smartmaint-demo-set-personnel-form', detail: { nom: 'TUTO-DEMO employé' }, wait: 400 },
            { type: 'move', selector: '[data-tour="personnel-form-save"]', wait: 500 },
            { type: 'caption', text: 'Je clique sur Enregistrer.', ms: 3500 },
            { type: 'click', selector: '[data-tour="personnel-form-save"]', pulse: true, wait: 2200 },
            { type: 'caption', text: 'Employé créé — il apparaît dans l\'annuaire et pourra se connecter à son interface dédiée (technicien ou opérateur) avec les identifiants que vous lui transmettrez.', ms: 9500 },

            // ═══════════════════════════════════════════════════════
            // ── 9) DELETE the demo employee (full walk) ──────────
            // ═══════════════════════════════════════════════════════
            { type: 'caption', text: 'Maintenant je vous montre la suppression sur cet employé de démo.', ms: 4500 },
            { type: 'move', selector: '[data-tour="personnel-row"][data-person-name="TUTO-DEMO employé"] [data-tour="personnel-row-delete"]', wait: 600 },
            { type: 'caption', text: 'Je clique sur la corbeille rouge de la ligne.', ms: 4000 },
            { type: 'click', selector: '[data-tour="personnel-row"][data-person-name="TUTO-DEMO employé"] [data-tour="personnel-row-delete"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="personnel-delete-confirm"]', wait: 500 },
            { type: 'caption', text: 'Une confirmation s\'ouvre pour éviter les suppressions accidentelles. Je confirme.', ms: 5000 },
            { type: 'click', selector: '[data-tour="personnel-delete-confirm"]', pulse: true, wait: 1800 },
            { type: 'caption', text: 'Employé supprimé. État initial rétabli.', ms: 3500 },

            // ═══════════════════════════════════════════════════════
            // ── 10) MEETINGS tab — full create + delete cycle ─────
            // ═══════════════════════════════════════════════════════
            { type: 'move', selector: '[data-tour="personnel-tab-meetings"]', wait: 600 },
            { type: 'caption', text: 'Je passe à l\'onglet « Réunions » pour vous montrer la planification.', ms: 5500 },
            { type: 'click', selector: '[data-tour="personnel-tab-meetings"]', pulse: true, wait: 1800 },
            { type: 'caption', text: 'L\'onglet Réunions liste les points techniques planifiés. Chaque carte affiche la date, l\'heure, le lieu, la liste des conviés, et un éventuel ordre du jour libre.', ms: 11000 },

            // ── Plan a meeting (real) ──
            { type: 'move', selector: '[data-tour="personnel-add-meeting"]', wait: 600 },
            { type: 'caption', text: 'Je clique sur « Planifier une réunion » pour ouvrir le formulaire.', ms: 5500 },
            { type: 'click', selector: '[data-tour="personnel-add-meeting"]', pulse: true, wait: 1800 },
            { type: 'move', selector: '[data-tour="personnel-meeting-title"]', wait: 500 },
            { type: 'caption', text: 'Formulaire : titre court (l\'objet de la réunion), date et heure, durée, lieu, ordre du jour, et la liste de conviés à cocher parmi vos techniciens.', ms: 12000 },
            { type: 'type', selector: '[data-tour="personnel-meeting-title"]', value: 'TUTO-DEMO réunion technique', wait: 700 },
            // Escape hatch — set title + a future datetime + first attendee
            // directly in state. Without an attendee the validator rejects.
            { type: 'event', eventName: 'smartmaint-demo-set-meeting-form', detail: { title: 'TUTO-DEMO réunion technique' }, wait: 400 },
            { type: 'move', selector: '[data-tour="personnel-meeting-save"]', wait: 500 },
            { type: 'caption', text: 'Tout est prêt. Je clique sur « Planifier & notifier ».', ms: 5000 },
            { type: 'click', selector: '[data-tour="personnel-meeting-save"]', pulse: true, wait: 2500 },
            { type: 'caption', text: 'Réunion créée — tous les conviés reçoivent un email + un rappel automatique le matin même.', ms: 7500 },

            // ── Walk the new meeting card and cancel it ──
            { type: 'move', selector: '[data-tour="personnel-meeting"][data-meeting-title="TUTO-DEMO réunion technique"]', wait: 700 },
            { type: 'caption', text: 'La réunion apparaît dans la liste avec sa date, ses conviés et son ordre du jour. Je l\'annule pour ne pas polluer votre calendrier.', ms: 8500 },
            { type: 'move', selector: '[data-tour="personnel-meeting"][data-meeting-title="TUTO-DEMO réunion technique"] [data-tour="personnel-meeting-cancel"]', wait: 600 },
            { type: 'click', selector: '[data-tour="personnel-meeting"][data-meeting-title="TUTO-DEMO réunion technique"] [data-tour="personnel-meeting-cancel"]', pulse: true, wait: 1800 },
            { type: 'move', selector: '[data-tour="personnel-meeting-cancel-confirm"]', wait: 500 },
            { type: 'caption', text: 'Confirmation — l\'email d\'annulation sera envoyé aux conviés. Je confirme.', ms: 6000 },
            { type: 'click', selector: '[data-tour="personnel-meeting-cancel-confirm"]', pulse: true, wait: 2000 },
            { type: 'caption', text: 'Réunion annulée. État initial rétabli.', ms: 4000 },
            { type: 'caption', text: 'Les opérateurs n\'assistent pas aux réunions techniques par défaut — leur quotidien tourne autour de leur poste de production.', ms: 7500 },

            // ── Back to employees ──
            { type: 'move', selector: '[data-tour="personnel-tab-employees"]', wait: 500 },
            { type: 'caption', text: 'Je reviens à l\'annuaire pour finir.', ms: 3500 },
            { type: 'click', selector: '[data-tour="personnel-tab-employees"]', pulse: true, wait: 1500 },
        ],
    },
    {
        icon: Notebook, color: '#3b82f6',
        title: 'Carnet de quart',
        selector: '[data-tour="handover-compose"]', route: '/handover',
        whatFor: 'Messages laissés entre les 3×8 — ce qui marche, ce qui ne marche pas, ce qui doit être surveillé.',
        howTo: 'Tapez ou dictez au micro orange, choisissez la priorité, publiez. Marquer « Pris en charge » quand traité.',
        helps: 'Continuité 3×8 garantie : la relève voit tout en arrivant, pas de surprise.',
        align: 'Vous, techniciens et nouveaux arrivants partagent le même carnet en temps réel.',
        demo: [
            // ── Compose section walk ──
            { type: 'move', selector: '[data-tour="handover-compose"]', wait: 500 },
            { type: 'caption', text: 'La zone de composition. Je tape un mot pour la prochaine équipe.', ms: 5500 },
            { type: 'move', selector: '[data-tour="handover-text"]', wait: 500 },
            { type: 'type', selector: '[data-tour="handover-text"]', value: 'TUTO-DEMO note pour la relève — démarrage REM-001 vérifié.', wait: 900 },
            // Escape hatch — guarantee content is in React state before Publier fires.
            { type: 'event', eventName: 'smartmaint-demo-set-handover-form', detail: { content: 'TUTO-DEMO note pour la relève — démarrage REM-001 vérifié.' }, wait: 400 },

            // ── Mic button explanation ──
            { type: 'move', selector: '[data-tour="handover-mic"]', wait: 500 },
            { type: 'caption', text: 'À droite du textarea, le micro orange : dictée vocale. Whisper transcrit en français ; le texte est ajouté à la suite de ce que vous avez tapé. Idéal mains occupées.', ms: 10000 },

            // ── Priority + machine ──
            { type: 'move', selector: '[data-tour="handover-priority"]', wait: 500 },
            { type: 'caption', text: 'Trois niveaux de priorité : Info, À surveiller, Urgent. Le code couleur de la bordure de la note reprend ce niveau.', ms: 7000 },
            { type: 'move', selector: '[data-tour="handover-machine"]', wait: 500 },
            { type: 'caption', text: 'Vous pouvez optionnellement lier la note à une machine spécifique — utile pour retrouver toutes les notes d\'un équipement.', ms: 7500 },

            // ── Publish (real) ──
            { type: 'move', selector: '[data-tour="handover-publish"]', wait: 500 },
            { type: 'caption', text: 'Je clique sur Publier — la relève voit la note dès sa connexion.', ms: 5500 },
            { type: 'click', selector: '[data-tour="handover-publish"]', pulse: true, wait: 2200 },

            // ── Walk the new note ──
            { type: 'move', selector: '[data-tour="handover-note"][data-note-content^="TUTO-DEMO"]', wait: 700 },
            { type: 'caption', text: 'La note apparaît dans la liste avec sa priorité colorée, l\'auteur, l\'heure relative. Le bouton vert « Pris en charge » la marque comme traitée.', ms: 9000 },

            // ── Filter chips ──
            { type: 'move', selector: '[data-tour="handover-filter"]', wait: 500 },
            { type: 'caption', text: 'Filtres en haut de liste : Ouvertes, Toutes, Résolues — pour faire le tri rapidement.', ms: 6000 },

            // ── DELETE the demo note ──
            { type: 'caption', text: 'Je supprime la note de démonstration pour ne pas polluer le carnet.', ms: 5000 },
            { type: 'move', selector: '[data-tour="handover-note"][data-note-content^="TUTO-DEMO"] [data-tour="handover-note-delete"]', wait: 600 },
            { type: 'click', selector: '[data-tour="handover-note"][data-note-content^="TUTO-DEMO"] [data-tour="handover-note-delete"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="handover-note-delete-confirm"]', wait: 500 },
            { type: 'click', selector: '[data-tour="handover-note-delete-confirm"]', pulse: true, wait: 1800 },
            { type: 'caption', text: 'Note supprimée. État initial rétabli.', ms: 3500 },
        ],
    },
    {
        icon: BookOpen, color: '#8b5cf6',
        title: 'Base de connaissances',
        selector: '[data-tour="knowledge-search"]', route: '/knowledge',
        whatFor: 'La bibliothèque des procédures, fiches dépannage et règles de sécurité écrites par l\'équipe — la mémoire technique de l\'usine.',
        howTo: 'Cherchez par mot-clé, filtrez par catégorie ou type d\'atelier, ouvrez une fiche pour la lire ou créez-en une nouvelle en markdown.',
        helps: 'L\'expérience des seniors devient accessible aux juniors — pas de savoir bloqué dans une seule tête.',
        align: 'Le technicien peut cliquer « Démarrer la procédure » sur une fiche → exécution pas-à-pas chronométrée et tracée.',
        demo: [
            // ── Search + filters walk ──
            { type: 'move', selector: '[data-tour="knowledge-search"]', wait: 500 },
            { type: 'caption', text: 'En haut, la barre de recherche : filtrez par titre, contenu ou tag. Le compteur à droite montre combien de fiches correspondent.', ms: 6500 },
            { type: 'move', selector: '[data-tour="knowledge-cats"]', wait: 500 },
            { type: 'caption', text: 'En dessous, les chips par catégorie : procédure, dépannage, sécurité, qualité — combinables avec les chips atelier juste en dessous.', ms: 7000 },

            // ── Create a fiche with FULL content (the missing piece) ──
            { type: 'move', selector: '[data-tour="page-add"]', wait: 500 },
            { type: 'caption', text: 'Pour ajouter une fiche, le bouton bleu « Nouvelle fiche ».', ms: 4500 },
            { type: 'click', selector: '[data-tour="page-add"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="knowledge-form-title"]', wait: 500 },
            { type: 'caption', text: 'Formulaire : d\'abord le titre court et explicite.', ms: 4000 },
            { type: 'type', selector: '[data-tour="knowledge-form-title"]', value: 'TUTO-DEMO procédure', wait: 700 },
            { type: 'caption', text: 'Catégorie et atelier — pour que la fiche apparaisse dans les bons filtres.', ms: 5000 },
            { type: 'move', selector: '[data-tour="knowledge-form-content"]', wait: 500 },
            { type: 'caption', text: 'Le cœur de la fiche : le contenu en markdown. Sections en **gras**, étapes numérotées — c\'est ce que le technicien va dérouler étape par étape.', ms: 8000 },
            // Try the normal typing path first (visible char-by-char) — same
            // value the escape hatch will commit. The CustomEvent below is
            // the guaranteed-sync path that runs regardless of whether the
            // typed value made it into React's controlled state.
            { type: 'type', selector: '[data-tour="knowledge-form-content"]', value: '**Préparation**\n1. Consigner la machine (LOTO)\n2. Vérifier l\'absence de tension au VAT\n\n**Démontage**\n3. Retirer le carter de protection\n4. Déposer la pièce usée\n\n**Remontage**\n5. Monter la pièce neuve\n6. Serrer au couple constructeur\n\n**Contrôle final**\n7. Reconnecter l\'alimentation\n8. Test de marche à vide 5 min', wait: 1500 },
            // Escape hatch — dispatch CustomEvent so the knowledge page sets
            // form.content directly via setForm, bypassing any React-
            // controlled textarea sync subtlety. Same content as the typing
            // value so the user sees nothing extra; this just guarantees
            // the Save validation sees a non-empty form.content.
            { type: 'event', eventName: 'smartmaint-demo-set-knowledge-form', detail: { field: 'content', value: '**Préparation**\n1. Consigner la machine (LOTO)\n2. Vérifier l\'absence de tension au VAT\n\n**Démontage**\n3. Retirer le carter de protection\n4. Déposer la pièce usée\n\n**Remontage**\n5. Monter la pièce neuve\n6. Serrer au couple constructeur\n\n**Contrôle final**\n7. Reconnecter l\'alimentation\n8. Test de marche à vide 5 min' }, wait: 400 },
            { type: 'event', eventName: 'smartmaint-demo-set-knowledge-form', detail: { field: 'title', value: 'TUTO-DEMO procédure' }, wait: 400 },
            { type: 'move', selector: '[data-tour="knowledge-form-save"]', wait: 500 },
            { type: 'caption', text: 'Je clique sur Enregistrer.', ms: 3000 },
            { type: 'click', selector: '[data-tour="knowledge-form-save"]', pulse: true, wait: 2000 },
            { type: 'caption', text: 'Fiche créée — toute l\'équipe la voit en temps réel et peut la rechercher instantanément.', ms: 5500 },

            // ── Find and open the fiche ──
            { type: 'move', selector: '[data-tour="knowledge-card"][data-knowledge-title="TUTO-DEMO procédure"]', wait: 700 },
            { type: 'caption', text: 'Voilà notre fiche dans la grille — je l\'ouvre pour la lire.', ms: 4500 },
            { type: 'click', selector: '[data-tour="knowledge-card"][data-knowledge-title="TUTO-DEMO procédure"]', pulse: true, wait: 1800 },
            { type: 'caption', text: 'Le lecteur s\'ouvre avec la mise en forme markdown : sections en gras, étapes numérotées.', ms: 6000 },

            // ── Exécuter la procédure ──
            { type: 'move', selector: '[data-tour="knowledge-run"]', wait: 700 },
            { type: 'caption', text: 'En bas du lecteur, le bouton orange « Démarrer la procédure » lance le runner pas-à-pas — chaque étape est minutée et tracée pour l\'audit HACCP.', ms: 8000 },
            { type: 'click', selector: '[data-tour="knowledge-run"]', pulse: true, wait: 2500 },
            { type: 'caption', text: 'Le technicien arrive sur le runner pas-à-pas : la première étape est active (orange), un chrono compte le temps passé, un champ note libre est disponible.', ms: 10500 },

            // ── Complete first step ──
            { type: 'move', selector: '[data-tour="procedure-step-done"]', wait: 700 },
            { type: 'caption', text: 'Je clique sur « Étape terminée » pour valider la première étape — la durée est figée et l\'étape suivante devient active.', ms: 8500 },
            { type: 'click', selector: '[data-tour="procedure-step-done"]', pulse: true, wait: 2000 },

            // ── Complete second step ──
            { type: 'move', selector: '[data-tour="procedure-step-done"]', wait: 700 },
            { type: 'caption', text: 'Je passe à l\'étape suivante de la même manière — le compteur de progression en haut monte à 2 / N étapes.', ms: 8000 },
            { type: 'click', selector: '[data-tour="procedure-step-done"]', pulse: true, wait: 2000 },
            { type: 'caption', text: 'À la dernière étape validée, toute la procédure est archivée avec son chrono total — preuve d\'exécution pour l\'audit HACCP.', ms: 9000 },

            { type: 'caption', text: 'Je reviens à la base de connaissances pour nettoyer la fiche de démonstration.', ms: 4500 },
            { type: 'navigate', route: '/knowledge', wait: 1700 },

            // ── DELETE the demo fiche ──
            { type: 'move', selector: '[data-tour="knowledge-card"][data-knowledge-title="TUTO-DEMO procédure"]', wait: 600 },
            { type: 'click', selector: '[data-tour="knowledge-card"][data-knowledge-title="TUTO-DEMO procédure"]', pulse: true, wait: 1800 },
            { type: 'move', selector: '[data-tour="knowledge-reader-delete"]', wait: 600 },
            { type: 'caption', text: 'Je clique sur la corbeille en haut du lecteur pour supprimer.', ms: 4500 },
            { type: 'click', selector: '[data-tour="knowledge-reader-delete"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="knowledge-delete-confirm"]', wait: 500 },
            { type: 'click', selector: '[data-tour="knowledge-delete-confirm"]', pulse: true, wait: 1800 },
            { type: 'caption', text: 'Fiche supprimée. État initial rétabli.', ms: 3500 },
        ],
    },
    {
        icon: ClipboardList, color: '#7c3aed',
        title: 'Procédures exécutées',
        selector: '[data-tour="proc-runs-search"]', route: '/procedure-runs',
        whatFor: 'L\'historique tracé de chaque procédure « démarrée » depuis une fiche de connaissances — quel technicien, quelle machine, combien de temps sur chaque étape, avec ses notes libres.',
        howTo: 'Cherchez par nom de procédure, technicien ou code machine. Cliquez une ligne pour ouvrir le détail : étapes chronométrées, notes, horodatage. Bouton « Imprimer » exporte le rapport en PDF.',
        helps: 'Preuve d\'exécution pour l\'audit HACCP / ISO : chaque étape est horodatée, minutée et signée par son opérateur — plus jamais de « je crois qu\'on l\'a fait ».',
        align: 'L\'admin lit les rapports d\'exécution ; le technicien exécute et prend des notes en direct. Les deux voient la même trace, source de vérité pour la maintenance et la qualité.',
        demo: [
            // ── Intro ──
            { type: 'caption', text: 'Bienvenue dans Procédures exécutées — la mémoire pas-à-pas de tout ce qui a été fait dans l\'usine.', ms: 5500 },
            { type: 'caption', text: 'Chaque fois qu\'un technicien clique « Démarrer la procédure » sur une fiche de connaissances, une exécution est archivée ici automatiquement.', ms: 8500 },
            // ── Search bar ──
            { type: 'move', selector: '[data-tour="proc-runs-search"]', wait: 500 },
            { type: 'caption', text: 'En haut, la barre de recherche : filtrez par nom de procédure, technicien ou code machine.', ms: 6000 },
            { type: 'type', selector: '[data-tour="proc-runs-search"] input', value: 'TUTO-DEMO', wait: 1200 },
            { type: 'caption', text: 'Ici je tape « TUTO-DEMO » pour montrer le filtrage — la liste ne montre que les runs qui contiennent ce mot.', ms: 6500 },
            { type: 'type', selector: '[data-tour="proc-runs-search"] input', value: '', wait: 1000 },
            { type: 'caption', text: 'Je vide la recherche pour tout revoir.', ms: 3500 },
            // ── Row breakdown ──
            { type: 'move', selector: '[data-tour="proc-runs-row"]:first-of-type', wait: 700 },
            { type: 'caption', text: 'Chaque ligne montre : titre de la procédure, technicien, machine, date de démarrage, nombre d\'étapes cochées / total, temps total mesuré.', ms: 9000 },
            { type: 'caption', text: 'La pastille à gauche est verte (✓) quand la procédure est terminée, orange (⏱) quand elle est encore en cours.', ms: 7500 },
            // ── Open a row → detail view ──
            { type: 'caption', text: 'Je clique sur la première ligne pour ouvrir le détail.', ms: 4500 },
            { type: 'click', selector: '[data-tour="proc-runs-row"]:first-of-type', pulse: true, wait: 2000 },
            // ── Detail view narrations ──
            { type: 'caption', text: 'Voilà le rapport détaillé de l\'exécution : le même écran qui sera imprimé en PDF pour votre classeur d\'audit.', ms: 7000 },
            { type: 'caption', text: 'En haut, l\'en-tête : titre de la procédure, technicien qui l\'a exécutée, machine concernée, dates de début et de fin.', ms: 8000 },
            { type: 'caption', text: 'Puis pour chaque étape : sa durée réelle mesurée par le chrono, l\'horodatage, et les notes libres saisies pendant l\'exécution.', ms: 8500 },
            { type: 'caption', text: 'Une étape qui a pris beaucoup plus de temps que prévu ressort visuellement — signal utile pour repérer où l\'opérateur a bloqué.', ms: 8500 },
            // ── Print button ──
            { type: 'move', selector: '[data-tour="proc-run-print"]', wait: 700 },
            { type: 'caption', text: 'Le bouton bleu « Imprimer / Exporter en PDF » en haut à droite génère le rapport imprimable — utile pour dossier qualité HACCP, audit ISO 9001 ou joindre à un compte-rendu.', ms: 10000 },
            // ── Back to list ──
            { type: 'move', selector: '[data-tour="proc-run-back"]', wait: 700 },
            { type: 'caption', text: 'Je clique sur « Retour à la liste » pour revenir à la vue globale.', ms: 5000 },
            { type: 'click', selector: '[data-tour="proc-run-back"]', pulse: true, wait: 1800 },
            { type: 'caption', text: 'De retour sur la liste.', ms: 3500 },
            // ── Business use cases ──
            { type: 'caption', text: 'Cas d\'usage 1 — Audit BRC : vous prouvez que la procédure « Nettoyage CIP hebdomadaire » a bien été exécutée chaque semaine, par qui, sur quelle cuve, en combien de temps.', ms: 10000 },
            { type: 'caption', text: 'Cas d\'usage 2 — Formation : un junior consulte les 10 dernières exécutions d\'une procédure pour voir combien de temps mettent les seniors sur chaque étape — apprentissage par mimétisme.', ms: 10000 },
            { type: 'caption', text: 'Cas d\'usage 3 — Analyse de dérive : si le temps moyen d\'une procédure a augmenté de 20% en 3 mois, c\'est peut-être signe d\'usure d\'un outil ou d\'une méthode à revoir.', ms: 10000 },
            { type: 'caption', text: 'Point clé : rien n\'est saisi manuellement ici. Toute cette traçabilité vient automatiquement du runner pas-à-pas côté technicien. Zéro double-saisie.', ms: 9500 },
        ],
    },
    {
        icon: Megaphone, color: '#ea580c',
        title: 'Consignes du jour',
        selector: '[data-tour="directive-new"]', route: '/directives',
        whatFor: 'Vos instructions obligatoires aux opérateurs — « huile vierge extra uniquement », « port du casque obligatoire » — avec accusés de réception nominaux.',
        howTo: 'Créez une consigne (titre + contenu), elle apparaît instantanément en bannière jaune sur tous les dashboards opérateur. Chacun doit cliquer pour l\'acquitter.',
        helps: 'Traçabilité ISO : vous savez qui a lu quelle consigne et à quelle heure exacte. Plus de « je ne savais pas ».',
        align: 'L\'opérateur voit la bannière jaune dès qu\'il ouvre son tableau. Vous voyez ici qui l\'a acquittée et qui pas encore.',
        demo: [
            // ── Open the create form ──
            { type: 'move', selector: '[data-tour="directive-new"]', wait: 500 },
            { type: 'caption', text: 'Le bouton bleu « Nouvelle consigne » en haut à droite.', ms: 4500 },
            { type: 'click', selector: '[data-tour="directive-new"]', pulse: true, wait: 1500 },

            // ── Walk the form + real type via event hatch ──
            { type: 'move', selector: '[data-tour="directive-form-title"]', wait: 500 },
            { type: 'caption', text: 'Formulaire : titre court qui apparaît dans la bannière, et contenu détaillé en texte libre.', ms: 6500 },
            { type: 'type', selector: '[data-tour="directive-form-title"]', value: 'TUTO-DEMO consigne du jour', wait: 700 },
            { type: 'move', selector: '[data-tour="directive-form-content"]', wait: 500 },
            { type: 'type', selector: '[data-tour="directive-form-content"]', value: 'Consigne de démonstration créée par la visite guidée — sera supprimée juste après.', wait: 800 },
            // Escape hatch to guarantee both fields are in React state.
            { type: 'event', eventName: 'smartmaint-demo-set-directive-form', detail: { title: 'TUTO-DEMO consigne du jour', content: 'Consigne de démonstration créée par la visite guidée — sera supprimée juste après.' }, wait: 400 },

            // ── Click Publier (real save) ──
            { type: 'move', selector: '[data-tour="directive-form-publish"]', wait: 500 },
            { type: 'caption', text: 'Je clique sur Publier — la bannière jaune apparaît instantanément chez tous les opérateurs connectés.', ms: 7500 },
            { type: 'click', selector: '[data-tour="directive-form-publish"]', pulse: true, wait: 2200 },

            // ── Walk the new directive card ──
            { type: 'move', selector: '[data-tour="directive-card"][data-directive-title="TUTO-DEMO consigne du jour"]', wait: 700 },
            { type: 'caption', text: 'La consigne apparaît dans la liste — bordure bleue (active), compteur d\'accusés de réception, pastilles vertes pour ceux qui ont acquitté et grises pour les autres.', ms: 11000 },
            { type: 'caption', text: 'Vous voyez immédiatement qui n\'a pas lu — pour rappeler ces personnes nominativement.', ms: 6500 },

            // ── DELETE the demo directive ──
            { type: 'caption', text: 'Je supprime la consigne de démonstration pour ne pas polluer le tableau.', ms: 5000 },
            { type: 'move', selector: '[data-tour="directive-card"][data-directive-title="TUTO-DEMO consigne du jour"] [data-tour="directive-delete"]', wait: 600 },
            { type: 'click', selector: '[data-tour="directive-card"][data-directive-title="TUTO-DEMO consigne du jour"] [data-tour="directive-delete"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="directive-delete-confirm"]', wait: 500 },
            { type: 'caption', text: 'Confirmation — je supprime.', ms: 3500 },
            { type: 'click', selector: '[data-tour="directive-delete-confirm"]', pulse: true, wait: 1800 },
            { type: 'caption', text: 'Consigne supprimée. État initial rétabli.', ms: 3500 },
        ],
    },
    {
        icon: ShieldAlert, color: '#dc2626',
        title: 'Demandes EPI & consommables',
        selector: '[data-tour="op-req-header"]', route: '/operator-requests',
        whatFor: 'Le centre de réception des besoins EPI / consommables magasin : gants, casques, lubrifiants, produits de nettoyage… tout ce qui sort de votre stock maintenance.',
        howTo: 'Une ligne = une demande opérateur. Cliquez ✓ « Marquer traitée » quand le matériel est remis, ✗ « Annuler » si la demande devient obsolète. Tout est tracé.',
        helps: 'Plus de tickets papier qui se perdent — un opérateur sans gants peut alerter en 5 secondes depuis sa tablette, vous voyez la demande en temps réel ici.',
        align: 'Les demandes de relais (pause / remplacement) ne sont PAS ici : elles sont gérées côté production / chef d\'équipe, hors de votre périmètre maintenance.',
        demo: [
            // ── Header note ──
            { type: 'move', selector: '[data-tour="op-req-header"]', wait: 500 },
            { type: 'caption', text: 'En haut, un rappel : seules les demandes EPI / consommables magasin sont ici. Les demandes de relais sont gérées côté production.', ms: 9500 },

            // ── Mock EPI demande ──
            { type: 'mock', container: 'main', html: '<div data-tutorial-mock-epi style="margin-top:14px;border-radius:12px;border:1px dashed #dc2626;background:linear-gradient(180deg,#fef2f2,#fee2e2);padding:14px 18px;font-family:inherit"><div style="font-size:11px;font-weight:800;color:#991b1b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px">🎓 Exemple — demande EPI ouverte</div><div style="display:flex;align-items:center;gap:14px"><div style="flex:1"><div style="font-size:14px;font-weight:700;color:#0f172a">Said Benkirane · Opérateur ligne CHD-001 <span style="font-size:11px;color:#dc2626;font-weight:700;margin-left:6px">⚠️ urgent</span></div><div style="font-size:12.5px;color:#475569;margin-top:2px">EPI manquant · Gants nitrile taille L (×2 paires) · il y a 8 min</div></div><div style="display:flex;gap:6px;flex-shrink:0"><button data-tutorial-mock-epi-accept style="padding:6px 12px;border-radius:8px;background:#16a34a;color:white;border:none;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;display:inline-flex;align-items:center;gap:4px" onclick="this.parentElement.innerHTML=\'<span style=&quot;font-size:11.5px;font-weight:700;padding:6px 12px;border-radius:100px;background:#16a34a;color:white&quot;>✓ Traitée</span>\';this.closest(\'[data-tutorial-mock]\').style.background=\'#f0fdf4\';this.closest(\'[data-tutorial-mock]\').style.borderColor=\'#16a34a\'">✓ Marquer traitée</button><button data-tutorial-mock-epi-refuse style="padding:6px 12px;border-radius:8px;background:#94a3b8;color:white;border:none;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;display:inline-flex;align-items:center;gap:4px" onclick="this.parentElement.innerHTML=\'<span style=&quot;font-size:11.5px;font-weight:700;padding:6px 12px;border-radius:100px;background:#94a3b8;color:white&quot;>✗ Annulée</span>\';this.closest(\'[data-tutorial-mock]\').style.background=\'#f1f5f9\';this.closest(\'[data-tutorial-mock]\').style.borderColor=\'#94a3b8\'">✗ Annuler</button></div></div></div>', wait: 1200 },
            { type: 'move', selector: '[data-tutorial-mock-epi]', wait: 700 },
            { type: 'caption', text: 'Voici un exemple de demande d\'EPI urgente. Deux actions : ✓ Marquer traitée (vert) quand le matériel est remis à l\'opérateur, ou ✗ Annuler (gris) — utile si la demande devient obsolète.', ms: 12000 },
            { type: 'move', selector: '[data-tutorial-mock-epi-accept]', wait: 600 },
            { type: 'caption', text: 'Je clique sur « Marquer traitée » — l\'opérateur reçoit ses gants, le magasinier consomme du stock, et la demande passe en « Traitée ».', ms: 9500 },
            { type: 'click', selector: '[data-tutorial-mock-epi-accept]', pulse: true, wait: 2000 },
            { type: 'caption', text: 'Statut « Traitée » — tracé pour audit. Tous les passages de statut sont horodatés et signés du nom admin.', ms: 8000 },
        ],
    },

    // ─── Approvisionnement ───
    {
        icon: Package, color: '#f59e0b',
        title: 'Pièces de rechange',
        selector: '[data-tour="parts-kpis"]', route: '/spare-parts',
        whatFor: 'Inventaire complet : stock, seuil mini, emplacement, coût unitaire, fournisseur. Plus une vue Approvisionnement avec workflow d\'achat.',
        howTo: 'Surveillez les KPI en haut. Filtrez par recherche. Pièces sous seuil deviennent rouges. Bouton « Réapprovisionner » crée une demande d\'achat automatique.',
        helps: 'Plus de rupture surprise. Le réapprovisionnement est anticipé avant arrêt de ligne.',
        align: 'Les techniciens consomment les pièces depuis leur rapport d\'OT — le stock baisse en temps réel.',
        demo: [
            // ── KPIs ──
            { type: 'move', selector: '[data-tour="parts-kpis"]', wait: 500 },
            { type: 'caption', text: 'Quatre KPI en haut : nombre de références, valeur totale du stock, pièces en alerte, et ruptures.', ms: 6500 },
            { type: 'move', selector: '[data-tour="parts-kpis"] .kpi-card:nth-of-type(1)', wait: 400 },
            { type: 'caption', text: 'KPI bleu — Total des références : combien de pièces différentes (SKU) vous avez en magasin.', ms: 6000 },
            { type: 'move', selector: '[data-tour="parts-kpis"] .kpi-card:nth-of-type(2)', wait: 400 },
            { type: 'caption', text: 'KPI vert — Valeur totale du stock immobilisé en MAD, calculée automatiquement (quantité × coût unitaire pour chaque pièce).', ms: 7500 },
            { type: 'move', selector: '[data-tour="parts-kpis"] .kpi-card:nth-of-type(3)', wait: 400 },
            { type: 'caption', text: '« En alerte » devient orange dès qu\'une pièce passe sous son seuil mini — c\'est votre signal de réappro.', ms: 7000 },
            { type: 'move', selector: '[data-tour="parts-kpis"] .kpi-card:nth-of-type(4)', wait: 400 },
            { type: 'caption', text: '« Rupture » devient rouge à zéro stock — l\'arrêt de ligne est imminent si une commande n\'est pas passée immédiatement.', ms: 7500 },

            // ── Tabs ──
            { type: 'move', selector: '[data-tour="parts-tabs"]', wait: 500 },
            { type: 'caption', text: 'Deux onglets : Stock (l\'inventaire complet) et Approvisionnement (toutes vos commandes en cours et leurs statuts).', ms: 7500 },

            // ── Search ──
            { type: 'move', selector: '[data-tour="parts-search"]', wait: 500 },
            { type: 'caption', text: 'La recherche filtre instantanément par nom ou par référence catalogue. Pratique quand vous avez des centaines de SKU.', ms: 7500 },
            { type: 'type', selector: '[data-tour="parts-search"]', value: 'joint', wait: 600 },
            { type: 'caption', text: 'Tapez « joint » et seules les pièces correspondantes restent affichées.', ms: 5000 },
            { type: 'type', selector: '[data-tour="parts-search"]', value: '', wait: 500 },

            // ── Table ──
            { type: 'move', selector: '[data-tour="parts-table"]', wait: 500 },
            { type: 'caption', text: 'Tableau Stock : photo, référence catalogue, nom, machine liée, quantité actuelle, seuil mini, coût unitaire, statut.', ms: 8000 },
            { type: 'caption', text: 'Les lignes en orange clair signalent une pièce sous le seuil mini. Les ruptures (qté = 0) ont un badge rouge clignotant.', ms: 7500 },
            { type: 'caption', text: 'Le bouton « Réappro » apparaît uniquement sur les pièces sous le seuil — crée une demande d\'achat en un clic.', ms: 7500 },

            // ── Add (full cycle) ──
            { type: 'move', selector: '[data-tour="page-add"]', wait: 500 },
            { type: 'caption', text: 'Je vais ajouter une nouvelle pièce de A à Z, puis la supprimer pour ne rien laisser dans vos données.', ms: 7500 },
            { type: 'click', selector: '[data-tour="page-add"]', pulse: true, wait: 1100 },
            { type: 'caption', text: 'Slide-over à droite : photo, nom, référence catalogue, quantité initiale, seuil mini, coût, machine liée.', ms: 7500 },
            { type: 'event', eventName: 'smartmaint-demo-set-spareparts-form', detail: { name: 'Joint Viton 22 mm (démo)', reference: 'JT-VITON-22-DEMO', quantity: 10, minimumStock: 3, unitCost: 45 }, wait: 400 },
            { type: 'move', selector: '[data-tour="parts-form-name"]', wait: 400 },
            { type: 'type', selector: '[data-tour="parts-form-name"]', value: 'Joint Viton 22 mm (démo)', wait: 400 },
            { type: 'event', eventName: 'smartmaint-demo-set-spareparts-form', detail: { name: 'Joint Viton 22 mm (démo)', reference: 'JT-VITON-22-DEMO', quantity: 10, minimumStock: 3, unitCost: 45 }, wait: 400 },
            { type: 'move', selector: '[data-tour="parts-form-reference"]', wait: 400 },
            { type: 'caption', text: 'Référence catalogue — c\'est elle qui vous lie au fournisseur. Notre démo : JT-VITON-22-DEMO.', ms: 6500 },
            { type: 'caption', text: 'Le couple Stock initial + Seuil mini déclenchera l\'alerte de réappro automatique dès que la quantité passera sous le seuil.', ms: 8000 },
            { type: 'move', selector: '[data-tour="parts-form-save"]', wait: 500 },
            { type: 'click', selector: '[data-tour="parts-form-save"]', pulse: true, wait: 1500 },
            { type: 'caption', text: 'Pièce créée — vous voyez le toast vert en haut à droite. Elle apparaît immédiatement dans le tableau, signe que Supabase a propagé en temps réel.', ms: 8500 },

            // ── Delete cleanup (with extra wait for realtime + scroll-into-view) ──
            { type: 'wait', ms: 1200 },
            { type: 'move', selector: '[data-tour="parts-row"][data-part-reference="JT-VITON-22-DEMO"]', wait: 600 },
            { type: 'caption', text: 'La voici, en bas du tableau. Pour éviter de polluer votre inventaire, je la supprime tout de suite.', ms: 6500 },
            { type: 'move', selector: '[data-tour="parts-row"][data-part-reference="JT-VITON-22-DEMO"] [data-tour="parts-row-delete"]', wait: 400 },
            { type: 'click', selector: '[data-tour="parts-row"][data-part-reference="JT-VITON-22-DEMO"] [data-tour="parts-row-delete"]', pulse: true, wait: 900 },
            { type: 'move', selector: '[data-tour="parts-delete-confirm"]', wait: 400 },
            { type: 'caption', text: 'Confirmation obligatoire avant suppression — protège contre les clics accidentels.', ms: 6000 },
            { type: 'click', selector: '[data-tour="parts-delete-confirm"]', pulse: true, wait: 1200 },
            { type: 'caption', text: 'Pièce supprimée — inventaire propre, comme avant la démo.', ms: 5000 },

            // ─── APPROVISIONNEMENT : workflow complet style SAP ───
            { type: 'move', selector: '[data-tour="parts-tabs"] button:nth-child(2)', wait: 500 },
            { type: 'caption', text: 'Je passe maintenant à l\'onglet Approvisionnement — c\'est le workflow d\'achat complet style SAP, en cinq étapes.', ms: 8500 },
            { type: 'click', selector: '[data-tour="parts-tabs"] button:nth-child(2)', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="proc-tabs"]', wait: 500 },
            { type: 'caption', text: 'Cinq sous-onglets : Fournisseurs, Devis, Bons de commande, Réceptions, Alertes. On les parcourt un par un.', ms: 9000 },

            // ── Étape 1/5 : Fournisseurs ──
            { type: 'move', selector: '[data-tour="proc-tab"][data-proc-tab="suppliers"]', wait: 400 },
            { type: 'click', selector: '[data-tour="proc-tab"][data-proc-tab="suppliers"]', pulse: true, wait: 1200 },
            { type: 'caption', text: 'Étape 1 — Fournisseurs : votre carnet d\'adresses. Chaque fournisseur a un score de fiabilité calculé sur les retards et défauts passés.', ms: 9500 },
            { type: 'mock', container: 'main', html: '<div data-tutorial-mock-sup style="margin-top:14px;border-radius:14px;border:1px dashed #3b82f6;background:linear-gradient(180deg,#eff6ff,#dbeafe);padding:16px 20px;font-family:inherit"><div style="font-size:11px;font-weight:800;color:#1e40af;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px">🎓 Exemple — fiche fournisseur</div><div style="display:grid;grid-template-columns:1fr 120px 100px 80px;gap:14px;align-items:center"><div><div style="font-weight:700;font-size:14px;color:#0f172a">SKF Maroc</div><div style="font-size:12px;color:#64748b;margin-top:2px">contact@skf-ma.com · achats@lcprod.ma</div></div><div style="font-size:12px;color:#475569">Commandes : <b style="color:#1d4ed8">8 actives</b></div><div style="font-size:12px;color:#475569">Délai moy. : <b>5 jours</b></div><div style="display:flex;align-items:center;justify-content:flex-end;gap:6px"><div style="width:48px;height:48px;border-radius:50%;background:conic-gradient(#16a34a 92%,#e5e7eb 0);display:flex;align-items:center;justify-content:center;position:relative"><div style="width:36px;height:36px;border-radius:50%;background:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;color:#16a34a">92%</div></div></div></div></div>', wait: 1100 },
            { type: 'move', selector: '[data-tutorial-mock-sup]', wait: 600 },
            { type: 'caption', text: 'Nom, contacts, nombre de commandes en cours, délai moyen, et l\'anneau de fiabilité — vert au-dessus de 90%, orange en-dessous, rouge sous 70%.', ms: 10000 },

            // ── Étape 2/5 : Devis (RFQ) ──
            { type: 'move', selector: '[data-tour="proc-tab"][data-proc-tab="rfq"]', wait: 400 },
            { type: 'click', selector: '[data-tour="proc-tab"][data-proc-tab="rfq"]', pulse: true, wait: 1200 },
            { type: 'caption', text: 'Étape 2 — Devis : avant chaque achat important, vous consultez plusieurs fournisseurs et comparez leurs devis (RFQ = Request For Quotation).', ms: 10500 },
            { type: 'mock', container: 'main', html: '<div data-tutorial-mock-rfq style="margin-top:14px;border-radius:14px;border:1px dashed #8b5cf6;background:#faf5ff;padding:16px 20px;font-family:inherit"><div style="font-size:11px;font-weight:800;color:#6d28d9;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px">🎓 Exemple — comparaison de devis (RFQ-2026-014)</div><div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:10px;margin-bottom:12px"><span style="font-size:16px">⭐</span><div style="font-size:13px;color:#15803d"><b>Recommandation IA : SKF Maroc</b> — meilleur rapport prix / fiabilité / délai <b>(score 87%)</b></div></div><div style="display:flex;flex-direction:column;gap:8px"><div style="display:grid;grid-template-columns:38px 1fr 100px 100px 100px;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.4)"><div style="width:34px;height:34px;border-radius:50%;background:conic-gradient(#16a34a 92%,#e5e7eb 0);display:flex;align-items:center;justify-content:center"><div style="width:24px;height:24px;border-radius:50%;background:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:9px;color:#16a34a">92</div></div><div style="font-weight:700;font-size:13px;color:#0f172a">SKF Maroc <span style="margin-left:6px;font-size:10px;font-weight:700;padding:2px 7px;border-radius:100px;background:#16a34a;color:white">⭐ Recommandé</span></div><div style="font-size:12px;color:#475569"><b>14 850 MAD</b></div><div style="font-size:12px;color:#475569">5 jours</div><div><span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:100px;background:rgba(34,197,94,0.15);color:#15803d">Reçu · 87%</span></div></div><div style="display:grid;grid-template-columns:38px 1fr 100px 100px 100px;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:white;border:1px solid #e5e7eb"><div style="width:34px;height:34px;border-radius:50%;background:conic-gradient(#f59e0b 78%,#e5e7eb 0);display:flex;align-items:center;justify-content:center"><div style="width:24px;height:24px;border-radius:50%;background:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:9px;color:#f59e0b">78</div></div><div style="font-weight:700;font-size:13px;color:#0f172a">NTN Bearings MA</div><div style="font-size:12px;color:#475569"><b>15 200 MAD</b></div><div style="font-size:12px;color:#475569">7 jours</div><div><span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:100px;background:rgba(59,130,246,0.1);color:#3b82f6">Reçu · 71%</span></div></div><div style="display:grid;grid-template-columns:38px 1fr 100px 100px 100px;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:white;border:1px solid #e5e7eb"><div style="width:34px;height:34px;border-radius:50%;background:conic-gradient(#3b82f6 84%,#e5e7eb 0);display:flex;align-items:center;justify-content:center"><div style="width:24px;height:24px;border-radius:50%;background:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:9px;color:#3b82f6">84</div></div><div style="font-weight:700;font-size:13px;color:#0f172a">Maghreb Industries</div><div style="font-size:12px;color:#475569"><b>13 900 MAD</b></div><div style="font-size:12px;color:#475569">12 jours</div><div><span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:100px;background:rgba(59,130,246,0.1);color:#3b82f6">Reçu · 76%</span></div></div></div></div>', wait: 1200 },
            { type: 'move', selector: '[data-tutorial-mock-rfq]', wait: 600 },
            { type: 'caption', text: 'Trois devis comparés côte à côte : prix, délai, fiabilité. Maghreb est le moins cher mais 12 j de livraison ; SKF est plus cher mais arrive en 5 j et a 92% de fiabilité.', ms: 13500 },
            { type: 'caption', text: 'L\'IA scoring combine les trois critères avec une pondération 50% prix / 30% fiabilité / 20% délai — SKF gagne avec 87%.', ms: 9500 },
            { type: 'caption', text: 'Vous cliqueriez « Retenir » sur la ligne SKF, ce qui transforme automatiquement le devis en bon de commande pré-rempli avec les bonnes quantités et prix.', ms: 11000 },

            // ── Étape 3/5 : Bons de commande (PO) ──
            { type: 'move', selector: '[data-tour="proc-tab"][data-proc-tab="orders"]', wait: 400 },
            { type: 'click', selector: '[data-tour="proc-tab"][data-proc-tab="orders"]', pulse: true, wait: 1200 },
            { type: 'caption', text: 'Étape 3 — Bons de commande : c\'est le document officiel envoyé au fournisseur.', ms: 8000 },
            { type: 'mock', container: 'main', html: '<div data-tutorial-mock-po2 style="margin-top:14px;border-radius:14px;border:1px dashed #3b82f6;background:#eff6ff;padding:16px 20px;font-family:inherit"><div style="font-size:11px;font-weight:800;color:#1e40af;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px">🎓 Exemple — bon de commande PO-2026-014</div><div style="display:flex;align-items:center;gap:14px;margin-bottom:10px"><div style="width:40px;height:40px;border-radius:10px;background:rgba(59,130,246,0.15);display:flex;align-items:center;justify-content:center">📄</div><div style="flex:1"><div style="font-weight:700;font-family:monospace;font-size:14px;color:#0f172a">PO-2026-014</div><div style="font-size:12px;color:#64748b;margin-top:2px">SKF Maroc · livraison attendue 08/06/2026</div></div><div style="text-align:right"><div style="font-size:10px;color:#64748b;text-transform:uppercase">Montant</div><div style="font-size:17px;font-weight:800;color:#3b82f6">14 850 MAD</div></div><div><span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:100px;background:rgba(245,158,11,0.12);color:#b45309">⏳ En attente</span></div></div><div style="background:white;border-radius:8px;padding:10px 12px;border:1px solid #e5e7eb;font-size:12px"><div style="font-weight:700;color:#475569;margin-bottom:6px">3 lignes :</div><div style="display:flex;justify-content:space-between;padding:3px 0;color:#475569"><span>Joint Viton SKF-6205 × 50</span><span><b>4 500 MAD</b></span></div><div style="display:flex;justify-content:space-between;padding:3px 0;color:#475569"><span>Roulement SKF-22315 × 8</span><span><b>7 200 MAD</b></span></div><div style="display:flex;justify-content:space-between;padding:3px 0;color:#475569"><span>Courroie SKF-A48 × 12</span><span><b>3 150 MAD</b></span></div></div></div>', wait: 1100 },
            { type: 'move', selector: '[data-tutorial-mock-po2]', wait: 600 },
            { type: 'caption', text: 'En-tête : numéro, fournisseur, date de livraison estimée, montant total. En-dessous : le détail ligne par ligne avec quantités, prix unitaires et sous-totaux.', ms: 12000 },
            { type: 'caption', text: 'Le statut « En attente » signifie : au-dessus du seuil d\'approbation (5 000 MAD par défaut), donc bloqué tant que vous ne validez pas dans la page Validations d\'achat.', ms: 13500 },
            { type: 'caption', text: 'Une fois approuvé, le statut passe à « Envoyée » et le PDF part automatiquement par e-mail au fournisseur.', ms: 9500 },

            // ── Étape 4/5 : Réceptions ──
            { type: 'move', selector: '[data-tour="proc-tab"][data-proc-tab="receipts"]', wait: 400 },
            { type: 'click', selector: '[data-tour="proc-tab"][data-proc-tab="receipts"]', pulse: true, wait: 1200 },
            { type: 'caption', text: 'Étape 4 — Réceptions : quand le livreur arrive, le magasinier saisit ce qu\'il a réellement reçu, en quel état, ligne par ligne.', ms: 11000 },
            { type: 'mock', container: 'main', html: '<div data-tutorial-mock-grn style="margin-top:14px;border-radius:14px;border:1px dashed #16a34a;background:#f0fdf4;padding:16px 20px;font-family:inherit"><div style="font-size:11px;font-weight:800;color:#15803d;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px">🎓 Exemple — bon de réception BR-2026-027</div><div style="display:flex;align-items:center;gap:14px;margin-bottom:10px"><div style="width:40px;height:40px;border-radius:10px;background:rgba(34,197,94,0.15);display:flex;align-items:center;justify-content:center">📦</div><div style="flex:1"><div style="font-weight:700;font-family:monospace;font-size:14px;color:#0f172a">BR-2026-027</div><div style="font-size:12px;color:#64748b;margin-top:2px">Lié à PO-2026-014 · Reçu par Karim Benali · 03/06/2026</div></div><div><span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:100px;background:rgba(245,158,11,0.12);color:#b45309">Partielle</span></div></div><div style="background:white;border-radius:8px;padding:10px 12px;border:1px solid #e5e7eb;font-size:12px"><div style="display:flex;justify-content:space-between;padding:4px 0"><span>Joint Viton SKF-6205 : 50 / 50</span><span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:100px;background:rgba(34,197,94,0.15);color:#15803d">✓ Conforme</span></div><div style="display:flex;justify-content:space-between;padding:4px 0"><span>Roulement SKF-22315 : 8 / 8</span><span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:100px;background:rgba(245,158,11,0.15);color:#b45309">⚠️ Non conforme</span></div><div style="display:flex;justify-content:space-between;padding:4px 0"><span>Courroie SKF-A48 : 6 / 12</span><span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:100px;background:rgba(34,197,94,0.15);color:#15803d">✓ Conforme</span></div></div></div>', wait: 1100 },
            { type: 'move', selector: '[data-tutorial-mock-grn]', wait: 600 },
            { type: 'caption', text: 'Trois lignes reçues : 50 joints conformes (entrent en stock), 8 roulements non conformes (RETOUR fournisseur, n\'entrent PAS en stock), et seulement 6 courroies sur 12 conformes.', ms: 14000 },
            { type: 'caption', text: 'Le PO passe automatiquement en « Partielle » — il reste 6 courroies à recevoir. Un mail est envoyé au fournisseur pour les pièces non conformes.', ms: 11500 },

            // ── Étape 5/5 : Alertes prédictives ──
            { type: 'move', selector: '[data-tour="proc-tab"][data-proc-tab="alerts"]', wait: 400 },
            { type: 'click', selector: '[data-tour="proc-tab"][data-proc-tab="alerts"]', pulse: true, wait: 1200 },
            { type: 'caption', text: 'Étape 5 — Alertes prédictives : l\'IA croise consommation passée et seuils, et vous prévient AVANT que vous ne tombiez en rupture.', ms: 11000 },
            { type: 'mock', container: 'main', html: '<div data-tutorial-mock-alerts style="margin-top:14px;border-radius:14px;border:1px dashed #f59e0b;background:#fffbeb;padding:16px 20px;font-family:inherit"><div style="font-size:11px;font-weight:800;color:#b45309;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px">🎓 Exemple — alertes prédictives</div><div style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;align-items:center;gap:14px;padding:12px;background:white;border-radius:10px;border:1px solid #fde68a"><div style="width:38px;height:38px;border-radius:10px;background:rgba(239,68,68,0.15);display:flex;align-items:center;justify-content:center">📉</div><div style="flex:1"><div style="font-weight:700;font-size:13px;color:#0f172a">Joint Viton SKF-6205</div><div style="font-size:12px;color:#475569;margin-top:2px">Reste 4 jours de stock · délai SKF Maroc : 5 jours · <b style="color:#dc2626">RUPTURE PROCHE</b></div></div><button style="padding:7px 14px;border-radius:8px;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;border:none;font-size:12px;font-weight:700;cursor:pointer">🛒 Commander maintenant</button></div><div style="display:flex;align-items:center;gap:14px;padding:12px;background:white;border-radius:10px;border:1px solid #fde68a"><div style="width:38px;height:38px;border-radius:10px;background:rgba(245,158,11,0.15);display:flex;align-items:center;justify-content:center">📉</div><div style="flex:1"><div style="font-weight:700;font-size:13px;color:#0f172a">Roulement SKF-22315</div><div style="font-size:12px;color:#475569;margin-top:2px">Reste 18 jours de stock · délai 5 jours · à commander avant <b>21/06/2026</b></div></div><button style="padding:7px 14px;border-radius:8px;background:rgba(245,158,11,0.12);color:#b45309;border:1px solid #fde68a;font-size:12px;font-weight:700;cursor:pointer">🛒 Commander</button></div></div></div>', wait: 1100 },
            { type: 'move', selector: '[data-tutorial-mock-alerts]', wait: 600 },
            { type: 'caption', text: 'Première ligne ROUGE : il reste 4 jours de stock de joints, mais SKF met 5 jours à livrer → rupture imminente. Le bouton « Commander maintenant » crée un PO en 1 clic.', ms: 14000 },
            { type: 'caption', text: 'Deuxième ligne ORANGE : 18 j de stock, à commander avant le 21 juin pour éviter toute pénurie. Anticipation, pas panique.', ms: 11000 },

            // ── Revert : retour à l'onglet Stock ──
            { type: 'move', selector: '[data-tour="parts-tabs"] button:nth-child(1)', wait: 500 },
            { type: 'click', selector: '[data-tour="parts-tabs"] button:nth-child(1)', pulse: true, wait: 1200 },
            { type: 'caption', text: 'Et je reviens à l\'onglet Stock — comme on l\'avait trouvé. Voilà tout le cycle d\'approvisionnement, des fournisseurs jusqu\'aux alertes prédictives.', ms: 11500 },
        ],
    },
    {
        icon: BadgeCheck, color: '#22c55e',
        title: 'Validations d\'achat',
        selector: '[data-tour="page-header"]', route: '/approvals',
        whatFor: 'Votre file d\'attente d\'approbations : bons de commande à valider AVANT envoi au fournisseur, et interventions terminées par les techniciens à clôturer définitivement.',
        howTo: 'Pour chaque BC : ✓ Approuver ou ✗ Rejeter (avec motif obligatoire). Pour chaque intervention : ✓ Valider la clôture, ou « Renvoyer » au technicien si quelque chose manque.',
        helps: 'Aucune commande ne part sans contrôle. Aucun OT n\'est clôturé sans votre œil. Audit interne et externe simplifié.',
        align: 'Les techniciens créent les demandes depuis l\'inventaire (bouton « Demander ») et marquent leurs OT « terminée ». Vous validez les deux ici.',
        demo: [
            { type: 'move', selector: '[data-tour="page-header"]', wait: 500 },
            { type: 'caption', text: 'Page Validations — tout ce qui attend votre approbation, regroupé en un seul endroit. Vous y passez 5 min par jour.', ms: 8000 },

            // ── Mock pending PO (in case real list is empty) ──
            { type: 'mock', container: 'main', html: '<div data-tutorial-mock-po style="margin-top:18px;border-radius:14px;border:1px dashed #8b5cf6;background:linear-gradient(180deg,#f5f3ff,#ede9fe);padding:16px 20px;font-family:inherit"><div style="font-size:11px;font-weight:800;color:#6d28d9;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px">🎓 Exemple — bon de commande en attente</div><div style="display:flex;align-items:center;gap:16px"><div style="width:44px;height:44px;border-radius:11px;background:rgba(139,92,246,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px">📄</div><div style="flex:1"><div style="font-weight:700;font-family:monospace;font-size:14px;color:#0f172a">PO-2026-0089</div><div style="font-size:12px;color:#475569;margin-top:2px">SKF Maroc · 8 articles (joints, roulements, courroies)</div></div><div style="text-align:right;margin-right:8px"><div style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase">Montant</div><div style="font-size:17px;font-weight:800;color:#8b5cf6">14 850 MAD</div></div><div style="display:flex;gap:6px;flex-shrink:0"><button data-tutorial-mock-po-approve style="display:flex;align-items:center;gap:6px;padding:9px 14px;border-radius:10px;background:linear-gradient(135deg,#16a34a,#15803d);color:white;border:none;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit" onclick="this.parentElement.innerHTML=\'<span style=&quot;font-size:11.5px;font-weight:700;padding:8px 14px;border-radius:100px;background:#16a34a;color:white&quot;>✓ Approuvé</span>\';this.closest(\'[data-tutorial-mock]\').style.background=\'#f0fdf4\';this.closest(\'[data-tutorial-mock]\').style.borderColor=\'#16a34a\'">✓ Approuver</button><button data-tutorial-mock-po-reject style="display:flex;align-items:center;gap:6px;padding:9px 14px;border-radius:10px;background:#fef2f2;color:#dc2626;border:none;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit" onclick="this.parentElement.innerHTML=\'<span style=&quot;font-size:11.5px;font-weight:700;padding:8px 14px;border-radius:100px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca&quot;>✗ Rejeté</span>\';this.closest(\'[data-tutorial-mock]\').style.background=\'#fef2f2\';this.closest(\'[data-tutorial-mock]\').style.borderColor=\'#ef4444\'">✗ Rejeter</button></div></div></div>', wait: 1300 },
            { type: 'move', selector: '[data-tutorial-mock-po]', wait: 700 },
            { type: 'caption', text: 'Voici un exemple de bon de commande en attente — n° BC, fournisseur, nombre d\'articles, montant total en MAD.', ms: 8500 },
            { type: 'move', selector: '[data-tutorial-mock-po-approve]', wait: 500 },
            { type: 'caption', text: 'Vert « Approuver » → BC validé et envoyé au fournisseur, votre nom et l\'horodatage sont enregistrés.', ms: 8000 },
            { type: 'click', selector: '[data-tutorial-mock-po-approve]', pulse: true, wait: 1800 },
            { type: 'caption', text: 'Statut « Approuvé » — l\'email part automatiquement au fournisseur avec le PDF du bon de commande joint.', ms: 8500 },
            { type: 'caption', text: 'Si vous aviez cliqué sur « Rejeter » à la place, un modal vous aurait demandé le motif obligatoire — tracé pour audit interne.', ms: 8500 },

            // Note : les interventions terminées à valider ont leur place
            // dédiée dans le module Interventions (bouton « Valider » sur
            // chaque OT terminée). Elles n\'apparaissent PAS ici — cette
            // page est réservée aux BC. Le tutoriel évite donc la
            // duplication qui avait dérouté l\'admin.

            // ── Live tour of the origin flow ──
            // Take the user to Achats, spotlight the "Nouveau bon de commande"
            // button + procurement tabs so they see WHERE a real PO is born,
            // then bring them back so the tutorial keeps its position.
            { type: 'caption', text: 'Maintenant en vrai. Je vous montre où naît un bon de commande — quand il dépasse le seuil, il atterrit ici automatiquement.', ms: 6500 },
            { type: 'navigate', route: '/spare-parts', wait: 1300 },
            { type: 'move', selector: '[data-tour="proc-tabs"]', wait: 700 },
            { type: 'caption', text: 'Page « Pièces de rechange » — le module Achats vit dans l\'onglet « Bons de commande ». Je clique dessus.', ms: 6000 },
            { type: 'click', selector: '[data-tour="proc-tab"][data-proc-tab="orders"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="proc-tabs"] + div, main', wait: 500 },
            { type: 'caption', text: 'C\'est ici que vous cliquez sur « + Nouveau bon de commande » : choisissez un fournisseur, ajoutez des lignes de pièces, saisissez les quantités et coûts.', ms: 9500 },
            { type: 'caption', text: 'Si le TOTAL dépasse votre seuil (Paramètres → Seuil d\'approbation, actuellement 5 000 MAD par défaut), le bon passe automatiquement en statut « en attente d\'approbation ». Impossible de l\'envoyer au fournisseur tant qu\'il n\'est pas validé.', ms: 12500 },
            { type: 'caption', text: 'Et ce bon en attente apparaît en haut de la page « Validations achats ». Je retourne pour vous montrer.', ms: 6500 },
            { type: 'navigate', route: '/approvals', wait: 1300 },
            { type: 'move', selector: '[data-tour="page-header"]', wait: 500 },
            { type: 'caption', text: 'Voilà — la boucle complète : Achats crée → si > seuil → apparaît ici → vous approuvez → email au fournisseur. Toute la chaîne tracée pour l\'audit.', ms: 10000 },
        ],
    },

    // ─── Système ───
    {
        icon: Bell, color: '#ef4444',
        title: 'Alertes e-mail',
        selector: '[data-tour="alerts-card"]', route: '/alertes',
        whatFor: 'Configuration centralisée des emails automatiques : pannes machines, stock critique, contrôles HACCP en retard, rapport hebdo, réapprovisionnement auto.',
        howTo: 'Activez l\'interrupteur maître en haut, listez vos destinataires, cochez les catégories à surveiller, réglez les heures de silence et le délai anti-spam.',
        helps: 'L\'app vous prévient sans surveillance permanente — vous réagissez quand c\'est utile, pas en regardant l\'écran 24/24.',
        align: 'Les emails partent en arrière-plan via Gmail SMTP / Resend, même app fermée (cron Vercel quotidien + webhooks Supabase).',
        demo: [
            { type: 'move', selector: '[data-tour="alerts-master"]', wait: 500 },
            { type: 'caption', text: 'Interrupteur maître en haut : « Alertes automatiques activées ». Coupe tout en un clic — pratique pour les périodes d\'arrêt usine.', ms: 8000 },
            { type: 'move', selector: '[data-tour="alerts-recipients-input"]', wait: 500 },
            { type: 'caption', text: 'Destinataires : tapez plusieurs adresses séparées par des virgules. Chaque alerte est envoyée à tout le monde simultanément.', ms: 8000 },
            { type: 'caption', text: 'Astuce L.C PROD : mettez le responsable maintenance, le qualité (pour HACCP) et les achats (pour le stock critique).', ms: 7500 },

            // ── Triggers walk one by one ──
            { type: 'move', selector: '[data-tour="alerts-triggers"]', wait: 500 },
            { type: 'caption', text: 'Déclencheurs : trois familles d\'alertes, chacune activable indépendamment selon votre besoin.', ms: 7500 },
            { type: 'move', selector: '[data-tour="alerts-triggers"] > * > div:nth-child(1)', wait: 400 },
            { type: 'caption', text: '🔴 Pannes machine : dès qu\'une machine passe en panne, e-mail immédiat avec ID machine, type de panne et photo si disponible.', ms: 9500 },
            { type: 'move', selector: '[data-tour="alerts-triggers"] > * > div:nth-child(2)', wait: 400 },
            { type: 'caption', text: '🟢 Contrôles HACCP en retard : un contrôle de sécurité alimentaire dépasse son échéance → alerte sécurité et qualité.', ms: 9000 },
            { type: 'move', selector: '[data-tour="alerts-triggers"] > * > div:nth-child(3)', wait: 400 },
            { type: 'caption', text: '🟡 Stock critique : pièce de rechange atteint le seuil mini → l\'équipe achats voit la pénurie venir avant l\'arrêt de ligne.', ms: 9500 },

            // ── Automation ──
            { type: 'move', selector: '[data-tour="alerts-automation"]', wait: 500 },
            { type: 'caption', text: 'Automatisations : deux processus tournent sans intervention humaine, même app fermée.', ms: 7000 },
            { type: 'move', selector: '[data-tour="alerts-automation"] > * > div:nth-child(1)', wait: 400 },
            { type: 'caption', text: '🛒 Réapprovisionnement auto : crée une demande d\'achat (REQ) dès qu\'une pièce atteint son seuil — vous validez juste en un clic plus tard.', ms: 9500 },
            { type: 'move', selector: '[data-tour="alerts-automation"] > * > div:nth-child(2)', wait: 400 },
            { type: 'caption', text: '📄 Rapport hebdomadaire : chaque lundi 07:00 UTC, un e-mail de synthèse des 7 derniers jours (cron Vercel, sans admin connecté).', ms: 9500 },

            // ── Anti-spam ──
            { type: 'move', selector: '[data-tour="alerts-antispam"]', wait: 500 },
            { type: 'caption', text: 'Anti-spam et planification : évite de saturer votre boîte mail en cas de cascade d\'alertes.', ms: 7500 },
            { type: 'move', selector: '[data-tour="alerts-antispam"] > div:nth-child(2) > div:nth-child(1)', wait: 400 },
            { type: 'caption', text: 'Cooldown : délai mini entre 2 alertes identiques. 15 min évite le « flapping » d\'un capteur qui oscille.', ms: 8500 },
            { type: 'move', selector: '[data-tour="alerts-antispam"] > div:nth-child(2) > div:nth-child(2)', wait: 400 },
            { type: 'caption', text: 'Plage de silence (UTC) : la nuit, seules les alertes critiques (pannes) passent. Le reste attend 06:00.', ms: 9000 },

            // ── Save + test ──
            { type: 'move', selector: '[data-tour="alerts-save"]', wait: 500 },
            { type: 'caption', text: '« Enregistrer » sauvegarde vos paramètres dans Supabase — ils s\'appliquent immédiatement à tous les déclencheurs.', ms: 8000 },
            { type: 'move', selector: '[data-tour="alerts-test"]', wait: 500 },
            { type: 'caption', text: '« Envoyer un test » vous fait recevoir un email factice pour vérifier que tout fonctionne (utile la 1ère fois).', ms: 8000 },
            { type: 'move', selector: '[data-tour="alerts-history"]', wait: 500 },
            { type: 'caption', text: 'Lien « Historique des alertes » → tableau de tous les emails envoyés avec destinataire, sujet et statut de livraison.', ms: 8500 },
        ],
    },
    {
        icon: History, color: '#64748b',
        title: 'Journal d\'audit',
        selector: '[data-tour="audit-kpis"]', route: '/audit',
        whatFor: 'Trace immuable de chaque création, modification ou suppression — qui a fait quoi, quand, avec quel résumé.',
        howTo: 'Lisez les KPI globaux, filtrez par type d\'action (création/modification/suppression), par entité ou par mot-clé, ou cherchez par utilisateur.',
        helps: 'Conformité réglementaire — vous prouvez l\'historique exact de chaque équipement et action en cas d\'audit ISO ou litige.',
        align: 'Enregistre les actions de tout le monde — admin, techniciens, opérateurs. Tout ce qui touche aux données passe ici.',
        demo: [
            // ── KPIs walked one by one ──
            { type: 'move', selector: '[data-tour="audit-kpis"]', wait: 500 },
            { type: 'caption', text: 'Quatre KPI globaux pour mesurer l\'activité de l\'usine dans l\'application.', ms: 6500 },
            { type: 'move', selector: '[data-tour="audit-kpis"] > div:nth-child(1)', wait: 400 },
            { type: 'caption', text: 'Total des entrées : la mémoire complète de votre app depuis le jour 1. Croît à chaque création / modification / suppression.', ms: 8500 },
            { type: 'move', selector: '[data-tour="audit-kpis"] > div:nth-child(2)', wait: 400 },
            { type: 'caption', text: 'Actions aujourd\'hui : combien de modifications faites dans la journée. Si c\'est 0 le matin, personne n\'a touché à rien.', ms: 8500 },
            { type: 'move', selector: '[data-tour="audit-kpis"] > div:nth-child(3)', wait: 400 },
            { type: 'caption', text: 'Utilisateur le plus actif : utile pour repérer qui pousse les données — souvent le tech le plus mobilisé sur des interventions.', ms: 9000 },
            { type: 'move', selector: '[data-tour="audit-kpis"] > div:nth-child(4)', wait: 400 },
            { type: 'caption', text: 'Entité la plus modifiée : machine ? pièce ? OT ? Vous voyez où se concentre l\'activité de votre usine.', ms: 8500 },

            // ── Filters: chip walk + selector + search ──
            { type: 'move', selector: '[data-tour="audit-filters"]', wait: 500 },
            { type: 'caption', text: 'Bandeau de filtres : chips d\'action, sélecteur d\'entité, recherche libre — tout combinable pour les enquêtes.', ms: 7500 },

            { type: 'move', selector: '[data-tour="audit-chip"][data-chip="création"]', wait: 400 },
            { type: 'caption', text: 'Je clique sur le chip vert « Création » — n\'affiche que les ajouts de données.', ms: 6500 },
            { type: 'click', selector: '[data-tour="audit-chip"][data-chip="création"]', pulse: true, wait: 1200 },
            { type: 'caption', text: 'Vous voyez chaque création : nouvelle machine, nouvelle pièce, nouveau lot de production — tracée et signée.', ms: 8000 },

            { type: 'move', selector: '[data-tour="audit-chip"][data-chip="modification"]', wait: 400 },
            { type: 'caption', text: 'Chip orange « Modification » → toutes les éditions de fiches. Utile pour comprendre comment une donnée a évolué.', ms: 8500 },
            { type: 'click', selector: '[data-tour="audit-chip"][data-chip="modification"]', pulse: true, wait: 1200 },

            { type: 'move', selector: '[data-tour="audit-chip"][data-chip="suppression"]', wait: 400 },
            { type: 'caption', text: 'Chip rouge « Suppression » → isolez tous les effacements. Le filtre clé en cas d\'audit ISO ou de doute.', ms: 8000 },
            { type: 'click', selector: '[data-tour="audit-chip"][data-chip="suppression"]', pulse: true, wait: 1200 },

            { type: 'move', selector: '[data-tour="audit-chip"][data-chip="all"]', wait: 400 },
            { type: 'click', selector: '[data-tour="audit-chip"][data-chip="all"]', pulse: true, wait: 800 },

            { type: 'move', selector: '[data-tour="audit-entity-select"]', wait: 400 },
            { type: 'caption', text: 'Sélecteur d\'entité : ciblez un seul type — machine, pièce, OT, certification… pour suivre un objet précis.', ms: 8500 },

            { type: 'move', selector: '[data-tour="audit-search"]', wait: 400 },
            { type: 'type', selector: '[data-tour="audit-search"]', value: 'REM-001', wait: 700 },
            { type: 'caption', text: 'Recherche libre : tapez un code machine, un nom de pièce, un utilisateur — tout ce qui apparaît dans les résumés.', ms: 9000 },
            { type: 'type', selector: '[data-tour="audit-search"]', value: '', wait: 600 },

            // ── Timeline ──
            { type: 'move', selector: 'main', wait: 500 },
            { type: 'caption', text: 'En-dessous, la timeline groupée par jour. Chaque ligne : icône colorée selon l\'action, auteur, entité, résumé, horodatage relatif.', ms: 9000 },
            { type: 'caption', text: 'Le journal ne peut être ni modifié ni effacé — c\'est votre preuve légale en cas d\'audit ISO 9001 ou de litige fournisseur.', ms: 8500 },
        ],
    },
    {
        icon: Settings, color: '#475569',
        title: 'Paramètres',
        selector: '[data-tour="settings-appearance"]', route: '/settings',
        whatFor: 'Le centre de configuration : thème, langue, devise, fuseau, formules KPI personnalisées, replay du tutoriel.',
        howTo: 'Choisissez le thème (clair / sombre / auto), la langue, la devise. Tout est sauvegardé serveur et vous suit sur n\'importe quel poste.',
        helps: 'Personnalisez l\'app à votre usine sans toucher au code — y compris les formules KPI métier.',
        align: 'Seul l\'admin accède aux paramètres globaux. Chaque utilisateur a en plus son profil perso (avatar, mot de passe) via l\'icône avatar.',
        demo: [
            { type: 'move', selector: '[data-tour="settings-tutorial"]', wait: 500 },
            { type: 'caption', text: 'Tout en haut : « Revoir le tutoriel ». Relance ce tour guidé quand vous voulez — vous ou tout nouvel admin.', ms: 7500 },

            // ── Appearance walked + theme swap demo + revert ──
            { type: 'move', selector: '[data-tour="settings-appearance"]', wait: 500 },
            { type: 'caption', text: 'Section Apparence : 3 thèmes pour adapter l\'interface à votre environnement de travail.', ms: 6500 },
            { type: 'move', selector: '[data-tour="settings-theme-btn"][data-theme="light"]', wait: 400 },
            { type: 'caption', text: '☀️ Clair : interface classique, idéale en production de jour avec beaucoup de lumière ambiante.', ms: 7500 },
            { type: 'move', selector: '[data-tour="settings-theme-btn"][data-theme="dark"]', wait: 400 },
            { type: 'caption', text: '🌙 Sombre : pensé pour la salle de contrôle, écrans sur mur, équipes de nuit.', ms: 7000 },
            { type: 'click', selector: '[data-tour="settings-theme-btn"][data-theme="dark"]', pulse: true, wait: 1500 },
            { type: 'caption', text: 'Bascule instantanée — toute l\'interface est repeinte. Vos préférences sont sauvegardées côté serveur, vous les retrouvez sur n\'importe quel poste.', ms: 9500 },
            { type: 'move', selector: '[data-tour="settings-theme-btn"][data-theme="system"]', wait: 400 },
            { type: 'caption', text: '🖥️ Système : suit l\'OS — sombre la nuit selon votre Windows / Mac, clair le jour.', ms: 7500 },
            { type: 'move', selector: '[data-tour="settings-theme-btn"][data-theme="light"]', wait: 400 },
            { type: 'click', selector: '[data-tour="settings-theme-btn"][data-theme="light"]', pulse: true, wait: 1500 },
            { type: 'caption', text: 'Je remets le thème Clair pour ne rien changer à vos préférences.', ms: 6500 },

            // ── Currency widget ──
            { type: 'move', selector: '[data-tour="settings-currency"]', wait: 500 },
            { type: 'caption', text: 'Taux de change en direct : MAD ↔ EUR, USD, GBP. Mis à jour automatiquement — utile pour les bons de commande en devises.', ms: 9000 },

            // ── Cards walk ──
            { type: 'move', selector: '[data-tour="settings-cards"]', wait: 500 },
            { type: 'caption', text: 'En bas, des cartes de configuration avancée — chacune ouvre une modale dédiée.', ms: 7000 },
            { type: 'move', selector: '[data-tour="settings-card"][data-card="locale"]', wait: 400 },
            { type: 'caption', text: 'Langue & devise : FR / EN / AR · MAD / EUR / USD · fuseau horaire — pour vos sites multi-pays.', ms: 8500 },
            { type: 'move', selector: '[data-tour="settings-card"][data-card="company"]', wait: 400 },
            { type: 'caption', text: 'Entreprise : nom, logo, adresse, ICE — c\'est ce qui apparaît sur les PDF de bons de commande et rapports.', ms: 8500 },
            { type: 'move', selector: '[data-tour="settings-card"][data-card="approval"]', wait: 400 },
            { type: 'caption', text: 'Seuil d\'approbation : au-delà de quel montant un BC doit passer par votre validation ? Ex: 5 000 MAD.', ms: 8000 },
            { type: 'caption', text: 'Ce chiffre est LIÉ à la page « Validations achats » : dès qu\'un BC dépasse le seuil, il apparaît là pour votre feu vert. Vous pouvez le changer à tout moment — l\'effet est immédiat sur les BC créés APRÈS le changement.', ms: 11000 },
            { type: 'move', selector: '[data-tour="settings-card"][data-card="db"]', wait: 400 },
            { type: 'caption', text: 'Base de données : statut de connexion Supabase, compteurs de lignes par table, bouton refresh.', ms: 8000 },

            // ── KPI Formula Builder walk ──
            // The card opens a modal — we click it, walk through the builder,
            // then esc to close so the rest of the tour can continue.
            { type: 'move', selector: '[data-tour="settings-card"][data-card="kpi"]', wait: 500 },
            { type: 'caption', text: 'Et la pépite cachée : « KPI Formula Builder » — créez vos propres indicateurs de maintenance à partir des données brutes, sans coder. Je clique pour vous montrer.', ms: 8500 },
            { type: 'click', selector: '[data-tour="settings-card"][data-card="kpi"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="kpi-builder"]', wait: 700 },
            { type: 'caption', text: 'Le builder s\'ouvre — interface type tableur visuel. Vous combinez des variables et opérateurs sans rien écrire.', ms: 7000 },
            { type: 'move', selector: '[data-tour="kpi-builder-name"]', wait: 400 },
            { type: 'caption', text: 'D\'abord le nom — celui qui apparaîtra dans vos rapports. Je tape un exemple.', ms: 5500 },
            { type: 'type', selector: '[data-tour="kpi-builder-name"] input', value: 'Coût horaire d\'arrêt', wait: 600 },
            { type: 'move', selector: '[data-tour="kpi-builder-vars"]', wait: 400 },
            { type: 'caption', text: 'Section « Variables » : toutes les données calculées par l\'app — heures d\'arrêt, MTBF, MTTR, coûts… Cliquez pour les ajouter à la formule.', ms: 9000 },
            { type: 'click', selector: '[data-tour="kpi-builder-vars"] button:nth-of-type(3)', pulse: true, wait: 1000 },
            { type: 'caption', text: 'J\'ajoute « Coût pièces (MAD) ».', ms: 3500 },
            { type: 'move', selector: '[data-tour="kpi-builder-ops"]', wait: 400 },
            { type: 'caption', text: 'Section « Opérateurs » : +, −, ×, ÷ pour combiner. Je clique sur ÷.', ms: 5500 },
            { type: 'click', selector: '[data-tour="kpi-builder-ops"] button:nth-of-type(4)', pulse: true, wait: 1000 },
            { type: 'click', selector: '[data-tour="kpi-builder-vars"] button:nth-of-type(1)', pulse: true, wait: 1000 },
            { type: 'caption', text: 'Puis « Heures d\'arrêt ». La formule devient : Coût pièces ÷ Heures d\'arrêt = coût horaire d\'arrêt.', ms: 7000 },
            { type: 'move', selector: '[data-tour="kpi-builder-formula"]', wait: 400 },
            { type: 'caption', text: 'La formule s\'affiche ici sous forme de pastilles violettes (variables) et grises (opérateurs). Cliquez une pastille pour la supprimer.', ms: 7500 },
            { type: 'move', selector: '[data-tour="kpi-builder-preview"]', wait: 400 },
            { type: 'caption', text: 'L\'aperçu en bas calcule en temps réel sur des données de démo — vous voyez instantanément si la formule a du sens avant d\'enregistrer.', ms: 7500 },
            { type: 'move', selector: '[data-tour="kpi-builder-save"]', wait: 400 },
            { type: 'caption', text: 'Je clique « Enregistrer cet indicateur » — l\'indicateur est sauvegardé et apparaît dans la liste « Indicateurs enregistrés » juste en dessous.', ms: 7000 },
            { type: 'click', selector: '[data-tour="kpi-builder-save"]', pulse: true, wait: 1800 },
            { type: 'move', selector: '[data-tour="kpi-builder-saved"]', wait: 400 },
            { type: 'caption', text: 'Le voilà dans « Indicateurs enregistrés ». « Charger » réinjecte la formule dans le builder pour la modifier, l\'icône poubelle 🗑 la supprime définitivement.', ms: 8500 },
            { type: 'esc', wait: 700 },

            // ── SHOW WHERE IT IS USED ──
            // Explicit navigation to /reports so the admin sees the KPI
            // materialize alongside the built-in KPIs. Answers the question
            // the user raised: "and where do I use it after saving?".
            { type: 'caption', text: 'Et maintenant — la question importante : « où je le retrouve ? ». Je vais sur Rapports pour vous montrer.', ms: 6500 },
            { type: 'navigate', route: '/reports', wait: 1300 },
            { type: 'move', selector: '[data-tour="reports-custom-kpis"], [data-tour="reports-analytics-kpis"]', wait: 700 },
            { type: 'caption', text: 'Section « Mes indicateurs personnalisés » — chaque formule est recalculée en temps réel sur les données de vos interventions, machines et coûts.', ms: 8500 },
            { type: 'move', selector: '[data-tour="reports-custom-kpi-card"]', wait: 600 },
            { type: 'caption', text: 'Chaque carte violette montre le nom du KPI, sa valeur actuelle, et la formule qui l\'a produite. Idéal pour les revues mensuelles.', ms: 8500 },
            { type: 'caption', text: 'Le KPI apparaît aussi dans les exports PDF via « Imprimer / Exporter » en haut de la page — ça part directement dans vos revues DG.', ms: 7500 },

            // ── CLEANUP — remove the demo KPI so no test data lingers ──
            // The admin flagged that the tutorial left "Coût horaire d\'arrêt"
            // as a permanent row in his real KPI list. On the way back to
            // Paramètres we reopen the builder and delete the row created
            // during the walkthrough, matched by the exact name we typed.
            { type: 'caption', text: 'Je nettoie ma démo — je supprime le KPI de démonstration pour ne rien laisser traîner dans vos vrais indicateurs.', ms: 6500 },
            { type: 'navigate', route: '/settings', wait: 1300 },
            { type: 'move', selector: '[data-tour="settings-card"][data-card="kpi"]', wait: 500 },
            { type: 'click', selector: '[data-tour="settings-card"][data-card="kpi"]', pulse: true, wait: 1500 },
            { type: 'move', selector: '[data-tour="kpi-builder-saved"]', wait: 700 },
            // Fire a targeted delete via a CustomEvent — the KPI list will
            // pick it up regardless of DOM ordering / row-count.
            { type: 'event', eventName: 'smartmaint-demo-delete-kpi', detail: { name: 'Coût horaire d\'arrêt' }, wait: 800 },
            { type: 'caption', text: 'Voilà — le KPI de démo est effacé. Votre liste est aussi propre qu\'au début.', ms: 5500 },
            { type: 'esc', wait: 700 },
            { type: 'caption', text: 'Retour aux Paramètres. Vous savez maintenant créer un KPI, où il vit, et comment le partager. Toutes les préférences sont sauvegardées côté serveur.', ms: 8000 },
        ],
    },

    // ─── Outro ───
    {
        icon: CheckCircle2, color: '#3b82f6',
        title: 'Bonne maintenance !',
        whatFor: 'Vous avez fait le tour complet — 26 fonctionnalités vues une par une.',
        howTo: 'Cliquez sur votre avatar en haut à droite à tout moment pour rejouer ce tour.',
        helps: 'Plus vous remontez d\'incidents dans le système, plus l\'IA prédictive devient pertinente.',
        align: 'Vous êtes le chef d\'orchestre. Le système amplifie votre vue — il ne la remplace pas.',
    },
];

const technicianSteps: Step[] = [
    {
        icon: Sparkles, color: '#f97316',
        title: 'Bienvenue — votre poste de travail',
        whatFor: 'SmartMaint vous donne vos OT du jour, l\'inventaire en temps réel, les fiches procédures et un canal direct avec l\'équipe.',
        howTo: 'Je pointe chaque outil important un par un. « Suivant » pour avancer, « Passer » à tout moment.',
        helps: 'Moins de paperasse, plus de temps sur le terrain. Tout est tracé automatiquement.',
        align: 'L\'admin voit l\'agrégation de votre travail. Les opérateurs vous alertent via le bouton rouge sur leur tablette.',
    },

    // ─── Mon travail ───
    {
        icon: LayoutDashboard, color: '#f97316',
        title: 'Tableau de bord',
        selector: '[data-tour="tech-board"]', route: '/technician/dashboard',
        whatFor: 'Vos interventions du jour en Kanban : planifiées, en cours, terminées. Alertes sécurité par machine.',
        howTo: 'Cliquez une carte pour ouvrir l\'OT. Le bouton « Démarrer » lance le chrono d\'intervention.',
        helps: 'Voir immédiatement quoi faire en priorité (urgent en rouge), sans chercher dans une liste.',
        align: 'L\'admin a assigné ces OT depuis sa page Interventions.',
        demo: [
            // Interactive mock card — buttons swap their content on click,
            // so the user sees a realistic "Accepter / Signaler" workflow
            // even when the real kanban is still empty.
            {
                type: 'mock',
                container: '[data-tour="tech-board"]',
                html: `
                    <div data-tutorial-mock-tech-card style="border:2px dashed #f97316;border-radius:14px;padding:16px;background:#fff7ed;color:#9a3412;font-family:inherit;min-height:140px">
                        <div style="font-size:11px;font-weight:800;letter-spacing:0.06em;color:#ea580c;text-transform:uppercase">Exemple — démonstration tutoriel</div>
                        <div style="font-size:15px;font-weight:700;margin-top:6px;color:#0f172a">REM-001 · Fuite niveau buse 3</div>
                        <div style="font-size:12.5px;margin-top:4px;color:#475569">Urgence: <b>haute</b> · Assigné par admin · 14:32</div>
                        <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
                            <span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:100px;background:#fed7aa;color:#9a3412">Haute</span>
                            <span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:100px;background:#ffedd5;color:#c2410c">2 h estimées</span>
                        </div>
                        <div style="margin-top:12px;display:flex;gap:8px">
                            <button data-tutorial-mock-accept style="flex:1;padding:8px 12px;border-radius:9px;background:linear-gradient(135deg,#22c55e,#16a34a);color:white;border:none;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit" onclick="this.parentElement.innerHTML='<span style=&quot;flex:1;text-align:center;padding:8px;border-radius:9px;background:#dcfce7;color:#15803d;font-size:12.5px;font-weight:700&quot;>✓ Acceptée — chrono démarré</span>'">👍 Accepter</button>
                            <button data-tutorial-mock-report style="flex:1;padding:8px 12px;border-radius:9px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">⚠️ Signaler</button>
                        </div>
                    </div>
                `,
                wait: 1000,
            },
            { type: 'move', selector: '[data-tour="tech-board"]', wait: 350 },
            { type: 'caption', text: 'Tableau Kanban — votre journée d\'un coup d\'œil. Chaque carte = un OT assigné par l\'admin.', ms: 4000 },
            { type: 'move', selector: '[data-tutorial-mock-tech-card]', wait: 350 },
            { type: 'caption', text: 'Couleur du contour = urgence. Rouge critique, orange haute, jaune normale.', ms: 3500 },
            { type: 'move', selector: '[data-tutorial-mock-accept]', wait: 500 },
            { type: 'caption', text: 'Le bouton vert « 👍 Accepter » prend l\'OT en charge et démarre votre chrono. Je clique pour vous montrer.', ms: 5500 },
            { type: 'click', selector: '[data-tutorial-mock-accept]', pulse: true, wait: 1500 },
            { type: 'caption', text: 'L\'OT bascule en « Acceptée — chrono démarré ». L\'admin reçoit la notification en direct.', ms: 4500 },
            { type: 'caption', text: 'Le bouton rouge « ⚠️ Signaler » sert quand vous voyez un problème (pièce manquante, sécurité bloquée…). L\'admin réagit immédiatement.', ms: 6000 },
            { type: 'caption', text: 'En dessous : « Interventions terminées » — l\'historique de votre journée pour relecture rapide.', ms: 4000 },
        ],
    },
    {
        icon: CalendarDays, color: '#0891b2',
        title: 'Mon planning',
        selector: '[data-tour="plan-kpis"]', route: '/technician/planning',
        whatFor: 'Votre liste personnelle d\'interventions affectées — fenêtre de 21 jours (semaine passée + 2 semaines à venir).',
        howTo: 'Lisez les KPI globaux, puis parcourez les journées. Cliquez une intervention pour ouvrir directement le rapport.',
        helps: 'Visualisez votre charge sur la semaine — un préventif oublié = panne probable la semaine suivante.',
        align: 'L\'admin a assigné ces OT depuis sa page Interventions. Le statut change ici en temps réel pour les deux.',
        demo: [
            { type: 'move', selector: '[data-tour="plan-kpis"]', wait: 400 },
            { type: 'caption', text: 'En haut, quatre compteurs : aujourd\'hui, à venir, en retard, total de la fenêtre.', ms: 3300 },
            { type: 'move', selector: '[data-tour="plan-kpis"] > div:nth-of-type(1)', wait: 350 },
            { type: 'caption', text: '« Aujourd\'hui » : nombre d\'OT à traiter en arrivant au poste.', ms: 2800 },
            { type: 'move', selector: '[data-tour="plan-kpis"] > div:nth-of-type(3)', wait: 350 },
            { type: 'caption', text: '« En retard » devient rouge dès qu\'un OT dépasse sa date de planification — à traiter en priorité.', ms: 3500 },
            { type: 'move', selector: '[data-tour="plan-days"]', wait: 400 },
            { type: 'caption', text: 'En dessous, vos journées en cartes. Aujourd\'hui est encadré en bleu pour que vous le repériez immédiatement.', ms: 3700 },
            { type: 'move', selector: '[data-tour="plan-days"] > div:first-of-type', wait: 350 },
            { type: 'caption', text: 'Chaque carte = un jour. Le compteur à droite indique combien d\'interventions sont prévues.', ms: 3300 },
            { type: 'caption', text: 'La barre verticale colorée à gauche de chaque OT = type : rouge correctif, bleu préventif, violet conditionnel, vert amélioratif.', ms: 4000 },
            { type: 'caption', text: 'Cliquez une ligne pour ouvrir directement le rapport d\'intervention pré-rempli.', ms: 3200 },
        ],
    },
    {
        icon: Wrench, color: '#22c55e',
        title: 'Mes interventions — rapport',
        selector: '[data-tour="rapport-chrono"]', route: '/technician/report',
        whatFor: 'L\'écran où vous clôturez un OT — chrono d\'intervention, cause, action, pièces utilisées, photos avant/après.',
        howTo: 'Démarrez le chrono à l\'arrivée, prenez la photo « avant », rédigez (ou dictez) la cause puis l\'action, ajoutez les pièces utilisées, joignez une photo « après », puis Clôturer.',
        helps: 'Plus de cahier papier. La photo « avant » est votre preuve pour l\'analyse de cause racine et l\'assurance.',
        align: 'Le rapport remonte instantanément au dashboard admin, recalcule le MTBF de la machine, et déduit les pièces du stock automatiquement.',
        demo: [
            // ── Chrono ──
            { type: 'move', selector: '[data-tour="rapport-chrono"]', wait: 400 },
            { type: 'caption', text: 'Tout en haut : le chrono d\'intervention. Vous le démarrez en arrivant sur la machine.', ms: 2900 },
            { type: 'move', selector: '[data-tour="rapport-chrono"] button:first-of-type', wait: 350 },
            { type: 'caption', text: 'Le bouton vert « Démarrer » lance le chrono. Pendant l\'intervention, ce même bouton devient « Pause ».', ms: 3000 },
            { type: 'caption', text: 'Le temps mesuré devient la durée d\'arrêt de l\'OT — plus besoin d\'estimer.', ms: 2600 },
            // ── Photo avant ──
            { type: 'move', selector: '[data-tour="rapport-photo-avant"]', wait: 400 },
            { type: 'caption', text: 'L\'invite bleue « Photo avant » : capturez l\'état initial de la machine avant de toucher.', ms: 2900 },
            { type: 'move', selector: '[data-tour="rapport-photo-avant"] button', wait: 350 },
            { type: 'caption', text: 'Ce bouton ouvre la caméra. La photo sert de preuve pour l\'analyse de cause racine.', ms: 2900 },
            // ── Cause probable ──
            { type: 'move', selector: '[data-tour="rapport-cause"]', wait: 400 },
            { type: 'caption', text: 'Premier champ : la cause probable de la panne.', ms: 2400 },
            { type: 'move', selector: '[data-tour="rapport-cause"] textarea', wait: 350 },
            { type: 'caption', text: 'Vous tapez librement ici — ou cliquez les phrases pré-écrites au-dessus pour aller plus vite.', ms: 3000 },
            { type: 'type', selector: '[data-tour="rapport-cause"] textarea', value: 'Roulement usé', wait: 250 },
            { type: 'move', selector: '[data-tour="rapport-cause"] button', wait: 350 },
            { type: 'caption', text: 'Le bouton orange à droite du champ : dictée vocale. Parlez, le texte apparaît automatiquement.', ms: 3100 },
            // ── Action réalisée ──
            { type: 'move', selector: '[data-tour="rapport-action"]', wait: 400 },
            { type: 'caption', text: 'Champ suivant : l\'action que vous avez réalisée pour résoudre.', ms: 2600 },
            { type: 'move', selector: '[data-tour="rapport-action"] textarea', wait: 350 },
            { type: 'caption', text: 'Même principe : tape, phrases rapides au-dessus, ou dictée vocale au micro orange.', ms: 2900 },
            { type: 'type', selector: '[data-tour="rapport-action"] textarea', value: 'Remplacement du roulement et graissage', wait: 250 },
            { type: 'move', selector: '[data-tour="rapport-action"] button:last-of-type', wait: 350 },
            { type: 'caption', text: 'Ce gros bouton micro orange est le plus utile — un clic, vous parlez, l\'IA transcrit en français ou arabe.', ms: 3300 },
            // ── Photos / vidéos après ──
            { type: 'move', selector: '[data-tour="rapport-attachments"]', wait: 400 },
            { type: 'caption', text: 'Section pièces jointes : photos et courtes vidéos pour documenter le résultat.', ms: 2900 },
            { type: 'move', selector: '[data-tour="rapport-attachments"] button:first-of-type', wait: 350 },
            { type: 'caption', text: '« Prendre une photo » pour le « après ». La photo est tagée automatiquement.', ms: 2800 },
            { type: 'move', selector: '[data-tour="rapport-attachments"] button:nth-of-type(2)', wait: 350 },
            { type: 'caption', text: '« Vidéo courte » pour les pannes complexes — utile quand un mot ne suffit pas.', ms: 2900 },
            // ── Pièces utilisées ──
            { type: 'move', selector: '[data-tour="rapport-parts"]', wait: 400 },
            { type: 'caption', text: 'Pièces utilisées : cherchez dans l\'inventaire et ajoutez ce que vous avez consommé.', ms: 3000 },
            { type: 'move', selector: '[data-tour="rapport-parts"] input', wait: 350 },
            { type: 'caption', text: 'Tapez 3 lettres — les suggestions du stock apparaissent avec leur disponibilité (vert / orange / rouge).', ms: 3300 },
            { type: 'caption', text: 'À la clôture, chaque pièce ajoutée est déduite du stock automatiquement.', ms: 2700 },
            // ── Clôturer ──
            { type: 'move', selector: '[data-tour="rapport-save"]', wait: 400 },
            { type: 'caption', text: 'Le gros bouton vert : Clôturer l\'intervention.', ms: 2500 },
            { type: 'caption', text: 'Au clic : l\'OT passe en « terminée », le MTBF de la machine est recalculé, et l\'admin reçoit une notification à valider.', ms: 3600 },
        ],
    },
    {
        icon: Briefcase, color: '#0891b2',
        title: 'Projets',
        selector: 'main', route: '/projets',
        whatFor: 'Les grands chantiers dont vos interventions font partie — révision annuelle, grand arrêt, mise en service.',
        howTo: 'Consultez le projet pour voir l\'ensemble des OT associés, l\'avancement global et l\'échéance visée. Vos propres OT sont mis en avant.',
        helps: 'Vous comprenez pourquoi votre OT existe et comment il s\'inscrit dans un plan plus large — pas juste une tâche isolée.',
        align: 'L\'admin crée / suit le projet ; vous exécutez les OT qui vous sont assignés dedans.',
        demo: [
            { type: 'caption', text: 'Un projet regroupe plusieurs OT liés — par exemple la révision annuelle d\'une ligne peut contenir 12 interventions étalées sur 2 semaines.', ms: 7500 },
            { type: 'caption', text: 'Vous voyez ici l\'avancement global du chantier, son échéance, et surtout où votre propre travail s\'inscrit.', ms: 6500 },
            { type: 'caption', text: 'Cela vous aide à prioriser : un OT dans un projet en retard peut être plus urgent qu\'un OT isolé.', ms: 6000 },
        ],
    },
    {
        icon: ScanLine, color: '#ef4444',
        title: 'Scanner machine',
        selector: '[data-tour="scan-start"]', route: '/technician/scanner',
        whatFor: 'Lecture du QR code physique apposé sur chaque machine pour l\'identifier instantanément sans chercher dans la liste.',
        howTo: 'Cliquez le gros bouton orange → autorisez la caméra → pointez vers l\'étiquette QR collée sur la machine → la fiche s\'ouvre toute seule. Bouton « Importer une image » si la caméra refuse.',
        helps: 'Élimine les erreurs d\'identification (« je pensais que c\'était la pompe 2 ») et le temps perdu à chercher la machine.',
        align: 'L\'admin a généré et imprimé les QR depuis la fiche machine. L\'opérateur ne s\'en sert pas — c\'est votre outil terrain.',
        demo: [
            { type: 'move', selector: '[data-tour="scan-start"]', wait: 400 },
            { type: 'caption', text: 'Le gros bouton orange au centre — c\'est l\'élément principal de la page. Conçu pour être touché avec les gants.', ms: 4000 },
            // pretend-click instead of real click so the demo doesn't actually
            // request camera permission mid-tour.
            { type: 'pretend-click', selector: '[data-tour="scan-start"]', wait: 1200 },
            { type: 'caption', text: 'Au clic : la caméra arrière du téléphone s\'active automatiquement.', ms: 3500 },
            // Mock the success card — what the technician sees after the QR
            // is detected. Demonstrates the auto-redirect to the machine fiche.
            { type: 'mock', container: 'main', html: '<div data-tutorial-mock-scan-success style="margin-top:18px;border-radius:14px;border:2px solid #16a34a;background:linear-gradient(180deg,#f0fdf4,#dcfce7);padding:18px 22px;font-family:inherit"><div style="font-size:11px;font-weight:800;color:#15803d;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px">🎓 Exemple — QR détecté</div><div style="display:flex;align-items:center;gap:14px"><div style="width:50px;height:50px;border-radius:12px;background:rgba(34,197,94,0.18);display:flex;align-items:center;justify-content:center;font-size:24px">✅</div><div style="flex:1"><div style="font-size:15px;font-weight:700;color:#0f172a">REM-001 — Remplisseuse automatique</div><div style="font-size:12.5px;color:#475569;margin-top:2px">Zone Remplissage · Ligne 1 · Opérationnelle</div><div style="font-size:11px;color:#15803d;margin-top:6px;font-weight:600">→ Ouverture automatique de la fiche dans 1 seconde…</div></div></div></div>', wait: 1000 },
            { type: 'move', selector: '[data-tutorial-mock-scan-success]', wait: 600 },
            { type: 'caption', text: 'Dès la lecture réussie, le code machine est reconnu et la fiche s\'ouvre toute seule. Vous n\'avez RIEN à taper.', ms: 6000 },
            { type: 'caption', text: 'Sur la fiche : historique de pannes, plans préventifs, pièces compatibles, QR à réimprimer si besoin.', ms: 5000 },
            { type: 'move', selector: 'main', wait: 400 },
            { type: 'caption', text: 'En dessous : un bouton « Importer une image » au cas où la caméra refuse — lit le QR depuis une photo prise en galerie.', ms: 4500 },
            { type: 'caption', text: 'Astuce : si le QR est endommagé sur la machine, demandez à l\'admin de réimprimer depuis la fiche.', ms: 4000 },
        ],
    },
    {
        icon: BarChart3, color: '#8b5cf6',
        title: 'Mes statistiques',
        selector: '[data-tour="stats-kpis"]', route: '/technician/stats',
        whatFor: 'Votre performance personnelle : interventions ce mois, MTTR moyen, top 3 machines, répartition correctif/préventif.',
        howTo: 'Lecture seule. Ces cartes sont calculées depuis vos interventions clôturées.',
        helps: 'Suivez votre progression au fil des mois. Utile pour l\'entretien annuel — vous arrivez avec des chiffres.',
        align: 'Seul vous voyez vos stats. L\'admin a une vue agrégée dans son module Performance.',
        demo: walkThrough([
            { selector: '[data-tour="stats-kpis"]', text: 'Vos KPI personnels — calculés en direct.', ms: 2200 },
            { selector: '[data-tour="stats-kpis"] > div:nth-of-type(1)', text: 'Interventions clôturées ce mois.', ms: 2200 },
            { selector: '[data-tour="stats-kpis"] > div:nth-of-type(2)', text: 'Votre MTTR moyen — temps moyen de réparation.', ms: 2200 },
            { selector: '[data-tour="stats-kpis"] > div:nth-of-type(3)', text: 'Top 3 machines sur lesquelles vous intervenez le plus.', ms: 2200 },
            { selector: 'main .card:nth-of-type(1)', text: 'En dessous : graphique d\'évolution sur 6 mois.', ms: 2400 },
        ]),
    },

    // ─── Outillage ───
    {
        icon: Briefcase, color: '#0891b2',
        title: 'Outillage & pièces',
        selector: '[data-tour="inv-kpis"]', route: '/technician/inventory',
        whatFor: 'Inventaire temps-réel partagé entre tous les techniciens : qui détient quel outil, stock des pièces de rechange, demande d\'achat en un clic.',
        howTo: 'Filtrez les outils par statut ou catégorie, prenez/remettez un outil sur sa carte, cherchez une pièce dans le tableau, demandez le réappro si stock critique.',
        helps: 'Plus de balade au magasin pour rien — vous voyez disponibilité et emplacement en 2 secondes.',
        align: 'L\'admin voit le même inventaire dans son module Pièces. Vos demandes arrivent dans son Approvisionnement à valider.',
        demo: [
            { type: 'move', selector: '[data-tour="inv-kpis"]', wait: 400 },
            { type: 'caption', text: 'Quatre KPI en haut : outils disponibles, vos outils en main, pièces en stock critique, total unités.', ms: 3500 },
            { type: 'move', selector: '[data-tour="inv-kpis"] > div:nth-of-type(2)', wait: 350 },
            { type: 'caption', text: '« Mes outils en main » : compteur personnel. Plus c\'est élevé, plus vous devez en rendre.', ms: 3200 },
            { type: 'move', selector: '[data-tour="inv-kpis"] > div:nth-of-type(3)', wait: 350 },
            { type: 'caption', text: '« Pièces en stock critique » devient rouge dès qu\'une référence passe sous le seuil mini.', ms: 3400 },
            { type: 'move', selector: '[data-tour="inv-tools"]', wait: 400 },
            { type: 'caption', text: 'Bloc Outillage : chips de filtre en haut — Tous, Disponible, En utilisation, En maintenance, Mes outils.', ms: 3700 },
            { type: 'move', selector: '[data-tour="inv-tools"] > div:nth-of-type(2) button:nth-of-type(5)', wait: 350 },
            { type: 'caption', text: 'Chip « Mes outils » : isolez ceux que vous tenez personnellement — pour rendre rapidement en fin de poste.', ms: 3700 },
            { type: 'move', selector: '[data-tour="inv-tools"] > div:nth-of-type(3)', wait: 400 },
            { type: 'caption', text: 'Cartes outil : icône de catégorie, emplacement, qui le détient avec horloge depuis combien de temps.', ms: 3700 },
            { type: 'caption', text: 'Bouton vert « Prendre » sur les outils disponibles ; rouge « Rendre » sur ceux que vous tenez.', ms: 3300 },
            { type: 'move', selector: '[data-tour="inv-parts"]', wait: 400 },
            { type: 'caption', text: 'Section Pièces de rechange : tableau filtrable par nom ou référence.', ms: 3000 },
            { type: 'move', selector: '[data-tour="inv-parts"] input', wait: 350 },
            { type: 'type', selector: '[data-tour="inv-parts"] input', value: 'SKF', wait: 250 },
            { type: 'caption', text: 'Tapez la référence ou la marque — la liste se filtre en direct.', ms: 2800 },
            { type: 'caption', text: 'Sur chaque ligne de stock critique : bouton orange « Demander » pré-rempli — la demande d\'achat part instantanément à l\'admin.', ms: 4000 },
        ],
    },
    {
        icon: Lock, color: '#dc2626',
        title: 'LOTO — consignation',
        selector: '[data-tour="loto-action"]', route: '/loto',
        whatFor: 'Déclarer qu\'une machine est verrouillée pendant votre intervention — sécurité électrique obligatoire.',
        howTo: 'Cliquez « Consigner une machine » → machine + n° cadenas + motif. À la fin de l\'intervention, levez la consigne.',
        helps: 'Aucun collègue ne peut intervenir par erreur sur une machine que vous avez consignée — élimine les accidents.',
        align: 'L\'admin voit toutes les consignations actives. Les autres techniciens voient « machine consignée par X ».',
        demo: modalDemo({
            open: '[data-tour="loto-action"]',
            intro: 'J\'ouvre le formulaire de consignation.',
            openedCaption: 'Le modal s\'ouvre.',
            fields: [
                { value: 'CAD-014', caption: 'Je saisis le numéro physique du cadenas posé sur la machine…' },
                { value: 'Remplacement joints + contrôle visuel', caption: '… puis le motif clair de la consignation.', index: 1 },
            ],
            saveCaption: 'Consigné — votre nom apparaît à tous : interdiction de redémarrer la machine.',
        }),
    },

    // ─── Documentation ───
    {
        icon: ListChecks, color: '#f59e0b',
        title: 'Check-lists OT',
        selector: '[data-tour="cl-kpis"]', route: '/checklists',
        whatFor: 'Les modèles de check-lists créés par l\'admin (démarrage de ligne, nettoyage, fin de poste, vérification sécurité) — à exécuter pas-à-pas sur le terrain.',
        howTo: 'Choisissez un modèle dans la grille → bouton vert « Exécuter » → la fiche s\'ouvre étape par étape, vous cochez chacune. Note possible par étape. Sauvegarde automatique.',
        helps: 'Standardisation : pas d\'étape oubliée même quand vous êtes pressé ou nouveau. Trace immuable pour l\'audit HACCP.',
        align: 'L\'admin crée et publie les modèles. Vous les exécutez. Le résultat reste accessible à tout moment pour l\'audit.',
        demo: [
            { type: 'move', selector: '[data-tour="cl-kpis"]', wait: 400 },
            { type: 'caption', text: 'Les KPI en haut résument l\'usage : modèles disponibles, exécutions totales, taux de complétion moyen.', ms: 3500 },
            { type: 'move', selector: '[data-tour="cl-kpis"] .kpi-card:nth-of-type(3)', wait: 350 },
            { type: 'caption', text: 'Le taux de complétion devient orange en-dessous de 90 % — signe que des étapes sont régulièrement sautées.', ms: 3700 },
            { type: 'move', selector: 'main > div:nth-of-type(3)', wait: 400 },
            { type: 'caption', text: 'Les modèles s\'affichent en grille. Chaque carte montre : titre, machine cible si applicable, nombre d\'étapes, aperçu des 4 premières.', ms: 4000 },
            { type: 'move', selector: 'main > div:nth-of-type(3) > div:first-child button:first-of-type', wait: 400 },
            { type: 'caption', text: 'Le bouton vert « Exécuter » lance le runner pas-à-pas. Vous voyez chaque étape en grand sur le téléphone.', ms: 3700 },
            { type: 'caption', text: 'Cochez chaque étape au fur et à mesure — possibilité d\'ajouter une note (problème détecté, anomalie).', ms: 3700 },
            { type: 'caption', text: 'La progression est sauvée automatiquement : si vous quittez et revenez, vous reprenez là où vous étiez.', ms: 3500 },
            { type: 'caption', text: 'Fin de check-list : l\'horodatage + votre nom + chaque case cochée sont enregistrés et accessibles pour audit.', ms: 4000 },
        ],
    },
    {
        icon: BookOpen, color: '#8b5cf6',
        title: 'Base de connaissances + procédure guidée',
        selector: '[data-tour="knowledge-search"]', route: '/knowledge',
        whatFor: 'Bibliothèque des procédures et fiches dépannage. Mode étape-par-étape chronométré (T6).',
        howTo: 'Recherchez une fiche → ouvrez-la → bouton « Démarrer la procédure » → cochez chaque étape, notes possibles.',
        helps: 'L\'expérience des seniors devient accessible aux juniors. L\'exécution est tracée pour l\'audit HACCP.',
        align: 'L\'admin rédige les fiches. Votre exécution complète est enregistrée — preuve pour l\'audit.',
        demo: [
            // 1. Show the search filter typing in real-time
            { type: 'caption', text: 'Je vais montrer le flux complet : rechercher → ouvrir une fiche → mode guidé.', ms: 1800 },
            { type: 'type', selector: '[data-tour="knowledge-search"] input', value: 'étalon', wait: 400 },
            { type: 'caption', text: 'La liste se filtre en direct selon les lettres tapées.', ms: 2200 },

            // 2. Inject a mock fiche card so we have something to "click"
            {
                type: 'mock',
                container: 'main',
                html: `
                    <div data-tour="kb-fiche" style="margin-top:14px;padding:16px 18px;border-radius:14px;background:#faf5ff;border:1px solid #c4b5fd;border-left:4px solid #8b5cf6;cursor:pointer;font-family:inherit">
                        <div style="font-size:11px;font-weight:800;color:#7c3aed;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Exemple — démonstration tutoriel</div>
                        <div style="font-size:15px;font-weight:800;color:#5b21b6">Étalonnage thermomètre cuve mélange</div>
                        <div style="font-size:12.5px;color:#6d28d9;margin-top:4px">Catégorie : étalonnage · Machine : Préparation</div>
                    </div>
                `,
            },
            { type: 'move', selector: '[data-tour="kb-fiche"]', wait: 400 },
            { type: 'caption', text: 'Voici une fiche dans la liste — je clique pour l\'ouvrir.', ms: 2000 },
            { type: 'click', selector: '[data-tour="kb-fiche"]', pulse: true, wait: 400 },

            // 3. Inject a mock "open fiche modal" overlay
            {
                type: 'mock',
                container: 'body',
                html: `
                    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9993;display:flex;align-items:center;justify-content:center;padding:24px;font-family:inherit">
                        <div data-tour="kb-modal" style="background:var(--surface);border-radius:18px;max-width:560px;width:100%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.3);overflow:hidden">
                            <div style="padding:18px 22px;border-bottom:1px solid var(--border)">
                                <div style="font-size:10.5px;font-weight:800;color:#7c3aed;text-transform:uppercase;letter-spacing:0.05em">Étalonnage · Préparation</div>
                                <div style="font-size:18px;font-weight:800;margin-top:4px;color:var(--text-primary)">Étalonnage thermomètre cuve mélange</div>
                            </div>
                            <div style="padding:18px 22px;overflow-y:auto;flex:1;font-size:13.5px;line-height:1.6;color:var(--text-secondary)">
                                <div style="font-weight:700;color:var(--text-primary);margin-bottom:4px">Outils nécessaires</div>
                                <div>Manomètre de référence ±0.05 bar · Solution glace ±0 °C</div>
                                <div style="font-weight:700;color:var(--text-primary);margin-top:10px;margin-bottom:4px">Étapes</div>
                                <div>1. Isoler la ligne et consigner (LOTO)<br>2. Brancher l'étalon en parallèle<br>3. Comparer 3 points : 0 °C, 25 °C, 80 °C</div>
                            </div>
                            <div style="padding:14px 22px;border-top:1px solid var(--border);background:var(--surface-hover)">
                                <button data-tour="kb-start-procedure" style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:10px;background:linear-gradient(135deg,#f97316,#ea580c);color:white;font-weight:700;font-size:13.5px;border:none;font-family:inherit">▶ Démarrer la procédure (étape par étape)</button>
                                <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px">Chaque étape est chronométrée et la trace est enregistrée pour l'audit HACCP.</div>
                            </div>
                        </div>
                    </div>
                `,
            },
            { type: 'move', selector: '[data-tour="kb-modal"]', wait: 400 },
            { type: 'caption', text: 'La fiche s\'ouvre : outils + étapes en markdown.', ms: 2400 },
            { type: 'move', selector: '[data-tour="kb-start-procedure"]', wait: 400 },
            { type: 'caption', text: 'Bouton orange « Démarrer la procédure » → mode exécution chronométré.', ms: 2400 },
            { type: 'click', selector: '[data-tour="kb-start-procedure"]', pulse: true, wait: 400 },

            // 4. Inject a mock procedure runner overlay
            {
                type: 'mock',
                container: 'body',
                html: `
                    <div style="position:fixed;inset:0;background:#0f172a;z-index:9993;padding:24px;overflow-y:auto;font-family:inherit;color:white">
                        <div style="max-width:640px;margin:0 auto">
                            <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
                                <div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#f97316,#ea580c);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px">3</div>
                                <div>
                                    <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em">Procédure</div>
                                    <div style="font-size:18px;font-weight:800">Étape 3 sur 3 — Comparer 3 points</div>
                                </div>
                                <div style="margin-left:auto;background:rgba(249,115,22,0.15);color:#fb923c;padding:6px 12px;border-radius:8px;font-weight:700;font-size:13px">⏱ 04:32</div>
                            </div>
                            <div data-tour="kb-procedure-step" style="background:#1e293b;border-radius:14px;padding:18px;border:2px solid #f97316;margin-bottom:10px">
                                <div style="font-size:14px;font-weight:700">3. Comparer 3 points : 0 °C, 25 °C, 80 °C</div>
                                <div style="font-size:12px;color:#cbd5e1;margin-top:6px">Note : écart toléré ±0.5 °C</div>
                                <button data-tour="kb-procedure-validate" style="margin-top:12px;padding:10px 18px;background:linear-gradient(135deg,#22c55e,#16a34a);border:none;color:white;font-weight:700;border-radius:10px;font-family:inherit">✓ Valider cette étape</button>
                            </div>
                            <div style="background:#1e293b;border-radius:14px;padding:14px 18px;opacity:0.5;font-size:13px">✓ Étape 1 — Isoler la ligne · 01:12</div>
                            <div style="background:#1e293b;border-radius:14px;padding:14px 18px;opacity:0.5;font-size:13px;margin-top:6px">✓ Étape 2 — Brancher l'étalon · 02:08</div>
                        </div>
                    </div>
                `,
            },
            { type: 'move', selector: '[data-tour="kb-procedure-step"]', wait: 400 },
            { type: 'caption', text: 'Le mode procédure affiche une étape à la fois avec son chrono.', ms: 2600 },
            { type: 'move', selector: '[data-tour="kb-procedure-validate"]', wait: 400 },
            { type: 'caption', text: 'On valide chaque étape pour passer à la suivante — historique complet sauvegardé.', ms: 2800 },
        ],
    },
    {
        icon: Notebook, color: '#3b82f6',
        title: 'Carnet de quart',
        selector: '[data-tour="handover-compose"]', route: '/handover',
        whatFor: 'Message rapide pour la prochaine équipe — ce qui marche, ce qui ne marche pas, où vous en êtes resté.',
        howTo: 'Écrivez ici (ou dictez au micro orange), choisissez la priorité (info / surveiller / urgent), publiez.',
        helps: 'Continuité 3×8 garantie. La relève voit immédiatement les notes ouvertes à son arrivée.',
        align: 'Admin et techniciens partagent le même carnet. Quand vous marquez « Pris en charge », elle est grisée pour tous.',
        demo: walkThrough([
            { selector: '[data-tour="handover-compose"]', text: 'Zone de composition — votre message à la prochaine équipe.', ms: 2200 },
            { selector: '[data-tour="handover-compose"] textarea', text: 'Tapez ou dictez avec le micro orange — Whisper transcrit en FR.', ms: 2400 },
            { selector: '[data-tour="handover-priority"]', text: 'Pastilles de priorité — info, surveiller, urgent.', ms: 2200 },
            { selector: '[data-tour="handover-machine"]', text: 'Liez à une machine spécifique si pertinent.', ms: 2200 },
            { selector: '[data-tour="handover-publish"]', text: 'Publier — la relève voit la note dès sa connexion.', ms: 2300 },
        ]),
    },

    // ─── Outro ───
    {
        icon: CheckCircle2, color: '#22c55e',
        title: 'Vous êtes prêt — bon dépannage !',
        whatFor: 'Vous avez vu chaque fonctionnalité de votre interface — 10 outils au total.',
        howTo: 'Astuce : utilisez la dictée vocale (micro orange) partout — vous gagnez 30 sec par rapport écrit. Cliquez sur votre avatar en haut à droite pour rejouer ce tour.',
        helps: 'Chaque intervention bien tracée alimente l\'IA prédictive. Plus vous remontez de données, plus elle devient utile.',
        align: 'Vous êtes le point central — entre l\'admin qui pilote et l\'opérateur qui alerte, c\'est vous qui résolvez.',
    },
];

const operatorSteps: Step[] = [
    {
        icon: Sparkles, color: '#10b981',
        title: 'مرحباً بك في سمارت مينت',
        whatFor: 'هذا التطبيق يساعدك على الإبلاغ عن الأعطال والمشاكل بسرعة وتتبّع إنتاجك اليومي.',
        howTo: 'سأشير إلى كل زر مهمّ. اضغط « التالي » للمتابعة.',
        helps: 'لن تحتاج إلى أوراق ولا مكالمات هاتفية — كلّ شيء بضغطة زر.',
        align: 'الفنّي يستلم بلاغك مباشرة، والمدير يرى الصورة الكاملة.',
    },
    {
        icon: AlertTriangle, color: '#dc2626',
        title: 'الزر الأحمر — الإبلاغ عن عطل',
        selector: '[data-tour="op-panic"]',
        whatFor: 'الزر الأحمر الكبير. للإبلاغ عن أي عطل في الآلة.',
        howTo: 'اضغطه → اختر الآلة → اختر نوع المشكلة (تسرّب، ضوضاء…) → أضف صورة → أرسل.',
        helps: 'يستغرق 15 ثانية بدلاً من ساعة بحث عن الفنّي. أنت تستأنف عملك مباشرة.',
        align: 'الفنّي المختصّ يستلم البلاغ على جهازه فوراً. المدير يرى إحصاءات الأعطال.',
        demo: [
            { type: 'move', selector: '[data-tour="op-panic"]', wait: 400 },
            { type: 'caption', text: 'الزر الأحمر الكبير — لا يمكن تفويته. سأضغطه الآن لأريك الخطوات الثلاث كاملة.', ms: 3000 },
            { type: 'click', selector: '[data-tour="op-panic"]', pulse: true, wait: 400 },
            { type: 'navigate', route: '/operator/report-breakdown', wait: 1200 },

            // ─── Step 1: Choose machine ───
            { type: 'move', selector: '[data-tour="panic-step-1"]', wait: 500 },
            { type: 'caption', text: 'الخطوة 1 : اختر الآلة المعطّلة. كلّ آلة في الورشة معروضة هنا.', ms: 3200 },
            { type: 'move', selector: '[data-tour="panic-step-1"] button:first-of-type', wait: 350 },
            { type: 'caption', text: 'الزرّ الأخضر في الأعلى يفتح ماسح QR — امسح الملصق المثبَّت على الآلة.', ms: 3400 },
            { type: 'move', selector: '[data-tour="panic-step-1"] > div > button:first-of-type', wait: 400 },
            { type: 'caption', text: 'أو اختر آلة من الشبكة. سأضغط الأولى لأنتقل تلقائياً للخطوة التالية.', ms: 3400 },
            { type: 'click', selector: '[data-tour="panic-step-1"] > div > button:first-of-type', pulse: true, wait: 900 },

            // ─── Step 2: Symptoms + media ───
            { type: 'move', selector: '[data-tour="panic-step-2"]', wait: 500 },
            { type: 'caption', text: 'الخطوة 2 : أعراض العطل. اختر كلّ ما تلاحظه — تسرّب، ضوضاء، حرارة، كهرباء…', ms: 3500 },
            { type: 'move', selector: '[data-tour="panic-step-2"] button:first-of-type', wait: 350 },
            { type: 'caption', text: 'اضغط على بطاقة العَرَض لاختياره. يمكن اختيار عدّة أعراض في نفس البلاغ.', ms: 3400 },
            { type: 'click', selector: '[data-tour="panic-step-2"] button:first-of-type', pulse: true, wait: 700 },
            { type: 'move', selector: '[data-tour="panic-step-2"] button:nth-of-type(3)', wait: 400 },
            { type: 'caption', text: 'إضافة عَرَض ثانٍ لإعطاء صورة أوضح.', ms: 2800 },
            { type: 'click', selector: '[data-tour="panic-step-2"] button:nth-of-type(3)', pulse: true, wait: 700 },
            // Move down to media section
            { type: 'move', selector: '[data-tour="panic-media-actions"]', wait: 400 },
            { type: 'caption', text: 'تحت الأعراض : زرّان كبيران « التقاط صورة » و « تسجيل فيديو ». اختياري لكنّه يساعد الفنّي كثيراً.', ms: 3800 },
            { type: 'move', selector: '[data-tour="panic-media-actions"] button:first-of-type', wait: 350 },
            { type: 'caption', text: 'الزرّ الأوّل « التقاط صورة » : افتح الكاميرا والتقط الجزء المعطّل.', ms: 3200 },
            { type: 'move', selector: '[data-tour="panic-media-actions"] button:last-of-type', wait: 350 },
            { type: 'caption', text: 'الزرّ الثاني « تسجيل فيديو » : للأعطال التي تحتاج صوت أو حركة لشرحها.', ms: 3500 },
            // Click Next
            { type: 'move', selector: '[data-tour="panic-next"]', wait: 400 },
            { type: 'caption', text: 'الزرّ الأخضر الكبير « التالي » للانتقال إلى الخطوة الأخيرة.', ms: 3000 },
            { type: 'click', selector: '[data-tour="panic-next"]', pulse: true, wait: 900 },

            // ─── Step 3: Impact + Confirm ───
            { type: 'move', selector: '[data-tour="panic-step-3"]', wait: 500 },
            { type: 'caption', text: 'الخطوة 3 : ما هو تأثير العطل ؟ توقّف الإنتاج، خطر سلامة، تأثير الجودة، تأخير…', ms: 3700 },
            { type: 'move', selector: '[data-tour="panic-step-3"] button:first-of-type', wait: 350 },
            { type: 'click', selector: '[data-tour="panic-step-3"] button:first-of-type', pulse: true, wait: 700 },
            // Show summary card
            { type: 'move', selector: '[data-tour="panic-step-3"] > div:nth-of-type(2)', wait: 400 },
            { type: 'caption', text: 'في الأسفل : ملخّص البلاغ — الآلة، عدد الأعراض، الصور، الفيديو. تحقّق منه قبل الإرسال.', ms: 3700 },
            { type: 'move', selector: '[data-tour="panic-submit"]', wait: 400 },
            { type: 'caption', text: 'الزرّ الأحمر « تأكيد التنبيه » يرسل البلاغ. لن أضغطه في العرض — فقط للتوضيح.', ms: 3800 },
            // pretend-click: pulses but doesn't fire (we don't want to create a real DB row)
            { type: 'pretend-click', selector: '[data-tour="panic-submit"]', wait: 800 },

            // Back to dashboard so subsequent steps work
            { type: 'navigate', route: '/operator/dashboard', wait: 1100 },
            { type: 'move', selector: '[data-tour="op-panic"]', wait: 400 },
            { type: 'caption', text: 'بمجرد الإرسال، البلاغ يصل فوراً للفنّي مع كلّ التفاصيل — والمدير يراه في لوحة الإحصاءات.', ms: 3700 },
        ],
    },
    {
        icon: ScanLine, color: '#8b5cf6',
        title: 'الإبلاغ عن عيب في الجودة',
        selector: '[data-tour="op-quality"]',
        whatFor: 'الزر البنفسجي للإبلاغ عن منتج به عيب — شكل غريب، لون غير صحيح، تسرّب من القارورة، تلف الغلاف، خطأ ملصق.',
        howTo: 'اضغط الزر البنفسجي → اختر نوع العيب → التقط صورة المنتج → أضف ملاحظة وصفية → أرسل.',
        helps: 'يحمي صحّة المستهلك ويتجنّب شكاوى لاحقة. كلّ إبلاغ يُربط تلقائياً بدفعة الإنتاج الحالية.',
        align: 'مسؤول الجودة والمدير يستلمان البلاغ مع الصورة فوراً — يمكن إيقاف الدفعة قبل توزيعها.',
        demo: [
            { type: 'move', selector: '[data-tour="op-quality"]', wait: 400 },
            { type: 'caption', text: 'الزر البنفسجي « الإبلاغ عن عيب جودة » — موجود تحت الزر الأحمر مباشرة.', ms: 3300 },
            { type: 'click', selector: '[data-tour="op-quality"]', pulse: true, wait: 900 },
            { type: 'move', selector: '[data-tour="modal-body"]', wait: 500 },
            { type: 'caption', text: 'النموذج يفتح في وسط الشاشة. كلّ شيء بضغطات كبيرة — مصمَّم للأصابع مع القفّازات.', ms: 3700 },
            { type: 'caption', text: 'القائمة في الأعلى : أنواع العيوب — شكل، لون، تسرّب، ملصق، أخرى.', ms: 3300 },
            { type: 'caption', text: 'تحتها زرّ « التقاط صورة » : يفتح الكاميرا فوراً لتصوير المنتج المعيوب.', ms: 3400 },
            { type: 'caption', text: 'حقل الملاحظة في الأسفل : اكتب وصفاً قصيراً (مكان العيب، عدد الوحدات…). يدعم الإملاء الصوتي بالعربية.', ms: 3900 },
            { type: 'move', selector: '[data-tour="modal-footer"] button:last-child', wait: 400 },
            { type: 'caption', text: 'الزرّ البنفسجي في الأسفل يرسل البلاغ مع الصورة مباشرة إلى مسؤول الجودة.', ms: 3500 },
            // Two-step close — first the X, then a CustomEvent so the parent
            // component definitely dismisses the modal even if the click race
            // with React's setState is unlucky.
            { type: 'click', selector: '[data-tour="modal-close"]', pulse: true, wait: 900 },
            { type: 'event', eventName: 'smartmaint-demo-close-quality-modal', wait: 500 },
            { type: 'caption', text: 'بعد الإرسال : الدفعة الحالية تُعلَّم بـ « نوعية مشبوهة » — لا يمكن إغلاقها قبل قرار المسؤول.', ms: 4000 },
        ],
    },
    {
        icon: Megaphone, color: '#d97706',
        title: 'تعليمة اليوم',
        selector: '[data-tour="op-directive"]',
        whatFor: 'إذا أصدر المدير تعليمة جديدة، تظهر شريحة صفراء كبيرة هنا قبل أيّ شيء آخر.',
        howTo: 'اقرأ التعليمة بعناية، ثمّ اضغط « أؤكّد قراءة هذه التعليمة » لإثبات أنّك اطّلعت عليها.',
        helps: 'لا أحد يبدأ شيفته بمعلومة قديمة — اليوم زيت بكر فقط، أو طارئ خاص، أو خطوة جديدة.',
        align: 'المدير ينشر التعليمة من جهازه ويرى من قرأها ومن لم يقرأها بعد.',
        demo: [
            {
                type: 'mock',
                container: 'main',
                html: `
                    <div data-tour="op-directive" style="margin-bottom:20px;padding:20px 22px;border-radius:18px;background:linear-gradient(135deg,#fffbeb,#fef3c7);border:2px solid #f59e0b;box-shadow:0 8px 24px rgba(245,158,11,0.18);font-family:inherit">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;color:#92400e">
                            <span style="font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase">مثال — توضيح</span>
                        </div>
                        <div style="font-weight:800;font-size:16px;color:#92400e;margin-bottom:6px">تعليمة اليوم — زيت بكر ممتاز فقط</div>
                        <div style="font-size:13.5px;color:#78350f;line-height:1.5;margin-bottom:12px">اليوم خط REM-001 ينتج حصراً زيت زيتون بكر ممتاز 1 ل. تحقّق من الملصقات قبل التشغيل.</div>
                        <button style="width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#d97706,#b45309);color:white;font-weight:800;font-size:14.5px;font-family:inherit">أؤكّد قراءة هذه التعليمة</button>
                    </div>
                `,
            },
            { type: 'move', selector: '[data-tour="op-directive"]', wait: 400 },
            { type: 'caption', text: 'الشريحة الصفراء الكبيرة — تعليمة المدير لليوم. تظهر قبل أيّ شيء آخر على لوحتك.', ms: 3700 },
            { type: 'move', selector: '[data-tour="op-directive"] div:nth-of-type(2)', wait: 350 },
            { type: 'caption', text: 'العنوان في الأعلى ملخّص بكلمات قليلة — اقرأه بعناية قبل بدء الشيفة.', ms: 3400 },
            { type: 'move', selector: '[data-tour="op-directive"] div:nth-of-type(3)', wait: 350 },
            { type: 'caption', text: 'تحت العنوان : النصّ الكامل للتعليمة — كلّ التفاصيل التي تحتاجها لتنفيذها.', ms: 3500 },
            { type: 'move', selector: '[data-tour="op-directive"] button', wait: 400 },
            { type: 'caption', text: 'الزرّ البرتقالي السفلي : « أؤكّد قراءة هذه التعليمة » — اضغطه بعد القراءة فقط.', ms: 3700 },
            { type: 'pretend-click', selector: '[data-tour="op-directive"] button', wait: 900 },
            { type: 'caption', text: 'بعد التأكيد : الشريحة تختفي من لوحتك. اسمك يضاف لقائمة من قرأها في تطبيق المدير.', ms: 3700 },
            { type: 'caption', text: 'مهمّ : التأكيد إجباري ومسجّل في سجلّ التدقيق — لإثبات اطّلاعك على التعليمة لأغراض ISO و HACCP.', ms: 4000 },
        ],
    },
    {
        icon: ShieldAlert, color: '#f97316',
        title: 'EPI / مستلزمات ناقصة',
        selector: '[data-tour="op-consumable"]',
        whatFor: 'الزر البرتقالي المخصّص لطلب معدّات الحماية الشخصية والمستهلكات : خوذة مكسورة، نفاد القفّازات، كمّامات، سدّادات أذن، منظّفات، إلخ. لا تنتظر — بلّغ فور ما تلاحظ النقص.',
        howTo: 'اضغطه → اختر الفئة (EPI / مستهلكات / أخرى) → اكتب اسم العنصر بدقّة → اضبط الكمّية → علّم « عاجل » إن كان يوقف العمل الآن → اضغط « إرسال الطلب ». تسمع صافرة صغيرة وترى الطلب اختفى — يصل مباشرة للمدير.',
        helps: 'لا تعمل أبداً بدون معدّات حماية سليمة. الطلب يصل بسرعة، والمدير يعالجه مع المورّد في نفس اليوم إن كان عاجلاً. سجلّ HACCP كذلك يعرف أنّك بلّغت، ما يحميك في التدقيق.',
        align: 'المدير يرى الطلب في شاشة « طلبات المشغّلين » مع رقمك واسم الفئة والعاجلية. المورّد يستلم أمر الشراء إن كانت الكمّية غير متوفّرة في المستودع. أنت لا تترك مكانك في خطّ الإنتاج.',
        demo: [
            // ── 1. Point out the button ──
            { type: 'move', selector: '[data-tour="op-consumable"]', wait: 400 },
            { type: 'caption', text: 'الزر البرتقالي « EPI / مستلزمات ناقصة » — الطريق الأسرع لطلب معدّات حماية أو مستهلكات نفدت.', ms: 3800 },
            { type: 'caption', text: 'مهمّ : لا تعمل أبداً بمعدّات حماية ناقصة أو مكسورة. بلّغ فوراً — الأمان أوّلاً.', ms: 3800 },

            // ── 2. Open the form ──
            { type: 'click', selector: '[data-tour="op-consumable"]', pulse: true, wait: 900 },
            { type: 'move', selector: '[data-tour="op-consumable-form"]', wait: 500 },
            { type: 'caption', text: 'النموذج يفتح أسفل الزر مباشرة — لا حاجة للذهاب لشاشة أخرى. كلّ شيء يتمّ في مكانه.', ms: 4200 },
            { type: 'move', selector: '[data-tour="op-consumable-form"] > div:nth-of-type(1)', wait: 350 },
            { type: 'caption', text: 'العنوان في الأعلى : « الإبلاغ عن عنصر ناقص أو مكسور » — نفس النموذج لكلا الحالتين.', ms: 3800 },

            // ── 3. Category buttons — walk through all three ──
            { type: 'move', selector: '[data-tour="op-consumable-form"] > div:nth-of-type(2)', wait: 400 },
            { type: 'caption', text: 'أوّلاً : اختر الفئة الصحيحة. ثلاثة أزرار برتقالية.', ms: 3400 },
            { type: 'move', selector: '[data-tour="op-consumable-form"] > div:nth-of-type(2) button:nth-of-type(1)', wait: 350 },
            { type: 'caption', text: '🛡️ EPI = معدّات الحماية الشخصية : خوذة، قفّازات، كمّامات، سدّادات أذن، بدلة عمل، أحذية أمان.', ms: 5000 },
            { type: 'move', selector: '[data-tour="op-consumable-form"] > div:nth-of-type(2) button:nth-of-type(2)', wait: 350 },
            { type: 'caption', text: '🧴 مستهلكات = مواد يومية تنفد بسرعة : زيوت، منظّفات، خرق، أشرطة، محاليل معايرة.', ms: 4700 },
            { type: 'move', selector: '[data-tour="op-consumable-form"] > div:nth-of-type(2) button:nth-of-type(3)', wait: 350 },
            { type: 'caption', text: '📦 أخرى = أيّ عنصر لا يدخل في التصنيفين — لا تتردّد، بلّغ حتى لو ما عرفت الفئة.', ms: 4200 },
            { type: 'move', selector: '[data-tour="op-consumable-form"] > div:nth-of-type(2) button:nth-of-type(1)', wait: 350 },
            { type: 'caption', text: 'للمثال : نحن سنطلب قفّازات — نبقى على « 🛡️ EPI ». الزرّ المحدّد يصير بخلفية برتقالية فاتحة.', ms: 4200 },

            // ── 4. Item name field — clarity matters ──
            { type: 'move', selector: '[data-tour="op-consumable-form"] input.input', wait: 400 },
            { type: 'caption', text: 'خانة اسم العنصر : اكتب بدقّة قدر الإمكان. كلّما كنت أدقّ، كلّما وصلك العنصر الصحيح أسرع.', ms: 5000 },
            { type: 'caption', text: 'مثال جيّد : « قفّازات نتريل مقاس M » — سيّئ : « قفّازات ». الحجم واللون والصنف تفرق كثيراً.', ms: 5000 },
            { type: 'type', selector: '[data-tour="op-consumable-form"] input.input', value: 'قفّازات نتريل — مقاس M', wait: 500 },
            { type: 'caption', text: 'رأيت ؟ كتبت « قفّازات نتريل — مقاس M » — واضح تماماً للمدير والمورّد.', ms: 3800 },

            // ── 5. Quantity controls ──
            { type: 'move', selector: '[data-tour="op-consumable-form"] > div:nth-of-type(4)', wait: 350 },
            { type: 'caption', text: 'الكمّية : ابدأ من 1، واضغط + لزيادة العدد. اطلب ما تحتاجه فعلاً حتى تكفي الأسبوع أو الشيفتين.', ms: 5000 },
            { type: 'move', selector: '[data-tour="op-consumable-form"] > div:nth-of-type(4) button:nth-of-type(2)', wait: 350 },
            { type: 'pretend-click', selector: '[data-tour="op-consumable-form"] button:nth-of-type(5)', wait: 600 },
            { type: 'caption', text: 'زر + لزيادة الكمّية. اضغط - إن أخطأت وأردت الإنقاص.', ms: 3400 },

            // ── 6. Urgent checkbox — critical for safety ──
            { type: 'move', selector: '[data-tour="op-consumable-form"] > div:nth-of-type(4) label', wait: 400 },
            { type: 'caption', text: 'خانة « عاجل » المهمّة جدّاً — علّمها فقط إن كان النقص يوقف العمل الآن أو يعرّضك للخطر.', ms: 5000 },
            { type: 'caption', text: 'مثال يستحقّ العاجل : كمّامات نفدت والغبار كثيف / سدّادات أذن نفدت والضجيج > 85 dB / خوذة مكسورة.', ms: 5500 },
            { type: 'caption', text: 'مثال لا يستحقّ العاجل : مخزون آخر أسبوع من القفّازات — بلّغه عادياً. « عاجل » للطوارئ الحقيقيّة فقط.', ms: 5500 },

            // ── 7. Send button ──
            { type: 'move', selector: '[data-tour="op-consumable-form"] button:last-of-type', wait: 400 },
            { type: 'caption', text: 'الزر البرتقالي الكبير « إرسال الطلب » — بعد التأكّد من كلّ الحقول، اضغطه.', ms: 3800 },
            { type: 'pretend-click', selector: '[data-tour="op-consumable-form"] button:last-of-type', wait: 900 },
            { type: 'caption', text: 'يظهر إشعار أخضر صغير في الأعلى : « تمّ إرسال الطلب ». النموذج ينغلق تلقائياً.', ms: 4200 },

            // Close the form so subsequent tour steps work cleanly
            { type: 'click', selector: '[data-tour="op-consumable"]', pulse: false, wait: 600 },

            // ── 8. What happens next — admin flow ──
            { type: 'caption', text: 'ماذا بعد ؟ المدير يستلم الطلب فوراً في شاشة « طلبات المشغّلين » — يرى اسمك، الفئة، والعاجلية.', ms: 5500 },
            { type: 'caption', text: 'إن كان في المستودع : يوصلك المشرف العنصر خلال دقائق. إن نفد : أمر شراء يذهب للمورّد تلقائياً.', ms: 5500 },
            { type: 'caption', text: 'لا تعيد الطلب إن لم يصلك بعد ساعة — يظهر عندك في « طلباتي » مع الحالة (قيد المعالجة / تمّ / مرفوض).', ms: 5500 },
            { type: 'caption', text: 'كلّ طلب مسجّل في سجلّ HACCP والتدقيق — دليل مكتوب أنّك بلّغت في الوقت المناسب. الأمان مسؤوليّتك، والدعم مسؤوليّتنا.', ms: 6000 },
        ],
    },
    {
        icon: Target, color: '#10b981',
        title: 'دفعة الإنتاج الحالية',
        selector: '[data-tour="op-batch"]',
        whatFor: 'البطاقة الخضراء — تعرض دفعتك الجارية والكمّية المنتَجة مقابل الهدف.',
        howTo: 'اضغط +1 أو +10 كلّما خرجت قارورة. شريط التقدّم يخبرك بنسبة الإنجاز %.',
        helps: 'تعرف فوراً إن كنت متقدّماً أو متأخّراً عن هدف الشيفة. لا داعي لورقة عدّ.',
        align: 'المدير يرى الدفعة وتقدّمها مباشرة. الفنّي يعرف ما يُنتَج إن وقع عطل.',
        demo: [
            // Inject a fake active batch card if the operator hasn't started one yet
            {
                type: 'mock',
                container: 'main',
                html: `
                    <div data-tour="op-batch" style="margin-top:18px;padding:18px;border-radius:18px;background:linear-gradient(135deg,#f0fdf4,#d1fae5);border:1px solid #6ee7b7;font-family:inherit;color:#065f46">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                            <span style="font-size:11px;font-weight:800;letter-spacing:0.06em;color:#047857;text-transform:uppercase">مثال — توضيح</span>
                        </div>
                        <div style="font-weight:800;font-size:15px">دفعة LOT-2026-EX-A</div>
                        <div style="font-size:13px;opacity:0.85;margin:4px 0 12px">زيت زيتون بكر ممتاز 1 ل</div>
                        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px">
                            <span style="font-size:40px;font-weight:800;color:#047857;line-height:1">240</span>
                            <span style="font-size:14px;color:#065f46;opacity:0.7">/ 800</span>
                            <span style="margin-inline-start:auto;font-size:13px;font-weight:800;color:#047857">30 %</span>
                        </div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap">
                            <button style="padding:12px 14px;border-radius:12px;border:none;background:linear-gradient(135deg,#10b981,#047857);color:white;font-weight:700;font-size:14px;font-family:inherit">+1</button>
                            <button style="padding:12px 14px;border-radius:12px;border:none;background:linear-gradient(135deg,#10b981,#047857);color:white;font-weight:700;font-size:14px;font-family:inherit">+10</button>
                            <button data-tour="op-batch-photo" style="padding:12px 14px;border-radius:12px;border:none;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:white;font-weight:700;font-size:14px;font-family:inherit">📸 صورة جودة</button>
                        </div>
                    </div>
                `,
            },
            { type: 'move', selector: '[data-tour="op-batch"]', wait: 400 },
            { type: 'caption', text: 'البطاقة الخضراء الكبيرة = دفعة الإنتاج التي تعمل عليها الآن.', ms: 3300 },
            { type: 'move', selector: '[data-tour="op-batch"] span:first-of-type', wait: 350 },
            { type: 'caption', text: 'في الأعلى : رقم الدفعة LOT-… واسم المنتج (مثلاً زيت زيتون بكر ممتاز 1 ل).', ms: 3700 },
            { type: 'move', selector: '[data-tour="op-batch"] > div:nth-of-type(3) span:first-of-type', wait: 350 },
            { type: 'caption', text: 'الرقم الكبير الأخضر = الكمّية المنتَجة حتى الآن. على يمينه الهدف الإجمالي للدفعة.', ms: 3700 },
            { type: 'move', selector: '[data-tour="op-batch"] > div:nth-of-type(3) span:last-of-type', wait: 350 },
            { type: 'caption', text: 'النسبة المئوية على اليسار = تقدّمك مقارنة بالهدف. 100 % = الدفعة جاهزة للإغلاق.', ms: 3700 },
            { type: 'move', selector: '[data-tour="op-batch"] button:nth-of-type(1)', wait: 350 },
            { type: 'caption', text: 'زرّ +1 — كلّما خرجت قارورة واحدة، اضغطه. أبسط طريقة للعدّ.', ms: 3300 },
            { type: 'pretend-click', selector: '[data-tour="op-batch"] button:nth-of-type(1)', wait: 700 },
            { type: 'move', selector: '[data-tour="op-batch"] button:nth-of-type(2)', wait: 350 },
            { type: 'caption', text: 'زرّ +10 — لما تنتج عشر قوارير دفعة واحدة (كرتون مثلاً)، اضغطه لتوفير الوقت.', ms: 3700 },
            { type: 'pretend-click', selector: '[data-tour="op-batch"] button:nth-of-type(2)', wait: 700 },
            { type: 'move', selector: '[data-tour="op-batch-photo"]', wait: 350 },
            { type: 'caption', text: 'زرّ « صورة جودة » البنفسجي — لالتقاط عيّنة عشوائية أثناء الإنتاج. مطلوب في HACCP.', ms: 3700 },
            { type: 'caption', text: 'كلّ التغييرات تظهر فوراً عند المدير — يعرف بالضبط أين أنت في الدفعة.', ms: 3700 },
        ],
    },
    {
        icon: Camera, color: '#8b5cf6',
        title: 'صورة الجودة',
        selector: '[data-tour="op-batch-photo"]',
        whatFor: 'الزر البنفسجي داخل بطاقة الدفعة. لالتقاط صورة عيّنة عشوائية أثناء الإنتاج.',
        howTo: 'اضغط الزر → التقط صورة قارورة/غلاف/علامة → تُحفَظ تلقائياً. اضغط × على الصورة لحذفها إن أخطأت.',
        helps: 'دليل بصري لكلّ دفعة — قيمة كبيرة في حالة شكوى من زبون.',
        align: 'مطلوب في نظام HACCP. مسؤول الجودة والمدير يستطيعان الرجوع إليها.',
        demo: [
            // Reuse the same mock batch card so the photo button is reachable.
            {
                type: 'mock',
                container: 'main',
                html: `
                    <div data-tour="op-batch" style="margin-top:18px;padding:18px;border-radius:18px;background:linear-gradient(135deg,#f0fdf4,#d1fae5);border:1px solid #6ee7b7;font-family:inherit;color:#065f46">
                        <div style="font-size:11px;font-weight:800;letter-spacing:0.06em;color:#047857;text-transform:uppercase;margin-bottom:6px">مثال — توضيح</div>
                        <div style="font-weight:800;font-size:15px">دفعة LOT-2026-EX-A</div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
                            <button data-tour="op-batch-photo" style="padding:14px 18px;border-radius:12px;border:none;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:white;font-weight:700;font-size:15px;font-family:inherit">📸 صورة جودة</button>
                        </div>
                        <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
                            <div style="width:60px;height:60px;border-radius:10px;background:#ddd6fe;border:2px solid #a78bfa;display:flex;align-items:center;justify-content:center;color:#6d28d9;font-size:22px;position:relative">📷<span style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;background:#ef4444;color:white;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center">×</span></div>
                            <div style="width:60px;height:60px;border-radius:10px;background:#ddd6fe;border:2px solid #a78bfa;display:flex;align-items:center;justify-content:center;color:#6d28d9;font-size:22px">📷</div>
                        </div>
                    </div>
                `,
            },
            { type: 'move', selector: '[data-tour="op-batch-photo"]', wait: 400 },
            { type: 'caption', text: 'الزرّ البنفسجي داخل بطاقة الدفعة الخضراء « صورة جودة ».', ms: 3000 },
            { type: 'caption', text: 'اضغطه → الكاميرا تفتح فوراً → التقط صورة قارورة، غلاف، أو ملصق.', ms: 3500 },
            { type: 'pretend-click', selector: '[data-tour="op-batch-photo"]', wait: 800 },
            { type: 'caption', text: 'الصورة تُحفَظ تلقائياً مع رقم الدفعة والوقت — لا حاجة لتسميتها.', ms: 3500 },
            { type: 'move', selector: '[data-tour="op-batch"] > div:last-child', wait: 400 },
            { type: 'caption', text: 'الصور المحفوظة تظهر مباشرة في الأسفل — مصغّرات صغيرة بإطار بنفسجي.', ms: 3500 },
            { type: 'move', selector: '[data-tour="op-batch"] > div:last-child > div:first-child', wait: 350 },
            { type: 'caption', text: 'الزرّ الأحمر × في أعلى كلّ صورة لحذفها فوراً إذا التقطتها بالخطأ.', ms: 3500 },
            { type: 'caption', text: 'مطلوب في HACCP : عيّنة بصرية كلّ ساعة على الأقل. مسؤول الجودة والمدير يستطيعان الرجوع إليها لاحقاً.', ms: 4000 },
        ],
    },
    {
        icon: Package, color: '#06b6d4',
        title: 'دفعات الإنتاج',
        selector: '[data-tour="nav-batches"]',
        whatFor: 'الرابط في القائمة الجانبية يفتح صفحة « دفعات الإنتاج » — لبدء دفعة جديدة أو مراجعة سجلّ دفعاتك السابقة.',
        howTo: 'اضغط الرابط → الزرّ الأخضر الكبير « بدء دفعة جديدة » → أدخل رقم الدفعة، المنتج، الكمّية المستهدفة → ابدأ.',
        helps: 'تتبّع كامل لكلّ قارورة من المادّة الخام إلى الزبون — مطلب أساسي في الصناعة الغذائية ونظام HACCP.',
        align: 'تظهر الدفعة فوراً للمدير والفنّي. الفنّي يعرف ما يُنتَج إن وقع عطل ليعطي الأولوية للإصلاح.',
        demo: [
            { type: 'move', selector: '[data-tour="nav-batches"]', wait: 400 },
            { type: 'caption', text: 'الرابط « دفعات الإنتاج » في القائمة الجانبية على اليسار.', ms: 3000 },
            { type: 'caption', text: 'الصفحة تعرض : دفعات جارية في الأعلى، سجلّ كامل في الأسفل.', ms: 3300 },
            { type: 'caption', text: 'الزرّ الأخضر الكبير « بدء دفعة جديدة » يفتح نموذج بسيط : رقم الدفعة، المنتج، الكمّية المستهدفة، الآلة.', ms: 4000 },
            { type: 'caption', text: 'بمجرد البدء، تظهر بطاقة خضراء في لوحتك (التي رأيناها في الخطوة السابقة) لتسجيل كلّ قارورة.', ms: 4000 },
            { type: 'caption', text: 'في نهاية الشيفة : افتح الدفعة في هذه الصفحة → الزرّ الأحمر « إنهاء الدفعة » → تُغلَق وتُؤرشَف.', ms: 4000 },
        ],
    },
    {
        icon: CheckCircle2, color: '#16a34a',
        title: 'انتهيت — شكراً !',
        whatFor: 'هذه هي الأدوات الأساسية. لست بحاجة للقلق بشأن أيّ شيء آخر.',
        howTo: 'إذا نسيت كيف يعمل زرّ، اضغطه واستكشف — لا يمكنك إفساد شيء. اضغط على صورتك الشخصية في الأعلى لإعادة عرض هذا الدليل.',
        helps: 'كلّما استعملت التطبيق، كلّما توفّر وقتك وقلّت المشاكل. اعمل بأمان.',
        align: 'أنت في قلب الإنتاج. التطبيق يخدمك أنت قبل أيّ شخص آخر.',
    },
];

const stepsByRole: Record<UserRole, Step[]> = {
    admin: adminSteps,
    technician: technicianSteps,
    operator: operatorSteps,
};

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
interface Rect { top: number; left: number; width: number; height: number }

/** Poll until the element exists in the DOM (or give up after maxMs). */
function waitForElement(selector: string, maxMs = 1500): Promise<HTMLElement | null> {
    return new Promise(resolve => {
        const t0 = Date.now();
        const tick = () => {
            const el = document.querySelector(selector) as HTMLElement | null;
            if (el) { resolve(el); return; }
            if (Date.now() - t0 > maxMs) { resolve(null); return; }
            requestAnimationFrame(tick);
        };
        tick();
    });
}

/** Decide where to place the popover relative to the target rect. */
function placePopover(target: Rect, vw: number, vh: number, isRTL: boolean): {
    top: number; left: number; placement: 'bottom' | 'top' | 'right' | 'left' | 'center';
} {
    const margin = POPOVER_MARGIN;
    const w = POPOVER_WIDTH;
    const estH = 420; // estimated popover height — we'll clamp in CSS

    // Prefer right (or left in RTL) if there's room beside the target
    const sideX = isRTL ? target.left - w - margin : target.left + target.width + margin;
    const sideFits = isRTL ? sideX > margin : sideX + w < vw - margin;
    const sideY = Math.min(Math.max(margin, target.top - 20), vh - estH - margin);
    if (sideFits) {
        return { top: sideY, left: sideX, placement: isRTL ? 'left' : 'right' };
    }

    // Otherwise, prefer below
    const belowY = target.top + target.height + margin;
    if (belowY + estH < vh - margin) {
        const cx = Math.max(margin, Math.min(target.left + target.width / 2 - w / 2, vw - w - margin));
        return { top: belowY, left: cx, placement: 'bottom' };
    }

    // Otherwise above
    const aboveY = target.top - estH - margin;
    if (aboveY > margin) {
        const cx = Math.max(margin, Math.min(target.left + target.width / 2 - w / 2, vw - w - margin));
        return { top: aboveY, left: cx, placement: 'top' };
    }

    // Last resort: centered
    return { top: Math.max(margin, vh / 2 - estH / 2), left: vw / 2 - w / 2, placement: 'center' };
}

// ────────────────────────────────────────────────────────────
// Tour component
// ────────────────────────────────────────────────────────────
export default function TutorialTour() {
    const { user } = useAuth();
    const { locale } = useApp();
    const router = useRouter();
    const pathname = usePathname();

    const [open, setOpen] = useState(false);
    const [idx, setIdx] = useState(0);
    const [mounted, setMounted] = useState(false);
    const [targetRect, setTargetRect] = useState<Rect | null>(null);

    // ── Tutorial v2: ghost cursor + scripted demo state ────
    /** Where the animated cursor currently sits in viewport coords. */
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
    /** True for ~600 ms when the cursor "clicks" — drives the ripple animation. */
    const [cursorPulse, setCursorPulse] = useState(false);
    /** Short narration line shown during a scripted demo. */
    const [demoCaption, setDemoCaption] = useState<string | null>(null);
    /** True while a demo is in progress — disables Next so the user can't navigate away mid-demo. */
    const [demoRunning, setDemoRunning] = useState(false);
    const demoCancelRef = useRef(false);
    /** Monotonic generation counter. Every runDemo() call bumps this and
     *  keeps its own copy; once `demoGenRef.current > myGen`, that older
     *  demo knows it's been superseded and bails out of its loop. This
     *  prevents the bug where a new demo's `demoCancelRef = false` reset
     *  un-cancels an older demo that was mid-flight, leaving two demos
     *  fighting over the cursor / voice / caption at the same time. */
    const demoGenRef = useRef(0);
    /** One-shot "skip the current caption" signal. Set true by the floating
     *  Passer button to short-circuit the await on speech + min-display
     *  time and advance to the next demo action immediately. */
    const skipNowRef = useRef(false);
    /** When set to a non-null value, the running demo is cancelled and
     *  re-launched starting at that caption index. Used by the "back
     *  caption" button. */
    const jumpToCaptionRef = useRef<number | null>(null);
    /** Tracks the current auto-advance setTimeout so a manual nav click
     *  can clear it before scheduling its own navigation. Without this,
     *  the timeout fires after the click and the user "skips" a step. */
    const autoAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** Flips true on the first Étape ⏭ / ⏮ click. Auto-advance respects
     *  this and stops firing — once the user wants manual control over
     *  step navigation, give it to them. Reset only when the tour reopens. */
    const userNavigatedRef = useRef(false);
    /** Late-bound reference to `finish()` — the auto-advance effect above is
     *  declared before `finish` is defined, so it calls through this ref
     *  to auto-close the tour on the last step. */
    const finishRef = useRef<((markDone: boolean) => void) | null>(null);
    /** Live caption position within the running demo. Incremented every
     *  time the demo enters a caption action. Read by the back button to
     *  compute the target. */
    const currentCaptionIdxRef = useRef(0);
    /** Total number of captions in the current demo (read by the buttons
     *  to disable back/forward at the bounds). */
    const [captionTotal, setCaptionTotal] = useState(0);
    const [captionPos, setCaptionPos] = useState(0);
    /** Tracks if the current step's demo has already been played (used by auto-advance). */
    const [demoPlayed, setDemoPlayed] = useState(false);
    /** Pause state — when true, the demo loop holds at the next action
     *  boundary and the current voice is paused. Click Reprendre to resume. */
    const [paused, setPaused] = useState(false);
    const pausedRef = useRef(false);
    /** Inputs we typed into during this demo — cleared at demo end. */
    const typedInputsRef = useRef<Set<HTMLInputElement | HTMLTextAreaElement>>(new Set());

    useEffect(() => { setMounted(true); }, []);

    // Mirror paused state into a ref so the async demo loop can read the
    // latest value without re-creating the closure on each render.
    useEffect(() => { pausedRef.current = paused; }, [paused]);

    const togglePause = useCallback(() => {
        setPaused(p => {
            const next = !p;
            try {
                if (next) window.speechSynthesis?.pause();
                else window.speechSynthesis?.resume();
            } catch { /* ignore */ }
            return next;
        });
    }, []);

    // Sound is always on (no user-facing toggle). The module-level flag starts
    // at true; we just sync it once here in case any earlier code touched it.
    useEffect(() => { setSoundEnabled(true); }, []);

    // Lock the tutorial voice to the user's role language. admin/tech →
    // French, operator → Arabic. Without this, captions that happen to
    // be all-ASCII (like "MTTR moyen") could get mis-detected as English
    // and trigger an English voice mid-tour. Resets to null on unmount.
    useEffect(() => {
        if (!user) { setTutorialVoiceLang(null); return; }
        setTutorialVoiceLang(user.role === 'operator' ? 'ar' : 'fr');
        return () => setTutorialVoiceLang(null);
    }, [user]);

    // Open on first session for this user — and RESUME at the saved
    // step index if the user closed the tab mid-tour. Without this,
    // the tour restarts from step 0 every time they reopen the app.
    //
    // Keyed ONLY on supabaseId (the stable UUID). Supabase's token refresh
    // rebuilds the user object via sessionToUser(), giving it a new
    // reference each time. If the effect were keyed on the user object, a
    // token refresh would fire setIdx + setOpen mid-demo and race with the
    // demo loop (manifesting as a Plans-demo restart on navigate). The
    // supabaseId stays stable across refreshes, so the effect runs once
    // per user identity, never on refresh.
    const supabaseId = user?.supabaseId;
    useEffect(() => {
        if (!user) { setOpen(false); return; }
        if (hasFinishedTutorial(user.supabaseId)) return;
        let resumeIdx = 0;
        try {
            const saved = localStorage.getItem(`smartmaint-tutorial-progress-${user.supabaseId}`);
            if (saved) {
                const n = parseInt(saved, 10);
                if (Number.isInteger(n) && n > 0) resumeIdx = n;
            }
        } catch { /* ignore */ }
        setIdx(resumeIdx);
        const t = setTimeout(() => setOpen(true), 700);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [supabaseId]);

    // Persist the current step idx every time it changes (while the tour
    // is open) so a reload picks up where the user left off. Cleared in
    // finish() when the tour completes or is skipped. Keyed on supabaseId
    // for the same reason as the resume effect above.
    useEffect(() => {
        if (!open || !supabaseId) return;
        try {
            localStorage.setItem(`smartmaint-tutorial-progress-${supabaseId}`, String(idx));
        } catch { /* ignore */ }
    }, [idx, open, supabaseId]);

    // Replay trigger from Settings / UserProfile
    useEffect(() => {
        const handler = () => { setIdx(0); setOpen(true); };
        window.addEventListener('smartmaint-replay-tutorial', handler);
        return () => window.removeEventListener('smartmaint-replay-tutorial', handler);
    }, []);

    // Keyboard shortcuts — the popover is hidden during spotlight steps so
    // we expose its functions via keys: Esc = quit, ←  = prev, →  = next.
    // We IGNORE non-trusted (synthetic) key events because demos use
    // `dispatchEvent` to close SlideOvers / Modals via Escape — those
    // should NOT quit the entire tour.
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (!e.isTrusted) return;
            if (e.key === 'Escape') {
                // Same full cleanup as the Quitter button — kills the demo
                // loop, removes injected mocks, clears the cursor and TTS.
                demoCancelRef.current = true;
                demoGenRef.current++;
                setDemoRunning(false);
                setDemoCaption(null);
                setDemoPlayed(false);
                try { stopSpeaking(); } catch { /* ignore */ }
                try { window.speechSynthesis?.cancel?.(); } catch { /* ignore */ }
                if (typeof document !== 'undefined') {
                    document.querySelectorAll('[data-tutorial-mock]').forEach(el => el.remove());
                }
                setTargetRect(null);
                setCursorPos(null);
                setCursorPulse(false);
                setPaused(false);
                pausedRef.current = false;
                liveEl.current = null;
                setOpen(false);
                if (user) {
                    try { localStorage.setItem(storageKey(user.supabaseId), '1'); } catch { /* ignore */ }
                }
            } else if (e.key === 'ArrowRight') {
                setIdx(i => Math.min(i + 1, 999));
            } else if (e.key === 'ArrowLeft') {
                setIdx(i => Math.max(0, i - 1));
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, user]);

    const steps = useMemo(
        () => (user ? stepsByRole[user.role] : []),
        [user]);
    const step = steps[idx];

    // Keep the live element ref around so resize/scroll listeners can re-measure
    // without re-running the (async) wait-for-element pipeline.
    const liveEl = useRef<HTMLElement | null>(null);

    /** Read the element's viewport rect and stash it.
     *  Compensates for the page-zoom widget in Header.tsx, which sets
     *  `document.documentElement.style.zoom` (a non-standard CSS property
     *  that scales the whole document). In Chromium, getBoundingClientRect()
     *  returns the post-zoom rect, but our position:fixed overlay is itself
     *  inside the zoomed root and gets re-zoomed on top — leading to a
     *  double-zoom offset. We divide rect by zoom so the overlay's CSS-pixel
     *  values match the element's pre-zoom layout coords. */
    const readRect = useCallback(() => {
        const el = liveEl.current;
        if (!el || !document.contains(el)) { setTargetRect(null); return; }
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) { setTargetRect(null); return; }
        const zRaw = (document.documentElement.style as unknown as { zoom?: string }).zoom
            || getComputedStyle(document.documentElement).zoom
            || '1';
        const z = parseFloat(zRaw) || 1;
        const top = r.top / z;
        const left = r.left / z;
        const width = r.width / z;
        const height = r.height / z;
        setTargetRect(prev => {
            if (prev
                && Math.abs(prev.top - top) < 0.5
                && Math.abs(prev.left - left) < 0.5
                && Math.abs(prev.width - width) < 0.5
                && Math.abs(prev.height - height) < 0.5) return prev;
            return { top, left, width, height };
        });
    }, []);

    /** Acquire the target element for the current step + scroll into view +
     *  run a few stabilizing measurements over consecutive animation frames so
     *  we don't lock in an in-flight rect (framer-motion page transition,
     *  scroll animation, etc.). */
    const measure = useCallback(async () => {
        if (!step?.selector) { liveEl.current = null; setTargetRect(null); return; }
        const el = await waitForElement(step.selector);
        liveEl.current = el;
        if (!el) { setTargetRect(null); return; }

        // Instant scroll — `behavior: 'smooth'` was causing rect drift while the
        // animation was still in flight. Native instant scroll lands immediately.
        try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' }); }
        catch { el.scrollIntoView(); }

        // Initial read on next frame, then keep re-measuring for ~8 frames until
        // the rect stops changing. Catches: framer-motion page transition,
        // sidebar collapsing in/out, lazy data populating the page below.
        await new Promise(r => requestAnimationFrame(() => r(null)));
        readRect();
        for (let i = 0; i < 8; i++) {
            await new Promise(r => requestAnimationFrame(() => r(null)));
            readRect();
        }
    }, [step, readRect]);

    // On step change: navigate first if needed, then measure
    useEffect(() => {
        if (!open || !step) return;
        let cancelled = false;
        (async () => {
            if (step.route && step.route !== pathname) {
                router.push(step.route);
                // wait for the new page to mount + framer-motion transition to settle.
                // AppShell uses AnimatePresence mode="wait" with a spring transition —
                // the old page exits (~400 ms) before the new one mounts, so a short
                // wait under-fires and the spotlight lands on an empty page.
                await new Promise(r => setTimeout(r, 1000));
                if (cancelled) return;
            }
            await measure();
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, idx]);

    // Re-measure on scroll + resize so the spotlight follows whatever the user
    // does. Throttled with rAF so we don't thrash on every scroll event.
    useEffect(() => {
        if (!open) return;
        let scheduled = false;
        const onMove = () => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => { scheduled = false; readRect(); });
        };
        window.addEventListener('scroll', onMove, true);
        window.addEventListener('resize', onMove);
        return () => {
            window.removeEventListener('scroll', onMove, true);
            window.removeEventListener('resize', onMove);
        };
    }, [open, readRect]);

    // ── Position the ghost cursor on the target's center whenever the target
    //    rect updates. CSS transitions handle the smooth slide.
    useEffect(() => {
        if (!targetRect) { setCursorPos(null); return; }
        setCursorPos({
            x: targetRect.left + targetRect.width / 2,
            y: targetRect.top + targetRect.height / 2,
        });
    }, [targetRect]);

    // ── Cancel any in-flight demo when the step changes or tour closes.
    useEffect(() => {
        // Bump the generation so any currently-running runDemo() sees its
        // myGen !== demoGenRef.current and bails on the next loop check.
        // This is the load-bearing line for "Étape suivante" — without it,
        // the old demo keeps running concurrently with the new one.
        demoGenRef.current++;
        demoCancelRef.current = true;
        setDemoRunning(false);
        setDemoCaption(null);
        setDemoPlayed(false); // each new step gets a fresh "Voir la démo" label
        // Reset the paused state too. Without this, navigating to the next
        // feature while the demo is paused leaves the NEW demo immediately
        // sleeping inside its own pause loop — no caption ever sets, so the
        // toolbar buttons (which only render alongside the caption) never
        // appear and the user is stuck without a Reprendre.
        setPaused(false);
        pausedRef.current = false;
        try { window.speechSynthesis?.resume(); } catch { /* ignore */ }
        // Park the cursor + clear the glow ring at the top center so the
        // NEW step always starts from a known position. Without this,
        // after "Étape précédent" the cursor + glow stay frozen wherever
        // the previous demo left them until the new demo's first move.
        if (typeof window !== 'undefined') {
            setCursorPos({ x: window.innerWidth / 2, y: 90 });
        }
        setTargetRect(null);
        liveEl.current = null;
        stopSpeaking(); // also kill any in-flight TTS so it doesn't overlap the next step
        // Strip any tutorial-injected mock DOM nodes from the previous step.
        if (typeof document !== 'undefined') {
            document.querySelectorAll('[data-tutorial-mock]').forEach(el => el.remove());
        }
    }, [idx, open]);

    // ── Stop TTS entirely when the tour is closed or component unmounts.
    useEffect(() => {
        if (!open) stopSpeaking();
        return () => stopSpeaking();
    }, [open]);

    /** Build the full action sequence for a step.
     *  - Steps WITH a custom `demo`: play the demo as-is. Those demos are
     *    self-contained and walk every UI element with their own captions;
     *    adding whatFor/howTo/helps/align on top would repeat the same info.
     *  - Steps WITHOUT a demo: synthesize a narration-only sequence
     *    (whatFor → howTo → helps → align) so the voice still explains. */
    const narratedActions = useCallback((s: Step | undefined): DemoAction[] => {
        if (!s) return [];
        if (s.demo && s.demo.length > 0) return s.demo;
        const { intro, outro } = narrate(s);
        return [...intro, ...outro];
    }, []);

    // ── Auto-play: every step automatically narrates + runs its demo when the
    //    user lands on it. demoRunning / demoPlayed are in deps so the effect
    //    re-runs once the reset effect (on idx change) has flipped them to
    //    false — otherwise the closure here would still see the previous
    //    step's "done" values and bail.
    useEffect(() => {
        if (!open || !step || demoRunning || demoPlayed) return;
        const t = setTimeout(() => runDemo(narratedActions(step)), 1100);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, idx, demoRunning, demoPlayed]);

    // ── Auto-advance: when the demo for the current step finishes,
    //    automatically move to the next step. Disabled once the user has
    //    manually clicked any Étape ⏭ / ⏮ button (manual mode). Also
    //    records the timeout id in autoAdvanceTimeoutRef so a manual
    //    click can clear it explicitly.
    //    On the LAST step, instead of advancing, we auto-close the tour so
    //    the user doesn't have to click Quitter manually — bug flagged by
    //    the admin: "à la fin il faut cliquer Quitter à la main".
    useEffect(() => {
        if (!open || demoRunning || !demoPlayed) return;
        if (userNavigatedRef.current) return; // user took manual control
        const isLastStep = idx >= steps.length - 1;
        const t = setTimeout(() => {
            autoAdvanceTimeoutRef.current = null;
            if (isLastStep) {
                finishRef.current?.(true);
            } else {
                setIdx(i => Math.min(steps.length - 1, i + 1));
            }
        }, isLastStep ? 2500 : 1700);
        autoAdvanceTimeoutRef.current = t;
        return () => {
            clearTimeout(t);
            if (autoAdvanceTimeoutRef.current === t) autoAdvanceTimeoutRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, demoRunning, demoPlayed, idx]);

    // Reset manual-nav flag when the tour opens.
    useEffect(() => {
        if (open) userNavigatedRef.current = false;
    }, [open]);

    /** Move the ghost cursor to an element's centre and optionally pulse.
     *  Auto-scrolls the element into view first so it's never below the fold
     *  when the cursor arrives — keeps the simulation feeling continuous on
     *  long pages without the user having to scroll manually. */
    const moveCursorTo = useCallback(async (selector: string, pulse: boolean) => {
        // waitForElement (not just querySelector) so the cursor still lands
        // correctly when the demo crosses a route boundary — Next.js client
        // navigation can take longer than the previous step's auto-play
        // buffer, and a sync querySelector would miss and silently stall.
        // 4 s tolerance covers slow Windows installs where the new page mount
        // sits behind a DataContext "Chargement…" gate for ~2 s.
        const el = await waitForElement(selector, 4000);
        if (!el) return null;
        // 1. If the element is off-screen (above or below the viewport), smooth-scroll
        //    so it's roughly centred. Skip when it's already comfortably in view.
        const r0 = el.getBoundingClientRect();
        const vh = window.innerHeight;
        const offscreen = r0.bottom < 80 || r0.top > vh - 80;
        if (offscreen) {
            try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
            catch { el.scrollIntoView(); }
            // Long-distance smooth scrolls take 600-800 ms; the previous 380 ms
            // wait read the rect mid-scroll, the cursor landed at a stale
            // position, and the user perceived the cursor as "not dragging
            // down to follow". 750 ms lets the scroll fully settle.
            await sleep(750);
        }
        // 2. Measure the (now-visible) element and animate the cursor over.
        const r = el.getBoundingClientRect();
        const zRaw = (document.documentElement.style as unknown as { zoom?: string }).zoom
            || getComputedStyle(document.documentElement).zoom || '1';
        const z = parseFloat(zRaw) || 1;
        const x = (r.left + r.width / 2) / z;
        const y = (r.top + r.height / 2) / z;
        setCursorPos({ x, y });
        // 3. Move the glow / spotlight to follow the cursor. We rewrite
        //    liveEl + targetRect so the pulsing ring lands on whatever the
        //    demo is currently pointing at — not just the step's top-level
        //    anchor from when the step started. Scroll/resize listeners keep
        //    re-reading this element via liveEl.current.
        liveEl.current = el;
        setTargetRect({ top: r.top / z, left: r.left / z, width: r.width / z, height: r.height / z });
        // Wait for the cursor CSS transition (≈450 ms) before the pulse
        await sleep(480);
        if (pulse) {
            playTapSound();
            setCursorPulse(true);
            await sleep(550);
            setCursorPulse(false);
        }
        return el;
    }, []);

    /** Briefly highlight a real DOM element with a yellow flash so the
     *  click is visible even if the cursor flew past it quickly. */
    const flashElement = useCallback((el: HTMLElement) => {
        const prevOutline = el.style.outline;
        const prevOffset = el.style.outlineOffset;
        const prevTransition = el.style.transition;
        el.style.outline = '4px solid #fde047';
        el.style.outlineOffset = '4px';
        el.style.transition = 'outline 0.2s ease, outline-offset 0.2s ease';
        setTimeout(() => {
            el.style.outline = prevOutline;
            el.style.outlineOffset = prevOffset;
            el.style.transition = prevTransition;
        }, 700);
    }, []);

    /** Find the action index to restart from when jumping back to caption N.
     *  Walk back from the target caption past any preceding `move` actions
     *  so the cursor positions correctly, but stop at the first action with
     *  side effects (click, type, navigate, mock) — those should not re-run. */
    const findRestartIdxForCaption = useCallback((actions: DemoAction[], targetCaptionPos: number) => {
        let captionsSeen = 0;
        let captionActionIdx = -1;
        for (let i = 0; i < actions.length; i++) {
            if (actions[i].type === 'caption') {
                if (captionsSeen === targetCaptionPos) { captionActionIdx = i; break; }
                captionsSeen++;
            }
        }
        if (captionActionIdx < 0) return 0;
        // Walk back over `move`-only actions to get the cursor parked
        // correctly before re-narrating.
        let start = captionActionIdx;
        while (start > 0 && actions[start - 1].type === 'move') start--;
        return start;
    }, []);

    /** Run a scripted demo. Cancellable when the step changes. Uses a
     *  generation tag so that if a NEWER demo starts, this older one
     *  detects it (myGen !== demoGenRef.current) and exits cleanly
     *  without touching shared state or triggering more cursor/voice. */
    const runDemo = useCallback(async (actions: DemoAction[], startAt: number = 0) => {
        const myGen = ++demoGenRef.current;
        demoCancelRef.current = false;
        jumpToCaptionRef.current = null;
        setDemoRunning(true);

        // Count captions up to startAt so the live index resumes correctly.
        let captionCount = 0;
        for (let i = 0; i < startAt; i++) {
            if (actions[i].type === 'caption') captionCount++;
        }
        currentCaptionIdxRef.current = captionCount;
        const totalCaptions = actions.filter(a => a.type === 'caption').length;
        setCaptionTotal(totalCaptions);
        setCaptionPos(captionCount);

        // Force a visible starting motion: park the cursor at top-center of
        // the viewport BEFORE the first action runs, so the user always sees
        // it fly in to the first target. Skip the fly-in if we're resuming.
        if (startAt === 0) {
            setCursorPos({ x: window.innerWidth / 2, y: 90 });
            await sleep(520);
        }

        let completed = false;
        try {
            for (let actIdx = startAt; actIdx < actions.length; actIdx++) {
                const a = actions[actIdx];
                // Cancel signals: this demo is stale (newer one started),
                // step changed (external), OR user asked to jump to a
                // different caption. Any of them breaks the loop so we
                // don't run remaining actions.
                if (myGen !== demoGenRef.current) break;
                if (demoCancelRef.current) break;
                if (jumpToCaptionRef.current !== null) break;
                // Pause check — hold here while paused. Poll every 120 ms.
                while (pausedRef.current && myGen === demoGenRef.current && !demoCancelRef.current) {
                    await sleep(120);
                }
                if (myGen !== demoGenRef.current || demoCancelRef.current) break;
                if (a.type === 'click') {
                    const el = await moveCursorTo(a.selector, a.pulse !== false);
                    if (el && !demoCancelRef.current) {
                        flashElement(el);
                        el.click();
                    }
                    await sleep(a.wait ?? 400);
                } else if (a.type === 'pretend-click') {
                    // Cursor lands on the target, ripples, but no real click —
                    // safe for buttons that would create DB rows / navigate /
                    // submit forms. Used during demos of side-effect actions.
                    const el = await moveCursorTo(a.selector, true);
                    if (el && !demoCancelRef.current) flashElement(el);
                    await sleep(a.wait ?? 600);
                } else if (a.type === 'move') {
                    // For non-zero index, pick the Nth match instead of the first.
                    if (a.index && a.index > 0) {
                        const all = document.querySelectorAll(a.selector);
                        const el = all[a.index] as HTMLElement | undefined;
                        if (el) {
                            const r = el.getBoundingClientRect();
                            const offscreen = r.bottom < 80 || r.top > window.innerHeight - 80
                                || r.right < 80 || r.left > window.innerWidth - 80;
                            if (offscreen) {
                                try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { el.scrollIntoView(); }
                                await sleep(380);
                            }
                            const r2 = el.getBoundingClientRect();
                            const z = parseFloat((document.documentElement.style as unknown as { zoom?: string }).zoom || '1') || 1;
                            setCursorPos({ x: (r2.left + r2.width / 2) / z, y: (r2.top + r2.height / 2) / z });
                            // Glow follows
                            liveEl.current = el;
                            setTargetRect({ top: r2.top / z, left: r2.left / z, width: r2.width / z, height: r2.height / z });
                            await sleep(480);
                        }
                    } else {
                        await moveCursorTo(a.selector, false);
                    }
                    await sleep(a.wait ?? 200);
                } else if (a.type === 'type') {
                    // Wait briefly for at least one match — same rationale as
                    // moveCursorTo. Without this, typing into an input on a
                    // freshly-navigated page silently no-ops if we beat the
                    // mount.
                    await waitForElement(a.selector, 2000);
                    // Pick the indexed match for forms with multiple inputs sharing a selector.
                    const all = document.querySelectorAll(a.selector);
                    const el = (all[a.index ?? 0] || all[0]) as HTMLInputElement | HTMLTextAreaElement | undefined;
                    if (el) {
                        // Move the cursor onto the input first so the user sees where typing happens
                        const r = el.getBoundingClientRect();
                        const offscreen = r.bottom < 80 || r.top > window.innerHeight - 80
                            || r.right < 80 || r.left > window.innerWidth - 80;
                        if (offscreen) {
                            try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { el.scrollIntoView(); }
                            await sleep(380);
                        }
                        const r2 = el.getBoundingClientRect();
                        const z = parseFloat((document.documentElement.style as unknown as { zoom?: string }).zoom || '1') || 1;
                        setCursorPos({ x: (r2.left + r2.width / 2) / z, y: (r2.top + r2.height / 2) / z });
                        // Make the glow follow the cursor (same trick as moveCursorTo)
                        liveEl.current = el;
                        setTargetRect({ top: r2.top / z, left: r2.left / z, width: r2.width / z, height: r2.height / z });
                        await sleep(480);
                        el.focus();
                        // React-controlled inputs need a native setter + bubbled input event
                        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
                        // FIRST: clear whatever's already in the input so this
                        // `type` action FULLY replaces the previous content.
                        // Without this, typing '' was a no-op (zero loop
                        // iterations) and the user saw the old value stick.
                        desc?.set?.call(el, '');
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        // Type character-by-character with jittery delays for realism.
                        typedInputsRef.current.add(el);
                        // Resolve dynamic tokens. __TODAY__ → today's ISO date,
                        // so demos can drop a value into a <input type="date">
                        // without baking a stale literal into the static array.
                        const typedValue = a.value.replace(/__TODAY__/g, new Date().toISOString().slice(0, 10));
                        let current = '';
                        for (const ch of typedValue) {
                            if (demoCancelRef.current) break;
                            current += ch;
                            desc?.set?.call(el, current);
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            await sleep(38 + Math.random() * 35);
                        }
                        // Belt-and-braces: after the per-char loop, force a
                        // final whole-value write that React MUST notice.
                        //
                        // Long textareas + React 19 have a nasty failure
                        // mode where the per-char dispatched 'input' events
                        // race the synthetic-event tracker and the final
                        // form state ends up empty even though the DOM is
                        // populated — so when the demo clicks Save, the
                        // validation toast "Le contenu est obligatoire"
                        // fires. Three independent writes here, any one of
                        // which is enough on its own to commit the value:
                        if (!demoCancelRef.current) {
                            // 1) Reset React's internal value tracker so
                            //    the next setter call is seen as a change.
                            try {
                                const tracker = (el as unknown as { _valueTracker?: { setValue: (v: string) => void } })._valueTracker;
                                tracker?.setValue('');
                            } catch { /* ignore */ }
                            // 2) Write the full value via the prototype
                            //    setter (bypasses any per-instance React
                            //    override) and fire input + change.
                            desc?.set?.call(el, typedValue);
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            // 3) execCommand insertText — the gold standard
                            //    "simulate real user typing". Frameworks
                            //    that ignore the prototype-setter path
                            //    still pick this one up because the browser
                            //    fires a trusted InputEvent with proper
                            //    inputType. Wrapped in try/catch because
                            //    execCommand is deprecated and some envs
                            //    (test runners, etc.) throw.
                            try {
                                el.focus();
                                el.setSelectionRange(0, el.value.length);
                                document.execCommand('insertText', false, typedValue);
                            } catch { /* ignore */ }
                            // Give React a frame to commit the state update
                            // before the next demo action (click Save).
                            await new Promise(r => requestAnimationFrame(() => r(null)));
                            await new Promise(r => requestAnimationFrame(() => r(null)));
                        }
                    }
                    await sleep(a.wait ?? 250);
                } else if (a.type === 'wait') {
                    await sleep(a.ms);
                } else if (a.type === 'caption') {
                    setDemoCaption(a.text);
                    setCaptionPos(currentCaptionIdxRef.current);
                    skipNowRef.current = false;
                    // Wait for (voice finishes AND min-display elapses) OR
                    // the user clicks the floating "Passer →" button OR
                    // the user clicks "← Précédent" (which sets
                    // jumpToCaptionRef and triggers a cancel). The poll
                    // every 80 ms also notices step-cancel.
                    const speech = speakCaption(a.text);
                    const minDisplay = sleep(a.ms ?? 2000);
                    const skipped = new Promise<void>(resolve => {
                        const id = setInterval(() => {
                            if (myGen !== demoGenRef.current
                                || skipNowRef.current
                                || demoCancelRef.current
                                || jumpToCaptionRef.current !== null) {
                                clearInterval(id);
                                stopSpeaking();
                                resolve();
                            }
                        }, 80);
                    });
                    await Promise.race([Promise.all([speech, minDisplay]), skipped]);
                    currentCaptionIdxRef.current++;
                } else if (a.type === 'esc') {
                    // Robust modal close. Synthetic Escape KeyboardEvents
                    // are .isTrusted=false and many components (including
                    // this tutorial's own handler) ignore them. So first
                    // look for a real close button and click it; only fall
                    // back to dispatching Escape if no button is found.
                    const closeSelectors = [
                        '[data-tour="modal-close"]',
                        '[data-tour="modal-cancel"]',
                        '[data-tour$="-form-cancel"]',
                        '[data-tour$="-cancel"]',
                        '[aria-label="Close"]',
                        '[aria-label="Fermer"]',
                        'button[title="Fermer"]',
                        '.modal-close',
                    ];
                    let closedByClick = false;
                    for (const sel of closeSelectors) {
                        const el = document.querySelector(sel) as HTMLElement | null;
                        if (el && el.offsetParent !== null) {  // visible
                            try { el.click(); closedByClick = true; break; } catch { /* ignore */ }
                        }
                    }
                    if (!closedByClick) {
                        // Dispatch on both window and document — different
                        // libraries listen on different targets (Radix on
                        // document, custom Modals often on window).
                        const k = { key: 'Escape', bubbles: true, cancelable: true } as KeyboardEventInit;
                        window.dispatchEvent(new KeyboardEvent('keydown', k));
                        document.dispatchEvent(new KeyboardEvent('keydown', k));
                    }
                    await sleep(a.wait ?? 350);
                } else if (a.type === 'mock') {
                    const container = document.querySelector(a.container) as HTMLElement | null;
                    if (container) {
                        const mock = document.createElement(a.tag ?? 'div');
                        mock.setAttribute('data-tutorial-mock', '');
                        mock.innerHTML = a.html;
                        // Inject as the FIRST child so it's prominent and demo-able.
                        container.insertBefore(mock, container.firstChild);
                    }
                    await sleep(a.wait ?? 200);
                } else if (a.type === 'navigate') {
                    router.push(a.route);
                    await sleep(a.wait ?? 900); // give the page time to mount + framer-motion settle
                } else if (a.type === 'event') {
                    // Dispatch a CustomEvent on the window — escape hatch
                    // for pages that listen and update their own state
                    // directly (used by knowledge to bypass React-controlled
                    // textarea sync issues).
                    try {
                        window.dispatchEvent(new CustomEvent(a.eventName, { detail: a.detail }));
                    } catch { /* ignore */ }
                    // Yield two frames so React commits any state changes
                    // triggered by the listener before the next action runs.
                    await new Promise(r => requestAnimationFrame(() => r(null)));
                    await new Promise(r => requestAnimationFrame(() => r(null)));
                    await sleep(a.wait ?? 200);
                } else if (a.type === 'select') {
                    // Set a <select>'s value via the React-friendly setter so
                    // the change event fires and the page state updates.
                    // If `elementIndex` is set, pick the Nth matching select
                    // (useful when multiple selects share the same selector).
                    let el: HTMLSelectElement | null = null;
                    if (typeof a.elementIndex === 'number') {
                        // First wait for at least one match, then index.
                        await waitForElement(a.selector);
                        const all = document.querySelectorAll(a.selector);
                        el = (all[a.elementIndex] as HTMLSelectElement | undefined) ?? null;
                    } else {
                        el = await waitForElement(a.selector) as HTMLSelectElement | null;
                    }
                    if (el && !demoCancelRef.current) {
                        flashElement(el);
                        // Move cursor onto the select so the user sees the interaction.
                        const r = el.getBoundingClientRect();
                        setCursorPos({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
                        await sleep(250);
                        // Resolve the target value: explicit `value` wins; else
                        // pick from `index` into the <option> list.
                        let targetValue: string | undefined = a.value;
                        if (targetValue === undefined && typeof a.index === 'number') {
                            const opt = el.options[a.index];
                            if (opt) targetValue = opt.value;
                        }
                        if (targetValue !== undefined) {
                            const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
                            desc?.set?.call(el, targetValue);
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            // Tiny click ripple so the user sees the interaction land.
                            setCursorPulse(true);
                            setTimeout(() => setCursorPulse(false), 600);
                        }
                    }
                    await sleep(a.wait ?? 600);
                } else if (a.type === 'drag') {
                    // Synthesize HTML5 drag-and-drop. We fire dragstart on
                    // the source, then dragenter/dragover/drop on the
                    // target, then dragend on the source. React handlers
                    // on both ends fire normally — the kanban / calendar
                    // wire up the DB update via their onDrop callback.
                    const src = await waitForElement(a.selector);
                    const tgt = await waitForElement(a.target);
                    if (src && tgt && !demoCancelRef.current) {
                        const srcRect = src.getBoundingClientRect();
                        const tgtRect = tgt.getBoundingClientRect();
                        // Animate the cursor source → target before firing the drop.
                        setCursorPos({ x: srcRect.left + srcRect.width / 2, y: srcRect.top + srcRect.height / 2 });
                        await sleep(500);
                        const dt = new DataTransfer();
                        const dragStart = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt });
                        src.dispatchEvent(dragStart);
                        await sleep(150);
                        setCursorPos({ x: tgtRect.left + tgtRect.width / 2, y: tgtRect.top + tgtRect.height / 2 });
                        await sleep(550);
                        const dragEnter = new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt });
                        tgt.dispatchEvent(dragEnter);
                        const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
                        tgt.dispatchEvent(dragOver);
                        await sleep(80);
                        const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
                        tgt.dispatchEvent(drop);
                        const dragEnd = new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt });
                        src.dispatchEvent(dragEnd);
                    }
                    await sleep(a.wait ?? 800);
                }
            }
            completed = true;
        } finally {
            // ── If this demo has been superseded by a newer one, just
            // bail. The newer demo owns the cursor/voice/caption state
            // now; touching it here would clobber it. Don't reset typed
            // inputs or DOM mocks either — the new demo may need them. ──
            if (myGen !== demoGenRef.current) {
                return;
            }
            // ── Back-jump handling: if the user clicked "← Précédent" mid-
            // caption, we set jumpToCaptionRef. Re-launch the same demo
            // starting at the previous caption. Clear voice + caption so
            // the old text doesn't linger during the restart gap. ──
            const jumpTarget = jumpToCaptionRef.current;
            if (jumpTarget !== null && jumpTarget >= 0) {
                jumpToCaptionRef.current = null;
                stopSpeaking();
                setDemoCaption(null);
                const restartIdx = findRestartIdxForCaption(actions, jumpTarget);
                // Find the most recent positioning action BEFORE the restart
                // index so we can silently move the cursor + glow back to
                // where they were when the previous caption originally played.
                // Without this, the cursor stays where the cancelled caption
                // left it — the user sees the wrong element highlighted while
                // the previous caption re-narrates.
                let prevSelector: string | null = null;
                let prevIndex: number | undefined = undefined;
                for (let i = restartIdx - 1; i >= 0; i--) {
                    const a = actions[i];
                    if (a.type === 'move' || a.type === 'click'
                        || a.type === 'pretend-click' || a.type === 'drag'
                        || a.type === 'type' || a.type === 'select') {
                        prevSelector = (a as { selector?: string }).selector ?? null;
                        prevIndex = (a as { index?: number }).index;
                        break;
                    }
                }
                setTimeout(() => {
                    (async () => {
                        if (prevSelector) {
                            // Silent reposition — no pulse, no click, just
                            // place the cursor + glow on the element the
                            // previous caption was pointing at.
                            if (prevIndex && prevIndex > 0) {
                                const all = document.querySelectorAll(prevSelector);
                                const el = all[prevIndex] as HTMLElement | undefined;
                                if (el) {
                                    const r = el.getBoundingClientRect();
                                    const z = parseFloat((document.documentElement.style as unknown as { zoom?: string }).zoom || '1') || 1;
                                    setCursorPos({ x: (r.left + r.width / 2) / z, y: (r.top + r.height / 2) / z });
                                    liveEl.current = el;
                                    setTargetRect({ top: r.top / z, left: r.left / z, width: r.width / z, height: r.height / z });
                                    await sleep(420);
                                }
                            } else {
                                await moveCursorTo(prevSelector, false);
                            }
                        }
                        runDemo(actions, restartIdx);
                    })();
                }, 80);
                return;
            }
            setDemoRunning(false);
            setDemoCaption(null);
            // ── Only mark demoPlayed=true when the demo finished NATURALLY.
            // If it was cancelled by a step change (Étape ⏭ / Étape ⏮ /
            // user navigation), leaving demoPlayed=false lets the auto-play
            // effect start a fresh demo for the new step. Marking it true
            // here would cause the new step to display silent + trigger
            // auto-advance to skip to the step AFTER that. ──
            if (completed) setDemoPlayed(true);
            // ── Remove any DOM mocks injected during the demo ──
            document.querySelectorAll('[data-tutorial-mock]').forEach(el => el.remove());
            // ── Clear values we typed into real inputs so the page returns clean ──
            typedInputsRef.current.forEach(el => {
                try {
                    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
                    desc?.set?.call(el, '');
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                } catch { /* ignore */ }
            });
            typedInputsRef.current.clear();
        }
    }, [moveCursorTo, flashElement, router, findRestartIdxForCaption]);

    if (!mounted || !open || !user || !step) return null;

    const isAr = locale.language === 'ar';
    const isLast = idx === steps.length - 1;
    const isFirst = idx === 0;
    const Icon = step.icon;

    /** Bulletproof close — kills every async loop, removes every
     *  injected DOM node, clears every overlay, and stops every speech
     *  channel. Used by ✕ Quitter, ESC, and Escape-to-dismiss.
     *
     *  ⚠ Plain function, NOT useCallback — this sits after an early
     *  return above, so wrapping it in a hook would break the Rules of
     *  Hooks (crashed the whole app in prod, error boundary swallowed it
     *  as "Une erreur est survenue"). */
    const finish = (markDone: boolean) => {
        // 1. Stop the demo loop AT THE NEXT TICK by both cancelling it and
        //    bumping the generation counter — runDemo polls both flags.
        demoCancelRef.current = true;
        demoGenRef.current++;
        setDemoRunning(false);
        setDemoCaption(null);
        setDemoPlayed(false);
        // 2. Kill speech / TTS — Web Speech API doesn't always stop on
        //    setOpen(false) alone in some browsers.
        try { stopSpeaking(); } catch { /* ignore */ }
        try { window.speechSynthesis?.cancel?.(); } catch { /* ignore */ }
        // 3. Strip every injected mock DOM node so they don't linger on
        //    the page after the tour closes (the EPI / approvals / proc
        //    mocks all live with data-tutorial-mock).
        if (typeof document !== 'undefined') {
            document.querySelectorAll('[data-tutorial-mock]').forEach(el => el.remove());
        }
        // 4. Clear cursor + spotlight + paused state so the next time the
        //    tour opens it starts from a clean slate.
        setTargetRect(null);
        setCursorPos(null);
        setCursorPulse(false);
        setPaused(false);
        pausedRef.current = false;
        liveEl.current = null;
        // 5. Hide the React tree.
        setOpen(false);
        // 6. Persist progress flags.
        try { localStorage.removeItem(`smartmaint-tutorial-progress-${user.supabaseId}`); } catch { /* ignore */ }
        if (markDone) {
            try { localStorage.setItem(storageKey(user.supabaseId), '1'); } catch { /* ignore */ }
        }
    };
    // Point the ref at the latest `finish` on every render so the auto-advance
    // effect (declared earlier in the component) can close the tour on the
    // last step. Direct assignment — no hook — is safe because refs don't
    // trigger re-renders and this line lives after the early return above.
    finishRef.current = finish;
    const goNext = () => setIdx(i => Math.min(steps.length - 1, i + 1));
    const goPrev = () => setIdx(i => Math.max(0, i - 1));

    const lbl = isAr
        ? { next: 'التالي', prev: 'السابق', skip: 'تخطّي', finish: 'فهمت — لنبدأ', step: 'الخطوة' }
        : { next: 'Suivant', prev: 'Précédent', skip: 'Passer', finish: 'Terminé — c\'est parti !', step: 'Étape' };
    // ── Render ───────────────────────────────────────────
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

    // Spotlight rect — padded slightly around the target
    const PAD = 8;
    const spot = targetRect ? {
        top: Math.max(0, targetRect.top - PAD),
        left: Math.max(0, targetRect.left - PAD),
        width: targetRect.width + PAD * 2,
        height: targetRect.height + PAD * 2,
    } : null;

    // Popover position
    const pop = spot
        ? placePopover(spot, vw, vh, isAr)
        : { top: Math.max(20, vh / 2 - 220), left: vw / 2 - POPOVER_WIDTH / 2, placement: 'center' as const };

    // Cursor + caption render in their OWN portal at zIndex 100000 so they
    // always paint above modals (9992), slide-overs (9991), the tutorial
    // overlay itself (9994), and anything else the app might surface.
    const cursorPortal = (typeof document !== 'undefined') ? createPortal(
        <>
            {cursorPos && (
                <div
                    aria-hidden="true"
                    style={{
                        position: 'fixed',
                        top: cursorPos.y, left: cursorPos.x,
                        width: 52, height: 52,
                        transform: 'translate(-50%, -50%)',
                        transition: 'top 0.55s cubic-bezier(0.32, 0.72, 0.36, 1), left 0.55s cubic-bezier(0.32, 0.72, 0.36, 1)',
                        pointerEvents: 'none',
                        zIndex: 100000,
                    }}
                >
                    {/* Big click ripple */}
                    {cursorPulse && (
                        <div style={{
                            position: 'absolute', inset: -28,
                            borderRadius: '50%',
                            border: `3px solid ${step.color}`,
                            background: `${step.color}33`,
                            animation: 'tutorial-click-ripple 0.65s ease-out forwards',
                        }} />
                    )}
                    {cursorPulse && (
                        <div style={{
                            position: 'absolute', inset: -12,
                            borderRadius: '50%',
                            border: `3px solid ${step.color}`,
                            animation: 'tutorial-click-ripple 0.65s ease-out forwards',
                            animationDelay: '0.08s',
                        }} />
                    )}
                    {/* Bright cursor body — arrow shape via clip-path so it feels like a real pointer */}
                    <div style={{
                        position: 'absolute', inset: 0,
                        borderRadius: '50%',
                        background: `radial-gradient(circle at 35% 35%, #ffffff 0%, #ffffff 22%, ${step.color} 55%, ${step.color} 100%)`,
                        boxShadow: `0 0 0 4px white, 0 0 0 7px ${step.color}, 0 12px 36px ${step.color}99, 0 0 40px ${step.color}cc`,
                        transform: cursorPulse ? 'scale(0.78)' : 'scale(1)',
                        transition: 'transform 0.18s ease-out',
                    }} />
                    {/* Small "tap finger" dot inside */}
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%',
                        width: 10, height: 10, borderRadius: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: step.color,
                        boxShadow: `0 0 12px ${step.color}`,
                    }} />
                </div>
            )}

            {demoCaption && (
                <div
                    aria-live="polite"
                    style={{
                        position: 'fixed',
                        bottom: 28, left: '50%', transform: 'translateX(-50%)',
                        maxWidth: 'calc(100vw - 32px)',
                        background: 'rgba(15, 23, 42, 0.95)',
                        color: 'white',
                        padding: '14px 22px',
                        borderRadius: 14,
                        fontSize: 14, fontWeight: 700,
                        boxShadow: '0 20px 48px rgba(0,0,0,0.55)',
                        backdropFilter: 'blur(8px)',
                        borderInlineStart: `5px solid ${step.color}`,
                        fontFamily: 'inherit',
                        animation: 'fadeIn 0.2s ease-out',
                        pointerEvents: 'none',
                        zIndex: 100000,
                        display: 'flex', alignItems: 'center', gap: 10,
                    }}
                >
                    <span style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: step.color,
                        boxShadow: `0 0 12px ${step.color}`,
                        animation: 'tutorial-pulse 0.9s ease-in-out infinite',
                        flexShrink: 0,
                    }} />
                    {demoCaption}
                </div>
            )}
            {/* Navigation cluster — 4 buttons. Two outer ones jump
                between FEATURES (tour steps); two inner ones step
                through CAPTIONS within the current demo.
                Rendered independently of demoCaption so the buttons
                remain available during step transitions (between the
                old demo ending and the new caption appearing) and
                while the demo is paused. */}
            {open && step && (
                <>
                    <div style={{
                        position: 'fixed',
                        bottom: 96,
                        ...(isAr ? { left: 24 } : { right: 24 }),
                        display: 'flex', gap: 8,
                        pointerEvents: 'auto',
                        zIndex: 100001,
                        animation: 'fadeIn 0.2s ease-out',
                    }}>
                        {/* ← Previous feature — mirrors the old popover's
                            Suivant button: just calls goPrev. No timeout
                            clearing, no userNavigatedRef. The popover button
                            worked reliably with this minimal handler; the
                            extra logic was breaking step navigation. */}
                        <button
                            onClick={goPrev}
                            disabled={isFirst}
                            title={isAr ? 'الميزة السابقة' : 'Fonctionnalité précédente'}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '10px 14px', borderRadius: 100,
                                border: 'none',
                                background: isFirst ? 'rgba(100,116,139,0.6)' : 'rgba(15,23,42,0.92)',
                                color: 'white',
                                fontSize: 12, fontWeight: 700,
                                cursor: isFirst ? 'not-allowed' : 'pointer',
                                opacity: isFirst ? 0.45 : 1,
                                fontFamily: 'inherit',
                                boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
                                transition: 'transform 0.12s ease',
                            }}
                            onMouseEnter={e => { if (!isFirst) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
                        >
                            {isAr ? '→→ ميزة' : '⏮ Étape'}
                        </button>
                        {/* ← Previous caption */}
                        <button
                            onClick={() => {
                                const target = Math.max(0, currentCaptionIdxRef.current - 1);
                                jumpToCaptionRef.current = target;
                            }}
                            disabled={captionPos <= 0}
                            title={isAr ? 'التعليق السابق' : 'Commentaire précédent'}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '12px 18px', borderRadius: 100,
                                border: `2px solid ${step.color}aa`,
                                background: captionPos <= 0 ? 'rgba(100,116,139,0.5)' : `${step.color}66`,
                                color: 'white',
                                fontSize: 13, fontWeight: 800,
                                cursor: captionPos <= 0 ? 'not-allowed' : 'pointer',
                                opacity: captionPos <= 0 ? 0.45 : 1,
                                fontFamily: 'inherit',
                                boxShadow: `0 6px 18px ${step.color}55`,
                                transition: 'transform 0.12s ease',
                            }}
                            onMouseEnter={e => { if (captionPos > 0) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
                        >
                            {isAr ? '→ سابق' : '← Précédent'}
                        </button>
                        {/* Pause / Resume — pauses the demo loop AND the
                            current voice. Press again to continue. */}
                        <button
                            onClick={togglePause}
                            title={paused
                                ? (isAr ? 'متابعة' : 'Reprendre')
                                : (isAr ? 'إيقاف مؤقّت' : 'Pause')}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '12px 18px', borderRadius: 100,
                                border: paused ? `2px solid ${step.color}` : '2px solid rgba(100,116,139,0.4)',
                                background: paused ? `${step.color}aa` : 'rgba(15,23,42,0.92)',
                                color: 'white',
                                fontSize: 13, fontWeight: 800, cursor: 'pointer',
                                fontFamily: 'inherit',
                                boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
                                transition: 'transform 0.12s ease',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
                        >
                            {paused
                                ? (isAr ? '▶ متابعة' : '▶ Reprendre')
                                : (isAr ? '⏸ إيقاف' : '⏸ Pause')}
                        </button>
                        {/* Next caption / Skip */}
                        <button
                            onClick={() => { skipNowRef.current = true; }}
                            title={isAr ? 'تخطّي هذا التعليق' : 'Passer ce commentaire'}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '12px 22px', borderRadius: 100,
                                border: 'none',
                                background: `linear-gradient(135deg, ${step.color}, ${step.color}dd)`,
                                color: 'white',
                                fontSize: 14, fontWeight: 800, cursor: 'pointer',
                                fontFamily: 'inherit',
                                boxShadow: `0 8px 24px ${step.color}88, 0 0 0 4px ${step.color}33`,
                                transition: 'transform 0.12s ease, box-shadow 0.2s ease',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.04)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
                        >
                            {isAr ? 'تخطّي ←' : 'Passer →'}
                        </button>
                        {/* Quit the tour entirely — finish(true) marks tutorial
                            as completed so it doesn't re-open on next session. */}
                        <button
                            onClick={() => finish(true)}
                            title={isAr ? 'إنهاء الجولة' : 'Quitter le tour'}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '12px 18px', borderRadius: 100,
                                border: '2px solid rgba(239,68,68,0.5)',
                                background: 'rgba(127,29,29,0.92)',
                                color: 'white',
                                fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
                                fontFamily: 'inherit',
                                boxShadow: '0 6px 18px rgba(127,29,29,0.4)',
                                transition: 'transform 0.12s ease',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
                        >
                            {isAr ? '✕ إنهاء' : '✕ Quitter'}
                        </button>
                        {/* Next feature — same minimal handler as the old
                            popover Suivant: just goNext. */}
                        <button
                            onClick={goNext}
                            disabled={isLast}
                            title={isAr ? 'الميزة التالية' : 'Fonctionnalité suivante'}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '10px 14px', borderRadius: 100,
                                border: 'none',
                                background: isLast ? 'rgba(100,116,139,0.6)' : 'rgba(15,23,42,0.92)',
                                color: 'white',
                                fontSize: 12, fontWeight: 700,
                                cursor: isLast ? 'not-allowed' : 'pointer',
                                opacity: isLast ? 0.45 : 1,
                                fontFamily: 'inherit',
                                boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
                                transition: 'transform 0.12s ease',
                            }}
                            onMouseEnter={e => { if (!isLast) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
                        >
                            {isAr ? 'ميزة ←←' : 'Étape ⏭'}
                        </button>
                    </div>
                </>
            )}

            <style>{`
                @keyframes tutorial-click-ripple {
                    0%   { transform: scale(0.5); opacity: 1; }
                    100% { transform: scale(2.8); opacity: 0; }
                }
            `}</style>
        </>,
        document.body,
    ) : null;

    return createPortal(
        <>{cursorPortal}<div dir={isAr ? 'rtl' : 'ltr'} style={{ position: 'fixed', inset: 0, zIndex: 9994, pointerEvents: 'none' }}>

            {/* Dimmer — either 4 panels around a cutout, or full overlay.
                HIDDEN entirely during a scripted demo so the modal/wizard the
                demo opens is fully visible (otherwise the tutorial dim covers it
                and the user only sees a black screen). */}
            {!demoRunning && spot && (
                <>
                    <div style={{ ...dimStyle, top: 0, left: 0, right: 0, height: spot.top }} />
                    <div style={{ ...dimStyle, top: spot.top + spot.height, left: 0, right: 0, bottom: 0 }} />
                    <div style={{ ...dimStyle, top: spot.top, left: 0, width: spot.left, height: spot.height }} />
                    <div style={{ ...dimStyle, top: spot.top, left: spot.left + spot.width, right: 0, height: spot.height }} />
                </>
            )}
            {!demoRunning && !spot && (
                <div style={{ ...dimStyle, inset: 0 }} />
            )}
            {/* Pulsing glow ring around the target — stays visible during demos
                so the user always knows which element the cursor is acting on. */}
            {spot && (
                <div style={{
                    position: 'absolute',
                    top: spot.top, left: spot.left, width: spot.width, height: spot.height,
                    borderRadius: 14,
                    boxShadow: `0 0 0 3px ${step.color}, 0 0 24px 6px ${step.color}88`,
                    animation: 'tutorial-pulse 1.6s ease-in-out infinite',
                    pointerEvents: 'none',
                    opacity: demoRunning ? 0.45 : 1,
                    transition: 'opacity 0.3s ease',
                }} />
            )}

            {/* Cursor + caption are rendered in a SEPARATE portal below — at
                zIndex 100000 so they always sit above modals, slide-overs, and
                anything else. */}

            {/* No popover anywhere — every step relies on the caption pill +
                cursor + nav cluster at the bottom for navigation. */}

            <style>{`
                @keyframes tutorial-pulse {
                    0%, 100% { box-shadow: 0 0 0 3px ${step.color}, 0 0 24px 6px ${step.color}88; }
                    50%      { box-shadow: 0 0 0 5px ${step.color}, 0 0 36px 10px ${step.color}; }
                }
            `}</style>
        </div></>,
        document.body,
    );
}

const dimStyle: React.CSSProperties = {
    position: 'absolute', background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(1px)',
    // Do NOT block clicks — the tutorial highlights, it doesn't jail. If the
    // user wants to click somewhere else (nav, panic button, close overlay),
    // let them. Prior behavior trapped users when a tutorial hadn't been
    // dismissed on the previous route.
    pointerEvents: 'none',
};

