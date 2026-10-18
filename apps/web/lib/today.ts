/** Dates in the centre's timezone. All our centres are in South Africa (SAST, UTC+2, no DST). */
const TZ = 'Africa/Johannesburg';

export function sastNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-ZA', {
      timeZone: TZ,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekdayShort = new Intl.DateTimeFormat('en-ZA', { timeZone: TZ, weekday: 'short' })
    .format(now)
    .toLowerCase()
    .slice(0, 3);
  return {
    hour: Number(parts.hour),
    dateLabel: `${parts.weekday} ${parts.day} ${parts.month}`,
    weekdayKey: weekdayShort,
    /** Today's date in SAST as YYYY-MM-DD. */
    iso: new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now),
  };
}
