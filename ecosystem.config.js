module.exports = {
  apps: [
    {
      name: 'tracker-api',
      script: 'dist/main.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3100,
      },
    },
  ],
};
