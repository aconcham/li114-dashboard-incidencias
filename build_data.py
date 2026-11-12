"""Genera los datos del dashboard web desde la exportación 'Resumen de incidencias' de ACC/Forma.

Aplica las reglas del dashboard:
estado en español, a quién le toca, revisor, segmentos del código del documento, etc.

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

# Estados de ACC, en el orden en que los muestra Forma.
ESTADOS = {"Draft": "Borrador", "Open": "Abierta", "Pending": "Pendiente", "Completed": "Completada",
           "Not approved": "No aprobada", "Closed": "Cerrada"}
ORDEN_ESTADOS = list(ESTADOS.values())

# A quién le toca actuar, según el flujo de estados del proyecto ("ACC: Preguntas frecuentes"):
#   P = Sinohydro: Abierta (actúa tras la notificación formal), Pendiente (la está atendiendo), No aprobada (debe volver a atenderla)
#   R = revisor (ANIN / Supervisión): Completada (por validar), Borrador (aún no emitida)
#   C = Cerrada
TOCA = {"Abierta": "P", "Pendiente": "P", "No aprobada": "P", "Completada": "R", "Borrador": "R", "Cerrada": "C"}


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


def leer_enlaces(origen: Path):
    """Hipervínculos de la exportación: ID → incidencia en ACC; Placement → documento con la marca de la incidencia.

    Para no repetir URL largas, se guarda por fila el GUID de la incidencia (issueId) y un índice a la lista
    de combinaciones únicas (entityId, folderUrn, viewableGuid) del documento. La página arma las URL.
    """
    from urllib.parse import parse_qs, urlparse
    import openpyxl

    ws = openpyxl.load_workbook(origen)["Issues"]
    hdr = [c.value for c in ws[1]]
    if "ID" not in hdr:
        return {}, {}
    i_id, i_pl = hdr.index("ID"), hdr.index("Placement") if "Placement" in hdr else None
    enlaces, combos, base = {}, [], {}
    for row in ws.iter_rows(min_row=2):
        celda = row[i_id]
        if not (celda.hyperlink and celda.hyperlink.target):
            continue
        u = urlparse(celda.hyperlink.target)
        gid = parse_qs(u.query).get("issueId", [None])[0]
        base.setdefault("issues", f"{u.scheme}://{u.netloc}{u.path}")
        dl = None
        if i_pl is not None and row[i_pl].hyperlink and row[i_pl].hyperlink.target:
            d = urlparse(row[i_pl].hyperlink.target)
            q = parse_qs(d.query)
            base.setdefault("files", f"{d.scheme}://{d.netloc}{d.path}")
            combo = [q.get("entityId", [""])[0], q.get("folderUrn", [""])[0], q.get("viewableGuid", [""])[0]]
            if combo[0]:
                if combo not in combos:
                    combos.append(combo)
                dl = combos.index(combo)
        enlaces[str(celda.value).strip()] = (gid, dl)
    base["docLinks"] = combos
    return enlaces, base


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--carpeta", type=Path, default=CARPETA)
    ap.add_argument("--archivo", type=Path)
    a = ap.parse_args()

    origen = a.archivo or ultima_exportacion(a.carpeta)
    corte = fecha_corte(origen.name)
    df = pd.read_excel(origen, sheet_name="Issues")
    enlaces, acc = leer_enlaces(origen)

    filas = []
    for _, r in df.iterrows():
        estado = ESTADOS.get(txt(r.get("Status")), txt(r.get("Status")))
        situacion = TOCA.get(estado, "P")  # un estado desconocido se cuenta como de Sinohydro
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
            "gid": enlaces.get(txt(r.get("ID")), (None, None))[0],
            "dl": enlaces.get(txt(r.get("ID")), (None, None))[1],
        })

    DATOS.mkdir(parents=True, exist_ok=True)
    meta = {"corte": corte.strftime("%Y-%m-%dT%H:%M"), "archivo": origen.name, "filas": len(filas),
            "generado": datetime.now().strftime("%Y-%m-%dT%H:%M"), "acc": acc}
    (DATOS / "incidencias.json").write_text(
        json.dumps({"meta": meta, "incidencias": filas}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # historial: un resumen por corte, para ver el avance entre exportaciones
    hist_path = DATOS / "historial.json"
    hist = json.loads(hist_path.read_text(encoding="utf-8")) if hist_path.exists() else []
    resumen = {"corte": meta["corte"], "total": len(filas)}
    for rv in ["Total", "ANIN", "Supervisión"]:
        sub = [f for f in filas if rv == "Total" or f["rev"] == rv]
        resumen[rv] = {k: sum(1 for f in sub if f["sit"] == k) for k in "PRC"} | {"total": len(sub)}
        resumen[rv]["estados"] = {e: n for e in ORDEN_ESTADOS + sorted({f["estado"] for f in sub} - set(ORDEN_ESTADOS))
                                  if (n := sum(1 for f in sub if f["estado"] == e)) or e in ORDEN_ESTADOS}
    hist = [h for h in hist if h["corte"] != resumen["corte"]] + [resumen]
    hist.sort(key=lambda h: h["corte"])
    hist_path.write_text(json.dumps(hist, ensure_ascii=False, indent=1), encoding="utf-8")

    t = resumen["Total"]
    est = " · ".join(f"{e} {n}" for e, n in t["estados"].items())
    print(f"{origen.name} → corte {meta['corte']} · {len(filas)} incidencias ({est}) · historial: {len(hist)} cortes")
    desconocidos = set(t["estados"]) - set(ORDEN_ESTADOS)
    if desconocidos:
        print(f"AVISO: estados no reconocidos {sorted(desconocidos)}; se cuentan como de Sinohydro. Revisar TOCA en build_data.py.")


if __name__ == "__main__":
    main()
