// Compara a saída da versão web com a da versão em Python (referência).
// Uso: npx tsx scripts/comparar.ts dados.txt anexo_python.json
import { readFileSync, writeFileSync } from 'node:fs';
import { lerTxt, lerXlsx } from '../src/entrada';
import { gerarEscala, linhasAnexo, validar } from '../src/escala';
import { planilhaEscala, planilhaModelo } from '../src/saida';

const [arqTxt, arqPy] = process.argv.slice(2);
const sufixo = arqTxt.replace(/^.*\//, '').replace(/\.txt$/, '');
const { config, erros } = lerTxt(readFileSync(arqTxt, 'utf8'));
const tudo = [...erros, ...(config ? validar(config) : [])];
if (!config || tudo.length) { console.log('Erros:\n' + tudo.join('\n')); process.exit(1); }

const { escala, proximo } = gerarEscala(config);
const ts = linhasAnexo(config, escala).map((l) => l.texto);
const py: string[] = JSON.parse(readFileSync(arqPy, 'utf8'));
const dif = ts.map((t, i) => [i, t, py[i]] as const).filter(([, a, b]) => a !== b);
console.log(`TXT -> TS: ${ts.length} linhas; Python: ${py.length}; diferenças: ${dif.length}`);
dif.slice(0, 5).forEach((d) => console.log(d));

// Ida e volta pelo modelo Excel
const modelo = await planilhaModelo(config);
writeFileSync(`scripts/modelo_${sufixo}.xlsx`, Buffer.from(modelo));
const r2 = await lerXlsx(modelo);
const e2 = [...r2.erros, ...(r2.config ? validar(r2.config) : [])];
if (e2.length) { console.log('Erros no modelo:\n' + e2.join('\n')); process.exit(1); }
const ts2 = linhasAnexo(r2.config!, gerarEscala(r2.config!).escala).map((l) => l.texto);
console.log('Modelo Excel -> TS igual ao Python:', JSON.stringify(ts2) === JSON.stringify(py));

writeFileSync(`scripts/escala_${sufixo}.xlsx`, Buffer.from(await planilhaEscala(config, escala)));
writeFileSync(`scripts/proximo_${sufixo}.xlsx`, Buffer.from(await planilhaModelo(config, proximo)));
