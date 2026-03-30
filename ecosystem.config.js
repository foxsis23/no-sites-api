module.exports = {
  apps: [
    {
      name: 'no-sites-api',
      script: 'dist/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      max_memory_restart: '500M',
      max_restarts: 10,
      min_uptime: 5000,
      restart_delay: 3000,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
