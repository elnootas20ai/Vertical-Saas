# BÁSCULA — Integración con TPV

**Tipo:** Backend + Frontend / Acción  
**URL:** No aplica (funcionalidad transversal al TPV)  
**Objetivo:** Permitir capturar el peso del producto desde hardware compatible (básculas USB, Bluetooth o red) y reflejarlo automáticamente en el flujo de venta del TPV.  
**Fecha:** 2026-04-14

---

## Estado auditado (08/07/2026)

**~55% hecho.** La base está construida y montada: modelo `scale_device` con builder/sanitizer en `couchdb.js`, CRUD + asignación a terminal + `reportScaleStatus` en `deliveryController.js` bajo `/api/delivery/scale-devices` (router montado), tipos y funciones cliente en `deliveryApi.ts` (incl. `TerminalConfig.scaleDeviceId/scaleName` y `WeightTraceData`), `scaleService.ts` completo (Web Serial, Web Bluetooth, red WS/HTTP, parseo SICS/CAS/Epelsa/Dibal/genérico, tara/cero, `SCALE_PRESETS`, `getScaleCapabilities`), hook `useScale.ts` (auto-conexión, reconexión con backoff, caché localStorage) y `ScaleWeightWidget.tsx` (modos card/inline/compact, barra de estabilidad, fallback manual, atajos).
**Falta de verdad (el hueco es la integración):** `useScale` y `ScaleWeightWidget` **no se usan en ninguna página** — `WorkerTpvButcherShop.tsx` sigue con input manual `pesoInput`; no hay pantalla de configuración de básculas para el gerente (BAS-10); no se persiste `weightTrace` en ningún pedido ni existe `scale_weight_log`/`weight-summary` (BAS-08/12); las alertas de báscula se limitan a `butcher_scale_disconnected` por ping periódico (`reportScaleStatus` emite SSE pero no crea notificación, y no hay `scale_unassigned` ni `scale_invalid_weight`).

---

## Estado actual del sistema

### Ya implementado (backend + frontend)

| Componente | Estado | Archivo / Ruta |
|---|---|---|
| **Puntos de venta** (`point_of_sale`): CRUD con `name`, `code`, `address`, `terminals[]` | Completo | `deliveryRouter.js`, `deliveryController.js` |
| **Terminal config** (`TerminalConfig`): `id`, `code`, `name`, `datafonName`, `printerName`, `active` | Completo | `deliveryApi.ts` líneas 480-487 |
| **Sesiones de caja TPV** (`tpv_register_session`): apertura, cierre, arqueo | Completo | `deliveryRouter.js`, `deliveryController.js` |
| **Worker TPV Carnicería** (`WorkerTpvButcherShop`): vista de mostrador con peso por línea (`pesoKg`), precio por kg (`precioKg`), total calculado (`peso × precio`), icono `Scale` de lucide | Completo (datos mock) | `WorkerTpvButcherShop.tsx` |
| **Worker TPV genérico** (`WorkerTpv`): selector de vertical que monta el componente apropiado | Completo | `WorkerTpv.tsx` |
| **Catálogo vertical** (`useVerticalCatalog`): unidades de medida por vertical (`kg`, `l`, `ud`, `h`) | Completo | `useVerticalCatalog.ts`, `catalogConfigApi.ts` |
| **SSE** para eventos en tiempo real | Completo | `sseService.js`, `useSSE.ts` |
| **Motor de alertas** (`alertEngine.js`): reglas periódicas + emisión SSE/Push | Completo | `alertEngine.js` |
| **Settings** por negocio: branding, alertas, pasarela, horario | Completo | `settingsRouter.js`, `settingsController.js` |
| **Roles y permisos**: Admin, Gerente, Trabajador con matriz de permisos | Completo | `couchdb.js` (`ROLE_DEFINITIONS`), `roleCatalog.ts` |
| **Capacitor** (app nativa Android/iOS) | Configurado | `package.json` — `@capacitor/core`, `@capacitor/android`, `@capacitor/ios` |

### Ya implementado (patrón de peso manual en carnicería)

El componente `WorkerTpvButcherShop.tsx` ya maneja el concepto de venta por peso:
- Input manual de peso (`pesoInput`) que el trabajador introduce a mano.
- Cada línea de ticket almacena `pesoKg`, `precioKg` y `total = peso × precioKg`.
- Validación de peso > 0 y stock suficiente.
- Estadísticas de peso total por ticket (`ticketWeight`).

Sin embargo, todo es **entrada manual** — no hay conexión con hardware de báscula.

### Brechas detectadas

1. **No existe entidad de dispositivo de báscula** — No hay modelo para registrar básculas (marca, modelo, protocolo, puerto).
2. **No hay asignación de báscula a terminal/puesto de venta** — `TerminalConfig` solo tiene `datafonName` y `printerName`, no dispositivo de pesaje.
3. **No hay servicio de comunicación con hardware** — No existe lógica para leer peso desde Web Serial API, Web Bluetooth API ni red TCP/IP.
4. **No hay protocolo de lectura de peso** — No se soporta ningún protocolo estándar de báscula (SICS/MT, Mettler Toledo, CAS, Epelsa, Dibal, etc.).
5. **No se registra trazabilidad del pesaje** — Las líneas de ticket no guardan metadatos del pesaje (dispositivo, timestamp de lectura, modo de captura).
6. **No hay alertas de hardware** — No se detecta báscula desconectada, peso inválido, lectura interrumpida ni báscula sin asignar.
7. **El peso se pierde tras la venta** — No hay historial de pesajes vinculado a ventas para auditoría/trazabilidad.
8. **No hay configuración de báscula por gerente** — Solo el trabajador introduce peso manualmente; no hay pantalla de gestión de dispositivos.
9. **No hay soporte multi-protocolo** — Cada marca/modelo de báscula usa su protocolo; no hay capa de abstracción.
10. **No hay soporte para tablet/Capacitor** — En tablet Android, Web Serial no está disponible; se necesitaría Bluetooth o red.

---

## Análisis de protocolos de báscula

### Protocolos estándar del mercado

| Protocolo | Uso habitual | Separador | Ejemplo de respuesta |
|---|---|---|---|
| **SICS/MT-SICS** (Mettler Toledo) | Básculas industriales y de laboratorio | CR LF | `S S     12.345 kg` |
| **CAS (tipo A/B/C)** | Básculas comerciales CAS | STX...ETX | `02 30 31 32 33 34 03` |
| **Epelsa** | Básculas de comercio en España | Propietario, RS-232 | Cadena de bytes con peso y tara |
| **Dibal** | Básculas etiquetadoras | Propietario, RS-232 | Protocolo serie con códigos de estado |
| **Toledo/Ohaus** | Básculas de mostrador | Continuo / bajo petición | Cadena ASCII con peso y unidad |
| **Genérico ASCII** | Muchos fabricantes económicos | CR o CR LF | `+  1.234 kg` o `  1234 g` |
| **Modo continuo** | Básculas que emiten peso constantemente | Sin petición | Stream de lecturas cada 200-500ms |
| **Modo bajo petición** | Se envía comando y la báscula responde | Petición/Respuesta | Enviar `S\r\n`, recibir peso |

### Conectividad según plataforma

| Plataforma | USB (Serial) | Bluetooth | Red (TCP/IP) |
|---|---|---|---|
| **PC Chrome/Edge** | Web Serial API | Web Bluetooth API | fetch / WebSocket |
| **PC Firefox/Safari** | No soportado | Parcial | fetch / WebSocket |
| **Android Capacitor** | Plugin nativo | Plugin nativo + Web Bluetooth | fetch / WebSocket |
| **iOS Capacitor** | No soportado | Plugin nativo + Web Bluetooth | fetch / WebSocket |
| **Tablet Android (Chrome)** | Web Serial (con OTG) | Web Bluetooth API | fetch / WebSocket |

---

## TICKETS

---

### TICKET BAS-01: Modelo de datos — Entidad `scale_device` (Dispositivo de báscula)

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** Ninguna

#### Contexto
No existe ninguna entidad para registrar las básculas disponibles en el negocio. Necesitamos un modelo que almacene la configuración de cada báscula: marca, modelo, protocolo de comunicación, tipo de conexión y parámetros técnicos. Esta entidad es la base de toda la integración.

#### Tareas

**1. Definir `buildScaleDeviceDocument` en `services/couchdb.js`**

```javascript
function buildScaleDeviceDocument(userId, data, existing) {
  return {
    _id: existing?._id || `scale_device:${crypto.randomUUID()}`,
    _rev: existing?._rev,
    type: 'scale_device',
    user_id: userId,

    // Identificación
    name: data.name,                         // "Báscula Mostrador 1"
    brand: data.brand || '',                 // "Epelsa", "CAS", "Mettler Toledo", "Dibal", "Baxtran"
    model: data.model || '',                 // "Neptune", "SW-1S", "ICS465"
    serialNumber: data.serialNumber || '',   // Nro de serie del fabricante

    // Conexión
    connectionType: data.connectionType,     // 'usb_serial' | 'bluetooth' | 'network'

    // Parámetros USB/Serial
    serial: {
      baudRate: data.serial?.baudRate || 9600,       // 2400, 4800, 9600, 19200, 38400, 57600, 115200
      dataBits: data.serial?.dataBits || 8,          // 7 | 8
      stopBits: data.serial?.stopBits || 1,          // 1 | 2
      parity: data.serial?.parity || 'none',         // 'none' | 'even' | 'odd'
      flowControl: data.serial?.flowControl || 'none', // 'none' | 'hardware'
      vendorId: data.serial?.vendorId || '',         // USB Vendor ID (filtro para Web Serial)
      productId: data.serial?.productId || '',       // USB Product ID
    },

    // Parámetros Bluetooth
    bluetooth: {
      deviceName: data.bluetooth?.deviceName || '',       // Nombre BLE advertised
      serviceUuid: data.bluetooth?.serviceUuid || '',     // UUID del servicio BLE
      characteristicUuid: data.bluetooth?.characteristicUuid || '', // UUID de la característica de peso
    },

    // Parámetros de red
    network: {
      host: data.network?.host || '',         // IP o hostname
      port: data.network?.port || 0,          // Puerto TCP
      protocol: data.network?.protocol || 'tcp', // 'tcp' | 'websocket' | 'http'
      path: data.network?.path || '',         // Path para HTTP/WebSocket
    },

    // Protocolo de lectura
    readProtocol: data.readProtocol || 'generic_ascii', // 'sics_mt' | 'cas' | 'epelsa' | 'dibal' | 'generic_ascii' | 'continuous' | 'custom'
    readMode: data.readMode || 'on_demand',  // 'on_demand' (enviar comando) | 'continuous' (stream)
    readCommand: data.readCommand || 'S\r\n', // Comando para solicitar peso (modo on_demand)
    readIntervalMs: data.readIntervalMs || 500, // Intervalo entre lecturas (modo continuous)

    // Parseo de respuesta
    parser: {
      regex: data.parser?.regex || '',         // Regex para extraer peso (ej: /([+-]?\d+\.?\d*)\s*(kg|g|lb)/)
      weightGroup: data.parser?.weightGroup || 1, // Grupo de captura del peso
      unitGroup: data.parser?.unitGroup || 2,  // Grupo de captura de la unidad
      decimalSeparator: data.parser?.decimalSeparator || '.', // '.' o ','
      encoding: data.parser?.encoding || 'ascii', // 'ascii' | 'utf-8'
      stableIndicator: data.parser?.stableIndicator || 'S', // Carácter que indica lectura estable
    },

    // Configuración de pesaje
    weighing: {
      unit: data.weighing?.unit || 'kg',      // 'kg' | 'g' | 'lb'
      maxWeight: data.weighing?.maxWeight || 30,  // Peso máximo del dispositivo (kg)
      minWeight: data.weighing?.minWeight || 0.001, // Peso mínimo legible (kg)
      precision: data.weighing?.precision || 3,    // Decimales (ej: 3 = 0.001 kg)
      tareSupported: data.weighing?.tareSupported || false, // Soporta tara
      tareCommand: data.weighing?.tareCommand || 'T\r\n',  // Comando para tara
      zeroCommand: data.weighing?.zeroCommand || 'Z\r\n',  // Comando para poner a cero
    },

    // Estado
    active: data.active !== false,
    notes: data.notes || '',

    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
```

