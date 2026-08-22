# Estipulación — Web de pedidos + QR de mesa

**Estado:** acuerdo de producto (no implementación).  
**Objetivo:** que cualquier negocio Vertial monte lo mismo, sin diseñar ni programar nada.  
**Dueño:** Vertial (plantilla única). El cliente solo configura y usa.

---

## 1. Principio

1. **Una sola piel Vertial.** Nadie construye su web. Mismos pasos, mismos botones, mismo aspecto.
2. **Los productos salen del SaaS.** Carta = catálogo de la empresa / tienda. Si cambian el producto en Vertial, cambia en la web/QR.
3. **Dos puertas distintas.** No se mezclan.
4. **Fácil de montar:** activar → elegir tiendas → imprimir QR → listo.

---

## 2. Las dos puertas

| Puerta | Para qué | Cómo se entra | Qué pasa |
|--------|----------|---------------|----------|
| **A · Web de pedir** | Pedido online (llevar / recoger / delivery según config) | Enlace público Vertial | El cliente **elige tienda** (ej. Tiana o Badalona) → ve carta de esa tienda → pide |
| **B · QR de mesa** | Pedir en restaurante a **esa mesa** | Solo el QR de esa mesa | Abre **tienda + mesa** fijas → carta → pide. **Sin QR no se entra** |

Regla dura:

- La web **no** abre mesas.
- Las mesas **no** se abren desde la web pública ni escribiendo la URL a mano.
- Cada QR es **una mesa de una tienda**. No sirve para otra mesa ni otra tienda.

---

## 3. URLs (sin dominio propio)

Todo bajo Vertial. El cliente **no paga dominio**.

Ejemplos (producción):

- Web pedir (elige tienda): `https://vertialapp.com/pedir/{empresa-o-grupo}`  
  *(nombre exacto de ruta = decisión técnica posterior; la regla de producto es: una entrada → elegir tienda → pedir)*
- QR mesa: enlace opaco / token de **esa mesa**, no una URL adivinable tipo `/mesa/1`.

En local (pruebas): mismo esquema con `localhost`.

---

## 4. Varias tiendas (ej. Modomio Tiana + Badalona)

- Misma cuenta SaaS, **tiendas en paralelo**.
- **Web de pedir:** lista las tiendas activas para web → el cliente elige → carga **solo** el catálogo / pedido de esa tienda.
- **QR mesa:** ya lleva la tienda; no pregunta Tiana/Badalona.

---

## 5. Qué configura el negocio (checklist de montaje)

Solo esto. Nada de “diseñar la web”.

### Web de pedir
1. Activar “Web de pedir” para la empresa.
2. Marcar qué **tiendas** salen en el selector.
3. Comprobar que los productos de carta están activos / visibles para web.
4. (Opcional) Horario abierto/cerrado, delivery vs recogida — cuando exista en config.
5. Copiar enlace o QR **de la web** (entrada al selector de tiendas) y colgarlo donde quieran (redes, Google, flyer).

### Mesas (QR)
1. Tener el plano / mesas de esa tienda en SaaS (sala).
2. Por cada mesa: generar / imprimir **su QR**.
3. Pegar el QR en la mesa física.
4. El comensal escanea → pide a esa mesa → el pedido entra al flujo de sala/cocina de **esa tienda**.

Si falta un paso de la checklist, no se improvisan pantallas raras: se completa el paso.

---

## 6. Qué ve el cliente (experiencia mínima)

### Web de pedir
1. Abre el enlace.  
2. “¿Qué tienda?” (nombres reales de los locales).  
3. Carta de esa tienda.  
4. Carrito → datos necesarios → confirmar.  
5. Mensaje de pedido recibido.

### QR mesa
1. Escanea.  
2. Ve que es **esa mesa** (nombre/número).  
3. Carta de esa tienda.  
4. Pedido → va a esa mesa.  
5. Sin login de cliente inventado; sin “elegir otra mesa”.

---

## 7. Qué NO es (límites)

- No es un constructor de webs ni temas por cliente.
- No es dominio propio por tienda (fase 1).
- No es entrar a mesas sin QR.
- No es una carta distinta a la del SaaS.
- No mezcla pedido web de calle con pedido de mesa en el mismo flujo de entrada.

---

## 8. Criterio de “fácil de montar”

Se considera bien montado cuando:

1. Un dueño, sin ayuda técnica, activa web + elige tiendas + comparte el enlace en menos de 10 minutos.  
2. Un encargado imprime QR de mesas desde SaaS y al escanear cae en la mesa correcta.  
3. Con 2 tiendas, la web pregunta cuál; el QR no pregunta.  
4. Un producto nuevo en catálogo aparece en web/QR sin redesplegar nada “a mano”.

---

## 9. Relación con lo que hay hoy

Hoy existe un MVP de “Web Pedidos” (`/web/{slug}`, config en SaaS).  
**Esta estipulación manda sobre ese MVP:** al implementar o limpiar, hay que alinearlo a las dos puertas (web con selector de tiendas + QR solo-mesa), plantilla única y catálogo SaaS.

No se programa nada hasta que Uriel diga “adelante” sobre un trozo concreto.

---

## 10. Frase de cierre (para el equipo)

> Vertial da la web y los QR. El negocio solo elige tiendas, pega QRs y vende. El cliente o elige tienda en la web, o escanea la mesa. Nada más.
