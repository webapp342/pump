module.exports = {
  apps: [
    {
      name: "pump-skandha",
      cwd: "/opt/skandha",
      script: "./skandha",
      args: "standalone --unsafeMode",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
      },
      max_restarts: 10,
      restart_delay: 5000,
      autorestart: true,
    },
  ],
};
