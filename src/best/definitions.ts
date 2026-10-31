import { weekStart } from '../dates.js'
import {
  createTodo,
  deleteTodo,
  findTodo,
  MAX_POINTS,
  setTodoAssignee,
  setTodoDone,
  setTodoDue,
  setTodoImportant,
  setTodoPoints,
  setTodoText,
  todosFor,
  weekScores,
  type TodoStatus,
} from '../db.js'
import { isMember, listsForUser, membersOfList, renameList } from '../lists.js'
import type { Agent } from './keys.js'
import { jsonSchema, type Prop, type Shape } from './schema.js'

export class Refused extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

export type Ctx = Agent & { correlationId: string }

export type Impact = {
  categories: string[]
  confirmation: 'required' | 'recommended'
  warning?: string
}

export type CommandDef = {
  schema: string
  version: string
  commandType: string
  description: string
  impact?: Impact
  shape: Shape
  required: readonly string[]
  run: (ctx: Ctx, data: Record<string, unknown>) => Promise<void>
}

export type QueryDef = {
  schema: string
  version: string
  description: string
  shape: Shape
  required: readonly string[]
  response: Record<string, unknown>
  run: (agent: Agent, params: Record<string, string>) => Promise<unknown>
}

const listId: Prop = {
  type: 'string',
  format: 'uuid',
  description: 'Identifier of the list, as given by the lists query.',
}

const todoId: Prop = {
  type: 'string',
  format: 'uuid',
  description: 'Identifier of the todo, as given by the todos query.',
}

const title: Prop = {
  type: 'string',
  minLength: 1,
  maxLength: 500,
  description: 'What the task is, in a short line.',
}

const notes: Prop = {
  type: 'string',
  maxLength: 2000,
  nullable: true,
  description: 'Longer detail about the task. Null for none.',
}

const assigneeId: Prop = {
  type: 'string',
  format: 'uuid',
  nullable: true,
  description: 'The person responsible, as given by the members query. Null for nobody.',
}

const dueDate: Prop = {
  type: 'string',
  format: 'date',
  nullable: true,
  description: 'The day it is wanted by, as YYYY-MM-DD in Europe/London. Null for no date.',
}

const points: Prop = {
  type: 'integer',
  minimum: 1,
  maximum: MAX_POINTS,
  description: 'What completing it is worth, from 1 to 99. Bigger means more effort.',
}

const important: Prop = {
  type: 'boolean',
  description: 'Whether it should stand out above the rest of the list.',
}

const text = (value: unknown): string => String(value)

const maybeText = (value: unknown): string | null =>
  value === undefined || value === null ? null : String(value)

async function openList(agent: Agent, data: Record<string, unknown>): Promise<string> {
  const id = text(data.listId)
  if (!(await isMember(id, agent.userId))) {
    throw new Refused('LIST_NOT_FOUND', 'You are not on a list with that identifier.', {
      field: 'listId',
      listId: id,
    })
  }
  return id
}

async function openTodo(
  agent: Agent,
  data: Record<string, unknown>,
): Promise<{ list: string; todo: string }> {
  const list = await openList(agent, data)
  const todo = text(data.todoId)

  if (!(await findTodo(list, todo))) {
    throw new Refused('TODO_NOT_FOUND', 'That list holds no todo with that identifier.', {
      field: 'todoId',
      todoId: todo,
    })
  }

  return { list, todo }
}

async function checkAssignee(list: string, candidate: string | null): Promise<string | null> {
  if (candidate === null) return null

  const members = await membersOfList(list)
  if (!members.some((m) => m.id === candidate)) {
    throw new Refused('NOT_A_MEMBER', 'That person is not on this list.', {
      field: 'assigneeId',
      assigneeId: candidate,
    })
  }

  return candidate
}

