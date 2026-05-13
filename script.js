/* ========================================================================== */
/* CAPÍTULO 1: ESTADO E ARMAZENAMENTO (STORE)                                 */
/* Gerencia os dados da aplicação e persistência no LocalStorage              */
/* ========================================================================== */

const STORAGE_KEY = 'plannerEstudosV2';

const Store = {
    state: {
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
        materias: [],
        registros: []
    },

    load() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            this.state = { 
                ...this.state, 
                ...parsed,
                config: { ...this.state.config, ...(parsed.config || {}) }
            };
        }
    },

    save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    }
};

const AppContext = {
    diarioCurrentPage: 1,
    diarioItemsPerPage: 20,
    editingMateriaId: null,
    editingRegistroId: null,
    confirmActionCallback: null,
    chart7DiasInstance: null,
    chartMateriasInstance: null
};

/* ========================================================================== */
/* CAPÍTULO 2: REFERÊNCIAS DO DOM                                             */
/* Cache de elementos para evitar buscas repetitivas no DOM                   */
/* ========================================================================== */

const DOM = {
    views: document.querySelectorAll('.view'),
    navItems: document.querySelectorAll('.nav-item'),
    
    /* --- Botoes Globais --- */
    btnNovo: document.getElementById('btn-novo'),
    btnAbrir: document.getElementById('btn-abrir'),
    btnSalvar: document.getElementById('btn-salvar'),
    
    /* --- Modais e Forms --- */
    modais: document.querySelectorAll('.modal-overlay'),
    modalMateria: document.getElementById('modal-materia'),
    formMateria: document.getElementById('form-materia'),
    modalMateriaTitle: document.getElementById('modal-materia-title'),
    
    modalRegistro: document.getElementById('modal-registro'),
    formRegistro: document.getElementById('form-registro'),
    modalRegistroTitle: document.getElementById('modal-registro-title'),
    
    modalConfirm: document.getElementById('modal-confirm'),
    modalConfirmMsg: document.getElementById('modal-confirm-message'),
    btnAceitarConfirm: document.getElementById('btn-aceitar-confirm'),
    
    /* --- Wizard (Config) --- */
    formConfig: document.getElementById('form-config'),
    btnSalvarConfig: document.getElementById('btn-salvar-config'),
    alertaMatriz: document.getElementById('alerta-matriz'),
    
    /* --- Áreas de Renderização --- */
    containerHojeSlots: document.getElementById('hoje-slots-container'),
    containerSemana: document.getElementById('timeline-semana'),
    listaMateriasDrag: document.getElementById('lista-materias-drag'),
    tabelaHistoricoBody: document.querySelector('#tabela-historico tbody'),
    
    /* --- Paginação do Diário --- */
    diaryPagination: document.getElementById('diary-pagination'),
    diaryPageInfo: document.getElementById('diary-page-info'),
    diaryPageSize: document.getElementById('diary-page-size'),
    btnPageFirst: document.getElementById('btn-page-first'),
    btnPagePrev: document.getElementById('btn-page-prev'),
    btnPageNext: document.getElementById('btn-page-next'),
    btnPageLast: document.getElementById('btn-page-last'),
    
    /* --- Toasts --- */
    toastContainer: document.getElementById('toast-container')
};

/* ========================================================================== */
/* CAPÍTULO 3: UTILITÁRIOS (UTILS)                                            */
/* Funções puras de formatação e controle de modais                           */
/* ========================================================================== */

const Utils = {
    getTodayStr() {
        return new Date().toISOString().split('T')[0];
    },

    openModal(el) {
        if (!el) return;
        el.classList.remove('hidden');
        
        // Animação GSAP: Fundo aparece suavemente
        gsap.fromTo(el, 
            { opacity: 0, backdropFilter: "blur(0px)" }, 
            { opacity: 1, backdropFilter: "blur(2px)", duration: 0.3 }
        );
        
        // Animação GSAP: Modal ganha vida com um leve "pulo" (back.out)
        const content = el.querySelector('.modal-content');
        if (content) {
            gsap.fromTo(content, 
                { y: 30, scale: 0.95, opacity: 0 }, 
                { y: 0, scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.7)" }
            );
        }
    },

    closeModal(el) {
        if (!el) return;
        
        const content = el.querySelector('.modal-content');
        if (content) gsap.to(content, { y: 20, scale: 0.95, opacity: 0, duration: 0.2, ease: "power2.in" });
        
        gsap.to(el, { 
            opacity: 0, backdropFilter: "blur(0px)", duration: 0.2, delay: 0.1,
            onComplete: () => {
                el.classList.add('hidden');
                
                // Limpeza segura dos formulários após o modal sumir
                if (el.id === 'modal-materia') { 
                    DOM.formMateria.reset(); 
                    AppContext.editingMateriaId = null; 
                    DOM.modalMateriaTitle.textContent = 'Adicionar Matéria';
                }
                if (el.id === 'modal-registro') { 
                    DOM.formRegistro.reset(); 
                    AppContext.editingRegistroId = null;
                    DOM.modalRegistroTitle.textContent = 'Registro Manual';
                }
                if (el.id === 'modal-confirm') {
                    AppContext.confirmActionCallback = null;
                }
            }
        });
    },

    showConfirmModal(message, callback) {
        DOM.modalConfirmMsg.textContent = message;
        AppContext.confirmActionCallback = callback;
        this.openModal(DOM.modalConfirm);
    },

    showToast(message, type = 'info') {
        if (!DOM.toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = 'toast';
        
        const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';
        const iconColor = type === 'success' ? 'var(--color-success)' : 'inherit';
        
        toast.innerHTML = `<span class="material-symbols-outlined" style="color: ${iconColor}">${icon}</span> ${message}`;
        DOM.toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('hide');
            toast.addEventListener('animationend', () => toast.remove());
        }, 3000);
    }
};

