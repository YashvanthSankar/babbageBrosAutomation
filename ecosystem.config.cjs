module.exports = {
  apps: [{
    name: 'babbagebros-automation',
    cwd: '/home/ubuntu/babbagebros-automation/current',
    script: '/home/ubuntu/.nvm/versions/node/v26.5.0/bin/node',
    args: '--env-file=/home/ubuntu/babbagebros-automation/shared/.env.production /home/ubuntu/babbagebros-automation/current/server.js',
    interpreter: 'none',
    env: {
      NODE_ENV: 'production',
      PORT: '3103',
      HOSTNAME: '127.0.0.1',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    autorestart: true,
    max_memory_restart: '768M',
    min_uptime: '10s',
    max_restarts: 10,
    time: true,
  }],
};
