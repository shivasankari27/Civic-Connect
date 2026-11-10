import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { createV1ComplaintTriggers, onIssueCreated, onIssueUpdated } from './triggers.js'
import { sendEmail } from './transporter.js'

vi.mock('firebase-admin/app', () => ({ getApps: vi.fn(), initializeApp: vi.fn() }))
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }))
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_path, callback) => callback,
  onDocumentUpdated: (_path, callback) => callback,
}))
vi.mock('./transporter.js', () => ({ sendEmail: vi.fn() }))

const defaultApp = { name: '[DEFAULT]' }
const getUser = vi.fn()
const issueId = 'firestore-document-42'
const email = 'owner@example.test'
const issue = {
  complaintId: 'CMP-2026-0042', reportedBy: 'citizen-42', title: 'Broken lamp',
  description: 'Lamp is out', category: 'Streetlight Issues', address: 'Market Road', status: 'Pending',
}
const context = { params: { issueId } }
const snapshot = data => ({ id: issueId, data: () => data })
const create = data => ({ ...context, data: snapshot(data) })
const update = (before, after) => ({ ...context, data: { before: snapshot(before), after: snapshot(after) } })
const detailUrl = `https://civic.example.test/complaints/${issueId}`

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('APP_BASE_URL', 'https://civic.example.test/')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  getApps.mockReturnValue([defaultApp])
  initializeApp.mockReturnValue(defaultApp)
  getAuth.mockReturnValue({ getUser })
  getUser.mockResolvedValue({ email })
  sendEmail.mockResolvedValue({ success: true, messageId: 'synthetic-message' })
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

it('sends a receipt for the real complaint schema and distinguishes the ticket from the document ID', async () => {
  const result = await onIssueCreated(create(issue))
  expect(getAuth).toHaveBeenCalledWith(defaultApp)
  expect(getUser).toHaveBeenCalledExactlyOnceWith(issue.reportedBy)
  expect(initializeApp).not.toHaveBeenCalled()
  expect(result).toMatchObject({ success: true, trackingId: issue.complaintId, recipient: email })
  expect(sendEmail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    to: email, subject: expect.stringContaining(issue.complaintId), html: expect.stringContaining(detailUrl),
    text: expect.stringContaining(detailUrl),
  }), undefined, undefined)
})

it('sends a resolution notice through the registered update entry point', async () => {
  getApps.mockReturnValue([{ name: 'other-app' }])
  const result = await onIssueUpdated(update({ ...issue, status: 'In Progress' }, { ...issue, status: 'Resolved' }))
  expect(initializeApp).toHaveBeenCalledOnce()
  expect(getAuth).toHaveBeenCalledWith(defaultApp)
  expect(getUser).toHaveBeenCalledExactlyOnceWith(issue.reportedBy)
  expect(result).toMatchObject({ success: true, trackingId: issue.complaintId })
  expect(sendEmail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    to: email, subject: expect.stringContaining(issue.complaintId), html: expect.stringContaining(`${detailUrl}#feedback`),
  }), undefined, undefined)
})

it('prefers the Auth account over email and alternative UID fields on the complaint', async () => {
  await onIssueCreated(create({ ...issue, citizenEmail: 'other@example.test', userId: 'other-user' }))
  expect(getUser).toHaveBeenCalledExactlyOnceWith(issue.reportedBy)
  expect(sendEmail.mock.calls[0][0].to).toBe(email)
})

it.each([undefined, '', '  ', 42])('skips issues with invalid ownership (%s)', async reportedBy => {
  const result = await onIssueCreated(create({ ...issue, reportedBy, citizenEmail: 'other@example.test' }))
  expect(result).toMatchObject({ skipped: true, reason: 'No recipient email found' })
  expect(getUser).not.toHaveBeenCalled()
  expect(sendEmail).not.toHaveBeenCalled()
})

it('does not use legacy snapshot addresses if the Auth lookup fails on resolution', async () => {
  getUser.mockRejectedValueOnce(Object.assign(new Error('User not found'), { code: 'auth/user-not-found' }))
  const result = await onIssueUpdated(update(
    { ...issue, status: 'In Progress', citizenEmail: 'previous@example.test' },
    { ...issue, status: 'Resolved', citizenEmail: 'other@example.test' },
  ))
  expect(result).toMatchObject({ skipped: true, reason: 'No recipient email found' })
  expect(getUser).toHaveBeenCalledExactlyOnceWith(issue.reportedBy)
  expect(sendEmail).not.toHaveBeenCalled()
})

it('skips an Auth account with no email', async () => {
  getUser.mockResolvedValueOnce({})
  expect(await onIssueCreated(create(issue))).toMatchObject({ skipped: true })
  expect(sendEmail).not.toHaveBeenCalled()
})

it.each([['Pending', 'In Progress'], ['Resolved', 'Resolved']])('skips %s → %s without looking up a recipient', async (from, to) => {
  const result = await onIssueUpdated(update({ ...issue, status: from }, { ...issue, status: to }))
  expect(result.skipped).toBe(true)
  expect(getUser).not.toHaveBeenCalled()
  expect(sendEmail).not.toHaveBeenCalled()
})

it('wires the same owner lookup into the v1 issue callbacks', async () => {
  const register = callback => callback
  const functions = { firestore: { document: () => ({ onCreate: register, onUpdate: register }) } }
  const { onIssueCreatedV1, onIssueUpdatedV1 } = createV1ComplaintTriggers(functions)
  expect(await onIssueCreatedV1(snapshot(issue), context)).toMatchObject({ success: true, trackingId: issue.complaintId })
  expect(await onIssueUpdatedV1(update(issue, { ...issue, status: 'Resolved' }).data, context)).toMatchObject({ success: true })
  expect(getUser.mock.calls).toEqual([[issue.reportedBy], [issue.reportedBy]])
})
