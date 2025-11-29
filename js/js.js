// ===== CONSTANTES =====
const DRAFT_LIMIT = 20;
const DELETE_RETENTION_MS = 48 * 60 * 60 * 1000; // 48 horas

// ===== REFERENCIAS =====
const viewList    = document.getElementById('view-list');
const viewEdit    = document.getElementById('view-edit');
const viewDrafts  = document.getElementById('view-drafts');
const viewDeleted = document.getElementById('view-deleted');

const headerTitle   = document.getElementById('headerTitle');
const backButton    = document.getElementById('backButton');
const newPostButton = document.getElementById('newPostButton');
const draftsButton  = document.getElementById('draftsButton');
const deletedButton = document.getElementById('deletedButton');
const sortSelect    = document.getElementById('sortSelect');

const editForm        = document.getElementById('editForm');
const editTitulo      = document.getElementById('editTitulo');
const editDescripcion = document.getElementById('editDescripcion');
const editEtiquetas   = document.getElementById('editEtiquetas');
const editUbicacion   = document.getElementById('editUbicacion');
const editImagen      = document.getElementById('editImagen');
const btnGuardarBorrador = document.getElementById('btnGuardarBorrador');
const autoUbicacionChk   = document.getElementById('autoUbicacion');

const cardsGrid      = document.querySelector('#view-list .mis-pub-grid');
const draftsGrid     = document.getElementById('drafts-grid');
const deletedGrid    = document.getElementById('deleted-grid');
const draftCountSpan = document.getElementById('draftCount');

// Modales
const modal           = document.getElementById('modalAviso');
const modalTexto      = document.getElementById('modalAvisoTexto');
const modalOk         = document.getElementById('modalOk');

const modalEliminar   = document.getElementById('modalEliminar');
const btnEliminarSi   = document.getElementById('btnEliminarSi');
const btnEliminarNo   = document.getElementById('btnEliminarNo');

const modalPublicar   = document.getElementById('modalPublicarBorrador');
const modalPublicarTxt= document.getElementById('textoModalPublicar');
const btnPubliSi      = document.getElementById('btnPubliSi');
const btnPubliNo      = document.getElementById('btnPubliNo');

const modalLimite     = document.getElementById('modalLimiteBorradores');
const modalLimiteOk   = document.getElementById('modalLimiteOk');

const modalHistorial    = document.getElementById('modalHistorial');
const historialContenido= document.getElementById('historialContenido');
const modalHistorialOk  = document.getElementById('modalHistorialOk');

const modalSync    = document.getElementById('modalSync');
const syncText     = document.getElementById('syncText');

const modalComments      = document.getElementById('modalComments');
const commentsList       = document.getElementById('commentsList');
const commentForm        = document.getElementById('commentForm');
const commentTextInput   = document.getElementById('commentText');
const replyingInfo       = document.getElementById('replyingInfo');
const modalCommentsClose = document.getElementById('modalCommentsClose');

// ===== ESTADO =====
let editingCard       = null;
let cardToDelete      = null;
let draftToPublish    = null;
let currentView       = 'list';
let previousView      = 'list';
let isCreating        = false;
let editingFromDrafts = false;

const histories   = new WeakMap(); // card -> [{date,summary}]
const commentsMap = new WeakMap(); // card -> [comments]
let currentCommentsCard = null;
let replyingToCommentId = null;
let commentIdCounter    = 1;

