FROM node:24-bookworm-slim

WORKDIR /app

# Install system dependencies first — these change rarely so they cache well
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl openssh-server \
    && rm -rf /var/lib/apt/lists/*

# sshd config — baked into image, not /home
RUN printf "Port 2222\nListenAddress 0.0.0.0\nProtocol 2\nHostKey /home/etc/ssh/ssh_host_rsa_key\nPermitRootLogin prohibit-password\nPasswordAuthentication no\nChallengeResponseAuthentication no\nUsePAM no\nAllowTcpForwarding yes\nGatewayPorts no\nX11Forwarding no\nSubsystem sftp /usr/lib/openssh/sftp-server\n" > /etc/ssh/sshd_config

# Install Node deps — only re-runs when package*.json changes
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source — last so source changes don't bust earlier cache layers
COPY . .

# Environment
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080 2222

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT}/health" || exit 1

# Startup script
RUN printf "#!/bin/sh\nset -e\nmkdir -p /run/sshd\nchmod 0755 /run/sshd\nmkdir -p /home/etc/ssh\nif [ ! -f /home/etc/ssh/ssh_host_ed25519_key ]; then ssh-keygen -t ed25519 -f /home/etc/ssh/ssh_host_ed25519_key -N \"\"; fi\n/usr/sbin/sshd -D -f /etc/ssh/sshd_config -p 2222 &\nexec node index.js\n" > /usr/local/bin/startup.sh && chmod +x /usr/local/bin/startup.sh

ENTRYPOINT ["/usr/local/bin/startup.sh"]