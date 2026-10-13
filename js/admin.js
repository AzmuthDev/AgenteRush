/**
 * RUSH_VERSO // ADMIN PANEL
 * Instagram trigger word & DM message configuration.
 */
(function () {
  'use strict';

  const loginView = document.getElementById('login-view');
  const configView = document.getElementById('config-view');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const passwordInput = document.getElementById('admin-password');

  const configForm = document.getElementById('config-form');
  const triggerWordInput = document.getElementById('trigger-word');
  const dmMessageInput = document.getElementById('dm-message');
  const saveStatus = document.getElementById('save-status');

  const btnLogout = document.getElementById('btn-logout');
  const btnLogoutFooter = document.getElementById('btn-logout-footer');

  function showLogin() {
    configView.hidden = true;
    loginView.hidden = false;
    loginError.textContent = '';
    passwordInput.value = '';
  }

  function showConfig(config) {
    loginView.hidden = true;
    configView.hidden = false;
    triggerWordInput.value = config.triggerWord || '';
    dmMessageInput.value = config.dmMessage || '';
    saveStatus.textContent = '';
    saveStatus.classList.remove('admin-status-msg--error');
  }

  function loadConfig() {
    return fetch('/api/admin/instagram-config', { credentials: 'same-origin' })
      .then((res) => {
        if (res.status === 200) {
          return res.json().then((config) => showConfig(config));
        }
        showLogin();
      })
      .catch(() => {
        showLogin();
      });
  }

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    loginError.textContent = '';

    fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordInput.value })
    })
      .then((res) => {
        if (res.status === 200) {
          return loadConfig();
        }
        if (res.status === 503) {
          loginError.textContent = 'Painel não configurado no servidor (variável ADMIN_PASSWORD ausente).';
          return;
        }
        if (res.status === 401) {
          loginError.textContent = 'Senha incorreta';
          return;
        }
        loginError.textContent = 'Erro inesperado. Tente novamente.';
      })
      .catch(() => {
        loginError.textContent = 'Erro de conexão. Tente novamente.';
      });
  });

  configForm.addEventListener('submit', (event) => {
    event.preventDefault();
    saveStatus.textContent = '';
    saveStatus.classList.remove('admin-status-msg--error');

    fetch('/api/admin/instagram-config', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        triggerWord: triggerWordInput.value,
        dmMessage: dmMessageInput.value
      })
    })
      .then((res) => {
        if (res.status === 200) {
          const now = new Date().toLocaleTimeString('pt-BR');
          saveStatus.textContent = 'Salvo às ' + now;
          saveStatus.classList.remove('admin-status-msg--error');
          return;
        }
        if (res.status === 401) {
          showLogin();
          return;
        }
        return res.json().then((body) => {
          saveStatus.textContent = body && body.error === 'invalid_input'
            ? 'Preencha a palavra-gatilho e a mensagem antes de salvar.'
            : 'Não foi possível salvar. Tente novamente.';
          saveStatus.classList.add('admin-status-msg--error');
        });
      })
      .catch(() => {
        saveStatus.textContent = 'Erro de conexão. Tente novamente.';
        saveStatus.classList.add('admin-status-msg--error');
      });
  });

  function logout() {
    fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' })
      .catch(() => {})
      .then(showLogin);
  }

  btnLogout.addEventListener('click', logout);
  btnLogoutFooter.addEventListener('click', logout);

  document.addEventListener('DOMContentLoaded', loadConfig);
})();
