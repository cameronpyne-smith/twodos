const TZ = 'Europe/London'

const isoFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const weekdayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' })

const shortFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
})

const longFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function londonToday(): string {
  return isoFormat.format(new Date())
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const at = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === value
}

function dayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / 86_400_000
}

export function daysUntil(date: string, today: string = londonToday()): number {
  return dayNumber(date) - dayNumber(today)
}

export function formatDue(date: string, today: string = londonToday()): string {
  const delta = daysUntil(date, today)
  if (delta === 0) return 'Today'
  if (delta === 1) return 'Tomorrow'
  if (delta === -1) return 'Yesterday'

  const at = new Date(`${date}T00:00:00Z`)
  if (delta > 1 && delta < 7) return weekdayFormat.format(at)
  return shortFormat.format(at)
}

export function weekStart(today: string = londonToday()): string {
  const days = dayNumber(today)
  const monday = days - ((days + 3) % 7)
  return new Date(monday * 86_400_000).toISOString().slice(0, 10)
}

export function weekdayName(date: string): string {
  return weekdayFormat.format(new Date(`${date}T00:00:00Z`))
}

export function formatDate(date: string): string {
  return longFormat.format(new Date(`${date}T00:00:00Z`))
}
