// Confere o site gerado antes de publicar. Qualquer problema encerra com erro,
// o que impede a publicação automática e faz o GitHub avisar por e-mail.
// Uso: node validar-site.mjs   (rode depois de gerar-blog.mjs e gerar-seo.mjs)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = dirname(fileURLToPath(import.meta.url));
const ler = (p) => readFileSync(join(raiz, p), 'utf8');
const erros = [];

// 1) dados de taxas
let snap;
try { snap = JSON.parse(ler('dados/taxas.js').replace(/^window\.TAXAS_SNAPSHOT = /, '').replace(/;\s*$/, '')); } catch (e) { erros.push('dados/taxas.js não é um arquivo válido: ' + e.message); }
if (snap) {
  if (!/^\d{4}-\d{2}$/.test(String(snap.mes))) erros.push('mês de referência inválido em dados/taxas.js');
  if (!Array.isArray(snap.linhas) || snap.linhas.length < 15) erros.push('menos de 15 taxas em dados/taxas.js');
  for (const l of snap.linhas || []) if (!(Number(l.TaxaJurosAoAno) > 0 && Number(l.TaxaJurosAoAno) <= 40)) erros.push(`taxa inválida gravada: ${l.InstituicaoFinanceira} ${l.TaxaJurosAoAno}`);
}

// 2) páginas
const fixas = ['index.html', 'comparar.html', 'quanto-posso-financiar.html', 'guias.html', 'blog.html', 'ebook.html', 'bancos.html', 'privacidade.html', '404.html', 'sitemap.xml', 'robots.txt', 'CNAME'];
for (const f of fixas) if (!existsSync(join(raiz, f))) erros.push('arquivo ausente: ' + f);
const bancos = readdirSync(join(raiz, 'bancos')).filter((n) => n.endsWith('.html'));
if (bancos.length < 8) erros.push(`só ${bancos.length} páginas de banco (mínimo 8)`);
const blog = readdirSync(join(raiz, 'blog')).filter((n) => n.endsWith('.html'));
if (!blog.length) erros.push('nenhum artigo no blog');

const paginas = [...fixas.filter((f) => f.endsWith('.html')), ...bancos.map((n) => 'bancos/' + n), ...blog.map((n) => 'blog/' + n)].filter((p) => existsSync(join(raiz, p)));
const PROIBIDO = [/\bNaN\b/, /\bundefined\b/, /\[object Object\]/, /\b0,00% ao ano/, /\$\{[^}]*\}/];
for (const p of paginas) {
  const h = ler(p);
  const visivel = h.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const r of PROIBIDO) if (r.test(visivel)) erros.push(`${p}: texto suspeito (${r.source})`);
  if (!/<title>[^<]{10,}<\/title>/.test(h)) erros.push(`${p}: sem título`);
  if (!/Content-Security-Policy/.test(h) && p !== '404.html') erros.push(`${p}: sem política de segurança`);
  if (/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/.test(h)) erros.push(`${p}: script embutido (proibido pela política de segurança)`);
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { JSON.parse(m[1]); } catch { erros.push(`${p}: dados estruturados inválidos`); } }
}

// 3) sitemap aponta só para páginas que existem
const dominio = (JSON.parse(ler('site.config.json')).dominio || '').replace(/\/+$/, '');
for (const m of ler('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const caminho = m[1].replace(dominio, '').replace(/^\//, '') || 'index.html';
  if (!existsSync(join(raiz, caminho))) erros.push('sitemap aponta para página inexistente: ' + caminho);
}
// 4) fotos dos artigos
for (const n of blog) for (const suf of ['.jpg', '-p.jpg']) { const f = 'assets/blog/' + n.replace('.html', suf); if (!existsSync(join(raiz, f))) erros.push('foto ausente: ' + f); }

if (erros.length) { console.log('ERRO: o site gerado tem problemas e NÃO será publicado:\n- ' + erros.join('\n- ')); process.exit(1); }
console.log(`Site conferido: ${paginas.length} páginas, ${bancos.length} bancos, ${blog.length} artigos, taxas de ${snap.mes}.`);
