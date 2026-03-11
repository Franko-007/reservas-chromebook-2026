function getEstado(r) {
    const obs = (r.observacion || "").toLowerCase();
    const chr = parseInt(r.chromebooks || 0);
    const ree = parseInt(r.reemplazo || 0);
    const dev = parseInt(r.devueltos || 0);

    // Laboratorio: campo dedicado o legado en observacion
    if (r.uso_laboratorio === true || r.uso_laboratorio === "TRUE" || r.uso_laboratorio === "true" || obs.includes("laboratorio")) return "LABORATORIO";
    if (obs.includes("dañada") || obs.includes("dañado")) return "DAÑADO";
    if ((chr + ree) > dev) return "ACTIVO";
    return "CERRADO";
}

function calcEstado(chr,ree,dev,obs,lab){
 obs=(obs||"").toLowerCase();
 if(lab) return "LABORATORIO";
 if(obs.includes("dañada")||obs.includes("dañado")) return "DAÑADO";
 if((parseInt(chr||0)+parseInt(ree||0))>parseInt(dev||0)) return "ACTIVO";
 return "CERRADO";
}
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwHI_6GzuaT1BoJWhoMh-6YF_08AsLksgmGO9ImkDTmpKB9nT2SkRZaz0mKPIyGB8k/exec";
// Inicializar con la fecha actual
const _hoy = new Date();
const _diaHoy = _hoy.getDate();
const _semanaInicial = _diaHoy <= 7 ? 1 : _diaHoy <= 14 ? 2 : _diaHoy <= 21 ? 3 : 4;
let db = [], viewDate = new Date(_hoy.getFullYear(), _hoy.getMonth(), 1), filterMode = 'all', currentWeek = _semanaInicial, charts = {};
const mNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const DOCENTES_NSG = ["ALEXIS CORTÉS","ALLYSON RIOS","ANA OGAZ","ANDREA SALAZAR","ANDREA DONOSO","AVIGUEY GONZALEZ","CAMILA GONZÁLEZ","CARLA MERA","CARLOS ARAYA","CARMEN ÁLVAREZ","CAROLINA MIRANDA","CAROLINA REYES","CECILIA GARCÍA","CLAUDIA TOLEDO","CONSTANZA LÓPEZ","DANIEL VITTA","DANIELA VERA","DANIELA VALENZUELA","DEBORA GAETE","ELIZABETH MIRANDA","ERIKA KINDERMANN","FERNANDA RÍOS","FRANCISCA MAUREIRA","FRANCISCA COFRÉ","FRANCISCA VIZCAYA","GIOVANNA ARIAS","GOLDIE FARÍAS","HERNÁN REYES","JAVIERA ALIAGA","JOAQUÍN ALMUNA","KARIMME GUTIÉRREZ","KARINA BARRIOS","KAROLINA RIFFO","LEONARDO RÍOS","LORENA ARANCIBIA","LUIS SÁNCHEZ","MACARENA BELTRÁN","MARÍA MONZÓN","MARÍA GONZÁLEZ","MARISOL GUAJARDO","MATÍAS CUEVAS","NATALIA CARTES","NATALY HIDALGO","NICOLE BELLO","PAOLA ÁVILA","PATRICIA NÚÑEZ","PAULINA ARGOMEDO","PRISCILA VALENZUELA","REINA ORTEGA","STEPHANY GUZMÁN","VÍCTOR BARRIENTOS","YADIA CERDA","YESSENIA SÁNCHEZ"];

// Función debounce para búsqueda suave
let debounceTimer;
function debouncedRender() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderAll, 300);
}

// Docentes extra agregados en sesión (se conservan entre llamadas a fillDocentes)
const _docentesExtra = [];

function fillDocentes() {
    const select = document.getElementById('fProfesor');
    if(!select) return;
    const valorActual = select.value;
    select.innerHTML = '<option value="">Seleccione un docente...</option>';
    [...DOCENTES_NSG, ..._docentesExtra].sort().forEach(d => {
        const opt = document.createElement('option');
        opt.value = d; opt.textContent = d; select.appendChild(opt);
    });
    // Restaurar valor si existía
    if(valorActual) select.value = valorActual;
}

function agregarDocente() {
    const nombre = prompt("Ingrese el nombre completo del docente:");
    if (!nombre || !nombre.trim()) return;
    const nombreFinal = nombre.trim().toUpperCase();
    const sel = document.getElementById('fProfesor');
    // Verificar si ya existe en la lista fija o en extras
    const yaExiste = DOCENTES_NSG.includes(nombreFinal) || _docentesExtra.includes(nombreFinal);
    if (!yaExiste) {
        _docentesExtra.push(nombreFinal);
        fillDocentes(); // re-renderizar con el nuevo incluido
    }
    sel.value = nombreFinal;
    saveDraft();
}

