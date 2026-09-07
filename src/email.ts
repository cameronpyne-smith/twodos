import nodemailer from 'nodemailer'

type Mail = { to: string; subject: string; text: string }

function transport() {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) return null

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: true,
    auth: { user, pass },
  })
}

async function send(mail: Mail): Promise<void> {
  const mailer = transport()

  if (!mailer) {
    console.warn(
      `SMTP is not configured (set SMTP_USER and SMTP_PASS). Email to ${mail.to} not sent:\n${mail.text}`,
    )
    return
  }

  await mailer.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
  })
}

export async function sendPasswordReset(to: string, resetUrl: string): Promise<void> {
  await send({
    to,
    subject: 'Reset your twodos password',
    text: `Someone asked to reset the twodos password for this address.

Open this link within the hour to choose a new one:

${resetUrl}

If it wasn't you, ignore this email and nothing will change.`,
  })
}
