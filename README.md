# Monitor Ambiental — frontend

Interface web do projeto em [Angular](https://angular.dev/) 21 com **SSR** (renderização no servidor via Express). Dashboard público, login JWT e painel de irrigação.

## Stack

- Angular 21, TypeScript, SCSS
- `@angular/ssr` + Express — build híbrido (browser + servidor Node)
- `chart.js` / `ng2-charts` — gráficos do dashboard
- Vitest (`ng test`) — testes unitários
- Container de produção: Node 22 Alpine (`Dockerfile`), orquestrado pelo compose em `api-node/deploy/`

## Rotas

| Caminho | Auth | Descrição |
|---------|------|-----------|
| `/` | — | Landing page |
| `/login` | — | Autenticação |
| `/dashboard` | — | Medições atuais e gráficos do dia |
| `/conta` | JWT | Perfil e logout |
| `/irrigation` | JWT | Monitor de irrigação e comandos manuais |
| `/irrigation/settings` | JWT | Configuração das zonas (limiar, duração, histerese) |

Lógica partilhada em `src/app/core/` (serviços, `authGuard`, interceptor HTTP). Constantes de exibição (intervalo de refresh, limiares de tensão, localização) em `src/environments/environment*.ts`.

## Pré-requisitos

- Node.js **22.x** (alinhado ao Docker)
- npm (`packageManager`: `npm@11.6.2`)

## Instalação

```bash
npm ci
```

## Desenvolvimento

```bash
npm start
# ou: ng serve
```

Abre `http://localhost:4200/`. O `proxy.conf.json` encaminha `/api` para o backend configurado (por padrão a API de produção). Para API local, altere o `target` ou use o stack Docker em `api-node/deploy/`.

As URLs da API usam caminho relativo `/api` (`environment.apiUrl`), igual em dev e produção.

## Build de produção

```bash
npm run build
```

Saída em `dist/monitor-ambiental/` (browser + servidor Node).

### Rodar o SSR localmente (após o build)

```bash
npm run serve:ssr
```

Executa `node dist/monitor-ambiental/server/server.mjs`. Porta via `PORT` (padrão **4000**).

## Proxy `/api` em produção

No servidor SSR (`src/server.ts`), pedidos do browser a `/api/*` são reencaminhados para `API_UPSTREAM` com remoção do prefixo `/api`. A API em si nunca vê esse prefixo.

| Variável | Descrição |
|----------|-----------|
| `PORT` | Porta HTTP do Node (padrão `4000`) |
| `API_UPSTREAM` | Backend sem `/api` (ex.: `http://monitor-ambiental-api:8000`) |

## Docker

O frontend é construído pelo `docker-compose.yml` em `api-node/deploy/` (serviço `web`), não por um compose próprio neste repositório. Rede interna `monitor-ambiental-internal`; apenas o nginx (`front`) fica exposto na rede externa `web`.

## Testes

```bash
npm test
# ou: ng test
```

## Formatação

Prettier em `package.json`: `printWidth` 100, aspas simples, parser Angular para HTML.

## Referências

- [Angular CLI](https://angular.dev/tools/cli)
- [Vitest](https://vitest.dev/)
