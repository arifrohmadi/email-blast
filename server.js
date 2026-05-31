const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { parse } = require('csv-parse');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Multer untuk upload CSV
const upload = multer({ dest: path.join(__dirname, 'uploads') });

// ─── State in-memory ───────────────────────────────────────────────
let contacts = [];
let sendLog = [];
let isSending = false;
let stopRequested = false;

// ─── Helper: validasi email ─────────────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

// ─── Helper: ganti variabel template ───────────────────────────────
function applyVars(template, contact) {
  return template
    .replace(/\{\{nama\}\}/gi, contact.nama || '')
    .replace(/\{\{email\}\}/gi, contact.email || '')
    .replace(/\{\{nomor\}\}/gi, contact.nomor || '');
}

// ─── Helper: sleep ──────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════

// Upload & parse CSV
app.post('/api/import-csv', upload.single('csv'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan' });

  const filePath = req.file.path;
  const results = [];

  fs.createReadStream(filePath)
    .pipe(parse({
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }))
    .on('data', (row) => {
      // Cari kolom nama dan email (case-insensitive)
      const keys = Object.keys(row);
      const namaKey = keys.find(k => k.toLowerCase().includes('nama')) || keys[1];
      const emailKey = keys.find(k => k.toLowerCase().includes('email')) || keys[2];
      const nomorKey = keys.find(k => k === '#' || k.toLowerCase() === 'no' || k.toLowerCase() === 'nomor') || keys[0];

      const email = row[emailKey] ? row[emailKey].trim() : '';
      const nama = row[namaKey] ? row[namaKey].trim() : '';
      const nomor = row[nomorKey] ? row[nomorKey].trim() : '';

      if (email) {
        results.push({
          id: Date.now() + Math.random(),
          nomor,
          nama,
          email,
          valid: isValidEmail(email),
        });
      }
    })
    .on('end', () => {
      fs.unlink(filePath, () => {});
      contacts = [...contacts, ...results];
      res.json({ success: true, imported: results.length, contacts });
    })
    .on('error', (err) => {
      fs.unlink(filePath, () => {});
      res.status(500).json({ error: 'Gagal parse CSV: ' + err.message });
    });
});

// Ambil semua kontak
app.get('/api/contacts', (req, res) => {
  res.json(contacts);
});

// Tambah kontak manual
app.post('/api/contacts', (req, res) => {
  const { nama, email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email wajib diisi' });
  const c = {
    id: Date.now() + Math.random(),
    nomor: contacts.length + 1,
    nama: nama || email.split('@')[0],
    email: email.trim(),
    valid: isValidEmail(email),
  };
  contacts.push(c);
  res.json(c);
});

// Update kontak
app.put('/api/contacts/:id', (req, res) => {
  const id = parseFloat(req.params.id);
  const idx = contacts.findIndex(c => c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Kontak tidak ditemukan' });
  const { nama, email } = req.body;
  contacts[idx] = { ...contacts[idx], nama, email, valid: isValidEmail(email) };
  res.json(contacts[idx]);
});

// Hapus kontak
app.delete('/api/contacts/:id', (req, res) => {
  const id = parseFloat(req.params.id);
  contacts = contacts.filter(c => c.id !== id);
  res.json({ success: true });
});

// Hapus semua kontak
app.delete('/api/contacts', (req, res) => {
  contacts = [];
  res.json({ success: true });
});

// Test koneksi SMTP
app.post('/api/test-smtp', async (req, res) => {
  const { host, port, user, pass, secure } = req.body;
  try {
    const transporter = nodemailer.createTransport({
      host, port: parseInt(port),
      secure: secure || false,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });
    await transporter.verify();
    res.json({ success: true, message: 'Koneksi SMTP berhasil!' });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Koneksi gagal: ' + err.message });
  }
});

// Mulai blast email (streaming via SSE)
app.post('/api/send', async (req, res) => {
  if (isSending) return res.status(400).json({ error: 'Pengiriman sedang berjalan' });

  const {
    host, port, user, pass, secure,
    senderName, subject, body, isHtml,
    delay, dryRun
  } = req.body;

  const valids = contacts.filter(c => c.valid);
  if (!valids.length) return res.status(400).json({ error: 'Tidak ada kontak valid' });
  if (!subject || !body) return res.status(400).json({ error: 'Subject dan isi email wajib diisi' });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  isSending = true;
  stopRequested = false;
  let sent = 0, failed = 0;

  let transporter = null;
  if (!dryRun) {
    try {
      transporter = nodemailer.createTransport({
        host, port: parseInt(port),
        secure: secure || false,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
      });
    } catch (err) {
      send({ type: 'error', message: 'Gagal membuat koneksi SMTP: ' + err.message });
      isSending = false;
      res.end();
      return;
    }
  }

  for (let i = 0; i < valids.length; i++) {
    if (stopRequested) {
      send({ type: 'stopped', sent, failed, total: valids.length });
      break;
    }

    const c = valids[i];
    const personalSubject = applyVars(subject, c);
    const personalBody = applyVars(body, c);
    const time = new Date().toLocaleTimeString('id-ID');
    let ok = false;
    let note = '';

    if (dryRun) {
      ok = true;
      note = '[DRY RUN] Simulasi berhasil';
      await sleep(80);
    } else {
      try {
        await transporter.sendMail({
          from: senderName ? `"${senderName}" <${user}>` : user,
          to: `"${c.nama}" <${c.email}>`,
          subject: personalSubject,
          [isHtml ? 'html' : 'text']: personalBody,
        });
        ok = true;
        note = 'Terkirim';
      } catch (err) {
        ok = false;
        note = err.message.substring(0, 80);
      }
    }

    if (ok) sent++; else failed++;

    const logEntry = {
      time, nomor: c.nomor, nama: c.nama, email: c.email,
      status: ok ? 'ok' : 'fail',
      note,
    };
    sendLog.push(logEntry);

    send({
      type: 'progress',
      index: i + 1,
      total: valids.length,
      sent, failed,
      pct: Math.round((i + 1) / valids.length * 100),
      log: logEntry,
    });

    if (i < valids.length - 1 && !stopRequested && !dryRun) {
      await sleep((parseInt(delay) || 2) * 1000);
    }
  }

  if (!stopRequested) {
    send({ type: 'done', sent, failed, total: valids.length });
  }

  isSending = false;
  res.end();
});

// Stop pengiriman
app.post('/api/stop', (req, res) => {
  stopRequested = true;
  res.json({ success: true });
});

// Ambil log
app.get('/api/log', (req, res) => {
  res.json(sendLog);
});

// Hapus log
app.delete('/api/log', (req, res) => {
  sendLog = [];
  res.json({ success: true });
});

// Export log sebagai CSV
app.get('/api/log/export', (req, res) => {
  const rows = ['Waktu,Nomor,Nama,Email,Status,Keterangan'];
  sendLog.forEach(l => {
    rows.push(`"${l.time}","${l.nomor}","${l.nama}","${l.email}","${l.status}","${l.note}"`);
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="log_blast_email.csv"');
  res.send(rows.join('\n'));
});

// ─── Start server ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║        BLAST EMAIL - SIAP DIGUNAKAN    ║');
  console.log('╠════════════════════════════════════════╣');
  console.log(`║  Buka browser: http://localhost:${PORT}   ║`);
  console.log('║  Tekan Ctrl+C untuk menghentikan       ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
});
