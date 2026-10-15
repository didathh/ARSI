/**
 * Bagian B — API dashboard admin (/admin), dilindungi kata sandi dari file .env.
 * Mencakup data master, transaksi dengan filter, posisi stok, rekap, dan ekspor CSV.
 */
const express = require('express');
const crypto = require('crypto');
const { db, formatTanggal } = require('../db/sqlite');
const master = require('../data/master');

const router = express.Router();

const KUNCI = process.env.SECRET_TOKEN || 'kunci-lokal-sementara-ganti-pada-env';
const MASA_BERLAKU_MS = 8 * 60 * 60 * 1000;

function buatToken(muatan) {
  const data = Buffer.from(JSON.stringify(muatan)).toString('base64url');
  const tanda = crypto.createHmac('sha256', KUNCI).update(data).digest('base64url');
  return `${data}.${tanda}`;
}

function bacaToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [data, tanda] = token.split('.');
  const harap = crypto.createHmac('sha256', KUNCI).update(data).digest('base64url');
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

function hash(teks) {
  return crypto.createHash('sha256').update(String(teks)).digest();
}

/* ---------------- Login admin ---------------- */

router.post('/login', (req, res) => {
  const { kataSandi } = req.body || {};
  const dariEnv = process.env.ADMIN_PASSWORD;
  if (!dariEnv) {
    return res.status(500).json({ pesan: 'Kata sandi admin belum diatur pada file .env (ADMIN_PASSWORD).' });
  }
  if (!kataSandi || !crypto.timingSafeEqual(hash(kataSandi), hash(dariEnv))) {
    return res.status(401).json({ pesan: 'Kata sandi tidak sesuai.' });
  }
  res.json({ token: buatToken({ peran: 'admin', exp: Date.now() + MASA_BERLAKU_MS }) });
});

function wajibAdmin(req, res, next) {
  const berkas = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const muatan = bacaToken(berkas);
  if (!muatan || muatan.peran !== 'admin') {
    return res.status(401).json({ pesan: 'Sesi admin berakhir. Silakan masuk kembali.' });
  }
  next();
}

router.use(wajibAdmin);

/* ---------------- Filter bersama ---------------- */

function rentang(req) {
  const sampai = req.query.sampai || formatTanggal();
  const batas = new Date();
  batas.setDate(batas.getDate() - 29);
  const dari = req.query.dari || formatTanggal(batas);
  const cabangId = req.query.cabang ? Number(req.query.cabang) : null;
  const rmId = req.query.rm ? Number(req.query.rm) : null;
  return { dari, sampai, cabangId, rmId };
}

function klausaFilter({ dari, sampai, cabangId, rmId }, alias, aliasCabang = 'cabang') {
  const syarat = [`${alias}.tanggal BETWEEN ? AND ?`];
  const nilai = [dari, sampai];
  if (cabangId) {
    syarat.push(`${alias}.cabang_id = ?`);
    nilai.push(cabangId);
  }
  if (rmId) {
    syarat.push(`${aliasCabang}.rumah_makan_id = ?`);
    nilai.push(rmId);
  }
  return { where: syarat.join(' AND '), nilai };
}

/* ---------------- Data master ---------------- */

router.get('/master', (req, res) => {
  res.json({
    rumahMakan: db.prepare('SELECT id, kode, nama FROM rumah_makan ORDER BY nama').all(),
    cabang: db
      .prepare(
        'SELECT id, rumah_makan_id, kode, nama FROM cabang ORDER BY rumah_makan_id, nama'
      )
      .all(),
    menu: db
      .prepare('SELECT id, rumah_makan_id, nama, harga FROM menu ORDER BY rumah_makan_id, nama')
      .all(),
    kategoriPengeluaran: master.kategoriPengeluaran,
    metodePembayaran: master.metodePembayaran
  });
});

router.post('/rumah-makan', (req, res) => {
  const { nama, kode } = req.body || {};
  if (!nama) return res.status(400).json({ pesan: 'Nama rumah makan wajib diisi.' });
  const kodeAkhir = (kode || `RM_${Date.now()}`).trim();
  try {
    const hasil = db.prepare('INSERT INTO rumah_makan (kode, nama) VALUES (?, ?)').run(kodeAkhir, nama);
    res.status(201).json({ id: Number(hasil.lastInsertRowid) });
  } catch {
    res.status(400).json({ pesan: 'Kode rumah makan sudah dipakai.' });
  }
});

router.put('/rumah-makan/:id', (req, res) => {
  const { nama } = req.body || {};
  if (!nama) return res.status(400).json({ pesan: 'Nama rumah makan wajib diisi.' });
  db.prepare('UPDATE rumah_makan SET nama = ? WHERE id = ?').run(nama, Number(req.params.id));
  res.json({ pesan: 'Nama rumah makan diperbarui.' });
});

