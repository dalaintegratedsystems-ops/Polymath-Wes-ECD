import Link from 'next/link';
import type { RenderLink } from '@wes/ui';

/** Lets the shared design system render Next.js links (prefetching, client navigation). */
export const nextRenderLink: RenderLink = ({ href, className, children, ...rest }) => (
  <Link href={href} className={className} {...rest}>
    {children}
  </Link>
);
