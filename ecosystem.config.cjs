module.exports = {
  apps: [
    {
      name: "vertial-frontend",
      script: "npx",
      args: "vite",
      node_args: "--max-old-space-size=4192",
      cwd: "./",
      watch: false,
    },
    {
      name: "vertial-backend",
      script: "index.js",
      cwd: "./",
      watch: false,
    },
  ],
};
