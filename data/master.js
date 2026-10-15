/**
 * ============================================================
 * DATA CONTOH — SATU-SATUNYA BERKAS SUMBER DATA MASTER CONTOH
 * ============================================================
 * SELURUH ISI BERKAS INI ADALAH DATA CONTOH untuk keperluan
 * demonstrasi dan pengujian. Ganti dengan data milik Anda sendiri.
 * Tidak ada nama rumah makan, cabang, menu, harga, alamat, atau
 * kontak nyata yang digunakan di sini.
 * ============================================================
 */

module.exports = {
  keterangan: 'SELURUH DATA DI BAWAH INI ADALAH DATA CONTOH dan hanya untuk demonstrasi.',

  /** Dua rumah makan, masing-masing memiliki beberapa cabang. */
  rumahMakan: [
    {
      kode: 'RM_A',
      nama: 'Rumah Makan Contoh Satu (CONTOH)',
      cabang: [
        { kode: 'RM_A_C1', nama: 'Cabang Contoh A1 (CONTOH)' },
        { kode: 'RM_A_C2', nama: 'Cabang Contoh A2 (CONTOH)' }
      ]
    },
    {
      kode: 'RM_B',
      nama: 'Rumah Makan Contoh Dua (CONTOH)',
      cabang: [
        { kode: 'RM_B_C1', nama: 'Cabang Contoh B1 (CONTOH)' },
        { kode: 'RM_B_C2', nama: 'Cabang Contoh B2 (CONTOH)' }
      ]
    }
  ],

  /**
   * Menu beserta harga, diikat pada kode rumah makan.
   * Harga dalam Rupiah (bilangan bulat).
   */
  menu: [
    { kodeRumahMakan: 'RM_A', nama: 'Nasi Goreng (CONTOH)', harga: 15000 },
    { kodeRumahMakan: 'RM_A', nama: 'Ayam Goreng (CONTOH)', harga: 18000 },
    { kodeRumahMakan: 'RM_A', nama: 'Es Teh Manis (CONTOH)', harga: 5000 },
    { kodeRumahMakan: 'RM_B', nama: 'Mie Goreng (CONTOH)', harga: 14000 },
    { kodeRumahMakan: 'RM_B', nama: 'Sate Ayam (CONTOH)', harga: 20000 },
    { kodeRumahMakan: 'RM_B', nama: 'Air Mineral (CONTOH)', harga: 4000 }
  ],

  /**
   * Daftar bahan baku yang dibuat otomatis untuk setiap cabang,
   * lengkap dengan batas minimum (penanda stok menipis).
   */
  bahanBawaan: [
    { nama: 'Beras (CONTOH)', satuan: 'kg', batasMinimum: 10 },
    { nama: 'Minyak Goreng (CONTOH)', satuan: 'liter', batasMinimum: 5 },
    { nama: 'Ayam Potong (CONTOH)', satuan: 'kg', batasMinimum: 8 }
  ],

  /** Pilihan kategori pengeluaran. */
  kategoriPengeluaran: [
    'Bahan Baku',
    'Gaji Staf',
    'Sewa',
    'Listrik dan Air',
    'Pemeliharaan',
    'Lain-lain'
  ],

  /** Pilihan metode pembayaran. */
  metodePembayaran: ['Tunai', 'QRIS', 'Kartu Debit', 'Transfer Bank']
};
