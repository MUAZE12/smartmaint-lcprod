'use client';

let _transcriber: any = null;
let _modelName = '';
let _loadPromise: Promise<any> | null = null;

/** Returns which Whisper variant is currently loaded (for UI display). */
export function getActiveModel() { return _modelName; }

async function getTranscriber(onProgress?: (msg: string) => void) {
    if (_transcriber) return _transcriber;
    if (_loadPromise) return _loadPromise;

    _loadPromise = (async () => {
        const { pipeline, env } = await import('@xenova/transformers');

        // Probe: are model files bundled locally? (Windows installer ships
        // them in /public/models/; the Vercel-hosted PWA does not because of
        // the 240 MB size.) If local probe fails, fall back to Supabase
        // Storage where we host the same model. The browser + service worker
        // cache the files on first download, so subsequent transcriptions
        // are instant and work offline.
        const probeUrl = '/models/Xenova/whisper-small/config.json';
        let useLocal = false;
        try {
            const r = await fetch(probeUrl, { method: 'HEAD', cache: 'no-cache' });
            useLocal = r.ok;
        } catch { useLocal = false; }

        if (useLocal) {
            env.allowRemoteModels = false;
            env.localModelPath = '/models/';
            console.log('[STT] Using local /models/ (Windows installer)');
        } else {
            // Supabase Storage: public bucket `models` hosting the same files
            // under their HF-style paths (Xenova/whisper-small/...).
            const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            if (!supaUrl) throw new Error('Whisper indisponible : NEXT_PUBLIC_SUPABASE_URL non défini');
            env.allowLocalModels = false;
            env.allowRemoteModels = true;
            env.remoteHost = `${supaUrl}/storage/v1/object/public/models/`;
            env.remotePathTemplate = '{model}/';
            console.log('[STT] Using remote Supabase Storage:', env.remoteHost);
        }

        const progressCb = (p: any) => {
            if (p.status === 'initiate') onProgress?.('Chargement modèle vocal...');
            else if (p.status === 'download' || p.status === 'downloading') {
                const pct = p.progress != null ? Math.round(p.progress)
                    : p.total > 0 ? Math.round(p.loaded / p.total * 100) : 0;
                onProgress?.(`Chargement... ${pct}%`);
            } else if (p.status === 'loading') {
                onProgress?.('Initialisation...');
            }
        };

        // Prefer whisper-small (best French accuracy). Fall back to whatever
        // smaller model an older, not-yet-updated install still has on disk —
        // the app keeps working, just less accurately.
        const candidates = [
            { id: 'Xenova/whisper-small', name: 'whisper-small' },
            { id: 'Xenova/whisper-base', name: 'whisper-base' },
            { id: 'Xenova/whisper-tiny', name: 'whisper-tiny' },
        ];
        let lastErr: unknown = null;
        for (const c of candidates) {
            try {
                console.log(`[STT] Loading ${c.name} from local public/models/...`);
                onProgress?.('Chargement modèle vocal...');
                _transcriber = await pipeline('automatic-speech-recognition', c.id, {
                    quantized: true,
                    progress_callback: progressCb,
                });
                _modelName = c.name;
                console.log('[STT] Loaded:', _modelName);
                return _transcriber;
            } catch (e) {
                lastErr = e;
                console.warn(`[STT] ${c.name} unavailable:`, e);
            }
        }
        throw lastErr ?? new Error('Aucun modèle vocal disponible');
    })();

    _loadPromise.catch(() => { _loadPromise = null; _transcriber = null; _modelName = ''; });
    return _loadPromise;
}

/**
 * Decode webm/opus blob → 16 kHz mono Float32Array via linear interpolation.
 * AudioContext({ sampleRate: 16000 }) does NOT resample during decodeAudioData;
 * it decodes at native 48 kHz. Passing 48 kHz samples to Whisper makes audio
 * sound 3× too fast — Whisper hallucinates. This does the real conversion.
 */
