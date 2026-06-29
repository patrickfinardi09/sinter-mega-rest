const resourceList = document.querySelector('#resourceList');
const form = document.querySelector('#resourceForm');
const formTitle = document.querySelector('#formTitle');
const resourceNameInput = document.querySelector('#resourceName');
const tableNameInput = document.querySelector('#tableName');
const defaultSortSelect = document.querySelector('#defaultSort');
const columnInput = document.querySelector('#columnInput');
const columnsBody = document.querySelector('#columnsBody');
const statusMessage = document.querySelector('#statusMessage');
const newResourceButton = document.querySelector('#newResourceButton');
const addColumnButton = document.querySelector('#addColumnButton');
const mapColumnsButton = document.querySelector('#mapColumnsButton');
const deleteButton = document.querySelector('#deleteButton');

const LIMITED_COMPARISON_TYPES = new Set([
  'BFILE',
  'BLOB',
  'CLOB',
  'LONG',
  'LONG RAW',
  'NCLOB',
  'RAW',
  'XMLTYPE',
]);

let resources = {};
let currentName = null;
let draft = createEmptyDraft();

function createEmptyDraft() {
  return {
    name: '',
    table: '',
    defaultSort: '',
    columns: [],
    sortableColumns: [],
    filterableColumns: [],
  };
}

function normalizeResourceName(value) {
  return value.trim().toLowerCase();
}

function normalizeIdentifier(value) {
  return value.trim().toUpperCase();
}

