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
    chartMateriasInstance: null,
    weekOffset: 0 /* Controle de navegação do Kanban (0 = Atual, -1 = Passada, 1 = Próxima) */
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
    kanbanBoardContainer: document.getElementById('kanban-board-container'),
    
    /* Controles Híbridos (Desktop/Mobile) */
    btnPrevWeekTop: document.getElementById('btn-prev-week-top'),
    btnNextWeekTop: document.getElementById('btn-next-week-top'),
    weekLabelTextTop: document.getElementById('week-label-text-top'),
    btnPrevWeekInner: document.getElementById('btn-prev-week-inner'),
    btnNextWeekInner: document.getElementById('btn-next-week-inner'),
    weekLabelTextInner: document.getElementById('week-label-text-inner'),
    
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

    /* --- Motor Nativo de Feedback Tátil (Hardware) --- */
    haptic(pattern = 'light') {
        if (!navigator.vibrate) return;
        if (pattern === 'light') navigator.vibrate(15); // Clique sutil (Troca de abas)
        else if (pattern === 'success') navigator.vibrate([30, 50, 30]); // Duplo pulso (Celebração/Check)
        else if (pattern === 'warning') navigator.vibrate([40, 60, 40]); // Vibração de alerta (Exclusão)
    },

    openModal(el) {
        if (!el) return;
        el.classList.remove('hidden');
        
        gsap.fromTo(el, 
            { opacity: 0, backdropFilter: "blur(0px)" }, 
            { opacity: 1, backdropFilter: "blur(2px)", duration: 0.3 }
        );
        
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
                
                if (el.id === 'modal-materia') { 
                    DOM.formMateria.reset(); 
                    AppContext.editingMateriaId = null; 
                    DOM.modalMateriaTitle.textContent = 'Adicionar Matéria';
                    document.getElementById('btn-modal-delete-materia')?.classList.add('hidden');
                }
                if (el.id === 'modal-registro') { 
                    DOM.formRegistro.reset(); 
                    AppContext.editingRegistroId = null;
                    DOM.modalRegistroTitle.textContent = 'Adicionar Estudo';
                    document.getElementById('btn-modal-delete-registro')?.classList.add('hidden');
                }
                if (el.id === 'modal-confirm') {
                    AppContext.confirmActionCallback = null;
                }
            }
        });
    },

    showConfirmModal(message, callback) {
        this.haptic('warning'); // Dispara Haptic de atenção
        DOM.modalConfirmMsg.textContent = message;
        AppContext.confirmActionCallback = callback;
        this.openModal(DOM.modalConfirm);
    },

    showToast(message, type = 'info') {
        if (!DOM.toastContainer) return;
        
        // Conecta o motor háptico aos toques de sucesso ou erro automáticos
        if (type === 'success') this.haptic('success');
        else if (type === 'error') this.haptic('warning');
        
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

    projetarSemana(startOfWeekStr, classificacao, matrizAjustada, maxMaterias) {
        let simStats = JSON.parse(JSON.stringify(classificacao.stats));
        let materias = Store.state.materias;
        let manuts = JSON.parse(JSON.stringify(classificacao.manutencao)).sort((a,b) => b.peso - a.peso);
        
        let plan = {}; 
        let todayStr = Utils.getTodayStr();
        
        // Define o intervalo alvo da semana
        let targetStart = new Date(startOfWeekStr + 'T00:00:00');
        let targetEnd = new Date(startOfWeekStr + 'T00:00:00');
        targetEnd.setDate(targetEnd.getDate() + 6);

        // O Motor 3.0 começa a simular a partir de HOJE ou do INÍCIO DA SEMANA ALVO (o que for mais antigo)
        let todayObj = new Date(todayStr + 'T00:00:00');
        let loopDate = new Date(Math.min(todayObj.getTime(), targetStart.getTime()));
        
        // Ponteiros baseados na data de início da simulação
        let epochSimStart = Math.floor(loopDate.getTime() / 86400000);
        let ptTeoria = epochSimStart * 10; 
        let ptQuestoes = epochSimStart * 10; 
        let ptManut = epochSimStart * 10;

        // Roda a esteira de tempo até o último dia da semana que será exibida
        while (loopDate <= targetEnd) {
            let dStr = loopDate.toISOString().split('T')[0];
            let diaDaSemana = ['dom','seg','ter','qua','qui','sex','sab'][loopDate.getDay()];
            let configDia = matrizAjustada[diaDaSemana];
            let slotsDoDia = [];

            if (configDia && configDia.tipo !== 'descanso' && configDia.slots > 0) {
                for(let s = 0; s < configDia.slots; s++) {
                    
                    let incompletas = materias.filter(m => {
                        let st = simStats[m.id];
                        let mT = Number(m.sessoes)||0; let mQ = Number(m.questoes)||0;
                        return !( (mT>0 || mQ>0) && st.teoriaFeita >= mT && st.questoesFeitas >= mQ );
                    });
                    let ativas = incompletas.slice(0, maxMaterias);

                    let matSelecionada = null;
                    
                    if (configDia.tipo === 'teoria') {
                        let cand = ativas.filter(m => simStats[m.id].teoriaFeita < (Number(m.sessoes)||0));
                        if(cand.length > 0) { matSelecionada = cand[ptTeoria % cand.length]; ptTeoria++; }
                    } else if (configDia.tipo === 'questoes') {
                        let cand = ativas.filter(m => simStats[m.id].questoesFeitas < (Number(m.questoes)||0));
                        if(cand.length > 0) { matSelecionada = cand[ptQuestoes % cand.length]; ptQuestoes++; }
                    } else if (configDia.tipo === 'manutencao') {
                        if(manuts.length > 0) { matSelecionada = manuts[ptManut % manuts.length]; ptManut++; }
                    }

                    if (matSelecionada) {
                        slotsDoDia.push({ 
                            idMateria: matSelecionada.id, 
                            nome: matSelecionada.nome, 
                            tipo: configDia.tipo,
                            progressoSimulado: JSON.parse(JSON.stringify(simStats[matSelecionada.id]))
                        });
                        
                        // O SEGREDO: Só soma na simulação se o dia for Hoje ou Futuro. 
                        // O Passado não é simulado porque a realidade (o banco de dados) já computou o que aconteceu.
                        if (dStr >= todayStr) {
                            if(configDia.tipo === 'teoria') simStats[matSelecionada.id].teoriaFeita++;
                            if(configDia.tipo === 'questoes') simStats[matSelecionada.id].questoesFeitas++;
                            if(configDia.tipo === 'manutencao') simStats[matSelecionada.id].manutencaoFeita++;
                        }
                    }
                }
            }
            
            // Só guarda o slot gerado na memória se o dia pertencer à semana que o usuário pediu para ver
            if (loopDate >= targetStart && loopDate <= targetEnd) {
                plan[dStr] = slotsDoDia;
            }
            
            loopDate.setDate(loopDate.getDate() + 1); // Avança 1 dia
        }
        
        return plan;
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
                document.getElementById(`cfg-${d}-tipo`).value = c.matrizSemanal[d].tipo;
                document.getElementById(`cfg-${d}-slots`).value = c.matrizSemanal[d].slots;
            }
        });

        if (DOM.btnSalvarConfig) {
            DOM.btnSalvarConfig.disabled = true;
            DOM.btnSalvarConfig.innerHTML = '<span class="material-symbols-outlined">save</span> Salvar Preferências';
            DOM.btnSalvarConfig.classList.remove('btn-success');
            DOM.btnSalvarConfig.classList.add('btn-primary');
        }
    },

    renderPlan() {
        DOM.listaMateriasDrag.innerHTML = '';
        
        if (Store.state.materias.length === 0) {
            DOM.listaMateriasDrag.innerHTML = `
                <tr class="empty-state">
                    <td colspan="7">
                        <div class="onboarding-wrapper" style="margin: 0 auto; box-shadow: none; background: transparent; border: 1px dashed var(--border-color);">
                            <span class="material-symbols-outlined empty-icon" style="color: var(--color-primary); opacity: 1;">library_books</span>
                            <h3 style="margin-top: 16px;">Sua Lista de Matérias</h3>
                            <p>Adicione as disciplinas que você está estudando para que possamos organizar sua fila de prioridades.</p>
                            <button class="btn btn-primary" onclick="Utils.openModal(document.getElementById('modal-materia'))">
                                <span class="material-symbols-outlined">add</span> Adicionar Matéria
                            </button>
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
                cutLineFinalizadas.innerHTML = `<td colspan="7"><div class="cut-off-divider">Matérias Finalizadas (Apenas Revisão)</div><br></td>`;
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
                badge = `<span class="status-badge" style="color: var(--color-success);">Finalizada</span>`;
                rowColorClass = 'row-completed';
            } else {
                activeRendered++; 
                if (activeRendered <= limit) {
                    badge = `<span class="status-badge" style="color: var(--color-primary);">Ativa</span>`;
                    rowColorClass = 'row-active';
                } else {
                    badge = `<span class="status-badge" style="color: var(--text-muted);">Fila</span>`;
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
                cutLine.innerHTML = `<td colspan="7"><div class="cut-off-divider">Em Andamento ↑ | Fila de Espera ↓</div><br></td>`;
                DOM.listaMateriasDrag.appendChild(cutLine);
            }
        });
    },

    renderSchedule() {
        const kanbanContainer = DOM.kanbanBoardContainer;
        if (!kanbanContainer) return;

        kanbanContainer.innerHTML = '';

        // Intervenção de Onboarding: Se não há matérias, esconde o Kanban
        if (Store.state.materias.length === 0) {
            kanbanContainer.innerHTML = `
                <div class="onboarding-wrapper" style="margin: 16px auto; max-width: 500px;">
                    <span class="material-symbols-outlined empty-icon" style="color: var(--color-warning); opacity: 1;">event_busy</span>
                    <h3 style="margin-top: 16px;">Cronograma Indisponível</h3>
                    <p>A <strong>assistente particular para os estudos</strong> precisa das suas matérias e metas para conseguir gerar sua semana automaticamente.</p>
                    <button class="btn btn-primary" onclick="Controllers.switchView('view-config')">Ir para Configurações</button>
                </div>`;
            return;
        }

        const classificacao = Logic.classificarFila();
        const matrizAjustada = Logic.getMatrizAjustada(classificacao.manutencao);

        // Lógica de Calendário Fixo: Encontrar a Segunda-feira base e aplicar o Offset
        const hojeObj = new Date(Utils.getTodayStr() + 'T00:00:00');
        const diaDaSemanaHoje = hojeObj.getDay(); 
        const diffParaSegunda = diaDaSemanaHoje === 0 ? -6 : 1 - diaDaSemanaHoje; 
        
        const segundaFeiraAtual = new Date(hojeObj);
        segundaFeiraAtual.setDate(hojeObj.getDate() + diffParaSegunda);

        const startOfWeek = new Date(segundaFeiraAtual);
        startOfWeek.setDate(segundaFeiraAtual.getDate() + (AppContext.weekOffset * 7));

        let labelTxt = "";
        if (AppContext.weekOffset === 0) labelTxt = "Semana Atual";
        else if (AppContext.weekOffset === -1) labelTxt = "Semana Passada";
        else if (AppContext.weekOffset === 1) labelTxt = "Próxima Semana";
        else {
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            const format = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            labelTxt = `${format(startOfWeek)} a ${format(endOfWeek)}`;
        }
        
        if (DOM.weekLabelTextTop) DOM.weekLabelTextTop.textContent = labelTxt;
        if (DOM.weekLabelTextInner) DOM.weekLabelTextInner.textContent = labelTxt;

        const diasSemanaNomes = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
        const startOfWeekStr = startOfWeek.toISOString().split('T')[0];
        
        // Simulação Dinâmica da Semana (O Motor 2.0 entra em ação)
        const projecaoSemana = Logic.projetarSemana(startOfWeekStr, classificacao, matrizAjustada, Store.state.config.maxMaterias);

        for (let i = 0; i < 7; i++) {
            const currentDayObj = new Date(startOfWeek);
            currentDayObj.setDate(startOfWeek.getDate() + i);
            const dataStr = currentDayObj.toISOString().split('T')[0];
            const dataDisplay = currentDayObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

            const todayStr = Utils.getTodayStr();
            const isToday = dataStr === todayStr;
            const isPast = dataStr < todayStr;
            
            const planStart = Store.state.config.dataInicio;
            const planEnd = Store.state.config.dataFim;
            const isOutOfBounds = (planStart && dataStr < planStart) || (planEnd && dataStr > planEnd);

            let colClasses = 'kanban-column';
            if (isOutOfBounds) colClasses += ' is-disabled';
            else if (isPast) colClasses += ' is-past';
            else if (AppContext.weekOffset > 0) colClasses += ' is-future';
            
            if (isToday) colClasses += ' is-today';

            const colEl = document.createElement('div');
            colEl.className = colClasses;

            let colHtml = `
                <div class="kanban-header">
                    <span class="kanban-header-day">${diasSemanaNomes[i]}</span>
                    <span class="kanban-header-date" style="opacity: 0.4;">•</span>
                    <span class="kanban-header-date">${isToday ? '<strong style="color: var(--color-primary);">HOJE</strong> ' : ''}${dataDisplay}</span>
                </div>
            `;

            if (isOutOfBounds) {
                colHtml += `<div class="text-center text-muted text-sm mt-3" style="font-weight: 500;">Fora do período do plano.</div>`;
            } else {
                const slotsProg = projecaoSemana[dataStr] || [];
                const feitosNesteDia = Store.state.registros.filter(r => r.data === dataStr);
                
                let slotsConsumidos = { teoria: {}, questoes: {}, manutencao: {} };
                feitosNesteDia.forEach(r => {
                    let t = r.tipo === 'sessoes' ? 'teoria' : r.tipo; 
                    if (!slotsConsumidos[t][r.idMateria]) slotsConsumidos[t][r.idMateria] = { count: 0, ids: [] };
                    slotsConsumidos[t][r.idMateria].count += Number(r.quantidade);
                    slotsConsumidos[t][r.idMateria].ids.push(r.id); 
                });

                if (slotsProg.length === 0) {
                    const tipoDia = Store.state.config.matrizSemanal[['seg','ter','qua','qui','sex','sab','dom'][i]].tipo;
                    if(tipoDia === 'descanso') {
                        colHtml += `<div class="kanban-card type-descanso"><span class="kanban-card-title">Descanso</span></div>`;
                    } else {
                        colHtml += `<div class="text-center text-muted text-sm mt-3">Sem metas para hoje.</div>`;
                    }
                } else {
                    slotsProg.forEach((slot) => {
                        let isDone = false;
                        let registroId = null;
                        
                        if (slotsConsumidos[slot.tipo] && slotsConsumidos[slot.tipo][slot.idMateria] && slotsConsumidos[slot.tipo][slot.idMateria].count > 0) {
                            isDone = true;
                            slotsConsumidos[slot.tipo][slot.idMateria].count -= 1;
                            registroId = slotsConsumidos[slot.tipo][slot.idMateria].ids.pop();
                        }

                        // Cálculo do Efeito Gradiente usando a Estatística Simulada exata deste slot!
                        const mat = Store.state.materias.find(m => m.id === slot.idMateria);
                        const st = slot.progressoSimulado; 
                        let metaTotal = 0; let feita = 0;
                        
                        if (slot.tipo === 'teoria') { metaTotal = Number(mat?.sessoes || 0); feita = st.teoriaFeita; }
                        else if (slot.tipo === 'questoes') { metaTotal = Number(mat?.questoes || 0); feita = st.questoesFeitas; }

                        let percentual = 0;
                        if (metaTotal > 0) percentual = Math.min((feita / metaTotal) * 100, 100);
                        else if (slot.tipo === 'manutencao') percentual = 100;

                        const txtTipo = slot.tipo === 'teoria' ? 'Teoria' : slot.tipo === 'questoes' ? 'Questões' : 'Revisão';
                        const payload = { ...slot, dataStr, registroId };

                        let buttonHtml = '';
                        if (isToday) {
                            buttonHtml = `<button class="btn btn-finish-session kanban-action-btn" data-payload='${JSON.stringify(payload)}' data-action="${isDone ? 'undo' : 'do'}">${isDone ? 'Desfazer Conclusão' : 'Finalizar Sessão'}</button>`;
                        } else if (isPast) {
                            buttonHtml = `<div class="text-center text-sm" style="font-weight: 600; padding: 8px; border-radius: 4px; background: rgba(0,0,0,0.05);">${isDone ? 'Concluído' : 'Pendente'}</div>`;
                        } else {
                            buttonHtml = `<div class="text-center text-sm text-muted">Sessão Programada</div>`;
                        }

                        colHtml += `
                            <div class="kanban-card type-${slot.tipo} ${isDone ? 'is-done' : ''}">
                                <div class="kanban-card-meta flex-between">
                                    <span>${txtTipo}</span>
                                </div>
                                <div class="kanban-card-title">${slot.nome}</div>
                                <div class="kanban-progress-wrapper" title="${Math.floor(percentual)}% Concluído">
                                    <div class="kanban-progress-fill" style="width: ${percentual}%;"></div>
                                </div>
                                ${buttonHtml}
                            </div>
                        `;
                    });
                }
            }

            colEl.innerHTML = colHtml;
            kanbanContainer.appendChild(colEl);
        }

        // Auto-Scroll Mobile para Scroll Snap Magnético
        if (window.innerWidth <= 768 && AppContext.weekOffset === 0) {
            setTimeout(() => {
                const todayCol = kanbanContainer.querySelector('.kanban-column.is-today');
                if (todayCol) {
                    // O comando nativo 'scrollIntoView' calcula automaticamente a matemática 
                    // perfeita para alinhar o card magnético no centro (inline: 'center')
                    todayCol.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            }, 100);
        }
    },

    renderDashboard() {
        const dashboardGrid = document.querySelector('.dashboard-grid');
        const greetingHeader = document.querySelector('.greeting-card');
        
        // INTERVENÇÃO DE ONBOARDING: Se for a primeira vez do usuário, mostraremos o caminho
        if (Store.state.materias.length === 0) {
            dashboardGrid.classList.add('hidden');
            if (greetingHeader) greetingHeader.classList.add('hidden'); // Oculta o Greeting
            
            let onboardingEl = document.getElementById('dashboard-onboarding');
            if (!onboardingEl) {
                onboardingEl = document.createElement('div');
                onboardingEl.id = 'dashboard-onboarding';
                onboardingEl.className = 'onboarding-wrapper';
                onboardingEl.innerHTML = `
                    <span class="material-symbols-outlined empty-icon" style="font-size: 64px; color: var(--color-primary); opacity: 1; margin-bottom: 16px;">rocket_launch</span>
                    <h3>Bem-vindo ao Sugar Mommy Planner!</h3>
                    <p>Sua assistente particular para os estudos. Notei que seu plano ainda não foi configurado. Vamos dar o primeiro passo?</p>
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
            return; 
        } else {
            dashboardGrid.classList.remove('hidden');
            if (greetingHeader) greetingHeader.classList.remove('hidden'); // Revela o Greeting
            const existingOnboarding = document.getElementById('dashboard-onboarding');
            if (existingOnboarding) existingOnboarding.classList.add('hidden');
        }

        /* --- Inteligência do Greeting Card --- */
        const hora = new Date().getHours();
        let saudacao = 'Boa noite'; let emoji = '🌙';
        if (hora >= 5 && hora < 12) { saudacao = 'Bom dia'; emoji = '☀️'; }
        else if (hora >= 12 && hora < 18) { saudacao = 'Boa tarde'; emoji = '☕'; }

        // Calcula a métrica do dia
        const hojeObj = new Date();
        const diasSemana = ['dom','seg','ter','qua','qui','sex','sab'];
        const diaHojeStr = diasSemana[hojeObj.getDay()];
        const matriz = Store.state.config.matrizSemanal[diaHojeStr];
        
        const sessoesPlanejadas = (matriz && matriz.tipo !== 'descanso') ? matriz.slots : 0;
        const feitasHoje = Store.state.registros.filter(r => r.data === Utils.getTodayStr()).length;
        const pendentes = Math.max(0, sessoesPlanejadas - feitasHoje);

        let msgStatus = '';
        if (sessoesPlanejadas === 0) msgStatus = 'Dia de descanso programado. Aproveite! 🏖️';
        else if (pendentes === 0) msgStatus = 'Incrível! Todas as suas metas de hoje estão concluídas. 🎉';
        else msgStatus = `Você tem <strong>${pendentes} sessões</strong> programadas para hoje. Vamos nessa?`;

        const greetingEl = document.getElementById('greeting-text');
        const statusEl = document.getElementById('greeting-status');
        if (greetingEl) greetingEl.innerHTML = `${saudacao}! ${emoji}`;
        if (statusEl) statusEl.innerHTML = msgStatus;
        
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
                    <p>Sua assistente particular para os estudos. Notei que seu plano ainda não foi configurado. Vamos dar o primeiro passo?</p>
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
            return; 
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
                    <td colspan="5">
                        <div class="onboarding-wrapper" style="margin: 0 auto; box-shadow: none; background: transparent; border: 1px dashed var(--border-color);">
                            <span class="material-symbols-outlined empty-icon" style="color: var(--color-primary); opacity: 1;">history</span>
                            <h3 style="margin-top: 16px;">Diário Vazio</h3>
                            <p>Nenhum estudo foi registrado ainda. Cumpra suas metas pelo Cronograma ou adicione uma sessão manualmente.</p>
                            <button class="btn btn-primary" onclick="document.getElementById('reg-data').value = Utils.getTodayStr(); Utils.openModal(document.getElementById('modal-registro'))">
                                <span class="material-symbols-outlined">add</span> Adicionar Estudo
                            </button>
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
            tr.dataset.id = reg.id;
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

    updateHeader() {
        const currentView = document.querySelector('.view:not(.hidden)');
        if (!currentView) return;
        const targetViewId = currentView.id;
        
        const hasMaterias = Store.state.materias.length > 0;
        
        // Inteligência: Título adaptativo caso o app esteja no modo Onboarding (Vazio)
        const titles = {
            'view-dashboard': hasMaterias ? 'Progresso' : 'Bem-vindo(a)',
            'view-schedule': 'Cronograma',
            'view-plan': 'Matérias',
            'view-diary': 'Diário de Estudo',
            'view-config': 'Configurações'
        };
        
        const headerTitle = document.getElementById('header-title');
        const headerBrandIcon = document.getElementById('header-brand-icon');
        const headerWeekControls = document.getElementById('header-week-controls');
        const innerWeekControls = document.querySelector('.inner-week-controls'); // Controle Desktop
        
        if (headerTitle) {
            headerTitle.classList.remove('hidden');
            headerTitle.textContent = titles[targetViewId];
        }
        
        if (headerBrandIcon) headerBrandIcon.classList.remove('hidden');
        
        // Oculta/Exibe a navegação da semana no Mobile (Topo)
        if (targetViewId === 'view-schedule' && hasMaterias) {
            if (headerWeekControls) headerWeekControls.classList.remove('hidden');
        } else {
            if (headerWeekControls) headerWeekControls.classList.add('hidden');
        }
        
        // Oculta a navegação da semana no Desktop (Interno) se não houver dados
        if (innerWeekControls) {
            innerWeekControls.classList.toggle('hidden', !hasMaterias);
        }
    },

    renderAll() {
        this.renderConfig();
        this.renderPlan();
        this.renderSchedule();
        this.renderDashboard();
        this.renderDiary();
        
        // Sempre que o app recalcular a tela, ele acerta o topo de forma unificada
        this.updateHeader(); 
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

        // Botões Lixeira (Dentro dos Modais de Edição)
        document.getElementById('btn-modal-delete-materia')?.addEventListener('click', () => {
            if (AppContext.editingMateriaId) {
                const id = AppContext.editingMateriaId;
                Utils.showConfirmModal('Excluir esta matéria permanentemente?', () => {
                    Store.state.materias = Store.state.materias.filter(m => m.id !== id);
                    Store.save(); Views.renderAll();
                    Utils.closeModal(DOM.modalMateria);
                    Utils.showToast('Matéria excluída com sucesso.', 'info');
                });
            }
        });
        
        document.getElementById('btn-modal-delete-registro')?.addEventListener('click', () => {
            if (AppContext.editingRegistroId) {
                const id = AppContext.editingRegistroId;
                Utils.showConfirmModal('Desfazer este registro? O cronograma irá devolver esta sessão como pendente.', () => {
                    Store.state.registros = Store.state.registros.filter(r => r.id !== id);
                    Store.save(); Views.renderAll();
                    Utils.closeModal(DOM.modalRegistro);
                    Utils.showToast('Registro excluído.', 'info');
                });
            }
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

        // Event Delegation (Cronograma Kanban)
        DOM.kanbanBoardContainer?.addEventListener('click', this.handleKanbanAction.bind(this));

        // Controles Híbridos de Navegação da Semana (Kanban)
        const prevWeekAction = () => { AppContext.weekOffset -= 1; Views.renderSchedule(); };
        const nextWeekAction = () => { AppContext.weekOffset += 1; Views.renderSchedule(); };
        
        DOM.btnPrevWeekTop?.addEventListener('click', prevWeekAction);
        DOM.btnNextWeekTop?.addEventListener('click', nextWeekAction);
        DOM.btnPrevWeekInner?.addEventListener('click', prevWeekAction);
        DOM.btnNextWeekInner?.addEventListener('click', nextWeekAction);

        // "Drag to Scroll" (Arrastar para rolar no Desktop)
        const kanbanBoard = DOM.kanbanBoardContainer;
        if (kanbanBoard) {
            let isDown = false;
            let startX;
            let scrollLeft;

            kanbanBoard.addEventListener('mousedown', (e) => {
                // Evita conflito ao clicar nos botões dos cartões
                if (e.target.closest('.btn-finish-session')) return;
                isDown = true;
                startX = e.pageX - kanbanBoard.offsetLeft;
                scrollLeft = kanbanBoard.scrollLeft;
            });
            kanbanBoard.addEventListener('mouseleave', () => { isDown = false; });
            kanbanBoard.addEventListener('mouseup', () => { isDown = false; });
            kanbanBoard.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const x = e.pageX - kanbanBoard.offsetLeft;
                const walk = (x - startX) * 2; // Multiplicador de velocidade
                kanbanBoard.scrollLeft = scrollLeft - walk;
            });
        }

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
        
        // Avisa ao Motor CSS Híbrido em qual tela estamos
        document.body.setAttribute('data-view', targetViewId);

        // Micro-vibração ao clicar na Bottom Navigation (Efeito físico do botão)
        Utils.haptic('light');

        // Linha do tempo GSAP recriando a transição nativa de Pilha (Stack)
        const timeline = gsap.timeline();

        if (currentView) {
            // A tela atual é levemente empurrada para a esquerda (-x) e some
            timeline.to(currentView, {
                opacity: 0, x: -30, duration: 0.2, ease: "power2.in",
                onComplete: () => {
                    currentView.classList.add('hidden');
                    gsap.set(currentView, { x: 0 }); // Limpa o rastro de posição
                }
            });
        }

        timeline.call(() => {
            if (targetView) {
                targetView.classList.remove('hidden');
                gsap.set(targetView, { x: 40, opacity: 0 }); // Posiciona a nova tela para entrar pela direita (+x)
            }
            
            // Controle dos Botões Flutuantes (Mobile) com Efeito "Pop" de mola
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
            // A nova tela desliza magneticamente para o centro (0)
            timeline.to(targetView, 
                { opacity: 1, x: 0, duration: 0.3, ease: "power2.out" }
            );
        }
    },

    /* --- Handlers de Delegação de Eventos --- */
    handleTableActions(e) {
        // Habilidade Touch (Mobile e Tablet): Clique na linha inteira para Editar
        if (window.innerWidth <= 1024) {
            const trMateria = e.target.closest('#tabela-materias tr[data-id]');
            const isDragHandle = e.target.closest('.drag-handle');
            if (trMateria && !isDragHandle) {
                this.editMateria(trMateria.dataset.id);
                return;
            }
            
            const trRegistro = e.target.closest('#tabela-historico tr[data-id]');
            if (trRegistro) {
                this.editRegistro(trRegistro.dataset.id);
                return;
            }
        }

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

    handleKanbanAction(e) {
        const btn = e.target.closest('.kanban-action-btn');
        if (!btn) return;

        Utils.haptic('light'); // Confirmação tátil instantânea de que o botão foi clicado

        const payload = JSON.parse(btn.dataset.payload);
        const action = btn.dataset.action;
        const card = btn.closest('.kanban-card');

        if (action === 'do') {
            Utils.showConfirmModal(`Finalizar a sessão de ${payload.nome}?`, () => {
                card.classList.add('anim-success');
                setTimeout(() => {
                    const novoReg = {
                        id: Date.now().toString(),
                        data: payload.dataStr, 
                        idMateria: payload.idMateria,
                        tipo: payload.tipo,
                        quantidade: 1,
                        comentario: 'Feito pelo Cronograma'
                    };
                    Store.state.registros.push(novoReg);
                    Store.save();
                    Views.renderAll();
                    Utils.showToast(`Sessão concluída!`, 'success');
                }, 500);
            });
        } else if (action === 'undo') {
            if (payload.registroId) {
                Utils.showConfirmModal(`Desfazer a conclusão desta sessão?`, () => {
                    Store.state.registros = Store.state.registros.filter(r => r.id !== payload.registroId);
                    Store.save();
                    Views.renderAll();
                });
            }
        }
    },

    /* --- Handlers de Ações Específicas --- */
    editMateria(id) {
        const mat = Store.state.materias.find(m => m.id === id);
        if (!mat) return;
        
        AppContext.editingMateriaId = id;
        document.getElementById('btn-modal-delete-materia')?.classList.remove('hidden');
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
        document.getElementById('btn-modal-delete-registro')?.classList.remove('hidden');
        document.getElementById('reg-data').value = reg.data;
        document.getElementById('reg-materia').value = reg.idMateria;
        document.getElementById('reg-tipo').value = reg.tipo;
        document.getElementById('reg-quantidade').value = reg.quantidade;
        document.getElementById('reg-comentario').value = reg.comentario || '';
        
        DOM.modalRegistroTitle.textContent = 'Editar Estudo';
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
        if (DOM.btnSalvarConfig) {
            DOM.btnSalvarConfig.disabled = false;
            DOM.btnSalvarConfig.innerHTML = '<span class="material-symbols-outlined">save</span> Salvar Preferências';
            DOM.btnSalvarConfig.classList.remove('btn-success');
            DOM.btnSalvarConfig.classList.add('btn-primary');
        }
    },

    handleConfigSubmit(e) {
        e.preventDefault(); 
        
        let slotsQ = 0;
        const maxMat = Number(document.getElementById('cfg-max-materias').value);
        const dias = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
        
        // Validação da Rotina usando os valores dos <select>
        dias.forEach(d => {
            const tipo = document.getElementById(`cfg-${d}-tipo`).value;
            const slots = Number(document.getElementById(`cfg-${d}-slots`).value);
            if (tipo === 'questoes') slotsQ += slots;
        });

        DOM.alertaMatriz.classList.add('hidden');
        if (slotsQ > 0 && slotsQ < maxMat) {
            DOM.alertaMatriz.innerHTML = `<strong>Atenção:</strong> Você definiu máximo de ${maxMat} matérias simultâneas, mas sua semana só tem ${slotsQ} sessões de Questões. Cada matéria ativa precisa de pelo menos 1 sessão de questões.`;
            Utils.haptic('warning');
            DOM.alertaMatriz.classList.remove('hidden');
            return; 
        }

        // Salva Dados Gerais
        Store.state.config.dataInicio = document.getElementById('cfg-data-inicio').value;
        Store.state.config.dataFim = document.getElementById('cfg-data-fim').value;
        Store.state.config.maxMaterias = Number(document.getElementById('cfg-max-materias').value);
        Store.state.config.minutosSessao = Number(document.getElementById('cfg-minutos-sessao').value);
        Store.state.config.questoesSessao = Number(document.getElementById('cfg-questoes-sessao').value);

        // Salva a Matriz Semanal
        dias.forEach(d => {
            Store.state.config.matrizSemanal[d].tipo = document.getElementById(`cfg-${d}-tipo`).value;
            Store.state.config.matrizSemanal[d].slots = Number(document.getElementById(`cfg-${d}-slots`).value);
        });

        Store.save();
        Views.renderAll();

        Utils.haptic('success');
        DOM.btnSalvarConfig.classList.remove('btn-primary');
        DOM.btnSalvarConfig.classList.add('btn-success');
        DOM.btnSalvarConfig.innerHTML = '<span class="material-symbols-outlined">done_all</span> Preferências Salvas!';
        Utils.showToast('Configurações atualizadas com sucesso.', 'success');

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
            Utils.showToast('Registro de estudo salvo.', 'success');
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
            animation: 200, // Transição um pouco mais suave ao reordenar
            ghostClass: 'sortable-ghost', 
            dragClass: 'sortable-drag',
            fallbackClass: 'sortable-fallback', 
            forceFallback: true, 
            fallbackOnBody: true,
            filter: '.row-cut-off, .empty-state', 
            
            /* --- Blindagem de Scroll Mobile (Fase 3) --- */
            delay: 250, // 250ms é o tempo exato do "Long Press" nativo de fábrica
            delayOnTouchOnly: true,
            touchStartThreshold: 5, // Se o dedo escorregar 5px antes do delay, o drag é cancelado para permitir a rolagem
            
            onChoose: function (evt) {
                // O celular avisa fisicamente com 3 vibrações rápidas que o cartão "descolou"
                Utils.haptic('success'); 
                
                // Microinteração GSAP: Cartão levanta fisicamente em direção ao dedo do usuário
                gsap.to(evt.item, { scale: 1.02, duration: 0.2, ease: "back.out(1.7)" });
            },
            
            onUnchoose: function (evt) {
                // Remove o efeito caso o usuário solte o cartão sem movê-lo de lugar
                gsap.to(evt.item, { scale: 1, duration: 0.2 });
            },
            
            onEnd: function (evt) {
                // Devolve a escala original ao soltar na nova posição
                gsap.to(evt.item, { scale: 1, duration: 0.2 });
                
                const linhasHTML = DOM.listaMateriasDrag.querySelectorAll('tr[data-id]');
                const novaOrdemIds = Array.from(linhasHTML).map(row => row.dataset.id);
                
                Store.state.materias.sort((a, b) => novaOrdemIds.indexOf(a.id) - novaOrdemIds.indexOf(b.id));
                
                Store.save();
                Views.renderAll(); 
                
                // Confirmação final dupla (O showToast agora já aciona o pulso de sucesso)
                Utils.showToast('Fila reordenada.', 'success');
            }
        });
    }
});