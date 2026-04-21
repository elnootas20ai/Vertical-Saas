module.exports = {
  apps: [
    {
      name: "udaredge-frontend",
      script: "npx",
      args: "vite",
      node_args: "--max-old-space-size=4192",
      cwd: "./",
      watch: false,
    },
    {
      name: "udaredge-backend",
      script: "index.js",
      cwd: "./",
      watch: false,
    },
  ],
};
