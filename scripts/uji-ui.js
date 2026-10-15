/**
 * Uji alur pengguna nyata melalui Chrome headless.
 * Prasyarat: server berjalan (npm start) dan terpasang puppeteer-core
 *            (npm i --no-save puppeteer-core)
 * Pemakaian: node scripts/uji-ui.js
 */
const path = require('path');
const puppeteer = require('puppeteer-core');

const BASE = process.env.UJI_BASE || 'http://localhost:3000';
const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

let lulus = 0;
let gagal = 0;
const periksa = (nama, kondisi, rincian = '') => {
  if (kondisi) { lulus++; console.log(`  ✓ ${nama}`); }
  else { gagal++; console.log(`  ✗ ${nama} ${rincian}`); }
};

async function utama() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
    defaultViewport: { width: 390, height: 844 } // ukuran ponsel
  });
  const hal = await browser.newPage();
  const galatJs = [];
  const responsGagal = [];
  hal.on('pageerror', (e) => galatJs.push(String(e)));
  hal.on('response', (r) => {
    if (r.status() >= 400) responsGagal.push(`${r.status()} ${r.url()}`);
  });

  console.log('\n== Staf: beranda dan login PIN ==');
  await hal.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await hal.waitForSelector('#pilihRm option');
  const jumlahRm = await hal.$$eval('#pilihRm option', (o) => o.length);
  periksa('Pilihan rumah makan termuat', jumlahRm >= 2, `jumlah=${jumlahRm}`);

  // pilih "Rumah Makan Contoh Satu" agar cabang RM_A_C1 (PIN 1111) dipakai
  const idRmSatu = await hal.$eval('#pilihRm', (sel) =>
    [...sel.options].find((o) => o.textContent.includes('Satu')).value);
  await hal.select('#pilihRm', idRmSatu);
  await hal.type('#pin', '1111');
  await hal.click('#formMasuk button[type=submit]');
  await hal.waitForSelector('#kartuBeranda:not([hidden])', { timeout: 5000 });
  const ringkasan = await hal.$eval('#rPenjualan', (e) => e.textContent);
  periksa('Ringkasan hari ini tampil setelah login', /Rp/.test(ringkasan), ringkasan);

  console.log('\n== Staf: pencatatan penjualan ==');
  await hal.goto(`${BASE}/penjualan.html`, { waitUntil: 'networkidle0' });
  await hal.waitForSelector('#menu option');
  await hal.select('#menu', await hal.$eval('#menu option', (o) => o.value));
  await hal.$eval('#jumlah', (e) => { e.value = 4; e.dispatchEvent(new Event('input')); });
  const total = await hal.$eval('#total', (e) => e.textContent);
  periksa('Total dihitung otomatis dari harga menu', /^Rp [\d.,]+$/.test(total) && total !== 'Rp 0', total);

  await hal.click('#formPenjualan button[type=submit]');
  await hal.waitForSelector('#pesan.tampil', { timeout: 5000 });
  let pesan = await hal.$eval('#pesan', (e) => e.textContent);
  periksa('Penjualan tanpa konfirmasi ditolak', /diperiksa/i.test(pesan), pesan);

  await hal.click('#konfirmasi');
  await hal.click('#formPenjualan button[type=submit]');
  await hal.waitForFunction(() => document.querySelector('#pesan.ok') !== null, { timeout: 5000 });
  pesan = await hal.$eval('#pesan', (e) => e.textContent);
  periksa('Penjualan tersimpan setelah konfirmasi dicentang', /berhasil/i.test(pesan), pesan);

  console.log('\n== Staf: pengeluaran, stok, riwayat ==');
  await hal.goto(`${BASE}/pengeluaran.html`, { waitUntil: 'networkidle0' });
  await hal.type('#keterangan', 'Pembelian bahan uji antarmuka');
  await hal.type('#nominal', '12345');
  await hal.click('#konfirmasi');
  await hal.click('#formPengeluaran button[type=submit]');
  await hal.waitForFunction(() => document.querySelector('#pesan.ok') !== null, { timeout: 5000 });
  pesan = await hal.$eval('#pesan', (e) => e.textContent);
  periksa('Pengeluaran tersimpan', /berhasil/i.test(pesan), pesan);

  await hal.goto(`${BASE}/stok.html`, { waitUntil: 'networkidle0' });
  await hal.type('#namaBahan', 'Beras (CONTOH)');
  await hal.type('#jumlah', '5');
  await hal.type('#satuan', 'kg');
  await hal.click('#konfirmasi');
  await hal.click('#formStok button[type=submit]');
  await hal.waitForFunction(() => document.querySelector('#pesan.ok') !== null, { timeout: 5000 });
  pesan = await hal.$eval('#pesan', (e) => e.textContent);
  periksa('Stok masuk tersimpan', /berhasil/i.test(pesan), pesan);

  await hal.goto(`${BASE}/riwayat.html`, { waitUntil: 'networkidle0' });
  await hal.waitForSelector('#daftar tr');
  const baris = await hal.$$eval('#daftar tr', (r) => r.length);
  periksa('Riwayat menampilkan daftar catatan', baris >= 3, `baris=${baris}`);

  console.log('\n== Admin: login, rekap, transaksi, stok, QR ==');
  await hal.goto(`${BASE}/admin`, { waitUntil: 'networkidle0' });
  await hal.type('#kataSandi', 'salah');
  await hal.click('#formLogin button[type=submit]');
  await hal.waitForSelector('#pesanLogin.tampil', { timeout: 5000 });
  pesan = await hal.$eval('#pesanLogin', (e) => e.textContent);
  periksa('Kata sandi salah ditolak', /tidak sesuai/i.test(pesan), pesan);

  await hal.$eval('#kataSandi', (e) => { e.value = ''; });
  await hal.type('#kataSandi', 'ganti-dengan-kata-sandi-admin');
  await hal.click('#formLogin button[type=submit]');
  await hal.waitForSelector('#isiDashboard:not([hidden])', { timeout: 5000 });
  await hal.waitForFunction(() => /Rp/.test(document.querySelector('#kPenjualan').textContent), { timeout: 5000 });
  const kJual = await hal.$eval('#kPenjualan', (e) => e.textContent);
  const kLaba = await hal.$eval('#kSelisih', (e) => e.textContent);
  periksa('Ringkasan penjualan tampil', /^Rp [\d.,]+$/.test(kJual), kJual);
  periksa('Selisih laba kotor tampil', /^-?Rp [\d.,]+$/.test(kLaba), kLaba);
  const barisCabang = await hal.$$eval('#tbCabang tr', (r) => r.length);
  periksa('Perbandingan antar cabang tampil', barisCabang >= 4, `baris=${barisCabang}`);
  const barisMenu = await hal.$$eval('#tbMenu tr', (r) => r.length);
  const isiMenu = await hal.$eval('#tbMenu', (e) => e.textContent);
  periksa('Rekap menu terjual tampil', barisMenu >= 1 && /CONTOH/.test(isiMenu), `baris=${barisMenu}`);

  await hal.click('#tab button[data-panel=transaksi]');
  await hal.waitForSelector('#panel-transaksi.tampil');
  const barisJual = await hal.$$eval('#tbPenjualan tr', (r) => r.length);
  const barisKeluar = await hal.$$eval('#tbPengeluaran tr', (r) => r.length);
  periksa('Tabel penjualan terisi', barisJual >= 1, `baris=${barisJual}`);
  periksa('Tabel pengeluaran terisi', barisKeluar >= 1, `baris=${barisKeluar}`);

  await hal.click('#tab button[data-panel=stok]');
  await hal.waitForSelector('#panel-stok.tampil');
  const barisStok = await hal.$$eval('#tbStok tr', (r) => r.length);
  periksa('Posisi stok per cabang terisi', barisStok >= 12, `baris=${barisStok}`);
  const adaMenipis = await hal.$$eval('#tbStok .lencana', (e) => e.map((x) => x.textContent));
  periksa('Penanda menipis/aman tampil', adaMenipis.some((t) => /menipis|aman/i.test(t)), JSON.stringify(adaMenipis.slice(0, 3)));

  await hal.click('#tab button[data-panel=master]');
  await hal.waitForSelector('#panel-master.tampil');
  const rmMaster = await hal.$$eval('#tbRmMaster tr', (r) => r.length);
  const cbgMaster = await hal.$$eval('#tbCabangMaster tr', (r) => r.length);
  const menuMaster = await hal.$$eval('#tbMenuMaster tr', (r) => r.length);
  periksa('Data master rumah makan tampil', rmMaster >= 2, `baris=${rmMaster}`);
  periksa('Data master cabang tampil', cbgMaster >= 4, `baris=${cbgMaster}`);
  periksa('Data master menu tampil', menuMaster >= 3, `baris=${menuMaster}`);

  await hal.click('#tab button[data-panel=qr]');
  await hal.waitForSelector('#panel-qr.tampil');
  await hal.waitForFunction(() => document.querySelectorAll('#daftarQr .kartu-qr').length >= 4, { timeout: 5000 });
  await hal.$$eval('#daftarQr img', (imgs) => imgs.forEach((i) => i.scrollIntoView()));
  await hal.waitForFunction(
    () => [...document.querySelectorAll('#daftarQr img')].every((i) => i.naturalWidth > 0),
    { timeout: 10000 }
  );
  const qrSiap = await hal.$$eval('#daftarQr img', (imgs) => imgs.map((i) => i.naturalWidth));
  periksa('Semua QR Code termuat sebagai gambar', qrSiap.length >= 4 && qrSiap.every((w) => w > 0), JSON.stringify(qrSiap));

  // Galat JavaScript yang tidak ditangkap (uncaught exception) = kegagalan.
  periksa('Tidak ada galat JavaScript tak tertangani', galatJs.length === 0, galatJs.join(' | ').slice(0, 300));

  // Respons >=400 hanya boleh berasal dari uji negatif yang disengaja dan favicon.
  const izin = [/\/api\/staf\/penjualan/, /\/api\/staf\/pengeluaran/, /\/api\/staf\/stok/, /\/api\/staf\/login/, /\/api\/admin\/login/, /favicon\.ico/];
  const takTerizinkan = responsGagal.filter((x) => !izin.some((rx) => rx.test(x)));
  periksa('Tidak ada permintaan gagal di luar uji negatif', takTerizinkan.length === 0, takTerizinkan.join(' | ').slice(0, 300));

  await browser.close();
  console.log(`\nHasil UI: ${lulus} lulus, ${gagal} gagal.`);
  process.exit(gagal === 0 ? 0 : 1);
}

utama().catch((err) => {
  console.error('Gagal menjalankan uji UI:', err);
  process.exit(1);
});
