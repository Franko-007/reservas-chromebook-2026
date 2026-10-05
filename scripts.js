// ==========================================
// CONFIGURACIÓN DE SUPABASE
// ==========================================
const SUPABASE_URL = "https://nhvrzmezonadnxqalgui.supabase.co";
const SUPABASE_KEY = "sb_publishable_1aGEWqQBhlzTz-R8xJksZQ_tL_YS0Od"; // <--- Pega aquí tu clave anon

const HEADERS = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=representation"
};

// ==========================================
// FUNCIONES CRUD PARA SUPABASE
// ==========================================

/**
 * Obtener todas las reservas ordenadas por id descendente
 */
async function obtenerReservas() {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/reservas?select=*&order=id.desc`, {
      method: "GET",
      headers: HEADERS
    });
    if (!response.ok) throw new Error(`Error ${response.status}: ${await response.text()}`);
    return await response.json();
  } catch (error) {
    console.error("Error al obtener reservas:", error);
    alert("Ocurrió un error al cargar las reservas.");
    return [];
  }
}

/**
 * Crear una nueva reserva
 * @param {Object} datos - Objeto con los campos de la reserva
 */
async function crearReserva(datos) {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/reservas`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(datos)
    });
    if (!response.ok) throw new Error(`Error ${response.status}: ${await response.text()}`);
    return await response.json();
  } catch (error) {
    console.error("Error al crear reserva:", error);
    alert("No se pudo guardar la reserva.");
  }
}

/**
 * Actualizar una reserva existente por ID
 * @param {number|string} id - ID de la reserva
 * @param {Object} datos - Campos a actualizar
 */
async function actualizarReserva(id, datos) {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/reservas?id=eq.${id}`, {
      method: "PATCH",
      headers: HEADERS,
      body: JSON.stringify(datos)
    });
    if (!response.ok) throw new Error(`Error ${response.status}: ${await response.text()}`);
    return await response.json();
  } catch (error) {
    console.error("Error al actualizar reserva:", error);
    alert("No se pudo actualizar la reserva.");
  }
}

/**
 * Cerrar una reserva (cambiar estado a CERRADO)
 * @param {number|string} id - ID de la reserva
 * @param {string} responsableCierre - Nombre de quien cierra
 * @param {number} devueltos - Cantidad de equipos devueltos
 */
async function cerrarReserva(id, responsableCierre, devueltos) {
  const fechaCierre = new Date().toLocaleString("es-CL");
  return await actualizarReserva(id, {
    estado_operativo: "CERRADO",
    responsable_cierre: responsableCierre,
    devueltos: devueltos,
    fecha_cierre: fechaCierre
  });
}

// ==========================================
// INTEGRACIÓN CON EL FORMULARIO (EJEMPLO)
// ==========================================

// Ejemplo de captura de formulario al enviar:
document.addEventListener("DOMContentLoaded", () => {
  const formReserva = document.getElementById("formReserva"); // Asegúrate de que coincida con el ID de tu formulario
  
  if (formReserva) {
    formReserva.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const nuevaReserva = {
        fecha: document.getElementById("fecha")?.value || "",
        hora: document.getElementById("hora")?.value || "",
        curso: document.getElementById("curso")?.value || "",
        asignatura: document.getElementById("asignatura")?.value || "",
        profesor: document.getElementById("profesor")?.value || "",
        chromebooks: parseInt(document.getElementById("chromebooks")?.value || 0),
        reemplazo: parseInt(document.getElementById("reemplazo")?.value || 0),
        observacion: document.getElementById("observacion")?.value || "",
        uso_laboratorio: document.getElementById("uso_laboratorio")?.checked || false,
        nro_equipo_reemplazo: document.getElementById("nro_equipo_reemplazo")?.value || ""
      };

      const resultado = await crearReserva(nuevaReserva);
      if (resultado) {
        alert("¡Reserva guardada con éxito!");
        formReserva.reset();
        // Cargar o refrescar la lista/tabla de reservas si tienes una función para ello
        if (typeof cargarTablaReservas === "function") cargarTablaReservas();
      }
    });
  }
});
