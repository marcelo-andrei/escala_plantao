import { dia } from './datas';
import { Config, PADROES } from './escala';

/** Dados fictícios usados no modelo para download. */
export function configExemplo(): Config {
  const ano = new Date().getFullYear() + 1;
  const p = (nome: string, feminino = false) => ({ nome, feminino });
  return {
    comarca: 'COMARCA DE EXEMPLO - ESTADO DO PARÁ',
    uf: 'PA',
    portaria: `000/${ano}`,
    inicio: dia(ano, 1, 7),
    fim: dia(ano, 12, 19),
    varaInicial: '1ª VARA CÍVEL',
    passo: 2,
    endereco: 'Rua Exemplo, nº 100, Centro, Fórum da Comarca',
    horarioSemana: PADROES.horarioSemana,
    horarioFimDeSemana: PADROES.horarioFimDeSemana,
    oficialJustica: PADROES.oficialJustica,
    varas: [
      { nome: '1ª VARA CÍVEL', magistrado: p('Ana Exemplo da Silva', true), telefone: '(91) 90000-0001',
        servidores: [p('Carla Servidora', true), p('Rui Servidor')], assessores: [p('Bruno Assessor')],
        proximoServidor: 0, proximoAssessor: 0 },
      { nome: '2ª VARA CÍVEL', magistrado: p('Daniel Exemplo Souza'), telefone: '(91) 90000-0002',
        servidores: [p('Fábio Servidor'), p('Gabriela Servidora', true), p('Hugo Servidor')],
        assessores: [p('Elisa Assessora', true), p('Saulo Assessor')], proximoServidor: 1, proximoAssessor: 0 },
      { nome: 'VARA CRIMINAL', magistrado: p('Helena Exemplo Lima', true), telefone: '(91) 90000-0003',
        servidores: [p('Igor Servidor')], assessores: [], proximoServidor: 0, proximoAssessor: 0 },
      { nome: 'VARA DA FAMÍLIA', magistrado: p('João Exemplo Costa'), telefone: '(91) 90000-0004',
        servidores: [p('Lucas Servidor'), p('Tânia Servidora', true)], assessores: [p('Karina Assessora', true)],
        proximoServidor: 0, proximoAssessor: 0 },
      { nome: 'VARA DO JUIZADO ESPECIAL', magistrado: p('Marina Exemplo Rocha', true), telefone: '(91) 90000-0005',
        servidores: [p('Olívia Servidora', true)], assessores: [p('Nelson Assessor'), p('Paula Assessora', true)],
        proximoServidor: 0, proximoAssessor: 0 },
    ],
    datasLocais: [
      { data: dia(ano, 4, 5), descricao: 'Aniversário da Cidade', tipo: 'Feriado' },
      { data: dia(ano, 6, 13), descricao: 'Santo Antônio - Padroeiro', tipo: 'Feriado' },
      { data: dia(ano, 2, 8), descricao: 'Segunda-feira de Carnaval', tipo: 'Ponto facultativo' },
    ],
  };
}
