// ============================================================
// Lumorius AI — PM2 Ecosystem Config
// INMARTECH PVT LTD
// ============================================================
// Usage:
//   pm2 start ecosystem.config.js --env production
//   pm2 save && pm2 startup
// ============================================================

module.exports = {
  apps: [
    {
      name: 'lumorius-api',
      script: './apps/api/dist/main.js',
      instances: 'max',
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      watch: false,
      max_memory_restart: '1G',
      error_file:  './logs/api-error.log',
      out_file:    './logs/api-out.log',
      log_file:    './logs/api-combined.log',
      time: true,
      exp_backoff_restart_delay: 100,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
    },
    {
      name: 'lumorius-web',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: './apps/web',
      instances: 2,
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      watch: false,
      max_memory_restart: '1G',
      error_file:  '../../logs/web-error.log',
      out_file:    '../../logs/web-out.log',
      log_file:    '../../logs/web-combined.log',
      time: true,
    },
  ],
};
