"use strict";

const SALARIO_MINIMO_REFERENCIA = 408.8;
const TOPE_BASE_ISSS = 1000;
const TOPE_DESCUENTO_ISSS = 30;
const PORCENTAJE_ISSS = 0.03;
const PORCENTAJE_AFP = 0.0725;
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
    const asuetosSeleccionados = [
      ...document.querySelectorAll('input[name="asueto"]:checked')
    ];
    if ($("laboroAsueto").value === "si" && asuetosSeleccionados.length === 0) {
      throw new Error("Seleccione al menos un asueto nacional que haya laborado.");
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
    const totalLiquido = redondear(subtotal - descuentoISSS - descuentoAFP);

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
$("fechaIngreso").addEventListener("change", actualizarLimitesJornadas);
$("fechaFin").addEventListener("change", actualizarLimitesJornadas);
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