**2. Crear `sanitizeScaleDevice` con validaciones**

- `name` obligatorio (string, min 1 char).
- `connectionType` obligatorio, uno de `['usb_serial', 'bluetooth', 'network']`.
- `readProtocol` obligatorio, uno de `['sics_mt', 'cas', 'epelsa', 'dibal', 'generic_ascii', 'continuous', 'custom']`.
- Si `connectionType === 'network'`: `network.host` y `network.port` obligatorios.
- Si `connectionType === 'bluetooth'`: `bluetooth.deviceName` obligatorio.
- `weighing.maxWeight > 0`.
- `weighing.precision` entre 0 y 6.

**3. Almacenamiento en BD de delivery existente**

Usar `getDeliveryDbName(userId)` — mismo dominio que `point_of_sale` y `tpv_register_session`, ya que la báscula es un periférico del punto de venta.

**4. CRUD en controlador (`controllers/deliveryController.js`)**

| Función | Descripción |
|---|---|
| `listScaleDevices(userId)` | Listar básculas activas del negocio |
| `getScaleDevice(userId, deviceId)` | Obtener una báscula por ID |
| `createScaleDevice(userId, data)` | Crear nueva báscula |
| `updateScaleDevice(userId, deviceId, data)` | Actualizar configuración |
| `deleteScaleDevice(userId, deviceId)` | Soft delete (`active: false`) |

**5. Router (`routers/deliveryRouter.js`)**

```javascript
deliveryRouter.get('/scale-devices/:userId', listScaleDevices);
deliveryRouter.get('/scale-devices/:userId/:deviceId', getScaleDevice);
deliveryRouter.post('/scale-devices/:userId', createScaleDevice);
deliveryRouter.put('/scale-devices/:userId/:deviceId', updateScaleDevice);
deliveryRouter.delete('/scale-devices/:userId/:deviceId', deleteScaleDevice);
```

**6. Cliente TypeScript (`src/app/lib/deliveryApi.ts`)**

```typescript
export type ScaleConnectionType = 'usb_serial' | 'bluetooth' | 'network';
export type ScaleReadProtocol = 'sics_mt' | 'cas' | 'epelsa' | 'dibal' | 'generic_ascii' | 'continuous' | 'custom';
export type ScaleReadMode = 'on_demand' | 'continuous';
export type WeighUnit = 'kg' | 'g' | 'lb';

export interface ScaleSerialConfig {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: 'none' | 'even' | 'odd';
  flowControl: 'none' | 'hardware';
  vendorId: string;
  productId: string;
}

export interface ScaleBluetoothConfig {
  deviceName: string;
  serviceUuid: string;
  characteristicUuid: string;
}

export interface ScaleNetworkConfig {
  host: string;
  port: number;
  protocol: 'tcp' | 'websocket' | 'http';
  path: string;
}

export interface ScaleParserConfig {
  regex: string;
  weightGroup: number;
  unitGroup: number;
  decimalSeparator: '.' | ',';
  encoding: 'ascii' | 'utf-8';
  stableIndicator: string;
}

export interface ScaleWeighingConfig {
  unit: WeighUnit;
  maxWeight: number;
  minWeight: number;
  precision: number;
  tareSupported: boolean;
  tareCommand: string;
  zeroCommand: string;
}

export interface ScaleDevice {
  _id: string;
  _rev?: string;
  type: 'scale_device';
  user_id: string;
  name: string;
  brand: string;
  model: string;
  serialNumber: string;
  connectionType: ScaleConnectionType;
  serial: ScaleSerialConfig;
  bluetooth: ScaleBluetoothConfig;
  network: ScaleNetworkConfig;
  readProtocol: ScaleReadProtocol;
  readMode: ScaleReadMode;
  readCommand: string;
  readIntervalMs: number;
  parser: ScaleParserConfig;
  weighing: ScaleWeighingConfig;
  active: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export async function listScaleDevicesRequest(userId: string): Promise<ScaleDevice[]>;
export async function getScaleDeviceRequest(userId: string, deviceId: string): Promise<ScaleDevice>;
export async function createScaleDeviceRequest(userId: string, data: Partial<ScaleDevice>): Promise<ScaleDevice>;
export async function updateScaleDeviceRequest(userId: string, deviceId: string, data: Partial<ScaleDevice>): Promise<ScaleDevice>;
export async function deleteScaleDeviceRequest(userId: string, deviceId: string): Promise<void>;
```

**7. Plantillas de configuración predefinidas**

Incluir en el frontend un catálogo de presets para las marcas más comunes en España, para que el usuario no tenga que configurar todos los parámetros manualmente:

```typescript
export const SCALE_PRESETS: Record<string, Partial<ScaleDevice>> = {
  'epelsa_neptune': {
    brand: 'Epelsa', model: 'Neptune',
    connectionType: 'usb_serial',
    serial: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none', vendorId: '', productId: '' },
    readProtocol: 'epelsa', readMode: 'on_demand', readCommand: '\x05',
    parser: { regex: '', weightGroup: 1, unitGroup: 2, decimalSeparator: '.', encoding: 'ascii', stableIndicator: '' },
    weighing: { unit: 'kg', maxWeight: 15, minWeight: 0.002, precision: 3, tareSupported: true, tareCommand: 'T\r\n', zeroCommand: 'Z\r\n' },
  },
  'cas_sw1s': {
    brand: 'CAS', model: 'SW-1S',
    connectionType: 'usb_serial',
    serial: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none', vendorId: '', productId: '' },
    readProtocol: 'cas', readMode: 'continuous',
    weighing: { unit: 'kg', maxWeight: 30, minWeight: 0.005, precision: 3, tareSupported: true, tareCommand: 'T\r\n', zeroCommand: 'Z\r\n' },
  },
  'dibal_g310': {
    brand: 'Dibal', model: 'G-310',
    connectionType: 'usb_serial',
    readProtocol: 'dibal', readMode: 'on_demand',
    weighing: { unit: 'kg', maxWeight: 15, minWeight: 0.002, precision: 3, tareSupported: true, tareCommand: '', zeroCommand: '' },
  },
  'baxtran_br15': {
    brand: 'Baxtran', model: 'BR-15',
    connectionType: 'usb_serial',
    readProtocol: 'generic_ascii', readMode: 'continuous',
    weighing: { unit: 'kg', maxWeight: 15, minWeight: 0.002, precision: 3, tareSupported: false, tareCommand: '', zeroCommand: '' },
  },
  'mettler_toledo_ics': {
    brand: 'Mettler Toledo', model: 'ICS Series',
    connectionType: 'usb_serial',
    readProtocol: 'sics_mt', readMode: 'on_demand', readCommand: 'S\r\n',
    parser: { regex: 'S\\s+S\\s+([\\d.]+)\\s+(\\w+)', weightGroup: 1, unitGroup: 2, decimalSeparator: '.', encoding: 'ascii', stableIndicator: 'S' },
    weighing: { unit: 'kg', maxWeight: 30, minWeight: 0.001, precision: 3, tareSupported: true, tareCommand: 'T\r\n', zeroCommand: 'Z\r\n' },
  },
  'generic_serial': {
    brand: 'Genérica', model: 'Serie RS-232/USB',
    connectionType: 'usb_serial',
    readProtocol: 'generic_ascii', readMode: 'continuous',
    parser: { regex: '([+-]?[\\d.,]+)\\s*(kg|g|lb)?', weightGroup: 1, unitGroup: 2, decimalSeparator: '.', encoding: 'ascii', stableIndicator: '' },
    weighing: { unit: 'kg', maxWeight: 30, minWeight: 0.001, precision: 3, tareSupported: false, tareCommand: '', zeroCommand: '' },
  },
  'generic_bluetooth': {
    brand: 'Genérica', model: 'Bluetooth BLE',
    connectionType: 'bluetooth',
    readProtocol: 'generic_ascii', readMode: 'continuous',
    weighing: { unit: 'kg', maxWeight: 30, minWeight: 0.001, precision: 3, tareSupported: false, tareCommand: '', zeroCommand: '' },
  },
  'generic_network': {
    brand: 'Genérica', model: 'Red TCP/IP',
    connectionType: 'network',
    readProtocol: 'generic_ascii', readMode: 'on_demand', readCommand: 'S\r\n',
    weighing: { unit: 'kg', maxWeight: 30, minWeight: 0.001, precision: 3, tareSupported: false, tareCommand: '', zeroCommand: '' },
  },
};
```

#### Criterios de aceptación
- [x] CRUD de `scale_device` funcional vía API *(`/api/delivery/scale-devices/...` montado; `buildScaleDeviceDocument`/`sanitizeScaleDevice` en `couchdb.js`)*
- [ ] Validación de campos obligatorios según tipo de conexión *(solo valida `name` y `connectionType`; no exige host/port para red ni deviceName para bluetooth)*
- [x] Presets de configuración para al menos 6 marcas/modelos *(`SCALE_PRESETS` en `scaleService.ts` con 8 presets)*
- [x] La entidad se almacena en la BD de delivery *(`getDeliveryDbName()`)*
- [x] Soft delete funcional *(`softDeleteDocument` en `removeScaleDevice`)*
- [x] Cliente TypeScript con tipos e interfaces completos *(`ScaleDevice` y subtipos en `deliveryApi.ts`)*

