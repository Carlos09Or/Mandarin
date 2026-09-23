# Mandarin HSK 1 · Stroke Trainer

Aplicación web estática para estudiar las 150 palabras del HSK 1 con:

- vocabulario Hanzi + pinyin + español;
- pronunciación con `SpeechSynthesis` del navegador;
- práctica de escritura Hanzi con **orden y dirección de trazos**;
- pistas después de errores y animación del orden correcto;
- quiz de significados;
- progreso guardado localmente con `localStorage`.

## Estructura

```text
mandarin-hsk1-stroke-trainer/
├── index.html
├── .nojekyll
├── .gitignore
├── README.md
├── assets/
│   └── favicon.svg
├── css/
│   └── styles.css
└── js/
    ├── data.js
    └── app.js
```

## Abrir en VS Code

1. Descomprime la carpeta.
2. Abre VS Code.
3. Ve a **File > Open Folder...** y selecciona `mandarin-hsk1-stroke-trainer`.
4. Para probarlo localmente, puedes usar la extensión **Live Server** o ejecutar desde la terminal:

```bash
python3 -m http.server 5500
```

Luego abre `http://localhost:5500`.

> La práctica de trazos usa Hanzi Writer desde CDN, por lo que necesita conexión a Internet.

## Crear el repositorio de GitHub desde la terminal

Primero crea en GitHub un repositorio vacío, por ejemplo `mandarin-hsk1-stroke-trainer`. No marques la opción de crear README si vas a subir este proyecto directamente.

Dentro de la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Initial HSK 1 stroke trainer"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/mandarin-hsk1-stroke-trainer.git
git push -u origin main
```

Cambia `TU_USUARIO` por tu usuario real de GitHub.

## Publicar con GitHub Pages

Como este proyecto es HTML/CSS/JS puro, no necesita compilación.

1. En GitHub abre el repositorio.
2. Ve a **Settings > Pages**.
3. En **Build and deployment**, selecciona **Deploy from a branch**.
4. Selecciona la rama **main**.
5. Selecciona la carpeta **/(root)**.
6. Pulsa **Save**.

Tu URL normalmente quedará con esta forma:

```text
https://TU_USUARIO.github.io/mandarin-hsk1-stroke-trainer/
```

## Dónde editar cada cosa

- `js/data.js`: las 150 palabras, pinyin y significado.
- `js/app.js`: lógica de vocabulario, escritura, quiz, audio y progreso.
- `css/styles.css`: diseño visual.
- `index.html`: estructura principal y carga de archivos.

## Dependencia

La escritura usa [Hanzi Writer](https://hanziwriter.org/), cargado desde jsDelivr.

## Datos de vocabulario

La lista de 150 palabras fue preparada a partir de la lista HSK 1 utilizada en el proyecto original (MandarinBean), con traducciones al español para esta aplicación.
