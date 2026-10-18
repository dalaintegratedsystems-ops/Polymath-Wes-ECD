import type { Metadata, Viewport } from 'next';
import { Nunito } from 'next/font/google';
import type { ReactNode } from 'react';
import { ServiceWorker } from '@/components/service-worker';
import './globals.css';

// Self-hosted at build time by next/font: no request to Google from the user's phone.
const nunito = Nunito({
  subsets: ['latin'],
  weight: ['500', '700', '800', '900'],
  variable: '--font-nunito',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Wes, ECD centre helper', template: '%s · Wes' },
  description:
    'Wes helps South African ECD centres get registered, funded and running well, on your phone and on WhatsApp.',
  applicationName: 'Wes',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Wes', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FCEBCB' },
    { media: '(prefers-color-scheme: dark)', color: '#15100C' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-ZA" className={nunito.variable}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
