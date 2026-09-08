export const COLOURS = [
  'amber',
  'teal',
  'indigo',
  'rose',
  'olive',
  'plum',
  'slate',
  'rust',
  'pink',
  'ice',
] as const

export type Colour = (typeof COLOURS)[number]

export const DEFAULT_COLOUR: Colour = 'amber'

export const COLOUR_LABELS: Record<Colour, string> = {
  amber: 'Amber',
  teal: 'Teal',
  indigo: 'Indigo',
  rose: 'Rose',
  olive: 'Olive',
  plum: 'Plum',
  slate: 'Slate',
  rust: 'Rust',
  pink: 'Pink',
  ice: 'Ice',
}

export function isColour(value: string | null | undefined): value is Colour {
  return typeof value === 'string' && (COLOURS as readonly string[]).includes(value)
}

export function asColour(value: string | null | undefined): Colour {
  return isColour(value) ? value : DEFAULT_COLOUR
}

export function randomColour(): Colour {
  return COLOURS[Math.floor(Math.random() * COLOURS.length)] ?? DEFAULT_COLOUR
}

export function nextColour(taken: readonly string[]): Colour {
  const free = COLOURS.find((c) => !taken.includes(c))
  return free ?? COLOURS[taken.length % COLOURS.length] ?? DEFAULT_COLOUR
}
