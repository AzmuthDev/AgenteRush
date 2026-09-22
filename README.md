# ⚡ RUSH_VERSO // Terminal da Federação Solar 2112

Interface conversacional imersiva inspirada na estética da lendária banda de rock progressivo **Rush** (*2112*, *Moving Pictures*, *Signals*), integrada à automação no **n8n**.

---

## 🚀 Como Executar Localmente

### Opção 1: Servidor Integrado em Node.js (Recomendado)
No terminal, dentro da pasta `Rush_verso`:
```bash
node server.js
```
Acesse no seu navegador:
👉 **[http://localhost:3000](http://localhost:3000)**

### Opção 2: Abertura Direta
Você também pode simplesmente dar um duplo clique no arquivo [`index.html`](./index.html) para abrir diretamente no Chrome, Edge, Firefox ou Safari.

---

## 🔌 Conectando ao seu Fluxo do n8n

O seu fluxo no n8n está hospedado em:
`https://n8n-n8n-start.hup4p9.easypanel.host/workflow/txi0epu0eLkaZVDn`

Para sincronizar o envio e recebimento de mensagens:
1. Abra o fluxo no editor do n8n.
2. Dê dois cliques no nó inicial do fluxo:
   - Se for um nó **When chat message received** (Chat Trigger) ou **Webhook**, você verá um campo com a **Production URL** e a **Test URL**.
   - Copie a URL (ex: `https://n8n-n8n-start.hup4p9.easypanel.host/webhook/...`).
3. No **Terminal Rush_verso**, clique no ícone **⚙️** (ou na pílula de status no cabeçalho).
4. Cole a URL no campo **URL do Webhook do n8n** e clique em **Salvar & Conectar**.
5. **Atenção**:
   - Para chamadas contínuas, certifique-se de ligar a chave **Active** (no topo direito da tela do n8n).
   - Se for usar a *Test URL*, lembre-se de clicar em *Execute workflow* no n8n antes de disparar a mensagem.

---

## 🎸 Recursos & Imersão Rush

- **Emblema Starman & Red Star**: O ícone clássico do homem desafiando os sacerdotes de Syrinx no épico *2112*.
- **Canvas Cósmico Cygnus X-1**: Fundo dinâmico com estrelas cintilantes e passagens de cometas com rastro em tempo real.
- **VU Meters Analógicos**: Indicadores de frequência inspirados nos sintetizadores Oberheim OB-X e Minimoog de Geddy Lee.
- **Áudio Sintetizado Retrô (Web Audio API)**: Sons analógicos autênticos ao enviar e receber mensagens (com botão para silenciar a qualquer momento).
- **Arquivos de Syrinx**: Cards laterais com perguntas e curiosidades lendárias sobre a métrica em Morse de *YYZ*, a filosofia lírica de Neil Peart e a revolução dos sintetizadores em *Moving Pictures*.
- **Histórico Persistente**: Suas mensagens e o ID de sessão são salvos no `localStorage` do navegador para manter o contexto entre recarregamentos.
