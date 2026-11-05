# Pádel (MVP) para Xiaomi Smart Band 10

Marcador de pádel como Vela JS quick app (`.rpk`), pantalla 212 × 520.

## Uso

- Mitad de **arriba (coral) = ellos**, mitad de **abajo (verde) = nosotros**.
- **Toque o swipe a la derecha** sobre una mitad: punto para ese lado.
- **Swipe a la izquierda**: le resta un punto a ese lado (si fue el último
  punto jugado, lo deshace aunque haya cerrado un juego o set).
- Centro: marcador por sets (juegos de ellos arriba, nuestros abajo). El set
  en juego va sobre fondo gris; en los sets terminados se atenúa el perdedor.
  Debajo aparece TIE-BREAK, PUNTO DE ORO (a 40-40) o FIN DEL PARTIDO.
- Vibración corta por punto, larga cuando el punto cierra un juego.
- **Mantener presionado** en cualquier mitad: menú (reiniciar partido, punto
  de oro, pantalla fija, salir).
- El swipe a la derecha no cierra la app: para salir, usá **Salir** en el menú.

Reglas: 0/15/30/40, deuce y ventaja (o punto de oro), sets a 6 por 2,
tie-break a 7 por 2 en 6-6, al mejor de 3.

El estado se guarda en cada punto, así que sobrevive si la banda mata la app.

## Build e instalación

```sh
npm install
npm test          # tests de la lógica de puntuación (Node puro)
npm run build     # -> dist/com.ilanvivanco.padelband.debug.<versión>.rpk (bytecode JSC)
```

Instalá el `.rpk` **debug** con MiBand Hack, Notify o AstroBox.
Para actualizar, subí `versionCode` y `versionName` en `src/manifest.json`.

## Estructura

- `src/common/padel.js`: lógica pura. El partido es la lista de ganadores de
  cada punto y el marcador se recalcula siempre desde ahí.
- `src/pages/index/index.ux`: pantalla, gestos y menú.
- `test/padel.test.mjs`: tests de la lógica.

## Créditos

La estructura del proyecto se basó en [Calc+](https://github.com/arimwilson/calcplus)
de Ari Wilson (MIT).

## Licencia

MIT
