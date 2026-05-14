# `shared/`

Código **sin dependencias de framework** pensado para importarse desde **Node (Express)** y desde **Vite (React)**.

- **`naming/`** — reglas de códigos / slugs reutilizables (ver `naming/README.md`).
- **`AGENT_HANDOFF.md`** — contexto para el asistente en chats futuros (decisiones, rutas, qué ya está hecho).
- **Visión producto + arquitectura modular + restricciones de servidor:** `../docs/VERTIAL-SAAS-VISION.md` (léelo primero si entras nuevo al proyecto).

Si crece el repo, se pueden añadir más carpetas (`shared/validators`, etc.) con el mismo criterio: un solo lugar, import relativo desde `controllers/` y desde `src/`.
