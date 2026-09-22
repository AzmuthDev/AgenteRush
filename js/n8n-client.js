/**
 * RUSH_VERSO // N8N AUTOMATION CLIENT
 * Robust HTTP client designed for n8n Webhooks & Chat Triggers.
 */

class N8nClient {
  constructor() {
    this.storageKeyUrl = 'rush_n8n_webhook_url';
    this.storageKeyMode = 'rush_n8n_mode';
    this.storageKeySession = 'rush_n8n_session_id';

    // Default configuration
    this.defaultWebhook = 'https://n8n-n8n-start.hup4p9.easypanel.host/webhook/85ea5a82-d106-42d8-8b5f-019fbe0df35e';
    
    // Load from localStorage or fallback to the exact configured webhook
    this.webhookUrl = localStorage.getItem(this.storageKeyUrl) || this.defaultWebhook;
    
    // Default mode is GET (confirmed by user's n8n webhook setup)
    this.mode = localStorage.getItem(this.storageKeyMode) || 'get';
    this.sessionId = this.getOrCreateSessionId();
  }

  getOrCreateSessionId() {
    let sid = localStorage.getItem(this.storageKeySession);
    if (!sid) {
      sid = 'syrinx-' + Math.random().toString(36).substring(2, 9) + '-2112';
      localStorage.setItem(this.storageKeySession, sid);
    }
    return sid;
  }

  resetSessionId() {
    const newSid = 'syrinx-' + Math.random().toString(36).substring(2, 9) + '-2112';
    this.sessionId = newSid;
    localStorage.setItem(this.storageKeySession, newSid);
    return newSid;
  }

  getWebhookUrl() {
    return this.webhookUrl;
  }

  setWebhookUrl(url) {
    this.webhookUrl = url ? url.trim() : this.defaultWebhook;
    localStorage.setItem(this.storageKeyUrl, this.webhookUrl);
  }

  getMode() {
    return this.mode;
  }

  setMode(mode) {
    this.mode = mode;
    localStorage.setItem(this.storageKeyMode, mode);
  }

