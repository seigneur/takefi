module.exports = {
  apps: [
    {
      name: 'oracle-backend',
      script: 'oracle-backend/src/app.js',
      instances: 1, // Single instance for development, scale for production
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        LOG_LEVEL: 'debug'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        AWS_REGION: 'us-east-1',
        LOG_LEVEL: 'info',
        instances: 2,
        exec_mode: 'cluster'
      },
      error_file: './logs/oracle-error.log',
      out_file: './logs/oracle-out.log',
      log_file: './logs/oracle-combined.log',
      time: true
    },
    {
      name: 'mm-server',
      script: 'cow-mm-server/dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        LOG_LEVEL: 'debug'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        CHAIN_ID: 11155111, // Sepolia for production testing
        LOG_LEVEL: 'info',
        instances: 2,
        exec_mode: 'cluster'
      },
      error_file: './logs/mm-error.log',
      out_file: './logs/mm-out.log',
      log_file: './logs/mm-combined.log',
      time: true
    }
  ],

  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-production-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:your-username/btcfi.git',
      path: '/var/www/btcfi',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build:mm && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      'ssh_options': 'ForwardAgent=yes'
    },
    staging: {
      user: 'deploy',
      host: ['your-staging-server.com'],
      ref: 'origin/develop',
      repo: 'git@github.com:your-username/btcfi.git',
      path: '/var/www/btcfi-staging',
      'post-deploy': 'npm install && npm run build:mm && pm2 reload ecosystem.config.js --env development'
    }
  }
};