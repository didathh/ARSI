/* Sesi dan navigasi bersama untuk halaman staf cabang. */

const KUNCI_SESI = 'sesiStaf';

function sesiStaf() {
  try {
    const s = JSON.parse(localStorage.getItem(KUNCI_SESI) || 'null');
    if (!s || !s.token || !s.cabang) return null;
    return s;
  } catch {
    return null;
  }
}

function simpanSesi(sesi) {
  localStorage.setItem(KUNCI_SESI, JSON.stringify(sesi));
}

function keluarStaf() {
  localStorage.removeItem(KUNCI_SESI);
  window.location.href = './index.html';
}

/** Halaman staf selain beranda wajib memiliki sesi. */
function wajibSesi() {
  const sesi = sesiStaf();
  if (!sesi) {
    window.location.replace('./index.html');
    return null;
  }
  return sesi;
}

const HALAMAN = [
  { berkas: 'index.html', label: 'Beranda', ikon: '🏠' },
  { berkas: 'penjualan.html', label: 'Penjualan', ikon: '🧾' },
  { berkas: 'pengeluaran.html', label: 'Pengeluaran', ikon: '💸' },
  { berkas: 'stok.html', label: 'Stok Bahan', ikon: '📦' },
  { berkas: 'riwayat.html', label: 'Riwayat', ikon: '📋' }
];

/** Bangun navigasi cips dan kepala halaman. */
function pasangNavigasi(aktif) {
  const sesi = sesiStaf();
  const kepala = document.getElementById('kepala');
  if (kepala && sesi) {
    kepala.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div>
          <h1>${esc(sesi.cabang.rumahMakanNama)}</h1>
          <div class="sub">${esc(sesi.cabang.nama)} · ${esc(sesi.cabang.kode)}</div>
        </div>
        <button class="tombol kecil sekunder" id="tombolKeluar" type="button">Keluar</button>
      </div>`;
    kepala.querySelector('#tombolKeluar').addEventListener('click', keluarStaf);
  }

  const nav = document.getElementById('nav');
  if (nav) {
    nav.innerHTML = HALAMAN.map(
      (h) => `<a href="./${h.berkas}" class="${h.berkas === aktif ? 'aktif' : ''}">${h.ikon} ${h.label}</a>`
    ).join('');
  }
}
