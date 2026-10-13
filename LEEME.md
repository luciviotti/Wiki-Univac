# Centro de Ayuda Univac.ERP

Sitio estático (HTML + CSS + JavaScript). No requiere instalación ni servidor especial: puede publicarse en cualquier hosting de archivos estáticos.

## Archivos
- `index.html` — estructura de la página.
- `style.css` — diseño (tipografía Poppins incluida en `assets/fonts`).
- `script.js` — navegación, buscador y asistente documental.
- `contenido.js` — base de conocimiento (categorías, artículos, FAQ). Cada artículo indica manual y sección de origen.
- `assets/logo-univac.png` — imagotipo oficial (sin modificaciones).
- `assets/capturas/`, `assets/videos/` — carpetas para material futuro.

## Cómo agregar contenido
En `contenido.js`, cada artículo tiene:
- `capturas`: `[{"src": "assets/capturas/archivo.png", "alt": "Descripción"}]`
- `videos`: `[{"url": "https://...", "titulo": "Título del video"}]`
- `ultimaRevision`: texto con fecha o versión del manual, cuando se conozca.
- `revision`: observaciones pendientes de validación por Univac (se muestran en el artículo y en "Observaciones de documentación").
- `restringido: true`: marca herramientas de uso exclusivo del Super Administrador.

Para agregar una pregunta frecuente, sumar `{"articulo": "id-del-articulo"}` al arreglo `faq`.

## Asistente con IA (opcional)
Por defecto el asistente funciona en modo **búsqueda documental local**: responde con fragmentos literales de los manuales e indica la fuente; si no hay información suficiente, lo informa y recomienda contactar a soporte.

Para conectar un modelo de IA, completar `ASISTENTE_IA.endpoint` en `script.js` con un servicio propio de Univac. El sitio envía `{ pregunta, contexto, instrucciones }` (el contexto son solo los fragmentos de manual recuperados) y espera `{ respuesta }`. La clave del proveedor de IA debe quedar en ese servicio, nunca en el navegador. Si el servicio falla, se usa la respuesta documental local.
