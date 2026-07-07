/* =========================================================================
   Escritório Digital · Castles Bay
   Aplicação de comunicação de marca: Calendário, Ideias e Tarefas,
   com categorias partilhadas (nome + cor). Dados guardados no browser.
   ========================================================================= */

(() => {
  'use strict';

  const STORAGE_KEY = 'castlesbay-office-v1';

  // Paleta sugerida para novas categorias
  const PALETTE = [
    '#2f5d62', '#3f7f86', '#0ea5e9', '#6366f1', '#8b5cf6',
    '#d946ef', '#ec4899', '#f43f5e', '#ef4444', '#f97316',
    '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981',
    '#14b8a6', '#64748b', '#78716c'
  ];

  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  // -------------------------------------------------------------- estado
  const defaultState = () => ({
    categories: [
      { id: uid(), name: 'Instagram', color: '#d946ef' },
      { id: uid(), name: 'Campanha', color: '#f97316' },
      { id: uid(), name: 'Newsletter', color: '#0ea5e9' }
    ],
    posts: [],   // { id, title, notes, date:'YYYY-MM-DD', categoryId, status:'planeado'|'publicado' }
    ideas: [],   // { id, title, notes, categoryId, createdAt }
    tasks: []    // { id, title, notes, categoryId, done, createdAt }
  });

  let state = loadState();
  let currentView = 'calendar';
  let categoryFilter = 'all';
  let calRef = new Date(); // mês em foco no calendário

  // -------------------------------------------------------------- utils
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function normalizeState(obj) {
    const s = (obj && typeof obj === 'object') ? obj : {};
    s.categories = Array.isArray(s.categories) ? s.categories : [];
    s.posts = Array.isArray(s.posts) ? s.posts : [];
    s.ideas = Array.isArray(s.ideas) ? s.ideas : [];
    s.tasks = Array.isArray(s.tasks) ? s.tasks : [];
    return s;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return normalizeState(JSON.parse(raw));
    } catch (e) {
      console.warn('Estado inválido, a recomeçar.', e);
      return defaultState();
    }
  }

  function persistLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function save() {
    persistLocal();
    if (SYNC.ready && !SYNC.applyingRemote) SYNC.push();
  }

  function categoryById(id) {
    return state.categories.find(c => c.id === id) || null;
  }

  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, m => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
    ));
  }

  function todayISO() {
    return toISO(new Date());
  }
  function toISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function formatDatePT(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${MESES[m - 1].slice(0, 3)} ${y}`;
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2200);
  }

  // filtra itens pela categoria activa
  function passesFilter(item) {
    return categoryFilter === 'all' || item.categoryId === categoryFilter;
  }

  // ============================================================ RENDER

  function render() {
    renderSidebar();
    renderCategoryFilter();
    document.querySelectorAll('.nav-item').forEach(b =>
      b.classList.toggle('active', b.dataset.view === currentView));

    const titles = { calendar: 'Calendário', ideas: 'Ideias', tasks: 'Tarefas' };
    const actions = { calendar: '＋ Novo post', ideas: '＋ Nova ideia', tasks: '＋ Nova tarefa' };
    document.getElementById('view-title').textContent = titles[currentView];
    document.getElementById('primary-action').textContent = actions[currentView];

    const c = document.getElementById('view-container');
    if (currentView === 'calendar') renderCalendar(c);
    else if (currentView === 'ideas') renderIdeas(c);
    else renderTasks(c);
  }

  // ---- Sidebar categorias
  function renderSidebar() {
    const list = document.getElementById('category-list');
    if (!state.categories.length) {
      list.innerHTML = `<li class="cat-empty">Sem categorias. Cria a primeira ＋</li>`;
      return;
    }
    list.innerHTML = state.categories.map(cat => {
      const count = countForCategory(cat.id);
      return `
        <li data-cat="${cat.id}" title="Filtrar por ${esc(cat.name)}">
          <span class="cat-dot" style="background:${esc(cat.color)}"></span>
          <span class="cat-name">${esc(cat.name)}</span>
          <span class="cat-count">${count}</span>
          <span class="cat-actions">
            <button class="icon-btn" data-edit-cat="${cat.id}" title="Editar">✎</button>
          </span>
        </li>`;
    }).join('');
  }

  function countForCategory(id) {
    return state.posts.filter(p => p.categoryId === id).length +
      state.ideas.filter(i => i.categoryId === id).length +
      state.tasks.filter(t => t.categoryId === id).length;
  }

  function renderCategoryFilter() {
    const sel = document.getElementById('category-filter');
    const prev = categoryFilter;
    sel.innerHTML = `<option value="all">Todas</option>` +
      state.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    sel.value = state.categories.some(c => c.id === prev) || prev === 'all' ? prev : 'all';
    categoryFilter = sel.value;
  }

  function catChip(categoryId) {
    const cat = categoryById(categoryId);
    if (!cat) return '';
    return `<span class="chip" style="background:${hexA(cat.color, .14)};color:${cat.color}">
      <span class="cat-dot" style="background:${esc(cat.color)}"></span>${esc(cat.name)}</span>`;
  }

  // ---- Calendário
  function renderCalendar(container) {
    const year = calRef.getFullYear();
    const month = calRef.getMonth();

    const first = new Date(year, month, 1);
    // offset com semana a começar à Segunda (getDay: 0=Dom)
    const startOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - startOffset);

    const posts = state.posts.filter(passesFilter);
    const byDate = {};
    posts.forEach(p => { (byDate[p.date] ||= []).push(p); });

    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const iso = toISO(d);
      const outside = d.getMonth() !== month;
      const isToday = iso === todayISO();
      const dayPosts = (byDate[iso] || []).sort((a, b) => a.title.localeCompare(b.title));

      const pills = dayPosts.map(p => {
        const cat = categoryById(p.categoryId);
        const color = cat ? cat.color : 'var(--text-faint)';
        return `<div class="cal-post ${p.status === 'publicado' ? 'done' : ''}"
          style="background:${hexA(color, .13)};color:${color};border-left-color:${color}"
          data-post="${p.id}" title="${esc(p.title)}">${esc(p.title)}</div>`;
      }).join('');

      cells += `
        <div class="cal-cell ${outside ? 'outside' : ''} ${isToday ? 'today' : ''}" data-day="${iso}">
          <span class="cal-daynum">${d.getDate()}</span>
          <span class="cal-add">＋</span>
          <div class="cal-posts">${pills}</div>
        </div>`;
    }

    container.innerHTML = `
      <div class="cal-toolbar">
        <div class="cal-title">${MESES[month]} ${year}</div>
        <div class="cal-nav">
          <button data-cal="today" class="cal-today">Hoje</button>
          <button data-cal="prev" title="Mês anterior">‹</button>
          <button data-cal="next" title="Mês seguinte">›</button>
        </div>
      </div>
      <div class="calendar">
        <div class="cal-weekdays">${DIAS_SEMANA.map(d => `<div>${d}</div>`).join('')}</div>
        <div class="cal-grid">${cells}</div>
      </div>`;
  }

  // ---- Ideias
  function renderIdeas(container) {
    const items = state.ideas.filter(passesFilter)
      .sort((a, b) => b.createdAt - a.createdAt);

    if (!items.length) {
      container.innerHTML = emptyState('💡', 'Sem ideias por aqui',
        'Aponta ideias de posts e de comunicação antes que fujam.');
      return;
    }

    container.innerHTML = `<div class="board">` + items.map(it => {
      const cat = categoryById(it.categoryId);
      const border = cat ? cat.color : 'var(--border-strong)';
      return `
        <div class="card" data-idea="${it.id}" style="border-top-color:${border}">
          <button class="icon-btn card-del" data-del-idea="${it.id}" title="Eliminar">🗑</button>
          <div class="card-title">${esc(it.title)}</div>
          ${it.notes ? `<div class="card-notes">${esc(it.notes)}</div>` : ''}
          <div class="card-foot">${catChip(it.categoryId)}</div>
        </div>`;
    }).join('') + `</div>`;
  }

  // ---- Tarefas
  function renderTasks(container) {
    const items = state.tasks.filter(passesFilter);
    if (!items.length) {
      container.innerHTML = emptyState('✅', 'Nenhuma tarefa',
        'Cria tarefas para não perderes o fio à meada da comunicação.');
      return;
    }

    const pending = items.filter(t => !t.done).sort((a, b) => b.createdAt - a.createdAt);
    const done = items.filter(t => t.done).sort((a, b) => b.createdAt - a.createdAt);

    const row = t => {
      const cat = categoryById(t.categoryId);
      return `
        <div class="task ${t.done ? 'done' : ''}" data-task-row="${t.id}">
          <input type="checkbox" class="task-check" data-toggle-task="${t.id}" ${t.done ? 'checked' : ''}>
          <div class="task-main" data-task="${t.id}">
            <div class="task-title">${esc(t.title)}</div>
            ${t.notes ? `<div class="task-notes">${esc(t.notes)}</div>` : ''}
            ${cat ? `<div class="task-meta">${catChip(t.categoryId)}</div>` : ''}
          </div>
          <button class="icon-btn task-del" data-del-task="${t.id}" title="Eliminar">🗑</button>
        </div>`;
    };

    container.innerHTML = `
      <div class="task-list">
        ${pending.length ? `<div class="task-section-label">A fazer · ${pending.length}</div>` : ''}
        ${pending.map(row).join('')}
        ${done.length ? `<div class="task-section-label">Concluídas · ${done.length}</div>` : ''}
        ${done.map(row).join('')}
      </div>`;
  }

  function emptyState(emoji, title, sub) {
    return `<div class="empty"><div class="empty-emoji">${emoji}</div>
      <h3>${esc(title)}</h3><p>${esc(sub)}</p></div>`;
  }

  // hex + alpha -> rgba
  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const n = parseInt(full, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ============================================================ MODAL

  const backdrop = document.getElementById('modal-backdrop');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');

  function openModal(title, bodyHTML, onMount) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHTML;
    backdrop.hidden = false;
    if (onMount) onMount();
    const firstInput = modalBody.querySelector('input, textarea, select');
    if (firstInput) firstInput.focus();
  }
  function closeModal() { backdrop.hidden = true; modalBody.innerHTML = ''; }

  function categorySelectOptions(selectedId) {
    if (!state.categories.length) {
      return `<option value="">(sem categorias)</option>`;
    }
    return `<option value="">— Sem categoria —</option>` +
      state.categories.map(c =>
        `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.name)}</option>`
      ).join('');
  }

  // ---- Modal Categoria (criar/editar)
  function openCategoryModal(catId) {
    const editing = catId ? categoryById(catId) : null;
    const chosen = editing ? editing.color : PALETTE[0];

    openModal(editing ? 'Editar categoria' : 'Nova categoria', `
      <div class="field">
        <label>Nome da categoria</label>
        <input type="text" id="cat-name" maxlength="40" placeholder="Ex.: Instagram, Blog, Loja…"
          value="${editing ? esc(editing.name) : ''}">
      </div>
      <div class="field">
        <label>Cor</label>
        <div class="color-grid" id="color-grid">
          ${PALETTE.map(c => `<span class="color-swatch ${c === chosen ? 'selected' : ''}"
            data-color="${c}" style="background:${c}"></span>`).join('')}
        </div>
      </div>
      <div class="modal-actions">
        ${editing ? `<button class="btn-danger" id="cat-delete">Eliminar</button>` : ''}
        <button class="btn-secondary" data-close>Cancelar</button>
        <button class="primary-btn" id="cat-save">${editing ? 'Guardar' : 'Criar'}</button>
      </div>
    `, () => {
      let color = chosen;
      modalBody.querySelectorAll('.color-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          modalBody.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
          sw.classList.add('selected');
          color = sw.dataset.color;
        });
      });
      modalBody.querySelector('#cat-save').addEventListener('click', () => {
        const name = modalBody.querySelector('#cat-name').value.trim();
        if (!name) { toast('Dá um nome à categoria.'); return; }
        if (editing) {
          editing.name = name; editing.color = color;
        } else {
          state.categories.push({ id: uid(), name, color });
        }
        save(); closeModal(); render();
        toast(editing ? 'Categoria actualizada.' : 'Categoria criada.');
      });
      const delBtn = modalBody.querySelector('#cat-delete');
      if (delBtn) delBtn.addEventListener('click', () => deleteCategory(editing.id));
    });
  }

  function deleteCategory(id) {
    const used = countForCategory(id);
    const msg = used
      ? `Esta categoria está em ${used} item(ns). Ao eliminar, esses itens ficam sem categoria. Continuar?`
      : 'Eliminar esta categoria?';
    if (!confirm(msg)) return;
    state.categories = state.categories.filter(c => c.id !== id);
    ['posts', 'ideas', 'tasks'].forEach(k =>
      state[k].forEach(it => { if (it.categoryId === id) it.categoryId = ''; }));
    if (categoryFilter === id) categoryFilter = 'all';
    save(); closeModal(); render();
    toast('Categoria eliminada.');
  }

  // ---- Modal Post
  function openPostModal(postId, presetDate) {
    const editing = postId ? state.posts.find(p => p.id === postId) : null;
    const status = editing ? editing.status : 'planeado';

    openModal(editing ? 'Editar post' : 'Novo post', `
      <div class="field">
        <label>Título do post</label>
        <input type="text" id="p-title" maxlength="120" placeholder="Ex.: Reel dos bastidores"
          value="${editing ? esc(editing.title) : ''}">
      </div>
      <div class="field">
        <label>Data</label>
        <input type="date" id="p-date" value="${editing ? editing.date : (presetDate || todayISO())}">
      </div>
      <div class="field">
        <label>Categoria</label>
        <select id="p-cat">${categorySelectOptions(editing ? editing.categoryId : (categoryFilter !== 'all' ? categoryFilter : ''))}</select>
      </div>
      <div class="field">
        <label>Estado</label>
        <div class="seg" id="p-status">
          <button type="button" class="seg-btn ${status === 'planeado' ? 'active' : ''}" data-status="planeado">Planeado</button>
          <button type="button" class="seg-btn ${status === 'publicado' ? 'active' : ''}" data-status="publicado">Publicado</button>
        </div>
      </div>
      <div class="field">
        <label>Notas / legenda</label>
        <textarea id="p-notes" placeholder="Ideia, legenda, referências…">${editing ? esc(editing.notes) : ''}</textarea>
      </div>
      <div class="modal-actions">
        ${editing ? `<button class="btn-danger" data-del-post="${editing.id}">Eliminar</button>` : ''}
        <button class="btn-secondary" data-close>Cancelar</button>
        <button class="primary-btn" id="p-save">${editing ? 'Guardar' : 'Adicionar'}</button>
      </div>
    `, () => {
      let st = status;
      modalBody.querySelectorAll('#p-status .seg-btn').forEach(b => {
        b.addEventListener('click', () => {
          modalBody.querySelectorAll('#p-status .seg-btn').forEach(x => x.classList.remove('active'));
          b.classList.add('active'); st = b.dataset.status;
        });
      });
      modalBody.querySelector('#p-save').addEventListener('click', () => {
        const title = modalBody.querySelector('#p-title').value.trim();
        const date = modalBody.querySelector('#p-date').value;
        if (!title) { toast('Escreve o título do post.'); return; }
        if (!date) { toast('Escolhe a data.'); return; }
        const categoryId = modalBody.querySelector('#p-cat').value;
        if (editing) {
          Object.assign(editing, { title, date, categoryId, notes: modalBody.querySelector('#p-notes').value.trim(), status: st });
        } else {
          state.posts.push({ id: uid(), title, date, categoryId, notes: modalBody.querySelector('#p-notes').value.trim(), status: st });
        }
        save(); closeModal(); render();
        toast(editing ? 'Post actualizado.' : 'Post adicionado ao calendário.');
      });
    });
  }

  // ---- Modal Ideia
  function openIdeaModal(ideaId) {
    const editing = ideaId ? state.ideas.find(i => i.id === ideaId) : null;
    openModal(editing ? 'Editar ideia' : 'Nova ideia', `
      <div class="field">
        <label>Ideia</label>
        <input type="text" id="i-title" maxlength="140" placeholder="Ex.: Série sobre a história da marca"
          value="${editing ? esc(editing.title) : ''}">
      </div>
      <div class="field">
        <label>Categoria</label>
        <select id="i-cat">${categorySelectOptions(editing ? editing.categoryId : (categoryFilter !== 'all' ? categoryFilter : ''))}</select>
      </div>
      <div class="field">
        <label>Notas</label>
        <textarea id="i-notes" placeholder="Detalhes, referências, ângulos…">${editing ? esc(editing.notes) : ''}</textarea>
      </div>
      <div class="modal-actions">
        ${editing ? `<button class="btn-danger" data-del-idea="${editing.id}">Eliminar</button>` : ''}
        <button class="btn-secondary" data-close>Cancelar</button>
        <button class="primary-btn" id="i-save">${editing ? 'Guardar' : 'Adicionar'}</button>
      </div>
    `, () => {
      modalBody.querySelector('#i-save').addEventListener('click', () => {
        const title = modalBody.querySelector('#i-title').value.trim();
        if (!title) { toast('Escreve a ideia.'); return; }
        const categoryId = modalBody.querySelector('#i-cat').value;
        const notes = modalBody.querySelector('#i-notes').value.trim();
        if (editing) Object.assign(editing, { title, categoryId, notes });
        else state.ideas.push({ id: uid(), title, categoryId, notes, createdAt: Date.now() });
        save(); closeModal(); render();
        toast(editing ? 'Ideia actualizada.' : 'Ideia guardada.');
      });
    });
  }

  // ---- Modal Tarefa
  function openTaskModal(taskId) {
    const editing = taskId ? state.tasks.find(t => t.id === taskId) : null;
    openModal(editing ? 'Editar tarefa' : 'Nova tarefa', `
      <div class="field">
        <label>Tarefa</label>
        <input type="text" id="t-title" maxlength="140" placeholder="Ex.: Preparar fotos para a campanha"
          value="${editing ? esc(editing.title) : ''}">
      </div>
      <div class="field">
        <label>Categoria</label>
        <select id="t-cat">${categorySelectOptions(editing ? editing.categoryId : (categoryFilter !== 'all' ? categoryFilter : ''))}</select>
      </div>
      <div class="field">
        <label>Notas</label>
        <textarea id="t-notes" placeholder="Detalhes…">${editing ? esc(editing.notes) : ''}</textarea>
      </div>
      <div class="modal-actions">
        ${editing ? `<button class="btn-danger" data-del-task="${editing.id}">Eliminar</button>` : ''}
        <button class="btn-secondary" data-close>Cancelar</button>
        <button class="primary-btn" id="t-save">${editing ? 'Guardar' : 'Adicionar'}</button>
      </div>
    `, () => {
      modalBody.querySelector('#t-save').addEventListener('click', () => {
        const title = modalBody.querySelector('#t-title').value.trim();
        if (!title) { toast('Escreve a tarefa.'); return; }
        const categoryId = modalBody.querySelector('#t-cat').value;
        const notes = modalBody.querySelector('#t-notes').value.trim();
        if (editing) Object.assign(editing, { title, categoryId, notes });
        else state.tasks.push({ id: uid(), title, categoryId, notes, done: false, createdAt: Date.now() });
        save(); closeModal(); render();
        toast(editing ? 'Tarefa actualizada.' : 'Tarefa criada.');
      });
    });
  }

  // ============================================================ EVENTOS

  // Navegação
  document.querySelector('.nav').addEventListener('click', e => {
    const btn = e.target.closest('.nav-item');
    if (!btn) return;
    currentView = btn.dataset.view;
    render();
  });

  // Acção principal (topbar)
  document.getElementById('primary-action').addEventListener('click', () => {
    if (currentView === 'calendar') openPostModal(null, null);
    else if (currentView === 'ideas') openIdeaModal(null);
    else openTaskModal(null);
  });

  // Filtro de categoria
  document.getElementById('category-filter').addEventListener('change', e => {
    categoryFilter = e.target.value;
    render();
  });

  // Nova categoria
  document.getElementById('add-category-btn').addEventListener('click', () => openCategoryModal(null));

  // Sidebar: clicar categoria filtra; editar
  document.getElementById('category-list').addEventListener('click', e => {
    const edit = e.target.closest('[data-edit-cat]');
    if (edit) { openCategoryModal(edit.dataset.editCat); return; }
    const li = e.target.closest('[data-cat]');
    if (li) {
      const id = li.dataset.cat;
      categoryFilter = (categoryFilter === id) ? 'all' : id;
      render();
    }
  });

  // Delegação no container das vistas
  document.getElementById('view-container').addEventListener('click', e => {
    // calendário
    const calBtn = e.target.closest('[data-cal]');
    if (calBtn) {
      const dir = calBtn.dataset.cal;
      if (dir === 'today') calRef = new Date();
      else calRef.setMonth(calRef.getMonth() + (dir === 'next' ? 1 : -1));
      calRef = new Date(calRef); render(); return;
    }
    const postEl = e.target.closest('[data-post]');
    if (postEl) { openPostModal(postEl.dataset.post); return; }
    const cell = e.target.closest('[data-day]');
    if (cell) { openPostModal(null, cell.dataset.day); return; }

    // ideias
    const delIdea = e.target.closest('[data-del-idea]');
    if (delIdea) { removeItem('ideas', delIdea.dataset.delIdea, 'Ideia eliminada.'); return; }
    const ideaCard = e.target.closest('[data-idea]');
    if (ideaCard) { openIdeaModal(ideaCard.dataset.idea); return; }

    // tarefas
    const toggle = e.target.closest('[data-toggle-task]');
    if (toggle) {
      const t = state.tasks.find(x => x.id === toggle.dataset.toggleTask);
      if (t) { t.done = !t.done; save(); render(); }
      return;
    }
    const delTask = e.target.closest('[data-del-task]');
    if (delTask) { removeItem('tasks', delTask.dataset.delTask, 'Tarefa eliminada.'); return; }
    const taskMain = e.target.closest('[data-task]');
    if (taskMain) { openTaskModal(taskMain.dataset.task); return; }
  });

  function removeItem(key, id, msg) {
    if (!confirm('Eliminar definitivamente?')) return;
    state[key] = state[key].filter(x => x.id !== id);
    save(); if (!backdrop.hidden) closeModal(); render(); toast(msg);
  }

  // Modal: fechar e acções de eliminar dentro do modal
  document.getElementById('modal-close').addEventListener('click', closeModal);
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) closeModal();
    if (e.target.closest('[data-close]')) closeModal();
    const dp = e.target.closest('[data-del-post]');
    if (dp) removeItem('posts', dp.dataset.delPost, 'Post eliminado.');
    const di = e.target.closest('[data-del-idea]');
    if (di) removeItem('ideas', di.dataset.delIdea, 'Ideia eliminada.');
    const dt = e.target.closest('[data-del-task]');
    if (dt) removeItem('tasks', dt.dataset.delTask, 'Tarefa eliminada.');
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !backdrop.hidden) closeModal();
  });

  // Exportar / Importar
  document.getElementById('export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `castlesbay-escritorio-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Cópia de segurança exportada.');
  });
  document.getElementById('import-btn').addEventListener('click', () =>
    document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.categories || !data.posts) throw new Error('formato');
        if (!confirm('Isto substitui todos os dados actuais. Continuar?')) return;
        state = data;
        state.categories ||= []; state.posts ||= []; state.ideas ||= []; state.tasks ||= [];
        save(); render(); toast('Dados importados.');
      } catch (err) {
        toast('Ficheiro inválido.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // ============================================================ SINCRONIZAÇÃO (Firebase)

  const SYNC = {
    ready: false,
    applyingRemote: false,
    docRef: null,
    unsub: null,
    pushTimer: null,
    configKey: 'castlesbay-firebase-config',
    clientId: (localStorage.getItem('castlesbay-client') ||
      (v => (localStorage.setItem('castlesbay-client', v), v))(uid())),

    getConfig() {
      // config.js (committed) tem prioridade; caso contrário, o que foi colado na app.
      if (typeof window.FIREBASE_CONFIG === 'object' && window.FIREBASE_CONFIG) return window.FIREBASE_CONFIG;
      try { return JSON.parse(localStorage.getItem(this.configKey) || 'null'); }
      catch { return null; }
    },
    saveConfig(cfg) { localStorage.setItem(this.configKey, JSON.stringify(cfg)); },
    clearConfig() { localStorage.removeItem(this.configKey); },

    async init() {
      const cfg = this.getConfig();
      if (!cfg || !cfg.apiKey || !cfg.projectId) { this.setStatus('offline'); return; }
      if (typeof firebase === 'undefined') { this.setStatus('error', 'SDK do Firebase não carregou (sem rede?).'); return; }
      try {
        this.setStatus('syncing', 'A ligar…');
        if (!firebase.apps.length) firebase.initializeApp(cfg);
        await firebase.auth().signInAnonymously();
        const db = firebase.firestore();
        this.docRef = db.collection('escritorio').doc('dados');
        this.subscribe();
      } catch (e) {
        console.error(e);
        this.setStatus('error', friendlyFbError(e));
      }
    },

    subscribe() {
      this.unsub = this.docRef.onSnapshot(snap => {
        if (!snap.exists) {
          // Primeiro arranque: semeia a cloud com o que existe localmente.
          this.ready = true;
          this.push(true);
          this.setStatus('online');
          return;
        }
        const data = snap.data();
        // Ignora o eco da nossa própria escrita.
        if (data.updatedBy === this.clientId) { this.ready = true; this.setStatus('online'); return; }
        try {
          const remote = JSON.parse(data.payload);
          this.applyingRemote = true;
          state = normalizeState(remote);
          persistLocal();
          this.applyingRemote = false;
          this.ready = true;
          render();
          this.setStatus('online');
        } catch (e) { console.warn('payload remoto inválido', e); this.ready = true; this.setStatus('online'); }
      }, err => { console.error(err); this.setStatus('error', friendlyFbError(err)); });
    },

    push(immediate) {
      if (!this.docRef) return;
      clearTimeout(this.pushTimer);
      const doWrite = () => {
        this.setStatus('syncing', 'A guardar…');
        this.docRef.set({
          payload: JSON.stringify(state),
          updatedBy: this.clientId,
          updatedAt: Date.now()
        }).then(() => this.setStatus('online'))
          .catch(e => { console.error(e); this.setStatus('error', friendlyFbError(e)); });
      };
      if (immediate) doWrite(); else this.pushTimer = setTimeout(doWrite, 700);
    },

    async disconnect() {
      if (this.unsub) this.unsub();
      this.unsub = null; this.docRef = null; this.ready = false;
      this.clearConfig();
      try { if (typeof firebase !== 'undefined' && firebase.apps.length) await firebase.app().delete(); } catch {}
      this.setStatus('offline');
    },

    setStatus(kind, detail) {
      this._status = { kind, detail };
      const btn = document.getElementById('sync-btn');
      const label = document.getElementById('sync-label');
      btn.classList.remove('online', 'syncing', 'error');
      const map = {
        offline: 'Só neste dispositivo',
        online: 'Sincronizado ☁',
        syncing: detail || 'A sincronizar…',
        error: 'Erro de sincronização'
      };
      if (kind !== 'offline') btn.classList.add(kind);
      label.textContent = map[kind] || map.offline;
      btn.title = detail || map[kind] || '';
    }
  };

  function friendlyFbError(e) {
    const c = (e && e.code) || '';
    if (c.includes('permission-denied')) return 'Sem permissão. Verifica as regras do Firestore e o login anónimo.';
    if (c.includes('unavailable')) return 'Sem ligação à cloud de momento.';
    if (c.includes('auth')) return 'Ativa o método "Anónimo" em Authentication no Firebase.';
    return (e && e.message) || 'Erro desconhecido.';
  }

  // ---- Modal de sincronização
  function openSyncModal() {
    const usingFile = typeof window.FIREBASE_CONFIG === 'object' && !!window.FIREBASE_CONFIG;
    const connected = SYNC.ready || (SYNC._status && SYNC._status.kind === 'online');
    const st = SYNC._status || { kind: 'offline' };
    const stateText = {
      offline: 'Não ligado — os dados ficam só neste dispositivo.',
      online: 'Ligado. Os dados sincronizam entre os teus dispositivos.',
      syncing: 'A sincronizar…',
      error: 'Erro: ' + (st.detail || '')
    }[st.kind];

    openModal('Sincronização entre dispositivos', `
      <div class="sync-state-line">
        <span class="sync-dot" style="background:${st.kind === 'online' ? '#22c55e' : st.kind === 'error' ? 'var(--danger)' : 'var(--text-faint)'}"></span>
        ${esc(stateText)}
      </div>
      ${usingFile ? `<p style="font-size:13px;color:var(--text-soft);margin:10px 0">Configuração definida no ficheiro <code>config.js</code>. Funciona automaticamente em todos os dispositivos.</p>` : `
      <div class="sync-help">
        Cola aqui a configuração do teu projeto Firebase (o objeto <code>firebaseConfig</code> que o Firebase te dá).
        <ol>
          <li>Firebase Console → cria projeto</li>
          <li>Adiciona uma app <b>Web</b> e copia o <code>firebaseConfig</code></li>
          <li>Ativa <b>Firestore Database</b> e <b>Authentication → Anónimo</b></li>
        </ol>
      </div>
      <div class="field">
        <label>Configuração Firebase</label>
        <textarea id="fb-config" placeholder='{ "apiKey": "…", "authDomain": "…", "projectId": "…", ... }' style="min-height:120px;font-family:monospace;font-size:12.5px">${esc(localStorage.getItem(SYNC.configKey) || '')}</textarea>
      </div>`}
      <div class="modal-actions">
        ${(connected || localStorage.getItem(SYNC.configKey)) ? `<button class="btn-danger" id="fb-disconnect">Desligar</button>` : ''}
        <button class="btn-secondary" data-close>Fechar</button>
        ${usingFile ? '' : `<button class="primary-btn" id="fb-connect">Ligar</button>`}
      </div>
    `, () => {
      const connectBtn = modalBody.querySelector('#fb-connect');
      if (connectBtn) connectBtn.addEventListener('click', () => {
        const raw = modalBody.querySelector('#fb-config').value.trim();
        const cfg = parseFirebaseConfig(raw);
        if (!cfg) { toast('Configuração inválida. Cola o objeto firebaseConfig completo.'); return; }
        SYNC.saveConfig(cfg);
        closeModal();
        toast('A ligar à cloud…');
        SYNC.init();
      });
      const disBtn = modalBody.querySelector('#fb-disconnect');
      if (disBtn) disBtn.addEventListener('click', () => {
        if (!confirm('Desligar a sincronização neste dispositivo? Os dados na cloud não são apagados.')) return;
        SYNC.disconnect();
        closeModal();
        toast('Sincronização desligada.');
      });
    });
  }

  // Aceita JSON ou o objeto JS que o Firebase mostra (chaves sem aspas).
  function parseFirebaseConfig(raw) {
    if (!raw) return null;
    let text = raw;
    const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    if (s !== -1 && e !== -1) text = raw.slice(s, e + 1);
    // tenta JSON
    try { const o = JSON.parse(text); if (o && o.apiKey) return o; } catch {}
    // tenta objeto JS
    try {
      const o = (new Function('return (' + text + ')'))();
      if (o && o.apiKey && o.projectId) return o;
    } catch {}
    return null;
  }

  document.getElementById('sync-btn').addEventListener('click', openSyncModal);

  // ============================================================ ARRANQUE
  render();
  SYNC.init();
})();
