import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import EmbersBackground from "@/components/ui/EmbersBackground";
import { AuthProvider } from "@/components/auth/AuthContext";

export const metadata: Metadata = {
  title: "Camp Lawton Staff Hub",
  description: "Offline-first handbook and operational hub for Camp Lawton Staff.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0c0a09",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <a href="#main-content" className="skip-link">Skip to Main Content</a>
          <EmbersBackground />
          <Header />
          <main id="main-content" tabIndex={-1} style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1, outline: 'none' }}>
            {children}
          </main>
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