/* ========================================================================== */
/* CAPÍTULO 4: REGRAS DE NEGÓCIO (LOGIC)                                      */
/* Processamento de dados sem acoplamento com o DOM                           */
/* ========================================================================== */

const Logic = {
    getEstatisticasMaterias() {
        let stats = {};
        
        Store.state.materias.forEach(m => {
            stats[m.id] = { 
                teoriaFeita: 0, 
                questoesFeitas: 0, 
                manutencaoFeita: 0,
                ultimaAtividade: null
            };
        });

        Store.state.registros.forEach(r => {
            if (!stats[r.idMateria]) return;
            
            const qtd = Number(r.quantidade);
            if (r.tipo === 'teoria' || r.tipo === 'sessoes') stats[r.idMateria].teoriaFeita += qtd;
            if (r.tipo === 'questoes') stats[r.idMateria].questoesFeitas += qtd;
            if (r.tipo === 'manutencao') stats[r.idMateria].manutencaoFeita += qtd;

            if (!stats[r.idMateria].ultimaAtividade || new Date(r.data) > new Date(stats[r.idMateria].ultimaAtividade)) {
                stats[r.idMateria].ultimaAtividade = r.data;
            }
        });

        return stats;
    },

    classificarFila() {
        const stats = this.getEstatisticasMaterias();
        const hoje = new Date(Utils.getTodayStr());

        let ativas = [];
        let espera = [];
        let concluidas = []; 
        let manutencao = []; 

        Store.state.materias.forEach(mat => {
            const s = stats[mat.id];
            const metaTeoria = Number(mat.sessoes) || 0;
            const metaQuestoes = Number(mat.questoes) || 0;
            
            const temMeta = metaTeoria > 0 || metaQuestoes > 0;
            const teoriaConcluida = s.teoriaFeita >= metaTeoria;
            const questoesConcluidas = s.questoesFeitas >= metaQuestoes;

            if (temMeta && teoriaConcluida && questoesConcluidas) {
                concluidas.push(mat);
                
                if (s.ultimaAtividade) {
                    const dataUltima = new Date(s.ultimaAtividade);
                    const diffDias = Math.floor((hoje - dataUltima) / (1000 * 60 * 60 * 24));
                    if (diffDias >= 7) manutencao.push(mat);
                } else {
                    manutencao.push(mat); 
                }
            } else {
                if (ativas.length < Number(Store.state.config.maxMaterias)) {
                    ativas.push(mat);
                } else {
                    espera.push(mat);
                }
            }
        });

        return { ativas, espera, concluidas, manutencao, stats };
    },

    getMatrizAjustada(manutencaoMatters) {
        let matriz = JSON.parse(JSON.stringify(Store.state.config.matrizSemanal));
        const dias = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
        
        let slotsManut = 0;
        dias.forEach(d => { if (matriz[d].tipo === 'manutencao') slotsManut += matriz[d].slots; });

        if (manutencaoMatters.length > slotsManut && slotsManut > 0) {
            let lastTeoria = null;
            let lastQuestoes = null;

            dias.forEach(d => {
                if (matriz[d].tipo === 'teoria') lastTeoria = d;
                if (matriz[d].tipo === 'questoes') lastQuestoes = d;
            });

            if (lastTeoria && lastQuestoes) {
                matriz[lastTeoria].tipo = 'questoes'; 
                matriz[lastQuestoes].tipo = 'manutencao'; 
                Utils.showToast('Sua rotina foi autoajustada para suportar a carga de revisões.', 'info');
            }
        }
        return matriz;
    },

    gerarSessoesDoDia(dataString, classificacao, matrizAjustada) {
        const daysMap = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
        const diaDaSemana = daysMap[new Date(dataString + 'T00:00:00').getDay()];
        const configDia = matrizAjustada[diaDaSemana];

        let slotsGerados = [];
        if (configDia.slots === 0 || configDia.tipo === 'descanso') return slotsGerados;

        const epochDays = Math.floor(new Date(dataString + 'T00:00:00').getTime() / 86400000);

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
};

/* ========================================================================== */
/* CAPÍTULO 5: RENDERIZAÇÃO DA INTERFACE (VIEWS)                              */
/* Funções exclusivas para desenhar/atualizar o DOM                           */
/* ========================================================================== */

const Views = {
    renderConfig() {
        const c = Store.state.config;
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

        if (DOM.btnSalvarConfig) {
            DOM.btnSalvarConfig.disabled = true;
            DOM.btnSalvarConfig.innerHTML = '<span class="material-symbols-outlined">check</span> Configurações Salvas';
            DOM.btnSalvarConfig.classList.remove('btn-success');
            DOM.btnSalvarConfig.classList.add('btn-primary');
        }
    },

    renderPlan() {
        DOM.listaMateriasDrag.innerHTML = '';
        
        if (Store.state.materias.length === 0) {
            DOM.listaMateriasDrag.innerHTML = `
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

        // Auto-rebaixamento visual
        let statsCurrent = Logic.getEstatisticasMaterias();
        let incompletas = [];
        let concluidas = [];
        
        Store.state.materias.forEach(mat => {
            const st = statsCurrent[mat.id];
            const metaT = Number(mat.sessoes) || 0;
            const metaQ = Number(mat.questoes) || 0;
            const isConcluida = (metaT > 0 || metaQ > 0) && (st.teoriaFeita >= metaT && st.questoesFeitas >= metaQ);
            
            if (isConcluida) concluidas.push(mat);
            else incompletas.push(mat);
        });

        const novaFila = [...incompletas, ...concluidas];
        const ordemMudou = Store.state.materias.some((m, i) => m.id !== novaFila[i].id);
        
        if (ordemMudou) {
            Store.state.materias = novaFila;
            Store.save();
        }

        const limit = Number(Store.state.config.maxMaterias);
        const hasWaitlist = incompletas.length > limit;
        
        let activeRendered = 0; 
        let linhaFinalizadasCriada = false;

        Store.state.materias.forEach((mat) => {
            const stats = statsCurrent[mat.id];
            const metaT = Number(mat.sessoes) || 0;
            const metaQ = Number(mat.questoes) || 0;
            const isConcluida = (metaT > 0 || metaQ > 0) && (stats.teoriaFeita >= metaT && stats.questoesFeitas >= metaQ);
            
            if (isConcluida && !linhaFinalizadasCriada) {
                const cutLineFinalizadas = document.createElement('tr');
                cutLineFinalizadas.className = 'row-cut-off';
                cutLineFinalizadas.innerHTML = `<td colspan="7"><div class="cut-off-divider">Matérias Finalizadas (Apenas Revisão)</div></td>`;
                DOM.listaMateriasDrag.appendChild(cutLineFinalizadas);
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
            
            let pesoVisual = mat.peso == 3 ? `<span class="badge-peso badge-high">Alta</span>` :
                             mat.peso == 2 ? `<span class="badge-peso badge-medium">Média</span>` : 
                                             `<span class="badge-peso badge-low">Baixa</span>`;

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
                <td data-label="Matéria"><strong>${mat.nome}</strong> ${badge}</td>
                <td data-label="Prioridade">${pesoVisual}</td>
                <td data-label="Teoria">${stats.teoriaFeita} / ${mat.sessoes}</td>
                <td data-label="Questões">${stats.questoesFeitas} / ${mat.questoes}</td>
                <td data-label="Progresso">
                    <div class="table-progress-container">
                        <div class="table-progress-text">${Math.floor(percentualFinal)}%</div>
                        <div class="table-progress-bg">
                            <div class="table-progress-fill" style="width: ${percentualFinal}%; background-color: ${colorBar};"></div>
                        </div>
                    </div>
                </td>
                <td data-label="Ações" class="text-center">
                    <button class="btn btn-icon btn-action-edit" data-id="${mat.id}" data-type="materia" title="Editar" style="color: var(--color-primary);"><span class="material-symbols-outlined icon-sm">edit</span></button>
                    <button class="btn btn-icon btn-action-delete" data-id="${mat.id}" data-type="materia" title="Excluir" style="color: var(--color-danger);"><span class="material-symbols-outlined icon-sm">delete</span></button>
                </td>
            `;

            DOM.listaMateriasDrag.appendChild(tr);

            if (!isConcluida && activeRendered === limit && hasWaitlist) {
                const cutLine = document.createElement('tr');
                cutLine.className = 'row-cut-off';
                cutLine.innerHTML = `<td colspan="7"><div class="cut-off-divider">Em Andamento ↑ | Linha de Espera ↓</div></td>`;
                DOM.listaMateriasDrag.appendChild(cutLine);
            }
        });
    },

    renderSchedule() {
        const hojeStr = Utils.getTodayStr();
        const classificacao = Logic.classificarFila();
        const matrizAjustada = Logic.getMatrizAjustada(classificacao.manutencao);

        // Renderiza Slots de Hoje
        DOM.containerHojeSlots.innerHTML = '';
        
        const slotsDeHoje = Logic.gerarSessoesDoDia(hojeStr, classificacao, matrizAjustada);
        const feitosHoje = Store.state.registros.filter(r => r.data === hojeStr);
        
        let slotsConsumidos = { teoria: {}, questoes: {}, manutencao: {} };
        feitosHoje.forEach(r => {
            let t = r.tipo === 'sessoes' ? 'teoria' : r.tipo; 
            if (!slotsConsumidos[t][r.idMateria]) slotsConsumidos[t][r.idMateria] = 0;
            slotsConsumidos[t][r.idMateria] += Number(r.quantidade);
        });

        if (slotsDeHoje.length === 0) {
            if (Store.state.materias.length === 0) {
                // Estado de Onboarding (Usuário ainda não alimentou o motor)
                DOM.containerHojeSlots.innerHTML = `
                    <div class="onboarding-wrapper" style="margin:0;">
                        <span class="material-symbols-outlined empty-icon" style="color: var(--color-warning); opacity: 1;">event_busy</span>
                        <h3 style="margin-top: 16px;">Cronograma Indisponível</h3>
                        <p>A <strong>Sugar Mommy</strong> precisa das suas matérias e metas para conseguir gerar seu dia automaticamente.</p>
                        <button class="btn btn-primary" onclick="Controllers.switchView('view-config')">Ir para Configurações</button>
                    </div>`;
            } else {
                // Estado Normal de "Folga" (Usuário está em dia)
                DOM.containerHojeSlots.innerHTML = `
                    <div class="empty-state-container card text-center full-width" style="margin:0;">
                        <span class="material-symbols-outlined empty-icon">celebration</span>
                        <p>Nenhuma sessão programada para hoje. Curta seu dia livre!</p>
                    </div>`;
            }
        } else {
            slotsDeHoje.forEach((slot, index) => {
                let isDone = false;
                if (slotsConsumidos[slot.tipo] && slotsConsumidos[slot.tipo][slot.idMateria] > 0) {
                    isDone = true;
                    slotsConsumidos[slot.tipo][slot.idMateria] -= 1;
                }

                const card = document.createElement('div');
                card.className = `slot-card slot-${slot.tipo} ${isDone ? 'slot-done' : ''}`;
                if (!isDone) card.dataset.slotData = JSON.stringify({ ...slot, index });
                
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

                DOM.containerHojeSlots.appendChild(card);
            });
        }

        // Renderiza Timeline da Semana
        if (DOM.containerSemana) {
            DOM.containerSemana.innerHTML = '';
            const dateCursor = new Date(hojeStr + 'T00:00:00');
            
            for (let i = 0; i < 7; i++) {
                const dStr = dateCursor.toISOString().split('T')[0];
                const displayData = dStr.split('-').reverse().join('/');
                
                const daysMap = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
                const nomeDia = daysMap[dateCursor.getDay()];
                const isToday = i === 0;
                
                const slotsProg = Logic.gerarSessoesDoDia(dStr, classificacao, matrizAjustada);
                const configRaw = matrizAjustada[['dom','seg','ter','qua','qui','sex','sab'][dateCursor.getDay()]];
                
                let displayTipo = configRaw.tipo === 'manutencao' ? 'revisão' : configRaw.tipo;
                let visualFila = slotsProg.length === 0 ? '<span class="text-sm text-muted">Nenhuma sessão programada.</span>' : '';
                
                slotsProg.forEach(s => {
                    visualFila += `<span class="tag-atividade tag-${s.tipo}" title="${s.nome}">${s.nome.substring(0, 18)}${s.nome.length > 18 ? '...' : ''}</span>`;
                });

                DOM.containerSemana.innerHTML += `
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
                            <div class="timeline-tags">${visualFila}</div>
                        </div>
                    </div>
                `;
                dateCursor.setDate(dateCursor.getDate() + 1);
            }
        }
    },

    renderDashboard() {
        const dashboardGrid = document.querySelector('.dashboard-grid');
        
        // INTERVENÇÃO DE ONBOARDING: Se for a primeira vez do usuário, mostraremos o caminho
        if (Store.state.materias.length === 0) {
            dashboardGrid.classList.add('hidden');
            
            let onboardingEl = document.getElementById('dashboard-onboarding');
            if (!onboardingEl) {
                onboardingEl = document.createElement('div');
                onboardingEl.id = 'dashboard-onboarding';
                onboardingEl.className = 'onboarding-wrapper';
                onboardingEl.innerHTML = `
                    <span class="material-symbols-outlined empty-icon" style="font-size: 64px; color: var(--color-primary); opacity: 1; margin-bottom: 16px;">rocket_launch</span>
                    <h3>Bem-vindo ao Sugar Mommy Planner!</h3>
                    <p>Sua inteligência artificial particular para os estudos. Notei que seu plano ainda não foi configurado. Vamos dar o primeiro passo?</p>
                    <div class="onboarding-actions">
                        <button class="btn btn-primary btn-min-w" onclick="Controllers.switchView('view-config')">
                            <span class="material-symbols-outlined">settings</span> 1. Configurar Minha Rotina
                        </button>
                        <button class="btn btn-secondary btn-min-w" onclick="Controllers.switchView('view-plan')">
                            <span class="material-symbols-outlined">add</span> 2. Adicionar Matérias
                        </button>
                    </div>
                `;
                dashboardGrid.parentNode.insertBefore(onboardingEl, dashboardGrid);
            } else {
                onboardingEl.classList.remove('hidden');
            }
            return; // Interrompe os gráficos pois não há dados
        } else {
            dashboardGrid.classList.remove('hidden');
            const existingOnboarding = document.getElementById('dashboard-onboarding');
            if (existingOnboarding) existingOnboarding.classList.add('hidden');
        }

        const stats = Logic.getEstatisticasMaterias();
        const classificacao = Logic.classificarFila();
        
        let teoriaTotalPlan = 0, teoriaTotalFeita = 0;
        let questoesTotalPlan = 0, questoesTotalFeitas = 0;
        let manutencaoTotalFeita = 0;

        Store.state.materias.forEach(m => {
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
            
            const d1 = new Date(Store.state.config.dataInicio + 'T00:00:00');
            const d2 = new Date(Store.state.config.dataFim + 'T00:00:00');
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

        this.renderCharts(stats);
    },

    renderCharts(stats) {
        if (!window.Chart) return;

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

        Store.state.registros.forEach(r => {
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
        
        Store.state.materias.forEach(mat => {
            labelsMaterias.push(mat.nome.length > 40 ? mat.nome.substring(0, 40) + '...' : mat.nome);
            const tFeita = stats[mat.id] ? stats[mat.id].teoriaFeita : 0;
            const mFeita = stats[mat.id] ? stats[mat.id].manutencaoFeita : 0;
            dataMateriasSessoes.push(tFeita + mFeita); 
        });

        Chart.defaults.font.family = "'Inter', sans-serif";
        Chart.defaults.color = '#64748B'; 

        const ctx7Dias = document.getElementById('chart-7-dias');
        if (ctx7Dias) {
            if (AppContext.chart7DiasInstance) AppContext.chart7DiasInstance.destroy(); 
            const questoesPorSessao = Number(Store.state.config.questoesSessao) || 15;

            AppContext.chart7DiasInstance = new Chart(ctx7Dias, {
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
            if (AppContext.chartMateriasInstance) AppContext.chartMateriasInstance.destroy();
            AppContext.chartMateriasInstance = new Chart(ctxMaterias, {
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
            const calculatedHeight = Math.max(300, labelsMaterias.length * 30);
            ctxMaterias.parentElement.style.height = `${calculatedHeight}px`;
        }
    },

    renderDiary() {
        const select = document.getElementById('reg-materia');
        if (select) {
            select.innerHTML = '<option value="" disabled selected>Selecione uma matéria...</option>';
            Store.state.materias.forEach(mat => {
                const opt = document.createElement('option');
                opt.value = mat.id;
                opt.textContent = mat.nome;
                select.appendChild(opt);
            });
        }

        DOM.tabelaHistoricoBody.innerHTML = '';

        if (Store.state.registros.length === 0) {
            DOM.tabelaHistoricoBody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="5" class="text-center">
                        <div class="empty-state-container">
                            <span class="material-symbols-outlined empty-icon">history</span>
                            <p>Nenhum estudo registrado ainda.</p>
                        </div>
                    </td>
                </tr>`;
            if (DOM.diaryPagination) DOM.diaryPagination.classList.add('hidden');
            return;
        }

        const sortRegs = [...Store.state.registros].sort((a,b) => new Date(b.data) - new Date(a.data));
        const totalItems = sortRegs.length;
        const totalPages = Math.ceil(totalItems / AppContext.diarioItemsPerPage);

        if (AppContext.diarioCurrentPage > totalPages) AppContext.diarioCurrentPage = totalPages;
        if (AppContext.diarioCurrentPage < 1) AppContext.diarioCurrentPage = 1;

        const startIndex = (AppContext.diarioCurrentPage - 1) * AppContext.diarioItemsPerPage;
        const endIndex = startIndex + AppContext.diarioItemsPerPage;
        const currentRegs = sortRegs.slice(startIndex, endIndex);
        
        currentRegs.forEach(reg => {
            const mat = Store.state.materias.find(m => m.id === reg.idMateria);
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
            tr.innerHTML = `
                <td data-label="Data">${dt}</td>
                <td data-label="Matéria"><strong>${nomeMateria}</strong></td>
                <td data-label="Atividades">${tagsAtividade}</td>
                <td data-label="Comentário"><small class="text-muted">${reg.comentario || '-'}</small></td>
                <td data-label="Ações" class="text-center">
                    <button class="btn btn-icon btn-action-edit" data-id="${reg.id}" data-type="registro" title="Editar" style="color: var(--color-primary);"><span class="material-symbols-outlined icon-sm">edit</span></button>
                    <button class="btn btn-icon btn-action-delete" data-id="${reg.id}" data-type="registro" title="Excluir" style="color: var(--color-danger);"><span class="material-symbols-outlined icon-sm">delete</span></button>
                </td>
            `;
            DOM.tabelaHistoricoBody.appendChild(tr);
        });

        if (DOM.diaryPagination) {
            DOM.diaryPagination.classList.remove('hidden');
            const realEnd = Math.min(endIndex, totalItems);
            
            if (DOM.diaryPageInfo) {
                DOM.diaryPageInfo.innerHTML = `Mostrando <strong>${startIndex + 1}</strong> a <strong>${realEnd}</strong> de <strong>${totalItems}</strong> registros`;
            }

            if (DOM.diaryPageSize && DOM.diaryPageSize.value != AppContext.diarioItemsPerPage) {
                DOM.diaryPageSize.value = AppContext.diarioItemsPerPage;
            }

            DOM.btnPageFirst.disabled = AppContext.diarioCurrentPage === 1;
            DOM.btnPagePrev.disabled = AppContext.diarioCurrentPage === 1;
            DOM.btnPageNext.disabled = AppContext.diarioCurrentPage === totalPages;
            DOM.btnPageLast.disabled = AppContext.diarioCurrentPage === totalPages;
        }
    },

    renderAll() {
        this.renderConfig();
        this.renderPlan();
        this.renderSchedule();
        this.renderDashboard();
        this.renderDiary();
    }
};

/* ========================================================================== */
/* CAPÍTULO 6: CONTROLADORES DE EVENTOS E DELEGAÇÃO (CONTROLLERS)             */
/* Conecta as interações do usuário com a Lógica e Views                      */
/* ========================================================================== */

const Controllers = {
    initEvents() {
        // Navegação Lateral
        DOM.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                DOM.navItems.forEach(i => i.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.switchView(e.currentTarget.getAttribute('data-target'));
            });
        });

        // Modais de Ação Simples (Desktop)
        document.getElementById('btn-add-materia')?.addEventListener('click', () => Utils.openModal(DOM.modalMateria));
        document.getElementById('btn-add-registro')?.addEventListener('click', () => {
            document.getElementById('reg-data').value = Utils.getTodayStr();
            Utils.openModal(DOM.modalRegistro);
        });

        // Modais de Ação Simples (Mobile FABs)
        document.getElementById('fab-add-materia')?.addEventListener('click', () => Utils.openModal(DOM.modalMateria));
        document.getElementById('fab-add-registro')?.addEventListener('click', () => {
            document.getElementById('reg-data').value = Utils.getTodayStr();
            Utils.openModal(DOM.modalRegistro);
        });

        // Eventos Globais de Modais
        document.querySelectorAll('.modal-close-btn, .modal-cancel-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                Utils.closeModal(document.getElementById(e.currentTarget.getAttribute('data-target')));
            });
        });

        DOM.modais.forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) Utils.closeModal(overlay);
            });
        });

        DOM.btnAceitarConfirm?.addEventListener('click', () => {
            if (AppContext.confirmActionCallback) AppContext.confirmActionCallback();
            Utils.closeModal(DOM.modalConfirm);
        });

        // Event Delegation (Tabelas)
        DOM.listaMateriasDrag?.addEventListener('click', this.handleTableActions.bind(this));
        DOM.tabelaHistoricoBody?.addEventListener('click', this.handleTableActions.bind(this));

        // Event Delegation (Cronograma)
        DOM.containerHojeSlots?.addEventListener('click', this.handleScheduleAction.bind(this));

        // Formulários
        DOM.formConfig?.addEventListener('input', this.handleConfigInput.bind(this));
        DOM.formConfig?.addEventListener('submit', this.handleConfigSubmit.bind(this));
        DOM.formMateria?.addEventListener('submit', this.handleMateriaSubmit.bind(this));
        DOM.formRegistro?.addEventListener('submit', this.handleRegistroSubmit.bind(this));

        // Paginação do Diário
        DOM.btnPageFirst?.addEventListener('click', () => this.changeDiaryPage('first'));
        DOM.btnPagePrev?.addEventListener('click', () => this.changeDiaryPage('prev'));
        DOM.btnPageNext?.addEventListener('click', () => this.changeDiaryPage('next'));
        DOM.btnPageLast?.addEventListener('click', () => this.changeDiaryPage('last'));
        DOM.diaryPageSize?.addEventListener('change', (e) => this.changeDiaryPageSize(e.target.value));

        // Ferramentas do Topo (IO/Arquivos)
        DOM.btnSalvar?.addEventListener('click', this.exportData.bind(this));
        DOM.btnAbrir?.addEventListener('click', this.importData.bind(this));
        DOM.btnNovo?.addEventListener('click', this.resetData.bind(this));
    },

    switchView(targetViewId) {
        DOM.modais.forEach(modal => { if (!modal.classList.contains('hidden')) Utils.closeModal(modal); });

        const currentView = document.querySelector('.view:not(.hidden)');
        const targetView = document.getElementById(targetViewId);
        
        if (currentView === targetView) return;

        // Linha do tempo GSAP para suavizar a saída da tela velha e entrada da nova
        const timeline = gsap.timeline();

        if (currentView) {
            timeline.to(currentView, {
                opacity: 0, y: -10, duration: 0.2, ease: "power2.in",
                onComplete: () => currentView.classList.add('hidden')
            });
        }

        timeline.call(() => {
            if (targetView) targetView.classList.remove('hidden');
            
            // Controle dos Botões Flutuantes (Mobile) com Efeito "Pop"
            const fabMateria = document.getElementById('fab-add-materia');
            const fabRegistro = document.getElementById('fab-add-registro');
            if (fabMateria) {
                fabMateria.classList.toggle('hidden', targetViewId !== 'view-plan');
                if (targetViewId === 'view-plan') gsap.fromTo(fabMateria, { scale: 0 }, { scale: 1, duration: 0.4, ease: "back.out(1.7)" });
            }
            if (fabRegistro) {
                fabRegistro.classList.toggle('hidden', targetViewId !== 'view-diary');
                if (targetViewId === 'view-diary') gsap.fromTo(fabRegistro, { scale: 0 }, { scale: 1, duration: 0.4, ease: "back.out(1.7)" });
            }

            Views.renderAll();
        });

        if (targetView) {
            timeline.fromTo(targetView, 
                { opacity: 0, y: 15 }, 
                { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }
            );
        }
    },

    /* --- Handlers de Delegação de Eventos --- */
    handleTableActions(e) {
        const btnEdit = e.target.closest('.btn-action-edit');
        const btnDelete = e.target.closest('.btn-action-delete');

        if (btnEdit) {
            const { id, type } = btnEdit.dataset;
            if (type === 'materia') this.editMateria(id);
            if (type === 'registro') this.editRegistro(id);
        }

        if (btnDelete) {
            const { id, type } = btnDelete.dataset;
            if (type === 'materia') this.deleteMateria(id);
            if (type === 'registro') this.deleteRegistro(id);
        }
    },

    handleScheduleAction(e) {
        const card = e.target.closest('.slot-card');
        if (!card || card.classList.contains('slot-done')) return;
        
        const slotData = card.dataset.slotData ? JSON.parse(card.dataset.slotData) : null;
        if (!slotData) return;

        Utils.showConfirmModal(`Confirmar a conclusão da sessão de ${slotData.nome}?`, () => {
            card.classList.add('anim-success');
            setTimeout(() => {
                const novoReg = {
                    id: Date.now().toString(),
                    data: Utils.getTodayStr(),
                    idMateria: slotData.idMateria,
                    tipo: slotData.tipo,
                    quantidade: 1,
                    comentario: 'Feito pelo Cronograma'
                };
                Store.state.registros.push(novoReg);
                Store.save();
                Views.renderAll();
                Utils.showToast(`Mandou bem! Sessão de ${slotData.nome} concluída.`, 'success');
            }, 500);
        });
    },

    /* --- Handlers de Ações Específicas --- */
    editMateria(id) {
        const mat = Store.state.materias.find(m => m.id === id);
        if (!mat) return;
        
        AppContext.editingMateriaId = id;
        document.getElementById('mat-nome').value = mat.nome;
        document.getElementById('mat-peso').value = mat.peso;
        document.getElementById('mat-sessoes').value = mat.sessoes;
        document.getElementById('mat-questoes').value = mat.questoes;
        
        DOM.modalMateriaTitle.textContent = 'Editar Matéria';
        Utils.openModal(DOM.modalMateria);
    },

    deleteMateria(id) {
        Utils.showConfirmModal('Excluir esta matéria e tirá-la da fila de estudos permanentemente?', () => {
            Store.state.materias = Store.state.materias.filter(m => m.id !== id);
            Store.save();
            Views.renderAll();
            Utils.showToast('Matéria excluída com sucesso.', 'info');
        });
    },

    editRegistro(id) {
        const reg = Store.state.registros.find(r => r.id === id);
        if (!reg) return;
        
        AppContext.editingRegistroId = id;
        document.getElementById('reg-data').value = reg.data;
        document.getElementById('reg-materia').value = reg.idMateria;
        document.getElementById('reg-tipo').value = reg.tipo;
        document.getElementById('reg-quantidade').value = reg.quantidade;
        document.getElementById('reg-comentario').value = reg.comentario || '';
        
        DOM.modalRegistroTitle.textContent = 'Editar Registro';
        Utils.openModal(DOM.modalRegistro);
    },

    deleteRegistro(id) {
        Utils.showConfirmModal('Desfazer este registro? O cronograma irá devolver esta sessão como pendente.', () => {
            Store.state.registros = Store.state.registros.filter(r => r.id !== id);
            Store.save();
            Views.renderAll();
            Utils.showToast('Registro excluído.', 'info');
        });
    },

    /* --- Handlers de Paginação do Diário --- */
    changeDiaryPage(action) {
        const totalItems = Store.state.registros.length;
        const totalPages = Math.ceil(totalItems / AppContext.diarioItemsPerPage);

        if (action === 'first') AppContext.diarioCurrentPage = 1;
        else if (action === 'prev' && AppContext.diarioCurrentPage > 1) AppContext.diarioCurrentPage--;
        else if (action === 'next' && AppContext.diarioCurrentPage < totalPages) AppContext.diarioCurrentPage++;
        else if (action === 'last') AppContext.diarioCurrentPage = totalPages;
        
        Views.renderDiary(); 
    },

    changeDiaryPageSize(size) {
        AppContext.diarioItemsPerPage = Number(size);
        AppContext.diarioCurrentPage = 1; 
        Views.renderDiary();
    },

    /* --- Handlers de Formulários --- */
    handleConfigInput() {
        DOM.btnSalvarConfig.disabled = false;
        DOM.btnSalvarConfig.innerHTML = '<span class="material-symbols-outlined">save</span> Salvar Alterações';
    },

    handleConfigSubmit(e) {
        e.preventDefault(); 
        
        let slotsQ = 0;
        const maxMat = Number(document.getElementById('cfg-max-materias').value);
        const dias = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
        
        dias.forEach(d => {
            const tipo = document.querySelector(`input[name="cfg-${d}-tipo"]:checked`).value;
            const slots = Number(document.getElementById(`cfg-${d}-slots`).value);
            if (tipo === 'questoes') slotsQ += slots;
        });

        DOM.alertaMatriz.classList.add('hidden');
        if (slotsQ > 0 && slotsQ < maxMat) {
            DOM.alertaMatriz.innerHTML = `<strong>Atenção:</strong> Você definiu máximo de ${maxMat} matérias simultâneas, mas sua semana só tem ${slotsQ} sessões de Questões. Cada matéria ativa precisa de pelo menos 1 sessão de questões.`;
            DOM.alertaMatriz.classList.remove('hidden');
            return; 
        }

        Store.state.config.dataInicio = document.getElementById('cfg-data-inicio').value;
        Store.state.config.dataFim = document.getElementById('cfg-data-fim').value;
        Store.state.config.maxMaterias = Number(document.getElementById('cfg-max-materias').value);
        Store.state.config.minutosSessao = Number(document.getElementById('cfg-minutos-sessao').value);
        Store.state.config.questoesSessao = Number(document.getElementById('cfg-questoes-sessao').value);

        dias.forEach(d => {
            Store.state.config.matrizSemanal[d].tipo = document.querySelector(`input[name="cfg-${d}-tipo"]:checked`).value;
            Store.state.config.matrizSemanal[d].slots = Number(document.getElementById(`cfg-${d}-slots`).value);
        });

        Store.save();
        Views.renderAll();

        DOM.btnSalvarConfig.classList.remove('btn-primary');
        DOM.btnSalvarConfig.classList.add('btn-success');
        DOM.btnSalvarConfig.innerHTML = '<span class="material-symbols-outlined">done_all</span> Atualizado!';
        Utils.showToast('A Sugar Mommy recalculou seu plano.', 'success');

        setTimeout(() => Views.renderConfig(), 2000);
    },

    handleMateriaSubmit(e) {
        e.preventDefault();
        const novaMateria = {
            id: AppContext.editingMateriaId ? AppContext.editingMateriaId : Date.now().toString(),
            nome: document.getElementById('mat-nome').value,
            peso: document.getElementById('mat-peso').value,
            sessoes: document.getElementById('mat-sessoes').value,
            questoes: document.getElementById('mat-questoes').value
        };

        if (AppContext.editingMateriaId) {
            const index = Store.state.materias.findIndex(m => m.id === AppContext.editingMateriaId);
            if (index > -1) Store.state.materias[index] = novaMateria;
        } else {
            Store.state.materias.push(novaMateria); 
        }

        Store.save();
        Views.renderAll();
        Utils.closeModal(DOM.modalMateria);
    },

    handleRegistroSubmit(e) {
        e.preventDefault();
        const dadosRegistro = {
            id: AppContext.editingRegistroId ? AppContext.editingRegistroId : Date.now().toString(),
            data: document.getElementById('reg-data').value,
            idMateria: document.getElementById('reg-materia').value,
            tipo: document.getElementById('reg-tipo').value,
            quantidade: document.getElementById('reg-quantidade').value,
            comentario: document.getElementById('reg-comentario').value
        };

        if (AppContext.editingRegistroId) {
            const index = Store.state.registros.findIndex(r => r.id === AppContext.editingRegistroId);
            if (index > -1) Store.state.registros[index] = dadosRegistro;
            Utils.showToast('Registro atualizado.', 'success');
        } else {
            Store.state.registros.push(dadosRegistro);
            Utils.showToast('Registro manual salvo.', 'success');
        }

        Store.save();
        Views.renderAll();
        Utils.closeModal(DOM.modalRegistro);
    },

    /* --- Arquivos / Configurações --- */
    exportData() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(Store.state, null, 2));
        const a = document.createElement('a');
        a.href = dataStr; 
        a.download = "projeto_sugar_mommy.json";
        document.body.appendChild(a); 
        a.click(); 
        a.remove();
    },

    importData() {
        const input = document.createElement('input');
        input.type = 'file'; 
        input.accept = '.json';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    Store.state = JSON.parse(e.target.result);
                    Store.save(); 
                    Views.renderAll();
                    Utils.showToast('Plano importado com sucesso!', 'success');
                } catch (err) { 
                    alert('Erro ao processar o arquivo. Verifique a formatação do JSON.'); 
                }
            };
            reader.readAsText(file);
        };
        input.click();
    },

    resetData() {
        Utils.showConfirmModal('Atenção: Criar um Novo Plano apagará todo o seu progresso atual permanentemente. Deseja continuar?', () => {
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        });
    }
};

/* ========================================================================== */
/* CAPÍTULO 7: INICIALIZAÇÃO (BOOTSTRAP)                                      */
/* Inicializa o ciclo de vida da aplicação                                    */
/* ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    Store.load();
    Views.renderAll();
    Controllers.initEvents();

    if (typeof Sortable !== 'undefined' && DOM.listaMateriasDrag) {
        Sortable.create(DOM.listaMateriasDrag, {
            handle: '.drag-handle',
            animation: 150, 
            ghostClass: 'sortable-ghost', 
            dragClass: 'sortable-drag', 
            filter: '.row-cut-off, .empty-state', 
            // Previne falhas de Scroll x Drag em Mobile
            delay: 150,
            delayOnTouchOnly: true,
            
            onEnd: function () {
                const linhasHTML = DOM.listaMateriasDrag.querySelectorAll('tr[data-id]');
                const novaOrdemIds = Array.from(linhasHTML).map(row => row.dataset.id);
                
                Store.state.materias.sort((a, b) => novaOrdemIds.indexOf(a.id) - novaOrdemIds.indexOf(b.id));
                
                Store.save();
                Views.renderAll(); 
                Utils.showToast('Fila reordenada.', 'success');
            }
        });
    }
});