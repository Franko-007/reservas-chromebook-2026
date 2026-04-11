function getEstado(r) {
    const obs = (r.observacion || "").toLowerCase();
    const chr = parseInt(r.chromebooks || 0);
    const ree = parseInt(r.reemplazo || 0);
    const dev = parseInt(r.devueltos || 0);

    // Laboratorio: campo dedicado o legado en observacion
    if (r.uso_laboratorio === true || r.uso_laboratorio === "TRUE" || r.uso_laboratorio === "true" || obs.includes("laboratorio")) return "LABORATORIO";
    if (obs.includes("dañ")) return "DAÑADO";
    if ((chr + ree) > dev) return "ACTIVO";
    return "CERRADO";
}

function calcEstado(chr,ree,dev,obs,lab){
 obs=(obs||"").toLowerCase();
 if(lab) return "LABORATORIO";
 if(obs.includes("dañ")) return "DAÑADO";
 if((parseInt(chr||0)+parseInt(ree||0))>parseInt(dev||0)) return "ACTIVO";
 return "CERRADO";
}
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxN2XQAMGfzqDHYkAdfdPrkQ6d6Mni72WRZajuQyyewjDhVAdemvVuUrN0SUY54x_o/exec";
// Inicializar con la fecha actual
const _hoy = new Date();
const _diaHoy = _hoy.getDate();
const _semanaInicial = _diaHoy <= 7 ? 1 : _diaHoy <= 14 ? 2 : _diaHoy <= 21 ? 3 : 4;
let db = [], viewDate = new Date(_hoy.getFullYear(), _hoy.getMonth(), 1), filterMode = 'all', currentWeek = _semanaInicial, charts = {};
const mNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const DOCENTES_NSG = ["ALEXIS CORTÉS","ALLYSON RIOS","ANA OGAZ","ANDREA SALAZAR","ANDREA DONOSO","AVIGUEY GONZALEZ","CAMILA GONZÁLEZ","CARLA MERA","CARLOS ARAYA","CARMEN ÁLVAREZ","CAROLINA MIRANDA","CAROLINA REYES","CECILIA GARCÍA","CLAUDIA TOLEDO","CONSTANZA LÓPEZ","DANIEL VITTA","DANIELA VERA","DANIELA VALENZUELA","DEBORA GAETE","DEBORA GONZÁLEZ","ELIZABETH MIRANDA","ERIKA KINDERMANN","FERNANDA RÍOS","FRANCISCA MAUREIRA","FRANCISCA COFRÉ","FRANCISCA VIZCAYA","GIOVANNA ARIAS","GOLDIE FARÍAS","HERNÁN REYES","JAVIERA ALIAGA","JOAQUÍN ALMUNA","KARIMME GUTIÉRREZ","KARINA BARRIOS","KAROLINA RIFFO","LEONARDO RÍOS","LORENA ARANCIBIA","LUIS SÁNCHEZ","MACARENA BELTRÁN","MARÍA MONZÓN","MARÍA GONZÁLEZ","MARISOL GUAJARDO","MATÍAS CUEVAS","NATALIA CARTES","NATALY HIDALGO","NICOLE BELLO","PAOLA ÁVILA","PATRICIA NÚÑEZ","PAULINA ARGOMEDO","PRISCILA VALENZUELA","REINA ORTEGA","STEPHANY GUZMÁN","VÍCTOR BARRIENTOS","YADIA CERDA","YESSENIA SÁNCHEZ"];

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
        const isDamaged = d.observacion.toLowerCase().includes("dañ");
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
            const isDamaged = r.observacion.toLowerCase().includes("dañ");
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
                    <td colspan="10" style="background:#4a4a4a;border-left:5px solid #222;border-top:1px solid #333;border-bottom:1px solid #333;padding:8px 16px;font-size:0.78rem;font-weight:800;color:#f0f0f0;letter-spacing:0.8px;text-transform:uppercase;">
                        <span style="display:inline-flex;align-items:center;gap:8px;">
                            <span style="background:#222;color:white;border-radius:6px;padding:2px 9px;font-size:0.7rem;font-weight:900;letter-spacing:0.5px;">📅 ${diaNombre}</span>
                            <span style="color:#f0f0f0;font-weight:900;">${fechaFmt}</span>
                            <span style="background:#666;color:#f0f0f0;border:1px solid #555;padding:2px 9px;border-radius:20px;font-size:0.68rem;font-weight:700;">${registrosDia.length} registro${registrosDia.length !== 1 ? 's' : ''}</span>
                            ${labBadge}
                        </span>
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
                <td class="text-start fw-bold" style="color:#333;">${r.profesor}</td>
                <td>${r.chromebooks}</td>
                <td class="text-danger fw-bold">${r.reemplazo}</td>
                <td class="text-success fw-bold">${r.devueltos}</td>
                <td>
                    ${badgeLab}
                    ${(parseInt(r.reemplazo||0) > 0 && r.nro_equipo_reemplazo) ? `<span class="badge badge-status me-1" style="background:linear-gradient(135deg,#b71c1c,#e53935);color:white;box-shadow:0 2px 5px rgba(183,28,28,0.35);">📦 ${r.nro_equipo_reemplazo}</span>` : ''}
                    ${badgeEstado}
                </td>
                <td><div class="d-flex justify-content-center gap-1">
                    <button class="btn btn-sm btn-outline-primary border-0" onclick="editItem('${r.id}')" title="Editar">✏️</button>
                    <button class="btn btn-sm btn-outline-danger border-0" onclick="deleteItem('${r.id}')" title="Eliminar">🗑️</button>
                </div></td>
            </tr>`);
        });
        tableBody.innerHTML = rows.join('');
    }

    // Banner de deudas
    const currentDebts = baseFiltered.filter(d => (parseInt(d.chromebooks || 0) + parseInt(d.reemplazo || 0)) > parseInt(d.devueltos || 0) && !d.observacion.toLowerCase().includes("dañ"));
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

// 3. KPIs con tendencias y mini-barras
function updateKPIs(base) {
    function animateKPI(id, val) {
        const el = document.getElementById(id);
        if(!el) return;
        el.style.transition = 'opacity 0.2s';
        el.style.opacity = '0';
        setTimeout(() => { el.innerText = val; el.style.opacity = '1'; }, 200);
    }

    function setTrend(id, curr, prev, invertido, unit) {
        const el = document.getElementById(id);
        if(!el) return;
        if(prev === 0 && curr === 0) { el.className='kpi-trend neu'; el.textContent='sin datos previos'; return; }
        if(prev === 0) { el.className='kpi-trend neu'; el.textContent='primer mes'; return; }
        const diff = curr - prev;
        if(diff === 0) { el.className='kpi-trend neu'; el.textContent='sin cambio'; return; }
        const sube = diff > 0;
        const bueno = invertido ? !sube : sube;
        el.className = 'kpi-trend ' + (bueno ? 'up' : 'down');
        el.textContent = (sube ? '▲ ' : '▼ ') + Math.abs(diff) + (unit||'') + ' vs mes ant.';
    }

    function setBar(id, val, max, color) {
        const el = document.getElementById(id);
        if(!el) return;
        const pct = max > 0 ? Math.min(100, Math.round((val/max)*100)) : 0;
        el.style.width = pct + '%';
        el.style.background = color;
    }

    const mesCompleto = db.filter(d => {
        const date = new Date(d.fecha + "T00:00:00");
        return date.getMonth() === viewDate.getMonth() && date.getFullYear() === viewDate.getFullYear();
    });

    const mAntDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    const mesAnterior = db.filter(d => {
        const date = new Date(d.fecha + "T00:00:00");
        return date.getMonth() === mAntDate.getMonth() && date.getFullYear() === mAntDate.getFullYear();
    });

    const labMes   = mesCompleto.filter(d => d.uso_laboratorio === true || d.uso_laboratorio === "TRUE" || d.uso_laboratorio === "true" || (d.asignatura + d.observacion).toLowerCase().includes("laboratorio")).length;
    const reempMes = mesCompleto.filter(d => parseInt(d.reemplazo || 0) > 0).length;
    const okMes    = mesCompleto.filter(d => (parseInt(d.chromebooks)+parseInt(d.reemplazo)) === parseInt(d.devueltos) && parseInt(d.devueltos) > 0).length;
    const dmgMes   = mesCompleto.filter(d => d.observacion.toLowerCase().includes("dañ")).length;
    const tasaOk   = mesCompleto.length > 0 ? Math.round((okMes / mesCompleto.length) * 100) : 0;

    const labAnt    = mesAnterior.filter(d => d.uso_laboratorio === true || d.uso_laboratorio === "TRUE" || d.uso_laboratorio === "true").length;
    const reempAnt  = mesAnterior.filter(d => parseInt(d.reemplazo || 0) > 0).length;
    const okAnt     = mesAnterior.filter(d => (parseInt(d.chromebooks)+parseInt(d.reemplazo)) === parseInt(d.devueltos) && parseInt(d.devueltos) > 0).length;
    const dmgAnt    = mesAnterior.filter(d => d.observacion.toLowerCase().includes("dañ")).length;
    const tasaOkAnt = mesAnterior.length > 0 ? Math.round((okAnt / mesAnterior.length) * 100) : 0;

    animateKPI('kpi-total',   mesCompleto.length);
    animateKPI('kpi-lab',     labMes);
    animateKPI('kpi-reemp',   reempMes);
    animateKPI('kpi-damaged', dmgMes);
    animateKPI('kpi-ok',      tasaOk + "%");



    const maxRef = Math.max(mesCompleto.length, 1);
    setBar('kpi-total-bar',   mesCompleto.length, maxRef, '#107c41');
    setBar('kpi-lab-bar',     labMes,   maxRef, '#6f42c1');
    setBar('kpi-reemp-bar',   reempMes, maxRef, '#dc3545');
    setBar('kpi-damaged-bar', dmgMes,   maxRef, '#d32f2f');
    setBar('kpi-ok-bar',      tasaOk,   100,    '#198754');

    // Panel de alertas pendientes
    renderAlertasPanel(mesCompleto);

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
    // Separar chromebooks regulares de equipos de reemplazo
    const enUsoChr = base.filter(d => {
        const chr = parseInt(d.chromebooks||0);
        const dev = parseInt(d.devueltos||0);
        const ree = parseInt(d.reemplazo||0);
        const isDmg = (d.observacion||"").toLowerCase().includes("dañ");
        return (chr + ree) > dev && !isDmg;
    }).reduce((sum, d) => {
        // Solo contar chromebooks regulares en la barra principal
        const chr = parseInt(d.chromebooks||0);
        const dev = parseInt(d.devueltos||0);
        const ree = parseInt(d.reemplazo||0);
        const pendiente = Math.max(0, chr + ree - dev);
        return sum + Math.min(chr, pendiente); // solo los chr, no los de reemplazo
    }, 0);

    const enUsoRee = base.filter(d => {
        const ree = parseInt(d.reemplazo||0);
        const dev = parseInt(d.devueltos||0);
        const chr = parseInt(d.chromebooks||0);
        const isDmg = (d.observacion||"").toLowerCase().includes("dañ");
        return ree > 0 && (chr + ree) > dev && !isDmg;
    }).reduce((sum, d) => sum + parseInt(d.reemplazo||0), 0);

    const enUso = enUsoChr; // la barra solo refleja chromebooks regulares
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
    if(enUsoEl) enUsoEl.textContent = enUso + (enUsoRee > 0 ? ` (+${enUsoRee} reemplazo)` : '');
    if(disponibleEl) disponibleEl.textContent = disponible;
    if(totalEl) totalEl.textContent = `${STOCK_MAXIMO} + ${STOCK_REEMPLAZO}`;
    if(totalLabelEl) totalLabelEl.textContent = `${STOCK_MAXIMO} Chromebooks · ${STOCK_REEMPLAZO} Reemplazos`;
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
            if(d.observacion.toLowerCase().includes("dañ")) damaged[m]++;
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

function showPage(page) {
    const pageReg  = document.getElementById('pageRegistros');
    const pageStat = document.getElementById('pageStats');
    const btnReg   = document.getElementById('btnPageRegistros');
    const btnStat  = document.getElementById('btnPageStats');

    if (page === 'stats') {
        pageReg.style.display  = 'none';
        pageStat.style.display = 'block';
        btnReg.style.background  = 'white';
        btnReg.style.color       = '#555';
        btnReg.style.border      = '1.5px solid #ddd';
        btnStat.style.background = '#0d6832';
        btnStat.style.color      = 'white';
        btnStat.style.border     = '1.5px solid #0d6832';
        // Forzar resize de Chart.js para que dibuje correctamente en el nuevo contenedor visible
        setTimeout(() => { Object.values(charts).forEach(c => { if(c) c.resize(); }); }, 50);
    } else {
        pageStat.style.display = 'none';
        pageReg.style.display  = 'block';
        btnStat.style.background = 'white';
        btnStat.style.color      = '#555';
        btnStat.style.border     = '1.5px solid #ddd';
        btnReg.style.background  = '#0d6832';
        btnReg.style.color       = 'white';
        btnReg.style.border      = '1.5px solid #0d6832';
    }
}

function toggleNroEquipo() {
    const ree = parseInt(document.getElementById('fRee').value || 0);
    const wrapper = document.getElementById('nroEquipoWrapper');
    if(wrapper) wrapper.style.display = ree > 0 ? 'block' : 'none';
}

function onEstadoDevChange() {
    const val = document.querySelector('input[name="fEstadoDev"]:checked')?.value || '';
    const tipoDanioWrapper = document.getElementById('tipoDanioWrapper');
    if(tipoDanioWrapper) tipoDanioWrapper.style.display = val === 'danio' ? 'block' : 'none';
    saveDraft();
}

function openModal() { 
    document.getElementById('resForm').reset(); 
    document.getElementById('fId').value = ''; 
    document.getElementById('resForm').classList.remove('was-validated');
    // Auto-rellenar con la fecha de hoy si no hay draft
    const hoyStr = new Date().toISOString().split('T')[0];
    document.getElementById('fFecha').value = hoyStr;
    document.getElementById('fLab').checked = false;
    // Reset nuevos campos
    document.querySelectorAll('input[name="fEstadoDev"]').forEach(r => r.checked = false);
    document.querySelectorAll('input[name="fNroEquipo"]').forEach(r => r.checked = false);
    const tipoDanioWrapper = document.getElementById('tipoDanioWrapper');
    if(tipoDanioWrapper) tipoDanioWrapper.style.display = 'none';
    const nroEquipoWrapper = document.getElementById('nroEquipoWrapper');
    if(nroEquipoWrapper) nroEquipoWrapper.style.display = 'none';
    if(document.getElementById('fTipoDanio')) document.getElementById('fTipoDanio').value = '';
    loadDraft(); 
    fillDocentes();
    wizardGoTo(1);
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

    // Resolver observacion desde el nuevo estado de devolución
    const estadoDevSeleccionado = document.querySelector('input[name="fEstadoDev"]:checked')?.value || '';
    let obsValue = '';
    if (estadoDevSeleccionado === 'ok') {
        obsValue = 'Sin novedad';
    } else if (estadoDevSeleccionado === 'pendiente') {
        obsValue = 'Pendiente';
    } else if (estadoDevSeleccionado === 'danio') {
        const tipoDanio = (document.getElementById('fTipoDanio')?.value || '').trim();
        obsValue = tipoDanio || 'Dañado';
    } else {
        // Si no se seleccionó nada, usar el valor del fObs legacy (edición)
        obsValue = document.getElementById('fObs')?.value || 'Pendiente';
    }

    const estado = calcEstado(
        document.getElementById('fChr').value,
        document.getElementById('fRee').value,
        document.getElementById('fDev').value,
        obsValue,
        esLab
    );
    const fechaCierre = estado === 'CERRADO' ? new Date().toISOString().slice(0,10) : '';
    const resp = 'Franco San Martín';
    const nroEquipo = document.querySelector('input[name="fNroEquipo"]:checked')?.value || '';
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
        observacion: obsValue,
        nro_equipo_reemplazo: nroEquipo,
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

const STOCK_MAXIMO = 115;      // Chromebooks regulares
const STOCK_REEMPLAZO = 4;     // Equipos de reemplazo (no cuentan en el stock principal)

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
    fillDocentes();
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

    // Cargar N° equipo de reemplazo
    const nroEquipoWrapper = document.getElementById('nroEquipoWrapper');
    const ree = parseInt(r.reemplazo || 0);
    if(nroEquipoWrapper) nroEquipoWrapper.style.display = ree > 0 ? 'block' : 'none';
    document.querySelectorAll('input[name="fNroEquipo"]').forEach(rb => rb.checked = false);
    if(r.nro_equipo_reemplazo) {
        const rbEq = document.querySelector(`input[name="fNroEquipo"][value="${r.nro_equipo_reemplazo}"]`);
        if(rbEq) rbEq.checked = true;
    }

    // Cargar estado de devolución
    const obs = (r.observacion || "").toLowerCase();
    const tipoDanioWrapper = document.getElementById('tipoDanioWrapper');
    document.querySelectorAll('input[name="fEstadoDev"]').forEach(rb => rb.checked = false);
    if(obs === 'sin novedad' || obs === '') {
        const edOk = document.getElementById('edOk');
        if(edOk) edOk.checked = true;
        if(tipoDanioWrapper) tipoDanioWrapper.style.display = 'none';
    } else if(obs === 'pendiente') {
        const edPend = document.getElementById('edPendiente');
        if(edPend) edPend.checked = true;
        if(tipoDanioWrapper) tipoDanioWrapper.style.display = 'none';
    } else if(obs.includes('dañ') || obs.includes('falla') || obs.includes('no enciende')) {
        const edDanio = document.getElementById('edDanio');
        if(edDanio) edDanio.checked = true;
        if(tipoDanioWrapper) tipoDanioWrapper.style.display = 'block';
        const fTipoDanio = document.getElementById('fTipoDanio');
        if(fTipoDanio) fTipoDanio.value = r.observacion;
    }

    validateCounts();
    wizardGoTo(2); // En edición, saltar directo a equipos
    new bootstrap.Modal(document.getElementById('resModal')).show();
}

function saveDraft() {
    if(document.getElementById('fId').value !== "") return;
    const estadoDev = document.querySelector('input[name="fEstadoDev"]:checked')?.value || '';
    const nroEquipo = document.querySelector('input[name="fNroEquipo"]:checked')?.value || '';
    const draft = { 
        fecha: document.getElementById('fFecha').value, 
        hora: document.getElementById('fHora').value, 
        curso: document.getElementById('fCurso').value, 
        profesor: document.getElementById('fProfesor').value, 
        asignatura: document.getElementById('fAsignatura').value, 
        obs: document.getElementById('fObs').value, 
        lab: document.getElementById('fLab').checked,
        nroEquipo: nroEquipo,
        estadoDev: estadoDev,
        tipoDanio: document.getElementById('fTipoDanio')?.value || ''
    };
    localStorage.setItem('franco_draft', JSON.stringify(draft));
}

function loadDraft() {
    const saved = localStorage.getItem('franco_draft');
    if(saved) {
        const d = JSON.parse(saved);
        document.getElementById('fFecha').value = d.fecha; 
        document.getElementById('fHora').value = d.hora; 
        document.getElementById('fCurso').value = d.curso; 
        document.getElementById('fProfesor').value = d.profesor; 
        document.getElementById('fAsignatura').value = d.asignatura; 
        document.getElementById('fObs').value = d.obs; 
        if(d.lab !== undefined) document.getElementById('fLab').checked = d.lab;
        if(d.nroEquipo) {
            const rb = document.querySelector(`input[name="fNroEquipo"][value="${d.nroEquipo}"]`);
            if(rb) rb.checked = true;
            toggleNroEquipo();
        }
        if(d.estadoDev) {
            const rb = document.querySelector(`input[name="fEstadoDev"][value="${d.estadoDev}"]`);
            if(rb) { rb.checked = true; onEstadoDevChange(); }
        }
        if(d.tipoDanio && document.getElementById('fTipoDanio')) {
            document.getElementById('fTipoDanio').value = d.tipoDanio;
        }
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
    const fechaEmision = new Date().toLocaleDateString('es-CL');
    
    const mesData = db.filter(d => {
        const date = new Date(d.fecha + "T00:00:00");
        return date.getMonth() === viewDate.getMonth() && date.getFullYear() === viewDate.getFullYear();
    });

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = logoUrl;

    const buildPDF = () => {
        const pageStats = document.getElementById('pageStats');
        const pageReg   = document.getElementById('pageRegistros');

        const restorePages = () => {
            if(pageStats) pageStats.style.display = 'none';
            if(pageReg)   pageReg.style.display   = 'block';
            // Volver al estado correcto del botón
            const btnStat = document.getElementById('btnPageStats');
            const btnReg  = document.getElementById('btnPageRegistros');
            if(btnStat) { btnStat.style.background='white'; btnStat.style.color='#555'; btnStat.style.border='1.5px solid #ddd'; }
            if(btnReg)  { btnReg.style.background='#0d6832'; btnReg.style.color='white'; btnReg.style.border='1.5px solid #0d6832'; }
        };

        // ══════════════════════════════════════
        // PÁGINA 1 – RESUMEN EJECUTIVO
        // ══════════════════════════════════════

        // Header azul institucional
        doc.setFillColor(0, 51, 102);
        doc.rect(0, 0, 210, 42, 'F');
        try { doc.addImage(img, 'PNG', 170, 4, 22, 28); } catch(e) {}
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20); doc.setFont("helvetica", "bold");
        doc.text("GESTIÓN CHROMEBOOKS 2026", 14, 20);
        doc.setFontSize(10); doc.setFont("helvetica", "normal");
        doc.text(`Reporte Mensual: ${mesActual.toUpperCase()} ${anioActual}`, 14, 30);
        doc.text(`Emitido: ${fechaEmision}  ·  Responsable: Franco San Martín (Tec. Informático)`, 14, 37);

        // ── KPIs en tarjetas ──
        const total   = mesData.length;
        const ok      = mesData.filter(d => (parseInt(d.chromebooks)+parseInt(d.reemplazo)) === parseInt(d.devueltos) && parseInt(d.devueltos) > 0).length;
        const dmg     = mesData.filter(d => (d.observacion||"").toLowerCase().includes("dañ")).length;
        const activos = mesData.filter(d => (parseInt(d.chromebooks||0)+parseInt(d.reemplazo||0)) > parseInt(d.devueltos||0) && !(d.observacion||"").toLowerCase().includes("dañ")).length;
        const labs    = mesData.filter(d => d.uso_laboratorio === true || d.uso_laboratorio === "TRUE" || d.uso_laboratorio === "true").length;
        const reemp   = mesData.filter(d => parseInt(d.reemplazo||0) > 0).length;
        const tasa    = total > 0 ? Math.round((ok/total)*100) : 0;

        const kpis = [
            { label: 'Total Préstamos', value: total,    color: [13,104,50] },
            { label: 'Devoluciones OK', value: ok,       color: [25,135,84] },
            { label: 'Pendientes',      value: activos,  color: [255,193,7] },
            { label: 'Con Daños',       value: dmg,      color: [211,47,47] },
            { label: 'Uso Laboratorio', value: labs,     color: [111,66,193] },
            { label: 'Con Reemplazos',  value: reemp,    color: [220,53,69] },
        ];

        // KPIs — 6 tarjetas que caben exactamente en 182mm (14 a 196)
        const kpiW = 27, kpiH = 20, kpiY0 = 50;
        const totalW = kpiW * 6 + 5 * 4; // 6 tarjetas + 5 gaps de 4mm = 182mm exacto
        const kpiX0 = 14;
        kpis.forEach((k, i) => {
            const x = kpiX0 + i * (kpiW + 4);
            doc.setFillColor(...k.color);
            doc.roundedRect(x, kpiY0, kpiW, kpiH, 2, 2, 'F');
            doc.setTextColor(255,255,255);
            doc.setFontSize(13); doc.setFont("helvetica","bold");
            doc.text(String(k.value), x + kpiW/2, kpiY0 + 9, { align:'center' });
            doc.setFontSize(5.5); doc.setFont("helvetica","normal");
            doc.text(k.label.toUpperCase(), x + kpiW/2, kpiY0 + 16, { align:'center' });
        });

        // Tasa de retorno destacada
        doc.setFillColor(0, 51, 102);
        doc.roundedRect(14, 77, 182, 10, 2, 2, 'F');
        doc.setTextColor(255,255,255);
        doc.setFontSize(9); doc.setFont("helvetica","bold");
        doc.text(`TASA DE RETORNO DEL MES: ${tasa}%   ·   Stock: ${STOCK_MAXIMO} Chromebooks + ${STOCK_REEMPLAZO} Reemplazos`, 105, 84, { align:'center' });

        // ── Gráfico de estado — a la derecha, mismo nivel que título de tabla ──
        const chartCanvas = document.getElementById('chartStatus');
        try {
            const chartImg = chartCanvas.toDataURL("image/png", 1.0);
            doc.setTextColor(44,62,80);
            doc.setFontSize(8); doc.setFont("helvetica","bold");
            doc.text("DISTRIBUCIÓN DE ESTADO", 157, 93, { align:'center' });
            doc.addImage(chartImg, 'PNG', 130, 95, 66, 48);
        } catch(e) {}

        // ── Tabla de todos los docentes — ancho completo ──
        const docentesMap = {};
        mesData.forEach(d => {
            const k = d.profesor ? d.profesor.trim() : "—";
            if(!docentesMap[k]) docentesMap[k] = { total:0, ok:0, reemp:0, lab:0, dmg:0 };
            docentesMap[k].total++;
            if((parseInt(d.chromebooks)+parseInt(d.reemplazo)) === parseInt(d.devueltos) && parseInt(d.devueltos) > 0) docentesMap[k].ok++;
            if(parseInt(d.reemplazo||0) > 0) docentesMap[k].reemp++;
            if(d.uso_laboratorio === true || d.uso_laboratorio === "TRUE" || d.uso_laboratorio === "true") docentesMap[k].lab++;
            if((d.observacion||"").toLowerCase().includes("dañ")) docentesMap[k].dmg++;
        });

        const todosDocentes = Object.entries(docentesMap)
            .sort((a, b) => b[1].total - a[1].total);

        doc.setTextColor(44,62,80);
        doc.setFontSize(11); doc.setFont("helvetica","bold");
        doc.text(`Uso por Docente — ${todosDocentes.length} docente${todosDocentes.length !== 1 ? 's' : ''} registrados`, 14, 93);

        doc.autoTable({
            startY: 97,
            head: [['#', 'Docente Responsable', 'Préstamos', 'Dev. OK', 'Reemplazo', 'Lab', 'Daños']],
            body: todosDocentes.map(([nombre, v], i) => [
                i + 1,
                nombre,
                v.total,
                v.ok,
                v.reemp > 0 ? `Sí (${v.reemp})` : '—',
                v.lab   > 0 ? `Sí (${v.lab})`   : '—',
                v.dmg   > 0 ? v.dmg              : '—'
            ]),
            headStyles: { fillColor: [0,51,102], fontSize: 8, fontStyle:'bold', textColor:255 },
            bodyStyles: { fontSize: 8 },
            alternateRowStyles: { fillColor: [245,248,255] },
            tableWidth: 'auto',
            columnStyles: {
                0: { cellWidth: 10,  halign:'center' },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 24, halign:'center' },
                3: { cellWidth: 22, halign:'center' },
                4: { cellWidth: 26, halign:'center' },
                5: { cellWidth: 22, halign:'center' },
                6: { cellWidth: 18, halign:'center' }
            },
            margin: { left: 14, right: 14 },
            didParseCell: (data) => {
                if(data.section === 'body' && data.column.index === 6) {
                    if(data.cell.raw !== '—') data.cell.styles.textColor = [211,47,47];
                }
                if(data.section === 'body' && data.column.index === 2) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.textColor = [0,51,102];
                }
            }
        });

        // ══════════════════════════════════════
        // PÁGINA 2 – DASHBOARD DIBUJADO EN jsPDF
        // ══════════════════════════════════════
        doc.addPage();

        // ── Header ──
        doc.setFillColor(0, 51, 102);
        doc.rect(0, 0, 210, 22, 'F');
        try { doc.addImage(img, 'PNG', 184, 1, 14, 18); } catch(e) {}
        doc.setTextColor(255,255,255);
        doc.setFontSize(13); doc.setFont("helvetica","bold");
        doc.text("DASHBOARD - ANALISIS VISUAL", 14, 10);
        doc.setFontSize(8); doc.setFont("helvetica","normal");
        doc.text(`${mesActual.toUpperCase()} ${anioActual}  |  ${total} prestamos  |  Tasa retorno: ${tasa}%  |  ${todosDocentes.length} docentes`, 14, 17);

        // ── SECCIÓN 1: Barras de estado (Entregados / Pendientes / Dañados) ──
        const cerrados2  = mesData.filter(d => (parseInt(d.chromebooks||0)+parseInt(d.reemplazo||0)) === parseInt(d.devueltos||0) && parseInt(d.devueltos||0) > 0).length;
        const activos2   = mesData.filter(d => (parseInt(d.chromebooks||0)+parseInt(d.reemplazo||0)) > parseInt(d.devueltos||0) && !(d.observacion||"").toLowerCase().includes("dan")).length;
        const danados2   = mesData.filter(d => (d.observacion||"").toLowerCase().includes("dan")).length;
        const labs2      = mesData.filter(d => d.uso_laboratorio===true||d.uso_laboratorio==="TRUE"||d.uso_laboratorio==="true").length;
        const reemp2     = mesData.filter(d => parseInt(d.reemplazo||0) > 0).length;

        // Caja izquierda: Estado de equipos
        const S_X=14, S_Y=26, S_W=88, S_H=62;
        doc.setFillColor(248,249,250); doc.setDrawColor(200,200,200); doc.setLineWidth(0.3);
        doc.roundedRect(S_X, S_Y, S_W, S_H, 2, 2, 'FD');
        doc.setTextColor(44,62,80); doc.setFontSize(7.5); doc.setFont("helvetica","bold");
        doc.text("ESTADO DE EQUIPOS DEL MES", S_X+S_W/2, S_Y+7, {align:'center'});

        // Barras horizontales: Entregados, Pendientes, Dañados, Lab, Reemplazos
        const estadoItems = [
            { label:'Entregados',   val: cerrados2, color:[25,135,84]  },
            { label:'Pendientes',   val: activos2,  color:[255,193,7]  },
            { label:'Danados',      val: danados2,  color:[211,47,47]  },
            { label:'Laboratorio',  val: labs2,     color:[111,66,193] },
            { label:'Reemplazos',   val: reemp2,    color:[220,53,69]  },
        ];
        const maxVal = Math.max(...estadoItems.map(e=>e.val), 1);
        const BAR_X = S_X+30, BAR_MAX_W = S_W-36, BAR_H = 5, BAR_GAP = 8;
        estadoItems.forEach((item, i) => {
            const y = S_Y + 14 + i * BAR_GAP;
            // Etiqueta
            doc.setFontSize(6); doc.setFont("helvetica","normal"); doc.setTextColor(80,80,80);
            doc.text(item.label, S_X+28, y+4, {align:'right'});
            // Fondo barra
            doc.setFillColor(230,230,230);
            doc.roundedRect(BAR_X, y, BAR_MAX_W, BAR_H, 1, 1, 'F');
            // Barra valor
            const barW = item.val > 0 ? Math.max(3, (item.val / maxVal) * BAR_MAX_W) : 0;
            doc.setFillColor(...item.color);
            if(barW > 0) doc.roundedRect(BAR_X, y, barW, BAR_H, 1, 1, 'F');
            // Número
            doc.setFontSize(6); doc.setFont("helvetica","bold"); doc.setTextColor(...item.color);
            doc.text(String(item.val), BAR_X + BAR_MAX_W + 2, y+4);
        });

        // ── Caja derecha: Tendencia mensual (línea simple) ──
        const T_X=108, T_Y=26, T_W=88, T_H=62;
        doc.setFillColor(248,249,250); doc.setDrawColor(200,200,200); doc.setLineWidth(0.3);
        doc.roundedRect(T_X, T_Y, T_W, T_H, 2, 2, 'FD');
        doc.setTextColor(44,62,80); doc.setFontSize(7.5); doc.setFont("helvetica","bold");
        doc.text("PRESTAMOS POR MES - 2026", T_X+T_W/2, T_Y+7, {align:'center'});

        // Calcular préstamos por mes desde db
        const porMes = new Array(12).fill(0);
        db.forEach(d => {
            const dt = new Date(d.fecha+"T00:00:00");
            if(dt.getFullYear()===2026) porMes[dt.getMonth()]++;
        });
        const maxMes = Math.max(...porMes, 1);
        const G_X=T_X+6, G_Y=T_Y+13, G_W=T_W-12, G_H=36;
        const mAbr = ['E','F','M','A','M','J','J','A','S','O','N','D'];

        // Ejes
        doc.setDrawColor(200,200,200); doc.setLineWidth(0.2);
        doc.line(G_X, G_Y, G_X, G_Y+G_H);           // eje Y
        doc.line(G_X, G_Y+G_H, G_X+G_W, G_Y+G_H);   // eje X

        // Línea de datos
        const pts = porMes.map((v,i) => ({
            x: G_X + (i/(11))*G_W,
            y: G_Y + G_H - (v/maxMes)*G_H
        }));
        doc.setDrawColor(13,104,50); doc.setLineWidth(0.8);
        for(let i=1; i<pts.length; i++) doc.line(pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y);
        // Puntos
        doc.setFillColor(13,104,50);
        pts.forEach(p => doc.circle(p.x, p.y, 0.8, 'F'));
        // Labels eje X
        doc.setFontSize(5); doc.setFont("helvetica","normal"); doc.setTextColor(120,120,120);
        mAbr.forEach((m,i) => {
            const x = G_X + (i/11)*G_W;
            doc.text(m, x, G_Y+G_H+4, {align:'center'});
            if(porMes[i]>0) {
                doc.setTextColor(13,104,50); doc.setFont("helvetica","bold");
                doc.text(String(porMes[i]), x, pts[i].y-2, {align:'center'});
                doc.setTextColor(120,120,120); doc.setFont("helvetica","normal");
            }
        });

        // ── SECCIÓN 2: Gráfico de barras por docente (dibujado) ──
        const D_X=14, D_Y=S_Y+S_H+6, D_W=182;
        const barDocH = 5.2, barDocGap = 1.8;
        const maxDocVal = Math.max(...todosDocentes.map(([,v])=>v.total), 1);
        const D_H = 12 + todosDocentes.length*(barDocH+barDocGap) + 6;

        doc.setFillColor(248,249,250); doc.setDrawColor(200,200,200); doc.setLineWidth(0.3);
        doc.roundedRect(D_X, D_Y, D_W, D_H, 2, 2, 'FD');
        doc.setTextColor(44,62,80); doc.setFontSize(7.5); doc.setFont("helvetica","bold");
        doc.text("PRESTAMOS POR DOCENTE", D_X+D_W/2, D_Y+6, {align:'center'});

        const LABEL_W = 46;
        const BD_X = D_X+LABEL_W+2, BD_MAX = D_W-LABEL_W-16;
        todosDocentes.forEach(([nombre, v], i) => {
            const y = D_Y+11 + i*(barDocH+barDocGap);
            // Nombre docente (truncar si es largo)
            const nomCorto = nombre.length>22 ? nombre.slice(0,21)+'.' : nombre;
            doc.setFontSize(5.2); doc.setFont("helvetica","normal"); doc.setTextColor(60,60,60);
            doc.text(nomCorto, D_X+LABEL_W, y+barDocH-1, {align:'right'});
            // Fondo
            doc.setFillColor(225,235,225);
            doc.roundedRect(BD_X, y, BD_MAX, barDocH, 0.8, 0.8, 'F');
            // Barra
            const bw = Math.max(2, (v.total/maxDocVal)*BD_MAX);
            doc.setFillColor(13,104,50);
            doc.roundedRect(BD_X, y, bw, barDocH, 0.8, 0.8, 'F');
            // Valor
            doc.setFontSize(5.2); doc.setFont("helvetica","bold"); doc.setTextColor(13,104,50);
            doc.text(String(v.total), BD_X+bw+1.5, y+barDocH-1);
        });

        // ── SECCIÓN 3: Tabla resumen por semana ──
        const TABLE_Y2 = D_Y + D_H + 6;
        const semanas = [1,2,3,4];
        const semanaRows = semanas.map(s => {
            const dInicio=(s-1)*7+1, dFin=s*7;
            const reg = mesData.filter(d => {
                const dia = new Date(d.fecha+"T00:00:00").getDate();
                return dia>=dInicio && dia<=dFin;
            });
            const chrTotal = reg.reduce((sum,d)=>sum+parseInt(d.chromebooks||0),0);
            const reeTotal = reg.reduce((sum,d)=>sum+parseInt(d.reemplazo||0),0);
            const okReg    = reg.filter(d=>(parseInt(d.chromebooks)+parseInt(d.reemplazo))===parseInt(d.devueltos)&&parseInt(d.devueltos)>0).length;
            return [`Semana ${s} (dias ${dInicio}-${dFin})`, reg.length, chrTotal, reeTotal, okReg,
                    reg.length>0 ? Math.round(okReg/reg.length*100)+'%' : '-'];
        });

        doc.setTextColor(44,62,80); doc.setFontSize(8); doc.setFont("helvetica","bold");
        doc.text("RESUMEN POR SEMANA", 14, TABLE_Y2);
        doc.autoTable({
            startY: TABLE_Y2+3,
            head: [['Periodo','Prestamos','Chromebooks','Reemplazos','Devueltos OK','Tasa']],
            body: semanaRows,
            headStyles: { fillColor:[0,51,102], fontSize:7.5, fontStyle:'bold', textColor:255 },
            bodyStyles: { fontSize:7.5 },
            alternateRowStyles: { fillColor:[245,248,255] },
            columnStyles: {
                0:{cellWidth:58}, 1:{cellWidth:25,halign:'center'},
                2:{cellWidth:30,halign:'center'}, 3:{cellWidth:28,halign:'center'},
                4:{cellWidth:28,halign:'center'}, 5:{cellWidth:13,halign:'center',fontStyle:'bold'}
            },
            margin: {left:14, right:14}
        });

        // ── Alertas ──
        const conDanio   = mesData.filter(d=>(d.observacion||"").toLowerCase().includes("dan"));
        const pendientes = mesData.filter(d=>(parseInt(d.chromebooks||0)+parseInt(d.reemplazo||0))>parseInt(d.devueltos||0)&&!(d.observacion||"").toLowerCase().includes("dan"));
        if(conDanio.length > 0 || pendientes.length > 0) {
            const alertY = doc.lastAutoTable.finalY + 6;
            doc.setFontSize(8); doc.setFont("helvetica","bold"); doc.setTextColor(180,0,0);
            doc.text("ALERTAS DEL MES", 14, alertY);
            const alertRows = [
                ...conDanio.map(d   =>['DANO',    d.fecha.split('-').reverse().slice(0,2).join('/'),d.profesor,d.curso,d.observacion]),
                ...pendientes.map(d =>['PENDIENTE',d.fecha.split('-').reverse().slice(0,2).join('/'),d.profesor,d.curso,`Chr:${d.chromebooks} Ree:${d.reemplazo} Dev:${d.devueltos}`])
            ];
            doc.autoTable({
                startY: alertY+3,
                head: [['Tipo','Fecha','Profesor','Curso','Detalle']],
                body: alertRows,
                headStyles: { fillColor:[180,0,0], fontSize:7, fontStyle:'bold', textColor:255 },
                bodyStyles: { fontSize:7 },
                columnStyles: {0:{cellWidth:22},1:{cellWidth:18,halign:'center'},2:{cellWidth:55},3:{cellWidth:22,halign:'center'},4:{cellWidth:'auto'}},
                margin: {left:14, right:14}
            });
        }

        // ══════════════════════════════════════
        // FOOTER en todas las páginas
        // ══════════════════════════════════════
        const pageCount = doc.internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFillColor(0,51,102);
            doc.rect(0, 287, 210, 10, 'F');
            doc.setFontSize(7); doc.setTextColor(255,255,255);
            doc.text("Área de Informática – Responsable: Franco San Martín – NSG 2026", 14, 293);
            doc.text(`Página ${i} de ${pageCount}`, 196, 293, { align:'right' });
        }

        restorePages();
        doc.save(`Reporte_Franco_${mesActual}_${anioActual}.pdf`);
    };

    img.onload  = () => setTimeout(buildPDF, 100);
    img.onerror = () => setTimeout(buildPDF, 100);
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
    const dañados = registros.filter(d => d.observacion.toLowerCase().includes("dañ")).length;
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


// ── PANEL DE ALERTAS PENDIENTES ──────────────────────────────────────────
function renderAlertasPanel(mesCompleto) {
    const wrapper = document.getElementById('alertasPanelWrapper');
    const body    = document.getElementById('alertasBody');
    const badge   = document.getElementById('alertasCount');
    if(!wrapper || !body) return;

    const hoy = new Date(); hoy.setHours(0,0,0,0);

    // Registros pendientes: más salidas que devoluciones y no dañados
    const pendientes = mesCompleto.filter(d => {
        const total = parseInt(d.chromebooks||0) + parseInt(d.reemplazo||0);
        const dev   = parseInt(d.devueltos||0);
        const isDmg = d.observacion.toLowerCase().includes("dañ");
        return total > dev && !isDmg;
    });

    if(pendientes.length === 0) {
        wrapper.style.display = 'none';
        return;
    }

    wrapper.style.display = 'block';
    if(badge) badge.textContent = pendientes.length;

    // Ordenar por fecha más antigua primero (más días de deuda)
    const sorted = [...pendientes].sort((a,b) => new Date(a.fecha) - new Date(b.fecha));

    body.innerHTML = sorted.map(d => {
        const fechaD = new Date(d.fecha + "T00:00:00");
        const diffMs = hoy - fechaD;
        const dias   = Math.floor(diffMs / (1000*60*60*24));
        const total  = parseInt(d.chromebooks||0) + parseInt(d.reemplazo||0);
        const dev    = parseInt(d.devueltos||0);
        const falta  = total - dev;
        const fechaFmt = d.fecha.split('-').reverse().slice(0,2).join('/');

        let diasClass = 'alerta-dias';
        let diasLabel = '';
        if(dias === 0) { diasClass += ' hoy'; diasLabel = 'HOY'; }
        else if(dias <= 2) { diasClass += ' reciente'; diasLabel = dias + 'd'; }
        else diasLabel = dias + 'd';

        const reeLabel = parseInt(d.reemplazo||0) > 0
            ? ` · 🔴 ${d.nro_equipo_reemplazo || 'reemplazo'}` : '';

        return `<div class="alerta-item" onclick="editItem('${d.id}')">
            <div class="${diasClass}"><div>${diasLabel}</div><div style="font-size:0.55rem;opacity:0.8;">${dias === 0 ? '' : 'atrás'}</div></div>
            <div class="alerta-info">
                <div class="alerta-nombre">👤 ${d.profesor}</div>
                <div class="alerta-detalle">📅 ${fechaFmt} · ${d.curso} · ${d.asignatura} · <b style="color:#c62828;">${falta} equipo${falta!==1?'s':''} sin devolver</b>${reeLabel}</div>
            </div>
            <button class="btn btn-sm btn-outline-danger border-0 fw-bold" style="font-size:0.7rem;padding:3px 8px;">Editar</button>
        </div>`;
    }).join('');
}

// ── WIZARD DE PASOS ───────────────────────────────────────────────────────
let _wizardStep = 1;
const WIZARD_TOTAL = 3;

function wizardGoTo(step) {
    _wizardStep = step;
    for(let i = 1; i <= WIZARD_TOTAL; i++) {
        const panel = document.getElementById('wpanel' + i);
        const dot   = document.getElementById('wstep' + i);
        if(panel) panel.classList.toggle('active', i === step);
        if(dot) {
            dot.classList.remove('active','done');
            if(i === step)   dot.classList.add('active');
            if(i < step)     dot.classList.add('done');
        }
    }
    const prev = document.getElementById('wBtnPrev');
    const next = document.getElementById('wBtnNext');
    const save = document.getElementById('wBtnSave');
    if(prev) prev.style.display = step > 1 ? 'inline-block' : 'none';
    if(next) next.style.display = step < WIZARD_TOTAL ? 'inline-block' : 'none';
    if(save) save.style.display = step === WIZARD_TOTAL ? 'inline-block' : 'none';
}

function wizardNext() {
    // Validar paso 1 antes de avanzar
    if(_wizardStep === 1) {
        const fecha = document.getElementById('fFecha').value;
        const hora  = document.getElementById('fHora').value;
        const curso = document.getElementById('fCurso').value;
        const asig  = document.getElementById('fAsignatura').value;
        const prof  = document.getElementById('fProfesor').value;
        if(!fecha || !hora || !curso || !asig || !prof) {
            Swal.fire({ icon:'warning', title:'Campos incompletos', text:'Por favor complete Fecha, Hora, Curso, Asignatura y Profesor antes de continuar.', confirmButtonColor:'#0d6832' });
            return;
        }
    }
    if(_wizardStep === WIZARD_TOTAL - 1) {
        // Llenar resumen en paso 3
        const estadoMap = { ok:'✅ Sin novedad', pendiente:'⏳ Pendiente', danio:'🔴 Con daño', '':'—' };
        const estadoDev = document.querySelector('input[name="fEstadoDev"]:checked')?.value || '';
        const nroEq     = document.querySelector('input[name="fNroEquipo"]:checked')?.value || '—';
        const labCheck  = document.getElementById('fLab')?.checked;
        document.getElementById('cv-fecha').textContent = document.getElementById('fFecha').value || '—';
        document.getElementById('cv-hora').textContent  = document.getElementById('fHora').value  || '—';
        document.getElementById('cv-curso').textContent = document.getElementById('fCurso').value || '—';
        document.getElementById('cv-asig').textContent  = document.getElementById('fAsignatura').value || '—';
        document.getElementById('cv-prof').textContent  = document.getElementById('fProfesor').value || '—';
        document.getElementById('cv-lab').textContent   = labCheck ? '🟣 Sí' : 'No';
        document.getElementById('cv-chr').textContent   = document.getElementById('fChr').value || '0';
        document.getElementById('cv-ree').textContent   = document.getElementById('fRee').value || '0';
        document.getElementById('cv-dev').textContent   = document.getElementById('fDev').value || '0';
        document.getElementById('cv-nroeq').textContent = nroEq;
        document.getElementById('cv-estado').textContent = estadoMap[estadoDev] || '—';
    }
    if(_wizardStep < WIZARD_TOTAL) wizardGoTo(_wizardStep + 1);
}

function wizardPrev() {
    if(_wizardStep > 1) wizardGoTo(_wizardStep - 1);
}

window.onload = load;
