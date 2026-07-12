import type { Machine, Intervention, SparePart, PurchaseOrder, MaintenancePlan } from './types';
import type { UserRole } from '@/context/AuthContext';

export interface Notification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  icon: string;
  color: string;
  link: string;
}

interface LiveData {
  machines: Machine[];
  interventions: Intervention[];
  spareParts: SparePart[];
  purchaseOrders: PurchaseOrder[];
  maintenancePlans: MaintenancePlan[];
}

/**
 * Build the notification feed from LIVE Supabase data — no mock content.
 * Surfaces: broken machines, overdue preventive plans, low stock,
 * POs awaiting approval, interventions awaiting validation.
 */
export function buildLiveNotifications(d: LiveData, role: UserRole): Notification[] {
  const notifs: Notification[] = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Broken machines — relevant to everyone
  d.machines.filter(m => m.status === 'en panne').forEach(m => {
    notifs.push({
      id: `panne-${m.id}`, title: 'Machine en panne',
      message: `${m.code} — ${m.name} est à l'arrêt`,
      timestamp: m.createdAt, icon: '🔴', color: '#ef4444', link: `/machines/${m.id}`,
    });
  });

  // Overdue preventive maintenance — admin + technician
  if (role !== 'operator') {
    d.maintenancePlans
      .filter(p => p.active && p.nextDueDate && new Date(p.nextDueDate) < today)
      .forEach(p => {
        const m = d.machines.find(x => x.id === p.machineId);
        notifs.push({
          id: `plan-${p.id}`, title: 'Maintenance préventive en retard',
          message: `${m?.code || ''} — ${p.title}`,
          timestamp: p.nextDueDate as string, icon: '📅', color: '#f59e0b', link: '/maintenance-plans',
        });
      });
  }

  // Admin-only operational alerts
  if (role === 'admin') {
    d.spareParts.filter(p => p.quantity <= p.minimumStock).forEach(p => {
      const out = p.quantity === 0;
      notifs.push({
        id: `stock-${p.id}`, title: out ? 'Rupture de stock' : 'Stock critique',
        message: `${p.name} (${p.reference}) — ${p.quantity} en stock`,
        timestamp: p.createdAt, icon: out ? '⚠️' : '📦', color: out ? '#ef4444' : '#f59e0b', link: '/spare-parts',
      });
    });
    d.purchaseOrders.filter(po => po.approvalStatus === 'en attente').forEach(po => {
      notifs.push({
        id: `po-${po.id}`, title: 'Bon de commande à approuver',
        message: `${po.poNumber} — ${(po.totalAmount || 0).toLocaleString('fr-FR')} MAD`,
        timestamp: po.createdAt, icon: '🧾', color: '#8b5cf6', link: '/approvals',
      });
    });
    d.interventions.filter(i => i.status === 'terminée').forEach(i => {
      const m = d.machines.find(x => x.id === i.machineId);
      notifs.push({
        id: `valid-${i.id}`, title: 'Intervention à valider',
        message: `${m?.code || ''} — ${i.description}`,
        timestamp: i.createdAt, icon: '📋', color: '#3b82f6', link: '/approvals',
      });
    });
  }

  return notifs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
