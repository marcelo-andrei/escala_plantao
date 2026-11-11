import './estilo.css';
import { fmt, fmtCurto } from './datas';
import { lerTxt, lerXlsx, Leitura } from './entrada';
import { cabecalhoTexto, Config, gerarEscala, Plantao, resumoPorVara, textoPeriodo, textoPorVara, textoVara, validar } from './escala';
import { configExemplo } from './exemplo';
import { planilhaEscala, planilhaModelo } from './saida';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Quando a página roda como artefato do Claude, downloads diretos são bloqueados e
// é preciso usar a capacidade "downloads". Na Vercel, usa-se o link comum.
type Salvar = { save(r: { filename: string; data: Blob }): Promise<unknown> };
declare global {
  interface Window { claude?: { use(nome: string): Promise<unknown> } }
}
const salvarClaude: Promise<Salvar | null> = window.claude
  ? (window.claude.use('downloads') as Promise<Salvar | null>).catch(() => null)
  : Promise.resolve(null);

async function baixar(dados: ArrayBuffer | string, nome: string, tipo = XLSX_MIME) {
  const blob = new Blob([dados], { type: tipo });
  const viaClaude = await salvarClaude;
  if (viaClaude) {
    try {
      await viaClaude.save({ filename: nome, data: blob });
    } catch (e) {
      const codigo = (e as { code?: string }).code;
      if (codigo !== 'declined') alertaErros([`Não foi possível salvar o arquivo (${codigo ?? 'erro'}).`]);
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

async function ocupado<T>(botao: HTMLButtonElement, tarefa: () => Promise<T>) {
  const texto = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Gerando…';
  try {
    return await tarefa();
  } catch (e) {
    alertaErros([`Falha ao gerar o arquivo: ${(e as Error).message}`]);
  } finally {
    botao.disabled = false;
    botao.textContent = texto;
  }
}

// ----------------------------------------------------------------- estado

let atual: { config: Config; escala: Plantao[] } | null = null;

function alertaErros(erros: string[]) {
  const box = $('erros');
  box.querySelector('ul')!.innerHTML = erros.map((e) => `<li>${esc(e)}</li>`).join('');
  box.hidden = erros.length === 0;
  if (erros.length) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function processar(leitura: Leitura) {
  atual = null;
  $('resultado').hidden = true;
  const erros = [...leitura.erros, ...(leitura.config ? validar(leitura.config) : [])];
  alertaErros(erros);
  if (erros.length || !leitura.config) return;

  const config = leitura.config;
  const { escala } = gerarEscala(config);
  atual = { config, escala };
  mostrar(config, escala);
}

function mostrar(c: Config, escala: Plantao[]) {
  $('r-comarca').textContent = c.comarca;
  $('r-titulo').textContent = `Escala de Plantão Judiciário · Portaria nº ${c.portaria}`;
  $('r-periodo').textContent = `Período: de ${fmt(c.inicio!)} a ${fmt(c.fim!)}`;

  const resumo = resumoPorVara(c, escala);
  const totais = resumo.map((r) => r.semana + r.fimDeSemana);
  const fds = resumo.map((r) => r.fimDeSemana);
  const diasObs = new Set(escala.flatMap((p) => p.observacoes.map(([d]) => d.getTime()))).size;
  $('indicadores').innerHTML = [
    [escala.length, 'plantões'],
    [c.varas.length, 'varas no rodízio'],
    [`${Math.min(...fds)}–${Math.max(...fds)}`, 'finais de semana por vara'],
    [diasObs, 'dias com observação'],
  ].map(([v, r]) => `<div><strong>${v}</strong><span>${r}</span></div>`).join('');

  const pessoas = (l: [string, number][]) =>
    l.length ? l.map(([n, q]) => `${esc(n)} <b>${q}</b>`).join('<br>') : '—';
  $('tabela-resumo').querySelector('tbody')!.innerHTML = resumo.map((r, i) => `
    <tr>
      <td>${esc(r.vara)}</td>
      <td class="num">${r.semana}</td>
      <td class="num">${r.fimDeSemana}</td>
      <td class="num"><strong>${totais[i]}</strong></td>
      <td class="num">${r.diasComObservacao}</td>
      <td class="pessoas">${pessoas(r.porServidor)}</td>
      <td class="pessoas">${pessoas(r.porAssessor)}</td>
    </tr>`).join('');

  $('tabela-escala').querySelector('tbody')!.innerHTML = escala.map((p) => {
    const v = p.vara;
    const obs = p.observacoes.map(([d, n]) => `<span class="obs">${fmtCurto(d)} · ${esc(n)}</span>`).join('');
    return `
    <tr>
      <td class="nowrap">${textoPeriodo(p).replace('somente dia ', '')}</td>
      <td><span class="selo ${p.fimDeSemana ? 'fds' : ''}">${p.fimDeSemana ? 'Fim de semana' : 'Semana'}</span></td>
      <td class="col-vara">${esc(v.nome)}</td>
      <td>${esc(v.magistrado.nome)}<small>${esc(v.telefone)}</small></td>
      <td>${esc(p.servidor.nome)}</td>
      <td>${esc(p.assessor?.nome ?? '—')}</td>
      <td>${obs}</td>
    </tr>`;
  }).join('');

  $('lista-varas').innerHTML = c.varas.map((v, i) => {
    const ps = escala.filter((p) => p.vara === v);
    const itens = ps.map((p) => `
      <li>
        <span class="selo ${p.fimDeSemana ? 'fds' : ''}">${p.fimDeSemana ? 'Fim de semana' : 'Semana'}</span>
        <strong>${textoPeriodo(p).replace('somente dia ', '')}</strong>
        <small>${esc(p.servidor.nome)}${p.assessor ? ' · ' + esc(p.assessor.nome) : ''}${
          p.observacoes.length ? ' · ' + p.observacoes.map(([d, n]) => `${fmtCurto(d)} ${esc(n)}`).join('; ') : ''}</small>
      </li>`).join('');
    return `
      <article class="vara">
        <header>
          <h4>${esc(v.nome)}</h4>
          <button type="button" class="botao-copiar" data-vara="${i}">Copiar</button>
        </header>
        <p class="vara-info">${v.magistrado.feminino ? 'Juíza' : 'Juiz'} ${esc(v.magistrado.nome)} · ${ps.length} plantões</p>
        <ul>${itens || '<li>Sem plantão no período.</li>'}</ul>
      </article>`;
  }).join('');

  ($('filtro') as HTMLInputElement).value = '';
  $('resultado').hidden = false;
  $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ------------------------------------------------------------- eventos

async function abrir(arquivo: File) {
  $('nome-arquivo').textContent = `Arquivo: ${arquivo.name}`;
  const nome = arquivo.name.toLowerCase();
  if (nome.endsWith('.txt')) {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    let texto = new TextDecoder('utf-8').decode(bytes);
    if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(bytes);
    processar(lerTxt(texto));
  } else if (nome.endsWith('.xlsx')) {
    processar(await lerXlsx(await arquivo.arrayBuffer()));
  } else {
    alertaErros(['Formato não reconhecido. Envie a planilha do modelo (.xlsx) ou o dados.txt.']);
  }
}

const entrada = $('arquivo') as HTMLInputElement;
const area = $('area-envio');
entrada.addEventListener('change', () => {
  if (entrada.files?.[0]) abrir(entrada.files[0]);
  entrada.value = '';
});
area.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.click(); }
});
area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('arrastando'); });
area.addEventListener('dragleave', () => area.classList.remove('arrastando'));
area.addEventListener('drop', (e) => {
  e.preventDefault();
  area.classList.remove('arrastando');
  const f = e.dataTransfer?.files[0];
  if (f) abrir(f);
});

