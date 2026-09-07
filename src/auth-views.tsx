import type { FC, PropsWithChildren } from 'hono/jsx'
import { Layout } from './views.js'

const Card: FC<PropsWithChildren<{ heading: string; error?: string; note?: string }>> = ({
  heading,
  error,
  note,
  children,
}) => (
  <main class="auth">
    <h1>twodos</h1>
    <h2>{heading}</h2>
    {error && <p class="error">{error}</p>}
    {note && <p class="note">{note}</p>}
    {children}
  </main>
)

export const LoginPage: FC<{ error?: string; email?: string; notice?: string }> = ({
  error,
  email,
  notice,
}) => (
  <Layout title="Sign in · twodos">
    <Card heading="Sign in" error={error} note={notice}>
      <form method="post" action="/login">
        <label>
          Email
          <input type="email" name="email" value={email ?? ''} autocomplete="email" required />
        </label>
        <label>
          Password
          <input type="password" name="password" autocomplete="current-password" required />
        </label>
        <button type="submit">Sign in</button>
      </form>
      <p class="alt">
        <a href="/forgot">Forgot your password?</a>
      </p>
      <p class="alt">
        No account? <a href="/signup">Create one</a>
      </p>
    </Card>
  </Layout>
)

export const SignupPage: FC<{ error?: string; email?: string; displayName?: string }> = ({
  error,
  email,
  displayName,
}) => (
  <Layout title="Create an account · twodos">
    <Card heading="Create an account" error={error}>
      <form method="post" action="/signup">
        <label>
          Your name
          <input
            type="text"
            name="display_name"
            value={displayName ?? ''}
            autocomplete="name"
            maxlength={80}
            required
          />
        </label>
        <label>
          Email
          <input type="email" name="email" value={email ?? ''} autocomplete="email" required />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            autocomplete="new-password"
            minlength={10}
            required
          />
          <small>At least 10 characters.</small>
        </label>
        <button type="submit">Create account</button>
      </form>
      <p class="alt">
        Already have one? <a href="/login">Sign in</a>
      </p>
    </Card>
  </Layout>
)

export const ForgotPage: FC<{ sent?: boolean; error?: string }> = ({ sent, error }) => (
  <Layout title="Reset your password · twodos">
    <Card
      heading="Reset your password"
      error={error}
      note={
        sent
          ? 'If that address has an account, a reset link is on its way. The link expires in an hour.'
          : undefined
      }
    >
      {!sent && (
        <form method="post" action="/forgot">
          <label>
            Email
            <input type="email" name="email" autocomplete="email" required />
          </label>
          <button type="submit">Send reset link</button>
        </form>
      )}
      <p class="alt">
        <a href="/login">Back to sign in</a>
      </p>
    </Card>
  </Layout>
)

export const ResetPage: FC<{ token: string; error?: string; expired?: boolean }> = ({
  token,
  error,
  expired,
}) => (
  <Layout title="Choose a new password · twodos">
    <Card heading="Choose a new password" error={error}>
      {expired ? (
        <p>
          That link has expired or already been used. <a href="/forgot">Request a new one</a>.
        </p>
      ) : (
        <form method="post" action={`/reset/${token}`}>
          <label>
            New password
            <input
              type="password"
              name="password"
              autocomplete="new-password"
              minlength={10}
              required
            />
            <small>At least 10 characters.</small>
          </label>
          <button type="submit">Set password</button>
        </form>
      )}
    </Card>
  </Layout>
)
