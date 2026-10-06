// ==================== CONFIGURACIÓN DE SUPABASE ====================
const SUPABASE_URL = "https://nhvrzmezonadnxqalgui.supabase.co";
const SUPABASE_KEY = "sb_publishable_1aGEWqQBhlzTz-R8xJksZQ_tL_YS0Od"; // Reemplaza con tu clave anon / public

const HEADERS = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=representation"
};

let STOCK_MAXIMO   = 110; 
let STOCK_REEMPLAZO = 4;
let DOCENTES_NSG = ["ALEXIS CORTÉS", "ALLYSON RIOS", "ANA OGAZ", "ANDREA SALAZAR", "ANDREA DONOSO", "AVIGUEY GONZALEZ", "CAMILA CONTRERAS", "CAMILA GONZÁLEZ", "CARLA MERA", "CARLOS ARAYA", "CARMEN ÁLVAREZ", "CAROLINA MIRANDA", "CAROLINA REYES", "CECILIA GARCÍA", "CLAUDIA TOLEDO", "CONSTANZA LÓPEZ", "DANIELA AMPUERO", "DANIELA CARRASCO", "DANIEL CIFUENTES", "DANIEL VITTA", "DANIELA VERA", "DANIELA VALENZUELA", "DEBORA GAETE", "DEBORA GONZÁLEZ", "ELIZABETH MIRANDA", "ERIKA KINDERMANN", "FERNANDA RÍOS", "FRANCISCA MAUREIRA", "FRANCISCA COFRÉ", "FRANCISCA VIZCAYA", "GIOVANNA ARIAS", "GOLDIE FARÍAS", "HERNÁN REYES", "JAVIERA ALIAGA", "JOAQUÍN ALMUNA", "KARIMME GUTIÉRREZ", "KARINA BARRIOS", "KAROLINA RIFFO", "LEONARDO RÍOS", "LORENA ARANCIBIA", "LUIS SÁNCHEZ", "MACARENA BELTRÁN", "MARÍA MONZÓN", "MARÍA GONZÁLEZ", "MARISOL GUAJARDO", "MATÍAS CUEVAS", "MATÍAS PEÑALOZA", "NATALIA CARTES", "NATALY HIDALGO", "NICOLE BELLO", "PAOLA ÁVILA", "PATRICIA NÚÑEZ", "PAULINA ARGOMEDO", "PRISCILA VALENZUELA", "REINA ORTEGA", "STEPHANY GUZMÁN", "VÍCTOR BARRIENTOS", "YADIA CERDA", "YARITZA LEÓN", "YESSENIA SÁNCHEZ"];

