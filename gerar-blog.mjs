// Gera as páginas do blog a partir dos textos em conteudo/blog/*.html
// Uso: node gerar-blog.mjs
//
// Cada texto começa com uma linha de dados, assim:
// <!--{"titulo":"...","resumo":"...","descricao":"...","categoria":"...","data":"2026-11-15","minutos":5,"cor":"#ff5c39"}-->
// O nome do arquivo vira o endereço do artigo. Use <!--anuncio--> onde quiser um anúncio no meio do texto.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = dirname(fileURLToPath(import.meta.url));
const origem = join(raiz, 'conteudo', 'blog');
const destino = join(raiz, 'blog');
mkdirSync(destino, { recursive: true });

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const dataBr = (iso) => { const [a, m, d] = iso.split('-'); return `${+d} ${MESES[+m - 1]} ${a}`; };
const SETA = '<span class="seta" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';

const posts = readdirSync(origem).filter((n) => n.endsWith('.html')).map((nome) => {
  const texto = readFileSync(join(origem, nome), 'utf8');
  const m = texto.match(/^\s*<!--(\{.*?\})-->/s);
  if (!m) throw new Error(`${nome}: falta a linha de dados no topo`);
  const dados = JSON.parse(m[1]);
  return { ...dados, slug: nome.replace(/\.html$/, ''), corpo: texto.slice(m[0].length).trim() };
}).sort((a, b) => b.data.localeCompare(a.data) || a.slug.localeCompare(b.slug));

for (const p of posts) {
  const corpo = p.corpo
    .replace(/<!--anuncio-->/g, '<div class="anuncio" data-formato="faixa" data-bloco="blog_meio"></div>')
    .replace(/<!--comparar:(.*?)-->/g, (_, frase) => `<div class="cta-linha"><p>${frase}</p><a class="btn btn-acao" href="../comparar.html">Comparar bancos${SETA}</a></div>`);
  const html = `<!doctype html>
<html lang="pt-BR" data-raiz="../">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.titulo)} | Financie Imóvel</title>
<meta name="description" content="${esc(p.descricao || p.resumo)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(p.titulo)}">
<meta property="og:description" content="${esc(p.descricao || p.resumo)}">
<link rel="icon" href="../assets/logo.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/site.css">
</head>
<body>
<header id="cabecalho"></header>
<main>
<section class="topo-pag">
  <div class="container">
    <p class="migalhas"><a href="../index.html">Início</a> › <a href="../blog.html">Blog</a> › ${esc(p.categoria)}</p>
    <h1>${esc(p.titulo)}</h1>
    <p class="post-meta">${dataBr(p.data)} · ${p.minutos} min de leitura</p>
  </div>
</section>
<div class="container post">
  <article class="artigo">
${corpo}
    <div class="anuncio" data-formato="faixa" data-bloco="blog_fim"></div>
    <div data-promo="ebook"></div>
    <div class="relacionados" id="relacionados"></div>
  </article>
  <aside class="lateral-post" id="lateral"></aside>
</div>
</main>
<footer id="rodape"></footer>
<script src="../dados/taxas.js"></script>
<script src="../dados/logos-bancos.js"></script>
<script src="../dados/paginas-bancos.js"></script>
<script src="../js/comum.js"></script>
<script src="../js/posts.js"></script>
<script src="../js/blog.js"></script>
</body>
</html>
`;
  writeFileSync(join(destino, p.slug + '.html'), html, 'utf8');
}

const lista = posts.map(({ slug, titulo, resumo, categoria, data, minutos, cor }) => ({ slug, titulo, resumo, categoria, data: dataBr(data), minutos, cor: cor || '#ff5c39' }));
writeFileSync(join(raiz, 'js', 'posts.js'),
  '/* Gerado por gerar-blog.mjs. Não edite à mão: altere os textos em conteudo/blog/ e rode o script. */\nwindow.POSTS = ' + JSON.stringify(lista, null, 1) + ';\n', 'utf8');
console.log(`OK: ${posts.length} artigos gerados em blog/ e lista atualizada em js/posts.js`);
