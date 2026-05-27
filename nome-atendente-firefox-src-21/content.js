(() => {
  'use strict';

  let ATTENDANT_NAME = 'Inserir nome';
  let ATTENDANT_MARKDOWN = `*${ATTENDANT_NAME}*`;

  function updateAttendantName(name) {
    const cleanName = String(name || '').trim();

    if (!cleanName) return;

    ATTENDANT_NAME = cleanName;
    ATTENDANT_MARKDOWN = `*${ATTENDANT_NAME}*`;

    log('config:name_updated', { ATTENDANT_NAME });
  }

  async function loadAttendantName() {
    try {
      if (typeof browser !== 'undefined' && browser.storage?.local) {
        const result = await browser.storage.local.get('attendantName');
        updateAttendantName(result.attendantName || ATTENDANT_NAME);
        return;
      }

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(['attendantName'], result => {
          updateAttendantName(result.attendantName || ATTENDANT_NAME);
        });
      }
    } catch (error) {
      log('config:load_error', { error: String(error) });
    }
  }

  function listenAttendantNameChanges() {
    try {
      if (typeof browser !== 'undefined' && browser.storage?.onChanged) {
        browser.storage.onChanged.addListener((changes, areaName) => {
          if (areaName === 'local' && changes.attendantName) {
            updateAttendantName(changes.attendantName.newValue);
          }
        });
      } else if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName === 'local' && changes.attendantName) {
            updateAttendantName(changes.attendantName.newValue);
          }
        });
      }
    } catch (error) {
      log('config:listen_error', { error: String(error) });
    }
  }

  const INSTANCE_ATTR = 'data-cdc-attendant-v21-active';
  const INTERNAL_SEND_ATTR = 'data-cdc-attendant-v21-internal-send';

  if (document.documentElement.getAttribute(INSTANCE_ATTR) === 'true') {
    return;
  }

  document.documentElement.setAttribute(INSTANCE_ATTR, 'true');

  loadAttendantName();
  listenAttendantNameChanges();

  let processing = false;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function log(step, data = {}) {
    console.log('[Nome Atendente v21]', step, data);
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalize(text) {
    return (text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r/g, '')
      .trim();
  }

  function isVisible(el) {
    if (!el) return false;

    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);

    return rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden';
  }

  function getText(composer) {
    if (!composer) return '';
    return normalize(composer.innerText || composer.textContent || '');
  }

  function getHtml(composer) {
    if (!composer) return '';
    return composer.innerHTML || '';
  }

  function countName(text) {
    const name = escapeRegExp(ATTENDANT_NAME);
    return (normalize(text).match(new RegExp(name, 'gi')) || []).length;
  }

  function stripAllNames(text) {
    const name = escapeRegExp(ATTENDANT_NAME);

    return normalize(text)
      .replace(new RegExp(`\\*?${name}\\*?`, 'gi'), '')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\*+|\*+$/g, '')
      .trim();
  }

  function dedupeRepeatedBody(body) {
    body = normalize(body);

    const lines = body.split(/\n+/).map(x => x.trim()).filter(Boolean);

    if (lines.length >= 2 && lines.length % 2 === 0) {
      const half = lines.length / 2;
      const first = lines.slice(0, half).join('\n');
      const second = lines.slice(half).join('\n');

      if (first === second) return first;
    }

    return body;
  }

  function getUserMessage(originalText) {
    return dedupeRepeatedBody(stripAllNames(originalText));
  }

  function looksLikeMessageField(field) {
    const role = (field.getAttribute('role') || '').toLowerCase();
    const aria = (field.getAttribute('aria-label') || '').toLowerCase();
    const placeholder = (field.getAttribute('aria-placeholder') || '').toLowerCase();
    const dataLexical = field.getAttribute('data-lexical-editor');

    return role === 'textbox' ||
      dataLexical === 'true' ||
      aria.includes('mensagem') ||
      aria.includes('message') ||
      aria.includes('legenda') ||
      aria.includes('caption') ||
      placeholder.includes('mensagem') ||
      placeholder.includes('message') ||
      placeholder.includes('legenda') ||
      placeholder.includes('caption') ||
      placeholder.includes('adicione uma legenda') ||
      placeholder.includes('add a caption');
  }

  function getFooterComposer() {
    const footer = document.querySelector('footer');
    if (!footer) return null;

    const fields = Array.from(footer.querySelectorAll('div[contenteditable="true"]'))
      .filter(isVisible);

    if (!fields.length) return null;

    return fields.find(looksLikeMessageField) || fields[fields.length - 1];
  }

  function getActiveComposer() {
    const active = document.activeElement;

    if (active) {
      const activeComposer = active.closest?.('div[contenteditable="true"]');
      if (activeComposer && isVisible(activeComposer)) {
        return activeComposer;
      }
    }

    const visibleFields = Array.from(document.querySelectorAll('div[contenteditable="true"]'))
      .filter(isVisible)
      .filter(looksLikeMessageField);

    if (visibleFields.length) {
      const nonFooter = visibleFields.find(field => !field.closest('footer'));
      if (nonFooter) return nonFooter;

      return visibleFields[visibleFields.length - 1];
    }

    return getFooterComposer();
  }

  function getContextRoot(composer) {
    if (!composer) return document;

    return composer.closest('[role="dialog"]') ||
      composer.closest('footer') ||
      composer.closest('main') ||
      document;
  }

  function clickableAncestor(el) {
    if (!el) return null;

    return el.closest?.(
      'button,[role="button"],div[tabindex],span[tabindex],button[type="button"]'
    ) || null;
  }

  function elementLooksLikeSend(el) {
    if (!el) return false;

    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const title = (el.getAttribute('title') || '').toLowerCase();
    const dataIcon = (el.getAttribute('data-icon') || '').toLowerCase();

    return dataIcon === 'send' ||
      aria.includes('enviar') ||
      aria.includes('send') ||
      title.includes('enviar') ||
      title.includes('send') ||
      !!el.querySelector?.('[data-icon="send"]');
  }

  function findSendInRoot(root) {
    if (!root || !root.querySelectorAll) return null;

    const icon = root.querySelector('[data-icon="send"]');
    if (icon && isVisible(icon)) {
      const clickable = clickableAncestor(icon);
      if (clickable && isVisible(clickable)) return clickable;
    }

    const candidates = Array.from(root.querySelectorAll(
      'button,[role="button"],div[tabindex],span[tabindex]'
    )).filter(isVisible);

    return candidates.find(elementLooksLikeSend) || null;
  }

  function getSendButton(composer = getActiveComposer()) {
    const roots = [];

    const contextRoot = getContextRoot(composer);
    if (contextRoot) roots.push(contextRoot);

    const footer = document.querySelector('footer');
    if (footer && !roots.includes(footer)) roots.push(footer);

    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(isVisible);
    for (const dialog of dialogs) {
      if (!roots.includes(dialog)) roots.push(dialog);
    }

    roots.push(document);

    for (const root of roots) {
      const found = findSendInRoot(root);
      if (found) return found;
    }

    return null;
  }

  function isSendControl(el) {
    if (!el) return false;

    if (elementLooksLikeSend(el)) return true;

    const icon = el.querySelector?.('[data-icon="send"]');
    return !!icon;
  }

  function isFileModalOpen() {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(isVisible);
    if (dialogs.length) return true;

    const previewText = document.body.innerText || '';

    return previewText.includes('Adicionar legenda') ||
      previewText.includes('Adicione uma legenda') ||
      previewText.includes('Add a caption');
  }

  function focusAndSelectAll(composer) {
    composer.focus();

    const range = document.createRange();
    range.selectNodeContents(composer);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  async function clearComposer(composer) {
    log('clear:start', { text: getText(composer), html: getHtml(composer) });

    for (let attempt = 1; attempt <= 6; attempt++) {
      focusAndSelectAll(composer);

      document.execCommand('delete', false, null);

      await sleep(160);

      if (!getText(composer)) {
        log('clear:ok', { attempt, html: getHtml(composer) });
        return true;
      }

      while (composer.firstChild) {
        composer.removeChild(composer.firstChild);
      }

      const p = document.createElement('p');
      p.setAttribute('dir', 'ltr');
      p.appendChild(document.createElement('br'));
      composer.appendChild(p);

      composer.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

      await sleep(160);

      if (!getText(composer)) {
        log('clear:ok_dom', { attempt, html: getHtml(composer) });
        return true;
      }
    }

    log('clear:fail', { text: getText(composer), html: getHtml(composer) });
    return false;
  }

  function execInsertTextOnly(composer, text) {
    composer.focus();

    // Importante: não disparar InputEvent com data depois disso.
    return document.execCommand('insertText', false, text);
  }

  async function writeWithMarkdownBold(composer, message, allowOnlyName) {
    const cleared = await clearComposer(composer);
    if (!cleared) return false;

    composer.focus();

    const before = getText(composer);

    const finalText = message
      ? `${ATTENDANT_MARKDOWN}\n${message}`
      : ATTENDANT_MARKDOWN;

    execInsertTextOnly(composer, finalText);

    await sleep(500);

    const current = getText(composer);
    const html = getHtml(composer);
    const names = countName(current);
    const body = stripAllNames(current);

    log('write:after', {
      before,
      current,
      names,
      body,
      html,
      allowOnlyName
    });

    if (names !== 1) return false;

    if (!allowOnlyName && body !== message) return false;

    if (allowOnlyName && body && body !== message) return false;

    return true;
  }

  function isInternalSend() {
    return document.documentElement.getAttribute(INTERNAL_SEND_ATTR) === 'true';
  }

  async function realSend(composer) {
    const button = getSendButton(composer);

    if (!button) {
      log('send:button_not_found', {
        footerHtml: document.querySelector('footer')?.innerHTML?.slice(0, 1000) || '',
        contextHtml: getContextRoot(composer)?.innerHTML?.slice(0, 1000) || ''
      });
      return false;
    }

    log('send:button_found', {
      tag: button.tagName,
      role: button.getAttribute('role'),
      aria: button.getAttribute('aria-label'),
      title: button.getAttribute('title'),
      html: button.outerHTML.slice(0, 500)
    });

    document.documentElement.setAttribute(INTERNAL_SEND_ATTR, 'true');

    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    button.click();

    await sleep(700);

    document.documentElement.removeAttribute(INTERNAL_SEND_ATTR);

    return true;
  }

  async function prepareAndSend(composerFromEvent = null) {
    if (processing) return;

    const composer = composerFromEvent || getActiveComposer();
    const fileModal = isFileModalOpen();

    if (!composer) {
      log('prepare:no_composer', { fileModal });
      return;
    }

    const originalText = getText(composer);
    const message = getUserMessage(originalText);

    if (!message && !fileModal) {
      log('prepare:no_text_normal_message');
      return;
    }

    processing = true;

    log('prepare:start', {
      originalText,
      message,
      fileModal,
      html: getHtml(composer)
    });

    try {
      const ok = await writeWithMarkdownBold(composer, message, fileModal);

      if (!ok) {
        log('prepare:cancel_after_write', {
          text: getText(composer),
          html: getHtml(composer)
        });
        return;
      }

      await sleep(150);

      await realSend(composer);
    } finally {
      setTimeout(() => {
        processing = false;
      }, 900);
    }
  }

  function isComposerTarget(target) {
    const composer = getActiveComposer();
    if (!composer) return false;

    return target === composer ||
      composer.contains(target) ||
      document.activeElement === composer ||
      composer.contains(document.activeElement);
  }

  function composerFromButton(button) {
    const root = button.closest('[role="dialog"]') ||
      button.closest('footer') ||
      button.closest('main') ||
      document;

    const fields = Array.from(root.querySelectorAll?.('div[contenteditable="true"]') || [])
      .filter(isVisible)
      .filter(looksLikeMessageField);

    if (fields.length) return fields[fields.length - 1];

    return getActiveComposer();
  }

  document.addEventListener('keydown', event => {
    if (isInternalSend()) return;

    if (event.key !== 'Enter') return;
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    if (!isComposerTarget(event.target)) return;

    const composer = getActiveComposer();
    const text = getText(composer);
    const fileModal = isFileModalOpen();

    if (!text && !fileModal) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    prepareAndSend(composer);
  }, true);

  document.addEventListener('click', event => {
    if (isInternalSend()) return;

    const clicked = event.target.closest('button,[role="button"],div[tabindex],span[tabindex]');
    if (!clicked) return;
    if (!isSendControl(clicked)) return;

    const composer = composerFromButton(clicked);
    const text = getText(composer);
    const fileModal = isFileModalOpen();

    if (!text && !fileModal) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    prepareAndSend(composer);
  }, true);
})();
