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
      // Arranca desde el directorio donde ejecutaste `pm2 start` (debe ser la raíz del repo).
      // SAAS_AUTO_BOOTSTRAP / SAAS_LOGIN_* deben estar en process.env: .env.NombreEntorno,
      // bloque env/env_production aquí, o variables del sistema — no las "inyecta" PM2 solo.
      cwd: "./",
      watch: false,
    },
  ],
};
