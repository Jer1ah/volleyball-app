import type { Metadata, Viewport } from "next"; // Added Viewport type
import { Exo_2 } from 'next/font/google';

// 1. Move viewport settings to their own dedicated export
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // This replaces user-scalable=0
};

// 2. Keep other metadata here (remove viewport from this object)
export const metadata: Metadata = {
  title: "VolleyElo",
  description: "Volleyball Elo Tracker",
};

const exo2 = Exo_2({
  subsets: ['latin'],
  display: 'swap',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={exo2.className}>
      <body style={{ margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
