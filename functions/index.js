/**
 * CivicConnect Cloud Functions
 * Server-side notification service for transactional email receipts
 */

export {
  generateSubmissionReceiptTemplate,
  generateResolutionTemplate,
} from './templates.js'

export {
  getEmailConfig,
  createTransporter,
  createFallbackTransport,
  sendEmail,
  DEFAULT_FROM_EMAIL,
} from './transporter.js'

export {
  handleComplaintCreate,
  handleComplaintUpdate,
  resolveRecipientEmail,
  onComplaintCreated,
  onComplaintUpdated,
  onIssueCreated,
  onIssueUpdated,
  createV1ComplaintTriggers,
} from './triggers.js'

