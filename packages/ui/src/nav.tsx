import type { ComponentType, ReactNode, SVGProps } from 'react';
import { ChildrenIcon, HomeIcon, PlanIcon, RegistrationIcon, WesIcon } from './icons';
import { cx } from './primitives';

export type NavKey = 'home' | 'plan' | 'children' | 'registration' | 'wes';

export const NAV_ITEMS: { key: NavKey; label: string; href: string; Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }> }[] = [
  { key: 'home', label: 'Home', href: '/', Icon: HomeIcon },
  { key: 'plan', label: 'Plan', href: '/plan', Icon: PlanIcon },
  { key: 'children', label: 'Children', href: '/children', Icon: ChildrenIcon },
  { key: 'registration', label: 'Registration', href: '/registration', Icon: RegistrationIcon },
  { key: 'wes', label: 'Ask Wes', href: '/wes', Icon: WesIcon },
];

export type RenderLink = (props: {
  href: string;
  className: string;
  children: ReactNode;
  'aria-current'?: 'page';
}) => ReactNode;

export const defaultRenderLink: RenderLink = ({ href, className, children, ...rest }) => (
  <a href={href} className={className} {...rest}>
    {children}
  </a>
);

/** Bottom navigation: five destinations, icon + label, 56px tall, thumb-reachable. */
export function BottomNav({ active, renderLink = defaultRenderLink }: { active: NavKey; renderLink?: RenderLink }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-surface/85"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {NAV_ITEMS.map(({ key, label, href, Icon }) => {
          const isActive = key === active;
          return (
            <li key={key}>
              {renderLink({
                href,
                'aria-current': isActive ? 'page' : undefined,
                className: cx(
                  'group flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 pt-1.5 pb-1',
                  'text-[0.6875rem] leading-tight font-extrabold tracking-tight',
                  isActive ? 'text-primary' : 'text-ink-muted',
                ),
                children: (
                  <>
                    <span
                      className={cx(
                        'grid h-7 w-12 place-items-center rounded-full transition-colors',
                        isActive && 'bg-brand-soft',
                      )}
                    >
                      <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                    </span>
                    <span className="max-w-full truncate">{label}</span>
                  </>
                ),
              })}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
