# Cotizador FuelBar

Aplicación web estática para preparar cotizaciones de FuelBar, comparar escenarios de rentabilidad, previsualizarlas con formato de documento y exportarlas a PDF.

## Funciones incluidas

- Datos editables de FuelBar, cliente y evento.
- Calculadora 3 × 3 con tres precios y tres probabilidades de consumo por pax; el food cost se recalcula automáticamente al cambiar las bebidas.
- Costos fijos, cócteles e insumos editables con importación local del modelo `Costeos_FB.xlsx`.
- Utilidad y margen calculados sobre la venta sin IGV; el impuesto se muestra por separado.
- Aplicación directa de la combinación elegida al artículo Barra Libre.
- Artículos preconfigurados y artículos nuevos ilimitados.
- Reordenamiento, duplicado y eliminación de artículos.
- Cantidad fija o vinculada al número de asistentes.
- Descuentos porcentuales o de monto fijo por artículo.
- Impuesto editable, configurado inicialmente en 10.5%.
- Condiciones, servicios incluidos y notas adicionales editables.
- Vista previa en formato carta y descarga de PDF vectorial con texto seleccionable y paginación automática.
- Identidad visual FuelBar integrada en la interfaz, la previsualización, el PDF y el ícono del sitio.
- Guardado local del borrador en el navegador.

## Uso local

Sirve la carpeta `dist` con cualquier servidor web estático. No requiere compilación ni dependencias.

## Publicación en GitHub Pages

El flujo incluido en `.github/workflows/pages.yml` publica la carpeta `dist` al enviar cambios a la rama `main`. En la configuración del repositorio, selecciona **GitHub Actions** como origen de GitHub Pages.

No se envían datos a un servidor: el borrador se guarda únicamente en el navegador y el PDF se genera en el dispositivo.
