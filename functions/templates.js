/**
 * Civic-Connect Transactional Email Templates
 *
 * Clean, responsive, and accessible HTML/text email templates for:
 * 1. Complaint Submission Receipt (tracking ID, category, priority, tracking link)
 * 2. Complaint Status Resolution (officer notes, resolution photos, feedback/rating link)
 */

function sanitizeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function getPriorityBadgeColor(priority = '') {
  const p = String(priority).toLowerCase()
  if (p === 'critical' || p === 'urgent') return { bg: '#fee2e2', text: '#991b1b', border: '#f87171' }
  if (p === 'high') return { bg: '#ffedd5', text: '#9a3412', border: '#fb923c' }
  if (p === 'low') return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' }
  return { bg: '#dbeafe', text: '#1e40af', border: '#60a5fa' } // Medium / Default
}

/**
 * Generate Complaint Submission Receipt Email Template
 */
export function generateSubmissionReceiptTemplate({
  trackingId,
  complaintId,
  title,
  category = 'General',
  priority = 'Medium',
  description = '',
  address = '',
  createdAt = new Date(),
  citizenName = '',
  trackingLink = '',
}) {
  const id = trackingId || complaintId || 'CMP-PENDING'
  const displayDate = createdAt?.toDate
    ? createdAt.toDate().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : new Date(createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

  const priorityColors = getPriorityBadgeColor(priority)
  const safeTrackingLink = trackingLink || `https://civicconnect.gov/complaints/${id}`
  const greeting = citizenName ? `Hello ${sanitizeHtml(citizenName)},` : 'Hello Citizen,'

  const subject = `Receipt: Complaint ${id} Submitted - CivicConnect`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${sanitizeHtml(subject)}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased; }
    table { border-collapse: collapse; }
    img { border: 0; outline: none; text-decoration: none; }
    a { color: #2563eb; text-decoration: none; }
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; font-weight: 600; font-size: 15px; padding: 12px 24px; border-radius: 8px; text-decoration: none; text-align: center; }
    .badge { display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 600; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 12px !important; }
      .content-card { padding: 20px !important; }
    }
  </style>
</head>
<body style="background-color: #f8fafc; margin: 0; padding: 24px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width: 600px; max-width: 600px; margin: 0 auto;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding: 16px 0 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color: #2563eb; width: 36px; height: 36px; border-radius: 8px; text-align: center; vertical-align: middle;">
                    <span style="color: #ffffff; font-size: 20px; font-weight: bold; line-height: 36px;">🏛</span>
                  </td>
                  <td style="padding-left: 12px;">
                    <span style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">CivicConnect</span>
                  </td>
                </tr>
              </table>
              <p style="margin: 6px 0 0; font-size: 13px; color: #64748b;">Official Municipal Grievance Redressal System</p>
            </td>
          </tr>

          <!-- Content Card -->
          <tr>
            <td class="content-card" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);">
              <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #0f172a;">Complaint Submission Receipt</h1>
              <p style="margin: 0 0 20px; font-size: 15px; color: #475569; line-height: 1.5;">${greeting}</p>
              <p style="margin: 0 0 24px; font-size: 14px; color: #475569; line-height: 1.6;">
                Thank you for reporting this issue. Your complaint has been formally logged into the municipal workflow. You can track real-time resolution progress anytime using your official tracking ID.
              </p>

              <!-- Ticket Info Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td valign="middle">
                          <span style="font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 600; letter-spacing: 0.05em;">Tracking ID</span>
                          <div style="font-family: monospace; font-size: 18px; font-weight: 700; color: #2563eb; margin-top: 2px;">${sanitizeHtml(id)}</div>
                        </td>
                        <td align="right" valign="middle">
                          <span class="badge" style="background-color: ${priorityColors.bg}; color: ${priorityColors.text}; border: 1px solid ${priorityColors.border};">
                            ${sanitizeHtml(priority)} Priority
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom: 10px;">
                          <strong style="font-size: 13px; color: #64748b; display: block;">Title:</strong>
                          <span style="font-size: 14px; font-weight: 600; color: #1e293b;">${sanitizeHtml(title)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 10px;">
                          <strong style="font-size: 13px; color: #64748b; display: block;">Category:</strong>
                          <span style="font-size: 14px; color: #1e293b;">${sanitizeHtml(category)}</span>
                        </td>
                      </tr>
                      ${address ? `<tr>
                        <td style="padding-bottom: 10px;">
                          <strong style="font-size: 13px; color: #64748b; display: block;">Location:</strong>
                          <span style="font-size: 14px; color: #1e293b;">${sanitizeHtml(address)}</span>
                        </td>
                      </tr>` : ''}
                      ${description ? `<tr>
                        <td style="padding-bottom: 10px;">
                          <strong style="font-size: 13px; color: #64748b; display: block;">Description:</strong>
                          <span style="font-size: 14px; color: #475569; line-height: 1.5;">${sanitizeHtml(description)}</span>
                        </td>
                      </tr>` : ''}
                      <tr>
                        <td>
                          <strong style="font-size: 13px; color: #64748b; display: block;">Submitted At:</strong>
                          <span style="font-size: 13px; color: #64748b;">${sanitizeHtml(displayDate)}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Action Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${safeTrackingLink}" target="_blank" rel="noopener noreferrer" class="btn" role="button">
                      Track Complaint Status &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5; text-align: center;">
                Direct link: <a href="${safeTrackingLink}" style="color: #2563eb; word-break: break-all;">${safeTrackingLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 16px; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.6;">
              <p style="margin: 0 0 6px;">You received this transactional receipt because a civic complaint was filed with your email address.</p>
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} CivicConnect Municipal Portal. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = `CIVICCONNECT - COMPLAINT SUBMISSION RECEIPT
==================================================

${greeting}

Your civic complaint has been formally logged into the municipal grievance redressal system.

COMPLAINT DETAILS:
- Tracking ID: ${id}
- Priority: ${priority}
- Title: ${title}
- Category: ${category}
${address ? `- Location: ${address}\n` : ''}${description ? `- Description: ${description}\n` : ''}- Submitted At: ${displayDate}

TRACK YOUR COMPLAINT:
Track the live status of your ticket here:
${safeTrackingLink}

Thank you for helping keep our community safe and well-maintained.

--
CivicConnect Municipal Portal
Official Citizen Grievance Redressal System`

  return { subject, html, text }
}

