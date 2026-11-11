// Datas como objetos Date em UTC (meia-noite), para não sofrer com fuso horário.

export type Dia = Date;

export const dia = (ano: number, mes: number, d: number): Dia => new Date(Date.UTC(ano, mes - 1, d));

export const somaDias = (d: Dia, n: number): Dia =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

/** Dia da semana no padrão do Python: segunda = 0 ... domingo = 6. */
export const diaSemana = (d: Dia): number => (d.getUTCDay() + 6) % 7;

export const chave = (d: Dia): string => d.toISOString().slice(0, 10);

const p2 = (n: number) => String(n).padStart(2, '0');

export const fmt = (d: Dia): string =>
  `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;

export const fmtCurto = (d: Dia): string => `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}`;

export const mesmoDia = (a: Dia, b: Dia) => a.getTime() === b.getTime();

// ------------------------------------------------------------- datas móveis

export function pascoa(ano: number): Dia {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const k1 = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * k1) / 451);
  const mes = Math.floor((h + k1 - 7 * m + 114) / 31);
  const dd = 1 + ((h + k1 - 7 * m + 114) % 31);
  return dia(ano, mes, dd);
}

export const carnaval = (ano: number) => somaDias(pascoa(ano), -47); // terça-feira
export const corpusChristi = (ano: number) => somaDias(pascoa(ano), 60);

export function segundoDomingo(ano: number, mes: number): Dia {
  const d1 = dia(ano, mes, 1);
  return somaDias(d1, 13 - diaSemana(d1));
}

export const cirio = (ano: number) => segundoDomingo(ano, 10);
export const recirio = (ano: number) => somaDias(cirio(ano), 14);

// ------------------------------------------------------- listas de datas

export type ItemData = [Dia, string];

export function feriadosNacionais(ano: number): ItemData[] {
  const fixos: [number, number, string][] = [
    [1, 1, 'Confraternização Universal'], [21, 4, 'Tiradentes'], [1, 5, 'Dia do Trabalho'],
    [7, 9, 'Independência do Brasil'], [12, 10, 'Nossa Senhora Aparecida'], [2, 11, 'Finados'],
    [15, 11, 'Proclamação da República'], [20, 11, 'Dia Nacional de Zumbi e da Consciência Negra'],
    [25, 12, 'Natal'],
  ];
  const r: ItemData[] = fixos.map(([d, m, n]) => [dia(ano, m, d), n]);
  const p = pascoa(ano);
  r.push(
    [carnaval(ano), 'Carnaval'],
    [somaDias(carnaval(ano), 1), 'Quarta-feira de Cinzas'],
    [somaDias(p, -3), 'Quinta-Feira Santa'],
    [somaDias(p, -2), 'Sexta-Feira Santa'],
    [p, 'Páscoa'],
    [corpusChristi(ano), 'Corpus Christi'],
  );
  return r;
}

/** Feriados estaduais já cadastrados. Outros estados: informar na aba "Datas locais". */
export const FERIADOS_ESTADUAIS: Record<string, [number, number, string][]> = {
  PA: [[15, 8, 'Adesão do Pará à Independência']],
};

/** Usado apenas na importação do dados.txt antigo. */
export const FERIADOS_MUNICIPAIS: Record<string, [number, number, string][]> = {
  'Maraba/PA': [[5, 4, 'Aniversário da Cidade'], [20, 11, 'São Félix do Valois - Padroeiro']],
};

export function feriadosEstaduais(ano: number, uf: string): ItemData[] {
  const r: ItemData[] = (FERIADOS_ESTADUAIS[uf] ?? []).map(([d, m, n]) => [dia(ano, m, d), n]);
  if (uf === 'PA') {
    // Círio e Recírio caem em domingo; a segunda-feira seguinte é facultada.
    r.push([somaDias(cirio(ano), 1), 'Ponto facultativo (Círio de Nazaré)']);
    r.push([somaDias(recirio(ano), 1), 'Ponto facultativo (Recírio)']);
  }
  return r;
}

export function datasRelevantes(ano: number, uf: string): ItemData[] {
  const r: ItemData[] = [
    [segundoDomingo(ano, 5), 'Dia das Mães'],
    [segundoDomingo(ano, 8), 'Dia dos Pais'],
    [dia(ano, 8, 11), 'Dia do Advogado'],
    [dia(ano, 10, 28), 'Dia do Servidor Público'],
    [dia(ano, 12, 8), 'Dia da Justiça'],
  ];
  if (uf === 'PA') r.push([cirio(ano), 'Círio de Nazaré'], [recirio(ano), 'Recírio']);
  return r;
}

export type TipoData = 'Feriado' | 'Ponto facultativo' | 'Data comemorativa';
export const TIPOS_DATA: TipoData[] = ['Feriado', 'Ponto facultativo', 'Data comemorativa'];

export interface DataLocal {
  data: Dia;
  descricao: string;
  tipo: TipoData;
}

/**
 * Junta todas as datas em um mapa (chave ISO -> descrições), ordenado por data.
 * Um ponto facultativo numa data que já é feriado não gera observação extra.
 */
export function calendario(anos: number[], uf: string, locais: DataLocal[]): Map<string, string[]> {
  const cal = new Map<string, string[]>();
  const add = (d: Dia, nome: string) => {
    const k = chave(d);
    const nomes = cal.get(k) ?? [];
    if (!nomes.includes(nome)) nomes.push(nome);
    cal.set(k, nomes);
  };
  const feriados: ItemData[] = [];
  for (const ano of anos) feriados.push(...feriadosNacionais(ano), ...feriadosEstaduais(ano, uf));
  for (const l of locais) if (l.tipo === 'Feriado') feriados.push([l.data, l.descricao]);
  feriados.forEach(([d, n]) => add(d, n));

  const diasFeriado = new Set(feriados.map(([d]) => chave(d)));
  for (const l of locais)
    if (l.tipo === 'Ponto facultativo' && !diasFeriado.has(chave(l.data)))
      add(l.data, l.descricao || 'Ponto facultativo');

  for (const ano of anos) datasRelevantes(ano, uf).forEach(([d, n]) => add(d, n));
  for (const l of locais) if (l.tipo === 'Data comemorativa') add(l.data, l.descricao);

  return new Map([...cal.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
