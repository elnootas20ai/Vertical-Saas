# `model.md` - Modelo funcional y de datos

Documento de referencia para convertir el diseño funcional (Figma/brief) en módulos reales, alineado con `src`.

## 1) Contexto de producto

| Campo | Valor |
| --- | --- |
| Negocio base | La Buena Mesa |
| Perfil principal | Gerente |
| Perfil secundario | Trabajador |
| Arquitectura actual | Frontend React + Vite con estado en `AppContext` y datos mock |

## 2) Mapa funcional principal

| Dominio | Funcionalidad | Estado en `src` |
| --- | --- | --- |
| Dashboard gerente | Ingresos, gastos, comparativas, ticket medio, alertas | Implementado por secciones (`DashboardResponsive`, `Informes`, `Notificaciones`) |
| Configuración sistema | Fiscalidad, facturas, tickets, numeración, textos legales | Existe base en `sections/configuracion/*` |
| Puntos de venta | Altas de centros, estado, ubicación, horarios | Existe en `PuntosDeVenta.tsx` |
| Calendario laboral | Eventos por centro y tipo de día | Existe en `CalendarioLaboral.tsx` |
| Fichajes | Reglas, tolerancias, conflictos | Existe en `ConfiguracionFichajes.tsx` |
| Chats internos | Canales, miembros, permisos, tickets internos | Existe en `ConfiguracionChats.tsx` y sección chats |
| Compras e inventario | OCR, reglas proveedor, impacto stock, coste | Existe en `ComprasInventario.tsx` + módulos productos |
| Objetivos y metas | Financieros, operativos, RRHH, alertas | Existe en `ConfiguracionObjetivos.tsx` |
| Importación de datos | Clientes, proveedores, productos, marcas, stock, históricos | Existe en `ConfiguracionImportacion.tsx` |
| Equipo/RRHH | Alta trabajador, contrato, salario, centro, fichajes, vacaciones | Existe en `Equipo.tsx`, `rrhh/*`, secciones trabajador |

## 3) KPIs y métricas (brief)

| KPI | Ejemplo del brief | Cálculo sugerido |
| --- | --- | --- |
| Ingresos totales | 88.300,00 EUR | Suma facturación emitida cobrada |
| Objetivo | 90.000,00 EUR | Meta del periodo |
| Gastos totales | 78.000,00 EUR | Suma compras + costes operativos |
| Comparativa | Diferencia | `ingresos - gastos` |
| Ticket medio | 285,50 EUR | `ingresos / numeroTickets` |
| Productividad | Lunes a sábado | Ratio por empleado y día |

## 4) Modelo de entidades (alto nivel)

| Entidad | Campos clave | Relación |
| --- | --- | --- |
| Business | id, name, fiscalData, commercialData | 1:N con `Store`, `User`, `Brand`, `Goal` |
| User | id, role, name, email, permissions | N:1 con `Business` |
| Store (PDV/Centro) | id, type, status, country, schedule | N:1 con `Business` |
| Employee | id, contractType, salary, workCenterId | N:1 con `Store` y `Business` |
| FiscalConfig | country, taxSystem, taxRules | 1:1 con `Business` |
| InvoiceConfig | template, numbering, legalTexts | 1:1 con `Business` |
| InventoryRule | supplierId, stockImpact, costMethod | N:1 con `Business` |
| Goal | scope, period, targetValue, thresholds | N:1 con `Business` |
| Alert | type, severity, status, owner | N:1 con módulo origen |
| InternalTicket | category, assignee, slaLimit, action | N:1 con canal interno |

## 5) Configuración de sistema (detalle funcional)

| Bloque | Campos del brief |
| --- | --- |
| Facturación y presupuestos | Validez, fecha, edición manual, descuento por línea, catálogo/servicios, creación rápida, desglose de impuestos |
| Fiscalidad | País fiscal, sistema impositivo (IVA/IGIC/IPSI), tipos configurables |
| Aplicación de impuesto | B2C impuesto incluido, B2B precio sin impuesto, facturas internacionales |
| Diseño factura | Plantillas: estándar, minimal, profesional, retail |
| Diseño ticket | Mostrar/desglosar impuestos, datos fiscales |
| Numeración y formato | Prefijo, número inicial, reinicio (año/serie/nunca), formato fecha |
| Textos legales | Texto factura, ticket, idioma |
| Información general | Razón social, NIF/CIF/Tax ID, teléfono, dirección fiscal |
| Internacionalización | País, zona horaria, moneda, idioma, calendario, separadores, posición símbolo |
| Datos comerciales | Nombre comercial, eslogan, logo, descripción |
| Contacto público | Email, teléfono, web, horario, redes sociales |

## 6) Organización recomendada en `src`

| Ruta | Organización propuesta |
| --- | --- |
| `src/app/types/` | Consolidar contratos por dominio (`business`, `fiscal`, `rrhh`, `inventory`). |
| `src/app/data/` | Separar `mock`, `seed`, `catalogs`, `fixtures` por módulo. |
| `src/app/components/sections/configuracion/` | Mantener una pantalla por bloque de negocio y subformularios modulares. |
| `src/app/components/ui/` | Solo componentes atómicos reutilizables; sin lógica de negocio. |
| `src/app/utils/` | Reglas puras y validaciones (sin JSX). |
| `src/app/context/` | Estado global transversal; no lógica de formulario extensa. |

## 7) Organización recomendada para CouchDB

| Base de datos | Uso |
| --- | --- |
| `businesses` | Empresa, fiscalidad, comercial e internacionalización |
| `users` | Usuarios, roles y permisos |
| `stores` | PDV, centros, horarios operativos y calendario laboral |
| `employees` | Contratos, fichajes, ausencias, vacaciones |
| `inventory` | Reglas proveedor, stock, costes, OCR |
| `billing` | Facturas, tickets, plantillas, numeración, textos legales |
| `goals` | Objetivos financieros, operativos y RRHH |
| `alerts_tickets` | Alertas operativas y tickets internos/consultas |

## 8) Flujo de trabajo sugerido (implementación)

| Fase | Objetivo |
| --- | --- |
| Fase 1 | Unificar tipos y contratos de datos según este `model.md`. |
| Fase 2 | Mapear cada bloque de configuración a componentes ya existentes en `sections/configuracion`. |
| Fase 3 | Sustituir `mockData` por repositorios hacia Express + CouchDB. |
| Fase 4 | Activar alertas, métricas y objetivos con reglas de negocio reales. |
| Fase 5 | Endurecer permisos por rol (gerente/trabajador) y validar flujos completos. |

## 9) Notas de alineación con tu `src`

- El proyecto ya tiene base sólida por módulos y por rol.
- El contenido del brief encaja bien con `sections/configuracion/*`, `Equipo`, `Finanzas`, `Informes` y `Productos`.
- El siguiente salto natural es pasar de mock a persistencia real en Express + CouchDB manteniendo los mismos contratos de `types`.
