/**
 * Lapisan penyimpanan data menggunakan SQLite bawaan Node.js (node:sqlite).
 * Skema dibuat saat pertama kali dijalankan, lalu tabel diisi dari
 * data/master.js (DATA CONTOH) bila database masih kosong.
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const master = require('../data/master');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'aplikasi.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS rumah_makan (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  kode  TEXT NOT NULL UNIQUE,
  nama  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cabang (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  rumah_makan_id INTEGER NOT NULL REFERENCES rumah_makan(id) ON DELETE RESTRICT,
  kode           TEXT NOT NULL UNIQUE,
  nama           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menu (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  rumah_makan_id INTEGER NOT NULL REFERENCES rumah_makan(id) ON DELETE RESTRICT,
  nama           TEXT NOT NULL,
  harga          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS penjualan (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  tanggal           TEXT NOT NULL,
  cabang_id         INTEGER NOT NULL REFERENCES cabang(id) ON DELETE RESTRICT,
  menu_id           INTEGER REFERENCES menu(id) ON DELETE SET NULL,
  nama_menu         TEXT NOT NULL,
  harga_satuan      INTEGER NOT NULL,
  jumlah            INTEGER NOT NULL,
  total             INTEGER NOT NULL,
  metode_pembayaran TEXT NOT NULL,
  catatan           TEXT,
  konfirmasi        INTEGER NOT NULL DEFAULT 0,
  dibuat_pada       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pengeluaran (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tanggal     TEXT NOT NULL,
  cabang_id   INTEGER NOT NULL REFERENCES cabang(id) ON DELETE RESTRICT,
  kategori    TEXT NOT NULL,
  keterangan  TEXT NOT NULL,
  nominal     INTEGER NOT NULL,
  konfirmasi  INTEGER NOT NULL DEFAULT 0,
  dibuat_pada TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stok_masuk_keluar (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tanggal     TEXT NOT NULL,
  cabang_id   INTEGER NOT NULL REFERENCES cabang(id) ON DELETE RESTRICT,
  jenis       TEXT NOT NULL CHECK (jenis IN ('masuk', 'keluar')),
  nama_bahan  TEXT NOT NULL,
  jumlah      REAL NOT NULL,
  satuan      TEXT NOT NULL,
  keterangan  TEXT,
  konfirmasi  INTEGER NOT NULL DEFAULT 0,
  dibuat_pada TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bahan (
  cabang_id     INTEGER NOT NULL REFERENCES cabang(id) ON DELETE CASCADE,
  nama_bahan    TEXT NOT NULL,
  satuan        TEXT NOT NULL,
  batas_minimum REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (cabang_id, nama_bahan)
);

CREATE INDEX IF NOT EXISTS idx_penjualan_cabang_tanggal ON penjualan(cabang_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_pengeluaran_cabang_tanggal ON pengeluaran(cabang_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_stok_cabang_tanggal ON stok_masuk_keluar(cabang_id, tanggal);
`);

/** Isi data master (DATA CONTOH) hanya bila tabel rumah_makan masih kosong. */
function isiDataMaster() {
  const ada = db.prepare('SELECT COUNT(*) AS jml FROM rumah_makan').get().jml;
  if (ada > 0) return false;

  const simpanRM = db.prepare('INSERT INTO rumah_makan (kode, nama) VALUES (?, ?)');
  const simpanCabang = db.prepare(
    'INSERT INTO cabang (rumah_makan_id, kode, nama) VALUES (?, ?, ?)'
  );
  const simpanMenu = db.prepare(
    'INSERT INTO menu (rumah_makan_id, nama, harga) VALUES (?, ?, ?)'
  );
  const simpanBahan = db.prepare(
    'INSERT OR IGNORE INTO bahan (cabang_id, nama_bahan, satuan, batas_minimum) VALUES (?, ?, ?, ?)'
  );

  db.exec('BEGIN');
  try {
    const idRm = {};
    for (const rm of master.rumahMakan) {
      const hasil = simpanRM.run(rm.kode, rm.nama);
      idRm[rm.kode] = Number(hasil.lastInsertRowid);
      for (const cbg of rm.cabang) {
        const hasilCabang = simpanCabang.run(idRm[rm.kode], cbg.kode, cbg.nama);
        const idCabang = Number(hasilCabang.lastInsertRowid);
        for (const bahan of master.bahanBawaan) {
          simpanBahan.run(idCabang, bahan.nama, bahan.satuan, bahan.batasMinimum);
        }
      }
    }
    for (const m of master.menu) {
      simpanMenu.run(idRm[m.kodeRumahMakan], m.nama, m.harga);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return true;
}

isiDataMaster();

function formatTanggal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function waktuSekarang() {
  return new Date().toISOString();
}

module.exports = { db, formatTanggal, waktuSekarang, DB_PATH };
