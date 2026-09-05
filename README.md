# CVPS Bot (Node.js) — VPS langsung jadi, dikirim ke DM

Bot Telegram: ketik `/cvps` -> VPS (Ubuntu + SSH + Claude Code) benar-benar dibuat di
Railway, lalu detail login SSH dikirim ke chat pribadi (DM) kamu.

## Alur

1. `/cvps`
2. Bot minta Railway API Token -> pesan token **otomatis dihapus** begitu diterima
3. Bot minta nama VPS
4. Bot membuat: project baru -> service dari image Docker -> password SSH random ->
   TCP proxy publik ke port 22 -> tunggu sampai deployment selesai
5. Detail (host, port, user, password) dikirim **khusus ke DM** pembuatnya

## Setup (WAJIB dilakukan sekali di awal)

### 1. Build & push image Docker "Ubuntu SSH + Claude"

```bash
cd docker-image
docker build -t namamu/ubuntu-ssh-claude:latest .
docker login
docker push namamu/ubuntu-ssh-claude:latest
```

### 2. Install dependency bot

```bash
npm install
cp .env.example .env
```

Isi `.env`:
- `TELEGRAM_BOT_TOKEN` — dari [@BotFather](https://t.me/BotFather)
- `DOCKER_IMAGE` — nama image yang barusan kamu push, contoh `namamu/ubuntu-ssh-claude:latest`

### 3. Jalankan

```bash
npm start
```

## Tentang Railway API Token yang diminta bot

Token yang diminta harus **Account Token / Workspace Token** (bukan Project Token),
karena bot perlu membuat project baru. Ambil di:
`Railway Dashboard -> Account Settings -> Tokens`

## Catatan penting

- Setelah VPS jadi, isi `ANTHROPIC_API_KEY` sendiri di dalam VPS (lewat SSH lalu
  `export ANTHROPIC_API_KEY=...` atau taruh di `~/.bashrc`) supaya `claude` CLI bisa
  dipakai — bot ini tidak menyimpan/mengirim API key Claude siapa pun.
- `SSH_PASSWORD` di-generate ulang tiap kali `/cvps` dipakai, dan hanya dikirim sekali
  lewat DM — tidak disimpan di server bot.
- Pastikan bot punya izin admin (hapus pesan) kalau `/cvps` dipakai di grup.
- User harus pernah `/start` bot secara pribadi minimal sekali supaya bot bisa DM.
- Railway API bisa berubah sewaktu-waktu (mutation/field bisa beda). Kalau ada error
  dari Railway, cek https://docs.railway.com/reference/public-api untuk update terbaru.
