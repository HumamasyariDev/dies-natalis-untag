# Stroop's Paradox — V-A-K Cognitive Assessment Photobooth

Aplikasi web interaktif berbasis **Psikologi Kognitif**, **Computer Vision**, dan **3D Runner** untuk mengukur gaya belajar dominan (**Visual, Auditori, Kinestetik**) melalui uji interferensi sensorik *real-time*. Dikembangkan untuk booth **Dies Natalis UNTAG Surabaya 2026**.

---

## Fitur Utama

### 1. Kalibrasi & Tanda Tangan Udara (*Air Signature*)
- **Hand Tracking (MediaPipe Hands)**: Peserta menggambar inisial/tanda tangan di udara menggunakan jari telunjuk di depan webcam tanpa menyentuh layar.
- **Gestur Kepalan (*Hold Fist*)**: Menahan kepalan tangan selama 2 detik otomatis mengambil foto profil dan menyimpan tanda tangan udara ke **Cognitive ID Pass**.
- **Cloud & Local Identity**: Mendukung penyimpanan lokal, unggah foto otomatis, serta ekspor kartu hasil **PNG resolusi tinggi** lengkap dengan foto polaroid, tanda tangan udara, dan segel sertifikasi UNTAG 2026.

### 2. Tiga Tahap Uji Kognitif Multi-Modal
| Tahap | Nama Uji | Mekanisme & Stimulus | Perangkat Input |
| :--- | :--- | :--- | :--- |
| **02 · Visual** | **Stroop Color & Word** | Menentukan **warna tinta** dan mengabaikan teks kata jebakan dengan kecepatan progresif (*3.2s → 2.5s → 1.9s*), dilengkapi efek *heartbeat* & *panic jitter* saat waktu kritis. | Controller PS3 / Keyboard |
| **03 · Auditori** | **Cross-Modal Stroop** | Mendengarkan instruksi suara bentuk (*Lingkaran, Silang, Segitiga, Kotak*) dengan EQ kejernihan tinggi sambil mengabaikan gambar jebakan raksasa di layar. | Controller PS3 / Keyboard |
| **04 · Kinestetik** | **3D Subway Runner** | Menghindari 10 rintangan kereta dan palang pada lintasan 3D menggunakan gerakan tubuh utuh (*loncat, menunduk, geser kiri/kanan*) diiringi tema musik Subway Surfers. | Webcam (MediaPipe Pose) / Controller |

### 3. Analisis Performa & Skor BIS
- Menggunakan **Balanced Integration Score (BIS)** yang menggabungkan **50% Kecepatan Reaksi (RT)** dan **50% Akurasi** untuk menentukan gaya belajar dominan (**Visual**, **Auditori**, atau **Kinestetik**) secara objektif.
- Menghasilkan **Arketipe Kognitif**, **Matriks Ciri Kognitif**, dan **Rekomendasi Cara Belajar** yang dapat langsung diunduh sebagai kartu PNG atau dibuka via halaman ringkasan (`scan.html`).

---

## Landasan Teori Psikologi

1. **Modalitas Sensori V-A-K** — *Walter Burke Barbe & Michael Swassing (1979)*, *Neil Fleming (1987)*, *Howard Gardner (1983)*.
2. **Efek Stroop & Kontrol Inhibisi** — *John Ridley Stroop (1935)*, *Richard Shiffrin & Walter Schneider (1977)*.
3. **Cross-Modal Interference & Dominasi Visual** — *Giuseppe Colavita (1974)*, *Colin Cherry (1953)*, *Charles Spence & Jon Driver (2004)*.
4. **Waktu Reaksi Pilihan & Embodied Cognition** — *Hick-Hyman Law (1952/1953)*, *Richard Schmidt (1988)*, *Varela, Thompson & Rosch (1991)*.
5. **Balanced Integration Score (BIS)** — *Christoph R. Liesefeld & Markus Janczyk (2019)*.

---

## Struktur Proyek

```text
dies natalis/
├── index.html          # Halaman Lobby & Kalibrasi (Tanda Tangan Udara + Foto)
├── game.html           # Arena Utama (Uji Visual, Auditori, Kinestetik & Hasil)
├── scan.html           # Halaman Tampilan Hasil Mobile / Cloud Scan
├── server.js           # Server Node.js (HTTP, Upload Foto, Auto Tunnel)
├── start.sh            # Script peluncur cepat
├── assets/             # Aset audio BGM/SFX/Voice & logo UNTAG
├── js/
│   ├── main.js         # Entry point halaman Lobby & Kalibrasi
│   ├── game-main.js    # Entry point halaman Arena Game
│   ├── game.js         # Engine alur permainan, timer, skor BIS & stage clear
│   ├── audio.js        # WebAudio BGM, ducking, EQ vokal & synthesizer SFX
│   ├── calib.js        # Logika kalibrasi tanda tangan udara & pose
│   ├── vision.js       # Integrasi MediaPipe Hands & Pose
│   ├── gamepad.js      # Dukungan Controller PS3 / Gamepad API
│   ├── identity.js     # Manajemen profil peserta & ekspor kartu PNG
│   └── games/          # Modul masing-masing tes (visual, auditori, kinestetik)
├── styles/             # Stylesheet Neo-Brutalist Pop-Zine (base, lobby, calib, game)
├── subway-surfers/     # Engine 3D Runner (Three.js + Vite) untuk tahap Kinestetik
└── pose_detection/     # Modul referensi & model deteksi pose
```

---

## Cara Menjalankan

### Prasyarat
- **Node.js** v18 atau lebih baru
- Browser modern (Chrome / Chromium / Edge) dengan akses **Webcam** & **Audio**

### Menjalankan Server Lokal
```bash
# 1. Masuk ke direktori proyek
cd "dies natalis"

# 2. Jalankan server lokal (tanpa tunnel)
npm run local
# atau dengan auto-tunnel
npm start
```
Secara default server berjalan pada `http://localhost:3000` (atau buka `index.html` melalui server HTTP statis seperti `python3 -m http.server 8080`).

### Kontrol Permainan
- **Webcam**: Gerakan jari telunjuk (Kalibrasi) & gerakan tubuh/bahu (Tahap Kinestetik).
- **Controller PS3 / Gamepad**:
  - `○` Merah, `✕` Biru, `△` Hijau, `□` Pink untuk menjawab tes Visual & Auditori.
  - `START` untuk memulai hitung mundur / lanjut tahap.
- **Keyboard Fallback**:
  - `1 / 2 / 3 / 4` atau `A / S / W / D` untuk tombol warna & arah.
  - `Space` / `Enter` untuk mulai/lanjut.

---

## Lisensi

MIT License — **Dies Natalis UNTAG Surabaya 2026**
