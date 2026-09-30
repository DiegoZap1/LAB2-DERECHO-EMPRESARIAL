// Salario mínimo mensual de referencia (USD). VERIFICA el valor vigente del sector
// de tu caso y cámbialo aquí si hace falta.
const SALARIO_MINIMO = 408.80;

const $ = (id) => document.getElementById(id);
const dinero = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

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

  const sbm = parseFloat($("ingreso").value);
  const anios = parseFloat($("anios").value);
  const meses = parseFloat($("meses").value);
  const tipo = $("tipoCierre").value;
  const hed = parseFloat($("hExtraDiurnas").value) || 0;
  const hen = parseFloat($("hExtraNocturnas").value) || 0;
  const asuetos = parseFloat($("diasAsueto").value) || 0;
  const descansos = parseFloat($("diasDescanso").value) || 0;

  // ---- Validaciones ----
  if (isNaN(sbm) || sbm <= 0) return mostrarError("Escribe un ingreso mensual mayor a cero.");
  if (isNaN(anios) || !Number.isInteger(anios) || anios < 0)
    return mostrarError("Los años laborados deben ser un número entero (0 o más).");
  if (isNaN(meses) || !Number.isInteger(meses) || meses < 0 || meses > 11)
    return mostrarError("Los meses laborados deben ser un número entero entre 0 y 11.");
  if (anios === 0 && meses === 0)
    return mostrarError("La antigüedad no puede ser 0 años y 0 meses.");
  if (!tipo) return mostrarError("Selecciona la causa de finalización de la relación laboral.");
  if ([hed, hen, asuetos, descansos].some((v) => v < 0))
    return mostrarError("Las jornadas especiales no pueden ser negativas.");

  // ---- Salarios base ----
  const sbd = sbm / 30;   // SBD = SBM / 30
  const hora = sbd / 8;   // valor de la hora ordinaria diurna (jornada de 8 h)

  // ---- Vacación proporcional ----
  // Total = SBD x 15 x 1.3 ; proporcional = (Total x meses) / 12
  const vacacionTotal = sbd * 15 * 1.3;
  const vacacion = (vacacionTotal * meses) / 12;

  // ---- Aguinaldo proporcional ----
  // PA = SBD x D (15, 19 o 21 días según antigüedad) ; proporcional por meses / 12
  let diasAguinaldo = 15;
  if (anios >= 10) diasAguinaldo = 21;
  else if (anios >= 3) diasAguinaldo = 19;
  const aguinaldo = (sbd * diasAguinaldo * meses) / 12;

  // ---- Indemnización o compensación ----
  let indem = 0;
  let etiqueta = "";
  let nota = "";

  if (tipo === "despido") {
    // Art. 58 CT: 30 días de salario por año + proporcional. Tope: 4 salarios mínimos. Mínimo: 15 días.
    etiqueta = "Indemnización por despido injustificado (Art. 58 CT)";
    const base = Math.min(sbm, 4 * SALARIO_MINIMO);
    indem = base * anios + (base / 360) * (meses * 30);
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
      indem = (base / 30) * 15 * (anios + meses / 12);
    }
  }

  // ---- Jornadas especiales ----
  const extrasDiurnas = hora * 2 * hed;            // HE = H x HL x 2
  const extrasNocturnas = hora * 1.25 * 2 * hen;   // HN = HD x 1.25, luego recargo del 100%
  const asueto = sbd * 2 * asuetos;                // SE = SBD x 2
  const descanso = sbd * 1.5 * descansos;          // SDD = SBD x 1.5

  const total = vacacion + aguinaldo + indem + extrasDiurnas + extrasNocturnas + asueto + descanso;

  // ---- Mostrar ----
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