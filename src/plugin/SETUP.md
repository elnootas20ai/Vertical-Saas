# Plugin — Agent Hub (Right Panel)

## Quick Setup in another project

### 1. Copy the `src/plugin/` folder to your project

### 2. Install dependencies
```bash
npm install node-pty ansi-to-html
```
`node-pty` requires build tools (`make`, `gcc`, `g++`, `python3`).

### 3. Install Cursor CLI (for AI agents)
```bash
curl https://cursor.com/install -fsS | bash
```
The plugin can also auto-install it via the UI.

### 4. Backend (Express)
```js
import { pluginRouter } from './src/plugin/server/router.js';
app.use('/api/plugin', pluginRouter);
```

### 5. Frontend (React)
Add `<PluginPanel />` inside your main layout component:
```tsx
import { PluginPanel } from '../plugin/PluginPanel';

// Inside your layout's return:
<PluginPanel />
```

A floating button will appear. Click to open the agent panel.

### 6. Vite proxy (dev only)
```ts
server: {
  proxy: {
    '/api': { target: 'http://localhost:3001', changeOrigin: true },
  },
},
```

### 7. Dependencies (already common)
- express, react, lucide-react, tailwindcss, clsx, tailwind-merge
- The `cn()` utility — or copy it into the plugin.

## Agent Types
- **Cursor Agent**: Launches the Cursor AI CLI (`agent`) in a PTY. Send instructions, the AI edits your code.
- **Terminal**: Plain bash shell. Run any command.
