"use strict";

const SALARIO_MINIMO_REFERENCIA = 408.8;
const TOPE_BASE_ISSS = 1000;
const TOPE_DESCUENTO_ISSS = 30;
const PORCENTAJE_ISSS = 0.03;
const PORCENTAJE_AFP = 0.0725;
let ultimoCalculo = null; // guarda el último cálculo para armar el PDF

// Retención mensual de ISR (tabla de renta). Verifica que esté vigente.
function calcularISR(base) {
  if (base <= 550) return 0;
  if (base <= 895.24) return 17.5 + (base - 550) * 0.1;
  if (base <= 2038.1) return 60 + (base - 895.24) * 0.2;
  return 288.57 + (base - 2038.1) * 0.3;
}
const DIAS_MS = 24 * 60 * 60 * 1000;

const $ = (id) => document.getElementById(id);
const formulario = $("formulario");
let secuenciaJornadas = 0;
const dinero = (valor) =>
  valor.toLocaleString("en-US", { style: "currency", currency: "USD" });
const redondear = (valor) => Math.round((valor + Number.EPSILON) * 100) / 100;

function leerFecha(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const [anio, mes, dia] = valor.split("-").map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  if (
    fecha.getFullYear() !== anio ||
    fecha.getMonth() !== mes - 1 ||
    fecha.getDate() !== dia
  ) {
    return null;
  }
  return fecha;
}

function sumarMeses(fecha, cantidad) {
  const resultado = new Date(
    fecha.getFullYear(),
    fecha.getMonth() + cantidad,
    fecha.getDate()
  );
  if (resultado.getDate() !== fecha.getDate()) resultado.setDate(0);
  return resultado;
}

function sumarDias(fecha, cantidad) {
  return new Date(
    fecha.getFullYear(),
    fecha.getMonth(),
    fecha.getDate() + cantidad,
    fecha.getHours(),
    fecha.getMinutes(),
    fecha.getSeconds(),
    fecha.getMilliseconds()
  );
}

function finExclusivo(fecha) {
  return sumarDias(fecha, 1);
}

function diasCalendario(inicio, fin) {
  const inicioUTC = Date.UTC(
    inicio.getFullYear(),
    inicio.getMonth(),
    inicio.getDate()
  );
  const finUTC = Date.UTC(fin.getFullYear(), fin.getMonth(), fin.getDate());
  return Math.round((finUTC - inicioUTC) / DIAS_MS);
}

function diferencia(inicio, fin) {
  let meses =
    (fin.getFullYear() - inicio.getFullYear()) * 12 +
    fin.getMonth() -
    inicio.getMonth();
  if (sumarMeses(inicio, meses) > fin) meses--;
  const base = sumarMeses(inicio, meses);
  const dias = Math.max(0, diasCalendario(base, fin));
  return {
    anios: Math.floor(meses / 12),
    meses: meses % 12,
    dias,
    diasComerciales: Math.min(meses * 30 + dias, 360)
  };
}

function formatoFecha(fecha) {
  return fecha.toLocaleDateString("es-SV", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

// ---------- Asuetos del año presente ----------
// Fecha de Pascua (algoritmo gregoriano) para ubicar la Semana Santa de cada año
function fechaPascua(anio) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anio, mes - 1, dia);
}

// Los "valor" deben coincidir exactamente con los value de los checkboxes del HTML
const ASUETOS = [
  { valor: "1 de enero", fecha: (a) => new Date(a, 0, 1) },
  { valor: "Jueves Santo", fecha: (a) => sumarDias(fechaPascua(a), -3) },
  { valor: "Viernes Santo", fecha: (a) => sumarDias(fechaPascua(a), -2) },
  { valor: "Sábado Santo", fecha: (a) => sumarDias(fechaPascua(a), -1) },
  { valor: "1 de mayo", fecha: (a) => new Date(a, 4, 1) },
  { valor: "10 de mayo", fecha: (a) => new Date(a, 4, 10) },
  { valor: "17 de junio", fecha: (a) => new Date(a, 5, 17) },
  { valor: "3 de agosto", fecha: (a) => new Date(a, 7, 3) },
  { valor: "5 de agosto", fecha: (a) => new Date(a, 7, 5) },
  { valor: "6 de agosto", fecha: (a) => new Date(a, 7, 6) },
  { valor: "15 de septiembre", fecha: (a) => new Date(a, 8, 15) },
  { valor: "2 de noviembre", fecha: (a) => new Date(a, 10, 2) },
  { valor: "25 de diciembre", fecha: (a) => new Date(a, 11, 25) }
];

// "Año presente" = año de la fecha de salida (el año en que se liquida).
// Si prefieres el año del reloj, cambia el return por: new Date().getFullYear()
function anioAsuetos(salida) {
  return salida.getFullYear();
}

// Devuelve un Map: nombre del asueto -> true si cae dentro del año y del período laborado
function asuetosValidos(ingreso, salida) {
  const anio = anioAsuetos(salida);
  const inicioAnio = new Date(anio, 0, 1);
  const desde = ingreso > inicioAnio ? ingreso : inicioAnio;
  const mapa = new Map();
  ASUETOS.forEach(({ valor, fecha }) => {
    const f = fecha(anio);
    mapa.set(valor, f >= desde && f <= salida);
  });
  return mapa;
}