---

### TICKET BAS-02: Modelo de datos — Asignación de báscula a terminal/puesto de venta

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** BAS-01

#### Contexto
Actualmente `TerminalConfig` solo registra `datafonName` y `printerName`. No tiene campo para dispositivo de pesaje. Necesitamos ampliar la configuración de terminal para vincular una báscula específica a cada puesto, y crear la entidad de asignación que permite al gerente decidir qué báscula usa cada terminal.

#### Tareas

**1. Ampliar `TerminalConfig` en el backend (`services/couchdb.js`)**

Añadir campos al objeto terminal dentro de `point_of_sale`:

```javascript
// Dentro de cada terminal en point_of_sale.terminals[]
{
  id: 'term-001',
  code: 'T1',
  name: 'Caja 1',
  datafonName: 'Ingenico Move/5000',
  printerName: 'Epson TM-T20III',
  scaleDeviceId: 'scale_device:abc-123',  // NUEVO — ref a scale_device
  scaleName: 'Báscula Mostrador 1',       // NUEVO — desnormalizado
  active: true,
}
```

**2. Ampliar tipo TypeScript `TerminalConfig` en `deliveryApi.ts`**

```typescript
export interface TerminalConfig {
  id: string;
  code: string;
  name: string;
  datafonName: string;
  printerName: string;
  scaleDeviceId: string;   // ID del scale_device asignado ('' si no tiene)
  scaleName: string;        // Nombre desnormalizado para display
  active: boolean;
}
```

**3. Actualizar `buildPointOfSaleDocument` y `sanitizePointOfSale`**

- Preservar `scaleDeviceId` y `scaleName` al crear/editar un PDV.
- Retrocompatibilidad: si un PDV existente no tiene estos campos, defaultear a `''`.

**4. Endpoint de asignación rápida**

```javascript
// Asignar/desasignar báscula a un terminal sin editar todo el PDV
deliveryRouter.put('/points-of-sale/:userId/:pdvId/terminals/:terminalId/scale', assignScaleToTerminal);
```

Body: `{ scaleDeviceId: string }` (vacío para desasignar).

El endpoint:
- Valida que el `scaleDeviceId` existe y está activo.
- Actualiza `scaleDeviceId` y `scaleName` en el terminal.
- Si la báscula ya estaba asignada a otro terminal del mismo PDV, la desasigna del anterior (una báscula no puede estar en dos terminales del mismo puesto simultáneamente).
- Emite evento SSE `scale:assignment_changed` con `{ pdvId, terminalId, scaleDeviceId }`.

**5. Endpoint para consultar asignación vigente**

```javascript
// Obtener la báscula asignada al terminal donde está operando el trabajador
deliveryRouter.get('/points-of-sale/:userId/:pdvId/terminals/:terminalId/scale', getTerminalScale);
```

Devuelve el `ScaleDevice` completo (no solo el ID) para que el frontend tenga toda la configuración necesaria para conectar.

**6. Función cliente TS**

```typescript
export async function assignScaleToTerminalRequest(
  userId: string, pdvId: string, terminalId: string, scaleDeviceId: string
): Promise<{ ok: boolean }>;

export async function getTerminalScaleRequest(
  userId: string, pdvId: string, terminalId: string
): Promise<ScaleDevice | null>;
```

#### Criterios de aceptación
- [x] `TerminalConfig` incluye `scaleDeviceId` y `scaleName`
- [x] Se puede asignar una báscula a un terminal vía API *(`PUT .../terminals/:terminalId/scale`)*
- [x] Se puede desasignar pasando `scaleDeviceId` vacío
- [x] Una báscula no se puede asignar a dos terminales del mismo PDV *(se desasigna del anterior en `assignScaleToTerminal`)*
- [x] PDV existentes sin báscula siguen funcionando (retrocompatibilidad) *(default `''`)*
- [x] El endpoint de consulta devuelve la configuración completa del dispositivo *(`getTerminalScale` devuelve el `ScaleDevice` sanitizado)*
- [x] Se emite evento SSE al cambiar la asignación *(`scale:assignment_changed`)*

---

### TICKET BAS-03: Frontend — Servicio de comunicación con hardware (`ScaleService`)

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** BAS-01

#### Contexto
El núcleo de la integración es un servicio frontend que abstrae la comunicación con la báscula independientemente del protocolo y tipo de conexión. Este servicio debe manejar Web Serial API (USB), Web Bluetooth API y conexiones de red, exponiendo una interfaz unificada para leer peso.

#### Tareas

**1. Crear `src/app/services/scaleService.ts`**

Clase/módulo singleton que gestiona la conexión y lectura:

```typescript
export interface ScaleReading {
  weight: number;          // Peso en la unidad configurada
  unit: WeighUnit;         // 'kg' | 'g' | 'lb'
  stable: boolean;         // true si la lectura es estable
  timestamp: string;       // ISO timestamp de la lectura
  raw: string;             // Respuesta cruda del dispositivo
  error: string | null;    // null si OK, mensaje si error
}

export type ScaleStatus = 'disconnected' | 'connecting' | 'connected' | 'reading' | 'error';

export interface ScaleServiceEvents {
  onWeightChange: (reading: ScaleReading) => void;
  onStatusChange: (status: ScaleStatus, message?: string) => void;
  onError: (error: string) => void;
  onStableWeight: (reading: ScaleReading) => void;
}

export class ScaleService {
  private device: ScaleDevice | null;
  private status: ScaleStatus;
  private port: SerialPort | null;            // Web Serial
  private btDevice: BluetoothDevice | null;   // Web Bluetooth
  private socket: WebSocket | null;           // Network
  private reader: ReadableStreamDefaultReader | null;
  private listeners: Partial<ScaleServiceEvents>;
  private lastStableWeight: number;
  private readInterval: ReturnType<typeof setInterval> | null;

  constructor() { /* ... */ }

  // --- Conexión ---
  async connect(device: ScaleDevice): Promise<boolean>;
  async disconnect(): Promise<void>;
  getStatus(): ScaleStatus;
  isConnected(): boolean;

  // --- Lectura ---
  async readWeight(): Promise<ScaleReading>;  // Lectura única bajo demanda
  startContinuousReading(): void;             // Iniciar lectura continua
  stopContinuousReading(): void;              // Parar lectura continua

  // --- Comandos ---
  async tare(): Promise<boolean>;             // Enviar comando de tara
  async zero(): Promise<boolean>;             // Enviar comando de puesta a cero

  // --- Listeners ---
  on<K extends keyof ScaleServiceEvents>(event: K, handler: ScaleServiceEvents[K]): void;
  off<K extends keyof ScaleServiceEvents>(event: K): void;

  // --- Privados ---
  private async connectSerial(device: ScaleDevice): Promise<boolean>;
  private async connectBluetooth(device: ScaleDevice): Promise<boolean>;
  private async connectNetwork(device: ScaleDevice): Promise<boolean>;
  private parseResponse(raw: string, device: ScaleDevice): ScaleReading;
  private async sendCommand(command: string): Promise<void>;
  private handleIncomingData(data: string): void;
}
```

**2. Implementar conexión USB/Serial (`connectSerial`)**

```typescript
private async connectSerial(device: ScaleDevice): Promise<boolean> {
  if (!('serial' in navigator)) {
    this.emit('onError', 'Web Serial API no disponible en este navegador. Usa Chrome o Edge.');
    return false;
  }

  const filters: SerialPortFilter[] = [];
  if (device.serial.vendorId) {
    filters.push({ usbVendorId: parseInt(device.serial.vendorId, 16) });
  }

  // Solicitar acceso al puerto (abre diálogo nativo del navegador)
  this.port = await navigator.serial.requestPort(
    filters.length > 0 ? { filters } : undefined
  );

  await this.port.open({
    baudRate: device.serial.baudRate,
    dataBits: device.serial.dataBits,
    stopBits: device.serial.stopBits,
    parity: device.serial.parity,
    flowControl: device.serial.flowControl,
  });

  // Iniciar lectura del stream
  this.reader = this.port.readable.getReader();
  this.readLoop();
  return true;
}
```

**3. Implementar conexión Bluetooth (`connectBluetooth`)**

```typescript
private async connectBluetooth(device: ScaleDevice): Promise<boolean> {
  if (!('bluetooth' in navigator)) {
    this.emit('onError', 'Web Bluetooth API no disponible en este navegador.');
    return false;
  }

  const options: RequestDeviceOptions = {
    filters: device.bluetooth.deviceName
      ? [{ name: device.bluetooth.deviceName }]
      : [{ services: [device.bluetooth.serviceUuid] }],
    optionalServices: device.bluetooth.serviceUuid ? [device.bluetooth.serviceUuid] : [],
  };

  this.btDevice = await navigator.bluetooth.requestDevice(options);
  const server = await this.btDevice.gatt!.connect();
  const service = await server.getPrimaryService(device.bluetooth.serviceUuid);
  const characteristic = await service.getCharacteristic(device.bluetooth.characteristicUuid);

  await characteristic.startNotifications();
  characteristic.addEventListener('characteristicvaluechanged', (event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (value) {
      const raw = new TextDecoder().decode(value);
      this.handleIncomingData(raw);
    }
  });

  return true;
}
```

**4. Implementar conexión de red (`connectNetwork`)**

```typescript
private async connectNetwork(device: ScaleDevice): Promise<boolean> {
  if (device.network.protocol === 'websocket') {
    const url = `ws://${device.network.host}:${device.network.port}${device.network.path}`;
    this.socket = new WebSocket(url);

    return new Promise((resolve) => {
      this.socket!.onopen = () => resolve(true);
      this.socket!.onerror = () => {
        this.emit('onError', `No se pudo conectar a ${url}`);
        resolve(false);
      };
      this.socket!.onmessage = (event) => {
        this.handleIncomingData(event.data);
      };
    });
  }

  if (device.network.protocol === 'http') {
    // Para HTTP, no mantenemos conexión persistente; leemos bajo demanda
    return true;
  }

  // TCP directo no es posible desde el navegador; requiere proxy WebSocket en el backend o en local
  this.emit('onError', 'TCP directo no disponible desde el navegador. Configure un proxy WebSocket o use conexión HTTP.');
  return false;
}
```

**5. Implementar parseo de protocolos (`parseResponse`)**

```typescript
private parseResponse(raw: string, device: ScaleDevice): ScaleReading {
  const now = new Date().toISOString();
  const base: ScaleReading = { weight: 0, unit: device.weighing.unit, stable: false, timestamp: now, raw, error: null };

  try {
    switch (device.readProtocol) {
      case 'sics_mt': return this.parseSicsMT(raw, base);
      case 'cas': return this.parseCAS(raw, base);
      case 'epelsa': return this.parseEpelsa(raw, base);
      case 'dibal': return this.parseDibal(raw, base);
      case 'generic_ascii':
      case 'custom':
      default: return this.parseGenericAscii(raw, base, device);
    }
  } catch (err) {
    return { ...base, error: `Error parseando respuesta: ${err}` };
  }
}

