import nodemailer from 'nodemailer'

export const DEFAULT_FROM_EMAIL = 'CivicConnect <noreply@civicconnect.gov>'

/**
 * Determine email provider configuration from environment variables
 *
 * Supported providers:
 * - sendgrid: SENDGRID_API_KEY
 * - postmark: POSTMARK_SERVER_TOKEN
 * - smtp: SMTP_HOST (plus SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE)
 * - fallback: when no credentials or unconfigured
 */
export function getEmailConfig(env = process.env) {
  const from = env.EMAIL_FROM || env.FROM_EMAIL || DEFAULT_FROM_EMAIL
  const provider = (env.EMAIL_PROVIDER || '').toLowerCase()

  if (provider === 'sendgrid' || env.SENDGRID_API_KEY) {
    const apiKey = env.SENDGRID_API_KEY
    if (!apiKey) {
      return { provider: 'fallback', from, reason: 'Missing SENDGRID_API_KEY' }
    }
    return {
      provider: 'sendgrid',
      from,
      apiKey,
      transportOptions: {
        host: env.SENDGRID_HOST || 'smtp.sendgrid.net',
        port: Number(env.SENDGRID_PORT) || 587,
        secure: env.SENDGRID_SECURE === 'true',
        auth: {
          user: 'apikey',
          pass: apiKey,
        },
      },
    }
  }

  if (provider === 'postmark' || env.POSTMARK_SERVER_TOKEN) {
    const serverToken = env.POSTMARK_SERVER_TOKEN
    if (!serverToken) {
      return { provider: 'fallback', from, reason: 'Missing POSTMARK_SERVER_TOKEN' }
    }
    return {
      provider: 'postmark',
      from,
      serverToken,
      transportOptions: {
        host: env.POSTMARK_HOST || 'smtp.postmarkapp.com',
        port: Number(env.POSTMARK_PORT) || 587,
        secure: env.POSTMARK_SECURE === 'true',
        auth: {
          user: serverToken,
          pass: serverToken,
        },
      },
    }
  }

  if (provider === 'smtp' || env.SMTP_HOST) {
    const host = env.SMTP_HOST
    if (!host) {
      return { provider: 'fallback', from, reason: 'Missing SMTP_HOST' }
    }
    const transportOptions = {
      host,
      port: Number(env.SMTP_PORT) || 587,
      secure: env.SMTP_SECURE === 'true' || env.SMTP_PORT === '465',
    }
    if (env.SMTP_USER || env.SMTP_PASS) {
      transportOptions.auth = {
        user: env.SMTP_USER || '',
        pass: env.SMTP_PASS || '',
      }
    }
    return {
      provider: 'smtp',
      from,
      transportOptions,
    }
  }

  return {
    provider: 'fallback',
    from,
    reason: 'No SMTP or provider credentials configured',
  }
}

/**
 * Fallback transport that logs warnings instead of crashing
 */
export function createFallbackTransport(reason = 'Credentials not configured') {
  return {
    isFallback: true,
    async sendMail(mailOptions) {
      console.warn(
        `[EmailNotification] Fallback transport: email to ${mailOptions.to} ("${mailOptions.subject}") not sent. Reason: ${reason}`
      )
      return {
        messageId: `<mock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@civicconnect.local>`,
        accepted: [mailOptions.to],
        rejected: [],
        pending: [],
        response: '250 Mock message queued by fallback transporter',
        fallback: true,
      }
    },
  }
}

/**
 * Create a Nodemailer transporter based on config or environment
 */
export function createTransporter(options = {}) {
  const env = options.env || process.env
  const config = options.config || getEmailConfig(env)

  if (config.provider === 'fallback') {
    console.warn(`[EmailNotification] Warning: ${config.reason || 'No email credentials configured'}. Using fallback transporter.`)
    return createFallbackTransport(config.reason)
  }

  try {
    return nodemailer.createTransport(config.transportOptions)
  } catch (err) {
    console.warn('[EmailNotification] Failed to initialize nodemailer transporter, falling back:', err.message)
    return createFallbackTransport(err.message)
  }
}

/**
 * Dispatch an email with graceful error recovery (never throws)
 */
export async function sendEmail(mailOptions, customTransporter = null, env = process.env) {
  try {
    const config = getEmailConfig(env)
    const transporter = customTransporter || createTransporter({ config, env })

    const finalMailOptions = {
      from: mailOptions.from || config.from || DEFAULT_FROM_EMAIL,
      to: mailOptions.to,
      subject: mailOptions.subject,
      text: mailOptions.text,
      html: mailOptions.html,
      replyTo: mailOptions.replyTo || config.from || DEFAULT_FROM_EMAIL,
      ...mailOptions,
    }

    if (!finalMailOptions.to) {
      console.warn('[EmailNotification] sendEmail skipped: recipient "to" address is missing')
      return { success: false, error: 'Recipient "to" address is required' }
    }

    const info = await transporter.sendMail(finalMailOptions)
    return {
      success: true,
      messageId: info.messageId,
      fallback: Boolean(info.fallback),
      info,
    }
  } catch (error) {
    console.warn('[EmailNotification] Error occurred while sending email:', error.message)
    return {
      success: false,
      error: error.message,
    }
  }
}

