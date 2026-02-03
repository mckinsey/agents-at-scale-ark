import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ARK Demos',
  description: 'Explore ARK demonstrations',
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