private parseSicsMT(raw: string, base: ScaleReading): ScaleReading {
  // Formato SICS: "S S     12.345 kg\r\n"
  // S = stable, D = dynamic, + = overload, - = underload
  const match = raw.match(/([SD])\s+([SD+-])\s+([\d.]+)\s+(\w+)/);
  if (!match) return { ...base, error: 'Formato SICS no reconocido' };
  return { ...base, stable: match[1] === 'S', weight: parseFloat(match[3]), unit: match[4] as WeighUnit };
}

private parseGenericAscii(raw: string, base: ScaleReading, device: ScaleDevice): ScaleReading {
  if (device.parser.regex) {
    const re = new RegExp(device.parser.regex);
    const match = raw.match(re);
    if (!match) return { ...base, error: 'Regex no coincide con la respuesta' };
    let weightStr = match[device.parser.weightGroup] || '0';
    if (device.parser.decimalSeparator === ',') weightStr = weightStr.replace(',', '.');
    const unit = match[device.parser.unitGroup] as WeighUnit || device.weighing.unit;
    const stable = device.parser.stableIndicator ? raw.includes(device.parser.stableIndicator) : true;
    return { ...base, weight: parseFloat(weightStr), unit, stable };
  }
  // Fallback: buscar primer número en la cadena
  const numMatch = raw.match(/([+-]?\d+[.,]?\d*)/);
  if (!numMatch) return { ...base, error: 'No se encontró peso numérico en la respuesta' };
  let w = numMatch[1].replace(',', '.');
  return { ...base, weight: parseFloat(w), stable: true };
}
```

**6. Detección de disponibilidad de APIs**

```typescript
export function getScaleCapabilities(): {
  serialAvailable: boolean;
  bluetoothAvailable: boolean;
  networkAvailable: boolean;
  platform: 'desktop' | 'android' | 'ios' | 'unknown';
} {
  return {
    serialAvailable: 'serial' in navigator,
    bluetoothAvailable: 'bluetooth' in navigator,
    networkAvailable: true, // siempre disponible (HTTP/WS)
    platform: detectPlatform(),
  };
}
```

#### Criterios de aceptación
> **Nota auditoría:** `src/app/services/scaleService.ts` está implementado por completo (clase `ScaleService`, presets, capacidades). Los criterios con "funcional" se marcan a nivel de código; no se ha podido probar con hardware real.

- [x] Conexión USB/Serial funcional con Web Serial API en Chrome/Edge *(`connectSerial` con filtros vendorId)*
- [x] Conexión Bluetooth funcional con Web Bluetooth API *(`connectBluetooth` con notificaciones GATT)*
- [x] Conexión de red funcional con WebSocket y HTTP *(`connectNetwork`; TCP directo rechazado con mensaje)*
- [x] Parseo correcto de al menos 3 protocolos: SICS/MT, genérico ASCII, modo continuo *(además CAS, Epelsa y Dibal)*
- [x] Eventos `onWeightChange` y `onStableWeight` se emiten correctamente
- [x] Evento `onStatusChange` refleja el ciclo de vida de la conexión
- [x] Evento `onError` se emite ante fallos de comunicación
- [x] Comandos de tara y puesta a cero funcionan en protocolos que los soportan *(`tare()`/`zero()` con `tareSupported`)*
- [x] La clase detecta si la API necesaria no está disponible y lo comunica *(`getScaleCapabilities` + mensajes de error)*

---

### TICKET BAS-04: Frontend — Hook `useScale` para integración con componentes React

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** BAS-02, BAS-03

#### Contexto
Los componentes de TPV necesitan acceder al peso de forma reactiva. Un hook React encapsulará la lógica de conexión, lectura y estado del `ScaleService`, proporcionando una API limpia para cualquier vista de venta.

#### Tareas

**1. Crear `src/app/hooks/useScale.ts`**

```typescript
export interface UseScaleOptions {
  autoConnect?: boolean;     // Conectar automáticamente al montar (default: true)
  continuousReading?: boolean; // Lectura continua (default: según readMode del device)
  onStableWeight?: (reading: ScaleReading) => void; // Callback cuando el peso se estabiliza
}

export interface UseScaleReturn {
  // Estado
  status: ScaleStatus;
  isConnected: boolean;
  currentWeight: number;
  currentUnit: WeighUnit;
  isStable: boolean;
  lastReading: ScaleReading | null;
  error: string | null;
  scaleDevice: ScaleDevice | null;

  // Acciones
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  readWeight: () => Promise<ScaleReading>;
  tare: () => Promise<boolean>;
  zero: () => Promise<boolean>;
  acceptWeight: () => number;  // Captura el peso actual estable y lo devuelve

  // Info
  capabilities: ReturnType<typeof getScaleCapabilities>;
  hasScale: boolean;          // true si hay báscula asignada al terminal actual
}

