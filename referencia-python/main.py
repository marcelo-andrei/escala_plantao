"""Gera a escala de plantão judiciário (Anexo 1) em planilha Excel."""
import datetime as dt
import sys
from dataclasses import dataclass

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font

from rotinasext import calendario, fmt, ler_secoes

ARQUIVO_DADOS = 'dados.txt'
LARGURA_LINHA = 96

# Valores usados quando a seção correspondente não existe no dados.txt
PADROES = {
    'COMARCA': 'COMARCA DE MARABÁ - ESTADO DO PARÁ',
    'UF': 'PA',
    'MUNICIPIO': 'Maraba/PA',
    'ENDERECO': 'Rua Transamazônica, S/N, Bairro Amapá, Fórum de Marabá',
    'HORARIO SEMANA': 'das 14h às 17h (segunda-feira a sexta-feira) e das 08h às 14h (feriados)',
    'HORARIO FIM DE SEMANA': 'das 14h às 17h (sexta-feira) e das 08h às 14h (sábado, domingo e feriado)',
    'OFICIAL DE JUSTICA': 'Conforme relação em anexo a esta portaria',
}

# Dias a somar até o fim do período, conforme o dia da semana em que começa.
# Semana: segunda a quinta. Fim de semana: sexta a domingo.
FIM_DO_PERIODO = {0: 3, 1: 2, 2: 1, 3: 0, 4: 2, 5: 1, 6: 0}


class ErroDados(Exception):
    pass


@dataclass
class Plantao:
    inicio: dt.date
    fim: dt.date
    fim_de_semana: bool
    vara: str
    magistrado: str
    telefone: str
    servidor: str
    assessor: str
    observacoes: list

    @property
    def texto_periodo(self):
        if self.inicio == self.fim:
            return f'somente dia {fmt(self.inicio)}'
        return f'de {fmt(self.inicio)} a {fmt(self.fim)}'


# ------------------------------------------------------------------- leitura

def _partes(nome):
    """Separa o nome dos marcadores: '*' (próximo da vez) e '_a' ou '(F)' (feminino)."""
    nome = nome.strip().strip("'").strip()
    proximo = fem = False
    mudou = True
    while mudou:
        mudou = False
        if nome[:1] == "'" or nome[-1:] == "'":
            nome, mudou = nome.strip("'").strip(), True
        if nome.endswith('*'):
            nome, proximo, mudou = nome[:-1].rstrip(), True, True
        if nome.endswith('_a'):
            nome, fem, mudou = nome[:-2].rstrip(), True, True
        if nome.upper().endswith('(F)'):
            nome, fem, mudou = nome[:-3].rstrip(), True, True
    return nome, fem, proximo


def feminino(nome):
    return _partes(nome)[1]


def limpa(nome):
    return _partes(nome)[0]


def proximo_da_vez(nome):
    return _partes(nome)[2]


def lista_nomes(linha):
    """Nomes separados por ';' (linha vazia ou '-' = nenhum)."""
    return [n.strip() for n in linha.split(';') if limpa(n) not in ('', '-')]


def ler_data(texto, ano, rotulo):
    partes = texto.strip().split('/')
    try:
        if len(partes) == 2:
            return dt.date(ano, int(partes[1]), int(partes[0]))
        return dt.date(int(partes[2]), int(partes[1]), int(partes[0]))
    except (ValueError, IndexError):
        raise ErroDados(f'{rotulo}: data inválida "{texto}".')


def ler_pontos_facultativos(linhas, ano):
    """Aceita 'dd/mm/aaaa' ou 'dd/mm/aaaa;descrição'.

    Para compatibilidade com o formato antigo, um número após o ';' é lido
    como quantidade de dias facultados a mais.
    """
    pontos = []
    for linha in linhas:
        if not linha:
            continue
        data, _, extra = linha.partition(';')
        d = ler_data(data, ano, 'Ponto facultativo')
        extra = extra.strip()
        if extra.isdigit():
            dias, nome = int(extra), 'Ponto facultativo'
        else:
            dias, nome = 0, extra or 'Ponto facultativo'
        for i in range(dias + 1):
            pontos.append((d + dt.timedelta(days=i), nome))
    return pontos


