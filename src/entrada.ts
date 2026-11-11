import type ExcelJS from 'exceljs';
import { DataLocal, Dia, dia, FERIADOS_MUNICIPAIS, somaDias, TIPOS_DATA, TipoData } from './datas';
import { Config, PADROES, Pessoa, Vara } from './escala';

export interface Leitura {
  config: Config | null;
  erros: string[];
}

// ------------------------------------------------------------ utilitários

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function lerDataTexto(texto: string, anoPadrao?: number): Dia | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!m) return null;
  let ano = m[3] ? Number(m[3]) : anoPadrao;
  if (ano === undefined) return null;
  if (ano < 100) ano += 2000;
  const d = dia(ano, Number(m[2]), Number(m[1]));
  return d.getUTCDate() === Number(m[1]) && d.getUTCMonth() + 1 === Number(m[2]) ? d : null;
}

// ------------------------------------------------- dados.txt (formato antigo)

function lerSecoes(texto: string): Record<string, string[]> {
  const secoes: Record<string, string[]> = {};
  let atual: string | null = null;
  for (const bruta of texto.replace(/^﻿/, '').split(/\r?\n/)) {
    const s = bruta.trim();
    if (s.startsWith('[') && s.endsWith(']')) {
      atual = s.slice(1, -1).trim().toUpperCase();
      secoes[atual] = [];
    } else if (atual !== null) secoes[atual].push(s);
  }
  for (const linhas of Object.values(secoes)) {
    while (linhas.length && !linhas[0]) linhas.shift();
    while (linhas.length && !linhas[linhas.length - 1]) linhas.pop();
  }
  return secoes;
}

/**
 * Lê um nome com marcadores: "*" no fim = próximo da vez; "(F)" ou "_a" no fim = feminino.
 * Aspas em volta (formato antigo) são ignoradas.
 */
export function lerNome(bruto: string): { pessoa: Pessoa | null; proximo: boolean } {
  let nome = bruto.trim();
  let feminino = false, proximo = false, mudou = true;
  while (mudou) {
    mudou = false;
    if (/^'|'$/.test(nome)) { nome = nome.replace(/^'+|'+$/g, '').trim(); mudou = true; }
    if (nome.endsWith('*')) { nome = nome.slice(0, -1).trimEnd(); proximo = mudou = true; }
    if (nome.endsWith('_a')) { nome = nome.slice(0, -2).trimEnd(); feminino = mudou = true; }
    if (/\(f\)$/i.test(nome)) { nome = nome.slice(0, -3).trimEnd(); feminino = mudou = true; }
  }
  return { pessoa: nome && nome !== '-' ? { nome, feminino } : null, proximo };
}

/** Lê uma lista de nomes separados por ";" e indica quem é o próximo da vez. */
export function lerNomes(celula: string, rotulo: string, erros: string[]): { pessoas: Pessoa[]; proximo: number } {
  const pessoas: Pessoa[] = [];
  let proximo = 0, marcados = 0;
  for (const parte of celula.split(';')) {
    const { pessoa, proximo: marcado } = lerNome(parte);
    if (!pessoa) continue;
    if (marcado) { proximo = pessoas.length; marcados++; }
    pessoas.push(pessoa);
  }
  if (marcados > 1) erros.push(`${rotulo}: mais de um nome marcado com * como próximo da vez.`);
  return { pessoas, proximo };
}

const pessoaTxt = (bruto: string) => lerNome(bruto).pessoa;