export function useScale(
  userId: string,
  pdvId: string,
  terminalId: string,
  options?: UseScaleOptions
): UseScaleReturn {
  // 1. Al montar: obtener configuración de la báscula asignada al terminal
  //    → getTerminalScaleRequest(userId, pdvId, terminalId)
  // 2. Si hay báscula asignada y autoConnect: conectar automáticamente
  // 3. Exponer estado reactivo: weight, status, stable, error
  // 4. Gestionar reconexión automática si se pierde la conexión
  // 5. Al desmontar: desconectar limpiamente
}
```

**2. Lógica de reconexión automática**

```typescript
// Si la conexión se pierde:
// 1. Esperar 2s y reintentar
// 2. Si falla, esperar 5s y reintentar
// 3. Si falla 3 veces: emitir error y dejar de reintentar
// 4. Mostrar estado 'connecting' durante reintentos
```

**3. Gestión del peso "aceptado"**

```typescript
// acceptWeight(): captura el último peso estable y lo devuelve
// - Solo funciona si isStable === true
// - Si no es estable, muestra toast de aviso: "Espera a que el peso se estabilice"
// - Resetea el indicador visual tras aceptar (para que el operador sepa que se capturó)
```

**4. Caché de último dispositivo conectado**

Guardar en `localStorage` el ID del último `ScaleDevice` conectado exitosamente por terminal, para auto-reconectar al recargar la página sin volver a pedir permiso al usuario (Web Serial API permite reconexión a puertos previamente autorizados).

```typescript
const SCALE_CACHE_KEY = `scale_last_device_${terminalId}`;
```

**5. Compatibilidad con entrada manual**

Si `hasScale === false` (no hay báscula asignada), el hook devuelve un estado "sin báscula" que permite a los componentes caer automáticamente al input manual de peso. Esto mantiene retrocompatibilidad total.

#### Criterios de aceptación
> **Nota auditoría:** `src/app/hooks/useScale.ts` está implementado, pero **ningún componente lo consume** todavía (solo lo usa `ScaleWeightWidget`, que tampoco se monta en ninguna página).

- [x] El hook carga la configuración de la báscula del terminal al montar *(`getTerminalScaleRequest`)*
- [x] Auto-conexión funcional si hay báscula asignada
- [x] `currentWeight` se actualiza reactivamente con cada lectura
- [x] `isStable` refleja si la lectura es estable
- [x] `acceptWeight()` captura peso estable y lo devuelve
- [x] Reconexión automática con backoff ante pérdida de conexión *(`RECONNECT_DELAYS`)*
- [x] Si no hay báscula asignada, `hasScale === false` y los componentes usan input manual
- [x] Se limpia correctamente al desmontar (cierre de puerto, listeners)
- [x] Caché de último dispositivo para reconexión rápida *(localStorage por terminal)*

---

### TICKET BAS-05: Frontend — Widget de peso en el TPV (`ScaleWeightWidget`)

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** BAS-04

#### Contexto
El componente visual que muestra el peso actual de la báscula en la interfaz del TPV. Debe ser compacto pero legible, con indicadores de estado claros, y servir como punto de interacción principal del trabajador con la báscula.

#### Tareas

**1. Crear componente `ScaleWeightWidget`**

```typescript
interface ScaleWeightWidgetProps {
  userId: string;
  pdvId: string;
  terminalId: string;
  onWeightAccepted: (weight: number, unit: WeighUnit) => void;
  mode?: 'inline' | 'card' | 'compact'; // Modos de visualización
}
```

**2. Diseño del widget (modo `card` — principal)**

```
┌─────────────────────────────────────────┐
│ ⚖️  Báscula: Mostrador 1     ● Conectada │
│                                         │
│         1 . 2 3 4  kg                   │  ← Peso grande, fuente mono
│         ━━━━━━━━━━━━                    │  ← Barra de estabilidad
│                                         │
│  [Tara]  [Cero]  [✓ Aceptar peso]      │  ← Acciones
│                                         │
│  Modo: Automático ↻ | Manual ✎          │  ← Toggle modo captura
└─────────────────────────────────────────┘
```

**3. Estados visuales**

| Estado | Indicador | Fondo | Peso mostrado |
|---|---|---|---|
| Desconectada | ⚫ "Desconectada" | `bg-gray-50 dark:bg-gray-800` | `---.---` |
| Conectando | 🟡 "Conectando..." + spinner | `bg-amber-50 dark:bg-amber-900/20` | `---.---` |
| Conectada, peso 0 | 🟢 "Conectada" | `bg-white dark:bg-gray-900` | `0.000` |
| Leyendo (inestable) | 🟢 "Leyendo..." + parpadeo sutil | `bg-white` | Peso con opacidad reducida |
| Peso estable | 🟢 "Estable" | `bg-green-50 dark:bg-green-900/20` | **Peso en bold** |
| Error | 🔴 "Error: [mensaje]" | `bg-red-50 dark:bg-red-900/20` | Último peso conocido |
| Sin báscula | ⚪ "Sin báscula asignada" | `bg-gray-50` | Input manual |

**4. Fuente del peso**

- `font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace` (tabular-nums para que los dígitos no salten).
- Tamaño grande: `text-4xl` en modo card, `text-2xl` en modo inline, `text-lg` en modo compact.
- Color según estado: gris (leyendo), negro/blanco (estable), rojo (error).

**5. Barra de estabilidad**

Indicador visual tipo "barra de progreso" que muestra lo estable que está la lectura:
- Compara las últimas 5 lecturas.
- Si la variación es < 0.002 kg: barra al 100%, color verde → peso estable.
- Si la variación es 0.002–0.01: barra parcial, color amarillo.
- Si la variación es > 0.01: barra baja, color rojo.

**6. Modos de captura**

| Modo | Comportamiento |
|---|---|
| **Automático** | Al añadir un producto al ticket, captura el peso estable automáticamente |
| **Manual (con báscula)** | El trabajador pulsa "Aceptar peso" para capturar |
| **Manual (sin báscula)** | Input numérico estándar (comportamiento actual) |

Toggle entre automático y manual persistido en `localStorage`.

**7. Botones de acción**

- **Tara**: icono `RotateCcw`, tooltip "Poner a cero con recipiente", llama a `useScale.tare()`.
- **Cero**: icono `Target`, tooltip "Restablecer a cero", llama a `useScale.zero()`.
- **Aceptar peso**: icono `Check`, botón primario verde, solo habilitado si `isStable === true`, llama a `onWeightAccepted(weight, unit)`.
- **Conectar/Desconectar**: icono `Plug` / `PlugZap`, toggle de conexión.

**8. Modo `compact` (para barra lateral)**

Versión reducida para integrar en barras laterales del TPV:

```
⚖️ 1.234 kg ● [✓]
```

Solo muestra: icono, peso, indicador de estado, botón aceptar.

**9. Modo `inline` (para líneas de ticket)**

Versión mini para mostrar en cada línea de producto:

```
⚖️ 0.523 kg [Pesar]
```

Botón "Pesar" que captura una lectura puntual para esa línea.

#### Criterios de aceptación
> **Nota auditoría:** `src/app/components/saas/ScaleWeightWidget.tsx` está implementado con todo lo de abajo, pero **no se importa en ningún TPV** — el widget no aparece en ninguna pantalla real.

- [x] Widget muestra peso en tiempo real con fuente monoespaciada
- [x] Indicador de estado visible y claro (conectada, leyendo, estable, error)
- [x] Barra de estabilidad funcional *(`stabilityPercent` con colores verde/ámbar/rojo)*
- [x] Botón "Aceptar peso" solo habilitado cuando lectura estable *(toast "Espera a que el peso se estabilice")*
- [x] Tara y Cero funcionan (si el dispositivo lo soporta) *(+ atajos T y Ctrl+0)*
- [x] Tres modos de visualización: card, inline, compact
- [x] Toggle automático/manual persistido *(`scale_capture_mode` en localStorage)*
- [x] Si no hay báscula asignada, muestra input manual como fallback
- [ ] Responsive: funciona en PC táctil y tablet *(no verificable sin integración en páginas)*

---

### TICKET BAS-06: Frontend — Integración de báscula en TPV Carnicería (`WorkerTpvButcherShop`)

**Tipo:** Enhancement — Frontend  
**Prioridad:** Alta  
**Dependencias:** BAS-04, BAS-05

#### Contexto
`WorkerTpvButcherShop.tsx` es el vertical que más se beneficia de la báscula: vende por peso (kg) con `pesoKg` y `precioKg`. Actualmente usa un input manual (`pesoInput`). Necesitamos integrarlo con el hook `useScale` y el widget `ScaleWeightWidget` para que capture peso real desde el hardware.

#### Tareas

**1. Integrar `useScale` en `WorkerTpvButcherShop`**

```typescript
export function WorkerTpvButcherShop() {
  const { user } = useAuth();
  // Obtener PDV y terminal del contexto de sesión del trabajador
  const { pdvId, terminalId } = useWorkerSession();

  const scale = useScale(user?.id || '', pdvId, terminalId, {
    autoConnect: true,
    continuousReading: true,
    onStableWeight: (reading) => {
      if (captureMode === 'automatic' && selectedProduct) {
        addToTicketWithWeight(selectedProduct, reading.weight);
      }
    },
  });
  // ...
}
```

**2. Reemplazar input manual por widget de báscula**

Donde actualmente está:
```tsx
<input value={pesoInput} onChange={(e) => setPesoInput(e.target.value)} placeholder="Peso (kg)" />
```

Reemplazar por:
```tsx
{scale.hasScale ? (
  <ScaleWeightWidget
    userId={user.id}
    pdvId={pdvId}
    terminalId={terminalId}
    onWeightAccepted={(weight) => setPesoInput(String(weight))}
    mode="card"
  />
) : (
  <input value={pesoInput} onChange={(e) => setPesoInput(e.target.value)} placeholder="Peso (kg)" />
)}
```

**3. Flujo de venta con báscula (modo manual)**

1. Trabajador coloca producto en la báscula.
2. El widget muestra el peso en tiempo real.
3. Cuando se estabiliza → indicador verde + botón "Aceptar peso" habilitado.
4. Trabajador selecciona el producto del catálogo.
5. Se crea la línea de ticket con `pesoKg = peso aceptado`, `total = pesoKg × precioKg`.

**4. Flujo de venta con báscula (modo automático)**

1. Trabajador coloca producto en la báscula.
2. El peso se estabiliza.
3. Trabajador toca el producto en el catálogo.
4. Automáticamente se crea la línea con el peso estable capturado.
5. Toast de confirmación: "Chuletón — 1.234 kg — 30,73 €".
6. El trabajador retira el producto, el peso vuelve a ~0, listo para el siguiente.

**5. Permitir ajuste manual posterior**

Aunque el peso se capture de la báscula, el trabajador puede editarlo manualmente (tap en el peso de la línea de ticket → se abre input de edición). Esto es necesario para correcciones.

**6. Indicador visual en línea de ticket**

En cada línea del ticket, mostrar un icono que indique el origen del peso:
- ⚖️ si fue capturado de la báscula.
- ✎ si fue introducido manualmente.

```typescript
interface TicketLine {
  // ... campos existentes ...
  weightSource: 'scale' | 'manual';  // NUEVO
  scaleDeviceId?: string;            // NUEVO — ref al dispositivo
  scaleReadingTimestamp?: string;     // NUEVO — cuándo se capturó
}
```

#### Criterios de aceptación
> **Nota auditoría:** NO implementado. `WorkerTpvButcherShop.tsx` sigue usando input manual `pesoInput` sin `useScale` ni `ScaleWeightWidget`.

- [ ] Si hay báscula asignada, el widget la muestra y captura peso real
- [ ] Si no hay báscula, se mantiene el input manual (retrocompatibilidad total) *(es el único modo que existe)*
- [ ] Modo automático: al tocar producto, captura peso estable y crea línea
- [ ] Modo manual: se captura peso con botón "Aceptar" antes de seleccionar producto
- [ ] Se puede editar el peso manualmente tras capturar de la báscula
- [ ] Cada línea de ticket indica si el peso es de báscula o manual
- [ ] El total se recalcula automáticamente al aceptar peso *(existe `total = peso × precioKg` solo con entrada manual)*
- [ ] Funciona en PC táctil y tablet

---

### TICKET BAS-07: Frontend — Integración de báscula en TPV genérico y otros verticales

**Tipo:** Enhancement — Frontend  
**Prioridad:** Alta  
**Dependencias:** BAS-04, BAS-05

#### Contexto
La báscula no es exclusiva de la carnicería. Otros verticales que venden por peso (frutería, pescadería, granel, farmacia, etc.) y el TPV genérico también necesitan soporte. Además, el componente `TpvTab.tsx` (TPV de sala/locales) debe poder usar la báscula.

#### Tareas

**1. Integrar en `WorkerTpv.tsx` (selector de vertical)**

Pasar la info de báscula como contexto a todos los componentes de vertical:

```typescript
// En WorkerTpv.tsx, obtener la báscula del terminal activo
const scale = useScale(userId, pdvId, terminalId, { autoConnect: true });

// Pasarla al componente del vertical
<WorkerTpvButcherShop scale={scale} />
<WorkerTpvDelivery scale={scale} />
<WorkerTpvSales scale={scale} />
// etc.
```

Alternativamente, usar un `ScaleContext` provider:

```typescript
export const ScaleContext = createContext<UseScaleReturn | null>(null);

export function ScaleProvider({ children, userId, pdvId, terminalId }: ScaleProviderProps) {
  const scale = useScale(userId, pdvId, terminalId, { autoConnect: true });
  return <ScaleContext.Provider value={scale}>{children}</ScaleContext.Provider>;
}

export function useScaleContext() {
  return useContext(ScaleContext);
}
```

**2. Detectar automáticamente qué productos necesitan peso**

Basarse en la configuración del catálogo vertical (`useVerticalCatalog`):

- Si la unidad de medida del producto es `kg`, `g` o `lb` → el producto requiere peso.
- Si la unidad es `ud`, `h`, `l` o similar → el producto NO requiere peso; se vende por cantidad.
- Si el producto tiene `sellByWeight: true` (campo nuevo en `catalog_item`) → siempre requiere peso.

**3. Flujo condicional al añadir producto al ticket**

```typescript
function addToTicket(product: CatalogItem) {
  if (productRequiresWeight(product)) {
    if (scale.hasScale && scale.isStable && captureMode === 'automatic') {
      // Capturar peso automáticamente
      addLineWithWeight(product, scale.currentWeight);
    } else if (scale.hasScale) {
      // Mostrar prompt: "Coloca el producto y pulsa Aceptar"
      setWeighingProduct(product);
      setShowWeighDialog(true);
    } else {
      // Sin báscula: mostrar input manual de peso
      setWeighingProduct(product);
      setShowManualWeightInput(true);
    }
  } else {
    // Producto por unidad: añadir con qty = 1
    addLineByQuantity(product, 1);
  }
}
```

**4. Diálogo de pesaje (`WeighProductDialog`)**

Modal que aparece cuando se necesita pesar un producto y el modo no es automático:

```
┌──────────────────────────────────────┐
│         Pesar: Chuletón              │
│                                      │
│    ⚖️  [ 1.234 kg ] ● Estable       │  ← Widget de peso
│    ━━━━━━━━━━━━━━━━━━━━━━━━         │
│                                      │
│    Precio/kg: 24,90 €                │
│    Total:     30,73 €                │  ← Se recalcula en vivo
│                                      │
│  [Cancelar]        [✓ Aceptar peso]  │
└──────────────────────────────────────┘
```

**5. Añadir campo `sellByWeight` al catálogo**

En `catalog_item`, nuevo campo booleano opcional:
- `sellByWeight: boolean` — default `false`.
- Si `true`, el producto se vende por peso independientemente de su unidad.
- Editable desde el formulario de catálogo.

**6. Integrar en `TpvTab.tsx` (TPV de sala/locales)**

`TpvTab.tsx` (1787 líneas) gestiona la venta en locales. Integrar la báscula de la misma forma:
- Obtener báscula del terminal de la sesión activa.
- Al añadir producto que requiere peso → mostrar diálogo de pesaje.
- Registrar `weightSource` en cada línea.

#### Criterios de aceptación
> **Nota auditoría:** NO implementado. No existe `ScaleContext`, ni `sellByWeight` en `catalog_item`, ni `WeighProductDialog`.

- [ ] `ScaleContext` disponible en todos los componentes de TPV
- [ ] Detección automática de productos que requieren peso según unidad de medida
- [ ] Campo `sellByWeight` en `catalog_item` para forzar venta por peso
- [ ] Diálogo de pesaje con precio y total en tiempo real
- [ ] Funciona en todos los verticales: carnicería, delivery, genérico, sala
- [ ] Si el producto no requiere peso, la báscula no interviene
- [ ] Retrocompatibilidad total: sin báscula, todo funciona como antes

---

### TICKET BAS-08: Backend — Trazabilidad del pesaje en líneas de venta

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** BAS-01, BAS-06

#### Contexto
Para cumplir con normativas de trazabilidad (especialmente en alimentación) y para auditoría interna, cada pesaje realizado durante una venta debe quedar registrado con todos los metadatos relevantes: peso exacto, dispositivo utilizado, timestamp de la lectura, y si fue captura automática o manual.

#### Tareas

**1. Ampliar los ítems de pedido en delivery (`DeliveryOrderItem`)**

En `buildDeliveryOrderDocument` y en `deliveryApi.ts`, añadir campos opcionales:

```typescript
export interface WeightTraceData {
  weight: number;              // Peso capturado
  unit: WeighUnit;             // 'kg' | 'g' | 'lb'
  weightSource: 'scale' | 'manual'; // Fuente de la lectura
  scaleDeviceId?: string;      // ID del dispositivo que leyó (si source === 'scale')
  scaleDeviceName?: string;    // Nombre desnormalizado
  readingTimestamp?: string;   // ISO — momento exacto de la lectura del hardware
  stable: boolean;             // Si la lectura era estable al capturar
  rawReading?: string;         // Respuesta cruda del dispositivo (para auditoría)
  pricePerUnit: number;        // Precio por kg/g/lb al momento de la venta
  calculatedTotal: number;     // weight × pricePerUnit
}

