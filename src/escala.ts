import { calendario, chave, DataLocal, Dia, diaSemana, fmt, fmtCurto, mesmoDia, somaDias } from './datas';

export interface Pessoa {
  nome: string;
  feminino: boolean;
}

export interface Vara {
  nome: string;
  magistrado: Pessoa;
  telefone: string;
  /** Servidores da secretaria da vara que fazem plantão, na ordem do rodízio. */
  servidores: Pessoa[];
  /** Assessores do gabinete que fazem plantão, na ordem do rodízio (pode ser vazio). */
  assessores: Pessoa[];
  /** Índice de quem pega o próximo plantão desta vara. */
  proximoServidor: number;
  proximoAssessor: number;
}

export interface Config {
  comarca: string;
  uf: string;
  portaria: string;
  inicio: Dia | null;
  fim: Dia | null;
  varaInicial: string;
  passo: number;
  endereco: string;
  horarioSemana: string;
  horarioFimDeSemana: string;
  oficialJustica: string;
  varas: Vara[];
  datasLocais: DataLocal[];
}

export const PADROES = {
  comarca: 'COMARCA DE MARABÁ - ESTADO DO PARÁ',
  uf: 'PA',
  endereco: 'Rua Transamazônica, S/N, Bairro Amapá, Fórum de Marabá',
  horarioSemana: 'das 14h às 17h (segunda-feira a sexta-feira) e das 08h às 14h (feriados)',
  horarioFimDeSemana: 'das 14h às 17h (sexta-feira) e das 08h às 14h (sábado, domingo e feriado)',
  oficialJustica: 'Conforme relação em anexo a esta portaria',
};

export const LARGURA_LINHA = 96;

// Dias a somar até o fim do período, conforme o dia da semana em que começa.
// Semana: segunda a quinta. Fim de semana: sexta a domingo.
const FIM_DO_PERIODO = [3, 2, 1, 0, 2, 1, 0];

export interface Plantao {
  inicio: Dia;
  fim: Dia;
  fimDeSemana: boolean;
  vara: Vara;
  servidor: Pessoa;
  assessor: Pessoa | null;
  observacoes: [Dia, string][];
}

export const textoPeriodo = (p: Plantao) =>
  mesmoDia(p.inicio, p.fim) ? `somente dia ${fmt(p.inicio)}` : `de ${fmt(p.inicio)} a ${fmt(p.fim)}`;

export const tipoPeriodo = (p: Plantao) => (p.fimDeSemana ? 'final de semana' : 'semana');

/** Devolve a lista de erros encontrados (vazia se tudo certo). */
export function validar(c: Config): string[] {
  const erros: string[] = [];
  const n = c.varas.length;
  if (!c.portaria) erros.push('Informe o número da portaria.');
  if (!c.inicio) erros.push('Informe a data inicial.');
  if (!c.fim) erros.push('Informe a data final.');
  if (c.inicio && c.fim && c.inicio > c.fim) erros.push('A data inicial é posterior à data final.');
  if (c.inicio && c.fim && c.fim.getUTCFullYear() - c.inicio.getUTCFullYear() > 1)
    erros.push('O período não pode passar de dois anos civis.');
  if (n === 0) erros.push('Nenhuma vara informada.');
  const nomes = new Set<string>();
  c.varas.forEach((v, i) => {
    const ref = `Vara na linha ${i + 1}`;
    if (!v.nome) erros.push(`${ref}: nome da vara em branco.`);
    else if (nomes.has(v.nome)) erros.push(`Vara "${v.nome}" informada mais de uma vez.`);
    nomes.add(v.nome);
    if (!v.magistrado.nome) erros.push(`${v.nome || ref}: magistrado(a) em branco.`);
    if (!v.telefone) erros.push(`${v.nome || ref}: telefone em branco.`);
    if (v.servidores.length === 0) erros.push(`${v.nome || ref}: nenhum servidor cadastrado.`);
  });
  if (n && !c.varas.some((v) => v.nome === c.varaInicial))
    erros.push(`A vara inicial "${c.varaInicial}" não consta na lista de varas.`);
  if (!Number.isInteger(c.passo)) erros.push('O passo deve ser um número inteiro.');
  else if (n && c.passo % n === 0)
    erros.push(`O passo não pode ser 0 nem múltiplo do número de varas (${n}).`);
  return erros;
}

export interface Proximos {
  servidores: number[];
  assessores: number[];
}

