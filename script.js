/* ========================================================================== */
/* CAPÍTULO 1: ESTADO GLOBAL E PERSISTÊNCIA (BANCO DE DADOS LOCAL)            */
/* ========================================================================== */

let appState = {
    config: {
        dataInicio: '',
        dataFim: '',
        maxMaterias: 3,
        minutosSessao: 60,
        questoesSessao: 15,
        matrizSemanal: {
            seg: { tipo: 'teoria', slots: 3 },
            ter: { tipo: 'teoria', slots: 3 },
            qua: { tipo: 'teoria', slots: 3 },
            qui: { tipo: 'teoria', slots: 3 },
            sex: { tipo: 'questoes', slots: 3 },
            sab: { tipo: 'manutencao', slots: 3 },
            dom: { tipo: 'descanso', slots: 0 }
        }
    },
    materias:[], 
    // Ex: { id, nome, peso, sessoes, questoes } (A ordem no array dita a fila de prioridade)
    registros:[] 
    // Ex: { id, data, idMateria, tipo: 'teoria'|'questoes'|'manutencao', quantidade, comentario }
};

const STORAGE_KEY = 'plannerEstudosV2';

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

function loadData() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        // Deep merge para garantir que objetos aninhados não quebrem
        const parsed = JSON.parse(saved);
        appState = { 
            ...appState, 
            ...parsed,
            config: { ...appState.config, ...(parsed.config || {}) }
        };
    }
}

// Data atual no formato YYYY-MM-DD
function getTodayStr() {
    return new Date().toISOString().split('T')[0];
}

// Variáveis de Paginação do Diário
let diarioCurrentPage = 1;
let diarioItemsPerPage = 20;

/* ========================================================================== */
/* CAPÍTULO 2: REFERÊNCIAS DO DOM                                             */
/* ========================================================================== */

const views = document.querySelectorAll('.view');
const navItems = document.querySelectorAll('.nav-item');

// Botões Globais
const btnNovo = document.getElementById('btn-novo');
const btnAbrir = document.getElementById('btn-abrir');
const btnSalvar = document.getElementById('btn-salvar');

// Variáveis Globais para os Gráficos do Chart.js
let chart7DiasInstance = null;
let chartMateriasInstance = null;

// Formulários e Modais
const modalMateria = document.getElementById('modal-materia');
const formMateria = document.getElementById('form-materia');
const modalRegistro = document.getElementById('modal-registro');
const formRegistro = document.getElementById('form-registro');
const modalConfirm = document.getElementById('modal-confirm');
const fabAddMateria = document.getElementById('fab-add-materia'); // NOVO: FAB Matéria
const fabAddRegistro = document.getElementById('fab-add-registro'); // NOVO: FAB Registro
let editingMateriaId = null;
let editingRegistroId = null;

// Callback para o Modal de Confirmação Genérico
let confirmActionCallback = null;

// Configurações (Wizard)
const formConfig = document.getElementById('form-config');
const btnSalvarConfig = document.getElementById('btn-salvar-config');
const alertaMatriz = document.getElementById('alerta-matriz');
const matrizSemanalContainer = document.getElementById('matriz-semanal-container'); // NOVO: Container para event delegation

// View: Cronograma
const containerHojeSlots = document.getElementById('hoje-slots-container');
const lblDiaHoje = document.getElementById('lbl-dia-hoje');

// View: Meu Plano (Fila)
const listaMateriasDrag = document.getElementById('lista-materias-drag');

// View: Diário
const tabelaHistoricoBody = document.querySelector('#tabela-historico tbody');


/* ========================================================================== */
/* CAPÍTULO 3: MOTOR LÓGICO (A INTELIGÊNCIA DA SUGAR MOMMY)                   */
/* ========================================================================== */

// Analisa os registros e diz como está cada matéria
function getEstatisticasMaterias() {
    let stats = {};
    
    // Inicializa zerado
    appState.materias.forEach(m => {
        stats[m.id] = { 
            teoriaFeita: 0, 
            questoesFeitas: 0, 
            manutencaoFeita: 0,
            ultimaAtividade: null // Para calcular carência de manutenção
        };
    });

    // Soma os registros
    appState.registros.forEach(r => {
        if (!stats[r.idMateria]) return;
        
        const qtd = Number(r.quantidade);
        if (r.tipo === 'teoria' || r.tipo === 'sessoes') stats[r.idMateria].teoriaFeita += qtd;
        if (r.tipo === 'questoes') stats[r.idMateria].questoesFeitas += qtd;
        if (r.tipo === 'manutencao') stats[r.idMateria].manutencaoFeita += qtd;

        // Atualiza a data da última atividade
        if (!stats[r.idMateria].ultimaAtividade || new Date(r.data) > new Date(stats[r.idMateria].ultimaAtividade)) {
            stats[r.idMateria].ultimaAtividade = r.data;
        }
    });

    return stats;
}

// Classifica as matérias (Ativas, Espera, Manutenção)
function classificarFila() {
    const stats = getEstatisticasMaterias();
    const hoje = new Date(getTodayStr());

    let ativas = [];
    let espera = [];
    let concluidas = []; 
    let manutencao = []; 

    appState.materias.forEach(mat => {
        const s = stats[mat.id];
        
        const metaTeoria = Number(mat.sessoes) || 0;
        const metaQuestoes = Number(mat.questoes) || 0;
        
        // TRAVA DE SEGURANÇA: Só avalia se tiver definido pelo menos 1 meta
        const temMeta = metaTeoria > 0 || metaQuestoes > 0;
        
        const teoriaConcluida = s.teoriaFeita >= metaTeoria;
        const questoesConcluidas = s.questoesFeitas >= metaQuestoes;

        if (temMeta && teoriaConcluida && questoesConcluidas) {
            concluidas.push(mat);
            
            // Verifica carência para entrar na manutenção (7 dias)
            if (s.ultimaAtividade) {
                const dataUltima = new Date(s.ultimaAtividade);
                const diffDias = Math.floor((hoje - dataUltima) / (1000 * 60 * 60 * 24));
                if (diffDias >= 7) manutencao.push(mat);
            } else {
                manutencao.push(mat); // Finalizada sem registro de data entra direto
            }
        } else {
            // Se chegou aqui, ainda não terminou tudo (ou a meta é zero)
            if (ativas.length < Number(appState.config.maxMaterias)) {
                ativas.push(mat); // Ocupa uma vaga ativa
            } else {
                espera.push(mat); // Fila de espera
            }
        }
    });

    return { ativas, espera, concluidas, manutencao, stats };
}

