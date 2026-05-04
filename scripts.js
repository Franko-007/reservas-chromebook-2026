// ==================== CONFIGURACIÓN ====================
// IMPORTANTE: Reemplazar esta URL con la URL de tu Web App después de desplegar el código.gs
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxN2XQAMGfzqDHYkAdfdPrkQ6d6Mni72WRZajuQyyewjDhVAdemvVuUrN0SUY54x_o/exec";

const STOCK_MAXIMO = 115;
const STOCK_REEMPLAZO = 4;

const DOCENTES_NSG = ["ALEXIS CORTÉS", "ALLYSON RIOS", "ANA OGAZ", "ANDREA SALAZAR", "ANDREA DONOSO", "AVIGUEY GONZALEZ", "CAMILA GONZÁLEZ", "CARLA MERA", "CARLOS ARAYA", "CARMEN ÁLVAREZ", "CAROLINA MIRANDA", "CAROLINA REYES", "CECILIA GARCÍA", "CLAUDIA TOLEDO", "CONSTANZA LÓPEZ", "DANIEL VITTA", "DANIELA VERA", "DANIELA VALENZUELA", "DEBORA GAETE", "DEBORA GONZÁLEZ", "ELIZABETH MIRANDA", "ERIKA KINDERMANN", "FERNANDA RÍOS", "FRANCISCA MAUREIRA", "FRANCISCA COFRÉ", "FRANCISCA VIZCAYA", "GIOVANNA ARIAS", "GOLDIE FARÍAS", "HERNÁN REYES", "JAVIERA ALIAGA", "JOAQUÍN ALMUNA", "KARIMME GUTIÉRREZ", "KARINA BARRIOS", "KAROLINA RIFFO", "LEONARDO RÍOS", "LORENA ARANCIBIA", "LUIS SÁNCHEZ", "MACARENA BELTRÁN", "MARÍA MONZÓN", "MARÍA GONZÁLEZ", "MARISOL GUAJARDO", "MATÍAS CUEVAS", "NATALIA CARTES", "NATALY HIDALGO", "NICOLE BELLO", "PAOLA ÁVILA", "PATRICIA NÚÑEZ", "PAULINA ARGOMEDO", "PRISCILA VALENZUELA", "REINA ORTEGA", "STEPHANY GUZMÁN", "VÍCTOR BARRIENTOS", "YADIA CERDA", "YESSENIA SÁNCHEZ"];

let db = [];
let viewDate = new Date();
viewDate.setDate(1);
let filterMode = 'all';
let currentWeek = 0;
let charts = {};
let _docentesExtra = [];
let debounceTimer;
let _wizardStep = 1;
const WIZARD_TOTAL = 3;
const mNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// ==================== FUNCIONES AUXILIARES ====================
function isDamagedRecord(record) {
    const obs = (record.observacion || "").toLowerCase();
    const damagedKeywords = ["dañ", "pantalla", "teclado", "enciende", "rota", "rayada", "falla", "malo", "averiado", "roto", "golpe", "quemado"];
    const hasDamageKeyword = damagedKeywords.some(keyword => obs.includes(keyword));
    const hasDamageState = record.estado_dev === "danio";
    return hasDamageKeyword || hasDamageState;
}

function getEstado(r) {
    const obs = (r.observacion || "").toLowerCase();
    const chr = parseInt(r.chromebooks || 0);
    const ree = parseInt(r.reemplazo || 0);
    const dev = parseInt(r.devueltos || 0);
    if (r.uso_laboratorio === true || r.uso_laboratorio === "TRUE" || r.uso_laboratorio === "true") return "LABORATORIO";
    if (isDamagedRecord(r)) return "DAÑADO";
    if ((chr + ree) > dev) return "ACTIVO";
    return "CERRADO";
}