export const COMMANDS: readonly CommandDef[] = [
  {
    schema: 'add-todo',
    version: '1.0',
    commandType: 'AddTodo',
    description: 'Put a new task on a list',
    shape: { listId, title, notes, assigneeId, dueDate, points, important },
    required: ['listId', 'title'],
    run: async (ctx, data) => {
      const list = await openList(ctx, data)

      await createTodo(
        list,
        ctx.userId,
        {
          title: text(data.title),
          notes: maybeText(data.notes),
          assigneeId: await checkAssignee(list, maybeText(data.assigneeId)),
          dueDate: maybeText(data.dueDate),
          important: data.important === true,
          points: typeof data.points === 'number' ? data.points : 1,
        },
        ctx.correlationId,
      )
    },
  },
  {
    schema: 'complete-todo',
    version: '1.0',
    commandType: 'CompleteTodo',
    description: 'Mark a task done and award its points to you',
    shape: { listId, todoId },
    required: ['listId', 'todoId'],
    run: async (ctx, data) => {
      const { list, todo } = await openTodo(ctx, data)
      await setTodoDone(list, todo, ctx.userId, true)
    },
  },
  {
    schema: 'reopen-todo',
    version: '1.0',
    commandType: 'ReopenTodo',
    description: 'Put a completed task back on the list and take its points back',
    shape: { listId, todoId },
    required: ['listId', 'todoId'],
    run: async (ctx, data) => {
      const { list, todo } = await openTodo(ctx, data)
      await setTodoDone(list, todo, ctx.userId, false)
    },
  },
  {
    schema: 'drop-todo',
    version: '1.0',
    commandType: 'DropTodo',
    description: 'Take a task off the list for good',
    impact: {
      categories: ['destructive'],
      confirmation: 'recommended',
      warning: 'Removes the task from the list. Nothing in the catalogue puts it back.',
    },
    shape: { listId, todoId },
    required: ['listId', 'todoId'],
    run: async (ctx, data) => {
      const { list, todo } = await openTodo(ctx, data)
      await deleteTodo(list, todo)
    },
  },
  {
    schema: 'reword-todo',
    version: '1.0',
    commandType: 'RewordTodo',
    description: 'Say what a task is in different words',
    shape: { listId, todoId, title, notes },
    required: ['listId', 'todoId', 'title', 'notes'],
    run: async (ctx, data) => {
      const { list, todo } = await openTodo(ctx, data)
      await setTodoText(list, todo, text(data.title), maybeText(data.notes))
    },
  },
  {
    schema: 'assign-todo',
    version: '1.0',
    commandType: 'AssignTodo',
    description: 'Make someone on the list responsible for a task, or no one',
    shape: { listId, todoId, assigneeId },
    required: ['listId', 'todoId', 'assigneeId'],
    run: async (ctx, data) => {
      const { list, todo } = await openTodo(ctx, data)
      await setTodoAssignee(list, todo, await checkAssignee(list, maybeText(data.assigneeId)))
    },
  },
  {
    schema: 'schedule-todo',
    version: '1.0',
    commandType: 'ScheduleTodo',
    description: 'Say which day a task is wanted by, or that no day is set',
    shape: { listId, todoId, dueDate },
    required: ['listId', 'todoId', 'dueDate'],
    run: async (ctx, data) => {
      const { list, todo } = await openTodo(ctx, data)
      await setTodoDue(list, todo, maybeText(data.dueDate))
    },
  },
  {
    schema: 'weigh-todo',
    version: '1.0',
    commandType: 'WeighTodo',
    description: 'Say what completing a task is worth',
    shape: { listId, todoId, points },
    required: ['listId', 'todoId', 'points'],
    run: async (ctx, data) => {
      const { list, todo } = await openTodo(ctx, data)
      await setTodoPoints(list, todo, data.points as number)
    },
  },
  {
    schema: 'flag-todo',
    version: '1.0',
    commandType: 'FlagTodo',
    description: 'Raise a task above the rest of the list',
    shape: { listId, todoId },
    required: ['listId', 'todoId'],
    run: async (ctx, data) => {
      const { list, todo } = await openTodo(ctx, data)
      await setTodoImportant(list, todo, true)
    },
  },
  {
    schema: 'unflag-todo',
    version: '1.0',
    commandType: 'UnflagTodo',
    description: 'Let a task sit with the rest of the list again',
    shape: { listId, todoId },
    required: ['listId', 'todoId'],
    run: async (ctx, data) => {
      const { list, todo } = await openTodo(ctx, data)
      await setTodoImportant(list, todo, false)
    },
  },
  {
    schema: 'rename-list',
    version: '1.0',
    commandType: 'RenameList',
    description: 'Call a list something else',
    shape: {
      listId,
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 60,
        description: 'What the list should be called.',
      },
    },
    required: ['listId', 'name'],
    run: async (ctx, data) => {
      const list = await openList(ctx, data)
      await renameList(list, text(data.name))
    },
  },
]

function collection(
  key: string,
  shape: Shape,
  required: string[],
  description: string,
): Record<string, unknown> {
  return {
    type: 'object',
    required: [key],
    properties: {
      [key]: { type: 'array', description, items: jsonSchema(shape, required) },
    },
    additionalProperties: false,
  }
}

