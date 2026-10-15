/**
 * Generator QR Code per cabang (Bagian C).
 * Pemakaian: npm run qr
 * Hasil: folder qr-codes/ berisi PNG per cabang, siap dicetak.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { db } = require('../db/sqlite');

function baseUrl() {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/+$/, '');
  return `http://localhost:${process.env.PORT || 3000}`;
}

async function utama() {
  const keluar = path.join(__dirname, '..', 'qr-codes');
  fs.mkdirSync(keluar, { recursive: true });

  const daftar = db
    .prepare(
      `SELECT c.kode, c.nama, r.nama AS rumah_makan_nama
       FROM cabang c JOIN rumah_makan r ON r.id = c.rumah_makan_id
       ORDER BY r.nama, c.nama`
    )
    .all();

  console.log(`Alamat dasar: ${baseUrl()}`);
  for (const c of daftar) {
    const url = `${baseUrl()}/?cabang=${encodeURIComponent(c.kode)}`;
    const berkas = path.join(keluar, `QR_${c.kode}.png`);
    await QRCode.toFile(berkas, url, {
      type: 'png',
      width: 1024,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#3E2F24', light: '#FFFFFF' }
    });
    console.log(`✓ ${c.nama} -> ${berkas}`);
    console.log(`  ${url}`);
  }
  console.log(`\nSelesai. ${daftar.length} QR Code dibuat di folder qr-codes/`);
}

utama().catch((err) => {
  console.error('Gagal membuat QR Code:', err.message);
  process.exit(1);
});
