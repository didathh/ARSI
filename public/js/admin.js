/* Dashboard admin: login, filter, rekap, data master, stok, QR, dan ekspor CSV. */

const KUNCI_ADMIN = 'tokenAdmin';
let TOKEN = localStorage.getItem(KUNCI_ADMIN) || null;

function opsiAuth() {
  return { token: TOKEN };
}

/* ---------------- Login ---------------- */

const pesanLogin = document.getElementById('pesanLogin');

document.getElementById('formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  sembunyikanPesan(pesanLogin);
  try {
    const hasil = await api('/api/admin/login', {
      method: 'POST',
      body: { kataSandi: document.getElementById('kataSandi').value }
    });
    TOKEN = hasil.token;
    localStorage.setItem(KUNCI_ADMIN, TOKEN);
    bukaDashboard();
  } catch (err) {
    tampilkanPesan(pesanLogin, err.message, false);
  }
});

/* ---------------- Buka / tutup dashboard ---------------- */

async function bukaDashboard() {
  if (!TOKEN) return;
  try {
    await api('/api/admin/master', opsiAuth());
  } catch {
    TOKEN = null;
    localStorage.removeItem(KUNCI_ADMIN);
    return;
  }
  document.getElementById('kartuLogin').hidden = true;
  document.getElementById('isiDashboard').hidden = false;
  await muatMaster();
  muatRingkasan();
  muatQr();
}

/* ---------------- Ganti tab ---------------- */

document.getElementById('tab').addEventListener('click', (e) => {
  const tombol = e.target.closest('button');
  if (!tombol) return;
  document.querySelectorAll('#tab button').forEach((b) => b.classList.toggle('aktif', b === tombol));
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('tampil'));
  document.getElementById(`panel-${tombol.dataset.panel}`).classList.add('tampil');
});

/* ---------------- Data master & filter ---------------- */

let master = { rumahMakan: [], cabang: [], menu: [] };

async function muatMaster() {
  master = await api('/api/admin/master', opsiAuth());
  const opsiRm = (id) =>
    `<option value="">Semua Rumah Makan</option>` +
    master.rumahMakan.map((r) => `<option value="${r.id}" ${String(r.id) === id ? 'selected' : ''}>${esc(r.nama)}</option>`).join('');

  for (const id of ['rRm', 'tRm', 'sRm']) {
    document.getElementById(id).innerHTML = opsiRm();
  }
  for (const id of ['mnRm', 'cbRm']) {
    document.getElementById(id).innerHTML = master.rumahMakan
      .map((r) => `<option value="${r.id}">${esc(r.nama)}</option>`)
      .join('');
  }
  document.getElementById('mRm').innerHTML = master.rumahMakan
    .map((r) => `<option value="${r.id}">${esc(r.nama)}</option>`)
    .join('');

  // tanggal bawaan: 30 hari terakhir
  for (const id of ['rDari', 'tDari']) document.getElementById(id).value = tanggalLalu(30);
  for (const id of ['rSampai', 'tSampai']) document.getElementById(id).value = hariIni();

  pasangPasanganRmCabang('rRm', 'rCabang');
  pasangPasanganRmCabang('tRm', 'tCabang');
  pasangPasanganRmCabang('sRm', 'sCabang');

  muatTransaksi();
  muatStok();
  muatMasterTabel();
}

function isiPilihanCabang(idRm, idCabang) {
  const rmId = document.getElementById(idRm).value;
  const daftar = master.cabang.filter((c) => !rmId || String(c.rumah_makan_id) === rmId);
  document.getElementById(idCabang).innerHTML =
    `<option value="">Semua Cabang</option>` +
    daftar.map((c) => `<option value="${c.id}">${esc(c.nama)}</option>`).join('');
}

function pasangPasanganRmCabang(idRm, idCabang) {
  isiPilihanCabang(idRm, idCabang);
  document.getElementById(idRm).addEventListener('change', () => {
    isiPilihanCabang(idRm, idCabang);
    if (idRm === 'rRm') muatRingkasan();
    if (idRm === 'tRm') muatTransaksi();
    if (idRm === 'sRm') muatStok();
  });
  document.getElementById(idCabang).addEventListener('change', () => {
    if (idCabang === 'rCabang') muatRingkasan();
    if (idCabang === 'tCabang') muatTransaksi();
    if (idCabang === 'sCabang') muatStok();
  });
}

