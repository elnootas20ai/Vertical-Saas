import type { ScaleDevice, WeighUnit } from '../lib/deliveryApi';

export interface ScaleReading {
  weight: number;
  unit: WeighUnit;
  stable: boolean;
  timestamp: string;
  raw: string;
  error: string | null;
}

export type ScaleStatus = 'disconnected' | 'connecting' | 'connected' | 'reading' | 'error';

export type ScaleEventHandler<T = unknown> = (data: T) => void;

interface ScaleListeners {
  onWeightChange: ScaleEventHandler<ScaleReading>;
  onStatusChange: ScaleEventHandler<{ status: ScaleStatus; message?: string }>;
  onError: ScaleEventHandler<string>;
  onStableWeight: ScaleEventHandler<ScaleReading>;
}

const STABILITY_WINDOW = 5;
const STABILITY_THRESHOLD_KG = 0.002;

export class ScaleService {
  private device: ScaleDevice | null = null;
  private status: ScaleStatus = 'disconnected';
  private port: SerialPort | null = null;
  private btDevice: BluetoothDevice | null = null;
  private btCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private socket: WebSocket | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private listeners: Partial<ScaleListeners> = {};
  private lastStableWeight = 0;
  private readInterval: ReturnType<typeof setInterval> | null = null;
  private recentReadings: number[] = [];
  private buffer = '';
  private reading = false;

  getStatus(): ScaleStatus {
    return this.status;
  }

  isConnected(): boolean {
    return this.status === 'connected' || this.status === 'reading';
  }

  getDevice(): ScaleDevice | null {
    return this.device;
  }

  on<K extends keyof ScaleListeners>(event: K, handler: ScaleListeners[K]): void {
    this.listeners[event] = handler;
  }

  off<K extends keyof ScaleListeners>(event: K): void {
    delete this.listeners[event];
  }

  private emit<K extends keyof ScaleListeners>(
    event: K,
    ...args: Parameters<ScaleListeners[K]>
  ): void {
    const handler = this.listeners[event];
    if (handler) {
      try { (handler as (...a: unknown[]) => void)(...args); } catch { /* listener error */ }
    }
  }

  private setStatus(status: ScaleStatus, message?: string): void {
    this.status = status;
    this.emit('onStatusChange', { status, message });
  }

  // ─── Connection ─────────────────────────────────────────────────────────