$('baixar-modelo').addEventListener('click', (e) =>
  ocupado(e.currentTarget as HTMLButtonElement, async () =>
    baixar(await planilhaModelo(configExemplo()), 'Modelo - Escala de Plantao.xlsx')));

$('baixar-escala').addEventListener('click', (e) => {
  if (!atual) return;
  const { config, escala } = atual;
  ocupado(e.currentTarget as HTMLButtonElement, async () =>
    baixar(await planilhaEscala(config, escala), `Plantao Judiciario ${config.inicio!.getUTCFullYear()} - Anexo 1.xlsx`));
});

$('baixar-texto').addEventListener('click', (e) => {
  if (!atual) return;
  const { config, escala } = atual;
  ocupado(e.currentTarget as HTMLButtonElement, async () =>
    baixar(textoPorVara(config, escala), `Plantao por vara - ${config.inicio!.getUTCFullYear()}.txt`, 'text/plain;charset=utf-8'));
});

// Copiar o texto de uma vara (para colar no WhatsApp)
$('lista-varas').addEventListener('click', async (e) => {
  const botao = (e.target as HTMLElement).closest('button[data-vara]') as HTMLButtonElement | null;
  if (!botao || !atual) return;
  const vara = atual.config.varas[Number(botao.dataset.vara)];
  const texto = cabecalhoTexto(atual.config) + '\n\n' + textoVara(vara, atual.escala);
  const original = botao.textContent;
  try {
    await navigator.clipboard.writeText(texto);
    botao.textContent = 'Copiado ✓';
  } catch {
    botao.textContent = 'Não foi possível copiar';
  }
  setTimeout(() => (botao.textContent = original), 1800);
});

$('filtro').addEventListener('input', (e) => {
  const termo = (e.target as HTMLInputElement).value.trim().toLowerCase();
  $('tabela-escala').querySelectorAll('tbody tr').forEach((tr) => {
    (tr as HTMLElement).hidden = !!termo && !tr.textContent!.toLowerCase().includes(termo);
  });
});
