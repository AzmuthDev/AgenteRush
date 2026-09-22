/**
 * RUSH_VERSO // APPLICATION CONTROLLER
 * Handles chat orchestration, UI reactions, sound events, and n8n synchronization.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Subsystems
  const starfield = new Starfield('starfield-canvas');
  const audio = new SynthAudioEngine();
  const n8n = new N8nClient();

  // DOM Elements
  const messagesContainer = document.getElementById('messages-container');
  const welcomeHero = document.getElementById('welcome-hero');
  const chatInput = document.getElementById('chat-input');
  const btnTransmit = document.getElementById('btn-transmit');
  const activeSessionDisplay = document.getElementById('active-session-id');
  const statusPill = document.getElementById('status-pill');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const btnSettings = document.getElementById('btn-settings');
  const btnAudioToggle = document.getElementById('btn-audio-toggle');
  const btnClearChat = document.getElementById('btn-clear-chat');

  // Modal Elements
  const settingsModal = document.getElementById('settings-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const btnCancelSettings = document.getElementById('btn-cancel-settings');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const inputWebhookUrl = document.getElementById('setting-webhook-url');
  const btnResetSession = document.getElementById('btn-reset-session');
  const modeAutoBtn = document.getElementById('mode-auto');
  const modeGetBtn = document.getElementById('mode-get');
  const modePostBtn = document.getElementById('mode-post');

  // VU Meter Segments
  const vuSegments = document.querySelectorAll('.vu-segment');

  // State
  let isTransmitting = false;
  let chatHistory = [];
  const STORAGE_KEY_HISTORY = 'rush_chat_history';

  // ===================================================================
  // INITIALIZATION
  // ===================================================================
  function init() {
    updateSessionDisplay();
    updateAudioButtonUI();
    loadHistory();
    setupEventListeners();
    animateVuMetersIdle();
  }

  function updateSessionDisplay() {
    if (activeSessionDisplay) {
      activeSessionDisplay.textContent = n8n.sessionId;
    }
  }

  function updateAudioButtonUI() {
    if (!btnAudioToggle) return;
    const muted = audio.isMuted();
    btnAudioToggle.title = muted ? 'Áudio Mudo (Clique para ativar Moog/Oberheim)' : 'Áudio Ativo (Sons Analógicos Rush)';
    btnAudioToggle.innerHTML = muted ? `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="1" y1="1" x2="23" y2="23"></line>
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
        <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    ` : `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      </svg>
    `;
    btnAudioToggle.style.color = muted ? 'var(--text-dim)' : 'var(--gold-synth)';
  }

  // ===================================================================
  // VU METERS & SYNTH OSCILLATION ANIMATION
  // ===================================================================
  function animateVuMetersIdle() {
    setInterval(() => {
      if (isTransmitting) return;
      vuSegments.forEach(seg => {
        const active = Math.random() > 0.65;
        const color = seg.dataset.color || 'green';
        if (active) {
          seg.classList.add(`lit-${color}`);
        } else {
          seg.className = 'vu-segment';
        }
      });
    }, 280);
  }

  function setVuMetersActive(intensity = 1) {
    vuSegments.forEach(seg => {
      const color = seg.dataset.color || 'green';
      if (Math.random() < intensity) {
        seg.classList.add(`lit-${color}`);
      } else {
        seg.className = 'vu-segment';
      }
    });
  }

  // ===================================================================
  // MESSAGE RENDERING & TYPING
  // ===================================================================
  function formatTimestamp() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function parseMarkdown(text) {
    if (!text) return '';
    
    // Escape HTML tags to prevent XSS
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks ```code```
    html = html.replace(/```([a-zA-Z]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`;
    });

    // Inline `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Blockquotes
    html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

    // Bold **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic *text*
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Unordered lists
    html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, ''); // Join consecutive lists

    // Paragraphs
    const lines = html.split('\n');
    const processedLines = lines.map(line => {
      line = line.trim();
      if (!line) return '';
      if (line.startsWith('<h') || line.startsWith('<pre') || line.startsWith('<ul') || line.startsWith('<blockquote')) {
        return line;
      }
      return `<p>${line}</p>`;
    });

    return processedLines.filter(l => l).join('');
  }

  function appendMessage(sender, content, metaExtra = null) {
    if (welcomeHero) {
      welcomeHero.style.display = 'none';
    }

    const time = formatTimestamp();
    const row = document.createElement('div');
    row.className = `message-row ${sender}`;

    if (sender === 'user') {
      row.innerHTML = `
        <div class="message-avatar user">YOU</div>
        <div class="message-content-wrapper">
          <div class="message-sender-meta">
            <span>PILOTO // SESSÃO ATIVA</span>
            <span>${time}</span>
          </div>
          <div class="message-bubble">${parseMarkdown(content)}</div>
        </div>
      `;
    } else {
      row.innerHTML = `
        <div class="message-avatar bot">
          <img src="assets/starman.svg" alt="Rush Starman">
        </div>
        <div class="message-content-wrapper">
          <div class="message-sender-meta">
            <span>RUSH_AUTOMATION // TEMPLO DE SYRINX</span>
            <span>${time}</span>
          </div>
          <div class="message-bubble">${parseMarkdown(content)}</div>
        </div>
      `;
    }

    messagesContainer.appendChild(row);
    scrollToBottom();

    // Persist
    chatHistory.push({ sender, content, time });
    saveHistory();
  }

  function showTypingIndicator() {
    const typingRow = document.createElement('div');
    typingRow.id = 'typing-indicator';
    typingRow.className = 'typing-row';
    typingRow.innerHTML = `
      <div class="message-avatar bot">
        <img src="assets/starman.svg" alt="Rush">
      </div>
      <div class="typing-bubble">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <span class="typing-text">Neil Peart ritmando a resposta...</span>
      </div>
    `;
    messagesContainer.appendChild(typingRow);
    scrollToBottom();
  }

  function hideTypingIndicator() {
    const typing = document.getElementById('typing-indicator');
    if (typing) {
      typing.remove();
    }
  }

  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // ===================================================================
  // TRANSMIT HANDLER (DISPATCH TO N8N)
  // ===================================================================
  async function handleTransmit() {
    const text = chatInput.value.trim();
    if (!text || isTransmitting) return;

    // Reset input
    chatInput.value = '';
    chatInput.style.height = 'auto';
    btnTransmit.disabled = true;
    isTransmitting = true;

    // Audio & UI
    audio.playTransmitSound();
    appendMessage('user', text);
    showTypingIndicator();

    // Intense VU meter activity during transmit
    const vuInterval = setInterval(() => setVuMetersActive(0.85), 100);

    try {
      const result = await n8n.sendMessage(text);
      clearInterval(vuInterval);
      hideTypingIndicator();

      if (result.success) {
        audio.playReceiveSound();
        appendMessage('bot', result.output);
        setConnectionStatus(true, 'Sincronizado com n8n');
      } else if (result.isN8nSetupError) {
        // Warning with instructions, plus fallback
        audio.playReceiveSound();
        const warningMsg = `> ⚠️ **Aviso de Conexão com o n8n (${result.status})**\n> ${result.message}\n>\n> **Dica**: ${result.hint}\n> *Você pode clicar no botão ⚙️ no topo para ajustar ou colar a Production URL exata do nó de Webhook do seu n8n.*\n\n---\n\n${result.simulatedResponse}`;
        appendMessage('bot', warningMsg);
        setConnectionStatus(false, 'n8n: Webhook Inativo/Ajustar URL');
      } else {
        // Network / CORS
        audio.playReceiveSound();
        const failMsg = `> ⚠️ **Falha na Requisição Direta** (${result.message || 'CORS ou Timeout'})\n> O navegador não conseguiu alcançar o nó do n8n diretamente. Verifique se o n8n está rodando e com CORS habilitado, ou configure a URL de produção no menu ⚙️.\n\n---\n\n${result.simulatedResponse}`;
        appendMessage('bot', failMsg);
        setConnectionStatus(false, 'Desconectado / Modo Offline');
      }
    } catch (err) {
      clearInterval(vuInterval);
      hideTypingIndicator();
      console.error(err);
      appendMessage('bot', `❌ Erro inesperado ao processar mensagem: ${err.message}`);
      setConnectionStatus(false, 'Erro de Transmissão');
    } finally {
      isTransmitting = false;
      btnTransmit.disabled = false;
      chatInput.focus();
    }
  }

  function setConnectionStatus(isOnline, label) {
    if (!statusIndicator || !statusText) return;
    if (isOnline) {
      statusIndicator.className = 'status-indicator';
      statusText.textContent = label;
      statusPill.style.borderColor = 'rgba(0, 240, 255, 0.4)';
    } else {
      statusIndicator.className = 'status-indicator error';
      statusText.textContent = label;
      statusPill.style.borderColor = 'rgba(255, 23, 68, 0.4)';
    }
  }

  // ===================================================================
  // HISTORY PERSISTENCE
  // ===================================================================
  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(chatHistory));
    } catch (e) {
      console.warn('Could not save history to localStorage', e);
    }
  }

  function loadHistory() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_HISTORY);
      if (stored) {
        chatHistory = JSON.parse(stored);
        if (chatHistory.length > 0 && welcomeHero) {
          welcomeHero.style.display = 'none';
          chatHistory.forEach(item => {
            const row = document.createElement('div');
            row.className = `message-row ${item.sender}`;
            if (item.sender === 'user') {
              row.innerHTML = `
                <div class="message-avatar user">YOU</div>
                <div class="message-content-wrapper">
                  <div class="message-sender-meta">
                    <span>PILOTO // SESSÃO ANTERIOR</span>
                    <span>${item.time || ''}</span>
                  </div>
                  <div class="message-bubble">${parseMarkdown(item.content)}</div>
                </div>
              `;
            } else {
              row.innerHTML = `
                <div class="message-avatar bot">
                  <img src="assets/starman.svg" alt="Rush Starman">
                </div>
                <div class="message-content-wrapper">
                  <div class="message-sender-meta">
                    <span>RUSH_AUTOMATION // ARQUIVO 2112</span>
                    <span>${item.time || ''}</span>
                  </div>
                  <div class="message-bubble">${parseMarkdown(item.content)}</div>
                </div>
              `;
            }
            messagesContainer.appendChild(row);
          });
          scrollToBottom();
        }
      }
    } catch (e) {
      console.warn('Error loading chat history', e);
    }
  }

  function clearHistory() {
    audio.playClickSound();
    if (confirm('Deseja reiniciar a transmissão e limpar todo o histórico do terminal?')) {
      chatHistory = [];
      localStorage.removeItem(STORAGE_KEY_HISTORY);
      messagesContainer.innerHTML = '';
      if (welcomeHero) {
        welcomeHero.style.display = 'flex';
        messagesContainer.appendChild(welcomeHero);
      }
      n8n.resetSessionId();
      updateSessionDisplay();
    }
  }

  // ===================================================================
  // SETTINGS MODAL HANDLERS
  // ===================================================================
  function openSettings() {
    audio.playClickSound();
    if (inputWebhookUrl) {
      inputWebhookUrl.value = n8n.getWebhookUrl();
    }
    updateModeSelectionUI(n8n.getMode());
    settingsModal.classList.add('active');
  }

  function closeSettings() {
    audio.playClickSound();
    settingsModal.classList.remove('active');
  }

  function saveSettings() {
    audio.playClickSound();
    const newUrl = inputWebhookUrl.value.trim();
    if (newUrl) {
      n8n.setWebhookUrl(newUrl);
    }
    closeSettings();
    setConnectionStatus(true, 'Webhook Atualizado');
  }

  function updateModeSelectionUI(mode) {
    const currentMode = mode || 'auto';
    modeAutoBtn?.classList.toggle('active', currentMode === 'auto');
    modeGetBtn?.classList.toggle('active', currentMode === 'get');
    modePostBtn?.classList.toggle('active', currentMode === 'post');
  }

  // ===================================================================
  // EVENT LISTENERS
  // ===================================================================
  function setupEventListeners() {
    // Send Button
    btnTransmit?.addEventListener('click', handleTransmit);

    // Enter & Shift+Enter in Textarea
    chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleTransmit();
      }
    });

    // Auto-grow textarea
    chatInput?.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px';
    });

    // Audio Mute Toggle
    btnAudioToggle?.addEventListener('click', () => {
      audio.toggleMute();
      updateAudioButtonUI();
      if (!audio.isMuted()) {
        audio.playClickSound();
      }
    });

    // Clear Chat
    btnClearChat?.addEventListener('click', clearHistory);

    // Settings Modal
    btnSettings?.addEventListener('click', openSettings);
    statusPill?.addEventListener('click', openSettings);
    modalCloseBtn?.addEventListener('click', closeSettings);
    btnCancelSettings?.addEventListener('click', closeSettings);
    btnSaveSettings?.addEventListener('click', saveSettings);

    settingsModal?.addEventListener('click', (e) => {
      if (e.target === settingsModal) closeSettings();
    });

    // Reset Session Button inside Settings
    btnResetSession?.addEventListener('click', () => {
      audio.playClickSound();
      const newSid = n8n.resetSessionId();
      updateSessionDisplay();
      alert(`Nova sessão gerada: ${newSid}`);
    });

    // Mode Option Toggles (Auto, GET, POST)
    modeAutoBtn?.addEventListener('click', () => {
      audio.playClickSound();
      n8n.setMode('auto');
      updateModeSelectionUI('auto');
    });

    modeGetBtn?.addEventListener('click', () => {
      audio.playClickSound();
      n8n.setMode('get');
      updateModeSelectionUI('get');
    });

    modePostBtn?.addEventListener('click', () => {
      audio.playClickSound();
      n8n.setMode('post');
      updateModeSelectionUI('post');
    });

    // Preset / Prompt Cards Click
    document.querySelectorAll('.prompt-card, .hero-pill').forEach(card => {
      card.addEventListener('click', () => {
        const promptText = card.dataset.prompt;
        if (promptText) {
          audio.playClickSound();
          chatInput.value = promptText;
          chatInput.focus();
          // Dispatch immediately
          handleTransmit();
        }
      });
    });
  }

  // Boot Application
  init();
});
