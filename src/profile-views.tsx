import type { FC } from 'hono/jsx'
import type { ApiKey } from './best/keys.js'
import { asColour, COLOUR_LABELS, COLOURS } from './colours.js'
import { formatDate, weekdayName } from './dates.js'
import type { DayStat, Lifetime } from './db.js'
import type { User } from './users.js'
import { Layout } from './views.js'

export const ColourPicker: FC<{ current: string }> = ({ current }) => {
  const chosen = asColour(current)

  return (
    <div id="colour-picker" class="palette">
      {COLOURS.map((c) => (
        <button
          key={c}
          type="button"
          class={c === chosen ? `swatch who-${c} chosen` : `swatch who-${c}`}
          aria-pressed={c === chosen ? 'true' : 'false'}
          hx-post={`/profile/colour/${c}`}
          hx-target="#colour-picker"
          hx-swap="outerHTML"
        >
          <span class="dot" aria-hidden="true"></span>
          {COLOUR_LABELS[c]}
        </button>
      ))}
    </div>
  )
}

const WeekChart: FC<{ days: DayStat[]; today: string }> = ({ days, today }) => {
  const top = Math.max(...days.map((d) => d.points), 1)

  return (
    <div class="chart">
      {days.map((d) => (
        <div key={d.day} class="col">
          <span class={d.points === 0 ? 'val zero' : 'val'}>{d.points}</span>
          <span class="track">
            <span
              class={d.points === 0 ? 'bar empty' : 'bar'}
              style={`height: ${Math.max((d.points / top) * 100, 1.5)}%`}
            ></span>
          </span>
          <span class={d.day === today ? 'day today' : 'day'}>{weekdayName(d.day)}</span>
        </div>
      ))}
    </div>
  )
}

const Stats: FC<{ days: DayStat[]; life: Lifetime; today: string }> = ({ days, life, today }) => (
  <section>
    <h3>Points, last 7 days</h3>

    {life.done === 0 ? (
      <p class="hint">
        Nothing completed yet. Tick something off and it will start showing up here.
      </p>
    ) : (
      <>
        <WeekChart days={days} today={today} />

        <div class="figures">
          <div class="figure">
            <span class="n">{life.done}</span>
            <span class="k">Completed</span>
          </div>
          <div class="figure">
            <span class="n">{life.points}</span>
            <span class="k">Points</span>
          </div>
          <div class="figure">
            <span class="n">{life.best}</span>
            <span class="k">Best day</span>
          </div>
        </div>

        <p class="hint">
          {life.since
            ? `Everything you have ticked off across every list you are on, since ${formatDate(life.since)}.`
            : 'Everything you have ticked off across every list you are on.'}{' '}
          The list page scores the week from Monday; this is the last seven days.
        </p>
      </>
    )}
  </section>
)

export const ApiKeys: FC<{ keys: ApiKey[]; fresh?: string; error?: string }> = ({
  keys,
  fresh,
  error,
}) => (
  <div id="api-keys" class="keys">
    {fresh && (
      <div class="fresh">
        <p>Copy this now. It is never shown again.</p>
        <code>{fresh}</code>
      </div>
    )}

    {error && <p class="error">{error}</p>}

    {keys.length > 0 && (
      <ul>
        {keys.map((k) => (
          <li key={k.id}>
            <span class="name">{k.name}</span>
            <span class="when">
              {k.last_used_at
                ? `Used ${formatDate(k.last_used_at.slice(0, 10))}`
                : `Made ${formatDate(k.created_at.slice(0, 10))}, never used`}
            </span>
            <button
              type="button"
              class="revoke"
              hx-post={`/profile/keys/${k.id}/revoke`}
              hx-target="#api-keys"
              hx-swap="outerHTML"
              hx-confirm="Revoke this key? Anything using it stops working."
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
    )}

    <form hx-post="/profile/keys" hx-target="#api-keys" hx-swap="outerHTML">
      <input type="text" name="name" placeholder="What is it for?" maxlength={60} />
      <button type="submit">Make a key</button>
    </form>
  </div>
)

export const ProfilePage: FC<{
  user: User
  days: DayStat[]
  life: Lifetime
  today: string
  keys: ApiKey[]
}> = ({ user, days, life, today, keys }) => (
  <Layout title="Profile · twodos">
    <main class="profile">
      <h1>twodos</h1>
      <h2>{user.display_name}</h2>
      <p class="email">{user.email}</p>

      <Stats days={days} life={life} today={today} />

      <section>
        <h3>Your colour</h3>
        <p class="hint">
          Todos assigned to you carry this colour on the left edge, and your name shows in it
          wherever it appears. It saves as soon as you pick.
        </p>
        <ColourPicker current={user.colour} />
      </section>

      <section>
        <h3>Agent keys</h3>
        <p class="hint">
          A key lets an assistant read your lists and change them on your behalf. It reaches your
          todos and nothing else — not your password, not your email, not who is on a list. Revoke
          one any time.
        </p>
        <ApiKeys keys={keys} />
      </section>

      <section class="later">
        <h3>Name and password</h3>
        <p class="hint">Not yet — changing these comes later.</p>
      </section>

      <p class="alt">
        <a href="/">Back to your lists</a>
      </p>
    </main>
  </Layout>
)
