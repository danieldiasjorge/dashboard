/* =========================================================================
   Castles Bay · Escritório de Comunicação
   Calendário (posts com descrição + imagens), Ideias e Tarefas,
   com categorias partilhadas (nome + cor). Sincroniza entre dispositivos.
   ========================================================================= */

(() => {
  'use strict';

  const STORAGE_KEY = 'castlesbay-office-v1';
  const IMAGES_KEY = 'castlesbay-images-v1';

  const PALETTE = [
    '#ff4d2d', '#f0b429', '#facc15', '#a3e635', '#34d399',
    '#22d3ee', '#38bdf8', '#6366f1', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e', '#fb7185', '#f97316', '#e879f9',
    '#2dd4bf', '#94a3b8', '#e2e8f0'
  ];

  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const PRIO_LABEL = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
  const STATUS_LABEL = { todo: 'A fazer', doing: 'Em curso', done: 'Concluído' };

  const defaultState = () => ({
    categories: [
      { id: uid(), name: 'Instagram', color: '#d946ef' },
      { id: uid(), name: 'Campanha', color: '#ff4d2d' },
      { id: uid(), name: 'Newsletter', color: '#38bdf8' }
    ],
    posts: [], ideas: [], tasks: []
  });

  let state = loadState();
  let currentView = localStorage.getItem('castlesbay-view') || 'calendar';
  let categoryFilter = 'all';
  let searchQuery = '';
  let calRef = new Date();
  let animateNext = true;   // anima a próxima render (ao navegar)
  let calDir = null;        // 'next' | 'prev' — direção do deslize do mês
  let dragPostId = null;    // post a ser arrastado no calendário

  // ------------------------------------------------------------- utils
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function normalizeState(obj) {
    const s = (obj && typeof obj === 'object') ? obj : {};
    s.categories = Array.isArray(s.categories) ? s.categories : [];
    s.posts = Array.isArray(s.posts) ? s.posts : [];
    s.ideas = Array.isArray(s.ideas) ? s.ideas : [];
    s.tasks = Array.isArray(s.tasks) ? s.tasks : [];
    s.posts.forEach(p => { if (!Array.isArray(p.images)) p.images = []; });
    s.tasks.forEach(t => {
      if (!t.status) t.status = t.done ? 'done' : 'todo';
      if (t.priority === undefined) t.priority = '';
      if (t.due === undefined) t.due = '';
    });
    return s;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : defaultState();
    } catch (e) { console.warn('Estado inválido, a recomeçar.', e); return defaultState(); }
  }

  function persistLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Armazenamento local cheio — exporta uma cópia.'); }
  }
  function save() {
    persistLocal();
    if (SYNC.ready && !SYNC.applyingRemote) SYNC.push();
  }

  function categoryById(id) { return state.categories.find(c => c.id === id) || null; }

  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, m => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function todayISO() { return toISO(new Date()); }
  function toISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function formatDatePT(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${MESES[m - 1].slice(0, 3)} ${y}`;
  }
  function formatDueShort(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const base = `${d} ${MESES[m - 1].slice(0, 3)}`;
    return y === new Date().getFullYear() ? base : `${base} ${y}`;
  }
  function dueBadge(due, status) {
    if (!due) return '';
    let cls = 'due', label = formatDueShort(due);
    if (status !== 'done') {
      const t = todayISO();
      if (due < t) { cls = 'due overdue'; label = 'Atrasada'; }
      else if (due === t) { cls = 'due today'; label = 'Hoje'; }
    }
    return `<span class="${cls}">${label}</span>`;
  }

  function toast(msg, opts = {}) {
    const el = document.getElementById('toast');
    if (toast._expire) { toast._expire(); toast._expire = null; }
    el.innerHTML = '';
    const span = document.createElement('span'); span.textContent = msg; el.appendChild(span);
    if (opts.actionLabel && opts.onAction) {
      const b = document.createElement('button'); b.className = 'toast-action'; b.textContent = opts.actionLabel;
      b.addEventListener('click', () => { el.hidden = true; clearTimeout(toast._t); toast._expire = null; opts.onAction(); });
      el.appendChild(b);
    }
    el.hidden = false;
    toast._expire = opts.onExpire || null;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; if (toast._expire) { toast._expire(); toast._expire = null; } }, opts.duration || 2600);
  }

  function hexA(hex, a) {
    const h = String(hex || '#888').replace('#', '');
    const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const n = parseInt(full, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  const passesFilter = item => categoryFilter === 'all' || item.categoryId === categoryFilter;
  function matchesSearch(item) {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (item.title || '').toLowerCase().includes(q) || (item.notes || '').toLowerCase().includes(q);
  }
  const visible = item => passesFilter(item) && matchesSearch(item);

  // ------------------------------------------------------------- IMAGES
  const IMAGES = {
    store: (() => { try { return JSON.parse(localStorage.getItem(IMAGES_KEY) || '{}'); } catch { return {}; } })(),
    has(id) { return Object.prototype.hasOwnProperty.call(this.store, id); },
    get(id) { return this.store[id]; },
    put(id, dataURL, { syncOut = true } = {}) {
      this.store[id] = dataURL; this.persist();
      if (syncOut && SYNC.ready) SYNC.pushImage(id, dataURL);
    },
    remove(id, { syncOut = true } = {}) {
      delete this.store[id]; this.persist();
      if (syncOut && SYNC.ready) SYNC.deleteImage(id);
    },
    persist() {
      try { localStorage.setItem(IMAGES_KEY, JSON.stringify(this.store)); }
      catch (e) { toast('Sem espaço para imagens neste dispositivo — exporta uma cópia.'); }
    },
    // devolve dataURL local ou vai buscar à cloud
    async ensure(id) {
      if (this.has(id)) return this.store[id];
      if (SYNC.ready) {
        const data = await SYNC.fetchImage(id);
        if (data) { this.store[id] = data; this.persist(); return data; }
      }
      return null;
    }
  };

  function readFile(file) {
    return new Promise((res, rej) => {
      const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
    });
  }
  function loadImageEl(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  async function downscale(file, max = 1400, quality = 0.82) {
    if (!/^image\//.test(file.type)) return null;
    const dataURL = await readFile(file);
    const img = await loadImageEl(dataURL);
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    if (scale === 1 && dataURL.length < 160000) return dataURL;
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', quality);
  }

  // ============================================================ RENDER
  const EYEBROWS = { calendar: 'Planeamento', ideas: 'Captura', tasks: 'Execução' };
  const TITLES = { calendar: 'Calendário', ideas: 'Ideias', tasks: 'Tarefas' };
  const ACTIONS = { calendar: 'Novo post', ideas: 'Nova ideia', tasks: 'Nova tarefa' };

  function render() {
    const animate = animateNext;
    closeMonthPicker();
    renderCategories();
    renderCategoryFilter();
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === currentView));
    document.getElementById('view-eyebrow').textContent = EYEBROWS[currentView];
    document.getElementById('view-title').textContent = TITLES[currentView];
    document.getElementById('primary-action').textContent = ACTIONS[currentView];

    const c = document.getElementById('view-container');
    if (currentView === 'calendar') renderCalendar(c, animate);
    else if (currentView === 'ideas') renderIdeas(c, animate);
    else renderTasks(c, animate);

    // deslize de entrada da vista (exceto quando o calendário faz o seu próprio deslize de mês)
    if (animate && !(currentView === 'calendar' && calDir)) {
      c.classList.remove('view-enter'); void c.offsetWidth; c.classList.add('view-enter');
    }
    animateNext = false;
  }

  function countForCategory(id) {
    return state.posts.filter(p => p.categoryId === id).length +
      state.ideas.filter(i => i.categoryId === id).length +
      state.tasks.filter(t => t.categoryId === id).length;
  }

  function renderCategories() {
    const list = document.getElementById('category-list');
    if (!state.categories.length) {
      list.innerHTML = `<li class="cat-empty">Sem categorias ainda. Cria a primeira no ＋ acima para etiquetar posts, ideias e tarefas.</li>`;
      return;
    }
    list.innerHTML = state.categories.map(cat => `
      <li class="cat-row ${categoryFilter === cat.id ? 'active' : ''}" data-cat="${cat.id}" tabindex="0" title="Filtrar por ${esc(cat.name)}">
        <span class="cat-dot" style="background:${esc(cat.color)}"></span>
        <span class="cat-name">${esc(cat.name)}</span>
        <span class="cat-count">${countForCategory(cat.id)}</span>
        <button class="cat-edit" data-edit-cat="${cat.id}" title="Editar categoria" aria-label="Editar ${esc(cat.name)}">✎</button>
      </li>`).join('');
  }

  function renderCategoryFilter() {
    const sel = document.getElementById('category-filter');
    const prev = categoryFilter;
    sel.innerHTML = `<option value="all">Todas</option>` +
      state.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    sel.value = (prev === 'all' || state.categories.some(c => c.id === prev)) ? prev : 'all';
    categoryFilter = sel.value;
  }

  function catChip(categoryId) {
    const cat = categoryById(categoryId);
    if (!cat) return '';
    return `<span class="chip" style="background:${hexA(cat.color, .16)};color:${cat.color}">
      <span class="cat-dot" style="background:${esc(cat.color)}"></span>${esc(cat.name)}</span>`;
  }

  // etiqueta do post: 1.ª linha da legenda › título antigo › categoria › genérico
  function postLabel(p) {
    const line = (p.notes || '').split('\n')[0].trim();
    if (line) return line;
    if (p.title) return p.title;
    const cat = categoryById(p.categoryId);
    if (cat) return cat.name;
    return (p.images && p.images.length) ? 'Imagem' : 'Post';
  }

  // ---- Calendário
  function renderCalendar(container) {
    const year = calRef.getFullYear(), month = calRef.getMonth();
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - startOffset);

    const monthPosts = state.posts.filter(p => {
      const [py, pm] = p.date.split('-').map(Number);
      return py === year && pm === month + 1 && visible(p);
    });
    const publishedCount = monthPosts.filter(p => p.status === 'publicado').length;

    const byDate = {};
    state.posts.filter(visible).forEach(p => { (byDate[p.date] ||= []).push(p); });

    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
      const iso = toISO(d);
      const outside = d.getMonth() !== month;
      const isToday = iso === todayISO();
      const dayPosts = (byDate[iso] || []).sort((a, b) => postLabel(a).localeCompare(postLabel(b)));

      const pills = dayPosts.map(p => {
        const cat = categoryById(p.categoryId);
        const color = cat ? cat.color : '#8a8377';
        const media = (p.images && p.images.length) ? `<span class="cal-post-media">⧉${p.images.length}</span>` : '';
        const label = postLabel(p);
        return `<div class="cal-post ${p.status === 'publicado' ? 'published' : ''}" draggable="true"
          style="background:${hexA(color, .15)};color:${color};border-left-color:${color}"
          data-post="${p.id}" title="${esc(label)} — arrasta para reagendar">
          <span class="cal-post-title">${esc(label)}</span>${media}</div>`;
      }).join('');

      cells += `<div class="cal-cell ${outside ? 'outside' : ''} ${isToday ? 'today' : ''}" data-day="${iso}">
        <span class="cal-daynum">${d.getDate()}</span>
        <span class="cal-add">＋</span>
        <div class="cal-posts">${pills}</div></div>`;
    }

    const summary = monthPosts.length
      ? `<b>${monthPosts.length}</b> ${monthPosts.length === 1 ? 'post' : 'posts'}
         <span class="dot-sep">·</span> <b>${publishedCount}</b> ${publishedCount === 1 ? 'publicado' : 'publicados'}
         <span class="dot-sep">·</span> <b>${monthPosts.length - publishedCount}</b> por publicar`
      : (searchQuery || categoryFilter !== 'all' ? 'Nada corresponde ao filtro' : 'Sem posts este mês — clica num dia para começar');

    const dir = calDir; calDir = null;
    container.innerHTML = `
      <div class="cal-toolbar">
        <div>
          <div class="cal-month" data-monthpicker tabindex="0" role="button" aria-label="Escolher mês e ano" title="Escolher mês e ano">${MESES[month]} <span class="cal-year">${year}</span> <span class="cal-caret" aria-hidden="true">▾</span></div>
          <div class="cal-summary">${summary}</div>
        </div>
        <div class="cal-nav">
          <button data-cal="today" class="cal-today">Hoje</button>
          <button data-cal="prev" title="Mês anterior (←)" aria-label="Mês anterior">‹</button>
          <button data-cal="next" title="Mês seguinte (→)" aria-label="Mês seguinte">›</button>
        </div>
      </div>
      <div class="calendar ${dir ? 'slide-' + dir : ''}">
        <div class="cal-weekdays">${DIAS_SEMANA.map(d => `<div>${d}</div>`).join('')}</div>
        <div class="cal-grid">${cells}</div>
      </div>`;
  }

  // ---- Ideias
  function renderIdeas(container, animate) {
    const items = state.ideas.filter(visible).sort((a, b) => b.createdAt - a.createdAt);
    if (!items.length) {
      container.innerHTML = searchQuery
        ? emptyState('✦', 'Sem resultados', 'Nenhuma ideia corresponde à tua pesquisa.')
        : emptyState('✦', 'Sem ideias em carteira',
          'Despeja aqui ideias de posts, campanhas e ângulos de comunicação antes que se percam.', 'Nova ideia');
      return;
    }
    container.innerHTML = `<div class="board">` + items.map((it, i) => {
      const cat = categoryById(it.categoryId);
      const accent = cat ? cat.color : 'var(--line)';
      const anim = animate ? ` rise" style="animation-delay:${Math.min(i, 14) * 26}ms` : '';
      return `<div class="card${anim}" data-idea="${it.id}">
        <div class="card-accent" style="background:${esc(accent)}"></div>
        <button class="icon-btn card-del" data-del-idea="${it.id}" title="Eliminar">🗑</button>
        <div class="card-inner">
          <div class="card-title">${esc(it.title)}</div>
          ${it.notes ? `<div class="card-notes">${esc(it.notes)}</div>` : ''}
          ${cat ? `<div class="card-foot">${catChip(it.categoryId)}</div>` : ''}
        </div></div>`;
    }).join('') + `</div>`;
  }

  // ---- Tarefas (quadro Kanban: A fazer / Em curso / Concluído)
  function renderTasks(container, animate) {
    const items = state.tasks.filter(visible);
    if (!items.length) {
      container.innerHTML = searchQuery
        ? emptyState('▸', 'Sem resultados', 'Nenhuma tarefa corresponde à tua pesquisa.')
        : emptyState('▸', 'Nada por fazer',
          'Cria tarefas e arrasta-as entre colunas conforme avançam — do briefing à publicação.', 'Nova tarefa');
      return;
    }
    const rank = { alta: 0, media: 1, baixa: 2, '': 3 };
    const inCol = key => items
      .filter(t => (t.status || 'todo') === key)
      .sort((a, b) => {
        const pr = rank[a.priority || ''] - rank[b.priority || ''];
        if (pr) return pr;
        const ad = a.due || '9999-99', bd = b.due || '9999-99';
        if (ad !== bd) return ad < bd ? -1 : 1;
        return b.createdAt - a.createdAt;
      });

    let i = 0;
    const card = t => {
      const cat = categoryById(t.categoryId);
      const pr = t.priority || 'none';
      const done = (t.status || 'todo') === 'done';
      const anim = animate ? ` rise" style="animation-delay:${Math.min(i++, 20) * 20}ms` : '';
      const meta = [
        t.priority ? `<span class="pr-flag pr-${t.priority}">${PRIO_LABEL[t.priority]}</span>` : '',
        dueBadge(t.due, t.status || 'todo'),
        cat ? catChip(t.categoryId) : ''
      ].filter(Boolean).join('');
      return `<div class="tcard pr-${pr}${anim}" draggable="true" data-task="${t.id}">
        <button class="tcard-check ${done ? 'checked' : ''}" data-complete="${t.id}" title="${done ? 'Reabrir' : 'Concluir'}" aria-label="${done ? 'Reabrir' : 'Concluir'}"></button>
        <div class="tcard-body">
          <div class="tcard-text">${esc(t.title)}</div>
          ${t.notes ? `<div class="tcard-notes">${esc(t.notes)}</div>` : ''}
          ${meta ? `<div class="tcard-meta">${meta}</div>` : ''}
        </div>
        <button class="icon-btn tcard-del" data-del-task="${t.id}" title="Eliminar">🗑</button>
      </div>`;
    };

    container.innerHTML = `<div class="kanban">` + ['todo', 'doing', 'done'].map(key => {
      const list = inCol(key);
      return `<div class="kanban-col" data-col="${key}">
        <div class="kanban-head"><span>${STATUS_LABEL[key]}</span><span class="kanban-count">${list.length}</span></div>
        <div class="kanban-list" data-status="${key}">
          ${list.map(card).join('') || `<div class="kanban-empty">Arrasta para aqui</div>`}
        </div>
      </div>`;
    }).join('') + `</div>`;
  }

  function emptyState(glyph, title, sub, ctaLabel) {
    return `<div class="empty"><div class="empty-glyph">${glyph}</div>
      <h3>${esc(title)}</h3><p>${esc(sub)}</p>
      ${ctaLabel ? `<button class="primary-btn empty-cta" data-empty-cta>${esc(ctaLabel)}</button>` : ''}</div>`;
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
    const f = modalBody.querySelector('input, textarea, select'); if (f) f.focus();
  }
  function closeModal() { backdrop.hidden = true; modalBody.innerHTML = ''; }

  // Confirmação própria (o confirm() do browser é bloqueado em iframes sandboxed)
  function confirmDialog({ title = 'Confirmar', message = '', confirmLabel = 'Confirmar', danger = true } = {}) {
    return new Promise(resolve => {
      const bd = document.createElement('div');
      bd.className = 'confirm-backdrop';
      bd.innerHTML = `<div class="confirm" role="alertdialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        ${message ? `<p>${esc(message)}</p>` : ''}
        <div class="confirm-actions">
          <button class="btn-secondary" data-cancel>Cancelar</button>
          <button class="primary-btn ${danger ? 'danger' : ''}" data-ok>${esc(confirmLabel)}</button>
        </div></div>`;
      document.body.appendChild(bd);
      const done = val => { bd.remove(); document.removeEventListener('keydown', onKey, true); resolve(val); };
      const onKey = e => {
        if (e.key === 'Escape') { e.stopPropagation(); done(false); }
        else if (e.key === 'Enter') { e.stopPropagation(); done(true); }
      };
      bd.addEventListener('click', e => {
        if (e.target === bd || e.target.closest('[data-cancel]')) done(false);
        else if (e.target.closest('[data-ok]')) done(true);
      });
      document.addEventListener('keydown', onKey, true);
      bd.querySelector('[data-ok]').focus();
    });
  }

  function categorySelectOptions(selectedId) {
    if (!state.categories.length) return `<option value="">(sem categorias)</option>`;
    return `<option value="">— Sem categoria —</option>` +
      state.categories.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  }

  // ---- Categoria
  function openCategoryModal(catId) {
    const editing = catId ? categoryById(catId) : null;
    let color = editing ? editing.color : PALETTE[0];
    openModal(editing ? 'Editar categoria' : 'Nova categoria', `
      <div class="field">
        <label>Nome</label>
        <input type="text" id="cat-name" maxlength="40" placeholder="Ex.: Instagram, Marca X, Loja…" value="${editing ? esc(editing.name) : ''}">
      </div>
      <div class="field">
        <label>Cor</label>
        <div class="color-grid" id="color-grid">
          ${PALETTE.map(c => `<span class="color-swatch ${c === color ? 'selected' : ''}" data-color="${c}" style="background:${c}"></span>`).join('')}
        </div>
      </div>
      <div class="modal-actions">
        ${editing ? `<button class="btn-danger" id="cat-delete">Eliminar</button>` : ''}
        <button class="btn-secondary" data-close>Cancelar</button>
        <button class="primary-btn" id="cat-save">${editing ? 'Guardar' : 'Criar'}</button>
      </div>`, () => {
      modalBody.querySelectorAll('.color-swatch').forEach(sw => sw.addEventListener('click', () => {
        modalBody.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected'); color = sw.dataset.color;
      }));
      modalBody.querySelector('#cat-save').addEventListener('click', () => {
        const name = modalBody.querySelector('#cat-name').value.trim();
        if (!name) { toast('Dá um nome à categoria.'); modalBody.querySelector('#cat-name').focus(); return; }
        if (editing) { editing.name = name; editing.color = color; }
        else state.categories.push({ id: uid(), name, color });
        save(); closeModal(); render();
        toast(editing ? 'Categoria actualizada.' : 'Categoria criada.');
      });
      const del = modalBody.querySelector('#cat-delete');
      if (del) del.addEventListener('click', () => deleteCategory(editing.id));
    });
  }

  async function deleteCategory(id) {
    const cat = categoryById(id);
    const used = countForCategory(id);
    const ok = await confirmDialog({
      title: 'Eliminar categoria',
      message: used
        ? `“${cat ? cat.name : ''}” está em ${used} item(ns). Ao eliminar, esses itens ficam sem categoria.`
        : `Eliminar a categoria “${cat ? cat.name : ''}”?`,
      confirmLabel: 'Eliminar'
    });
    if (!ok) return;
    state.categories = state.categories.filter(c => c.id !== id);
    ['posts', 'ideas', 'tasks'].forEach(k => state[k].forEach(it => { if (it.categoryId === id) it.categoryId = ''; }));
    if (categoryFilter === id) categoryFilter = 'all';
    save(); closeModal(); render(); toast('Categoria eliminada.');
  }

  // ---- Post (com descrição + imagens)
  function openPostModal(postId, presetDate) {
    const editing = postId ? state.posts.find(p => p.id === postId) : null;
    let status = editing ? editing.status : 'planeado';
    // imagens em edição: [{id, dataURL}]
    let pending = [];
    const originalIds = editing ? [...editing.images] : [];

    openModal(editing ? 'Editar post' : 'Novo post', `
      <div class="field">
        <label>Descrição / legenda</label>
        <textarea id="p-notes" autofocus placeholder="Escreve aqui a legenda, o guião, referências, hashtags…">${editing ? esc(editing.notes || editing.title || '') : ''}</textarea>
      </div>
      <div class="field">
        <label>Imagens</label>
        <div class="media-grid" id="p-media"></div>
        <input type="file" id="p-files" accept="image/*" multiple hidden>
      </div>
      <div class="field" style="display:flex;gap:12px">
        <div style="flex:1">
          <label>Data</label>
          <input type="date" id="p-date" value="${editing ? editing.date : (presetDate || todayISO())}">
        </div>
        <div style="flex:1">
          <label>Categoria</label>
          <select id="p-cat">${categorySelectOptions(editing ? editing.categoryId : (categoryFilter !== 'all' ? categoryFilter : ''))}</select>
        </div>
      </div>
      <div class="field">
        <label>Estado</label>
        <div class="seg" id="p-status">
          <button type="button" class="seg-btn ${status === 'planeado' ? 'active' : ''}" data-status="planeado">Planeado</button>
          <button type="button" class="seg-btn ${status === 'publicado' ? 'active' : ''}" data-status="publicado">Publicado</button>
        </div>
      </div>
      <div class="modal-actions">
        ${editing ? `<button class="btn-danger" data-del-post="${editing.id}">Eliminar</button>` : ''}
        <button class="btn-secondary" data-close>Cancelar</button>
        <button class="primary-btn" id="p-save">${editing ? 'Guardar' : 'Adicionar'}</button>
      </div>`, () => {
      const mediaEl = modalBody.querySelector('#p-media');
      const filesEl = modalBody.querySelector('#p-files');

      const renderMedia = () => {
        mediaEl.innerHTML = pending.map((im, idx) => `
          <div class="media-thumb" data-view-img="${idx}">
            ${im.dataURL ? `<img src="${im.dataURL}" alt="">` : `<div class="media-thumb-loading">…</div>`}
            <button class="media-remove" data-rm-img="${idx}" title="Remover" aria-label="Remover imagem">✕</button>
          </div>`).join('') +
          `<div class="media-add" id="media-add" title="Adicionar imagens">＋</div>`;
        modalBody.querySelector('#media-add').addEventListener('click', () => filesEl.click());
        mediaEl.querySelectorAll('[data-rm-img]').forEach(b => b.addEventListener('click', e => {
          e.stopPropagation();
          pending.splice(Number(b.dataset.rmImg), 1); renderMedia();
        }));
        mediaEl.querySelectorAll('[data-view-img]').forEach(t => t.addEventListener('click', () => {
          const im = pending[Number(t.dataset.viewImg)]; if (im && im.dataURL) openLightbox(im.dataURL);
        }));
      };

      // carrega imagens existentes (local ou cloud)
      pending = originalIds.map(id => ({ id, dataURL: IMAGES.get(id) || null }));
      renderMedia();
      originalIds.forEach(async id => {
        if (!IMAGES.has(id)) {
          const data = await IMAGES.ensure(id);
          const item = pending.find(p => p.id === id);
          if (item) { item.dataURL = data; renderMedia(); }
        }
      });

      filesEl.addEventListener('change', async e => {
        const files = [...e.target.files]; e.target.value = '';
        for (const file of files) {
          try {
            const dataURL = await downscale(file);
            if (dataURL) { pending.push({ id: uid(), dataURL }); renderMedia(); }
          } catch (err) { console.warn(err); toast('Não consegui processar uma imagem.'); }
        }
      });

      modalBody.querySelectorAll('#p-status .seg-btn').forEach(b => b.addEventListener('click', () => {
        modalBody.querySelectorAll('#p-status .seg-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active'); status = b.dataset.status;
      }));

      modalBody.querySelector('#p-save').addEventListener('click', () => {
        const date = modalBody.querySelector('#p-date').value;
        const categoryId = modalBody.querySelector('#p-cat').value;
        const notes = modalBody.querySelector('#p-notes').value.trim();
        if (!date) { toast('Escolhe a data.'); return; }
        if (!notes && !pending.length) { toast('Escreve a legenda ou adiciona uma imagem.'); return; }

        // guarda imagens novas; remove as retiradas
        const finalIds = [];
        pending.forEach(im => {
          if (im.dataURL && !IMAGES.has(im.id)) IMAGES.put(im.id, im.dataURL);
          finalIds.push(im.id);
        });
        originalIds.forEach(id => { if (!finalIds.includes(id)) IMAGES.remove(id); });

        if (editing) { Object.assign(editing, { date, categoryId, notes, status, images: finalIds }); delete editing.title; }
        else state.posts.push({ id: uid(), date, categoryId, notes, status, images: finalIds });
        save(); closeModal(); render();
        toast(editing ? 'Post actualizado.' : 'Post adicionado ao calendário.');
      });
    });
  }

  // ---- Ideia
  function openIdeaModal(ideaId) {
    const editing = ideaId ? state.ideas.find(i => i.id === ideaId) : null;
    openModal(editing ? 'Editar ideia' : 'Nova ideia', `
      <div class="field"><label>Ideia</label>
        <input type="text" id="i-title" maxlength="140" placeholder="Ex.: Série sobre a história da marca" value="${editing ? esc(editing.title) : ''}"></div>
      <div class="field"><label>Categoria</label>
        <select id="i-cat">${categorySelectOptions(editing ? editing.categoryId : (categoryFilter !== 'all' ? categoryFilter : ''))}</select></div>
      <div class="field"><label>Notas</label>
        <textarea id="i-notes" placeholder="Detalhes, referências, ângulos…">${editing ? esc(editing.notes || '') : ''}</textarea></div>
      <div class="modal-actions">
        ${editing ? `<button class="btn-danger" data-del-idea="${editing.id}">Eliminar</button>` : ''}
        <button class="btn-secondary" data-close>Cancelar</button>
        <button class="primary-btn" id="i-save">${editing ? 'Guardar' : 'Adicionar'}</button>
      </div>`, () => {
      modalBody.querySelector('#i-save').addEventListener('click', () => {
        const title = modalBody.querySelector('#i-title').value.trim();
        if (!title) { toast('Escreve a ideia.'); return; }
        const categoryId = modalBody.querySelector('#i-cat').value;
        const notes = modalBody.querySelector('#i-notes').value.trim();
        if (editing) Object.assign(editing, { title, categoryId, notes });
        else state.ideas.push({ id: uid(), title, categoryId, notes, createdAt: Date.now() });
        save(); closeModal(); render(); toast(editing ? 'Ideia actualizada.' : 'Ideia guardada.');
      });
    });
  }

  // ---- Tarefa
  function openTaskModal(taskId) {
    const editing = taskId ? state.tasks.find(t => t.id === taskId) : null;
    let status = editing ? (editing.status || 'todo') : 'todo';
    let prio = editing ? (editing.priority || '') : '';
    openModal(editing ? 'Editar tarefa' : 'Nova tarefa', `
      <div class="field"><label>Tarefa</label>
        <input type="text" id="t-title" maxlength="140" placeholder="Ex.: Preparar fotos para a campanha" value="${editing ? esc(editing.title) : ''}"></div>
      <div class="field" style="display:flex;gap:12px">
        <div style="flex:1"><label>Prioridade</label>
          <div class="seg" id="t-prio">
            ${['alta', 'media', 'baixa'].map(p => `<button type="button" class="seg-btn ${prio === p ? 'active' : ''}" data-prio="${p}">${PRIO_LABEL[p]}</button>`).join('')}
          </div>
        </div>
        <div style="flex:0 0 42%"><label>Prazo</label>
          <input type="date" id="t-due" value="${editing ? (editing.due || '') : ''}"></div>
      </div>
      <div class="field"><label>Estado</label>
        <div class="seg" id="t-status">
          ${['todo', 'doing', 'done'].map(k => `<button type="button" class="seg-btn ${status === k ? 'active' : ''}" data-st="${k}">${STATUS_LABEL[k]}</button>`).join('')}
        </div>
      </div>
      <div class="field"><label>Categoria</label>
        <select id="t-cat">${categorySelectOptions(editing ? editing.categoryId : (categoryFilter !== 'all' ? categoryFilter : ''))}</select></div>
      <div class="field"><label>Notas</label>
        <textarea id="t-notes" placeholder="Detalhes…">${editing ? esc(editing.notes || '') : ''}</textarea></div>
      <div class="modal-actions">
        ${editing ? `<button class="btn-danger" data-del-task="${editing.id}">Eliminar</button>` : ''}
        <button class="btn-secondary" data-close>Cancelar</button>
        <button class="primary-btn" id="t-save">${editing ? 'Guardar' : 'Adicionar'}</button>
      </div>`, () => {
      // prioridade: clicar alterna (clicar na ativa remove)
      modalBody.querySelectorAll('#t-prio .seg-btn').forEach(b => b.addEventListener('click', () => {
        const was = b.classList.contains('active');
        modalBody.querySelectorAll('#t-prio .seg-btn').forEach(x => x.classList.remove('active'));
        if (!was) { b.classList.add('active'); prio = b.dataset.prio; } else prio = '';
      }));
      modalBody.querySelectorAll('#t-status .seg-btn').forEach(b => b.addEventListener('click', () => {
        modalBody.querySelectorAll('#t-status .seg-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active'); status = b.dataset.st;
      }));
      modalBody.querySelector('#t-save').addEventListener('click', () => {
        const title = modalBody.querySelector('#t-title').value.trim();
        if (!title) { toast('Escreve a tarefa.'); return; }
        const categoryId = modalBody.querySelector('#t-cat').value;
        const notes = modalBody.querySelector('#t-notes').value.trim();
        const due = modalBody.querySelector('#t-due').value;
        const fields = { title, categoryId, notes, priority: prio, due, status, done: status === 'done' };
        if (editing) Object.assign(editing, fields);
        else state.tasks.push({ id: uid(), ...fields, createdAt: Date.now() });
        save(); closeModal(); animateNext = false; render(); toast(editing ? 'Tarefa actualizada.' : 'Tarefa criada.');
      });
    });
  }

  // ---- Lightbox
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  function openLightbox(src) { lightboxImg.src = src; lightbox.hidden = false; }
  lightbox.addEventListener('click', () => { lightbox.hidden = true; lightboxImg.src = ''; });

  // ============================================================ EVENTOS
  function switchView(v) {
    if (v === currentView) return;
    currentView = v; localStorage.setItem('castlesbay-view', v);
    calDir = null; animateNext = true; render();
    document.getElementById('view-container').scrollTop = 0;
  }
  function navMonth(dir) {
    calDir = dir; calRef.setMonth(calRef.getMonth() + (dir === 'next' ? 1 : -1));
    calRef = new Date(calRef); animateNext = true; render();
  }
  function goToday() {
    const now = new Date();
    calDir = (now < calRef) ? 'prev' : 'next';
    calRef = now; animateNext = true; render();
  }
  function primaryAction() {
    if (currentView === 'calendar') openPostModal(null, null);
    else if (currentView === 'ideas') openIdeaModal(null);
    else openTaskModal(null);
  }

  // ---- Seletor rápido de mês / ano
  function closeMonthPicker() {
    const p = document.getElementById('month-picker');
    if (p) { if (p._cleanup) p._cleanup(); p.remove(); }
  }
  function openMonthPicker(anchor) {
    closeMonthPicker();
    const pop = document.createElement('div');
    pop.className = 'month-picker'; pop.id = 'month-picker';
    document.body.appendChild(pop);
    let mode = 'month';
    let viewYear = calRef.getFullYear();
    let decadeStart = viewYear - (viewYear % 12);

    function draw() {
      if (mode === 'month') {
        pop.innerHTML = `
          <div class="mp-head">
            <button class="mp-nav" data-y="-1" aria-label="Ano anterior">‹</button>
            <button class="mp-title" data-to-year>${viewYear}</button>
            <button class="mp-nav" data-y="1" aria-label="Ano seguinte">›</button>
          </div>
          <div class="mp-grid mp-months">
            ${MESES.map((m, i) => `<button class="mp-cell ${i === calRef.getMonth() && viewYear === calRef.getFullYear() ? 'active' : ''}" data-month="${i}">${m.slice(0, 3)}</button>`).join('')}
          </div>`;
      } else {
        const years = Array.from({ length: 12 }, (_, i) => decadeStart + i);
        pop.innerHTML = `
          <div class="mp-head">
            <button class="mp-nav" data-d="-1" aria-label="Recuar">‹</button>
            <button class="mp-title">${decadeStart}–${decadeStart + 11}</button>
            <button class="mp-nav" data-d="1" aria-label="Avançar">›</button>
          </div>
          <div class="mp-grid mp-years">
            ${years.map(y => `<button class="mp-cell ${y === calRef.getFullYear() ? 'active' : ''}" data-year="${y}">${y}</button>`).join('')}
          </div>`;
      }
    }
    function position() {
      const r = anchor.getBoundingClientRect();
      pop.style.top = (r.bottom + 8) + 'px';
      let left = r.left;
      const overflow = left + pop.offsetWidth - window.innerWidth + 12;
      if (overflow > 0) left -= overflow;
      pop.style.left = Math.max(12, left) + 'px';
    }

    pop.addEventListener('click', e => {
      e.stopPropagation();
      const y = e.target.closest('[data-y]'); if (y) { viewYear += +y.dataset.y; draw(); return; }
      const d = e.target.closest('[data-d]'); if (d) { decadeStart += (+d.dataset.d) * 12; draw(); return; }
      if (e.target.closest('[data-to-year]')) { mode = 'year'; decadeStart = viewYear - (viewYear % 12); draw(); return; }
      const yc = e.target.closest('[data-year]'); if (yc) { viewYear = +yc.dataset.year; mode = 'month'; draw(); return; }
      const mc = e.target.closest('[data-month]');
      if (mc) {
        const newDate = new Date(viewYear, +mc.dataset.month, 1);
        calDir = (newDate < calRef) ? 'prev' : 'next';
        calRef = newDate; animateNext = true; closeMonthPicker(); render();
      }
    });

    draw(); position();
    const outside = e => { if (!pop.contains(e.target) && !anchor.contains(e.target)) closeMonthPicker(); };
    const onEsc = e => { if (e.key === 'Escape') { closeMonthPicker(); anchor.focus(); } };
    setTimeout(() => { document.addEventListener('click', outside); document.addEventListener('keydown', onEsc, true); }, 0);
    pop._cleanup = () => { document.removeEventListener('click', outside); document.removeEventListener('keydown', onEsc, true); };
  }

  document.getElementById('nav').addEventListener('click', e => {
    const btn = e.target.closest('.nav-item'); if (!btn) return;
    switchView(btn.dataset.view);
  });
  document.getElementById('primary-action').addEventListener('click', primaryAction);
  document.getElementById('category-filter').addEventListener('change', e => { categoryFilter = e.target.value; animateNext = false; render(); });

  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', () => { searchQuery = searchInput.value.trim(); animateNext = false; render(); });

  document.getElementById('view-container').addEventListener('keydown', e => {
    const trigger = e.target.closest('[data-monthpicker]');
    if (trigger && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openMonthPicker(trigger); }
  });
  document.getElementById('add-category-btn').addEventListener('click', () => openCategoryModal(null));

  document.getElementById('category-list').addEventListener('click', e => {
    const edit = e.target.closest('[data-edit-cat]');
    if (edit) { e.stopPropagation(); openCategoryModal(edit.dataset.editCat); return; }
    const row = e.target.closest('[data-cat]');
    if (row) { const id = row.dataset.cat; categoryFilter = (categoryFilter === id) ? 'all' : id; render(); }
  });
  document.getElementById('category-list').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('[data-cat]'); if (!row) return;
    e.preventDefault(); const id = row.dataset.cat;
    categoryFilter = (categoryFilter === id) ? 'all' : id; render();
  });

  document.getElementById('view-container').addEventListener('click', e => {
    const emptyCta = e.target.closest('[data-empty-cta]'); if (emptyCta) { primaryAction(); return; }
    const mpTrigger = e.target.closest('[data-monthpicker]'); if (mpTrigger) { openMonthPicker(mpTrigger); return; }
    const calBtn = e.target.closest('[data-cal]');
    if (calBtn) {
      const dir = calBtn.dataset.cal;
      if (dir === 'today') goToday(); else navMonth(dir);
      return;
    }
    const postEl = e.target.closest('[data-post]'); if (postEl) { openPostModal(postEl.dataset.post); return; }
    const cell = e.target.closest('[data-day]'); if (cell) { openPostModal(null, cell.dataset.day); return; }

    const delIdea = e.target.closest('[data-del-idea]'); if (delIdea) { deleteWithUndo('ideas', delIdea.dataset.delIdea); return; }
    const ideaCard = e.target.closest('[data-idea]'); if (ideaCard) { openIdeaModal(ideaCard.dataset.idea); return; }

    const comp = e.target.closest('[data-complete]');
    if (comp) {
      const t = state.tasks.find(x => x.id === comp.dataset.complete);
      if (t) { const done = (t.status || 'todo') === 'done'; t.status = done ? 'todo' : 'done'; t.done = !done; save(); animateNext = false; render(); }
      return;
    }
    const delTask = e.target.closest('[data-del-task]'); if (delTask) { deleteWithUndo('tasks', delTask.dataset.delTask); return; }
    const taskMain = e.target.closest('[data-task]'); if (taskMain) { openTaskModal(taskMain.dataset.task); return; }
  });

  const DEL_MSG = {
    posts: ['Post eliminado', 'Post reposto'],
    ideas: ['Ideia eliminada', 'Ideia reposta'],
    tasks: ['Tarefa eliminada', 'Tarefa reposta']
  };
  function deleteWithUndo(key, id) {
    const idx = state[key].findIndex(x => x.id === id);
    if (idx === -1) return;
    const [removed] = state[key].splice(idx, 1);
    save(); if (!backdrop.hidden) closeModal(); animateNext = false; render();
    let undone = false;
    toast(DEL_MSG[key][0], {
      actionLabel: 'Anular', duration: 5200,
      onAction: () => {
        undone = true;
        state[key].splice(Math.min(idx, state[key].length), 0, removed);
        save(); animateNext = false; render(); toast(DEL_MSG[key][1]);
      },
      onExpire: () => { if (!undone && key === 'posts') (removed.images || []).forEach(imgId => IMAGES.remove(imgId)); }
    });
  }

  document.getElementById('modal-close').addEventListener('click', closeModal);
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop || e.target.closest('[data-close]')) { closeModal(); return; }
    const dp = e.target.closest('[data-del-post]'); if (dp) deleteWithUndo('posts', dp.dataset.delPost);
    const di = e.target.closest('[data-del-idea]'); if (di) deleteWithUndo('ideas', di.dataset.delIdea);
    const dt = e.target.closest('[data-del-task]'); if (dt) deleteWithUndo('tasks', dt.dataset.delTask);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!lightbox.hidden) { lightbox.hidden = true; lightboxImg.src = ''; }
    else if (!backdrop.hidden) closeModal();
  });

  // ---- Arrastar posts entre dias para reagendar
  const vc = document.getElementById('view-container');
  vc.addEventListener('dragstart', e => {
    const p = e.target.closest('.cal-post[data-post]'); if (!p) return;
    dragPostId = p.dataset.post; p.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragPostId); } catch {}
  });
  vc.addEventListener('dragend', () => {
    dragPostId = null;
    vc.querySelectorAll('.dragging').forEach(x => x.classList.remove('dragging'));
    vc.querySelectorAll('.drop-target').forEach(x => x.classList.remove('drop-target'));
  });
  vc.addEventListener('dragover', e => {
    if (!dragPostId) return;
    const cell = e.target.closest('.cal-cell[data-day]'); if (!cell) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    if (!cell.classList.contains('drop-target')) {
      vc.querySelectorAll('.drop-target').forEach(x => x.classList.remove('drop-target'));
      cell.classList.add('drop-target');
    }
  });
  vc.addEventListener('drop', e => {
    if (!dragPostId) return;
    const cell = e.target.closest('.cal-cell[data-day]'); if (!cell) return;
    e.preventDefault();
    const post = state.posts.find(p => p.id === dragPostId);
    const newDate = cell.dataset.day; dragPostId = null;
    if (post && post.date !== newDate) {
      post.date = newDate; save(); animateNext = false; render();
      toast('Reagendado para ' + formatDatePT(newDate));
    }
  });

  // ---- Arrastar tarefas entre colunas do Kanban
  let dragTaskId = null;
  vc.addEventListener('dragstart', e => {
    const c = e.target.closest('.tcard[data-task]'); if (!c) return;
    dragTaskId = c.dataset.task; c.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragTaskId); } catch {}
  });
  vc.addEventListener('dragend', () => {
    dragTaskId = null;
    vc.querySelectorAll('.tcard.dragging').forEach(x => x.classList.remove('dragging'));
    vc.querySelectorAll('.kanban-list.drop-target').forEach(x => x.classList.remove('drop-target'));
  });
  vc.addEventListener('dragover', e => {
    if (!dragTaskId) return;
    const list = e.target.closest('.kanban-list'); if (!list) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    if (!list.classList.contains('drop-target')) {
      vc.querySelectorAll('.kanban-list.drop-target').forEach(x => x.classList.remove('drop-target'));
      list.classList.add('drop-target');
    }
  });
  vc.addEventListener('drop', e => {
    if (!dragTaskId) return;
    const list = e.target.closest('.kanban-list'); if (!list) return;
    e.preventDefault();
    const t = state.tasks.find(x => x.id === dragTaskId); const st = list.dataset.status; dragTaskId = null;
    if (t && (t.status || 'todo') !== st) {
      t.status = st; t.done = st === 'done'; save(); animateNext = false; render();
      toast('Movida para ' + STATUS_LABEL[st]);
    }
  });

  // ---- Atalhos de teclado
  document.addEventListener('keydown', e => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag);
    const overlay = !backdrop.hidden || !lightbox.hidden || document.querySelector('.confirm-backdrop');
    if (overlay) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !backdrop.hidden) {
        const btn = modalBody.querySelector('#p-save, #i-save, #t-save, #cat-save');
        if (btn) { e.preventDefault(); btn.click(); }
      }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (typing) { if (e.key === 'Escape') document.activeElement.blur(); return; }
    switch (e.key) {
      case '1': switchView('calendar'); break;
      case '2': switchView('ideas'); break;
      case '3': switchView('tasks'); break;
      case 'n': case 'N': e.preventDefault(); primaryAction(); break;
      case '/': e.preventDefault(); searchInput.focus(); break;
      case 'ArrowLeft': if (currentView === 'calendar') navMonth('prev'); break;
      case 'ArrowRight': if (currentView === 'calendar') navMonth('next'); break;
    }
  });

  // Export / Import
  document.getElementById('export-btn').addEventListener('click', () => {
    const bundle = { ...state, _images: IMAGES.store };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `castlesbay-escritorio-${todayISO()}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    toast('Cópia de segurança exportada.');
  });
  document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.categories) || !Array.isArray(data.posts)) throw new Error('formato');
        const ok = await confirmDialog({
          title: 'Importar dados',
          message: 'Isto substitui todos os dados actuais neste dispositivo.',
          confirmLabel: 'Importar'
        });
        if (!ok) return;
        const images = data._images || {};
        delete data._images;
        state = normalizeState(data); persistLocal();
        IMAGES.store = images; IMAGES.persist();
        if (SYNC.ready) { SYNC.push(true); Object.entries(images).forEach(([id, d]) => SYNC.pushImage(id, d)); }
        render(); toast('Dados importados.');
      } catch (err) { toast('Ficheiro inválido.'); }
    };
    reader.readAsText(file); e.target.value = '';
  });

  // ============================================================ SINCRONIZAÇÃO
  const SYNC = {
    ready: false, applyingRemote: false, db: null, docRef: null, imgCol: null,
    unsub: null, pushTimer: null,
    configKey: 'castlesbay-firebase-config',
    clientId: (localStorage.getItem('castlesbay-client') ||
      (v => (localStorage.setItem('castlesbay-client', v), v))(uid())),
    _status: { kind: 'offline' },

    getConfig() {
      if (typeof window.FIREBASE_CONFIG === 'object' && window.FIREBASE_CONFIG) return window.FIREBASE_CONFIG;
      try { return JSON.parse(localStorage.getItem(this.configKey) || 'null'); } catch { return null; }
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
        this.db = firebase.firestore();
        this.docRef = this.db.collection('escritorio').doc('dados');
        this.imgCol = this.db.collection('escritorio_imagens');
        this.subscribe();
      } catch (e) { console.error(e); this.setStatus('error', friendlyFbError(e)); }
    },

    subscribe() {
      this.unsub = this.docRef.onSnapshot(snap => {
        if (!snap.exists) { this.ready = true; this.push(true); this.setStatus('online'); return; }
        const data = snap.data();
        if (data.updatedBy === this.clientId) { this.ready = true; this.setStatus('online'); return; }
        try {
          this.applyingRemote = true;
          state = normalizeState(JSON.parse(data.payload));
          persistLocal();
          this.applyingRemote = false; this.ready = true;
          render(); this.setStatus('online');
        } catch (e) { console.warn('payload remoto inválido', e); this.ready = true; this.setStatus('online'); }
      }, err => { console.error(err); this.setStatus('error', friendlyFbError(err)); });
    },

    push(immediate) {
      if (!this.docRef) return;
      clearTimeout(this.pushTimer);
      const write = () => {
        this.setStatus('syncing', 'A guardar…');
        this.docRef.set({ payload: JSON.stringify(state), updatedBy: this.clientId, updatedAt: Date.now() })
          .then(() => this.setStatus('online'))
          .catch(e => { console.error(e); this.setStatus('error', friendlyFbError(e)); });
      };
      immediate ? write() : (this.pushTimer = setTimeout(write, 700));
    },
    pushImage(id, dataURL) {
      if (!this.imgCol) return;
      this.imgCol.doc(id).set({ data: dataURL, updatedBy: this.clientId }).catch(e => console.warn('img push', e));
    },
    deleteImage(id) { if (this.imgCol) this.imgCol.doc(id).delete().catch(() => {}); },
    async fetchImage(id) {
      if (!this.imgCol) return null;
      try { const d = await this.imgCol.doc(id).get(); return d.exists ? d.data().data : null; }
      catch (e) { console.warn('img fetch', e); return null; }
    },

    async disconnect() {
      if (this.unsub) this.unsub();
      this.unsub = null; this.docRef = null; this.imgCol = null; this.ready = false;
      this.clearConfig();
      try { if (typeof firebase !== 'undefined' && firebase.apps.length) await firebase.app().delete(); } catch {}
      this.setStatus('offline');
    },

    setStatus(kind, detail) {
      this._status = { kind, detail };
      const btn = document.getElementById('sync-btn');
      const label = document.getElementById('sync-label');
      btn.classList.remove('online', 'syncing', 'error');
      if (kind !== 'offline') btn.classList.add(kind);
      const map = { offline: 'Só neste dispositivo', online: 'Sincronizado', syncing: detail || 'A sincronizar…', error: 'Erro de sincronização' };
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

  function parseFirebaseConfig(raw) {
    if (!raw) return null;
    let text = raw; const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    if (s !== -1 && e !== -1) text = raw.slice(s, e + 1);
    try { const o = JSON.parse(text); if (o && o.apiKey) return o; } catch {}
    try { const o = (new Function('return (' + text + ')'))(); if (o && o.apiKey && o.projectId) return o; } catch {}
    return null;
  }

  function openSyncModal() {
    const usingFile = typeof window.FIREBASE_CONFIG === 'object' && !!window.FIREBASE_CONFIG;
    const st = SYNC._status || { kind: 'offline' };
    const stateText = {
      offline: 'Não ligado — os dados ficam só neste dispositivo.',
      online: 'Ligado. Os dados sincronizam entre os teus dispositivos.',
      syncing: 'A sincronizar…',
      error: 'Erro: ' + (st.detail || '')
    }[st.kind];
    const dotColor = st.kind === 'online' ? 'var(--good)' : st.kind === 'error' ? 'var(--danger)' : 'var(--text-faint)';

    openModal('Sincronização', `
      <div class="sync-state-line"><span class="sync-dot" style="background:${dotColor}"></span>${esc(stateText)}</div>
      ${usingFile ? `<p style="font-size:13px;color:var(--text-soft)">Configuração definida em <code>config.js</code> — funciona automaticamente em todos os dispositivos.</p>` : `
      <div class="sync-help">Cola a configuração do teu projeto Firebase (o objeto <code>firebaseConfig</code>).
        <ol>
          <li>Firebase Console → cria projeto</li>
          <li>Adiciona uma app <b>Web</b> e copia o <code>firebaseConfig</code></li>
          <li>Ativa <b>Firestore Database</b> e <b>Authentication → Anónimo</b></li>
        </ol></div>
      <div class="field"><label>Configuração Firebase</label>
        <textarea id="fb-config" placeholder='{ "apiKey": "…", "projectId": "…", ... }' style="min-height:120px;font-family:ui-monospace,monospace;font-size:12.5px">${esc(localStorage.getItem(SYNC.configKey) || '')}</textarea></div>`}
      <div class="modal-actions">
        ${(SYNC.ready || localStorage.getItem(SYNC.configKey)) ? `<button class="btn-danger" id="fb-disconnect">Desligar</button>` : ''}
        <button class="btn-secondary" data-close>Fechar</button>
        ${usingFile ? '' : `<button class="primary-btn" id="fb-connect">Ligar</button>`}
      </div>`, () => {
      const connect = modalBody.querySelector('#fb-connect');
      if (connect) connect.addEventListener('click', () => {
        const cfg = parseFirebaseConfig(modalBody.querySelector('#fb-config').value.trim());
        if (!cfg) { toast('Configuração inválida. Cola o objeto firebaseConfig completo.'); return; }
        SYNC.saveConfig(cfg); closeModal(); toast('A ligar à cloud…'); SYNC.init();
      });
      const dis = modalBody.querySelector('#fb-disconnect');
      if (dis) dis.addEventListener('click', () => {
        if (!confirm('Desligar a sincronização neste dispositivo? Os dados na cloud não são apagados.')) return;
        SYNC.disconnect(); closeModal(); toast('Sincronização desligada.');
      });
    });
  }
  document.getElementById('sync-btn').addEventListener('click', openSyncModal);

  // ============================================================ TEMA
  const THEME = {
    key: 'castlesbay-theme',
    get() { return localStorage.getItem(this.key) || 'dark'; },
    apply(t) {
      document.documentElement.setAttribute('data-theme', t);
      const b = document.getElementById('theme-toggle');
      if (b) b.textContent = t === 'dark' ? 'Tema claro' : 'Tema escuro';
    },
    toggle() {
      const next = this.get() === 'dark' ? 'light' : 'dark';
      localStorage.setItem(this.key, next); this.apply(next);
    }
  };
  document.getElementById('theme-toggle').addEventListener('click', () => THEME.toggle());
  THEME.apply(THEME.get());

  // ============================================================ ARRANQUE
  render();
  SYNC.init();
})();
