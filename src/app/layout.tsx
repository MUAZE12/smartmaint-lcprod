import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { AppProvider } from "@/context/AppContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { DataProvider } from "@/context/DataContext";
import AppShell from "@/components/AppShell";
import { ToastProvider } from "@/components/ui/Toast";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SmartMaint — L.C PROD",
  description:
    "GMAO dédiée à L.C PROD, producteur d'huiles alimentaires : suivi des machines de réception, préparation, production, remplissage et conditionnement, interventions, pièces de rechange, achats et KPI de production.",
  manifest: "/manifest.webmanifest",
  applicationName: "SmartMaint",
  appleWebApp: {
    capable: true,
    title: "SmartMaint",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1e40af" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <AuthProvider>
          <DataProvider>
            <ThemeProvider>
              <AppProvider>
                <ToastProvider>
                  <AppShell>{children}</AppShell>
                </ToastProvider>
              </AppProvider>
            </ThemeProvider>
          </DataProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
