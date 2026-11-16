# Reto 5 USD

Web app estática para seguir el reto de **invertir 5 USD por día durante un año** desde Argentina, con ETFs (vía CEDEARs) y cripto.
Sin frameworks, sin build, sin servidor: HTML + CSS + JavaScript vanilla. Pensada primero para iPhone (Safari, agregada a la pantalla de inicio) y también para PC.

> Información basada en tu plan, no es asesoramiento financiero.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `index.html` | Estructura, meta tags de iOS/PWA y barra de pestañas |
| `styles.css` | Sistema de diseño (variables de color, tipografía, espaciado, curvas de animación) y todos los componentes |
| `app.js` | Estado, APIs con cache, cálculos, reglas de recomendación, gráficos SVG y pantallas |
| `manifest.json` | Manifest para instalarla como app |
| `icons/` | Ícono (SVG + PNG), ícono de iOS y pantallas de inicio claras y oscuras |

## Publicarla gratis en GitHub Pages

1. Subí estos archivos a un repositorio de GitHub (pueden estar en la raíz del repo).
2. En el repo entrá a **Settings → Pages**.
3. En **Build and deployment**, elegí **Source: Deploy from a branch**.
4. Elegí la rama (por ejemplo `main`), la carpeta **/ (root)** y tocá **Save**.
5. En uno o dos minutos la app queda publicada en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

Todas las rutas son relativas, así que funciona igual en una subcarpeta de GitHub Pages. El archivo `.nojekyll` evita que GitHub procese el sitio con Jekyll.

### Instalarla en el iPhone

1. Abrí la URL en **Safari**.
2. Tocá **Compartir** → **Agregar a inicio**.
3. Se abre a pantalla completa, con su ícono y su pantalla de inicio (clara u oscura según el sistema).

### Probarla en tu compu

Cualquier servidor estático sirve. Por ejemplo:

```bash
python3 -m http.server 8000
# y abrí http://localhost:8000
```

(Abrir `index.html` con doble clic también funciona, pero algunas APIs pueden bloquear pedidos desde `file://`.)

## Datos

- Todo se guarda en `localStorage`, **solo en ese dispositivo y ese navegador**. Safari en el iPhone y Chrome en la PC no comparten datos.
- **Exportar JSON** descarga un respaldo; **Importar JSON** lo restaura (el archivo se valida antes y reemplaza los datos actuales). Es la forma de pasar los datos de un dispositivo a otro.
- **Datos de prueba** carga un reto de ejemplo para ver todo funcionando. Tus datos reales se guardan aparte y vuelven al desactivarlo.

## Fuentes de mercado

| Dato | Fuente | Clave |
| --- | --- | --- |
| Dólar MEP, CCL, oficial y blue | [dolarapi.com](https://dolarapi.com) `/v1/dolares` | No |
| BTC y ETH (365 días, diario) | CoinGecko `market_chart` | No |
| SPY y QQQ (diario) | Twelve Data `time_series` | Incluida |

SPY y QQQ funcionan sin configurar nada: la app trae una clave de Twelve Data incluida (`BUILTIN_TD_KEY` en `app.js`). Como el sitio es público, cualquiera puede verla. Si alguien la abusa y se agotan los créditos, generá una clave nueva en twelvedata.com y reemplazala en `app.js`, o pegala en **Ajustes → Clave propia de Twelve Data** (esa se guarda solo en tu dispositivo y tiene prioridad).

El plan gratis da 800 créditos por día y 8 por minuto; cada actualización usa 2 (SPY y QQQ). Los precios de SPY y QQQ se guardan 30 minutos y el resto 15. Si una API falla, se muestra el último dato guardado marcado como **viejo**, y la pantalla nunca se rompe. Sin precio de mercado, un activo se valúa con tu último precio de compra (y se aclara).

## Recomendaciones

Son reglas simples sobre tu plan, cada una es una función dentro del array `RULES` en `app.js`. Se pueden activar, desactivar y ajustar en **Ajustes → Recomendaciones**:

- Día de compra, con un reparto sugerido para acercarte al objetivo
- Desvío del reparto (umbral en puntos porcentuales)
- Cripto muy volátil (BTC cae 20 % o más en 30 días, o 40 % o más desde su máximo)
- Atraso del reto
- Comisión alta en la última compra (más de 2 %)
- Brecha MEP/CCL alta (8 % o más)
- Hitos de progreso (25 / 50 / 75 / 100 %)
- Resumen de fin de mes

Nunca hacen predicciones ni dan señales de compra o venta. Cada tarjeta se descarta deslizándola.

## Diseño

- Un único color de acento (verde azulado) y neutros; modo claro y oscuro automáticos.
- Tipografía del sistema (SF Pro en iOS) con números tabulares.
- Animaciones solo con `transform` y `opacity`; con **Reducir movimiento** activado en el sistema quedan solo fundidos mínimos.
- Para cambiar colores, tamaños o tiempos de animación, editá las variables de `:root` al principio de `styles.css`.
