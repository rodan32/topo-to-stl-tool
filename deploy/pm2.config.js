// PM2 ecosystem file for Topo to STL
// Usage: pm2 start deploy/pm2.config.js

module.exports = {
  apps: [{
    name: 'topo-to-stl',
    script: './dist/index.js',
    cwd: '/var/www/topo-to-stl', // Update this to your deployment path
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // Load environment variables from .env file
    env_file: '.env',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    // Increase timeout for terrain generation
    kill_timeout: 30000,
    wait_ready: true,
    listen_timeout: 10000
  }]
};
