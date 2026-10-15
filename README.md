# Sistem Pencatatan Terpadu Dua Rumah Makan Multi Cabang Berbasis Web dengan Akses QR Code dan Digitalisasi Proses Bisnis

Sistem pencatatan untuk pemilik dan staf dua rumah makan yang masing-masing memiliki beberapa cabang.
Staf cabang mencatat **penjualan**, **pengeluaran**, dan **stok bahan** melalui ponsel (diakses lewat
QR Code yang ditempel di cabang), sedangkan pemilik/manajer memantau seluruh cabang melalui
dashboard admin: rekap keuangan, posisi stok, perbandingan antar cabang, rekap menu terjual, dan
ekspor CSV.

> **Catatan data:** seluruh nama rumah makan, cabang, menu, dan harga bawaan adalah **DATA CONTOH**
> yang dikumpulkan dalam satu berkas konfigurasi: [`data/master.js`](data/master.js). Ganti dengan
> data milik Anda sebelum dipakai sungguhan.

## Teknologi

- **Front-end:** HTML, CSS, JavaScript murni (tanpa framework besar), dirancang mobile-first.
- **Back-end:** Node.js dengan Express.
- **Penyimpanan data:** SQLite melalui modul bawaan Node.js (`node:sqlite`, tersedia pada Node 22+),
  sehingga tidak memerlukan kompilasi native dan tetap lancar di Windows. Struktur tabel berada di
  [`db/sqlite.js`](db/sqlite.js).
- **QR Code:** paket `qrcode` (murni JavaScript).

## Struktur Folder

```
.
├── server.js               # Entry point Express (static + API)
├── package.json
├── .env.example            # Templat konfigurasi (salin menjadi .env)
├── .gitignore
├── README.md
├── data/
│   ├── master.js           # DATA CONTOH: rumah makan, cabang, menu, bahan
│   └── aplikasi.db         # Database SQLite (dibuat otomatis, tidak masuk git)
├── db/
│   └── sqlite.js           # Koneksi SQLite, skema tabel, seeding data contoh
├── routes/
│   ├── staf.js             # Bagian A: API halaman staf cabang
│   ├── admin.js            # Bagian B: API dashboard admin
│   └── qr.js               # Bagian C: API generator QR Code PNG
├── scripts/
│   └── generate-qr.js      # Skrip CLI pembuat QR per cabang (npm run qr)
├── qr-codes/               # Hasil PNG QR (dibuat oleh npm run qr, tidak masuk git)
└── public/
    ├── css/style.css       # Gaya mobile-first; palet warna sebagai variabel CSS
    ├── js/util.js          # Fungsi bantu (API, format rupiah, tanggal)
    ├── js/staf.js          # Sesi staf, penjaga halaman, navigasi
    ├── js/admin.js         # Logika dashboard admin
    ├── index.html          # Beranda staf (pilih rumah makan/cabang, PIN, ringkasan)
    ├── penjualan.html      # Formulir pencatatan penjualan
    ├── pengeluaran.html    # Formulir pencatatan pengeluaran
    ├── stok.html           # Formulir stok masuk dan stok keluar
    ├── riwayat.html        # Riwayat catatan dengan filter tanggal
    └── admin.html          # Dashboard admin (diakses juga lewat /admin)
```

## Cara Instalasi

1. Pastikan Node.js versi 22 atau lebih baru terpasang (`node -v`).
2. Salin seluruh proyek ini ke folder kerja Anda.
3. Install dependensi:

   ```bash
   npm install
   ```

4. Salin berkas konfigurasi:

   ```bash
   cp .env.example .env
   ```

   (Di Windows: salin `.env.example` menjadi `.env` melalui Penjelajah Berkas.)

## Cara Mengatur File `.env`

Buka `.env` lalu isi nilainya:

| Variabel | Keterangan |
| --- | --- |
| `PORT` | Port server, misalnya `3000`. |
| `BASE_URL` | Alamat dasar yang tertulis di dalam QR Code, misalnya `http://192.168.1.5:3000` atau alamat domain Anda. |
| `ADMIN_PASSWORD` | Kata sandi untuk masuk ke `/admin`. |
| `SECRET_TOKEN` | Kunci rahasia penanda sesi login; isi dengan teks acak yang panjang. |
| `PIN_CABANG_<kode cabang>` | PIN cabang, satu untuk tiap cabang. Kode cabang ada di `data/master.js` (misalnya `PIN_CABANG_RM_A_C1=1111`). PIN dan kata sandi **tidak ditulis di dalam kode**, hanya dibaca dari `.env`. |

Setiap kali PIN atau kata sandi diubah, cukup simpan berkas `.env` lalu jalankan ulang server.

Berkas `.env` dan database sudah masuk `.gitignore` sehingga tidak ikut terunggah ke repositori.

## Cara Menjalankan

```bash
npm start
```

Server berjalan di `http://localhost:3000`.

- **Halaman staf cabang:** `http://localhost:3000/`
  (atau melalui tautan QR cabang: `http://localhost:3000/?cabang=RM_A_C1`)
- **Dashboard admin:** `http://localhost:3000/admin`

### Alur pemakaian

1. **Staf** membuka QR cabang di ponsel → memilih rumah makan dan cabang → memasukkan PIN cabang →
   mengisi formulir penjualan/pengeluaran/stok dengan **centang konfirmasi bahwa data telah
   diperiksa oleh petugas pencatat** → melihat riwayat dengan filter tanggal.
2. **Admin** membuka `/admin` → memasukkan kata sandi → mengelola data master (rumah makan, cabang,
   menu beserta harga), meninjau transaksi dengan filter per rumah makan/cabang/rentang tanggal,
   memantau posisi stok dan batas minimum, melihat rekap laba kotor sederhana serta perbandingan
   antar cabang dan antar rumah makan, dan mengekspor CSV.
3. **QR Code** dibuat lewat tab *QR Code & Ekspor* pada dashboard, atau sekaligus dari terminal:

   ```bash
   npm run qr
   ```

   Hasil PNG tersimpan di folder `qr-codes/` dengan nama mengikuti kode cabang
   (misalnya `QR_RM_A_C1.png`), siap dicetak dan ditempel di cabang.

## Pengujian

Dua skrip uji disediakan (server harus sedang berjalan):

```bash
npm run uji      # uji API: login PIN, formulir, filter, rekap, ekspor CSV, QR (50 pemeriksaan)
npm run uji-ui   # uji alur di Chrome headless; prasyarat: npm i --no-save puppeteer-core
```

## Penyimpanan Data

- Database SQLite dibuat otomatis di `data/aplikasi.db` saat pertama kali server dijalankan,
  lalu diisi dari `data/master.js` (DATA CONTOH) bila masih kosong.
- Bila lokasi database ingin dipindah, set variabel `DB_PATH` pada `.env`.
- Struktur data: `rumah_makan` → `cabang` → seluruh transaksi (`penjualan`, `pengeluaran`,
  `stok_masuk_keluar`) selalu terhubung ke rumah makan dan cabang yang sesuai, dan `bahan`
  menyimpan batas minimum stok per cabang sebagai penanda stok menipis.