// Ajusta a matriz semanal se a Manutenção estourar
function getMatrizAjustada(manutencaoMatters) {
    let matriz = JSON.parse(JSON.stringify(appState.config.matrizSemanal)); // Cópia
    const dias = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
    
    // Calcula quantas sessões de manutenção existem atualmente
    let slotsManut = 0;
    dias.forEach(d => { if (matriz[d].tipo === 'manutencao') slotsManut += matriz[d].slots; });

    // Se temos mais matérias na manutenção do que sessões, o app ROUBA o dia
    if (manutencaoMatters.length > slotsManut && slotsManut > 0) {
        
        let lastTeoria = null;
        let lastQuestoes = null;

        dias.forEach(d => {
            if (matriz[d].tipo === 'teoria') lastTeoria = d;
            if (matriz[d].tipo === 'questoes') lastQuestoes = d;
        });

        // O app empurra os dias para manter a cronologia T -> Q -> M
        if (lastTeoria && lastQuestoes) {
            matriz[lastTeoria].tipo = 'questoes'; // Quinta vira Questões
            matriz[lastQuestoes].tipo = 'manutencao'; // Sexta vira Manutenção
            
            // Aviso silencioso no painel
            showToast('Sua rotina foi autoajustada para suportar a carga de revisões.', 'info');
        }
    }
    return matriz;
}

// O Motor que gera as sessões para um determinado dia
function gerarSessoesDoDia(dataString, classificacao, matrizAjustada) {
    const daysMap = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    const diaDaSemana = daysMap[new Date(dataString + 'T00:00:00').getDay()];
    const configDia = matrizAjustada[diaDaSemana];

    let slotsGerados = [];

    if (configDia.slots === 0 || configDia.tipo === 'descanso') return slotsGerados;

    // Cria uma semente baseada na data para que o rodízio continue flutuando pelos dias
    const epochDays = Math.floor(new Date(dataString + 'T00:00:00').getTime() / 86400000);

    // ALOCAÇÃO DE TEORIA (Rodízio Contínuo)
    if (configDia.tipo === 'teoria') {
        let ativasTeoria = classificacao.ativas.filter(m => classificacao.stats[m.id].teoriaFeita < Number(m.sessoes));
        if (ativasTeoria.length > 0) {
            let index = (epochDays * configDia.slots) % ativasTeoria.length;
            for (let i = 0; i < configDia.slots; i++) {
                const mat = ativasTeoria[index % ativasTeoria.length];
                slotsGerados.push({ idMateria: mat.id, nome: mat.nome, tipo: 'teoria' });
                index++;
            }
        }
    }

    // ALOCAÇÃO DE QUESTÕES (Rodízio Contínuo)
    if (configDia.tipo === 'questoes') {
        let ativasQuestoes = classificacao.ativas.filter(m => classificacao.stats[m.id].questoesFeitas < Number(m.questoes));
        if (ativasQuestoes.length > 0) {
            let index = (epochDays * configDia.slots) % ativasQuestoes.length;
            for (let i = 0; i < configDia.slots; i++) {
                const mat = ativasQuestoes[index % ativasQuestoes.length];
                slotsGerados.push({ idMateria: mat.id, nome: mat.nome, tipo: 'questoes' });
                index++;
            }
        }
    }

    // ALOCAÇÃO DE MANUTENÇÃO (Peso 3 primeiro)
    if (configDia.tipo === 'manutencao') {
        if (classificacao.manutencao.length > 0) {
            let manuts = [...classificacao.manutencao].sort((a, b) => Number(b.peso) - Number(a.peso));
            let index = (epochDays * configDia.slots) % manuts.length;
            for (let i = 0; i < configDia.slots; i++) {
                const mat = manuts[index % manuts.length];
                slotsGerados.push({ idMateria: mat.id, nome: mat.nome, tipo: 'manutencao' });
                index++;
            }
        }
    }

    return slotsGerados;
}

/* ========================================================================== */
/* CAPÍTULO 4: RENDERIZADORES DE TELA (UI)                                    */
/* ========================================================================== */

function renderConfig() {
    const c = appState.config;
    document.getElementById('cfg-data-inicio').value = c.dataInicio;
    document.getElementById('cfg-data-fim').value = c.dataFim;
    document.getElementById('cfg-max-materias').value = c.maxMaterias || 3;
    
    document.getElementById('cfg-minutos-sessao').value = c.minutosSessao;
    document.getElementById('out-minutos').innerText = c.minutosSessao + ' min';
    
    document.getElementById('cfg-questoes-sessao').value = c.questoesSessao;
    document.getElementById('out-questoes').innerText = c.questoesSessao + ' q.';

    const dias = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
    dias.forEach(d => {
        if (c.matrizSemanal[d]) {
            const radio = document.querySelector(`input[name="cfg-${d}-tipo"][value="${c.matrizSemanal[d].tipo}"]`);
            if (radio) radio.checked = true;
            document.getElementById(`cfg-${d}-slots`).value = c.matrizSemanal[d].slots;
        }
    });

    if (btnSalvarConfig) {
        btnSalvarConfig.disabled = true;
        btnSalvarConfig.innerHTML = '<span class="material-symbols-outlined">check</span> Configurações Salvas';
        btnSalvarConfig.classList.remove('btn-success');
        btnSalvarConfig.classList.add('btn-primary');
    }
}

