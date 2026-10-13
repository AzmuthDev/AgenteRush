const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CONFIG = {
  triggerWord: 'portal',
  dmMessage: 'Olá! Vi seu comentário no post. Acesse o link aqui: https://portalrushbrasil.com.br',
};

function requireNonEmpty(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) throw new Error('INVALID_CONFIG');
  return trimmed;
}

function createConfigStore(filePath) {
  async function persist(config) {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(config, null, 2), 'utf8');
    return config;
  }

  async function read() {
    try {
      const raw = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      return persist({ ...DEFAULT_CONFIG, updatedAt: new Date().toISOString() });
    }
  }

  async function write({ triggerWord, dmMessage }) {
    const config = {
      triggerWord: requireNonEmpty(triggerWord),
      dmMessage: requireNonEmpty(dmMessage),
      updatedAt: new Date().toISOString(),
    };
    return persist(config);
  }

  return { read, write };
}

module.exports = { createConfigStore, DEFAULT_CONFIG };
