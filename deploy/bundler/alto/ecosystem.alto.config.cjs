module.exports = {
  apps: [
    {
      name: "pump-alto",
      cwd: "/opt/alto",
      script: "node",
      args: "src/esm/cli/alto.js run --config /opt/alto/alto-config.json",
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