// Renderiza a Tabela de Matérias com Cores e Data-Labels (Mobile)
function renderPlan() {
    listaMateriasDrag.innerHTML = '';
    
    if (appState.materias.length === 0) {
        listaMateriasDrag.innerHTML = `
            <tr class="empty-state">
                <td colspan="7" class="text-center">
                    <div class="empty-state-container">
                        <span class="material-symbols-outlined empty-icon">inventory_2</span>
                        <p>Nenhuma matéria cadastrada ainda. Clique em "Nova Matéria" para começar.</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    // --- 1. LÓGICA DE AUTO-REBAIXAMENTO ---
    let statsCurrent = getEstatisticasMaterias();
    let incompletas = [];
    let concluidas = [];
    
    appState.materias.forEach(mat => {
        const st = statsCurrent[mat.id];
        const metaT = Number(mat.sessoes) || 0;
        const metaQ = Number(mat.questoes) || 0;
        const isConcluida = (metaT > 0 || metaQ > 0) && (st.teoriaFeita >= metaT && st.questoesFeitas >= metaQ);
        
        if (isConcluida) concluidas.push(mat);
        else incompletas.push(mat);
    });

    const novaFila = [...incompletas, ...concluidas];
    
    const ordemMudou = appState.materias.some((m, i) => m.id !== novaFila[i].id);
    if (ordemMudou) {
        appState.materias = novaFila;
        saveData();
    }

    // --- 2. RENDERIZAÇÃO DA TABELA ---
    const limit = Number(appState.config.maxMaterias);
    const hasWaitlist = incompletas.length > limit;
    
    let activeRendered = 0; 
    let linhaFinalizadasCriada = false;

    appState.materias.forEach((mat) => {
        const stats = statsCurrent[mat.id];
        const metaT = Number(mat.sessoes) || 0;
        const metaQ = Number(mat.questoes) || 0;
        const isConcluida = (metaT > 0 || metaQ > 0) && (stats.teoriaFeita >= metaT && stats.questoesFeitas >= metaQ);
        
        if (isConcluida && !linhaFinalizadasCriada) {
            const cutLineFinalizadas = document.createElement('tr');
            cutLineFinalizadas.className = 'row-cut-off';
            cutLineFinalizadas.innerHTML = `<td colspan="7"><div class="cut-off-divider">Matérias Finalizadas (Apenas Revisão)</div></td>`;
            listaMateriasDrag.appendChild(cutLineFinalizadas);
            linhaFinalizadasCriada = true;
        }

        const percT = metaT > 0 ? Math.min(stats.teoriaFeita / metaT, 1) : 1; 
        const percQ = metaQ > 0 ? Math.min(stats.questoesFeitas / metaQ, 1) : 1;
        
        let percentualFinal = 0;
        if (metaT === 0 && metaQ === 0) percentualFinal = 0;
        else if (metaT > 0 && metaQ > 0) percentualFinal = ((percT + percQ) / 2) * 100;
        else if (metaT > 0) percentualFinal = percT * 100;
        else percentualFinal = percQ * 100;

        const colorBar = percentualFinal === 100 ? 'var(--color-success)' : 'var(--color-primary)';
        
        let pesoVisual = '';
        if (mat.peso == 3) pesoVisual = `<span class="badge-peso badge-high">Alta</span>`;
        else if (mat.peso == 2) pesoVisual = `<span class="badge-peso badge-medium">Média</span>`;
        else pesoVisual = `<span class="badge-peso badge-low">Baixa</span>`;

        let badge = '';
        let rowColorClass = '';
        
        if (isConcluida) {
            badge = `<span class="status-badge" style="background: #DCFCE7; color: #166534;">Finalizada</span>`;
            rowColorClass = 'row-completed';
        } else {
            activeRendered++; 
            if (activeRendered <= limit) {
                badge = `<span class="status-badge" style="background: #DBEAFE; color: #1E40AF;">Ativa</span>`;
                rowColorClass = 'row-active';
            } else {
                badge = `<span class="status-badge" style="background: #F1F5F9; color: #475569;">Espera</span>`;
                rowColorClass = 'row-waitlist';
            }
        }

        const tr = document.createElement('tr');
        tr.dataset.id = mat.id;
        tr.className = rowColorClass;
        
        tr.innerHTML = `
            <td class="drag-handle" title="Arraste para reordenar"><span class="material-symbols-outlined">drag_indicator</span></td>
            <td data-label="Matéria">
                <!-- Conteúdo para o card mobile -->
                <strong>${mat.nome}</strong> ${badge}
                <!-- Fim do conteúdo para card mobile -->
            </td>
            <td data-label="Prioridade">
                <!-- Conteúdo para o card mobile -->
                <span class="card-label">Prioridade</span>
                <!-- Fim do conteúdo para card mobile -->
                ${pesoVisual}
            </td>
            <td data-label="Teoria">
                <!-- Conteúdo para o card mobile -->
                <span class="card-label">Teoria</span>
                <!-- Fim do conteúdo para card mobile -->
                ${stats.teoriaFeita} / ${mat.sessoes}
            </td>
            <td data-label="Questões">
                <!-- Conteúdo para o card mobile -->
                <span class="card-label">Questões</span>
                <!-- Fim do conteúdo para card mobile -->
                ${stats.questoesFeitas} / ${mat.questoes}
            </td>
            <td data-label="Progresso">
                <div class="table-progress-container">
                    <div class="table-progress-text">${Math.floor(percentualFinal)}%</div>
                    <div class="table-progress-bg">
                        <div class="table-progress-fill" style="width: ${percentualFinal}%; background-color: ${colorBar};"></div>
                    </div>
                </div>
            </td>
            <td data-label="Ações" class="text-center">
                <button class="btn btn-icon" onclick="editMateria('${mat.id}')" title="Editar" style="color: var(--color-primary);"><span class="material-symbols-outlined icon-sm">edit</span></button>
                <button class="btn btn-icon" onclick="deleteMateria('${mat.id}')" title="Excluir" style="color: var(--color-danger);"><span class="material-symbols-outlined icon-sm">delete</span></button>
            </td>
        `;

        listaMateriasDrag.appendChild(tr);

        if (!isConcluida && activeRendered === limit && hasWaitlist) {
            const cutLine = document.createElement('tr');
            cutLine.className = 'row-cut-off';
            cutLine.innerHTML = `<td colspan="7"><div class="cut-off-divider">Em Andamento ↑ | Linha de Espera ↓</div></td>`;
            listaMateriasDrag.appendChild(cutLine);
        }
    });
}

function renderCronograma() {
    const hojeStr = getTodayStr();
    const classificacao = classificarFila();
    const matrizAjustada = getMatrizAjustada(classificacao.manutencao);

    // 1. RENDERIZA FOCO DE HOJE
    containerHojeSlots.innerHTML = '';
    
    const slotsDeHoje = gerarSessoesDoDia(hojeStr, classificacao, matrizAjustada);
    const feitosHoje = appState.registros.filter(r => r.data === hojeStr);
    
    let slotsConsumidos = { teoria: {}, questoes: {}, manutencao: {} };
    feitosHoje.forEach(r => {
        let t = r.tipo === 'sessoes' ? 'teoria' : r.tipo; 
        if (!slotsConsumidos[t][r.idMateria]) slotsConsumidos[t][r.idMateria] = 0;
        slotsConsumidos[t][r.idMateria] += Number(r.quantidade);
    });

    if (slotsDeHoje.length === 0) {
        containerHojeSlots.innerHTML = `
            <div class="empty-state-container card text-center full-width" style="margin:0;">
                <span class="material-symbols-outlined empty-icon">celebration</span>
                <p>Nenhuma sessão programada para hoje. Curta seu dia livre!</p>
            </div>`;
    } else {
        slotsDeHoje.forEach((slot, index) => {
            let isDone = false;
            if (slotsConsumidos[slot.tipo] && slotsConsumidos[slot.tipo][slot.idMateria] > 0) {
                isDone = true;
                slotsConsumidos[slot.tipo][slot.idMateria] -= 1;
            }

            const card = document.createElement('div');
            card.className = `slot-card slot-${slot.tipo} ${isDone ? 'slot-done' : ''}`;
            
            const txtTipo = slot.tipo === 'teoria' ? 'Sessão de Teoria' : slot.tipo === 'questoes' ? 'Sessão de Questões' : 'Sessão de Revisão';
            const iconBtn = isDone ? 'check' : 'play_arrow';
            
            card.innerHTML = `
                <div class="slot-header">
                    <span>Sessão ${index + 1}</span>
                    <span>${txtTipo}</span>
                </div>
                <div class="slot-title">${slot.nome}</div>
                <div class="slot-action-btn" title="${isDone ? 'Concluído' : 'Marcar como Feito'}">
                    <span class="material-symbols-outlined">${iconBtn}</span>
                </div>
            `;

            // Ação de Clique com Animação de Dopamina
            if (!isDone) {
                card.addEventListener('click', () => {
                    showConfirmModal(`Confirmar a conclusão da sessão de ${slot.nome}?`, () => {
                        card.classList.add('anim-success');
                        setTimeout(() => {
                            const novoReg = {
                                id: Date.now().toString(),
                                data: hojeStr,
                                idMateria: slot.idMateria,
                                tipo: slot.tipo,
                                quantidade: 1,
                                comentario: 'Feito pelo Cronograma'
                            };
                            appState.registros.push(novoReg);
                            saveData();
                            renderAll();
                            showToast(`Mandou bem! Sessão de ${slot.nome} concluída.`, 'success');
                        }, 500);
                    });
                });
            }

            containerHojeSlots.appendChild(card);
        });
    }

    // 2. RENDERIZA VISÃO DA SEMANA (TIMELINE)
    const containerSemana = document.getElementById('timeline-semana');
    if (containerSemana) {
        containerSemana.innerHTML = '';
        const dateCursor = new Date(hojeStr + 'T00:00:00');
        
        for (let i = 0; i < 7; i++) {
            const dStr = dateCursor.toISOString().split('T')[0];
            const displayData = dStr.split('-').reverse().join('/');
            
            const daysMap = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
            const nomeDia = daysMap[dateCursor.getDay()];
            const isToday = i === 0;
            
            const slotsProg = gerarSessoesDoDia(dStr, classificacao, matrizAjustada);
            const configRaw = matrizAjustada[['dom','seg','ter','qua','qui','sex','sab'][dateCursor.getDay()]];
            
            let displayTipo = configRaw.tipo === 'manutencao' ? 'revisão' : configRaw.tipo;
            
            let visualFila = slotsProg.length === 0 ? '<span class="text-sm text-muted">Nenhuma sessão programada.</span>' : '';
            slotsProg.forEach(s => {
                visualFila += `<span class="tag-atividade tag-${s.tipo}" title="${s.nome}">${s.nome.substring(0, 18)}${s.nome.length > 18 ? '...' : ''}</span>`;
            });

            const htmlItem = `
                <div class="timeline-item ${isToday ? 'is-today' : ''}">
                    <div class="timeline-date">
                        <strong>${nomeDia}</strong>
                        <small>${isToday ? 'Hoje' : displayData}</small>
                    </div>
                    <div class="timeline-marker">
                        <div class="timeline-dot"></div>
                        <div class="timeline-line"></div>
                    </div>
                    <div class="timeline-content">
                        <span class="timeline-title">${displayTipo} (${configRaw.slots} sessões)</span>
                        <div class="timeline-tags">
                            ${visualFila}
                        </div>
                    </div>
                </div>
            `;
            
            containerSemana.innerHTML += htmlItem;
            dateCursor.setDate(dateCursor.getDate() + 1);
        }
    }
}

function renderDashboard() {
    const stats = getEstatisticasMaterias();
    const classificacao = classificarFila();
    
    let teoriaTotalPlan = 0, teoriaTotalFeita = 0;
    let questoesTotalPlan = 0, questoesTotalFeitas = 0;
    let manutencaoTotalFeita = 0;

    appState.materias.forEach(m => {
        teoriaTotalPlan += Number(m.sessoes);
        questoesTotalPlan += Number(m.questoes);
        if (stats[m.id]) {
            teoriaTotalFeita += stats[m.id].teoriaFeita;
            questoesTotalFeitas += stats[m.id].questoesFeitas;
            manutencaoTotalFeita += stats[m.id].manutencaoFeita;
        }
    });

    const progressoTeoria = teoriaTotalPlan > 0 ? (teoriaTotalFeita / teoriaTotalPlan) * 100 : 0;
    
    const cards = document.querySelectorAll('.summary-card .metric');
    if (cards.length >= 3) {
        cards[0].textContent = progressoTeoria.toFixed(1).replace('.', ',') + '%';
        cards[1].textContent = classificacao.concluidas.length;
        
        const d1 = new Date(appState.config.dataInicio + 'T00:00:00');
        const d2 = new Date(appState.config.dataFim + 'T00:00:00');
        const diffSemanas = Math.max(0, Math.ceil((d2 - new Date()) / (1000 * 60 * 60 * 24) / 7));
        cards[2].textContent = isNaN(diffSemanas) ? '0' : diffSemanas;
    }

    const phTeoria = document.querySelector('#card-prog-teoria .progress-wrapper');
    const phQuestoes = document.querySelector('#card-prog-questoes .progress-wrapper');
    const phManut = document.querySelector('#card-prog-manutencao .progress-wrapper');

    if (phTeoria) {
        const percT = Math.min(progressoTeoria, 100);
        phTeoria.innerHTML = `
            <div class="flex-between mb-2 text-sm">
                <span class="text-muted">Progresso</span>
                <span><strong>${teoriaTotalFeita}</strong> / ${teoriaTotalPlan}</span>
            </div>
            <div style="width: 100%; height: 30px; background: #E2E8F0; border-radius: 4px; overflow: hidden;">
                <div style="width: ${percT}%; height: 100%; background: var(--color-primary); transition: width 0.5s ease;"></div>
            </div>`;
    }

    if (phQuestoes) {
        const progressoQ = questoesTotalPlan > 0 ? (questoesTotalFeitas / questoesTotalPlan) * 100 : 0;
        const percQ = Math.min(progressoQ, 100);
        phQuestoes.innerHTML = `
            <div class="flex-between mb-2 text-sm">
                <span class="text-muted">Progresso</span>
                <span><strong>${questoesTotalFeitas}</strong> / ${questoesTotalPlan}</span>
            </div>
            <div style="width: 100%; height: 30px; background: #E2E8F0; border-radius: 4px; overflow: hidden;">
                <div style="width: ${percQ}%; height: 100%; background: var(--color-warning); transition: width 0.5s ease;"></div>
            </div>`;
    }

    if (phManut) {
        const tamanhoCiclo = 10;
        let metaAtual = Math.ceil((manutencaoTotalFeita + 1) / tamanhoCiclo) * tamanhoCiclo;
        if (manutencaoTotalFeita === 0) metaAtual = tamanhoCiclo; 
        
        const percM = manutencaoTotalFeita === 0 ? 0 : ((manutencaoTotalFeita % tamanhoCiclo) || tamanhoCiclo) / tamanhoCiclo * 100;

        phManut.innerHTML = `
            <div class="flex-between mb-2 text-sm">
                <span class="text-muted">Rumo a ${metaAtual} sessões</span>
                <span><strong>${manutencaoTotalFeita}</strong> executadas</span>
            </div>
            <div style="width: 100%; height: 30px; background: #E2E8F0; border-radius: 4px; overflow: hidden;">
                <div style="width: ${percM}%; height: 100%; background: var(--color-success); transition: width 0.5s ease;"></div>
            </div>`;
    }

    const last7DaysStrs = [];
    const last7DaysLabels = [];
    const dataTeoria = [0,0,0,0,0,0,0];
    const dataQuestoes = [0,0,0,0,0,0,0];
    const dataManut = [0,0,0,0,0,0,0];

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last7DaysStrs.push(d.toISOString().split('T')[0]);
        last7DaysLabels.push(d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}));
    }

    appState.registros.forEach(r => {
        const indexDate = last7DaysStrs.indexOf(r.data);
        if (indexDate > -1) {
            const qtd = Number(r.quantidade);
            if (r.tipo === 'teoria' || r.tipo === 'sessoes') dataTeoria[indexDate] += qtd;
            if (r.tipo === 'questoes') dataQuestoes[indexDate] += qtd;
            if (r.tipo === 'manutencao') dataManut[indexDate] += qtd;
        }
    });

    const labelsMaterias = [];
    const dataMateriasSessoes = [];
    
    appState.materias.forEach(mat => {
        labelsMaterias.push(mat.nome.length > 40 ? mat.nome.substring(0, 40) + '...' : mat.nome);
        const tFeita = stats[mat.id] ? stats[mat.id].teoriaFeita : 0;
        const mFeita = stats[mat.id] ? stats[mat.id].manutencaoFeita : 0;
        dataMateriasSessoes.push(tFeita + mFeita); 
    });

    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = '#64748B'; 

    const ctx7Dias = document.getElementById('chart-7-dias');
    if (ctx7Dias) {
        if (chart7DiasInstance) chart7DiasInstance.destroy(); 
        
        const questoesPorSessao = Number(appState.config.questoesSessao) || 15;

        chart7DiasInstance = new Chart(ctx7Dias, {
            type: 'bar',
            data: {
                labels: last7DaysLabels,
                datasets: [
                    { label: 'Teoria', data: dataTeoria, backgroundColor: '#2563EB' },
                    { 
                        label: 'Questões', 
                        data: dataQuestoes.map(q => q / questoesPorSessao), 
                        backgroundColor: '#F59E0B',
                        rawQuestions: dataQuestoes 
                    },
                    { label: 'Revisão', data: dataManut, backgroundColor: '#10B981' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: { 
                        stacked: true, 
                        beginAtZero: true, 
                        border: { dash: [4, 4] },
                        title: { display: true, text: 'Volume (Em sessões)' } 
                    }
                },
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                if (context.dataset.label === 'Questões') {
                                    const rawValue = context.dataset.rawQuestions[context.dataIndex];
                                    const normValue = context.raw.toFixed(1).replace('.0', '');
                                    return `Questões: ${rawValue} resolvidas (~${normValue} sessões)`;
                                } else {
                                    return `${context.dataset.label}: ${context.raw} sessões`;
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    const ctxMaterias = document.getElementById('chart-materias');
    if (ctxMaterias) {
        if (chartMateriasInstance) chartMateriasInstance.destroy();
        chartMateriasInstance = new Chart(ctxMaterias, {
            type: 'bar',
            data: {
                labels: labelsMaterias,
                datasets: [{
                    label: 'Total de Sessões Feitas (Teoria + Revisão)',
                    data: dataMateriasSessoes,
                    backgroundColor: '#1E293B',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { beginAtZero: true, border: { dash: [4, 4] } },
                    y: { grid: { display: false } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw} sessões concluídas` } }
                }
            }
        });
        
        const minHeight = 300;
        const calculatedHeight = Math.max(minHeight, labelsMaterias.length * 30);
        ctxMaterias.parentElement.style.height = `${calculatedHeight}px`;
    }
}

