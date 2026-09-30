// Salario mínimo mensual de referencia (USD). VERIFICA el valor vigente del sector
// de tu caso y cámbialo aquí si hace falta.
const SALARIO_MINIMO = 408.80;

const $ = (id) => document.getElementById(id);
const dinero = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------- Utilidades de fechas ----------
function parseFecha(v) {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function sumarMeses(fecha, n) {
  const r = new Date(fecha.getFullYear(), fecha.getMonth() + n, fecha.getDate());
  if (r.getDate() !== fecha.getDate()) r.setDate(0); // ej: 31 ene + 1 mes -> 28/29 feb
  return r;
}

// Diferencia entre dos fechas (fin EXCLUSIVO) en años, meses y días
function diferencia(ini, finExcl) {
  let meses = (finExcl.getFullYear() - ini.getFullYear()) * 12 + (finExcl.getMonth() - ini.getMonth());
  if (sumarMeses(ini, meses) > finExcl) meses--;
  const base = sumarMeses(ini, meses);
  const dias = Math.round((finExcl - base) / 86400000);
  return { anios: Math.floor(meses / 12), meses: meses % 12, dias: Math.min(dias, 30) };
}

// El último día laborado cuenta como día trabajado, por eso se le suma 1
function finExclusivo(fin) {
  return new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() + 1);
}

function formatoFecha(f) {
  return f.toLocaleDateString("es-SV", { day: "2-digit", month: "long", year: "numeric" });
}

// "No aplica" deshabilita y pone en 0 los campos de jornadas especiales
$("noAplica").addEventListener("change", () => {
  const ids = ["hExtraDiurnas", "hExtraNocturnas", "diasAsueto", "diasDescanso"];
  ids.forEach((id) => {
    $(id).disabled = $("noAplica").checked;
    if ($("noAplica").checked) $(id).value = 0;
  });
});

$("formulario").addEventListener("submit", (e) => {
  e.preventDefault();
  calcular();
});

$("btnLimpiar").addEventListener("click", () => {
  $("formulario").reset();
  ["hExtraDiurnas", "hExtraNocturnas", "diasAsueto", "diasDescanso"].forEach((id) => {
    $(id).disabled = false;
  });
  $("mensajeError").hidden = true;
  $("resultados").hidden = true;
});

function mostrarError(msg) {
  $("mensajeError").textContent = msg;
  $("mensajeError").hidden = false;
  $("resultados").hidden = true;
}