// 1. Carga inicial de datos
async function load() { 
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'flex';
    fillDocentes();
    
    try {
        const r = await fetch(SCRIPT_URL); 
        if (!r.ok) throw new Error("Fallo en la respuesta del servidor");
        
        db = await r.json(); 
        
        const Toast = Swal.mixin({
            toast: true, position: 'top-end', showConfirmButton: false, timer: 3000,
            timerProgressBar: true, didOpen: (toast) => { toast.addEventListener('mouseenter', Swal.stopTimer); toast.addEventListener('mouseleave', Swal.resumeTimer); }
        });
        Toast.fire({ icon: 'success', title: 'Datos sincronizados correctamente' });
        
        // Activar el tab de la semana actual
        document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === _semanaInicial));
        renderAll(); 
        renderAnualChart(); 
    } catch(e) { 
        console.error("Error:", e);
        Swal.fire('Error de Conexión', 'No se pudieron cargar los datos de Google Sheets.', 'error');
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

// 2. Renderizado de tabla y lógica de filtrado
function renderAll() {
    const displayDateEl = document.getElementById('displayDate');
    if (displayDateEl) displayDateEl.innerText = `${mNames[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
    
    const s = (document.getElementById('searchBox')?.value || "").toLowerCase();
    const c = document.getElementById('courseSelect')?.value || "";

    // Base de datos del mes actual (usada para KPIs y Gráficos)
    const baseFiltered = db.filter(d => {
        const date = new Date(d.fecha + "T00:00:00");
        const matchM = date.getMonth() === viewDate.getMonth() && date.getFullYear() === viewDate.getFullYear();
        return matchM;
    });

    // Filtros de búsqueda y categorías para la TABLA
    const finalFiltered = baseFiltered.filter(d => {
        const matchS = (d.profesor + d.asignatura).toLowerCase().includes(s);
        const matchC = c === "" || d.curso === c;
        
        let matchW = true;
        if(currentWeek > 0) {
            const date = new Date(d.fecha + "T00:00:00");
            const day = date.getDate();
            matchW = (day >= (currentWeek - 1) * 7 + 1 && day <= currentWeek * 7);
        }

        const totalOut = (parseInt(d.chromebooks || 0) + parseInt(d.reemplazo || 0));
        const isDebt = totalOut > parseInt(d.devueltos || 0);
        const isDamaged = d.observacion.toLowerCase().includes("dañada") || d.observacion.toLowerCase().includes("dañado");
        const isLab = d.uso_laboratorio === true || d.uso_laboratorio === "TRUE" || d.uso_laboratorio === "true"
                   || (d.asignatura + d.observacion).toLowerCase().includes("laboratorio");

        let matchMode = true;
        if(filterMode === 'lab') matchMode = isLab;
        else if(filterMode === 'reemp') matchMode = parseInt(d.reemplazo || 0) > 0;
        else if(filterMode === 'ok') matchMode = !isDebt && parseInt(d.devueltos) > 0;
        else if(filterMode === 'debt') matchMode = isDebt && !isDamaged; 
        else if(filterMode === 'damaged') matchMode = isDamaged;

        return matchS && matchC && matchW && matchMode;
    });

    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    const tableEl = document.getElementById('mainTable');

    if (finalFiltered.length === 0) {
        if(tableEl) tableEl.style.display = 'none';
        if(emptyState) emptyState.style.display = 'block';
    } else {
        if(tableEl) tableEl.style.display = 'table';
        if(emptyState) emptyState.style.display = 'none';
        
        // Ordenar por fecha descendente (más reciente primero)
        const sorted = [...finalFiltered].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        // Guardar referencia global para PDF filtrado
        window._lastSortedData = sorted;

        // Contador de registros
        const contadorEl = document.getElementById('recordCount');
        if(contadorEl) contadorEl.textContent = `${sorted.length} registro${sorted.length !== 1 ? 's' : ''}`;

        // Agrupar por día con separadores
        const diasSemana = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
        let lastDay = null;
        const rows = [];
        sorted.forEach(r => {
            const totalOut = parseInt(r.chromebooks) + parseInt(r.reemplazo);
            const isOK = totalOut === parseInt(r.devueltos);
            const isDamaged = r.observacion.toLowerCase().includes("dañada") || r.observacion.toLowerCase().includes("dañado");
            const isLab = r.uso_laboratorio === true || r.uso_laboratorio === "TRUE" || r.uso_laboratorio === "true"
                       || (r.asignatura + r.observacion).toLowerCase().includes("laboratorio");

            // ── Separador de día ──
            if (r.fecha !== lastDay) {
                lastDay = r.fecha;
                const fechaObj = new Date(r.fecha + "T00:00:00");
                const diaNombre = diasSemana[fechaObj.getDay()];
                const fechaFmt = r.fecha.split('-').reverse().slice(0,2).join('/');
                const registrosDia = sorted.filter(x => x.fecha === r.fecha);
                const labsDia = registrosDia.filter(x => x.uso_laboratorio === true || x.uso_laboratorio === "TRUE" || x.uso_laboratorio === "true").length;
                const labBadge = labsDia > 0
                    ? `<span class="ms-2" style="background:#ede7ff;color:#6f42c1;padding:2px 9px;border-radius:20px;font-size:0.68rem;font-weight:800;">🟣 LAB ×${labsDia}</span>`
                    : '';
                rows.push(`<tr class="day-separator-row">
                    <td colspan="10" style="background:linear-gradient(90deg,#f0f4f8,#fafbfc);border-left:4px solid #0d6832;padding:7px 14px;font-size:0.78rem;font-weight:800;color:#2c3e50;letter-spacing:0.5px;text-transform:uppercase;">
                        📅 ${diaNombre} ${fechaFmt}
                        <span style="background:#e8f5e9;color:#0d6832;padding:2px 9px;border-radius:20px;font-size:0.68rem;font-weight:700;margin-left:8px;">${registrosDia.length} registro${registrosDia.length !== 1 ? 's' : ''}</span>
                        ${labBadge}
                    </td>
                </tr>`);
            }

            let rowClass = isDamaged ? "row-damaged" : (isLab ? "row-lab" : (!isOK ? "row-pending" : ""));
            const isPendienteObs = (r.observacion || "").toLowerCase() === "pendiente";
            let estadoTexto = isOK ? 'DEVOLUCIÓN OK' : isPendienteObs ? 'PENDIENTE' : 'ACTIVO';
            let estadoColor = isOK ? '#198754' : isPendienteObs ? '#f9a825' : '#ffc107';
            let estadoTextColor = isOK ? 'white' : isPendienteObs ? '#fff' : '#444';
            if(isDamaged) { estadoTexto = r.observacion; estadoColor = 'var(--danger-red)'; estadoTextColor = 'white'; }

            const badgeLab = isLab
                ? `<span class="badge badge-status me-1" style="background:linear-gradient(135deg,#6f42c1,#9b59b6);color:white;box-shadow:0 2px 6px rgba(111,66,193,0.4);">🟣 LABORATORIO</span>`
                : '';
            const badgeEstado = `<span class="badge badge-status" style="background:${estadoColor};color:${estadoTextColor}">${estadoTexto}</span>`;

            rows.push(`<tr class="${rowClass}">
                <td><span class="text-muted" style="font-size:0.78rem;">${r.fecha.split('-').reverse().slice(0,2).join('/')}</span></td>
                <td><span class="badge bg-light text-dark border" style="font-size:0.78rem;">🕐 ${r.hora}</span></td>
                <td>${r.curso}</td>
                <td>${r.asignatura}${isLab ? ' <span style="color:#6f42c1;font-size:0.7rem;font-weight:700;">[LAB]</span>' : ''}</td>
                <td class="text-start fw-bold" style="color:#2b5797;cursor:pointer;text-decoration:underline dotted;" onclick="verResumenProfesor('${r.profesor}')" title="Ver resumen de ${r.profesor}">${r.profesor}</td>
                <td>${r.chromebooks}</td><td class="text-danger">${r.reemplazo}</td>
                <td class="text-success fw-bold">${r.devueltos}</td>
                <td>${badgeLab}${badgeEstado}</td>
                <td><div class="d-flex justify-content-center gap-1">
                    <button class="btn btn-sm btn-outline-primary border-0" onclick="editItem('${r.id}')" title="Editar">✏️</button>
                    <button class="btn btn-sm btn-outline-danger border-0" onclick="deleteItem('${r.id}')" title="Eliminar">🗑️</button>
                </div></td>
            </tr>`);
        });
        tableBody.innerHTML = rows.join('');
    }

    // Banner de deudas
    const currentDebts = baseFiltered.filter(d => (parseInt(d.chromebooks || 0) + parseInt(d.reemplazo || 0)) > parseInt(d.devueltos || 0) && !d.observacion.toLowerCase().includes("dañada"));
    const banner = document.getElementById('debtBanner');
    if(banner) {
        if(currentDebts.length > 0) {
            banner.style.display = 'block';
            document.getElementById('debtText').innerText = `⚠️ Franco, tienes ${currentDebts.length} préstamos pendientes en ${mNames[viewDate.getMonth()]}.`;
        } else banner.style.display = 'none';
    }

    updateKPIs(baseFiltered);
    updateCharts(baseFiltered); 
}

// 3. KPIs - siempre sobre el mes completo, KPI semana sigue el tab activo
function updateKPIs(base) {
    function animateKPI(id, val) {
        const el = document.getElementById(id);
        if(!el) return;
        el.style.transition = 'opacity 0.2s';
        el.style.opacity = '0';
        setTimeout(() => { el.innerText = val; el.style.opacity = '1'; }, 200);
    }

    // Mes completo independiente del tab de semana activo
    const mesCompleto = db.filter(d => {
        const date = new Date(d.fecha + "T00:00:00");
        return date.getMonth() === viewDate.getMonth() && date.getFullYear() === viewDate.getFullYear();
    });
    const labMes   = mesCompleto.filter(d => d.uso_laboratorio === true || d.uso_laboratorio === "TRUE" || d.uso_laboratorio === "true" || (d.asignatura + d.observacion).toLowerCase().includes("laboratorio")).length;
    const reempMes = mesCompleto.filter(d => parseInt(d.reemplazo || 0) > 0).length;
    const okMes    = mesCompleto.filter(d => (parseInt(d.chromebooks)+parseInt(d.reemplazo)) === parseInt(d.devueltos) && parseInt(d.devueltos) > 0).length;
    const dmgMes   = mesCompleto.filter(d => d.observacion.toLowerCase().includes("dañada") || d.observacion.toLowerCase().includes("dañado")).length;

    animateKPI('kpi-total',   mesCompleto.length);
    animateKPI('kpi-lab',     labMes);
    animateKPI('kpi-reemp',   reempMes);
    animateKPI('kpi-damaged', dmgMes);
    animateKPI('kpi-ok', mesCompleto.length > 0 ? Math.round((okMes / mesCompleto.length) * 100) + "%" : "0%");

    // KPI semana: sigue exactamente el tab activo
    let prestSemana, labelSemTxt;
    if (currentWeek === 0) {
        // "Mes Completo" → semana laboral real (lunes–viernes de hoy)
        const hoyKpi = new Date(); hoyKpi.setHours(0,0,0,0);
        const lunesKpi = new Date(hoyKpi);
        lunesKpi.setDate(hoyKpi.getDate() - ((hoyKpi.getDay() + 6) % 7));
        const viernesKpi = new Date(lunesKpi);
        viernesKpi.setDate(lunesKpi.getDate() + 6); // incluye fin de semana
        prestSemana = mesCompleto.filter(d => {
            const f = new Date(d.fecha + "T00:00:00");
            return f >= lunesKpi && f <= viernesKpi;
        }).length;
        labelSemTxt = `${lunesKpi.getDate()}/${lunesKpi.getMonth()+1} – ${viernesKpi.getDate()}/${viernesKpi.getMonth()+1}`;
    } else {
        // Semana 1–4: días exactos del tab (mismo rango que usa la tabla)
        const diaInicio = (currentWeek - 1) * 7 + 1;
        const diaFin    = currentWeek * 7;
        prestSemana = mesCompleto.filter(d => {
            const dia = new Date(d.fecha + "T00:00:00").getDate();
            return dia >= diaInicio && dia <= diaFin;
        }).length;
        const diasEnMes = new Date(viewDate.getFullYear(), viewDate.getMonth()+1, 0).getDate();
        labelSemTxt = `días ${diaInicio}–${Math.min(diaFin, diasEnMes)}`;
    }
    animateKPI('kpi-semana', prestSemana);
    const labelSemana = document.getElementById('kpiSemanaLabel');
    const glowSemana  = document.getElementById('kpiSemanaGlow');
    if (labelSemana) labelSemana.textContent = labelSemTxt;
    if (glowSemana)  glowSemana.style.display = prestSemana > 0 ? 'block' : 'none';

    // ── Barra de stock en tiempo real ──────────────────────────────────
    // Equipos "en préstamo" = registros ACTIVOS del mes (pendientes de devolución)
    const enUso = base.filter(d => {
        const total = parseInt(d.chromebooks||0) + parseInt(d.reemplazo||0);
        const dev = parseInt(d.devueltos||0);
        const isDmg = (d.observacion||"").toLowerCase().includes("dañ");
        return total > dev && !isDmg;
    }).reduce((sum, d) => {
        return sum + (parseInt(d.chromebooks||0) + parseInt(d.reemplazo||0) - parseInt(d.devueltos||0));
    }, 0);

    const disponible = Math.max(0, STOCK_MAXIMO - enUso);
    const pct = Math.min(100, Math.round((enUso / STOCK_MAXIMO) * 100));

    // Color progresivo: verde → naranja → rojo
    let barColor = 'linear-gradient(90deg, #198754, #28a745)';
    if(pct >= 50 && pct < 80) barColor = 'linear-gradient(90deg, #f39c12, #ffc107)';
    if(pct >= 80) barColor = 'linear-gradient(90deg, #dc3545, #ff6b6b)';

    const barEl = document.getElementById('stock-bar-uso');
    const labelEl = document.getElementById('stock-bar-label');
    const warningEl = document.getElementById('stock-warning');
    const enUsoEl = document.getElementById('stock-en-uso');
    const disponibleEl = document.getElementById('stock-disponible');
    const totalEl = document.getElementById('stock-total');
    const totalLabelEl = document.getElementById('stock-total-label');

    if(barEl) { barEl.style.width = pct + '%'; barEl.style.background = barColor; }
    if(labelEl) labelEl.textContent = enUso > 0 ? `${pct}% en uso` : '';
    if(warningEl) warningEl.style.display = pct >= 85 ? 'block' : 'none';
    if(enUsoEl) enUsoEl.textContent = enUso;
    if(disponibleEl) disponibleEl.textContent = disponible;
    if(totalEl) totalEl.textContent = STOCK_MAXIMO;
    if(totalLabelEl) totalLabelEl.textContent = `${STOCK_MAXIMO} equipos`;
}

// 4. Charts - CORRECCIÓN DE ESCALA Y VISIBILIDAD DE NOMBRES
function updateCharts(base) {
    const dS = {}; 
    base.forEach(d => { 
        let prof = d.profesor ? d.profesor.trim() : "";
        if(prof && prof !== "------") {
            dS[prof] = (dS[prof] || 0) + 1; 
        }
    });

    const sortedLabels = Object.keys(dS).sort();
    const sortedValues = sortedLabels.map(label => dS[label]);

    const ctxDocente = document.getElementById('chartDocente');
    if(ctxDocente) {
        if(charts.D) charts.D.destroy();
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
                plugins: { 
                    legend: { display: false },
                    tooltip: { enabled: true }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1, // SIN DECIMALES
                            precision: 0
                        },
                        title: { display: true, text: 'Cantidad de Préstamos' }
                    },
                    y: {
                        ticks: {
                            autoSkip: false, // MUESTRA TODOS LOS NOMBRES
                            font: { size: 11 }
                        }
                    }
                }
            }
        });
    }

    const cerrados = base.filter(d => getEstado(d) === "CERRADO").length;
const activos = base.filter(d => getEstado(d) === "ACTIVO").length;
const danados = base.filter(d => getEstado(d) === "DAÑADO").length;

const ctxStatus = document.getElementById('chartStatus');
if(ctxStatus) {
    if(charts.S) charts.S.destroy();
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
            plugins: {
                legend: { display: false },
                tooltip: { enabled: true }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

}

// 5. Chart Anual
function renderAnualChart() {
    const usageTotal = new Array(12).fill(0), replacements = new Array(12).fill(0), damaged = new Array(12).fill(0), labs = new Array(12).fill(0);
    
    db.forEach(d => {
        const dt = new Date(d.fecha + "T00:00:00");
        if(dt.getFullYear() === 2026) {
            const m = dt.getMonth();
            usageTotal[m]++;
            if(parseInt(d.reemplazo || 0) > 0) replacements[m]++;
            if(d.observacion.toLowerCase().includes("dañada") || d.observacion.toLowerCase().includes("dañado")) damaged[m]++;
            const esLab = d.uso_laboratorio === true || d.uso_laboratorio === "TRUE" || d.uso_laboratorio === "true"
                          || (d.asignatura + d.observacion).toLowerCase().includes("laboratorio");
            if(esLab) labs[m]++;
        }
    });

    const ctxAnual = document.getElementById('chartAnual');
    if(ctxAnual) {
        if(charts.A) charts.A.destroy();
        charts.A = new Chart(ctxAnual, {
            type: 'line',
            data: {
                labels: mNames.map(m => m.slice(0,3)),
                datasets: [
                    { label: 'Uso Total', data: usageTotal, borderColor: '#0d6832', backgroundColor: '#0d6832', tension: 0.3, fill: false, borderWidth: 3 },
                    { label: 'Uso Laboratorio', data: labs, borderColor: '#6f42c1', backgroundColor: '#6f42c1', tension: 0.3, fill: false, borderWidth: 2 },
                    { label: 'Uso Reemplazos', data: replacements, borderColor: '#f39c12', backgroundColor: '#f39c12', tension: 0.3, fill: false, borderDash: [5, 5] },
                    { label: 'Equipos Dañados', data: damaged, borderColor: '#dc3545', backgroundColor: '#dc3545', tension: 0.3, fill: false, borderWidth: 2 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
        });
    }
}

function moveMonth(n) { viewDate.setMonth(viewDate.getMonth() + n); renderAll(); }
function setFilterWeek(w) { currentWeek = w; document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === w)); renderAll(); }
function setFilterMode(m) { filterMode = m; renderAll(); }
function resetApp() { filterMode = 'all'; currentWeek = 0; document.getElementById('searchBox').value = ''; document.getElementById('courseSelect').value = ''; document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0)); renderAll(); }

function irASemanActual() {
    const hoy = new Date();
    viewDate = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    filterMode = 'all';
    document.getElementById('searchBox').value = '';
    document.getElementById('courseSelect').value = '';
    const dia = hoy.getDate();
    const semana = dia <= 7 ? 1 : dia <= 14 ? 2 : dia <= 21 ? 3 : 4;
    currentWeek = semana;
    document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === semana));
    renderAll();
    setTimeout(() => {
        const tabla = document.getElementById('mainTable');
        if (tabla) tabla.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
}

function openModal() { 
    document.getElementById('resForm').reset(); 
    document.getElementById('fId').value = ''; 
    document.getElementById('resForm').classList.remove('was-validated');
    // Auto-rellenar con la fecha de hoy si no hay draft
    const hoyStr = new Date().toISOString().split('T')[0];
    document.getElementById('fFecha').value = hoyStr;
    document.getElementById('fLab').checked = false;
    loadDraft(); 
    fillDocentes();
    new bootstrap.Modal(document.getElementById('resModal')).show(); 
}

async function saveData() {
    const form = document.getElementById('resForm');
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        Swal.fire('Atención', 'Por favor complete todos los campos requeridos', 'warning');
        return;
    }

    document.getElementById('loading').style.display = 'flex';
    const esLab = document.getElementById('fLab').checked;
    const estado = calcEstado(
        document.getElementById('fChr').value,
        document.getElementById('fRee').value,
        document.getElementById('fDev').value,
        document.getElementById('fObs').value,
        esLab
    );
    const fechaCierre = estado === 'CERRADO' ? new Date().toISOString().slice(0,10) : '';
    const resp = 'Franco San Martín';
    const payload = {
        action: document.getElementById('fId').value ? 'update' : 'create',
        id: document.getElementById('fId').value,
        fecha: document.getElementById('fFecha').value,
        hora: document.getElementById('fHora').value,
        curso: document.getElementById('fCurso').value,
        profesor: document.getElementById('fProfesor').value,
        asignatura: document.getElementById('fAsignatura').value,
        chromebooks: document.getElementById('fChr').value,
        reemplazo: document.getElementById('fRee').value,
        devueltos: document.getElementById('fDev').value,
        observacion: document.getElementById('fObs').value,
        uso_laboratorio: esLab,
        estado_operativo: estado,
        fecha_cierre: fechaCierre,
        responsable_cierre: resp
    };
    try {
        await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
        localStorage.removeItem('franco_draft');
        bootstrap.Modal.getInstance(document.getElementById('resModal')).hide();
        const accion = payload.action === 'create' ? 'creado' : 'actualizado';
        const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
        Toast.fire({ icon: 'success', title: `Registro ${accion} correctamente` });
        load();
    } catch(e) { 
        Swal.fire('Error', 'No se pudo guardar el registro', 'error'); 
        document.getElementById('loading').style.display = 'none';
    }
}

const STOCK_MAXIMO = 115; // ← Cambia este número según tus equipos disponibles

function validateCounts(autoFill) {
    const chr = parseInt(document.getElementById('fChr').value || 0);
    const ree = parseInt(document.getElementById('fRee').value || 0);
    const dev = parseInt(document.getElementById('fDev').value || 0);
    const msg = document.getElementById('valMsg');
    const msgStock = document.getElementById('valMsgStock');
    const devInput = document.getElementById('fDev');

    // Auto-completar devueltos si está en 0 y se llama desde chr/ree
    if(autoFill && dev === 0 && (chr + ree) > 0) {
        devInput.value = chr + ree;
    }

    const devFinal = parseInt(devInput.value || 0);
    if(devFinal !== (chr + ree)) {
        msg.style.display = 'block';
        devInput.classList.add('val-warning');
    } else {
        msg.style.display = 'none';
        devInput.classList.remove('val-warning');
    }

    // Alerta stock máximo
    const total = chr + ree;
    if(msgStock) {
        if(total > STOCK_MAXIMO) {
            msgStock.style.display = 'block';
            msgStock.textContent = `⚠️ Supera el stock disponible (máx. ${STOCK_MAXIMO} equipos)`;
        } else {
            msgStock.style.display = 'none';
        }
    }

    saveDraft();
}

function editItem(id) {
    const r = db.find(x => x.id.toString() === id.toString());
    document.getElementById('fId').value = r.id;
    document.getElementById('fFecha').value = r.fecha;
    document.getElementById('fHora').value = r.hora;
    document.getElementById('fCurso').value = r.curso;
    document.getElementById('fProfesor').value = r.profesor;
    document.getElementById('fAsignatura').value = r.asignatura;
    document.getElementById('fChr').value = r.chromebooks;
    document.getElementById('fRee').value = r.reemplazo;
    document.getElementById('fDev').value = r.devueltos;
    document.getElementById('fObs').value = r.observacion;
    // Cargar estado de laboratorio
    const labVal = r.uso_laboratorio === true || r.uso_laboratorio === "TRUE" || r.uso_laboratorio === "true"
                 || (r.observacion || "").toLowerCase().includes("laboratorio");
    document.getElementById('fLab').checked = labVal;
    validateCounts();
    new bootstrap.Modal(document.getElementById('resModal')).show();
}

function saveDraft() {
    if(document.getElementById('fId').value !== "") return;
    const draft = { fecha: document.getElementById('fFecha').value, hora: document.getElementById('fHora').value, curso: document.getElementById('fCurso').value, profesor: document.getElementById('fProfesor').value, asignatura: document.getElementById('fAsignatura').value, obs: document.getElementById('fObs').value, lab: document.getElementById('fLab').checked };
    localStorage.setItem('franco_draft', JSON.stringify(draft));
}

function loadDraft() {
    const saved = localStorage.getItem('franco_draft');
    if(saved) {
        const d = JSON.parse(saved);
        document.getElementById('fFecha').value = d.fecha; document.getElementById('fHora').value = d.hora; document.getElementById('fCurso').value = d.curso; document.getElementById('fProfesor').value = d.profesor; document.getElementById('fAsignatura').value = d.asignatura; document.getElementById('fObs').value = d.obs; if(d.lab !== undefined) document.getElementById('fLab').checked = d.lab;
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
        document.getElementById('loading').style.display = 'flex';
        try {
            await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', id: id }) });
            load();
            Swal.fire('Eliminado', 'El registro ha sido eliminado.', 'success');
        } catch(e) { 
            Swal.fire('Error', 'No se pudo eliminar.', 'error');
            document.getElementById('loading').style.display = 'none'; 
        }
    }
}

function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const mesActual = mNames[viewDate.getMonth()];
    const anioActual = viewDate.getFullYear();
    const logoUrl = "https://i.postimg.cc/sxxwfhwK/LOGO-LBSNG-06-237x300.png";
    
    const mesData = db.filter(d => {
        const date = new Date(d.fecha + "T00:00:00");
        return date.getMonth() === viewDate.getMonth() && date.getFullYear() === viewDate.getFullYear();
    });

    doc.setFillColor(0, 51, 102); 
    doc.rect(0, 0, 210, 40, 'F');
    
    const img = new Image();
    img.src = logoUrl;
    img.onload = function() {
        doc.addImage(img, 'PNG', 165, 5, 25, 30);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.text("GESTIÓN CHROMEBOOKS 2026", 14, 25);
        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.text(`REPORTE MENSUAL: ${mesActual.toUpperCase()} ${anioActual}`, 14, 33);
        
        doc.setTextColor(44, 62, 80);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Resumen Estadístico", 14, 55);
        
        const total = mesData.length;
        const ok = mesData.filter(d => (parseInt(d.chromebooks)+parseInt(d.reemplazo)) === parseInt(d.devueltos)).length;
        const dmg = mesData.filter(d => d.estado_operativo==='DAÑADO').length;
        const activos=mesData.filter(d=>d.estado_operativo==='ACTIVO').length;

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Total de Préstamos: ${total}`, 14, 65);
        doc.text(`Devoluciones Completas: ${ok}`, 14, 72);
        doc.text(`Equipos con Daños: ${dmg}`, 14, 79);
        doc.text(`Préstamos Activos: ${activos}`,14,86);
        doc.text(`Tasa de Retorno: ${total > 0 ? Math.round((ok/total)*100) : 0}%`, 130, 65);
        doc.text(`Generado por: Franco (Tec. Informático)`, 130, 72);
        doc.text(`Fecha emisión: ${new Date().toLocaleDateString()}`, 130, 79);

        const chartCanvas = document.getElementById('chartStatus');
        const chartImg = chartCanvas.toDataURL("image/png", 1.0);
        doc.text("Distribución de Estado", 140, 95);
        doc.addImage(chartImg, 'PNG', 140, 100, 50, 50);

        const docentesMap = {}; 
        mesData.forEach(d => { docentesMap[d.profesor] = (docentesMap[d.profesor] || 0) + 1; });
        const topDocentes = Object.entries(docentesMap).sort((a, b) => b[1] - a[1]).slice(0, 15);

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Uso por Docente (Top 15)", 14, 95);

        doc.autoTable({
            startY: 100,
            head: [['#', 'Docente Responsable', 'Préstamos']],
            body: topDocentes.map((d, i) => [i + 1, d[0], d[1]]),
            headStyles: { fillColor: [0, 51, 102], fontSize: 11 },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            margin: { right: 80 }
        });

        const pageCount = doc.internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(9);
            doc.setTextColor(150);
            doc.text("Este documento es un reporte oficial del área de Informática NSG.", 14, 285);
            doc.text(`Página ${i} de ${pageCount}`, 180, 285);
        }
        doc.save(`Reporte_Franco_${mesActual}.pdf`);
    };
}