// Bloquea y desmarca los asuetos que no cuentan según las fechas elegidas
function actualizarAsuetosDisponibles() {
  const ingreso = leerFecha($("fechaIngreso").value);
  const salida = leerFecha($("fechaFin").value);
  const opciones = document.querySelectorAll('input[name="asueto"]');

  if (!ingreso || !salida || salida < ingreso) {
    opciones.forEach((o) => { o.disabled = false; });
    return;
  }

  const validos = asuetosValidos(ingreso, salida);
  opciones.forEach((o) => {
    const ok = validos.get(o.value) === true;
    o.disabled = !ok;
    if (!ok) o.checked = false;
  });
}

function mostrarError(mensaje) {
  $("mensajeError").textContent = mensaje;
  $("mensajeError").hidden = false;
  $("resultados").hidden = true;
  $("mensajeError").focus();
}

function limpiarError() {
  $("mensajeError").textContent = "";
  $("mensajeError").hidden = true;
}

function actualizarVisibilidad() {
  const renuncia = $("tipoCierre").value === "renuncia";
  $("preguntaPreaviso").hidden = !renuncia;
  if (!renuncia) $("preaviso").value = "";

  const tieneExtras = $("tieneHorasExtra").value === "si";
  $("seccionHorasExtra").hidden = !tieneExtras;
  if (tieneExtras && $("jornadasExtras").children.length === 0) {
    agregarJornada();
  } else if (!tieneExtras) {
    $("jornadasExtras").replaceChildren();
  }

  const laboroAsueto = $("laboroAsueto").value === "si";
  $("seccionAsuetos").hidden = !laboroAsueto;
  if (!laboroAsueto) {
    document.querySelectorAll('input[name="asueto"]').forEach((opcion) => {
      opcion.checked = false;
    });
  }

  const laboroDescanso = $("laboroDescanso").value === "si";
  $("seccionDescanso").hidden = !laboroDescanso;
  if (!laboroDescanso) $("diasDescanso").value = "";

  $("fechaUltimasVacaciones").disabled = $("nuncaVacaciones").checked;
  if ($("nuncaVacaciones").checked) $("fechaUltimasVacaciones").value = "";
  actualizarLimitesJornadas();

  // Mostrar u ocultar bloque de fechas y prestaciones en especie según si recibió vacaciones
  const recibioVac = $("recibioVacaciones").value === "si";
  $("seccionPeriodoVacaciones").hidden = !recibioVac;

  if (!recibioVac) {
    $("vacacionDesde").value = "";
    $("vacacionHasta").value = "";
    $("patronoAlimentacion").checked = false;
    $("patronoAlojamiento").checked = false;
  }
  $("recibioVacaciones").addEventListener("change", actualizarVisibilidad);
}

function actualizarLimitesJornadas() {
  const ingreso = $("fechaIngreso").value;
  const salida = $("fechaFin").value;
  document.querySelectorAll(".fecha-jornada").forEach((campo) => {
    campo.min = ingreso;
    campo.max = salida;
  });
}

function agregarJornada() {
  const fila = $("plantillaJornada").content.cloneNode(true);
  const numero = ++secuenciaJornadas;
  const bloque = fila.querySelector(".jornada-extra");
  const fecha = fila.querySelector(".fecha-jornada");
  const inicio = fila.querySelector(".inicio-jornada");
  const fin = fila.querySelector(".fin-jornada");

  fecha.id = `fechaJornada${numero}`;
  inicio.id = `inicioJornada${numero}`;
  fin.id = `finJornada${numero}`;
  fila.querySelector(".etiqueta-fecha-jornada").htmlFor = fecha.id;
  fila.querySelector(".etiqueta-inicio-jornada").htmlFor = inicio.id;
  fila.querySelector(".etiqueta-fin-jornada").htmlFor = fin.id;
  fila.querySelector(".quitar-jornada").setAttribute(
    "aria-label",
    `Quitar jornada ${numero}`
  );
  $("jornadasExtras").appendChild(fila);
  actualizarLimitesJornadas();
}

