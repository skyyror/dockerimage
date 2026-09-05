# Image dasar untuk VPS: Ubuntu + SSH server + Claude Code CLI
#
# CARA PAKAI (satu kali saja, sebelum menjalankan bot):
#   1. docker build -t namamu/ubuntu-ssh-claude:latest .
#   2. docker login
#   3. docker push namamu/ubuntu-ssh-claude:latest
#   4. Isi DOCKER_IMAGE=namamu/ubuntu-ssh-claude:latest di file .env bot
#
# Password root diatur lewat environment variable SSH_PASSWORD saat container
# dijalankan (bot yang mengisi otomatis, lihat entrypoint.sh).

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
        openssh-server \
        curl \
        sudo \
        git \
        ca-certificates \
        nano \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g @anthropic-ai/claude-code \
    && mkdir -p /var/run/sshd \
    && sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config \
    && sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 22

CMD ["/entrypoint.sh"]
