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
        // Deep merge para garantir que objetos aninhados (como matrizSemanal) não quebrem
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


/* ========================================================================== */
/* CAPÍTULO 2: REFERÊNCIAS DO DOM                                             */
/* ========================================================================== */

const views = document.querySelectorAll('.view');
const navItems = document.querySelectorAll('.nav-item');

// Botões Globais
const btnNovo = document.getElementById('btn-novo');
const btnAbrir = document.getElementById('btn-abrir');
const btnSalvar = document.getElementById('btn-salvar');

// Formulários e Modais
const modalMateria = document.getElementById('modal-materia');
const formMateria = document.getElementById('form-materia');
const modalRegistro = document.getElementById('modal-registro');
const formRegistro = document.getElementById('form-registro');
let editingMateriaId = null;

// Configurações (Wizard)
const formConfig = document.getElementById('form-config');
const btnSalvarConfig = document.getElementById('btn-salvar-config');
const alertaMatriz = document.getElementById('alerta-matriz');

// View: Cronograma
const containerHojeSlots = document.getElementById('hoje-slots-container');
const tabelaSemanaBody = document.querySelector('#tabela-semana tbody');
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
    let espera =[];
    let concluidas = []; // Já terminaram Teoria E Questões
    let manutencao =[]; // Já passaram da carência de 7 dias

    appState.materias.forEach(mat => {
        const s = stats[mat.id];
        const teoriaConcluida = s.teoriaFeita >= Number(mat.sessoes);
        const questoesConcluidas = s.questoesFeitas >= Number(mat.questoes);

        if (teoriaConcluida && questoesConcluidas) {
            concluidas.push(mat);
            
            // Verifica carência para entrar na manutenção
            if (s.ultimaAtividade) {
                const dataUltima = new Date(s.ultimaAtividade);
                const diffDias = Math.floor((hoje - dataUltima) / (1000 * 60 * 60 * 24));
                if (diffDias >= 7) manutencao.push(mat);
            } else {
                manutencao.push(mat); // Finalizada sem registro de data (borda)
            }
        } else {
            // Se chegou aqui, ainda não terminou tudo
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
    const dias =['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
    
    // Calcula quantos slots de manutenção existem atualmente
    let slotsManut = 0;
    dias.forEach(d => { if (matriz[d].tipo === 'manutencao') slotsManut += matriz[d].slots; });

    // Se temos mais matérias na manutenção do que slots, o app ROUBA o dia
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

    let slotsGerados =[];

    if (configDia.slots === 0 || configDia.tipo === 'descanso') return slotsGerados;

    // ALOCAÇÃO DE TEORIA (Rodízio em Bloco)
    if (configDia.tipo === 'teoria') {
        // Filtra ativas que ainda precisam de teoria
        let ativasTeoria = classificacao.ativas.filter(m => {
            return classificacao.stats[m.id].teoriaFeita < Number(m.sessoes);
        });

        if (ativasTeoria.length > 0) {
            // Para fazer em "bloco" (A mesma matéria no dia todo), pegamos a mais atrasada
            // Ordena pela % de avanço para ver quem está precisando de tempo
            ativasTeoria.sort((a, b) => {
                const percA = classificacao.stats[a.id].teoriaFeita / (Number(a.sessoes) || 1);
                const percB = classificacao.stats[b.id].teoriaFeita / (Number(b.sessoes) || 1);
                if (percA !== percB) return percA - percB; 
                return Number(b.peso) - Number(a.peso); // Desempate por peso
            });

            // Preenche o bloco com a matéria escolhida
            const materiaEscolhida = ativasTeoria[0];
            for (let i = 0; i < configDia.slots; i++) {
                slotsGerados.push({ idMateria: materiaEscolhida.id, nome: materiaEscolhida.nome, tipo: 'teoria' });
            }
        }
    }

    // ALOCAÇÃO DE QUESTÕES (Distribuídas)
    if (configDia.tipo === 'questoes') {
        let ativasQuestoes = classificacao.ativas.filter(m => {
            return classificacao.stats[m.id].questoesFeitas < Number(m.questoes);
        });

        if (ativasQuestoes.length > 0) {
            let index = 0;
            for (let i = 0; i < configDia.slots; i++) {
                const mat = ativasQuestoes[index % ativasQuestoes.length];
                slotsGerados.push({ idMateria: mat.id, nome: mat.nome, tipo: 'questoes' });
                index++;
            }
        }
    }

    // ALOCAÇÃO DE MANUTENÇÃO (Peso 3 primeiro, ou mais tempo sem ver)
    if (configDia.tipo === 'manutencao') {
        if (classificacao.manutencao.length > 0) {
            // Ordena priorizando Peso 3
            let manuts = [...classificacao.manutencao].sort((a, b) => Number(b.peso) - Number(a.peso));
            
            let index = 0;
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
    document.getElementById('cfg-questoes-sessao').value = c.questoesSessao;

    const dias =['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
    dias.forEach(d => {
        if (c.matrizSemanal[d]) {
            document.getElementById(`cfg-${d}-tipo`).value = c.matrizSemanal[d].tipo;
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

// Renderiza a Tabela de Matérias com Drag and Drop interativo
function renderPlan() {
    listaMateriasDrag.innerHTML = '';
    
    if (appState.materias.length === 0) {
        listaMateriasDrag.innerHTML = `<tr class="empty-state"><td colspan="6" class="text-center">Nenhuma matéria na fila.</td></tr>`;
        return;
    }

    const classificacao = classificarFila();
    const limit = Number(appState.config.maxMaterias);

    appState.materias.forEach((mat, index) => {
        const stats = classificacao.stats[mat.id];
        const isConcluida = (stats.teoriaFeita >= mat.sessoes && stats.questoesFeitas >= mat.questoes);
        
        let badge = '';
        if (isConcluida) {
            badge = `<span class="status-badge" style="background: #DCFCE7; color: #166534;">Finalizada</span>`;
        } else if (index < limit) {
            badge = `<span class="status-badge" style="background: #DBEAFE; color: #1E40AF;">Ativa</span>`;
        } else {
            badge = `<span class="status-badge" style="background: #F1F5F9; color: #475569;">Espera</span>`;
        }

        const tr = document.createElement('tr');
        tr.draggable = true;
        tr.dataset.index = index;
        
        tr.innerHTML = `
            <td class="drag-handle" title="Arraste para reordenar"><span class="material-symbols-outlined">drag_indicator</span></td>
            <td><strong>${mat.nome}</strong> ${badge}</td>
            <td>${mat.peso}</td>
            <td>${stats.teoriaFeita} / ${mat.sessoes}</td>
            <td>${stats.questoesFeitas} / ${mat.questoes}</td>
            <td class="text-center">
                <button class="btn btn-icon" onclick="deleteMateria('${mat.id}')" title="Excluir" style="color: var(--color-danger);"><span class="material-symbols-outlined" style="font-size: 18px;">delete</span></button>
            </td>
        `;

        // Lógica Visual do Drag and Drop
        tr.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', index);
            tr.classList.add('tr-dragging');
        });
        tr.addEventListener('dragend', () => tr.classList.remove('tr-dragging'));
        tr.addEventListener('dragover', (e) => e.preventDefault());
        tr.addEventListener('drop', (e) => {
            e.preventDefault();
            const originIndex = Number(e.dataTransfer.getData('text/plain'));
            const targetIndex = index;
            
            // Reordena o array e salva
            const item = appState.materias.splice(originIndex, 1)[0];
            appState.materias.splice(targetIndex, 0, item);
            saveData();
            renderAll();
            showToast('Fila reordenada.', 'success');
        });

        listaMateriasDrag.appendChild(tr);

        // Insere a linha de corte se necessário
        if (!isConcluida && index === limit - 1 && appState.materias.length > limit) {
            const cutLine = document.createElement('tr');
            cutLine.className = 'row-cut-off';
            cutLine.innerHTML = `<td colspan="6">↑ Em Andamento | Linha de Espera ↓</td>`;
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
    
    // Pega as sessões planejadas para hoje
    const slotsDeHoje = gerarSessoesDoDia(hojeStr, classificacao, matrizAjustada);
    
    // Pega o que o usuário JÁ FEZ hoje (lendo os registros reais)
    const feitosHoje = appState.registros.filter(r => r.data === hojeStr);
    
    // Faz a correspondência (baixa) nos slots. 
    // Ex: Se planejou 2 de Teoria e já tem 1 registro de Teoria, 1 slot fica verde/concluído.
    let slotsConsumidos = { teoria: {}, questoes: {}, manutencao: {} };
    feitosHoje.forEach(r => {
        let t = r.tipo === 'sessoes' ? 'teoria' : r.tipo; // Normalização de legado
        if (!slotsConsumidos[t][r.idMateria]) slotsConsumidos[t][r.idMateria] = 0;
        slotsConsumidos[t][r.idMateria] += Number(r.quantidade);
    });

    if (slotsDeHoje.length === 0) {
        containerHojeSlots.innerHTML = `<div class="empty-state card text-center full-width" style="margin:0;">Nenhuma sessão programada para hoje. Curta seu dia!</div>`;
    } else {
        slotsDeHoje.forEach((slot, index) => {
            
            // Verifica se este slot já foi pago
            let isDone = false;
            if (slotsConsumidos[slot.tipo] && slotsConsumidos[slot.tipo][slot.idMateria] > 0) {
                isDone = true;
                slotsConsumidos[slot.tipo][slot.idMateria] -= 1; // Deduz 1 para o próximo slot da mesma matéria
            }

            const card = document.createElement('div');
            card.className = `slot-card slot-${slot.tipo} ${isDone ? 'slot-done' : ''}`;
            
            const txtTipo = slot.tipo === 'teoria' ? 'Sessão de Teoria' : slot.tipo === 'questoes' ? 'Sessão de Questões' : 'Sessão de Manutenção';
            const iconBtn = isDone ? 'check' : 'play_arrow';
            
            card.innerHTML = `
                <div class="slot-header">
                    <span>Slot ${index + 1}</span>
                    <span>${txtTipo}</span>
                </div>
                <div class="slot-title">${slot.nome}</div>
                <div class="slot-action-btn" title="${isDone ? 'Concluído' : 'Marcar como Feito'}">
                    <span class="material-symbols-outlined">${iconBtn}</span>
                </div>
            `;

            // Ação de Clique para cumprir a sessão
            if (!isDone) {
                card.addEventListener('click', () => {
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
                    showToast(`Mandou bem! Slot de ${slot.nome} concluído.`, 'success');
                });
            }

            containerHojeSlots.appendChild(card);
        });
    }

    // 2. RENDERIZA VISÃO DA SEMANA
    tabelaSemanaBody.innerHTML = '';
    const dateCursor = new Date(hojeStr + 'T00:00:00');
    
    // Limita a exibição da semana a 7 dias à frente
    for (let i = 0; i < 7; i++) {
        const dStr = dateCursor.toISOString().split('T')[0];
        const displayData = dStr.split('-').reverse().join('/');
        
        const daysMap =['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const nomeDia = daysMap[dateCursor.getDay()];
        
        const slotsProg = gerarSessoesDoDia(dStr, classificacao, matrizAjustada);
        const configRaw = matrizAjustada[['dom','seg','ter','qua','qui','sex','sab'][dateCursor.getDay()]];
        
        const tr = document.createElement('tr');
        if (i === 0) tr.style.backgroundColor = '#F8FAFC'; // Destaca o Hoje
        
        let visualFila = slotsProg.length === 0 ? '<span style="color: var(--text-muted)">Livre</span>' : '';
        slotsProg.forEach(s => {
            visualFila += `<span class="tag-tipo tag-${s.tipo}" style="margin-right:4px; margin-bottom:4px;" title="${s.nome}">${s.nome.substring(0, 15)}...</span>`;
        });

        tr.innerHTML = `
            <td><strong>${nomeDia}</strong> <br><small style="color:var(--text-muted)">${displayData}</small></td>
            <td style="text-transform: capitalize;">${configRaw.tipo} (${configRaw.slots} slots)</td>
            <td style="line-height: 2;">${visualFila}</td>
        `;
        tabelaSemanaBody.appendChild(tr);

        dateCursor.setDate(dateCursor.getDate() + 1);
    }
}

function renderDashboard() {
    const stats = getEstatisticasMaterias();
    const classificacao = classificarFila();
    
    // Totais Gerais
    let teoriaTotalPlan = 0, teoriaTotalFeita = 0;
    let questoesTotalPlan = 0, questoesTotalFeitas = 0;

    appState.materias.forEach(m => {
        teoriaTotalPlan += Number(m.sessoes);
        questoesTotalPlan += Number(m.questoes);
        if (stats[m.id]) {
            teoriaTotalFeita += stats[m.id].teoriaFeita;
            questoesTotalFeitas += stats[m.id].questoesFeitas;
        }
    });

    const progressoTeoria = teoriaTotalPlan > 0 ? (teoriaTotalFeita / teoriaTotalPlan) * 100 : 0;
    
    // Atualiza Cards
    const cards = document.querySelectorAll('.summary-card .metric');
    if (cards.length >= 3) {
        cards[0].textContent = progressoTeoria.toFixed(1).replace('.', ',') + '%';
        cards[1].textContent = classificacao.manutencao.length; // Quantas já chegaram na manutenção
        
        const d1 = new Date(appState.config.dataInicio + 'T00:00:00');
        const d2 = new Date(appState.config.dataFim + 'T00:00:00');
        const diffSemanas = Math.max(0, Math.ceil((d2 - new Date()) / (1000 * 60 * 60 * 24) / 7));
        cards[2].textContent = isNaN(diffSemanas) ? '0' : diffSemanas;
    }

    // Gráficos de Barra (Progressos)
    const placeholders = document.querySelectorAll('.chart-placeholder');
    if (placeholders.length >= 4) {
        // Barras Teoria
        const percT = Math.min(progressoTeoria, 100);
        placeholders[2].innerHTML = `
            <div style="width: 100%; text-align: center;">
                <div style="margin-bottom: 8px;"><strong>${teoriaTotalFeita}</strong> / ${teoriaTotalPlan}</div>
                <div style="width: 100%; height: 20px; background: #E2E8F0; border-radius: 10px; overflow: hidden;">
                    <div style="width: ${percT}%; height: 100%; background: var(--color-primary);"></div>
                </div>
            </div>`;
        placeholders[2].style.padding = '24px';

        // Barras Questões
        const progressoQ = questoesTotalPlan > 0 ? (questoesTotalFeitas / questoesTotalPlan) * 100 : 0;
        const percQ = Math.min(progressoQ, 100);
        placeholders[3].innerHTML = `
            <div style="width: 100%; text-align: center;">
                <div style="margin-bottom: 8px;"><strong>${questoesTotalFeitas}</strong> / ${questoesTotalPlan}</div>
                <div style="width: 100%; height: 20px; background: #E2E8F0; border-radius: 10px; overflow: hidden;">
                    <div style="width: ${percQ}%; height: 100%; background: var(--color-warning);"></div>
                </div>
            </div>`;
        placeholders[3].style.padding = '24px';
    }
}

function renderDiary() {
    // Opções de Matéria para o Form Manual
    const select = document.getElementById('reg-materia');
    select.innerHTML = '<option value="" disabled selected>Selecione uma matéria...</option>';
    appState.materias.forEach(mat => {
        const opt = document.createElement('option');
        opt.value = mat.id;
        opt.textContent = mat.nome;
        select.appendChild(opt);
    });

    tabelaHistoricoBody.innerHTML = '';
    if (appState.registros.length === 0) {
        tabelaHistoricoBody.innerHTML = `<tr class="empty-state"><td colspan="7" class="text-center">Nenhum estudo registrado.</td></tr>`;
        return;
    }

    const sortRegs =[...appState.registros].sort((a,b) => new Date(b.data) - new Date(a.data));
    
    sortRegs.forEach(reg => {
        const mat = appState.materias.find(m => m.id === reg.idMateria);
        const nomeMateria = mat ? mat.nome : '<Excluída>';
        const dt = reg.data.split('-').reverse().join('/');
        
        let t = 0, q = 0, m = 0;
        if (reg.tipo === 'teoria' || reg.tipo === 'sessoes') t = reg.quantidade;
        if (reg.tipo === 'questoes') q = reg.quantidade;
        if (reg.tipo === 'manutencao') m = reg.quantidade;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dt}</td>
            <td><strong>${nomeMateria}</strong></td>
            <td>${t}</td>
            <td>${q}</td>
            <td>${m}</td>
            <td><small style="color:var(--text-muted)">${reg.comentario || '-'}</small></td>
            <td class="text-center">
                <button class="btn btn-icon" onclick="deleteRegistro('${reg.id}')" style="color: var(--color-danger);"><span class="material-symbols-outlined" style="font-size: 18px;">delete</span></button>
            </td>
        `;
        tabelaHistoricoBody.appendChild(tr);
    });
}

function renderAll() {
    renderConfig();
    renderPlan();
    renderCronograma();
    renderDashboard();
    renderDiary();
}

/* ========================================================================== */
/* CAPÍTULO 5: CONTROLADORES E AÇÕES (WIZARD, FORMS E CLIQUES)                */
/* ========================================================================== */

// WIZARD DE CONFIGURAÇÕES
function validarWizard() {
    let slotsQ = 0;
    const maxMat = Number(document.getElementById('cfg-max-materias').value);
    
    const dias =['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
    dias.forEach(d => {
        const tipo = document.getElementById(`cfg-${d}-tipo`).value;
        const slots = Number(document.getElementById(`cfg-${d}-slots`).value);
        if (tipo === 'questoes') slotsQ += slots;
    });

    alertaMatriz.classList.add('hidden');
    
    // Regra: O dia de questões precisa acomodar ao menos 1 slot para cada matéria ativa
    if (slotsQ > 0 && slotsQ < maxMat) {
        alertaMatriz.innerHTML = `<strong>Atenção:</strong> Você definiu máximo de ${maxMat} matérias simultâneas, mas sua semana só tem ${slotsQ} slots de Questões. Cada matéria ativa precisa de pelo menos 1 slot de questões.`;
        alertaMatriz.classList.remove('hidden');
        return false;
    }

    return true;
}

formConfig.addEventListener('input', () => {
    btnSalvarConfig.disabled = false;
    btnSalvarConfig.innerHTML = '<span class="material-symbols-outlined">save</span> Salvar Alterações';
    validarWizard();
});

formConfig.addEventListener('submit', (e) => {
    e.preventDefault(); 
    if (!validarWizard()) return; // Impede salvamento se matemática quebrar

    appState.config.dataInicio = document.getElementById('cfg-data-inicio').value;
    appState.config.dataFim = document.getElementById('cfg-data-fim').value;
    appState.config.maxMaterias = Number(document.getElementById('cfg-max-materias').value);
    appState.config.minutosSessao = Number(document.getElementById('cfg-minutos-sessao').value);
    appState.config.questoesSessao = Number(document.getElementById('cfg-questoes-sessao').value);

    const dias = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
    dias.forEach(d => {
        appState.config.matrizSemanal[d].tipo = document.getElementById(`cfg-${d}-tipo`).value;
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
        // Nota: Entra no fim da fila por padrão. O usuário altera com drag and drop.
    }

    saveData();
    renderAll();
    closeModal(modalMateria);
});

window.deleteMateria = function(id) {
    if (confirm('Excluir esta matéria e tirá-la da fila?')) {
        appState.materias = appState.materias.filter(m => m.id !== id);
        saveData();
        renderAll();
    }
};

// DIÁRIO MANUAL
formRegistro.addEventListener('submit', (e) => {
    e.preventDefault();
    const novoRegistro = {
        id: Date.now().toString(),
        data: document.getElementById('reg-data').value,
        idMateria: document.getElementById('reg-materia').value,
        tipo: document.getElementById('reg-tipo').value,
        quantidade: document.getElementById('reg-quantidade').value,
        comentario: document.getElementById('reg-comentario').value
    };
    appState.registros.push(novoRegistro);
    saveData();
    renderAll();
    closeModal(modalRegistro);
    showToast('Registro manual salvo.', 'success');
});

window.deleteRegistro = function(id) {
    if (confirm('Desfazer este registro? O cronograma irá devolver o slot.')) {
        appState.registros = appState.registros.filter(r => r.id !== id);
        saveData();
        renderAll();
    }
};


/* ========================================================================== */
/* CAPÍTULO 6: NAVEGAÇÃO E MODAIS (UI ROUTER)                                 */
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
        if(el.id === 'modal-materia') { formMateria.reset(); editingMateriaId = null; }
        if(el.id === 'modal-registro') { formRegistro.reset(); }
    }
}

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

    // Menu Sidebar
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            navItems.forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            switchView(this.getAttribute('data-target'));
        });
    });

    // Modais
    document.getElementById('btn-add-materia')?.addEventListener('click', () => openModal(modalMateria));
    document.getElementById('btn-fechar-modal')?.addEventListener('click', () => closeModal(modalMateria));
    document.getElementById('btn-cancelar-modal')?.addEventListener('click', () => closeModal(modalMateria));

    document.getElementById('btn-add-registro')?.addEventListener('click', () => {
        document.getElementById('reg-data').value = getTodayStr();
        openModal(modalRegistro);
    });
    document.getElementById('btn-fechar-modal-registro')?.addEventListener('click', () => closeModal(modalRegistro));
    document.getElementById('btn-cancelar-modal-registro')?.addEventListener('click', () => closeModal(modalRegistro));

    // Botão Recalcular (Apenas re-renderiza, já que o motor lê o estado realtime)
    document.getElementById('btn-regerar-cronograma')?.addEventListener('click', () => {
        renderCronograma();
        showToast('Fila reprocessada com base no seu estado atual.', 'success');
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
        if (confirm('Isso apagará tudo. Deseja continuar?')) {
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        }
    });
});