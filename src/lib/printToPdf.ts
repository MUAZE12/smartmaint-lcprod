// ============================================================
// PDF export via the browser's own print engine.
//
// Why this works: the browser renders the LIVE DOM, so Recharts SVGs,
// canvases, images and every CSS feature just work — no rasterization,
// no library, no chance of a "blank canvas". The user chooses "Save as
// PDF" in the print dialog (default destination on modern browsers).
//
// Trade-off: one extra click compared to a direct download. We accept
// that because it means charts ACTUALLY appear.
// ============================================================

interface PdfOptions {
    filename?: string;
    background?: string;
}

export async function exportElementToPdf(
    el: HTMLElement | null | undefined,
    opts: PdfOptions = {},
): Promise<{ ok: boolean; error?: string }> {
    if (!el) return { ok: false, error: 'Élément introuvable' };

    // 1. Let interested components (Recharts wrappers, etc.) prep for print
    //    — the reports page listens for this to force each chart to its
    //    committed size before we snapshot.
    try {
        window.dispatchEvent(new CustomEvent('smartmaint-print-prep'));
        window.dispatchEvent(new Event('resize'));
    } catch { /* ignore */ }

    // 2. Reset CSS `zoom` — some browsers ignore it in print but a stale
    //    inline value can still throw off SVG layout. Restored after.
    const html = document.documentElement as HTMLElement & { style: CSSStyleDeclaration & { zoom?: string } };
    const savedZoom = html.style.zoom || '';
    html.style.zoom = '';

    // 3. Set the document title so it becomes the default filename in the
    //    print dialog. Restored after.
    const savedTitle = document.title;
    if (opts.filename) {
        document.title = opts.filename.replace(/\.pdf$/i, '');
    }

    // 4. Give the layout ~700 ms to settle (Recharts ResponsiveContainer
    //    recomputes on resize + tick).
    await new Promise<void>(r => setTimeout(r, 700));
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    try {
        // Native print — the browser handles pagination, page size, colours,
        // SVGs, images, everything. User picks "Save as PDF" (default on
        // Chromium, Firefox and Safari).
        window.print();
        return { ok: true };
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[printToPdf] print failed:', err);
        return { ok: false, error: `Export PDF échoué : ${err instanceof Error ? err.message : String(err)}` };
    } finally {
        if (savedZoom) html.style.zoom = savedZoom;
        document.title = savedTitle;
    }
}

export async function exportMainToPdf(filename?: string) {
    const el = document.querySelector('main') as HTMLElement | null;
    return exportElementToPdf(el ?? document.body, { filename });
}
