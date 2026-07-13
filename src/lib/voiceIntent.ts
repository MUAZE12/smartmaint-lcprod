// ============================================================
// voiceIntent.ts
//
// Parses a French / Arabic natural-language command into a
// structured intent. Used by the "voice-only" operator flow: press
// a big microphone button, dictate the whole action, and the app
// figures out what you meant.
//
// Uses simple heuristics — pattern matching + number extraction.
// Good for the 10 highest-frequency operator commands. Anything
// unmatched falls through to a "what did you want to do?" clarify.
//
// EXAMPLES
//   "j'ai fait 50 bouteilles" → { kind: 'batch-increment', qty: 50 }
//   "j'ai fait cinquante bouteilles"  → same
//   "قلت عندي 50 قارورة"           → same
//   "arrête la dépoche"        → { kind: 'batch-end' }
//   "défaut qualité"           → { kind: 'quality-defect' }
//   "j'ai besoin de gants M"   → { kind: 'consumable-request', item: 'gants M' }
//   "panne pompe"              → { kind: 'panic', hint: 'pompe' }
//   "prends une photo"         → { kind: 'quality-photo' }
// ============================================================

export type VoiceIntent =
    | { kind: 'batch-increment'; qty: number }
    | { kind: 'batch-decrement'; qty: number }
    | { kind: 'batch-end' }
    | { kind: 'batch-start'; product?: string }
    | { kind: 'quality-defect'; note?: string }
    | { kind: 'quality-photo' }
    | { kind: 'consumable-request'; item: string; urgent: boolean }
    | { kind: 'panic'; hint?: string }
    | { kind: 'relief-request' }
    | { kind: 'ack-directive' }
    | { kind: 'unknown'; original: string };

// French number words → digits
const FR_NUMBERS: Record<string, number> = {
    zéro: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5,
    six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
    treize: 13, quatorze: 14, quinze: 15, seize: 16,
    vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
    'soixante-dix': 70, 'quatre-vingts': 80, 'quatre-vingt-dix': 90,
    cent: 100, mille: 1000,
};

// Arabic number words (subset) → digits
const AR_NUMBERS: Record<string, number> = {
    'صفر': 0, 'واحد': 1, 'واحدة': 1, 'اثنين': 2, 'اثنان': 2,
    'ثلاثة': 3, 'أربعة': 4, 'خمسة': 5, 'ستة': 6, 'سبعة': 7,
    'ثمانية': 8, 'تسعة': 9, 'عشرة': 10, 'عشرين': 20, 'ثلاثين': 30,
    'أربعين': 40, 'خمسين': 50, 'ستين': 60, 'سبعين': 70,
    'ثمانين': 80, 'تسعين': 90, 'مائة': 100, 'مئة': 100, 'ألف': 1000,
};

/** Extract the first number in the transcript, digits or French/Arabic words. */
function extractNumber(input: string): number | null {
    const norm = input.toLowerCase();
    // Digits (also handles Arabic-Indic digits ٠-٩)
    const arabicToLatin: Record<string, string> = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' };
    const digitsOnly = norm.replace(/[٠-٩]/g, d => arabicToLatin[d] ?? d);
    const m = digitsOnly.match(/\d+/);
    if (m) return parseInt(m[0], 10);

    // Word numbers
    const tokens = norm.split(/[\s,'-]+/);
    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (FR_NUMBERS[tok] !== undefined) return FR_NUMBERS[tok];
        if (AR_NUMBERS[tok] !== undefined) return AR_NUMBERS[tok];
        // Try compound "cinquante-trois"
        if (i < tokens.length - 1) {
            const compound = tok + '-' + tokens[i + 1];
            if (FR_NUMBERS[compound] !== undefined) return FR_NUMBERS[compound];
            const base = FR_NUMBERS[tok];
            const suffix = FR_NUMBERS[tokens[i + 1]];
            if (base !== undefined && suffix !== undefined && base >= 20 && base < 100) {
                return base + suffix;
            }
        }
    }
    return null;
}

const RE = {
    batchInc: /(fait|produit|sorti|compt(e|é|er|ez))|قلت\s?عندي|أنتج/i,
    batchDec: /erreur|retir(e|er)|أخطأت|احذف/i,
    batchEnd: /finir|arr(êt|et)|termine|أنهي|أنهيت|توقّف/i,
    batchStart: /(nouvelle|démarrer|commencer)\s+(d[eé]poche|lot|batch)|بدء|ابدأ/i,
    qualityDefect: /d[eé]faut|probl[eè]me qualit[eé]|non[- ]?conforme|عيب|جودة/i,
    qualityPhoto: /photo|prends|take a picture|صورة/i,
    consumable: /gants|casque|kit|filtre|chiffon|masque|EPI|قفاز|كمامة|خوذة/i,
    panic: /panne|panique|urgen(t|ce)|casse|blocage|panic|عطل|توقّف/i,
    urgent: /urgen(t|ce)|imm[eé]diat|now|عاجل/i,
    relief: /pause|remplac(ant|er)|relais|استراحة|بديل/i,
    ackDirective: /(ok|d[e']accord|entendu|فهمت|موافق)\s+(consigne|directive|تعليمة)/i,
};

/** Best-effort French/Arabic voice → intent. */
export function parseIntent(transcript: string): VoiceIntent {
    const t = transcript.trim();
    if (!t) return { kind: 'unknown', original: t };

    if (RE.batchStart.test(t))    return { kind: 'batch-start' };
    if (RE.batchEnd.test(t))      return { kind: 'batch-end' };
    if (RE.batchDec.test(t))      {
        const n = extractNumber(t) ?? 1;
        return { kind: 'batch-decrement', qty: n };
    }
    if (RE.batchInc.test(t)) {
        const n = extractNumber(t);
        return { kind: 'batch-increment', qty: n ?? 1 };
    }
    if (RE.qualityDefect.test(t)) return { kind: 'quality-defect', note: t };
    if (RE.qualityPhoto.test(t))  return { kind: 'quality-photo' };
    if (RE.consumable.test(t)) {
        // Strip the intent verb, keep the item description
        const cleaned = t.replace(/(besoin|manque|demande|need|أحتاج|أطلب|il me faut)/gi, '').trim();
        return { kind: 'consumable-request', item: cleaned || t, urgent: RE.urgent.test(t) };
    }
    if (RE.panic.test(t)) {
        return { kind: 'panic', hint: t };
    }
    if (RE.relief.test(t))        return { kind: 'relief-request' };
    if (RE.ackDirective.test(t))  return { kind: 'ack-directive' };

    return { kind: 'unknown', original: t };
}

/** Human-readable label for the intent, French. */
export function describeIntent(intent: VoiceIntent): string {
    switch (intent.kind) {
        case 'batch-increment':    return `Incrémenter la dépoche de ${intent.qty} unité(s)`;
        case 'batch-decrement':    return `Retirer ${intent.qty} unité(s) de la dépoche`;
        case 'batch-end':          return `Terminer la dépoche en cours`;
        case 'batch-start':        return `Démarrer une nouvelle dépoche`;
        case 'quality-defect':     return `Signaler un défaut qualité`;
        case 'quality-photo':      return `Prendre une photo qualité`;
        case 'consumable-request': return `Demander : ${intent.item}` + (intent.urgent ? ' (urgent)' : '');
        case 'panic':              return `Déclarer une panne`;
        case 'relief-request':     return `Demander un relais`;
        case 'ack-directive':      return `Acquitter la consigne du jour`;
        case 'unknown':            return `Non compris — répétez ou tapez ?`;
    }
}
