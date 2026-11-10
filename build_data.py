"""Genera los datos del dashboard web desde la exportación 'Resumen de incidencias' de ACC/Forma.

Replica las reglas de la consulta Power Query del modelo Power BI
(plantillas/02_Formatos_Propios/Dashboard_Incidencias_ACC_LI114_R00.pbix):
estado en español, situación, revisor, segmentos del código del documento, etc.

Uso:
    python build_data.py                      # toma la exportación más reciente de la carpeta por defecto
    python build_data.py --carpeta "D:\\otra"  # otra carpeta
    python build_data.py --archivo x.xlsx     # un archivo concreto

Salida:
    docs/data/incidencias.json   una fila por incidencia + metadatos del corte
    docs/data/historial.json     un resumen por corte (se agrega o reemplaza el corte actual)
"""

import argparse
import json
import re
from datetime import datetime, timedelta
from pathlib import Path

import sys

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")

CARPETA = Path(r"G:\My Drive\LI-114_OTUZCO_USQUIL\insumos\05_Incidencias_ACC")
RAIZ = Path(__file__).resolve().parent
DATOS = RAIZ / "docs" / "data"

ESTADOS = {"Open": "Abierta", "Completed": "Completada", "Closed": "Cerrada",
           "Not approved": "No aprobada", "Draft": "Borrador"}


def ultima_exportacion(carpeta: Path) -> Path:
    archivos = sorted(p for p in carpeta.glob("Resumen de incidencias*.xlsx") if not p.name.startswith("~$"))
    if not archivos:
        raise SystemExit(f"No hay exportaciones 'Resumen de incidencias*.xlsx' en {carpeta}")
    return archivos[-1]


def fecha_corte(nombre: str) -> datetime:
    """El sello AAAAMMDDhhmm del nombre viene en UTC; se pasa a hora de Lima (UTC-5)."""
    m = re.search(r"(\d{12})", nombre)
    if not m:
        raise SystemExit(f"El nombre {nombre} no trae el sello AAAAMMDDhhmm")
    return datetime.strptime(m.group(1), "%Y%m%d%H%M") - timedelta(hours=5)


def txt(v):
    if v is None or (isinstance(v, float) and pd.isna(v)) or v is pd.NaT:
        return None
    s = str(v).strip()
    return s or None


def iso(v):
    if v is None or pd.isna(v):
        return None
    return pd.Timestamp(v).strftime("%Y-%m-%dT%H:%M")


def persona(v):
    s = txt(v)
    return None if s is None else s.split("\n")[0].strip()


def empresa(v):
    s = txt(v)
    if s is None:
        return None
    if "\n" in s:
        return s.split("\n")[-1].strip()
    return "Usuario retirado" if "(Removed)" in s else s


def revisor(categoria):
    c = (categoria or "").upper()
    if c.startswith("ANIN"):
        return "ANIN"
    if c.startswith("SUP"):
        return "Supervisión"
    if c.startswith("CTR"):
        return "Contratista"
    return "Otro"


def segmentos(doc):
    if not doc:
        return None, None, None, None
    partes = re.split(r"[-_]", doc)  # algunos archivos usan guion bajo en vez de guion
    if len(partes) >= 8:
        return partes[4], partes[5], partes[6], "-".join(partes[4:8])
    return None, None, None, doc


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--carpeta", type=Path, default=CARPETA)
    ap.add_argument("--archivo", type=Path)
    a = ap.parse_args()

    origen = a.archivo or ultima_exportacion(a.carpeta)
    corte = fecha_corte(origen.name)
    df = pd.read_excel(origen, sheet_name="Issues")

    filas = []
    for _, r in df.iterrows():
        estado = ESTADOS.get(txt(r.get("Status")), txt(r.get("Status")))
        situacion = "C" if estado == "Cerrada" else ("R" if estado == "Completada" else "P")
        tipo = txt(r.get("Type"))
        archivo = txt(r.get("Placement"))
        doc = archivo.rsplit(".", 1)[0] if archivo and "." in archivo else archivo
        td, dd, fd, dc = segmentos(doc)
        venc = r.get("Due date")
        filas.append({
            "id": txt(r.get("ID")),
            "n": int(re.sub(r"\D", "", txt(r.get("ID")) or "0") or 0),
            "titulo": txt(r.get("Title")),
            "estado": estado,
            "sit": situacion,
            "rev": revisor(txt(r.get("Category"))),
            "cat": txt(r.get("Category")),
            "tipo": tipo,
            "tsr": tipo.split("-", 1)[1] if tipo and "-" in tipo else tipo,
            "asig": txt(r.get("Assigned to")),
            "creador": persona(r.get("Created by")),
            "empCreador": empresa(r.get("Created by")),
            "creado": iso(r.get("Created on")),
            "cerrado": iso(r.get("Closed at")) if txt(r.get("Closed at")) else None,
            "cerradoPor": persona(r.get("Closed by")),
            "venc": iso(venc) if txt(venc) else None,
            "doc": doc,
            "docCorto": dc,
            "tipoDoc": td,
            "discDoc": dd,
            "fase": fd,
            "causa": txt(r.get("Root cause")),
            "crit": txt(r.get("Criticidad")),
            "entregable": txt(r.get("N° entregable")),
            "tipoRev": txt(r.get("Tipo de revisión")),
            "desc": txt(r.get("Description")),
            "coment": txt(r.get("Comments")),
        })

    DATOS.mkdir(parents=True, exist_ok=True)
    meta = {"corte": corte.strftime("%Y-%m-%dT%H:%M"), "archivo": origen.name, "filas": len(filas),
            "generado": datetime.now().strftime("%Y-%m-%dT%H:%M")}
    (DATOS / "incidencias.json").write_text(
        json.dumps({"meta": meta, "incidencias": filas}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # historial: un resumen por corte, para ver el avance entre exportaciones
    hist_path = DATOS / "historial.json"
    hist = json.loads(hist_path.read_text(encoding="utf-8")) if hist_path.exists() else []
    resumen = {"corte": meta["corte"], "total": len(filas)}
    for rv in ["Total", "ANIN", "Supervisión"]:
        sub = [f for f in filas if rv == "Total" or f["rev"] == rv]
        resumen[rv] = {k: sum(1 for f in sub if f["sit"] == k) for k in "PRC"} | {"total": len(sub)}
    hist = [h for h in hist if h["corte"] != resumen["corte"]] + [resumen]
    hist.sort(key=lambda h: h["corte"])
    hist_path.write_text(json.dumps(hist, ensure_ascii=False, indent=1), encoding="utf-8")

    t = resumen["Total"]
    print(f"{origen.name} → corte {meta['corte']} · {len(filas)} incidencias "
          f"(P {t['P']} · R {t['R']} · C {t['C']}) · historial: {len(hist)} cortes")


if __name__ == "__main__":
    main()
