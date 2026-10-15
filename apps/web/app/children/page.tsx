import type { Metadata } from 'next';
import { demo } from '@wes/ui';
import { ChildrenView } from '@/components/views';

export const metadata: Metadata = { title: 'Children' };

export default function ChildrenPage() {
  return (
    <ChildrenView
      childrenList={demo.demoChildren}
      groups={demo.demoGroups}
      todayIso={new Date().toISOString()}
      demo
    />
  );
}
