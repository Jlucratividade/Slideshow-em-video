# Slideshow Generator

Frontend em **um único arquivo** (`index.html`, GitHub Pages) + backend mínimo (`api/telegram.js`, Vercel).

## Estrutura
```
index.html        # todo o frontend (HTML + CSS + JS)
api/telegram.js   # POST /api/telegram
package.json  vercel.json  .gitignore  README.md
```

## 1. Bot do Telegram
1. No Telegram, fale com **@BotFather** → `/newbot` → guarde o **token**.
2. Adicione o bot ao grupo (como membro).
3. Envie uma mensagem no grupo e abra `https://api.telegram.org/bot<TOKEN>/getUpdates`. Copie `chat.id` (grupos têm ID negativo, ex. `-1001234567890`).

## 2. Backend na Vercel
1. Suba esta pasta para um repositório no GitHub (o `index.html` pode ficar nele também).
2. Em vercel.com: **Add New → Project → Import** o repositório → Deploy.
3. **Settings → Environment Variables** (marque Production):
   | Nome | Valor |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | token do BotFather |
   | `TELEGRAM_CHAT_ID` | ID do grupo |
   | `ALLOWED_ORIGINS` | `https://SEU-USUARIO.github.io` (só a origem, sem caminho; vários separados por vírgula) |
4. Faça **Redeploy** para aplicar as variáveis.
5. Teste (deve responder 403 "Origem não autorizada", provando que o endpoint está no ar):
   `curl -i -X POST https://SEU-PROJETO.vercel.app/api/telegram`

## 3. Frontend no GitHub Pages
1. Abra o `index.html` e edite no topo do `<script>`: `const BACKEND_URL = 'https://SEU-PROJETO.vercel.app';` (a URL do backend é pública; **nunca** coloque token).
2. Crie o repositório, envie o `index.html`.
3. **Settings → Pages → Deploy from a branch → main / (root)**.
4. Acesse `https://SEU-USUARIO.github.io/SEU-REPO/`.

## Parâmetros de URL
`images` (URLs separadas por vírgula/linha; aceita repetir), `img1`…`img30`, `format` (vertical|horizontal|square), `duration` (2–10), `effect` (zoom|zoomout|left|right|vertical|kenburns|static), `transition` (fade|crossfade|dissolve|cut), `fps` (24|30|60), `quality` (low|mid|high), `autoplay`, `autodownload`, `sendtelegram` (true/false).

```
?images=https://site/a.jpg,https://site/b.jpg&format=vertical&duration=4&effect=zoom&transition=crossfade
?img1=https://site/a.jpg&img2=https://site/b.jpg&format=square&effect=kenburns&fps=30&autoplay=true&autodownload=true&sendtelegram=true
```
Safari/iOS exigem um toque para iniciar (aparece um botão). Downloads automáticos podem ser bloqueados pelo navegador; o botão "Baixar" sempre fica disponível.

## Limites e decisões importantes
- **4,5 MB por envio**: é o limite do corpo de requisição das Vercel Functions. Por isso há a opção "Limitar o tamanho…", que reduz o bitrate conforme a duração. Vídeos longos ficam com qualidade menor; para vídeos maiores seria preciso um backend sem esse limite (VPS, Cloudflare Worker + R2, Vercel Blob com upload direto).
- **CORS das imagens**: o canvas só pode gravar imagens cujo servidor envia `Access-Control-Allow-Origin`. GitHub (raw/Pages), Wikimedia, Unsplash e muitos CDNs funcionam; outros falham e são marcados com erro na miniatura. O app não usa proxy de propósito (evita um proxy HTTP aberto).
- **MP4 vs WebM**: o formato é detectado com `MediaRecorder.isTypeSupported()`. Chrome/Edge 126+ e Safari gravam MP4; Firefox grava WebM. WebM é entregue ao Telegram como *documento* (o `sendVideo` só reproduz MP4).
- **Tempo real**: a gravação dura o mesmo tempo do vídeo e precisa da aba visível (navegadores pausam animações em segundo plano).
- **Proteções do endpoint**: só aceita origens listadas em `ALLOWED_ORIGINS`, 4,5 MB, verifica assinatura real MP4/WebM, 5 envios/10 min por IP (contador em memória, melhor esforço; para algo rígido use Upstash/Vercel KV). Origem pode ser forjada fora de navegadores, então o endpoint só envia para o *seu* chat e nunca atua como proxy.
- Não incluídos: áudio e conversão FFmpeg.wasm (o arquivo continua no formato nativo do navegador).

## Testes funcionais (checklist)
1. Colar 3 URLs → miniaturas aparecem; reordenar e remover funciona.
2. URL inválida / `http://localhost` → marcada com erro.
3. Pré-visualizar cada efeito e transição.
4. Gerar vídeo vertical, 3 imagens × 4 s → dura ~12 s, toca no preview, baixa com extensão correta.
5. Cancelar durante a geração → sem arquivo.
6. Enviar ao Telegram → mensagem chega no grupo.
7. `curl` sem Origin → 403; origem não listada → 403; >5 envios em 10 min → 429.
8. Abrir com parâmetros de URL (exemplos acima) em Chrome, Edge, Firefox, Safari, Android e iOS.