function renderDiary() {
    const select = document.getElementById('reg-materia');
    select.innerHTML = '<option value="" disabled selected>Selecione uma matéria...</option>';
    appState.materias.forEach(mat => {
        const opt = document.createElement('option');
        opt.value = mat.id;
        opt.textContent = mat.nome;
        select.appendChild(opt);
    });

    tabelaHistoricoBody.innerHTML = '';
    const paginationFooter = document.getElementById('diary-pagination');

    if (appState.registros.length === 0) {
        tabelaHistoricoBody.innerHTML = `
            <tr class="empty-state">
                <td colspan="5" class="text-center">
                    <div class="empty-state-container">
                        <span class="material-symbols-outlined empty-icon">history</span>
                        <p>Nenhum estudo registrado ainda.</p>
                    </div>
                </td>
            </tr>`;
        if (paginationFooter) paginationFooter.classList.add('hidden');
        return;
    }

    const sortRegs = [...appState.registros].sort((a,b) => new Date(b.data) - new Date(a.data));
    
    const totalItems = sortRegs.length;
    const totalPages = Math.ceil(totalItems / diarioItemsPerPage);

    if (diarioCurrentPage > totalPages) diarioCurrentPage = totalPages;
    if (diarioCurrentPage < 1) diarioCurrentPage = 1;

    const startIndex = (diarioCurrentPage - 1) * diarioItemsPerPage;
    const endIndex = startIndex + diarioItemsPerPage;
    const currentRegs = sortRegs.slice(startIndex, endIndex);
    
    currentRegs.forEach(reg => {
        const mat = appState.materias.find(m => m.id === reg.idMateria);
        const nomeMateria = mat ? mat.nome : '<Excluída>';
        const dt = reg.data.split('-').reverse().join('/');
        
        let t = 0, q = 0, m = 0;
        if (reg.tipo === 'teoria' || reg.tipo === 'sessoes') t = reg.quantidade;
        if (reg.tipo === 'questoes') q = reg.quantidade;
        if (reg.tipo === 'manutencao') m = reg.quantidade;

        let tagsAtividade = '';
        if (t > 0) tagsAtividade += `<span class="tag-atividade tag-teoria" style="margin-right:4px;">${t} Teoria</span>`;
        if (q > 0) tagsAtividade += `<span class="tag-atividade tag-questoes" style="margin-right:4px;">${q} Questões</span>`;
        if (m > 0) tagsAtividade += `<span class="tag-atividade tag-manutencao" style="margin-right:4px;">${m} Revisão</span>`;

        const tr = document.createElement('tr');
        
        // NOVO: Renderização otimizada para o card mobile do Diário
        tr.innerHTML = `
            <td data-label="Data">
                <div class="diary-card-header">
                    <span>${dt}</span>
                    <strong data-label="Matéria">${nomeMateria}</strong>
                </div>
            </td>
            <td data-label="Atividades">${tagsAtividade}</td>
            <td data-label="Comentário">${reg.comentario ? `<small class="text-muted">${reg.comentario}</small>`:''}</td>
            <td data-label="Ações" class="text-center">
                <button class="btn btn-icon" onclick="editRegistro('${reg.id}')" title="Editar" style="color: var(--color-primary);"><span class="material-symbols-outlined icon-sm">edit</span></button>
                <button class="btn btn-icon" onclick="deleteRegistro('${reg.id}')" title="Excluir" style="color: var(--color-danger);"><span class="material-symbols-outlined icon-sm">delete</span></button>
            </td>
        `;
        tabelaHistoricoBody.appendChild(tr);
    });

    if (paginationFooter) {
        paginationFooter.classList.remove('hidden');
        
        const infoText = document.getElementById('diary-page-info');
        const realEnd = Math.min(endIndex, totalItems);
        if (infoText) infoText.innerHTML = `Mostrando <strong>${startIndex + 1}</strong> a <strong>${realEnd}</strong> de <strong>${totalItems}</strong> registros`;

        const selectSize = document.getElementById('diary-page-size');
        if (selectSize && selectSize.value != diarioItemsPerPage) selectSize.value = diarioItemsPerPage;

        // ATUALIZADO: Controla o estado de todos os botões (desktop e mobile)
        const isFirstPage = diarioCurrentPage === 1;
        const isLastPage = diarioCurrentPage === totalPages;

        document.getElementById('btn-page-first').disabled = isFirstPage;
        document.getElementById('btn-page-prev').disabled = isFirstPage;
        document.getElementById('btn-page-prev-mobile').disabled = isFirstPage;

        document.getElementById('btn-page-next').disabled = isLastPage;
        document.getElementById('btn-page-last').disabled = isLastPage;
        document.getElementById('btn-page-next-mobile').disabled = isLastPage;
    }
}

