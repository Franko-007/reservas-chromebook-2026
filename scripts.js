const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzb-7PBS3YU5lvyf7aRrf0Wkww_6GohBtSUXzlY1oApDva-Jg9RuP6Yc1RwRqifXAM/exec";
let db = [], viewDate = new Date(2026, 2, 1), filterMode = 'all', currentWeek = 0, charts = {};
const mNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const DOCENTES_NSG = ["ALEXIS CORTÉS","ALLYSON RIOS","ANA OGAZ","ANDREA SALAZAR","ANDREA DONOSO","AVIGUEY GONZALEZ","CAMILA GONZÁLEZ","CARLA MERA","CARLOS ARAYA","CARMEN ÁLVAREZ","CAROLINA MIRANDA","CAROLINA REYES","CECILIA GARCÍA","CLAUDIA TOLEDO","CONSTANZA LÓPEZ","DANIEL VITTA","DANIELA VERA","DANIELA VALENZUELA","DEBORA GAETE","ELIZABETH MIRANDA","ERIKA KINDERMANN","FERNANDA RÍOS","FRANCISCA MAUREIRA","FRANCISCA COFRÉ","FRANCISCA VIZCAYA","GIOVANNA ARIAS","GOLDIE FARÍAS","HERNÁN REYES","JAVIERA ALIAGA","JOAQUÍN ALMUNA","KARIMME GUTIÉRREZ","KARINA BARRIOS","KAROLINA RIFFO","LEONARDO RÍOS","LORENA ARANCIBIA","LUIS SÁNCHEZ","MACARENA BELTRÁN","MARÍA MONZÓN","MARÍA GONZÁLEZ","MARISOL GUAJARDO","MATÍAS CUEVAS","NATALIA CARTES","NATALY HIDALGO","NICOLE BELLO","PAOLA ÁVILA","PATRICIA NÚÑEZ","PAULINA ARGOMEDO","PRISCILA VALENZUELA","REINA ORTEGA","STEPHANY GUZMÁN","VÍCTOR BARRIENTOS","YADIA CERDA","YESSENIA SÁNCHEZ"];

// Función debounce para búsqueda suave
let debounceTimer;
function debouncedRender() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderAll, 300);
}

