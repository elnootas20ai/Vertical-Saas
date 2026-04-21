Arquitectura IA MVC (estilo COBOL: rigida, predecible y barata de mantener)

Objetivo:
usar archivos .txt como contrato estable para modelos y selectores, con ejecucion controlada en frontend.

## 1) Modelo (M)

El modelo se define en texto plano:
- `plugin/models/couchdb-models.txt`

Formato rigido:
- `MODEL|nombre`
- `FIELD|campo|tipo|required|optional`
- `ENDMODEL`

Este contrato .txt es la referencia principal para la estructura de datos que luego se sincroniza con CouchDB.

Replica de conexion:
- `connectDBReplica` (archivo: `src/component/plugin/connectDB.ts`)
- Operaciones soportadas: `getAll`, `add`, `update`, `remove`

## 2) Vista (V)

La vista usa selectores CSS y soporta dos modos:
- `single`: valor individual (texto, numero o json)
- `list`: render de arrays con patron padre + item (`ul` + `li`)

Memoria de selectores:
- `plugin/temp/selectors-memory.txt` (archivo base editable)
- Runtime: espejo en `localStorage` para que el plugin funcione en navegador

Formato rigido de selectores:
- `BINDING|id|name|mode|selector|sourceField|renderAs|parentSelector|itemSelector`

## 3) Controlador (C)

Control central del flujo:
1. Carga bindings desde TXT/memoria
2. Procesa input con IA (`requestAIReplica`)
3. Aplica resultado al DOM
4. Permite CRUD de bindings (`add/update/delete`) y sincronizacion

Componentes clave:
- `src/component/plugin/FloatingAIPlugin.tsx`
- `src/component/plugin/engine.ts`
- `src/component/plugin/repository.ts`
- `src/component/plugin/requestAI.ts`

## 4) IA (OpenAI) y fallback

Replica IA:
- `requestAIReplica` en `src/component/plugin/requestAI.ts`

Comportamiento:
- Si existe `VITE_OPENAI_API_KEY`, llama API de OpenAI (`/v1/responses`)
- Si no existe clave, usa modo local determinista para no romper el flujo

## 5) Estado y CRUD operativo

Estados principales:
- `bindings` (selectores activos)
- `modelTxt` (modelo de base de datos)
- `selectorTxt` (memoria serializada)

Acciones:
- `ADD/UPDATE`: crea o actualiza binding por `id`
- `DELETE`: elimina binding por `id`
- `APPLY`: procesa datos y actualiza la vista
- `SYNC CouchDB`: guarda snapshot del estado en la base

## 6) Variables de entorno recomendadas

- `VITE_COUCHDB_URL`
- `VITE_COUCHDB_DB`
- `VITE_COUCHDB_USER` (opcional)
- `VITE_COUCHDB_PASSWORD` (opcional)
- `VITE_OPENAI_API_KEY` (opcional)

## 7) Regla de mantenimiento (filosofia COBOL)

- Contratos estables en `.txt`
- Formatos lineales y simples (`|`)
- Minima magia, maxima trazabilidad
- Cambios de negocio se hacen primero en TXT y luego se reflejan en UI/DB