window.changeDiaryPage = function(action) {
    const totalItems = appState.registros.length;
    const totalPages = Math.ceil(totalItems / diarioItemsPerPage);

    if (action === 'first') diarioCurrentPage = 1;
    else if (action === 'prev' && diarioCurrentPage > 1) diarioCurrentPage--;
    else if (action === 'next' && diarioCurrentPage < totalPages) diarioCurrentPage++;
    else if (action === 'last') diarioCurrentPage = totalPages;
    
    renderDiary(); 
};

window.changeDiaryPageSize = function(size) {
    diarioItemsPerPage = Number(size);
    diarioCurrentPage = 1; 
    renderDiary();
};

function renderAll() {
    renderConfig();
    renderPlan();
    renderCronograma();
    renderDashboard();
    renderDiary();
}

/* ========================================================================== */
/* CAPÍTULO 5: CONTROLADORES E AÇÕES (WIZARD E FORMS)                         */
/* ========================================================================== */

formConfig.addEventListener('input', () => {
    btnSalvarConfig.disabled = false;
    btnSalvarConfig.innerHTML = '<span class="material-symbols-outlined">save</span> Salvar Alterações';
});

formConfig.addEventListener('submit', (e) => {
    e.preventDefault(); 
    
    let slotsQ = 0;
    const maxMat = Number(document.getElementById('cfg-max-materias').value);
    const dias = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
    
    dias.forEach(d => {
        const tipo = document.querySelector(`input[name="cfg-${d}-tipo"]:checked`).value;
        const slots = Number(document.getElementById(`cfg-${d}-slots`).value);
        if (tipo === 'questoes') slotsQ += slots;
    });

    alertaMatriz.classList.add('hidden');
    if (slotsQ > 0 && slotsQ < maxMat) {
        alertaMatriz.innerHTML = `<strong>Atenção:</strong> Você definiu máximo de ${maxMat} matérias simultâneas, mas sua semana só tem ${slotsQ} sessões de Questões. Cada matéria ativa precisa de pelo menos 1 sessão de questões.`;
        alertaMatriz.classList.remove('hidden');
        return; 
    }

    appState.config.dataInicio = document.getElementById('cfg-data-inicio').value;
    appState.config.dataFim = document.getElementById('cfg-data-fim').value;
    appState.config.maxMaterias = Number(document.getElementById('cfg-max-materias').value);
    appState.config.minutosSessao = Number(document.getElementById('cfg-minutos-sessao').value);
    appState.config.questoesSessao = Number(document.getElementById('cfg-questoes-sessao').value);

    dias.forEach(d => {
        appState.config.matrizSemanal[d].tipo = document.querySelector(`input[name="cfg-${d}-tipo"]:checked`).value;
        appState.config.matrizSemanal[d].slots = Number(document.getElementById(`cfg-${d}-slots`).value);
    });

    saveData();
    renderAll();

    btnSalvarConfig.classList.remove('btn-primary');
    btnSalvarConfig.classList.add('btn-success');
    btnSalvarConfig.innerHTML = '<span class="material-symbols-outlined">done_all</span> Atualizado!';
    showToast('A Sugar Mommy recalculou seu plano.', 'success');

    setTimeout(() => renderConfig(), 2000);
});

