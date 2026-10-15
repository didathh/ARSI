/* Fungsi bantu bersama untuk seluruh halaman. */

async function api(url, pilihan = {}) {
  const opsi = {
    method: pilihan.method || 'GET',
    headers: { 'Content-Type': 'application/json' }
  };
  if (pilihan.token) opsi.headers.Authorization = `Bearer ${pilihan.token}`;
  if (pilihan.body !== undefined) opsi.body = JSON.stringify(pilihan.body);

  const res = await fetch(url, opsi);
  const jenis = res.headers.get('content-type') || '';
  const data = jenis.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const pesan = data && data.pesan ? data.pesan : `Permintaan gagal (status ${res.status}).`;
    throw new Error(pesan);
  }
  return data;
}

function rupiah(nilai) {
  return 'Rp ' + Number(nilai || 0).toLocaleString('id-ID');
}

function tanggalIndo(tanggal) {
  if (!tanggal) return '';
  const [t, b, h] = tanggal.split('-').map(Number);
  const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
    'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${h} ${bulan[b - 1]} ${t}`;
}

function hariIni() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function tanggalLalu(hari) {
  const d = new Date();
  d.setDate(d.getDate() - hari);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function esc(teks) {
  return String(teks === null || teks === undefined ? '' : teks)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tampilkanPesan(elemen, teks, sukses) {
  elemen.textContent = teks;
  elemen.className = 'pesan tampil ' + (sukses ? 'ok' : 'gagal');
}

function sembunyikanPesan(elemen) {
  elemen.className = 'pesan';
  elemen.textContent = '';
}

function ambilParameter(nama) {
  return new URLSearchParams(window.location.search).get(nama);
}
