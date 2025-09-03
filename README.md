# RUNNER: ITANIMULLI

Pequeño juego tipo *runner* hecho en HTML5 Canvas, inspirado en la idea de un corredor que evita enemigos (reptilianos, ángeles y triángulos con ojo) al estilo sencillo del dinosaurio de Google.

## Cómo jugar
- **Espacio / Flecha ↑**: saltar (doble salto; con alas activas tienes un salto extra temporal).
- **M**: silenciar/activar sonidos.
- **R**: reiniciar cuando no estás en partida.

## Mecánicas
- Comienzas con **10 vidas** y un **escudo inicial de 3 s** (representado por una Estrella de David).
- Sobrevive el mayor tiempo posible; tu **puntaje** es el tiempo en segundos. Se guarda **récord** en `localStorage`.
- **Desde 30 s** aparecerán **triángulos con un ojo** que disparan **rayos rojos** a la altura del jugador (evítalos saltando).
- **Desde 60 s** la dificultad aumenta un poco más y cada **60 s (60/120/180)** recibes **alas durante 15 s** que desbloquean un salto extra temporal.
- **Ángeles** disparan **misiles dirigidos al muslo derecho** del jugador; los **ojos con alas** hacen daño por contacto.
- **Reptilianos** corren por el suelo en dirección opuesta. Cualquier contacto con **misil/ láser/ ojo con alas/ reptiliano** te hace perder una vida.

## Ejecutar
Basta con abrir `index.html` en cualquier navegador moderno (Chrome/Edge/Firefox/Safari). No requiere servidor ni recursos externos.

## Archivos
- `index.html` — Lienzo y UI básica.
- `style.css` — Estilos.
- `game.js` — Lógica del juego.
- `README.md` — Esta guía.
- `LICENSE` — MIT.

## Notas
- Todos los gráficos están dibujados por código con formas simples para evitar posibles conflictos de derechos.
- Los sonidos usan **WebAudio** (bips sintéticos, sin archivos de audio externos).