function parameterFilter(prefix) {
  const p = new URLSearchParams();
  const rm = document.getElementById(`${prefix}Rm`).value;
  const cabang = document.getElementById(`${prefix}Cabang`).value;
  const dari = document.getElementById(`${prefix}Dari`);
  const sampai = document.getElementById(`${prefix}Sampai`);
  if (rm) p.set('rm', rm);
  if (cabang) p.set('cabang', cabang);
  if (dari && dari.value) p.set('dari', dari.value);
  if (sampai && sampai.value) p.set('sampai', sampai.value);
  return p;
}

/* ---------------- Ringkasan ---------------- */

async function muatRingkasan() {
  const pesan = document.getElementById('pesanRingkasan');
  sembunyikanPesan(pesan);
  try {
    const p = parameterFilter('r');
    const h = await api('/api/admin/rekap?' + p, opsiAuth());

    document.getElementById('kPenjualan').textContent = rupiah(h.ringkas.totalPenjualan);
    document.getElementById('kPengeluaran').textContent = rupiah(h.ringkas.totalPengeluaran);
    const sel = document.getElementById('kSelisih');
    sel.textContent = rupiah(h.ringkas.labaKotor);
    sel.className = 'nilai ' + (h.ringkas.labaKotor >= 0 ? 'positif' : 'negatif');
    document.getElementById('kJumlah').textContent =
      `${h.ringkas.jumlahTransaksiPenjualan} / ${h.ringkas.jumlahTransaksiPengeluaran}`;
    document.getElementById('kJumlahItem').textContent =
      `${h.ringkas.jumlahItemTerjual} item menu terjual`;

    document.getElementById('tbCabang').innerHTML = h.perCabang.length
      ? h.perCabang.map((c) => `
        <tr><td>${esc(c.cabang_nama)}</td><td>${esc(c.rumah_makan_nama)}</td>
            <td class="angka">${rupiah(c.total_penjualan)}</td>
            <td class="angka">${rupiah(c.total_pengeluaran)}</td>
            <td class="angka">${rupiah(c.selisih)}</td></tr>`).join('')
      : '<tr><td colspan="5" class="kosong">Tidak ada data cabang.</td></tr>';

    document.getElementById('tbRm').innerHTML = h.perRumahMakan.map((r) => `
      <tr><td>${esc(r.nama)}</td>
          <td class="angka">${rupiah(r.total_penjualan)}</td>
          <td class="angka">${rupiah(r.total_pengeluaran)}</td>
          <td class="angka">${rupiah(r.selisih)}</td></tr>`).join('');

    document.getElementById('tbMenu').innerHTML = h.perMenu.length
      ? h.perMenu.map((m) => `
        <tr><td>${esc(m.nama_menu)}</td>
            <td class="angka">${m.jumlah_terjual}</td>
            <td class="angka">${rupiah(m.total)}</td></tr>`).join('')
      : '<tr><td colspan="3" class="kosong">Tidak ada penjualan pada rentang tanggal tersebut.</td></tr>';

  } catch (err) {
    tampilkanPesan(pesan, err.message, false);
  }
}

/* ---------------- Transaksi ---------------- */

async function muatTransaksi() {
  const pesan = document.getElementById('pesanTransaksi');
  sembunyikanPesan(pesan);
  try {
    const p = parameterFilter('t');
    const h = await api('/api/admin/transaksi?' + p, opsiAuth());

    document.getElementById('tbPenjualan').innerHTML = h.penjualan.length
      ? h.penjualan.map((x) => `
        <tr><td>${tanggalIndo(x.tanggal)}</td><td>${esc(x.cabang_nama)}</td>
            <td>${esc(x.nama_menu)}</td><td class="angka">${rupiah(x.harga_satuan)}</td>
            <td class="angka">${x.jumlah}</td><td class="angka">${rupiah(x.total)}</td>
            <td>${esc(x.metode_pembayaran)}</td></tr>`).join('')
      : '<tr><td colspan="7" class="kosong">Tidak ada data penjualan.</td></tr>';

    document.getElementById('tbPengeluaran').innerHTML = h.pengeluaran.length
      ? h.pengeluaran.map((x) => `
        <tr><td>${tanggalIndo(x.tanggal)}</td><td>${esc(x.cabang_nama)}</td>
            <td>${esc(x.kategori)}</td><td>${esc(x.keterangan)}</td>
            <td class="angka">${rupiah(x.nominal)}</td></tr>`).join('')
      : '<tr><td colspan="5" class="kosong">Tidak ada data pengeluaran.</td></tr>';
  } catch (err) {
    tampilkanPesan(pesan, err.message, false);
  }
}