router.delete('/rumah-makan/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM rumah_makan WHERE id = ?').run(Number(req.params.id));
    res.json({ pesan: 'Rumah makan dihapus.' });
  } catch {
    res.status(400).json({ pesan: 'Tidak dapat menghapus: masih memiliki cabang atau transaksi.' });
  }
});

router.post('/cabang', (req, res) => {
  const { rumahMakanId, nama, kode } = req.body || {};
  if (!rumahMakanId || !nama) {
    return res.status(400).json({ pesan: 'Rumah makan dan nama cabang wajib diisi.' });
  }
  const kodeAkhir = (kode || `CBG_${Date.now()}`).trim();
  try {
    const hasil = db
      .prepare('INSERT INTO cabang (rumah_makan_id, kode, nama) VALUES (?, ?, ?)')
      .run(Number(rumahMakanId), kodeAkhir, nama);
    const id = Number(hasil.lastInsertRowid);
    for (const b of master.bahanBawaan) {
      db.prepare(
        'INSERT OR IGNORE INTO bahan (cabang_id, nama_bahan, satuan, batas_minimum) VALUES (?, ?, ?, ?)'
      ).run(id, b.nama, b.satuan, b.batasMinimum);
    }
    res.status(201).json({ id, kode: kodeAkhir, pinVariabel: `PIN_CABANG_${kodeAkhir}` });
  } catch {
    res.status(400).json({ pesan: 'Kode cabang sudah dipakai.' });
  }
});

router.put('/cabang/:id', (req, res) => {
  const { nama } = req.body || {};
  if (!nama) return res.status(400).json({ pesan: 'Nama cabang wajib diisi.' });
  db.prepare('UPDATE cabang SET nama = ? WHERE id = ?').run(nama, Number(req.params.id));
  res.json({ pesan: 'Nama cabang diperbarui.' });
});

router.delete('/cabang/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM cabang WHERE id = ?').run(Number(req.params.id));
    res.json({ pesan: 'Cabang dihapus.' });
  } catch {
    res.status(400).json({ pesan: 'Tidak dapat menghapus: cabang masih memiliki transaksi.' });
  }
});

router.post('/menu', (req, res) => {
  const { rumahMakanId, nama, harga } = req.body || {};
  const hargaInt = Math.round(Number(harga));
  if (!rumahMakanId || !nama || !Number.isFinite(hargaInt) || hargaInt < 0) {
    return res.status(400).json({ pesan: 'Rumah makan, nama menu, dan harga wajib diisi dengan benar.' });
  }
  const hasil = db
    .prepare('INSERT INTO menu (rumah_makan_id, nama, harga) VALUES (?, ?, ?)')
    .run(Number(rumahMakanId), nama, hargaInt);
  res.status(201).json({ id: Number(hasil.lastInsertRowid) });
});

router.put('/menu/:id', (req, res) => {
  const { nama, harga } = req.body || {};
  const hargaInt = Math.round(Number(harga));
  if (!nama || !Number.isFinite(hargaInt) || hargaInt < 0) {
    return res.status(400).json({ pesan: 'Nama menu dan harga wajib diisi dengan benar.' });
  }
  db.prepare('UPDATE menu SET nama = ?, harga = ? WHERE id = ?').run(nama, hargaInt, Number(req.params.id));
  res.json({ pesan: 'Menu diperbarui.' });
});

router.delete('/menu/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM menu WHERE id = ?').run(Number(req.params.id));
    res.json({ pesan: 'Menu dihapus.' });
  } catch {
    res.status(400).json({ pesan: 'Tidak dapat menghapus menu.' });
  }
});

/* ---------------- Daftar transaksi dengan filter ---------------- */

router.get('/transaksi', (req, res) => {
  const f = rentang(req);
  const k = klausaFilter(f, 'p', 'c');
  const penjualan = db
    .prepare(
      `SELECT p.id, p.tanggal, p.nama_menu, p.jumlah, p.harga_satuan, p.total,
              p.metode_pembayaran, p.catatan, p.konfirmasi,
              c.nama AS cabang_nama, r.nama AS rumah_makan_nama
       FROM penjualan p
       JOIN cabang c ON c.id = p.cabang_id
       JOIN rumah_makan r ON r.id = c.rumah_makan_id
       WHERE ${k.where}
       ORDER BY p.tanggal DESC, p.id DESC LIMIT 2000`
    )
    .all(...k.nilai);

  const k2 = klausaFilter(f, 'x', 'c');
  const pengeluaran = db
    .prepare(
      `SELECT x.id, x.tanggal, x.kategori, x.keterangan, x.nominal, x.konfirmasi,
              c.nama AS cabang_nama, r.nama AS rumah_makan_nama
       FROM pengeluaran x
       JOIN cabang c ON c.id = x.cabang_id
       JOIN rumah_makan r ON r.id = c.rumah_makan_id
       WHERE ${k2.where}
       ORDER BY x.tanggal DESC, x.id DESC LIMIT 2000`
    )
    .all(...k2.nilai);

  res.json({ filter: f, penjualan, pengeluaran });
});