def ler_dados(texto):
    s = ler_secoes(texto)

    def unico(chave, obrigatorio=True):
        linhas = s.get(chave)
        if not linhas:
            if obrigatorio and chave not in PADROES:
                raise ErroDados(f'Seção [{chave}] ausente ou vazia.')
            return PADROES.get(chave, '')
        return linhas[0]

    try:
        ano = int(unico('ANO'))
        passo = int(unico('PASSO'))
    except ValueError:
        raise ErroDados('[ANO] e [PASSO] devem ser números inteiros.')

    d = {
        'portaria': unico('PORTARIA'),
        'ano': ano,
        'passo': passo,
        'inicio': ler_data(unico('DATA INICIAL'), ano, '[DATA INICIAL]'),
        'fim': ler_data(unico('DATA FINAL'), ano, '[DATA FINAL]'),
        'vara_inicial': unico('VARA INICIAL'),
        'varas': s.get('VARAS', []),
        'magistrados': s.get('MAGISTRADOS', []),
        'telefones': s.get('TELEFONES', []),
        'servidores': [lista_nomes(l) for l in s.get('SERVIDORES', [])],
        'assessores': [lista_nomes(l) for l in s.get('ASSESSORES', [])],
        'pontos': ler_pontos_facultativos(s.get('PONTOS FACULTATIVOS', []), ano),
    }
    for chave in ('COMARCA', 'UF', 'MUNICIPIO', 'ENDERECO', 'HORARIO SEMANA',
                  'HORARIO FIM DE SEMANA', 'OFICIAL DE JUSTICA'):
        d[chave.lower().replace(' ', '_')] = unico(chave, obrigatorio=False)
    validar(d)
    return d


def validar(d):
    erros = []
    n = len(d['varas'])
    if n == 0:
        erros.append('Nenhuma vara informada em [VARAS].')
    for chave, rotulo in (('magistrados', 'MAGISTRADOS'), ('telefones', 'TELEFONES'),
                          ('servidores', 'SERVIDORES'), ('assessores', 'ASSESSORES')):
        if len(d[chave]) != n:
            erros.append(f'[{rotulo}] tem {len(d[chave])} linha(s), mas [VARAS] tem {n}. '
                         'Cada linha deve corresponder à vara na mesma posição.')
    for i, lista in enumerate(d['servidores']):
        if not lista and i < n:
            erros.append(f'Vara "{d["varas"][i]}" sem servidor em [SERVIDORES].')
        if sum(proximo_da_vez(nome) for nome in lista) > 1:
            erros.append(f'Mais de um servidor marcado com * na linha {i + 1} de [SERVIDORES].')
    for i, lista in enumerate(d['assessores']):
        if sum(proximo_da_vez(nome) for nome in lista) > 1:
            erros.append(f'Mais de um assessor marcado com * na linha {i + 1} de [ASSESSORES].')
    if d['vara_inicial'] not in d['varas']:
        erros.append(f'[VARA INICIAL] "{d["vara_inicial"]}" não consta em [VARAS].')
    if n and d['passo'] % n == 0:
        erros.append(f'[PASSO] não pode ser 0 nem múltiplo do número de varas ({n}).')
    if d['inicio'] > d['fim']:
        erros.append('[DATA INICIAL] posterior à [DATA FINAL].')
    if erros:
        raise ErroDados('\n'.join(erros))


# -------------------------------------------------------------------- escala

def gerar_escala(d):
    n = len(d['varas'])
    cal = calendario(d['ano'], d['uf'], d['municipio'], d['pontos'])

    # Duas sequências independentes que se alternam: a primeira começa na
    # vara inicial e a segunda, "passo" varas adiante.
    i0 = d['varas'].index(d['vara_inicial'])
    seq = [i0, (i0 + d['passo']) % n]

    # Próximo servidor e próximo assessor de cada vara: o marcado com *, ou o primeiro.
    def inicial(listas):
        return [next((k for k, nome in enumerate(l) if proximo_da_vez(nome)), 0) for l in listas]
    vez, vez_ass = inicial(d['servidores']), inicial(d['assessores'])

    escala, atual, v = [], d['inicio'], 0
    while atual <= d['fim']:
        fim = min(atual + dt.timedelta(days=FIM_DO_PERIODO[atual.weekday()]), d['fim'])
        i = seq[v]
        servidores = d['servidores'][i]
        escala.append(Plantao(
            inicio=atual, fim=fim,
            fim_de_semana=atual.weekday() >= 4,
            vara=d['varas'][i],
            magistrado=d['magistrados'][i],
            telefone=d['telefones'][i],
            servidor=servidores[vez[i]],
            assessor=d['assessores'][i][vez_ass[i]] if d['assessores'][i] else '',
            observacoes=[(dia, nome) for dia, nomes in cal.items()
                         if atual <= dia <= fim for nome in nomes],
        ))
        vez[i] = (vez[i] + 1) % len(servidores)
        if d['assessores'][i]:
            vez_ass[i] = (vez_ass[i] + 1) % len(d['assessores'][i])
        seq[v] = (i + 1) % n
        v = 1 - v
        atual = fim + dt.timedelta(days=1)

    return escala, vez, vez_ass


# -------------------------------------------------------------------- saídas

def linhas_observacoes(obs):
    """Quebra as observações em linhas de até LARGURA_LINHA caracteres."""
    itens = [f'{dia:%d/%m}-{nome}' for dia, nome in obs]
    linhas = ['Observações: ' + itens[0]]
    for item in itens[1:]:
        if len(linhas[-1]) + len(item) + 2 > LARGURA_LINHA:
            linhas[-1] += ';'
            linhas.append(item)
        else:
            linhas[-1] += '; ' + item
    return linhas


