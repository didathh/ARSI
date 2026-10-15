/**
 * Bagian A — API halaman staf cabang (diakses melalui ponsel / QR Code).
 * Login memakai PIN cabang yang dibaca dari file .env:
 *   PIN_CABANG_<kode cabang>
 */
const express = require('express');
const crypto = require('crypto');
const { db, formatTanggal, waktuSekarang } = require('../db/sqlite');

const router = express.Router();

const SECRET = process.env.SECRET_TOKEN || 'kunci-lokal-sementara-ganti-pada-env';
const MASA_BERLAKU_MS = 8 * 60 * 60 * 1000; // 8 jam

/* ---------------- Utilitas token sesi ---------------- */

function buatToken(muatan) {
  const data = Buffer.from(JSON.stringify(muatan)).toString('base64url');
  const tanda = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${tanda}`;
}

function bacaToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [data, tanda] = token.split('.');
  const harap = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  const a = Buffer.from(tanda);
  const b = Buffer.from(harap);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const muatan = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!muatan.exp || muatan.exp < Date.now()) return null;
    return muatan;
  } catch {
    return null;
  }
}

function wajibLogin(req, res, next) {
  const berkas = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const muatan = bacaToken(berkas);
  if (!muatan || muatan.peran !== 'staf') {
    return res.status(401).json({ pesan: 'Sesi berakhir. Silakan masuk kembali dengan PIN cabang.' });
  }
  const cabang = db
    .prepare(
      `SELECT c.id, c.kode, c.nama, c.rumah_makan_id, r.nama AS rumah_makan_nama
       FROM cabang c JOIN rumah_makan r ON r.id = c.rumah_makan_id
       WHERE c.id = ?`
    )
    .get(muatan.cabangId);
  if (!cabang) return res.status(401).json({ pesan: 'Cabang tidak ditemukan.' });
  req.cabang = cabang;
  next();
}

/** Seragamkan nilai PIN agar perbandingan tidak bocor lewat panjang teks. */
function samakan(teks) {
  return crypto.createHash('sha256').update(String(teks)).digest();
}

/* ---------------- Master (publik, untuk beranda) ---------------- */

router.get('/master', (req, res) => {
  const rumahMakan = db.prepare('SELECT id, kode, nama FROM rumah_makan ORDER BY nama').all();
  const cabang = db
    .prepare('SELECT id, kode, nama, rumah_makan_id FROM cabang ORDER BY nama')
    .all();
  const menu = db
    .prepare('SELECT id, rumah_makan_id, nama, harga FROM menu ORDER BY nama')
    .all();
  res.json({
    rumahMakan: rumahMakan.map((r) => ({
      ...r,
      cabang: cabang.filter((c) => c.rumah_makan_id === r.id)
    })),
    menu,
    kategoriPengeluaran: require('../data/master').kategoriPengeluaran,
    metodePembayaran: require('../data/master').metodePembayaran
  });
});

/* ---------------- Login PIN cabang ---------------- */

router.post('/login', (req, res) => {
  const { cabangId, pin } = req.body || {};
  if (!cabangId || !pin) {
    return res.status(400).json({ pesan: 'Rumah makan, cabang, dan PIN wajib diisi.' });
  }
  const cabang = db
    .prepare(
      `SELECT c.id, c.kode, c.nama, c.rumah_makan_id, r.nama AS rumah_makan_nama
       FROM cabang c JOIN rumah_makan r ON r.id = c.rumah_makan_id
       WHERE c.id = ?`
    )
    .get(Number(cabangId));
  if (!cabang) return res.status(404).json({ pesan: 'Cabang tidak ditemukan.' });

  const namaVariabel = `PIN_CABANG_${cabang.kode}`;
  const pinBenar = process.env[namaVariabel];
  if (!pinBenar) {
    return res.status(500).json({
      pesan: `PIN cabang belum diatur. Tambahkan ${namaVariabel} pada file .env.`
    });
  }
  if (!crypto.timingSafeEqual(samakan(pin), samakan(pinBenar))) {
    return res.status(401).json({ pesan: 'PIN cabang tidak sesuai.' });
  }

  const token = buatToken({
    peran: 'staf',
    cabangId: cabang.id,
    exp: Date.now() + MASA_BERLAKU_MS
  });
  res.json({
    token,
    cabang: {
      id: cabang.id,
      kode: cabang.kode,
      nama: cabang.nama,
      rumahMakanId: cabang.rumah_makan_id,
      rumahMakanNama: cabang.rumah_makan_nama
    }
  });
});

/* ---------------- Ringkasan hari ini ---------------- */

router.get('/hari-ini', wajibLogin, (req, res) => {
  const tanggal = formatTanggal();
  const jual = db
    .prepare(
      'SELECT COUNT(*) AS jumlah, COALESCE(SUM(total),0) AS total FROM penjualan WHERE cabang_id = ? AND tanggal = ?'
    )
    .get(req.cabang.id, tanggal);
  const keluar = db
    .prepare(
      'SELECT COUNT(*) AS jumlah, COALESCE(SUM(nominal),0) AS total FROM pengeluaran WHERE cabang_id = ? AND tanggal = ?'
    )
    .get(req.cabang.id, tanggal);
  const stok = db
    .prepare(
      'SELECT COUNT(*) AS jumlah FROM stok_masuk_keluar WHERE cabang_id = ? AND tanggal = ?'
    )
    .get(req.cabang.id, tanggal);
  const menuHariIni = db
    .prepare(
      `SELECT nama_menu, SUM(jumlah) AS jumlah, SUM(total) AS total
       FROM penjualan WHERE cabang_id = ? AND tanggal = ?
       GROUP BY nama_menu ORDER BY SUM(jumlah) DESC`
    )
    .all(req.cabang.id, tanggal);

  res.json({
    tanggal,
    cabang: req.cabang,
    penjualan: jual,
    pengeluaran: keluar,
    stok: stok,
    selisih: jual.total - keluar.total,
    menuTerlaris: menuHariIni
  });
});

/* ---------------- Formulir: penjualan ---------------- */

router.post('/penjualan', wajibLogin, (req, res) => {
  const { tanggal, menuId, jumlah, metodePembayaran, catatan, konfirmasi } = req.body || {};
  if (!konfirmasi) {
    return res.status(400).json({
      pesan: 'Centang konfirmasi bahwa data telah diperiksa kebenarannya oleh petugas pencatat.'
    });
  }
  if (!tanggal || !menuId || !jumlah || !metodePembayaran) {
    return res.status(400).json({ pesan: 'Tanggal, menu, jumlah, dan metode pembayaran wajib diisi.' });
  }
  const jumlahInt = Number(jumlah);
  if (!Number.isInteger(jumlahInt) || jumlahInt <= 0) {
    return res.status(400).json({ pesan: 'Jumlah terjual harus bilangan bulat lebih dari nol.' });
  }
  const menu = db
    .prepare('SELECT id, nama, harga, rumah_makan_id FROM menu WHERE id = ?')
    .get(Number(menuId));
  if (!menu || menu.rumah_makan_id !== req.cabang.rumah_makan_id) {
    return res.status(400).json({ pesan: 'Menu tidak tersedia untuk rumah makan cabang ini.' });
  }
  const total = menu.harga * jumlahInt;
  const hasil = db
    .prepare(
      `INSERT INTO penjualan
        (tanggal, cabang_id, menu_id, nama_menu, harga_satuan, jumlah, total, metode_pembayaran, catatan, konfirmasi, dibuat_pada)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      tanggal,
      req.cabang.id,
      menu.id,
      menu.nama,
      menu.harga,
      jumlahInt,
      total,
      metodePembayaran,
      catatan || null,
      waktuSekarang()
    );
  res.status(201).json({
    pesan: 'Penjualan berhasil dicatat.',
    data: { id: Number(hasil.lastInsertRowid), namaMenu: menu.nama, jumlah: jumlahInt, total }
  });
});

