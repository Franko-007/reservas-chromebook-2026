// ==================== CONFIGURACIÓN ====================
// IMPORTANTE: Reemplazar esta URL con la URL de tu Web App después de desplegar el código.gs
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwL_xyB3ECAmTSPa29Av-mV6kUf-LSwCG4hzYmmlrQk9IGCIOR2SiINMfoklbS0iVI/exec";

let STOCK_MAXIMO   = 115; // sobreescrito por config del Sheets si está disponible
let STOCK_REEMPLAZO = 4;
let DOCENTES_NSG = ["ALEXIS CORTÉS", "ALLYSON RIOS", "ANA OGAZ", "ANDREA SALAZAR", "ANDREA DONOSO", "AVIGUEY GONZALEZ", "CAMILA CONTRERAS", "CAMILA GONZÁLEZ", "CARLA MERA", "CARLOS ARAYA", "CARMEN ÁLVAREZ", "CAROLINA MIRANDA", "CAROLINA REYES", "CECILIA GARCÍA", "CLAUDIA TOLEDO", "CONSTANZA LÓPEZ", "DANIEL VITTA", "DANIELA VERA", "DANIELA VALENZUELA", "DEBORA GAETE", "DEBORA GONZÁLEZ", "ELIZABETH MIRANDA", "ERIKA KINDERMANN", "FERNANDA RÍOS", "FRANCISCA MAUREIRA", "FRANCISCA COFRÉ", "FRANCISCA VIZCAYA", "GIOVANNA ARIAS", "GOLDIE FARÍAS", "HERNÁN REYES", "JAVIERA ALIAGA", "JOAQUÍN ALMUNA", "KARIMME GUTIÉRREZ", "KARINA BARRIOS", "KAROLINA RIFFO", "LEONARDO RÍOS", "LORENA ARANCIBIA", "LUIS SÁNCHEZ", "MACARENA BELTRÁN", "MARÍA MONZÓN", "MARÍA GONZÁLEZ", "MARISOL GUAJARDO", "MATÍAS CUEVAS", "NATALIA CARTES", "NATALY HIDALGO", "NICOLE BELLO", "PAOLA ÁVILA", "PATRICIA NÚÑEZ", "PAULINA ARGOMEDO", "PRISCILA VALENZUELA", "REINA ORTEGA", "STEPHANY GUZMÁN", "VÍCTOR BARRIENTOS", "YADIA CERDA", "YARITZA LEÓN", "YESSENIA SÁNCHEZ"];

function _applyConfig(config) {
    if (!config) return;
    if (config.stock_maximo    && !isNaN(config.stock_maximo))    STOCK_MAXIMO    = parseInt(config.stock_maximo);
    if (config.stock_reemplazo && !isNaN(config.stock_reemplazo)) STOCK_REEMPLAZO = parseInt(config.stock_reemplazo);
    if (Array.isArray(config.docentes) && config.docentes.length > 0) {
        DOCENTES_NSG = config.docentes.map(d => String(d).toUpperCase().trim()).filter(Boolean);
    }
    console.log(`⚙️ Config desde Sheets: stock=${STOCK_MAXIMO}, reemplazo=${STOCK_REEMPLAZO}, docentes=${DOCENTES_NSG.length}`);
}

let db = [];
let viewDate = new Date();
viewDate.setDate(1);
let filterMode = 'all';
let currentWeek = 0;
let charts = { A: null, D: null, S: null, DS: null };
let _docentesExtra = [];
let debounceTimer;
let _wizardStep = 1;
const WIZARD_TOTAL = 3;
const mNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// ==================== FUNCIONES AUXILIARES ====================
function isDamagedRecord(record) {
    const obs = (record.observacion || "").toLowerCase();
    const damagedKeywords = ["daño", "pantalla", "teclado", "no enciende", "rota", "rayada", "falla", "malo", "averiado", "roto", "golpe", "quemado", "rayado", "sin rótulo", "sin rotulo", "sucio", "sin tecla"];
    const hasDamageKeyword = damagedKeywords.some(keyword => obs.includes(keyword));
    const hasDamageState = record.estado_dev === "danio";
    return hasDamageKeyword || hasDamageState;
}

// ==================== CALENDARIO ESCOLAR NSG 2026 ====================
// Semanas basadas en días hábiles reales (lunes–viernes, sin feriados).
// Clave: "YYYY-M" (mes 0-indexed). Cada semana tiene { start, end, label }.
const SCHOOL_WEEKS = {
    // MAYO 2026 (mes 4)
    "2026-4": {
        1: { start: 4,  end: 8,  label: "Semana 1" },   // 4–8 may
        2: { start: 11, end: 15, label: "Semana 2" },   // 11–15 may
        3: { start: 18, end: 20, label: "Semana 3" },   // 18–20 may (21-22 feriados)
        4: { start: 25, end: 29, label: "Semana 4" }    // 25–29 may
    },
    // JUNIO 2026 (mes 5)
    "2026-5": {
        1: { start: 1,  end: 5,  label: "Semana 1" },
        2: { start: 8,  end: 12, label: "Semana 2" },
        3: { start: 15, end: 19, label: "Semana 3" }
        // Vacaciones de invierno desde el 22 de junio → no hay semana 4
    },
    // JULIO 2026 (mes 6) — vacaciones 22 jun al 3 jul, vuelta lunes 6 jul
    "2026-6": {
        1: { start: 6,  end: 10, label: "Semana 1" },
        2: { start: 13, end: 17, label: "Semana 2" },
        3: { start: 20, end: 24, label: "Semana 3" },
        4: { start: 27, end: 31, label: "Semana 4" }
    },
    // AGOSTO 2026 (mes 7) — sin feriados nacionales en días hábiles
    "2026-7": {
        1: { start: 3,  end: 7,  label: "Semana 1" },
        2: { start: 10, end: 14, label: "Semana 2" },
        3: { start: 17, end: 21, label: "Semana 3" },
        4: { start: 24, end: 28, label: "Semana 4" },
        5: { start: 31, end: 31, label: "Semana 5" }
    },
    // SEPTIEMBRE 2026 (mes 8)
    // 18 (vie) y 19 (sáb) Fiestas Patrias + vacaciones semana del 14 al 17
    // Vuelta el lunes 21
    "2026-8": {
        1: { start: 1,  end: 4,  label: "Semana 1" },   // lun 1 – jue 4
        2: { start: 7,  end: 11, label: "Semana 2" },   // lun 7 – vie 11
        // Semana 14–17 = vacaciones Fiestas Patrias → no existe
        3: { start: 21, end: 25, label: "Semana 3" },   // vuelta lun 21 – vie 25
        4: { start: 28, end: 30, label: "Semana 4" }    // lun 28 – mié 30
    },
    // OCTUBRE 2026 (mes 9)
    // 12 (lun) Día de la Raza → semana 3 empieza el martes 13
    "2026-9": {
        1: { start: 1,  end: 2,  label: "Semana 1" },   // jue 1 – vie 2
        2: { start: 5,  end: 9,  label: "Semana 2" },   // lun 5 – vie 9
        3: { start: 13, end: 16, label: "Semana 3" },   // mar 13 – vie 16 (12 feriado)
        4: { start: 19, end: 23, label: "Semana 4" },   // lun 19 – vie 23
        5: { start: 26, end: 30, label: "Semana 5" }    // lun 26 – vie 30
    },
    // NOVIEMBRE 2026 (mes 10)
    // 1 (dom) Todos los Santos, 2 (lun) feriado → semana 1 empieza el martes 3
    "2026-10": {
        1: { start: 3,  end: 6,  label: "Semana 1" },   // mar 3 – vie 6 (2 feriado)
        2: { start: 9,  end: 13, label: "Semana 2" },
        3: { start: 16, end: 20, label: "Semana 3" },
        4: { start: 23, end: 27, label: "Semana 4" },
        5: { start: 30, end: 30, label: "Semana 5" }
    },
    // DICIEMBRE 2026 (mes 11)
    // 8 (mar) Inmaculada Concepción → semana 2 va lun 7, mié 9 – vie 11 (el martes 8 feriado)
    "2026-11": {
        1: { start: 1,  end: 4,  label: "Semana 1" },   // mar 1 – vie 4
        2: { start: 7,  end: 11, label: "Semana 2" },   // lun 7 – vie 11 (8 feriado interno)
        3: { start: 14, end: 18, label: "Semana 3" },
        4: { start: 21, end: 23, label: "Semana 4" }    // fin de año escolar aprox
    },
    // MARZO 2026 (mes 2) — referencia histórica
    "2026-2": {
        1: { start: 2,  end: 6,  label: "Semana 1" },
        2: { start: 9,  end: 13, label: "Semana 2" },
        3: { start: 16, end: 20, label: "Semana 3" },
        4: { start: 23, end: 27, label: "Semana 4" }
    },
    // ABRIL 2026 (mes 3)
    "2026-3": {
        1: { start: 1,  end: 3,  label: "Semana 1" },   // Semana Santa
        2: { start: 6,  end: 9,  label: "Semana 2" },   // 10 abr feriado
        3: { start: 13, end: 17, label: "Semana 3" },
        4: { start: 20, end: 24, label: "Semana 4" },
        5: { start: 27, end: 30, label: "Semana 5" }
    }
};

/**
 * Devuelve las semanas escolares para un año/mes dado.
 * Si el mes está en SCHOOL_WEEKS, usa ese calendario real.
 * Si no, genera semanas genéricas lunes–viernes como fallback.
 */
function getWeekRanges(year, month) {
    const key = `${year}-${month}`;
    if (SCHOOL_WEEKS[key]) return SCHOOL_WEEKS[key];

    // Fallback genérico: semanas de lunes a viernes
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1);
    // Encontrar primer lunes
    let d = new Date(firstDay);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    const ranges = {};
    let w = 1;
    while (d.getDate() <= daysInMonth && d.getMonth() === month) {
        const start = d.getDate();
        const end = Math.min(start + 4, daysInMonth);
        ranges[w] = { start, end, label: `Semana ${w}` };
        w++;
        d.setDate(d.getDate() + 7);
    }
    return ranges;
}

/**
 * Detecta el número de semana escolar correspondiente a una fecha.
 * Retorna el número de semana (1-based) o el más cercano.
 */
function getCurrentSchoolWeek(year, month, day) {
    const ranges = getWeekRanges(year, month);
    const weeks = Object.keys(ranges).map(Number).sort((a, b) => a - b);
    // Buscar semana exacta
    for (const w of weeks) {
        if (day >= ranges[w].start && day <= ranges[w].end) return w;
    }
    // Si el día cae entre semanas (feriado, fin de semana), encontrar la más cercana
    let closest = weeks[weeks.length - 1];
    let minDist = Infinity;
    for (const w of weeks) {
        const mid = (ranges[w].start + ranges[w].end) / 2;
        const dist = Math.abs(day - mid);
        if (dist < minDist) { minDist = dist; closest = w; }
    }
    return closest;
}

// ==================== FORMATO HORA MANUAL 24H ====================
function formatHoraInput(input) {
    const cursorPos = input.selectionStart;
    let raw = input.value;

    // Si el usuario escribió manualmente el ":", respetarlo
    if (raw.includes(':')) {
        // Validar lo que hay
        const parts = raw.split(':');
        const h = parseInt(parts[0]) || 0;
        const m = parseInt(parts[1]) || 0;
        if (parts[0].length > 0 && parts[1] !== undefined) {
            const valid = h <= 23 && m <= 59 && parts[1].length <= 2;
            input.setCustomValidity(valid ? '' : 'Hora inválida');
            input.classList.toggle('is-invalid', !valid);
        }
        return;
    }

    // Solo dígitos sin ":"
    let digits = raw.replace(/\D/g, '').slice(0, 4);

    if (digits.length === 0) {
        input.value = '';
        input.setCustomValidity('');
        input.classList.remove('is-invalid');
        return;
    }

    // Con 3 dígitos: puede ser H:MM (ej: 820 → 8:20) o seguir esperando el 4to
    // Con 4 dígitos: siempre HH:MM (ej: 0830 → 08:30)
    if (digits.length === 4) {
        const h = parseInt(digits.slice(0, 2));
        const m = parseInt(digits.slice(2));
        input.value = digits.slice(0, 2) + ':' + digits.slice(2);
        const valid = h <= 23 && m <= 59;
        input.setCustomValidity(valid ? '' : 'Hora inválida');
        input.classList.toggle('is-invalid', !valid);
    } else if (digits.length === 3) {
        // Heurística: si primer dígito > 2, es seguro que es H:MM (ej: 820 = 8:20)
        // Si primer dígito <= 2, esperar 4to dígito pero mostrar provisional
        const firstDigit = parseInt(digits[0]);
        if (firstDigit >= 3) {
            // Imposible que sea HH:MM con inicio >= 3 en dos dígitos válidos (30xx no existe)
            // Tratar como H:MM
            const h = parseInt(digits[0]);
            const m = parseInt(digits.slice(1));
            input.value = digits[0] + ':' + digits.slice(1);
            const valid = h <= 9 && m <= 59;
            input.setCustomValidity(valid ? '' : 'Hora inválida');
            input.classList.toggle('is-invalid', !valid);
        } else {
            // Mostrar sin formatear todavía, esperar 4to dígito
            input.value = digits;
            input.setCustomValidity('');
            input.classList.remove('is-invalid');
        }
    } else {
        input.value = digits;
        input.setCustomValidity('');
        input.classList.remove('is-invalid');
    }
}

// Al salir del campo (blur), forzar formato completo y padding
function padHoraInput(input) {
    let val = input.value.trim();
    if (!val) return;

    // Si no tiene ":", intentar interpretar
    if (!val.includes(':')) {
        const digits = val.replace(/\D/g, '');
        if (digits.length === 3) {
            const firstDigit = parseInt(digits[0]);
            if (firstDigit >= 3) {
                val = digits[0] + ':' + digits.slice(1);
            } else {
                // Ambiguo con 3 dígitos y primer dígito <= 2: asumir H:MM
                val = digits[0] + ':' + digits.slice(1);
            }
        } else if (digits.length === 4) {
            val = digits.slice(0, 2) + ':' + digits.slice(2);
        } else if (digits.length === 1 || digits.length === 2) {
            // Solo hora sin minutos: agregar :00
            val = digits.padStart(2, '0') + ':00';
        }
    }

    // Separar y hacer padding
    const parts = val.split(':');
    if (parts.length === 2) {
        const h = parseInt(parts[0]);
        const m = parseInt(parts[1]) || 0;
        if (h <= 23 && m <= 59) {
            input.value = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
            input.setCustomValidity('');
            input.classList.remove('is-invalid');
        } else {
            input.setCustomValidity('Hora inválida');
            input.classList.add('is-invalid');
        }
    }
}

function fillDocentes() {
    const select = document.getElementById('fProfesor');
    if (!select) return;
    const valorActual = select.value;
    select.innerHTML = '<option value="">Seleccione un docente...</option>';
    [...DOCENTES_NSG, ..._docentesExtra].sort().forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        select.appendChild(opt);
    });
    if (valorActual) select.value = valorActual;
}

function agregarDocente() {
    const nombre = prompt("Ingrese el nombre completo del docente:");
    if (!nombre || !nombre.trim()) return;
    const nombreFinal = nombre.trim().toUpperCase();
    const sel = document.getElementById('fProfesor');
    const yaExiste = DOCENTES_NSG.includes(nombreFinal) || _docentesExtra.includes(nombreFinal);
    if (!yaExiste) {
        _docentesExtra.push(nombreFinal);
        fillDocentes();
    }
    sel.value = nombreFinal;
    saveDraft();
}

function debouncedRender() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderAll, 300);
}

// ==================== CARGA DE DATOS ====================
// Caché en sessionStorage (por pestaña/equipo — no interfiere entre dispositivos).
// El GAS también tiene CacheService del lado servidor (5 min), así que la
// combinación es: GAS devuelve rápido desde caché de servidor, y si el fetch
// falla mostramos los datos de la sesión anterior con aviso visual.
const CACHE_KEY   = 'cb_nsg_cache';
const CACHE_TS    = 'cb_nsg_cache_ts';
const CACHE_TTL   = 5 * 60 * 1000; // 5 minutos

function _saveSessionCache(data) {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
        sessionStorage.setItem(CACHE_TS, Date.now().toString());
    } catch(e) { /* cuota llena, no es crítico */ }
}

function _loadSessionCache() {
    try {
        const ts   = parseInt(sessionStorage.getItem(CACHE_TS) || '0');
        const raw  = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        return { data: JSON.parse(raw), age: Date.now() - ts, fresh: (Date.now() - ts) < CACHE_TTL };
    } catch(e) { return null; }
}

function _showOfflineBanner(msg) {
    let banner = document.getElementById('offlineBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'offlineBanner';
        banner.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#856404;color:#fff;padding:10px 22px;border-radius:30px;font-size:0.82rem;font-weight:700;z-index:9000;box-shadow:0 4px 12px rgba(0,0,0,0.25);display:flex;align-items:center;gap:10px;';
        document.body.appendChild(banner);
    }
    banner.innerHTML = `⚡ ${msg} <button onclick="load()" style="background:rgba(255,255,255,0.25);border:none;border-radius:20px;color:white;padding:2px 12px;cursor:pointer;font-weight:700;">Reintentar</button>`;
    banner.style.display = 'flex';
}

function _hideOfflineBanner() {
    const b = document.getElementById('offlineBanner');
    if (b) b.style.display = 'none';
}

function _applyData(records, skipWeekDetect) {
    db = records;
    if (!skipWeekDetect) {
        const _hoy = new Date();
        const _esEsteMes = _hoy.getFullYear() === viewDate.getFullYear() && _hoy.getMonth() === viewDate.getMonth();
        if (_esEsteMes) {
            const _semana = getCurrentSchoolWeek(_hoy.getFullYear(), _hoy.getMonth(), _hoy.getDate());
            currentWeek = _semana;
            document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === _semana));
        }
    }
    renderAll();
}

