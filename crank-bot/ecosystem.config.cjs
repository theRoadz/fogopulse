// PM2 Ecosystem Configuration for FogoPulse Crank Bot
// Usage: pm2 start ecosystem.config.cjs
// Monitor: pm2 logs fogopulse-crank
// Stop: pm2 stop fogopulse-crank && pm2 delete fogopulse-crank
//
// To control epoch creation, set AUTO_CREATE_EPOCH in .env:
//   AUTO_CREATE_EPOCH=false  (disable)
//   AUTO_CREATE_EPOCH=true   (enable, default)
//
// Or edit 'args' below to include --epoch or --no-epoch

const path = require('path')

module.exports = {
  apps: [{
    name: 'fogopulse-crank',
    script: path.join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    args: 'crank-bot.ts',  // Add --epoch or --no-epoch here if needed
    cwd: __dirname,
    interpreter: 'node',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    env: {
      NODE_ENV: 'production'
    }
  }]
}
