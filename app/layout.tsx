import type { Metadata } from "next";
import { Exo_2 } from 'next/font/google';

export const metadata: Metadata = {
  title: "VolleyElo",
  description: "Volleyball Elo Tracker",
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0',
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
      <body>
        {children}
      </body>
    </html>
  );
}
