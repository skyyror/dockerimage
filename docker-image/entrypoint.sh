#!/bin/bash
set -e

# Password diisi otomatis oleh bot lewat environment variable SSH_PASSWORD.
# Kalau tidak diisi, fallback ke password default (sebaiknya jangan sampai kepakai).
SSH_PASSWORD="${SSH_PASSWORD:-changeme-please-set-SSH_PASSWORD}"

echo "root:${SSH_PASSWORD}" | chpasswd

exec /usr/sbin/sshd -D
