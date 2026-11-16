// Atualiza dados/taxas.js com as taxas mais recentes de financiamento imobiliário
// publicadas pelo Banco Central (dados abertos, serviço "taxaJuros") e VALIDA o que chegou
// antes de gravar. Se algo estiver errado, nada é gravado e o script termina com erro:
// na rotina do GitHub isso faz a execução falhar e o GitHub avisa o dono do repositório por e-mail.
// Uso: node atualizar-taxas.mjs
import { writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const URL_BCB =
  'https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata/TaxasJurosMensalPorMes' +
  "?$top=400&$format=json&$orderby=anoMes%20desc&$filter=contains(Modalidade,'imobili')";

// limites da validação
const MIN_TAXAS = 15;            // linhas no mês (costuma haver mais de 30)
const MIN_INSTITUICOES = 8;      // bancos diferentes
const TAXA_MAX = 40;             // % ao ano; acima disso é erro de dado
const MESES_ATRASO_MAX = 4;      // o BC publica com ~6 semanas; mais que isso é sinal de fonte parada
const SALTO_AVISO = 4;           // pontos percentuais de um mês para o outro, só gera aviso
const OBRIGATORIOS = { '00360305': 'Caixa', '60701190': 'Itaú', '60746948': 'Bradesco', '90400888': 'Santander' };

const avisos = [];
const resumo = (texto) => { console.log(texto); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, texto + '\n\n'); };
const falhar = (motivo) => { resumo(`ERRO na validação das taxas: ${motivo}. Nada foi gravado; o site continua com os dados anteriores.`); process.exit(1); };

async function buscar() {
  let ultimo;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const resp = await fetch(URL_BCB, { signal: AbortSignal.timeout(30000) });
      if (!resp.ok) throw new Error('Banco Central respondeu ' + resp.status);
      const corpo = await resp.json();
      if (!corpo || !Array.isArray(corpo.value)) throw new Error('resposta em formato inesperado');
      return corpo.value;
    } catch (e) {
      ultimo = e;
      console.log(`Tentativa ${tentativa} falhou: ${e.message}`);
      if (tentativa < 3) await new Promise((r) => setTimeout(r, 5000 * tentativa));
    }
  }
  falhar(`não foi possível consultar o Banco Central (${ultimo.message})`);
}

const linhas = await buscar();
const mes = linhas.map((l) => String(l.anoMes)).filter((m) => /^\d{4}-\d{2}$/.test(m)).sort().pop();
if (!mes) falhar('nenhum mês válido na resposta');
const brutas = linhas.filter((l) => l.anoMes === mes);

/* ---------- validação ---------- */
// linha com taxa zerada ou absurda é descartada (acontece na fonte); se forem muitas, a rodada inteira é recusada
const doMes = [];
for (const l of brutas) {
  const aa = Number(l.TaxaJurosAoAno);
  if (!/^\d{8}$/.test(String(l.cnpj8))) { avisos.push(`descartada: CNPJ inválido em "${l.InstituicaoFinanceira}"`); continue; }
  if (!/imobili/i.test(String(l.Modalidade))) { avisos.push(`descartada: modalidade inesperada "${l.Modalidade}"`); continue; }
  if (!(aa > 0 && aa <= TAXA_MAX)) { avisos.push(`descartada: ${l.InstituicaoFinanceira} com ${l.TaxaJurosAoAno}% ao ano (${l.Modalidade})`); continue; }
  doMes.push(l);
}
if (brutas.length - doMes.length > brutas.length * 0.2) falhar(`${brutas.length - doMes.length} de ${brutas.length} linhas de ${mes} são inválidas`);
if (doMes.length < MIN_TAXAS) falhar(`só ${doMes.length} taxas válidas em ${mes} (mínimo ${MIN_TAXAS})`);
const instituicoes = new Set(doMes.map((l) => l.cnpj8));
if (instituicoes.size < MIN_INSTITUICOES) falhar(`só ${instituicoes.size} instituições em ${mes} (mínimo ${MIN_INSTITUICOES})`);
for (const [cnpj, nome] of Object.entries(OBRIGATORIOS)) if (!instituicoes.has(cnpj)) falhar(`${nome} não aparece nos dados de ${mes}`);

const hoje = new Date();
const atraso = (hoje.getUTCFullYear() - +mes.slice(0, 4)) * 12 + (hoje.getUTCMonth() + 1 - +mes.slice(5, 7));
if (atraso < 0) falhar(`mês no futuro: ${mes}`);
if (atraso > MESES_ATRASO_MAX) falhar(`a divulgação mais recente é de ${mes}, ${atraso} meses atrás (o normal são 1 a 2): a fonte parece parada`);

const destino = join(dirname(fileURLToPath(import.meta.url)), 'dados', 'taxas.js');
let atual = null;
if (existsSync(destino)) {
  try { atual = JSON.parse(readFileSync(destino, 'utf8').replace(/^window\.TAXAS_SNAPSHOT = /, '').replace(/;\s*$/, '')); } catch { avisos.push('o arquivo dados/taxas.js anterior não pôde ser lido e será substituído'); }
}
if (atual) {
  if (String(atual.mes) > mes) falhar(`o Banco Central devolveu ${mes}, mais antigo que o que já está no site (${atual.mes})`);
  // só regrava quando os dados mudaram, para não gerar publicações sem novidade
  if (atual.mes === mes && JSON.stringify(atual.linhas) === JSON.stringify(doMes)) {
    resumo(`Taxas conferidas: sem novidade. O site já está com a divulgação mais recente do Banco Central (${mes}, ${doMes.length} taxas de ${instituicoes.size} instituições).`);
    if (avisos.length) resumo('Avisos:\n- ' + avisos.join('\n- '));
    process.exit(0);
  }
  // mudanças grandes de um mês para o outro: não bloqueiam, mas ficam registradas para conferência
  const chave = (l) => `${l.cnpj8}|${l.Modalidade}`;
  const antes = new Map((atual.linhas || []).map((l) => [chave(l), Number(l.TaxaJurosAoAno)]));
  for (const l of doMes) {
    const a = antes.get(chave(l)), n = Number(l.TaxaJurosAoAno);
    if (a && Math.abs(n - a) >= SALTO_AVISO) avisos.push(`${l.InstituicaoFinanceira} (${l.Modalidade}): de ${a}% para ${n}% ao ano`);
  }
}

const snapshot = { geradoEm: new Date().toISOString(), mes, linhas: doMes };
writeFileSync(destino, 'window.TAXAS_SNAPSHOT = ' + JSON.stringify(snapshot, null, 1) + ';\n', 'utf8');
resumo(`OK: ${doMes.length} taxas de ${mes} gravadas em dados/taxas.js (${instituicoes.size} instituições).` +
  (atual ? ` Antes: ${atual.mes}.` : ''));
if (avisos.length) resumo('Avisos para conferir:\n- ' + avisos.join('\n- '));
