// GET /api/metrics — Prometheus-format exposition of aggregate KPIs.
//
// Cheap-to-compute business metrics + the standard process metrics.
// Scrape this from Grafana Cloud, Datadog, or any Prometheus.
//
// Auth: CRON_SECRET Bearer (same gate as /api/cron/*). Public metrics
// endpoints are a classic mistake — this one exposes MTBF averages
// which is competitive intel.

import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function line(name: string, help: string, type: 'gauge' | 'counter', value: number, labels?: Record<string, string>): string {
    const labelStr = labels
        ? '{' + Object.entries(labels).map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`).join(',') + '}'
        : '';
    return `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${name}${labelStr} ${value}\n`;
}

export async function GET(request: Request) {
    const auth = request.headers.get('authorization') ?? '';
    const expected = process.env.CRON_SECRET;
    if (expected && auth !== `Bearer ${expected}`) {
        return new Response('unauthorized', { status: 401 });
    }

    const parts: string[] = [];

    // Process metrics
    const mem = process.memoryUsage();
    parts.push(line('smartmaint_process_uptime_seconds', 'Node uptime in seconds', 'counter', Math.round(process.uptime())));
    parts.push(line('smartmaint_process_memory_rss_bytes', 'Resident set size', 'gauge', mem.rss));
    parts.push(line('smartmaint_process_memory_heap_used_bytes', 'V8 heap in use', 'gauge', mem.heapUsed));

    // Business metrics from Supabase
    try {
        const ctx = getSupabaseServerClient();
        const sb = ctx?.client;
        if (sb) {
            const [machines, interventions, breakdowns] = await Promise.all([
                sb.from('machines').select('id', { count: 'exact', head: true }),
                sb.from('interventions').select('id', { count: 'exact', head: true }),
                sb.from('machines').select('id', { count: 'exact', head: true }).eq('status', 'en panne'),
            ]);
            parts.push(line('smartmaint_machines_total', 'Machines in the fleet', 'gauge', machines.count ?? 0));
            parts.push(line('smartmaint_interventions_total', 'Total interventions recorded', 'counter', interventions.count ?? 0));
            parts.push(line('smartmaint_machines_broken', 'Machines currently in "en panne" status', 'gauge', breakdowns.count ?? 0));
        }
    } catch { /* fall through — cheap metrics still emitted */ }

    return new Response(parts.join(''), {
        status: 200,
        headers: { 'Content-Type': 'text/plain; version=0.0.4' },
    });
}
