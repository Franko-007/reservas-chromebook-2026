// ==================== CONFIGURACIÓN DE SUPABASE ====================
const SUPABASE_URL = "https://nhvrzmezonadnxqalgui.supabase.co";
const SUPABASE_KEY = "sb_publishable_1aGEWqQBhlzTz-R8xJksZQ_tl_YS..."; // Reemplaza con tu clave de Supabase si es necesario

const HEADERS = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=representation"
};

let STOCK_MAXIMO   = 110; // sobreescrito por config si está disponible
let STOCK_REEMPLAZO = 4;
let DOCENTES_NSG = ["ALEXIS CORTÉS", "ALLYSON RIOS", "ANA OGAZ", "ANDREA SALAZAR", "ANDREA DONOSO", "AVIGUEY GONZALEZ", "CAMILA CONTRERAS", "CAMILA GONZÁLEZ", "CARLA MERA", "CARLOS ARAYA", "CARMEN ÁLVAREZ", "CAROLINA MIRANDA", "CAROLINA REYES", "CECILIA GARCÍA", "CLAUDIA TOLEDO", "CONSTANZA LÓPEZ", "DANIELA AMPUERO", "DANIELA CARRASCO", "DANIEL CIFUENTES", "DANIEL VITTA", "DANIELA VERA", "DANIELA VALENZUELA", "DEBORA GAETE", "DEBORA GONZÁLEZ", "ELIZABETH MIRANDA", "ERIKA KINDERMANN", "FERNANDA RÍOS", "FRANCISCA MAUREIRA", "FRANCISCA COFRÉ", "FRANCISCA VIZCAYA", "GIOVANNA ARIAS", "GOLDIE FARÍAS", "HERNÁN REYES", "JAVIERA ALIAGA", "JOAQUÍN ALMUNA", "KARIMME GUTIÉRREZ", "KARINA BARRIOS", "KAROLINA RIFFO", "LEONARDO RÍOS", "LORENA ARANCIBIA", "LUIS SÁNCHEZ", "MACARENA BELTRÁN", "MARÍA MONZÓN", "MARÍA GONZÁLEZ", "MARISOL GUAJARDO", "MATÍAS CUEVAS", "MATÍAS PEÑALOZA", "NATALIA CARTES", "NATALY HIDALGO", "NICOLE BELLO", "PAOLA ÁVILA", "PATRICIA NÚÑEZ", "PAULINA ARGOMEDO", "PRISCILA VALENZUELA", "REINA ORTEGA", "STEPHANY GUZMÁN", "VÍCTOR BARRIENTOS", "YADIA CERDA", "YARITZA LEÓN", "YESSENIA SÁNCHEZ"];

