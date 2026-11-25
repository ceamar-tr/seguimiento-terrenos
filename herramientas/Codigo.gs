/**
 * Seguimiento de Terrenos CEAMAR · Apps Script
 * Va pegado en la planilla "Seguimiento de Terrenos CEAMAR" (Extensiones > Apps Script).
 * Publicar como aplicación web: Ejecutar como "Yo" · Quién tiene acceso "Cualquier usuario".
 * El acceso real lo controla la hoja Usuarios: solo entra quien está ahí con activo = Sí.
 */

// ID de cliente OAuth de Google Cloud (el mismo que se pone en la página).
var CLIENT_ID = 'PEGAR_AQUI_EL_ID_DE_CLIENTE.apps.googleusercontent.com';
var DIAS_SESION = 90;   // la sesión dura 90 días sin usar la página; cada uso la renueva
var ROLES_EDITAN = ['Administrador', 'Coordinación'];

// ─── Entrada ──────────────────────────────────────────────
function doGet() {
  return json_({ ok: true, servicio: 'Seguimiento de Terrenos CEAMAR' });
}

function doPost(e) {
  var p;
  try { p = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Solicitud no válida' }); }
  try {
    if (p.accion === 'login') return json_(login_(p.idToken));
    var u = usuarioDeSesion_(p.sesion);
    if (!u) return json_({ ok: false, error: 'sesion', mensaje: 'La sesión expiró o no tienes acceso. Vuelve a iniciar sesión.' });
    if (p.accion === 'logout') { PropertiesService.getScriptProperties().deleteProperty('s_' + p.sesion); return json_({ ok: true }); }
    if (p.accion === 'datos') return json_(datos_(u));
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try { return json_(cambiar_(u, p.accion, p.datos || {})); }
    finally { lock.releaseLock(); }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// ─── Inicio de sesión ─────────────────────────────────────
function login_(idToken) {
  if (!idToken) return { ok: false, error: 'Falta el inicio de sesión de Google' };
  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return { ok: false, error: 'No se pudo verificar la cuenta de Google' };
  var t = JSON.parse(r.getContentText());
  if (t.aud !== CLIENT_ID) return { ok: false, error: 'El inicio de sesión no corresponde a esta página' };
  if (String(t.email_verified) !== 'true') return { ok: false, error: 'La cuenta de Google no tiene el correo verificado' };
  var u = buscarUsuario_(t.email);
  if (!u) return { ok: false, error: 'sin_acceso', mensaje: 'La cuenta ' + t.email + ' no tiene acceso. Pide a la administración que te agregue.' };
  var sesion = Utilities.getUuid();
  var exp = Date.now() + DIAS_SESION * 864e5;
  PropertiesService.getScriptProperties().setProperty('s_' + sesion, JSON.stringify({ correo: u.correo, exp: exp }));
  limpiarSesiones_();
  registrar_(u, 'login', '', '');
  var d = datos_(u); d.sesion = sesion; return d;
}

function usuarioDeSesion_(sesion) {
  if (!sesion) return null;
  var raw = PropertiesService.getScriptProperties().getProperty('s_' + sesion);
  if (!raw) return null;
  var s = JSON.parse(raw);
  if (s.exp < Date.now()) { PropertiesService.getScriptProperties().deleteProperty('s_' + sesion); return null; }
  // Sesión deslizante: si se usó, se renueva (como máximo una vez al día para no escribir en cada llamada).
  if (s.exp - Date.now() < (DIAS_SESION - 1) * 864e5) { s.exp = Date.now() + DIAS_SESION * 864e5; PropertiesService.getScriptProperties().setProperty('s_' + sesion, JSON.stringify(s)); }
  return buscarUsuario_(s.correo);   // se revisa la hoja en cada llamada: quitar a alguien tiene efecto inmediato
}

function limpiarSesiones_() {
  var props = PropertiesService.getScriptProperties(), all = props.getProperties(), ahora = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('s_') !== 0) return;
    try { if (JSON.parse(all[k]).exp < ahora) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

function buscarUsuario_(correo) {
  correo = String(correo || '').trim().toLowerCase();
  var fila = leer_('Usuarios').filter(function (r) { return String(r.correo).trim().toLowerCase() === correo; })[0];
  if (!fila || String(fila.activo).trim() !== 'Sí') return null;
  return { correo: correo, nombre: String(fila.nombre).trim(), rol: String(fila.rol).trim() };
}

// ─── Lectura ──────────────────────────────────────────────
function datos_(u) {
  var camps = leer_('Campañas'), tareas = leer_('Checklist'), resp = leer_('Responsables'), docs = leer_('Documentos');
  var conds = SpreadsheetApp.getActive().getSheetByName('Condiciones') ? leer_('Condiciones') : [];
  var nombres = {}; leer_('Usuarios').forEach(function (r) { if (r.correo) nombres[String(r.correo).trim().toLowerCase()] = String(r.nombre || '').trim(); });
  function quien(x) { x = String(x || '').trim(); return nombres[x.toLowerCase()] || x; }
  var personal = leer_('Personal').filter(function (r) { return String(r.activo).trim() === 'Sí' && r.nombre; }).map(function (r) { return String(r.nombre).trim(); });
  var visibles = camps.filter(function (c) { return puedeVer_(u, c); }).map(function (c) {
    var id = c.id_campana;
    var monResp = {}, monRedes = {};
    resp.filter(function (r) { return r.id_campana === id; }).forEach(function (r) { monResp[r.monitoreo] = lista_(r.responsables); if (r.redes) monRedes[r.monitoreo] = String(r.redes); });
    return {
      id: id, proyecto: c.id_proyecto, anio: Number(c.anio), periodo: String(c.periodo), ini: fecha_(c.inicio), fin: fecha_(c.termino),
      jefe: c.jefe, equipo: lista_(c.equipo), estadoAdm: c.estado || 'Abierta', cerradaPor: c.cerrada_por || '', cerradaEl: texto_(c.cerrada_el), creadaPor: quien(c.creada_por), creadaEl: texto_(c.creada_el),
      monResp: monResp, monRedes: monRedes, monClima: climaDe_(conds, id),
      tareas: tareas.filter(function (t) { return t.id_campana === id; }).map(function (t) {
        var dat = {}; try { dat = t.datos ? JSON.parse(t.datos) : {}; } catch (e) {}
        return { id: t.id_tarea, mon: t.monitoreo, est: String(t.estacion), estado: t.estado || '', fecha: fecha_(t.fecha), hora: String(t.hora || ''), motivo: t.motivo || '', datos: dat, por: quien(t.actualizado_por), el: texto_(t.actualizado_el) };
      }),
      docs: docs.filter(function (d) { return d.id_campana === id; }).map(function (d) {
        return { n: d.documento, t: d.tipo, estado: d.estado || '', resp: d.responsable || '', fecha: fecha_(d.fecha), ruta: d.ruta || '' };
      })
    };
  });
  return { ok: true, usuario: u, personal: personal, campanas: visibles };
}

// ─── Cambios ──────────────────────────────────────────────
function cambiar_(u, accion, d) {
  var esCoord = ROLES_EDITAN.indexOf(u.rol) >= 0, c;
  switch (accion) {
    case 'crearCampana':
      if (!esCoord) return negado_();
      if (buscarFila_('Campañas', 'id_campana', d.id)) return { ok: false, error: 'Ya existe la campaña ' + d.id };
      agregar_('Campañas', { id_campana: d.id, id_proyecto: d.proyecto, proyecto: d.nombreProyecto || '', anio: d.anio, periodo: d.periodo, inicio: d.inicio, termino: d.termino,
        jefe: d.jefe, equipo: (d.equipo || []).join(', '), estado: 'Abierta', creada_por: u.correo, creada_el: ahora_(), actualizado_el: ahora_() });
      agregarVarias_('Checklist', (d.tareas || []).map(function (t) {
        return { id_tarea: t.id, id_campana: d.id, monitoreo: t.mon, estacion: t.est, estado: '', actualizado_el: ahora_() };
      }));
      agregarVarias_('Documentos', (d.docs || []).map(function (x) { return { id_campana: d.id, documento: x.n, tipo: x.t, estado: '' }; }));
      registrar_(u, 'crear campaña', d.id, (d.tareas || []).length + ' estaciones, equipo: ' + (d.equipo || []).join(', '));
      return { ok: true };

    case 'editarCampana':
      c = campana_(d.campana); if (!c) return noExiste_();
      if (!(esCoord || (u.rol === 'Muestreador' && c.jefe === u.nombre && c.estado !== 'Cerrada'))) return negado_();
      actualizar_('Campañas', 'id_campana', d.campana, { inicio: d.inicio, termino: d.termino, jefe: d.jefe, equipo: (d.equipo || []).join(', '), actualizado_el: ahora_() });
      registrar_(u, 'editar campaña', d.campana, d.inicio + ' a ' + d.termino + ' · equipo: ' + (d.equipo || []).join(', '));
      return { ok: true };

    case 'tarea':
    case 'tareas':
      c = campana_(d.campana); if (!c) return noExiste_();
      if (!puedeMarcar_(u, c)) return negado_();
      (accion === 'tarea' ? [d] : (d.lista || [])).forEach(function (t) {
        actualizar_('Checklist', 'id_tarea', t.id, { estado: t.estado || '', fecha: t.fecha || '', hora: t.hora || '', motivo: t.motivo || '',
          datos: t.datos ? JSON.stringify(t.datos) : '', actualizado_por: u.correo, actualizado_el: ahora_() });
      });
      registrar_(u, accion === 'tarea' ? 'marcar estación' : 'marcar varias', d.campana,
        accion === 'tarea' ? d.monitoreo + ' ' + d.estacion + ': ' + (d.estado || 'sin marcar') + (d.fecha ? ' (' + d.fecha + ')' : '') : (d.lista || []).length + ' estaciones de ' + d.monitoreo);
      return { ok: true };

    case 'responsables':
      c = campana_(d.campana); if (!c) return noExiste_();
      if (!puedeMarcar_(u, c)) return negado_();
      var fr = leer_('Responsables').filter(function (r) { return r.id_campana === d.campana && r.monitoreo === d.monitoreo; })[0];
      var val = { responsables: d.responsables, actualizado_por: u.correo, actualizado_el: ahora_() };
      if (fr) actualizarFila_('Responsables', fr._fila, val);
      else agregar_('Responsables', { id_campana: d.campana, monitoreo: d.monitoreo, responsables: d.responsables, actualizado_por: u.correo, actualizado_el: ahora_() });
      registrar_(u, 'responsables', d.campana, d.monitoreo + ': ' + d.responsables);
      return { ok: true };

    case 'redes':
      c = campana_(d.campana); if (!c) return noExiste_();
      if (!puedeMarcar_(u, c)) return negado_();
      asegurarColumna_('Responsables', 'redes');
      var fr2 = leer_('Responsables').filter(function (r) { return r.id_campana === d.campana && r.monitoreo === d.monitoreo; })[0];
      if (fr2) actualizarFila_('Responsables', fr2._fila, { redes: d.redes || '', actualizado_por: u.correo, actualizado_el: ahora_() });
      else agregar_('Responsables', { id_campana: d.campana, monitoreo: d.monitoreo, responsables: '', redes: d.redes || '', actualizado_por: u.correo, actualizado_el: ahora_() });
      registrar_(u, 'redes', d.campana, d.monitoreo + ': ' + (d.redes || 'sin redes'));
      return { ok: true };

    case 'condiciones':
      c = campana_(d.campana); if (!c) return noExiste_();
      if (!puedeMarcar_(u, c)) return negado_();
      asegurarHoja_('Condiciones', ['id_campana', 'monitoreo', 'fecha', 'clima', 'estado_mar', 'viento', 'direccion_viento', 'observaciones', 'actualizado_por', 'actualizado_el']);
      var vc = { clima: d.cielo || '', estado_mar: d.mar || '', viento: d.vint || '', direccion_viento: d.vdir || '', observaciones: d.obs || '', actualizado_por: u.correo, actualizado_el: ahora_() };
      var fc = leer_('Condiciones').filter(function (r) { return r.id_campana === d.campana && r.monitoreo === d.monitoreo && fecha_(r.fecha) === d.fecha; })[0];
      if (fc) actualizarFila_('Condiciones', fc._fila, vc);
      else { vc.id_campana = d.campana; vc.monitoreo = d.monitoreo; vc.fecha = d.fecha; agregarVarias_('Condiciones', [vc]); }
      registrar_(u, 'condiciones', d.campana, d.monitoreo + ' ' + d.fecha + ': ' + [d.cielo, d.mar, d.vint, d.vdir].filter(String).join(' · '));
      return { ok: true };

    case 'doc':
      c = campana_(d.campana); if (!c) return noExiste_();
      if (!puedeMarcar_(u, c)) return negado_();
      var fd = leer_('Documentos').filter(function (r) { return r.id_campana === d.campana && r.documento === d.documento; })[0];
      var vd = { estado: d.estado || '', responsable: d.responsable || '', fecha: d.fecha || '', ruta: d.ruta || '', actualizado_por: u.correo, actualizado_el: ahora_() };
      if (fd) actualizarFila_('Documentos', fd._fila, vd);
      else { vd.id_campana = d.campana; vd.documento = d.documento; vd.tipo = d.tipo || ''; agregar_('Documentos', vd); }
      registrar_(u, 'documento', d.campana, d.documento + ': ' + (d.estado || 'pendiente'));
      return { ok: true };

    case 'cerrar':
    case 'reabrir':
      if (!esCoord) return negado_();
      c = campana_(d.campana); if (!c) return noExiste_();
      actualizar_('Campañas', 'id_campana', d.campana, accion === 'cerrar'
        ? { estado: 'Cerrada', cerrada_por: u.nombre, cerrada_el: ahora_(), actualizado_el: ahora_() }
        : { estado: 'Abierta', cerrada_por: '', cerrada_el: '', actualizado_el: ahora_() });
      registrar_(u, accion === 'cerrar' ? 'cerrar campaña' : 'reabrir campaña', d.campana, '');
      return { ok: true };

    case 'eliminarCampana':
      if (u.rol !== 'Administrador') return negado_();
      ['Checklist', 'Responsables', 'Documentos', 'Campañas'].forEach(function (h) { borrarDeCampana_(h, d.campana); });
      registrar_(u, 'eliminar campaña', d.campana, '');
      return { ok: true };
  }
  return { ok: false, error: 'Acción desconocida: ' + accion };
}

// ─── Permisos ─────────────────────────────────────────────
function puedeVer_(u, c) {
  if (u.rol !== 'Muestreador') return true;
  return lista_(c.equipo).indexOf(u.nombre) >= 0;
}
function puedeMarcar_(u, c) {
  if (ROLES_EDITAN.indexOf(u.rol) >= 0) return true;
  if (u.rol !== 'Muestreador') return false;
  return c.estado !== 'Cerrada' && lista_(c.equipo).indexOf(u.nombre) >= 0;
}
function negado_() { return { ok: false, error: 'permiso', mensaje: 'Tu rol no permite este cambio.' }; }
function noExiste_() { return { ok: false, error: 'La campaña no existe en la planilla' }; }

// ─── Planilla ─────────────────────────────────────────────
function hoja_(n) {
  var h = SpreadsheetApp.getActive().getSheetByName(n);
  if (!h) throw new Error('No existe la hoja ' + n);
  return h;
}
function asegurarHoja_(n, cols) {
  var ss = SpreadsheetApp.getActive(), h = ss.getSheetByName(n);
  if (!h) { h = ss.insertSheet(n); h.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold'); h.setFrozenRows(1); }
  return h;
}
function climaDe_(conds, id) {
  var o = {};
  conds.filter(function (r) { return r.id_campana === id; }).forEach(function (r) {
    o[r.monitoreo] = o[r.monitoreo] || {};
    o[r.monitoreo][fecha_(r.fecha)] = { cielo: r.clima || '', mar: r.estado_mar || '', vint: r.viento || '', vdir: r.direccion_viento || '', obs: r.observaciones || '' };
  });
  return o;
}
function asegurarColumna_(n, col) {
  var h = hoja_(n), hd = encabezados_(h);
  if (hd.indexOf(col) < 0) h.getRange(1, hd.length + 1).setValue(col).setFontWeight('bold');
}
function encabezados_(h) { return h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); }); }
function leer_(n) {
  var h = hoja_(n), last = h.getLastRow();
  if (last < 2) return [];
  var hd = encabezados_(h), vals = h.getRange(2, 1, last - 1, hd.length).getValues();
  return vals.map(function (r, i) { var o = { _fila: i + 2 }; hd.forEach(function (k, j) { o[k] = r[j]; }); return o; })
             .filter(function (o) { return hd.some(function (k) { return o[k] !== ''; }); });
}
function filaDe_(h, obj) { return encabezados_(h).map(function (k) { return obj[k] === undefined ? '' : obj[k]; }); }
function agregar_(n, obj) { var h = hoja_(n); h.appendRow(filaDe_(h, obj)); }
function agregarVarias_(n, lista) {
  if (!lista.length) return;
  var h = hoja_(n), filas = lista.map(function (o) { return filaDe_(h, o); });
  h.getRange(h.getLastRow() + 1, 1, filas.length, filas[0].length).setNumberFormat('@').setValues(filas);
}
function buscarFila_(n, col, val) { return leer_(n).filter(function (r) { return String(r[col]) === String(val); })[0]; }
function actualizar_(n, col, val, cambios) { var f = buscarFila_(n, col, val); if (f) actualizarFila_(n, f._fila, cambios); }
function actualizarFila_(n, fila, cambios) {
  var h = hoja_(n), hd = encabezados_(h);
  Object.keys(cambios).forEach(function (k) {
    var j = hd.indexOf(k); if (j < 0 || cambios[k] === undefined) return;
    h.getRange(fila, j + 1).setNumberFormat('@').setValue(cambios[k]);
  });
}
function borrarDeCampana_(n, id) {
  var h = hoja_(n), filas = leer_(n).filter(function (r) { return r.id_campana === id; }).map(function (r) { return r._fila; }).sort(function (a, b) { return b - a; });
  filas.forEach(function (f) { h.deleteRow(f); });
}
function campana_(id) {
  var c = buscarFila_('Campañas', 'id_campana', id);
  if (c) c.equipo = c.equipo || '';
  return c;
}
function registrar_(u, accion, campana, detalle) { agregar_('Cambios', { fecha_hora: ahora_(), usuario: u.nombre + ' <' + u.correo + '>', accion: accion, id_campana: campana, detalle: detalle }); }

// ─── Utilidades ───────────────────────────────────────────
function lista_(s) { return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(String); }
function ahora_() { return Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd HH:mm'); }
function texto_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, 'America/Santiago', 'yyyy-MM-dd HH:mm');
  return String(v);
}
function fecha_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, 'America/Santiago', 'yyyy-MM-dd');
  return String(v).slice(0, 10);
}

// Para probar desde el editor: muestra cuántos usuarios activos hay.
function probarConfiguracion() {
  var u = leer_('Usuarios').filter(function (r) { return String(r.activo).trim() === 'Sí'; });
  Logger.log('Usuarios activos: ' + u.length + ' · ID de cliente configurado: ' + (CLIENT_ID.indexOf('PEGAR') < 0));
}
