// ============================================================
// shiftHandover.ts
//
// Cross-shift voice handover: the outgoing tech records a 60-second
// voice memo. Whisper transcribes it. This module turns the raw
// transcript into a structured, actionable summary the INCOMING
// tech's dashboard opens with.
//
// Every incoming tech gets a card:
//   • 1-sentence headline
//   • Open items (running interventions, LOTOs)
//   • Watch-list (machines drifting toward failure)
//   • Actions taken (context for anything new since last shift)
//
// Pure module — takes shift_notes + interventions + LOTOs, returns
// a Handover shape. Whisper produces the raw text; this module
// gives it structure.
// ============================================================

export interface HandoverSource {
    outgoingTechName: string;
    outgoingTechId: string;
    incomingTechName?: string;
    incomingTechId?: string;
    shiftStart: string;
    shiftEnd: string;
    voiceTranscript?: string;    // raw Whisper output
    interventionsThisShift: Array<{
        id: string; machineCode: string; description: string;
        status: 'terminée' | 'en cours' | 'planifiée';
        priority?: 'low' | 'medium' | 'high' | 'critical';
    }>;
    openLotos: Array<{ machineCode: string; reason: string; consignedAt: string }>;
    watchList?: Array<{ machineCode: string; reason: string }>;
}

export interface Handover {
    headline: string;
    voiceMemo?: string;
    ongoing: Array<{ machineCode: string; description: string; priority: 'low' | 'medium' | 'high' | 'critical' }>;
    completedThisShift: number;
    consigned: Array<{ machineCode: string; reason: string; consignedAgo: string }>;
    watchList: Array<{ machineCode: string; reason: string }>;
    voiceHighlights: string[];   // salient sentences pulled from the transcript
}

/** Words that make a sentence "actionable" — pulled into voiceHighlights. */
const SALIENT_WORDS = /\b(critique|urgent|remplacer|panne|attention|à\s+surveiller|redémarr|LOTO|à\s+finir|vérifier|contrôler)\b/i;

function ago(iso: string, now: Date): string {
    const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${h} h`;
    return `${Math.floor(h / 24)} j`;
}

function splitSentences(t: string): string[] {
    return t
        .replace(/\s+/g, ' ')
        .split(/([.!?])\s+/)
        .reduce<string[]>((acc, chunk, i, arr) => {
            if (i % 2 === 0 && chunk.trim()) acc.push(chunk.trim() + (arr[i + 1] ?? ''));
            return acc;
        }, []);
}

export function buildHandover(src: HandoverSource, now: Date = new Date()): Handover {
    const ongoing = src.interventionsThisShift
        .filter(i => i.status !== 'terminée')
        .map(i => ({ machineCode: i.machineCode, description: i.description, priority: (i.priority ?? 'medium') }));

    const completed = src.interventionsThisShift.filter(i => i.status === 'terminée').length;

    const consigned = src.openLotos.map(l => ({
        machineCode: l.machineCode,
        reason: l.reason,
        consignedAgo: ago(l.consignedAt, now),
    }));

    const watch = src.watchList ?? [];

    // Headline: prioritize critical open items, else "shift terminée quietly"
    const critical = ongoing.filter(i => i.priority === 'critical' || i.priority === 'high');
    let headline: string;
    if (critical.length > 0) {
        headline = `${critical.length} intervention(s) critique(s) en cours — ${critical.map(c => c.machineCode).join(', ')}.`;
    } else if (consigned.length > 0) {
        headline = `${consigned.length} machine(s) consignée(s) LOTO — vérifiez avant redémarrage.`;
    } else if (ongoing.length > 0) {
        headline = `${ongoing.length} intervention(s) en cours, ${completed} terminée(s) ce shift.`;
    } else {
        headline = `Rien de critique. ${completed} intervention(s) terminée(s) ce shift.`;
    }

    // Voice highlights: pull sentences that mention machines or salient keywords
    let voiceHighlights: string[] = [];
    if (src.voiceTranscript) {
        const machineCodes = new Set([
            ...ongoing.map(o => o.machineCode.toUpperCase()),
            ...consigned.map(c => c.machineCode.toUpperCase()),
            ...watch.map(w => w.machineCode.toUpperCase()),
        ]);
        voiceHighlights = splitSentences(src.voiceTranscript)
            .filter(s => {
                if (SALIENT_WORDS.test(s)) return true;
                const up = s.toUpperCase();
                for (const code of machineCodes) if (up.includes(code)) return true;
                return false;
            })
            .slice(0, 5);
    }

    return {
        headline,
        voiceMemo: src.voiceTranscript,
        ongoing,
        completedThisShift: completed,
        consigned,
        watchList: watch,
        voiceHighlights,
    };
}