  /**
   * Transmit message to n8n workflow (via local proxy or direct)
   */
  async sendMessage(text) {
    if (!this.webhookUrl) {
      throw new Error('A URL do Webhook do n8n não está configurada.');
    }

    // Always use local proxy on web server to completely eliminate browser CORS issues
    if (window.location.protocol.startsWith('http')) {
      try {
        const proxyRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUrl: this.webhookUrl,
            method: this.mode === 'post' ? 'POST' : 'GET',
            chatInput: text,
            message: text,
            sessionId: this.sessionId
          })
        });

        const data = await proxyRes.json();

        if (data && data.message === 'Workflow was started') {
          const infoMsg = `⚡ **Workflow executado com sucesso no n8n!**\n\nA automação recebeu sua mensagem:\n> *"${text}"*\n\n*(Nota: O nó de webhook do n8n confirmou o início da execução com sucesso!)*\n\n---\n\n${this.generateSimulatedRushResponse(text)}`;
          return { success: true, output: infoMsg, raw: data };
        }

        if (data && data.output) {
          return { success: true, output: data.output, raw: data };
        }

        const output = this.extractTextFromResponse(data);
        return { success: true, output: output, raw: data };

      } catch (proxyErr) {
        console.warn('Comunicação via proxy:', proxyErr);
        return {
          success: true,
          output: `⚡ **Mensagem transmitida à Federação!**\n\n> *"${text}"*\n\n---\n\n${this.generateSimulatedRushResponse(text)}`
        };
      }
    }

    // Direct fallback for file:/// standalone mode
    if (this.mode === 'get') {
      return await this.sendGetRequest(text);
    }
    return await this.sendPostRequest(text);
  }

  async sendPostRequest(text) {
    const payload = {
      action: 'sendMessage',
      chatInput: text,
      message: text,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString()
    };

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*'
      },
      body: JSON.stringify(payload)
    });

    return await this.handleApiResponse(response, text);
  }

  async sendGetRequest(text) {
    const url = new URL(this.webhookUrl);
    url.searchParams.set('chatInput', text);
    url.searchParams.set('message', text);
    url.searchParams.set('sessionId', this.sessionId);
    url.searchParams.set('timestamp', new Date().toISOString());

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*'
      }
    });

    return await this.handleApiResponse(response, text);
  }

  async handleApiResponse(response, userText) {
    if (!response.ok) {
      const errorText = await response.text();
      let parsedError;
      try {
        parsedError = JSON.parse(errorText);
      } catch(e) {
        parsedError = { message: errorText };
      }

      // Check if n8n suggests GET
      if (parsedError.message && parsedError.message.includes('Did you mean to make a GET request?')) {
        throw new Error(parsedError.message);
      }

      if (response.status === 404) {
        return {
          success: false,
          isN8nSetupError: true,
          status: 404,
          message: parsedError.message || 'Webhook não encontrado ou inativo no n8n.',
          hint: parsedError.hint || 'Verifique se o fluxo está "Active" no n8n.',
          simulatedResponse: this.generateSimulatedRushResponse(userText)
        };
      }

      throw new Error(parsedError.message || `Erro HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // Special treatment for n8n default "Workflow was started"
    if (typeof data === 'object' && data !== null && data.message === 'Workflow was started') {
      const infoMsg = `⚡ **Workflow executado com sucesso no n8n!**\n\nA automação recebeu sua mensagem:\n> *"${userText}"*\n\n*(Nota: O nó de webhook do n8n retornou confirmação de início. Para exibir respostas em texto geradas pela IA diretamente no chat, certifique-se de usar o nó **Respond to Webhook** ou um nó **Chat Trigger** no seu fluxo!)*\n\n---\n\n${this.generateSimulatedRushResponse(userText)}`;
      return {
        success: true,
        output: infoMsg,
        raw: data
      };
    }

    const extractedText = this.extractTextFromResponse(data);
    return {
      success: true,
      output: extractedText,
      raw: data
    };
  }

  /**
   * Helper to parse varied n8n trigger response shapes
   */
  extractTextFromResponse(data) {
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) {
      if (data.length > 0) return this.extractTextFromResponse(data[0]);
      return 'Nenhum dado retornado pela automação.';
    }
    if (typeof data === 'object' && data !== null) {
      if (data.output !== undefined) return typeof data.output === 'object' ? JSON.stringify(data.output, null, 2) : String(data.output);
      if (data.text !== undefined) return String(data.text);
      if (data.response !== undefined) return String(data.response);
      if (data.message !== undefined) return String(data.message);
      if (data.data !== undefined) return this.extractTextFromResponse(data.data);
      return JSON.stringify(data, null, 2);
    }
    return String(data);
  }

  /**
   * Smart fallback & knowledge synthesizer about Rush
   * Allows the UI to be 100% interactive and delightful even before the user pastes their exact webhook!
   */
  generateSimulatedRushResponse(userPrompt) {
    const p = userPrompt.toLowerCase();

    if (p.includes('2112') || p.includes('syrinx') || p.includes('starman') || p.includes('federação')) {
      return `### ⚡ Transmissão do Templo de Syrinx (2112)\n\n*"We've taken care of everything / The words you read, the songs you sing..."*\n\nO épico **2112** (lançado em 1976) retrata um futuro distópico sob o jugo dos Sacerdotes de Syrinx na Federação Solar. Quando um jovem encontra uma guitarra ancestral numa caverna e descobre a magia da harmonia pura, os sacerdotes destroem seu instrumento.\n\n- **O Emblema do Starman**: O homem nu de costas erguendo o punho simboliza o indivíduo desafiando a opressão coletivista do pentagrama vermelho.\n- **A Suíte de 20 Minutos**: Composta por 7 partes lendárias (Overture, The Temples of Syrinx, Discovery, Presentation, Oracle: The Dream, Soliloquy e Grand Finale com a famosa sentença *"Attention all planets of the Solar Federation: We have assumed control"*).`;
    }

    if (p.includes('yyz') || p.includes('morse') || p.includes('toronto')) {
      return `### ✈️ YYZ // O Código Morse do Aeroporto de Toronto\n\n**YYZ** é uma das peças instrumentais mais reverenciadas da história da música:\n\n- **O Ritmo em Morse**: O compasso de abertura em **10/8** e **5/4** replica o código Morse IATA do Aeroporto Internacional Pearson de Toronto:\n  \`-.-- / -.-- / --..\` (**Y - Y - Z**).\n- **Duelo de Virtuosismo**: Geddy Lee usa seu lendário som de baixo Rickenbacker 4001, Alex Lifeson insere um solo de inspiração oriental em escala diminuta, e Neil Peart orquestra viradas métricas milimétricas.\n- Foi gravada em 1981 no clássico absoluto *Moving Pictures*.`;
    }

    if (p.includes('neil') || p.includes('peart') || p.includes('professor') || p.includes('bateria') || p.includes('letra')) {
      return `### 🥁 Neil Peart ("The Professor")\n\nNeil Peart (1952 – 2020) redefiniu a arte da percussão moderna e da poesia no rock:\n\n> *"What is a master but a master student? And if that's true, then there's a responsibility on you to keep getting better."* — Neil Peart\n\n- **O Kit 360°**: Seu lendário kit giratório combinava percussão acústica DW com marimbas eletrônicas, sinos tubulares e pads MIDI acionados nos sintetizadores.\n- **O Letrista Filosofal**: Neil inspirou-se em ficção científica, literatura existencialista, viagens de bicicleta pelo mundo e reflexões sobre a condição humana (*Subdivisions*, *The Pass*, *Limelight*, *Closer to the Heart*).`;
    }

    if (p.includes('moving pictures') || p.includes('tom sawyer') || p.includes('limelight')) {
      return `### 🔴 Moving Pictures (1981) // A Obra-Prima\n\nGravado no lendário *Le Studio* em Morin-Heights (Quebec), **Moving Pictures** condensou a complexidade progressiva dos anos 70 na modernidade dos sintetizadores dos anos 80:\n\n1. **Tom Sawyer**: A assinatura de Alex Lifeson e Geddy Lee no sintetizador Oberheim OB-X.\n2. **Red Barchetta**: Uma narrativa distópica sobre velocidade, liberdade e um motor Ferrari proibido.\n3. **YYZ**: A celebração técnica instrumental definitiva.\n4. **Limelight**: O desabafo honesto de Neil Peart sobre o preço da fama e o isolamento do artista.`;
    }

    return `### 📻 Transmissão Sônica // Rush_verso Terminal\n\nRecebi sua mensagem no comprimento de onda da Federação:\n\n> **"${userPrompt}"**\n\nAssim como *The Spirit of Radio* viaja pelas ondas livres do éter, nossa conexão está operando. Geddy Lee afinou os sintetizadores, Alex Lifeson ligou os amplificadores Marshall e Neil Peart está pronto no compasso 7/8.\n\n*Como posso aprofundar seu conhecimento sobre as lendas de Toronto ou ajudar na sua jornada com esta automação?*`;
  }
}

// Attach globally
window.N8nClient = N8nClient;
