/**
 * Uji cepat seluruh alur API melalui HTTP (bukan lewat modul internal).
 * Pemakaian: node scripts/uji-api.js  (server harus sudah berjalan: npm start)
 */
const BASE = process.env.UJI_BASE || 'http://localhost:3000';
let lulus = 0;
let gagal = 0;

function periksa(nama, kondisi, rincian = '') {
  if (kondisi) {
    lulus++;
    console.log(`  ✓ ${nama}`);
  } else {
    gagal++;
    console.log(`  ✗ ${nama} ${rincian}`);
  }
}

async function minta(url, opsi = {}) {
  const res = await fetch(BASE + url, {
    method: opsi.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opsi.token ? { Authorization: `Bearer ${opsi.token}` } : {}) },
    body: opsi.body ? JSON.stringify(opsi.body) : undefined
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data, res };
}

async function utama() {
  console.log('\n== Halaman statis ==');
  for (const p of ['/', '/penjualan.html', '/pengeluaran.html', '/stok.html', '/riwayat.html', '/admin', '/admin.html', '/css/style.css', '/js/util.js', '/js/staf.js', '/js/admin.js']) {
    const r = await fetch(BASE + p);
    periksa(`GET ${p} -> ${r.status}`, r.status === 200);
  }

  console.log('\n== Bagian A: staf ==');
  const master = await minta('/api/staf/master');
  periksa('master memuat 2 rumah makan', master.status === 200 && master.data.rumahMakan.length === 2, JSON.stringify(master.data).slice(0, 200));
  const cabang = master.data.rumahMakan.flatMap((r) => r.cabang).find((c) => c.kode === 'RM_A_C1');
  periksa('Cabang uji RM_A_C1 ditemukan', !!cabang);

  const salah = await minta('/api/staf/login', { method: 'POST', body: { cabangId: cabang.id, pin: 'salah' } });
  periksa('PIN salah ditolak (401)', salah.status === 401);

  const masuk = await minta('/api/staf/login', { method: 'POST', body: { cabangId: cabang.id, pin: '1111' } });
  periksa('PIN benar diterima', masuk.status === 200 && !!masuk.data.token);
  const token = masuk.data.token;

  const tanpaToken = await minta('/api/staf/hari-ini');
  periksa('Akses tanpa token ditolak (401)', tanpaToken.status === 401);

  const hari = await minta('/api/staf/hari-ini', { token });
  periksa('Ringkasan hari ini tampil', hari.status === 200 && hari.data.tanggal);

  const menu = master.data.menu.find((m) => m.rumah_makan_id === cabang.rumah_makan_id);
  const tanggal = hari.data.tanggal;

  const jualTanpaKonfirmasi = await minta('/api/staf/penjualan', {
    method: 'POST', token,
    body: { tanggal, menuId: menu.id, jumlah: 2, metodePembayaran: 'Tunai', konfirmasi: false }
  });
  periksa('Penjualan tanpa konfirmasi ditolak (400)', jualTanpaKonfirmasi.status === 400);

  const jual = await minta('/api/staf/penjualan', {
    method: 'POST', token,
    body: { tanggal, menuId: menu.id, jumlah: 3, metodePembayaran: 'Tunai', catatan: 'Uji', konfirmasi: true }
  });
  periksa('Penjualan tersimpan & total dihitung', jual.status === 201 && jual.data.data.total === menu.harga * 3,
    JSON.stringify(jual.data));

  const keluar = await minta('/api/staf/pengeluaran', {
    method: 'POST', token,
    body: { tanggal, kategori: 'Bahan Baku', keterangan: 'Uji', nominal: 25000, konfirmasi: true }
  });
  periksa('Pengeluaran tersimpan', keluar.status === 201);

  const stok = await minta('/api/staf/stok', {
    method: 'POST', token,
    body: { tanggal, jenis: 'keluar', namaBahan: 'Beras (CONTOH)', jumlah: 2, satuan: 'kg', konfirmasi: true }
  });
  periksa('Stok keluar tersimpan', stok.status === 201, JSON.stringify(stok.data));

  const riwayat = await minta('/api/staf/riwayat?dari=2000-01-01&sampai=2100-01-01', { token });
  periksa('Riwayat memuat 3 catatan', riwayat.status === 200 && riwayat.data.data.length >= 3,
    `jumlah=${riwayat.data.data && riwayat.data.data.length}`);

  console.log('\n== Bagian B: admin ==');
  const adminSalah = await minta('/api/admin/login', { method: 'POST', body: { kataSandi: 'salah' } });
  periksa('Kata sandi salah ditolak (401)', adminSalah.status === 401);

  const adminMasuk = await minta('/api/admin/login', { method: 'POST', body: { kataSandi: 'ganti-dengan-kata-sandi-admin' } });
  periksa('Kata sandi benar diterima', adminMasuk.status === 200 && !!adminMasuk.data.token);
  const tAdmin = adminMasuk.data.token;

  const tanpaAdmin = await minta('/api/admin/rekap');
  periksa('API admin tanpa token ditolak (401)', tanpaAdmin.status === 401);

  const rekap = await minta('/api/admin/rekap?dari=2000-01-01&sampai=2100-01-01', { token: tAdmin });
  const r = rekap.data;
  periksa('Rekap memuat ringkasan + cabang + rm + menu',
    rekap.status === 200 && r.perCabang.length >= 4 && r.perRumahMakan.length === 2 && r.perMenu.length >= 1,
    JSON.stringify(r).slice(0, 300));
  periksa('Selisih laba = penjualan − pengeluaran',
    r.ringkas.labaKotor === r.ringkas.totalPenjualan - r.ringkas.totalPengeluaran);
  periksa('Perbandingan antar 2 rumah makan tampil', r.perRumahMakan.length === 2);

  const transaksi = await minta('/api/admin/transaksi?dari=2000-01-01&sampai=2100-01-01', { token: tAdmin });
  periksa('Daftar transaksi (filter rentang longgar)',
    transaksi.status === 200 && transaksi.data.penjualan.length >= 1 && transaksi.data.pengeluaran.length >= 1);

  const transaksiCabang = await minta(`/api/admin/transaksi?cabang=${cabang.id}&dari=2000-01-01&sampai=2100-01-01`, { token: tAdmin });
  periksa('Filter per cabang bekerja',
    transaksiCabang.status === 200 && transaksiCabang.data.penjualan.every((x) => x.cabang_nama === cabang.nama));

  const transaksiRm = await minta(`/api/admin/transaksi?rm=${cabang.rumah_makan_id}&dari=2000-01-01&sampai=2100-01-01`, { token: tAdmin });
  periksa('Filter per rumah makan bekerja',
    transaksiRm.status === 200 && transaksiRm.data.penjualan.length >= 1 && transaksiRm.data.penjualan.every((x) => x.rumah_makan_nama === master.data.rumahMakan.find((x) => x.id === cabang.rumah_makan_id).nama),
    `status=${transaksiRm.status} jumlah=${transaksiRm.data.penjualan && transaksiRm.data.penjualan.length}`);

  const rekapRm = await minta(`/api/admin/rekap?rm=${cabang.rumah_makan_id}&dari=2000-01-01&sampai=2100-01-01`, { token: tAdmin });
  periksa('Rekap dengan filter rumah makan bekerja',
    rekapRm.status === 200 && rekapRm.data.perCabang.every((c) => c.rumah_makan_id === cabang.rumah_makan_id),
    `status=${rekapRm.status}`);

  const stokAdmin = await minta('/api/admin/stok', { token: tAdmin });
  periksa('Posisi stok per cabang tampil', stokAdmin.status === 200 && stokAdmin.data.data.length >= 12,
    `jumlah=${stokAdmin.data.data && stokAdmin.data.data.length}`);
  const contohBahan = stokAdmin.data.data.find((b) => b.nama_bahan === 'Beras (CONTOH)' && b.cabang_id === cabang.id);
  periksa('Posisi stok = masuk − keluar', contohBahan && contohBahan.posisi === contohBahan.total_masuk - contohBahan.total_keluar,
    JSON.stringify(contohBahan));
  periksa('Penanda stok menipis bekerja', typeof stokAdmin.data.jumlahMenipis === 'number');

  const ubahBatas = await minta('/api/admin/stok/batas-minimum', {
    method: 'PUT', token: tAdmin,
    body: { cabangId: cabang.id, namaBahan: 'Beras (CONTOH)', batasMinimum: 999 }
  });
  const stokSetelah = await minta('/api/admin/stok', { token: tAdmin });
  const bahanSetelah = stokSetelah.data.data.find((b) => b.nama_bahan === 'Beras (CONTOH)' && b.cabang_id === cabang.id);
  periksa('Ubah batas minimum tersimpan & menandai menipis',
    ubahBatas.status === 200 && bahanSetelah.batas_minimum === 999 && bahanSetelah.menipis === true,
    JSON.stringify(bahanSetelah));

  const tambahMenu = await minta('/api/admin/menu', {
    method: 'POST', token: tAdmin,
    body: { rumahMakanId: cabang.rumah_makan_id, nama: 'Menu Uji (CONTOH)', harga: 9000 }
  });
  periksa('Tambah menu berhasil', tambahMenu.status === 201);
  const ubahMenu = await minta(`/api/admin/menu/${tambahMenu.data.id}`, {
    method: 'PUT', token: tAdmin, body: { nama: 'Menu Uji (CONTOH)', harga: 9500 }
  });
  periksa('Ubah menu berhasil', ubahMenu.status === 200);
  const hapusMenu = await minta(`/api/admin/menu/${tambahMenu.data.id}`, { method: 'DELETE', token: tAdmin });
  periksa('Hapus menu berhasil', hapusMenu.status === 200);

  const tambahRm = await minta('/api/admin/rumah-makan', { method: 'POST', token: tAdmin, body: { nama: 'Rumah Makan Uji (CONTOH)' } });
  periksa('Tambah rumah makan berhasil', tambahRm.status === 201);
  const tambahCabang = await minta('/api/admin/cabang', {
    method: 'POST', token: tAdmin,
    body: { rumahMakanId: tambahRm.data.id, nama: 'Cabang Uji (CONTOH)', kode: 'UJI_C1' }
  });
  periksa('Tambah cabang berhasil + memberi tahu variabel PIN',
    tambahCabang.status === 201 && tambahCabang.data.pinVariabel === 'PIN_CABANG_UJI_C1',
    JSON.stringify(tambahCabang.data));
  const hapusCabangUji = await minta(`/api/admin/cabang/${tambahCabang.data.id}`, { method: 'DELETE', token: tAdmin });
  periksa('Hapus cabang uji berhasil', hapusCabangUji.status === 200, JSON.stringify(hapusCabangUji.data));
  const hapusRm = await minta(`/api/admin/rumah-makan/${tambahRm.data.id}`, { method: 'DELETE', token: tAdmin });
  periksa('Hapus rumah makan uji berhasil', hapusRm.status === 200, JSON.stringify(hapusRm.data));
  const hapusRmBerpenghuni = await minta(`/api/admin/rumah-makan/${master.data.rumahMakan.find((x) => x.id === cabang.rumah_makan_id).id}`, { method: 'DELETE', token: tAdmin });
  periksa('Hapus rumah makan berisi cabang dicegah (400)', hapusRmBerpenghuni.status === 400);

  console.log('\n== Ekspor CSV ==');
  const csvJual = await minta('/api/admin/export/penjualan?dari=2000-01-01&sampai=2100-01-01', { token: tAdmin });
  periksa('CSV penjualan berisi baris data',
    csvJual.status === 200 && String(csvJual.data).includes('nama_menu') && String(csvJual.data).includes('Penjualan') === false && String(csvJual.data).split('\r\n').length >= 2,
    String(csvJual.data).slice(0, 120));
  const csvKeluar = await minta('/api/admin/export/pengeluaran?dari=2000-01-01&sampai=2100-01-01', { token: tAdmin });
  periksa('CSV pengeluaran berisi baris data',
    csvKeluar.status === 200 && String(csvKeluar.data).includes('kategori'));
  const csvTanpaToken = await minta('/api/admin/export/penjualan');
  periksa('Ekspor tanpa token ditolak (401)', csvTanpaToken.status === 401);

  console.log('\n== Bagian C: QR Code ==');
  const daftarQr = await minta('/api/qr', { token: tAdmin });
  periksa('Daftar QR memuat semua cabang', daftarQr.status === 200 && daftarQr.data.data.length >= 4);
  const png = await fetch(`${BASE}/api/qr/RM_A_C1.png`);
  const buf = Buffer.from(await png.arrayBuffer());
  periksa('PNG QR valid (tanda tangan PNG)',
    png.status === 200 && png.headers.get('content-type') === 'image/png' && buf.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    `status=${png.status} tipe=${png.headers.get('content-type')} ukuran=${buf.length}`);
  const qr404 = await fetch(`${BASE}/api/qr/TIDAK_ADA.png`);
  periksa('QR kode tak dikenal -> 404', qr404.status === 404);

  console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal.`);
  process.exit(gagal === 0 ? 0 : 1);
}

utama().catch((err) => {
  console.error('Gagal menjalankan uji:', err);
  process.exit(1);
});
