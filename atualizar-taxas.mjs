// Atualiza dados/taxas.js com as taxas mais recentes de financiamento imobiliário
// publicadas pelo Banco Central (dados abertos, serviço "taxaJuros").
// Uso: node atualizar-taxas.mjs
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const URL_BCB =
  'https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata/TaxasJurosMensalPorMes' +
  "?$top=400&$format=json&$orderby=anoMes%20desc&$filter=contains(Modalidade,'imobili')";

const resp = await fetch(URL_BCB);
if (!resp.ok) throw new Error('Banco Central respondeu ' + resp.status);
const linhas = (await resp.json()).value;
const mes = linhas.map((l) => l.anoMes).sort().pop();
const doMes = linhas.filter((l) => l.anoMes === mes);
if (!doMes.length) throw new Error('Nenhuma taxa retornada');

const destino = join(dirname(fileURLToPath(import.meta.url)), 'dados', 'taxas.js');
// só regrava quando os dados mudaram, para não gerar publicações sem novidade
if (existsSync(destino)) {
  const atual = JSON.parse(readFileSync(destino, 'utf8').replace(/^window\.TAXAS_SNAPSHOT = /, '').replace(/;\s*$/, ''));
  if (atual.mes === mes && JSON.stringify(atual.linhas) === JSON.stringify(doMes)) {
    console.log(`Sem novidade: ${mes} já está em dados/taxas.js`);
    process.exit(0);
  }
}
const snapshot = { geradoEm: new Date().toISOString(), mes, linhas: doMes };
writeFileSync(destino, 'window.TAXAS_SNAPSHOT = ' + JSON.stringify(snapshot, null, 1) + ';\n', 'utf8');
console.log(`OK: ${doMes.length} taxas de ${mes} gravadas em dados/taxas.js`);