async function load() {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'flex';
    fillDocentes();

    // Si hay caché fresco en esta sesión, mostrar de inmediato y luego actualizar en background
    const cached = _loadSessionCache();
    if (cached && cached.fresh) {
        _applyData(cached.data, false);
        if (loadingEl) loadingEl.style.display = 'none';
        const mins = Math.round(cached.age / 60000);
        updateSyncChip('cache', mins || 1);
        // Actualizar silenciosamente en background
        fetch(SCRIPT_URL).then(r => r.json()).then(data => {
            if (data.status === 'success') {
                _saveSessionCache(data.data);
                _applyData(data.data, true);
                _hideOfflineBanner();
                updateSyncChip('fresh', 0);
            }
        }).catch(() => {}); // fallo silencioso, ya tenemos datos
        return;
    }

    try {
        const response = await fetch(SCRIPT_URL);
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();

        if (data.status === 'success') {
            _saveSessionCache(data.data);
            _applyConfig(data.config || null);
            _hideOfflineBanner();
            updateSyncChip('fresh', 0);
            console.log('✅ Datos cargados:', data.data.length, 'registros');
            
            Swal.fire({
                icon: 'success',
                title: 'Datos sincronizados',
                text: `Se cargaron ${data.data.length} registros correctamente`,
                timer: 2000,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
            });

            _applyData(data.data, false);
        } else {
            throw new Error(data.message || 'Error al cargar datos');
        }

    } catch (error) {
        console.error('❌ Error detallado:', error);

        // Intentar recuperar de caché aunque sea antiguo
        const stale = _loadSessionCache();
        if (stale) {
            _applyData(stale.data, true);
            const mins = Math.round(stale.age / 60000);
            _showOfflineBanner(`Sin conexión — mostrando datos de hace ${mins} min.`);
            updateSyncChip('offline', mins);
        } else if (error.message.includes('FETCH_ERROR') || error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
            Swal.fire({
                icon: 'error',
                title: 'Error de Conexión',
                html: 'No se pudieron cargar los datos debido a restricciones de CORS.<br><br>' +
                      '<b>Solución:</b><br>' +
                      '1. Abre Google Apps Script<br>' +
                      '2. Ve a "Publicar" > "Implementar como aplicación web"<br>' +
                      '3. Asegúrate de que "Quién tiene acceso" sea "Cualquier persona"<br>' +
                      '4. Copia la NUEVA URL generada y actualiza SCRIPT_URL<br>' +
                      '5. En el código.gs verifica: <code style="font-size:11px;">ContentService.MimeType.JSON</code>',
                confirmButtonText: 'Entendido'
            });
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error de Conexión',
                text: 'No se pudieron cargar los datos de Google Sheets. Verifica que el script esté publicado correctamente.',
                footer: '<a href="#" onclick="location.reload()">Intentar de nuevo</a>'
            });
        }
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

// Clasificador de estado de un registro (usado por el filtro de estado)
function getEstado(d) {
    const totalOut = parseInt(d.chromebooks || 0) + parseInt(d.reemplazo || 0);
    if (isDamagedRecord(d)) return 'dañado';
    const isLab = d.uso_laboratorio === true || d.uso_laboratorio === "TRUE" || d.uso_laboratorio === "true";
    if (isLab) return 'lab';
    if (totalOut === parseInt(d.devueltos || 0) && parseInt(d.devueltos || 0) > 0) return 'ok';
    return 'pendiente';
}

// Genera los tabs de semana según el mes actual (soporta 3, 4 o 5 semanas)
function renderWeekTabs() {
    const container = document.getElementById('weekTabsContainer');
    if (!container) return;
    const ranges = getWeekRanges(viewDate.getFullYear(), viewDate.getMonth());
    const keys   = Object.keys(ranges).map(Number).sort((a, b) => a - b);

    let html = `<button class="tab-btn ${currentWeek === 0 ? 'active' : ''}" id="t0" onclick="setFilterWeek(0)">Mes Completo</button>`;
    keys.forEach(w => {
        const r = ranges[w];
        const label = r.label || `Semana ${w}`;
        const rangeStr = `${r.start}–${r.end}`;
        html += `<button class="tab-btn ${currentWeek === w ? 'active' : ''}" id="t${w}" onclick="setFilterWeek(${w})" title="${label} · días ${rangeStr}">${label}</button>`;
    });
    container.innerHTML = html;
}

// ==================== RENDERIZADO PRINCIPAL ====================
function renderAll() {
    const displayDateEl = document.getElementById('displayDate');
    if (displayDateEl) displayDateEl.innerText = `${mNames[viewDate.getMonth()]} ${viewDate.getFullYear()}`;

    // Regenerar tabs dinámicamente (soporta 3/4/5 semanas según mes)
    renderWeekTabs();

    const searchTerm   = (document.getElementById('searchBox')?.value || "").toLowerCase().trim();
    const courseFilter = document.getElementById('courseSelect')?.value || "";
    const estadoFilter = document.getElementById('estadoSelect')?.value || "";
    const weekRanges = getWeekRanges(viewDate.getFullYear(), viewDate.getMonth());

    const baseFiltered = db.filter(d => {
        const date = new Date(d.fecha + "T00:00:00");
        return !isNaN(date) && date.getMonth() === viewDate.getMonth() && date.getFullYear() === viewDate.getFullYear();
    });

    const finalFiltered = baseFiltered.filter(d => {
        const matchSearch = [d.profesor, d.asignatura, d.curso, d.observacion]
            .map(v => (v || '').toLowerCase())
            .some(v => v.includes(searchTerm));
        const matchCourse = courseFilter === "" || d.curso === courseFilter;
        let matchWeek = true;
        if (currentWeek > 0 && weekRanges[currentWeek]) {
            const day = new Date(d.fecha + "T00:00:00").getDate();
            matchWeek = (day >= weekRanges[currentWeek].start && day <= weekRanges[currentWeek].end);
        }

        const totalOut = (parseInt(d.chromebooks || 0) + parseInt(d.reemplazo || 0));
        const isDebt = totalOut > parseInt(d.devueltos || 0);
        const isDamaged = isDamagedRecord(d);
        const isLab = d.uso_laboratorio === true || d.uso_laboratorio === "TRUE" || d.uso_laboratorio === "true";

        let matchMode = true;
        if (filterMode === 'lab') matchMode = isLab;
        else if (filterMode === 'reemp') matchMode = parseInt(d.reemplazo || 0) > 0;
        else if (filterMode === 'ok') matchMode = !isDebt && parseInt(d.devueltos) > 0;
        else if (filterMode === 'debt') matchMode = isDebt && !isDamaged;
        else if (filterMode === 'damaged') matchMode = isDamaged;

        let matchEstado = true;
        if (estadoFilter) {
            const estado = getEstado(d);
            matchEstado = estado === estadoFilter;
        }

        return matchSearch && matchCourse && matchWeek && matchMode && matchEstado;
    });

    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    const tableEl = document.getElementById('mainTable');

    if (finalFiltered.length === 0) {
        if (tableEl) tableEl.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        const contadorEl = document.getElementById('recordCount');
        if (contadorEl) contadorEl.textContent = '0 registros';
    } else {
        if (tableEl) tableEl.style.display = 'table';
        if (emptyState) emptyState.style.display = 'none';

        const sorted = [...finalFiltered].sort((a, b) => {
            // Primero ordenar por fecha descendente (más reciente primero)
            const fechaDiff = new Date(b.fecha) - new Date(a.fecha);
            if (fechaDiff !== 0) return fechaDiff;
            // Mismo día: ordenar por hora ascendente (08:00 antes que 09:00)
            const horaA = (a.hora || '00:00').trim();
            const horaB = (b.hora || '00:00').trim();
            return horaA.localeCompare(horaB);
        });
        window._lastSortedData = sorted;

        const contadorEl = document.getElementById('recordCount');
        if (contadorEl) contadorEl.textContent = `${sorted.length} registro${sorted.length !== 1 ? 's' : ''}`;

        const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        let lastDay = null;
        const rows = [];

        sorted.forEach(r => {
            const totalOut = parseInt(r.chromebooks) + parseInt(r.reemplazo);
            const isOK = totalOut === parseInt(r.devueltos);
            const isDamaged = isDamagedRecord(r);
            const isLab = r.uso_laboratorio === true || r.uso_laboratorio === "TRUE" || r.uso_laboratorio === "true";

            if (r.fecha !== lastDay) {
                lastDay = r.fecha;
                const fechaObj = new Date(r.fecha + "T00:00:00");
                const diaNombre = diasSemana[fechaObj.getDay()];
                const fechaFmt = r.fecha.split('-').reverse().slice(0, 2).join('/');
                const registrosDia = sorted.filter(x => x.fecha === r.fecha);
                const labsDia = registrosDia.filter(x => x.uso_laboratorio === true || x.uso_laboratorio === "TRUE" || x.uso_laboratorio === "true").length;
                const labBadge = labsDia > 0 ? `<span class="ms-2" style="background:#ede7ff;color:#6f42c1;padding:2px 9px;border-radius:20px;font-size:0.68rem;font-weight:800;">🟣 LAB ×${labsDia}</span>` : '';
                rows.push(`<tr class="day-separator-row">
                    <td colspan="10" style="background:#4a4a4a;border-left:5px solid #222;border-top:1px solid #333;border-bottom:1px solid #333;padding:8px 16px;font-size:0.78rem;font-weight:800;color:#f0f0f0;letter-spacing:0.8px;text-transform:uppercase;">
                        <span style="display:inline-flex;align-items:center;gap:8px;">
                            <span style="background:#222;color:white;border-radius:6px;padding:2px 9px;font-size:0.7rem;font-weight:900;">📅 ${diaNombre}</span>
                            <span style="color:#f0f0f0;font-weight:900;">${fechaFmt}</span>
                            <span style="background:#666;color:#f0f0f0;border:1px solid #555;padding:2px 9px;border-radius:20px;font-size:0.68rem;font-weight:700;">${registrosDia.length} registro${registrosDia.length !== 1 ? 's' : ''}</span>
                            ${labBadge}
                        </span>
                    </td>
                  </tr>`);
            }

            let rowClass = isDamaged ? "row-damaged" : (isLab ? "row-lab" : (!isOK ? "row-pending" : ""));
            let estadoTexto = isOK ? 'DEVOLUCIÓN OK' : 'PENDIENTE';
            let estadoColor = isOK ? '#198754' : '#f9a825';
            let estadoTextColor = isOK ? 'white' : '#fff';

            if (isDamaged) {
                estadoTexto = r.observacion && r.observacion !== "Pendiente" ? r.observacion.substring(0, 20) : "CON DAÑO";
                estadoColor = 'var(--danger-red)';
                estadoTextColor = 'white';
            }

            const badgeLab = isLab ? `<span class="badge badge-status me-1" style="background:linear-gradient(135deg,#6f42c1,#9b59b6);color:white;">🟣 LABORATORIO</span>` : '';
            const badgeEstado = `<span class="badge badge-status" style="background:${estadoColor};color:${estadoTextColor}">${estadoTexto}</span>`;

            rows.push(`<tr class="${rowClass}" data-id="${r.id}" ondblclick="inlineEdit('${r.id}', this)" title="Doble clic para editar rápido">
                <td><span class="text-muted" style="font-size:0.78rem;">${r.fecha.split('-').reverse().slice(0, 2).join('/')}</span></td>
                <td><span class="badge bg-light text-dark border" style="font-size:0.78rem;">🕐 ${r.hora}</span></td>
                <td>${r.curso}${r.curso === 'ELECTIVO' ? ' ' : (r.curso === 'Reemplazo' ? ' ' : '')}</td>
                <td>${r.asignatura}${isLab ? ' <span style="color:#6f42c1;font-size:0.7rem;font-weight:700;">[LAB]</span>' : ''}</td>
                <td class="text-start fw-bold" style="color:#333;">${r.profesor}</td>
                <td>${r.chromebooks}</td>
                <td class="text-danger fw-bold">${r.reemplazo}</td>
                <td class="text-success fw-bold">${r.devueltos}</td>
                <td>${badgeLab} ${(parseInt(r.reemplazo || 0) > 0 && r.nro_equipo_reemplazo) ? `<span class="badge badge-status me-1" style="background:#b71c1c;color:white;">📦 ${r.nro_equipo_reemplazo}</span>` : ''} ${badgeEstado}</td>
                <td><div class="d-flex justify-content-center gap-1">
                    <button class="btn btn-sm btn-outline-primary border-0" onclick="editItem('${r.id}')" title="Editar">✏️</button>
                    <button class="btn btn-sm btn-outline-danger border-0" onclick="deleteItem('${r.id}')" title="Eliminar">🗑️</button>
                </div></td>
              </tr>`);
        });
        tableBody.innerHTML = rows.join('');
    }

    const currentDebts = baseFiltered.filter(d => {
        const totalOut = (parseInt(d.chromebooks || 0) + parseInt(d.reemplazo || 0));
        const isDebt = totalOut > parseInt(d.devueltos || 0);
        const isDamaged = isDamagedRecord(d);
        return isDebt && !isDamaged;
    });

    const banner = document.getElementById('debtBanner');
    if (banner) {
        if (currentDebts.length > 0) {
            banner.style.display = 'flex';
            document.getElementById('debtText').innerText = `⚠️ Franco, tienes ${currentDebts.length} préstamos pendientes en ${mNames[viewDate.getMonth()]}.`;
        } else banner.style.display = 'none';
    }

    updateKPIs(baseFiltered);
    updateCharts(baseFiltered);
}

function updateKPIs(base) {
    function animateKPI(id, val) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.opacity = '0';
        setTimeout(() => {
            el.innerText = val;
            el.style.opacity = '1';
        }, 100);
        setTimeout(() => { if (el) el.style.opacity = '1'; }, 200);
    }

    function setBar(id, val, max, color) {
        const el = document.getElementById(id);
        if (!el) return;
        const pct = max > 0 ? Math.min(100, Math.round((val / max) * 100)) : 0;
        el.style.width = pct + '%';
        el.style.background = color;
    }

    const mesCompleto = db.filter(d => {
        const date = new Date(d.fecha + "T00:00:00");
        return !isNaN(date) && date.getMonth() === viewDate.getMonth() && date.getFullYear() === viewDate.getFullYear();
    });

    const labMes = mesCompleto.filter(d => d.uso_laboratorio === true || d.uso_laboratorio === "TRUE" || d.uso_laboratorio === "true").length;
    const reempMes = mesCompleto.filter(d => parseInt(d.reemplazo || 0) > 0).length;
    const dmgMes = mesCompleto.filter(d => isDamagedRecord(d)).length;
    const okMes = mesCompleto.filter(d => {
        const totalOut = (parseInt(d.chromebooks) + parseInt(d.reemplazo));
        const isOK = totalOut === parseInt(d.devueltos) && parseInt(d.devueltos) > 0;
        const isDamaged = isDamagedRecord(d);
        return isOK && !isDamaged;
    }).length;
    const tasaOk = mesCompleto.length > 0 ? Math.round((okMes / mesCompleto.length) * 100) : 0;

    animateKPI('kpi-total', mesCompleto.length);
    animateKPI('kpi-lab', labMes);
    animateKPI('kpi-reemp', reempMes);
    animateKPI('kpi-damaged', dmgMes);
    animateKPI('kpi-ok', tasaOk + "%");

    const maxRef = Math.max(mesCompleto.length, 1);
    setBar('kpi-total-bar', mesCompleto.length, maxRef, '#107c41');
    setBar('kpi-lab-bar', labMes, maxRef, '#6f42c1');
    setBar('kpi-reemp-bar', reempMes, maxRef, '#dc3545');
    setBar('kpi-damaged-bar', dmgMes, maxRef, '#d32f2f');
    setBar('kpi-ok-bar', tasaOk, 100, '#198754');

    renderAlertasPanel(mesCompleto);

    // KPI Observaciones
    const conObs = mesCompleto.filter(d => (d.observacion || '').trim() !== '' &&
        !['sin novedad', 'ok', ''].includes((d.observacion || '').toLowerCase().trim()));
    animateKPI('kpi-obs', conObs.length);
    const kpiObsBar = document.getElementById('kpi-obs-bar');
    if (kpiObsBar) kpiObsBar.style.width = (mesCompleto.length > 0 ? Math.round((conObs.length / mesCompleto.length) * 100) : 0) + '%';
    const obsCard = document.getElementById('kpi-obs-card');
    if (obsCard) obsCard.style.borderColor = conObs.length > 0 ? '#0288d1' : 'transparent';
    renderObsPanel(conObs);

    // KPI Semana
    const weekRanges = getWeekRanges(viewDate.getFullYear(), viewDate.getMonth());
    let prestSemana = 0, labelSemTxt = "lun – vie";

    if (currentWeek === 0) {
        const hoyKpi = new Date();
        hoyKpi.setHours(0, 0, 0, 0);
        let lunesKpi = new Date(hoyKpi);
        const dayOfWeek = hoyKpi.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        lunesKpi.setDate(hoyKpi.getDate() - daysToMonday);
        const viernesKpi = new Date(lunesKpi);
        viernesKpi.setDate(lunesKpi.getDate() + 4);
        prestSemana = mesCompleto.filter(d => {
            const f = new Date(d.fecha + "T00:00:00");
            return f >= lunesKpi && f <= viernesKpi;
        }).length;
        labelSemTxt = `${lunesKpi.getDate()}/${lunesKpi.getMonth() + 1} – ${viernesKpi.getDate()}/${viernesKpi.getMonth() + 1}`;
    } else if (weekRanges[currentWeek]) {
        const range = weekRanges[currentWeek];
        prestSemana = mesCompleto.filter(d => {
            const day = new Date(d.fecha + "T00:00:00").getDate();
            return day >= range.start && day <= range.end;
        }).length;
        // Mostrar label del calendario escolar ("Semana 2 · días 11–15")
        const schoolLabel = range.label || `Semana ${currentWeek}`;
        labelSemTxt = `${schoolLabel} · días ${range.start}–${range.end}`;
    }

    animateKPI('kpi-semana', prestSemana);
    const labelSemana = document.getElementById('kpiSemanaLabel');
    if (labelSemana) labelSemana.textContent = labelSemTxt;

    // Stock
    const enUso = mesCompleto.filter(d => {
        const chr = parseInt(d.chromebooks || 0);
        const ree = parseInt(d.reemplazo || 0);
        const dev = parseInt(d.devueltos || 0);
        const isDmg = isDamagedRecord(d);
        return (chr + ree) > dev && !isDmg;
    }).reduce((sum, d) => {
        const chr = parseInt(d.chromebooks || 0);
        const ree = parseInt(d.reemplazo || 0);
        const dev = parseInt(d.devueltos || 0);
        const pendiente = Math.max(0, chr + ree - dev);
        return sum + Math.min(chr, pendiente);
    }, 0);

    const disponible = Math.max(0, STOCK_MAXIMO - enUso);
    const pct = Math.min(100, Math.round((enUso / STOCK_MAXIMO) * 100));

    let barColor = 'linear-gradient(90deg, #198754, #28a745)';
    if (pct >= 50 && pct < 80) barColor = 'linear-gradient(90deg, #f39c12, #ffc107)';
    if (pct >= 80) barColor = 'linear-gradient(90deg, #dc3545, #ff6b6b)';

    const barEl = document.getElementById('stock-bar-uso');
    const labelEl = document.getElementById('stock-bar-label');
    const warningEl = document.getElementById('stock-warning');
    const enUsoEl = document.getElementById('stock-en-uso');
    const disponibleEl = document.getElementById('stock-disponible');

    if (barEl) {
        barEl.style.width = pct + '%';
        barEl.style.background = barColor;
    }
    if (labelEl) labelEl.textContent = enUso > 0 ? `${pct}% en uso` : '';
    if (warningEl) warningEl.style.display = pct >= 85 ? 'block' : 'none';
    if (enUsoEl) enUsoEl.textContent = enUso;
    if (disponibleEl) disponibleEl.textContent = disponible;
}