// ===== UTILIDADES =====
function formatDateTime(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${d}/${m}/${y} ${h}:${min}`;
}

function getCardDate(card) {
  const span = card.querySelector('.campo-fecha');
  if (!span) return 0;
  const text = span.textContent.trim();
  const [datePart, timePart = '00:00'] = text.split(' ');
  const [d, m, y] = datePart.split('/').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}

function getCardRelevance(card) {
  const pills = card.querySelectorAll('.metric-pill');
  let likes = 0;
  let dislikes = 0;

  if (pills[2]) {
    const spans = pills[2].querySelectorAll('span');
    likes = spans.length > 1 ? parseInt(spans[1].textContent.trim(), 10) || 0 : 0;
  }
  if (pills[3]) {
    const spans = pills[3].querySelectorAll('span');
    dislikes = spans.length > 1 ? parseInt(spans[1].textContent.trim(), 10) || 0 : 0;
  }
  return likes - dislikes;
}

function sortPublications(criteria) {
  const cards = Array.from(cardsGrid.querySelectorAll('.mis-pub-card'));

  cards.sort((a, b) => {
    const da = getCardDate(a);
    const db = getCardDate(b);
    const ra = getCardRelevance(a);
    const rb = getCardRelevance(b);

    switch (criteria) {
      case 'recientes':       return db - da;
      case 'antiguas':        return da - db;
      case 'relevancia_desc': return rb - ra;
      case 'relevancia_asc':  return ra - rb;
      default:                return 0;
    }
  });

  cards.forEach(card => cardsGrid.appendChild(card));
}

function updateHeaderButtons() {
  if (currentView === 'list') {
    newPostButton.classList.remove('hidden');
    draftsButton.classList.remove('hidden');
    deletedButton.classList.remove('hidden');
  } else {
    newPostButton.classList.add('hidden');
    draftsButton.classList.add('hidden');
    deletedButton.classList.add('hidden');
  }
}

function showInfo(text) {
  modalTexto.textContent = text;
  modal.classList.remove('hidden');
}

function updateDraftIndicator() {
  const count = draftsGrid.querySelectorAll('.mis-pub-card').length;
  draftCountSpan.textContent = count.toString().padStart(2, '0');
}

function canAddDraft() {
  const count = draftsGrid.querySelectorAll('.mis-pub-card').length;
  if (count >= DRAFT_LIMIT) {
    modalLimite.classList.remove('hidden');
    return false;
  }
  return true;
}

// --- helpers para eliminado con cuenta regresiva ---
function formatRemaining(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function ensureCountdownSpan(card) {
  let span = card.querySelector('.deleted-countdown');
  if (span) return span;

  const body = card.querySelector('.mis-pub-card-body');
  if (!body) return null;

  let info = card.querySelector('.deleted-info');
  if (!info) {
    info = document.createElement('p');
    info.className = 'deleted-info';
    info.innerHTML = '<small>Se eliminará en <span class="deleted-countdown"></span></small>';
    body.insertBefore(info, body.firstChild);
  }
  span = info.querySelector('.deleted-countdown');
  return span;
}

function updateDeletedCountdowns() {
  const now = Date.now();
  deletedGrid.querySelectorAll('.mis-pub-card').forEach(card => {
    const ts = parseInt(card.dataset.deletedAt || '0', 10);
    if (!ts) return;
    const diff = now - ts;
    if (diff >= DELETE_RETENTION_MS) {
      card.remove();
      return;
    }
    const remainingMs = DELETE_RETENTION_MS - diff;
    const span = ensureCountdownSpan(card);
    if (span) span.textContent = formatRemaining(remainingMs);
  });
}

function purgeOldDeleted() {
  updateDeletedCountdowns();
}

function setSyncState(card, state) {
  if (!card) return;
  const label = card.querySelector('.sync-label');
  if (!label) return;
  if (state === 'pending') {
    label.textContent = 'Pendiente de sincronización';
    label.classList.remove('hidden');
  } else if (state === 'synced') {
    label.textContent = 'Sincronizado';
    label.classList.remove('hidden');
  } else {
    label.textContent = '';
    label.classList.add('hidden');
  }
}

function simulateSync(card, message) {
  const offline = !navigator.onLine;
  if (!offline) {
    setSyncState(card, 'none');
    showInfo(message);
    return;
  }

  setSyncState(card, 'pending');
  syncText.innerHTML = '<span class="spinner"></span> Sincronizando...';
  modalSync.classList.remove('hidden');

  setTimeout(() => {
    setSyncState(card, 'synced');
    syncText.textContent = 'Sincronizado';
    setTimeout(() => {
      modalSync.classList.add('hidden');
      showInfo(message);
    }, 800);
  }, 2000);
}

// ===== HISTORIAL =====
function initCardHistory(card, summary) {
  histories.set(card, [{ date: new Date(), summary }]);
}

function addHistoryEntry(card, summary) {
  const list = histories.get(card) || [];
  list.push({ date: new Date(), summary });
  histories.set(card, list);
}

function openHistory(card) {
  const list = histories.get(card) || [];
  if (!list.length) {
    historialContenido.textContent = 'No hay modificaciones.';
  } else {
    const ul = document.createElement('ul');
    list.forEach(item => {
      const li = document.createElement('li');
      li.textContent = `[${formatDateTime(item.date)}] ${item.summary}`;
      ul.appendChild(li);
    });
    historialContenido.innerHTML = '';
    historialContenido.appendChild(ul);
  }
  modalHistorial.classList.remove('hidden');
}

function markEdited(card) {
  const label = card.querySelector('.editado-label');
  if (label) label.classList.remove('hidden');
}

// ===== COMENTARIOS =====
function getComments(card) {
  let arr = commentsMap.get(card);
  if (!arr) {
    arr = [];
    commentsMap.set(card, arr);
  }
  return arr;
}

function setCommentCount(card, count) {
  const pills = Array.from(card.querySelectorAll('.metric-pill'));
  const commentPill = pills.find(
    p => p.querySelector('.metric-icon')?.textContent.trim() === '💬'
  );
  if (!commentPill) return;
  const spans = commentPill.querySelectorAll('span');
  if (spans.length < 2) return;
  spans[1].textContent = String(count);
}

function renderComments() {
  if (!currentCommentsCard) return;

  const comments = getComments(currentCommentsCard);
  commentsList.innerHTML = '';

  if (!comments.length) {
    const p = document.createElement('p');
    p.className = 'no-comments';
    p.textContent = 'Aún no hay comentarios. Sé el primero en comentar.';
    commentsList.appendChild(p);
    return;
  }

  function renderThread(parentId) {
    comments
      .filter(c => c.parentId === parentId)
      .forEach(c => {
        const item = document.createElement('div');
        item.className = 'comment-item';
        if (parentId !== null) item.classList.add('comment-reply');

        const isOwn = !!c.own;

        item.innerHTML = `
          <div class="comment-header">
            <span class="comment-author">${c.author}</span>
            <span class="comment-time">${formatDateTime(c.time)}</span>
          </div>
          <div class="comment-body" data-id="${c.id}">${c.text}</div>
          <div class="comment-actions">
            <button class="comment-reply-btn" data-id="${c.id}">Responder</button>
            <button class="comment-report-btn" data-id="${c.id}">Reportar</button>
            ${isOwn ? `<button class="comment-edit-btn" data-id="${c.id}">Editar</button>` : ''}
            <button class="comment-delete-btn" data-id="${c.id}">Eliminar</button>
          </div>
        `;

        commentsList.appendChild(item);
        renderThread(c.id);
      });
  }

  renderThread(null);
}

function openComments(card) {
  currentCommentsCard = card;
  replyingToCommentId = null;
  replyingInfo.classList.add('hidden');
  commentTextInput.value = '';
  renderComments();
  modalComments.classList.remove('hidden');
}

function removeCommentTree(comments, rootId) {
  let removed = 0;
  function dfs(id) {
    for (let i = comments.length - 1; i >= 0; i--) {
      const c = comments[i];
      if (c.id === id) {
        comments.splice(i, 1);
        removed++;
      } else if (c.parentId === id) {
        dfs(c.id);
      }
    }
  }
  dfs(rootId);
  return removed;
}

// ===== VISTAS =====
function showListView() {
  currentView = 'list';
  viewList.classList.remove('hidden');
  viewDrafts.classList.add('hidden');
  viewDeleted.classList.add('hidden');
  viewEdit.classList.add('hidden');
  headerTitle.textContent = 'Mis publicaciones';
  isCreating = false;
  updateHeaderButtons();
}

function showDraftsView() {
  currentView = 'drafts';
  viewDrafts.classList.remove('hidden');
  viewList.classList.add('hidden');
  viewDeleted.classList.add('hidden');
  viewEdit.classList.add('hidden');
  headerTitle.textContent = 'Borradores';
  isCreating = false;
  updateHeaderButtons();
}

function showDeletedView() {
  currentView = 'deleted';
  purgeOldDeleted();
  viewDeleted.classList.remove('hidden');
  viewList.classList.add('hidden');
  viewDrafts.classList.add('hidden');
  viewEdit.classList.add('hidden');
  headerTitle.textContent = 'Publicaciones eliminadas';
  isCreating = false;
  updateHeaderButtons();
}

function showEditView() {
  currentView = 'edit';
  viewEdit.classList.remove('hidden');
  viewList.classList.add('hidden');
  viewDrafts.classList.add('hidden');
  viewDeleted.classList.add('hidden');
  headerTitle.textContent = isCreating ? 'Crear publicación' : 'Editar publicación';
  updateHeaderButtons();
}

// ===== RENUMERAR =====
function renumberPublications() {
  // sin numeración visible
}

function renumberDrafts() {
  const cards = draftsGrid.querySelectorAll('.mis-pub-card');
  cards.forEach((card, index) => {
    const h3 = card.querySelector('.mis-pub-card-header h3');
    h3.textContent = `Borrador ${index + 1}`;
  });
  updateDraftIndicator();
}

// ===== MÉTRICAS =====
function adjustCount(pill, delta) {
  if (!pill) return;
  const spans = pill.querySelectorAll('span');
  if (spans.length < 2) return;
  const countSpan = spans[1];
  const actual = parseInt(countSpan.textContent.trim(), 10) || 0;
  const nuevo = actual + delta;
  countSpan.textContent = nuevo < 0 ? 0 : nuevo;
}

// ===== BOTONES TARJETAS =====
function canEditCard(card) {
  const status = card.dataset.status;
  if (status === 'pendiente') {
    showInfo('Esta publicación no se puede editar porque aún está por verificar.');
    return false;
  }
  if (status === 'bloqueada') {
    showInfo('Esta publicación está bloqueada por moderación y no se puede editar.');
    return false;
  }
  return true;
}

function setupEditButton(btn) {
  btn.addEventListener('click', () => {
    const card = btn.closest('.mis-pub-card');
    const inDrafts = !!card.closest('#drafts-grid');
    const inDeleted = !!card.closest('#deleted-grid');

    if (!inDrafts && !inDeleted && !canEditCard(card)) return;

    editingCard = card;
    editingFromDrafts = inDrafts;
    isCreating = false;
    previousView = inDrafts ? 'drafts' : (inDeleted ? 'deleted' : 'list');

    editTitulo.value      = card.querySelector('.campo-titulo').textContent.trim();
    editDescripcion.value = card.querySelector('.campo-descripcion').textContent.trim();
    editEtiquetas.value   = card.querySelector('.campo-etiquetas').textContent.trim();
    editUbicacion.value   = card.querySelector('.campo-ubicacion').textContent.trim();
    editImagen.value      = '';
    if (autoUbicacionChk) autoUbicacionChk.checked = false;

    showEditView();
  });
}

function setupDeleteButton(btn) {
  btn.addEventListener('click', () => {
    cardToDelete = btn.closest('.mis-pub-card');
    const inDrafts = !!cardToDelete.closest('#drafts-grid');
    const p = modalEliminar.querySelector('p');
    if (p) {
      p.textContent = inDrafts
        ? '¿Está seguro de eliminar el borrador?'
        : '¿Está seguro de eliminar la publicación?';
    }
    modalEliminar.classList.remove('hidden');
  });
}

function setupPublishDraftButton(btn) {
  btn.addEventListener('click', () => {
    const card = btn.closest('.mis-pub-card');
    draftToPublish = card;
    const cards = Array.from(draftsGrid.querySelectorAll('.mis-pub-card'));
    const index = cards.indexOf(card) + 1;
    modalPublicarTxt.textContent = `¿Listo para publicar el borrador ${String(index).padStart(2, '0')}?`;
    modalPublicar.classList.remove('hidden');
  });
}

function setupRestoreButton(btn) {
  btn.addEventListener('click', () => {
    const card = btn.closest('.mis-pub-card');
    card.removeAttribute('data-deleted-at');

    const info = card.querySelector('.deleted-info');
    if (info) info.remove();

    const actions = card.querySelector('.mis-pub-actions');
    actions.innerHTML = `
      <button class="btn-menu" title="Opciones">⋮</button>
      <button class="btn-editar" title="Editar">✏️</button>
      <button class="btn-eliminar" title="Eliminar">🗑️</button>
    `;

    const header = card.querySelector('.mis-pub-card-header');
    let menu = header.querySelector('.card-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'card-menu';
      menu.innerHTML = `
        <button class="menu-editar">Editar</button>
        <button class="menu-eliminar">Eliminar</button>
        <button class="menu-historial">Ver historial</button>
      `;
      header.appendChild(menu);
    }

    attachCardListeners(card);
    cardsGrid.appendChild(card);
    renumberPublications();
    showListView();
  });
}

function setupMenuButton(btn) {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const card = btn.closest('.mis-pub-card');
    const menu = card.querySelector('.card-menu');
    const visible = menu && menu.style.display === 'block';
    document.querySelectorAll('.card-menu').forEach(m => m.style.display = 'none');
    if (menu) menu.style.display = visible ? 'none' : 'block';
  });
}

function setupMenuOptions(card) {
  const menuEdit = card.querySelector('.menu-editar');
  const menuDel  = card.querySelector('.menu-eliminar');
  const menuHist = card.querySelector('.menu-historial');

  if (menuEdit) {
    menuEdit.addEventListener('click', () => {
      const btn = card.querySelector('.btn-editar');
      if (btn) btn.click();
      const menu = card.querySelector('.card-menu');
      if (menu) menu.style.display = 'none';
    });
  }

  if (menuDel) {
    menuDel.addEventListener('click', () => {
      const btn = card.querySelector('.btn-eliminar');
      if (btn) btn.click();
      const menu = card.querySelector('.card-menu');
      if (menu) menu.style.display = 'none';
    });
  }

  if (menuHist) {
    menuHist.addEventListener('click', () => {
      openHistory(card);
      const menu = card.querySelector('.card-menu');
      if (menu) menu.style.display = 'none';
    });
  }
}

function attachCardListeners(card) {
  const editBtn  = card.querySelector('.btn-editar');
  const delBtn   = card.querySelector('.btn-eliminar');
  const pubDraft = card.querySelector('.btn-publicar-borrador');
  const restore  = card.querySelector('.btn-restaurar');
  const menuBtn  = card.querySelector('.btn-menu');

  if (editBtn)  setupEditButton(editBtn);
  if (delBtn)   setupDeleteButton(delBtn);
  if (pubDraft) setupPublishDraftButton(pubDraft);
  if (restore)  setupRestoreButton(restore);
  if (menuBtn)  setupMenuButton(menuBtn);

  setupMenuOptions(card);
}

// Cerrar menús de 3 puntos al hacer clic fuera
document.addEventListener('click', () => {
  document.querySelectorAll('.card-menu').forEach(m => m.style.display = 'none');
});

// ===== NAVEGACIÓN HEADER =====
backButton.addEventListener('click', () => {
  if (currentView === 'edit') {
    if (previousView === 'drafts') showDraftsView();
    else if (previousView === 'deleted') showDeletedView();
    else showListView();
  } else if (currentView === 'drafts' || currentView === 'deleted') {
    showListView();
  } else {
    window.history.back();
  }
});

draftsButton.addEventListener('click', () => showDraftsView());
deletedButton.addEventListener('click', () => showDeletedView());

newPostButton.addEventListener('click', () => {
  isCreating = true;
  editingCard = null;
  editingFromDrafts = false;
  previousView = 'list';

  editTitulo.value      = '';
  editDescripcion.value = '';
  editEtiquetas.value   = '';
  editUbicacion.value   = '';
  editImagen.value      = '';
  if (autoUbicacionChk) autoUbicacionChk.checked = false;

  showEditView();
});

// --- Ubicar automáticamente ---
if (autoUbicacionChk) {
  autoUbicacionChk.addEventListener('change', () => {
    if (autoUbicacionChk.checked) {
      editUbicacion.value = 'Jr. los Linos 680';
    }
    // Si quisieras limpiar al desmarcar:
    // else editUbicacion.value = '';
  });
}

// ordenar
if (sortSelect) {
  sortSelect.addEventListener('change', () => {
    sortPublications(sortSelect.value);
  });
}

// ===== SEED COMENTARIOS INICIALES =====
function seedInitialComments(card, index) {
  const status = card.dataset.status;
  const comments = [];
  const now = new Date();

  function addComment(author, text, minutesAgo, parentId = null) {
    const t = new Date(now.getTime() - minutesAgo * 60000);
    comments.push({
      id: commentIdCounter++,
      author,
      text,
      time: t,
      parentId,
      own: false
    });
  }

  if (status === 'pendiente' || status === 'bloqueada') {
    commentsMap.set(card, comments);
    setCommentCount(card, 0);
    return;
  }

  if (index === 0) {
    addComment('Lucía', 'Gracias por avisar, paso por ahí todos los días.', 30);
    addComment('Carlos', 'Deberían poner más serenazgo en esa zona.', 25);
    addComment('Ana', 'Yo también vi algo parecido anoche.', 10);
  } else if (index === 1) {
    addComment('Miguel', 'Qué miedo, justo vivo cerca.', 40);
    addComment('Rosa', 'Voy a compartir esto con mis vecinos.', 35);
  } else if (index === 2) {
    addComment('Jorge', 'Sería bueno tener más cámaras de seguridad.', 90);
    addComment('María', 'Gracias por el reporte, cuidaré mis cosas.', 60);
    addComment('Pedro', 'Ya había escuchado de varios robos ahí.', 45);
    addComment('Elena', 'Ojalá las autoridades hagan algo pronto.', 15);
  } else {
    addComment('Usuario', 'Comentario de ejemplo 1.', 20);
    addComment('Usuario 2', 'Comentario de ejemplo 2.', 15);
  }

  commentsMap.set(card, comments);
  setCommentCount(card, comments.length);
}

// configurar tarjetas iniciales de publicaciones
document.querySelectorAll('#view-list .mis-pub-card').forEach((card, index) => {
  attachCardListeners(card);
  initCardHistory(card, 'Publicación creada');
  seedInitialComments(card, index);
});

// configurar tarjetas iniciales de borradores
document.querySelectorAll('#drafts-grid .mis-pub-card').forEach((card) => {
  attachCardListeners(card);
  initCardHistory(card, 'Borrador creado');
  commentsMap.set(card, []);
  setCommentCount(card, 0);
});

// ===== CREAR TARJETAS =====
function createNewPublicationCard(imgSrc) {
  const article = document.createElement('article');
  article.className = 'mis-pub-card';
  article.dataset.status = 'aprobada';

  const nowText = formatDateTime(new Date());
  const imgHtml = imgSrc
    ? `<img src="${imgSrc}" alt="Imagen de la publicación" class="mis-pub-img">`
    : '';

  article.innerHTML = `
    <div class="mis-pub-card-header">
      <div class="title-status">
        <h3>Publicación</h3>
        <span class="status-badge status-aprobada">Verificada</span>
      </div>
      <div class="mis-pub-actions">
        <button class="btn-menu" title="Opciones">⋮</button>
        <button class="btn-editar" title="Editar">✏️</button>
        <button class="btn-eliminar" title="Eliminar">🗑️</button>
      </div>
      <div class="card-menu">
        <button class="menu-editar">Editar</button>
        <button class="menu-eliminar">Eliminar</button>
        <button class="menu-historial">Ver historial</button>
      </div>
    </div>
    <div class="mis-pub-card-body">
      <p class="pub-fecha">
        <small>Publicado: <span class="campo-fecha">${nowText}</span></small>
        <span class="editado-label hidden">Editado</span>
        <span class="sync-label hidden"></span>
      </p>
      <p><strong>Título:</strong> <span class="campo-titulo">${editTitulo.value}</span></p>
      <p><strong>Descripción:</strong> <span class="campo-descripcion">${editDescripcion.value}</span></p>
      <p><strong>Etiquetas:</strong> <span class="campo-etiquetas">${editEtiquetas.value}</span></p>
      <p><strong>Ubicación:</strong> <span class="campo-ubicacion">${editUbicacion.value}</span></p>
      ${imgHtml}
      <div class="mis-pub-metrics">
        <div class="metric-pill"><span class="metric-icon">💬</span><span>0</span></div>
        <div class="metric-pill"><span class="metric-icon">👁️</span><span>0</span></div>
        <div class="metric-pill"><span class="metric-icon">👍</span><span>0</span></div>
        <div class="metric-pill"><span class="metric-icon">👎</span><span>0</span></div>
      </div>
    </div>
  `;

  cardsGrid.appendChild(article);
  attachCardListeners(article);
  initCardHistory(article, 'Publicación creada');
  commentsMap.set(article, []);
  setCommentCount(article, 0);
  return article;
}

function createNewDraftCard(imgSrc) {
  const article = document.createElement('article');
  article.className = 'mis-pub-card';

  const nowText = formatDateTime(new Date());
  const imgHtml = imgSrc
    ? `<img src="${imgSrc}" alt="Imagen del borrador" class="mis-pub-img">`
    : '';

  article.innerHTML = `
    <div class="mis-pub-card-header">
      <div class="title-status">
        <h3>Borrador</h3>
      </div>
      <div class="mis-pub-actions">
        <button class="btn-publicar-borrador" title="Publicar borrador">☑️</button>
        <button class="btn-editar" title="Editar borrador">✏️</button>
        <button class="btn-eliminar" title="Eliminar borrador">🗑️</button>
      </div>
    </div>
    <div class="mis-pub-card-body">
      <p class="pub-fecha">
        <small>Creado: <span class="campo-fecha">${nowText}</span></small>
        <span class="editado-label hidden">Editado</span>
        <span class="sync-label hidden"></span>
      </p>
      <p><strong>Título:</strong> <span class="campo-titulo">${editTitulo.value}</span></p>
      <p><strong>Descripción:</strong> <span class="campo-descripcion">${editDescripcion.value}</span></p>
      <p><strong>Etiquetas:</strong> <span class="campo-etiquetas">${editEtiquetas.value}</span></p>
      <p><strong>Ubicación:</strong> <span class="campo-ubicacion">${editUbicacion.value}</span></p>
      ${imgHtml}
      <div class="mis-pub-metrics">
        <div class="metric-pill"><span class="metric-icon">💬</span><span>0</span></div>
        <div class="metric-pill"><span class="metric-icon">👁️</span><span>0</span></div>
        <div class="metric-pill"><span class="metric-icon">👍</span><span>0</span></div>
        <div class="metric-pill"><span class="metric-icon">👎</span><span>0</span></div>
      </div>
    </div>
  `;

  draftsGrid.appendChild(article);
  attachCardListeners(article);
  initCardHistory(article, 'Borrador creado');
  commentsMap.set(article, []);
  setCommentCount(article, 0);
  renumberDrafts();
  return article;
}

// ===== SUBMIT PUBLICAR =====
editForm.addEventListener('submit', (e) => {
  e.preventDefault();

  if (isCreating) {
    const file = editImagen.files[0];
    const after = (card) => {
      showListView();
      simulateSync(card, 'Publicación creada correctamente.');
      sortPublications('recientes');
    };

    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const card = createNewPublicationCard(reader.result);
        after(card);
      };
      reader.readAsDataURL(file);
    } else {
      const card = createNewPublicationCard(''); // sin imagen
      after(card);
    }

    isCreating = false;
  } else if (editingCard) {
    const oldTitle = editingCard.querySelector('.campo-titulo').textContent.trim();
    const oldDesc  = editingCard.querySelector('.campo-descripcion').textContent.trim();
    const oldTags  = editingCard.querySelector('.campo-etiquetas').textContent.trim();
    const oldUbic  = editingCard.querySelector('.campo-ubicacion').textContent.trim();

    editingCard.querySelector('.campo-titulo').textContent      = editTitulo.value;
    editingCard.querySelector('.campo-descripcion').textContent = editDescripcion.value;
    editingCard.querySelector('.campo-etiquetas').textContent   = editEtiquetas.value;
    editingCard.querySelector('.campo-ubicacion').textContent   = editUbicacion.value;

    const fechaSpan = editingCard.querySelector('.campo-fecha');
    if (fechaSpan) fechaSpan.textContent = formatDateTime(new Date());
    markEdited(editingCard);

    const changes = [];
    if (oldTitle !== editTitulo.value) changes.push('Título actualizado');
    if (oldDesc  !== editDescripcion.value) changes.push('Descripción actualizada');
    if (oldTags  !== editEtiquetas.value) changes.push('Etiquetas actualizadas');
    if (oldUbic  !== editUbicacion.value) changes.push('Ubicación actualizada');

    const summary = changes.length ? changes.join(', ') : 'Edición sin cambios importantes';
    addHistoryEntry(editingCard, summary);

    const inDrafts = !!editingCard.closest('#drafts-grid');
    if (inDrafts) {
      draftsGrid.removeChild(editingCard);
      renumberDrafts();

      editingCard.dataset.status = 'aprobada';
      const header = editingCard.querySelector('.mis-pub-card-header');
      const titleStatus = header.querySelector('.title-status');

      // Cambiar de "Borrador X" a "Publicación"
      const h3 = titleStatus.querySelector('h3');
      if (h3) h3.textContent = 'Publicación';

      // Cambiar texto "Creado:" a "Publicado:"
      const small = editingCard.querySelector('.pub-fecha small');
      if (small && small.firstChild) {
        small.firstChild.nodeValue = 'Publicado: ';
      }

      let badge = titleStatus.querySelector('.status-badge');
      if (!badge) {
        badge = document.createElement('span');
        titleStatus.appendChild(badge);
      }
      badge.textContent = 'Verificada';
      badge.className = 'status-badge status-aprobada';

      let menu = header.querySelector('.card-menu');
      if (!menu) {
        menu = document.createElement('div');
        menu.className = 'card-menu';
        menu.innerHTML = `
          <button class="menu-editar">Editar</button>
          <button class="menu-eliminar">Eliminar</button>
          <button class="menu-historial">Ver historial</button>
        `;
        header.appendChild(menu);
      }

      const actions = editingCard.querySelector('.mis-pub-actions');
      actions.innerHTML = `
        <button class="btn-menu" title="Opciones">⋮</button>
        <button class="btn-editar" title="Editar">✏️</button>
        <button class="btn-eliminar" title="Eliminar">🗑️</button>
      `;

      cardsGrid.appendChild(editingCard);
      attachCardListeners(editingCard);
      sortPublications('recientes');
    }

    showListView();
    simulateSync(editingCard, 'Edición satisfactoria.');
  }
});

// ===== GUARDAR BORRADOR =====
btnGuardarBorrador.addEventListener('click', () => {
  if (isCreating) {
    if (!canAddDraft()) return;

    const file = editImagen.files[0];
    const after = (card) => {
      showDraftsView();
      simulateSync(card, 'Borrador guardado correctamente.');
    };

    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const card = createNewDraftCard(reader.result);
        after(card);
      };
      reader.readAsDataURL(file);
    } else {
      const card = createNewDraftCard(''); // sin imagen
      after(card);
    }

    isCreating = false;
  } else if (editingCard) {
    editingCard.querySelector('.campo-titulo').textContent      = editTitulo.value;
    editingCard.querySelector('.campo-descripcion').textContent = editDescripcion.value;
    editingCard.querySelector('.campo-etiquetas').textContent   = editEtiquetas.value;
    editingCard.querySelector('.campo-ubicacion').textContent   = editUbicacion.value;

    const fechaSpan = editingCard.querySelector('.campo-fecha');
    if (fechaSpan) fechaSpan.textContent = formatDateTime(new Date());
    markEdited(editingCard);
    addHistoryEntry(editingCard, 'Cambios guardados en borrador');

    const inDrafts = !!editingCard.closest('#drafts-grid');

    if (!inDrafts) {
      if (!canAddDraft()) return;

      cardsGrid.removeChild(editingCard);
      renumberPublications();

      const header = editingCard.querySelector('.mis-pub-card-header');
      const actions = editingCard.querySelector('.mis-pub-actions');
      const menu = header.querySelector('.card-menu');
      if (menu) menu.remove();

      const titleStatus = header.querySelector('.title-status');
      const h3 = titleStatus.querySelector('h3');
      h3.textContent = 'Borrador';

      actions.innerHTML = `
        <button class="btn-publicar-borrador" title="Publicar borrador">☑️</button>
        <button class="btn-editar" title="Editar borrador">✏️</button>
        <button class="btn-eliminar" title="Eliminar borrador">🗑️</button>
      `;

      draftsGrid.appendChild(editingCard);
      attachCardListeners(editingCard);
      renumberDrafts();
    }

    showDraftsView();
    simulateSync(editingCard, 'Borrador actualizado.');
  }
});

// cambio de imagen en edición (solo si ya existe imagen en la card)
editImagen.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file || !editingCard || isCreating) return;

  const reader = new FileReader();
  reader.onload = () => {
    let img = editingCard.querySelector('.mis-pub-img');
    if (!img) {
      img = document.createElement('img');
      img.className = 'mis-pub-img';
      img.alt = 'Imagen de la publicación';
      const body = editingCard.querySelector('.mis-pub-card-body');
      const metrics = body.querySelector('.mis-pub-metrics');
      body.insertBefore(img, metrics);
    }
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

// ===== MODALES GENÉRICOS =====
modalOk.addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', (e) => {
  if (e.target === modal || e.target.classList.contains('modal-backdrop')) {
    modal.classList.add('hidden');
  }
});

modalLimiteOk.addEventListener('click', () => modalLimite.classList.add('hidden'));
modalLimite.addEventListener('click', (e) => {
  if (e.target === modalLimite || e.target.classList.contains('modal-backdrop')) {
    modalLimite.classList.add('hidden');
  }
});

modalHistorialOk.addEventListener('click', () => modalHistorial.classList.add('hidden'));
modalHistorial.addEventListener('click', (e) => {
  if (e.target === modalHistorial || e.target.classList.contains('modal-backdrop')) {
    modalHistorial.classList.add('hidden');
  }
});

modalCommentsClose.addEventListener('click', () => modalComments.classList.add('hidden'));
modalComments.addEventListener('click', (e) => {
  if (e.target === modalComments || e.target.classList.contains('modal-backdrop')) {
    modalComments.classList.add('hidden');
  }
});

// ===== ELIMINAR PUBLICACIÓN / BORRADOR =====
btnEliminarSi.addEventListener('click', () => {
  if (cardToDelete) {
    const inDrafts = !!cardToDelete.closest('#drafts-grid');
    const inPub    = !!cardToDelete.closest('#view-list');

    if (inDrafts) {
      // Eliminar borrador definitivamente
      cardToDelete.remove();
      cardToDelete = null;
      renumberDrafts();
      updateDraftIndicator();
    } else {
      // Publicación -> enviar a "Publicaciones eliminadas"
      cardToDelete.dataset.deletedAt = Date.now().toString();

      const actions = cardToDelete.querySelector('.mis-pub-actions');
      actions.innerHTML = `<button class="btn-restaurar" title="Restaurar publicación">⟳</button>`;

      const header = cardToDelete.querySelector('.mis-pub-card-header');
      const menu = header.querySelector('.card-menu');
      if (menu) menu.remove();

      deletedGrid.appendChild(cardToDelete);
      attachCardListeners(cardToDelete);

      if (inPub) renumberPublications();

      cardToDelete = null;
      updateDeletedCountdowns();
    }
  }
  modalEliminar.classList.add('hidden');
});

btnEliminarNo.addEventListener('click', () => {
  cardToDelete = null;
  modalEliminar.classList.add('hidden');
});

modalEliminar.addEventListener('click', (e) => {
  if (e.target === modalEliminar || e.target.classList.contains('modal-backdrop')) {
    cardToDelete = null;
    modalEliminar.classList.add('hidden');
  }
});

// ===== PUBLICAR BORRADOR (botón ☑️) =====
btnPubliSi.addEventListener('click', () => {
  if (draftToPublish) {
    draftsGrid.removeChild(draftToPublish);
    renumberDrafts();

    // Actualizar fecha y "Creado:" -> "Publicado:"
    const nowText  = formatDateTime(new Date());
    const fechaSpan = draftToPublish.querySelector('.campo-fecha');
    if (fechaSpan) fechaSpan.textContent = nowText;

    const small = draftToPublish.querySelector('.pub-fecha small');
    if (small && small.firstChild) {
      small.firstChild.nodeValue = 'Publicado: ';
    }

    draftToPublish.dataset.status = 'aprobada';

    const header = draftToPublish.querySelector('.mis-pub-card-header');
    const titleStatus = header.querySelector('.title-status');
    const h3 = titleStatus.querySelector('h3');
    if (h3) h3.textContent = 'Publicación';

    let badge = titleStatus.querySelector('.status-badge');
    if (!badge) {
      badge = document.createElement('span');
      titleStatus.appendChild(badge);
    }
    badge.textContent = 'Verificada';
    badge.className = 'status-badge status-aprobada';

    let menu = header.querySelector('.card-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'card-menu';
      menu.innerHTML = `
        <button class="menu-editar">Editar</button>
        <button class="menu-eliminar">Eliminar</button>
        <button class="menu-historial">Ver historial</button>
      `;
      header.appendChild(menu);
    }

    const actions = draftToPublish.querySelector('.mis-pub-actions');
    actions.innerHTML = `
      <button class="btn-menu" title="Opciones">⋮</button>
      <button class="btn-editar" title="Editar">✏️</button>
      <button class="btn-eliminar" title="Eliminar">🗑️</button>
    `;

    cardsGrid.appendChild(draftToPublish);
    attachCardListeners(draftToPublish);
    sortPublications('recientes');

    addHistoryEntry(draftToPublish, 'Borrador publicado como publicación');
    showListView();
    simulateSync(draftToPublish, 'Borrador publicado correctamente.');

    draftToPublish = null;
  }
  modalPublicar.classList.add('hidden');
});

btnPubliNo.addEventListener('click', () => {
  draftToPublish = null;
  modalPublicar.classList.add('hidden');
});

modalPublicar.addEventListener('click', (e) => {
  if (e.target === modalPublicar || e.target.classList.contains('modal-backdrop')) {
    draftToPublish = null;
    modalPublicar.classList.add('hidden');
  }
});

// ===== COMENTARIOS: abrir modal al hacer clic en 💬 =====
document.addEventListener('click', (e) => {
  const pill = e.target.closest('.metric-pill');
  if (!pill) return;

  const iconSpan = pill.querySelector('.metric-icon');
  if (!iconSpan) return;
  const icon = iconSpan.textContent.trim();
  if (icon !== '💬') return;

  const card = pill.closest('.mis-pub-card');
  if (!card) return;

  const status = card.dataset.status;
  if (status === 'pendiente' || status === 'bloqueada') {
    showInfo('Esta publicación no está verificada o está bloqueada. No se pueden comentar.');
    return;
  }

  openComments(card);
});

// Enviar comentario
commentForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!currentCommentsCard) return;

  const status = currentCommentsCard.dataset.status;
  if (status === 'pendiente' || status === 'bloqueada') {
    showInfo('Esta publicación no está verificada o está bloqueada. No se pueden comentar.');
    return;
  }

  const text = commentTextInput.value.trim();
  if (!text) return;

  const author = 'Daniel'; // usuario registrado

  const comments = getComments(currentCommentsCard);
  comments.push({
    id: commentIdCounter++,
    author,
    text,
    time: new Date(),
    parentId: replyingToCommentId,
    own: true
  });
  commentsMap.set(currentCommentsCard, comments);

  const pills = Array.from(currentCommentsCard.querySelectorAll('.metric-pill'));
  const commentPill = pills.find(
    p => p.querySelector('.metric-icon')?.textContent.trim() === '💬'
  );
  adjustCount(commentPill, +1);

  commentTextInput.value = '';
  replyingToCommentId = null;
  replyingInfo.classList.add('hidden');
  renderComments();

  addHistoryEntry(currentCommentsCard, 'Nuevo comentario agregado');
});

// Acciones sobre comentarios
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('comment-reply-btn')) {
    const id = e.target.dataset.id;
    replyingToCommentId = parseInt(id, 10);
    replyingInfo.classList.remove('hidden');
    replyingInfo.textContent = 'Respondiendo a un comentario…';
  }

  if (e.target.classList.contains('comment-report-btn')) {
    if (!currentCommentsCard) return;

    const commentId = parseInt(e.target.dataset.id, 10);
    const comments = getComments(currentCommentsCard);
    const comment = comments.find(c => c.id === commentId);

    showInfo('Comentario reportado. Nuestro equipo revisará el contenido.');

    if (comment?.own) {
      addHistoryEntry(currentCommentsCard, 'Comentario propio reportado');
    }
  }

  if (e.target.classList.contains('comment-edit-btn')) {
    if (!currentCommentsCard) return;

    const commentId = parseInt(e.target.dataset.id, 10);
    const comments = getComments(currentCommentsCard);
    const comment = comments.find(c => c.id === commentId);
    if (!comment || !comment.own) {
      showInfo('Solo puedes editar tus propios comentarios.');
      return;
    }

    const nuevo = prompt('Editar comentario:', comment.text);
    if (nuevo && nuevo.trim() && nuevo !== comment.text) {
      comment.text = nuevo.trim();
      renderComments();
      addHistoryEntry(currentCommentsCard, 'Comentario propio editado');
    }
  }

  if (e.target.classList.contains('comment-delete-btn')) {
    if (!currentCommentsCard) return;
    const id = parseInt(e.target.dataset.id, 10);
    const comments = getComments(currentCommentsCard);
    const comment = comments.find(c => c.id === id);

    const removed = removeCommentTree(comments, id);
    commentsMap.set(currentCommentsCard, comments);

    const pills = Array.from(currentCommentsCard.querySelectorAll('.metric-pill'));
    const commentPill = pills.find(
      p => p.querySelector('.metric-icon')?.textContent.trim() === '💬'
    );
    adjustCount(commentPill, -removed);

    replyingToCommentId = null;
    replyingInfo.classList.add('hidden');
    renderComments();

    if (comment?.own) {
      addHistoryEntry(currentCommentsCard, 'Comentario propio eliminado');
    }
  }
});

// ===== LIKES / DISLIKES =====
document.addEventListener('click', (e) => {
  const pill = e.target.closest('.metric-pill');
  if (!pill) return;

  const iconSpan = pill.querySelector('.metric-icon');
  if (!iconSpan) return;
  const icon = iconSpan.textContent.trim();
  if (icon !== '👍' && icon !== '👎') return;

  const card = pill.closest('.mis-pub-card');
  if (!card) return;

  const status = card.dataset.status;
  if (status === 'pendiente' || status === 'bloqueada') {
    showInfo('No puedes votar en publicaciones no verificadas o bloqueadas.');
    return;
  }

  const currentVote = card.dataset.vote || 'none';
  const metricPills = Array.from(card.querySelectorAll('.metric-pill'));
  const likePill = metricPills.find(p => p.querySelector('.metric-icon')?.textContent.trim() === '👍');
  const dislikePill = metricPills.find(p => p.querySelector('.metric-icon')?.textContent.trim() === '👎');

  if (icon === '👍') {
    if (currentVote === 'like') {
      adjustCount(likePill, -1);
      card.dataset.vote = 'none';
    } else {
      if (currentVote === 'dislike') adjustCount(dislikePill, -1);
      adjustCount(likePill, +1);
      card.dataset.vote = 'like';
    }
  } else if (icon === '👎') {
    if (currentVote === 'dislike') {
      adjustCount(dislikePill, -1);
      card.dataset.vote = 'none';
    } else {
      if (currentVote === 'like') adjustCount(likePill, -1);
      adjustCount(dislikePill, +1);
      card.dataset.vote = 'dislike';
    }
  }
});

// ===== INICIAL =====
updateDraftIndicator();
purgeOldDeleted();
sortPublications('recientes');
setInterval(updateDeletedCountdowns, 1000);