/* ---------------- Formulir: pengeluaran ---------------- */

router.post('/pengeluaran', wajibLogin, (req, res) => {
  const { tanggal, kategori, keterangan, nominal, konfirmasi } = req.body || {};
  if (!konfirmasi) {
    return res.status(400).json({
      pesan: 'Centang konfirmasi bahwa data telah diperiksa kebenarannya oleh petugas pencatat.'
    });
  }
  if (!tanggal || !kategori || !keterangan || nominal === undefined || nominal === '') {
    return res.status(400).json({ pesan: 'Tanggal, kategori, keterangan, dan nominal wajib diisi.' });
  }
  const nominalInt = Math.round(Number(nominal));
  if (!Number.isFinite(nominalInt) || nominalInt <= 0) {
    return res.status(400).json({ pesan: 'Nominal harus angka lebih dari nol.' });
  }
  const hasil = db
    .prepare(
      `INSERT INTO pengeluaran (tanggal, cabang_id, kategori, keterangan, nominal, konfirmasi, dibuat_pada)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    )
    .run(tanggal, req.cabang.id, kategori, keterangan, nominalInt, waktuSekarang());
  res.status(201).json({
    pesan: 'Pengeluaran berhasil dicatat.',
    data: { id: Number(hasil.lastInsertRowid), nominal: nominalInt }
  });
});

/* ---------------- Formulir: stok bahan ---------------- */

router.post('/stok', wajibLogin, (req, res) => {
  const { tanggal, jenis, namaBahan, jumlah, satuan, keterangan, konfirmasi } = req.body || {};
  if (!konfirmasi) {
    return res.status(400).json({
      pesan: 'Centang konfirmasi bahwa data telah diperiksa kebenarannya oleh petugas pencatat.'
    });
  }
  if (!tanggal || !jenis || !namaBahan || !jumlah || !satuan) {
    return res.status(400).json({ pesan: 'Tanggal, jenis, nama bahan, jumlah, dan satuan wajib diisi.' });
  }
  if (jenis !== 'masuk' && jenis !== 'keluar') {
    return res.status(400).json({ pesan: 'Jenis stok hanya boleh "masuk" atau "keluar".' });
  }
  const jumlahNum = Number(jumlah);
  if (!Number.isFinite(jumlahNum) || jumlahNum <= 0) {
    return res.status(400).json({ pesan: 'Jumlah stok harus angka lebih dari nol.' });
  }
  db.prepare(
    `INSERT INTO bahan (cabang_id, nama_bahan, satuan, batas_minimum)
     VALUES (?, ?, ?, 0)
     ON CONFLICT(cabang_id, nama_bahan) DO NOTHING`
  ).run(req.cabang.id, namaBahan, satuan);

  const hasil = db
    .prepare(
      `INSERT INTO stok_masuk_keluar (tanggal, cabang_id, jenis, nama_bahan, jumlah, satuan, keterangan, konfirmasi, dibuat_pada)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(tanggal, req.cabang.id, jenis, namaBahan, jumlahNum, satuan, keterangan || null, waktuSekarang());
  res.status(201).json({
    pesan: `Stok ${jenis} berhasil dicatat.`,
    data: { id: Number(hasil.lastInsertRowid) }
  });
});

/* ---------------- Riwayat (dengan filter tanggal) ---------------- */

router.get('/riwayat', wajibLogin, (req, res) => {
  const sampai = req.query.sampai || formatTanggal();
  const batas = new Date();
  batas.setDate(batas.getDate() - 30);
  const dari = req.query.dari || formatTanggal(batas);

  const baris = db
    .prepare(
      `SELECT * FROM (
         SELECT 'penjualan' AS jenis, id, tanggal, dibuat_pada,
                'Penjualan: ' || nama_menu AS keterangan,
                metode_pembayaran AS rincian,
                total AS nominal, CAST(jumlah AS TEXT) AS jumlah, NULL AS satuan, konfirmasi
         FROM penjualan WHERE cabang_id = ? AND tanggal BETWEEN ? AND ?
         UNION ALL
         SELECT 'pengeluaran', id, tanggal, dibuat_pada,
                'Pengeluaran: ' || keterangan,
                kategori, nominal, NULL, NULL, konfirmasi
         FROM pengeluaran WHERE cabang_id = ? AND tanggal BETWEEN ? AND ?
         UNION ALL
         SELECT 'stok', id, tanggal, dibuat_pada,
                'Stok ' || jenis || ': ' || nama_bahan,
                keterangan, NULL, CAST(jumlah AS REAL), satuan, konfirmasi
         FROM stok_masuk_keluar WHERE cabang_id = ? AND tanggal BETWEEN ? AND ?
       )
       ORDER BY tanggal DESC, dibuat_pada DESC
       LIMIT 300`
    )
    .all(
      req.cabang.id, dari, sampai,
      req.cabang.id, dari, sampai,
      req.cabang.id, dari, sampai
    );
  res.json({ dari, sampai, data: baris });
});

module.exports = router;