function _applyConfig(config) {
    if (!config) return;
    if (config.stock_maximo    && !isNaN(config.stock_maximo))    STOCK_MAXIMO    = parseInt(config.stock_maximo);
    if (config.stock_reemplazo && !isNaN(config.stock_reemplazo)) STOCK_REEMPLAZO = parseInt(config.stock_reemplazo);
    if (Array.isArray(config.docentes) && config.docentes.length > 0) {
        DOCENTES_NSG = config.docentes.map(d => String(d).toUpperCase().trim()).filter(Boolean);
    }
    console.log(`⚙️ Config cargada: stock=${STOCK_MAXIMO}, reemplazo=${STOCK_REEMPLAZO}, docentes=${DOCENTES_NSG.length}`);
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
const SCHOOL_WEEKS = {
    "2026-4": {
        1: { start: 4,  end: 8,  label: "Semana 1" },
        2: { start: 11, end: 15, label: "Semana 2" },
        3: { start: 18, end: 20, label: "Semana 3" },
        4: { start: 25, end: 29, label: "Semana 4" }
    },
    "2026-5": {
        1: { start: 1,  end: 5,  label: "Semana 1" },
        2: { start: 8,  end: 12, label: "Semana 2" },
        3: { start: 15, end: 19, label: "Semana 3" }
    },
    "2026-6": {
        1: { start: 6,  end: 10, label: "Semana 1" },
        2: { start: 13, end: 17, label: "Semana 2" },
        3: { start: 20, end: 24, label: "Semana 3" },
        4: { start: 27, end: 31, label: "Semana 4" }
    },
    "2026-7": {
        1: { start: 3,  end: 7,  label: "Semana 1" },
        2: { start: 10, end: 14, label: "Semana 2" },
        3: { start: 17, end: 21, label: "Semana 3" },
        4: { start: 24, end: 28, label: "Semana 4" },
        5: { start: 31, end: 31, label: "Semana 5" }
    },
    "2026-8": {
        1: { start: 1,  end: 4,  label: "Semana 1" },
        2: { start: 7,  end: 11, label: "Semana 2" },
        3: { start: 21, end: 25, label: "Semana 3" },
        4: { start: 28, end: 30, label: "Semana 4" }
    },
    "2026-9": {
        1: { start: 1,  end: 2,  label: "Semana 1" },
        2: { start: 5,  end: 9,  label: "Semana 2" },
        3: { start: 13, end: 16, label: "Semana 3" },
        4: { start: 19, end: 23, label: "Semana 4" },
        5: { start: 26, end: 30, label: "Semana 5" }
    },
    "2026-10": {
        1: { start: 3,  end: 6,  label: "Semana 1" },
        2: { start: 9,  end: 13, label: "Semana 2" },
        3: { start: 16, end: 20, label: "Semana 3" },
        4: { start: 23, end: 27, label: "Semana 4" },
        5: { start: 30, end: 30, label: "Semana 5" }
    },
    "2026-11": {
        1: { start: 1,  end: 4,  label: "Semana 1" },
        2: { start: 7,  end: 11, label: "Semana 2" },
        3: { start: 14, end: 18, label: "Semana 3" },
        4: { start: 21, end: 23, label: "Semana 4" }
    },
    "2026-2": {
        1: { start: 2,  end: 6,  label: "Semana 1" },
        2: { start: 9,  end: 13, label: "Semana 2" },
        3: { start: 16, end: 20, label: "Semana 3" },
        4: { start: 23, end: 27, label: "Semana 4" }
    },
    "2026-3": {
        1: { start: 1,  end: 3,  label: "Semana 1" },
        2: { start: 6,  end: 9,  label: "Semana 2" },
        3: { start: 13, end: 17, label: "Semana 3" },
        4: { start: 20, end: 24, label: "Semana 4" },
        5: { start: 27, end: 30, label: "Semana 5" }
    }
};

function getWeekRanges(year, month) {
    const key = `${year}-${month}`;
    if (SCHOOL_WEEKS[key]) return SCHOOL_WEEKS[key];

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1);
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

function getCurrentSchoolWeek(year, month, day) {
    const ranges = getWeekRanges(year, month);
    const weeks = Object.keys(ranges).map(Number).sort((a, b) => a - b);
    for (const w of weeks) {
        if (day >= ranges[w].start && day <= ranges[w].end) return w;
    }
    let closest = weeks[weeks.length - 1];
    let minDist = Infinity;
    for (const w of weeks) {
        const mid = (ranges[w].start + ranges[w].end) / 2;
        const dist = Math.abs(day - mid);
        if (dist < minDist) { minDist = dist; closest = w; }
    }
    return closest;
}

function formatHoraInput(input) {
    let raw = input.value;
    if (raw.includes(':')) {
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

    let digits = raw.replace(/\D/g, '').slice(0, 4);
    if (digits.length === 0) {
        input.value = '';
        input.setCustomValidity('');
        input.classList.remove('is-invalid');
        return;
    }

    if (digits.length === 4) {
        const h = parseInt(digits.slice(0, 2));
        const m = parseInt(digits.slice(2));
        input.value = digits.slice(0, 2) + ':' + digits.slice(2);
        const valid = h <= 23 && m <= 59;
        input.setCustomValidity(valid ? '' : 'Hora inválida');
        input.classList.toggle('is-invalid', !valid);
    } else if (digits.length === 3) {
        const firstDigit = parseInt(digits[0]);
        if (firstDigit >= 3) {
            const h = parseInt(digits[0]);
            const m = parseInt(digits.slice(1));
            input.value = digits[0] + ':' + digits.slice(1);
            const valid = h <= 9 && m <= 59;
            input.setCustomValidity(valid ? '' : 'Hora inválida');
            input.classList.toggle('is-invalid', !valid);
        } else {
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

function padHoraInput(input) {
    let val = input.value.trim();
    if (!val) return;

    if (!val.includes(':')) {
        const digits = val.replace(/\D/g, '');
        if (digits.length === 3) {
            val = digits[0] + ':' + digits.slice(1);
        } else if (digits.length === 4) {
            val = digits.slice(0, 2) + ':' + digits.slice(2);
        } else if (digits.length === 1 || digits.length === 2) {
            val = digits.padStart(2, '0') + ':00';
        }
    }

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

// ==================== CACHÉ DE SESIÓN ====================
const CACHE_KEY   = 'cb_nsg_cache';
const CACHE_TS    = 'cb_nsg_cache_ts';
const CACHE_TTL   = 5 * 60 * 1000; 

function _saveSessionCache(data) {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
        sessionStorage.setItem(CACHE_TS, Date.now().toString());
    } catch(e) {}
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

// ==================== OPERACIONES CON SUPABASE ====================

async function load() {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'flex';
    fillDocentes();

    const cached = _loadSessionCache();
    if (cached && cached.fresh) {
        _applyData(cached.data, false);
        if (loadingEl) loadingEl.style.display = 'none';
        const mins = Math.round(cached.age / 60000);
        updateSyncChip('cache', mins || 1);
        
        fetch(`${SUPABASE_URL}/rest/v1/reservas?select=*&order=id.desc`, { headers: HEADERS })
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) {
                    _saveSessionCache(data);
                    _applyData(data, true);
                    _hideOfflineBanner();
                    updateSyncChip('fresh', 0);
                }
            }).catch(() => {});
        return;
    }

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/reservas?select=*&order=id.desc`, {
            method: "GET",
            headers: HEADERS
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();

        if (Array.isArray(data)) {
            _saveSessionCache(data);
            _hideOfflineBanner();
            updateSyncChip('fresh', 0);
            console.log('✅ Datos cargados desde Supabase:', data.length, 'registros');
            
            Swal.fire({
                icon: 'success',
                title: 'Datos sincronizados',
                text: `Se cargaron ${data.length} registros correctamente`,
                timer: 2000,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
            });

            _applyData(data, false);
        } else {
            throw new Error('Error al cargar datos desde Supabase');
        }

    } catch (error) {
        console.error('❌ Error detallado:', error);

        const stale = _loadSessionCache();
        if (stale) {
            _applyData(stale.data, true);
            const mins = Math.round(stale.age / 60000);
            _showOfflineBanner(`Sin conexión — mostrando datos de hace ${mins} min.`);
            updateSyncChip('offline', mins);
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error de Conexión',
                text: 'No se pudieron cargar los datos de Supabase. Revisa tu conexión o las claves API.',
                footer: '<a href="#" onclick="location.reload()">Intentar de nuevo</a>'
            });
        }
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

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

    const idVal = document.getElementById('fId').value;
    const esEdicion = !!idVal;

    const payload = {
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
        responsable_cierre: 'Franco San Martín'
    };

    try {
        const url = esEdicion 
            ? `${SUPABASE_URL}/rest/v1/reservas?id=eq.${idVal}` 
            : `${SUPABASE_URL}/rest/v1/reservas`;
            
        const method = esEdicion ? 'PATCH' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: HEADERS,
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Error ${response.status}: ${errText}`);
        }
        
        const result = await response.json();
        
        sessionStorage.removeItem('franco_draft');
        sessionStorage.removeItem(CACHE_KEY);
        sessionStorage.removeItem(CACHE_TS);
        _modalGuardBypass = true;
        bootstrap.Modal.getInstance(document.getElementById('resModal')).hide();

        Swal.fire({
            icon: 'success',
            title: `Registro ${esEdicion ? 'actualizado' : 'creado'} correctamente`,
            text: 'Los datos se han guardado en Supabase',
            timer: 2000,
            showConfirmButton: false,
            toast: true,
            position: 'top-end'
        });

        const _idGuardado = idVal || (Array.isArray(result) && result[0]?.id);
        setTimeout(() => {
            load().then(() => {
                setTimeout(() => {
                    if (_idGuardado) {
                        const tr = document.querySelector(`tr[data-id="${_idGuardado}"]`);
                        if (tr) {
                            tr.style.transition = 'background 0.3s';
                            tr.style.background = '#d4edda';
                            setTimeout(() => { tr.style.background = ''; }, 1400);
                        }
                    }
                }, 300);
            });
        }, 300);

    } catch (e) {
        console.error('Error al guardar:', e);
        Swal.fire({
            icon: 'error',
            title: 'Error al guardar',
            text: 'No se pudo guardar el registro en Supabase: ' + e.message,
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
            const response = await fetch(`${SUPABASE_URL}/rest/v1/reservas?id=eq.${id}`, {
                method: 'DELETE',
                headers: HEADERS
            });
            
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Error ${response.status}: ${errText}`);
            }
            
            sessionStorage.removeItem(CACHE_KEY);
            sessionStorage.removeItem(CACHE_TS);
            Swal.fire('Eliminado', 'El registro ha sido eliminado de Supabase.', 'success');
            setTimeout(() => load(), 500);
        } catch (e) {
            console.error('Error al eliminar:', e);
            Swal.fire('Error', 'No se pudo eliminar el registro.', 'error');
        } finally {
            if (loadingEl) loadingEl.style.display = 'none';
        }
    }
}

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

    if (isDismissed && Swal.getDenyButton?.()?.matches(':focus')) {
        editItem(id); return;
    }
    if (!formValues) return;
    if (formValues === undefined) { editItem(id); return; }

    const devVal  = formValues.dev;
    const estadoV = formValues.estado;
    const obsVal  = formValues.obs || (estadoV === 'ok' ? 'Sin novedad' : estadoV === 'pendiente' ? 'Pendiente' : obs);

    let estadoOp = 'ACTIVO';
    if (estadoV === 'danio')    estadoOp = 'DAÑADO';
    else if (estadoV === 'ok' && devVal === total && total > 0) estadoOp = 'CERRADO';

    const payload = {
        devueltos:   devVal,
        observacion: obsVal,
        estado_operativo: estadoOp,
        fecha_cierre: estadoOp === 'CERRADO' ? new Date().toISOString().slice(0,10) : (r.fecha_cierre || ''),
        responsable_cierre: 'Franco San Martín'
    };

    if (trEl) trEl.style.background = '#fff9c4';

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/reservas?id=eq.${r.id}`, {
            method: 'PATCH',
            headers: HEADERS,
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            sessionStorage.removeItem(CACHE_KEY);
            sessionStorage.removeItem(CACHE_TS);
            if (trEl) {
                trEl.style.transition = 'background 0.4s';
                trEl.style.background = '#d4edda';
                setTimeout(() => { trEl.style.background = ''; }, 1200);
            }
            Swal.fire({ icon:'success', title:'Guardado', timer:1500,
                showConfirmButton:false, toast:true, position:'top-end' });
            setTimeout(() => load(), 600);
        } else {
            const errText = await response.text();
            throw new Error(`Error ${response.status}: ${errText}`);
        }
    } catch(e) {
        if (trEl) trEl.style.background = '#ffd5d5';
        Swal.fire('Error', 'No se pudo guardar: ' + e.message, 'error');
    }
}

// ==================== RENDERIZADO Y UI ====================

function getEstado(d) {
    const totalOut = parseInt(d.chromebooks || 0) + parseInt(d.reemplazo || 0);
    if (isDamagedRecord(d)) return 'dañado';
    const isLab = d.uso_laboratorio === true || d.uso_laboratorio === "TRUE" || d.uso_laboratorio === "true";
    if (isLab) return 'lab';
    if (totalOut === parseInt(d.devueltos || 0) && parseInt(d.devueltos || 0) > 0) return 'ok';
    return 'pendiente';
}

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

function renderAll() {
    const displayDateEl = document.getElementById('displayDate');
    if (displayDateEl) displayDateEl.innerText = `${mNames[viewDate.getMonth()]} ${viewDate.getFullYear()}`;

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
            const fechaDiff = new Date(b.fecha) - new Date(a.fecha);
            if (fechaDiff !== 0) return fechaDiff;
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

    const conObs = mesCompleto.filter(d => (d.observacion || '').trim() !== '' &&
        !['sin novedad', 'ok', ''].includes((d.observacion || '').toLowerCase().trim()));
    animateKPI('kpi-obs', conObs.length);
    const kpiObsBar = document.getElementById('kpi-obs-bar');
    if (kpiObsBar) kpiObsBar.style.width = (mesCompleto.length > 0 ? Math.round((conObs.length / mesCompleto.length) * 100) : 0) + '%';
    const obsCard = document.getElementById('kpi-obs-card');
    if (obsCard) obsCard.style.borderColor = conObs.length > 0 ? '#0288d1' : 'transparent';
    renderObsPanel(conObs);

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
        const schoolLabel = range.label || `Semana ${currentWeek}`;
        labelSemTxt = `${schoolLabel} · días ${range.start}–${range.end}`;
    }

    animateKPI('kpi-semana', prestSemana);
    const labelSemana = document.getElementById('kpiSemanaLabel');
    if (labelSemana) labelSemana.textContent = labelSemTxt;

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

        const ROW_H = 28;
        const minH  = 200;
        const calcH = Math.max(minH, sortedLabels.length * ROW_H);
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

    const diasNombres = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    const diasCount   = [0, 0, 0, 0, 0];
    base.forEach(d => {
        const dt = new Date(d.fecha + "T00:00:00");
        if (!isNaN(dt)) {
            const dow = dt.getDay();
            if (dow >= 1 && dow <= 5) diasCount[dow - 1]++;
        }
    });

    const ctxDia = document.getElementById('chartDiaSemana');
    if (ctxDia) {
        if (charts.DS) charts.DS.destroy();
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

let _modalGuardBypass = false;

function _setupModalCloseGuard() {
    const modalEl = document.getElementById('resModal');
    if (!modalEl) return;
    if (modalEl._closeGuardRegistered) return;
    modalEl._closeGuardRegistered = true;

    modalEl.addEventListener('hide.bs.modal', function(e) {
        if (_modalGuardBypass) {
            _modalGuardBypass = false;
            return;
        }
        const fId = document.getElementById('fId');
        const esNuevo = !fId || fId.value === '';
        if (esNuevo && _hasDraftData()) {
            e.preventDefault();
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
                    _modalGuardBypass = true;
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
