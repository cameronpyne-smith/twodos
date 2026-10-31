import { COMMANDS } from './definitions.js'

export const BEST_VERSION = '0.9.19'

export const MOUNT = '/best'

export function endpoint(base: string): string {
  return `${base}${MOUNT}/`
}

export function manifest(base: string): Record<string, unknown> {
  return {
    best: {
      version: BEST_VERSION,
      authentication: {
        type: 'apiKey',
        scheme: 'X-Api-Key',
        in: 'header',
        docs: 'https://github.com/cameronpyne-smith/twodos#best',
      },
      services: {
        'io.best.agents': {
          version: BEST_VERSION,
          description:
            'A shared todo list for a household: what needs doing, who it falls to, when it is wanted by, and what each task is worth.',
          spec: 'https://behavioralstate.io/specs/agents',
          http: { endpoint: endpoint(base) },
        },
      },
      capabilities: [
        {
          name: 'io.best.agents.commands',
          version: BEST_VERSION,
          description:
            'Changes a person can ask for on a list they are on, and on the tasks it holds.',
          spec: 'https://behavioralstate.io/specs/agents/commands',
          schema: 'https://behavioralstate.io/v1/schemas/agents/commands.json',
          status: 'active',
          endpoints: [
            { method: 'GET', path: '/commands', description: 'Catalogue of accepted command types.' },
            { method: 'POST', path: '/commands', description: 'Submit one command for processing.' },
            {
              method: 'GET',
              path: '/commands/{schema}/{version}',
              description: 'Schema document for one command type at one version.',
            },
          ],
        },
        {
          name: 'io.best.agents.queries',
          version: BEST_VERSION,
          description:
            'What a list currently holds: its tasks, the people on it, and the points they have earned.',
          spec: 'https://behavioralstate.io/specs/agents/queries',
          schema: 'https://behavioralstate.io/v1/schemas/agents/queries.json',
          status: 'active',
          endpoints: [
            { method: 'GET', path: '/queries', description: 'Catalogue of available reads.' },
            {
              method: 'GET',
              path: '/queries/{schema}/{version}',
              description: 'Schema document for one read at one version.',
            },
            {
              method: 'GET',
              path: '/queries/{schema}',
              description: 'Run one read and return its result.',
            },
          ],
        },
      ],
      agents: [
        {
          id: 'twodos',
          name: 'Shared todos',
          description:
            'Keeps a household list of what needs doing, who each task falls to, and what finishing it is worth.',
          type: 'todo-list',
          accepts: COMMANDS.map((c) => c.commandType),
          produces: [],
          status: 'running',
        },
      ],
    },
  }
}