function fillDocentes() {
    const select = document.getElementById('fProfesor');
    if(!select) return;
    select.innerHTML = '<option value="">Seleccione un docente...</option>';
    DOCENTES_NSG.sort().forEach(d => {
        const opt = document.createElement('option');
        opt.value = d; opt.textContent = d; select.appendChild(opt);
    });
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
        const isLab = (d.asignatura + d.observacion).toLowerCase().includes("laboratorio");

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
        
        tableBody.innerHTML = finalFiltered.map(r => {
            const totalOut = parseInt(r.chromebooks) + parseInt(r.reemplazo);
            const isOK = totalOut === parseInt(r.devueltos);
            const isDamaged = r.observacion.toLowerCase().includes("dañada") || r.observacion.toLowerCase().includes("dañado");
            const isLab = (r.asignatura + r.observacion).toLowerCase().includes("laboratorio");
            
            let rowClass = isDamaged ? "row-damaged" : (isLab ? "row-lab" : (!isOK ? "row-pending" : ""));
            let badgeStyle = `background:${isOK ? '#198754' : '#ffc107'}; color:${isOK ? 'white' : '#444'}`;
            if(isDamaged) badgeStyle = `background:var(--danger-red); color:white`;
            else if(isLab) badgeStyle = `background:var(--purple-lab); color:white`;

            return `<tr class="${rowClass}">
                <td>${r.fecha.split('-').reverse().slice(0,2).join('/')}</td>
                <td><span class="badge bg-light text-dark border">${r.hora}</span></td>
                <td>${r.curso}</td><td>${r.asignatura}</td>
                <td class="text-start fw-bold" style="color:#2b5797">${r.profesor}</td>
                <td>${r.chromebooks}</td><td class="text-danger">${r.reemplazo}</td>
                <td class="text-success fw-bold">${r.devueltos}</td>
                <td><span class="badge badge-status" style="${badgeStyle}">${isDamaged ? r.observacion : (isLab ? 'LABORATORIO' : (isOK ? 'DEVOLUCIÓN OK' : 'PENDIENTE'))}</span></td>
                <td><div class="d-flex justify-content-center gap-1">
                    <button class="btn btn-sm btn-outline-primary border-0" onclick="editItem('${r.id}')" title="Editar">✏️</button>
                    <button class="btn btn-sm btn-outline-danger border-0" onclick="deleteItem('${r.id}')" title="Eliminar">🗑️</button>
                </div></td></tr>`;
        }).join('');
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

// 3. KPIs
function updateKPIs(base) {
    const lab = base.filter(d => (d.asignatura + d.observacion).toLowerCase().includes("laboratorio")).length;
    const reemp = base.filter(d => parseInt(d.reemplazo || 0) > 0).length;
    const ok = base.filter(d => (parseInt(d.chromebooks)+parseInt(d.reemplazo)) === parseInt(d.devueltos) && parseInt(d.devueltos) > 0).length;
    const dmg = base.filter(d => d.observacion.toLowerCase().includes("dañada") || d.observacion.toLowerCase().includes("dañado")).length;
    
    if(document.getElementById('kpi-total')) document.getElementById('kpi-total').innerText = base.length;
    if(document.getElementById('kpi-lab')) document.getElementById('kpi-lab').innerText = lab;
    if(document.getElementById('kpi-reemp')) document.getElementById('kpi-reemp').innerText = reemp;
    if(document.getElementById('kpi-damaged')) document.getElementById('kpi-damaged').innerText = dmg;
    if(document.getElementById('kpi-ok')) document.getElementById('kpi-ok').innerText = base.length > 0 ? Math.round((ok / base.length) * 100) + "%" : "0%";
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

    const okCount = base.filter(d => (parseInt(d.chromebooks) + parseInt(d.reemplazo || 0)) === parseInt(d.devueltos)).length;
    const pendingCount = base.length - okCount;
    const ctxStatus = document.getElementById('chartStatus');
    if(ctxStatus) {
        if(charts.S) charts.S.destroy();
        charts.S = new Chart(ctxStatus, { 
            type: 'doughnut', 
            data: { 
                labels: ['OK', 'Pendiente'], 
                datasets: [{ data: [okCount, pendingCount], backgroundColor: ['#198754', '#ffc107'], borderWidth: 0 }]
            }, 
            options: { maintainAspectRatio: false, cutout: '70%' }
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
            if((d.asignatura + d.observacion).toLowerCase().includes("laboratorio")) labs[m]++;
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

function openModal() { 
    document.getElementById('resForm').reset(); 
    document.getElementById('fId').value = ''; 
    document.getElementById('resForm').classList.remove('was-validated');
    loadDraft(); 
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
        observacion: document.getElementById('fObs').value
    };
    try {
        await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
        localStorage.removeItem('franco_draft');
        bootstrap.Modal.getInstance(document.getElementById('resModal')).hide();
        load();
    } catch(e) { 
        Swal.fire('Error', 'No se pudo guardar el registro', 'error'); 
        document.getElementById('loading').style.display = 'none';
    }
}

function validateCounts() {
    const chr = parseInt(document.getElementById('fChr').value || 0);
    const ree = parseInt(document.getElementById('fRee').value || 0);
    const dev = parseInt(document.getElementById('fDev').value || 0);
    const msg = document.getElementById('valMsg');
    const devInput = document.getElementById('fDev');
    
    if(dev !== (chr + ree)) {
        msg.style.display = 'block';
        devInput.classList.add('val-warning');
    } else {
        msg.style.display = 'none';
        devInput.classList.remove('val-warning');
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
    validateCounts();
    new bootstrap.Modal(document.getElementById('resModal')).show();
}

function saveDraft() {
    if(document.getElementById('fId').value !== "") return;
    const draft = { fecha: document.getElementById('fFecha').value, hora: document.getElementById('fHora').value, curso: document.getElementById('fCurso').value, profesor: document.getElementById('fProfesor').value, asignatura: document.getElementById('fAsignatura').value, obs: document.getElementById('fObs').value };
    localStorage.setItem('franco_draft', JSON.stringify(draft));
}

function loadDraft() {
    const saved = localStorage.getItem('franco_draft');
    if(saved) {
        const d = JSON.parse(saved);
        document.getElementById('fFecha').value = d.fecha; document.getElementById('fHora').value = d.hora; document.getElementById('fCurso').value = d.curso; document.getElementById('fProfesor').value = d.profesor; document.getElementById('fAsignatura').value = d.asignatura; document.getElementById('fObs').value = d.obs;
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
        const dmg = mesData.filter(d => d.observacion.toLowerCase().includes("dañada")).length;

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Total de Préstamos: ${total}`, 14, 65);
        doc.text(`Devoluciones Completas: ${ok}`, 14, 72);
        doc.text(`Equipos con Daños: ${dmg}`, 14, 79);
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

window.onload = load;
