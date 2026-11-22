// Gera tudo o que os buscadores precisam ler sem depender de JavaScript:
//  - uma página por banco (bancos/<nome>.html) e o índice bancos.html, com as taxas do mês
//  - a lista de artigos dentro de blog.html
//  - metadados de compartilhamento e endereço canônico em todas as páginas
//  - sitemap.xml e robots.txt
// Uso: node gerar-seo.mjs   (rode depois de atualizar-taxas.mjs e gerar-blog.mjs)
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const raiz = dirname(fileURLToPath(import.meta.url));
const ler = (p) => readFileSync(join(raiz, p), 'utf8');
const gravar = (p, s) => writeFileSync(join(raiz, p), s, 'utf8');
const dominio = (JSON.parse(ler('site.config.json')).dominio || '').replace(/\/+$/, '');

/* ---------- carrega dados e o mesmo motor de cálculo usado no navegador ---------- */
const ctx = { window: {}, document: { documentElement: { getAttribute: () => '' }, querySelectorAll: () => [] }, console };
ctx.window.window = ctx.window;
vm.createContext(ctx);
for (const arq of ['dados/taxas.js', 'dados/logos-bancos.js', 'dados/links-bancos.js', 'js/posts.js', 'js/comum.js']) {
  vm.runInContext(ler(arq), ctx, { filename: arq });
}
const W = ctx.window, CC = W.CC, f = CC.f, P = CC.PREMISSAS;
const snap = W.TAXAS_SNAPSHOT;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const [ano, mes] = snap.mes.split('-');
const rotuloMes = `${MESES[+mes - 1]} de ${ano}`; // mês dos contratos na última divulgação do Banco Central
// mês vigente (horário de Brasília): vai nos títulos; a rotina diária regrava as páginas quando o mês vira
const [anoAtual, mesAtual] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).split('-');
const rotuloAtual = `${MESES[+mesAtual - 1]} de ${anoAtual}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const SETA = CC.SETA;
const RANKING = 'ranking-taxas-financiamento-imobiliario.html';
const LINHA = { reg: 'SFH (taxas reguladas)', mer: 'SFI (taxas de mercado)' };
const IDX = { tr: 'TR', ipca: 'IPCA', pre: 'Taxa fixa' };
const EX = { imovel: 500000, financiado: 400000, meses: 360, sistema: 'sac', mip: P.mip / 100, dfi: P.dfi / 100, adm: P.adm };
const parcela = (t) => CC.simular({ ...EX, indexAA: t.idx === 'tr' ? P.tr : t.idx === 'ipca' ? P.ipca : 0 }, t.aa).primeira;

/* ---------- normaliza as taxas (mesma regra do navegador) ---------- */
const NOMES = {};
// mesma regra do navegador: ignora linha sem CNPJ válido ou com taxa zerada
const taxas = snap.linhas.filter((l) => /^\d{8}$/.test(String(l.cnpj8)) && Number(l.TaxaJurosAoAno) > 0).map((l) => {
  NOMES[l.cnpj8] = l.InstituicaoFinanceira;
  return {
    id: l.cnpj8,
    linha: /reguladas/.test(l.Modalidade) ? 'reg' : 'mer',
    idx: /Prefixado/.test(l.Modalidade) ? 'pre' : /IPCA/.test(l.Modalidade) ? 'ipca' : 'tr',
    aa: l.TaxaJurosAoAno
  };
});
// nomes amigáveis e avisos vêm do próprio comum.js (BANCOS não é público, então lemos do arquivo)
const BANCOS = vm.runInNewContext('(' + ler('js/comum.js').match(/var BANCOS = (\{[\s\S]*?\n  \});/)[1] + ')');
const nomeDe = (id) => (BANCOS[id] && BANCOS[id].nome) || NOMES[id].replace(/^BCO\b/, 'Banco').replace(/ S\.?A\.?$/, '');
const ids = [...new Set(taxas.map((t) => t.id))];
const pagina = Object.fromEntries(ids.map((id) => [id, `bancos/financiamento-imobiliario-${slug(nomeDe(id))}.html`]));
const ranking = (linha, idx) => taxas.filter((t) => t.linha === linha && t.idx === idx).sort((a, b) => a.aa - b.aa);
const logo = (id, r, classe = '') => W.LOGOS_BANCOS[id]
  ? `<span class="logo-banco ${classe}"><img src="${r}assets/bancos/${W.LOGOS_BANCOS[id]}" alt="${esc(nomeDe(id))}"></span>` : '';

const cabeca = (r, titulo, descricao, tema = '') => `<!doctype html>
<html lang="pt-BR"${r ? ` data-raiz="${r}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<link rel="icon" href="${r}assets/logo.svg" type="image/svg+xml">
<link rel="stylesheet" href="${r}css/site.css">
</head>
<body data-pagina="bancos"${tema ? ` data-tema="${tema}"` : ''}>
<header id="cabecalho"></header>
<main>`;
const pe = (r, script = 'pagina') => `</main>
<footer id="rodape"></footer>
<script src="${r}dados/taxas.js"></script>
<script src="${r}dados/logos-bancos.js"></script>
<script src="${r}dados/links-bancos.js"></script>
<script src="${r}dados/paginas-bancos.js"></script>
<script src="${r}js/comum.js"></script>
<script src="${r}js/${script}.js"></script>
</body>
</html>
`;

// instituições tratadas no feminino ("a Caixa", "a Poupex", "a XP")
const FEMININO = ['00360305', '00655522', '33264668'];
const genero = (id, html) => {
  if (!FEMININO.includes(id)) return html;
  const n = esc(nomeDe(id));
  return html.split(`O ${n}`).join(`A ${n}`).split(` o ${n}`).join(` a ${n}`).split(` do ${n}`).join(` da ${n}`).split(` no ${n}`).join(` na ${n}`);
};

/* ---------- uma página por banco ---------- */
mkdirSync(join(raiz, 'bancos'), { recursive: true });
// instituição que saiu da divulgação do mês perde a página: melhor do que manter números antigos com data nova
for (const n of readdirSync(join(raiz, 'bancos'))) if (n.endsWith('.html') && !Object.values(pagina).includes('bancos/' + n)) { rmSync(join(raiz, 'bancos', n)); console.log('Removida página sem dados no mês: bancos/' + n); }
for (const id of ids) {
  const nome = nomeDe(id), b = BANCOS[id] || {}, minhas = taxas.filter((t) => t.id === id);
  const principal = minhas.find((t) => t.linha === 'reg' && t.idx === 'tr') || minhas.find((t) => t.idx === 'tr') || minhas[0];
  const rk = ranking(principal.linha, principal.idx), pos = rk.findIndex((t) => t.id === id) + 1;
  const link = W.LINKS_BANCOS[id];
  const exemplo = CC.simular({ ...EX, indexAA: principal.idx === 'tr' ? P.tr : principal.idx === 'ipca' ? P.ipca : 0 }, principal.aa);
  const linhasTab = minhas.sort((a, b2) => a.linha.localeCompare(b2.linha) * -1 || a.aa - b2.aa).map((t) => {
    const r = ranking(t.linha, t.idx), p = r.findIndex((x) => x.id === id) + 1;
    return `<tr><td>${LINHA[t.linha]}</td><td>${IDX[t.idx]}</td><td class="n"><b>${f.pct(t.aa, 2)}</b></td><td class="n">${p}º de ${r.length}</td><td class="n">${f.brl(parcela(t))}</td></tr>`;
  }).join('\n');
  const comparacao = rk.map((t, i) => `<tr${t.id === id ? ' style="background:var(--lavanda)"' : ''}><td>${i + 1}º</td><td>${t.id === id ? `<b>${esc(nome)}</b>` : `<a href="../${pagina[t.id]}">${esc(nomeDe(t.id))}</a>`}</td><td class="n"><b>${f.pct(t.aa, 2)}</b></td><td class="n">${f.brl(parcela(t))}</td></tr>`).join('\n');
  const titulo = `Simulador de financiamento ${nome}: taxas de ${rotuloAtual}`;
  const descricao = `Simule o financiamento imobiliário ${nome} com a taxa média de ${f.pct(principal.aa, 2)} ao ano, atualizada em ${rotuloAtual}. Veja parcela, juros totais e renda necessária.`;
  const avisos = [
    b.regiao ? `<p>O ${esc(nome)} tem atuação concentrada no estado: ${esc(b.regiao)}. Confirme se há atendimento na sua cidade.</p>` : '',
    b.coop ? `<p>O ${esc(nome)} é um sistema de cooperativas de crédito: para contratar é preciso associar-se a uma cooperativa.</p>` : ''
  ].join('');

  gravar(pagina[id], genero(id, cabeca('../', titulo, descricao, 'banco') + `
<section class="topo-pag">
  <div class="container">
    <p class="migalhas"><a href="../index.html">Início</a> › <a href="../bancos.html">Taxas por banco</a> › ${esc(nome)}</p>
    <h1>Simulador de financiamento imobiliário ${esc(nome)}</h1>
    <p>Simulação independente com as taxas de ${rotuloAtual}: a média que o ${esc(nome)} cobra nos contratos, segundo a divulgação mais recente do Banco Central.</p>
  </div>
</section>
<div class="container post">
  <article class="artigo">
    <p class="lide">Na divulgação mais recente do Banco Central, com os contratos de ${rotuloMes}, o ${esc(nome)} cobrou em média <b>${f.pct(principal.aa, 2)} ao ano</b> nos financiamentos imobiliários da linha ${LINHA[principal.linha]} com correção por ${IDX[principal.idx]}. Com isso ficou em <b>${pos}º lugar entre ${rk.length} instituições</b> nessa modalidade.</p>

    <div class="sim-banco" data-banco="${id}">
      <form id="simForm" autocomplete="off" novalidate>
        <h2 class="sim-titulo">Simule no ${esc(nome)}</h2>
        <label class="campo"><span>Valor do imóvel</span><div class="moeda"><i>R$</i><input id="simImovel" inputmode="numeric" value="500.000"></div></label>
        <label class="campo"><span>Entrada <em id="simEntradaPct">20% do imóvel</em></span><div class="moeda"><i>R$</i><input id="simEntrada" inputmode="numeric" value="100.000"></div></label>
        <label class="campo"><span>Prazo: <b id="simPrazoTxt">30 anos</b></span><input type="range" id="simPrazo" min="5" max="35" step="1" value="30"></label>
        <fieldset class="campo"><legend>Sistema de amortização</legend>
          <div class="seg">
            <label><input type="radio" name="sistema" value="sac" checked><span>SAC<small>parcela cai</small></span></label>
            <label><input type="radio" name="sistema" value="price"><span>Price<small>parcela fixa</small></span></label>
          </div>
        </fieldset>
        <label class="campo"><span>Linha e correção</span>
          <select id="simModalidade">
${minhas.map((t) => `            <option value="${t.linha}|${t.idx}"${t === principal ? ' selected' : ''}>${t.linha === 'reg' ? 'SFH' : 'SFI'} · ${t.idx === 'tr' ? 'TR' : t.idx === 'ipca' ? 'IPCA' : 'taxa fixa'} · ${f.pct(t.aa, 2)} a.a.</option>`).join('\n')}
          </select>
        </label>
      </form>
      <div class="sim-resultado">
        <div class="rot">Primeira parcela estimada</div>
        <div class="valor" id="simParcela">${f.brl(exemplo.primeira)}</div>
        <dl>
          <div><dt>Valor financiado</dt><dd id="simFin">${f.brl(EX.financiado)}</dd></div>
          <div><dt>Última parcela</dt><dd id="simUltima">${f.brl(exemplo.ultima)}</dd></div>
          <div><dt>Total de juros</dt><dd id="simJuros">${f.brl(exemplo.juros)}</dd></div>
          <div><dt>Custo efetivo (CET)</dt><dd id="simCet">${f.pct(exemplo.cet, 2)} a.a.</dd></div>
          <div><dt>Renda familiar mínima</dt><dd id="simRenda">${f.brl(exemplo.maior / 0.3)}</dd></div>
        </dl>
        <p class="aviso" id="simAviso" hidden>A maioria dos bancos pede pelo menos 20% de entrada.</p>
        <a class="btn btn-acao btn-bloco" id="simComparar" href="../comparar.html?l=${principal.linha}&i=${principal.idx}">Comparar com outros bancos${SETA}</a>
        ${link ? `<a class="btn btn-claro btn-bloco" href="${esc(link)}" target="_blank" rel="noopener sponsored" data-banco-site="${esc(nome)}">Simulador oficial do ${esc(nome)}</a>` : ''}
      </div>
    </div>
    <p class="nota">Esta é uma simulação independente do Financie Imóvel, feita com a taxa média do ${esc(nome)} informada ao Banco Central e com seguros estimados. Não é o simulador oficial do banco: a taxa oferecida a você depende da análise de crédito.</p>

    <h2>Taxas do ${esc(nome)} por modalidade</h2>
    <table>
      <thead><tr><th>Linha</th><th>Correção</th><th class="n">Taxa ao ano</th><th class="n">Posição</th><th class="n">1ª parcela*</th></tr></thead>
      <tbody>
${linhasTab}
      </tbody>
    </table>
    <p class="nota">*Exemplo: R$ 400.000 financiados em 30 anos pela tabela SAC, imóvel de R$ 500.000, com seguros estimados. Fonte das taxas: Banco Central do Brasil, divulgação mais recente (contratos de ${rotuloMes}). Página atualizada em ${rotuloAtual}.</p>

    <div class="cta-linha"><p>Simule o seu valor no ${esc(nome)} e nos outros bancos.</p><a class="btn btn-acao" href="../comparar.html?l=${principal.linha}&i=${principal.idx}">Comparar bancos${SETA}</a></div>

    <div class="anuncio" data-formato="faixa" data-bloco="bancos"></div>

    <h2>Como o ${esc(nome)} se compara</h2>
    <p>Ranking atualizado em ${rotuloAtual} na linha ${LINHA[principal.linha]}, correção por ${IDX[principal.idx]}:</p>
    <table>
      <thead><tr><th>Posição</th><th>Instituição</th><th class="n">Taxa ao ano</th><th class="n">1ª parcela*</th></tr></thead>
      <tbody>
${comparacao}
      </tbody>
    </table>

    <h2>O que esses números significam</h2>
    <p>A taxa publicada é a média de todos os contratos que a instituição fechou no mês. A taxa oferecida a você pode ser diferente: depende da sua renda, do relacionamento com o banco, do valor da entrada e do imóvel. Use a média como referência de quem costuma cobrar menos e peça propostas a mais de uma instituição.</p>
    ${avisos}
    <p>Para comparar propostas, olhe o Custo Efetivo Total, que soma juros, seguros e tarifas. Veja também os guias <a href="../guias.html#sac-price">SAC ou Price</a> e <a href="../guias.html#indexadores">TR, IPCA ou taxa fixa</a>.</p>
    ${link ? `<p><a class="btn btn-banco" href="${esc(link)}" target="_blank" rel="noopener sponsored">Ir para o site do ${esc(nome)}${SETA}</a></p>` : ''}

    <div data-promo="ebook"></div>
  </article>
  <aside class="lateral-post">
    ${logo(id, '../') ? `<div class="caixa centro">${logo(id, '../')}</div>` : ''}
    <div class="caixa"><h3>Compare os bancos</h3><p class="muted" style="font-size:.93rem">Parcela e custo total do seu financiamento em cada instituição.</p><a class="btn btn-acao btn-bloco" href="../comparar.html">Comparar agora${SETA}</a></div>
    <div class="anuncio" data-formato="retangulo" data-bloco="bancos_lateral"></div>
    <div data-promo="ebook-lateral"></div>
  </aside>
</div>
` + pe('../', 'banco')));
}

/* ---------- índice de bancos ---------- */
const ordem = ranking('reg', 'tr').map((t) => t.id).concat(ids).filter((id, i, a) => a.indexOf(id) === i);
gravar('bancos.html', cabeca('', `Taxas de financiamento imobiliário por banco: ${rotuloAtual}`,
  `Taxa de juros do financiamento imobiliário em cada banco, atualizada em ${rotuloAtual}: Caixa, Banco do Brasil, Itaú, Bradesco, Santander e outros.`) + `
<section class="topo-pag">
  <div class="container">
    <p class="migalhas"><a href="index.html">Início</a> › Taxas por banco</p>
    <h1>Taxas de financiamento imobiliário por banco</h1>
    <p>Atualizado em ${rotuloAtual}, com a divulgação mais recente do Banco Central (contratos de ${rotuloMes}). Veja também o <a href="${RANKING}">ranking do mês</a>. Escolha uma instituição para ver as taxas em cada modalidade e a posição no ranking.</p>
  </div>
</section>
<div class="container">
  <div class="lista-bancos">
${ordem.map((id) => {
    const m = taxas.filter((t) => t.id === id);
    const p = m.find((t) => t.linha === 'reg' && t.idx === 'tr') || m.find((t) => t.idx === 'tr') || m[0];
    return `    <a class="cartao-banco" href="${pagina[id]}">${logo(id, '') || `<b>${esc(nomeDe(id))}</b>`}<span><b>${esc(nomeDe(id))}</b><small>${f.pct(p.aa, 2)} ao ano · ${p.linha === 'reg' ? 'SFH' : 'SFI'} · ${IDX[p.idx]}</small></span></a>`;
  }).join('\n')}
  </div>
  <div class="anuncio" data-formato="faixa" data-bloco="bancos"></div>
  <div data-promo="ebook"></div>
</div>
` + pe(''));
gravar('dados/paginas-bancos.js', '/* Gerado por gerar-seo.mjs */\nwindow.PAGINAS_BANCOS = ' + JSON.stringify(pagina, null, 1) + ';\n');

/* ---------- ranking do mês (página para citação e imprensa) ---------- */
{
  const modalidade = (l) => `${/reguladas/.test(l.Modalidade) ? 'reg' : 'mer'}|${/Prefixado/.test(l.Modalidade) ? 'pre' : /IPCA/.test(l.Modalidade) ? 'ipca' : 'tr'}`;
  const antes = new Map(((snap.anterior && snap.anterior.linhas) || []).map((l) => [`${l.cnpj8}|${modalidade(l)}`, Number(l.TaxaJurosAoAno)]));
  const mesAnt = snap.anterior && snap.anterior.mes ? `${MESES[+snap.anterior.mes.slice(5, 7) - 1]} de ${snap.anterior.mes.slice(0, 4)}` : '';
  const variacao = (t) => {
    const a = antes.get(`${t.id}|${t.linha}|${t.idx}`);
    if (!antes.size) return '';
    if (a === undefined) return '<td class="n"><span class="var novo">novo</span></td>';
    const d = Math.round((t.aa - a) * 100) / 100;
    if (!d) return '<td class="n"><span class="var igual">estável</span></td>';
    return `<td class="n"><span class="var ${d < 0 ? 'caiu' : 'subiu'}">${d < 0 ? '▼' : '▲'} ${Math.abs(d).toFixed(2).replace('.', ',')} p.p.</span></td>`;
  };
  const NOME_MOD = { 'reg|tr': 'SFH com correção pela TR', 'mer|tr': 'SFI (taxas de mercado) com correção pela TR', 'reg|ipca': 'SFH com correção pelo IPCA', 'mer|ipca': 'SFI (taxas de mercado) com correção pelo IPCA', 'reg|pre': 'SFH com taxa fixa', 'mer|pre': 'SFI (taxas de mercado) com taxa fixa' };
  const grupos = Object.keys(NOME_MOD).map((k) => { const [linha, idx] = k.split('|'); return { k, linha, idx, lista: ranking(linha, idx) }; }).filter((g) => g.lista.length >= 3);
  const mediana = (l) => { const v = l.map((t) => t.aa).sort((a, b) => a - b); return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2; };
  const principal = grupos.find((g) => g.k === 'reg|tr') || grupos[0];
  const top3 = principal.lista.slice(0, 3).map((t) => `${nomeDe(t.id)} (${f.pct(t.aa, 2)})`);
  const dataAtual = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(snap.geradoEm || Date.now()));
  const resumo = `Na divulgação mais recente do Banco Central, com os contratos de ${rotuloMes}, as três menores taxas médias de financiamento imobiliário na modalidade ${NOME_MOD[principal.k]} foram: ${top3.join(', ')}. Entre as ${principal.lista.length} instituições que informaram taxa nessa modalidade, a mediana ficou em ${f.pct(mediana(principal.lista), 2)} ao ano.`;
  const tabelas = grupos.map((g) => `
    <h2 id="${g.linha}-${g.idx}">${NOME_MOD[g.k]}</h2>
    <p>${g.lista.length} instituições. Menor taxa: <b>${f.pct(g.lista[0].aa, 2)} ao ano</b>. Mediana: ${f.pct(mediana(g.lista), 2)} ao ano.</p>
    <div class="tabela-rolagem"><table>
      <thead><tr><th>Posição</th><th>Instituição</th><th class="n">Taxa ao ano</th>${antes.size ? `<th class="n">Variação no mês</th>` : ''}<th class="n">1ª parcela*</th></tr></thead>
      <tbody>
${g.lista.map((t, i) => `<tr><td>${i + 1}º</td><td><a href="${pagina[t.id]}">${esc(nomeDe(t.id))}</a>${(BANCOS[t.id] || {}).regiao ? ' <small class="muted">(regional)</small>' : ''}</td><td class="n"><b>${f.pct(t.aa, 2)}</b></td>${variacao(t)}<td class="n">${f.brl(parcela(t))}</td></tr>`).join('\n')}
      </tbody>
    </table></div>
    <p><a href="comparar.html?l=${g.linha}&i=${g.idx}">Simular nessa modalidade${SETA}</a></p>`).join('\n');
  // planilha com os mesmos números, para quem quiser citar ou reaproveitar
  const csv = ['modalidade;posicao;instituicao;cnpj_raiz;taxa_ao_ano;mes_dos_contratos', ...grupos.flatMap((g) => g.lista.map((t, i) => [NOME_MOD[g.k], i + 1, nomeDe(t.id), t.id, String(t.aa).replace('.', ','), snap.mes].join(';')))].join('\n') + '\n'; // quebra de linha simples, como o git guarda: evita uma "mudança" fantasma na rotina
  gravar('dados/ranking-taxas.csv', '﻿' + csv);
  gravar(RANKING, cabeca('', `Ranking das taxas de financiamento imobiliário: ${rotuloAtual}`,
    `Ranking de ${rotuloAtual} com as menores taxas de juros do financiamento imobiliário por banco, a variação no mês e a parcela de exemplo. Dados do Banco Central.`) + `
<section class="topo-pag">
  <div class="container">
    <p class="migalhas"><a href="index.html">Início</a> › Ranking das taxas</p>
    <h1>Ranking das taxas de financiamento imobiliário: ${rotuloAtual}</h1>
    <p class="post-meta">Por <a href="sobre.html">Equipe Financie Imóvel</a> · Atualizado em ${dataAtual} · Contratos de ${rotuloMes}</p>
  </div>
</section>
<div class="container post">
  <article class="artigo">
    <p class="lide">${esc(resumo)}</p>
    <nav class="sumario" aria-label="Nesta página"><b>Nesta página</b><ol>${grupos.map((g) => `<li><a href="#${g.linha}-${g.idx}">${NOME_MOD[g.k]}</a></li>`).join('')}<li><a href="#como-ler">Como ler o ranking</a></li><li><a href="#citar">Para citar estes dados</a></li></ol></nav>
${tabelas}
    <p class="nota">*Exemplo: R$ 400.000 financiados em 30 anos pela tabela SAC, imóvel de R$ 500.000, com seguros estimados.${mesAnt ? ` Variação em pontos percentuais em relação aos contratos de ${mesAnt}.` : ''} Fonte das taxas: Banco Central do Brasil.</p>

    <div class="cta-linha"><p>Veja a parcela e o custo total para o valor do seu imóvel.</p><a class="btn btn-acao" href="comparar.html">Comparar bancos${SETA}</a></div>
    <div class="anuncio" data-formato="faixa" data-bloco="bancos"></div>

    <h2 id="como-ler">Como ler o ranking</h2>
    <ul>
      <li><b>O que é a taxa:</b> a média dos juros de todos os contratos que cada instituição fechou no mês, informada ao Banco Central. A taxa oferecida a você depende da renda, da entrada, do imóvel e do relacionamento com o banco.</li>
      <li><b>Mês dos dados:</b> o Banco Central divulga cada mês com cerca de seis semanas de intervalo. Esta página mostra sempre a divulgação mais recente e é conferida automaticamente duas vezes por dia.</li>
      <li><b>Médias muito baixas:</b> instituições que operam programas habitacionais com juros subsidiados têm a média puxada para baixo por essas linhas.</li>
      <li><b>Instituições regionais:</b> atuam em um estado ou região; confirme se há atendimento na sua cidade.</li>
      <li><b>Compare o custo total:</b> além dos juros, entram seguros e tarifas. Use o <a href="comparar.html">comparador</a> para ver o Custo Efetivo Total em cada banco.</li>
    </ul>

    <h2 id="citar">Para citar estes dados</h2>
    <p>Jornalistas, blogs e sites podem reproduzir os números desta página, com indicação da fonte e link para <b>${dominio ? dominio.replace('https://', '') : 'o site'}</b>. Sugestão de crédito: “Fonte: Financie Imóvel, com dados do Banco Central do Brasil”.</p>
    <p><a class="btn btn-claro" href="dados/ranking-taxas.csv" download>Baixar a tabela completa (CSV)</a></p>

    <div data-promo="ebook"></div>
  </article>
  <aside class="lateral-post">
    <div class="caixa"><h3>Compare os bancos</h3><p class="muted" style="font-size:.93rem">Parcela e custo total do seu financiamento em cada instituição.</p><a class="btn btn-acao btn-bloco" href="comparar.html">Comparar agora${SETA}</a></div>
    <div class="caixa"><h3>Taxas por banco</h3><p class="muted" style="font-size:.93rem">Uma página para cada instituição, com todas as modalidades.</p><a class="btn btn-claro btn-bloco" href="bancos.html">Ver os bancos</a></div>
    <div class="anuncio" data-formato="retangulo" data-bloco="bancos_lateral"></div>
    <div data-promo="ebook-lateral"></div>
  </aside>
</div>
` + pe(''));
}

