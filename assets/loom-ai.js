// SSE contract: data: {"response":"..."} token frames, optional metadata, then data: [DONE].
(() => {
  const themeStorageKey = 'loom7-chat-theme';
  const historyStorageKey = 'loom7-chat-history-v1';
  const maxSavedChats = 20;
  const maxSavedMessages = 80;
  let savedChats = [];
  let historyLoadError = '';
  try {
    const storedChats = JSON.parse(window.localStorage.getItem(historyStorageKey) || '[]');
    if (!Array.isArray(storedChats)) throw new Error('Saved chat history is not a list.');
    savedChats = storedChats.filter(chat => chat && typeof chat.id === 'string'
      && typeof chat.title === 'string' && Number.isFinite(chat.updatedAt)
      && Array.isArray(chat.messages))
      .map(chat => ({
        id: chat.id,
        title: chat.title.slice(0, 80),
        updatedAt: chat.updatedAt,
        archived: Boolean(chat.archived),
        messages: chat.messages.filter(message => message
          && ['user', 'assistant'].includes(message.role)
          && typeof message.content === 'string')
          .slice(-maxSavedMessages)
          .map(message => ({role: message.role, content: message.content.slice(0, 2000)})),
      }))
      .slice(0, maxSavedChats);
    savedChats.forEach(chat => { chat.archived = true; });
  } catch (error) {
    historyLoadError = 'Saved chat history could not be loaded on this device.';
    console.error(historyLoadError, error);
  }
  const widget = document.createElement('div');
  widget.className = 'loom-ai-widget';
  widget.innerHTML = `
    <button class="loom-ai-launcher" type="button" aria-controls="loom-ai-panel" aria-expanded="false">
      <span class="loom-ai-launcher-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40">
          <defs><linearGradient id="loom-ai-sparkle-gradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6158ef"/><stop offset=".55" stop-color="#a449ed"/><stop offset="1" stop-color="#38c7e8"/></linearGradient></defs>
          <path d="m21 4 4.2 10.8L36 19l-10.8 4.2L21 34l-4.2-10.8L6 19l10.8-4.2L21 4Z"/>
          <path d="M8 4v7M4.5 7.5h7M33 27v8M29 31h8"/>
        </svg>
      </span>
      <span class="loom-ai-launcher-label">Chat with LOOM Ai</span>
    </button>
    <section class="loom-ai-panel" id="loom-ai-panel" role="dialog" aria-label="Chat with LOOM Ai" hidden>
      <header class="loom-ai-header">
        <button class="loom-ai-icon-button loom-ai-history-toggle" type="button" data-loom-ai-history-toggle aria-label="Open chat history" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
        <div class="loom-ai-brand">
          <span class="loom-ai-brand-mark"><img src="LOOM7_logo_transparent.png" alt="LOOM7"></span>
          <span>
            <span class="loom-ai-brand-name">LOOM Ai</span>
            <span class="loom-ai-brand-caption">Your Loom7 style companion</span>
          </span>
        </div>
        <button class="loom-ai-icon-button" type="button" data-loom-ai-theme-toggle aria-label="Switch to dark theme" aria-pressed="false">
          <span data-loom-ai-theme-icon aria-hidden="true">☾</span>
        </button>
        <button class="loom-ai-icon-button" type="button" data-loom-ai-close aria-label="Close LOOM Ai chat">×</button>
      </header>
      <div class="loom-ai-content">
        <section class="loom-ai-history" data-loom-ai-history hidden aria-label="Chat history">
          <div class="loom-ai-history-heading">
            <h2>Chat history</h2>
            <button class="loom-ai-history-new" type="button" data-loom-ai-new-chat>New chat</button>
          </div>
          <div class="loom-ai-history-list" data-loom-ai-history-list></div>
          <p class="loom-ai-history-empty" data-loom-ai-history-empty>No saved conversations yet.</p>
        </section>
        <h2 class="loom-ai-greeting">Hey there, how can I help?</h2>
        <p class="loom-ai-intro">Find a piece you’ll love, get inspired, or ask us how to order.</p>
        <div class="loom-ai-messages" role="log" aria-live="polite" aria-label="Chat messages"></div>
        <div class="loom-ai-prompts" aria-label="Suggested questions">
          <button class="loom-ai-prompt" type="button" data-loom-ai-prompt="Help me find a look">
            <span class="loom-ai-prompt-icon" aria-hidden="true">✦</span>
            <span><strong>Help me find a look</strong><small>Let’s find something that feels like you</small></span>
          </button>
          <button class="loom-ai-prompt" type="button" data-loom-ai-prompt="Show me the Roots collection">
            <span class="loom-ai-prompt-icon" aria-hidden="true">◇</span>
            <span><strong>Explore The Roots</strong><small>Take a look through our latest collection</small></span>
          </button>
          <button class="loom-ai-prompt" type="button" data-loom-ai-prompt="How do I place an order?">
            <span class="loom-ai-prompt-icon" aria-hidden="true">↗</span>
            <span><strong>How do I order?</strong><small>We’ll help you find the next step</small></span>
          </button>
        </div>
      </div>
      <div class="loom-ai-compose">
        <p class="loom-ai-status">Replies are powered by Cloudflare AI. Please don’t share payment or personal details. <a class="loom-ai-handoff" href="https://ig.me/m/loom7.co" target="_blank" rel="noopener">Instagram help</a></p>
        <form class="loom-ai-form">
          <textarea class="loom-ai-input" name="message" rows="2" maxlength="500" placeholder="Ask LOOM Ai anything…" aria-label="Your message to LOOM Ai" required></textarea>
          <button class="loom-ai-send" type="submit" aria-label="Send message">↑</button>
        </form>
        <p class="loom-ai-feedback" role="status" aria-live="polite" hidden></p>
      </div>
    </section>
  `;
  document.body.append(widget);

  const launcher = widget.querySelector('.loom-ai-launcher');
  const panel = widget.querySelector('.loom-ai-panel');
  const closeButton = widget.querySelector('[data-loom-ai-close]');
  const themeButton = widget.querySelector('[data-loom-ai-theme-toggle]');
  const themeIcon = widget.querySelector('[data-loom-ai-theme-icon]');
  const input = widget.querySelector('.loom-ai-input');
  const form = widget.querySelector('.loom-ai-form');
  const sendButton = widget.querySelector('.loom-ai-send');
  const feedback = widget.querySelector('.loom-ai-feedback');
  const messagesElement = widget.querySelector('.loom-ai-messages');
  const prompts = widget.querySelector('.loom-ai-prompts');
  const historyToggle = widget.querySelector('[data-loom-ai-history-toggle]');
  const historyPanel = widget.querySelector('[data-loom-ai-history]');
  const historyList = widget.querySelector('[data-loom-ai-history-list]');
  const historyEmpty = widget.querySelector('[data-loom-ai-history-empty]');
  let conversation = [];
  let activeChatId = null;

  function createChatId() {
    return window.crypto?.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function saveCurrentChat(archived) {
    if (!conversation.length) return;
    const firstUserMessage = conversation.find(message => message.role === 'user')?.content || 'New conversation';
    const existingIndex = savedChats.findIndex(chat => chat.id === activeChatId);
    const record = {
      id: activeChatId || createChatId(),
      title: firstUserMessage.replace(/\s+/g, ' ').slice(0, 80),
      updatedAt: Date.now(),
      archived,
      messages: conversation.slice(-maxSavedMessages),
    };
    activeChatId = record.id;
    if (existingIndex >= 0) savedChats[existingIndex] = record;
    else savedChats.unshift(record);
    savedChats.sort((a, b) => b.updatedAt - a.updatedAt);
    savedChats = savedChats.slice(0, maxSavedChats);
    try {
      window.localStorage.setItem(historyStorageKey, JSON.stringify(savedChats));
      historyLoadError = '';
    } catch (error) {
      historyLoadError = 'Chat history could not be saved on this device.';
      console.error(historyLoadError, error);
      feedback.hidden = false;
      feedback.textContent = historyLoadError;
    }
  }

  function closeHistory() {
    historyPanel.hidden = true;
    historyToggle.setAttribute('aria-expanded', 'false');
    historyToggle.setAttribute('aria-label', 'Open chat history');
    widget.querySelector('.loom-ai-greeting').hidden = false;
    widget.querySelector('.loom-ai-intro').hidden = false;
    messagesElement.hidden = false;
    prompts.hidden = conversation.length > 0;
  }

  function renderHistory() {
    historyList.replaceChildren();
    const chats = savedChats.filter(chat => chat.archived);
    historyEmpty.hidden = chats.length > 0;
    chats.forEach(chat => {
      const button = document.createElement('button');
      button.className = 'loom-ai-history-item';
      button.type = 'button';
      const title = document.createElement('strong');
      title.textContent = chat.title;
      const date = document.createElement('time');
      date.dateTime = new Date(chat.updatedAt).toISOString();
      date.textContent = new Date(chat.updatedAt).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      });
      button.append(title, date);
      button.addEventListener('click', () => {
        saveCurrentChat(true);
        conversation = chat.messages.map(message => ({...message}));
        activeChatId = chat.id;
        chat.archived = false;
        messagesElement.replaceChildren();
        conversation.forEach(message => appendMessage(message.role, message.content));
        saveCurrentChat(false);
        closeHistory();
        feedback.hidden = true;
      });
      historyList.append(button);
    });
  }

  function showHistory() {
    historyPanel.hidden = false;
    historyToggle.setAttribute('aria-expanded', 'true');
    historyToggle.setAttribute('aria-label', 'Close chat history');
    widget.querySelector('.loom-ai-greeting').hidden = true;
    widget.querySelector('.loom-ai-intro').hidden = true;
    messagesElement.hidden = true;
    prompts.hidden = true;
    renderHistory();
    if (historyLoadError) {
      historyEmpty.hidden = false;
      historyEmpty.textContent = historyLoadError;
    }
  }

  function startNewChat() {
    saveCurrentChat(true);
    conversation = [];
    activeChatId = null;
    messagesElement.replaceChildren();
    closeHistory();
    prompts.hidden = false;
    feedback.hidden = true;
  }

  function appendMessage(role, content, isError = false) {
    const message = document.createElement('p');
    message.className = `loom-ai-message loom-ai-message-${role}`;
    if (isError) message.classList.add('is-error');
    message.textContent = content;
    messagesElement.append(message);
    widget.querySelector('.loom-ai-content').scrollTop = messagesElement.scrollHeight;
    return message;
  }

  async function copyOrderMessage(message) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = message;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.append(textArea);
        let copied = false;
        try {
          textArea.select();
          copied = document.execCommand('copy');
        } finally {
          textArea.remove();
        }
        if (!copied) throw new Error('Copy was blocked by your browser.');
      }
      feedback.hidden = false;
      feedback.textContent = 'Order message copied. Paste it into Instagram to send your enquiry.';
    } catch (error) {
      console.error('Could not copy the LOOM Ai order message.', error);
      feedback.hidden = false;
      feedback.textContent = 'Could not copy automatically. Select and copy the order message above, then paste it into Instagram.';
    }
  }

  function appendOrderCard(order) {
    if (!order || typeof order.message !== 'string') return;
    const card = document.createElement('section');
    card.className = 'loom-ai-order';
    const heading = document.createElement('strong');
    heading.className = 'loom-ai-order-heading';
    heading.textContent = `Order enquiry · ${order.product} · Size ${order.size}`;
    const draft = document.createElement('p');
    draft.className = 'loom-ai-order-draft';
    draft.textContent = order.message;
    const actions = document.createElement('div');
    actions.className = 'loom-ai-order-actions';
    const instagramLink = document.createElement('a');
    instagramLink.className = 'loom-ai-order-instagram';
    instagramLink.href = 'https://ig.me/m/loom7.co';
    instagramLink.target = '_blank';
    instagramLink.rel = 'noopener noreferrer';
    instagramLink.textContent = 'Continue to Instagram';
    instagramLink.addEventListener('click', () => {
      void copyOrderMessage(order.message);
    });
    actions.append(instagramLink);
    card.append(heading, draft, actions);
    messagesElement.append(card);
    widget.querySelector('.loom-ai-content').scrollTop = messagesElement.scrollHeight;
  }

  function appendSizeSelector(selection) {
    if (!selection || !Array.isArray(selection.sizes) || !selection.sizes.length) return;
    const card = document.createElement('form');
    card.className = 'loom-ai-size-selector';
    const label = document.createElement('label');
    label.className = 'loom-ai-size-label';
    label.textContent = `Choose a size for ${selection.product}`;
    const select = document.createElement('select');
    select.className = 'loom-ai-size-select';
    select.setAttribute('aria-label', `Select size for ${selection.product}`);
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a size';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.append(placeholder);
    selection.sizes.forEach(size => {
      const option = document.createElement('option');
      option.value = size;
      option.textContent = size;
      select.append(option);
    });
    const button = document.createElement('button');
    button.className = 'loom-ai-size-continue';
    button.type = 'submit';
    button.textContent = 'Choose size';
    button.disabled = true;
    select.addEventListener('change', () => {
      button.disabled = !select.value;
    });
    card.addEventListener('submit', event => {
      event.preventDefault();
      if (!select.value || button.disabled) return;
      card.remove();
      sendMessage(`I want to order ${selection.product} in size ${select.value}.`);
    });
    card.append(label, select, button);
    messagesElement.append(card);
    widget.querySelector('.loom-ai-content').scrollTop = messagesElement.scrollHeight;
  }

  async function sendMessage(content) {
    const text = content.trim();
    if (!text || sendButton.disabled) return;

    prompts.hidden = true;
    appendMessage('user', text);
    input.value = '';
    input.disabled = true;
    sendButton.disabled = true;
    feedback.hidden = false;
    feedback.textContent = 'LOOM Ai is thinking…';

    const userMessage = {role: 'user', content: text};
    const requestMessages = [...conversation.slice(-8), userMessage];
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({messages: requestMessages}),
        signal: controller.signal,
      });
      if (!response.ok) {
        let result;
        try {
          result = await response.json();
        } catch (error) {
          throw new Error('LOOM Ai could not reply. Please try again.');
        }
        throw new Error(typeof result.error === 'string'
          ? result.error : 'LOOM Ai could not reply. Please try again.');
      }
      if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
        throw new Error('LOOM Ai returned an unreadable reply. Please try again.');
      }

      const assistantBubble = appendMessage('assistant', '');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';
      let streamDone = false;
      let streamInterrupted = false;
      let metadata = {};

      function consumeSSELine(line) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) return;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          streamDone = true;
          return;
        }
        try {
          const event = JSON.parse(payload);
          if (typeof event.response === 'string') {
            assistantText += event.response;
            assistantBubble.textContent = assistantText;
            widget.querySelector('.loom-ai-content').scrollTop = messagesElement.scrollHeight;
          }
          if (event.order || event.sizeSelection) metadata = event;
        } catch (error) {
          streamInterrupted = true;
          console.warn('LOOM Ai sent an unreadable stream event.', error);
        }
      }

      try {
        while (true) {
          const {value, done} = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, {stream: true});
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          lines.forEach(consumeSSELine);
        }
        buffer += decoder.decode();
      } catch (error) {
        streamInterrupted = true;
        console.warn('LOOM Ai stream ended before completion.', error);
      } finally {
        reader.releaseLock();
      }

      if (buffer) consumeSSELine(buffer);
      if (!streamDone) streamInterrupted = true;
      conversation.push(userMessage);
      if (assistantText) conversation.push({role: 'assistant', content: assistantText});
      saveCurrentChat(false);
      if (metadata.order) appendOrderCard(metadata.order);
      if (metadata.sizeSelection) appendSizeSelector(metadata.sizeSelection);

      if (streamInterrupted) {
        feedback.textContent = assistantText
          ? 'LOOM Ai connection was interrupted. The partial reply is saved.'
          : 'LOOM Ai connection was interrupted before replying. Please try again.';
        feedback.hidden = false;
      } else if (!assistantText.trim()) {
        feedback.textContent = 'LOOM Ai returned an empty reply. Please try again.';
        feedback.hidden = false;
      } else {
        feedback.textContent = '';
        feedback.hidden = true;
      }
    } catch (error) {
      const message = error.name === 'AbortError'
        ? 'LOOM Ai took too long to reply. Please try again.'
        : error.message || 'LOOM Ai could not connect. Please try again.';
      appendMessage('assistant', message, true);
      feedback.textContent = message;
    } finally {
      window.clearTimeout(timeout);
      input.disabled = false;
      sendButton.disabled = false;
      input.focus();
    }
  }

  function setTheme(theme, persist = false) {
    widget.dataset.theme = theme;
    const isDark = theme === 'dark';
    themeButton.setAttribute('aria-pressed', String(isDark));
    themeButton.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} theme`);
    themeIcon.textContent = isDark ? '☀' : '☾';
    if (!persist) return;
    try {
      window.localStorage.setItem(themeStorageKey, theme);
    } catch (error) {
      console.warn('Could not save the LOOM Ai appearance preference.', error);
    }
  }

  let initialTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  if (!document.documentElement.dataset.theme) {
    try {
      const savedTheme = window.localStorage.getItem(themeStorageKey);
      if (savedTheme === 'dark' || savedTheme === 'light') initialTheme = savedTheme;
    } catch (error) {
      console.warn('Could not load the LOOM Ai appearance preference.', error);
    }
  }
  setTheme(initialTheme);
  document.addEventListener('loom7-theme-change', event => setTheme(event.detail));

  function openPanel() {
    panel.hidden = false;
    widget.dataset.open = 'true';
    launcher.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('loom-ai-open');
    closeButton.focus();
  }

  function closePanel() {
    if (sendButton.disabled) return;
    startNewChat();
    panel.hidden = true;
    delete widget.dataset.open;
    launcher.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('loom-ai-open');
    launcher.focus();
  }

  launcher.addEventListener('click', openPanel);
  closeButton.addEventListener('click', closePanel);
  historyToggle.addEventListener('click', () => {
    if (sendButton.disabled) return;
    if (historyPanel.hidden) showHistory();
    else closeHistory();
  });
  widget.querySelector('[data-loom-ai-new-chat]').addEventListener('click', () => {
    if (!sendButton.disabled) startNewChat();
  });
  themeButton.addEventListener('click', () => {
    const themeToggle = document.getElementById('themeModeToggle');
    if (themeToggle) {
      themeToggle.checked = widget.dataset.theme !== 'dark';
      themeToggle.dispatchEvent(new Event('change', {bubbles: true}));
    } else {
      setTheme(widget.dataset.theme === 'dark' ? 'light' : 'dark', true);
    }
  });

  widget.querySelectorAll('[data-loom-ai-prompt]').forEach((button) => {
    button.addEventListener('click', () => {
      sendMessage(button.dataset.loomAiPrompt);
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!input.value.trim() || sendButton.disabled) {
      input.focus();
      return;
    }
    sendMessage(input.value);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) closePanel();
  });
})();