// Añadir a DeliveryOrderItem:
export interface DeliveryOrderItem {
  // ... campos existentes ...
  weightTrace?: WeightTraceData;  // Solo presente si el producto se vendió por peso
}
```

**2. Ampliar el ticket de carnicería (`TicketLine` en `WorkerTpvButcherShop`)**

Cuando se persistan las ventas de carnicería en el servidor (actualmente son solo locales), incluir `weightTrace` en cada línea.

**3. Ampliar las líneas de venta en sala (`DiningOrderItem`)**

Si el módulo de sala (SALA-MESAS-TICKETS) está implementado, añadir `weightTrace` opcional a `DiningOrderItem`.

**4. Documento de auditoría de pesaje (`scale_weight_log`)**

Para trazabilidad completa, opcionalmente crear un log independiente:

```javascript
function buildScaleWeightLogDocument(userId, data) {
  return {
    _id: `scale_weight_log:${crypto.randomUUID()}`,
    type: 'scale_weight_log',
    user_id: userId,

    scaleDeviceId: data.scaleDeviceId,
    scaleDeviceName: data.scaleDeviceName,
    terminalId: data.terminalId,
    pdvId: data.pdvId,
    pdvName: data.pdvName,

    weight: data.weight,
    unit: data.unit,
    stable: data.stable,
    rawReading: data.rawReading,

    // Vinculación con venta
    saleType: data.saleType,         // 'delivery_order' | 'tpv_sale' | 'dining_order'
    saleId: data.saleId,             // ID del pedido/venta
    lineId: data.lineId,             // ID de la línea dentro del pedido
    productId: data.productId,
    productName: data.productName,

    operatorId: data.operatorId,
    operatorName: data.operatorName,

    createdAt: new Date().toISOString(),
  };
}
```

**5. Endpoint de consulta de log de pesajes**

```javascript
deliveryRouter.get('/scale-weight-logs/:userId', listScaleWeightLogs);
// Query params: from, to, scaleDeviceId, productId, operatorId, saleId
```

**6. Cliente TypeScript**

```typescript
export interface ScaleWeightLog { /* campos del documento */ }

export async function listScaleWeightLogsRequest(
  userId: string,
  params?: { from?: string; to?: string; scaleDeviceId?: string; productId?: string }
): Promise<ScaleWeightLog[]>;
```

#### Criterios de aceptación
> **Nota auditoría:** solo existe el tipo `WeightTraceData` en `deliveryApi.ts`; no se usa en `DeliveryOrderItem`, no se persiste, y no existe `scale_weight_log` ni su endpoint.

- [ ] Cada línea de venta con peso incluye `weightTrace` con todos los metadatos
- [ ] El log de auditoría `scale_weight_log` se crea por cada pesaje
- [ ] El log es consultable por rango de fechas, dispositivo, producto y operador
- [ ] Se registra si la lectura fue estable o inestable
- [ ] Se guarda la respuesta cruda del dispositivo
- [ ] Retrocompatibilidad: líneas sin `weightTrace` siguen funcionando

---

### TICKET BAS-09: Backend — Alertas de báscula

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** BAS-01, BAS-02

#### Contexto
El motor de alertas debe detectar problemas con las básculas para que el gerente pueda actuar rápidamente. Las alertas deben cubrir: báscula desconectada, peso inválido, lectura interrumpida y báscula no asignada a un TPV activo.

#### Tareas

**1. Alertas emitidas en tiempo real (SSE) desde el frontend**

Estas alertas se generan en el frontend (donde está la conexión con el hardware) y se envían al backend para persistir y distribuir:

**a. Báscula desconectada (`scale_disconnected`)**

El frontend detecta la desconexión (evento `onStatusChange` → `'disconnected'` o `'error'`):

```javascript
// Nuevo endpoint para reportar estado de báscula
deliveryRouter.post('/scale-devices/:userId/:deviceId/status', reportScaleStatus);
```

Body: `{ status: 'connected' | 'disconnected' | 'error', message?: string, terminalId: string, pdvId: string }`

Al recibir `disconnected` o `error`:
- Crear notificación tipo `scale_disconnected`, nivel `warning`.
- Mensaje: "Báscula '{name}' desconectada en {terminalName} ({pdvName})".
- Emitir SSE `scale:status_changed` al gerente.
- Ruta: `/saas/tpv?tab=dispositivos`.

**b. Peso inválido (`scale_invalid_weight`)**

El frontend detecta lectura fuera de rango (peso negativo, supera `maxWeight`, lectura NaN):

```javascript
deliveryRouter.post('/scale-devices/:userId/:deviceId/alert', reportScaleAlert);
```

Body: `{ alertType: 'invalid_weight' | 'reading_interrupted' | 'communication_error', weight?: number, message: string, terminalId: string }`

Al recibir `invalid_weight`:
- Crear notificación tipo `scale_invalid_weight`, nivel `warning`.
- Mensaje: "Peso inválido ({weight} kg) en báscula '{name}'. Verificar dispositivo."
- Emitir SSE al puesto y al gerente.

**c. Lectura interrumpida (`scale_reading_interrupted`)**

Si durante una venta activa (producto seleccionado, esperando peso) la báscula pierde conexión o deja de responder por > 5 segundos:
- Crear notificación tipo `scale_reading_interrupted`, nivel `alert`.
- Mensaje: "Lectura de báscula interrumpida durante venta en {terminalName}."
- Emitir SSE al puesto.

**2. Alertas periódicas del motor (`alertEngine.js`)**

**d. Báscula no asignada al TPV (`scale_unassigned`)**

```javascript
async function checkUnassignedScales(userId) {
  // Buscar scale_device activos
  // Buscar point_of_sale activos con terminals
  // Si hay básculas activas que no están asignadas a ningún terminal → alerta
  // Nivel: info
  // Mensaje: "Báscula '{name}' no está asignada a ningún puesto de venta"
}
```

**e. Terminal sin báscula en vertical que la requiere (`scale_missing_for_vertical`)**

```javascript
async function checkScaleMissingForVertical(userId) {
  // Si el businessType es carnicería, pescadería, frutería u otro que requiere peso
  // Y hay terminales activos sin scaleDeviceId
  // → alerta informativa
  // Nivel: info
  // Mensaje: "Terminal '{terminalName}' en '{pdvName}' no tiene báscula asignada (recomendado para {vertical})"
}
```

**3. Registrar alertas en `alertEngine.js`**

```javascript
const scaleChecks = [
  checkUnassignedScales,
  checkScaleMissingForVertical,
];
// Solo ejecutar si el negocio tiene scale_device registrados
```

**4. Configuración en settings de alertas**

Nuevos campos en la configuración de alertas del negocio:

```typescript
export interface ScaleAlertConfig {
  scaleDisconnectedEnabled: boolean;      // Default: true
  scaleInvalidWeightEnabled: boolean;     // Default: true
  scaleReadingInterruptedEnabled: boolean; // Default: true
  scaleUnassignedEnabled: boolean;        // Default: true
  scaleMissingForVerticalEnabled: boolean; // Default: false (solo recomendación)
}
```

#### Criterios de aceptación
> **Nota auditoría:** existe el endpoint `POST /scale-devices/:userId/:deviceId/status` (`reportScaleStatus`), que emite el evento SSE `scale:status_changed` pero **no crea notificación persistente**. Aparte, `butcherAlertEngine.js` emite `butcher_scale_disconnected` cada 5 min basándose en el ping de básculas del módulo carnicería (`butcher_scale_status`), no en `scale_device`. El resto de alertas no existe.

- [ ] Alerta `scale_disconnected` se genera cuando el frontend reporta desconexión *(solo evento SSE, sin notificación)*
- [ ] Alerta `scale_invalid_weight` se genera con lecturas fuera de rango *(no existe el endpoint `/alert`)*
- [ ] Alerta `scale_reading_interrupted` se genera si se pierde lectura durante venta
- [ ] Alerta `scale_unassigned` se genera periódicamente si hay básculas sin asignar
- [ ] Alerta `scale_missing_for_vertical` se genera para verticales que necesitan peso
- [ ] Todas las alertas son configurables (on/off) por negocio
- [ ] Las alertas en tiempo real llegan por SSE al gerente y al puesto afectado *(solo `scale:status_changed` y `scale:assignment_changed`)*
- [ ] Las alertas periódicas se deduplicaciones correctamente (1 por día) *(solo la de carnicería, con dedup de 30 min)*
- [ ] Ruta de navegación correcta en cada alerta

---

### TICKET BAS-10: Frontend — Pantalla de configuración de básculas (Perfil Gerente)

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** BAS-01, BAS-02

#### Contexto
El gerente necesita una interfaz para registrar básculas, configurar sus parámetros de conexión, probar la comunicación y asignarlas a terminales/puestos de venta. Esta pantalla debe ser accesible desde la configuración del TPV.

#### Tareas

**1. Crear sección "Dispositivos de pesaje" en la configuración del TPV**

Ubicar dentro de la página TPV (`TpvPage.tsx`) o en Settings, como una nueva pestaña/sección:

```
/saas/tpv?tab=dispositivos  o  /saas/settings?tab=dispositivos
```

**2. Vista principal: listado de básculas**

```
┌─────────────────────────────────────────────────────────┐
│ ⚖️ Dispositivos de pesaje                    [+ Nueva]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Báscula Mostrador 1              ● Activa        │   │
│  │ Epelsa Neptune | USB/Serial | 9600 bps           │   │
│  │ Asignada a: Caja 1 — Local Centro                │   │
│  │                        [Probar] [Editar] [Borrar]│   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Báscula Bluetooth                ○ Sin asignar   │   │
│  │ CAS SW-1S | Bluetooth BLE                        │   │
│  │ Sin terminal asignado                            │   │
│  │                        [Probar] [Editar] [Borrar]│   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Báscula Red Almacén              ● Activa        │   │
│  │ Mettler Toledo ICS465 | Red TCP/IP | 192.168.1.50│   │
│  │ Asignada a: Caja 2 — Sucursal Norte              │   │
│  │                        [Probar] [Editar] [Borrar]│   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**3. Formulario de creación/edición de báscula**