/* ---------- lista de artigos dentro de blog.html ---------- */
{
  const MES_CURTO = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
  const dataCurta = (iso) => { const [a2, m2, d2] = String(iso).split('-'); return `${+d2} de ${MES_CURTO[+m2 - 1]} de ${a2}`; };
  const fotoCartao = (p, destaque) => { const c = `assets/blog/${p.slug}`; return destaque
    ? `<picture><source type="image/avif" srcset="${c}-m.avif 800w, ${c}.avif 1200w" sizes="(max-width: 900px) 100vw, 700px"><source type="image/webp" srcset="${c}-m.webp 800w, ${c}.webp 1200w" sizes="(max-width: 900px) 100vw, 700px"><img src="${c}.jpg" alt="" width="1200" height="675" fetchpriority="high" decoding="async"></picture>`
    : `<picture><source type="image/avif" srcset="${c}-p.avif"><source type="image/webp" srcset="${c}-p.webp"><img src="${c}-p.jpg" alt="" width="640" height="360" loading="lazy" decoding="async"></picture>`; };
  const cartaoPost = (p, destaque) => `<a class="cartao-post${destaque ? ' destaque' : ''}" href="blog/${p.slug}.html"><div class="capa">${fotoCartao(p, destaque)}<span>${esc(p.categoria)}</span></div><div class="txt"><h3>${esc(p.titulo)}</h3><p>${esc(p.resumo)}</p><small>${esc(p.data)} · ${p.minutos} min de leitura</small></div></a>`;
  const cartoes = (W.POSTS || []).map((p, i) => cartaoPost(p, i === 0)).join('\n');
  // os três artigos mais recentes também aparecem na página inicial
  const ultimos = (W.POSTS || []).slice(0, 3).map((p) => cartaoPost(p, false)).join('\n');
  gravar('index.html', ler('index.html').replace(/<!--ultimos:inicio-->[\s\S]*?<!--ultimos:fim-->/, () => `<!--ultimos:inicio-->\n${ultimos}\n<!--ultimos:fim-->`));
  const html = ler('blog.html').replace(/<div class="blog-lista" id="blogLista">[\s\S]*?<\/div><!--fim-lista-->|<div class="blog-lista" id="blogLista"><\/div>/,
    `<div class="blog-lista" id="blogLista">\n${cartoes}\n</div><!--fim-lista-->`);
  gravar('blog.html', html);
}