/* ---------------- Posisi stok + penanda menipis ---------------- */

router.get('/stok', (req, res) => {
  const { cabangId, rmId } = rentang(req);
  const syarat = [];
  const nilai = [];
  if (cabangId) { syarat.push('c.id = ?'); nilai.push(cabangId); }
  if (rmId) { syarat.push('c.rumah_makan_id = ?'); nilai.push(rmId); }
  const whereCabang = syarat.length ? `WHERE ${syarat.join(' AND ')}` : '';

  const daftarBahan = db
    .prepare(
      `SELECT c.id AS cabang_id, c.nama AS cabang_nama, r.nama AS rumah_makan_nama,
              b.nama_bahan, b.satuan, b.batas_minimum
       FROM bahan b
       JOIN cabang c ON c.id = b.cabang_id
       JOIN rumah_makan r ON r.id = c.rumah_makan_id
       ${whereCabang}
       ORDER BY r.nama, c.nama, b.nama_bahan`
    )
    .all(...nilai);

  const gerak = db
    .prepare(
      `SELECT s.cabang_id, s.nama_bahan,
              COALESCE(SUM(CASE WHEN s.jenis = 'masuk' THEN s.jumlah ELSE 0 END), 0) AS total_masuk,
              COALESCE(SUM(CASE WHEN s.jenis = 'keluar' THEN s.jumlah ELSE 0 END), 0) AS total_keluar
       FROM stok_masuk_keluar s
       GROUP BY s.cabang_id, s.nama_bahan`
    )
    .all();

  const peta = new Map(gerak.map((g) => [`${g.cabang_id}|${g.nama_bahan}`, g]));
  const data = daftarBahan.map((b) => {
    const g = peta.get(`${b.cabang_id}|${b.nama_bahan}`) || { total_masuk: 0, total_keluar: 0 };
    const posisi = g.total_masuk - g.total_keluar;
    return {
      ...b,
      total_masuk: g.total_masuk,
      total_keluar: g.total_keluar,
      posisi,
      menipis: b.batas_minimum > 0 && posisi <= b.batas_minimum
    };
  });
  res.json({ data, jumlahMenipis: data.filter((d) => d.menipis).length });
});

router.put('/stok/batas-minimum', (req, res) => {
  const { cabangId, namaBahan, batasMinimum } = req.body || {};
  const nilai = Number(batasMinimum);
  if (!cabangId || !namaBahan || !Number.isFinite(nilai) || nilai < 0) {
    return res.status(400).json({ pesan: 'Data batas minimum tidak lengkap.' });
  }
  db.prepare(
    'UPDATE bahan SET batas_minimum = ? WHERE cabang_id = ? AND nama_bahan = ?'
  ).run(nilai, Number(cabangId), namaBahan);
  res.json({ pesan: 'Batas minimum diperbarui.' });
});

/* ---------------- Rekap ---------------- */