def montar_anexo(d, escala):
    anexo = ['ANEXO 1', '', d['comarca'],
             f'ESCALA DE PLANTÃO JUDICIÁRIO - PORTARIA Nº {d["portaria"]}',
             f'Período: de {fmt(d["inicio"])} a {fmt(d["fim"])}', '']
    for p in escala:
        juiz = 'Juíza' if feminino(p.magistrado) else 'Juiz'
        serv = 'Servidora' if feminino(p.servidor) else 'Servidor'
        anexo += [
            p.vara,
            f'{juiz} Responsável: {limpa(p.magistrado)}',
            'Atendimento presencial: ' + (d['horario_fim_de_semana'] if p.fim_de_semana
                                          else d['horario_semana']),
            f'Local de atendimento presencial: {d["endereco"]}',
            f'Fone: {p.telefone}',
            f'{serv} responsável: {limpa(p.servidor)}',
        ]
        if p.assessor:
            ass = 'Servidora' if feminino(p.assessor) else 'Servidor'
            anexo.append(f'{ass} de Gabinete: {limpa(p.assessor)}')
        anexo.append(f'Oficial de Justiça: {d["oficial_de_justica"]}')
        anexo.append(f'Período: {p.texto_periodo} ({"final de semana" if p.fim_de_semana else "semana"})')
        if p.observacoes:
            anexo += linhas_observacoes(p.observacoes)
        anexo.append('')
    return anexo


def salvar_excel(d, anexo, nome_arquivo):
    wb = Workbook()
    ws = wb.active
    ws.title = f'Anexo 1 - {d["ano"]}'
    ws.column_dimensions['A'].width = LARGURA_LINHA
    ws.page_margins.left = ws.page_margins.right = 0.3
    varas = set(d['varas'])
    for j, texto in enumerate(anexo, start=1):
        cel = ws.cell(row=j, column=1, value=texto or None)
        if texto in varas or texto.startswith('Período'):
            cel.font = Font(bold=True)
        if j <= 5:
            cel.alignment = Alignment(horizontal='center')
    wb.save(nome_arquivo)


def salvar_proxima_rodada(texto, d, vez, vez_ass, nome_arquivo):
    """Grava cópia do dados.txt com o * no próximo servidor e assessor de cada vara."""
    def marcar(listas, vez_):
        linhas = []
        for i, lista in enumerate(listas):
            nomes = [limpa(n) + (' (F)' if feminino(n) else '') for n in lista]
            if len(nomes) > 1:
                nomes[vez_[i]] += '*'
            linhas.append(';'.join(nomes))
        return linhas

    novas = {'[SERVIDORES]': marcar(d['servidores'], vez),
             '[ASSESSORES]': marcar(d['assessores'], vez_ass)}
    saida, pular = [], False
    for linha in texto.splitlines():
        s = linha.strip()
        if s.startswith('[') and s.endswith(']'):
            pular = s.upper() in novas
            saida.append(linha)
            if pular:
                saida += novas[s.upper()]
            continue
        if not pular:
            saida.append(linha)
    with open(nome_arquivo, 'w', encoding='utf8') as f:
        f.write('\n'.join(saida) + '\n')


def imprimir_resumo(d, escala):
    print('Por vara (semana / final de semana / dias com observação)')
    for vara in d['varas']:
        ps = [p for p in escala if p.vara == vara]
        sem = sum(not p.fim_de_semana for p in ps)
        fds = sum(p.fim_de_semana for p in ps)
        obs = sum(len({dia for dia, _ in p.observacoes}) for p in ps)
        print(f'{vara}: {sem} / {fds} / {obs}')
        for p in ps:
            print(f'   => {p.texto_periodo} ({"final de semana" if p.fim_de_semana else "semana"})')
    print('\nPor período')
    for p in escala:
        print(f'{p.texto_periodo} => {p.vara}')


def main():
    arquivo = sys.argv[1] if len(sys.argv) > 1 else ARQUIVO_DADOS
    try:
        with open(arquivo, encoding='utf8') as f:
            texto = f.read()
    except FileNotFoundError:
        sys.exit(f'Arquivo de dados "{arquivo}" não encontrado.')
    try:
        d = ler_dados(texto)
    except ErroDados as e:
        sys.exit(f'Erro nos dados:\n{e}')

    escala, vez, vez_ass = gerar_escala(d)
    salvar_excel(d, montar_anexo(d, escala), f'Plantao Judiciario {d["ano"]} - Anexo 1.xlsx')
    salvar_proxima_rodada(texto, d, vez, vez_ass, 'dados_proxima_escala.txt')
    imprimir_resumo(d, escala)


if __name__ == '__main__':
    main()
