/* Inicialização das páginas de conteúdo (guias, bancos, privacidade). A página informa qual é em <body data-pagina="..."> */
CC.montarPagina(document.body.getAttribute('data-pagina') || '');
CC.iniciarDados();
