import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ark Demos',
  description: 'Explore Ark AI agent demonstrations',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