function calcular() {
  $("mensajeError").hidden = true;

  const empleado = $("nombreEmpleado").value.trim();
  const empresa = $("nombreEmpresa").value.trim();
  const sbm = parseFloat($("ingreso").value);
  const tipo = $("tipoCierre").value;
  const hed = parseFloat($("hExtraDiurnas").value) || 0;
  const hen = parseFloat($("hExtraNocturnas").value) || 0;
  const asuetos = parseFloat($("diasAsueto").value) || 0;
  const descansos = parseFloat($("diasDescanso").value) || 0;

  // ---- Validaciones ----
  if (isNaN(sbm) || sbm <= 0) return mostrarError("Escribe un ingreso mensual mayor a cero.");
  if (!$("fechaIngreso").value) return mostrarError("Selecciona la fecha de ingreso.");
  if (!$("fechaFin").value) return mostrarError("Selecciona el último día laborado.");

  const ingresoFecha = parseFecha($("fechaIngreso").value);
  const finFecha = parseFecha($("fechaFin").value);
  if (finFecha < ingresoFecha)
    return mostrarError("El último día laborado no puede ser anterior a la fecha de ingreso.");

  if (!tipo) return mostrarError("Selecciona la causa de finalización de la relación laboral.");
  if ([hed, hen, asuetos, descansos].some((v) => v < 0))
    return mostrarError("Las jornadas especiales no pueden ser negativas.");

  // ---- Antigüedad exacta a partir de las fechas ----
  const finExcl = finExclusivo(finFecha);
  const ant = diferencia(ingresoFecha, finExcl);
  const anios = ant.anios;
  const meses = ant.meses;
  const dias = ant.dias;
  const diasFraccion = meses * 30 + dias; // fracción de año en días comerciales

  // ---- Salarios base ----
  const sbd = sbm / 30;   // SBD = SBM / 30
  const hora = sbd / 8;   // valor de la hora ordinaria diurna (jornada de 8 h)

  // ---- Vacación proporcional ----
  // Total = SBD x 15 x 1.3 ; proporcional = Total x días desde el último aniversario / 360
  const vacacionTotal = sbd * 15 * 1.3;
  const vacacion = (vacacionTotal * diasFraccion) / 360;

  // ---- Aguinaldo proporcional ----
  // PA = SBD x D (15, 19 o 21 días según antigüedad); se prorratea desde el último 12 de diciembre
  let diasAguinaldo = 15;
  if (anios >= 10) diasAguinaldo = 21;
  else if (anios >= 3) diasAguinaldo = 19;

  let inicioAg = new Date(finFecha.getFullYear(), 11, 12);
  if (inicioAg > finFecha) inicioAg = new Date(finFecha.getFullYear() - 1, 11, 12);
  if (inicioAg < ingresoFecha) inicioAg = ingresoFecha;
  const difAg = diferencia(inicioAg, finExcl);
  const diasAg = Math.min(difAg.meses * 30 + difAg.dias, 360);
  const aguinaldo = ((sbd * diasAguinaldo) / 360) * diasAg;

  // ---- Indemnización o compensación ----
  let indem = 0;
  let etiqueta = "";
  let nota = "";

  if (tipo === "despido") {
    // Art. 58 CT: 30 días de salario por año + proporcional. Tope: 4 salarios mínimos. Mínimo: 15 días.
    etiqueta = "Indemnización por despido injustificado (Art. 58 CT)";
    const base = Math.min(sbm, 4 * SALARIO_MINIMO);
    indem = base * anios + (base / 360) * diasFraccion;
    const minimo = (base / 30) * 15;
    if (indem < minimo) indem = minimo;
  } else {
    // Ley Reguladora de la Prestación Económica por Renuncia Voluntaria:
    // 15 días de salario por año, tope 2 salarios mínimos, mínimo 2 años de servicio.
    etiqueta = "Compensación económica por renuncia voluntaria";
    if (anios < 2) {
      indem = 0;
      nota = "Para la prestación por renuncia se requieren al menos 2 años de servicio continuo, por eso este monto es $0.00. ";
    } else {
      const base = Math.min(sbm, 2 * SALARIO_MINIMO);
      indem = (base / 30) * 15 * (anios + diasFraccion / 360);
    }
  }

  // ---- Jornadas especiales ----
  const extrasDiurnas = hora * 2 * hed;            // HE = H x HL x 2
  const extrasNocturnas = hora * 1.25 * 2 * hen;   // HN = HD x 1.25, luego recargo del 100%
  const asueto = sbd * 2 * asuetos;                // SE = SBD x 2
  const descanso = sbd * 1.5 * descansos;          // SDD = SBD x 1.5

  const total = vacacion + aguinaldo + indem + extrasDiurnas + extrasNocturnas + asueto + descanso;

  // ---- Mostrar ----
  $("rEmpleado").textContent = empleado;
  $("rEmpresa").textContent = empresa;
  $("rPeriodo").textContent = formatoFecha(ingresoFecha) + " al " + formatoFecha(finFecha);
  $("rAntiguedad").textContent = anios + " año(s), " + meses + " mes(es) y " + dias + " día(s)";

  $("rVacacion").textContent = dinero(r2(vacacion));
  $("rAguinaldo").textContent = dinero(r2(aguinaldo));
  $("etiquetaIndem").textContent = etiqueta;
  $("rIndem").textContent = dinero(r2(indem));
  $("rHED").textContent = dinero(r2(extrasDiurnas));
  $("rHEN").textContent = dinero(r2(extrasNocturnas));
  $("rAsueto").textContent = dinero(r2(asueto));
  $("rDescanso").textContent = dinero(r2(descanso));
  $("rTotal").textContent = dinero(r2(total));
  $("nota").textContent = nota + "Resultado referencial; el Ministerio de Trabajo puede variar por centavos al usar días calendario.";
  $("resultados").hidden = false;
  $("resultados").scrollIntoView({ behavior: "smooth" });
}