const TODO_ITEM: Shape = {
  id: { type: 'string', format: 'uuid', description: 'Identifier of the todo.' },
  title: { type: 'string', description: 'What the task is.' },
  notes: { type: 'string', nullable: true, description: 'Longer detail, or null.' },
  important: { type: 'boolean', description: 'Whether it stands out above the rest.' },
  assigneeId: {
    type: 'string',
    format: 'uuid',
    nullable: true,
    description: 'Who is responsible, or null.',
  },
  assigneeName: { type: 'string', nullable: true, description: 'Their name, or null.' },
  dueDate: {
    type: 'string',
    format: 'date',
    nullable: true,
    description: 'The day it is wanted by, or null.',
  },
  points: { type: 'integer', description: 'What completing it is worth.' },
  completedAt: {
    type: 'string',
    format: 'date-time',
    nullable: true,
    description: 'When it was done, or null while it is still open.',
  },
  createdAt: { type: 'string', format: 'date-time', description: 'When it was put on the list.' },
}

export const QUERIES: readonly QueryDef[] = [
  {
    schema: 'lists',
    version: '1.0',
    description: 'The lists you are on',
    shape: {},
    required: [],
    response: collection(
      'lists',
      {
        id: { type: 'string', format: 'uuid', description: 'Identifier of the list.' },
        name: { type: 'string', description: 'What the list is called.' },
      },
      ['id', 'name'],
      'Every list this credential can reach.',
    ),
    run: async (agent) => ({ lists: await listsForUser(agent.userId) }),
  },
  {
    schema: 'todos',
    version: '1.0',
    description: 'The tasks on a list, open or already done',
    shape: {
      listId,
      status: {
        type: 'string',
        enum: ['open', 'done', 'all'],
        description: 'Which tasks to return. Defaults to open.',
      },
      since: {
        type: 'string',
        format: 'date-time',
        description: 'Only tasks added or completed at or after this RFC 3339 time.',
      },
      correlationId: {
        type: 'string',
        maxLength: 200,
        description: 'Only tasks created by the command that carried this correlation identifier.',
      },
    },
    required: ['listId'],
    response: collection(
      'todos',
      TODO_ITEM,
      ['id', 'title', 'important', 'points', 'createdAt'],
      'The tasks matching the parameters, open ones first.',
    ),
    run: async (agent, params) => {
      const list = await openList(agent, { listId: params.listId })

      const todos = await todosFor(list, {
        status: (params.status as TodoStatus | undefined) ?? 'open',
        since: params.since ?? null,
        correlationId: params.correlationId ?? null,
      })

      return {
        todos: todos.map((t) => ({
          id: t.id,
          title: t.title,
          notes: t.notes,
          important: t.important,
          assigneeId: t.assignee_id,
          assigneeName: t.assignee_name,
          dueDate: t.due_date,
          points: t.points,
          completedAt: t.completed_at,
          createdAt: t.created_at,
        })),
      }
    },
  },
  {
    schema: 'members',
    version: '1.0',
    description: 'The people on a list, and who may be made responsible for its tasks',
    shape: { listId },
    required: ['listId'],
    response: collection(
      'members',
      {
        id: { type: 'string', format: 'uuid', description: 'Identifier of the person.' },
        displayName: { type: 'string', description: 'What they are called.' },
      },
      ['id', 'displayName'],
      'Everyone on the list.',
    ),
    run: async (agent, params) => {
      const list = await openList(agent, { listId: params.listId })
      const members = await membersOfList(list)
      return { members: members.map((m) => ({ id: m.id, displayName: m.display_name })) }
    },
  },
  {
    schema: 'scores',
    version: '1.0',
    description: 'How many points each person on a list has earned since a given day',
    shape: {
      listId,
      from: {
        type: 'string',
        format: 'date',
        description: 'Count from this day onwards. Defaults to the Monday just gone.',
      },
    },
    required: ['listId'],
    response: {
      type: 'object',
      required: ['from', 'scores'],
      properties: {
        from: { type: 'string', format: 'date', description: 'The day counting started.' },
        scores: {
          type: 'array',
          description: 'Each person on the list, highest score first.',
          items: jsonSchema(
            {
              userId: { type: 'string', format: 'uuid', description: 'Identifier of the person.' },
              displayName: { type: 'string', description: 'What they are called.' },
              points: { type: 'integer', description: 'Points earned since the start day.' },
              done: { type: 'integer', description: 'Tasks completed since the start day.' },
            },
            ['userId', 'displayName', 'points', 'done'],
          ),
        },
      },
      additionalProperties: false,
    },
    run: async (agent, params) => {
      const list = await openList(agent, { listId: params.listId })
      const from = params.from ?? weekStart()
      const scores = await weekScores(list, from)

      return {
        from,
        scores: scores.map((s) => ({
          userId: s.user_id,
          displayName: s.display_name,
          points: s.points,
          done: s.done,
        })),
      }
    },
  },
]
