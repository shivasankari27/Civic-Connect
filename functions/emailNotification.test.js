import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nodemailer from 'nodemailer'
import {
  generateSubmissionReceiptTemplate,
  generateResolutionTemplate,
} from './templates.js'
import {
  getEmailConfig,
  createTransporter,
  createFallbackTransport,
  sendEmail,
  DEFAULT_FROM_EMAIL,
} from './transporter.js'
import {
  handleComplaintCreate,
  handleComplaintUpdate,
  resolveRecipientEmail,
} from './triggers.js'

describe('Server-Side Notification Service: Email Receipts', () => {
  let warnSpy

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
    vi.restoreAllMocks()
  })

  describe('Email Template Generation', () => {
    it('generates a clean, accessible submission receipt template with tracking ID, category, priority, and link', () => {
      const template = generateSubmissionReceiptTemplate({
        trackingId: 'CMP-2026-4891',
        title: 'Deep Pothole on Oak Ave',
        category: 'Roads & Infrastructure',
        priority: 'High',
        description: 'Large hazardous pothole damaging car tires near 4th street.',
        address: '400 Oak Ave, Springfield',
        citizenName: 'Jane Citizen',
        trackingLink: 'https://civicconnect.gov/complaints/CMP-2026-4891',
      })

      expect(template.subject).toBe('Receipt: Complaint CMP-2026-4891 Submitted - CivicConnect')
      expect(template.html).toContain('CMP-2026-4891')
      expect(template.html).toContain('Deep Pothole on Oak Ave')
      expect(template.html).toContain('Roads &amp; Infrastructure')
      expect(template.html).toContain('High Priority')
      expect(template.html).toContain('400 Oak Ave, Springfield')
      expect(template.html).toContain('Jane Citizen')
      expect(template.html).toContain('https://civicconnect.gov/complaints/CMP-2026-4891')
      expect(template.html).toContain('Track Complaint Status &rarr;')

      // Plain text check
      expect(template.text).toContain('CIVICCONNECT - COMPLAINT SUBMISSION RECEIPT')
      expect(template.text).toContain('Tracking ID: CMP-2026-4891')
      expect(template.text).toContain('Priority: High')
      expect(template.text).toContain('https://civicconnect.gov/complaints/CMP-2026-4891')
    })

    it('sanitizes malicious script tags and HTML entities in submission receipt', () => {
      const template = generateSubmissionReceiptTemplate({
        trackingId: 'CMP-9999-0001',
        title: '<script>alert("hacked")</script>Dangerous Pothole',
        citizenName: 'Attacker <img src=x onerror=alert(1)>',
        category: 'Roads & Bridges',
      })

      expect(template.html).not.toContain('<script>')
      expect(template.html).toContain('&lt;script&gt;alert(&quot;hacked&quot;)&lt;/script&gt;')
      expect(template.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    })

    it('renders appropriate priority badge styling for critical and low priorities', () => {
      const criticalTemplate = generateSubmissionReceiptTemplate({
        trackingId: 'CMP-1',
        priority: 'Critical',
      })
      expect(criticalTemplate.html).toContain('Critical Priority')
      expect(criticalTemplate.html).toContain('#fee2e2')

      const lowTemplate = generateSubmissionReceiptTemplate({
        trackingId: 'CMP-2',
        priority: 'Low',
      })
      expect(lowTemplate.html).toContain('Low Priority')
      expect(lowTemplate.html).toContain('#f1f5f9')
    })

    it('generates a complaint status resolution template with officer notes, resolution photos, and feedback link', () => {
      const photos = [
        'https://storage.googleapis.com/civic-photos/proof-1.jpg',
        'https://storage.googleapis.com/civic-photos/proof-2.jpg',
      ]
      const template = generateResolutionTemplate({
        trackingId: 'CMP-2026-4891',
        title: 'Deep Pothole on Oak Ave',
        category: 'Roads & Infrastructure',
        department: 'Public Works Department',
        officerNotes: 'Asphalt repaving completed on 11/09. Cold-mix patch sealed and inspected.',
        resolutionPhotos: photos,
        assignedWorker: 'Officer John Smith',
        citizenName: 'Jane Citizen',
        feedbackLink: 'https://civicconnect.gov/complaints/CMP-2026-4891#feedback',
        trackingLink: 'https://civicconnect.gov/complaints/CMP-2026-4891',
      })

      expect(template.subject).toBe('Resolved: Complaint CMP-2026-4891 - CivicConnect')
      expect(template.html).toContain('RESOLVED')
      expect(template.html).toContain('Your Complaint Has Been Resolved')
      expect(template.html).toContain('CMP-2026-4891')
      expect(template.html).toContain('Public Works Department')
      expect(template.html).toContain('Officer: Officer John Smith')
      expect(template.html).toContain('Asphalt repaving completed on 11/09')
      expect(template.html).toContain('proof-1.jpg')
      expect(template.html).toContain('proof-2.jpg')
      expect(template.html).toContain('Rate Resolution &amp; Submit Feedback &rarr;')
      expect(template.html).toContain('https://civicconnect.gov/complaints/CMP-2026-4891#feedback')
      expect(template.html).toContain('reopen this complaint directly from your citizen dashboard')

      // Plain text check
      expect(template.text).toContain('CIVICCONNECT - COMPLAINT RESOLUTION NOTICE')
      expect(template.text).toContain('Status: RESOLVED')
      expect(template.text).toContain('Officer: Officer John Smith')
      expect(template.text).toContain('proof-1.jpg')
      expect(template.text).toContain('rate your satisfaction')
    })

    it('handles resolution template gracefully when photos or officer notes are empty', () => {
      const template = generateResolutionTemplate({
        trackingId: 'CMP-2026-0002',
        title: 'Streetlight outage',
      })

      expect(template.subject).toBe('Resolved: Complaint CMP-2026-0002 - CivicConnect')
      expect(template.html).not.toContain('Resolution Photo Evidence:')
      expect(template.html).toContain('The municipal maintenance team has completed the requested resolution.')
      expect(template.text).not.toContain('RESOLUTION PHOTOS:')
    })
  })

  describe('Pluggable Email Transporter & Provider Configuration', () => {
    it('configures SendGrid provider when SENDGRID_API_KEY is present', () => {
      const env = {
        SENDGRID_API_KEY: 'SG.test-api-key-12345',
        EMAIL_FROM: 'civic@city.gov',
      }
      const config = getEmailConfig(env)
      expect(config.provider).toBe('sendgrid')
      expect(config.from).toBe('civic@city.gov')
      expect(config.transportOptions.host).toBe('smtp.sendgrid.net')
      expect(config.transportOptions.auth.pass).toBe('SG.test-api-key-12345')
      expect(config.transportOptions.auth.user).toBe('apikey')
    })

    it('configures Postmark provider when POSTMARK_SERVER_TOKEN is present', () => {
      const env = {
        POSTMARK_SERVER_TOKEN: 'pm-token-xyz-987',
      }
      const config = getEmailConfig(env)
      expect(config.provider).toBe('postmark')
      expect(config.transportOptions.host).toBe('smtp.postmarkapp.com')
      expect(config.transportOptions.auth.user).toBe('pm-token-xyz-987')
    })

    it('configures SMTP provider for local development when SMTP_HOST is present', () => {
      const env = {
        SMTP_HOST: 'localhost',
        SMTP_PORT: '1025',
        SMTP_USER: 'devuser',
        SMTP_PASS: 'devpass',
      }
      const config = getEmailConfig(env)
      expect(config.provider).toBe('smtp')
      expect(config.transportOptions.host).toBe('localhost')
      expect(config.transportOptions.port).toBe(1025)
      expect(config.transportOptions.auth.user).toBe('devuser')
    })

    it('falls back to fallback transport when no provider credentials are configured', () => {
      const env = {}
      const config = getEmailConfig(env)
      expect(config.provider).toBe('fallback')
      expect(config.from).toBe(DEFAULT_FROM_EMAIL)
    })

    it('creates a fallback transporter that logs a warning without crashing', async () => {
      const fallback = createFallbackTransport('Local dev test')
      expect(fallback.isFallback).toBe(true)

      const result = await fallback.sendMail({
        to: 'citizen@example.com',
        subject: 'Test Subject',
      })

      expect(result.fallback).toBe(true)
      expect(result.messageId).toContain('@civicconnect.local')
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EmailNotification] Fallback transport: email to citizen@example.com')
      )
    })

    it('createTransporter returns fallback transport with warning when unconfigured', () => {
      const transporter = createTransporter({ env: {} })
      expect(transporter.isFallback).toBe(true)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EmailNotification] Warning:')
      )
    })

    it('createTransporter calls nodemailer.createTransport with correct options when configured', () => {
      const mockCreate = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
        sendMail: vi.fn(),
      })

      const env = {
        SMTP_HOST: 'smtp.mailtrap.io',
        SMTP_PORT: '2525',
      }
      createTransporter({ env })

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.mailtrap.io',
          port: 2525,
        })
      )
    })
  })

  describe('sendEmail Graceful Error Recovery', () => {
    it('successfully dispatches an email using custom mock transporter', async () => {
      const mockSend = vi.fn().mockResolvedValue({
        messageId: '<test-msg-123@civicconnect.gov>',
      })
      const mockTransporter = { sendMail: mockSend }

      const result = await sendEmail(
        {
          to: 'citizen@example.com',
          subject: 'Complaint Confirmation',
          html: '<p>Confirmed</p>',
        },
        mockTransporter
      )

      expect(result.success).toBe(true)
      expect(result.messageId).toBe('<test-msg-123@civicconnect.gov>')
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'citizen@example.com',
          subject: 'Complaint Confirmation',
        })
      )
    })

    it('catches transporter network/auth failure, logs a warning, and returns success:false without crashing', async () => {
      const mockSend = vi.fn().mockRejectedValue(new Error('Connection timed out to smtp.sendgrid.net:587'))
      const mockTransporter = { sendMail: mockSend }

      const result = await sendEmail(
        {
          to: 'citizen@example.com',
          subject: 'Fail Test',
          html: '<p>Test</p>',
        },
        mockTransporter
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Connection timed out to smtp.sendgrid.net:587')
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EmailNotification] Error occurred while sending email:'),
        'Connection timed out to smtp.sendgrid.net:587'
      )
    })

    it('returns error when recipient address is missing without crashing', async () => {
      const result = await sendEmail({
        subject: 'No recipient',
        html: '<p>Test</p>',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Recipient "to" address is required')
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EmailNotification] sendEmail skipped: recipient "to" address is missing')
      )
    })
  })

  describe('Recipient Email Resolution', () => {
    it('resolves citizenEmail directly from complaint document', async () => {
      const email = await resolveRecipientEmail({ citizenEmail: 'resident@example.com' })
      expect(email).toBe('resident@example.com')
    })

    it('resolves userEmail or email fallback from complaint document', async () => {
      const email1 = await resolveRecipientEmail({ userEmail: 'user@example.com' })
      expect(email1).toBe('user@example.com')

      const email2 = await resolveRecipientEmail({ email: 'contact@example.com' })
      expect(email2).toBe('contact@example.com')
    })

    it('resolves email via custom getUserEmail option', async () => {
      const mockGetUserEmail = vi.fn().mockResolvedValue('resolved-user@city.gov')
      const email = await resolveRecipientEmail(
        { userId: 'usr-123' },
        { getUserEmail: mockGetUserEmail }
      )
      expect(email).toBe('resolved-user@city.gov')
      expect(mockGetUserEmail).toHaveBeenCalledWith('usr-123')
    })

    it('resolves email from firestore users collection when provided', async () => {
      const mockFirestore = {
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
              exists: true,
              data: () => ({ email: 'firestore-user@city.gov' }),
            }),
          }),
        }),
      }

      const email = await resolveRecipientEmail(
        { citizenUid: 'usr-456' },
        { firestore: mockFirestore }
      )
      expect(email).toBe('firestore-user@city.gov')
    })

    it('returns null when no recipient email can be identified', async () => {
      const email = await resolveRecipientEmail({})
      expect(email).toBeNull()
    })
  })

  describe('handleComplaintCreate Trigger Handler', () => {
    it('dispatches submission receipt email when new complaint is created', async () => {
      const mockSend = vi.fn().mockResolvedValue({ messageId: '<created-msg-1>' })
      const mockTransporter = { sendMail: mockSend }

      const snapshot = {
        id: 'complaint-101',
        data: () => ({
          trackingId: 'CMP-2026-1011',
          title: 'Damaged sidewalk',
          category: 'Pedestrian Safety',
          priority: 'High',
          citizenEmail: 'citizen@springfield.gov',
          citizenName: 'Bob Citizen',
        }),
      }

      const result = await handleComplaintCreate(
        snapshot,
        { params: { complaintId: 'complaint-101' } },
        { transporter: mockTransporter }
      )

      expect(result.success).toBe(true)
      expect(result.trackingId).toBe('CMP-2026-1011')
      expect(result.recipient).toBe('citizen@springfield.gov')
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'citizen@springfield.gov',
          subject: 'Receipt: Complaint CMP-2026-1011 Submitted - CivicConnect',
        })
      )
    })

    it('skips gracefully when complaint has no recipient email', async () => {
      const mockSend = vi.fn()
      const mockTransporter = { sendMail: mockSend }

      const snapshot = {
        id: 'anon-102',
        data: () => ({
          title: 'Anonymous report',
          category: 'Sanitation',
        }),
      }

      const result = await handleComplaintCreate(
        snapshot,
        { params: { complaintId: 'anon-102' } },
        { transporter: mockTransporter }
      )

      expect(result.skipped).toBe(true)
      expect(result.reason).toBe('No recipient email found')
      expect(mockSend).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EmailNotification] Complaint anon-102 has no recipient email')
      )
    })

    it('recovers gracefully without throwing when email dispatch fails during creation', async () => {
      const mockSend = vi.fn().mockRejectedValue(new Error('SMTP Auth failed'))
      const mockTransporter = { sendMail: mockSend }

      const snapshot = {
        id: 'cmp-err',
        data: () => ({
          citizenEmail: 'resident@example.com',
          title: 'Test',
        }),
      }

      const result = await handleComplaintCreate(
        snapshot,
        { params: { complaintId: 'cmp-err' } },
        { transporter: mockTransporter }
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('SMTP Auth failed')
    })
  })

  describe('handleComplaintUpdate Trigger Handler', () => {
    it('dispatches resolution notification when complaint status changes to Resolved', async () => {
      const mockSend = vi.fn().mockResolvedValue({ messageId: '<resolved-msg-1>' })
      const mockTransporter = { sendMail: mockSend }

      const change = {
        before: {
          data: () => ({
            status: 'In Progress',
            title: 'Water pipe leak',
          }),
        },
        after: {
          id: 'pipe-99',
          data: () => ({
            trackingId: 'CMP-2026-9901',
            status: 'Resolved',
            title: 'Water pipe leak',
            citizenEmail: 'resident@springfield.gov',
            citizenName: 'Alice Resident',
            department: 'Water Supply Department',
            officerNotes: 'Main valve replaced, pressure tested and restored.',
            resolutionPhotos: ['https://storage.civic.gov/proof-water.jpg'],
          }),
        },
      }

      const result = await handleComplaintUpdate(
        change,
        { params: { complaintId: 'pipe-99' } },
        { transporter: mockTransporter }
      )

      expect(result.success).toBe(true)
      expect(result.recipient).toBe('resident@springfield.gov')
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'resident@springfield.gov',
          subject: 'Resolved: Complaint CMP-2026-9901 - CivicConnect',
          html: expect.stringContaining('proof-water.jpg'),
        })
      )
    })

    it('skips resolution email when status transition is not to Resolved (e.g. Submitted -> In Progress)', async () => {
      const mockSend = vi.fn()
      const mockTransporter = { sendMail: mockSend }

      const change = {
        before: {
          data: () => ({ status: 'Submitted' }),
        },
        after: {
          data: () => ({ status: 'In Progress', citizenEmail: 'resident@example.com' }),
        },
      }

      const result = await handleComplaintUpdate(
        change,
        { params: { complaintId: 'cmp-progress' } },
        { transporter: mockTransporter }
      )

      expect(result.skipped).toBe(true)
      expect(result.reason).toContain('Status is not resolved')
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('skips duplicate resolution email if complaint was already resolved before update', async () => {
      const mockSend = vi.fn()
      const mockTransporter = { sendMail: mockSend }

      const change = {
        before: {
          data: () => ({ status: 'Resolved' }),
        },
        after: {
          data: () => ({
            status: 'Resolved',
            officerNotes: 'Updated spelling in note',
            citizenEmail: 'resident@example.com',
          }),
        },
      }

      const result = await handleComplaintUpdate(
        change,
        { params: { complaintId: 'cmp-dup' } },
        { transporter: mockTransporter }
      )

      expect(result.skipped).toBe(true)
      expect(result.reason).toBe('Complaint was already marked as resolved')
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('allows forceSend override to resend resolution email on resolved complaints', async () => {
      const mockSend = vi.fn().mockResolvedValue({ messageId: '<forced-msg-1>' })
      const mockTransporter = { sendMail: mockSend }

      const change = {
        before: {
          data: () => ({ status: 'Resolved' }),
        },
        after: {
          data: () => ({
            status: 'Resolved',
            citizenEmail: 'resident@example.com',
            title: 'Resent Resolution',
          }),
        },
      }

      const result = await handleComplaintUpdate(
        change,
        { params: { complaintId: 'cmp-dup' } },
        { transporter: mockTransporter, forceSend: true }
      )

      expect(result.success).toBe(true)
      expect(mockSend).toHaveBeenCalled()
    })

    it('skips gracefully when resolved complaint has no recipient email', async () => {
      const mockSend = vi.fn()
      const mockTransporter = { sendMail: mockSend }

      const change = {
        before: { data: () => ({ status: 'In Progress' }) },
        after: { data: () => ({ status: 'Resolved' }) },
      }

      const result = await handleComplaintUpdate(
        change,
        { params: { complaintId: 'cmp-noemail' } },
        { transporter: mockTransporter }
      )

      expect(result.skipped).toBe(true)
      expect(result.reason).toBe('No recipient email found')
      expect(mockSend).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EmailNotification] Complaint cmp-noemail has no recipient email')
      )
    })
  })
})
