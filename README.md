# Dashboard de incidencias ACC · LI-114 Otuzco–Usquil

Página web estática (GitHub Pages) para seguir las incidencias de revisión de ACC/Forma del proyecto **"Mejoramiento y ampliación del servicio de transitabilidad vial interurbana en la vía departamental LI-114: tramo Otuzco – Usquil"** (CUI 2597478).

Tiene 6 páginas:

1. **Resumen**: incidencias por **estado de ACC**, KPI I1 (meta ≥ 75 %, EIR p.25–26), estado por revisor, saldo semanal y **avance entre cortes**.
2. **Tendencia**: creadas vs. cerradas por semana, acumulados y resumen mensual.
3. **Antigüedad**: no cerradas por rango de días y las 25 más antiguas.
4. **Especialidad y documento**: matriz por tipo, 15 documentos con más incidencias no cerradas y volumen vs. velocidad de cierre.
5. **Detalle**: lista de trabajo con búsqueda, filtros y descarga en CSV. Se llega con clic desde las páginas 3 y 4.
6. **Calidad de datos**: qué tan completos están los campos en ACC.

En las tablas, el **ID ↗** abre la incidencia en ACC y el **Documento ↗** abre el archivo con la marca de la incidencia. Son los mismos hipervínculos de la exportación de Excel y requieren sesión en ACC con acceso al proyecto. El CSV de Detalle también los incluye.

Los filtros (Revisor, Entregable, Tipo de revisión, Fase) aplican a todas las páginas y quedan en la URL, así que un enlace copiado abre la misma vista.

> ⚠️ **El sitio es público.** Cualquiera con el enlace puede ver las incidencias, incluidas sus descripciones, comentarios y autores. Los datos vienen de una exportación de trabajo de ACC, no de un documento contractual.

## Actualizar con un nuevo corte

1. En ACC: **Incidencias → Exportar todo → Exportar informe → Resumen de incidencias → Excel**, sin filtros y sin cubierta ni índice.
2. Guardar el archivo **sin cambiarle el nombre** en `G:\My Drive\LI-114_OTUZCO_USQUIL\insumos\05_Incidencias_ACC\`.
3. Desde esta carpeta, ejecutar:

```bash
python build_data.py
git add docs/data
git commit -m "Corte ACC AAAA-MM-DD"
git push
```

GitHub Pages publica el cambio en uno o dos minutos. `build_data.py` toma siempre la exportación más reciente de la carpeta. Saca la **fecha de corte** del sello del nombre (que viene en UTC) y la pasa a hora de Lima. Además, agrega una fila al historial (`docs/data/historial.json`), y con eso la tabla *Avance entre cortes* va mostrando cómo avanza el equipo.

Opciones: `python build_data.py --archivo ruta.xlsx` usa un archivo concreto; `--carpeta ruta` usa otra carpeta.

## Ver en local

```bash
python -m http.server 8114 --directory docs
```

Luego abrir http://localhost:8114. Si se abre el `index.html` con doble clic, el navegador no carga los datos.

## Estructura

| Ruta | Contenido |
|---|---|
| `build_data.py` | Convierte la exportación de ACC en `docs/data/*.json`. Aplica las reglas de estados, a quién le toca y revisor |
| `docs/index.html`, `docs/app.js`, `docs/styles.css` | La página. Usa Chart.js 4.4.1 desde cdnjs; no requiere compilación |
| `docs/data/incidencias.json` | Una fila por incidencia y los metadatos del corte |
| `docs/data/historial.json` | Un resumen por corte publicado |

## Reglas principales

- **Estados**: los 6 de ACC, en el orden de Forma: Borrador, Abierta, Pendiente, Completada, No aprobada y Cerrada. Flujo del proyecto (presentación "ACC: Preguntas frecuentes"):
  - *Abierta*: el revisor la creó; Sinohydro la pasa a Pendiente después de recibir la notificación formal de la revisión.
  - *Pendiente*: Sinohydro la está atendiendo.
  - *Completada*: Sinohydro la atendió; el revisor la valida cuando recibe la notificación formal de la entrega.
  - *No aprobada*: el revisor no la da por atendida; Sinohydro vuelve a atenderla.
  - *Cerrada*: el revisor la da por atendida.
- **A quién le toca**: Sinohydro = Abierta, Pendiente y No aprobada; revisor = Completada y Borrador (aún no emitida). Un estado nuevo que ACC agregue aparece en gris y se cuenta como de Sinohydro; `build_data.py` avisa.
- **Revisor**: según la Categoría de ACC: `ANIN-…` → ANIN, `SUP-…` → Supervisión, `CTR-…` → Contratista.
- **KPI I1** = Cerradas / total. "Resuelta" se toma como estado Cerrada; falta confirmar el criterio con ANIN.
- **Antigüedad** = días desde la creación hasta el corte, solo para las no cerradas. El umbral de 15 días es provisional.
- **Colores de los estados**: violeta = Borrador, amarillo = Abierta, azul = Pendiente, verde = Completada, rojo = No aprobada, verde agua = Cerrada. Siguen los tonos de Forma donde se pudo y se validaron para daltonismo en modo claro y oscuro; Cerrada no es gris como en Forma porque el gris no pasa la validación.

Coordinación BIM-GIS · Sinohydro.
