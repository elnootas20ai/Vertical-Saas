#!/usr/bin/env node
/**
 * Vertial Print Bridge — puente local para impresoras térmicas ESC/POS.
 * Uso: npm run print-bridge
 *
 * Endpoints (127.0.0.1:39201):
 *   GET  /v1/health
 *   GET  /v1/printers
 *   POST /v1/print  { connection, data: base64 }
 */
import express from 'express';
import net from 'node:net';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const PORT = Number(process.env.VERTIAL_PRINT_PORT || 39201);
const HOST = '127.0.0.1';
const VERSION = '1.0.0';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function listSystemPrinters() {
  if (process.platform === 'win32') {
    try {
      const out = execSync('wmic printer get name', { encoding: 'utf8', timeout: 8000 });
      return out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && line.toLowerCase() !== 'name');
    } catch {
      return [];
    }
  }
  try {
    const out = execSync('lpstat -p 2>/dev/null || true', { encoding: 'utf8', shell: true, timeout: 8000 });
    return out
      .split(/\r?\n/)
      .map((line) => line.replace(/^printer\s+/i, '').replace(/\s+is.*$/i, '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function sendNetwork(host, port, buffer) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: Number(port) || 9100 }, () => {
      socket.write(buffer, (err) => {
        if (err) {
          socket.destroy();
          reject(err);
          return;
        }
        socket.end();
        resolve(true);
      });
    });
    socket.setTimeout(12000, () => {
      socket.destroy(new Error('Timeout conectando con la impresora de red'));
    });
    socket.on('error', reject);
  });
}

function sendWindowsRaw(printerName, buffer) {
  const tempBin = join(tmpdir(), `vertial-print-${randomBytes(6).toString('hex')}.bin`);
  const tempPs1 = join(tmpdir(), `vertial-print-${randomBytes(6).toString('hex')}.ps1`);
  writeFileSync(tempBin, buffer);
  const binPath = tempBin.replace(/\\/g, '\\\\');
  const printer = String(printerName).replace(/'/g, "''");
  writeFileSync(tempPs1, `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class VertialRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
  public static bool Send(string p, byte[] bytes) {
    IntPtr h; if (!OpenPrinter(p, out h, IntPtr.Zero)) return false;
    var di = new DOCINFOA { pDocName = "Vertial", pDataType = "RAW" };
    if (!StartDocPrinter(h, 1, di)) { ClosePrinter(h); return false; }
    StartPagePrinter(h);
    IntPtr ptr = Marshal.AllocCoTaskMem(bytes.Length);
    Marshal.Copy(bytes, 0, ptr, bytes.Length);
    int w; WritePrinter(h, ptr, bytes.Length, out w);
    Marshal.FreeCoTaskMem(ptr);
    EndPagePrinter(h); EndDocPrinter(h); ClosePrinter(h); return true;
  }
}
'@
$bytes = [System.IO.File]::ReadAllBytes('${binPath}')
if (-not [VertialRawPrinter]::Send('${printer}', $bytes)) { throw 'Impresora Windows no disponible' }
`, 'utf8');
  try {
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempPs1}"`, { stdio: 'pipe', timeout: 25000 });
  } finally {
    try { unlinkSync(tempBin); } catch { /* ignore */ }
    try { unlinkSync(tempPs1); } catch { /* ignore */ }
  }
}

function sendUnixRaw(printerName, buffer) {
  const tempFile = join(tmpdir(), `vertial-print-${randomBytes(6).toString('hex')}.bin`);
  writeFileSync(tempFile, buffer);
  try {
    execSync(`lp -d ${JSON.stringify(printerName)} -o raw ${JSON.stringify(tempFile)}`, {
      stdio: 'pipe',
      timeout: 15000,
    });
  } finally {
    try { unlinkSync(tempFile); } catch { /* ignore */ }
  }
}

async function dispatchPrint(connection, buffer) {
  if (!connection || typeof connection !== 'object') {
    throw new Error('Falta connection');
  }
  if (connection.type === 'network') {
    const host = String(connection.host || '').trim();
    if (!host) throw new Error('Falta IP/host de la impresora');
    await sendNetwork(host, connection.port || 9100, buffer);
    return;
  }
  if (connection.type === 'system') {
    const name = String(connection.name || '').trim();
    if (!name) throw new Error('Falta nombre de impresora');
    if (process.platform === 'win32') {
      sendWindowsRaw(name, buffer);
      return;
    }
    sendUnixRaw(name, buffer);
    return;
  }
  throw new Error('Tipo de conexión no soportado');
}

app.get('/v1/health', (_req, res) => {
  res.json({ ok: true, version: VERSION, platform: process.platform });
});

app.get('/v1/printers', (_req, res) => {
  const names = listSystemPrinters();
  res.json({
    ok: true,
    printers: names.map((name, index) => ({ name, isDefault: index === 0 })),
  });
});

app.post('/v1/print', async (req, res) => {
  try {
    const { connection, data } = req.body || {};
    if (!data || typeof data !== 'string') {
      return res.status(400).json({ ok: false, error: 'Falta data en base64' });
    }
    const buffer = Buffer.from(data, 'base64');
    if (!buffer.length) {
      return res.status(400).json({ ok: false, error: 'Ticket vacío' });
    }
    await dispatchPrint(connection, buffer);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Error al imprimir' });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`[Vertial Print] Escuchando en http://${HOST}:${PORT}`);
  console.log('[Vertial Print] Deja esta ventana abierta mientras uses el TPV.');
});