export function gerarEscala(c: Config): { escala: Plantao[]; proximo: Proximos } {
  const n = c.varas.length;
  const inicio = c.inicio!, fim = c.fim!;
  const anos: number[] = [];
  for (let a = inicio.getUTCFullYear(); a <= fim.getUTCFullYear(); a++) anos.push(a);
  const cal = calendario(anos, c.uf, c.datasLocais);
  const diasCal = [...cal.entries()];

  // Duas sequências que se alternam: a primeira começa na vara inicial e a
  // segunda, "passo" varas adiante.
  const i0 = c.varas.findIndex((v) => v.nome === c.varaInicial);
  const seq = [i0, (((i0 + c.passo) % n) + n) % n];
  const inicial = (k: number, total: number) => (k >= 0 && k < total ? k : 0);
  const vez = c.varas.map((v) => inicial(v.proximoServidor, v.servidores.length));
  const vezAss = c.varas.map((v) => inicial(v.proximoAssessor, v.assessores.length));

  const escala: Plantao[] = [];
  let atual = inicio, s = 0;
  while (atual <= fim) {
    let ate = somaDias(atual, FIM_DO_PERIODO[diaSemana(atual)]);
    if (ate > fim) ate = fim;
    const i = seq[s];
    const vara = c.varas[i];
    const k0 = chave(atual), k1 = chave(ate);
    escala.push({
      inicio: atual,
      fim: ate,
      fimDeSemana: diaSemana(atual) >= 4,
      vara,
      servidor: vara.servidores[vez[i]],
      assessor: vara.assessores.length ? vara.assessores[vezAss[i]] : null,
      observacoes: diasCal
        .filter(([k]) => k >= k0 && k <= k1)
        .flatMap(([k, nomes]) => nomes.map((nome) => [new Date(k + 'T00:00:00Z'), nome] as [Dia, string])),
    });
    vez[i] = (vez[i] + 1) % vara.servidores.length;
    if (vara.assessores.length) vezAss[i] = (vezAss[i] + 1) % vara.assessores.length;
    seq[s] = (i + 1) % n;
    s = 1 - s;
    atual = somaDias(ate, 1);
  }
  return { escala, proximo: { servidores: vez, assessores: vezAss } };
}

export function linhasObservacoes(obs: [Dia, string][]): string[] {
  const itens = obs.map(([d, n]) => `${fmtCurto(d)}-${n}`);
  const linhas = ['Observações: ' + itens[0]];
  for (const item of itens.slice(1)) {
    if (linhas[linhas.length - 1].length + item.length + 2 > LARGURA_LINHA) {
      linhas[linhas.length - 1] += ';';
      linhas.push(item);
    } else linhas[linhas.length - 1] += '; ' + item;
  }
  return linhas;
}

export type Linha = { texto: string; negrito?: boolean; centro?: boolean };

/** Linhas do Anexo 1, no mesmo formato da versão em Python. */
export function linhasAnexo(c: Config, escala: Plantao[]): Linha[] {
  const L: Linha[] = [
    { texto: 'ANEXO 1', centro: true },
    { texto: '', centro: true },
    { texto: c.comarca, centro: true },
    { texto: `ESCALA DE PLANTÃO JUDICIÁRIO - PORTARIA Nº ${c.portaria}`, centro: true },
    { texto: `Período: de ${fmt(c.inicio!)} a ${fmt(c.fim!)}`, centro: true, negrito: true },
    { texto: '' },
  ];
  const t = (s: string) => L.push({ texto: s });
  for (const p of escala) {
    const v = p.vara;
    L.push({ texto: v.nome, negrito: true });
    t(`${v.magistrado.feminino ? 'Juíza' : 'Juiz'} Responsável: ${v.magistrado.nome}`);
    t('Atendimento presencial: ' + (p.fimDeSemana ? c.horarioFimDeSemana : c.horarioSemana));
    t(`Local de atendimento presencial: ${c.endereco}`);
    t(`Fone: ${v.telefone}`);
    t(`${p.servidor.feminino ? 'Servidora' : 'Servidor'} responsável: ${p.servidor.nome}`);
    if (p.assessor) t(`${p.assessor.feminino ? 'Servidora' : 'Servidor'} de Gabinete: ${p.assessor.nome}`);
    t(`Oficial de Justiça: ${c.oficialJustica}`);
    L.push({ texto: `Período: ${textoPeriodo(p)} (${tipoPeriodo(p)})`, negrito: true });
    if (p.observacoes.length) linhasObservacoes(p.observacoes).forEach(t);
    t('');
  }
  return L;
}

export interface ResumoVara {
  vara: string;
  semana: number;
  fimDeSemana: number;
  diasComObservacao: number;
  periodos: string[];
  /** Quantos plantões cada servidor e cada assessor da vara recebeu. */
  porServidor: [string, number][];
  porAssessor: [string, number][];
}

export function resumoPorVara(c: Config, escala: Plantao[]): ResumoVara[] {
  return c.varas.map((v) => {
    const ps = escala.filter((p) => p.vara === v);
    return {
      vara: v.nome,
      semana: ps.filter((p) => !p.fimDeSemana).length,
      fimDeSemana: ps.filter((p) => p.fimDeSemana).length,
      diasComObservacao: ps.reduce((s, p) => s + new Set(p.observacoes.map(([d]) => chave(d))).size, 0),
      periodos: ps.map((p) => `${textoPeriodo(p)} (${tipoPeriodo(p)})`),
      porServidor: v.servidores.map((s) => [s.nome, ps.filter((p) => p.servidor === s).length]),
      porAssessor: v.assessores.map((a) => [a.nome, ps.filter((p) => p.assessor === a).length]),
    };
  });
}
