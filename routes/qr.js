/**
 * Bagian C — Generator QR Code.
 * GET /api/qr/:kode menghasilkan QR Code PNG yang mengarah ke halaman
 * pencatatan cabang tersebut: <BASE_URL>/?cabang=<kode>
 */
const express = require('express');
const QRCode = require('qrcode');
const { db } = require('../db/sqlite');

const router = express.Router();

function baseUrl() {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/+$/, '');
  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
}

function urlCabang(kode) {
  return `${baseUrl()}/?cabang=${encodeURIComponent(kode)}`;
}

/** Daftar semua cabang beserta tautan QR-nya (dipakai halaman admin). */
router.get('/', (req, res) => {
  const daftar = db
    .prepare(
      `SELECT c.id, c.kode, c.nama, r.nama AS rumah_makan_nama
       FROM cabang c JOIN rumah_makan r ON r.id = c.rumah_makan_id
       ORDER BY r.nama, c.nama`
    )
    .all()
    .map((c) => ({
      ...c,
      url: urlCabang(c.kode),
      urlGambar: `${baseUrl()}/api/qr/${encodeURIComponent(c.kode)}.png`
    }));
  res.json({ baseUrl: baseUrl(), data: daftar });
});

/** PNG QR untuk satu cabang: /api/qr/RM_A_C1.png */
router.get('/:filename', async (req, res) => {
  const kode = String(req.params.filename).replace(/\.png$/i, '');
  const cabang = db.prepare('SELECT id, kode, nama FROM cabang WHERE kode = ?').get(kode);
  if (!cabang) return res.status(404).json({ pesan: 'Kode cabang tidak ditemukan.' });

  try {
    const png = await QRCode.toBuffer(urlCabang(cabang.kode), {
      type: 'png',
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#3E2F24', light: '#FFFFFF' }
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    if (req.query.unduh === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="QR_${cabang.kode}.png"`);
    }
    res.send(png);
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal membuat QR Code.', detail: err.message });
  }
});

module.exports = router;
module.exports.urlCabang = urlCabang;