function leerJornadas(ingreso, salida) {
  const filas = [...document.querySelectorAll(".jornada-extra")];
  const intervalos = [];
  let minutosDiurnos = 0;
  let minutosNocturnos = 0;

  if ($("tieneHorasExtra").value === "si" && filas.length === 0) {
    throw new Error("Agregue al menos una jornada de horas extra.");
  }

  filas.forEach((fila, indice) => {
    const fecha = leerFecha(fila.querySelector(".fecha-jornada").value);
    const horaInicio = fila.querySelector(".inicio-jornada").value;
    const horaFin = fila.querySelector(".fin-jornada").value;
    const numero = indice + 1;

    if (!fecha || !horaInicio || !horaFin) {
      throw new Error(`Complete la fecha y las dos horas de la jornada ${numero}.`);
    }
    if (fecha < ingreso || fecha > salida) {
      throw new Error(
        `La fecha de la jornada ${numero} debe estar dentro del período laborado.`
      );
    }

    const [horaIni, minutoIni] = horaInicio.split(":").map(Number);
    const [horaTermino, minutoTermino] = horaFin.split(":").map(Number);
    const inicio = new Date(
      fecha.getFullYear(),
      fecha.getMonth(),
      fecha.getDate(),
      horaIni,
      minutoIni
    );
    let fin = new Date(
      fecha.getFullYear(),
      fecha.getMonth(),
      fecha.getDate(),
      horaTermino,
      minutoTermino
    );
    if (fin.getTime() === inicio.getTime()) {
      throw new Error(`La hora de fin de la jornada ${numero} no puede ser igual a la de inicio.`);
    }
    if (fin < inicio) fin = sumarDias(fin, 1);

    const duracion = (fin.getTime() - inicio.getTime()) / 60000;
    if (duracion <= 0 || duracion > 24 * 60) {
      throw new Error(`La jornada ${numero} debe durar más de 0 y como máximo 24 horas.`);
    }

    intervalos.push({ inicio: inicio.getTime(), fin: fin.getTime(), numero });
    for (let minuto = inicio.getTime(); minuto < fin.getTime(); minuto += 60000) {
      const horaLocal = new Date(minuto).getHours();
      if (horaLocal >= 6 && horaLocal < 19) minutosDiurnos++;
      else minutosNocturnos++;
    }
  });

  intervalos.sort((a, b) => a.inicio - b.inicio);
  for (let i = 1; i < intervalos.length; i++) {
    if (intervalos[i].inicio < intervalos[i - 1].fin) {
      throw new Error(
        `Las jornadas ${intervalos[i - 1].numero} y ${intervalos[i].numero} se traslapan.`
      );
    }
  }

  return {
    horasDiurnas: minutosDiurnos / 60,
    horasNocturnas: minutosNocturnos / 60
  };
}

function calcularVacaciones(ingreso, salida, salarioDiario) {
  const fechaCampo = $("fechaUltimasVacaciones").value;
  const inicioPeriodo = $("nuncaVacaciones").checked
    ? ingreso
    : leerFecha(fechaCampo);

  if (!inicioPeriodo) {
    throw new Error(
      "Indique la fecha de inicio de sus últimas vacaciones o marque que nunca ha tomado vacaciones."
    );
  }
  if (inicioPeriodo < ingreso || inicioPeriodo > salida) {
    throw new Error(
      "La fecha de vacaciones debe estar entre la fecha de ingreso y la fecha de salida."
    );
  }

  const fin = finExclusivo(salida);
  let aniversario = inicioPeriodo;
  let completas = 0;

  while (sumarMeses(aniversario, 12) <= fin) {
    aniversario = sumarMeses(aniversario, 12);
    completas++;
  }

  const diasFraccion = diferencia(aniversario, fin).diasComerciales;
  const valorAnual = salarioDiario * 15 * 1.3;
  return {
    completas: valorAnual * completas,
    proporcionales: (valorAnual * diasFraccion) / 360
  };
}

function calcularAguinaldo(ingreso, salida, antiguedad, salarioDiario) {
  let diasPrestacion = 15;
  if (antiguedad.anios >= 10) diasPrestacion = 21;
  else if (antiguedad.anios >= 3) diasPrestacion = 19;

  const fechaDentroDelPeriodoCompleto =
    salida.getMonth() === 11 && salida.getDate() >= 12 && salida.getDate() <= 20;
  if (fechaDentroDelPeriodoCompleto) {
    return salarioDiario * diasPrestacion;
  }

  let inicioPeriodo = new Date(salida.getFullYear(), 11, 12);
  if (inicioPeriodo > salida) {
    inicioPeriodo = new Date(salida.getFullYear() - 1, 11, 12);
  }
  if (inicioPeriodo < ingreso) inicioPeriodo = ingreso;
  const dias = diferencia(inicioPeriodo, finExclusivo(salida)).diasComerciales;
  return (salarioDiario * diasPrestacion * dias) / 360;
}

function calcularIndemnizacion(tipo, preaviso, salarioMensual, antiguedad, diasFraccion) {
  if (tipo === "despido") {
    const base = Math.min(salarioMensual, 4 * SALARIO_MINIMO_REFERENCIA);
    return {
      monto: Math.max(
        base * antiguedad.anios + (base / 360) * diasFraccion,
        (base / 30) * 15
      ),
      etiqueta: "Indemnización por despido injustificado",
      nota: ""
    };
  }

  if (preaviso !== "si") {
    return {
      monto: 0,
      etiqueta: "Compensación económica por renuncia voluntaria",
      nota:
        "No aplica la prestación económica por renuncia voluntaria porque no se informó al patrono mediante preaviso formal por escrito."
    };
  }
  if (antiguedad.anios < 2) {
    return {
      monto: 0,
      etiqueta: "Compensación económica por renuncia voluntaria",
      nota:
        "No aplica la prestación económica por renuncia voluntaria porque no se cumplen dos años de servicio continuo."
    };
  }

  const base = Math.min(salarioMensual, 2 * SALARIO_MINIMO_REFERENCIA);
  return {
    monto: (base / 30) * 15 * (antiguedad.anios + diasFraccion / 360),
    etiqueta: "Compensación económica por renuncia voluntaria",
    nota: ""
  };
}