// MATÉRIAS (FILA)
formMateria.addEventListener('submit', (e) => {
    e.preventDefault();
    const novaMateria = {
        id: editingMateriaId ? editingMateriaId : Date.now().toString(),
        nome: document.getElementById('mat-nome').value,
        peso: document.getElementById('mat-peso').value,
        sessoes: document.getElementById('mat-sessoes').value,
        questoes: document.getElementById('mat-questoes').value
    };

    if (editingMateriaId) {
        const index = appState.materias.findIndex(m => m.id === editingMateriaId);
        if (index > -1) appState.materias[index] = novaMateria;
    } else {
        appState.materias.push(novaMateria); 
    }

    saveData();
    renderAll();
    closeModal(modalMateria);
});

window.deleteMateria = function(id) {
    showConfirmModal('Excluir esta matéria e tirá-la da fila de estudos permanentemente?', () => {
        appState.materias = appState.materias.filter(m => m.id !== id);
        saveData();
        renderAll();
        showToast('Matéria excluída com sucesso.', 'info');
    });
};

window.editMateria = function(id) {
    const mat = appState.materias.find(m => m.id === id);
    if (!mat) return;
    
    editingMateriaId = id;
    document.getElementById('mat-nome').value = mat.nome;
    document.getElementById('mat-peso').value = mat.peso;
    document.getElementById('mat-sessoes').value = mat.sessoes;
    document.getElementById('mat-questoes').value = mat.questoes;
    
    document.getElementById('modal-materia-title').textContent = 'Editar Matéria';
    openModal(modalMateria);
};

