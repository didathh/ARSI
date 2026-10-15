/**
 * Sistem Pencatatan Terpadu Dua Rumah Makan Multi Cabang Berbasis Web
 * dengan Akses QR Code dan Digitalisasi Proses Bisnis.
 *
 * Entry point: memuat file .env, memasang berkas statis di public/,
 * lalu menyambungkan API staf (Bagian A), admin (Bagian B), dan QR (Bagian C).
 */
require('dotenv').config();

const path = require('path');
const express = require('express');
require('./db/sqlite'); // membuat dan mengisi database saat pertama dijalankan

const stafRouter = require('./routes/staf');
const adminRouter = require('./routes/admin');
const qrRouter = require('./routes/qr');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/staf', stafRouter);
app.use('/api/admin', adminRouter);
app.use('/api/qr', qrRouter);

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use((req, res) => {
  res.status(404).json({ pesan: 'Alamat tidak ditemukan.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ pesan: 'Terjadi kesalahan pada server.' });
});

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
  console.log(`Halaman staf : http://localhost:${PORT}/`);
  console.log(`Dashboard admin: http://localhost:${PORT}/admin`);
});
