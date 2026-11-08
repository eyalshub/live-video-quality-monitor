/**
 * Dates are always formatted in English ("8 Nov 2026, 16:59") so the UI language is consistent,
 * but in the viewer's own time zone (default) rather than UTC.
 */
export function formatDateTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(iso))
}