function updateCharts(base) {
    const dS = {};
    base.forEach(d => {
        let prof = d.profesor ? d.profesor.trim() : "";
        if (prof && prof !== "------") {
            dS[prof] = (dS[prof] || 0) + 1;
        }
    });

    const sortedLabels = Object.keys(dS).sort();
    const sortedValues = sortedLabels.map(label => dS[label]);

    const ctxDocente = document.getElementById('chartDocente');
    if (ctxDocente) {
        if (charts.D) charts.D.destroy();

        // Altura dinámica: 28px por docente con mínimo 200px
        const ROW_H = 28;
        const minH  = 200;
        const calcH = Math.max(minH, sortedLabels.length * ROW_H);
        // Ajustar el wrapper padre para que el canvas quepa sin apilarse
        const wrapper = ctxDocente.parentElement;
        if (wrapper) wrapper.style.height = calcH + 'px';
        ctxDocente.style.height = calcH + 'px';

        charts.D = new Chart(ctxDocente, {
            type: 'bar',
            data: {
                labels: sortedLabels,
                datasets: [{
                    data: sortedValues,
                    backgroundColor: '#0d6832',
                    borderRadius: 5
                }]
            },
            options: {
                indexAxis: 'y',
                maintainAspectRatio: false,
                responsive: true,
                plugins: { legend: { display: false }, tooltip: { enabled: true } },
                scales: {
                    x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 }, title: { display: true, text: 'Cantidad de Préstamos' } },
                    y: { ticks: { autoSkip: false, font: { size: 11 }, padding: 4 } }
                }
            }
        });
    }

    // ── Gráfico por día de la semana ──────────────────────────────────────────
    const diasNombres = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    const diasCount   = [0, 0, 0, 0, 0]; // índices 1–5 (lun–vie)
    base.forEach(d => {
        const dt = new Date(d.fecha + "T00:00:00");
        if (!isNaN(dt)) {
            const dow = dt.getDay(); // 0=dom,1=lun,...,5=vie,6=sab
            if (dow >= 1 && dow <= 5) diasCount[dow - 1]++;
        }
    });

    const ctxDia = document.getElementById('chartDiaSemana');
    if (ctxDia) {
        if (charts.DS) charts.DS.destroy();
        // Degradado de colores verde→azul según intensidad
        const diaColors = diasCount.map(v => {
            const max = Math.max(...diasCount, 1);
            const pct = v / max;
            if (pct > 0.8) return '#0d6832';
            if (pct > 0.5) return '#1a8c48';
            if (pct > 0.3) return '#2ecc71';
            return '#a8e6cf';
        });
        charts.DS = new Chart(ctxDia, {
            type: 'bar',
            data: {
                labels: diasNombres,
                datasets: [{
                    label: 'Préstamos',
                    data: diasCount,
                    backgroundColor: diaColors,
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: {
                maintainAspectRatio: false,
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.parsed.y} préstamo${ctx.parsed.y !== 1 ? 's' : ''}`
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    const cerrados = base.filter(d => getEstado(d) === "ok").length;
    const activos  = base.filter(d => getEstado(d) === "pendiente").length;
    const danados  = base.filter(d => getEstado(d) === "dañado").length;

    const ctxStatus = document.getElementById('chartStatus');
    if (ctxStatus) {
        if (charts.S) charts.S.destroy();
        charts.S = new Chart(ctxStatus, {
            type: 'bar',
            data: {
                labels: ['Entregados', 'Pendientes', 'Dañados'],
                datasets: [{
                    data: [cerrados, activos, danados],
                    backgroundColor: ['#198754', '#ffc107', '#dc3545'],
                    borderRadius: 6
                }]
            },
            options: {
                maintainAspectRatio: false,
                responsive: true,
                plugins: { legend: { display: false }, tooltip: { enabled: true } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    }
}

function renderAnualChart() {
    const usageTotal = new Array(12).fill(0);
    const replacements = new Array(12).fill(0);
    const damaged = new Array(12).fill(0);
    const labs = new Array(12).fill(0);

    db.forEach(d => {
        const dt = new Date(d.fecha + "T00:00:00");
        if (!isNaN(dt) && dt.getFullYear() === 2026) {
            const m = dt.getMonth();
            usageTotal[m]++;
            if (parseInt(d.reemplazo || 0) > 0) replacements[m]++;
            if (isDamagedRecord(d)) damaged[m]++;
            if (d.uso_laboratorio === true || d.uso_laboratorio === "TRUE" || d.uso_laboratorio === "true") labs[m]++;
        }
    });

    const ctxAnual = document.getElementById('chartAnual');
    if (ctxAnual) {
        if (charts.A) charts.A.destroy();
        charts.A = new Chart(ctxAnual, {
            type: 'line',
            data: {
                labels: mNames.map(m => m.slice(0, 3)),
                datasets: [
                    { label: 'Uso Total', data: usageTotal, borderColor: '#0d6832', backgroundColor: '#0d6832', tension: 0.3, fill: false, borderWidth: 3 },
                    { label: 'Uso Laboratorio', data: labs, borderColor: '#6f42c1', backgroundColor: '#6f42c1', tension: 0.3, fill: false, borderWidth: 2 },
                    { label: 'Uso Reemplazos', data: replacements, borderColor: '#f39c12', backgroundColor: '#f39c12', tension: 0.3, fill: false, borderDash: [5, 5] },
                    { label: 'Equipos Dañados', data: damaged, borderColor: '#dc3545', backgroundColor: '#dc3545', tension: 0.3, fill: false, borderWidth: 2 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }
}

// ==================== NAVEGACIÓN Y FILTROS ====================
function moveMonth(n) {
    viewDate.setMonth(viewDate.getMonth() + n);
    renderAll();
}

function setFilterWeek(w) {
    currentWeek = w;
    document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === w));
    renderAll();
}

function setFilterMode(m) {
    filterMode = m;
    renderAll();
}

function resetApp() {
    filterMode = 'all';
    currentWeek = 0;
    const searchBox = document.getElementById('searchBox');
    const courseSelect = document.getElementById('courseSelect');
    if (searchBox) searchBox.value = '';
    if (courseSelect) courseSelect.value = '';
    document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    renderAll();
}

function irASemanaActual() {
    const hoy = new Date();
    viewDate = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    filterMode = 'all';
    const searchBox = document.getElementById('searchBox');
    const courseSelect = document.getElementById('courseSelect');
    if (searchBox) searchBox.value = '';
    if (courseSelect) courseSelect.value = '';
    const semana = getCurrentSchoolWeek(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    currentWeek = semana;
    document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === semana));
    renderAll();
    setTimeout(() => {
        const tabla = document.getElementById('mainTable');
        if (tabla) tabla.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
}

function showPage(page) {
    const pages  = ['registros', 'stats', 'anual'];
    const btnIds = { registros: 'btnPageRegistros', stats: 'btnPageStats', anual: 'btnPageAnual' };

    pages.forEach(p => {
        const el  = document.getElementById('page' + p.charAt(0).toUpperCase() + p.slice(1));
        const btn = document.getElementById(btnIds[p]);
        const active = p === page;
        if (el)  el.style.display  = active ? 'block' : 'none';
        if (btn) {
            btn.className = `btn btn-sm fw-bold px-3 ${active ? 'btn-page-active' : 'btn-page-idle'}`;
        }
    });

    if (page === 'stats') {
        setTimeout(() => Object.values(charts).forEach(c => { if (c) c.resize(); }), 50);
    }
    if (page === 'anual') {
        renderResumenAnual();
    }
}

// ==================== MODAL Y WIZARD ====================
function toggleNroEquipo() {
    const ree = parseInt(document.getElementById('fRee').value || 0);
    const wrapper = document.getElementById('nroEquipoWrapper');
    if (wrapper) wrapper.style.display = ree > 0 ? 'block' : 'none';
}

function onEstadoDevChange() {
    const val = document.querySelector('input[name="fEstadoDev"]:checked')?.value || '';
    const tipoDanioWrapper = document.getElementById('tipoDanioWrapper');
    if (tipoDanioWrapper) tipoDanioWrapper.style.display = val === 'danio' ? 'block' : 'none';
    saveDraft();
}

function _hasDraftData() {
    const vals = [
        document.getElementById('fProfesor')?.value,
        document.getElementById('fCurso')?.value,
        document.getElementById('fAsignatura')?.value,
        document.getElementById('fHora')?.value,
        document.getElementById('fObs')?.value
    ];
    return vals.some(v => v && v.trim() !== '');
}

function _setupModalCloseGuard() {
    const modalEl = document.getElementById('resModal');
    if (!modalEl) return;
    // Evitar registrar el listener más de una vez
    if (modalEl._closeGuardRegistered) return;
    modalEl._closeGuardRegistered = true;

    modalEl.addEventListener('hide.bs.modal', function(e) {
        const fId = document.getElementById('fId');
        const esNuevo = !fId || fId.value === '';
        if (esNuevo && _hasDraftData()) {
            e.preventDefault(); // detener cierre automático
            Swal.fire({
                title: '¿Descartar borrador?',
                text: 'Hay datos ingresados que se perderán si cierras el formulario.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#0d6832',
                confirmButtonText: 'Sí, descartar',
                cancelButtonText: 'Seguir editando'
            }).then(result => {
                if (result.isConfirmed) {
                    sessionStorage.removeItem('franco_draft');
                    modalEl._closeGuardRegistered = false; // resetear para permitir cierre
                    bootstrap.Modal.getInstance(modalEl).hide();
                }
            });
        }
    });
}

function openModal() {
    const form = document.getElementById('resForm');
    if (form) form.reset();
    const fId = document.getElementById('fId');
    if (fId) fId.value = '';
    if (form) form.classList.remove('was-validated');
    const hoyStr = new Date().toISOString().split('T')[0];
    const fFecha = document.getElementById('fFecha');
    if (fFecha) fFecha.value = hoyStr;
    const fLab = document.getElementById('fLab');
    if (fLab) fLab.checked = false;
    document.querySelectorAll('input[name="fEstadoDev"]').forEach(r => r.checked = false);
    document.querySelectorAll('input[name="fNroEquipo"]').forEach(r => r.checked = false);
    const tipoDanioWrapper = document.getElementById('tipoDanioWrapper');
    if (tipoDanioWrapper) tipoDanioWrapper.style.display = 'none';
    const nroEquipoWrapper = document.getElementById('nroEquipoWrapper');
    if (nroEquipoWrapper) nroEquipoWrapper.style.display = 'none';
    const fTipoDanio = document.getElementById('fTipoDanio');
    if (fTipoDanio) fTipoDanio.value = '';
    loadDraft();
    fillDocentes();
    wizardGoTo(1);
    const modalInst = new bootstrap.Modal(document.getElementById('resModal'));
    modalInst.show();
    _setupModalCloseGuard();
}

function validateCounts() {
    const chr = parseInt(document.getElementById('fChr').value || 0);
    const ree = parseInt(document.getElementById('fRee').value || 0);
    const dev = parseInt(document.getElementById('fDev').value || 0);
    const msg = document.getElementById('valMsg');
    const devInput = document.getElementById('fDev');

    if (dev !== (chr + ree)) {
        if (msg) msg.style.display = 'block';
        if (devInput) devInput.classList.add('val-warning');
    } else {
        if (msg) msg.style.display = 'none';
        if (devInput) devInput.classList.remove('val-warning');
    }
    saveDraft();
}

function wizardGoTo(step) {
    _wizardStep = step;
    for (let i = 1; i <= WIZARD_TOTAL; i++) {
        const panel = document.getElementById('wpanel' + i);
        const dot = document.getElementById('wstep' + i);
        if (panel) panel.classList.toggle('active', i === step);
        if (dot) {
            dot.classList.remove('active', 'done');
            if (i === step) dot.classList.add('active');
            if (i < step) dot.classList.add('done');
        }
    }
    const prev = document.getElementById('wBtnPrev');
    const next = document.getElementById('wBtnNext');
    const save = document.getElementById('wBtnSave');
    if (prev) prev.style.display = step > 1 ? 'inline-block' : 'none';
    if (next) next.style.display = step < WIZARD_TOTAL ? 'inline-block' : 'none';
    if (save) save.style.display = step === WIZARD_TOTAL ? 'inline-block' : 'none';
}

function wizardNext() {
    if (_wizardStep === 1) {
        const fecha = document.getElementById('fFecha').value;
        const hora = document.getElementById('fHora').value;
        const curso = document.getElementById('fCurso').value;
        const asig = document.getElementById('fAsignatura').value;
        const prof = document.getElementById('fProfesor').value;
        if (!fecha || !hora || !curso || !asig || !prof) {
            Swal.fire({ icon: 'warning', title: 'Campos incompletos', text: 'Complete Fecha, Hora, Curso, Asignatura y Profesor.', confirmButtonColor: '#0d6832' });
            return;
        }
    }
    if (_wizardStep === WIZARD_TOTAL - 1) {
        const estadoMap = { ok: '✅ Sin novedad', pendiente: '⏳ Pendiente', danio: '🔴 Con daño', '': '—' };
        const estadoDev = document.querySelector('input[name="fEstadoDev"]:checked')?.value || '';
        const nroEq = document.querySelector('input[name="fNroEquipo"]:checked')?.value || '—';
        const labCheck = document.getElementById('fLab')?.checked;
        const cvFecha = document.getElementById('cv-fecha');
        const cvHora = document.getElementById('cv-hora');
        const cvCurso = document.getElementById('cv-curso');
        const cvAsig = document.getElementById('cv-asig');
        const cvProf = document.getElementById('cv-prof');
        const cvLab = document.getElementById('cv-lab');
        const cvChr = document.getElementById('cv-chr');
        const cvRee = document.getElementById('cv-ree');
        const cvDev = document.getElementById('cv-dev');
        const cvNroeq = document.getElementById('cv-nroeq');
        const cvEstado = document.getElementById('cv-estado');
        
        if (cvFecha) cvFecha.textContent = document.getElementById('fFecha').value || '—';
        if (cvHora) cvHora.textContent = document.getElementById('fHora').value || '—';
        if (cvCurso) cvCurso.textContent = document.getElementById('fCurso').value || '—';
        if (cvAsig) cvAsig.textContent = document.getElementById('fAsignatura').value || '—';
        if (cvProf) cvProf.textContent = document.getElementById('fProfesor').value || '—';
        if (cvLab) cvLab.textContent = labCheck ? '🟣 Sí' : 'No';
        if (cvChr) cvChr.textContent = document.getElementById('fChr').value || '0';
        if (cvRee) cvRee.textContent = document.getElementById('fRee').value || '0';
        if (cvDev) cvDev.textContent = document.getElementById('fDev').value || '0';
        if (cvNroeq) cvNroeq.textContent = nroEq;
        if (cvEstado) cvEstado.textContent = estadoMap[estadoDev] || '—';
    }
    if (_wizardStep < WIZARD_TOTAL) wizardGoTo(_wizardStep + 1);
}

function wizardPrev() {
    if (_wizardStep > 1) wizardGoTo(_wizardStep - 1);
}

// ==================== CRUD OPERACIONES ====================
async function saveData() {
    const form = document.getElementById('resForm');
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        Swal.fire('Atención', 'Por favor complete todos los campos requeridos', 'warning');
        return;
    }

    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'flex';

    const esLab = document.getElementById('fLab').checked;
    const estadoDevSeleccionado = document.querySelector('input[name="fEstadoDev"]:checked')?.value || '';
    let obsValue = document.getElementById('fObs')?.value || '';

    if (estadoDevSeleccionado === 'ok') {
        obsValue = obsValue || 'Sin novedad';
    } else if (estadoDevSeleccionado === 'pendiente') {
        obsValue = obsValue || 'Pendiente';
    } else if (estadoDevSeleccionado === 'danio') {
        const tipoDanio = (document.getElementById('fTipoDanio')?.value || '').trim();
        obsValue = tipoDanio || obsValue || 'Dañado';
    }

    const chr = parseInt(document.getElementById('fChr').value) || 0;
    const ree = parseInt(document.getElementById('fRee').value) || 0;
    const dev = parseInt(document.getElementById('fDev').value) || 0;
    
    let estado = 'ACTIVO';
    if (esLab) estado = 'LABORATORIO';
    else if (obsValue.toLowerCase().includes('dañ')) estado = 'DAÑADO';
    else if ((chr + ree) === dev && dev > 0) estado = 'CERRADO';
    
    const fechaCierre = estado === 'CERRADO' ? new Date().toISOString().slice(0, 10) : '';
    const nroEquipo = document.querySelector('input[name="fNroEquipo"]:checked')?.value || '';

    const esEdicion = !!document.getElementById('fId').value;
    const ahora = new Date().toLocaleString('es-CL');
    const payload = {
        action: esEdicion ? 'update' : 'create',
        id: document.getElementById('fId').value,
        fecha: document.getElementById('fFecha').value,
        hora: document.getElementById('fHora').value,
        curso: document.getElementById('fCurso').value,
        profesor: document.getElementById('fProfesor').value,
        asignatura: document.getElementById('fAsignatura').value,
        chromebooks: chr,
        reemplazo: ree,
        devueltos: dev,
        observacion: obsValue,
        nro_equipo_reemplazo: nroEquipo,
        uso_laboratorio: esLab,
        estado_operativo: estado,
        fecha_cierre: fechaCierre,
        responsable_cierre: 'Franco San Martín',
        historial: esEdicion
            ? `[${ahora}] Editado por Franco San Martín`
            : ''
    };

    try {
        // Enviamos como GET con parámetro ?data=... para evitar CORS preflight
        const encoded = encodeURIComponent(JSON.stringify(payload));
        const response = await fetch(SCRIPT_URL + '?data=' + encoded);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.status === 'success') {
            sessionStorage.removeItem('franco_draft');
            sessionStorage.removeItem(CACHE_KEY);
            sessionStorage.removeItem(CACHE_TS);
            bootstrap.Modal.getInstance(document.getElementById('resModal')).hide();

            Swal.fire({
                icon: 'success',
                title: `Registro ${payload.action === 'create' ? 'creado' : 'actualizado'} correctamente`,
                text: result.message || 'Los datos se han guardado en Google Sheets',
                timer: 2000,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
            });

            // Flash verde en la fila tras recargar
            const _idGuardado = payload.id || result.id;
            setTimeout(() => {
                load().then(() => {
                    setTimeout(() => {
                        const tr = document.querySelector(`tr[data-id="${_idGuardado}"]`);
                        if (tr) {
                            tr.style.transition = 'background 0.3s';
                            tr.style.background = '#d4edda';
                            setTimeout(() => { tr.style.background = ''; }, 1400);
                        }
                    }, 300);
                });
            }, 300);
        } else {
            throw new Error(result.message || 'Error desconocido al guardar');
        }
    } catch (e) {
        console.error('Error al guardar:', e);
        
        // Mostrar mensaje de error detallado
        Swal.fire({
            icon: 'error',
            title: 'Error al guardar',
            html: `No se pudo guardar el registro.<br><br>
                   <b>Posibles causas:</b><br>
                   • La Web App de Google Apps Script no está publicada correctamente<br>
                   • La URL de SCRIPT_URL es incorrecta<br>
                   • El script necesita permisos adicionales<br><br>
                   <b>Solución:</b><br>
                   1. Abre tu archivo .gs en Google Apps Script<br>
                   2. Ve a "Publicar" > "Implementar como aplicación web"<br>
                   3. Asegúrate de que "Quién tiene acceso" sea "Cualquier persona"<br>
                   4. Copia la NUEVA URL y actualiza SCRIPT_URL<br>
                   5. Ejecuta la función 'setup' en el editor de Apps Script`,
            confirmButtonText: 'Entendido'
        });
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

async function deleteItem(id) {
    const result = await Swal.fire({
        title: '¿Estás seguro?',
        text: "Esta acción no se puede deshacer.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.style.display = 'flex';
        try {
            const delPayload = encodeURIComponent(JSON.stringify({ action: 'delete', id: id }));
            const response = await fetch(SCRIPT_URL + '?data=' + delPayload);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'success') {
                sessionStorage.removeItem(CACHE_KEY);
                sessionStorage.removeItem(CACHE_TS);
                Swal.fire('Eliminado', 'El registro ha sido eliminado.', 'success');
                setTimeout(() => load(), 500);
            } else {
                throw new Error(data.message || 'Error al eliminar');
            }
        } catch (e) {
            console.error('Error al eliminar:', e);
            Swal.fire('Error', 'No se pudo eliminar el registro.', 'error');
            if (loadingEl) loadingEl.style.display = 'none';
        }
    }
}

function editItem(id) {
    const r = db.find(x => x.id.toString() === id.toString());
    if (!r) return;
    
    const fId = document.getElementById('fId');
    const fFecha = document.getElementById('fFecha');
    const fHora = document.getElementById('fHora');
    const fCurso = document.getElementById('fCurso');
    const fProfesor = document.getElementById('fProfesor');
    const fAsignatura = document.getElementById('fAsignatura');
    const fChr = document.getElementById('fChr');
    const fRee = document.getElementById('fRee');
    const fDev = document.getElementById('fDev');
    const fObs = document.getElementById('fObs');
    const fLab = document.getElementById('fLab');
    
    if (fId) fId.value = r.id;
    if (fFecha) fFecha.value = r.fecha;
    if (fHora) fHora.value = r.hora;
    if (fCurso) fCurso.value = r.curso;
    fillDocentes();
    if (fProfesor) fProfesor.value = r.profesor;
    if (fAsignatura) fAsignatura.value = r.asignatura;
    if (fChr) fChr.value = r.chromebooks;
    if (fRee) fRee.value = r.reemplazo;
    if (fDev) fDev.value = r.devueltos;
    if (fObs) fObs.value = r.observacion;
    
    const labVal = r.uso_laboratorio === true || r.uso_laboratorio === "TRUE" || r.uso_laboratorio === "true";
    if (fLab) fLab.checked = labVal;
    
    const nroEquipoWrapper = document.getElementById('nroEquipoWrapper');
    const ree = parseInt(r.reemplazo || 0);
    if (nroEquipoWrapper) nroEquipoWrapper.style.display = ree > 0 ? 'block' : 'none';
    document.querySelectorAll('input[name="fNroEquipo"]').forEach(rb => rb.checked = false);
    if (r.nro_equipo_reemplazo) {
        const rbEq = document.querySelector(`input[name="fNroEquipo"][value="${r.nro_equipo_reemplazo}"]`);
        if (rbEq) rbEq.checked = true;
    }
    
    const obs = (r.observacion || "").toLowerCase();
    const tipoDanioWrapper = document.getElementById('tipoDanioWrapper');
    document.querySelectorAll('input[name="fEstadoDev"]').forEach(rb => rb.checked = false);
    
    const isDamaged = isDamagedRecord(r);
    
    if (isDamaged) {
        const edDanio = document.getElementById('edDanio');
        if (edDanio) edDanio.checked = true;
        if (tipoDanioWrapper) tipoDanioWrapper.style.display = 'block';
        const fTipoDanio = document.getElementById('fTipoDanio');
        if (fTipoDanio) fTipoDanio.value = r.observacion;
    } else if (obs === 'sin novedad' || obs === '' || obs === 'ok') {
        const edOk = document.getElementById('edOk');
        if (edOk) edOk.checked = true;
        if (tipoDanioWrapper) tipoDanioWrapper.style.display = 'none';
    } else if (obs === 'pendiente') {
        const edPend = document.getElementById('edPendiente');
        if (edPend) edPend.checked = true;
        if (tipoDanioWrapper) tipoDanioWrapper.style.display = 'none';
    }
    
    validateCounts();
    wizardGoTo(2);
    new bootstrap.Modal(document.getElementById('resModal')).show();
}

// ==================== EDICIÓN RÁPIDA INLINE ====================
// Doble clic en una fila → Swal2 popup con los campos más comunes.
// Si el usuario necesita editar algo más → botón "Edición completa".
async function inlineEdit(id, trEl) {
    const r = db.find(d => String(d.id) === String(id));
    if (!r) return;

    const chrN  = parseInt(r.chromebooks || 0);
    const reeN  = parseInt(r.reemplazo   || 0);
    const devN  = parseInt(r.devueltos   || 0);
    const total = chrN + reeN;
    const obs   = r.observacion || '';
    const isDmg = isDamagedRecord(r);

    const estadoActual = isDmg ? 'danio'
        : obs.toLowerCase() === 'pendiente' ? 'pendiente' : 'ok';

    const { value: formValues, isDismissed } = await Swal.fire({
        title: `✏️ Edición rápida`,
        html: `
            <div style="text-align:left;font-size:0.88rem;">
                <div style="background:#f8f9fa;border-radius:8px;padding:10px 14px;margin-bottom:14px;line-height:1.7;">
                    <b>👤</b> ${r.profesor} &nbsp;·&nbsp;
                    <b>📅</b> ${r.fecha.split('-').reverse().slice(0,2).join('/')} &nbsp;·&nbsp;
                    <b>🏫</b> ${r.curso}<br>
                    <b>📚</b> ${r.asignatura} &nbsp;·&nbsp;
                    <b>💻</b> ${total} equipo${total !== 1 ? 's' : ''}
                </div>
                <label class="fw-bold small text-success d-block mb-1">✅ DEVUELTOS</label>
                <input id="il_dev" type="number" class="swal2-input" value="${devN}" min="0" max="${total}" style="margin:0 0 12px;width:100%;">
                <label class="fw-bold small text-primary d-block mb-1">📋 ESTADO</label>
                <select id="il_estado" class="swal2-select" style="margin:0 0 12px;width:100%;display:block;">
                    <option value="ok"       ${estadoActual==='ok'       ? 'selected':''}>✅ Sin novedad</option>
                    <option value="pendiente"${estadoActual==='pendiente'? 'selected':''}>⏳ Pendiente</option>
                    <option value="danio"    ${estadoActual==='danio'    ? 'selected':''}>🔴 Con daño</option>
                </select>
                <label class="fw-bold small text-muted d-block mb-1">💬 OBSERVACIÓN</label>
                <input id="il_obs" type="text" class="swal2-input" value="${obs}" placeholder="Observación..." style="margin:0;width:100%;">
            </div>`,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '💾 Guardar',
        denyButtonText: '📝 Edición completa',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#0d6832',
        denyButtonColor: '#003366',
        focusConfirm: false,
        preConfirm: () => ({
            dev:    parseInt(document.getElementById('il_dev').value)    || 0,
            estado: document.getElementById('il_estado').value,
            obs:    document.getElementById('il_obs').value.trim()
        })
    });

    // Usuario eligió "Edición completa"
    if (isDismissed && Swal.getDenyButton?.()?.matches(':focus')) {
        editItem(id); return;
    }
    // Cancelled
    if (!formValues) return;

    // Si eligió "Edición completa" (isDenied)
    if (formValues === undefined) { editItem(id); return; }

    // Construir payload igual que saveData pero solo con los campos editados
    const devVal  = formValues.dev;
    const estadoV = formValues.estado;
    const obsVal  = formValues.obs || (estadoV === 'ok' ? 'Sin novedad' : estadoV === 'pendiente' ? 'Pendiente' : obs);

    let estadoOp = 'ACTIVO';
    if (estadoV === 'danio')    estadoOp = 'DAÑADO';
    else if (estadoV === 'ok' && devVal === total && total > 0) estadoOp = 'CERRADO';

    const ahora = new Date().toLocaleString('es-CL');
    const payload = {
        action: 'update',
        id:     r.id,
        fecha:  r.fecha,
        hora:   r.hora,
        curso:  r.curso,
        profesor:   r.profesor,
        asignatura: r.asignatura,
        chromebooks: chrN,
        reemplazo:   reeN,
        devueltos:   devVal,
        observacion: obsVal,
        nro_equipo_reemplazo: r.nro_equipo_reemplazo || '',
        uso_laboratorio: r.uso_laboratorio,
        estado_operativo: estadoOp,
        fecha_cierre: estadoOp === 'CERRADO' ? new Date().toISOString().slice(0,10) : (r.fecha_cierre || ''),
        responsable_cierre: 'Franco San Martín',
        historial: `[${ahora}] Edición rápida por Franco San Martín`
    };

    // Flash amarillo en la fila mientras guarda
    if (trEl) trEl.style.background = '#fff9c4';

    try {
        const encoded  = encodeURIComponent(JSON.stringify(payload));
        const response = await fetch(SCRIPT_URL + '?data=' + encoded);
        const result   = await response.json();

        if (result.status === 'success') {
            sessionStorage.removeItem(CACHE_KEY);
            sessionStorage.removeItem(CACHE_TS);
            // Flash verde éxito
            if (trEl) {
                trEl.style.transition = 'background 0.4s';
                trEl.style.background = '#d4edda';
                setTimeout(() => { trEl.style.background = ''; }, 1200);
            }
            Swal.fire({ icon:'success', title:'Guardado', timer:1500,
                showConfirmButton:false, toast:true, position:'top-end' });
            setTimeout(() => load(), 600);
        } else {
            throw new Error(result.message);
        }
    } catch(e) {
        if (trEl) trEl.style.background = '#ffd5d5';
        Swal.fire('Error', 'No se pudo guardar: ' + e.message, 'error');
    }
}

// ==================== DRAFT ====================
// Usamos sessionStorage (por pestaña, no persiste entre equipos ni sesiones).
// Así un borrador a medio llenar se restaura si cierras el modal pero no si
// cierras la pestaña o cambias de equipo.
function saveDraft() {
    if (document.getElementById('fId').value !== "") return;
    const estadoDev = document.querySelector('input[name="fEstadoDev"]:checked')?.value || '';
    const nroEquipo = document.querySelector('input[name="fNroEquipo"]:checked')?.value || '';
    const draft = {
        fecha: document.getElementById('fFecha')?.value || '',
        hora: document.getElementById('fHora')?.value || '',
        curso: document.getElementById('fCurso')?.value || '',
        profesor: document.getElementById('fProfesor')?.value || '',
        asignatura: document.getElementById('fAsignatura')?.value || '',
        obs: document.getElementById('fObs')?.value || '',
        lab: document.getElementById('fLab')?.checked || false,
        nroEquipo: nroEquipo,
        estadoDev: estadoDev,
        tipoDanio: document.getElementById('fTipoDanio')?.value || ''
    };
    sessionStorage.setItem('franco_draft', JSON.stringify(draft));
}

function loadDraft() {
    const saved = sessionStorage.getItem('franco_draft');
    if (!saved) return;
    const d = JSON.parse(saved);
    const fFecha = document.getElementById('fFecha');
    const fHora = document.getElementById('fHora');
    const fCurso = document.getElementById('fCurso');
    const fProfesor = document.getElementById('fProfesor');
    const fAsignatura = document.getElementById('fAsignatura');
    const fObs = document.getElementById('fObs');
    const fLab = document.getElementById('fLab');
    
    if (fFecha && d.fecha) fFecha.value = d.fecha;
    if (fHora && d.hora) fHora.value = d.hora;
    if (fCurso && d.curso) fCurso.value = d.curso;
    if (fProfesor && d.profesor) fProfesor.value = d.profesor;
    if (fAsignatura && d.asignatura) fAsignatura.value = d.asignatura;
    if (fObs && d.obs) fObs.value = d.obs;
    if (fLab && d.lab !== undefined) fLab.checked = d.lab;
    if (d.nroEquipo) {
        const rb = document.querySelector(`input[name="fNroEquipo"][value="${d.nroEquipo}"]`);
        if (rb) rb.checked = true;
        toggleNroEquipo();
    }
    if (d.estadoDev) {
        const rb = document.querySelector(`input[name="fEstadoDev"][value="${d.estadoDev}"]`);
        if (rb) {
            rb.checked = true;
            onEstadoDevChange();
        }
    }
    if (d.tipoDanio && document.getElementById('fTipoDanio')) {
        document.getElementById('fTipoDanio').value = d.tipoDanio;
    }
}

// ==================== PDF ====================
async function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const mesActual = mNames[viewDate.getMonth()];
    const anioActual = viewDate.getFullYear();
    const fechaEmision = new Date().toLocaleDateString('es-CL');

    const mesData = db.filter(d => {
        const date = new Date(d.fecha + "T00:00:00");
        return !isNaN(date) && date.getMonth() === viewDate.getMonth() && date.getFullYear() === viewDate.getFullYear();
    });

    // Cargar logo institucional
    let logoBase64 = null;
    try {
        const resp = await fetch("https://i.postimg.cc/sxxwfhwK/LOGO-LBSNG-06-237x300.png");
        const blob = await resp.blob();
        logoBase64 = await new Promise(res => {
            const reader = new FileReader();
            reader.onloadend = () => res(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch(e) { console.warn("Logo no disponible:", e); }

    const total   = mesData.length;
    const ok      = mesData.filter(d => (parseInt(d.chromebooks) + parseInt(d.reemplazo)) === parseInt(d.devueltos) && parseInt(d.devueltos) > 0).length;
    const dmg     = mesData.filter(d => isDamagedRecord(d)).length;
    const activos = mesData.filter(d => (parseInt(d.chromebooks || 0) + parseInt(d.reemplazo || 0)) > parseInt(d.devueltos || 0) && !isDamagedRecord(d)).length;
    const labs    = mesData.filter(d => d.uso_laboratorio === true || d.uso_laboratorio === "TRUE" || d.uso_laboratorio === "true").length;
    const reemp   = mesData.filter(d => parseInt(d.reemplazo || 0) > 0).length;
    const tasa    = total > 0 ? Math.round((ok / total) * 100) : 0;

    // ═══════════════════════════════════════════════════════════════════════════
    // PÁGINA 0: PORTADA
    // ═══════════════════════════════════════════════════════════════════════════

    // Fondo degradado simulado con rectángulos superpuestos (jsPDF no tiene gradiente)
    doc.setFillColor(0, 51, 102);
    doc.rect(0, 0, 210, 297, 'F');
    doc.setFillColor(0, 70, 130);
    doc.rect(0, 180, 210, 117, 'F');

    // Banda decorativa horizontal
    doc.setFillColor(13, 104, 50);
    doc.rect(0, 155, 210, 6, 'F');

    // Logo grande centrado
    if (logoBase64) {
        // ratio 237:300 → a 50mm de ancho → 63.3mm alto
        doc.addImage(logoBase64, 'PNG', 80, 28, 50, 63.3);
    }

    // Nombre del colegio
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("COLEGIO NUESTRA SEÑORA DE GUADALUPE", 105, 105, { align: 'center' });

    // Línea separadora blanca
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.4);
    doc.line(40, 109, 170, 109);

    // Título principal
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("GESTIÓN CHROMEBOOKS", 105, 124, { align: 'center' });

    // Subtítulo mes/año en verde
    doc.setFillColor(13, 104, 50);
    doc.roundedRect(55, 130, 100, 16, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`${mesActual.toUpperCase()} ${anioActual}`, 105, 141, { align: 'center' });

    // Banda verde inferior con resumen ejecutivo
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("RESUMEN EJECUTIVO", 105, 170, { align: 'center' });

    // Cuatro KPIs en la portada
    const portadaKpis = [
        { label: 'Préstamos', value: total,  icon: '📋' },
        { label: 'Devueltos OK', value: ok,  icon: '✅' },
        { label: 'Pendientes',  value: activos, icon: '⏳' },
        { label: 'Con Daños',   value: dmg,  icon: '⚠️' },
    ];
    const pkW = 38, pkH = 22, pkY = 178, pkX0 = 14 + (182 - portadaKpis.length * pkW - 3 * 6) / 2;
    portadaKpis.forEach((k, i) => {
        const px = pkX0 + i * (pkW + 6);
        doc.setFillColor(255, 255, 255, 0.15);
        doc.setFillColor(0, 80, 150);
        doc.roundedRect(px, pkY, pkW, pkH, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(String(k.value), px + pkW / 2, pkY + 11, { align: 'center' });
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.text(k.label.toUpperCase(), px + pkW / 2, pkY + 18, { align: 'center' });
    });

    // Tasa de retorno destacada
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(`Tasa de retorno: ${tasa}%`, 105, 218, { align: 'center' });

    // Línea separadora
    doc.setDrawColor(13, 104, 50);
    doc.setLineWidth(0.5);
    doc.line(40, 222, 170, 222);

    // Datos de emisión
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 220, 255);
    doc.text(`Emitido: ${fechaEmision}`, 105, 232, { align: 'center' });
    doc.text(`Responsable: Franco San Martín — Técnico Informático`, 105, 239, { align: 'center' });
    doc.text(`Área de Informática · NSG ${anioActual}`, 105, 246, { align: 'center' });

    // Índice de contenido
    doc.setFillColor(0, 40, 90);
    doc.roundedRect(30, 255, 150, 32, 3, 3, 'F');
    doc.setTextColor(150, 200, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("CONTENIDO DEL REPORTE", 105, 262, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 225, 255);
    const indice = ['Pág. 2 — Tabla de uso por docente', 'Pág. 3 — Dashboard visual + gráfico semanal', 'Pág. 4+ — Resumen semanal y alertas'];
    indice.forEach((line, i) => doc.text(line, 105, 268 + i * 7, { align: 'center' }));

    // ═══════════════════════════════════════════════════════════════════════════
    // PÁGINA 2: Tabla docentes
    // ═══════════════════════════════════════════════════════════════════════════
    const HEADER_H = 38;
    doc.addPage();
    doc.setFillColor(0, 51, 102);
    doc.rect(0, 0, 210, HEADER_H, 'F');

    if (logoBase64) doc.addImage(logoBase64, 'PNG', 181, 4, 22, 27.8);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(17);
    doc.setFont("helvetica", "bold");
    doc.text("GESTIÓN CHROMEBOOKS 2026", 14, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Reporte Mensual: ${mesActual.toUpperCase()} ${anioActual}`, 14, 23);
    doc.text(`Emitido: ${fechaEmision}  ·  Responsable: Franco San Martín (Tec. Informático)`, 14, 31);

    const kpis = [
        { label: 'Total Préstamos', value: total, color: [13, 104, 50] },
        { label: 'Devoluciones OK', value: ok, color: [25, 135, 84] },
        { label: 'Pendientes', value: activos, color: [255, 193, 7] },
        { label: 'Con Daños', value: dmg, color: [211, 47, 47] },
        { label: 'Uso Laboratorio', value: labs, color: [111, 66, 193] },
        { label: 'Con Reemplazos', value: reemp, color: [220, 53, 69] }
    ];

    const kpiW = 27, kpiH = 18, kpiY0 = 44;
    const kpiX0 = 14;
    kpis.forEach((k, i) => {
        const x = kpiX0 + i * (kpiW + 4);
        doc.setFillColor(...k.color);
        doc.roundedRect(x, kpiY0, kpiW, kpiH, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(String(k.value), x + kpiW / 2, kpiY0 + 8, { align: 'center' });
        doc.setFontSize(5);
        doc.setFont("helvetica", "normal");
        doc.text(k.label.toUpperCase(), x + kpiW / 2, kpiY0 + 15, { align: 'center' });
    });

    doc.setFillColor(0, 51, 102);
    doc.roundedRect(14, 67, 182, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(`TASA DE RETORNO: ${tasa}%   ·   Stock: ${STOCK_MAXIMO} Chromebooks + ${STOCK_REEMPLAZO} Reemplazos`, 105, 73, { align: 'center' });

    const docentesMap = {};
    mesData.forEach(d => {
        const k = d.profesor ? d.profesor.trim() : "—";
        if (!docentesMap[k]) docentesMap[k] = { total: 0, ok: 0, reemp: 0, lab: 0, dmg: 0 };
        docentesMap[k].total++;
        if ((parseInt(d.chromebooks) + parseInt(d.reemplazo)) === parseInt(d.devueltos) && parseInt(d.devueltos) > 0) docentesMap[k].ok++;
        if (parseInt(d.reemplazo || 0) > 0) docentesMap[k].reemp++;
        if (d.uso_laboratorio === true || d.uso_laboratorio === "TRUE" || d.uso_laboratorio === "true") docentesMap[k].lab++;
        if (isDamagedRecord(d)) docentesMap[k].dmg++;
    });

    const todosDocentes = Object.entries(docentesMap).sort((a, b) => b[1].total - a[1].total);

    doc.setTextColor(44, 62, 80);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`Uso por Docente — ${todosDocentes.length} docente${todosDocentes.length !== 1 ? 's' : ''} registrados`, 14, 85);

    doc.autoTable({
        startY: 90,
        head: [['#', 'Docente Responsable', 'Préstamos', 'Dev. OK', 'Reemplazo', 'Lab', 'Daños']],
        body: todosDocentes.map(([nombre, v], i) => [i + 1, nombre, v.total, v.ok, v.reemp > 0 ? v.reemp : '—', v.lab > 0 ? v.lab : '—', v.dmg > 0 ? v.dmg : '—']),
        headStyles: { fillColor: [0, 51, 102], fontSize: 7, fontStyle: 'bold', textColor: 255 },
        bodyStyles: { fontSize: 7 },
        alternateRowStyles: { fillColor: [245, 248, 255] },
        margin: { left: 14, right: 14 },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 24, halign: 'center' },
            3: { cellWidth: 22, halign: 'center' },
            4: { cellWidth: 26, halign: 'center' },
            5: { cellWidth: 22, halign: 'center' },
            6: { cellWidth: 18, halign: 'center' }
        }
    });

    // ─── PÁGINA: DASHBOARD VISUAL ─────────────────────────────────────────────
    doc.addPage();

    // Header
    doc.setFillColor(0, 51, 102);
    doc.rect(0, 0, 210, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("DASHBOARD - ANÁLISIS VISUAL", 14, 13);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`${mesActual.toUpperCase()} ${anioActual}   |   ${total} préstamos   |   Tasa retorno: ${tasa}%   |   ${todosDocentes.length} docentes`, 14, 20);

    // ── Sección izquierda: ESTADO DE EQUIPOS ──────────────────────────────────
    const barData = [
        { label: 'Entregados', value: ok,     color: [13, 104, 50] },
        { label: 'Pendientes', value: activos, color: [255, 193, 7] },
        { label: 'Dañados',    value: dmg,    color: [211, 47, 47] },
        { label: 'Laboratorio',value: labs,   color: [111, 66, 193] },
        { label: 'Reemplazos', value: reemp,  color: [220, 53, 69] }
    ];
    const maxVal = Math.max(...barData.map(b => b.value), 1);

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(14, 27, 88, 52, 2, 2, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(14, 27, 88, 52, 2, 2, 'S');

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(44, 62, 80);
    doc.text("ESTADO DE EQUIPOS DEL MES", 58, 33, { align: 'center' });

    const bx0 = 50, bMaxW = 44, bH = 5, bGap = 7;
    barData.forEach((b, i) => {
        const by = 37 + i * bGap;
        const bw = maxVal > 0 ? (b.value / maxVal) * bMaxW : 0;
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        doc.text(b.label, bx0 - 1, by + 3.5, { align: 'right' });
        doc.setFillColor(235, 235, 235);
        doc.roundedRect(bx0, by, bMaxW, bH, 1, 1, 'F');
        if (bw > 0) {
            doc.setFillColor(...b.color);
            doc.roundedRect(bx0, by, bw, bH, 1, 1, 'F');
        }
        doc.setFontSize(6);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...b.color);
        doc.text(String(b.value), bx0 + bMaxW + 2, by + 3.5);
    });

    // ── Sección derecha: PRÉSTAMOS POR MES ────────────────────────────────────
    const anualData = Array(12).fill(0);
    db.forEach(d => {
        const dt = new Date(d.fecha + "T00:00:00");
        if (!isNaN(dt) && dt.getFullYear() === anioActual) anualData[dt.getMonth()]++;
    });

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(108, 27, 88, 52, 2, 2, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(108, 27, 88, 52, 2, 2, 'S');

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(44, 62, 80);
    doc.text(`PRÉSTAMOS POR MES - ${anioActual}`, 152, 33, { align: 'center' });

    const cx0 = 115, cY0 = 71, cW = 74, cH = 28;
    const maxAnual = Math.max(...anualData, 1);
    const monthShort = ["E","F","M","A","M","J","J","A","S","O","N","D"];
    const colW = cW / 12;

    // Grid line
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.2);
    doc.line(cx0, cY0 - cH, cx0 + cW, cY0 - cH);
    doc.line(cx0, cY0, cx0 + cW, cY0);

    // Line chart points
    const points = anualData.map((v, i) => ({
        x: cx0 + i * colW + colW / 2,
        y: cY0 - (v / maxAnual) * cH
    }));

    // Draw line
    doc.setDrawColor(13, 104, 50);
    doc.setLineWidth(0.8);
    for (let i = 0; i < points.length - 1; i++) {
        doc.line(points[i].x, points[i].y, points[i+1].x, points[i+1].y);
    }

    // Dots + labels
    points.forEach((p, i) => {
        doc.setFillColor(13, 104, 50);
        doc.circle(p.x, p.y, 1, 'F');
        doc.setFontSize(5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(120, 120, 120);
        doc.text(monthShort[i], p.x, cY0 + 4, { align: 'center' });
        if (anualData[i] > 0) {
            doc.setFontSize(5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(13, 104, 50);
            doc.text(String(anualData[i]), p.x, p.y - 2, { align: 'center' });
        }
    });

    // ── Sección central: TENDENCIA SEMANAL DEL MES ───────────────────────────
    // Barras + línea de tasa de retorno por semana escolar real
    const swRanges  = getWeekRanges(anioActual, viewDate.getMonth());
    const swKeys    = Object.keys(swRanges).map(Number).sort((a, b) => a - b);
    const swData    = swKeys.map(wk => {
        const r = swRanges[wk];
        const rows = mesData.filter(d => {
            const day = new Date(d.fecha + "T00:00:00").getDate();
            return day >= r.start && day <= r.end;
        });
        const prest = rows.length;
        const devOk = rows.filter(d => (parseInt(d.chromebooks) + parseInt(d.reemplazo)) === parseInt(d.devueltos) && parseInt(d.devueltos) > 0).length;
        return { label: r.label || `Sem ${wk}`, prest, tasa: prest > 0 ? Math.round((devOk / prest) * 100) : 0 };
    });

    const swBoxY = 84, swBoxH = 46;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(14, swBoxY, 182, swBoxH, 2, 2, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(14, swBoxY, 182, swBoxH, 2, 2, 'S');

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(44, 62, 80);
    doc.text("TENDENCIA SEMANAL — PRÉSTAMOS Y TASA DE RETORNO", 105, swBoxY + 6, { align: 'center' });

    const swPlotX0 = 24, swPlotY0 = swBoxY + swBoxH - 8, swPlotH = 28;
    const swPlotW  = 172;
    const swMaxPrest = Math.max(...swData.map(s => s.prest), 1);
    const swColW   = swPlotW / swData.length;

    // Grid lines horizontales (0%, 50%, 100% para tasa)
    [0, 50, 100].forEach(pct => {
        const gy = swPlotY0 - (pct / 100) * swPlotH;
        doc.setDrawColor(235, 235, 235);
        doc.setLineWidth(0.2);
        doc.line(swPlotX0, gy, swPlotX0 + swPlotW, gy);
        doc.setFontSize(4.5);
        doc.setTextColor(180, 180, 180);
        doc.text(`${pct}%`, swPlotX0 - 2, gy + 1.5, { align: 'right' });
    });

    // Barras de préstamos
    const barW = swColW * 0.55;
    swData.forEach((s, i) => {
        const bx  = swPlotX0 + i * swColW + (swColW - barW) / 2;
        const bh  = (s.prest / swMaxPrest) * swPlotH;
        const by  = swPlotY0 - bh;
        doc.setFillColor(180, 220, 200);
        doc.roundedRect(bx, by, barW, bh, 0.8, 0.8, 'F');
        doc.setFontSize(5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(13, 104, 50);
        doc.text(String(s.prest), bx + barW / 2, by - 1.5, { align: 'center' });
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(s.label.replace('Semana ', 'S'), bx + barW / 2, swPlotY0 + 4, { align: 'center' });
    });

    // Línea de tasa de retorno encima de las barras
    const swPoints = swData.map((s, i) => ({
        x: swPlotX0 + i * swColW + swColW / 2,
        y: swPlotY0 - (s.tasa / 100) * swPlotH
    }));
    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.7);
    for (let i = 0; i < swPoints.length - 1; i++) {
        doc.line(swPoints[i].x, swPoints[i].y, swPoints[i + 1].x, swPoints[i + 1].y);
    }
    swPoints.forEach((p, i) => {
        doc.setFillColor(0, 51, 102);
        doc.circle(p.x, p.y, 1, 'F');
        doc.setFontSize(4.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 51, 102);
        doc.text(`${swData[i].tasa}%`, p.x, p.y - 2, { align: 'center' });
    });

    // Leyenda mini
    doc.setFillColor(180, 220, 200);
    doc.rect(swPlotX0 + swPlotW - 55, swBoxY + 8, 5, 3, 'F');
    doc.setFontSize(5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text("Préstamos", swPlotX0 + swPlotW - 48, swBoxY + 10.5);
    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.7);
    doc.line(swPlotX0 + swPlotW - 25, swBoxY + 9.5, swPlotX0 + swPlotW - 20, swBoxY + 9.5);
    doc.setFillColor(0, 51, 102);
    doc.circle(swPlotX0 + swPlotW - 22.5, swBoxY + 9.5, 0.8, 'F');
    doc.text("Tasa retorno", swPlotX0 + swPlotW - 18, swBoxY + 10.5);

    // ── PRÉSTAMOS POR DOCENTE (barras horizontales, con paginación automática) ──
    // Área útil por página: desde Y=84 hasta Y=278 (deja 12 mm para footer).
    // Si los docentes no caben, se corta en páginas nuevas con su propio header.
    const dBarX0 = 60, dBarMaxW = 120, dBarH = 4, dBarGap = 6.2;
    const maxD        = todosDocentes.length > 0 ? todosDocentes[0][1].total : 1;
    const FOOTER_SAFE = 278;
    const HEADER_DOC_H = 22;
    const PAD_BOTTOM  = 8;

    // Primera sección: justo debajo del gráfico semanal (swBoxY + swBoxH + 4)
    const FIRST_SECTION_START = swBoxY + swBoxH + 4; // ≈ 138
    const FIRST_CONTENT_START = FIRST_SECTION_START + 10;
    // Cuántas filas caben antes del footer en la primera página
    // (FOOTER_SAFE - contentStart - PAD_BOTTOM) / dBarGap
    const MAX_ROWS_FIRST = Math.floor((FOOTER_SAFE - FIRST_CONTENT_START - PAD_BOTTOM) / dBarGap);

    // ── Páginas de continuación: header=22, sección desde Y=26, contenido Y=36 ─
    const CONT_SECTION_START = HEADER_DOC_H + 4;   // 26
    const CONT_CONTENT_START = HEADER_DOC_H + 14;  // 36
    const MAX_ROWS_CONT = Math.floor((FOOTER_SAFE - CONT_CONTENT_START - PAD_BOTTOM) / dBarGap);

    // Partir la lista en chunks según el espacio disponible por página
    const chunks = [];
    if (todosDocentes.length <= MAX_ROWS_FIRST) {
        chunks.push({ docs: todosDocentes, isFirst: true });
    } else {
        chunks.push({ docs: todosDocentes.slice(0, MAX_ROWS_FIRST), isFirst: true });
        let idx = MAX_ROWS_FIRST;
        while (idx < todosDocentes.length) {
            chunks.push({ docs: todosDocentes.slice(idx, idx + MAX_ROWS_CONT), isFirst: false });
            idx += MAX_ROWS_CONT;
        }
    }

    chunks.forEach((chunk, chunkIdx) => {
        if (!chunk.isFirst) {
            // Nueva página con header azul de continuación
            doc.addPage();
            doc.setFillColor(0, 51, 102);
            doc.rect(0, 0, 210, HEADER_DOC_H, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text("PRÉSTAMOS POR DOCENTE (cont.)", 14, 14);
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.text(`${mesActual.toUpperCase()} ${anioActual}`, 14, 20);
        }

        const sectionY   = chunk.isFirst ? FIRST_SECTION_START : CONT_SECTION_START;
        const contentY   = chunk.isFirst ? FIRST_CONTENT_START : CONT_CONTENT_START;
        // Alto del recuadro: título (10) + filas + padding inferior
        const sectionH   = 10 + chunk.docs.length * dBarGap + PAD_BOTTOM;
        const titleLabel = chunk.isFirst
            ? 'PRÉSTAMOS POR DOCENTE'
            : `PRÉSTAMOS POR DOCENTE — continuación (${chunkIdx + 1}/${chunks.length})`;

        // Rectángulo del bloque con padding real
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(14, sectionY, 182, sectionH, 2, 2, 'F');
        doc.setDrawColor(220, 220, 220);
        doc.roundedRect(14, sectionY, 182, sectionH, 2, 2, 'S');

        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(44, 62, 80);
        doc.text(titleLabel, 105, sectionY + 7, { align: 'center' });

        chunk.docs.forEach(([nombre, v], i) => {
            const dy = contentY + i * dBarGap;
            const dw = (v.total / maxD) * dBarMaxW;
            doc.setFontSize(5.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(80, 80, 80);
            doc.text(nombre, dBarX0 - 2, dy + 2.8, { align: 'right' });
            doc.setFillColor(235, 235, 235);
            doc.roundedRect(dBarX0, dy, dBarMaxW, dBarH, 1, 1, 'F');
            doc.setFillColor(13, 104, 50);
            doc.roundedRect(dBarX0, dy, dw, dBarH, 1, 1, 'F');
            doc.setFontSize(5.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(13, 104, 50);
            doc.text(String(v.total), dBarX0 + dBarMaxW + 2, dy + 2.8);
        }); // fin chunk.docs.forEach
    }); // fin chunks.forEach

    // ─── PÁGINAS: CONSOLIDADO COMPARATIVO MES ACTUAL vs MES ANTERIOR ────────
    // ── Datos del mes actual y del mes anterior ───────────────────────────────
    const mesActualIdx  = viewDate.getMonth();
    const mesAnteriorIdx = mesActualIdx > 0 ? mesActualIdx - 1 : null;
    const mesAnteriorNombre = mesAnteriorIdx !== null ? mNames[mesAnteriorIdx] : null;

    const _rowsMesAct = db.filter(d => {
        const dt = new Date(d.fecha + "T00:00:00");
        return !isNaN(dt) && dt.getFullYear() === anioActual && dt.getMonth() === mesActualIdx;
    });
    const _rowsMesAnt = mesAnteriorIdx !== null ? db.filter(d => {
        const dt = new Date(d.fecha + "T00:00:00");
        return !isNaN(dt) && dt.getFullYear() === anioActual && dt.getMonth() === mesAnteriorIdx;
    }) : [];

    const _calcStats = rows => {
        const total = rows.length;
        const ok    = rows.filter(d => {
            const t = parseInt(d.chromebooks||0) + parseInt(d.reemplazo||0);
            return t === parseInt(d.devueltos||0) && t > 0;
        }).length;
        const dmg   = rows.filter(d => isDamagedRecord(d)).length;
        const lab   = rows.filter(d => d.uso_laboratorio===true||d.uso_laboratorio==="TRUE"||d.uso_laboratorio==="true").length;
        const reemp = rows.filter(d => parseInt(d.reemplazo||0) > 0).length;
        const pend  = rows.filter(d => {
            const t = parseInt(d.chromebooks||0) + parseInt(d.reemplazo||0);
            return t > parseInt(d.devueltos||0) && !isDamagedRecord(d);
        }).length;
        const tasa  = total > 0 ? Math.round((ok / total) * 100) : 0;
        const docs  = new Set(rows.map(d => d.profesor).filter(Boolean)).size;
        return { total, ok, dmg, lab, reemp, pend, tasa, docs };
    };

    const stAct = _calcStats(_rowsMesAct);
    const stAnt = _calcStats(_rowsMesAnt);

    // ══════════════════════════════════════════════════════════════════════════
    // PÁGINA A — MÉTRICAS COMPARATIVAS + GRÁFICO
    // ══════════════════════════════════════════════════════════════════════════
    doc.addPage();

    // Header azul institucional
    doc.setFillColor(0, 51, 102);
    doc.rect(0, 0, 210, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    const titComp = mesAnteriorNombre
        ? `CONSOLIDADO: ${mesActual.toUpperCase()} vs ${mesAnteriorNombre.toUpperCase()} ${anioActual}`
        : `CONSOLIDADO: ${mesActual.toUpperCase()} ${anioActual}`;
    doc.text(titComp, 14, 13);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Generado: ${new Date().toLocaleDateString('es-CL')} · Responsable: Franco San Martín`, 14, 20);

    // ── Gráfico de barras lado a lado ─────────────────────────────────────────
    const grfY = 27, grfH = 52, grfX0 = 14, grfW = 88;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(grfX0, grfY, grfW, grfH, 2, 2, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(grfX0, grfY, grfW, grfH, 2, 2, 'S');

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(44, 62, 80);
    doc.text("COMPARACIÓN DE PRÉSTAMOS", grfX0 + grfW / 2, grfY + 6, { align: 'center' });

    const plotH = 28, plotY = grfY + grfH - 12;
    const maxValCmp = Math.max(stAct.total, stAnt.total, 1);
    const bW = 18;

    // Barra mes anterior
    if (mesAnteriorNombre) {
        const bhAnt = (stAnt.total / maxValCmp) * plotH;
        doc.setFillColor(159, 213, 184);
        doc.roundedRect(grfX0 + 18, plotY - bhAnt, bW, bhAnt, 1, 1, 'F');
        doc.setFontSize(5.5); doc.setFont("helvetica", "bold"); doc.setTextColor(80, 120, 80);
        doc.text(String(stAnt.total), grfX0 + 18 + bW / 2, plotY - bhAnt - 2, { align: 'center' });
        doc.setFontSize(5); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
        doc.text(mesAnteriorNombre.slice(0, 3), grfX0 + 18 + bW / 2, plotY + 5, { align: 'center' });
    }

    // Barra mes actual
    const bhAct = (stAct.total / maxValCmp) * plotH;
    doc.setFillColor(13, 104, 50);
    doc.roundedRect(grfX0 + 50, plotY - bhAct, bW, bhAct, 1, 1, 'F');
    doc.setFontSize(5.5); doc.setFont("helvetica", "bold"); doc.setTextColor(13, 104, 50);
    doc.text(String(stAct.total), grfX0 + 50 + bW / 2, plotY - bhAct - 2, { align: 'center' });
    doc.setFontSize(5); doc.setFont("helvetica", "bold"); doc.setTextColor(13, 104, 50);
    doc.text(mesActual.slice(0, 3) + ' ◀', grfX0 + 50 + bW / 2, plotY + 5, { align: 'center' });

    // % crecimiento si hay mes anterior
    if (mesAnteriorNombre && stAnt.total > 0) {
        const pctCrec = Math.round(((stAct.total - stAnt.total) / stAnt.total) * 100);
        const crecColor = pctCrec >= 0 ? [25, 135, 84] : [220, 53, 69];
        doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...crecColor);
        doc.text((pctCrec >= 0 ? '▲' : '▼') + Math.abs(pctCrec) + '%', grfX0 + grfW / 2, grfY + grfH - 4, { align: 'center' });
    }

    // ── Tabla de métricas comparativas ───────────────────────────────────────
    const tblX = 14 + grfW + 5, tblW = 210 - tblX - 14;
    const metricas = [
        { label: 'Préstamos totales', act: stAct.total,  ant: stAnt.total,  fmt: v => String(v),  color: [13, 104, 50],  mejora: 'mayor' },
        { label: 'Devueltos OK',      act: stAct.ok,     ant: stAnt.ok,     fmt: v => String(v),  color: [25, 135, 84],  mejora: 'mayor' },
        { label: 'Tasa de retorno',   act: stAct.tasa,   ant: stAnt.tasa,   fmt: v => v + '%',    color: [25, 135, 84],  mejora: 'mayor' },
        { label: 'Laboratorio',       act: stAct.lab,    ant: stAnt.lab,    fmt: v => String(v),  color: [111, 66, 193], mejora: 'neutro' },
        { label: 'Reemplazos',        act: stAct.reemp,  ant: stAnt.reemp,  fmt: v => String(v),  color: [220, 53, 69],  mejora: 'menor' },
        { label: 'Dañados',           act: stAct.dmg,    ant: stAnt.dmg,    fmt: v => v === 0 ? '✓' : String(v), color: [198, 40, 40], mejora: 'menor' },
        { label: 'Docentes activos',  act: stAct.docs,   ant: stAnt.docs,   fmt: v => String(v),  color: [13, 104, 50],  mejora: 'mayor' },
        { label: 'Pendientes',        act: stAct.pend,   ant: stAnt.pend,   fmt: v => v === 0 ? '✓' : String(v), color: [245, 124, 0], mejora: 'menor' },
    ];

    // Header tabla
    doc.setFillColor(0, 51, 102);
    doc.rect(tblX, grfY, tblW, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    doc.text("MÉTRICA", tblX + 2, grfY + 5.5);
    if (mesAnteriorNombre) doc.text(mesAnteriorNombre.slice(0, 3).toUpperCase(), tblX + tblW * 0.52, grfY + 5.5, { align: 'center' });
    doc.text(mesActual.slice(0, 3).toUpperCase(), tblX + tblW * 0.70, grfY + 5.5, { align: 'center' });
    doc.text("VAR.", tblX + tblW * 0.86, grfY + 5.5, { align: 'center' });

    let mry = grfY + 8;
    metricas.forEach((m, i) => {
        const rowH = 5.8;
        if (i % 2 === 0) { doc.setFillColor(248, 249, 250); doc.rect(tblX, mry, tblW, rowH, 'F'); }

        doc.setFontSize(5.2); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
        doc.text(m.label, tblX + 2, mry + 3.8);

        if (mesAnteriorNombre) {
            doc.setTextColor(120, 120, 120);
            doc.text(m.fmt(m.ant), tblX + tblW * 0.52, mry + 3.8, { align: 'center' });
        }

        doc.setTextColor(...m.color);
        doc.setFont("helvetica", "bold");
        doc.text(m.fmt(m.act), tblX + tblW * 0.70, mry + 3.8, { align: 'center' });

        if (mesAnteriorNombre) {
            const delta = m.act - m.ant;
            const mejora = m.mejora === 'mayor' ? delta > 0 : m.mejora === 'menor' ? delta < 0 : null;
            const varColor = mejora === true ? [25, 135, 84] : mejora === false ? [220, 53, 69] : [120, 120, 120];
            doc.setTextColor(...varColor);
            const varStr = delta === 0 ? '=' : (delta > 0 ? '▲+' : '▼') + (m.mejora === 'mayor' || m.mejora === 'menor' ? Math.abs(delta) + (m.label.includes('Tasa') ? '%' : '') : Math.abs(delta));
            doc.text(varStr, tblX + tblW * 0.86, mry + 3.8, { align: 'center' });
        }

        doc.setDrawColor(235, 235, 235); doc.setLineWidth(0.2);
        doc.line(tblX, mry + rowH, tblX + tblW, mry + rowH);
        mry += rowH;
    });

    // ── 3 KPIs destacados bajo el gráfico y la tabla ─────────────────────────
    const kpiY2 = grfY + grfH + 5;
    const kpis2 = [
        {
            label: 'Mejor indicador del mes',
            val: `Tasa ${stAct.tasa}%`,
            sub: mesAnteriorNombre ? (stAct.tasa >= stAnt.tasa ? `▲ +${stAct.tasa - stAnt.tasa}% vs ${mesAnteriorNombre.slice(0,3)}` : `▼ ${stAct.tasa - stAnt.tasa}% vs ${mesAnteriorNombre.slice(0,3)}`) : '',
            bg: [240, 255, 244], border: [129, 199, 132], tc: [13, 104, 50]
        },
        {
            label: 'Crecimiento en préstamos',
            val: mesAnteriorNombre && stAnt.total > 0 ? (Math.round(((stAct.total - stAnt.total) / stAnt.total) * 100) >= 0 ? '+' : '') + Math.round(((stAct.total - stAnt.total) / stAnt.total) * 100) + '%' : stAct.total + ' total',
            sub: mesAnteriorNombre ? `${stAnt.total} → ${stAct.total} préstamos` : `${stAct.total} préstamos`,
            bg: [255, 248, 225], border: [255, 193, 7], tc: [133, 100, 4]
        },
        {
            label: 'Atención: reemplazos',
            val: String(stAct.reemp),
            sub: mesAnteriorNombre ? (stAct.reemp > stAnt.reemp ? `▲ +${stAct.reemp - stAnt.reemp} vs ${mesAnteriorNombre.slice(0,3)}` : stAct.reemp < stAnt.reemp ? `▼ ${stAct.reemp - stAnt.reemp} vs ${mesAnteriorNombre.slice(0,3)}` : `Igual que ${mesAnteriorNombre.slice(0,3)}`) : `${stAct.reemp} reemplazos`,
            bg: [252, 228, 236], border: [239, 154, 154], tc: [198, 40, 40]
        }
    ];
    const kpiW2 = (182 - 10) / 3;
    kpis2.forEach((k, i) => {
        const kx = 14 + i * (kpiW2 + 5);
        doc.setFillColor(...k.bg); doc.roundedRect(kx, kpiY2, kpiW2, 18, 2, 2, 'F');
        doc.setDrawColor(...k.border); doc.setLineWidth(0.4); doc.roundedRect(kx, kpiY2, kpiW2, 18, 2, 2, 'S');
        doc.setFontSize(5.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...k.tc);
        doc.text(k.label.toUpperCase(), kx + kpiW2 / 2, kpiY2 + 5.5, { align: 'center' });
        doc.setFontSize(9); doc.text(k.val, kx + kpiW2 / 2, kpiY2 + 12, { align: 'center' });
        doc.setFontSize(5); doc.setFont("helvetica", "normal");
        doc.text(k.sub, kx + kpiW2 / 2, kpiY2 + 16.5, { align: 'center' });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // PÁGINA(S) B — CONSOLIDADO DE DOCENTES (todos, con paginación automática)
    // ══════════════════════════════════════════════════════════════════════════

    // Construir tabla de docentes: todos los del mes actual, ordenados por total desc
    const _docsAct = {};
    _rowsMesAct.forEach(d => {
        const p = (d.profesor || '').trim();
        if (!p) return;
        if (!_docsAct[p]) _docsAct[p] = { total: 0, ok: 0, lab: 0, reemp: 0, dmg: 0 };
        _docsAct[p].total++;
        const t = parseInt(d.chromebooks||0) + parseInt(d.reemplazo||0);
        if (t === parseInt(d.devueltos||0) && t > 0) _docsAct[p].ok++;
        if (d.uso_laboratorio===true||d.uso_laboratorio==="TRUE"||d.uso_laboratorio==="true") _docsAct[p].lab++;
        if (parseInt(d.reemplazo||0) > 0) _docsAct[p].reemp++;
        if (isDamagedRecord(d)) _docsAct[p].dmg++;
    });

    const _docsAntSet = new Set(_rowsMesAnt.map(d => (d.profesor || '').trim()).filter(Boolean));
    const _docsAntCount = {};
    _rowsMesAnt.forEach(d => {
        const p = (d.profesor || '').trim();
        if (!p) return;
        _docsAntCount[p] = (_docsAntCount[p] || 0) + 1;
    });

    const docsTabla = Object.entries(_docsAct)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([nombre, v]) => ({
            nombre,
            ...v,
            ant: _docsAntCount[nombre] || 0,
            esNuevo: !_docsAntSet.has(nombre)
        }));

    const maxDocTotal = docsTabla.length > 0 ? docsTabla[0].total : 1;

    // Paginación con valores reales:
    // - grfY=27, grfH=52 → kpiY2=84 → tabla empieza en kpiY2+24 = 108
    // - Footer en Y=283 (dejamos 5mm extra de margen sobre el footer del PDF)
    const DOCFILA_H      = 7;
    const DOCHDR_H       = 22;
    const DOCFOOT_SAFE   = 272; // conservador: 15mm antes del borde inferior
    const DOCCONTENT_FIRST = 108; // Y real donde empieza la tabla en la primera página
    const DOCCONTENT_CONT  = DOCHDR_H + 14;
    const MAX_ROWS_DOC_FIRST = Math.floor((DOCFOOT_SAFE - DOCCONTENT_FIRST) / DOCFILA_H);
    const MAX_ROWS_DOC_CONT  = Math.floor((DOCFOOT_SAFE - DOCCONTENT_CONT) / DOCFILA_H);

    // Dividir en chunks
    const docChunks = [];
    if (docsTabla.length <= MAX_ROWS_DOC_FIRST) {
        docChunks.push({ rows: docsTabla, isFirst: true });
    } else {
        docChunks.push({ rows: docsTabla.slice(0, MAX_ROWS_DOC_FIRST), isFirst: true });
        let idx = MAX_ROWS_DOC_FIRST;
        while (idx < docsTabla.length) {
            docChunks.push({ rows: docsTabla.slice(idx, idx + MAX_ROWS_DOC_CONT), isFirst: false });
            idx += MAX_ROWS_DOC_CONT;
        }
    }

    // Función que dibuja el header de la tabla de docentes
    const _drawDocHeader = (y) => {
        doc.setFillColor(13, 104, 50);
        doc.rect(14, y, 182, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "bold");
        const dcols = { n: 14, nombre: 22, ant: 90, act: 108, var: 124, lab: 140, remp: 155, dmg: 168, barra: 178 };
        doc.text('#',                dcols.n     + 1, y + 5.5);
        doc.text('DOCENTE',          dcols.nombre + 1, y + 5.5);
        doc.text(mesAnteriorNombre ? mesAnteriorNombre.slice(0,3).toUpperCase() : '—', dcols.ant + 4, y + 5.5, { align: 'center' });
        doc.text(mesActual.slice(0,3).toUpperCase(), dcols.act + 4, y + 5.5, { align: 'center' });
        doc.text('VAR.', dcols.var + 4, y + 5.5, { align: 'center' });
        doc.text('LAB', dcols.lab + 4,  y + 5.5, { align: 'center' });
        doc.text('REEMP', dcols.remp + 3, y + 5.5, { align: 'center' });
        doc.text('DAÑO', dcols.dmg + 3,  y + 5.5, { align: 'center' });
        doc.text('BARRA', dcols.barra + 5, y + 5.5, { align: 'center' });
        return dcols;
    };

    docChunks.forEach((chunk, ci) => {
        // Nueva página para continuación (o agregar a la página actual si es first)
        if (!chunk.isFirst) {
            doc.addPage();
            doc.setFillColor(0, 51, 102);
            doc.rect(0, 0, 210, DOCHDR_H, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(12); doc.setFont("helvetica", "bold");
            doc.text(`CONSOLIDADO DOCENTES — ${mesActual.toUpperCase()} vs ${mesAnteriorNombre || ''}  (cont. ${ci + 1}/${docChunks.length})`, 14, 14);
            doc.setFontSize(8); doc.setFont("helvetica", "normal");
            doc.text(`${anioActual} · Franco San Martín`, 14, 20);
        }

        const startY  = chunk.isFirst ? kpiY2 + 24 : DOCCONTENT_CONT;
        const dcols   = _drawDocHeader(startY);
        let   dry     = startY + 8;

        chunk.rows.forEach((d, i) => {
            // Guard: nunca dibujar más allá del footer seguro
            if (dry + DOCFILA_H > DOCFOOT_SAFE) return;
            if (d.esNuevo) {
                doc.setFillColor(255, 237, 213);
            } else if (i % 2 === 0) {
                doc.setFillColor(248, 249, 250);
            } else {
                doc.setFillColor(255, 255, 255);
            }
            // Rect desde x=17 (no desde 14) para no quedar pegado al borde de página
            doc.rect(17, dry, 179, DOCFILA_H, 'F');

            // Número de orden global
            const nGlobal = (ci === 0 ? 0 : MAX_ROWS_DOC_FIRST + (ci - 1) * MAX_ROWS_DOC_CONT) + i + 1;
            doc.setFontSize(5); doc.setFont("helvetica", "normal");
            doc.setTextColor(150, 150, 150);
            doc.text(String(nGlobal), dcols.n + 1, dry + 4.5);

            // Nombre — texto naranja con ★ si es nuevo, sin rectángulo de fondo
            if (d.esNuevo) {
                doc.setTextColor(230, 81, 0);
                doc.setFont("helvetica", "bold");
                doc.text('★ ' + d.nombre, dcols.nombre + 1, dry + 4.8);
            } else {
                doc.setTextColor(50, 50, 50);
                doc.setFont("helvetica", "normal");
                doc.text(d.nombre, dcols.nombre + 1, dry + 4.8);
            }

            // Mes anterior
            doc.setTextColor(150, 150, 150);
            doc.setFont("helvetica", "normal");
            doc.text(d.ant > 0 ? String(d.ant) : '—', dcols.ant + 4, dry + 4.8, { align: 'center' });

            // Mes actual
            doc.setTextColor(13, 104, 50);
            doc.setFont("helvetica", "bold");
            doc.text(String(d.total), dcols.act + 4, dry + 4.8, { align: 'center' });

            // Variación
            const delta = d.total - d.ant;
            if (d.esNuevo) {
                doc.setTextColor(230, 81, 0);
                doc.text('NUEVO', dcols.var + 4, dry + 4.8, { align: 'center' });
            } else {
                const vc = delta > 0 ? [25,135,84] : delta < 0 ? [220,53,69] : [150,150,150];
                doc.setTextColor(...vc);
                doc.text(delta === 0 ? '=' : (delta > 0 ? '+' : '') + delta, dcols.var + 4, dry + 4.8, { align: 'center' });
            }

            // Lab, Reemp, Daño
            doc.setTextColor(111, 66, 193); doc.setFont("helvetica", "normal");
            doc.text(d.lab > 0 ? String(d.lab) : '—', dcols.lab + 4, dry + 4.8, { align: 'center' });
            doc.setTextColor(220, 53, 69);
            doc.text(d.reemp > 0 ? String(d.reemp) : '—', dcols.remp + 3, dry + 4.8, { align: 'center' });
            doc.setTextColor(d.dmg > 0 ? 220 : 150, d.dmg > 0 ? 53 : 150, d.dmg > 0 ? 69 : 150);
            doc.text(d.dmg > 0 ? String(d.dmg) : '✓', dcols.dmg + 3, dry + 4.8, { align: 'center' });

            // Mini barra proporcional
            const barX = dcols.barra, barW3 = 26, barH3 = 3;
            const bFill = (d.total / maxDocTotal) * barW3;
            doc.setFillColor(235, 235, 235);
            doc.roundedRect(barX, dry + 2, barW3, barH3, 0.5, 0.5, 'F');
            doc.setFillColor(d.esNuevo ? 230 : 13, d.esNuevo ? 81 : 104, d.esNuevo ? 0 : 50);
            doc.roundedRect(barX, dry + 2, bFill, barH3, 0.5, 0.5, 'F');

            // Línea separadora
            doc.setDrawColor(235, 235, 235); doc.setLineWidth(0.15);
            doc.line(14, dry + DOCFILA_H, 196, dry + DOCFILA_H);

            dry += DOCFILA_H;
        });

        // Leyenda naranja al pie de la última página de docentes
        if (ci === docChunks.length - 1) {
            doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
            doc.setFillColor(255, 237, 213);
            doc.roundedRect(14, dry + 2, 100, 6, 1, 1, 'F');
            doc.setTextColor(230, 81, 0);
            doc.text('★ Docente nuevo: no registró préstamos en ' + (mesAnteriorNombre || 'mes anterior'), 16, dry + 6);
        }
    });

    // El footer de estas páginas lo maneja el loop final

    // El footer de estas páginas lo maneja el loop final

    // ══════════════════════════════════════════════════════════════════════════
    // PÁGINA: OBSERVACIONES DEL MES
    // ══════════════════════════════════════════════════════════════════════════
    const _obsAct = _rowsMesAct.filter(d => {
        const o = (d.observacion || '').trim().toLowerCase();
        return o && !['sin novedad', 'ok', 'sin novedades', ''].includes(o);
    }).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    doc.addPage();

    // Header naranja
    doc.setFillColor(0, 51, 102);
    doc.rect(0, 0, 210, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`OBSERVACIONES DEL MES — ${mesActual.toUpperCase()} ${anioActual}`, 14, 13);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`${_obsAct.length} registro${_obsAct.length !== 1 ? 's' : ''} con observación · Generado: ${new Date().toLocaleDateString('es-CL')}`, 14, 20);

    if (_obsAct.length === 0) {
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150, 150, 150);
        doc.text('Sin observaciones registradas este mes.', 105, 120, { align: 'center' });
    } else {
        // Columnas rediseñadas con más espacio para fecha y observación
        const obsColY = 27;
        doc.setFillColor(0, 51, 102);
        doc.rect(14, obsColY, 182, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "bold");
        // Columnas: FECHA(17-36) DOCENTE(38-94) CURSO(96-118) ASIGNATURA(120-150) ESTADO(152-172) OBS(174-196)
        const obsCols = { fecha: 17, prof: 38, curso: 96, asig: 120, estado: 152, obs: 174 };
        doc.text('FECHA',       obsCols.fecha  + 1, obsColY + 5.5);
        doc.text('DOCENTE',     obsCols.prof   + 1, obsColY + 5.5);
        doc.text('CURSO',       obsCols.curso  + 1, obsColY + 5.5);
        doc.text('ASIGNATURA',  obsCols.asig   + 1, obsColY + 5.5);
        doc.text('ESTADO',      obsCols.estado + 1, obsColY + 5.5);
        doc.text('OBSERVACIÓN', obsCols.obs    + 1, obsColY + 5.5);

        let ory = obsColY + 8;
        const OBS_ROW_H  = 8;
        const OBS_FOOTER = 278;
        const OBS_HDR_H  = 22;

        _obsAct.forEach((d, i) => {
            if (ory + OBS_ROW_H > OBS_FOOTER) {
                doc.addPage();
                doc.setFillColor(0, 51, 102);
                doc.rect(0, 0, 210, OBS_HDR_H, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(12); doc.setFont("helvetica", "bold");
                doc.text(`OBSERVACIONES — ${mesActual.toUpperCase()} ${anioActual} (cont.)`, 14, 14);
                doc.setFontSize(8); doc.setFont("helvetica", "normal");
                doc.text(`Página continuación`, 14, 20);

                doc.setFillColor(0, 51, 102);
                doc.rect(14, OBS_HDR_H + 2, 182, 8, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(5.5); doc.setFont("helvetica", "bold");
                doc.text('FECHA',       obsCols.fecha  + 1, OBS_HDR_H + 7.5);
                doc.text('DOCENTE',     obsCols.prof   + 1, OBS_HDR_H + 7.5);
                doc.text('CURSO',       obsCols.curso  + 1, OBS_HDR_H + 7.5);
                doc.text('ASIGNATURA',  obsCols.asig   + 1, OBS_HDR_H + 7.5);
                doc.text('ESTADO',      obsCols.estado + 1, OBS_HDR_H + 7.5);
                doc.text('OBSERVACIÓN', obsCols.obs    + 1, OBS_HDR_H + 7.5);
                ory = OBS_HDR_H + 10;
            }

            const esDmg = isDamagedRecord(d);
            if (esDmg) {
                doc.setFillColor(255, 245, 245);
            } else if (i % 2 === 0) {
                doc.setFillColor(240, 245, 255);
            } else {
                doc.setFillColor(255, 255, 255);
            }
            doc.rect(14, ory, 182, OBS_ROW_H, 'F');

            const partes  = (d.fecha || '').split('-');
            const fechaStr = partes.length === 3 ? `${partes[2]}/${partes[1]}` : d.fecha;
            const obsText  = (d.observacion || '').trim();
            const estado   = isDamagedRecord(d) ? 'DAÑO'
                : d.uso_laboratorio === true || d.uso_laboratorio === 'TRUE' || d.uso_laboratorio === 'true' ? 'LABORATORIO'
                : (d.estado_operativo || '').toUpperCase() || '—';

            // Fecha completa visible, sin borde que la tape
            doc.setFontSize(5.5); doc.setFont("helvetica", "bold");
            doc.setTextColor(esDmg ? 198 : 60, esDmg ? 40 : 60, esDmg ? 40 : 60);
            doc.text(fechaStr, obsCols.fecha + 2, ory + 5.2);

            // Docente (max 28 chars en col 56px)
            doc.setFont("helvetica", "normal"); doc.setTextColor(40, 40, 40);
            const profTxt = (d.profesor || '—').length > 28 ? (d.profesor || '').slice(0, 28) + '.' : (d.profesor || '—');
            doc.text(profTxt, obsCols.prof + 1, ory + 5.2);

            // Curso (max 10 chars)
            const cursoTxt = (d.curso || '—').slice(0, 10);
            doc.text(cursoTxt, obsCols.curso + 1, ory + 5.2);

            // Asignatura (max 16 chars)
            const asigTxt = (d.asignatura || '—').length > 16 ? (d.asignatura || '').slice(0, 16) + '.' : (d.asignatura || '—');
            doc.text(asigTxt, obsCols.asig + 1, ory + 5.2);

            // Estado con color
            const estColor = esDmg ? [198,40,40]
                : estado === 'LABORATORIO' ? [111,66,193]
                : [13,104,50];
            doc.setFont("helvetica", "bold"); doc.setTextColor(...estColor);
            doc.text(estado, obsCols.estado + 1, ory + 5.2);

            // Observación (max 18 chars col estrecha)
            doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
            const obsTxt = obsText.length > 18 ? obsText.slice(0, 18) + '…' : obsText;
            doc.text(obsTxt, obsCols.obs + 1, ory + 5.2);

            doc.setDrawColor(220, 228, 245); doc.setLineWidth(0.15);
            doc.line(14, ory + OBS_ROW_H, 196, ory + OBS_ROW_H);
            ory += OBS_ROW_H;
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PÁGINA: CONSOLIDADO DAÑOS Y OBSERVACIONES (mes actual vs mes anterior)
    // ══════════════════════════════════════════════════════════════════════════
    const _obsAnt = _rowsMesAnt.filter(d => {
        const o = (d.observacion || '').trim().toLowerCase();
        return o && !['sin novedad', 'ok', 'sin novedades', ''].includes(o);
    });
    const _dmgAct = _rowsMesAct.filter(d => isDamagedRecord(d));
    const _dmgAnt = _rowsMesAnt.filter(d => isDamagedRecord(d));

    // Tipos de daño del mes actual agrupados
    const _tiposDmg = {};
    _dmgAct.forEach(d => {
        const tipo = (d.tipo_danio || d.observacion || 'Sin especificar').trim();
        _tiposDmg[tipo] = (_tiposDmg[tipo] || 0) + 1;
    });

    doc.addPage();

    // Header rojo
    doc.setFillColor(0, 51, 102);
    doc.rect(0, 0, 210, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    const titDmg = mesAnteriorNombre
        ? `DAÑOS Y OBSERVACIONES: ${mesActual.toUpperCase()} vs ${mesAnteriorNombre.toUpperCase()}`
        : `DAÑOS Y OBSERVACIONES: ${mesActual.toUpperCase()} ${anioActual}`;
    doc.text(titDmg, 14, 13);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`${anioActual} · Responsable: Franco San Martín`, 14, 20);

    // ── Bloque superior: comparativa de KPIs daños y obs ─────────────────────
    const dmgKpis = [
        { label: 'Daños mes actual',     val: _dmgAct.length,  ant: _dmgAnt.length,  bg: [255,245,245], bc: [239,154,154], tc: [198,40,40] },
        { label: 'Obs. mes actual',       val: _obsAct.length,  ant: _obsAnt.length,  bg: [255,248,235], bc: [255,183,77],  tc: [188,100,0] },
        { label: 'Daños acumulado año',   val: db.filter(d => { const dt = new Date(d.fecha+"T00:00:00"); return !isNaN(dt) && dt.getFullYear()===anioActual && isDamagedRecord(d); }).length, ant: null, bg: [255,235,238], bc: [239,154,154], tc: [198,40,40] },
        { label: 'Obs. acumulado año',    val: db.filter(d => { const dt = new Date(d.fecha+"T00:00:00"); const o=(d.observacion||'').trim().toLowerCase(); return !isNaN(dt) && dt.getFullYear()===anioActual && o && !['sin novedad','ok','sin novedades',''].includes(o); }).length, ant: null, bg: [255,248,225], bc: [255,183,77], tc: [188,100,0] },
    ];

    const dkW = (182 - 15) / 4;
    dmgKpis.forEach((k, i) => {
        const kx = 14 + i * (dkW + 5);
        doc.setFillColor(...k.bg);
        doc.roundedRect(kx, 27, dkW, 22, 2, 2, 'F');
        doc.setDrawColor(...k.bc); doc.setLineWidth(0.4);
        doc.roundedRect(kx, 27, dkW, 22, 2, 2, 'S');
        doc.setFontSize(5.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...k.tc);
        doc.text(k.label.toUpperCase(), kx + dkW / 2, 33, { align: 'center' });
        doc.setFontSize(13);
        doc.text(String(k.val), kx + dkW / 2, 42, { align: 'center' });
        if (k.ant !== null && mesAnteriorNombre) {
            const dlt = k.val - k.ant;
            doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
            const dltC = dlt > 0 ? [220,53,69] : dlt < 0 ? [25,135,84] : [150,150,150];
            doc.setTextColor(...dltC);
            doc.text((dlt > 0 ? '▲+' : dlt < 0 ? '▼' : '=') + Math.abs(dlt) + ` vs ${mesAnteriorNombre.slice(0,3)}`, kx + dkW / 2, 47, { align: 'center' });
        }
    });

    // ── Tabla daños del mes actual ────────────────────────────────────────────
    const dmgTblY = 54;
    doc.setFillColor(198, 40, 40);
    doc.rect(14, dmgTblY, 182, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(5.5); doc.setFont("helvetica", "bold");
    doc.text(`DETALLE DE DAÑOS — ${mesActual.toUpperCase()} (${_dmgAct.length} registro${_dmgAct.length !== 1 ? 's' : ''})`, 16, dmgTblY + 5);

    if (_dmgAct.length === 0) {
        doc.setFillColor(240, 255, 244);
        doc.rect(14, dmgTblY + 7, 182, 10, 'F');
        doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(25, 135, 84);
        doc.text('✓ Sin equipos dañados este mes', 105, dmgTblY + 13.5, { align: 'center' });
    } else {
        // Sub-header
        doc.setFillColor(248, 235, 235);
        doc.rect(14, dmgTblY + 7, 182, 7, 'F');
        doc.setFontSize(5.2); doc.setFont("helvetica", "bold"); doc.setTextColor(100, 40, 40);
        const dmgCols = { fecha: 14, prof: 30, curso: 78, chr: 104, ree: 116, dev: 128, tipo: 142 };
        doc.text('FECHA',    dmgCols.fecha + 1, dmgTblY + 12);
        doc.text('DOCENTE',  dmgCols.prof  + 1, dmgTblY + 12);
        doc.text('CURSO',    dmgCols.curso + 1, dmgTblY + 12);
        doc.text('CB',       dmgCols.chr   + 1, dmgTblY + 12);
        doc.text('REEMP',    dmgCols.ree   + 1, dmgTblY + 12);
        doc.text('DEV',      dmgCols.dev   + 1, dmgTblY + 12);
        doc.text('TIPO / OBSERVACIÓN', dmgCols.tipo + 1, dmgTblY + 12);

        let dry2 = dmgTblY + 14;
        _dmgAct.forEach((d, i) => {
            if (i % 2 === 0) { doc.setFillColor(255, 250, 250); doc.rect(14, dry2, 182, 7, 'F'); }

            const partes = (d.fecha || '').split('-');
            const fStr = partes.length === 3 ? `${partes[2]}/${partes[1]}` : d.fecha;
            const profD = (d.profesor || '—').slice(0, 22);
            const tipoD = (d.tipo_danio || d.observacion || '—').slice(0, 30);

            doc.setFontSize(5.2); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 20, 20);
            doc.text(fStr,   dmgCols.fecha + 1, dry2 + 4.8);
            doc.text(profD,  dmgCols.prof  + 1, dry2 + 4.8);
            doc.text(d.curso || '—', dmgCols.curso + 1, dry2 + 4.8);
            doc.setTextColor(13, 104, 50);
            doc.text(String(d.chromebooks || 0), dmgCols.chr  + 1, dry2 + 4.8);
            doc.text(String(d.reemplazo   || 0), dmgCols.ree  + 1, dry2 + 4.8);
            doc.text(String(d.devueltos   || 0), dmgCols.dev  + 1, dry2 + 4.8);
            doc.setTextColor(198, 40, 40); doc.setFont("helvetica", "bold");
            doc.text(tipoD, dmgCols.tipo + 1, dry2 + 4.8);

            doc.setDrawColor(255, 220, 220); doc.setLineWidth(0.15);
            doc.line(14, dry2 + 7, 196, dry2 + 7);
            dry2 += 7;
        });

        // Tipos de daño agrupados
        if (Object.keys(_tiposDmg).length > 0) {
            dry2 += 3;
            doc.setFontSize(5.5); doc.setFont("helvetica", "bold"); doc.setTextColor(100, 40, 40);
            doc.text('Tipos de daño:', 16, dry2);
            let tx = 50;
            Object.entries(_tiposDmg).forEach(([tipo, cnt]) => {
                doc.setFillColor(255, 235, 235);
                doc.roundedRect(tx, dry2 - 4, Math.min(tipo.length * 2.8 + 14, 55), 6, 1, 1, 'F');
                doc.setDrawColor(220, 53, 69); doc.setLineWidth(0.3);
                doc.roundedRect(tx, dry2 - 4, Math.min(tipo.length * 2.8 + 14, 55), 6, 1, 1, 'S');
                doc.setTextColor(198, 40, 40);
                doc.text(`${tipo.slice(0,18)} (${cnt})`, tx + 2, dry2 + 0.8);
                tx += Math.min(tipo.length * 2.8 + 18, 59);
                if (tx > 180) { tx = 50; dry2 += 8; }
            });
            dry2 += 8;
        }
    }

    // ── Comparativa daños/obs vs mes anterior ─────────────────────────────────
    const cmpDmgY = _dmgAct.length === 0 ? dmgTblY + 22 :
        dmgTblY + 14 + _dmgAct.length * 7 + (Object.keys(_tiposDmg).length > 0 ? 14 : 0) + 8;

    if (cmpDmgY < 230 && mesAnteriorNombre) {
        doc.setFillColor(40, 40, 80);
        doc.rect(14, cmpDmgY, 182, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(5.5); doc.setFont("helvetica", "bold");
        doc.text(`COMPARATIVA VS ${mesAnteriorNombre.toUpperCase()}: DAÑOS Y OBSERVACIONES`, 16, cmpDmgY + 5);

        // Tabla simple 2 columnas
        const cmpRows = [
            ['Registros con daño',       _dmgAct.length,  _dmgAnt.length],
            ['Docentes con daño',         new Set(_dmgAct.map(d=>d.profesor).filter(Boolean)).size, new Set(_dmgAnt.map(d=>d.profesor).filter(Boolean)).size],
            ['Registros con observación', _obsAct.length,  _obsAnt.length],
            ['Docentes con obs.',          new Set(_obsAct.map(d=>d.profesor).filter(Boolean)).size, new Set(_obsAnt.map(d=>d.profesor).filter(Boolean)).size],
        ];

        // Header
        doc.setFillColor(60, 60, 100);
        doc.rect(14, cmpDmgY + 7, 182, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(5.2); doc.setFont("helvetica", "bold");
        doc.text('MÉTRICA',                     16, cmpDmgY + 12.5);
        doc.text(mesAnteriorNombre.slice(0,3).toUpperCase(), 120, cmpDmgY + 12.5, { align: 'center' });
        doc.text(mesActual.slice(0,3).toUpperCase(),         148, cmpDmgY + 12.5, { align: 'center' });
        doc.text('VAR.',                        174, cmpDmgY + 12.5, { align: 'center' });

        let cry = cmpDmgY + 14;
        cmpRows.forEach((row, i) => {
            if (i % 2 === 0) { doc.setFillColor(248, 248, 255); doc.rect(14, cry, 182, 7, 'F'); }
            const delta = row[2] - row[1];
            const dColor = delta > 0 ? [220,53,69] : delta < 0 ? [25,135,84] : [150,150,150];
            const dStr   = delta === 0 ? '=' : (delta > 0 ? '▲+' : '▼') + Math.abs(delta);

            doc.setFontSize(5.2); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
            doc.text(row[0],           16, cry + 4.8);
            doc.setTextColor(100, 100, 100);
            doc.text(String(row[1]),   120, cry + 4.8, { align: 'center' });
            doc.setTextColor(40, 40, 40); doc.setFont("helvetica", "bold");
            doc.text(String(row[2]),   148, cry + 4.8, { align: 'center' });
            doc.setTextColor(...dColor);
            doc.text(dStr,             174, cry + 4.8, { align: 'center' });

            doc.setDrawColor(220, 220, 240); doc.setLineWidth(0.15);
            doc.line(14, cry + 7, 196, cry + 7);
            cry += 7;
        });
    }

    // ─── PÁGINA: RESUMEN SEMANAL + ALERTAS ───────────────────────────────────
    doc.addPage();

    doc.setFillColor(0, 51, 102);
    doc.rect(0, 0, 210, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("RESUMEN SEMANAL", 14, 13);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`${mesActual.toUpperCase()} ${anioActual}`, 14, 20);

    // Build weekly data usando SCHOOL_WEEKS real (no rangos fijos de 7 días)
    const pdfWeekRanges = getWeekRanges(anioActual, viewDate.getMonth());
    const pdfWeekKeys = Object.keys(pdfWeekRanges).map(Number).sort((a, b) => a - b);

    const weeklyData = pdfWeekKeys.map(wk => {
        const range = pdfWeekRanges[wk];
        const uniqueWeek = mesData.filter(d => {
            const dt = new Date(d.fecha + "T00:00:00");
            if (isNaN(dt)) return false;
            const day = dt.getDate();
            return day >= range.start && day <= range.end;
        });
        const prest = uniqueWeek.length;
        const chr = uniqueWeek.reduce((a, d) => a + parseInt(d.chromebooks || 0), 0);
        const rep = uniqueWeek.reduce((a, d) => a + parseInt(d.reemplazo || 0), 0);
        const dev = uniqueWeek.filter(d => (parseInt(d.chromebooks) + parseInt(d.reemplazo)) === parseInt(d.devueltos) && parseInt(d.devueltos) > 0).length;
        const tasaW = prest > 0 ? Math.round((dev / prest) * 100) : 0;
        const label = range.label || `Semana ${wk}`;
        const rangeStr = `${range.start}–${range.end}`;
        return [`${label} (${rangeStr})`, prest, chr, rep, dev, `${tasaW}%`];
    });

    doc.autoTable({
        startY: 30,
        head: [['Período', 'Préstamos', 'Chromebooks', 'Reemplazos', 'Devueltos OK', 'Tasa']],
        body: weeklyData,
        headStyles: { fillColor: [0, 51, 102], fontSize: 8, fontStyle: 'bold', textColor: 255 },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 248, 255] },
        margin: { left: 14, right: 14 }
    });

    // Alertas
    const alertas = mesData.filter(d => (parseInt(d.chromebooks || 0) + parseInt(d.reemplazo || 0)) > parseInt(d.devueltos || 0) && !isDamagedRecord(d));
    const alertasY = doc.lastAutoTable.finalY + 12;

    doc.setFillColor(198, 40, 40);
    doc.roundedRect(14, alertasY, 182, 10, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("⚠ ALERTAS DEL MES", 17, alertasY + 6.5);
    doc.setFontSize(8);
    doc.text(`${alertas.length} alerta${alertas.length !== 1 ? 's' : ''}`, 192, alertasY + 6.5, { align: 'right' });

    if (alertas.length === 0) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        doc.text("✓ Sin alertas pendientes en este mes.", 105, alertasY + 20, { align: 'center' });
    } else {
        doc.autoTable({
            startY: alertasY + 12,
            head: [['Tipo', 'Fecha', 'Profesor', 'Curso', 'Detalle']],
            body: alertas.map(d => [
                'PENDIENTE',
                d.fecha || '—',
                d.profesor || '—',
                d.curso || '—',
                `Chr:${d.chromebooks || 0} Ree:${d.reemplazo || 0} Dev:${d.devueltos || 0}`
            ]),
            headStyles: { fillColor: [198, 40, 40], fontSize: 7, fontStyle: 'bold', textColor: 255 },
            bodyStyles: { fontSize: 7 },
            alternateRowStyles: { fillColor: [255, 245, 245] },
            margin: { left: 14, right: 14 }
        });
    }

    // ─── FOOTER EN TODAS LAS PÁGINAS ─────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(128);
        doc.text("Área de Informática – Responsable: Franco San Martín – NSG 2026", 14, 290);
        doc.text(`Página ${i} de ${pageCount}`, 196, 290, { align: 'right' });
    }

    doc.save(`Reporte_Franco_${mesActual}_${anioActual}.pdf`);
}

function renderAlertasPanel(mesCompleto) {
    const wrapper = document.getElementById('alertasPanelWrapper');
    const body = document.getElementById('alertasBody');
    const badge = document.getElementById('alertasCount');
    if (!wrapper || !body) return;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const pendientes = mesCompleto.filter(d => {
        const total = parseInt(d.chromebooks || 0) + parseInt(d.reemplazo || 0);
        const dev = parseInt(d.devueltos || 0);
        const isDmg = isDamagedRecord(d);
        return total > dev && !isDmg;
    });

    const danados = mesCompleto.filter(d => isDamagedRecord(d));
    const totalAlertas = pendientes.length + danados.length;

    if (totalAlertas === 0) {
        wrapper.style.display = 'none';
        return;
    }

    wrapper.style.display = 'block';
    if (badge) badge.textContent = totalAlertas;

    let html = '';

    pendientes.forEach(d => {
        const fechaD = new Date(d.fecha + "T00:00:00");
        const diffMs = hoy - fechaD;
        const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const total = parseInt(d.chromebooks || 0) + parseInt(d.reemplazo || 0);
        const dev = parseInt(d.devueltos || 0);
        const falta = total - dev;
        const fechaFmt = d.fecha.split('-').reverse().slice(0, 2).join('/');

        let diasClass = 'alerta-dias';
        let diasLabel = '';
        let diasTitle = '';
        if (dias === 0) {
            diasClass += ' hoy';
            diasLabel = 'HOY';
            diasTitle = 'Préstamo de hoy';
        } else if (dias === 1) {
            diasClass += ' reciente';
            diasLabel = '1d';
            diasTitle = 'Hace 1 día';
        } else if (dias <= 3) {
            diasClass += ' reciente';
            diasLabel = `${dias}d`;
            diasTitle = `Hace ${dias} días`;
        } else if (dias <= 7) {
            // naranja fuerte — lleva más de 3 días
            diasClass += ' semana';
            diasLabel = `${dias}d`;
            diasTitle = `Lleva ${dias} días sin devolver`;
        } else {
            // rojo intenso — más de una semana
            diasClass += ' critico';
            diasLabel = `${dias}d`;
            diasTitle = `⚠️ ¡${dias} días sin devolver!`;
        }

        html += `<div class="alerta-item" onclick="editItem('${d.id}')">
            <div class="${diasClass}" title="${diasTitle}"><div>${diasLabel}</div><div style="font-size:0.55rem;opacity:0.85;">${dias === 0 ? '' : 'días'}</div></div>
            <div class="alerta-info">
                <div class="alerta-nombre">👤 ${d.profesor}</div>
                <div class="alerta-detalle">📅 ${fechaFmt} · ${d.curso} · ${d.asignatura} · <b style="color:#c62828;">${falta} equipo${falta !== 1 ? 's' : ''} sin devolver</b></div>
            </div>
            <button class="btn btn-sm btn-outline-danger border-0 fw-bold" style="font-size:0.7rem;">Editar</button>
        </div>`;
    });

    danados.forEach(d => {
        const fechaFmt = d.fecha.split('-').reverse().slice(0, 2).join('/');
        html += `<div class="alerta-item" onclick="editItem('${d.id}')" style="border-left: 3px solid #dc3545;">
            <div class="alerta-dias" style="background:#dc3545;"><div>⚠️</div></div>
            <div class="alerta-info">
                <div class="alerta-nombre">👤 ${d.profesor}</div>
                <div class="alerta-detalle">📅 ${fechaFmt} · ${d.curso} · ${d.asignatura} · <b style="color:#c62828;">🔴 ${d.observacion || 'Daño reportado'}</b></div>
            </div>
            <button class="btn btn-sm btn-outline-danger border-0 fw-bold">Editar</button>
        </div>`;
    });

    body.innerHTML = html;
}

// ==================== PANEL OBSERVACIONES ====================
function renderObsPanel(registros) {
    const body  = document.getElementById('obsBody');
    const count = document.getElementById('obsCount');
    if (!body) return;

    if (count) count.textContent = registros.length;

    if (registros.length === 0) {
        body.innerHTML = '<div class="obs-empty">Sin observaciones este mes 📝</div>';
        return;
    }

    // Ordenar por fecha descendente
    const sorted = [...registros].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    body.innerHTML = sorted.map(d => {
        const partes = (d.fecha || '').split('-');
        const fechaStr = partes.length === 3 ? `${partes[2]}/${partes[1]}` : d.fecha;
        const obs = (d.observacion || '').trim();
        return `
        <div class="obs-item" onclick="editItem('${d.id}')" title="Click para editar este registro">
            <div class="obs-fecha-badge">${fechaStr}</div>
            <div class="obs-info">
                <div class="obs-profesor">👤 ${d.profesor || '—'}</div>
                <div class="obs-curso">🏫 ${d.curso || '—'} · 📚 ${d.asignatura || '—'}</div>
                <div class="obs-texto">💬 ${obs}</div>
            </div>
        </div>`;
    }).join('');
}

function toggleObsPanel() {
    const wrapper = document.getElementById('obsPanelWrapper');
    if (!wrapper) return;
    const visible = wrapper.style.display !== 'none';
    wrapper.style.display = visible ? 'none' : 'block';
    // Scroll suave al panel si se abre
    if (!visible) setTimeout(() => wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
}

// ==================== RESUMEN ANUAL INTERACTIVO ====================
let chartAnualResumen = null;

function _calcMesData(mes) {
    // mes: 0-indexed
    const año = new Date().getFullYear();
    const rows = db.filter(d => {
        const dt = new Date(d.fecha + "T00:00:00");
        return !isNaN(dt) && dt.getFullYear() === año && dt.getMonth() === mes;
    });
    const total   = rows.length;
    const ok      = rows.filter(d => {
        const t = parseInt(d.chromebooks||0) + parseInt(d.reemplazo||0);
        return t === parseInt(d.devueltos||0) && t > 0;
    }).length;
    const dmg     = rows.filter(d => isDamagedRecord(d)).length;
    const lab     = rows.filter(d => d.uso_laboratorio===true||d.uso_laboratorio==="TRUE"||d.uso_laboratorio==="true").length;
    const reemp   = rows.filter(d => parseInt(d.reemplazo||0) > 0).length;
    const conObs  = rows.filter(d => {
        const o = (d.observacion||'').trim().toLowerCase();
        return o && !['sin novedad','ok',''].includes(o);
    }).length;
    const docentes = new Set(rows.map(d => d.profesor).filter(Boolean)).size;
    const tasa    = total > 0 ? Math.round((ok / total) * 100) : 0;
    return { total, ok, dmg, lab, reemp, conObs, docentes, tasa, rows };
}

function renderResumenAnual() {
    const año = new Date().getFullYear();
    const mesesConDatos = mNames.map((nombre, i) => ({ nombre, i, ..._calcMesData(i) }))
        .filter(m => m.total > 0);

    if (mesesConDatos.length === 0) {
        document.getElementById('tablaAnualBody').innerHTML =
            '<tr><td colspan="10" class="text-muted text-center py-4">Sin datos registrados este año</td></tr>';
        return;
    }

    // ── Tabla comparativa ──────────────────────────────────────────────────────
    let html = '';
    mesesConDatos.forEach((m, idx) => {
        const prev   = idx > 0 ? mesesConDatos[idx - 1] : null;
        const delta  = prev ? m.total - prev.total : null;
        const deltaHtml = delta === null ? '<span class="text-muted">—</span>'
            : delta > 0  ? `<span class="text-success fw-bold">▲ +${delta}</span>`
            : delta < 0  ? `<span class="text-danger fw-bold">▼ ${delta}</span>`
            :               `<span class="text-muted">= 0</span>`;

        const tasaColor = m.tasa >= 95 ? '#198754' : m.tasa >= 80 ? '#f39c12' : '#dc3545';
        const tasaBadge = `<span class="badge fw-bold" style="background:${tasaColor};color:white;font-size:0.75rem;">${m.tasa}%</span>`;

        html += `<tr style="cursor:pointer;" onclick="_irAMes(${m.i})" title="Ver ${m.nombre}">
            <td class="fw-bold text-start ps-3">📅 ${m.nombre}</td>
            <td><span class="fw-bold fs-6" style="color:#0d6832;">${m.total}</span></td>
            <td>${deltaHtml}</td>
            <td>${m.ok}</td>
            <td>${tasaBadge}</td>
            <td>${m.lab > 0 ? `<span class="badge" style="background:#6f42c1;color:white;">${m.lab}</span>` : '<span class="text-muted">0</span>'}</td>
            <td>${m.reemp > 0 ? `<span class="badge bg-warning text-dark">${m.reemp}</span>` : '<span class="text-muted">0</span>'}</td>
            <td>${m.dmg > 0 ? `<span class="badge bg-danger">${m.dmg}</span>` : '<span class="text-success">✓</span>'}</td>
            <td>${m.conObs > 0 ? `<span class="badge" style="background:#d15502;color:white;">${m.conObs}</span>` : '<span class="text-muted">0</span>'}</td>
            <td>${m.docentes}</td>
        </tr>`;
    });

    // Fila de totales
    const tot = mesesConDatos.reduce((a, m) => ({
        total: a.total + m.total, ok: a.ok + m.ok, dmg: a.dmg + m.dmg,
        lab: a.lab + m.lab, reemp: a.reemp + m.reemp, conObs: a.conObs + m.conObs
    }), { total:0, ok:0, dmg:0, lab:0, reemp:0, conObs:0 });
    const tasaGlobal = tot.total > 0 ? Math.round((tot.ok / tot.total) * 100) : 0;
    const docGlobal  = new Set(db.filter(d => {
        const dt = new Date(d.fecha + "T00:00:00");
        return !isNaN(dt) && dt.getFullYear() === año;
    }).map(d => d.profesor).filter(Boolean)).size;

    html += `<tr class="table-dark fw-bold">
        <td class="text-start ps-3">🏆 TOTAL AÑO</td>
        <td style="color:#6adc9e;">${tot.total}</td>
        <td>—</td>
        <td>${tot.ok}</td>
        <td><span class="badge fw-bold" style="background:#198754;color:white;">${tasaGlobal}%</span></td>
        <td>${tot.lab}</td><td>${tot.reemp}</td><td>${tot.dmg}</td>
        <td>${tot.conObs}</td><td>${docGlobal}</td>
    </tr>`;
    document.getElementById('tablaAnualBody').innerHTML = html;

    // ── KPIs totales ───────────────────────────────────────────────────────────
    const kpiData = [
        { label: 'Préstamos totales', value: tot.total,    color: '#0d6832' },
        { label: 'Devueltos OK',       value: tot.ok,       color: '#198754' },
        { label: 'Tasa global',        value: tasaGlobal+'%', color: tasaGlobal>=95?'#198754':'#f39c12' },
        { label: 'Laboratorio',        value: tot.lab,      color: '#6f42c1' },
        { label: 'Reemplazos',         value: tot.reemp,    color: '#dc3545' },
        { label: 'Con daños',          value: tot.dmg,      color: '#c62828' },
        { label: 'Observaciones',      value: tot.conObs,   color: '#d15502' },
        { label: 'Docentes activos',   value: docGlobal,    color: '#003366' },
        { label: 'Meses con datos',    value: mesesConDatos.length, color: '#0288d1' },
    ];
    document.getElementById('kpiAnualRow').innerHTML = kpiData.map(k => `
        <div class="kpi-card">
            <h6>${k.label}</h6>
            <div class="kpi-value" style="color:${k.color};font-size:1.9rem;">${k.value}</div>
        </div>`).join('');

    // ── Gráfico combinado barras + línea ───────────────────────────────────────
    const labels  = mesesConDatos.map(m => m.nombre.slice(0, 3));
    const totales = mesesConDatos.map(m => m.total);
    const tasas   = mesesConDatos.map(m => m.tasa);
    const danados = mesesConDatos.map(m => m.dmg);

    const ctx = document.getElementById('chartAnualResumen');
    if (ctx) {
        if (chartAnualResumen) chartAnualResumen.destroy();
        chartAnualResumen = new Chart(ctx, {
            data: {
                labels,
                datasets: [
                    {
                        type: 'bar',
                        label: 'Préstamos',
                        data: totales,
                        backgroundColor: 'rgba(13,104,50,0.75)',
                        borderRadius: 6,
                        yAxisID: 'y'
                    },
                    {
                        type: 'bar',
                        label: 'Dañados',
                        data: danados,
                        backgroundColor: 'rgba(198,40,40,0.7)',
                        borderRadius: 6,
                        yAxisID: 'y'
                    },
                    {
                        type: 'line',
                        label: 'Tasa Retorno %',
                        data: tasas,
                        borderColor: '#1976d2',
                        backgroundColor: 'rgba(25,118,210,0.1)',
                        borderWidth: 2.5,
                        pointRadius: 5,
                        pointBackgroundColor: '#1976d2',
                        tension: 0.3,
                        fill: true,
                        yAxisID: 'y2'
                    }
                ]
            },
            options: {
                maintainAspectRatio: false,
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: ctx => ctx.dataset.label === 'Tasa Retorno %'
                                ? ` ${ctx.parsed.y}%`
                                : ` ${ctx.parsed.y} registros`
                        }
                    }
                },
                scales: {
                    y:  { beginAtZero: true, position: 'left',  title: { display: true, text: 'Préstamos' }, ticks: { stepSize: 10 } },
                    y2: { beginAtZero: true, position: 'right', max: 100, title: { display: true, text: 'Tasa %' },
                          grid: { drawOnChartArea: false }, ticks: { callback: v => v + '%' } }
                }
            }
        });
    }
}

function _irAMes(mesIdx) {
    viewDate = new Date(new Date().getFullYear(), mesIdx, 1);
    currentWeek = 0;
    filterMode  = 'all';
    showPage('registros');
    renderAll();
    renderAnualChart();
    // Scroll suave al inicio
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
}

// ==================== CHIP DE SINCRONIZACIÓN ====================
function updateSyncChip(estado, mins) {
    const chip  = document.getElementById('syncChip');
    const dot   = chip?.querySelector('.sync-dot');
    const label = chip?.querySelector('.sync-label');
    if (!chip) return;

    chip.className = 'sync-chip';
    if (estado === 'fresh') {
        chip.classList.add('sync-fresh');
        label.textContent = mins <= 1 ? '🟢 Sincronizado' : `🟢 hace ${mins} min`;
    } else if (estado === 'cache') {
        chip.classList.add('sync-cache');
        label.textContent = `🟡 Caché · hace ${mins} min`;
    } else if (estado === 'offline') {
        chip.classList.add('sync-offline');
        label.textContent = '🔴 Sin conexión';
    } else {
        chip.classList.add('sync-loading');
        label.textContent = 'Cargando...';
    }
}

// ==================== MODO OSCURO ====================
function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    const btn = document.getElementById('darkToggle');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
    sessionStorage.setItem('nsg_dark', isDark ? '1' : '0');
}

function _restoreDarkMode() {
    if (sessionStorage.getItem('nsg_dark') === '1') {
        document.body.classList.add('dark-mode');
        const btn = document.getElementById('darkToggle');
        if (btn) btn.textContent = '☀️';
    }
}

// ==================== ATAJOS DE TECLADO ====================
document.addEventListener('keydown', function(e) {
    const modalEl = document.getElementById('resModal');
    const modalAbierto = modalEl && modalEl.classList.contains('show');

    if (modalAbierto) {
        // Enter en paso 1 o 2 → avanzar wizard
        if (e.key === 'Enter') {
            const tag = document.activeElement?.tagName;
            // No interceptar si el foco está en textarea o botones
            if (tag !== 'TEXTAREA' && tag !== 'BUTTON' && tag !== 'SELECT') {
                if (_wizardStep < WIZARD_TOTAL) {
                    e.preventDefault();
                    wizardNext();
                }
            }
        }
        return; // Escape lo maneja Bootstrap + el guard de cierre
    }

    // Fuera del modal
    if (e.key === 'Escape') {
        // Cerrar banner offline si está abierto
        _hideOfflineBanner();
    }
});

window.onload = () => {
    _restoreDarkMode();
    load();
    // Actualizar el chip de sincronización cada 60 segundos
    setInterval(() => {
        const chip = document.getElementById('syncChip');
        if (!chip || chip.classList.contains('sync-offline') || chip.classList.contains('sync-loading')) return;
        const ts = parseInt(sessionStorage.getItem(CACHE_TS) || '0');
        if (!ts) return;
        const mins = Math.round((Date.now() - ts) / 60000);
        const esFresco = (Date.now() - ts) < CACHE_TTL;
        updateSyncChip(esFresco ? 'fresh' : 'cache', mins);
    }, 60000);
};