function exportToCSV() {
    const mesActual = mNames[viewDate.getMonth()];
    const rows = [['ID', 'Fecha', 'Hora', 'Curso', 'Asignatura', 'Profesor', 'Chromebooks', 'Reemplazos', 'Devueltos', 'Observacion']];
    const csvData = db.filter(d => {
        const date = new Date(d.fecha + "T00:00:00");
        return date.getMonth() === viewDate.getMonth() && date.getFullYear() === viewDate.getFullYear();
    });

    if(csvData.length === 0) {
        Swal.fire('Sin datos', 'No hay registros en este mes para exportar', 'info');
        return;
    }

    csvData.forEach(r => {
        rows.push([r.id, r.fecha, r.hora, r.curso, r.asignatura, r.profesor, r.chromebooks, r.reemplazo, r.devueltos, `"${r.observacion}"`]);
    });

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Data_Chromebooks_${mesActual}_2026.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}



// ── MEJORA 3: PDF desde tabla visible ──────────────────────────────────
function generatePDFFiltrado() {
    const datos = window._lastSortedData || [];
    if(!datos || datos.length === 0) {
        Swal.fire('Sin datos', 'No hay registros visibles para exportar.', 'info');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });
    const mesActual = mNames[viewDate.getMonth()];
    const anioActual = viewDate.getFullYear();
    const ahora = new Date().toLocaleDateString('es-CL');
    const logoUrl = "https://i.postimg.cc/sxxwfhwK/LOGO-LBSNG-06-237x300.png";

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = logoUrl;

    const buildPDF = () => {
        // Header
        doc.setFillColor(0, 51, 102);
        doc.rect(0, 0, 297, 28, 'F');
        try { doc.addImage(img, 'PNG', 268, 2, 16, 22); } catch(e) {}
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16); doc.setFont("helvetica", "bold");
        doc.text("GESTIÓN CHROMEBOOKS 2026 – NSG", 10, 13);
        doc.setFontSize(9); doc.setFont("helvetica", "normal");
        doc.text(`Reporte filtrado: ${mesActual} ${anioActual}  |  Generado: ${ahora}  |  ${datos.length} registros`, 10, 22);

        // Tabla
        const body = datos.map(r => {
            const isLab = r.uso_laboratorio === true || r.uso_laboratorio === "TRUE" || r.uso_laboratorio === "true";
            const isDamaged = (r.observacion||"").toLowerCase().includes("dañ");
            const totalOut = parseInt(r.chromebooks||0) + parseInt(r.reemplazo||0);
            const isOK = totalOut === parseInt(r.devueltos||0);
            let estado = isOK ? 'DEVOLUCIÓN OK' : 'PENDIENTE';
            if(isDamaged) estado = r.observacion;
            if(isLab) estado = (isLab ? '🟣 LAB | ' : '') + estado;
            return [
                r.fecha.split('-').reverse().slice(0,2).join('/'),
                r.hora,
                r.curso,
                r.asignatura,
                r.profesor,
                r.chromebooks,
                r.reemplazo,
                r.devueltos,
                estado
            ];
        });

        doc.autoTable({
            startY: 32,
            head: [['Fecha','Bloque','Curso','Asignatura','Profesor','Chr.','Ree.','Dev.','Estado/Obs']],
            body: body,
            headStyles: { fillColor: [13, 104, 50], fontSize: 8, fontStyle: 'bold', textColor: 255 },
            bodyStyles: { fontSize: 7.5 },
            alternateRowStyles: { fillColor: [245, 250, 247] },
            columnStyles: {
                0: { cellWidth: 18 }, 1: { cellWidth: 16 }, 2: { cellWidth: 20 },
                3: { cellWidth: 32 }, 4: { cellWidth: 48 },
                5: { cellWidth: 12, halign: 'center' }, 6: { cellWidth: 12, halign: 'center' },
                7: { cellWidth: 12, halign: 'center' }, 8: { cellWidth: 'auto' }
            },
            didParseCell: (data) => {
                if(data.section === 'body') {
                    const row = datos[data.row.index];
                    const isDmg = (row.observacion||"").toLowerCase().includes("dañ");
                    const isLb = row.uso_laboratorio === true || row.uso_laboratorio === "TRUE" || row.uso_laboratorio === "true";
                    const tot = parseInt(row.chromebooks||0) + parseInt(row.reemplazo||0);
                    const ok = tot === parseInt(row.devueltos||0);
                    if(isDmg) data.cell.styles.fillColor = [255, 235, 235];
                    else if(isLb) data.cell.styles.fillColor = [243, 238, 255];
                    else if(!ok) data.cell.styles.fillColor = [255, 251, 230];
                }
            }
        });

        // Footer
        const pageCount = doc.internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8); doc.setTextColor(160);
            doc.text("Área de Informática – Responsable: Franco San Martín – NSG 2026", 10, 203);
            doc.text(`Página ${i} de ${pageCount}`, 270, 203);
        }

        doc.save(`Reporte_Filtrado_${mesActual}_${anioActual}.pdf`);
    };

    img.onload = buildPDF;
    img.onerror = buildPDF; // si no carga el logo, igual genera el PDF
}