document.getElementById('tTerapkan').addEventListener('click', muatTransaksi);
document.getElementById('rDari').addEventListener('change', muatRingkasan);
document.getElementById('rSampai').addEventListener('change', muatRingkasan);

/* ---------------- Stok ---------------- */

async function muatStok() {
  const pesan = document.getElementById('pesanStok');
  sembunyikanPesan(pesan);
  try {
    const p = parameterFilter('s');
    const h = await api('/api/admin/stok?' + p, opsiAuth());
    const cari = (document.getElementById('sCari').value || '').toLowerCase();
    const data = h.data.filter((d) => !cari || d.nama_bahan.toLowerCase().includes(cari));

    document.getElementById('tbStok').innerHTML = data.length
      ? data.map((d) => `
        <tr>
          <td>${esc(d.cabang_nama)}<div class="kecil-teks">${esc(d.rumah_makan_nama)}</div></td>
          <td>${esc(d.nama_bahan)}</td>
          <td class="angka">${d.total_masuk}</td>
          <td class="angka">${d.total_keluar}</td>
          <td class="angka">${d.posisi} ${esc(d.satuan)}</td>
          <td class="angka">${d.batas_minimum} ${esc(d.satuan)}
            <div>
              <input type="number" min="0" step="any" value="${d.batas_minimum}" style="width:90px;padding:4px 6px"
                     data-cabang="${d.cabang_id}" data-bahan="${esc(d.nama_bahan)}" class="inputBatas">
            </div>
          </td>
          <td>${d.menipis ? '<span class="lencana menipis">Menipis</span>' : '<span class="lencana aman">Aman</span>'}</td>
        </tr>`).join('')
      : '<tr><td colspan="7" class="kosong">Tidak ada data bahan.</td></tr>';

    if (h.jumlahMenipis > 0) {
      tampilkanPesan(pesan, `${h.jumlahMenipis} bahan telah mencapai atau berada di bawah batas minimum.`, false);
    }
  } catch (err) {
    tampilkanPesan(pesan, err.message, false);
  }
}

document.getElementById('sTerapkan').addEventListener('click', muatStok);
document.getElementById('sCari').addEventListener('input', muatStok);

document.getElementById('tbStok').addEventListener('change', async (e) => {
  if (!e.target.classList.contains('inputBatas')) return;
  try {
    await api('/api/admin/stok/batas-minimum', {
      method: 'PUT',
      token: TOKEN,
      body: {
        cabangId: Number(e.target.dataset.cabang),
        namaBahan: e.target.dataset.bahan,
        batasMinimum: Number(e.target.value)
      }
    });
    muatStok();
  } catch (err) {
    tampilkanPesan(document.getElementById('pesanStok'), err.message, false);
  }
});

/* ---------------- Data master (CRUD) ---------------- */

function barisRm(r, jumlahCabang) {
  return `
    <tr>
      <td><input type="text" value="${esc(r.nama)}" data-jenis="rm-nama" data-id="${r.id}" style="padding:6px 8px"></td>
      <td>${esc(r.kode)}</td>
      <td>${jumlahCabang}</td>
      <td style="white-space:nowrap">
        <button class="tombol kecil baris" data-jenis="rm-simpan" data-id="${r.id}" type="button">Simpan</button>
        <button class="tombol kecil baris sekunder" data-jenis="rm-hapus" data-id="${r.id}" type="button">Hapus</button>
      </td>
    </tr>`;
}