function getWeekRanges(year, month) {
    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let firstMonday = new Date(firstDayOfMonth);
    while (firstMonday.getDay() !== 1) firstMonday.setDate(firstMonday.getDate() + 1);
    let firstWeekEnd = 7 - (firstDayOfMonth.getDay() === 0 ? 6 : firstDayOfMonth.getDay() - 1);
    firstWeekEnd = Math.min(firstWeekEnd, daysInMonth);
    const weekRanges = {
        1: { start: 1, end: firstWeekEnd },
        2: { start: firstWeekEnd + 1, end: Math.min(firstWeekEnd + 7, daysInMonth) },
        3: { start: firstWeekEnd + 8, end: Math.min(firstWeekEnd + 14, daysInMonth) },
        4: { start: firstWeekEnd + 15, end: Math.min(firstWeekEnd + 21, daysInMonth) }
    };
    return weekRanges;
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
async function load() {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'flex';
    fillDocentes();

    try {
        const response = await fetch(SCRIPT_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        if (data.status === 'success') {
            db = data.data;
            console.log('✅ Datos cargados:', db.length, 'registros');
        } else {
            throw new Error(data.message || 'Error al cargar datos');
        }

        Swal.fire({
            icon: 'success',
            title: 'Datos sincronizados',
            text: `Se cargaron ${db.length} registros correctamente`,
            timer: 2000,
            showConfirmButton: false,
            toast: true,
            position: 'top-end'
        });

        renderAll();
        renderAnualChart();
    } catch (error) {
        console.error('❌ Error detallado:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error de Conexión',
            text: 'No se pudieron cargar los datos de Google Sheets. Verifica que el script esté publicado correctamente.',
            footer: '<a href="#" onclick="location.reload()">Intentar de nuevo</a>'
        });
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

// ==================== RENDERIZADO PRINCIPAL ====================
function renderAll() {
    const displayDateEl = document.getElementById('displayDate');
    if (displayDateEl) displayDateEl.innerText = `${mNames[viewDate.getMonth()]} ${viewDate.getFullYear()}`;

    const searchTerm = (document.getElementById('searchBox')?.value || "").toLowerCase();
    const courseFilter = document.getElementById('courseSelect')?.value || "";
    const weekRanges = getWeekRanges(viewDate.getFullYear(), viewDate.getMonth());

    const baseFiltered = db.filter(d => {
        const date = new Date(d.fecha + "T00:00:00");
        return date.getMonth() === viewDate.getMonth() && date.getFullYear() === viewDate.getFullYear();
    });

    const finalFiltered = baseFiltered.filter(d => {
        const matchSearch = (d.profesor + d.asignatura).toLowerCase().includes(searchTerm);
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

        return matchSearch && matchCourse && matchWeek && matchMode;
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

        const sorted = [...finalFiltered].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
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

            rows.push(`<tr class="${rowClass}">
                <td><span class="text-muted" style="font-size:0.78rem;">${r.fecha.split('-').reverse().slice(0, 2).join('/')}</span></td>
                <td><span class="badge bg-light text-dark border" style="font-size:0.78rem;">🕐 ${r.hora}</span></td>
                <td>${r.curso}${r.curso === 'ELECTIVO' ? ' 📚' : (r.curso === 'Reemplazo' ? ' 🔄' : '')}</td>
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
        return date.getMonth() === viewDate.getMonth() && date.getFullYear() === viewDate.getFullYear();
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
        labelSemTxt = `días ${range.start}–${range.end}`;
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
                    y: { ticks: { autoSkip: false, font: { size: 11 } } }
                }
            }
        });
    }

    const cerrados = base.filter(d => getEstado(d) === "CERRADO").length;
    const activos = base.filter(d => getEstado(d) === "ACTIVO").length;
    const danados = base.filter(d => getEstado(d) === "DAÑADO").length;

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
        if (dt.getFullYear() === 2026) {
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
    const pageReg = document.getElementById('pageRegistros');
    const pageStat = document.getElementById('pageStats');
    const btnReg = document.getElementById('btnPageRegistros');
    const btnStat = document.getElementById('btnPageStats');

    if (page === 'stats') {
        pageReg.style.display = 'none';
        pageStat.style.display = 'block';
        btnReg.style.background = 'white';
        btnReg.style.color = '#555';
        btnReg.style.border = '1.5px solid #ddd';
        btnStat.style.background = '#0d6832';
        btnStat.style.color = 'white';
        btnStat.style.border = '1.5px solid #0d6832';
        setTimeout(() => {
            Object.values(charts).forEach(c => { if (c) c.resize(); });
        }, 50);
    } else {
        pageStat.style.display = 'none';
        pageReg.style.display = 'block';
        btnStat.style.background = 'white';
        btnStat.style.color = '#555';
        btnStat.style.border = '1.5px solid #ddd';
        btnReg.style.background = '#0d6832';
        btnReg.style.color = 'white';
        btnReg.style.border = '1.5px solid #0d6832';
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
    new bootstrap.Modal(document.getElementById('resModal')).show();
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

    const payload = {
        action: document.getElementById('fId').value ? 'update' : 'create',
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
        responsable_cierre: 'Franco San Martín'
    };

    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        localStorage.removeItem('franco_draft');
        bootstrap.Modal.getInstance(document.getElementById('resModal')).hide();
        
        Swal.fire({
            icon: 'success',
            title: `Registro ${payload.action === 'create' ? 'creado' : 'actualizado'} correctamente`,
            timer: 2000,
            showConfirmButton: false,
            toast: true,
            position: 'top-end'
        });
        
        setTimeout(() => load(), 500);
    } catch (e) {
        console.error('Error al guardar:', e);
        Swal.fire('Error', 'No se pudo guardar el registro. Verifica tu conexión.', 'error');
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
            await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', id: id })
            });
            Swal.fire('Eliminado', 'El registro ha sido eliminado.', 'success');
            setTimeout(() => load(), 500);
        } catch (e) {
            Swal.fire('Error', 'No se pudo eliminar.', 'error');
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

// ==================== DRAFT ====================
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
    localStorage.setItem('franco_draft', JSON.stringify(draft));
}

function loadDraft() {
    const saved = localStorage.getItem('franco_draft');
    if (saved) {
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
}

// ==================== PDF ====================
function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const mesActual = mNames[viewDate.getMonth()];
    const anioActual = viewDate.getFullYear();
    const fechaEmision = new Date().toLocaleDateString('es-CL');

    const mesData = db.filter(d => {
        const date = new Date(d.fecha + "T00:00:00");
        return date.getMonth() === viewDate.getMonth() && date.getFullYear() === viewDate.getFullYear();
    });

    doc.setFillColor(0, 51, 102);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("GESTIÓN CHROMEBOOKS 2026", 14, 15);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Reporte Mensual: ${mesActual.toUpperCase()} ${anioActual}`, 14, 24);
    doc.text(`Emitido: ${fechaEmision}  ·  Responsable: Franco San Martín`, 14, 31);

    const total = mesData.length;
    const ok = mesData.filter(d => (parseInt(d.chromebooks) + parseInt(d.reemplazo)) === parseInt(d.devueltos) && parseInt(d.devueltos) > 0).length;
    const dmg = mesData.filter(d => isDamagedRecord(d)).length;
    const activos = mesData.filter(d => (parseInt(d.chromebooks || 0) + parseInt(d.reemplazo || 0)) > parseInt(d.devueltos || 0) && !isDamagedRecord(d)).length;
    const labs = mesData.filter(d => d.uso_laboratorio === true || d.uso_laboratorio === "TRUE" || d.uso_laboratorio === "true").length;
    const reemp = mesData.filter(d => parseInt(d.reemplazo || 0) > 0).length;
    const tasa = total > 0 ? Math.round((ok / total) * 100) : 0;

    const kpis = [
        { label: 'Total Préstamos', value: total, color: [13, 104, 50] },
        { label: 'Devoluciones OK', value: ok, color: [25, 135, 84] },
        { label: 'Pendientes', value: activos, color: [255, 193, 7] },
        { label: 'Con Daños', value: dmg, color: [211, 47, 47] },
        { label: 'Uso Laboratorio', value: labs, color: [111, 66, 193] },
        { label: 'Con Reemplazos', value: reemp, color: [220, 53, 69] }
    ];

    const kpiW = 27, kpiH = 18, kpiY0 = 40;
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
    doc.roundedRect(14, 63, 182, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(`TASA DE RETORNO: ${tasa}%   ·   Stock: ${STOCK_MAXIMO} Chromebooks + ${STOCK_REEMPLAZO} Reemplazos`, 105, 69, { align: 'center' });

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
    doc.text(`Uso por Docente — ${todosDocentes.length} docente${todosDocentes.length !== 1 ? 's' : ''} registrados`, 14, 80);

    doc.autoTable({
        startY: 85,
        head: [['#', 'Docente Responsable', 'Préstamos', 'Dev. OK', 'Reemplazo', 'Lab', 'Daños']],
        body: todosDocentes.map(([nombre, v], i) => [i + 1, nombre, v.total, v.ok, v.reemp > 0 ? `Sí (${v.reemp})` : '—', v.lab > 0 ? `Sí (${v.lab})` : '—', v.dmg > 0 ? v.dmg : '—']),
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
        if (dias === 0) { diasClass += ' hoy'; diasLabel = 'HOY'; }
        else if (dias <= 2) { diasClass += ' reciente'; diasLabel = dias + 'd'; }
        else diasLabel = dias + 'd';

        html += `<div class="alerta-item" onclick="editItem('${d.id}')">
            <div class="${diasClass}"><div>${diasLabel}</div></div>
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

window.onload = load;
