"""Exporta la Matriz Maestra (xlsx) a data/matriz.js para la página de terrenos.
Uso: python3 herramientas/exportar_matriz.py Matriz_Maestra_Proyectos.xlsx data/matriz.js  (requiere: pip install openpyxl)"""
import sys, json, datetime, openpyxl
src, out = sys.argv[1], sys.argv[2]
HOJAS = ['PROYECTOS','MONITOREOS','PERIODOS','PARAMETROS','ESTACIONES','ESTACION_MONITOREO','LISTAS']
wb = openpyxl.load_workbook(src, data_only=True)
def val(v):
    if isinstance(v, (datetime.date, datetime.datetime)): return v.isoformat()[:10]
    if isinstance(v, str): return v.strip()
    if isinstance(v, float) and v.is_integer(): return int(v)
    return v
hojas = {}
for h in HOJAS:
    it = wb[h].iter_rows(values_only=True)
    hdr = [str(x).strip().lower() if x is not None else '' for x in next(it)]
    filas = []
    for r in it:
        d = {hdr[i]: val(v) for i, v in enumerate(r) if i < len(hdr) and hdr[i] and v not in (None, '')}
        if d: filas.append(d)
    if h == 'LISTAS':  # solo hace falta el código de cada monitoreo
        filas = [{'monitoreo': d['monitoreo'], 'codigo_monitoreo': d.get('codigo_monitoreo')} for d in filas if d.get('monitoreo')]
    hojas[h] = filas
data = {'generado': datetime.date.today().isoformat(), 'hojas': hojas}
with open(out, 'w', encoding='utf8') as f:
    f.write('// Generado desde Matriz_Maestra_Proyectos.xlsx. No editar a mano: volver a exportar la matriz.\n')
    f.write('window.MATRIZ_DATOS = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print({h: len(v) for h, v in hojas.items()})
