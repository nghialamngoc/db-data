'use strict'

const path = require('path')
const express = require('express')
const { MongoClient, ObjectId } = require('mongodb')

const app = express()
app.use(express.json({ limit: '1mb' }))
app.use(express.static(path.join(__dirname, 'public')))

// One pooled client per connection string, so repeated searches reuse the connection.
const clients = new Map()

async function getDb(mongoUrl) {
  if (!mongoUrl || !/^mongodb(\+srv)?:\/\//.test(mongoUrl)) {
    throw new Error('Mongo URL không hợp lệ (phải bắt đầu bằng mongodb:// hoặc mongodb+srv://)')
  }
  let entry = clients.get(mongoUrl)
  if (!entry) {
    const client = new MongoClient(mongoUrl, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    })
    entry = client.connect().then(() => client)
    clients.set(mongoUrl, entry)
    entry.catch(() => clients.delete(mongoUrl)) // don't cache a failed connect
  }
  const client = await entry
  // db() with no name uses the database embedded in the connection string.
  return client.db()
}

// BSON -> plain JSON that reads like Compass (ObjectId/Date as strings, no $oid/$date wrappers).
function clean(v) {
  if (v === null || v === undefined) return v
  if (Array.isArray(v)) return v.map(clean)
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    if (typeof v.toHexString === 'function') return v.toHexString() // ObjectId
    if (v._bsontype === 'Decimal128' || v._bsontype === 'Long' || v._bsontype === 'Double') return v.toString()
    if (v._bsontype === 'Binary') return `[binary ${v.length ? v.length() : ''}]`
    const out = {}
    for (const k of Object.keys(v)) out[k] = clean(v[k])
    return out
  }
  return v
}

// Build the filter for a given field+value. For _id, try ObjectId first, then raw string.
function buildFilter(field, value) {
  const f = field || '_id'
  if (f === '_id') {
    const or = [{ _id: value }]
    if (ObjectId.isValid(value)) or.unshift({ _id: new ObjectId(value) })
    return { $or: or }
  }
  return { [f]: value }
}

app.post('/api/query', async (req, res) => {
  const { mongoUrl, collection, field, value, limit } = req.body || {}
  if (!collection) return res.status(400).json({ error: 'Thiếu tên collection' })
  if (!value) return res.status(400).json({ error: 'Thiếu giá trị tìm kiếm' })
  try {
    const db = await getDb(mongoUrl)
    const filter = buildFilter(field, String(value).trim())
    const docs = await db
      .collection(collection)
      .find(filter)
      .limit(Math.min(Number(limit) || 20, 100))
      .toArray()
    res.json({ count: docs.length, docs: docs.map(clean), db: db.databaseName, collection })
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) })
  }
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

const PORT = process.env.PORT || 4500
const HOST = process.env.HOST || '127.0.0.1'
app.listen(PORT, HOST, () => {
  console.log(`Mongo Lead Viewer: http://${HOST}:${PORT}`)
})
