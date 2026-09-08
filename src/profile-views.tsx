import type { FC } from 'hono/jsx'
import { asColour, COLOUR_LABELS, COLOURS } from './colours.js'
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

export const ProfilePage: FC<{ user: User }> = ({ user }) => (
  <Layout title="Profile · twodos">
    <main class="profile">
      <h1>twodos</h1>
      <h2>{user.display_name}</h2>
      <p class="email">{user.email}</p>

      <section>
        <h3>Your colour</h3>
        <p class="hint">
          Todos assigned to you carry this colour on the left edge, and your name shows in it
          wherever it appears. It saves as soon as you pick.
        </p>
        <ColourPicker current={user.colour} />
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