async function muatMasterTabel() {
  const rm = master.rumahMakan;
  document.getElementById('tbRmMaster').innerHTML = rm.map((r) =>
    barisRm(r, master.cabang.filter((c) => c.rumah_makan_id === r.id).length)
  ).join('');

  document.getElementById('tbCabangMaster').innerHTML = master.cabang.map((c) => {
    const rmnya = master.rumahMakan.find((r) => r.id === c.rumah_makan_id);
    return `
      <tr>
        <td><input type="text" value="${esc(c.nama)}" data-jenis="cbg-nama" data-id="${c.id}" style="padding:6px 8px"></td>
        <td>${esc(rmnya ? rmnya.nama : '—')}</td>
        <td>${esc(c.kode)}</td>
        <td><code>PIN_CABANG_${esc(c.kode)}</code></td>
        <td style="white-space:nowrap">
          <button class="tombol kecil baris" data-jenis="cbg-simpan" data-id="${c.id}" type="button">Simpan</button>
          <button class="tombol kecil baris sekunder" data-jenis="cbg-hapus" data-id="${c.id}" type="button">Hapus</button>
        </td>
      </tr>`;
  }).join('');

  tampilkanMenuMaster();
}

function tampilkanMenuMaster() {
  const rmId = Number(document.getElementById('mRm').value) || master.rumahMakan[0]?.id;
  const data = master.menu.filter((m) => m.rumah_makan_id === rmId);
  document.getElementById('tbMenuMaster').innerHTML = data.length
    ? data.map((m) => `
      <tr>
        <td><input type="text" value="${esc(m.nama)}" data-jenis="menu-nama" data-id="${m.id}" style="padding:6px 8px"></td>
        <td class="angka"><input type="number" min="0" step="1" value="${m.harga}" data-jenis="menu-harga" data-id="${m.id}" style="width:130px;padding:6px 8px;text-align:right"></td>
        <td style="white-space:nowrap">
          <button class="tombol kecil baris" data-jenis="menu-simpan" data-id="${m.id}" type="button">Simpan</button>
          <button class="tombol kecil baris sekunder" data-jenis="menu-hapus" data-id="${m.id}" type="button">Hapus</button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="kosong">Belum ada menu untuk rumah makan ini.</td></tr>';
}

document.getElementById('mRm').addEventListener('change', tampilkanMenuMaster);

function cariNilai(jenis, id) {
  return document.querySelector(`[data-jenis="${jenis}"][data-id="${id}"]`)?.value;
}

async function aksiMaster(pesanEl, aksi) {
  sembunyikanPesan(pesanEl);
  try {
    await aksi();
    master = await api('/api/admin/master', opsiAuth());
    muatMasterTabel();
    tampilkanPesan(pesanEl, 'Perubahan data master tersimpan.', true);
  } catch (err) {
    tampilkanPesan(pesanEl, err.message, false);
  }
}

const pesanRm = document.getElementById('pesanRm');
const pesanCabang = document.getElementById('pesanCabang');
const pesanMenu = document.getElementById('pesanMenu');

document.getElementById('tbRmMaster').addEventListener('click', (e) => {
  const id = e.target.dataset.id;
  if (e.target.dataset.jenis === 'rm-simpan') {
    aksiMaster(pesanRm, () => api(`/api/admin/rumah-makan/${id}`, {
      method: 'PUT', token: TOKEN, body: { nama: cariNilai('rm-nama', id) }
    }));
  }
  if (e.target.dataset.jenis === 'rm-hapus') {
    if (confirm('Hapus rumah makan ini? Cabang dan transaksi terkait harus dihapus lebih dahulu.')) {
      aksiMaster(pesanRm, () => api(`/api/admin/rumah-makan/${id}`, { method: 'DELETE', token: TOKEN }));
    }
  }
});

document.getElementById('tbCabangMaster').addEventListener('click', (e) => {
  const id = e.target.dataset.id;
  if (e.target.dataset.jenis === 'cbg-simpan') {
    aksiMaster(pesanCabang, () => api(`/api/admin/cabang/${id}`, {
      method: 'PUT', token: TOKEN, body: { nama: cariNilai('cbg-nama', id) }
    }));
  }
  if (e.target.dataset.jenis === 'cbg-hapus') {
    if (confirm('Hapus cabang ini? Transaksi pada cabang harus dihapus lebih dahulu.')) {
      aksiMaster(pesanCabang, () => api(`/api/admin/cabang/${id}`, { method: 'DELETE', token: TOKEN }));
    }
  }
});

document.getElementById('tbMenuMaster').addEventListener('click', (e) => {
  const id = e.target.dataset.id;
  if (e.target.dataset.jenis === 'menu-simpan') {
    aksiMaster(pesanMenu, () => api(`/api/admin/menu/${id}`, {
      method: 'PUT', token: TOKEN,
      body: { nama: cariNilai('menu-nama', id), harga: Number(cariNilai('menu-harga', id)) }
    }));
  }
  if (e.target.dataset.jenis === 'menu-hapus') {
    if (confirm('Hapus menu ini? Riwayat penjualan lama tetap tersimpan.')) {
      aksiMaster(pesanMenu, () => api(`/api/admin/menu/${id}`, { method: 'DELETE', token: TOKEN }));
    }
  }
});

document.getElementById('formRm').addEventListener('submit', (e) => {
  e.preventDefault();
  aksiMaster(pesanRm, () => api('/api/admin/rumah-makan', {
    method: 'POST', token: TOKEN,
    body: { nama: document.getElementById('rmNama').value, kode: document.getElementById('rmKode').value }
  })).then(() => {
    document.getElementById('rmNama').value = '';
    document.getElementById('rmKode').value = '';
  });
});

document.getElementById('formCabang').addEventListener('submit', async (e) => {
  e.preventDefault();
  const kode = document.getElementById('cbKode').value;
  await aksiMaster(pesanCabang, () => api('/api/admin/cabang', {
    method: 'POST', token: TOKEN,
    body: {
      rumahMakanId: Number(document.getElementById('cbRm').value),
      nama: document.getElementById('cbNama').value,
      kode
    }
  }));
  document.getElementById('cbNama').value = '';
  document.getElementById('cbKode').value = '';
});

document.getElementById('formMenu').addEventListener('submit', async (e) => {
  e.preventDefault();
  await aksiMaster(pesanMenu, () => api('/api/admin/menu', {
    method: 'POST', token: TOKEN,
    body: {
      rumahMakanId: Number(document.getElementById('mnRm').value),
      nama: document.getElementById('mnNama').value,
      harga: Number(document.getElementById('mnHarga').value)
    }
  }));
  document.getElementById('mnNama').value = '';
  document.getElementById('mnHarga').value = '';
  tampilkanMenuMaster();
});

/* ---------------- QR Code ---------------- */

async function muatQr() {
  try {
    const h = await api('/api/qr', opsiAuth());
    document.getElementById('daftarQr').innerHTML = h.data.map((c) => `
      <div class="kartu-qr">
        <div class="nama">${esc(c.nama)}</div>
        <div class="kecil-teks">${esc(c.rumah_makan_nama)} · ${esc(c.kode)}</div>
        <img src="${esc(c.urlGambar)}?unduh=0" alt="QR Code ${esc(c.nama)}" loading="lazy">
        <div class="tautan">${esc(c.url)}</div>
        <a class="tombol kecil baris" href="${esc(c.urlGambar)}?unduh=1" download>Unduh PNG</a>
      </div>`).join('');
  } catch (err) {
    document.getElementById('daftarQr').innerHTML = `<div class="kosong">${esc(err.message)}</div>`;
  }
}

/* ---------------- Ekspor CSV (perlu header otorisasi) ---------------- */


async function unduhCsv(url, namaBerkas) {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) throw new Error('Ekspor CSV gagal.');
    const teks = await res.text();
    const blob = new Blob([teks], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = namaBerkas;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    tampilkanPesan(document.getElementById('pesanTransaksi'), err.message, false);
  }
}

for (const id of ['unduhPenjualan', 'unduhPenjualan2']) {
  document.getElementById(id).addEventListener('click', (e) => {
    e.preventDefault();
    const p = '?' + parameterFilter('t');
    unduhCsv('/api/admin/export/penjualan' + p, `penjualan_${hariIni()}.csv`);
  });
}
for (const id of ['unduhPengeluaran', 'unduhPengeluaran2']) {
  document.getElementById(id).addEventListener('click', (e) => {
    e.preventDefault();
    const p = '?' + parameterFilter('t');
    unduhCsv('/api/admin/export/pengeluaran' + p, `pengeluaran_${hariIni()}.csv`);
  });
}

/* ---------------- Mulai ---------------- */
bukaDashboard();
