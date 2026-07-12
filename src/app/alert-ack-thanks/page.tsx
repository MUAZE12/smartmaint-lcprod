import { Suspense } from 'react';
import { CheckCircle2, AlertCircle, Inbox } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface Props { searchParams: Promise<{ status?: string; subject?: string }> }

export default async function AlertAckThanks({ searchParams }: Props) {
    const { status = 'ok', subject = '' } = await searchParams;
    return (
        <Suspense fallback={null}>
            <Page status={status} subject={subject} />
        </Suspense>
    );
}

function Page({ status, subject }: { status: string; subject: string }) {
    const cfg = status === 'ok' ? {
        bg: 'linear-gradient(135deg, #16a34a, #15803d)',
        Icon: CheckCircle2,
        titleFr: 'Bien reçu — alerte prise en charge',
        titleAr: 'تمّ التأكيد — تمّ استلام التنبيه',
        descFr: 'Merci. Votre prise en charge est enregistrée dans le journal d\'audit.',
        descAr: 'شكراً. تمّ تسجيل استلامك في سجلّ التدقيق.',
    } : status === 'already' ? {
        bg: 'linear-gradient(135deg, #3b82f6, #1e40af)',
        Icon: Inbox,
        titleFr: 'Alerte déjà acquittée',
        titleAr: 'تنبيه مسجَّل مسبقاً',
        descFr: 'Quelqu\'un de votre équipe a déjà confirmé la prise en charge de cette alerte.',
        descAr: 'أحد أعضاء فريقك أكّد استلام هذا التنبيه سابقاً.',
    } : {
        bg: 'linear-gradient(135deg, #dc2626, #b91c1c)',
        Icon: AlertCircle,
        titleFr: 'Lien expiré ou invalide',
        titleAr: 'الرابط منتهي أو غير صالح',
        descFr: 'Ce lien d\'acquittement n\'est plus valide. Ouvrez l\'application pour gérer l\'alerte manuellement.',
        descAr: 'هذا الرابط لم يعد صالحاً. افتح التطبيق للتعامل مع التنبيه يدوياً.',
    };
    const Icon = cfg.Icon;

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, background: '#f8fafc', fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif',
        }}>
            <div style={{ maxWidth: 520, width: '100%', background: 'white', borderRadius: 22, padding: 40, boxShadow: '0 24px 64px rgba(0,0,0,0.08)', textAlign: 'center' }}>
                <div style={{
                    width: 78, height: 78, borderRadius: '50%', margin: '0 auto 20px',
                    background: cfg.bg, color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
                }}><Icon size={42} /></div>

                <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{cfg.titleFr}</h1>
                <p style={{ fontSize: 13.5, color: '#475569', marginBottom: 18 }}>{cfg.descFr}</p>

                <div dir="rtl" style={{ borderTop: '1px solid #e2e8f0', paddingTop: 18 }}>
                    <h2 style={{ fontSize: 19, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{cfg.titleAr}</h2>
                    <p style={{ fontSize: 13.5, color: '#475569' }}>{cfg.descAr}</p>
                </div>

                {subject && (
                    <div style={{ marginTop: 24, padding: '12px 16px', background: '#f1f5f9', borderRadius: 12, fontSize: 12.5, color: '#475569' }}>
                        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 4 }}>Alerte</div>
                        {subject}
                    </div>
                )}

                <a href="/" style={{ display: 'inline-block', marginTop: 28, padding: '12px 26px', borderRadius: 10, background: '#1e40af', color: 'white', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                    Ouvrir SmartMaint
                </a>
            </div>
        </div>
    );
}
