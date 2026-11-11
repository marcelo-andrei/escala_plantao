"""Rotinas de datas: feriados, pontos facultativos e datas comemorativas."""
import datetime as dt

UM_DIA = dt.timedelta(days=1)


# ---------------------------------------------------------------- datas móveis

def pascoa(ano: int) -> dt.date:
    a = ano % 19
    b = ano // 100
    c = ano % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    k1 = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * k1) // 451
    mes = (h + k1 - 7 * m + 114) // 31
    dia = 1 + (h + k1 - 7 * m + 114) % 31
    return dt.date(ano, mes, dia)


def carnaval(ano: int) -> dt.date:
    """Terça-feira de Carnaval."""
    return pascoa(ano) - dt.timedelta(days=47)


def corpus_christi(ano: int) -> dt.date:
    return pascoa(ano) + dt.timedelta(days=60)


def segundo_domingo(ano: int, mes: int) -> dt.date:
    d1 = dt.date(ano, mes, 1)
    return d1 + dt.timedelta(days=13 - d1.weekday())


def dia_maes(ano: int) -> dt.date:
    return segundo_domingo(ano, 5)


def dia_pais(ano: int) -> dt.date:
    return segundo_domingo(ano, 8)


def cirio(ano: int) -> dt.date:
    return segundo_domingo(ano, 10)


def recirio(ano: int) -> dt.date:
    return cirio(ano) + dt.timedelta(days=14)


# ------------------------------------------------------------ listas de datas
# Cada função devolve uma lista de (data, descrição). Usar lista em vez de
# dicionário evita que duas datas coincidentes se apaguem.

def feriados_nacionais(ano: int) -> list:
    fixos = [(1, 1, 'Confraternização Universal'), (21, 4, 'Tiradentes'),
             (1, 5, 'Dia do Trabalho'), (7, 9, 'Independência do Brasil'),
             (12, 10, 'Nossa Senhora Aparecida'), (2, 11, 'Finados'),
             (15, 11, 'Proclamação da República'),
             (20, 11, 'Dia Nacional de Zumbi e da Consciência Negra'),
             (25, 12, 'Natal')]
    r = [(dt.date(ano, m, d), nome) for d, m, nome in fixos]
    p = pascoa(ano)
    r += [(carnaval(ano), 'Carnaval'),
          (carnaval(ano) + UM_DIA, 'Quarta-feira de Cinzas'),
          (p - dt.timedelta(days=3), 'Quinta-Feira Santa'),
          (p - dt.timedelta(days=2), 'Sexta-Feira Santa'),
          (p, 'Páscoa'),
          (corpus_christi(ano), 'Corpus Christi')]
    return r


FERIADOS_ESTADUAIS = {
    'PA': [(15, 8, 'Adesão do Pará à Independência')],
}

FERIADOS_MUNICIPAIS = {
    'Maraba/PA': [(5, 4, 'Aniversário da Cidade'),
                  (20, 11, 'São Félix do Valois - Padroeiro')],
}


def feriados_estaduais(ano: int, estado: str = 'PA') -> list:
    r = [(dt.date(ano, m, d), nome) for d, m, nome in FERIADOS_ESTADUAIS.get(estado, [])]
    if estado == 'PA':
        # Círio e Recírio caem em domingo; a segunda-feira seguinte é facultada.
        r.append((cirio(ano) + UM_DIA, 'Ponto facultativo (Círio de Nazaré)'))
        r.append((recirio(ano) + UM_DIA, 'Ponto facultativo (Recírio)'))
    return r


def feriados_municipais(ano: int, cidade: str = 'Maraba/PA') -> list:
    return [(dt.date(ano, m, d), nome) for d, m, nome in FERIADOS_MUNICIPAIS.get(cidade, [])]


def datas_relevantes(ano: int, estado: str = 'PA') -> list:
    r = [(dia_maes(ano), 'Dia das Mães'),
         (dia_pais(ano), 'Dia dos Pais'),
         (dt.date(ano, 8, 11), 'Dia do Advogado'),
         (dt.date(ano, 10, 28), 'Dia do Servidor Público'),
         (dt.date(ano, 12, 8), 'Dia da Justiça')]
    if estado == 'PA':
        r += [(cirio(ano), 'Círio de Nazaré'), (recirio(ano), 'Recírio')]
    return r


def calendario(ano: int, estado: str = 'PA', cidade: str = 'Maraba/PA',
               pontos_facultativos: list = ()) -> dict:
    """Junta tudo em {data: [descrições]}, sem repetir descrições.

    pontos_facultativos: lista de (data, descrição). Um ponto facultativo numa
    data que já é feriado não gera observação extra.
    """
    cal = {}

    def add(d, nome):
        nomes = cal.setdefault(d, [])
        if nome not in nomes:
            nomes.append(nome)

    feriados = feriados_nacionais(ano) + feriados_estaduais(ano, estado) + \
        feriados_municipais(ano, cidade)
    for d, nome in feriados:
        add(d, nome)
    dias_feriado = {d for d, _ in feriados}
    for d, nome in pontos_facultativos:
        if d not in dias_feriado:
            add(d, nome)
    for d, nome in datas_relevantes(ano, estado):
        add(d, nome)
    return dict(sorted(cal.items()))


# ------------------------------------------------------- leitura do dados.txt

def ler_secoes(texto: str) -> dict:
    """Lê o arquivo de dados em {'SEÇÃO': [linhas]}.

    Linhas em branco no início e no fim de cada seção são descartadas, mas as
    do meio são mantidas (uma vara sem assessor pode ter linha vazia).
    """
    secoes, atual = {}, None
    for linha in texto.splitlines():
        s = linha.strip()
        if s.startswith('[') and s.endswith(']'):
            atual = s[1:-1].strip().upper()
            secoes[atual] = []
        elif atual is not None:
            secoes[atual].append(s)
    for k, linhas in secoes.items():
        while linhas and not linhas[0]:
            linhas.pop(0)
        while linhas and not linhas[-1]:
            linhas.pop()
    return secoes


def fmt(d: dt.date) -> str:
    return d.strftime('%d/%m/%Y')
