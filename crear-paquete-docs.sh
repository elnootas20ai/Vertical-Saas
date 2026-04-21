#!/bin/bash

# Script para crear paquete de documentación completo
# Uso: bash crear-paquete-docs.sh

echo "📦 Creando paquete de documentación completa..."

# Crear directorio temporal
mkdir -p /tmp/udar-edge-docs

# Copiar documentos
cp /LISTADO_FUNCIONALIDADES_COMPLETO.html /tmp/udar-edge-docs/
cp /ESPECIFICACION_BACKEND_COMPLETA.html /tmp/udar-edge-docs/
cp /GUIA_COMPLETA_MODULO_EQUIPO.md /tmp/udar-edge-docs/

# Crear README
cat > /tmp/udar-edge-docs/README.txt << 'EOF'
📚 DOCUMENTACIÓN COMPLETA - MÓDULO EQUIPO UDAR EDGE
====================================================

Este paquete contiene TODA la documentación necesaria para desarrollar
el módulo Equipo y RRHH de UDAR EDGE.

ARCHIVOS INCLUIDOS:
-------------------

1. GUIA_COMPLETA_MODULO_EQUIPO.md
   → Índice maestro - LEE ESTO PRIMERO
   → Explica todo el sistema y cómo usar los documentos
   
2. LISTADO_FUNCIONALIDADES_COMPLETO.html
   → 162 funcionalidades con clasificación BASE/FLAG
   → Organizado por pestañas del módulo
   → Con IDs únicos para trazabilidad
   → ABRIR EN NAVEGADOR
   
3. ESPECIFICACION_BACKEND_COMPLETA.html
   → Guía técnica completa para programador
   → Endpoints con request/response detallados
   → Esquemas de base de datos
   → Sistema de permisos
   → ABRIR EN NAVEGADOR

CÓMO USAR:
----------

1. Lee primero: GUIA_COMPLETA_MODULO_EQUIPO.md
2. Para clasificar funcionalidades: LISTADO_FUNCIONALIDADES_COMPLETO.html
3. Para desarrollar backend: ESPECIFICACION_BACKEND_COMPLETA.html

PRIORIZACIÓN:
-------------

FASE 1 (4-6 semanas): Funcionalidades BASE (~50 funcionalidades)
FASE 2 (3-4 semanas): FLAGS básicos - vacations, schedules (~35 funcionalidades)
FASE 3 (3-4 semanas): FLAGS avanzados - expenses, consumptions, onboarding (~23 funcionalidades)
FASE 4 (2-3 semanas): Integraciones - gestoria, multicenter, audit (~18 funcionalidades)

TOTAL: 162 funcionalidades | 71 permisos | 9 FLAGS

Versión: 1.0
Fecha: 4 Febrero 2026
Estado: ✅ COMPLETO Y LISTO PARA DESARROLLO
EOF

echo "✅ Paquete creado en: /tmp/udar-edge-docs/"
echo ""
echo "Archivos incluidos:"
ls -lh /tmp/udar-edge-docs/
echo ""
echo "Para crear ZIP (si tienes zip instalado):"
echo "cd /tmp && zip -r udar-edge-docs.zip udar-edge-docs/"