Modal o página con los siguientes pasos (wizard):

**Paso 1 — Datos básicos:**
- Nombre (obligatorio).
- Marca/modelo: selector con presets (BAS-01) + opción "Otra marca".
- Al seleccionar un preset, se pre-rellenan todos los parámetros técnicos.
- Número de serie (opcional).
- Notas (opcional).

**Paso 2 — Tipo de conexión:**
- Radio buttons: USB/Serial | Bluetooth | Red.
- Según la selección, mostrar los campos relevantes:
  - **USB/Serial**: baudRate (select: 2400/4800/9600/19200/38400/57600/115200), dataBits, stopBits, parity, flow control, vendorId, productId.
  - **Bluetooth**: deviceName, serviceUuid, characteristicUuid.
  - **Red**: host, port, protocol (tcp/ws/http), path.
- Indicador de compatibilidad del navegador: "✓ Web Serial disponible" o "✗ Tu navegador no soporta USB/Serial. Usa Chrome o Edge."

**Paso 3 — Protocolo de lectura:**
- Protocolo: select con opciones (sics_mt, cas, epelsa, dibal, generic_ascii, continuous, custom).
- Modo de lectura: on_demand / continuous.
- Comando de lectura (si on_demand).
- Intervalo de lectura (si continuous).
- Si "custom": campos de regex, grupos de captura, separador decimal, indicador de estabilidad.

**Paso 4 — Configuración de pesaje:**
- Unidad (kg/g/lb).
- Peso máximo y mínimo.
- Precisión (decimales).
- Soporta tara (toggle) + comando de tara.
- Soporta puesta a cero (toggle) + comando de cero.

**Paso 5 — Probar conexión:**
- Botón "Probar conexión" que ejecuta `ScaleService.connect()` y `ScaleService.readWeight()`.
- Resultado visual:
  - ✅ "Conexión exitosa. Peso leído: 0.000 kg"
  - ❌ "Error: No se pudo abrir el puerto serial. Verifica la conexión USB."
- Si la prueba falla, permitir volver atrás a ajustar parámetros.

**4. Asignación de báscula a terminal**

Desde la edición de un Punto de Venta (`PointOfSale`), en la configuración de cada terminal:
- Nuevo campo "Báscula": selector desplegable con las básculas activas no asignadas a otro terminal del mismo PDV + la opción "Ninguna".
- Al seleccionar, se actualiza `scaleDeviceId` y `scaleName`.

También accesible desde la card de la báscula: botón "Asignar a terminal" → selector de PDV + terminal.

**5. Restricción por rol**

- Solo usuarios con rol Admin o Gerente pueden acceder a esta sección.
- Trabajadores no ven la pestaña de dispositivos.

**6. Componentes a crear**

| Componente | Descripción |
|---|---|
| `ScaleDeviceList.tsx` | Listado de básculas con acciones |
| `ScaleDeviceForm.tsx` | Wizard de creación/edición (5 pasos) |
| `ScaleConnectionTest.tsx` | Componente de prueba de conexión |
| `ScaleAssignmentSelector.tsx` | Selector de asignación a terminal |

#### Criterios de aceptación
> **Nota auditoría:** NO implementado. No existen `ScaleDeviceList.tsx`, `ScaleDeviceForm.tsx`, `ScaleConnectionTest.tsx` ni `ScaleAssignmentSelector.tsx`, ni pestaña de dispositivos en TPV/Settings. La API backend sí está lista para soportar esta pantalla.

- [ ] Listado de básculas con estado visual (activa, sin asignar, asignada)
- [ ] Wizard de creación con presets que pre-rellenan campos
- [ ] Los campos técnicos se muestran según tipo de conexión seleccionado
- [ ] Prueba de conexión funcional que lee un peso real del dispositivo
- [ ] Asignación a terminal desde la báscula o desde la edición del PDV
- [ ] Solo accesible para Admin/Gerente
- [ ] Indicador de compatibilidad del navegador
- [ ] Validación de todos los campos obligatorios

---

### TICKET BAS-11: Automatización — Recalcular total al recibir peso

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** BAS-06, BAS-07

#### Contexto
Cuando la báscula envía un peso, el total de la línea de ticket y del ticket completo deben recalcularse automáticamente en tiempo real. Esto ya ocurre en carnicería de forma manual (`total = pesoKg × precioKg`), pero necesita funcionar automáticamente con datos de la báscula y en todos los contextos de venta.

#### Tareas

**1. Recalcular línea de ticket al aceptar peso**

Al capturar peso (automático o manual):
```typescript
function addLineWithWeight(product: CatalogItem, weight: number) {
  const pricePerUnit = product.pricePerKg || product.price; // precio/kg o precio/unidad
  const total = +(weight * pricePerUnit).toFixed(2);

  addLine({
    productId: product._id,
    name: product.name,
    quantity: 1,
    weight,
    unit: 'kg',
    pricePerUnit,
    total,
    weightTrace: {
      weight,
      unit: 'kg',
      weightSource: scale.hasScale ? 'scale' : 'manual',
      scaleDeviceId: scale.scaleDevice?._id,
      scaleDeviceName: scale.scaleDevice?.name,
      readingTimestamp: new Date().toISOString(),
      stable: scale.isStable,
      pricePerUnit,
      calculatedTotal: total,
    },
  });
}
```

**2. Actualizar peso de línea existente (re-pesaje)**

Si el trabajador necesita volver a pesar un producto ya en el ticket:
- Tap en la línea → opción "Re-pesar".
- Se activa la báscula para esa línea específica.
- Al aceptar el nuevo peso → se recalcula el total de la línea y del ticket.
- El `weightTrace` se actualiza con la nueva lectura.

**3. Recalcular total del ticket en cascada**

```typescript
const ticketTotal = useMemo(() => {
  return lines.reduce((sum, line) => sum + line.total, 0);
}, [lines]);
```

Esto ya existe en carnicería; asegurar que está implementado en todos los TPV que usen peso.

**4. Mostrar desglose de peso en el ticket**

En el resumen del ticket (antes de cobrar):
```
────────────────────────────────────
  Chuletón de ternera        ⚖️
  1.234 kg × 24,90 €/kg  = 30,73 €
────────────────────────────────────
  Solomillo                   ⚖️
  0.856 kg × 32,50 €/kg  = 27,82 €
────────────────────────────────────
  Pan de hogaza (1 ud)        ✎
  1 × 3,50 €             =  3,50 €
────────────────────────────────────
  Peso total: 2.090 kg
  TOTAL:                    62,05 €
```

**5. Validaciones al recalcular**

- Si el peso es 0 o negativo → no permitir añadir línea, mostrar error.
- Si el peso supera `maxWeight` del dispositivo → advertencia (puede ser error de lectura).
- Si el peso × precio genera un total > umbral configurable (ej: 500 €) → confirmación al trabajador ("¿Estás seguro? Total = 523,40 €").

#### Criterios de aceptación
> **Nota auditoría:** depende de BAS-06/07 (sin hacer). En carnicería el recálculo `total = peso × precioKg` y el peso total del ticket ya funcionan con entrada manual.

- [ ] Al aceptar peso, la línea se crea con total = peso × precio/kg *(solo con input manual en carnicería)*
- [ ] Al re-pesar, la línea se actualiza y el total se recalcula
- [x] El total del ticket se actualiza en cascada *(en `WorkerTpvButcherShop`)*
- [ ] El resumen muestra desglose de peso por línea
- [x] Se muestra el peso total del ticket *(`ticketWeight` en carnicería)*
- [ ] Validaciones de peso ≤ 0, peso > maxWeight, total > umbral *(solo peso > 0)*
- [ ] Funciona en carnicería, TPV genérico, sala y delivery

---

### TICKET BAS-12: Backend — Registrar peso vendido por línea de ticket

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** BAS-08

#### Contexto
Al completar una venta, el peso de cada línea debe persistirse en el servidor vinculado al ticket/pedido. Esto permite reportes de "kg vendidos", trazabilidad sanitaria y conciliación de stock por peso.

#### Tareas

**1. Persistir `weightTrace` al crear/actualizar pedidos**

En los endpoints existentes de creación de pedidos (delivery, sala, TPV):
- `buildDeliveryOrderDocument`: preservar `weightTrace` en cada item del array `items[]`.
- Sanitizar: validar que `weight > 0`, `unit` es válido, `pricePerUnit > 0`.

**2. Nuevo endpoint: resumen de peso vendido**

```javascript
deliveryRouter.get('/weight-summary/:userId', getWeightSummary);
```

Query params: `from`, `to`, `productId`, `pdvId`, `operatorId`.

Respuesta:
```json
{
  "ok": true,
  "summary": {
    "totalWeight": 245.678,
    "totalRevenue": 4532.10,
    "unit": "kg",
    "byProduct": [
      { "productId": "...", "name": "Chuletón", "totalWeight": 45.2, "totalRevenue": 1125.48, "avgPricePerKg": 24.90 },
      { "productId": "...", "name": "Solomillo", "totalWeight": 22.8, "totalRevenue": 741.00, "avgPricePerKg": 32.50 }
    ],
    "byDay": [
      { "date": "2026-04-14", "totalWeight": 35.4, "totalRevenue": 678.90 }
    ],
    "byOperator": [
      { "operatorId": "...", "name": "Juan", "totalWeight": 120.5 }
    ]
  }
}
```

**3. Conexión con Stock: restar stock en kg**

