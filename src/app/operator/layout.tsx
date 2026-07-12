'use client';

import { Noto_Sans_Arabic } from 'next/font/google';

const notoSansArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-arabic',
  display: 'swap',
});

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" lang="ar" className={notoSansArabic.variable} style={{ fontFamily: 'var(--font-arabic), var(--font-geist-sans), system-ui, sans-serif' }}>
      {children}
    </div>
  );
}