function _applyConfig(config) {
    if (!config) return;
    if (config.stock_maximo    && !isNaN(config.stock_maximo))    STOCK_MAXIMO    = parseInt(config.stock_maximo);
    if (config.stock_reemplazo && !isNaN(config.stock_reemplazo)) STOCK_REEMPLAZO = parseInt(config.stock_reemplazo);
    if (Array.isArray(config.docentes) && config.docentes.length > 0) {
        DOCENTES_NSG = config.docentes.map(d => String(d).toUpperCase().trim()).filter(Boolean);
    }
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

let _savingNow = false;

// ==================== HELPERS DE DATOS ====================
function _n(v) {
    const x = parseInt(v, 10);
    return isNaN(x) ? 0 : x;
}

// Escapa texto antes de insertarlo con innerHTML (evita XSS con datos de la BD)
function _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function _isLab(d) {
    return d.uso_laboratorio === true || String(d.uso_laboratorio).toLowerCase() === 'true';
}

function _isOk(d) {
    const total = _n(d.chromebooks) + _n(d.reemplazo);
    return total > 0 && total === _n(d.devueltos);
}

// Pendiente de devolución y sin daño
function _isDebt(d) {
    return (_n(d.chromebooks) + _n(d.reemplazo)) > _n(d.devueltos) && !isDamagedRecord(d);
}

function _hasObs(d) {
    const o = (d.observacion || '').trim().toLowerCase();
    return o !== '' && !['sin novedad', 'ok'].includes(o);
}

// Fecha local (Chile) en formato YYYY-MM-DD. toISOString() usa UTC y después de las 21:00 daría el día siguiente.
function _hoyISO() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function _normProf(d) {
    return ((d && d.profesor) || '').trim().toUpperCase() || '—';
}

function _recordsOf(year, month) {
    return db.filter(d => {
        const dt = new Date(d.fecha + "T00:00:00");
        return !isNaN(dt) && dt.getFullYear() === year && dt.getMonth() === month;
    });
}

function _statsOf(rows) {
    const porDoc = {};
    rows.forEach(d => {
        const k = _normProf(d);
        const s = porDoc[k] || (porDoc[k] = { total: 0, ok: 0, reemp: 0, lab: 0, dmg: 0 });
        s.total++;
        if (_isOk(d)) s.ok++;
        if (_n(d.reemplazo) > 0) s.reemp++;
        if (_isLab(d)) s.lab++;
        if (isDamagedRecord(d)) s.dmg++;
    });
    const total = rows.length;
    const ok = rows.filter(_isOk).length;
    const obs = rows.filter(_hasObs);
    const dmgRows = rows.filter(isDamagedRecord);
    return {
        rows, total, ok, obs, dmgRows, porDoc,
        dmg: dmgRows.length,
        pend: rows.filter(_isDebt).length,
        lab: rows.filter(_isLab).length,
        reemp: rows.filter(d => _n(d.reemplazo) > 0).length,
        tasa: total > 0 ? Math.round((ok / total) * 100) : 0,
        docentes: Object.keys(porDoc).length,
        docDmg: new Set(dmgRows.map(_normProf)).size,
        docObs: new Set(obs.map(_normProf)).size
    };
}

const _DAMAGE_RE = new RegExp('(^|[^a-záéíóúüñ])(' + [
    "dañ", "daño", "pantalla", "teclado", "no enciende", "rota", "rayada", "falla", "malo", "averiado",
    "roto", "golpe", "quemado", "rayado", "sin rótulo", "sin rotulo", "sucio", "sin tecla"
].join('|') + ')');

function isDamagedRecord(record) {
    const obs = (record.observacion || "").toLowerCase();
    return _DAMAGE_RE.test(obs) || record.estado_dev === "danio";
}

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
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
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

    if (_savingNow) return;
    _savingNow = true;

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
        if (!isDamagedRecord({ observacion: obsValue })) obsValue = `Dañado: ${obsValue}`;
    }

    const chr = parseInt(document.getElementById('fChr').value) || 0;
    const ree = parseInt(document.getElementById('fRee').value) || 0;
    const dev = parseInt(document.getElementById('fDev').value) || 0;
    
    let estado = 'ACTIVO';
    if (esLab) estado = 'LABORATORIO';
    else if (isDamagedRecord({ observacion: obsValue })) estado = 'DAÑADO';
    else if ((chr + ree) === dev && dev > 0) estado = 'CERRADO';
    
    const fechaCierre = estado === 'CERRADO' ? _hoyISO() : '';
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
        bootstrap.Modal.getOrCreateInstance(document.getElementById('resModal')).hide();

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
        _savingNow = false;
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

    const { value: formValues, isDenied } = await Swal.fire({
        title: `✏️ Edición rápida`,
        html: `
            <div style="text-align:left;font-size:0.88rem;">
                <div style="background:#f8f9fa;border-radius:8px;padding:10px 14px;margin-bottom:14px;line-height:1.7;">
                    <b>👤</b> ${_esc(r.profesor)} &nbsp;·&nbsp;
                    <b>📅</b> ${r.fecha.split('-').reverse().slice(0,2).join('/')} &nbsp;·&nbsp;
                    <b>🏫</b> ${_esc(r.curso)}<br>
                    <b>📚</b> ${_esc(r.asignatura)} &nbsp;·&nbsp;
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
                <input id="il_obs" type="text" class="swal2-input" value="${_esc(obs)}" placeholder="Observación..." style="margin:0;width:100%;">
            </div>`,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '💾 Guardar',
        denyButtonText: '📝 Edición completa',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#0d6832',
        denyButtonColor: '#003366',
        focusConfirm: false,
        preConfirm: () => {
            const devIn = parseInt(document.getElementById('il_dev').value) || 0;
            if (devIn < 0 || devIn > total) {
                Swal.showValidationMessage(`Devueltos debe estar entre 0 y ${total}`);
                return false;
            }
            return {
                dev:    devIn,
                estado: document.getElementById('il_estado').value,
                obs:    document.getElementById('il_obs').value.trim()
            };
        }
    });

    if (isDenied) { editItem(id); return; }
    if (!formValues) return;

    const devVal  = formValues.dev;
    const estadoV = formValues.estado;
    let obsVal = formValues.obs;
    // Si se elige "Sin novedad" pero el texto sigue describiendo un daño, se limpia
    if (estadoV === 'ok' && isDamagedRecord({ observacion: obsVal })) obsVal = 'Sin novedad';
    if (!obsVal) obsVal = estadoV === 'ok' ? 'Sin novedad' : estadoV === 'pendiente' ? 'Pendiente' : 'Dañado';
    // El estado "Con daño" debe quedar reconocible como daño en la observación
    if (estadoV === 'danio' && !isDamagedRecord({ observacion: obsVal })) obsVal = `Dañado: ${obsVal}`;

    let estadoOp = _isLab(r) ? 'LABORATORIO' : 'ACTIVO';
    if (estadoV === 'danio') estadoOp = 'DAÑADO';
    else if (estadoV === 'ok' && devVal === total && total > 0 && !_isLab(r)) estadoOp = 'CERRADO';

    const payload = {
        devueltos:   devVal,
        observacion: obsVal,
        estado_operativo: estadoOp,
        fecha_cierre: estadoOp === 'CERRADO' ? _hoyISO() : (r.fecha_cierre || ''),
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
            const horaA = (a.hora || '00:00').trim().padStart(5, '0');
            const horaB = (b.hora || '00:00').trim().padStart(5, '0');
            return horaA.localeCompare(horaB);
        });
        window._lastSortedData = sorted;

        const contadorEl = document.getElementById('recordCount');
        if (contadorEl) contadorEl.textContent = `${sorted.length} registro${sorted.length !== 1 ? 's' : ''}`;

        const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        let lastDay = null;
        const rows = [];

        sorted.forEach(r => {
            const totalOut = _n(r.chromebooks) + _n(r.reemplazo);
            const isOK = totalOut === _n(r.devueltos);
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
                estadoTexto = r.observacion && r.observacion !== "Pendiente" ? _esc(r.observacion.substring(0, 20)) : "CON DAÑO";
                estadoColor = 'var(--danger-red)';
                estadoTextColor = 'white';
            }

            const badgeLab = isLab ? `<span class="badge badge-status me-1" style="background:linear-gradient(135deg,#6f42c1,#9b59b6);color:white;">🟣 LABORATORIO</span>` : '';
            const badgeEstado = `<span class="badge badge-status" style="background:${estadoColor};color:${estadoTextColor}">${estadoTexto}</span>`;

            rows.push(`<tr class="${rowClass}" data-id="${r.id}" ondblclick="inlineEdit('${r.id}', this)" title="Doble clic para editar rápido">
                <td><span class="text-muted" style="font-size:0.78rem;">${r.fecha.split('-').reverse().slice(0, 2).join('/')}</span></td>
                <td><span class="badge bg-light text-dark border" style="font-size:0.78rem;">🕐 ${_esc(r.hora)}</span></td>
                <td>${_esc(r.curso)}</td>
                <td>${_esc(r.asignatura)}${isLab ? ' <span style="color:#6f42c1;font-size:0.7rem;font-weight:700;">[LAB]</span>' : ''}</td>
                <td class="text-start fw-bold" style="color:#333;">${_esc(r.profesor)}</td>
                <td>${_n(r.chromebooks)}</td>
                <td class="text-danger fw-bold">${_n(r.reemplazo)}</td>
                <td class="text-success fw-bold">${_n(r.devueltos)}</td>
                <td>${badgeLab} ${(parseInt(r.reemplazo || 0) > 0 && r.nro_equipo_reemplazo) ? `<span class="badge badge-status me-1" style="background:#b71c1c;color:white;">📦 ${_esc(r.nro_equipo_reemplazo)}</span>` : ''} ${badgeEstado}</td>
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

    const danados  = base.filter(d => isDamagedRecord(d)).length;
    const cerrados = base.filter(d => _isOk(d) && !isDamagedRecord(d)).length;
    const activos  = base.filter(d => _isDebt(d)).length;

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
        if (!isNaN(dt) && dt.getFullYear() === viewDate.getFullYear()) {
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
    currentWeek = 0;
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
    const hoyStr = _hoyISO();
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
    bootstrap.Modal.getOrCreateInstance(document.getElementById('resModal')).show();
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
    bootstrap.Modal.getOrCreateInstance(document.getElementById('resModal')).show();
}

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
        tipoDanio: document.getElementById('fTipoDanio')?.value || '',
        chr: document.getElementById('fChr')?.value || '',
        ree: document.getElementById('fRee')?.value || '',
        dev: document.getElementById('fDev')?.value || ''
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
    [['fChr', d.chr], ['fRee', d.ree], ['fDev', d.dev]].forEach(([id, v]) => {
        const el = document.getElementById(id);
        if (el && v !== undefined && v !== '') el.value = v;
    });
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

// ==================== INFORME PDF ====================
const PDF_C = {
    navy: [0, 51, 102], navy2: [0, 70, 130], navy3: [0, 80, 150],
    green: [13, 104, 50], green2: [25, 135, 84],
    amber: [243, 156, 18], red: [220, 53, 69], redDark: [211, 47, 47], purple: [111, 66, 193],
    soft: [245, 248, 255], line: [222, 228, 240],
    text: [51, 51, 51], muted: [120, 128, 140], bar: [120, 160, 205]
};
const PDF_LOGO_URL = "https://i.postimg.cc/sxxwfhwK/LOGO-LBSNG-06-237x300.png";
let _pdfLogoCache = null;

async function _pdfLoadLogo() {
    if (_pdfLogoCache) return _pdfLogoCache;
    try {
        const resp = await fetch(PDF_LOGO_URL);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const blob = await resp.blob();
        _pdfLogoCache = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onloadend = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsDataURL(blob);
        });
    } catch (e) { console.warn("Logo no disponible:", e); }
    return _pdfLogoCache;
}

function _fmtFechaCL(date) {
    const p = n => String(n).padStart(2, '0');
    return `${p(date.getDate())}-${p(date.getMonth() + 1)}-${date.getFullYear()}`;
}

// jsPDF (fuente helvetica) no soporta flechas Unicode: se usa +/- en texto
function _sgn(n) { return n > 0 ? `+${n}` : (n < 0 ? `${n}` : '='); }

function _aggRows(rows) {
    const prest = rows.length;
    const ok = rows.filter(_isOk).length;
    return {
        prest, ok,
        chr: rows.reduce((s, d) => s + _n(d.chromebooks), 0),
        ree: rows.reduce((s, d) => s + _n(d.reemplazo), 0),
        tasa: prest > 0 ? Math.round((ok / prest) * 100) : null
    };
}

function _weeklyData(rows, anio, mes) {
    const ranges = getWeekRanges(anio, mes);
    const keys = Object.keys(ranges).map(Number).sort((a, b) => a - b);
    const used = new Set();
    const weeks = keys.map(w => {
        const r = ranges[w];
        const sel = rows.filter(d => {
            const day = new Date(d.fecha + "T00:00:00").getDate();
            return day >= r.start && day <= r.end;
        });
        sel.forEach(d => used.add(d));
        return { n: w, label: r.label || `Semana ${w}`, start: r.start, end: r.end, ...(_aggRows(sel)) };
    });
    const fuera = rows.filter(d => !used.has(d));
    return { weeks, fuera };
}

// ---------- Primitivas de dibujo ----------
function _pdfHeader(doc, ctx, titulo, lineas) {
    const H = ctx.headerH;
    doc.setFillColor(...PDF_C.navy);
    doc.rect(0, 0, 210, H, 'F');
    if (ctx.logo) {
        const lh = H - 10;
        doc.addImage(ctx.logo, 'PNG', 210 - 14 - lh * 0.79, 5, lh * 0.79, lh);
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(titulo, 14, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    (lineas || []).forEach((t, i) => doc.text(t, 14, 23 + i * 7.5));
}

function _pdfNewPage(doc, ctx, titulo, lineas) {
    doc.addPage();
    _pdfHeader(doc, ctx, titulo, lineas);
    return ctx.headerH + 8;
}

function _pdfMiniHeader(doc, texto) {
    doc.setFillColor(...PDF_C.navy);
    doc.rect(0, 0, 210, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(texto, 14, 8);
}

// Si no queda espacio, agrega página (con cabecera mini) y devuelve el nuevo Y
function _pdfEnsure(doc, y, need, textoMini) {
    if (y + need <= 282) return y;
    doc.addPage();
    _pdfMiniHeader(doc, textoMini);
    return 22;
}

function _pdfSection(doc, texto, x, y) {
    doc.setFillColor(...PDF_C.green);
    doc.rect(x, y - 3.2, 1.6, 4.4, 'F');
    doc.setTextColor(...PDF_C.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(texto, x + 3.5, y);
}

function _pdfCard(doc, x, y, w, h, valor, etiqueta, rgb, txt) {
    doc.setFillColor(...rgb);
    doc.roundedRect(x, y, w, h, 2, 2, 'F');
    doc.setTextColor(...(txt || [255, 255, 255]));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(String(valor), x + w / 2, y + h * 0.5, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.text(etiqueta.toUpperCase(), x + w / 2, y + h * 0.8, { align: 'center' });
}

function _pdfStatCard(doc, x, y, w, h, etiqueta, valor, sub, rgb) {
    doc.setFillColor(...rgb);
    doc.roundedRect(x, y, w, h, 2.5, 2.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(etiqueta.toUpperCase(), x + w / 2, y + 6, { align: 'center' });
    doc.setFontSize(16);
    doc.text(String(valor), x + w / 2, y + h * 0.62, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.text(sub, x + w / 2, y + h - 3.2, { align: 'center' });
}

function _pdfPanel(doc, x, y, w, h) {
    doc.setFillColor(...PDF_C.soft);
    doc.setDrawColor(...PDF_C.line);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 2, 2, 'FD');
}

function _pdfEmptyBox(doc, x, y, w, texto, rgb) {
    doc.setFillColor(...PDF_C.soft);
    doc.setDrawColor(...(rgb || PDF_C.green2));
    doc.setLineWidth(0.4);
    doc.roundedRect(x, y, w, 12, 2, 2, 'FD');
    doc.setTextColor(...(rgb || PDF_C.green2));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(texto, x + w / 2, y + 7.4, { align: 'center' });
}

function _pdfHBars(doc, o) {
    const { x, y, w, items, rowH = 5.4, labelW = 50, max } = o;
    const m = Math.max(max || 0, ...items.map(i => i.value), 1);
    const barMaxW = w - labelW - 12;
    let cy = y;
    items.forEach((it, i) => {
        if (i % 2 === 0) { doc.setFillColor(...PDF_C.soft); doc.rect(x, cy, w, rowH, 'F'); }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.8);
        doc.setTextColor(...PDF_C.text);
        doc.text(String(it.label), x + 1.5, cy + rowH * 0.68);
        const bw = it.value > 0 ? Math.max(0.8, barMaxW * it.value / m) : 0;
        if (bw > 0) {
            doc.setFillColor(...(it.color || PDF_C.green));
            doc.rect(x + labelW, cy + 1, bw, rowH - 2, 'F');
        }
        doc.setFont("helvetica", "bold");
        doc.text(String(it.value), x + labelW + bw + 1.8, cy + rowH * 0.68);
        cy += rowH;
    });
    return cy;
}

function _pdfNiceStep(max) {
    if (max <= 5) return 1;
    if (max <= 10) return 2;
    if (max <= 25) return 5;
    if (max <= 60) return 10;
    if (max <= 120) return 20;
    if (max <= 300) return 50;
    return 100;
}

function _pdfVBars(doc, o) {
    const { x, y, w, h, labels, values, colors } = o;
    const padT = 7, padB = 8, padL = 9;
    const plotX = x + padL, plotY = y + padT, plotW = w - padL - 3, plotH = h - padT - padB;
    const rawMax = Math.max(...values, 1);
    const step = _pdfNiceStep(rawMax);
    const top = Math.ceil(rawMax / step) * step;

    doc.setDrawColor(...PDF_C.line);
    doc.setLineWidth(0.2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...PDF_C.muted);
    for (let v = 0; v <= top; v += step) {
        const gy = plotY + plotH - (v / top) * plotH;
        doc.line(plotX, gy, plotX + plotW, gy);
        doc.text(String(v), plotX - 1.5, gy + 1, { align: 'right' });
    }

    const slot = plotW / values.length;
    const bw = Math.min(slot * 0.62, 14);
    values.forEach((v, i) => {
        const bh = (v / top) * plotH;
        const bx = plotX + slot * i + (slot - bw) / 2;
        if (bh > 0) {
            doc.setFillColor(...(colors ? colors[i] : PDF_C.green));
            doc.rect(bx, plotY + plotH - bh, bw, bh, 'F');
            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.5);
            doc.setTextColor(...PDF_C.text);
            doc.text(String(v), bx + bw / 2, plotY + plotH - bh - 1.2, { align: 'center' });
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.setTextColor(...PDF_C.muted);
        doc.text(String(labels[i]), bx + bw / 2, plotY + plotH + 4.5, { align: 'center' });
    });
}

// Barras (préstamos) + línea (tasa de retorno %) con eje derecho 0-100%
function _pdfTrend(doc, o) {
    const { x, y, w, h, labels, bars, rates } = o;
    const padT = 9, padB = 8, padL = 9, padR = 12;
    const plotX = x + padL, plotY = y + padT, plotW = w - padL - padR, plotH = h - padT - padB;
    const top = Math.max(2, Math.ceil(Math.max(...bars, 1) / 2) * 2);

    doc.setDrawColor(...PDF_C.line);
    doc.setLineWidth(0.2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    [0, 0.5, 1].forEach(f => {
        const gy = plotY + plotH - f * plotH;
        doc.line(plotX, gy, plotX + plotW, gy);
        doc.setTextColor(...PDF_C.muted);
        doc.text(String(Math.round(top * f)), plotX - 1.5, gy + 1, { align: 'right' });
        doc.text(`${Math.round(100 * f)}%`, plotX + plotW + 1.5, gy + 1);
    });

    const slot = plotW / bars.length;
    const bw = Math.min(slot * 0.5, 22);
    const pts = [];
    bars.forEach((v, i) => {
        const bh = (v / top) * plotH;
        const cx = plotX + slot * i + slot / 2;
        if (bh > 0) {
            doc.setFillColor(...PDF_C.bar);
            doc.rect(cx - bw / 2, plotY + plotH - bh, bw, bh, 'F');
            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.5);
            if (bh >= 6) {
                doc.setTextColor(255, 255, 255);
                doc.text(String(v), cx, plotY + plotH - 1.8, { align: 'center' });
            } else {
                doc.setTextColor(...PDF_C.text);
                doc.text(String(v), cx, plotY + plotH - bh - 1.2, { align: 'center' });
            }
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(...PDF_C.muted);
        doc.text(String(labels[i]), cx, plotY + plotH + 4.5, { align: 'center' });
        pts.push(rates[i] === null || rates[i] === undefined ? null : { px: cx, py: plotY + plotH - (rates[i] / 100) * plotH, r: rates[i] });
    });

    doc.setDrawColor(...PDF_C.green);
    doc.setLineWidth(0.8);
    for (let i = 1; i < pts.length; i++) {
        if (pts[i - 1] && pts[i]) doc.line(pts[i - 1].px, pts[i - 1].py, pts[i].px, pts[i].py);
    }
    pts.forEach(p => {
        if (!p) return;
        doc.setFillColor(...PDF_C.green);
        doc.circle(p.px, p.py, 1.2, 'F');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(...PDF_C.green);
        doc.text(`${p.r}%`, p.px, p.py - 2.2, { align: 'center' });
    });

    // Leyenda
    doc.setFillColor(...PDF_C.bar);
    doc.rect(x + w - 62, y + 2.2, 3, 3, 'F');
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...PDF_C.text);
    doc.text('Préstamos', x + w - 58, y + 4.7);
    doc.setFillColor(...PDF_C.green);
    doc.rect(x + w - 33, y + 2.2, 3, 3, 'F');
    doc.text('Tasa retorno', x + w - 29, y + 4.7);
}

// autoTable con cabecera mini en las páginas de continuación
function _pdfTable(doc, cfg, miniTitle) {
    const firstPage = doc.internal.getCurrentPageInfo().pageNumber;
    doc.autoTable({
        margin: { top: 18, left: 14, right: 14, bottom: 18 },
        styles: { cellPadding: 1.3, fontSize: 7, textColor: PDF_C.text, overflow: 'linebreak' },
        headStyles: { fillColor: PDF_C.navy, fontSize: 7, fontStyle: 'bold', textColor: 255 },
        alternateRowStyles: { fillColor: PDF_C.soft },
        ...cfg,
        didDrawPage: d => {
            if (doc.internal.getCurrentPageInfo().pageNumber > firstPage) _pdfMiniHeader(doc, miniTitle);
            if (cfg.didDrawPage) cfg.didDrawPage(d);
        }
    });
    return doc.lastAutoTable.finalY;
}

// ---------- Generador principal ----------
async function generatePDF() {
    const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDFCtor) {
        Swal.fire('Error', 'La librería de PDF no está cargada.', 'error');
        return;
    }

    const anio = viewDate.getFullYear();
    const mes = viewDate.getMonth();
    const mesNombre = mNames[mes];
    const rowsAct = _recordsOf(anio, mes);
    if (rowsAct.length === 0) {
        Swal.fire('Sin datos', `No hay registros en ${mesNombre} ${anio} para generar el informe.`, 'info');
        return;
    }

    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'flex';

    try {
        const doc = new jsPDFCtor();
        const hoy = new Date();
        const ctx = { logo: await _pdfLoadLogo(), headerH: 36, anio, mesNombre, emision: _fmtFechaCL(hoy) };

        const S = _statsOf(rowsAct);
        const prevD = new Date(anio, mes - 1, 1);
        const prevAnio = prevD.getFullYear();
        const prevMes = prevD.getMonth();
        const prevNombre = mNames[prevMes];
        const prevLabel = prevAnio !== anio ? `${prevNombre} ${prevAnio}` : prevNombre;
        const prevAbbr = prevNombre.slice(0, 3).toUpperCase();
        const curAbbr = mesNombre.slice(0, 3).toUpperCase();
        const P = _statsOf(_recordsOf(prevAnio, prevMes));
        const hasPrev = P.total > 0;
        const ultimoDia = new Date(anio, mes + 1, 0).getDate();
        const parcial = hoy.getFullYear() === anio && hoy.getMonth() === mes && hoy.getDate() < ultimoDia;
        const pages = {};

        // ===== PÁGINA 1: PORTADA =====
        doc.setFillColor(...PDF_C.navy);
        doc.rect(0, 0, 210, 297, 'F');
        doc.setFillColor(...PDF_C.navy2);
        doc.rect(0, 180, 210, 117, 'F');
        doc.setFillColor(...PDF_C.green);
        doc.rect(0, 155, 210, 6, 'F');

        if (ctx.logo) doc.addImage(ctx.logo, 'PNG', 80, 28, 50, 63.3);

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text("COLEGIO NUESTRA SEÑORA DE GUADALUPE", 105, 105, { align: 'center' });
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        doc.line(40, 109, 170, 109);

        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.text("GESTIÓN CHROMEBOOKS", 105, 124, { align: 'center' });

        doc.setFillColor(...PDF_C.green);
        doc.roundedRect(55, 130, 100, 16, 3, 3, 'F');
        doc.setFontSize(14);
        doc.text(`${mesNombre.toUpperCase()} ${anio}`, 105, 141, { align: 'center' });

        doc.setFontSize(9);
        doc.text("RESUMEN EJECUTIVO", 105, 170, { align: 'center' });

        const portadaKpis = [
            { label: 'Préstamos', value: S.total },
            { label: 'Devueltos OK', value: S.ok },
            { label: 'Pendientes', value: S.pend },
            { label: 'Con Daños', value: S.dmg }
        ];
        const pkW = 38, pkH = 22, pkY = 178, pkX0 = 14 + (182 - portadaKpis.length * pkW - 3 * 6) / 2;
        portadaKpis.forEach((k, i) => {
            const px = pkX0 + i * (pkW + 6);
            doc.setFillColor(...PDF_C.navy3);
            doc.roundedRect(px, pkY, pkW, pkH, 2, 2, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text(String(k.value), px + pkW / 2, pkY + 11, { align: 'center' });
            doc.setFontSize(6.5);
            doc.setFont("helvetica", "normal");
            doc.text(k.label.toUpperCase(), px + pkW / 2, pkY + 18, { align: 'center' });
        });

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(`Tasa de retorno: ${S.tasa}%`, 105, 214, { align: 'center' });

        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(200, 220, 255);
        doc.text(`Emitido: ${ctx.emision}${parcial ? '  ·  Mes en curso (datos parciales)' : ''}`, 105, 224, { align: 'center' });
        doc.text(`Responsable: Franco San Martín — Técnico Informático`, 105, 230, { align: 'center' });
        doc.text(`Área de Informática · NSG ${anio}`, 105, 236, { align: 'center' });

        // ===== PÁGINA 2: USO POR DOCENTE =====
        let y = _pdfNewPage(doc, ctx, `GESTIÓN CHROMEBOOKS ${anio}`, [
            `Reporte Mensual: ${mesNombre.toUpperCase()} ${anio}`,
            `Emitido: ${ctx.emision}  ·  Responsable: Franco San Martín (Tec. Informático)`
        ]);
        pages.docentes = doc.internal.getNumberOfPages();

        const kp = [
            [S.total, 'Total préstamos', PDF_C.green],
            [S.ok, 'Devoluciones OK', PDF_C.green2],
            [S.pend, 'Pendientes', [255, 193, 7], [60, 40, 0]],
            [S.dmg, 'Con daños', PDF_C.redDark],
            [S.lab, 'Uso laboratorio', PDF_C.purple],
            [S.reemp, 'Con reemplazos', PDF_C.red]
        ];
        const cw = (182 - 5 * 4) / 6;
        kp.forEach((k, i) => _pdfCard(doc, 14 + i * (cw + 4), y, cw, 20, k[0], k[1], k[2], k[3]));
        y += 26;

        doc.setFillColor(...PDF_C.navy);
        doc.roundedRect(14, y, 182, 10, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(`TASA DE RETORNO: ${S.tasa}%  ·  Stock: ${STOCK_MAXIMO} Chromebooks + ${STOCK_REEMPLAZO} Reemplazos`, 105, y + 6.3, { align: 'center' });
        y += 18;

        _pdfSection(doc, `Uso por Docente — ${S.docentes} docente${S.docentes !== 1 ? 's' : ''} registrado${S.docentes !== 1 ? 's' : ''}`, 14, y);
        const docentesOrden = Object.entries(S.porDoc).sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]));

        _pdfTable(doc, {
            startY: y + 3,
            head: [['#', 'Docente Responsable', 'Préstamos', 'Dev. OK', 'Reemplazo', 'Lab', 'Daños']],
            body: docentesOrden.map(([nombre, v], i) => [i + 1, nombre, v.total, v.ok, v.reemp > 0 ? v.reemp : '—', v.lab > 0 ? v.lab : '—', v.dmg > 0 ? v.dmg : '—']),
            columnStyles: { 0: { cellWidth: 10 } }
        }, `Uso por docente — ${mesNombre} ${anio} (cont.)`);

        // ===== PÁGINA 3: DASHBOARD =====
        y = _pdfNewPage(doc, ctx, 'DASHBOARD · ANÁLISIS VISUAL', [
            `${mesNombre.toUpperCase()} ${anio} | ${S.total} préstamos | Tasa retorno: ${S.tasa}% | ${S.docentes} docentes`
        ]);
        pages.dashboard = doc.internal.getNumberOfPages();

        // Estado de equipos
        _pdfPanel(doc, 14, y, 88, 58);
        _pdfSection(doc, 'ESTADO DE EQUIPOS DEL MES', 17, y + 7);
        _pdfHBars(doc, {
            x: 17, y: y + 12, w: 82, rowH: 8.2, labelW: 24, max: Math.max(S.total, 1),
            items: [
                { label: 'Entregados', value: S.ok, color: PDF_C.green2 },
                { label: 'Pendientes', value: S.pend, color: PDF_C.amber },
                { label: 'Dañados', value: S.dmg, color: PDF_C.redDark },
                { label: 'Laboratorio', value: S.lab, color: PDF_C.purple },
                { label: 'Reemplazos', value: S.reemp, color: PDF_C.red }
            ]
        });

        // Préstamos por mes del año
        const mensual = mNames.map((_, i) => _recordsOf(anio, i).length);
        _pdfPanel(doc, 108, y, 88, 58);
        _pdfSection(doc, `PRÉSTAMOS POR MES - ${anio}`, 111, y + 7);
        _pdfVBars(doc, {
            x: 109, y: y + 8, w: 86, h: 49,
            labels: mNames.map(m => m.slice(0, 1)),
            values: mensual,
            colors: mensual.map((_, i) => i === mes ? PDF_C.green : PDF_C.bar)
        });
        y += 64;

        // Tendencia semanal
        const W = _weeklyData(rowsAct, anio, mes);
        _pdfPanel(doc, 14, y, 182, 58);
        _pdfSection(doc, 'TENDENCIA SEMANAL — PRÉSTAMOS Y TASA DE RETORNO', 17, y + 7);
        _pdfTrend(doc, {
            x: 15, y: y + 8, w: 180, h: 49,
            labels: W.weeks.map(wk => `S${wk.n}`),
            bars: W.weeks.map(wk => wk.prest),
            rates: W.weeks.map(wk => wk.tasa)
        });
        y += 64;

        // Préstamos por docente (con continuación)
        const itemsDoc = docentesOrden.map(([nombre, v]) => ({ label: nombre, value: v.total, color: PDF_C.green }));
        const maxDoc = itemsDoc.length ? itemsDoc[0].value : 1;
        const ROW_H = 5.2;
        let idx = 0, primera = true, by = y;
        _pdfSection(doc, 'PRÉSTAMOS POR DOCENTE', 14, by + 3);
        by += 7;
        while (idx < itemsDoc.length) {
            if (!primera) {
                by = _pdfNewPage(doc, ctx, 'PRÉSTAMOS POR DOCENTE (cont.)', [`${mesNombre.toUpperCase()} ${anio}`]);
            }
            const cap = Math.max(1, Math.floor((284 - by) / ROW_H));
            const chunk = itemsDoc.slice(idx, idx + cap);
            _pdfHBars(doc, { x: 14, y: by, w: 182, rowH: ROW_H, labelW: 56, max: maxDoc, items: chunk });
            idx += chunk.length;
            primera = false;
        }

        // ===== CONSOLIDADO vs MES ANTERIOR =====
        if (hasPrev) {
            const lineasCons = [`Generado: ${ctx.emision} · Responsable: Franco San Martín`];
            if (parcial) lineasCons.push(`Mes en curso: datos hasta el ${ctx.emision} (la comparación es parcial)`);
            y = _pdfNewPage(doc, ctx, `CONSOLIDADO: ${mesNombre.toUpperCase()} vs ${prevLabel.toUpperCase()}`, lineasCons);
            pages.consolidado = doc.internal.getNumberOfPages();

            // Comparación de préstamos
            _pdfPanel(doc, 14, y, 70, 58);
            _pdfSection(doc, 'COMPARACIÓN DE PRÉSTAMOS', 17, y + 7);
            _pdfVBars(doc, {
                x: 15, y: y + 8, w: 68, h: 42,
                labels: [prevAbbr, curAbbr], values: [P.total, S.total], colors: [PDF_C.bar, PDF_C.green]
            });
            const pctPrest = P.total > 0 ? Math.round(((S.total - P.total) / P.total) * 100) : 0;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(...(pctPrest >= 0 ? PDF_C.green : PDF_C.red));
            doc.text(`${pctPrest > 0 ? '+' : ''}${pctPrest}%`, 49, y + 55.5, { align: 'center' });

            // Tabla de métricas
            const metricas = [
                ['Préstamos totales', P.total, S.total, S.total - P.total, 1, ''],
                ['Devueltos OK', P.ok, S.ok, S.ok - P.ok, 1, ''],
                ['Tasa de retorno', `${P.tasa}%`, `${S.tasa}%`, S.tasa - P.tasa, 1, '%'],
                ['Laboratorio', P.lab, S.lab, S.lab - P.lab, 0, ''],
                ['Reemplazos', P.reemp, S.reemp, S.reemp - P.reemp, -1, ''],
                ['Dañados', P.dmg, S.dmg, S.dmg - P.dmg, -1, ''],
                ['Docentes activos', P.docentes, S.docentes, S.docentes - P.docentes, 0, ''],
                ['Pendientes', P.pend, S.pend, S.pend - P.pend, -1, '']
            ];
            doc.autoTable({
                startY: y,
                margin: { left: 90, right: 14 },
                tableWidth: 106,
                head: [['MÉTRICA', prevAbbr, curAbbr, 'VAR.']],
                body: metricas.map(m => [m[0], m[1], m[2], m[5] ? `${m[3] > 0 ? '+' : ''}${m[3]}${m[5]}` : _sgn(m[3])]),
                styles: { cellPadding: 1.4, fontSize: 7, textColor: PDF_C.text },
                headStyles: { fillColor: PDF_C.navy, fontSize: 7, fontStyle: 'bold', textColor: 255 },
                alternateRowStyles: { fillColor: PDF_C.soft },
                columnStyles: { 0: { cellWidth: 44 }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' } },
                didParseCell: d => {
                    if (d.section === 'body' && d.column.index === 3) {
                        const m = metricas[d.row.index];
                        const bueno = m[3] * m[4];
                        d.cell.styles.fontStyle = 'bold';
                        d.cell.styles.textColor = m[3] === 0 || m[4] === 0 ? PDF_C.muted : (bueno > 0 ? PDF_C.green : PDF_C.red);
                    }
                }
            });
            y += 64;

            // Tarjetas destacadas
            const kw = (182 - 8) / 3;
            const dTasa = S.tasa - P.tasa;
            _pdfStatCard(doc, 14, y, kw, 25, 'Mejor indicador del mes', `Tasa ${S.tasa}%`, (dTasa === 0 ? `igual que ${prevAbbr}` : `${_sgn(dTasa)}% vs ${prevAbbr}`), PDF_C.green);
            _pdfStatCard(doc, 14 + kw + 4, y, kw, 25, 'Crecimiento en préstamos', `${pctPrest > 0 ? '+' : ''}${pctPrest}%`, `${P.total} a ${S.total} préstamos${parcial ? ' (parcial)' : ''}`, pctPrest >= 0 ? PDF_C.navy3 : PDF_C.amber);
            _pdfStatCard(doc, 14 + 2 * (kw + 4), y, kw, 25, 'Atención: reemplazos', S.reemp, (S.reemp === P.reemp ? `igual que ${prevAbbr}` : `${_sgn(S.reemp - P.reemp)} vs ${prevAbbr}`), PDF_C.red);
            y += 33;

            // Detalle por docente
            _pdfSection(doc, `DETALLE POR DOCENTE — ${curAbbr} vs ${prevAbbr}`, 14, y);
            const filasCons = docentesOrden.map(([nombre, v]) => {
                const antes = P.porDoc[nombre] ? P.porDoc[nombre].total : 0;
                return { nombre, antes, ahora: v.total, nuevo: antes === 0, lab: v.lab, reemp: v.reemp, dmg: v.dmg };
            });
            const maxAhora = Math.max(...filasCons.map(f => f.ahora), 1);
            const tituloCons = `Consolidado docentes — ${curAbbr} vs ${prevAbbr} (cont.)`;
            _pdfTable(doc, {
                startY: y + 3,
                head: [['#', 'DOCENTE', prevAbbr, curAbbr, 'VAR.', 'LAB', 'REEMP', 'DAÑO', 'BARRA']],
                body: filasCons.map((f, i) => [
                    i + 1, (f.nuevo ? '* ' : '') + f.nombre, f.antes > 0 ? f.antes : '—', f.ahora,
                    f.nuevo ? 'NUEVO' : _sgn(f.ahora - f.antes),
                    f.lab > 0 ? f.lab : '—', f.reemp > 0 ? f.reemp : '—', f.dmg > 0 ? f.dmg : '—', ''
                ]),
                columnStyles: {
                    0: { cellWidth: 8 }, 1: { cellWidth: 52 }, 2: { cellWidth: 14, halign: 'center' },
                    3: { cellWidth: 14, halign: 'center' }, 4: { cellWidth: 16, halign: 'center' },
                    5: { cellWidth: 12, halign: 'center' }, 6: { cellWidth: 14, halign: 'center' },
                    7: { cellWidth: 12, halign: 'center' }, 8: { cellWidth: 40 }
                },
                didParseCell: d => {
                    if (d.section === 'body' && d.column.index === 4) {
                        const f = filasCons[d.row.index];
                        d.cell.styles.fontStyle = 'bold';
                        d.cell.styles.textColor = f.nuevo ? PDF_C.navy3 : (f.ahora > f.antes ? PDF_C.green : (f.ahora < f.antes ? PDF_C.red : PDF_C.muted));
                    }
                },
                didDrawCell: d => {
                    if (d.section === 'body' && d.column.index === 8) {
                        const f = filasCons[d.row.index];
                        const bw = (d.cell.width - 3) * (f.ahora / maxAhora);
                        doc.setFillColor(...PDF_C.green);
                        doc.rect(d.cell.x + 1.5, d.cell.y + 1.3, Math.max(0.6, bw), d.cell.height - 2.6, 'F');
                    }
                }
            }, tituloCons);

            let fy = doc.lastAutoTable.finalY + 5;
            const sinPrest = Object.keys(P.porDoc).filter(k => !S.porDoc[k]).length;
            const notas = [];
            if (filasCons.some(f => f.nuevo)) notas.push(`* Docente nuevo: no registró préstamos en ${prevLabel}.`);
            if (sinPrest > 0) notas.push(`${sinPrest} docente${sinPrest !== 1 ? 's' : ''} de ${prevLabel} no registra${sinPrest !== 1 ? 'n' : ''} préstamos este mes.`);
            if (notas.length) {
                fy = _pdfEnsure(doc, fy, notas.length * 5 + 2, tituloCons);
                doc.setFont("helvetica", "italic");
                doc.setFontSize(7);
                doc.setTextColor(...PDF_C.muted);
                notas.forEach((t, i) => doc.text(t, 14, fy + i * 5));
            }
        }

        // ===== OBSERVACIONES =====
        const obsOrdenadas = [...S.obs].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        y = _pdfNewPage(doc, ctx, `OBSERVACIONES DEL MES — ${mesNombre.toUpperCase()} ${anio}`, [
            `${obsOrdenadas.length} registro${obsOrdenadas.length !== 1 ? 's' : ''} con observación · Generado: ${ctx.emision}`
        ]);
        pages.obs = doc.internal.getNumberOfPages();

        const estadoTxt = d => isDamagedRecord(d) ? 'DAÑADO' : (_isOk(d) ? 'CERRADO' : 'PENDIENTE');
        const fechaCorta = d => (d.fecha || '').split('-').reverse().slice(0, 2).join('/');
        if (obsOrdenadas.length === 0) {
            _pdfEmptyBox(doc, 14, y, 182, 'Sin observaciones registradas este mes');
            y += 20;
        } else {
            y = _pdfTable(doc, {
                startY: y,
                head: [['FECHA', 'DOCENTE', 'CURSO', 'ASIGNATURA', 'ESTADO', 'OBSERVACIÓN']],
                body: obsOrdenadas.map(d => [fechaCorta(d), _normProf(d), d.curso || '—', d.asignatura || '—', estadoTxt(d), (d.observacion || '').trim()]),
                columnStyles: { 0: { cellWidth: 14 }, 1: { cellWidth: 38 }, 2: { cellWidth: 18 }, 3: { cellWidth: 32 }, 4: { cellWidth: 20 } }
            }, `Observaciones — ${mesNombre} ${anio} (cont.)`) + 10;
        }

        // ===== DAÑOS Y OBSERVACIONES vs MES ANTERIOR =====
        y = _pdfEnsure(doc, y, 135, `Daños y observaciones — ${mesNombre} ${anio}`);
        pages.danios = doc.internal.getNumberOfPages();
        _pdfSection(doc, hasPrev ? `DAÑOS Y OBSERVACIONES: ${curAbbr} vs ${prevAbbr}` : 'DAÑOS Y OBSERVACIONES', 14, y);
        y += 4;

        const acumRows = db.filter(d => {
            const dt = new Date(d.fecha + "T00:00:00");
            return !isNaN(dt) && dt.getFullYear() === anio && dt.getMonth() <= mes;
        });
        const A = _statsOf(acumRows);
        const dw = (182 - 12) / 4;
        const subDelta = (cur, prev) => hasPrev ? (cur === prev ? `igual que ${prevAbbr}` : `${_sgn(cur - prev)} vs ${prevAbbr}`) : mesNombre;
        _pdfStatCard(doc, 14, y, dw, 25, 'Daños mes actual', S.dmg, subDelta(S.dmg, P.dmg), S.dmg > 0 ? PDF_C.redDark : PDF_C.green2);
        _pdfStatCard(doc, 14 + (dw + 4), y, dw, 25, 'Obs. mes actual', S.obs.length, subDelta(S.obs.length, P.obs.length), PDF_C.amber);
        _pdfStatCard(doc, 14 + 2 * (dw + 4), y, dw, 25, 'Daños acumulado año', A.dmg, `Ene - ${curAbbr}`, PDF_C.navy3);
        _pdfStatCard(doc, 14 + 3 * (dw + 4), y, dw, 25, 'Obs. acumulado año', A.obs.length, `Ene - ${curAbbr}`, PDF_C.navy2);
        y += 33;

        _pdfSection(doc, `DETALLE DE DAÑOS — ${mesNombre.toUpperCase()} (${S.dmg} registro${S.dmg !== 1 ? 's' : ''})`, 14, y);
        y += 3;
        if (S.dmg === 0) {
            _pdfEmptyBox(doc, 14, y, 182, 'Sin equipos dañados este mes');
            y += 20;
        } else {
            y = _pdfTable(doc, {
                startY: y,
                head: [['FECHA', 'DOCENTE', 'CURSO', 'ASIGNATURA', 'DETALLE DEL DAÑO']],
                body: S.dmgRows.map(d => [fechaCorta(d), _normProf(d), d.curso || '—', d.asignatura || '—', (d.observacion || 'Daño reportado').trim()]),
                headStyles: { fillColor: PDF_C.redDark, fontSize: 7, fontStyle: 'bold', textColor: 255 },
                columnStyles: { 0: { cellWidth: 14 }, 1: { cellWidth: 40 }, 2: { cellWidth: 18 }, 3: { cellWidth: 34 } }
            }, `Detalle de daños — ${mesNombre} ${anio} (cont.)`) + 8;
        }

        if (hasPrev) {
            y = _pdfEnsure(doc, y, 50, `Daños y observaciones — ${mesNombre} ${anio}`);
            _pdfSection(doc, `COMPARATIVA VS ${prevLabel.toUpperCase()}: DAÑOS Y OBSERVACIONES`, 14, y);
            const compDan = [
                ['Registros con daño', P.dmg, S.dmg],
                ['Docentes con daño', P.docDmg, S.docDmg],
                ['Registros con observación', P.obs.length, S.obs.length],
                ['Docentes con observación', P.docObs, S.docObs]
            ];
            y = _pdfTable(doc, {
                startY: y + 3,
                head: [['MÉTRICA', prevAbbr, curAbbr, 'VAR.']],
                body: compDan.map(r => [r[0], r[1], r[2], _sgn(r[2] - r[1])]),
                columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' } },
                didParseCell: d => {
                    if (d.section === 'body' && d.column.index === 3) {
                        const r = compDan[d.row.index];
                        d.cell.styles.fontStyle = 'bold';
                        d.cell.styles.textColor = r[2] === r[1] ? PDF_C.muted : (r[2] > r[1] ? PDF_C.red : PDF_C.green);
                    }
                }
            }, `Comparativa — ${mesNombre} ${anio} (cont.)`) + 6;
        }

        // ===== RESUMEN SEMANAL Y ALERTAS =====
        y = _pdfNewPage(doc, ctx, 'RESUMEN SEMANAL', [`${mesNombre.toUpperCase()} ${anio}`]);
        pages.semanal = doc.internal.getNumberOfPages();

        const filasSem = W.weeks.map(wk => [
            `${wk.label} (${wk.start}–${wk.end})`, wk.prest, wk.chr, wk.ree, wk.ok, wk.tasa === null ? '—' : `${wk.tasa}%`
        ]);
        if (W.fuera.length > 0) {
            const f = _aggRows(W.fuera);
            filasSem.push(['Fuera de semanas lectivas', f.prest, f.chr, f.ree, f.ok, f.tasa === null ? '—' : `${f.tasa}%`]);
        }
        const T = _aggRows(rowsAct);
        filasSem.push(['TOTAL MES', T.prest, T.chr, T.ree, T.ok, T.tasa === null ? '—' : `${T.tasa}%`]);

        y = _pdfTable(doc, {
            startY: y,
            head: [['Período', 'Préstamos', 'Chromebooks', 'Reemplazos', 'Devueltos OK', 'Tasa']],
            body: filasSem,
            styles: { cellPadding: 2, fontSize: 8, textColor: PDF_C.text },
            columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' } },
            didParseCell: d => {
                if (d.section === 'body' && d.row.index === filasSem.length - 1) {
                    d.cell.styles.fontStyle = 'bold';
                    d.cell.styles.fillColor = [225, 235, 250];
                }
            }
        }, `Resumen semanal — ${mesNombre} ${anio} (cont.)`) + 10;

        const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0);
        const alertas = rowsAct.filter(_isDebt).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        y = _pdfEnsure(doc, y, 40, `Alertas de devolución — ${mesNombre} ${anio}`);
        _pdfSection(doc, `ALERTA DE DEVOLUCIÓN — ${alertas.length} alerta${alertas.length !== 1 ? 's' : ''}`, 14, y);
        y += 3;
        if (alertas.length === 0) {
            _pdfEmptyBox(doc, 14, y, 182, 'Sin alertas pendientes en este mes');
        } else {
            _pdfTable(doc, {
                startY: y,
                head: [['FECHA', 'DOCENTE', 'CURSO', 'ASIGNATURA', 'SIN DEVOLVER', 'DÍAS']],
                body: alertas.map(d => {
                    const falta = _n(d.chromebooks) + _n(d.reemplazo) - _n(d.devueltos);
                    const dias = Math.max(0, Math.floor((hoy0 - new Date(d.fecha + "T00:00:00")) / 86400000));
                    return [fechaCorta(d), _normProf(d), d.curso || '—', d.asignatura || '—', `${falta} equipo${falta !== 1 ? 's' : ''}`, dias === 0 ? 'HOY' : `${dias} d`];
                }),
                headStyles: { fillColor: PDF_C.redDark, fontSize: 7, fontStyle: 'bold', textColor: 255 },
                columnStyles: { 0: { cellWidth: 14 }, 4: { cellWidth: 26, halign: 'center' }, 5: { cellWidth: 16, halign: 'center' } }
            }, `Alertas de devolución — ${mesNombre} ${anio} (cont.)`);
        }

        // ===== PORTADA: CONTENIDO DEL REPORTE =====
        doc.setPage(1);
        doc.setFillColor(0, 38, 80);
        doc.roundedRect(34, 244, 142, 40, 3, 3, 'F');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(140, 190, 240);
        doc.text('CONTENIDO DEL REPORTE', 105, 251, { align: 'center' });
        doc.setFont("helvetica", "normal");
        doc.setTextColor(210, 225, 245);
        const contenido = [
            [pages.docentes, 'Tabla de uso por docente'],
            [pages.dashboard, 'Dashboard visual y gráficos'],
            ...(pages.consolidado ? [[pages.consolidado, `Consolidado vs ${prevLabel}`]] : []),
            [pages.obs, 'Observaciones, daños y comparativa'],
            [pages.semanal, 'Resumen semanal y alertas']
        ];
        contenido.forEach((c, i) => doc.text(`Pág. ${c[0]} — ${c[1]}`, 105, 258 + i * 5.2, { align: 'center' }));

        // ===== PIE DE PÁGINA =====
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            if (i === 1) doc.setTextColor(150, 180, 220); else doc.setTextColor(128);
            doc.text(`Área de Informática – Responsable: Franco San Martín – NSG ${anio}`, 14, 290);
            doc.text(`Página ${i} de ${pageCount}`, 196, 290, { align: 'right' });
        }

        doc.save(`Reporte_Franco_${mesNombre}_${anio}.pdf`);
    } catch (e) {
        console.error('Error generando PDF:', e);
        Swal.fire('Error', 'No se pudo generar el PDF: ' + e.message, 'error');
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
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
        let diasLabel = dias === 0 ? 'HOY' : `${dias}d`;

        html += `<div class="alerta-item" onclick="editItem('${d.id}')">
            <div class="${diasClass}"><div>${diasLabel}</div></div>
            <div class="alerta-info">
                <div class="alerta-nombre">👤 ${_esc(d.profesor)}</div>
                <div class="alerta-detalle">📅 ${fechaFmt} · ${_esc(d.curso)} · ${_esc(d.asignatura)} · <b style="color:#c62828;">${falta} equipo${falta !== 1 ? 's' : ''} sin devolver</b></div>
            </div>
            <button class="btn btn-sm btn-outline-danger border-0 fw-bold" style="font-size:0.7rem;">Editar</button>
        </div>`;
    });

    danados.forEach(d => {
        const fechaFmt = d.fecha.split('-').reverse().slice(0, 2).join('/');
        html += `<div class="alerta-item" onclick="editItem('${d.id}')" style="border-left: 3px solid #dc3545;">
            <div class="alerta-dias" style="background:#dc3545;"><div>⚠️</div></div>
            <div class="alerta-info">
                <div class="alerta-nombre">👤 ${_esc(d.profesor)}</div>
                <div class="alerta-detalle">📅 ${fechaFmt} · ${_esc(d.curso)} · ${_esc(d.asignatura)} · <b style="color:#c62828;">🔴 ${_esc(d.observacion || 'Daño reportado')}</b></div>
            </div>
            <button class="btn btn-sm btn-outline-danger border-0 fw-bold">Editar</button>
        </div>`;
    });

    body.innerHTML = html;
}

function renderObsPanel(registros) {
    const body  = document.getElementById('obsBody');
    const count = document.getElementById('obsCount');
    if (!body) return;

    if (count) count.textContent = registros.length;

    if (registros.length === 0) {
        body.innerHTML = '<div class="obs-empty">Sin observaciones este mes 📝</div>';
        return;
    }

    const sorted = [...registros].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    body.innerHTML = sorted.map(d => {
        const partes = (d.fecha || '').split('-');
        const fechaStr = partes.length === 3 ? `${partes[2]}/${partes[1]}` : d.fecha;
        const obs = (d.observacion || '').trim();
        return `
        <div class="obs-item" onclick="editItem('${d.id}')" title="Click para editar este registro">
            <div class="obs-fecha-badge">${fechaStr}</div>
            <div class="obs-info">
                <div class="obs-profesor">👤 ${_esc(d.profesor || '—')}</div>
                <div class="obs-curso">🏫 ${_esc(d.curso || '—')} · 📚 ${_esc(d.asignatura || '—')}</div>
                <div class="obs-texto">💬 ${_esc(obs)}</div>
            </div>
        </div>`;
    }).join('');
}

function toggleObsPanel() {
    const wrapper = document.getElementById('obsPanelWrapper');
    if (!wrapper) return;
    const visible = wrapper.style.display !== 'none';
    wrapper.style.display = visible ? 'none' : 'block';
}

function _calcMesData(mes) {
    const año = viewDate.getFullYear();
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
    const año = viewDate.getFullYear();
    const mesesConDatos = mNames.map((nombre, i) => ({ nombre, i, ..._calcMesData(i) }))
        .filter(m => m.total > 0);

    if (mesesConDatos.length === 0) {
        document.getElementById('tablaAnualBody').innerHTML =
            '<tr><td colspan="10" class="text-muted text-center py-4">Sin datos registrados este año</td></tr>';
        return;
    }

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

    document.getElementById('tablaAnualBody').innerHTML = html;
}

function _irAMes(mesIdx) {
    viewDate = new Date(viewDate.getFullYear(), mesIdx, 1);
    currentWeek = 0;
    filterMode  = 'all';
    showPage('registros');
    renderAll();
    renderAnualChart();
}

function updateSyncChip(estado, mins) {
    const chip  = document.getElementById('syncChip');
    const label = chip?.querySelector('.sync-label');
    if (!chip) return;

    chip.className = 'sync-chip';
    if (estado === 'fresh') {
        chip.classList.add('sync-fresh');
        if (label) label.textContent = mins <= 1 ? '🟢 Sincronizado (Supabase)' : `🟢 hace ${mins} min`;
    } else if (estado === 'cache') {
        chip.classList.add('sync-cache');
        if (label) label.textContent = `🟡 Caché · hace ${mins} min`;
    } else if (estado === 'offline') {
        chip.classList.add('sync-offline');
        if (label) label.textContent = '🔴 Sin conexión';
    } else {
        chip.classList.add('sync-loading');
        if (label) label.textContent = 'Cargando...';
    }
}

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

document.addEventListener('keydown', function(e) {
    const modalEl = document.getElementById('resModal');
    const modalAbierto = modalEl && modalEl.classList.contains('show');

    if (modalAbierto) {
        if (e.key === 'Enter') {
            const tag = document.activeElement?.tagName;
            if (tag !== 'TEXTAREA' && tag !== 'BUTTON' && tag !== 'SELECT') {
                if (_wizardStep < WIZARD_TOTAL) {
                    e.preventDefault();
                    wizardNext();
                }
            }
        }
        return;
    }

    if (e.key === 'Escape') {
        _hideOfflineBanner();
    }
});

window.onload = () => {
    _restoreDarkMode();
    load();
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
