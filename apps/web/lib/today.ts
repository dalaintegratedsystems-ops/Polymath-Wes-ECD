/** Dates in the centre's timezone. All our centres are in South Africa (SAST, UTC+2, no DST). */
const TZ = 'Africa/Johannesburg';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** The Monday to plan for (this week, or next week on Saturday and Sunday) and a label. */
export function planWeek(todayIso: string) {
  const d = new Date(`${todayIso}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 Sunday
  const offset = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
  const monday = new Date(d.getTime() + offset * 86_400_000);
  const friday = new Date(monday.getTime() + 4 * 86_400_000);
  const fmt = (x: Date) => `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`;
  return {
    starting: monday.toISOString().slice(0, 10),
    label: `Week of ${fmt(monday)} to ${fmt(friday)}`,
  };
}

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