router.get('/rekap', (req, res) => {
  const f = rentang(req);
  const k = klausaFilter(f, 'p', 'c');
  const jual = db
    .prepare(
      `SELECT COALESCE(SUM(p.total),0) AS total, COALESCE(SUM(p.jumlah),0) AS jumlah_item, COUNT(*) AS jumlah_transaksi
       FROM penjualan p
       JOIN cabang c ON c.id = p.cabang_id
       JOIN rumah_makan r ON r.id = c.rumah_makan_id
       WHERE ${k.where}`
    )
    .get(...k.nilai);
  const k2 = klausaFilter(f, 'x', 'c');
  const keluar = db
    .prepare(
      `SELECT COALESCE(SUM(x.nominal),0) AS total, COUNT(*) AS jumlah_transaksi
       FROM pengeluaran x
       JOIN cabang c ON c.id = x.cabang_id
       JOIN rumah_makan r ON r.id = c.rumah_makan_id
       WHERE ${k2.where}`
    )
    .get(...k2.nilai);

  const perCabang = db
    .prepare(
      `SELECT c.id AS cabang_id, c.nama AS cabang_nama, r.id AS rumah_makan_id, r.nama AS rumah_makan_nama,
              COALESCE(j.total_jual,0) AS total_penjualan,
              COALESCE(e.total_keluar,0) AS total_pengeluaran
       FROM cabang c
       JOIN rumah_makan r ON r.id = c.rumah_makan_id
       LEFT JOIN (
         SELECT p.cabang_id, SUM(p.total) AS total_jual FROM penjualan p
         WHERE p.tanggal BETWEEN ? AND ? GROUP BY p.cabang_id
       ) j ON j.cabang_id = c.id
       LEFT JOIN (
         SELECT x.cabang_id, SUM(x.nominal) AS total_keluar FROM pengeluaran x
         WHERE x.tanggal BETWEEN ? AND ? GROUP BY x.cabang_id
       ) e ON e.cabang_id = c.id`
    )
    .all(f.dari, f.sampai, f.dari, f.sampai)
    .filter((c) => (!f.rmId || db.prepare('SELECT rumah_makan_id FROM cabang WHERE id = ?').get(c.cabang_id).rumah_makan_id === f.rmId))
    .filter((c) => (!f.cabangId || c.cabang_id === f.cabangId));

  const perRumahMakan = db
    .prepare('SELECT id, nama FROM rumah_makan ORDER BY nama')
    .all()
    .map((r) => {
      const cabangRm = perCabang.filter((c) => c.rumah_makan_id === r.id);
      const totalPenjualan = cabangRm.reduce((a, c) => a + c.total_penjualan, 0);
      const totalPengeluaran = cabangRm.reduce((a, c) => a + c.total_pengeluaran, 0);
      return { id: r.id, nama: r.nama, total_penjualan: totalPenjualan, total_pengeluaran: totalPengeluaran };
    });

  const perMenu = db
    .prepare(
      `SELECT p.nama_menu, SUM(p.jumlah) AS jumlah_terjual, SUM(p.total) AS total
       FROM penjualan p
       JOIN cabang c ON c.id = p.cabang_id
       JOIN rumah_makan r ON r.id = c.rumah_makan_id
       WHERE ${k.where}
       GROUP BY p.nama_menu
       ORDER BY SUM(p.jumlah) DESC`
    )
    .all(...k.nilai);

  res.json({
    filter: f,
    ringkas: {
      totalPenjualan: jual.total,
      totalPengeluaran: keluar.total,
      labaKotor: jual.total - keluar.total,
      jumlahTransaksiPenjualan: jual.jumlah_transaksi,
      jumlahTransaksiPengeluaran: keluar.jumlah_transaksi,
      jumlahItemTerjual: jual.jumlah_item
    },
    perCabang: perCabang.map((c) => ({
      ...c,
      selisih: c.total_penjualan - c.total_pengeluaran
    })),
    perRumahMakan: perRumahMakan.map((r) => ({
      ...r,
      selisih: r.total_penjualan - r.total_pengeluaran
    })),
    perMenu
  });
});

/* ---------------- Ekspor CSV ---------------- */

function keCsv(baris, judul) {
  const sel = (nilai) => {
    const teks = nilai === null || nilai === undefined ? '' : String(nilai);
    return `"${teks.replace(/"/g, '""')}"`;
  };
  const barisTeks = [
    judul.map(sel).join(','),
    ...baris.map((b) => judul.map((j) => sel(b[j])).join(','))
  ];
  return '\uFEFF' + barisTeks.join('\r\n') + '\r\n';
}

router.get('/export/penjualan', (req, res) => {
  const f = rentang(req);
  const k = klausaFilter(f, 'p', 'c');
  const data = db
    .prepare(
      `SELECT p.tanggal, r.nama AS rumah_makan, c.nama AS cabang, p.nama_menu,
              p.harga_satuan, p.jumlah, p.total, p.metode_pembayaran,
              p.catatan, p.konfirmasi
       FROM penjualan p
       JOIN cabang c ON c.id = p.cabang_id
       JOIN rumah_makan r ON r.id = c.rumah_makan_id
       WHERE ${k.where}
       ORDER BY p.tanggal, c.nama, p.id`
    )
    .all(...k.nilai);
  const csv = keCsv(data, [
    'tanggal', 'rumah_makan', 'cabang', 'nama_menu', 'harga_satuan',
    'jumlah', 'total', 'metode_pembayaran', 'catatan', 'konfirmasi'
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="penjualan_${f.dari}_${f.sampai}.csv"`);
  res.send(csv);
});

router.get('/export/pengeluaran', (req, res) => {
  const f = rentang(req);
  const k = klausaFilter(f, 'x', 'c');
  const data = db
    .prepare(
      `SELECT x.tanggal, r.nama AS rumah_makan, c.nama AS cabang, x.kategori,
              x.keterangan, x.nominal, x.konfirmasi
       FROM pengeluaran x
       JOIN cabang c ON c.id = x.cabang_id
       JOIN rumah_makan r ON r.id = c.rumah_makan_id
       WHERE ${k.where}
       ORDER BY x.tanggal, c.nama, x.id`
    )
    .all(...k.nilai);
  const csv = keCsv(data, [
    'tanggal', 'rumah_makan', 'cabang', 'kategori', 'keterangan', 'nominal', 'konfirmasi'
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="pengeluaran_${f.dari}_${f.sampai}.csv"`);
  res.send(csv);
});

module.exports = router;
