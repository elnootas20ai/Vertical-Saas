# `shared/`

Código **sin dependencias de framework** pensado para importarse desde **Node (Express)** y desde **Vite (React)**.

- **`naming/`** — reglas de códigos / slugs reutilizables (ver `naming/README.md`).
- **`AGENT_HANDOFF.md`** — contexto para el asistente en chats futuros (decisiones, rutas, qué ya está hecho).

Si crece el repo, se pueden añadir más carpetas (`shared/validators`, etc.) con el mismo criterio: un solo lugar, import relativo desde `controllers/` y desde `src/`.