  async connect(device: ScaleDevice): Promise<boolean> {
    this.device = device;
    this.setStatus('connecting');

    try {
      let ok = false;
      switch (device.connectionType) {
        case 'usb_serial': ok = await this.connectSerial(device); break;
        case 'bluetooth': ok = await this.connectBluetooth(device); break;
        case 'network': ok = await this.connectNetwork(device); break;
        default:
          this.emit('onError', `Tipo de conexión no soportado: ${device.connectionType}`);
          this.setStatus('error', 'Tipo de conexión no soportado');
          return false;
      }

      if (ok) {
        this.setStatus('connected');
        if (device.readMode === 'continuous') {
          this.startContinuousReading();
        }
      } else {
        this.setStatus('error', 'No se pudo conectar');
      }
      return ok;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emit('onError', msg);
      this.setStatus('error', msg);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.stopContinuousReading();

    if (this.reader) {
      try { await this.reader.cancel(); } catch { /* ignore */ }
      this.reader = null;
    }
    if (this.port) {
      try { await this.port.close(); } catch { /* ignore */ }
      this.port = null;
    }
    if (this.btCharacteristic) {
      try { await this.btCharacteristic.stopNotifications(); } catch { /* ignore */ }
      this.btCharacteristic = null;
    }
    if (this.btDevice?.gatt?.connected) {
      try { this.btDevice.gatt.disconnect(); } catch { /* ignore */ }
    }
    this.btDevice = null;
    if (this.socket) {
      try { this.socket.close(); } catch { /* ignore */ }
      this.socket = null;
    }

    this.buffer = '';
    this.recentReadings = [];
    this.setStatus('disconnected');
  }

  // ─── Serial ─────────────────────────────────────────────────────────────

  private async connectSerial(device: ScaleDevice): Promise<boolean> {
    if (!('serial' in navigator)) {
      this.emit('onError', 'Web Serial API no disponible. Usa Chrome o Edge.');
      return false;
    }

    const filters: SerialPortFilter[] = [];
    if (device.serial.vendorId) {
      filters.push({ usbVendorId: parseInt(device.serial.vendorId, 16) });
    }

    this.port = await navigator.serial.requestPort(
      filters.length > 0 ? { filters } : undefined,
    );

    await this.port.open({
      baudRate: device.serial.baudRate,
      dataBits: device.serial.dataBits as 7 | 8,
      stopBits: device.serial.stopBits as 1 | 2,
      parity: device.serial.parity as ParityType,
      flowControl: device.serial.flowControl as FlowControlType,
    });

    this.startSerialReadLoop();
    return true;
  }

  private async startSerialReadLoop(): Promise<void> {
    if (!this.port?.readable) return;
    const decoder = new TextDecoder();
    this.reader = this.port.readable.getReader();

    const readLoop = async () => {
      try {
        while (this.reader) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) {
            this.handleIncomingData(decoder.decode(value, { stream: true }));
          }
        }
      } catch (err) {
        if (this.status !== 'disconnected') {
          const msg = err instanceof Error ? err.message : 'Lectura serie interrumpida';
          this.emit('onError', msg);
          this.setStatus('error', msg);
        }
      }
    };
    readLoop();
  }

  // ─── Bluetooth ──────────────────────────────────────────────────────────

  private async connectBluetooth(device: ScaleDevice): Promise<boolean> {
    if (!('bluetooth' in navigator)) {
      this.emit('onError', 'Web Bluetooth API no disponible.');
      return false;
    }

    const filters: BluetoothLEScanFilter[] = device.bluetooth.deviceName
      ? [{ name: device.bluetooth.deviceName }]
      : [];
    const optionalServices = device.bluetooth.serviceUuid ? [device.bluetooth.serviceUuid] : [];

    this.btDevice = await navigator.bluetooth.requestDevice({
      filters: filters.length ? filters : undefined,
      acceptAllDevices: !filters.length,
      optionalServices,
    });

    if (!this.btDevice.gatt) {
      this.emit('onError', 'Dispositivo Bluetooth sin GATT');
      return false;
    }

    const server = await this.btDevice.gatt.connect();
    const service = await server.getPrimaryService(device.bluetooth.serviceUuid);
    this.btCharacteristic = await service.getCharacteristic(device.bluetooth.characteristicUuid);

    await this.btCharacteristic.startNotifications();
    this.btCharacteristic.addEventListener('characteristicvaluechanged', this.handleBtNotification);

    this.btDevice.addEventListener('gattserverdisconnected', () => {
      if (this.status !== 'disconnected') {
        this.emit('onError', 'Bluetooth desconectado');
        this.setStatus('error', 'Bluetooth desconectado');
      }
    });

    return true;
  }

  private handleBtNotification = (event: Event): void => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    if (characteristic.value) {
      const raw = new TextDecoder().decode(characteristic.value);
      this.handleIncomingData(raw);
    }
  };

  // ─── Network ────────────────────────────────────────────────────────────

  private async connectNetwork(device: ScaleDevice): Promise<boolean> {
    if (device.network.protocol === 'websocket') {
      const url = `ws://${device.network.host}:${device.network.port}${device.network.path}`;
      return new Promise<boolean>((resolve) => {
        this.socket = new WebSocket(url);
        this.socket.onopen = () => resolve(true);
        this.socket.onerror = () => {
          this.emit('onError', `No se pudo conectar a ${url}`);
          resolve(false);
        };
        this.socket.onmessage = (ev) => this.handleIncomingData(String(ev.data));
        this.socket.onclose = () => {
          if (this.status !== 'disconnected') {
            this.setStatus('error', 'Conexión WebSocket cerrada');
          }
        };
      });
    }

    if (device.network.protocol === 'http') {
      return true;
    }

    this.emit('onError', 'TCP directo no disponible desde el navegador. Configure WebSocket o HTTP.');
    return false;
  }

  // ─── Reading ────────────────────────────────────────────────────────────

  async readWeight(): Promise<ScaleReading> {
    if (!this.device) {
      return { weight: 0, unit: 'kg', stable: false, timestamp: new Date().toISOString(), raw: '', error: 'Sin dispositivo' };
    }

    if (this.device.readMode === 'on_demand') {
      await this.sendCommand(this.device.readCommand);
      return new Promise<ScaleReading>((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ weight: 0, unit: this.device!.weighing.unit as WeighUnit, stable: false, timestamp: new Date().toISOString(), raw: '', error: 'Timeout: sin respuesta' });
        }, 3000);

        const origHandler = this.listeners.onWeightChange;
        this.listeners.onWeightChange = ((reading: ScaleReading) => {
          clearTimeout(timeout);
          this.listeners.onWeightChange = origHandler;
          origHandler?.(reading);
          resolve(reading);
        }) as ScaleListeners['onWeightChange'];
      });
    }

    // Continuous mode: return last buffered reading
    const last = this.recentReadings[this.recentReadings.length - 1] ?? 0;
    return {
      weight: last,
      unit: (this.device.weighing.unit as WeighUnit) || 'kg',
      stable: this.isStable(),
      timestamp: new Date().toISOString(),
      raw: '',
      error: null,
    };
  }

  startContinuousReading(): void {
    if (this.readInterval) return;
    if (!this.device) return;

    if (this.device.readMode === 'on_demand') {
      this.readInterval = setInterval(async () => {
        try {
          await this.sendCommand(this.device!.readCommand);
        } catch { /* ignore */ }
      }, this.device.readIntervalMs);
    }
    this.reading = true;
    this.setStatus('reading');
  }

  stopContinuousReading(): void {
    if (this.readInterval) {
      clearInterval(this.readInterval);
      this.readInterval = null;
    }
    this.reading = false;
    if (this.status === 'reading') {
      this.setStatus('connected');
    }
  }

  // ─── Commands ───────────────────────────────────────────────────────────

  async tare(): Promise<boolean> {
    if (!this.device?.weighing.tareSupported) return false;
    try {
      await this.sendCommand(this.device.weighing.tareCommand);
      return true;
    } catch { return false; }
  }

  async zero(): Promise<boolean> {
    if (!this.device) return false;
    try {
      await this.sendCommand(this.device.weighing.zeroCommand);
      return true;
    } catch { return false; }
  }

  private async sendCommand(command: string): Promise<void> {
    if (!command) return;

    const encoded = new TextEncoder().encode(command);

    if (this.port?.writable) {
      const writer = this.port.writable.getWriter();
      try { await writer.write(encoded); } finally { writer.releaseLock(); }
      return;
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(command);
      return;
    }

    if (this.device?.network.protocol === 'http' && this.device.network.host) {
      const url = `http://${this.device.network.host}:${this.device.network.port}${this.device.network.path}`;
      const resp = await fetch(url, { method: 'POST', body: command });
      const text = await resp.text();
      this.handleIncomingData(text);
      return;
    }
  }

  // ─── Parsing ────────────────────────────────────────────────────────────

  private handleIncomingData(data: string): void {
    if (!this.device) return;
    this.buffer += data;

    const lines = this.buffer.split(/[\r\n]+/);
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const reading = this.parseResponse(trimmed, this.device);
      if (reading.error) {
        continue;
      }

      this.recentReadings.push(reading.weight);
      if (this.recentReadings.length > STABILITY_WINDOW) {
        this.recentReadings.shift();
      }

      reading.stable = this.isStable();
      this.emit('onWeightChange', reading);

      if (reading.stable && Math.abs(reading.weight - this.lastStableWeight) > 0.0001) {
        this.lastStableWeight = reading.weight;
        this.emit('onStableWeight', reading);
      }
    }
  }

  private isStable(): boolean {
    if (this.recentReadings.length < 3) return false;
    const slice = this.recentReadings.slice(-STABILITY_WINDOW);
    const min = Math.min(...slice);
    const max = Math.max(...slice);
    return (max - min) < STABILITY_THRESHOLD_KG;
  }

  private parseResponse(raw: string, device: ScaleDevice): ScaleReading {
    const now = new Date().toISOString();
    const base: ScaleReading = {
      weight: 0, unit: (device.weighing.unit as WeighUnit) || 'kg',
      stable: false, timestamp: now, raw, error: null,
    };

    try {
      switch (device.readProtocol) {
        case 'sics_mt': return this.parseSicsMT(raw, base);
        case 'cas': return this.parseCAS(raw, base);
        case 'epelsa': return this.parseEpelsa(raw, base);
        case 'dibal': return this.parseDibal(raw, base);
        case 'generic_ascii':
        case 'continuous':
        case 'custom':
        default: return this.parseGenericAscii(raw, base, device);
      }
    } catch (err) {
      return { ...base, error: `Error parseando: ${err}` };
    }
  }

  private parseSicsMT(raw: string, base: ScaleReading): ScaleReading {
    // SICS format: "S S     12.345 kg" or "S D     12.345 kg"
    const match = raw.match(/([SD])\s+[SD+-]\s+([\d.]+)\s+(\w+)/);
    if (!match) return { ...base, error: 'Formato SICS no reconocido' };
    return {
      ...base,
      stable: match[1] === 'S',
      weight: parseFloat(match[2]),
      unit: (match[3] as WeighUnit) || base.unit,
    };
  }

  private parseCAS(raw: string, base: ScaleReading): ScaleReading {
    // CAS scales: various formats, common: "ST,GS,+000.000kg" or "ST,NT,+000.000kg"
    const match = raw.match(/(ST|US|OL)[,\s]+(GS|NT)[,\s]+([+-]?\d+\.?\d*)\s*(kg|g|lb)?/i);
    if (!match) {
      return this.parseGenericAscii(raw, base, this.device!);
    }
    return {
      ...base,
      stable: match[1].toUpperCase() === 'ST',
      weight: parseFloat(match[3]),
      unit: (match[4]?.toLowerCase() as WeighUnit) || base.unit,
    };
  }

  private parseEpelsa(raw: string, base: ScaleReading): ScaleReading {
    // Epelsa: proprietary, commonly sends weight as decimal ASCII with status byte
    const numMatch = raw.match(/([+-]?\d+[.,]?\d*)/);
    if (!numMatch) return { ...base, error: 'Formato Epelsa no reconocido' };
    const w = parseFloat(numMatch[1].replace(',', '.'));
    return { ...base, weight: w, stable: true };
  }

  private parseDibal(raw: string, base: ScaleReading): ScaleReading {
    // Dibal: proprietary RS-232, weight typically in positions 2-7 with implied decimal
    const numMatch = raw.match(/(\d{5,6})/);
    if (!numMatch) return { ...base, error: 'Formato Dibal no reconocido' };
    const digits = numMatch[1];
    const w = parseInt(digits, 10) / 1000;
    return { ...base, weight: w, stable: true };
  }

  private parseGenericAscii(raw: string, base: ScaleReading, device: ScaleDevice): ScaleReading {
    if (device.parser.regex) {
      try {
        const re = new RegExp(device.parser.regex);
        const match = raw.match(re);
        if (!match) return { ...base, error: 'Regex no coincide con la respuesta' };
        let weightStr = match[device.parser.weightGroup] || '0';
        if (device.parser.decimalSeparator === ',') weightStr = weightStr.replace(',', '.');
        const unit = (match[device.parser.unitGroup] as WeighUnit) || base.unit;
        const stable = device.parser.stableIndicator ? raw.includes(device.parser.stableIndicator) : true;
        return { ...base, weight: parseFloat(weightStr), unit, stable };
      } catch {
        return { ...base, error: 'Regex inválido en configuración del parser' };
      }
    }

    // Fallback: first number in string
    const numMatch = raw.match(/([+-]?\d+[.,]?\d*)/);
    if (!numMatch) return { ...base, error: 'No se encontró peso numérico' };
    const w = parseFloat(numMatch[1].replace(',', '.'));
    return { ...base, weight: w, stable: true };
  }
}

