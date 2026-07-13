#!/usr/bin/env node
// ============================================================
// scripts/simulate-sensors.mjs
//
// Streams fake but realistic vibration + temperature + current +
// pressure readings for a small set of machines. Bakes in a slow
// drift so /synoptique + predictive-maintenance can show something
// interesting even without real IoT hardware.
//
// USAGE:
//   node scripts/simulate-sensors.mjs
//   node scripts/simulate-sensors.mjs --machines POM-001,REM-001 --interval 2000
//
// ENV needed:
//   SMARTMAINT_URL     — base URL of the running app (default http://localhost:3000)
//   SMARTMAINT_API_KEY — bearer for /api/sensors
// ============================================================

const args = process.argv.slice(2);
function argVal(name, def) {
    const idx = args.findIndex(a => a === '--' + name);
    if (idx < 0 || idx === args.length - 1) return def;
    return args[idx + 1];
}

const BASE = process.env.SMARTMAINT_URL || 'http://localhost:3000';
const API_KEY = process.env.SMARTMAINT_API_KEY;
if (!API_KEY) {
    console.error('Missing SMARTMAINT_API_KEY in env. See .env.local.');
    process.exit(1);
}

const machines = argVal('machines', 'POM-001,REM-001,CHD-001,ETI-001,BOU-001').split(',').map(s => s.trim()).filter(Boolean);
const intervalMs = parseInt(argVal('interval', '3000'), 10);
const duration = argVal('duration', null);   // seconds — optional stop

// ── Baseline per (machine, metric) ────────────────────────
const baseline = {};
for (const m of machines) {
    baseline[m] = {
        vibration:   { base: 2.4 + Math.random() * 0.8, drift: 0.0006 },   // mm/s — slowly rising
        temperature: { base: 42 + Math.random() * 6,   drift: 0.002 },     // °C — slow drift
        current:     { base: 8.5 + Math.random() * 1.5, drift: 0.0002 },   // A
        pressure:    { base: 4.2 + Math.random() * 0.8, drift: 0 },        // bar
    };
}

let ticks = 0;
async function tick() {
    ticks += 1;
    const readings = [];
    const now = new Date().toISOString();
    for (const m of machines) {
        for (const metric of Object.keys(baseline[m])) {
            const b = baseline[m][metric];
            b.base += b.drift;
            // small gaussian jitter around the (drifted) baseline
            const noise = (Math.random() + Math.random() + Math.random() + Math.random() - 2) * (b.base * 0.03);
            const value = Math.max(0, Number((b.base + noise).toFixed(3)));
            readings.push({
                machineId: m,
                metric,
                value,
                unit: metric === 'vibration' ? 'mm/s' : metric === 'temperature' ? 'C' : metric === 'current' ? 'A' : 'bar',
                ts: now,
                source: 'simulator',
            });
        }
    }

    try {
        const res = await fetch(BASE + '/api/sensors', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + API_KEY,
            },
            body: JSON.stringify({ readings }),
        });
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            console.error('POST /api/sensors failed', res.status, txt.slice(0, 200));
        } else if (ticks % 10 === 0) {
            const j = await res.json().catch(() => ({}));
            console.log(`[tick ${ticks}] pushed ${j.count} readings (rl.remaining=${j.rateLimit?.remaining})`);
        }
    } catch (e) {
        console.error('Network error:', e.message);
    }
}

console.log(`Streaming ${machines.length} machines × 4 metrics every ${intervalMs} ms to ${BASE}`);
const interval = setInterval(tick, intervalMs);
tick();

if (duration) {
    setTimeout(() => {
        clearInterval(interval);
        console.log('Duration elapsed. Stopping.');
        process.exit(0);
    }, parseInt(duration, 10) * 1000);
}

process.on('SIGINT', () => { clearInterval(interval); console.log('\nStopped.'); process.exit(0); });
