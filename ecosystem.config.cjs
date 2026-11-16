module.exports = {
  apps: [
    {
      name: 'saill-app',
      script: 'dist/server.cjs',
      cwd: './',
      instances: 1, // KVM 2 VPS (2 vCPUs)
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_file: '.env',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
