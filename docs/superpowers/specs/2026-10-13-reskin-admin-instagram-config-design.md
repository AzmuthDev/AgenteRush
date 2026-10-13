# Rush_verso: Reskin + Painel Admin para Automação de Instagram

**Status:** Aprovado para plano de implementação
**Data:** 2026-10-13
**Stakeholder:** Tânios Acácio (Portal Rush Brasil — https://portalrushbrasil.com.br/)

## Contexto

O Rush_verso é a interface de chat (tema "Solar Federation Terminal 2112") do blog
Portal Rush Brasil, hoje conversando com o workflow n8n `Agente Rush test`
(`txi0epu0eLkaZVDn`) via webhook configurável pelo usuário no próprio navegador
(localStorage).

Separadamente, o Tânios já roda no mesmo n8n um segundo workflow, **"Instagram Bot -
Comentário para DM"** (`b6OQ8092uERKTaoD`, ativo), que automatiza o Instagram do
Portal Rush: quando alguém comenta uma palavra-chave num post, o n8n responde com uma
DM automática. Hoje a palavra-chave (`"portal"`) e o texto da DM estão **fixos dentro
dos nós do workflow** — só quem mexe no n8n consegue mudar isso.

Este projeto tem dois objetivos independentes:

1. Repaginar o visual do Rush_verso (tipografia, layout, polimento), mantendo a
   identidade synth-terminal, para ficar à altura de um produto ligado ao blog.
2. Dar ao Tânios um painel dentro do próprio Rush_verso para editar a palavra-gatilho
   e a mensagem de DM do workflow de Instagram, sem precisar abrir o n8n.

## Decisões já validadas com o stakeholder

- O gatilho acontece dentro do Instagram (comentário em post → DM automática); o
  Rush_verso não participa dessa conversa, só da configuração.
- O painel fica atrás de uma senha única (variável de ambiente), sem cadastro de
  usuários.
- O tema visual synth-terminal é mantido e refinado, não substituído.
- A persistência da configuração em disco é aceitável por ora; o volume persistente
  no Coolify será configurado pelo Tânios depois, a partir do caminho que
  documentarmos.
- O workflow n8n já foi liberado para acesso via MCP, permitindo edição direta dos
  nós ao invés de apenas documentar um contrato para edição manual.

## Risco de segurança observado (fora de escopo, só registro)

O workflow `Instagram Bot - Comentário para DM` tem tokens de acesso do Facebook
Graph API gravados em texto puro nos parâmetros de vários nós HTTP Request (inclusive
nós órfãos não conectados ao fluxo principal, aparentemente de depuração). O ideal
seria mover esses tokens para uma credencial do n8n (`Header Auth` ou credencial
nativa do Facebook Graph) em vez de parâmetro de nó. Não faz parte deste projeto,
mas deve ser sinalizado ao Tânios.

## Parte 1 — Reskin visual

**Objetivo:** mesma identidade (starfield, VU meters, paleta vermelho/dourado/ciano
2112), com tipografia e hierarquia mais deliberadas, menos "demo técnica".

Mudanças:
- Remover import da fonte `Cinzel` (carregada mas nunca usada em `css/style.css`).
- Consolidar a escala tipográfica entre as 4 fontes restantes (Orbitron para
  marca/títulos, Rajdhani para rótulos de UI, Space Grotesk para corpo de texto,
  JetBrains Mono para dados/telemetria), com steps de tamanho mais consistentes.
- Remover CSS morto: as regras de `.terminal-sidebar` / `.sidebar-*` / `.prompt-card`
  / `.lyrics-quote-box` em `style.css` não correspondem a nenhum elemento existente em
  `index.html` — não serão recriadas (fora de escopo), apenas removidas para reduzir
  a superfície de manutenção.
- Reduzir a opacidade/intensidade do `.scanline-overlay` para não cansar em leituras
  longas.
- Revisar o cabeçalho em telas estreitas (atualmente os VU meters somem, mas os
  botões de ícone podem ficar apertados) e o `welcome-hero` em mobile.
- Melhorar legibilidade de respostas longas dentro de `.message-bubble` (espaçamento
  entre blocos markdown, contraste de citações).
- Adicionar um crédito discreto no rodapé do `input-dock` ou do header: "Portal Rush
  Brasil" linkando para https://portalrushbrasil.com.br/.

Fora de escopo: trocar paleta de cores, remover starfield/VU meters/áudio, ou
redesenhar a estrutura de layout (continua single-column chat, sem sidebar).

## Parte 2 — Painel Admin (`/admin`)

### Armazenamento

Novo arquivo `data/instagram-config.json`, criado automaticamente com os valores
atuais do workflow como seed na primeira execução:

```json
{
  "triggerWord": "portal",
  "dmMessage": "Olá! Vi seu comentário no post. Acesse o link aqui: https://portalrushbrasil.com.br",
  "updatedAt": "2026-10-13T00:00:00.000Z"
}
```

> **Importante para o deploy:** este arquivo precisa estar num caminho montado como
> volume persistente no Coolify (`/app/data`), senão a configuração volta ao valor
> padrão a cada redeploy. Isso é responsabilidade do Tânios configurar no painel do
> Coolify; vamos documentar o caminho exato no README.

### Autenticação

- Senha única via variável de ambiente `ADMIN_PASSWORD` (sem valor padrão em
  produção — se não definida, o login fica bloqueado e o servidor loga um aviso).
- Sessão: token aleatório (32 bytes hex) guardado em memória no processo Node
  (`Map<token, expiresAt>`), expira em 12h. Cookie `rush_admin_session`,
  `HttpOnly`, `SameSite=Strict`, e `Secure` quando `NODE_ENV=production`.
- Sem múltiplos usuários, sem recuperação de senha — é um painel de uma pessoa só.

### Endpoints novos em `server.js`

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/api/admin/login` | — | `{ password }` → seta cookie de sessão ou 401 |
| POST | `/api/admin/logout` | cookie | invalida o token |
| GET | `/api/admin/instagram-config` | cookie | retorna `{ triggerWord, dmMessage, updatedAt }` |
| POST | `/api/admin/instagram-config` | cookie | `{ triggerWord, dmMessage }` → valida (strings não vazias, trim) e persiste |
| GET | `/api/instagram-config` | header `X-Api-Key` | retorna `{ triggerWord, dmMessage }` — consumido pelo n8n |

A chave de API (`INSTAGRAM_CONFIG_API_KEY`) é outra variável de ambiente, comparada
com `crypto.timingSafeEqual`.

### UI

- `admin.html` + `js/admin.js`, reaproveitando `css/style.css` (mesma identidade
  visual, com uma seção nova de estilos para tela de login e formulário).
- Tela de login: campo de senha + botão.
- Tela de configuração: campo de texto para a palavra-gatilho, textarea para a
  mensagem de DM, botão salvar, indicação de "última atualização".
- Não há link para `/admin` em nenhuma página pública.

## Parte 3 — Integração com o workflow n8n

Workflow alvo: `Instagram Bot - Comentário para DM` (`b6OQ8092uERKTaoD`).

Mudança nos nós (via acesso MCP já liberado):

1. **Novo nó** `Config_RushVerso` (HTTP Request, GET), inserido entre
   `Webhook_Instagram` e `Validar_Comentário`:
   - URL: `https://agenterush.portalrushzine.com/api/instagram-config`
   - Header: `X-Api-Key: <INSTAGRAM_CONFIG_API_KEY>`
2. **`Validar_Comentário`** (nó IF): a condição que hoje compara o texto do
   comentário com o literal `"portal"` passa a comparar com
   `{{ $('Config_RushVerso').item.json.triggerWord.toLowerCase().trim() }}`.
3. **`Enviar_DM`**: o campo `message.text` do corpo JSON passa a usar
   `{{ $('Config_RushVerso').item.json.dmMessage }}` em vez do texto fixo atual.

Os demais nós do workflow (webhook de verificação GET, e os HTTP Requests soltos de
depuração) não são tocados.

URL pública de produção do Rush_verso: `https://agenterush.portalrushzine.com/`.

## Testes

- Reskin: verificação visual manual (desktop + mobile) no navegador embutido, sem
  regressão de funcionalidade do chat existente.
- Painel admin: fluxo manual — login com senha errada (401), login certo, editar e
  salvar config, logout, tentar acessar `/api/admin/instagram-config` sem cookie
  (401), `/api/instagram-config` sem API key (401) e com API key (200).
- n8n: executar o workflow manualmente (via MCP `execute_workflow` ou um teste real
  de comentário) após a mudança, confirmando que a palavra-gatilho e a mensagem
  refletem o que está salvo no painel.