// Política de segurança de conteúdo: só carrega código e dados das origens listadas.
// Com anúncios ligados (CONFIG.anuncios.cliente), libera também os domínios de publicidade do Google.
const comAnuncios = !!(CC.CONFIG.anuncios && CC.CONFIG.anuncios.cliente);
const leadOrigem = (() => { try { return new URL(CC.CONFIG.leadEndpoint).origin; } catch { return ''; } })();
// Com medição ligada (CONFIG.analytics.id), libera só os domínios do Google Analytics.
const comAnalytics = /^G-[A-Z0-9]{4,20}$/.test(String((CC.CONFIG.analytics && CC.CONFIG.analytics.id) || ''));
const GA_SCRIPT = 'https://www.googletagmanager.com';
const GA_DADOS = 'https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com';
const GOOGLE_ADS = 'https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.gstatic.com https://*.adtrafficquality.google';
const CSP = [
  "default-src 'self'",
  `script-src 'self'${comAnalytics ? ' ' + GA_SCRIPT : ''}${comAnuncios ? ' ' + GOOGLE_ADS : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  `img-src 'self' data:${comAnuncios ? ' https:' : comAnalytics ? ' ' + GA_DADOS : ''}`,
  `connect-src 'self' https://olinda.bcb.gov.br${leadOrigem ? ' ' + leadOrigem : ''}${comAnalytics ? ' ' + GA_DADOS : ''}${comAnuncios ? ' ' + GOOGLE_ADS : ''}`,
  `frame-src ${comAnuncios ? GOOGLE_ADS : "'none'"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');
/* ---------- metadados em todas as páginas + sitemap ---------- */
const paginas = [
  // arquivos google*.html são a prova de propriedade do Search Console: não mexer nem listar
  ...readdirSync(raiz).filter((n) => n.endsWith('.html') && !/^google[0-9a-f]+\.html$/.test(n)),
  ...readdirSync(join(raiz, 'blog')).filter((n) => n.endsWith('.html')).map((n) => 'blog/' + n),
  ...readdirSync(join(raiz, 'bancos')).filter((n) => n.endsWith('.html')).map((n) => 'bancos/' + n)
];
// data das páginas no sitemap: a mais recente entre a virada do mês vigente e a última troca de taxas
const hojeISO = [`${anoAtual}-${mesAtual}-01`, (snap.geradoEm || '').slice(0, 10)].sort().pop();
const MARCA = ' | Financie Imóvel';
const texto = (h) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/\s+/g, ' ').trim();
const ld = (o) => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...o }).replace(/</g, '\\u003c')}</script>`;
const ORG = { '@type': 'Organization', name: 'Financie Imóvel', url: `${dominio}/`, logo: `${dominio}/assets/logo.svg` };
const postDe = Object.fromEntries((W.POSTS || []).map((x) => [`blog/${x.slug}.html`, x]));
const SECAO = { 'comparar.html': 'Comparar bancos', 'quanto-posso-financiar.html': 'Quanto posso financiar', 'guias.html': 'Guias', 'blog.html': 'Blog', 'ebook.html': 'Ebook', 'bancos.html': 'Taxas por banco', 'privacidade.html': 'Privacidade e cookies', 'sobre.html': 'Sobre', [RANKING]: 'Ranking das taxas' };
const migalhas = (itens) => ld({ '@type': 'BreadcrumbList', itemListElement: itens.map(([name, caminho], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${dominio}/${caminho}` })) });

for (const p of paginas) {
  let h = ler(p);
  const oculta = p === '404.html';
  // título longo demais é cortado no resultado da busca: tira a marca do fim quando passa de 65 caracteres
  let titulo = (h.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
  if (titulo.length > 65 && titulo.endsWith(MARCA)) { titulo = titulo.slice(0, -MARCA.length); h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${titulo}</title>`); }
  const desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  const url = dominio && !oculta ? `${dominio}/${p === 'index.html' ? '' : p}` : '';
  const h1 = texto((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || titulo);

  const dadosEstruturados = [];
  if (dominio && !oculta) {
    if (p === 'index.html') {
      dadosEstruturados.push(ld({ '@type': 'WebSite', name: 'Financie Imóvel', alternateName: 'Simulador de financiamento imobiliário', url: `${dominio}/`, inLanguage: 'pt-BR', publisher: ORG }));
      const faq = [...((h.match(/id="duvidas"[\s\S]*?<\/section>/) || [''])[0]).matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)];
      if (faq.length) dadosEstruturados.push(ld({ '@type': 'FAQPage', mainEntity: faq.map((m) => ({ '@type': 'Question', name: texto(m[1]), acceptedAnswer: { '@type': 'Answer', text: texto(m[2]) } })) }));
    } else if (postDe[p]) {
      const x = postDe[p];
      dadosEstruturados.push(ld({ '@type': 'Article', headline: x.titulo, description: x.descricao || x.resumo, datePublished: x.iso, dateModified: x.mod || x.iso, inLanguage: 'pt-BR',
        image: `${dominio}/assets/blog/${x.slug}.jpg`, mainEntityOfPage: url, author: { '@type': 'Organization', name: 'Equipe Financie Imóvel', url: `${dominio}/sobre.html` }, publisher: ORG }));
      const faqPost = [...((h.match(/class="faq-artigo"[\s\S]*?<\/section>/) || [''])[0]).matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)];
      if (faqPost.length) dadosEstruturados.push(ld({ '@type': 'FAQPage', mainEntity: faqPost.map((m) => ({ '@type': 'Question', name: texto(m[1]), acceptedAnswer: { '@type': 'Answer', text: texto(m[2]) } })) }));
      dadosEstruturados.push(migalhas([['Início', ''], ['Blog', 'blog.html'], [x.titulo, p]]));
    } else if (p.startsWith('bancos/')) {
      dadosEstruturados.push(ld({ '@type': 'WebApplication', name: h1, description: desc, url, dateModified: hojeISO, inLanguage: 'pt-BR', applicationCategory: 'FinanceApplication', operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' }, isPartOf: { '@type': 'WebSite', name: 'Financie Imóvel', url: `${dominio}/` } }));
      dadosEstruturados.push(migalhas([['Início', ''], ['Taxas por banco', 'bancos.html'], [h1, p]]));
    } else {
      if (p === 'ebook.html') {
        const pr = CC.CONFIG.produto, valor = (String(pr.preco).match(/\d+(?:[.,]\d+)?/) || [''])[0].replace(',', '.');
        if (valor && pr.checkout) dadosEstruturados.push(ld({ '@type': 'Product', name: `${pr.nome}: ${pr.subtitulo}`, description: desc, image: `${dominio}/assets/ebook-capa.png`, category: 'Ebook',
          brand: { '@type': 'Brand', name: 'Financie Imóvel' }, offers: { '@type': 'Offer', price: Number(valor).toFixed(2), priceCurrency: 'BRL', availability: 'https://schema.org/InStock', url } }));
      }
      if (p === RANKING) dadosEstruturados.push(ld({ '@type': 'Dataset', name: h1, description: desc, url, inLanguage: 'pt-BR', dateModified: (snap.geradoEm || '').slice(0, 10) || hojeISO, temporalCoverage: snap.mes,
        creator: ORG, isBasedOn: 'https://www.bcb.gov.br/estatisticas/txjuros', isAccessibleForFree: true,
        distribution: [{ '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${dominio}/dados/ranking-taxas.csv` }] }));
      if (p === 'comparar.html' || p === 'quanto-posso-financiar.html') dadosEstruturados.push(ld({ '@type': 'WebApplication', name: h1, description: desc, url, applicationCategory: 'FinanceApplication', operatingSystem: 'Web', inLanguage: 'pt-BR',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' } }));
      dadosEstruturados.push(migalhas([['Início', ''], [SECAO[p] || h1, p]]));
    }
  }

  const imagem = postDe[p] ? `${dominio}/assets/blog/${postDe[p].slug}.jpg` : `${dominio}/assets/og.png`;
  const rz = oculta ? '/' : p.includes('/') ? '../' : '';
  const precarga = `<link rel="preload" href="${rz}assets/fonts/figtree-latin.woff2" as="font" type="font/woff2" crossorigin>` +
    (postDe[p] ? `\n<link rel="preload" as="image" type="image/avif" imagesrcset="${rz}assets/blog/${postDe[p].slug}-m.avif 800w, ${rz}assets/blog/${postDe[p].slug}.avif 1200w" imagesizes="(max-width: 900px) 100vw, 760px" fetchpriority="high">` : '');
  const bloco = `<!--seo:inicio-->
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="robots" content="${oculta || p === 'afiliados.html' ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1'}">
<meta name="theme-color" content="#101a4a">
${precarga}
${url ? `<link rel="canonical" href="${url}">\n<meta property="og:url" content="${url}">\n` : ''}<meta property="og:site_name" content="Financie Imóvel">
<meta property="og:locale" content="pt_BR">
<meta property="og:type" content="${p.startsWith('blog/') ? 'article' : 'website'}">
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="${desc}">
${dominio ? `<meta property="og:image" content="${imagem}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="${postDe[p] ? 675 : 630}">\n<meta name="twitter:image" content="${imagem}">\n` : ''}<meta name="twitter:card" content="summary_large_image">
${dadosEstruturados.join('\n')}${dadosEstruturados.length ? '\n' : ''}<!--seo:fim-->`;
  h = h.replace(/<meta property="og:(type|title|description)"[^>]*>\n/g, '');
  h = /<!--seo:inicio-->[\s\S]*?<!--seo:fim-->/.test(h) ? h.replace(/<!--seo:inicio-->[\s\S]*?<!--seo:fim-->/, () => bloco)
    : h.replace(/(<meta name="description"[^>]*>\n)/, (m) => `${m}${bloco}\n`);
  gravar(p, h);
}
const hoje = hojeISO;
gravar('robots.txt', `User-agent: *\nAllow: /\n${dominio ? `\nSitemap: ${dominio}/sitemap.xml\n` : ''}`);
if (dominio) {
  gravar('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    paginas.filter((p) => p !== '404.html' && p !== 'afiliados.html').map((p) => `  <url><loc>${dominio}/${p === 'index.html' ? '' : p}</loc><lastmod>${hoje}</lastmod></url>`).join('\n') + '\n</urlset>\n');
}
console.log(`OK: ${ids.length} páginas de banco, índice, lista do blog e metadados em ${paginas.length} páginas.` +
  (dominio ? ' sitemap.xml gerado.' : ' ATENÇÃO: preencha "dominio" em site.config.json para gerar sitemap.xml e endereços canônicos.'));