export function lerTxt(texto: string): Leitura {
  const s = lerSecoes(texto);
  const erros: string[] = [];
  const um = (k: string) => (s[k] && s[k][0]) || '';

  const ano = Number(um('ANO'));
  const passo = Number(um('PASSO'));
  if (!Number.isInteger(ano) || ano < 1900) erros.push('[ANO] ausente ou inválido.');
  if (!um('PASSO') || !Number.isInteger(passo)) erros.push('[PASSO] ausente ou inválido.');
  const inicio = lerDataTexto(um('DATA INICIAL'), ano);
  const fim = lerDataTexto(um('DATA FINAL'), ano);
  if (!inicio) erros.push('[DATA INICIAL] ausente ou inválida.');
  if (!fim) erros.push('[DATA FINAL] ausente ou inválida.');

  const varas = s['VARAS'] ?? [];
  const listas: [string, string[]][] = [
    ['MAGISTRADOS', s['MAGISTRADOS'] ?? []], ['TELEFONES', s['TELEFONES'] ?? []],
    ['SERVIDORES', s['SERVIDORES'] ?? []], ['ASSESSORES', s['ASSESSORES'] ?? []],
  ];
  for (const [rotulo, l] of listas)
    if (l.length !== varas.length)
      erros.push(`[${rotulo}] tem ${l.length} linha(s), mas [VARAS] tem ${varas.length}. ` +
        'Cada linha deve corresponder à vara na mesma posição.');
  if (erros.length) return { config: null, erros };

  const [mag, tel, serv, ass] = listas.map(([, l]) => l);
  const lista: Vara[] = varas.map((nome, i) => {
    const sv = lerNomes(serv[i], `[SERVIDORES], linha ${i + 1}`, erros);
    const as = lerNomes(ass[i], `[ASSESSORES], linha ${i + 1}`, erros);
    return {
      nome,
      magistrado: pessoaTxt(mag[i]) ?? { nome: '', feminino: false },
      telefone: tel[i],
      servidores: sv.pessoas,
      assessores: as.pessoas,
      proximoServidor: sv.proximo,
      proximoAssessor: as.proximo,
    };
  });

  const datasLocais: DataLocal[] = [];
  const municipio = um('MUNICIPIO') || 'Maraba/PA';
  for (const [d, m, n] of FERIADOS_MUNICIPAIS[municipio] ?? [])
    datasLocais.push({ data: dia(ano, m, d), descricao: n, tipo: 'Feriado' });
  for (const linha of s['PONTOS FACULTATIVOS'] ?? []) {
    if (!linha) continue;
    const [data, extraBruto = ''] = linha.split(';');
    const d = lerDataTexto(data, ano);
    if (!d) { erros.push(`Ponto facultativo com data inválida: "${linha}".`); continue; }
    const extra = extraBruto.trim();
    const dias = /^\d+$/.test(extra) ? Number(extra) : 0;
    const descricao = /^\d+$/.test(extra) || !extra ? 'Ponto facultativo' : extra;
    for (let i = 0; i <= dias; i++) {
      const data = somaDias(d, i);
      const jaFeriado = datasLocais.some((x) => x.tipo === 'Feriado' && x.data.getTime() === data.getTime());
      if (!jaFeriado) datasLocais.push({ data, descricao, tipo: 'Ponto facultativo' });
    }
  }

  return {
    erros,
    config: {
      comarca: um('COMARCA') || PADROES.comarca,
      uf: (um('UF') || PADROES.uf).toUpperCase(),
      portaria: um('PORTARIA'),
      inicio, fim,
      varaInicial: um('VARA INICIAL'),
      passo,
      endereco: um('ENDERECO') || PADROES.endereco,
      horarioSemana: um('HORARIO SEMANA') || PADROES.horarioSemana,
      horarioFimDeSemana: um('HORARIO FIM DE SEMANA') || PADROES.horarioFimDeSemana,
      oficialJustica: um('OFICIAL DE JUSTICA') || PADROES.oficialJustica,
      varas: lista,
      datasLocais,
    },
  };
}

// ------------------------------------------------------- modelo em Excel

/** Nomes das abas e campos do modelo; compartilhados com saida.ts. */
export const ABAS = {
  config: 'Configuração',
  varas: 'Varas',
  datas: 'Datas locais',
  instrucoes: 'Instruções',
};

export const CAMPOS: { chave: keyof Config; rotulo: string; ajuda: string }[] = [
  { chave: 'comarca', rotulo: 'Título da comarca', ajuda: 'Aparece no cabeçalho. Ex.: COMARCA DE MARABÁ - ESTADO DO PARÁ' },
  { chave: 'uf', rotulo: 'UF', ajuda: 'Sigla do estado. Para PA os feriados estaduais já estão incluídos; para outros, use a aba "Datas locais".' },
  { chave: 'portaria', rotulo: 'Portaria nº', ajuda: 'Ex.: 123/2027' },
  { chave: 'inicio', rotulo: 'Data inicial', ajuda: 'Primeiro dia da escala (dd/mm/aaaa).' },
  { chave: 'fim', rotulo: 'Data final', ajuda: 'Último dia da escala (dd/mm/aaaa).' },
  { chave: 'varaInicial', rotulo: 'Vara inicial', ajuda: 'Vara que abre a escala (escolha na lista). Deve constar na aba "Varas".' },
  { chave: 'passo', rotulo: 'Passo', ajuda: 'Distância, na lista de varas, entre a vara da semana e a do fim de semana.' },
  { chave: 'endereco', rotulo: 'Local de atendimento presencial', ajuda: '' },
  { chave: 'horarioSemana', rotulo: 'Horário (semana)', ajuda: 'Texto após "Atendimento presencial:" nos plantões de segunda a quinta.' },
  { chave: 'horarioFimDeSemana', rotulo: 'Horário (final de semana)', ajuda: 'Texto após "Atendimento presencial:" nos plantões de sexta a domingo.' },
  { chave: 'oficialJustica', rotulo: 'Oficial de Justiça', ajuda: 'Texto da linha "Oficial de Justiça:".' },
];

function texto(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(v.getUTCDate())}/${p(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
  }
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim();
    if ('text' in v) return String(v.text).trim();
    if ('result' in v) return texto(v.result as ExcelJS.CellValue);
    return '';
  }
  return String(v).trim();
}

