import { HomeScreen, demo } from '@wes/ui';
import { nextRenderLink } from '@/lib/render-link';
import { sastNow } from '@/lib/today';

// Milestone 0 renders demo data. Milestone 1 replaces it with the signed-in centre's data.
export const dynamic = 'force-dynamic';

export default function HomePage() {
  const now = sastNow();
  return (
    <HomeScreen
      data={{ ...demo.demoHome, hour: now.hour, dateLabel: now.dateLabel }}
      renderLink={nextRenderLink}
    />
  );
}
