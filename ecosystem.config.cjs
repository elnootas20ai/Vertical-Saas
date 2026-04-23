module.exports = {
  apps: [
    {
      name: "udar-frontend",
      script: "npx",
      args: "vite",
      node_args: "--max-old-space-size=4192",
      cwd: "./",
      watch: false,
    },
    {
      name: "udar-backend",
      script: "index.js",
      cwd: "./",
      watch: false,
    },
  ],
};
