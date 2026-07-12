'use client';

import { useEffect, useState } from 'react';

/**
 * Returns a number that increments every time the window enters "print prep"
 * mode (fired by AppShell 700 ms before Chromium takes the print snapshot).
 * Pass the returned value as a React `key` prop on any Recharts chart wrapper
 * to force a full unmount + remount, which makes Recharts remeasure the
 * ResponsiveContainer at the CURRENT (print) viewport instead of the stale
 * on-screen size. This is the fix for "graphs render blank in the PDF".
 *
 * Usage :
 *   const printKey = usePrintPrep();
 *   <div key={printKey}><ResponsiveContainer>...</ResponsiveContainer></div>
 */
export function usePrintPrep(): number {
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const bump = () => setTick(t => t + 1);
        window.addEventListener('smartmaint-print-prep', bump);
        window.addEventListener('beforeprint', bump);
        return () => {
            window.removeEventListener('smartmaint-print-prep', bump);
            window.removeEventListener('beforeprint', bump);
        };
    }, []);
    return tick;
}