// DIÁRIO MANUAL
formRegistro.addEventListener('submit', (e) => {
    e.preventDefault();
    const dadosRegistro = {
        id: editingRegistroId ? editingRegistroId : Date.now().toString(),
        data: document.getElementById('reg-data').value,
        idMateria: document.getElementById('reg-materia').value,
        tipo: document.getElementById('reg-tipo').value,
        quantidade: document.getElementById('reg-quantidade').value,
        comentario: document.getElementById('reg-comentario').value
    };

    if (editingRegistroId) {
        const index = appState.registros.findIndex(r => r.id === editingRegistroId);
        if (index > -1) appState.registros[index] = dadosRegistro;
        showToast('Registro atualizado.', 'success');
    } else {
        appState.registros.push(dadosRegistro);
        showToast('Registro manual salvo.', 'success');
    }

    saveData();
    renderAll();
    closeModal(modalRegistro);
});

window.editRegistro = function(id) {
    const reg = appState.registros.find(r => r.id === id);
    if (!reg) return;
    
    editingRegistroId = id;
    document.getElementById('reg-data').value = reg.data;
    document.getElementById('reg-materia').value = reg.idMateria;
    document.getElementById('reg-tipo').value = reg.tipo;
    document.getElementById('reg-quantidade').value = reg.quantidade;
    document.getElementById('reg-comentario').value = reg.comentario || '';
    
    document.getElementById('modal-registro-title').textContent = 'Editar Registro';
    openModal(modalRegistro);
};