function calcular() {
  limpiarError();
  $("resultados").hidden = true;

  try {
    const salarioMensual = Number($("ingreso").value);
    const ingreso = leerFecha($("fechaIngreso").value);
    const salida = leerFecha($("fechaFin").value);
    const tipo = $("tipoCierre").value;

    if (!Number.isFinite(salarioMensual) || salarioMensual <= 0) {
      throw new Error("Ingrese un salario mensual mayor que cero.");
    }
    if (!ingreso || !salida) {
      throw new Error("Seleccione una fecha de ingreso y una fecha de salida válidas.");
    }
    if (salida < ingreso) {
      throw new Error("La fecha de salida no puede ser anterior a la fecha de ingreso.");
    }
    if (!tipo) throw new Error("Seleccione la causa de finalización de la relación laboral.");
    if (tipo === "renuncia" && !$("preaviso").value) {
      throw new Error("Indique si informó al patrono con preaviso por escrito.");
    }
    if (!$("tieneHorasExtra").value) {
      throw new Error("Indique si tiene horas extras no pagadas.");
    }
    if (!$("laboroAsueto").value) {
      throw new Error("Indique si laboró en días de asueto nacional.");
    }
    if (!$("laboroDescanso").value) {
      throw new Error("Indique si laboró en días de descanso semanal.");
    }

    let diasDescanso = 0;
    if ($("laboroDescanso").value === "si") {
      diasDescanso = Number($("diasDescanso").value);
      if (!Number.isInteger(diasDescanso) || diasDescanso < 1) {
        throw new Error("Indique una cantidad entera de días de descanso laborados mayor que cero.");
      }
    }

    const salarioDiario = salarioMensual / 30;
    const salarioHora = salarioDiario / 8;
    const antiguedad = diferencia(ingreso, finExclusivo(salida));
    const diasFraccionAntiguedad = antiguedad.meses * 30 + antiguedad.dias;
    const vacaciones = calcularVacaciones(ingreso, salida, salarioDiario);
    const aguinaldo = calcularAguinaldo(
      ingreso,
      salida,
      antiguedad,
      salarioDiario
    );
    const indemnizacion = calcularIndemnizacion(
      tipo,
      $("preaviso").value,
      salarioMensual,
      antiguedad,
      diasFraccionAntiguedad
    );

    const horas = leerJornadas(ingreso, salida);
    const extrasDiurnas = salarioHora * 2 * horas.horasDiurnas;
    const extrasNocturnas = salarioHora * 1.25 * 2 * horas.horasNocturnas;
        const asuetosDelAnio = asuetosValidos(ingreso, salida);
    const asuetosSeleccionados = [
      ...document.querySelectorAll('input[name="asueto"]:checked')
    ].filter((opcion) => asuetosDelAnio.get(opcion.value) === true);
    if ($("laboroAsueto").value === "si" && asuetosSeleccionados.length === 0) {
      throw new Error(
        `Seleccione al menos un asueto de ${anioAsuetos(salida)} que caiga dentro del período laborado.`
      );
    }
    const asueto = salarioDiario * 2 * asuetosSeleccionados.length;
    const descanso = salarioDiario * 1.5 * diasDescanso;
    const aguinaldoGravado = $("aguinaldoGravado").checked;

    const conceptos = {
      vacacionesCompletas: redondear(vacaciones.completas),
      vacacionesProporcionales: redondear(vacaciones.proporcionales),
      aguinaldo: redondear(aguinaldo),
      indemnizacion: redondear(indemnizacion.monto),
      extrasDiurnas: redondear(extrasDiurnas),
      extrasNocturnas: redondear(extrasNocturnas),
      asueto: redondear(asueto),
      descanso: redondear(descanso)
    };
    const subtotal = redondear(
      Object.values(conceptos).reduce((suma, monto) => suma + monto, 0)
    );
    const baseGravada = redondear(
      conceptos.vacacionesCompletas +
        conceptos.vacacionesProporcionales +
        (aguinaldoGravado ? conceptos.aguinaldo : 0) +
        conceptos.extrasDiurnas +
        conceptos.extrasNocturnas +
        conceptos.asueto +
        conceptos.descanso
    );
    const descuentoISSS = redondear(
      Math.min(baseGravada, TOPE_BASE_ISSS) * PORCENTAJE_ISSS
    );
    const descuentoAFP = redondear(baseGravada * PORCENTAJE_AFP);
    const descuentoISR = redondear(
      calcularISR(baseGravada - descuentoISSS - descuentoAFP)
    );
    const totalLiquido = redondear(
      subtotal - descuentoISSS - descuentoAFP - descuentoISR
    );

    $("rEmpleado").textContent = $("nombreEmpleado").value.trim() || "No indicado";
    $("rEmpresa").textContent = $("nombreEmpresa").value.trim() || "No indicada";
    $("rPeriodo").textContent = `${formatoFecha(ingreso)} al ${formatoFecha(salida)}`;
    $("rAntiguedad").textContent =
      `${antiguedad.anios} año(s), ${antiguedad.meses} mes(es) y ` +
      `${antiguedad.dias} día(s)`;
    $("rVacacionesCompletas").textContent = dinero(conceptos.vacacionesCompletas);
    $("rVacacionesProporcionales").textContent = dinero(
      conceptos.vacacionesProporcionales
    );
    $("rAguinaldo").textContent = dinero(conceptos.aguinaldo);
    $("etiquetaIndem").textContent = indemnizacion.etiqueta;
    $("rIndem").textContent = dinero(conceptos.indemnizacion);
    $("rHED").textContent = dinero(conceptos.extrasDiurnas);
    $("rHEN").textContent = dinero(conceptos.extrasNocturnas);
    $("rAsueto").textContent = dinero(conceptos.asueto);
    $("rDescanso").textContent = dinero(conceptos.descanso);
    $("rSubtotal").textContent = dinero(subtotal);
    $("rBaseGravada").textContent = dinero(baseGravada);
    $("rISSS").textContent = dinero(descuentoISSS);
    $("rAFP").textContent = dinero(descuentoAFP);
    $("rTotalLiquido").textContent = dinero(totalLiquido);
        $("rISR").textContent = dinero(descuentoISR);

    ultimoCalculo = {
      empleado: $("nombreEmpleado").value.trim() || "No indicado",
      empresa: $("nombreEmpresa").value.trim() || "No indicada",
      cargo: $("cargoEmpleado").value.trim() || "No indicado",
      salarioMensual,
      ingreso,
      salida,
      antiguedad,
      tipo,
      etiquetaIndem: indemnizacion.etiqueta,
      conceptos,
      subtotal,
      baseGravada,
      aguinaldoGravado,
      descuentoISSS,
      descuentoAFP,
      descuentoISR,
      totalLiquido
    };

    const notas = [indemnizacion.nota];
    if (asuetosSeleccionados.length) {
      notas.push(
        `Asuetos contabilizados: ${asuetosSeleccionados
          .map((opcion) => opcion.value)
          .join(", ")}.`
      );
    }
    notas.push(
      "La base gravada excluye la indemnización; ISSS se limita a $30.00 y el aguinaldo solo se incluye si se marcó como gravado."
    );
    notas.push(
      "Resultado referencial. El salario mínimo de referencia y la aplicación legal de cotizaciones deben verificarse para cada caso."
    );
    $("nota").textContent = notas.filter(Boolean).join(" ");
    $("resultados").hidden = false;
    $("resultados").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    if (error instanceof Error) mostrarError(error.message);
    else throw error;
  }

  // Factor de prestaciones accesorias (Art. 180 C.T.)
  let factorAlimentacionAlojamiento = 1.0;
  if ($("patronoAlimentacion").checked) factorAlimentacionAlojamiento += 0.25; // +25%
  if ($("patronoAlojamiento").checked) factorAlimentacionAlojamiento += 0.25;  // +25%

  // Valor del período anual ajustado (Salario de 15 días + 30% legal + recargos en especie si aplican)
  const valorVacacionAnual = (salarioDiario * 15 * 1.30) * factorAlimentacionAlojamiento;
}

