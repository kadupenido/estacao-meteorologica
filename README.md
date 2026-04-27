# Monitor Ambiental — frontend

Interface web do projeto, em [Angular](https://angular.dev/) com **SSR** (renderização no servidor via Express). Geração e build com [Angular CLI](https://angular.dev/tools/cli) 21.x.

## Stack

- Angular 21, TypeScript, SCSS
- `@angular/ssr` + Express — app híbrida e servidor Node em produção
- `chart.js` / `ng2-charts` — gráficos
- Testes unitários: Vitest (`ng test`)
- Container: Node 22 (Alpine), ver `Dockerfile`

## Pré-requisitos

- Node.js compatível com o projeto (recomendado: **22.x**, alinhado ao Docker)
- npm (o repositório fixa `packageManager` em `npm@11.6.2`)

## Instalação

```bash
npm ci
```

## Desenvolvimento

```bash
npm start
# ou: ng serve
```

Abra `http://localhost:4200/`. O servidor recarrega ao alterar os arquivos.

No perfil **development**, as URLs da API estão em `src/environments/environment.development.ts` (por padrão apontam para o backend público). Ajuste conforme necessário para apontar para uma API local.

## Build de produção

```bash
npm run build
```

Saída em `dist/monitor-ambiental/` (browser + servidor Node).

### Rodar o SSR localmente (após o build)

```bash
npm run serve:ssr
```

Equivale a executar `node dist/monitor-ambiental/server/server.mjs`. A porta vem de `PORT` (padrão **4000**).

## Docker

Build multi-stage e execução do servidor SSR na porta **4000**:

```bash
docker compose build
docker compose up
```

O `docker-compose.yml` espera a rede Docker **externa** `web` (mesma rede em que o serviço da API costuma estar, por exemplo `monitor-ambiental-api`). Crie-a se ainda não existir:

```bash
docker network create web
```

Variáveis usadas no compose:

| Variável        | Descrição                                      |
|-----------------|------------------------------------------------|
| `PORT`          | Porta HTTP do Node (padrão `4000`)             |
| `API_UPSTREAM`  | URL base da API sem `/api` (ex.: `http://monitor-ambiental-api:8000`) |

No servidor Node, as requisições do browser para `/api/*` são encaminhadas para `API_UPSTREAM`, com reescrita de caminho (`/api` removido antes do proxy). Ver `src/server.ts`.

## Variáveis de ambiente (SSR / produção)

- **`PORT`** — porta de escuta (padrão `4000`).
- **`API_UPSTREAM`** — backend HTTP alvo do proxy `/api` (padrão no código: `http://monitor-ambiental-api:8000`).

## Testes

```bash
npm test
# ou: ng test
```

## Schematics (Angular CLI)

```bash
ng generate component nome-do-componente
ng generate --help
```

## Referências

- [Angular CLI — visão geral e comandos](https://angular.dev/tools/cli)
- [Vitest](https://vitest.dev/)
