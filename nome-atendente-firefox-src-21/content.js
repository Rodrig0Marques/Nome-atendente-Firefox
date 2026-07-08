(() => {
  'use strict';

  let ATTENDANT_NAME = 'Rodrigo Marques';
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

  const INSTANCE_ATTR = 'data-cdc-attendant-v31-active';
  const INTERNAL_SEND_ATTR = 'data-cdc-attendant-v31-internal-send';

  if (document.documentElement.getAttribute(INSTANCE_ATTR) === 'true') {
    return;
  }

  document.documentElement.setAttribute(INSTANCE_ATTR, 'true');

  loadAttendantName();
  listenAttendantNameChanges();

  let processing = false;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function log(step, data = {}) {
    console.log('[Nome Atendente v31]', step, data);
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

  function dialogLooksLikeCaption(dialog) {
    if (!dialog) return false;

    const dialogText = normalize(dialog.innerText || '').toLowerCase();

    if (
      dialogText.includes('adicionar legenda') ||
      dialogText.includes('adicione uma legenda') ||
      dialogText.includes('add a caption') ||
      dialogText.includes('legenda') ||
      dialogText.includes('caption')
    ) {
      return true;
    }

    const fields = Array.from(dialog.querySelectorAll?.('div[contenteditable="true"]') || [])
      .filter(isVisible);

    return fields.some(field => {
      const meta = normalize([
        field.getAttribute('aria-label') || '',
        field.getAttribute('aria-placeholder') || '',
        field.getAttribute('placeholder') || '',
        field.getAttribute('title') || ''
      ].join(' ')).toLowerCase();

      return meta.includes('legenda') ||
        meta.includes('caption') ||
        meta.includes('adicione uma legenda') ||
        meta.includes('add a caption');
    });
  }

  function shouldIgnoreDialogClick(button) {
    const dialog = button.closest?.('[role="dialog"]');
    if (!dialog) return false;

    return !dialogLooksLikeCaption(dialog);
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

    if (isInsideForwardPopup(composerFromEvent) || isForwardDialog(composerFromEvent)) {
      log('prepare_forward_popup:skip_intercept');
      return;
    }

    const composer = composerFromEvent || getActiveComposer();

    if (!composer) {
      log('prepare:no_composer');
      return;
    }

    if (isInsideForwardPopup(composer) || isForwardDialog(composer)) {
      log('prepare_forward_composer:skip_intercept');
      return;
    }

    const originalText = getText(composer);
    const message = getUserMessage(originalText);

    if (!message) {
      log('prepare:no_text_skip');
      return;
    }

    processing = true;

    log('prepare:start', {
      originalText,
      message,
      html: getHtml(composer)
    });

    try {
      const ok = await writeWithMarkdownBold(composer, message, false);

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

  function composerFromButtonStrict(button) {
    const root = button.closest('[role="dialog"]') ||
      button.closest('footer') ||
      button.closest('main') ||
      document;

    const fields = Array.from(root.querySelectorAll?.('div[contenteditable="true"]') || [])
      .filter(isVisible)
      .filter(looksLikeMessageField);

    if (fields.length) return fields[fields.length - 1];

    return null;
  }

  function isForwardingWithoutComposer(button) {
    const root = button.closest('[role="dialog"]');
    if (!root) return false;

    const fields = Array.from(root.querySelectorAll?.('div[contenteditable="true"]') || [])
      .filter(isVisible)
      .filter(looksLikeMessageField);

    if (fields.length) return false;

    const rootText = normalize(root.innerText || '').toLowerCase();

    return rootText.includes('encaminhar') ||
      rootText.includes('encaminhada') ||
      rootText.includes('forward') ||
      rootText.includes('forwarded');
  }

  function hasForwardPopupText(text) {
    const value = normalize(text || '').toLowerCase();

    return value.includes('encaminhar mensagem para') ||
      value.includes('encaminhar para') ||
      value.includes('1 selecionada') ||
      value.includes('selecionada') ||
      value.includes('selecionadas') ||
      value.includes('conversas recentes') ||
      value.includes('pesquisar nome ou numero') ||
      value.includes('pesquisar nome ou número') ||
      value.includes('forward message to') ||
      value.includes('forward to') ||
      value.includes('selected');
  }

  function isForwardDialog(buttonOrElement) {
    const root =
      buttonOrElement?.closest?.('[role="dialog"]') ||
      buttonOrElement?.closest?.('[data-animate-modal-popup="true"]');

    if (!root) return false;

    const text = root.innerText || '';
    const aria = [
      root.getAttribute?.('aria-label') || '',
      buttonOrElement?.getAttribute?.('aria-label') || '',
      buttonOrElement?.getAttribute?.('title') || ''
    ].join(' ');

    return hasForwardPopupText(`${text} ${aria}`);
  }

  function isInsideForwardPopup(element) {
    let node = element;

    for (let i = 0; node && i < 16; i += 1) {
      if (hasForwardPopupText(node.innerText || '')) {
        return true;
      }

      node = node.parentElement;
    }

    return false;
  }

  function getForwardPopupRoot() {
    const candidates = Array.from(document.querySelectorAll('[role="dialog"], [data-animate-modal-popup="true"], div'))
      .filter(isVisible);

    return candidates.find(el => hasForwardPopupText(el.innerText || '')) || null;
  }

  function isClickInForwardArea(clicked) {
    const root = getForwardPopupRoot();
    if (!root || !clicked) return false;

    if (root.contains(clicked)) return true;

    const rootRect = root.getBoundingClientRect();
    const clickedRect = clicked.getBoundingClientRect();

    const cx = clickedRect.left + clickedRect.width / 2;
    const cy = clickedRect.top + clickedRect.height / 2;

    return cx >= rootRect.left &&
      cx <= rootRect.right &&
      cy >= rootRect.top &&
      cy <= rootRect.bottom;
  }

  document.addEventListener('keydown', event => {
    if (isInternalSend()) return;

    if (event.key !== 'Enter') return;
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;

    if (isInsideForwardPopup(event.target) || isForwardDialog(event.target)) {
      log('keydown_forward_popup:skip_intercept');
      return;
    }

    const dialog = event.target.closest?.('[role="dialog"]');
    if (dialog && !dialogLooksLikeCaption(dialog)) {
      log('keydown_dialog_not_caption:skip_intercept');
      return;
    }

    if (!isComposerTarget(event.target)) return;

    const composer = getActiveComposer();
    const text = getText(composer);

    if (!text) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    prepareAndSend(composer);
  }, true);

  document.addEventListener('click', event => {
    if (isInternalSend()) return;

    const clicked = event.target.closest('button,[role="button"],div[tabindex],span[tabindex]');
    if (!clicked) return;
    if (!isSendControl(clicked)) return;

    if (isClickInForwardArea(clicked) || isInsideForwardPopup(clicked) || isForwardDialog(clicked) || isForwardingWithoutComposer(clicked)) {
      log('forward_popup:skip_intercept');
      return;
    }

    // Não atuar em outros popups/modais do WhatsApp, exceto no modal de arquivo com legenda.
    // Importante: isso não deve afetar o envio normal de imagem/arquivo com legenda.
    if (shouldIgnoreDialogClick(clicked)) {
      log('dialog_not_caption:skip_intercept');
      return;
    }

    const dialog = clicked.closest?.('[role="dialog"]');
    const composerStrict = composerFromButtonStrict(clicked);

    if (dialog && !composerStrict) {
      log('dialog_without_caption_composer:skip_intercept');
      return;
    }

    const composer = composerStrict || composerFromButton(clicked);
    const text = getText(composer);

    // Segurança principal:
    // nunca interceptar envio sem texto já digitado.
    // Isso evita que encaminhamentos ou modais vazios sejam substituídos somente pelo nome do atendente.
    if (!text) {
      log('empty_text:skip_intercept');
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    prepareAndSend(composer);
  }, true);
})();
