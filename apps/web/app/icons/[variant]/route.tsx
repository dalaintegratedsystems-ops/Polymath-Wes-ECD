import { ImageResponse } from 'next/og';

/** App icons rendered at build time: a sparkle on sunbaked clay. Placeholder until <<BRAND_ASSETS>>. */
export const dynamic = 'force-static';

const VARIANTS = { '192': { size: 192, pad: 0.2 }, '512': { size: 512, pad: 0.2 }, maskable: { size: 512, pad: 0.32 } } as const;

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  const v = VARIANTS[variant as keyof typeof VARIANTS] ?? VARIANTS['512'];
  const glyph = Math.round(v.size * (1 - v.pad * 2));
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #E9A93F 0%, #B04E24 70%)',
          borderRadius: variant === 'maskable' ? 0 : v.size * 0.22,
        }}
      >
        <svg width={glyph} height={glyph} viewBox="0 0 24 24">
          <path
            d="M12 2.5c.7 4.6 3 6.9 7.6 7.6-4.6.7-6.9 3-7.6 7.6-.7-4.6-3-6.9-7.6-7.6 4.6-.7 6.9-3 7.6-7.6Z"
            fill="#FFFFFF"
          />
          <circle cx="19" cy="18.5" r="2" fill="#FCEBCB" />
        </svg>
      </div>
    ),
    { width: v.size, height: v.size },
  );
}