window.deleteRegistro = function(id) {
    showConfirmModal('Desfazer este registro? O cronograma irá devolver esta sessão como pendente.', () => {
        appState.registros = appState.registros.filter(r => r.id !== id);
        saveData();
        renderAll();
        showToast('Registro excluído.', 'info');
    });
};

/* ========================================================================== */
/* CAPÍTULO 6: UI ROUTER E GESTÃO DE MODAIS                                   */
/* ========================================================================== */

function switchView(targetViewId) {
    views.forEach(view => view.classList.add('hidden'));
    const targetView = document.getElementById(targetViewId);
    if (targetView) targetView.classList.remove('hidden');
    renderAll();
}

function openModal(el) { if (el) el.classList.remove('hidden'); }

function closeModal(el) { 
    if (el) {
        el.classList.add('hidden');
        if(el.id === 'modal-materia') { 
            formMateria.reset(); 
            editingMateriaId = null; 
            document.getElementById('modal-materia-title').textContent = 'Adicionar Matéria';
        }
        if(el.id === 'modal-registro') { 
            formRegistro.reset(); 
            editingRegistroId = null;
            document.getElementById('modal-registro-title').textContent = 'Registro Manual';
        }
        if(el.id === 'modal-confirm') {
            confirmActionCallback = null;
        }
    }
}

// Modal de Confirmação Genérico
function showConfirmModal(message, callback) {
    document.getElementById('modal-confirm-message').textContent = message;
    confirmActionCallback = callback;
    openModal(modalConfirm);
}

document.getElementById('btn-aceitar-confirm')?.addEventListener('click', () => {
    if (confirmActionCallback) confirmActionCallback();
    closeModal(modalConfirm);
});

// Fechamento de modais via botões "data-target"
document.querySelectorAll('.modal-close-btn, .modal-cancel-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetId = e.currentTarget.getAttribute('data-target');
        closeModal(document.getElementById(targetId));
    });
});

// Fechamento de modais clicando fora da caixa de conteúdo (no overlay escuro)
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay);
    });
});

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';
    toast.innerHTML = `<span class="material-symbols-outlined" style="color: ${type === 'success' ? 'var(--color-success)' : 'inherit'}">${icon}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('animationend', () => toast.remove());
    }, 3000);
}

/* ========================================================================== */
/* CAPÍTULO 7: INICIALIZAÇÃO E EVENTOS GLOBAIS                                */
/* ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    loadData();
    renderAll();

    // Inicialização da biblioteca SortableJS para "Meu Plano"
    if (typeof Sortable !== 'undefined') {
        Sortable.create(document.getElementById('lista-materias-drag'), {
            handle: '.drag-handle',
            animation: 150, 
            ghostClass: 'sortable-ghost', 
            dragClass: 'sortable-drag', 
            filter: '.row-cut-off, .empty-state', 
            
            onEnd: function () {
                const linhasHTML = document.getElementById('lista-materias-drag').querySelectorAll('tr[data-id]');
                const novaOrdemIds = Array.from(linhasHTML).map(row => row.dataset.id);
                
                appState.materias.sort((a, b) => novaOrdemIds.indexOf(a.id) - novaOrdemIds.indexOf(b.id));
                
                saveData();
                renderAll(); 
                showToast('Fila reordenada.', 'success');
            }
        });
    }

    // Menu Sidebar
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            navItems.forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            switchView(this.getAttribute('data-target'));
        });
    });

    // Modais Form Buttons (Desktop)
    document.getElementById('btn-add-materia')?.addEventListener('click', () => openModal(modalMateria));
    document.getElementById('btn-add-registro')?.addEventListener('click', () => {
        document.getElementById('reg-data').value = getTodayStr();
        openModal(modalRegistro);
    });

    // --- SEÇÃO NOVA: Lógica para os componentes mobile-first ---
    // Floating Action Buttons
    fabAddMateria?.addEventListener('click', () => openModal(modalMateria));
    fabAddRegistro?.addEventListener('click', () => {
        document.getElementById('reg-data').value = getTodayStr();
        openModal(modalRegistro);
    });

    // Input Steppers (+/-) nas Configurações
    matrizSemanalContainer?.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-step');
        if (!btn) return;
    
        const input = btn.parentElement.querySelector('input[type="number"]');
        if (!input) return;
    
        let value = parseInt(input.value, 10) || 0;
        const min = parseInt(input.min, 10);
        const action = btn.dataset.action;
    
        if (action === 'increment') {
            value++;
        } else if (action === 'decrement' && value > min) {
            value--;
        }
    
        input.value = value;
        // Dispara um evento de 'input' para que o listener do formulário
        // detecte a mudança e habilite o botão de salvar.
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    
    // Arquivos IO
    btnSalvar.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
        const a = document.createElement('a');
        a.href = dataStr; a.download = "projeto_sugar_mommy.json";
        document.body.appendChild(a); a.click(); a.remove();
    });

    btnAbrir.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    appState = JSON.parse(e.target.result);
                    saveData(); renderAll();
                    showToast('Plano importado com sucesso!', 'success');
                } catch (err) { alert('Erro no arquivo.'); }
            };
            reader.readAsText(file);
        };
        input.click();
    });

    btnNovo.addEventListener('click', () => {
        showConfirmModal('Atenção: Criar um Novo Plano apagará todo o seu progresso atual permanentemente. Deseja continuar?', () => {
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        });
    });
});