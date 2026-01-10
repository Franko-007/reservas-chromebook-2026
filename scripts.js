const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzb-7PBS3YU5lvyf7aRrf0Wkww_6GohBtSUXzlY1oApDva-Jg9RuP6Yc1RwRqifXAM/exec";
let db = [], viewDate = new Date(2026, 2, 1), filterMode = 'all', currentWeek = 0, charts = {};
const mNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// 1. Carga inicial de datos
async function load() { 
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'flex';
    
    try {
        console.log("Intentando conectar con Google Sheets...");
        const r = await fetch(SCRIPT_URL); 
        if (!r.ok) throw new Error("Fallo en la respuesta del servidor");
        
        db = await r.json(); 
        console.log("Datos recibidos correctamente:", db.length, "registros.");
        
        renderAll(); 
        renderAnualChart(); 
    } catch(e) { 
        console.error("Error cargando datos:", e);
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

// 2. Renderizado de tabla y lógica de filtros
function renderAll() {
    const displayDateEl = document.getElementById('displayDate');
    if (displayDateEl) displayDateEl.innerText = `${mNames[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
    
    const s = (document.getElementById('searchBox')?.value || "").toLowerCase();
    const c = document.getElementById('courseSelect')?.value || "";

    const baseFiltered = db.filter(d => {
        const date = new Date(d.fecha + "T00:00:00");
        const matchM = date.getMonth() === viewDate.getMonth() && date.getFullYear() === viewDate.getFullYear();
        const matchS = (d.profesor + d.asignatura).toLowerCase().includes(s);
        const matchC = c === "" || d.curso === c;
        let matchW = true;
        if(currentWeek > 0) {
            const day = date.getDate();
            matchW = (day >= (currentWeek - 1) * 7 + 1 && day <= currentWeek * 7);
        }
        return matchM && matchS && matchC && matchW;
    });

    const finalFiltered = baseFiltered.filter(d => {
        const totalOut = (parseInt(d.chromebooks || 0) + parseInt(d.reemplazo || 0));
        const isDebt = totalOut > parseInt(d.devueltos || 0);
        const isDamaged = d.observacion.toLowerCase().includes("dañada") || d.observacion.toLowerCase().includes("dañado");
        const isLab = (d.asignatura + d.observacion).toLowerCase().includes("laboratorio");

        if(filterMode === 'lab') return isLab;
        if(filterMode === 'reemp') return parseInt(d.reemplazo || 0) > 0;
        if(filterMode === 'ok') return !isDebt && parseInt(d.devueltos) > 0;
        if(filterMode === 'debt') return isDebt && !isDamaged; 
        if(filterMode === 'damaged') return isDamaged;
        return true;
    });

    const tableBody = document.getElementById('tableBody');
    if (tableBody) {
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
                    <button class="btn btn-sm btn-outline-primary border-0" onclick="editItem('${r.id}')">✏️</button>
                    <button class="btn btn-sm btn-outline-danger border-0" onclick="deleteItem('${r.id}')">🗑️</button>
                </div></td></tr>`;
        }).join('');
    }

    const currentDebts = baseFiltered.filter(d => (parseInt(d.chromebooks || 0) + parseInt(d.reemplazo || 0)) > parseInt(d.devueltos || 0) && !d.observacion.toLowerCase().includes("dañada"));
    const banner = document.getElementById('debtBanner');
    if(banner) {
        if(currentDebts.length > 0) {
            banner.style.display = 'block';
            document.getElementById('debtText').innerText = `⚠️ Franco, tienes ${currentDebts.length} préstamos pendientes en ${mNames[viewDate.getMonth()]}.`;
        } else banner.style.display = 'none';
    }

    updateKPIs(baseFiltered);
    updateCharts(finalFiltered, baseFiltered);
}

// 3. Actualización de indicadores (KPIs)
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

// 4. Gráficos de barra y dona (Corregido el error de la variable r)
function updateCharts(data, base) {
    const dS = {}; data.forEach(d => { dS[d.profesor] = (dS[d.profesor]||0)+1; });
    const ctxDocente = document.getElementById('chartDocente');
    if(ctxDocente) {
        if(charts.D) charts.D.destroy();
        charts.D = new Chart(ctxDocente, { type: 'bar', data: { labels: Object.keys(dS), datasets: [{data: Object.values(dS), backgroundColor: '#0d6832', borderRadius: 5}]}, options: {indexAxis:'y', maintainAspectRatio: false, plugins:{legend:false}}});
    }

    // CORRECCIÓN AQUÍ: Cambiado r.reemplazo por d.reemplazo
    const ok = base.filter(d => (parseInt(d.chromebooks) + parseInt(d.reemplazo || 0)) === parseInt(d.devueltos)).length;
    const pending = base.length - ok;
    const ctxStatus = document.getElementById('chartStatus');
    if(ctxStatus) {
        if(charts.S) charts.S.destroy();
        charts.S = new Chart(ctxStatus, { type: 'doughnut', data: { labels: ['OK', 'Pendiente'], datasets: [{ data: [ok, pending], backgroundColor: ['#198754', '#ffc107'], borderWidth: 0 }]}, options: { maintainAspectRatio: false, cutout: '70%' }});
    }
}

// 5. Gráfico Anual
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

// Funciones de navegación y Modal
function moveMonth(n) { viewDate.setMonth(viewDate.getMonth() + n); renderAll(); }
function setFilterWeek(w) { currentWeek = w; renderAll(); }
function setFilterMode(m) { filterMode = m; renderAll(); }
function resetApp() { filterMode = 'all'; currentWeek = 0; renderAll(); }

function openModal() { 
    document.getElementById('resForm').reset(); 
    document.getElementById('fId').value = ''; 
    new bootstrap.Modal(document.getElementById('resModal')).show(); 
}

async function saveData() {
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
        bootstrap.Modal.getInstance(document.getElementById('resModal')).hide();
        load();
    } catch(e) { alert("Error al guardar"); }
    document.getElementById('loading').style.display = 'none';
}

function validateCounts() {
    const chr = parseInt(document.getElementById('fChr').value || 0);
    const ree = parseInt(document.getElementById('fRee').value || 0);
    const dev = parseInt(document.getElementById('fDev').value || 0);
    document.getElementById('valMsg').style.display = (dev !== (chr + ree)) ? 'block' : 'none';
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
    new bootstrap.Modal(document.getElementById('resModal')).show();
}

async function deleteItem(id) {
    if(!confirm("¿Eliminar registro?")) return;
    document.getElementById('loading').style.display = 'flex';
    try {
        await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', id: id }) });
        load();
    } catch(e) { alert("Error"); }
    document.getElementById('loading').style.display = 'none';
}

// Iniciar al cargar la página
window.onload = load;
