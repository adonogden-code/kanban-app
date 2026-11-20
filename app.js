(() => {
  const STORAGE_KEY = 'minimal_todos_v1';
  const VALID_STATUSES = ['todo', 'process', 'done'];
  const VALID_PRIORITIES = ['high', 'medium', 'low'];

  const CATEGORY_LABELS = {
    work: '工作',
    life: '生活',
  };

  const PRIORITY_LABELS = {
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  };

  const PRIORITY_ORDER = {
    high: 0,
    medium: 1,
    low: 2,
  };

  // DOM 元素
  const todoForm = document.getElementById('todo-form');
  const todoInput = document.getElementById('todo-input');
  const todoAssignee = document.getElementById('todo-assignee');
  const todoPriority = document.getElementById('todo-priority');
  const todoCategory = document.getElementById('todo-category');
  const pendingCountEl = document.getElementById('pending-count');
  const countAllEl = document.getElementById('count-all');
  const countWorkEl = document.getElementById('count-work');
  const countLifeEl = document.getElementById('count-life');
  const clearCompletedBtn = document.getElementById('clear-completed');
  const filterTabs = document.querySelectorAll('.filter-tab');
  const currentDateEl = document.getElementById('current-date');
  const kanbanColumns = document.querySelectorAll('.kanban-column');

  const columnLists = {
    todo: document.getElementById('list-todo'),
    process: document.getElementById('list-process'),
    done: document.getElementById('list-done'),
  };

  const columnCounts = {
    todo: document.getElementById('count-status-todo'),
    process: document.getElementById('count-status-process'),
    done: document.getElementById('count-status-done'),
  };

  // 狀態
  let todos = loadTodos();
  let currentFilter = 'all';
  let draggedTodoId = null;

  // 初始化日期顯示
  function renderDate() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('zh-Hant-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    });
    currentDateEl.textContent = formatter.format(now);
  }

  // 資料結構正規化（相容舊版 completed 布林值遷移至 status）
  function normalizeTodo(item) {
    if (!item || typeof item !== 'object') return null;
    const status = VALID_STATUSES.includes(item.status)
      ? item.status
      : item.completed
      ? 'done'
      : 'todo';

    const priority = VALID_PRIORITIES.includes(item.priority)
      ? item.priority
      : 'medium';

    return {
      id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
      text: String(item.text || ''),
      assignee: String(item.assignee || '未指派'),
      category: item.category === 'life' ? 'life' : 'work',
      priority,
      status,
      completed: status === 'done',
      createdAt: Number(item.createdAt) || Date.now(),
    };
  }

  // 從 localStorage 讀取任務
  function loadTodos() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeTodo).filter(Boolean);
    } catch (err) {
      console.error('無法讀取本地儲存資料:', err);
      return [];
    }
  }

  // 儲存任務至 localStorage
  function saveTodos() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch (err) {
      console.error('無法寫入本地儲存資料:', err);
    }
  }

  // 新增任務 (任務內容與負責人皆為必填，預設進入 To-do 欄位)
  function addTodo(text, assignee, category, priority = 'medium') {
    const trimmedText = text.trim();
    const trimmedAssignee = assignee.trim();
    if (!trimmedText || !trimmedAssignee) return false;

    const validCategory = category === 'life' ? 'life' : 'work';
    const validPriority = VALID_PRIORITIES.includes(priority) ? priority : 'medium';
    const newTodo = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: trimmedText,
      assignee: trimmedAssignee,
      category: validCategory,
      priority: validPriority,
      status: 'todo',
      completed: false,
      createdAt: Date.now(),
    };

    todos.unshift(newTodo);
    saveTodos();
    render();
    return true;
  }

  // 移動任務卡片至指定欄位與位置
  function moveTodo(id, targetStatus, beforeId = null) {
    if (!VALID_STATUSES.includes(targetStatus)) return;
    const currentIndex = todos.findIndex((item) => item.id === id);
    if (currentIndex === -1) return;

    const [movedItem] = todos.splice(currentIndex, 1);
    movedItem.status = targetStatus;
    movedItem.completed = targetStatus === 'done';

    if (beforeId && beforeId !== id) {
      const targetIndex = todos.findIndex((item) => item.id === beforeId);
      if (targetIndex !== -1) {
        todos.splice(targetIndex, 0, movedItem);
      } else {
        todos.push(movedItem);
      }
    } else {
      todos.push(movedItem);
    }

    saveTodos();
    render();
  }

  // 刪除單一任務
  function deleteTodo(id) {
    todos = todos.filter((item) => item.id !== id);
    saveTodos();
    render();
  }

  // 清除所有 done 任務
  function clearCompleted() {
    todos = todos.filter((item) => item.status !== 'done');
    saveTodos();
    render();
  }

  // 切換分類篩選
  function setFilter(filter) {
    currentFilter = filter;
    filterTabs.forEach((tab) => {
      const isActive = tab.dataset.filter === filter;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
    render();
  }

  // 計算拖曳放置時游標下方的目標卡片（決定插入順序）
  function getDragAfterElement(listEl, clientY) {
    const cards = [...listEl.querySelectorAll('.todo-card:not(.dragging)')];
    return cards.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = clientY - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset, element: child };
        }
        return closest;
      },
      { offset: Number.NEGATIVE_INFINITY, element: null }
    ).element;
  }

  // 建立單一任務卡片 DOM 節點
  function createTodoCard(todo) {
    const li = document.createElement('li');
    li.className = `todo-card${todo.status === 'done' ? ' is-done' : ''}`;
    li.dataset.id = todo.id;
    li.draggable = true;

    // 拖曳事件
    li.addEventListener('dragstart', (e) => {
      draggedTodoId = todo.id;
      li.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', todo.id);
      }
    });

    li.addEventListener('dragend', () => {
      draggedTodoId = null;
      li.classList.remove('dragging');
      kanbanColumns.forEach((col) => col.classList.remove('drag-over'));
    });

    // 卡片頂部：任務文字 + 刪除按鈕
    const topDiv = document.createElement('div');
    topDiv.className = 'card-top';

    const textSpan = document.createElement('span');
    textSpan.className = 'todo-text';
    textSpan.textContent = todo.text;

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn';
    deleteBtn.setAttribute('aria-label', `刪除「${todo.text}」`);
    deleteBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTodo(todo.id);
    });

    topDiv.appendChild(textSpan);
    topDiv.appendChild(deleteBtn);

    // 卡片底部：負責人標籤 + 分類標籤
    const metaDiv = document.createElement('div');
    metaDiv.className = 'card-meta';

    const assigneeBadge = document.createElement('span');
    assigneeBadge.className = 'assignee-badge';
    assigneeBadge.title = `負責人：${todo.assignee || '未指派'}`;

    const userIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    userIcon.setAttribute('width', '12');
    userIcon.setAttribute('height', '12');
    userIcon.setAttribute('viewBox', '0 0 24 24');
    userIcon.setAttribute('fill', 'none');
    userIcon.setAttribute('stroke', 'currentColor');
    userIcon.setAttribute('stroke-width', '2');
    userIcon.setAttribute('stroke-linecap', 'round');
    userIcon.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '7');
    circle.setAttribute('r', '4');
    userIcon.appendChild(path);
    userIcon.appendChild(circle);

    const assigneeName = document.createElement('span');
    assigneeName.textContent = todo.assignee || '未指派';

    assigneeBadge.appendChild(userIcon);
    assigneeBadge.appendChild(assigneeName);

    const badgesDiv = document.createElement('div');
    badgesDiv.className = 'card-badges';

    const priorityKey = VALID_PRIORITIES.includes(todo.priority) ? todo.priority : 'medium';
    const priorityBadge = document.createElement('span');
    priorityBadge.className = `priority-badge priority-${priorityKey}`;
    priorityBadge.textContent = PRIORITY_LABELS[priorityKey];

    const badge = document.createElement('span');
    const categoryKey = todo.category === 'life' ? 'life' : 'work';
    badge.className = `category-badge category-${categoryKey}`;
    badge.textContent = CATEGORY_LABELS[categoryKey];

    badgesDiv.appendChild(priorityBadge);
    badgesDiv.appendChild(badge);

    metaDiv.appendChild(assigneeBadge);
    metaDiv.appendChild(badgesDiv);

    li.appendChild(topDiv);
    li.appendChild(metaDiv);

    return li;
  }

  // 渲染三欄看板與統計數據
  function render() {
    const pendingCount = todos.filter((t) => t.status !== 'done').length;
    const doneCount = todos.length - pendingCount;
    const workCount = todos.filter((t) => t.category === 'work').length;
    const lifeCount = todos.filter((t) => t.category === 'life').length;

    pendingCountEl.textContent = String(pendingCount);
    countAllEl.textContent = String(todos.length);
    countWorkEl.textContent = String(workCount);
    countLifeEl.textContent = String(lifeCount);

    clearCompletedBtn.hidden = doneCount === 0;

    // 依分類篩選
    const filteredTodos =
      currentFilter === 'all'
        ? todos
        : todos.filter((t) => t.category === currentFilter);

    // 清空並重新渲染三個欄位（各欄內依優先程度 High > Medium > Low 排序）
    VALID_STATUSES.forEach((status) => {
      const listEl = columnLists[status];
      const countEl = columnCounts[status];
      const columnTodos = filteredTodos
        .filter((t) => t.status === status)
        .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

      listEl.innerHTML = '';
      const fragment = document.createDocumentFragment();
      columnTodos.forEach((todo) => {
        fragment.appendChild(createTodoCard(todo));
      });
      listEl.appendChild(fragment);
      countEl.textContent = String(columnTodos.length);
    });
  }

  // 綁定三個看板欄位的拖放事件
  kanbanColumns.forEach((column) => {
    const targetStatus = column.dataset.status;
    const listEl = column.querySelector('.column-list');

    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      column.classList.add('drag-over');
    });

    column.addEventListener('dragleave', (e) => {
      if (!column.contains(e.relatedTarget)) {
        column.classList.remove('drag-over');
      }
    });

    column.addEventListener('drop', (e) => {
      e.preventDefault();
      column.classList.remove('drag-over');

      const transferId = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
      const id = draggedTodoId || transferId;
      if (!id) return;

      const afterElement = getDragAfterElement(listEl, e.clientY);
      const beforeId = afterElement ? afterElement.dataset.id : null;
      moveTodo(id, targetStatus, beforeId);
    });
  });

  // 表單與按鈕事件綁定
  todoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = todoInput.value.trim();
    const assignee = todoAssignee.value.trim();
    if (!text) {
      todoInput.focus();
      return;
    }
    if (!assignee) {
      todoAssignee.focus();
      return;
    }
    addTodo(text, assignee, todoCategory.value, todoPriority.value);
    todoInput.value = '';
    todoAssignee.value = '';
    todoPriority.value = 'medium';
    todoInput.focus();
  });

  filterTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      setFilter(tab.dataset.filter);
    });
  });

  clearCompletedBtn.addEventListener('click', clearCompleted);

  // 啟動應用
  renderDate();
  render();
})();
