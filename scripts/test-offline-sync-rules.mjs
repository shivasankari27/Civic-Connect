// Load firestore.rules in a loopback emulator for demo-civic-offline-sync.
// Set FIRESTORE_EMULATOR_HOST and run node --test scripts/test-offline-sync-rules.mjs.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase/app'
import * as firestore from 'firebase/firestore'

const endpoint = /^(127\.0\.0\.1|localhost):(\d+)$/.exec(process.env.FIRESTORE_EMULATOR_HOST || '')
assert(endpoint, 'Set FIRESTORE_EMULATOR_HOST to a loopback Firestore Emulator')
const { collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore,
  query, serverTimestamp, setDoc, updateDoc, where, writeBatch } = firestore
const ownerUid = `offline-owner-${randomUUID()}`
const apps = []

function client(name, uid, role = 'citizen') {
  const app = initializeApp({ projectId: 'demo-civic-offline-sync' }, name)
  apps.push(app)
  const db = getFirestore(app)
  connectFirestoreEmulator(db, endpoint[1], Number(endpoint[2]), { mockUserToken: { sub: uid, role } })
  return db
}

const owner = client('owner', ownerUid)
const secondTab = client('second-tab', ownerUid)
const other = client('other', `${ownerUid}-other`)
const admin = client('admin', `${ownerUid}-admin`, 'admin')
after(() => Promise.all(apps.map(deleteApp)))

// Run the production service and builders with a synthetic authenticated
// Firestore client in place of the application's Firebase initialization.
const read = file => readFileSync(new URL(`../src/firebase/${file}`, import.meta.url), 'utf8')
const idSource = read('complaintId.js')
const eventsSource = read('complaintEvents.js')
const noticesSource = read('notifications.js')
const syncSource = read('offlineComplaintSync.js')
const code = [
  idSource.slice(idSource.indexOf('const COUNTER_PATH'), idSource.indexOf('export async function generateComplaintId')),
  eventsSource.slice(eventsSource.indexOf('export function buildComplaintEvent')),
  noticesSource.slice(noticesSource.indexOf('function buildNotification'), noticesSource.indexOf('export async function createNotification')),
  noticesSource.slice(noticesSource.indexOf('export function addNotificationToBatch'), noticesSource.indexOf('let messagingPromise')),
  syncSource.slice(syncSource.indexOf('export function syncOfflineComplaint')),
].join('\n').replaceAll('export ', '')
const loadSync = new Function('db', 'auth', ...Object.keys(firestore), `${code}\nreturn syncOfflineComplaint`)
const session = { uid: ownerUid }
const sync = (db, entry) => loadSync(db, { currentUser: session }, ...Object.values(firestore))(entry, session)

const fixture = () => ({ localId: randomUUID(), userId: ownerUid, title: 'Lamp', description: 'Out', category: 'Lights', address: 'Market Road' })
const issue = (db, id) => doc(db, 'issues', id)
const receipt = (db, id) => doc(db, 'users', ownerUid, 'offlineComplaintReceipts', id)
const counterValue = async () => (await getDoc(doc(admin, 'counters/issueCounter'))).data()?.lastNumber ?? 0
const denied = promise => assert.rejects(promise, { code: 'permission-denied' })

test('two tabs commit once, and replay preserves edits, the ticket, and a later deletion', async () => {
  const entry = fixture()
  const id = entry.localId
  await setDoc(issue(owner, `${id}-neighbor`), { reportedBy: ownerUid, status: 'Pending', title: 'Different complaint' })
  const before = await counterValue()
  await Promise.all([sync(owner, entry), sync(secondTab, entry)])
  const saved = (await getDoc(issue(owner, id))).data()
  assert.equal(saved.reportedBy, ownerUid)
  assert.equal(await counterValue(), before + 1)
  assert((await getDoc(receipt(owner, id))).exists())
  await updateDoc(issue(owner, id), { title: 'Edited online', department: 'Electricity' })
  const edited = (await getDoc(issue(owner, id))).data()
  await sync(secondTab, entry)
  assert.equal(edited.complaintId, saved.complaintId)
  assert.deepEqual((await getDoc(issue(owner, id))).data(), edited)
  assert.equal((await getDocs(collection(issue(admin, id), 'events'))).size, 1)
  const notices = query(collection(admin, 'notifications'), where('recipientUid', '==', null),
    where('recipientRole', '==', 'admin'), where('issueId', '==', saved.complaintId))
  assert.equal((await getDocs(notices)).size, 1)
  await deleteDoc(issue(owner, id))
  await sync(secondTab, entry)
  assert.equal(await counterValue(), before + 1)
  assert((await getDoc(receipt(owner, id))).exists())
  assert.equal((await getDocs(query(collection(owner, 'issues'), where('reportedBy', '==', ownerUid)))).docs.some(row => row.id === id), false)
})

test('an existing legacy upload is adopted without writing the complaint or allocating a ticket', async () => {
  const entry = fixture()
  const id = entry.localId
  await setDoc(issue(owner, id), { reportedBy: ownerUid, status: 'Pending', complaintId: 'CMP-LEGACY', title: 'Already edited' })
  await updateDoc(issue(admin, id), { status: 'Resolved' })
  const existing = (await getDoc(issue(owner, id))).data()
  const before = await counterValue()
  await sync(owner, entry)
  assert.deepEqual((await getDoc(issue(owner, id))).data(), existing)
  assert.equal(await counterValue(), before)
  assert((await getDoc(receipt(owner, id))).exists())
  assert.equal((await getDocs(collection(issue(admin, id), 'events'))).size, 0)
})

test('receipts are owner-only, immutable, and require an uploaded complaint', async () => {
  const id = fixture().localId
  await denied(getDoc(receipt(other, id)))
  await denied(setDoc(receipt(owner, id), { createdAt: serverTimestamp() }))
  await setDoc(issue(owner, id), { reportedBy: ownerUid, status: 'Pending', title: 'Saved' })
  await denied(setDoc(receipt(other, id), { createdAt: serverTimestamp() }))
  await denied(setDoc(doc(other, 'users', `${ownerUid}-other`, 'offlineComplaintReceipts', id), { createdAt: serverTimestamp() }))
  await denied(setDoc(receipt(owner, id), { createdAt: serverTimestamp(), extra: true }))
  await setDoc(receipt(owner, id), { createdAt: serverTimestamp() })
  await denied(updateDoc(receipt(owner, id), { createdAt: serverTimestamp() }))
  await denied(deleteDoc(receipt(owner, id)))
})

test('creating a receipt cannot overwrite an existing complaint in the same commit', async () => {
  const id = fixture().localId
  const original = { reportedBy: ownerUid, status: 'Pending', complaintId: 'CMP-LEGACY', title: 'Saved' }
  await setDoc(issue(owner, id), original)
  const batch = writeBatch(owner)
  batch.set(issue(owner, id), { ...original, complaintId: 'CMP-REPLACEMENT', title: 'Stale' })
  batch.set(receipt(owner, id), { createdAt: serverTimestamp() })
  await denied(batch.commit())
  assert.deepEqual((await getDoc(issue(owner, id))).data(), original)
  assert.equal((await getDoc(receipt(owner, id))).exists(), false)
})
