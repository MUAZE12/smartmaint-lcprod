'use client';

// Background automation (runs every 90 s while the app is open):
//  A. Instant alerts  — emails on a new broken machine / low stock / overdue HACCP.
//  B. Auto-reorder    — creates a purchase requisition when a part hits its minimum.
//  C. Weekly report   — emails a 7-day activity digest once a week.

import { useEffect, useRef } from 'react';
import { useData } from '@/context/DataContext';
import { settingsDb, purchaseRequisitionsDb, purchaseRequisitionLinesDb } from '@/lib/db';

const today = () => new Date().toISOString().slice(0, 10);
const WEEK_MS = 7 * 86400000;

type Cond = { key: string; subject: string; html: string };

export default function AlertWatcher() {
    const { machines, spareParts, haccpRecords, interventions, purchaseRequisitions, purchaseRequisitionLines } = useData();
    const dataRef = useRef({ machines, spareParts, haccpRecords, interventions, purchaseRequisitions, purchaseRequisitionLines });
    dataRef.current = { machines, spareParts, haccpRecords, interventions, purchaseRequisitions, purchaseRequisitionLines };

    useEffect(() => {
        let stopped = false;

        async function check() {
            try {
                const d = dataRef.current;
                const email = (await settingsDb.get('alert_email'))?.trim();

                // ── A. Instant condition alerts ──
                if (email && (await settingsDb.get('alert_enabled')) !== 'off') {
                    const enBreak = (await settingsDb.get('alert_breakdowns')) !== 'off';
                    const enHaccp = (await settingsDb.get('alert_haccp')) !== 'off';
                    const enStock = (await settingsDb.get('alert_stock')) !== 'off';
                    const conds: Cond[] = [];

                    if (enBreak) {
                        d.machines.filter(m => m.status === 'en panne').forEach(m => conds.push({
                            key: `panne:${m.id}`,
                            subject: `🔴 Panne machine — ${m.code}`,
                            html: `<p><b>${m.code} — ${m.name}</b> est en panne (atelier ${m.workshop}).</p><p>Une intervention corrective est requise.</p>`,
                        }));
                    }
                    if (enStock) {
                        d.spareParts.filter(p => p.quantity <= p.minimumStock).forEach(p => conds.push({
                            key: `stock:${p.id}`,
                            subject: `📦 Stock critique — ${p.name}`,
                            html: `<p>La pièce <b>${p.name}</b> (${p.reference}) est en stock critique : <b>${p.quantity}</b> en stock pour un seuil de ${p.minimumStock}.</p>`,
                        }));
                    }
                    if (enHaccp) {
                        d.haccpRecords.filter(r => r.nextDueDate && r.nextDueDate < today()).forEach(r => {
                            const m = d.machines.find(x => x.id === r.machineId);
                            conds.push({
                                key: `haccp:${r.id}`,
                                subject: `🛡️ Contrôle HACCP en retard — ${m?.code ?? ''}`,
                                html: `<p>Le contrôle HACCP (${r.checkType}) sur <b>${m?.code ?? 'machine'}</b> est en retard depuis le ${r.nextDueDate}.</p>`,
                            });
                        });
                    }

                    const sentRaw = await settingsDb.get('alert_sent');
                    const sent: string[] = sentRaw ? JSON.parse(sentRaw) : [];
                    const activeKeys = conds.map(c => c.key);
                    const kept = sent.filter(k => activeKeys.includes(k));
                    const toSend = conds.filter(c => !sent.includes(c.key));
                    for (const c of toSend) {
                        if (stopped) return;
                        const res = await fetch('/api/send-alert', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ to: email, subject: c.subject,
                                html: `${c.html}<hr/><p style="color:#94a3b8;font-size:12px">SmartMaint — L.C PROD · alerte automatique</p>` }),
                        });
                        if (res.ok) kept.push(c.key);
                    }
                    if (toSend.length > 0 || kept.length !== sent.length) {
                        await settingsDb.set('alert_sent', JSON.stringify(kept));
                    }
                }

                // ── B. Spare-parts auto-reorder ──
                if ((await settingsDb.get('autoreorder_enabled')) === 'on') {
                    const openReqIds = new Set(d.purchaseRequisitions
                        .filter(r => r.status !== 'convertie' && r.status !== 'rejetée')
                        .map(r => r.id));
                    const covered = new Set(d.purchaseRequisitionLines
                        .filter(l => l.sparePartId && openReqIds.has(l.requisitionId))
                        .map(l => l.sparePartId));
                    const lowParts = d.spareParts.filter(p => p.quantity <= p.minimumStock && !covered.has(p.id));
                    let i = 0;
                    for (const p of lowParts) {
                        if (stopped) return;
                        const qty = Math.max(p.minimumStock, p.minimumStock * 2 - p.quantity);
                        const req = await purchaseRequisitionsDb.create({
                            reqNumber: 'REQ-A-' + Date.now().toString(36).toUpperCase() + (i++),
                            status: 'soumise',
                            machineId: p.machineId ?? null,
                            interventionId: null,
                            requestedBy: 'Réapprovisionnement automatique',
                            notes: `Stock critique — ${p.name} : ${p.quantity} en stock / seuil ${p.minimumStock}.`,
                        });
                        await purchaseRequisitionLinesDb.create({
                            requisitionId: req.id,
                            sparePartId: p.id,
                            quantity: qty,
                            estimatedUnitCost: p.unitCost,
                        });
                    }
                }

                // ── C. Weekly activity digest ──
                if (email && (await settingsDb.get('report_enabled')) === 'on') {
                    const lastRaw = await settingsDb.get('report_lastsent');
                    if (!lastRaw || Date.now() - Number(lastRaw) >= WEEK_MS) {
                        const weekAgo = Date.now() - WEEK_MS;
                        const recent = d.interventions.filter(x => new Date(x.startDate).getTime() >= weekAgo);
                        const row = (label: string, val: number | string, danger?: boolean) =>
                            `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${label}</td>` +
                            `<td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700;` +
                            `color:${danger ? '#dc2626' : '#1e293b'}">${val}</td></tr>`;
                        const html =
                            `<h2 style="color:#1e3a8a">Rapport hebdomadaire — SmartMaint L.C PROD</h2>` +
                            `<p>Synthèse des 7 derniers jours.</p>` +
                            `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">` +
                            row('Machines en panne', d.machines.filter(m => m.status === 'en panne').length, true) +
                            row('Machines opérationnelles', d.machines.filter(m => m.status === 'opérationnelle').length) +
                            row('Interventions en cours', d.interventions.filter(x => x.status === 'en cours').length) +
                            row('Interventions sur 7 jours', recent.length) +
                            row('Pannes correctives (7 j)', recent.filter(x => x.interventionType === 'corrective').length, true) +
                            row('Pièces en stock critique', d.spareParts.filter(p => p.quantity <= p.minimumStock).length, true) +
                            row('Contrôles HACCP en retard', d.haccpRecords.filter(r => r.nextDueDate && r.nextDueDate < today()).length, true) +
                            `</table><hr/><p style="color:#94a3b8;font-size:12px">SmartMaint — L.C PROD · rapport automatique</p>`;
                        const res = await fetch('/api/send-alert', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ to: email, subject: '📊 Rapport hebdomadaire — SmartMaint L.C PROD', html }),
                        });
                        if (res.ok) await settingsDb.set('report_lastsent', String(Date.now()));
                    }
                }
            } catch {
                // best-effort — automation must never disrupt the app
            }
        }

        check();
        const id = setInterval(check, 90000);
        return () => { stopped = true; clearInterval(id); };
    }, []);

    return null;
}
