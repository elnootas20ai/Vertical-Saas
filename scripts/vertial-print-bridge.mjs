#!/usr/bin/env node
/**
 * Vertial Print Bridge — puente local para impresoras térmicas ESC/POS.
 * Desarrollo: npm run print-bridge
 * Clientes: descargar VertialPrint.exe desde vertialapp.com/downloads/
 *
 * Endpoints (LAN :39201):
 *   GET  /v1/health
 *   GET  /v1/printers
 *   GET  /v1/network-printers?port=9100
 *   POST /v1/print  { connection, data: base64 }
 */
import express from 'express';
import net from 'node:net';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const PORT = Number(process.env.VERTIAL_PRINT_PORT || 39201);
/** 0.0.0.0 para que iPad/tablet en la misma WiFi llegue al PC del mostrador. */
const HOST = String(process.env.VERTIAL_PRINT_HOST || '0.0.0.0').trim() || '0.0.0.0';
const VERSION = '1.1.0';

function listLocalIpv4Addresses() {
  const ips = [];
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' && entry.family !== 4) continue;
      if (entry.internal) continue;
      const address = String(entry.address || '').trim();
      if (address) ips.push(address);
    }
  }
  return ips;
}

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

function localIpv4Subnets() {
  const prefixes = new Set();
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' && entry.family !== 4) continue;
      if (entry.internal) continue;
      const parts = String(entry.address || '').split('.');
      if (parts.length !== 4) continue;
      prefixes.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
    }
  }
  if (prefixes.size === 0) {
    prefixes.add('192.168.1');
    prefixes.add('192.168.0');
  }
  return [...prefixes];
}

function probeNetworkHost(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.end();
      resolve({ host, port });
    });
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve(null);
    });
    socket.on('error', () => resolve(null));
  });
}

async function scanNetworkPrinters(port = 9100, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 450);
  const concurrency = Number(options.concurrency || 48);
  const prefixes = localIpv4Subnets().slice(0, 3);
  const found = new Map();

  for (const prefix of prefixes) {
    const hosts = [];
    for (let i = 1; i <= 254; i += 1) {
      hosts.push(`${prefix}.${i}`);
    }
    for (let offset = 0; offset < hosts.length; offset += concurrency) {
      const batch = hosts.slice(offset, offset + concurrency);
      const results = await Promise.all(
        batch.map((host) => probeNetworkHost(host, port, timeoutMs)),
      );
      for (const hit of results) {
        if (hit?.host) found.set(hit.host, hit);
      }
    }
  }

  return [...found.values()].sort((a, b) => {
    const toNum = (ip) => ip.split('.').reduce((acc, n) => acc * 256 + Number(n), 0);
    return toNum(a.host) - toNum(b.host);
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

app.get('/v1/network-printers', async (req, res) => {
  try {
    const port = Number(req.query.port || 9100) || 9100;
    const printers = await scanNetworkPrinters(port);
    return res.json({
      ok: true,
      port,
      subnets: localIpv4Subnets(),
      printers: printers.map((item) => ({
        host: item.host,
        port: item.port,
        label: `Impresora térmica · ${item.host}`,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'No se pudo buscar impresoras en la red',
    });
  }
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
  console.log(`[Vertial Print v${VERSION}] Activo en el puerto ${PORT}`);
  const localIps = listLocalIpv4Addresses();
  if (localIps.length) {
    for (const ip of localIps) {
      console.log(`  → http://${ip}:${PORT}`);
    }
  } else {
    console.log(`  → http://127.0.0.1:${PORT}`);
  }
  console.log('[Vertial Print] Deja esta ventana abierta mientras uses el TPV.');
});
