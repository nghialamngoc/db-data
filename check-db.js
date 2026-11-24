'use strict'

// Chẩn đoán kết nối MongoDB từ máy hiện tại.
// Dùng: node check-db.js "mongodb+srv://user:pass@host/db"

const dns = require('dns').promises
const net = require('net')
const https = require('https')

const uri = process.argv[2]
if (!uri) {
  console.error('Thiếu URI. Dùng: node check-db.js "mongodb+srv://user:pass@host/db"')
  process.exit(1)
}

function get(url) {
  return new Promise(resolve => {
    const req = https.get(url, r => {
      let d = ''
      r.on('data', c => (d += c))
      r.on('end', () => resolve(d.trim()))
    })
    req.on('error', () => resolve('(không lấy được)'))
    req.setTimeout(5000, () => { req.destroy(); resolve('(timeout)') })
  })
}

function tcpCheck(host, port) {
  return new Promise(resolve => {
    const start = Date.now()
    const s = net.connect({ host, port, timeout: 6000 })
    s.on('connect', () => { s.destroy(); resolve({ host, port, ok: true, ms: Date.now() - start }) })
    s.on('timeout', () => { s.destroy(); resolve({ host, port, ok: false, err: 'timeout (bị chặn / IP chưa allowlist)' }) })
    s.on('error', e => resolve({ host, port, ok: false, err: e.code || e.message }))
  })
}

function parseHost(u) {
  const m = u.match(/^mongodb(\+srv)?:\/\/(?:[^@]*@)?([^/?,]+)/i)
  return m ? { srv: !!m[1], host: m[2] } : null
}

;(async () => {
  console.log('=== 1. IP ra internet của máy này (thêm IP này vào Atlas Network Access) ===')
  console.log('   ', await get('https://api.ipify.org'))

  const p = parseHost(uri)
  if (!p) { console.error('URI không hợp lệ'); process.exit(1) }
  console.log('\n=== 2. Host trong URI ===')
  console.log('    srv:', p.srv, '| host:', p.host)

  let nodes = []
  if (p.srv) {
    console.log('\n=== 3. Phân giải SRV (_mongodb._tcp.' + p.host + ') ===')
    try {
      const recs = await dns.resolveSrv('_mongodb._tcp.' + p.host)
      recs.forEach(r => console.log('    ->', r.name + ':' + r.port))
      nodes = recs.map(r => ({ host: r.name, port: r.port }))
    } catch (e) {
      console.log('    LỖI SRV:', e.code || e.message, '(DNS không phân giải được — kiểm tra mạng/DNS)')
    }
  } else {
    nodes = p.host.split(',').map(hp => {
      const [host, port] = hp.split(':')
      return { host, port: Number(port) || 27017 }
    })
  }

  if (nodes.length) {
    console.log('\n=== 4. Kiểm TCP tới cổng 27017 của từng node ===')
    const results = await Promise.all(nodes.map(n => tcpCheck(n.host, n.port)))
    results.forEach(r => console.log('    ', r.ok ? 'OK  ' : 'FAIL', r.host + ':' + r.port, r.ok ? `(${r.ms}ms)` : '- ' + r.err))
    const anyOk = results.some(r => r.ok)
    console.log('\n=== Kết luận ===')
    if (!anyOk) {
      console.log('    Không node nào mở cổng 27017 từ máy này.')
      console.log('    => Thường là: IP ở bước 1 CHƯA được thêm vào Atlas Network Access,')
      console.log('       hoặc firewall/egress của AVD chặn cổng 27017.')
    } else {
      console.log('    TCP tới 27017 OK — nếu app vẫn timeout thì kiểm tra lại user/pass hoặc tên DB trong URI.')
    }
  }

  console.log('\n=== 5. Thử kết nối + ping bằng driver (timeout 8s) ===')
  try {
    const { MongoClient } = require('mongodb')
    const c = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000 })
    await c.connect()
    const r = await c.db().command({ ping: 1 })
    console.log('    OK:', JSON.stringify(r))
    await c.close()
  } catch (e) {
    console.log('    FAIL:', e.message)
  }
  process.exit(0)
})()