Si el módulo de stock está activo (COMPRAS-STOCK-TICKETS CS-04):
- Al completar una venta con productos por peso:
  - Registrar movimiento de stock con `quantity = weight` en la unidad correspondiente.
  - `movementType: 'sale'`, `referenceType: 'tpv_sale' | 'delivery_order' | 'dining_order'`.
- Si `allowNegativeStock === false` y no hay stock suficiente en kg → rechazar o advertir.

**4. Cliente TypeScript**

```typescript
export interface WeightSummary {
  totalWeight: number;
  totalRevenue: number;
  unit: WeighUnit;
  byProduct: Array<{ productId: string; name: string; totalWeight: number; totalRevenue: number; avgPricePerKg: number }>;
  byDay: Array<{ date: string; totalWeight: number; totalRevenue: number }>;
  byOperator: Array<{ operatorId: string; name: string; totalWeight: number }>;
}

export async function getWeightSummaryRequest(
  userId: string, params?: { from?: string; to?: string; productId?: string; pdvId?: string }
): Promise<WeightSummary>;
```

#### Criterios de aceptación
> **Nota auditoría:** NO implementado. No hay persistencia de `weightTrace`, ni endpoint `/weight-summary`, ni descuento de stock por peso vinculado a pesajes.

- [ ] `weightTrace` se persiste correctamente en cada línea del pedido
- [ ] El resumen de peso vendido funciona con filtros de fecha, producto, PDV y operador
- [ ] Desglose por producto, por día y por operador
- [ ] Se descuenta stock en kg al completar la venta (si módulo stock activo)
- [ ] Validación: no se persisten líneas con peso ≤ 0

---

### TICKET BAS-13: Frontend — Pantalla de trabajador (uso sin configuración)

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** BAS-05, BAS-06

#### Contexto
El trabajador debe poder usar la báscula desde el TPV de forma transparente, sin necesidad de entrar en configuración. La báscula se conecta automáticamente al abrir el TPV si hay un dispositivo asignado a su terminal.

#### Tareas

**1. Auto-conexión al abrir el TPV**

Cuando el trabajador abre `/saas/worker/tpv`:
1. Detectar PDV y terminal de la sesión activa.
2. Consultar si hay báscula asignada → `getTerminalScaleRequest`.
3. Si hay báscula → conectar automáticamente (si el navegador ya tiene permiso).
4. Si no tiene permiso previo → mostrar banner discreto: "Báscula disponible. [Conectar]".
5. Si no hay báscula → no mostrar nada (modo manual transparente).

**2. Banner de estado de báscula (siempre visible)**

En la parte superior del TPV del trabajador, barra fina:

```
┌─────────────────────────────────────────────────┐
│ ⚖️ Báscula Mostrador 1 ● Conectada   1.234 kg  │
└─────────────────────────────────────────────────┘
```

Si hay error:
```
┌─────────────────────────────────────────────────┐
│ ⚖️ Báscula desconectada ⚠️     [Reintentar]     │
└─────────────────────────────────────────────────┘
```

Si no hay báscula asignada: no mostrar barra.

**3. Permisos del navegador**

La primera vez que se conecta una báscula USB, el navegador pide permiso (Web Serial API).
- Mostrar instrucciones claras: "Selecciona el puerto USB de la báscula en el diálogo que aparece."
- Una vez concedido, el permiso persiste (Chrome recuerda puertos autorizados).
- Para Bluetooth: "Selecciona tu báscula de la lista de dispositivos."

**4. Manejo de errores para el trabajador**

Mensajes claros y accionables:

| Situación | Mensaje | Acción |
|---|---|---|
| Báscula no detectada | "No se detecta la báscula. Verifica que está encendida y conectada." | Botón "Reintentar" |
| Permiso denegado | "Permiso de acceso denegado. Pulsa Conectar y selecciona el dispositivo." | Botón "Conectar" |
| Navegador no compatible | "Tu navegador no soporta conexión USB. Usa Google Chrome." | — |
| Lectura interrumpida | "Se perdió la comunicación con la báscula. Reintentando..." | Auto-reconexión |
| Peso inestable prolongado | "El peso no se estabiliza. Verifica que el producto está bien colocado." | — |

**5. Accesos directos para el trabajador**

- **Tecla T**: ejecutar tara (si soportada).
- **Tecla 0**: ejecutar puesta a cero.
- **Tecla Enter**: aceptar peso actual (si estable).
- **Tecla Escape**: cancelar pesaje en curso.

Estos atajos deben estar documentados en un tooltip del widget.

#### Criterios de aceptación
> **Nota auditoría:** las piezas existen en `useScale`/`ScaleWeightWidget` (auto-conexión, reconexión, atajos T/Ctrl+0/Enter), pero al no estar integradas en el TPV del trabajador nada de esto es visible en la aplicación.

- [ ] La báscula se conecta automáticamente al abrir el TPV (si tiene permiso previo) *(la lógica existe en el hook, sin integrar en el TPV)*
- [ ] Banner de estado visible pero discreto
- [ ] Primera conexión guía al trabajador por el diálogo del navegador
- [ ] Mensajes de error claros y accionables
- [ ] Atajos de teclado funcionales (T=tara, 0=cero, Enter=aceptar) *(implementados en el widget, no montado)*
- [x] Si no hay báscula asignada, la experiencia es idéntica a la actual (transparente)
- [ ] Reconexión automática ante pérdida de comunicación *(implementada en el hook, sin integrar)*

---

## Resumen de dependencias

```
BAS-01 (Modelo scale_device)
  ├── BAS-02 (Asignación a terminal)
  │     └── BAS-04 (Hook useScale)
  │           ├── BAS-05 (Widget de peso)
  │           │     ├── BAS-06 (Integración carnicería)
  │           │     ├── BAS-07 (Integración genérica TPV)
  │           │     └── BAS-13 (Pantalla trabajador)
  │           └── BAS-11 (Recalcular total)
  ├── BAS-03 (ScaleService hardware)
  │     └── BAS-04
  ├── BAS-08 (Trazabilidad pesaje)
  │     └── BAS-12 (Peso por línea de ticket)
  ├── BAS-09 (Alertas)
  └── BAS-10 (Configuración gerente)
```

## Orden de implementación recomendado

| Fase | Tickets | Descripción | Estimación |
|------|---------|-------------|------------|
| **Fase 1 — Modelo y hardware** | BAS-01, BAS-03 | Entidad de báscula + servicio de comunicación con hardware | Semana 1-2 |
| **Fase 2 — Conexión TPV** | BAS-02, BAS-04, BAS-05 | Asignación a terminales + hook React + widget de peso | Semana 3-4 |
| **Fase 3 — Integración vertical** | BAS-06, BAS-07, BAS-11 | Carnicería + genérico + recalcular totales | Semana 5-6 |
| **Fase 4 — Trazabilidad** | BAS-08, BAS-12 | Datos de pesaje en tickets + resumen de peso vendido | Semana 7 |
| **Fase 5 — Config y alertas** | BAS-09, BAS-10 | Alertas de hardware + pantalla de configuración del gerente | Semana 8-9 |
| **Fase 6 — Experiencia trabajador** | BAS-13 | Auto-conexión, errores claros, atajos de teclado | Semana 10 |

---

## Notas técnicas

### Web Serial API — Compatibilidad

| Navegador | Soporte | Notas |
|---|---|---|
| Chrome 89+ | ✅ Completo | Requiere HTTPS o localhost |
| Edge 89+ | ✅ Completo | Basado en Chromium |
| Opera 76+ | ✅ Completo | Basado en Chromium |
| Firefox | ❌ No soportado | Sin planes actuales |
| Safari | ❌ No soportado | Sin planes actuales |
| Chrome Android | ⚠️ Parcial | Solo con USB OTG |
| WebView Android (Capacitor) | ⚠️ | Requiere plugin nativo para serial |

### Web Bluetooth API — Compatibilidad

| Navegador | Soporte | Notas |
|---|---|---|
| Chrome 56+ | ✅ Completo | Requiere HTTPS o localhost |
| Edge 79+ | ✅ Completo | Basado en Chromium |
| Firefox | ❌ No soportado | — |
| Safari | ❌ No soportado (macOS) | — |
| Safari iOS | ❌ No soportado | — |
| Chrome Android | ✅ Completo | BLE disponible |
| Capacitor Android | ✅ | Via plugin nativo o Web Bluetooth |
| Capacitor iOS | ⚠️ | Solo via plugin nativo (Core Bluetooth) |

### Consideraciones de seguridad

- Las APIs de hardware (Serial, Bluetooth) requieren **HTTPS** en producción o `localhost` en desarrollo.
- El usuario debe conceder permiso explícito mediante diálogo del navegador (no se puede automatizar sin interacción del usuario).
- Los permisos se mantienen mientras la página está abierta; al recargar, pueden necesitarse de nuevo (Serial persiste mejor que Bluetooth).
- Las lecturas de peso se procesan en el frontend; el backend solo recibe el resultado final.

### Marcas de básculas comunes en España

Para los presets de BAS-01:

| Marca | Modelos populares | Conexión habitual | Protocolo |
|---|---|---|---|
| **Epelsa** | Neptune, Marte, Mars | RS-232, USB | Propietario |
| **Dibal** | G-310, G-325, Mistral | RS-232, USB, Ethernet | Propietario |
| **CAS** | SW-1S, ER Junior, AD-H | RS-232, USB | CAS tipo A/B |
| **Baxtran** | BR, BW, BS series | RS-232, USB | Genérico ASCII |
| **Mettler Toledo** | ICS/bPlus, Spider | RS-232, USB, Ethernet | SICS/MT-SICS |
| **Gram** | M6, DSR, XTREM | RS-232, USB | Genérico ASCII |
| **Digi** | SM-100, SM-300 | RS-232, Ethernet | Propietario |
| **Soehnle** | Professional series | RS-232, USB | Genérico ASCII |

### Notas de diseño visual

**Paleta de colores de la báscula:**
- Conectada: Verde (`green-50/100/500/700`)
- Leyendo: Azul (`blue-50/100/500/700`)
- Estable: Verde intenso (`emerald-50/100/500/700`)
- Error/desconectada: Rojo (`red-50/100/500/700`)
- Sin báscula: Gris (`gray-50/100/500/700`)

**Tipografía del peso (legible en pantalla táctil a distancia):**
- Peso principal: `text-4xl font-bold font-mono tabular-nums` (monoespaciada para que no salte)
- Unidad: `text-xl font-normal text-gray-500`
- Estado: `text-xs uppercase tracking-wider`

**Iconos (lucide-react):**
- Báscula: `Scale`
- Conectada: `PlugZap`
- Desconectada: `Unplug`
- Tara: `RotateCcw`
- Cero: `Target`
- Aceptar: `Check`
- Error: `AlertTriangle`
- Configuración: `Settings2`