// ── MEJORA 1: Resumen rápido por profesor ──────────────────────────────
function verResumenProfesor(nombre) {
    const registros = db.filter(d => d.profesor === nombre);
    if(registros.length === 0) return;

    const total = registros.length;
    const ok = registros.filter(d => (parseInt(d.chromebooks)+parseInt(d.reemplazo)) === parseInt(d.devueltos) && parseInt(d.devueltos) > 0).length;
    const pendientes = registros.filter(d => (parseInt(d.chromebooks||0)+parseInt(d.reemplazo||0)) > parseInt(d.devueltos||0) && !d.observacion.toLowerCase().includes("dañ")).length;
    const dañados = registros.filter(d => d.observacion.toLowerCase().includes("dañada") || d.observacion.toLowerCase().includes("dañado")).length;
    const labs = registros.filter(d => d.uso_laboratorio === true || d.uso_laboratorio === "TRUE" || d.uso_laboratorio === "true").length;
    const tasa = total > 0 ? Math.round((ok / total) * 100) : 0;
    const totalChr = registros.reduce((s,d) => s + parseInt(d.chromebooks||0), 0);
    const totalRee = registros.reduce((s,d) => s + parseInt(d.reemplazo||0), 0);

    // Últimos 3 registros
    const ultimos = [...registros].sort((a,b) => new Date(b.fecha) - new Date(a.fecha)).slice(0,3);
    const ultimosHTML = ultimos.map(r => {
        const f = r.fecha.split('-').reverse().slice(0,2).join('/');
        return `<tr><td>${f}</td><td>${r.curso}</td><td>${r.asignatura}</td><td>${r.chromebooks}</td></tr>`;
    }).join('');

    Swal.fire({
        title: `<span style="color:#2b5797">👤 ${nombre}</span>`,
        html: `
        <div style="text-align:left; font-size:0.9rem;">
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:15px;">
                <div style="background:#f0fff4; border-radius:8px; padding:10px; text-align:center;">
                    <div style="font-size:1.6rem; font-weight:900; color:#0d6832">${total}</div>
                    <div style="font-size:0.72rem; color:#666; font-weight:600">PRÉSTAMOS</div>
                </div>
                <div style="background:#fff8f0; border-radius:8px; padding:10px; text-align:center;">
                    <div style="font-size:1.6rem; font-weight:900; color:#f39c12">${pendientes}</div>
                    <div style="font-size:0.72rem; color:#666; font-weight:600">PENDIENTES</div>
                </div>
                <div style="background:#f8f0ff; border-radius:8px; padding:10px; text-align:center;">
                    <div style="font-size:1.6rem; font-weight:900; color:#6f42c1">${labs}</div>
                    <div style="font-size:0.72rem; color:#666; font-weight:600">LABORATORIO</div>
                </div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:15px;">
                <div style="background:#f0f4ff; border-radius:8px; padding:10px; text-align:center;">
                    <div style="font-size:1.4rem; font-weight:900; color:#2b5797">${tasa}%</div>
                    <div style="font-size:0.72rem; color:#666; font-weight:600">TASA RETORNO</div>
                </div>
                <div style="background:#f5f5f5; border-radius:8px; padding:10px; text-align:center;">
                    <div style="font-size:1.4rem; font-weight:900; color:#333">${totalChr}</div>
                    <div style="font-size:0.72rem; color:#666; font-weight:600">CHR. TOTALES</div>
                </div>
                <div style="background:#fff5f5; border-radius:8px; padding:10px; text-align:center;">
                    <div style="font-size:1.4rem; font-weight:900; color:#d32f2f">${dañados}</div>
                    <div style="font-size:0.72rem; color:#666; font-weight:600">CON DAÑOS</div>
                </div>
            </div>
            <div style="font-weight:700; color:#555; font-size:0.8rem; margin-bottom:6px;">ÚLTIMOS REGISTROS</div>
            <table style="width:100%; font-size:0.8rem; border-collapse:collapse;">
                <thead><tr style="background:#f8f9fa; color:#555;">
                    <th style="padding:5px 8px; text-align:left;">Fecha</th>
                    <th style="padding:5px 8px;">Curso</th>
                    <th style="padding:5px 8px;">Asignatura</th>
                    <th style="padding:5px 8px;">Chr.</th>
                </tr></thead>
                <tbody>${ultimosHTML}</tbody>
            </table>
        </div>`,
        showConfirmButton: false,
        showCloseButton: true,
        width: 520,
        customClass: { popup: 'shadow-lg' }
    });
}

window.onload = load;
