import type ExcelJS from 'exceljs';
import { fmt, fmtCurto, TIPOS_DATA } from './datas';
import { ABAS, CAMPOS } from './entrada';
import { Config, LARGURA_LINHA, linhasAnexo, Pessoa, Plantao, Proximos, resumoPorVara, tipoPeriodo } from './escala';

const carregar = async () => (await import('exceljs')).default;

const CABECALHO: Partial<ExcelJS.Style> = {
  font: { bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } },
  alignment: { vertical: 'middle', wrapText: true },
};

function cabecalho(ws: ExcelJS.Worksheet, colunas: { titulo: string; largura: number }[]) {
  ws.columns = colunas.map((c) => ({ header: c.titulo, width: c.largura }));
  ws.getRow(1).eachCell((cel) => {
    cel.font = CABECALHO.font!;
    cel.fill = CABECALHO.fill!;
    cel.alignment = CABECALHO.alignment!;
  });
  ws.getRow(1).height = 30;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function lista(ws: ExcelJS.Worksheet, coluna: string, formula: string, ate = 300) {
  for (let r = 2; r <= ate; r++)
    ws.getCell(`${coluna}${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: [formula], showErrorMessage: true,
      errorTitle: 'Valor inválido', error: 'Escolha um valor da lista.',
    };
}

// ------------------------------------------------------- escala gerada

export async function planilhaEscala(c: Config, escala: Plantao[]): Promise<ArrayBuffer> {
  const Excel = await carregar();
  const wb = new Excel.Workbook();
  const ano = c.inicio!.getUTCFullYear();

  const ws = wb.addWorksheet(`Anexo 1 - ${ano}`, {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 } },
  });
  ws.getColumn(1).width = LARGURA_LINHA;
  linhasAnexo(c, escala).forEach((l, i) => {
    const cel = ws.getCell(i + 1, 1);
    if (l.texto) cel.value = l.texto;
    if (l.negrito) cel.font = { bold: true };
    if (l.centro) cel.alignment = { horizontal: 'center' };
  });

  const wt = wb.addWorksheet('Escala (tabela)');
  cabecalho(wt, [
    { titulo: 'Início', largura: 12 }, { titulo: 'Fim', largura: 12 }, { titulo: 'Tipo', largura: 16 },
    { titulo: 'Vara', largura: 48 }, { titulo: 'Magistrado(a)', largura: 34 }, { titulo: 'Telefone', largura: 17 },
    { titulo: 'Servidor(a) responsável', largura: 34 }, { titulo: 'Servidor(a) de gabinete', largura: 34 },
    { titulo: 'Observações', largura: 60 },
  ]);
  for (const p of escala)
    wt.addRow([fmt(p.inicio), fmt(p.fim), tipoPeriodo(p), p.vara.nome, p.vara.magistrado.nome, p.vara.telefone,
      p.servidor.nome, p.assessor?.nome ?? '', p.observacoes.map(([d, n]) => `${fmtCurto(d)}-${n}`).join('; ')]);
  wt.autoFilter = { from: 'A1', to: 'I1' };

  const wr = wb.addWorksheet('Resumo por vara');
  cabecalho(wr, [
    { titulo: 'Vara', largura: 60 }, { titulo: 'Semana', largura: 10 }, { titulo: 'Final de semana', largura: 12 },
    { titulo: 'Total', largura: 10 }, { titulo: 'Dias com observação', largura: 14 },
    { titulo: 'Plantões por servidor(a)', largura: 60 }, { titulo: 'Plantões por assessor(a)', largura: 60 },
  ]);
  const contagem = (l: [string, number][]) => l.map(([n, q]) => `${n} (${q})`).join('; ');
  for (const r of resumoPorVara(c, escala)) {
    const row = wr.addRow([r.vara, r.semana, r.fimDeSemana, r.semana + r.fimDeSemana, r.diasComObservacao,
      contagem(r.porServidor), contagem(r.porAssessor)]);
    row.alignment = { wrapText: true, vertical: 'top' };
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

// ------------------------------------------------------- modelo de entrada

/**
 * Gera o modelo de entrada preenchido com a configuração informada.
 * Se `proximo` for dado, marca em cada vara o servidor da vez seguinte.
 */
/** Nomes de uma célula: "Fulano; Fulana (F)*" — (F) = feminino, * = próximo da vez. */
function celulaNomes(pessoas: Pessoa[], vez: number): string {
  return pessoas
    .map((p, k) => p.nome + (p.feminino ? ' (F)' : '') + (pessoas.length > 1 && k === vez ? '*' : ''))
    .join('; ');
}

export async function planilhaModelo(c: Config, proximo?: Proximos): Promise<ArrayBuffer> {
  const Excel = await carregar();
  const wb = new Excel.Workbook();

  const wi = wb.addWorksheet(ABAS.instrucoes);
  wi.getColumn(1).width = 110;
  [
    'MODELO DE DADOS - ESCALA DE PLANTÃO JUDICIÁRIO',
    '',
    `1. Aba "${ABAS.config}": preencha a coluna B (portaria, datas, vara inicial, passo e textos do anexo).`,
    `2. Aba "${ABAS.varas}": uma linha por vara, NA ORDEM DO RODÍZIO. A escala percorre as varas nessa ordem.`,
    '   - Servidores: funcionários da secretaria da vara que fazem plantão.',
    '   - Assessores: funcionários do gabinete do(a) juiz(a) que fazem plantão (pode ficar em branco).',
    '   Havendo mais de um, separe os nomes com ponto e vírgula. Eles se revezam, na ordem escrita, a cada',
    '   plantão da vara. Exemplo:  João Lima; Maria Souza (F)*; Pedro Alves',
    '   - "(F)" após o nome indica tratamento no feminino (Servidora).',
    '   - "*" após o nome indica quem pega o primeiro plantão; sem "*", começa pelo primeiro da lista.',
    `3. Aba "${ABAS.datas}": feriados municipais, feriados estaduais de estados ainda não cadastrados,`,
    '   pontos facultativos e outras datas que devam aparecer nas "Observações". Os feriados nacionais,',
    '   as datas móveis (Carnaval, Semana Santa, Corpus Christi) e, no Pará, Círio e Recírio já são incluídos.',
    '',
    'Como funciona o rodízio: os plantões alternam "semana" (segunda a quinta) e "final de semana" (sexta a',
    'domingo). São duas sequências de varas: a de semana começa na vara inicial; a de final de semana começa',
    '"passo" posições adiante. A cada plantão, a sequência correspondente avança uma vara.',
    '',
    'Depois de gerar a escala, o site oferece este modelo já atualizado, com o "*" no próximo servidor e no',
    'próximo assessor de cada vara. Guarde-o para a escala seguinte.',
  ].forEach((t, i) => {
    const cel = wi.getCell(i + 1, 1);
    cel.value = t;
    if (i === 0) cel.font = { bold: true, size: 13 };
  });

  // Configuração
  const wc = wb.addWorksheet(ABAS.config);
  cabecalho(wc, [{ titulo: 'Campo', largura: 32 }, { titulo: 'Valor', largura: 70 }, { titulo: 'Orientação', largura: 80 }]);
  for (const campo of CAMPOS) {
    const v = c[campo.chave];
    const row = wc.addRow([campo.rotulo, v instanceof Date ? v : (v as string | number | null) ?? '', campo.ajuda]);
    row.getCell(1).font = { bold: true };
    row.getCell(3).font = { italic: true, color: { argb: 'FF666666' } };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    if (v instanceof Date || campo.chave === 'inicio' || campo.chave === 'fim') row.getCell(2).numFmt = 'dd/mm/yyyy';
    if (campo.chave === 'varaInicial')
      row.getCell(2).dataValidation = { type: 'list', allowBlank: true, formulae: [`'${ABAS.varas}'!$A$2:$A$300`] };
  }

  // Varas
  const wv = wb.addWorksheet(ABAS.varas);
  cabecalho(wv, [
    { titulo: 'Vara (na ordem do rodízio)', largura: 50 }, { titulo: 'Magistrado(a)', largura: 34 },
    { titulo: 'Juiz/Juíza', largura: 11 }, { titulo: 'Telefone do plantão', largura: 18 },
    { titulo: 'Servidores (separados por ;)', largura: 60 }, { titulo: 'Assessores (separados por ;)', largura: 60 },
  ]);
  c.varas.forEach((v, i) => {
    const row = wv.addRow([v.nome, v.magistrado.nome, v.magistrado.feminino ? 'Juíza' : 'Juiz', v.telefone,
      celulaNomes(v.servidores, proximo ? proximo.servidores[i] : v.proximoServidor),
      celulaNomes(v.assessores, proximo ? proximo.assessores[i] : v.proximoAssessor)]);
    row.alignment = { wrapText: true, vertical: 'top' };
  });
  lista(wv, 'C', '"Juiz,Juíza"');
  wv.getCell('E1').note = 'Funcionários da secretaria da vara. Ex.: João Lima; Maria Souza (F)*\n(F) = feminino; * = próximo da vez.';
  wv.getCell('F1').note = 'Funcionários do gabinete. Ex.: Ana Reis (F); Paulo Melo*\n(F) = feminino; * = próximo da vez. Pode ficar em branco.';

  // Datas locais
  const wd = wb.addWorksheet(ABAS.datas);
  cabecalho(wd, [{ titulo: 'Data', largura: 14 }, { titulo: 'Descrição', largura: 50 }, { titulo: 'Tipo', largura: 20 }]);
  for (const d of [...c.datasLocais].sort((a, b) => a.data.getTime() - b.data.getTime())) {
    const row = wd.addRow([d.data, d.descricao, d.tipo]);
    row.getCell(1).numFmt = 'dd/mm/yyyy';
  }
  for (let r = 2; r <= 300; r++) wd.getCell(`A${r}`).numFmt = 'dd/mm/yyyy';
  lista(wd, 'C', `"${TIPOS_DATA.join(',')}"`);

  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 1, visibility: 'visible' }];
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
