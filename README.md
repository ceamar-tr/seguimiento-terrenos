# Seguimiento de Terrenos · CEAMAR

Prototipo para registrar, por estación, los muestreos de cada campaña de terreno: quién lo hizo, cuándo, qué réplicas se tomaron, motivos de lo no realizado y documentos con su ruta en el servidor.

Página: https://ceamar-tr.github.io/seguimiento-terrenos/

## Archivos
- `index.html`: la página.
- `data/matriz.js`: proyectos, monitoreos, periodos, parámetros y estaciones, exportados de la Matriz Maestra.
- `logos/`: logos de CEAMAR y clientes.
- `herramientas/exportar_matriz.py`: genera `data/matriz.js` desde el Excel.

## Actualizar los proyectos
```
pip install openpyxl
python3 herramientas/exportar_matriz.py Matriz_Maestra_Proyectos.xlsx data/matriz.js
```
Luego subir el nuevo `data/matriz.js` al repositorio.

## Estado
Modo prueba: los registros se guardan solo en el navegador de cada persona. Falta conectar la planilla de seguimiento en Drive (Apps Script) en el bloque `CONFIG` de `index.html`.

Inicio de sesión con Google activo desde el 25-11-2026.