async function blobToFloat32At16k(blob: Blob): Promise<Float32Array | null> {
    try {
        const buf = await blob.arrayBuffer();
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        let decoded: AudioBuffer;
        try { decoded = await ctx.decodeAudioData(buf); }
        catch (e) { ctx.close(); console.warn('[STT] decodeAudioData failed:', e); return null; }

        const rate = decoded.sampleRate;
        const mono = decoded.getChannelData(0);
        ctx.close();

        console.log('[STT] Audio decoded — native rate:', rate, 'Hz, duration:', decoded.duration.toFixed(2), 's');

        if (rate === 16000) return mono;

        const ratio = rate / 16000;
        const out = new Float32Array(Math.floor(mono.length / ratio));
        for (let i = 0; i < out.length; i++) {
            const pos = i * ratio;
            const lo = Math.floor(pos);
            const hi = Math.min(lo + 1, mono.length - 1);
            out[i] = mono[lo] * (1 - (pos - lo)) + mono[hi] * (pos - lo);
        }
        return out;
    } catch (e) { console.warn('[STT] blobToFloat32At16k error:', e); return null; }
}

function normalizeAmplitude(f32: Float32Array): Float32Array {
    let peak = 0;
    for (let i = 0; i < f32.length; i++) { const a = Math.abs(f32[i]); if (a > peak) peak = a; }
    console.log('[STT] Audio peak amplitude:', peak.toFixed(4));
    if (peak < 0.01 || peak > 0.95) return f32;
    const s = 0.9 / peak;
    const out = new Float32Array(f32.length);
    for (let i = 0; i < f32.length; i++) out[i] = f32[i] * s;
    return out;
}

function hasSpeech(f32: Float32Array): boolean {
    let sum = 0;
    for (let i = 0; i < f32.length; i++) sum += f32[i] * f32[i];
    const rms = Math.sqrt(sum / f32.length);
    console.log('[STT] Audio RMS:', rms.toFixed(5));
    return rms > 0.003;
}

const HALLUCINATIONS = [
    /sous-titres/i, /sous titres/i, /abonner/i, /abonnez/i,
    /merci d'avoir/i, /merci pour votre/i, /cliquez/i,
    /\[.*?\]/, /^\s*[.!?,\s]*\s*$/,
];
function isHallucination(t: string) {
    return !t || t.trim().length < 3 || HALLUCINATIONS.some(p => p.test(t));
}

/** Transcribe audio blob to French text. Never throws — returns '' on any error. */
export async function transcribeBlob(
    blob: Blob,
    onProgress?: (msg: string) => void
): Promise<string> {
    try {
        console.log('[STT] transcribeBlob — blob size:', blob.size, 'bytes, type:', blob.type);

        if (blob.size < 1000) { console.warn('[STT] Blob too small, skipping'); return ''; }

        const transcriber = await getTranscriber(onProgress);
        console.log('[STT] Using model:', _modelName);

        onProgress?.('Décodage audio...');
        let f32 = await blobToFloat32At16k(blob);

        if (!f32) { console.warn('[STT] Audio decode failed'); return ''; }
        if (f32.length < 16000 * 0.5) { console.warn('[STT] Audio too short:', f32.length / 16000, 's'); return ''; }
        if (!hasSpeech(f32)) { console.warn('[STT] No speech detected'); return ''; }

        f32 = normalizeAmplitude(f32);

        onProgress?.(`🎙️ Transcription (${_modelName || 'whisper'})...`);
        console.log('[STT] Calling transcriber, samples:', f32.length);

        const result = await transcriber(f32, {
            language: 'french',
            task: 'transcribe',
            chunk_length_s: 30,   // process in 30s chunks for long recordings
            stride_length_s: 5,   // 5s overlap between chunks to avoid cut words
        });

        const raw = Array.isArray(result)
            ? result.map((r: any) => r.text).join(' ')
            : (result as any).text ?? '';

        const text = raw.trim();
        console.log('[STT] Raw output:', JSON.stringify(text));

        if (isHallucination(text)) {
            console.warn('[STT] Output filtered as hallucination');
            return '';
        }

        console.log('[STT] Final text:', text);
        return text;

    } catch (e) {
        console.error('[STT] transcribeBlob error:', e);
        return '';
    }
}