/**
 * Generate Complaint Status Resolution Email Template
 */
export function generateResolutionTemplate({
  trackingId,
  complaintId,
  title,
  category = 'General',
  department = 'Municipal Operations',
  officerNotes = '',
  resolutionPhotos = [],
  assignedWorker = '',
  resolvedAt = new Date(),
  citizenName = '',
  feedbackLink = '',
  trackingLink = '',
}) {
  const id = trackingId || complaintId || 'CMP-RESOLVED'
  const displayDate = resolvedAt?.toDate
    ? resolvedAt.toDate().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : new Date(resolvedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

  const safeFeedbackLink = feedbackLink || `https://civicconnect.gov/complaints/${id}#feedback`
  const safeTrackingLink = trackingLink || `https://civicconnect.gov/complaints/${id}`
  const greeting = citizenName ? `Hello ${sanitizeHtml(citizenName)},` : 'Hello Citizen,'

  const subject = `Resolved: Complaint ${id} - CivicConnect`

  // Normalize resolution photos
  const photos = Array.isArray(resolutionPhotos) ? resolutionPhotos : []

  const photosHtml = photos.length > 0
    ? `<tr>
        <td style="padding-top: 16px;">
          <strong style="font-size: 13px; color: #64748b; display: block; margin-bottom: 8px;">Resolution Photo Evidence:</strong>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              ${photos.slice(0, 3).map((photoUrl, index) => `
                <td style="padding-right: 8px; vertical-align: top;">
                  <a href="${photoUrl}" target="_blank" rel="noopener noreferrer">
                    <img src="${photoUrl}" alt="Resolution proof photo ${index + 1}" width="160" height="120" style="width: 160px; height: 120px; object-fit: cover; border-radius: 8px; border: 1px solid #cbd5e1; display: block;" />
                  </a>
                </td>
              `).join('')}
            </tr>
          </table>
        </td>
      </tr>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${sanitizeHtml(subject)}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased; }
    table { border-collapse: collapse; }
    img { border: 0; outline: none; text-decoration: none; }
    a { color: #2563eb; text-decoration: none; }
    .btn-success { display: inline-block; background-color: #16a34a; color: #ffffff !important; font-weight: 600; font-size: 15px; padding: 12px 24px; border-radius: 8px; text-decoration: none; text-align: center; }
    .star-btn { display: inline-block; padding: 8px 12px; margin: 0 4px; background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 16px; text-decoration: none; color: #d97706 !important; font-weight: bold; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 12px !important; }
      .content-card { padding: 20px !important; }
    }
  </style>
</head>
<body style="background-color: #f8fafc; margin: 0; padding: 24px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width: 600px; max-width: 600px; margin: 0 auto;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding: 16px 0 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color: #16a34a; width: 36px; height: 36px; border-radius: 8px; text-align: center; vertical-align: middle;">
                    <span style="color: #ffffff; font-size: 20px; font-weight: bold; line-height: 36px;">✓</span>
                  </td>
                  <td style="padding-left: 12px;">
                    <span style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">CivicConnect</span>
                  </td>
                </tr>
              </table>
              <p style="margin: 6px 0 0; font-size: 13px; color: #64748b;">Official Municipal Grievance Redressal System</p>
            </td>
          </tr>

          <!-- Content Card -->
          <tr>
            <td class="content-card" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);">
              <!-- Status Header Banner -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <tr>
                  <td>
                    <span style="display: inline-block; background-color: #16a34a; color: #ffffff; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 9999px; text-transform: uppercase;">RESOLVED</span>
                    <h1 style="margin: 8px 0 4px; font-size: 20px; font-weight: 700; color: #166534;">Your Complaint Has Been Resolved</h1>
                    <p style="margin: 0; font-size: 13px; color: #15803d;">Ticket ${sanitizeHtml(id)} was marked resolved on ${sanitizeHtml(displayDate)}.</p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 20px; font-size: 15px; color: #475569; line-height: 1.5;">${greeting}</p>
              <p style="margin: 0 0 24px; font-size: 14px; color: #475569; line-height: 1.6;">
                The municipal team has inspected and resolved the civic issue you reported. Please review the officer notes and resolution evidence below.
              </p>

              <!-- Resolution Details Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom: 12px;">
                          <strong style="font-size: 13px; color: #64748b; display: block;">Complaint Title:</strong>
                          <span style="font-size: 15px; font-weight: 600; color: #0f172a;">${sanitizeHtml(title)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 12px;">
                          <strong style="font-size: 13px; color: #64748b; display: block;">Category:</strong>
                          <span style="font-size: 14px; color: #1e293b;">${sanitizeHtml(category)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 12px;">
                          <strong style="font-size: 13px; color: #64748b; display: block;">Responsible Department:</strong>
                          <span style="font-size: 14px; color: #1e293b;">${sanitizeHtml(department)}</span>
                          ${assignedWorker ? `<span style="font-size: 13px; color: #64748b;"> (Officer: ${sanitizeHtml(assignedWorker)})</span>` : ''}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 12px;">
                          <strong style="font-size: 13px; color: #64748b; display: block;">Officer Resolution Notes:</strong>
                          <div style="font-size: 14px; color: #334155; line-height: 1.6; background-color: #ffffff; padding: 12px 14px; border-radius: 6px; border: 1px solid #e2e8f0; margin-top: 4px;">
                            ${sanitizeHtml(officerNotes || 'The municipal maintenance team has completed the requested resolution.')}
                          </div>
                        </td>
                      </tr>
                      ${photosHtml}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Rating and Feedback Section -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
                <tr>
                  <td>
                    <h2 style="margin: 0 0 6px; font-size: 16px; font-weight: 700; color: #1e40af;">How satisfied are you with this resolution?</h2>
                    <p style="margin: 0 0 16px; font-size: 13px; color: #3b82f6;">Your feedback helps us measure municipal performance and accountability.</p>
                    <a href="${safeFeedbackLink}" target="_blank" rel="noopener noreferrer" class="btn-success" role="button">
                      Rate Resolution &amp; Submit Feedback &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Reopen Notice -->
              <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; padding: 12px 16px; font-size: 13px; color: #92400e; line-height: 1.5; margin-bottom: 20px;">
                <strong>Issue still not fixed?</strong> You can reopen this complaint directly from your citizen dashboard within 7 days of resolution.
              </div>

              <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5; text-align: center;">
                View full complaint audit trail: <a href="${safeTrackingLink}" style="color: #2563eb; word-break: break-all;">${safeTrackingLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 16px; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.6;">
              <p style="margin: 0 0 6px;">You received this transactional status update because you are the registered complainant for Ticket ${sanitizeHtml(id)}.</p>
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} CivicConnect Municipal Portal. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const textPhotos = photos.length > 0
    ? `\nRESOLUTION PHOTOS:\n${photos.map((p, i) => `- Photo ${i + 1}: ${p}`).join('\n')}\n`
    : ''

  const text = `CIVICCONNECT - COMPLAINT RESOLUTION NOTICE
==================================================

${greeting}

Your civic complaint has been formally marked as RESOLVED by municipal authorities.

COMPLAINT DETAILS:
- Tracking ID: ${id}
- Status: RESOLVED
- Title: ${title}
- Category: ${category}
- Department: ${department}${assignedWorker ? `\n- Officer: ${assignedWorker}` : ''}
- Resolved At: ${displayDate}

OFFICER RESOLUTION NOTES:
${officerNotes || 'The municipal maintenance team has completed the requested resolution.'}
${textPhotos}
RATE RESOLUTION & PROVIDE FEEDBACK:
Please take 30 seconds to rate your satisfaction with this resolution:
${safeFeedbackLink}

REOPEN POLICY:
If this issue is still not fixed, you may appeal and reopen this complaint within 7 days:
${safeTrackingLink}

--
CivicConnect Municipal Portal
Official Citizen Grievance Redressal System`

  return { subject, html, text }
}