function setStatus(message, type = '') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`.trim();
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Erro HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function loadResources() {
  resources = await requestJson('/admin/api/resources');
  renderResourceList();

  if (currentName && resources[currentName]) {
    selectResource(currentName);
    return;
  }

  const firstResource = Object.keys(resources)[0];
  if (firstResource) {
    selectResource(firstResource);
  } else {
    startNewResource();
  }
}

function renderResourceList() {
  resourceList.innerHTML = '';

  Object.entries(resources).forEach(([name, config]) => {
    const button = document.createElement('button');
    const text = document.createElement('span');
    const title = document.createElement('strong');
    const table = document.createElement('span');
    const count = document.createElement('span');

    button.type = 'button';
    button.className = `resource-item ${name === currentName ? 'active' : ''}`.trim();
    title.textContent = name;
    table.textContent = config.table;
    count.textContent = config.columns.length;

    text.append(title, table);
    button.append(text, count);
    button.addEventListener('click', () => selectResource(name));
    resourceList.appendChild(button);
  });
}

function selectResource(name) {
  const config = resources[name];
  currentName = name;
  draft = {
    name,
    table: config.table,
    defaultSort: config.defaultSort,
    columns: [...config.columns],
    sortableColumns: [...config.sortableColumns],
    filterableColumns: [...config.filterableColumns],
  };
  syncForm();
  setStatus('');
}

function startNewResource() {
  currentName = null;
  draft = createEmptyDraft();
  syncForm();
  setStatus('');
}

function syncDraftFromInputs() {
  draft.name = normalizeResourceName(resourceNameInput.value);
  draft.table = normalizeIdentifier(tableNameInput.value);
  draft.defaultSort = defaultSortSelect.value || draft.columns[0] || '';
}

function syncForm() {
  formTitle.textContent = currentName ? currentName : 'Novo resource';
  resourceNameInput.value = draft.name;
  resourceNameInput.readOnly = Boolean(currentName);
  tableNameInput.value = draft.table;
  deleteButton.hidden = !currentName;
  renderDefaultSortOptions();
  renderColumns();
  renderResourceList();
}

function renderDefaultSortOptions() {
  defaultSortSelect.innerHTML = '';

  draft.sortableColumns.forEach((column) => {
    const option = document.createElement('option');
    option.value = column;
    option.textContent = column;
    defaultSortSelect.appendChild(option);
  });

  if (!draft.sortableColumns.includes(draft.defaultSort)) {
    draft.defaultSort = draft.sortableColumns[0] || draft.columns[0] || '';
  }

  defaultSortSelect.value = draft.defaultSort;
}

function renderColumns() {
  columnsBody.innerHTML = '';

  if (!draft.columns.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhuma coluna adicionada.';
    columnsBody.appendChild(empty);
    return;
  }

  draft.columns.forEach((column) => {
    const row = document.createElement('div');
    const name = document.createElement('span');
    const sortableLabel = document.createElement('label');
    const sortable = document.createElement('input');
    const filterableLabel = document.createElement('label');
    const filterable = document.createElement('input');
    const defaultLabel = document.createElement('label');
    const defaultRadio = document.createElement('input');
    const removeButton = document.createElement('button');

    row.className = 'columns-row';
    name.className = 'column-name';
    name.textContent = column;

    sortableLabel.className = 'check-cell';
    sortableLabel.title = 'Sortable';
    sortable.type = 'checkbox';
    sortable.dataset.kind = 'sortable';
    sortable.dataset.column = column;

    filterableLabel.className = 'check-cell';
    filterableLabel.title = 'Filterable';
    filterable.type = 'checkbox';
    filterable.dataset.kind = 'filterable';
    filterable.dataset.column = column;

    defaultLabel.className = 'check-cell';
    defaultLabel.title = 'Ordenacao padrao';
    defaultRadio.type = 'radio';
    defaultRadio.name = 'defaultColumn';
    defaultRadio.dataset.kind = 'default';
    defaultRadio.dataset.column = column;

    removeButton.className = 'remove-column';
    removeButton.type = 'button';
    removeButton.dataset.kind = 'remove';
    removeButton.dataset.column = column;
    removeButton.title = 'Remover coluna';
    removeButton.setAttribute('aria-label', `Remover ${column}`);
    removeButton.textContent = 'x';

    sortable.checked = draft.sortableColumns.includes(column);
    filterable.checked = draft.filterableColumns.includes(column);
    defaultRadio.checked = draft.defaultSort === column;
    defaultRadio.disabled = !sortable.checked;

    sortableLabel.appendChild(sortable);
    filterableLabel.appendChild(filterable);
    defaultLabel.appendChild(defaultRadio);
    row.append(name, sortableLabel, filterableLabel, defaultLabel, removeButton);
    row.addEventListener('change', handleColumnChange);
    row.addEventListener('click', handleColumnClick);
    columnsBody.appendChild(row);
  });
}

function handleColumnChange(event) {
  const input = event.target;
  const column = input.dataset.column;

  if (input.dataset.kind === 'sortable') {
    toggleColumn(draft.sortableColumns, column, input.checked);

    if (!input.checked && draft.defaultSort === column) {
      draft.defaultSort = draft.sortableColumns[0] || '';
    }
  }

  if (input.dataset.kind === 'filterable') {
    toggleColumn(draft.filterableColumns, column, input.checked);
  }

  if (input.dataset.kind === 'default') {
    if (!draft.sortableColumns.includes(column)) {
      draft.sortableColumns.push(column);
    }

    draft.defaultSort = column;
  }

  renderDefaultSortOptions();
  renderColumns();
}

function handleColumnClick(event) {
  const button = event.target.closest('button[data-kind="remove"]');
  if (!button) {
    return;
  }

  const column = button.dataset.column;
  draft.columns = draft.columns.filter((item) => item !== column);
  draft.sortableColumns = draft.sortableColumns.filter((item) => item !== column);
  draft.filterableColumns = draft.filterableColumns.filter((item) => item !== column);

  if (draft.defaultSort === column) {
    draft.defaultSort = draft.sortableColumns[0] || draft.columns[0] || '';
  }

  renderDefaultSortOptions();
  renderColumns();
}

function toggleColumn(list, column, enabled) {
  const exists = list.includes(column);

  if (enabled && !exists) {
    list.push(column);
  }

  if (!enabled && exists) {
    const index = list.indexOf(column);
    list.splice(index, 1);
  }
}

function addColumn() {
  const column = normalizeIdentifier(columnInput.value);

  if (!column) {
    return;
  }

  if (draft.columns.includes(column)) {
    setStatus('Coluna ja adicionada.', 'error');
    return;
  }

  draft.columns.push(column);
  draft.sortableColumns.push(column);

  if (!draft.defaultSort) {
    draft.defaultSort = column;
  }

  columnInput.value = '';
  renderDefaultSortOptions();
  renderColumns();
  setStatus('');
}

function canUseColumnInSimpleQueries(column) {
  return !LIMITED_COMPARISON_TYPES.has(String(column.dataType || '').toUpperCase());
}

function chooseDefaultSort(columns) {
  const sortableNames = columns.filter(canUseColumnInSimpleQueries).map((column) => column.name);

  if (sortableNames.includes('ID')) {
    return 'ID';
  }

  return sortableNames[0] || columns[0]?.name || '';
}

async function mapColumnsFromOracle({ silent = false } = {}) {
  const table = normalizeIdentifier(tableNameInput.value);
  tableNameInput.value = table;

  if (!table) {
    if (!silent) {
      setStatus('Informe a tabela Oracle antes de mapear.', 'error');
    }
    return;
  }

  if (!silent) {
    setStatus('Mapeando colunas no Oracle...');
  }

  try {
    const result = await requestJson(`/admin/api/tables/${encodeURIComponent(table)}/columns`);
    const columns = result.columns || [];
    const columnNames = columns.map((column) => column.name);
    const queryableColumns = columns.filter(canUseColumnInSimpleQueries).map((column) => column.name);

    draft.table = result.table;
    draft.columns = columnNames;
    draft.sortableColumns = queryableColumns;
    draft.filterableColumns = queryableColumns;
    draft.defaultSort = chooseDefaultSort(columns);

    syncForm();
    setStatus(`${columnNames.length} colunas mapeadas de ${result.table}.`, 'success');
  } catch (error) {
    if (!silent) {
      setStatus(error.message, 'error');
    }
  }
}

async function saveCurrentResource(event) {
  event.preventDefault();
  syncDraftFromInputs();

  try {
    const saved = await requestJson('/admin/api/resources', {
      method: 'POST',
      body: JSON.stringify(draft),
    });

    currentName = saved.name;
    await loadResources();
    setStatus('Resource salvo.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function deleteCurrentResource() {
  if (!currentName) {
    return;
  }

  try {
    await requestJson(`/admin/api/resources/${encodeURIComponent(currentName)}`, {
      method: 'DELETE',
    });
    currentName = null;
    await loadResources();
    setStatus('Resource excluido.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

newResourceButton.addEventListener('click', startNewResource);
addColumnButton.addEventListener('click', addColumn);
mapColumnsButton.addEventListener('click', () => mapColumnsFromOracle());
columnInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addColumn();
  }
});
form.addEventListener('submit', saveCurrentResource);
deleteButton.addEventListener('click', deleteCurrentResource);
tableNameInput.addEventListener('input', () => {
  tableNameInput.value = normalizeIdentifier(tableNameInput.value);
});
tableNameInput.addEventListener('blur', () => {
  if (!currentName && !draft.columns.length && tableNameInput.value.trim()) {
    mapColumnsFromOracle({ silent: true });
  }
});
resourceNameInput.addEventListener('input', () => {
  resourceNameInput.value = normalizeResourceName(resourceNameInput.value);
});
defaultSortSelect.addEventListener('change', () => {
  draft.defaultSort = defaultSortSelect.value;
});

loadResources().catch((error) => {
  setStatus(error.message, 'error');
});
