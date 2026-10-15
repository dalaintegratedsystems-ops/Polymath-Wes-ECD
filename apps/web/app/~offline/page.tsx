import type { Metadata } from 'next';
import { OfflineScreen } from '@wes/ui';

export const metadata: Metadata = { title: 'Offline' };

export default function OfflinePage() {
  return <OfflineScreen />;
}