formulario.addEventListener("submit", (evento) => {
  evento.preventDefault();
  calcular();
});

["tipoCierre", "tieneHorasExtra", "laboroAsueto", "laboroDescanso"].forEach(
  (id) => {
    $(id).addEventListener("change", actualizarVisibilidad);
  }
);

$("nuncaVacaciones").addEventListener("change", actualizarVisibilidad);
["fechaIngreso", "fechaFin"].forEach((id) => {
  $(id).addEventListener("change", () => {
    actualizarLimitesJornadas();
    actualizarAsuetosDisponibles();
  });
});
$("agregarJornada").addEventListener("click", agregarJornada);

$("jornadasExtras").addEventListener("click", (evento) => {
  if (evento.target.matches(".quitar-jornada")) {
    evento.target.closest(".jornada-extra").remove();
  }
});

$("btnLimpiar").addEventListener("click", () => {
  formulario.reset();
  $("jornadasExtras").replaceChildren();
  secuenciaJornadas = 0;
  limpiarError();
  $("resultados").hidden = true;
  actualizarVisibilidad();
  $("ingreso").focus();
});

actualizarVisibilidad();


// ==========================================
// EXPORTACIÓN A EXCEL (.xlsx) Y PDF
// ==========================================

function exportarAExcel() {
  if (typeof XLSX === "undefined") {
    alert("La librería de Excel aún no ha cargado. Revisa tu conexión a internet.");
    return;
  }

  if (!ultimoCalculo) {
    alert("Primero calcula la liquidación para poder exportar a Excel.");
    return;
  }

  const d = ultimoCalculo;
  const c = d.conceptos;
  const esDespido = d.tipo === "despido";
  const baseIndem = esDespido
    ? "Art. 58 CT"
    : "Ley Reguladora de la Prestación Económica por Renuncia Voluntaria";
  const totalDeducciones = redondear(d.descuentoISSS + d.descuentoAFP + d.descuentoISR);
  const exento = c.indemnizacion + (d.aguinaldoGravado ? 0 : c.aguinaldo);
  const textoExento = d.aguinaldoGravado ? "indemnización" : "indemnización y aguinaldo";

  const datosExcel = [
    ["COMPROBANTE DE LIQUIDACIÓN DE PRESTACIONES LABORALES"],
    ["República de El Salvador"],
    [""],
    ["I. DATOS DE LAS PARTES Y DE LA RELACIÓN LABORAL"],
    ["Persona trabajadora:", d.empleado.toUpperCase(), "Patrono:", d.empresa],
    ["Cargo desempeñado:", d.cargo, "Salario mensual:", d.salarioMensual],
    ["Fecha de ingreso:", formatoFecha(d.ingreso), "Fecha de terminación:", formatoFecha(d.salida)],
    [
      "Antigüedad reconocida:",
      `${d.antiguedad.anios} año(s), ${d.antiguedad.meses} mes(es) y ${d.antiguedad.dias} día(s)`,
      "Causa de terminación:",
      esDespido ? "Despido sin causa justificada" : "Renuncia voluntaria"
    ],
    [""],
    ["II. DESGLOSE DE PRESTACIONES LIQUIDADAS (DEVENGOS)"],
    ["Concepto", "Base legal", "Monto (USD)"]
  ];

  // Desglose de prestaciones devengadas
  if (c.vacacionesCompletas > 0) {
    datosExcel.push(["Vacaciones completas pendientes", "Arts. 177 y 187 CT", c.vacacionesCompletas]);
  }
  datosExcel.push(["Vacación proporcional", "Arts. 177 y 187 CT", c.vacacionesProporcionales]);
  datosExcel.push(["Aguinaldo proporcional", "Arts. 196-198 CT", c.aguinaldo]);
  datosExcel.push([
    esDespido ? "Indemnización por despido injustificado" : d.etiquetaIndem,
    baseIndem,
    c.indemnizacion
  ]);
  datosExcel.push(["Horas extras diurnas", "Art. 169 CT", c.extrasDiurnas]);
  datosExcel.push(["Horas extras nocturnas", "Arts. 168 y 169 CT", c.extrasNocturnas]);
  datosExcel.push(["Días de asueto laborados", "Art. 192 CT", c.asueto]);
  datosExcel.push(["Días de descanso semanal laborados", "Arts. 175 y 176 CT", c.descanso]);
  datosExcel.push(["TOTAL DEVENGADO (BRUTO)", "", d.subtotal]);

  // Sección de Deducciones y Base Gravada
  datosExcel.push([""]);
  datosExcel.push(["III. BASE GRAVADA, DEDUCCIONES DE LEY Y NETO A PAGAR"]);
  datosExcel.push([`Remuneración gravada: $${d.baseGravada.toFixed(2)} | Monto exento: $${exento.toFixed(2)} (${textoExento})`]);
  datosExcel.push(["Concepto", "Base legal", "Monto (USD)"]);
  datosExcel.push(["Cotización ISSS (trabajador)", "Reglamento del ISSS, Art. 29", -d.descuentoISSS]);
  datosExcel.push(["Cotización AFP (trabajador)", "Ley del Sistema de Ahorro para Pensiones", -d.descuentoAFP]);
  datosExcel.push(["Retención de ISR", "Art. 37 Ley de ISR", -d.descuentoISR]);
  datosExcel.push(["TOTAL DEDUCCIONES", "", -totalDeducciones]);
  datosExcel.push(["MONTO NETO A PAGAR", "", d.totalLiquido]);

  // Monto en letras
  datosExcel.push([""]);
  datosExcel.push(["Monto neto en letras:", numeroALetras(d.totalLiquido)]);

  // Sección de firmas y constancia
  datosExcel.push([""]);
  datosExcel.push(["IV. CONSTANCIA DE RECIBIDO Y FIRMAS"]);
  datosExcel.push([
    `La persona trabajadora ${d.empleado.toUpperCase()} declara haber recibido el detalle de las prestaciones que anteceden.`
  ]);
  datosExcel.push([""]);
  datosExcel.push(["Firma Trabajador: ______________________", "", "Firma Patrono / Representante: ______________________"]);
  datosExcel.push(["Nombre:", d.empleado, "Nombre:", d.empresa]);
  datosExcel.push(["DUI: __________________________________", "", "DUI: __________________________________"]);
  datosExcel.push(["Fecha: ________________________________", "", "Fecha: ________________________________"]);

  const ws = XLSX.utils.aoa_to_sheet(datosExcel);

  // Configuración de anchos de columna para que luzca ordenado y profesional
  ws["!cols"] = [
    { wch: 44 }, // Concepto / Etiquetas principales
    { wch: 42 }, // Base legal / Datos secundarios
    { wch: 20 }, // Monto en USD
    { wch: 35 }  // Columna auxiliar para firmas y datos patrono
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Comprobante_Liquidacion");

  const nombreArchivo = `Liquidacion_${d.empleado.replace(/\s+/g, "_") || "Calculo"}.xlsx`;
  XLSX.writeFile(wb, nombreArchivo);
}

function numeroALetras(monto) {
  const U = ["CERO","UNO","DOS","TRES","CUATRO","CINCO","SEIS","SIETE","OCHO","NUEVE","DIEZ","ONCE","DOCE","TRECE","CATORCE","QUINCE","DIECISÉIS","DIECISIETE","DIECIOCHO","DIECINUEVE","VEINTE","VEINTIUNO","VEINTIDÓS","VEINTITRÉS","VEINTICUATRO","VEINTICINCO","VEINTISÉIS","VEINTISIETE","VEINTIOCHO","VEINTINUEVE"];
  const D = ["","","","TREINTA","CUARENTA","CINCUENTA","SESENTA","SETENTA","OCHENTA","NOVENTA"];
  const C = ["","CIENTO","DOSCIENTOS","TRESCIENTOS","CUATROCIENTOS","QUINIENTOS","SEISCIENTOS","SETECIENTOS","OCHOCIENTOS","NOVECIENTOS"];

  const menor1000 = (x) => {
    if (x === 0) return "";
    if (x === 100) return "CIEN";
    const c = Math.floor(x / 100);
    const r = x % 100;
    let t = c ? C[c] : "";
    if (r) {
      if (t) t += " ";
      if (r < 30) t += U[r];
      else t += D[Math.floor(r / 10)] + (r % 10 ? " Y " + U[r % 10] : "");
    }
    return t;
  };
  const miles = (x) => {
    if (x === 0) return "CERO";
    const m = Math.floor(x / 1000);
    const r = x % 1000;
    let t = "";
    if (m) t = m === 1 ? "MIL" : menor1000(m).replace(/UNO$/, "UN") + " MIL";
    if (r) t += (t ? " " : "") + menor1000(r);
    return t;
  };

  const centavosTotales = Math.round(monto * 100);
  const entero = Math.floor(centavosTotales / 100);
  const centavos = centavosTotales % 100;
  const millones = Math.floor(entero / 1000000);
  const resto = entero % 1000000;

  let texto = "";
  if (millones) {
    texto = millones === 1 ? "UN MILLÓN" : menor1000(millones).replace(/UNO$/, "UN") + " MILLONES";
  }
  if (resto || !millones) texto += (texto ? " " : "") + miles(resto);

  return `${texto} CON ${String(centavos).padStart(2, "0")}/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA`;
}

function escaparHTML(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function construirComprobante(d, generado) {
  const c = d.conceptos;
  const esDespido = d.tipo === "despido";
  const baseIndem = esDespido
    ? "Art. 58 CT"
    : "Ley Reguladora de la Prestación Económica por Renuncia Voluntaria";
  const exento = c.indemnizacion + (d.aguinaldoGravado ? 0 : c.aguinaldo);
  const textoExento = d.aguinaldoGravado ? "indemnización" : "indemnización y aguinaldo";
  const totalDeducciones = redondear(d.descuentoISSS + d.descuentoAFP + d.descuentoISR);

  const fila = (concepto, base, monto, negativo) =>
    `<tr><td>${concepto}</td><td>${base}</td><td class="m">${negativo ? "-" : ""}${dinero(monto)}</td></tr>`;

  const filasPrestaciones = [
    c.vacacionesCompletas > 0
      ? fila("Vacaciones completas pendientes", "Arts. 177 y 187 CT", c.vacacionesCompletas)
      : "",
    fila("Vacación proporcional", "Arts. 177 y 187 CT", c.vacacionesProporcionales),
    fila("Aguinaldo proporcional", "Arts. 196-198 CT", c.aguinaldo),
    fila(esDespido ? "Indemnización por despido injustificado" : escaparHTML(d.etiquetaIndem), baseIndem, c.indemnizacion),
    fila("Horas extras diurnas", "Art. 169 CT", c.extrasDiurnas),
    fila("Horas extras nocturnas", "Arts. 168 y 169 CT", c.extrasNocturnas),
    fila("Días de asueto laborados", "Art. 192 CT", c.asueto),
    fila("Días de descanso semanal laborados", "Arts. 175 y 176 CT", c.descanso)
  ].join("");

  const nombreMayus = escaparHTML(d.empleado).toUpperCase();

  return `
<style>
  .cmp { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11px; line-height: 1.45; }
  .cmp h1 { font-size: 15px; text-align: center; margin: 0 0 2px; }
  .cmp .pais { text-align: center; margin: 0 0 14px; font-size: 11px; }
  .cmp h2 { font-size: 12px; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 1.5px solid #111; }
  .cmp table { width: 100%; border-collapse: collapse; }
  .cmp .datos td { width: 50%; padding: 5px 6px; border: 1px solid #999; vertical-align: top; }
  .cmp .desglose th { background: #e5e7eb; text-align: left; padding: 5px 6px; border: 1px solid #999; }
  .cmp .desglose td { padding: 5px 6px; border: 1px solid #999; }
  .cmp .m { text-align: right; white-space: nowrap; }
  .cmp .total td { font-weight: bold; background: #f3f4f6; }
  .cmp .neto td { font-weight: bold; font-size: 12px; background: #dcfce7; }
  .cmp .letras { margin: 8px 0 0; padding: 6px; border: 1px solid #999; }
  .cmp .firmas { width: 100%; margin-top: 30px; }
  .cmp .firmas td { width: 50%; padding: 0 12px; vertical-align: top; }
  .cmp .linea { margin: 18px 0 0; }
  .cmp .advertencia { margin-top: 26px; padding: 8px; border: 1px solid #999; font-size: 10px; }
</style>
<div class="cmp">
  <h1>COMPROBANTE DE LIQUIDACIÓN DE PRESTACIONES LABORALES</h1>
  <p class="pais">República de El Salvador</p>

  <h2>I. Datos de las partes</h2>
  <table class="datos">
    <tr><td><b>Persona trabajadora:</b> ${nombreMayus}</td><td><b>Patrono:</b> ${escaparHTML(d.empresa)}</td></tr>
    <tr><td><b>Cargo desempeñado:</b> ${escaparHTML(d.cargo)}</td><td><b>Salario mensual:</b> ${dinero(d.salarioMensual)}</td></tr>
    <tr><td><b>Fecha de ingreso:</b> ${formatoFecha(d.ingreso)}</td><td><b>Fecha de terminación:</b> ${formatoFecha(d.salida)}</td></tr>
    <tr><td><b>Antigüedad reconocida:</b> ${d.antiguedad.anios} año(s), ${d.antiguedad.meses} mes(es) y ${d.antiguedad.dias} día(s)</td><td><b>Causa de terminación:</b> ${esDespido ? "Despido sin causa justificada" : "Renuncia voluntaria"}</td></tr>
  </table>

  <h2>II. Desglose de prestaciones liquidadas</h2>
  <table class="desglose">
    <tr><th>Concepto</th><th>Base legal</th><th class="m">Monto</th></tr>
    ${filasPrestaciones}
    <tr class="total"><td colspan="2">TOTAL DEVENGADO (BRUTO)</td><td class="m">${dinero(d.subtotal)}</td></tr>
  </table>

  <h2>III. Deducciones de ley y neto a pagar</h2>
  <p style="margin: 0 0 6px;">Remuneración gravada: ${dinero(d.baseGravada)}. Monto exento de ISR y de cotizaciones: ${dinero(exento)} (${textoExento}).</p>
  <table class="desglose">
    <tr><th>Concepto</th><th>Base legal</th><th class="m">Monto</th></tr>
    ${fila("Cotización ISSS (trabajador)", "Reglamento del ISSS, Art. 29", d.descuentoISSS, true)}
    ${fila("Cotización AFP (trabajador)", "Ley del Sistema de Ahorro para Pensiones", d.descuentoAFP, true)}
    ${fila("Retención de ISR", "Art. 37 Ley de ISR", d.descuentoISR, true)}
    <tr class="total"><td colspan="2">Total de deducciones</td><td class="m">-${dinero(totalDeducciones)}</td></tr>
    <tr class="neto"><td colspan="2">MONTO NETO A PAGAR</td><td class="m">${dinero(d.totalLiquido)}</td></tr>
  </table>
  <p class="letras"><b>Monto neto en letras:</b><br>${numeroALetras(d.totalLiquido)}</p>

  <div class="salto" style="height: 1px;"></div>

  <h2>IV. Declaración</h2>
  <p style="text-align: justify;">La persona trabajadora ${nombreMayus} declara haber recibido el detalle de las prestaciones económicas que anteceden, calculadas conforme al Código de Trabajo de El Salvador, así como el desglose de las retenciones de ley aplicadas y el monto neto resultante. Este comprobante se suscribe en la fecha que se indica al pie de las firmas.</p>

  <table class="firmas">
    <tr>
      <td>
        <b>Persona trabajadora</b>
        <p class="linea">Nombre: ______________________________</p>
        <p class="linea">DUI: _________________________________</p>
        <p class="linea">Fecha: _______________________________</p>
      </td>
      <td>
        <b>Patrono o representante legal</b>
        <p class="linea">Nombre: ______________________________</p>
        <p class="linea">DUI: _________________________________</p>
        <p class="linea">Fecha: _______________________________</p>
      </td>
    </tr>
  </table>

  <div class="advertencia">
    <b>Advertencia legal</b><br>
    Este documento es un comprobante informativo del cálculo de prestaciones y NO constituye el finiquito laboral. Conforme al Art. 402 inciso 2 del Código de Trabajo, la renuncia, la terminación por mutuo consentimiento o el recibo de pago de prestaciones por despido sin causa legal solo tienen valor probatorio si constan en hojas extendidas por la Dirección General de Inspección de Trabajo o por los jueces con competencia en materia laboral, utilizadas dentro de los diez días siguientes a su expedición, o bien en documento privado autenticado ante notario. Se recomienda asesoría legal profesional antes de suscribir cualquier finiquito.
  </div>
</div>`;
}

function exportarAPDF() {
  if (!ultimoCalculo) {
    alert("Primero calcula la liquidación para poder descargar el PDF.");
    return;
  }
  if (typeof html2pdf === "undefined") {
    alert("La librería de PDF no cargó. Revisa tu conexión a internet.");
    return;
  }

  const ahora = new Date();
  const dos = (n) => String(n).padStart(2, "0");
  const generado =
    `${dos(ahora.getDate())}/${dos(ahora.getMonth() + 1)}/${ahora.getFullYear()} ` +
    `${dos(ahora.getHours())}:${dos(ahora.getMinutes())}`;

  const html = construirComprobante(ultimoCalculo, generado);
  const nombre = ultimoCalculo.empleado.replace(/\s+/g, "_");

  window.scrollTo(0, 0);

  const opciones = {
    margin: [12, 12, 18, 12],
    filename: `Comprobante_Liquidacion_${nombre}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0, backgroundColor: "#ffffff" },
    jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
    pagebreak: { mode: ["css"], before: ".salto" }
  };

  html2pdf()
    .set(opciones)
    .from(html, "string")
    .toPdf()
    .get("pdf")
    .then((pdf) => {
      const total = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= total; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(110);
        pdf.text(`Generado el ${generado}`, 12, 273);
        pdf.text(`${i} / ${total}`, 203.9, 273, { align: "right" });
      }
    })
    .save();
}

// Escuchadores de eventos para los botones
const btnPdf = $("btnExportarPDF");
const btnExcel = $("btnExportarExcel");

if (btnPdf) btnPdf.addEventListener("click", exportarAPDF);
if (btnExcel) btnExcel.addEventListener("click", exportarAExcel);