function data(v: ExcelJS.CellValue): Dia | null {
  if (v && typeof v === 'object' && 'result' in v) v = v.result as ExcelJS.CellValue;
  if (v instanceof Date) return dia(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400000)); // número de série do Excel
  return lerDataTexto(texto(v));
}

/** "Juíza", "Servidora", "F" ou "Feminino" indicam tratamento no feminino. */
const generoFem = (s: string) => ['f', 'fem', 'feminino', 'juiza', 'servidora', 'magistrada'].includes(semAcento(s));

/** Linhas de dados de uma aba (a partir da 2ª linha), sem linhas totalmente vazias. */
function linhas(ws: ExcelJS.Worksheet, colunas: number): { n: number; c: ExcelJS.CellValue[] }[] {
  const r: { n: number; c: ExcelJS.CellValue[] }[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const c = Array.from({ length: colunas }, (_, i) => row.getCell(i + 1).value);
    if (c.some((x) => texto(x) !== '')) r.push({ n, c });
  });
  return r;
}

export async function lerXlsx(buffer: ArrayBuffer): Promise<Leitura> {
  const { default: Excel } = await import('exceljs');
  const wb = new Excel.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    return { config: null, erros: ['Não foi possível abrir a planilha. Verifique se é um arquivo .xlsx válido.'] };
  }
  const erros: string[] = [];
  const aba = (nome: string) => {
    const ws = wb.worksheets.find((w) => semAcento(w.name) === semAcento(nome));
    if (!ws) erros.push(`A planilha não tem a aba "${nome}". Use o modelo disponível no site.`);
    return ws;
  };
  const wsC = aba(ABAS.config), wsV = aba(ABAS.varas), wsD = aba(ABAS.datas);
  if (!wsC || !wsV) return { config: null, erros };

  // Configuração: coluna A = campo, coluna B = valor
  const valores = new Map<string, ExcelJS.CellValue>();
  wsC.eachRow((row) => valores.set(semAcento(texto(row.getCell(1).value)), row.getCell(2).value));
  const campo = (rotulo: string) => valores.get(semAcento(rotulo)) ?? null;
  const rot = (k: keyof Config) => CAMPOS.find((c) => c.chave === k)!.rotulo;

  const inicio = data(campo(rot('inicio')));
  const fim = data(campo(rot('fim')));
  if (!inicio) erros.push(`${ABAS.config}: "${rot('inicio')}" ausente ou inválida.`);
  if (!fim) erros.push(`${ABAS.config}: "${rot('fim')}" ausente ou inválida.`);
  const passoTxt = texto(campo(rot('passo')));
  const passo = Number(passoTxt);
  if (!passoTxt || !Number.isInteger(passo)) erros.push(`${ABAS.config}: "Passo" deve ser um número inteiro.`);

  // Varas: Vara | Magistrado(a) | Juiz/Juíza | Telefone | Servidores | Assessores
  const varas: Vara[] = linhas(wsV, 6).map(({ n, c }) => {
    const nome = texto(c[0]);
    const sv = lerNomes(texto(c[4]), `${ABAS.varas}, linha ${n} (servidores)`, erros);
    const as = lerNomes(texto(c[5]), `${ABAS.varas}, linha ${n} (assessores)`, erros);
    return {
      nome,
      magistrado: { nome: texto(c[1]), feminino: generoFem(texto(c[2])) },
      telefone: texto(c[3]),
      servidores: sv.pessoas,
      assessores: as.pessoas,
      proximoServidor: sv.proximo,
      proximoAssessor: as.proximo,
    };
  });

  // Datas locais: Data | Descrição | Tipo
  const datasLocais: DataLocal[] = [];
  if (wsD)
    for (const { n, c } of linhas(wsD, 3)) {
      const d = data(c[0]);
      const tipoTxt = semAcento(texto(c[2]));
      const tipo = TIPOS_DATA.find((t) => semAcento(t) === tipoTxt) ?? (tipoTxt ? null : 'Ponto facultativo');
      if (!d) { erros.push(`${ABAS.datas}, linha ${n}: data inválida.`); continue; }
      if (!tipo) { erros.push(`${ABAS.datas}, linha ${n}: tipo "${texto(c[2])}" desconhecido. Use: ${TIPOS_DATA.join(', ')}.`); continue; }
      datasLocais.push({ data: d, descricao: texto(c[1]) || tipo, tipo: tipo as TipoData });
    }

  return {
    erros,
    config: {
      comarca: texto(campo(rot('comarca'))),
      uf: texto(campo(rot('uf'))).toUpperCase(),
      portaria: texto(campo(rot('portaria'))),
      inicio, fim,
      varaInicial: texto(campo(rot('varaInicial'))),
      passo,
      endereco: texto(campo(rot('endereco'))),
      horarioSemana: texto(campo(rot('horarioSemana'))),
      horarioFimDeSemana: texto(campo(rot('horarioFimDeSemana'))),
      oficialJustica: texto(campo(rot('oficialJustica'))),
      varas,
      datasLocais,
    },
  };
}
