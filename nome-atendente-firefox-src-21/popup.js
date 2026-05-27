const DEFAULT_NAME = 'Inserir nome';

const input = document.getElementById('attendantName');
const saveButton = document.getElementById('saveButton');
const statusEl = document.getElementById('status');
const previewName = document.getElementById('previewName');

function setStatus(message) {
  statusEl.textContent = message;

  if (message) {
    setTimeout(() => {
      statusEl.textContent = '';
    }, 1800);
  }
}

function updatePreview() {
  const name = input.value.trim() || DEFAULT_NAME;
  previewName.textContent = name;
}

async function loadName() {
  try {
    const result = await browser.storage.local.get('attendantName');
    const name = result.attendantName || DEFAULT_NAME;

    input.value = name;
    updatePreview();
  } catch (error) {
    input.value = DEFAULT_NAME;
    updatePreview();
    setStatus('Não foi possível carregar.');
  }
}

async function saveName() {
  const name = input.value.trim();

  if (!name) {
    setStatus('Digite um nome.');
    input.focus();
    return;
  }

  await browser.storage.local.set({ attendantName: name });
  updatePreview();
  setStatus('Nome salvo!');
}

input.addEventListener('input', updatePreview);
input.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    saveName();
  }
});

saveButton.addEventListener('click', saveName);

loadName();