// ─── Capabilities detection ──────────────────────────────────────────────────

export function getScaleCapabilities() {
  const ua = navigator.userAgent.toLowerCase();
  let platform: 'desktop' | 'android' | 'ios' | 'unknown' = 'unknown';
  if (/android/.test(ua)) platform = 'android';
  else if (/iphone|ipad|ipod/.test(ua)) platform = 'ios';
  else if (/windows|macintosh|linux/.test(ua)) platform = 'desktop';

  return {
    serialAvailable: 'serial' in navigator,
    bluetoothAvailable: 'bluetooth' in navigator,
    networkAvailable: true,
    platform,
  };
}

// ─── Scale presets ───────────────────────────────────────────────────────────

export const SCALE_PRESETS: Record<string, Partial<ScaleDevice>> = {
  epelsa_neptune: {
    brand: 'Epelsa', model: 'Neptune',
    connectionType: 'usb_serial',
    serial: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none', vendorId: '', productId: '' },
    readProtocol: 'epelsa', readMode: 'on_demand', readCommand: '\x05',
    weighing: { unit: 'kg', maxWeight: 15, minWeight: 0.002, precision: 3, tareSupported: true, tareCommand: 'T\r\n', zeroCommand: 'Z\r\n' },
  } as Partial<ScaleDevice>,
  cas_sw1s: {
    brand: 'CAS', model: 'SW-1S',
    connectionType: 'usb_serial',
    serial: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none', vendorId: '', productId: '' },
    readProtocol: 'cas', readMode: 'continuous',
    weighing: { unit: 'kg', maxWeight: 30, minWeight: 0.005, precision: 3, tareSupported: true, tareCommand: 'T\r\n', zeroCommand: 'Z\r\n' },
  } as Partial<ScaleDevice>,
  dibal_g310: {
    brand: 'Dibal', model: 'G-310',
    connectionType: 'usb_serial',
    serial: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none', vendorId: '', productId: '' },
    readProtocol: 'dibal', readMode: 'on_demand', readCommand: '\x05',
    weighing: { unit: 'kg', maxWeight: 15, minWeight: 0.002, precision: 3, tareSupported: true, tareCommand: '', zeroCommand: '' },
  } as Partial<ScaleDevice>,
  baxtran_br15: {
    brand: 'Baxtran', model: 'BR-15',
    connectionType: 'usb_serial',
    serial: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none', vendorId: '', productId: '' },
    readProtocol: 'generic_ascii', readMode: 'continuous',
    weighing: { unit: 'kg', maxWeight: 15, minWeight: 0.002, precision: 3, tareSupported: false, tareCommand: '', zeroCommand: '' },
  } as Partial<ScaleDevice>,
  mettler_toledo_ics: {
    brand: 'Mettler Toledo', model: 'ICS Series',
    connectionType: 'usb_serial',
    serial: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none', vendorId: '', productId: '' },
    readProtocol: 'sics_mt', readMode: 'on_demand', readCommand: 'S\r\n',
    parser: { regex: 'S\\s+S\\s+([\\d.]+)\\s+(\\w+)', weightGroup: 1, unitGroup: 2, decimalSeparator: '.', encoding: 'ascii', stableIndicator: 'S' },
    weighing: { unit: 'kg', maxWeight: 30, minWeight: 0.001, precision: 3, tareSupported: true, tareCommand: 'T\r\n', zeroCommand: 'Z\r\n' },
  } as Partial<ScaleDevice>,
  gram_m6: {
    brand: 'Gram', model: 'M6',
    connectionType: 'usb_serial',
    serial: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none', vendorId: '', productId: '' },
    readProtocol: 'generic_ascii', readMode: 'continuous',
    weighing: { unit: 'kg', maxWeight: 15, minWeight: 0.002, precision: 3, tareSupported: true, tareCommand: 'T\r\n', zeroCommand: 'Z\r\n' },
  } as Partial<ScaleDevice>,
  generic_serial: {
    brand: 'Genérica', model: 'Serie RS-232/USB',
    connectionType: 'usb_serial',
    serial: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none', vendorId: '', productId: '' },
    readProtocol: 'generic_ascii', readMode: 'continuous',
    parser: { regex: '([+-]?[\\d.,]+)\\s*(kg|g|lb)?', weightGroup: 1, unitGroup: 2, decimalSeparator: '.', encoding: 'ascii', stableIndicator: '' },
    weighing: { unit: 'kg', maxWeight: 30, minWeight: 0.001, precision: 3, tareSupported: false, tareCommand: '', zeroCommand: '' },
  } as Partial<ScaleDevice>,
  generic_bluetooth: {
    brand: 'Genérica', model: 'Bluetooth BLE',
    connectionType: 'bluetooth',
    readProtocol: 'generic_ascii', readMode: 'continuous',
    weighing: { unit: 'kg', maxWeight: 30, minWeight: 0.001, precision: 3, tareSupported: false, tareCommand: '', zeroCommand: '' },
  } as Partial<ScaleDevice>,
  generic_network: {
    brand: 'Genérica', model: 'Red TCP/IP',
    connectionType: 'network',
    network: { host: '', port: 0, protocol: 'websocket', path: '' },
    readProtocol: 'generic_ascii', readMode: 'on_demand', readCommand: 'S\r\n',
    weighing: { unit: 'kg', maxWeight: 30, minWeight: 0.001, precision: 3, tareSupported: false, tareCommand: '', zeroCommand: '' },
  } as Partial<ScaleDevice>,
};

let _instance: ScaleService | null = null;

export function getScaleService(): ScaleService {
  if (!_instance) _instance = new ScaleService();
  return _instance;
}
