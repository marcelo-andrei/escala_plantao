# Escala de Plantão Judiciário

Site que gera o Anexo 1 da portaria de plantão judiciário (planilha Excel) a partir de uma planilha de dados.
Todo o processamento acontece **no navegador**: não há servidor, banco de dados nem login, e os arquivos
enviados não saem do computador de quem usa.

## Como funciona para o usuário

1. Baixa o **modelo** (`.xlsx`) no site. Ele vem com um exemplo fictício e tem estas abas:
   - **Configuração**: título da comarca, UF, portaria, datas, vara inicial, passo e textos do anexo;
   - **Varas**: uma linha por vara, na ordem do rodízio, com magistrado(a), telefone, **servidores** (secretaria)
     e **assessores** (gabinete). Havendo mais de um, os nomes vão separados por `;` e se revezam a cada plantão
     da vara. `(F)` após o nome indica feminino; `*` indica o próximo da vez. Ex.: `João Lima; Maria Souza (F)*`;
   - **Datas locais**: feriados municipais, pontos facultativos e outras datas para as "Observações".
2. Envia a planilha preenchida (o `dados.txt` da versão antiga também é aceito).
3. Confere a escala na tela, incluindo a distribuição de plantões entre as varas e entre servidores e assessores.
4. Baixa:
   - **a escala** (`.xlsx`), com as abas *Anexo 1*, *Escala (tabela)* e *Resumo por vara*;
   - **o modelo da próxima escala**, com os mesmos dados e o próximo servidor e assessor de cada vara já marcados.

Feriados nacionais, Carnaval, Semana Santa, Corpus Christi e datas comemorativas são calculados automaticamente.
Para a UF `PA` também entram o feriado de 15/08, o Círio, o Recírio e as segundas-feiras facultadas depois deles.
Feriados estaduais de outros estados devem ser lançados em *Datas locais*, ou acrescentados em
`FERIADOS_ESTADUAIS`, no arquivo `src/datas.ts`.

## Rodar no computador

Requer [Node.js](https://nodejs.org) 20 ou superior.

```bash
npm install
npm run dev        # abre em http://localhost:5173
```

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run build` | Gera o site em `dist/` (é o que a Vercel executa) |
| `npm run build:arquivo-unico` | Gera um único `index.html` em `dist-arquivo-unico/`, que funciona aberto direto do disco, sem internet |
| `npm run comparar -- arquivo.txt anexo.json` | Compara a saída do site com a da versão em Python (ver abaixo) |

## Publicar na Vercel

**Opção 1: pelo GitHub (recomendada)**
1. Crie um repositório no GitHub e envie esta pasta (o `.gitignore` já exclui `node_modules` e `dist`).
2. Em [vercel.com](https://vercel.com), clique em **Add New → Project**, importe o repositório e clique em **Deploy**.
   A Vercel detecta o Vite sozinha (Build Command `npm run build`, Output Directory `dist`).
3. Cada `git push` publica uma nova versão automaticamente.

**Opção 2: pela linha de comando**
```bash
npx vercel          # primeira vez: faz login e cria o projeto
npx vercel --prod   # publica em produção
```

## Estrutura

```
index.html            página
src/datas.ts          Páscoa, feriados, datas comemorativas e montagem do calendário
src/escala.ts         validação, rodízio de varas e servidores, linhas do Anexo 1
src/entrada.ts        leitura do modelo .xlsx e do dados.txt antigo
src/saida.ts          geração da planilha da escala e do modelo
src/exemplo.ts        dados fictícios do modelo para download
src/main.ts           interface
src/estilo.css        aparência
scripts/comparar.ts   teste de equivalência com a versão Python
referencia-python/    versão Python corrigida (referência das regras)
```

## Versão em Python (referência)

A pasta `referencia-python/` contém a versão em Python corrigida. Ela serve de referência: qualquer mudança
nas regras deve produzir o mesmo resultado nas duas versões.

```bash
cd referencia-python
uv sync
uv run main.py ../scripts/dados_maraba.txt
```

Para comparar as duas versões:

```bash
cd referencia-python
uv run python -c "import json, main; t = open('../scripts/dados_maraba.txt', encoding='utf8').read(); d = main.ler_dados(t); e, _ = main.gerar_escala(d); json.dump(main.montar_anexo(d, e), open('../scripts/anexo_python.json', 'w'), ensure_ascii=False)"
cd ..
npm run comparar -- scripts/dados_maraba.txt scripts/anexo_python.json
```
