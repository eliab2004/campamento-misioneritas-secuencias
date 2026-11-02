# Secuencias del Campamento Misioneritas

Sitio estático para escuchar por separado las alabanzas de cada momento del campamento. Cada alabanza tiene su propio reproductor sincronizado, controles de volumen y silencio por pista, y búsqueda por nombre.

## Publicación

La interfaz y el catálogo se publican en GitHub Pages. Las pistas originales se distribuyen como archivos de una publicación de GitHub con la etiqueta `audio-v1`; `config.js` contiene la dirección base de esos archivos.

Los desplazamientos de tono guardados en los proyectos REAPER se registran en `catalog.json`. La reproducción web conserva los desplazamientos de tono registrados en REAPER y mantiene el tempo usando [SoundTouchJS](https://github.com/cutterbl/SoundTouchJS), servido desde jsDelivr. Los proyectos `.rpp` fuente permanecen intactos en la carpeta original.

## Ejecución local

Abre el sitio desde un servidor estático, por ejemplo con la extensión Live Server de VS Code. `index.html` usa `fetch()` para cargar `catalog.json`, por lo que abrirlo directamente como archivo puede ser bloqueado por el navegador.
