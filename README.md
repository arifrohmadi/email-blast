# 📧 Blast Email - Aplikasi Email Marketing

Aplikasi blast email berbasis web yang dijalankan di komputer Anda sendiri.

---

## 🛠 Persyaratan

- **Node.js** versi 16 ke atas  
  Download: https://nodejs.org (pilih LTS)

---

## 🚀 Cara Menjalankan

### 1. Install Node.js
Download dan install dari https://nodejs.org

### 2. Install dependensi
Buka folder ini di terminal / command prompt, lalu jalankan:
```
npm install
```

### 3. Jalankan aplikasi
```
npm start
```

### 4. Buka di browser
Buka browser dan akses:
```
http://localhost:3000
```

---

## 📋 Cara Penggunaan

### Langkah 1 - Import Kontak
- Klik menu **Import Kontak**
- Upload file CSV dengan format kolom: `#`, `Nama Lengkap`, `Email`
- Bisa juga tambah kontak secara manual

### Langkah 2 - Pengaturan SMTP
- Klik menu **Pengaturan SMTP**
- Isi konfigurasi server email Anda
- Klik **Test Koneksi** untuk memastikan berhasil

### Langkah 3 - Buat Email
- Klik menu **Buat Email**
- Isi subject dan isi email
- Gunakan variabel: `{{nama}}`, `{{email}}`, `{{nomor}}`
- Lihat preview sebelum kirim

### Langkah 4 - Kirim
- Klik menu **Kirim**
- Atur delay antar email (disarankan minimal 2 detik)
- Centang **Dry Run** untuk simulasi tanpa kirim sungguhan
- Klik **Mulai Kirim**

### Langkah 5 - Cek Log
- Klik menu **Log Pengiriman**
- Lihat status setiap email
- Export log ke CSV

---

## ⚙️ Konfigurasi Gmail

1. Aktifkan **2-Factor Authentication** di akun Google
2. Buat **App Password**:  
   Google Account → Security → 2-Step Verification → App Passwords
3. Gunakan App Password (16 karakter) sebagai password
4. Pengaturan SMTP:
   - Host: `smtp.gmail.com`
   - Port: `587` (TLS) atau `465` (SSL)

---

## 📁 Format File CSV

```
#,Nama Lengkap,Email
1,Jono Susilo,jono@email.com
2,Ani Hidayah,ani@email.com
```

---

## ⚠️ Tips Penting

- Selalu gunakan **delay minimal 2-3 detik** antar email untuk menghindari spam
- Gunakan **Dry Run** terlebih dahulu untuk memastikan template benar
- Gmail membatasi ~500 email/hari untuk akun biasa
- Untuk volume besar, pertimbangkan layanan seperti SendGrid atau Mailgun
