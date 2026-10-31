export type Prop = {
  type: 'string' | 'integer' | 'boolean'
  description: string
  format?: 'uuid' | 'date' | 'date-time'
  enum?: readonly string[]
  pattern?: string
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  nullable?: boolean
}

export type Shape = Record<string, Prop>

export type Problem = { field: string; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/

export function jsonSchema(shape: Shape, required: readonly string[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {}

  for (const [name, prop] of Object.entries(shape)) {
    const node: Record<string, unknown> = {
      type: prop.nullable ? [prop.type, 'null'] : prop.type,
      description: prop.description,
    }

    if (prop.format) node.format = prop.format
    if (prop.enum) node.enum = [...prop.enum]
    if (prop.pattern) node.pattern = prop.pattern
    if (prop.minLength !== undefined) node.minLength = prop.minLength
    if (prop.maxLength !== undefined) node.maxLength = prop.maxLength
    if (prop.minimum !== undefined) node.minimum = prop.minimum
    if (prop.maximum !== undefined) node.maximum = prop.maximum

    properties[name] = node
  }

  return {
    type: 'object',
    properties,
    required: [...required],
    additionalProperties: false,
  }
}

function checkValue(name: string, prop: Prop, value: unknown): Problem | null {
  if (value === null) {
    return prop.nullable ? null : { field: name, message: `${name} must not be null.` }
  }

  if (prop.type === 'boolean') {
    return typeof value === 'boolean' ? null : { field: name, message: `${name} must be a boolean.` }
  }

  if (prop.type === 'integer') {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return { field: name, message: `${name} must be an integer.` }
    }
    if (prop.minimum !== undefined && value < prop.minimum) {
      return { field: name, message: `${name} must be at least ${prop.minimum}.` }
    }
    if (prop.maximum !== undefined && value > prop.maximum) {
      return { field: name, message: `${name} must be at most ${prop.maximum}.` }
    }
    return null
  }

  if (typeof value !== 'string') return { field: name, message: `${name} must be a string.` }

  if (prop.enum && !prop.enum.includes(value)) {
    return { field: name, message: `${name} must be one of: ${prop.enum.join(', ')}.` }
  }
  if (prop.minLength !== undefined && value.length < prop.minLength) {
    return { field: name, message: `${name} must be at least ${prop.minLength} characters.` }
  }
  if (prop.maxLength !== undefined && value.length > prop.maxLength) {
    return { field: name, message: `${name} must be at most ${prop.maxLength} characters.` }
  }
  if (prop.pattern && !new RegExp(prop.pattern).test(value)) {
    return { field: name, message: `${name} is not in the expected form.` }
  }
  if (prop.format === 'uuid' && !UUID.test(value)) {
    return { field: name, message: `${name} must be a UUID.` }
  }
  if (prop.format === 'date' && !DATE.test(value)) {
    return { field: name, message: `${name} must be a date as YYYY-MM-DD.` }
  }
  if (prop.format === 'date-time' && !DATE_TIME.test(value)) {
    return { field: name, message: `${name} must be an RFC 3339 timestamp.` }
  }

  return null
}

export function validate(
  shape: Shape,
  required: readonly string[],
  data: unknown,
): Problem[] {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return [{ field: 'data', message: 'data must be an object.' }]
  }

  const values = data as Record<string, unknown>
  const problems: Problem[] = []

  for (const name of Object.keys(values)) {
    if (!(name in shape)) problems.push({ field: name, message: `${name} is not a known field.` })
  }

  for (const name of required) {
    if (values[name] === undefined) problems.push({ field: name, message: `${name} is required.` })
  }

  for (const [name, prop] of Object.entries(shape)) {
    const value = values[name]
    if (value === undefined) continue
    const problem = checkValue(name, prop, value)
    if (problem) problems.push(problem)
  }

  return problems
}
