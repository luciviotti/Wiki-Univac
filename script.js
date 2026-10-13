/* Centro de Ayuda Univac.ERP — lógica de navegación, búsqueda y asistente documental.
   Solo HTML + CSS + JavaScript. Fuente única de información: contenido.js (generado desde los manuales). */
(function () {
  'use strict';
  const DB = window.UNIVAC_CONTENIDO;
  const $ = (s, el = document) => el.querySelector(s);
  const main = $('#contenido');

  /* =========================================================
     Configuración del asistente.
     Por defecto funciona en modo "búsqueda documental local": responde solo
     con fragmentos literales de los manuales. Para conectar un modelo de IA,
     completar `endpoint` con un servicio propio (backend de Univac) que reciba
     { pregunta, contexto, instrucciones } y devuelva { respuesta, fuentes }.
     El servicio debe responder SOLO con el contexto enviado.
     ========================================================= */
  const ASISTENTE_IA = {
    endpoint: '',
    instrucciones:
      'Sos el asistente oficial de documentación de Univac.ERP. Respondé únicamente con la información incluida en el CONTEXTO, ' +
      'que proviene de los manuales oficiales. No inventes funcionalidades, botones, campos, procedimientos, módulos ni configuraciones. ' +
      'No uses conocimiento externo ni de otros ERP. Respetá la terminología del sistema. Si el contexto no alcanza para responder, ' +
      'respondé exactamente: "' + 'No encuentro información suficiente en la documentación disponible para responder esta consulta. ' +
      'Te recomendamos contactar al equipo de soporte de Univac.' + '". Indicá siempre las fuentes (manual y sección). ' +
      'El nombre oficial del producto es Univac.ERP.'
  };
  const SIN_INFO = 'No encuentro información suficiente en la documentación disponible para responder esta consulta. Te recomendamos contactar al equipo de soporte de Univac.';

  /* ---------- Índices ---------- */
  const CATS = {}; DB.categorias.forEach(c => (CATS[c.id] = c));
  const ARTS = {}; DB.articulos.forEach(a => (ARTS[a.id] = a));
  const inCat = id => DB.articulos.filter(a => a.cat === id || (a.tambien || []).includes(id));

  /* ---------- Utilidades de texto ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = s => esc(s).replace(/'([^'\n]{1,70}?)'/g, '<span class="ui">$1</span>');
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ]+/g, ' ').trim();
  const STOP = new Set(('a al algo algun alguna como con cual cuales cuando de del desde donde dónde e el ella en entre es esa ese eso esta este esto hacer hace hago hay la las le les lo los mas me mi mis muy necesito no o para pero por puedo puede que quiero se segun ser si sin sobre su sus te tengo tiene un una uno unos unas y ya yo ver deseo debo deberia forma manera modo hacerlo cosas favor ayuda univac erp sistema').split(' ').map(norm));
  const stem = w => (w.length > 4 && /es$/.test(w) && !/[aeiou]es$/.test(w) ? w.slice(0, -2) : w.length > 3 && /s$/.test(w) ? w.slice(0, -1) : w);
  const toks = s => norm(s).split(' ').filter(w => w && !STOP.has(w)).map(stem);

  /* Sinónimos de uso cotidiano (no agregan contenido: solo amplían la búsqueda hacia términos del manual). */
  const SYN = [
    'vender venta facturar factura facturacion comprobante',
    'cobrar cobranza cobro recibo',
    'pagar pago orden',
    'stock inventario existencia',
    'precio lista',
    'porcentaje alicuota tasa',
    'borrar eliminar anular baja quitar desactivar',
    'crear alta nuevo agregar cargar registrar emitir generar',
    'modificar editar cambiar corregir actualizar',
    'consultar consulta buscar listado',
    'arca afip',
    'mail correo email',
    'imprimir impresion reimprimir reimpresion',
    'contrasena clave password',
    'dolar usd cotizacion',
    'ecommerce tiendanube mercadolibre woocommerce tienda',
    'deuda saldo debe',
    'error mensaje problema falla rechazado',
    'wayra univac',
    'ingresar login entrar sesion',
    'producto articulo insumo',
    'distinto diferente varios multiple'
  ].map(g => g.split(' ').map(stem));
  const SYNMAP = {};
  SYN.forEach(g => g.forEach(w => (SYNMAP[w] = (SYNMAP[w] || []).concat(g.filter(x => x !== w)))));

  /* ---------- Motor de búsqueda (BM25 simplificado por campos) ---------- */
  function blockText(b) {
    if (b.rows) return b.rows.map(r => r.join(' ')).join(' ');
    return b.x || '';
  }
  const FIELDS = { titulo: 6, kw: 4, tema: 2.5, resumen: 2, head: 2, body: 1 };
  const docs = []; const chunks = [];
  DB.articulos.forEach(a => {
    const head = a.secciones.map(s => s.t).join(' ');
    const body = a.secciones.map(s => s.b.map(blockText).join(' ')).join(' ');
    const f = { titulo: a.titulo, kw: a.kw, tema: a.tema + ' ' + CATS[a.cat].nombre, resumen: a.resumen, head, body };
    const tf = {}; let len = 0;
    for (const k in f) toks(f[k]).forEach(t => { tf[t] = (tf[t] || 0) + FIELDS[k]; len++; });
    docs.push({ a, tf, len, raw: norm(a.titulo + ' ' + a.kw + ' ' + body) });
    a.secciones.forEach((s, i) => {
      const txt = s.t + ' ' + s.b.map(blockText).join(' ');
      const ctf = {}; const tk = toks(txt + ' ' + a.titulo);
      tk.forEach(t => (ctf[t] = (ctf[t] || 0) + 1));
      chunks.push({ a, s, i, tf: ctf, len: tk.length, raw: norm(txt) });
    });
  });
  function mkIdf(list) {
    const df = {}; list.forEach(d => Object.keys(d.tf).forEach(t => (df[t] = (df[t] || 0) + 1)));
    const N = list.length; const idf = {};
    for (const t in df) idf[t] = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
    return idf;
  }
  const IDF = mkIdf(docs), CIDF = mkIdf(chunks);
  const VOCAB = Object.keys(IDF);
  const avg = l => l.reduce((s, d) => s + d.len, 0) / l.length;
  const AVG = avg(docs), CAVG = avg(chunks);

  function expand(q) {
    const base = [...new Set(toks(q))];
    return base.map(t => {
      const alts = new Map([[t, 1]]);
      (SYNMAP[t] || []).forEach(s => alts.has(s) || alts.set(s, 0.6));
      if (!IDF[t] && t.length >= 4) VOCAB.forEach(v => { if (v.startsWith(t) && !alts.has(v)) alts.set(v, 0.7); });
      if (!IDF[t] && t.length >= 5) VOCAB.forEach(v => { if (t.startsWith(v) && v.length >= 4 && !alts.has(v)) alts.set(v, 0.6); });
      return { t, alts };
    });
  }
  function score(list, idf, avgl, q) {
    const terms = expand(q); if (!terms.length) return { terms, res: [] };
    const nq = norm(q);
    const res = list.map(d => {
      let sc = 0, hit = 0;
      terms.forEach(({ alts }) => {
        let best = 0;
        alts.forEach((w, term) => {
          const f = d.tf[term]; if (!f) return;
          const s = (idf[term] || 0) * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.len / avgl)) * w;
          if (s > best) best = s;
        });
        if (best > 0) hit++;
        sc += best;
      });
      if (nq.split(' ').length > 1 && d.raw.includes(nq)) sc *= 1.5;
      return { d, sc, cov: hit / terms.length };
    }).filter(r => r.sc > 0);
    res.sort((x, y) => y.sc - x.sc || y.cov - x.cov);
    return { terms, res };
  }
  function search(q) {
    const { terms, res } = score(docs, IDF, AVG, q);
    const need = terms.length <= 2 ? 1 : terms.length <= 4 ? 0.6 : 0.5;
    return { terms, res: res.filter(r => r.cov >= need - 1e-9) };
  }

  /* ---------- Render de bloques ---------- */
  function renderBlocks(bl) {
    let h = '', i = 0;
    while (i < bl.length) {
      const b = bl[i];
      if (b.t === 'step' || b.t === 'li') {
        const t = b.t; const tag = t === 'step' ? 'ol class="steps"' : 'ul';
        h += '<' + tag + '>';
        while (i < bl.length && bl[i].t === t) { h += '<li>' + fmt(bl[i].x) + '</li>'; i++; }
        h += t === 'step' ? '</ol>' : '</ul>';
        continue;
      }
      if (b.t === 'p') h += '<p>' + fmt(b.x) + '</p>';
      else if (b.t === 'h3') h += '<h4>' + fmt(b.x) + '</h4>';
      else if (b.t === 'call') {
        const lab = { warn: 'Atención', error: 'Importante', info: 'Información', ok: 'Correcto', tip: 'Sugerencia' }[b.k] || 'Nota';
        h += '<div class="notice ' + esc(b.k || '') + '"><span class="k">' + lab + '</span>' + fmt(b.x.replace(/^[ℹ⚠✖✔✓💡]\s*/u, '')) + '</div>';
      } else if (b.t === 'table' && b.rows.length) {
        const [hd, ...rows] = b.rows;
        const single = !rows.length;
        h += '<div class="tbl"><table>' + (single ? '' : '<thead><tr>' + hd.map(c => '<th>' + fmt(c) + '</th>').join('') + '</tr></thead>') +
          '<tbody>' + (single ? [hd] : rows).map(r => '<tr>' + r.map(c => '<td>' + fmt(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
      }
      i++;
    }
    return h;
  }
  const srcLabel = s => s.m + ' — ' + (s.n ? 'sección ' + s.n : 'sección ' + (s.sec || '')) + (s.t ? ' «' + s.t + '»' : '');
  const subHTML = (s, open) =>
    '<div class="sub"' + (open ? '' : '') + '><h3>' + fmt(s.t || '') + '<span class="src">' + esc(s.m.replace('Manual_', '')) + (s.n ? ' · ' + esc(s.n) : '') + '</span></h3>' + renderBlocks(s.b) + '</div>';

  /* ---------- Vistas ---------- */
  function setActive(cat) {
    document.querySelectorAll('.side-cat').forEach(a => a.classList.toggle('on', a.dataset.cat === cat));
  }
  function renderSide() {
    $('#sideNav').innerHTML = DB.categorias.map(c =>
      '<a class="side-cat" data-cat="' + c.id + '" href="#/modulo/' + c.id + '"><span>' + esc(c.nombre) + '</span><span class="n">' + inCat(c.id).length + '</span></a>').join('');
  }
  const crumbs = parts => '<nav class="crumbs" aria-label="Ruta">' + parts.map((p, i) => (i ? '<span class="sep">›</span>' : '') + (p[1] ? '<a href="' + p[1] + '">' + esc(p[0]) + '</a>' : '<span>' + esc(p[0]) + '</span>')).join('') + '</nav>';
  const EXAMPLES = ['IVA por alícuota', '¿Cómo hago una venta con diferentes porcentajes de IVA?', 'anular factura', 'cheques de terceros', 'importar precios desde Excel', 'error 1007'];

  function viewHome() {
    setActive(null);
    main.innerHTML =
      '<section class="hero"><div class="eyebrow">Univac.ERP</div><h1>¿En qué podemos ayudarte?</h1>' +
      '<p>Encontrá procedimientos, explicaciones y respuestas basadas en la documentación oficial de Univac.ERP.</p>' +
      '<form class="big-search" id="homeSearch" role="search"><input id="homeQ" type="search" placeholder="Escribí una función, un botón o tu pregunta…" aria-label="Buscar"><button>Buscar</button></form>' +
      '<div class="examples">Ejemplos: ' + EXAMPLES.map(e => '<button class="chip" data-q="' + esc(e) + '">' + esc(e) + '</button>').join('') + '</div></section>' +
      '<h2 class="sec-title">Explorar por módulo</h2><div class="cat-grid">' +
      DB.categorias.map(c => '<a class="cat-item" href="#/modulo/' + c.id + '"><h3>' + esc(c.nombre) + '</h3><p>' + esc(c.desc) + '</p><span class="count">' + inCat(c.id).length + ' artículos</span></a>').join('') +
      '</div><div class="two-col"><section><h2 class="sec-title">Preguntas frecuentes</h2><ul class="faq-list">' +
      DB.faq.map(f => ARTS[f.articulo]).filter(Boolean).map(a => '<li><a href="#/articulo/' + a.id + '">' + esc(a.titulo) + '</a></li>').join('') +
      '</ul></section><section><h2 class="sec-title">Asistente</h2><div class="panel"><h3>Asistente de documentación</h3>' +
      '<p>Hacé tu consulta en lenguaje natural. Las respuestas se arman solo con la información de los manuales oficiales e indican siempre la fuente.</p>' +
      '<a class="btn" href="#/asistente">Hacer una consulta</a></div></section></div>';
    $('#homeSearch').addEventListener('submit', e => { e.preventDefault(); go('#/buscar/' + encodeURIComponent($('#homeQ').value)); });
    main.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => go('#/buscar/' + encodeURIComponent(b.dataset.q))));
  }

  function viewCat(id) {
    const c = CATS[id]; if (!c) return viewNotFound();
    setActive(id);
    const list = inCat(id); const temas = {};
    list.forEach(a => { const t = a.cat === id ? a.tema : 'Relacionados de otros módulos'; (temas[t] = temas[t] || []).push(a); });
    const order = Object.keys(temas).sort((x, y) => (x === 'Relacionados de otros módulos') - (y === 'Relacionados de otros módulos'));
    main.innerHTML = crumbs([['Inicio', '#/'], [c.nombre]]) +
      '<div class="page-h"><h1>' + esc(c.nombre) + '</h1><p>' + esc(c.desc) + '</p></div>' +
      order.map(t => '<section class="topic"><h2>' + esc(t) + '</h2><ul class="art-list">' + temas[t].map(artItem).join('') + '</ul></section>').join('');
  }
  const artItem = a => '<li><a href="#/articulo/' + a.id + '"><span class="t">' + esc(a.titulo) +
    (a.restringido ? '<span class="tag res">Uso restringido</span>' : '') + (a.revision ? '<span class="tag rev">En revisión</span>' : '') +
    '</span>' + (a.resumen ? '<span class="d">' + esc(a.resumen) + '</span>' : '') + '</a></li>';

  const GROUPS = [
    ['que', '¿Qué es y para qué sirve?'], ['donde', '¿Dónde se encuentra?'], ['pasos', '¿Cómo se hace?'],
    ['detalle', 'Detalle de la pantalla'], ['consid', 'Consideraciones'], ['ejemplo', 'Ejemplo práctico'], ['relacion', 'Relación con otros módulos']
  ];
  function viewArticle(id) {
    const a = ARTS[id]; if (!a) return viewNotFound();
    const c = CATS[a.cat]; setActive(a.cat);
    let body = '', toc = '';
    GROUPS.forEach(([g, label]) => {
      const ss = a.secciones.filter(s => s.g === g); if (!ss.length) return;
      const anchor = 'sec-' + g;
      toc += '<a href="#/articulo/' + a.id + '/' + anchor + '">' + label + '</a>';
      body += '<section class="a-sec" id="' + anchor + '"><h2>' + label + '</h2>';
      if (g === 'detalle' && ss.length > 1)
        body += ss.map((s, i) => '<details class="det"' + (i === 0 ? ' open' : '') + '><summary>' + fmt(s.t || 'Detalle') + '<span class="src">' + esc(s.m.replace('Manual_', '')) + (s.n ? ' · ' + esc(s.n) : '') + '</span></summary>' + '<div class="sub">' + renderBlocks(s.b) + '</div></details>').join('');
      else body += ss.map(s => subHTML(s)).join('');
      body += '</section>';
    });
    const caps = (a.capturas || []).map(m => '<figure><img src="' + esc(m.src) + '" alt="' + esc(m.alt || '') + '" loading="lazy"><figcaption class="small">' + esc(m.alt || '') + '</figcaption></figure>').join('');
    const vids = (a.videos || []).map(v => '<div class="media-slot"><b>Video</b><a href="' + esc(v.url) + '" target="_blank" rel="noopener">' + esc(v.titulo || v.url) + '</a></div>').join('');
    body += '<section class="a-sec" id="sec-media"><h2>Capturas y videos</h2><div class="media">' +
      (caps || '<div class="media-slot"><b>Capturas de pantalla</b>Espacio reservado para capturas reales del sistema.</div>') +
      (vids || '<div class="media-slot"><b>Video tutorial</b>Espacio reservado para un video explicativo.</div>') + '</div></section>';
    toc += '<a href="#/articulo/' + a.id + '/sec-fuente">Fuente</a>';
    body += '<section class="a-sec" id="sec-fuente"><h2>Fuente</h2><div class="source-box">Este artículo se basa en:<ul>' +
      a.fuentes.map(f => '<li><b>' + esc(f.m) + '</b> — sección ' + esc(f.s) + (f.sub.length ? ' (apartados ' + esc(f.sub.join(', ')) + ')' : '') + '</li>').join('') + '</ul></div></section>';
    const rel = related(a);
    if (rel.length) {
      toc += '<a href="#/articulo/' + a.id + '/sec-rel">Artículos relacionados</a>';
      body += '<section class="a-sec" id="sec-rel"><h2>Artículos relacionados</h2><ul class="rel-list">' + rel.map(r => '<li><a href="#/articulo/' + r.id + '">' + esc(r.titulo) + '</a></li>').join('') + '</ul></section>';
    }
    const rev = (a.revision || []).map(r => '<div class="notice review"><span class="k">Observación de documentación · ' + esc(r.titulo) + '</span>' + fmt(r.texto) + '</div>').join('');
    const restr = a.restringido ? '<div class="notice"><span class="k">Uso restringido</span>Según la documentación, esta herramienta está disponible solo para el nivel Super Administrador.</div>' : '';
    main.innerHTML = '<div class="art-wrap"><article class="article">' +
      crumbs([['Inicio', '#/'], [c.nombre, '#/modulo/' + c.id], [a.tema, '#/modulo/' + c.id]]) +
      '<h1>' + esc(a.titulo) + '</h1>' + (a.resumen ? '<p class="lead">' + fmt(a.resumen) + '</p>' : '') +
      '<div class="meta"><span>Módulo: <b>' + esc(c.nombre) + '</b></span><span>Tema: <b>' + esc(a.tema) + '</b></span><span>Fuente: <b>' + esc([...new Set(a.fuentes.map(f => f.m))].join(', ')) + '</b></span>' +
      (a.ultimaRevision ? '<span>Revisión: <b>' + esc(a.ultimaRevision) + '</b></span>' : '') + '</div>' +
      restr + rev + body +
      '<div class="feedback">¿No encontraste lo que necesitabas? <a class="btn ghost" href="#/asistente">Consultar al asistente</a><span class="contact-group"><span class="small">Contactá al equipo de soporte de Univac</span><a class="btn ghost" href="https://wa.me/5493564367491" target="_blank" rel="noopener noreferrer">Contactar al soporte</a></span></div>' +
      '</article><aside class="toc" aria-label="En este artículo"><div class="h">En este artículo</div>' + toc + '</aside></div>';
  }
  function related(a) {
    const out = (a.relacionados || []).map(id => ARTS[id]).filter(Boolean);
    if (out.length < 4) {
      const { res } = score(docs, IDF, AVG, a.titulo + ' ' + a.kw);
      res.forEach(r => { if (out.length < 6 && r.d.a.id !== a.id && !out.includes(r.d.a)) out.push(r.d.a); });
    }
    return out.slice(0, 6);
  }

  function snippet(a, terms) {
    const words = new Set(); terms.forEach(t => t.alts.forEach((_, w) => words.add(w)));
    let best = a.resumen, bs = -1;
    a.secciones.forEach(s => s.b.forEach(b => {
      const tx = blockText(b); if (tx.length < 30) return;
      const sc = toks(tx).filter(t => words.has(t)).length;
      if (sc > bs) { bs = sc; best = tx; }
    }));
    best = best.length > 260 ? best.slice(0, 257) + '…' : best;
    return highlight(best, words);
  }
  function highlight(text, words) {
    return esc(text).replace(/[\p{L}\p{N}]+/gu, w => (words.has(stem(norm(w))) && !STOP.has(norm(w)) ? '<mark>' + w + '</mark>' : w));
  }
  function viewSearch(q) {
    setActive(null); $('#topQ').value = q;
    const { terms, res } = search(q);
    let h = crumbs([['Inicio', '#/'], ['Búsqueda']]) + '<div class="page-h"><h1>Resultados para «' + esc(q) + '»</h1><p>' +
      (res.length ? res.length + ' artículo' + (res.length > 1 ? 's' : '') + ' encontrados en la documentación.' : '') + '</p></div>';
    if (!q.trim() || !res.length) {
      h += '<div class="empty"><h2>No encontramos información suficiente</h2><p>No hay contenido en la documentación disponible que responda a esta búsqueda.</p>' +
        (/wayra/i.test(q) ? '<p>Univac.ERP es el nombre actual del sistema anteriormente denominado Wayra ERP: buscá directamente la función que necesitás.</p>' : '') +
        '<p>Probá con otras palabras (por ejemplo, el nombre de un botón o de una pantalla) o contactá al equipo de soporte de Univac.</p></div>';
    } else {
      h += res.slice(0, 30).map(r => { const a = r.d.a; return '<div class="result"><a class="t" href="#/articulo/' + a.id + '">' + esc(a.titulo) + '</a>' +
        '<div class="path">' + esc(CATS[a.cat].nombre) + ' › ' + esc(a.tema) + ' · ' + esc(a.fuentes[0].m) + '</div><p class="snip">' + snippet(a, terms) + '</p></div>'; }).join('');
    }
    main.innerHTML = h;
  }

  /* ---------- Asistente documental ---------- */
  const chatLog = [];
  function intent(q) {
    const n = norm(q);
    if (/^(que es|que son|para que)/.test(n)) return ['que', 'detalle'];
    if (/^(donde|en que menu|como accedo|como entro)/.test(n)) return ['donde', 'pasos'];
    if (/(error|mensaje|no me deja|no puedo|problema|rechaz)/.test(n)) return ['consid', 'detalle'];
    if (/^(como|pasos|que tengo que hacer)/.test(n)) return ['pasos', 'donde'];
    return [];
  }
  function localAnswer(q) {
    const { terms, res } = search(q);
    if (!terms.length || !res.length) return null;
    const top = res[0];
    const need = terms.length <= 2 ? 1 : 0.6;
    if (top.cov < need) return null;
    const pref = intent(q);
    const cr = score(chunks.filter(c => c.a.id === top.d.a.id), CIDF, CAVG, q).res;
    let pick = [];
    pref.forEach(g => { const c = cr.find(x => x.d.s.g === g); if (c && !pick.includes(c)) pick.push(c); });
    cr.forEach(c => { if (pick.length < 2 && !pick.includes(c)) pick.push(c); });
    pick = pick.slice(0, 2).sort((x, y) => x.d.i - y.d.i);
    const second = res.slice(1, 6).filter(r => r.cov >= need && r.sc >= top.sc * 0.45).slice(0, 3).map(r => r.d.a);
    const bestC = cr.length ? cr[0].sc : 0;
    const globalC = score(chunks, CIDF, CAVG, q).res.filter(c => c.d.a.id !== top.d.a.id && c.cov >= 0.99 && c.sc >= bestC).slice(0, 1);
    return { art: top.d.a, pick: pick.map(p => p.d), extra: globalC.map(c => c.d), also: second };
  }
  function answerHTML(r) {
    if (!r) return '<p>' + esc(SIN_INFO) + '</p>';
    const a = r.art; const parts = r.pick.concat(r.extra);
    const srcs = [...new Map(parts.map(p => [p.s.m + p.s.n + p.s.t, p.s])).values()];
    return '<h4>' + esc(a.titulo) + '</h4>' + (a.resumen ? '<p>' + fmt(a.resumen) + '</p>' : '') +
      r.pick.map(p => subHTML(p.s)).join('') +
      r.extra.map(p => '<p class="small">También en <a href="#/articulo/' + p.a.id + '">' + esc(p.a.titulo) + '</a>:</p>' + subHTML(p.s)).join('') +
      '<p><a href="#/articulo/' + a.id + '">Ver el artículo completo ›</a></p>' +
      (r.also.length ? '<div class="also">Artículos que también pueden servirte: ' + r.also.map(x => '<a href="#/articulo/' + x.id + '">' + esc(x.titulo) + '</a>').join(' · ') + '</div>' : '') +
      '<div class="srcs"><b>Fuente' + (srcs.length > 1 ? 's' : '') + ':</b>' + srcs.map(s => '<div>' + esc(srcLabel(s)) + '</div>').join('') + '</div>';
  }
  async function ask(q) {
    const local = localAnswer(q);
    if (ASISTENTE_IA.endpoint && local) {
      try {
        const contexto = local.pick.concat(local.extra).map(p => ({ fuente: srcLabel(p.s), articulo: p.a.titulo, texto: p.s.b.map(blockText).join('\n') }));
        const resp = await fetch(ASISTENTE_IA.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pregunta: q, contexto, instrucciones: ASISTENTE_IA.instrucciones }) });
        if (resp.ok) {
          const j = await resp.json();
          if (j && j.respuesta) return '<p>' + fmt(j.respuesta).replace(/\n/g, '<br>') + '</p><div class="srcs"><b>Fuentes:</b>' + contexto.map(c => '<div>' + esc(c.fuente) + '</div>').join('') + '</div>';
        }
      } catch (e) { /* si el servicio no responde, se usa la respuesta documental local */ }
    }
    return answerHTML(local);
  }
  function viewAssistant() {
    setActive(null);
    main.innerHTML = '<div class="assist">' + crumbs([['Inicio', '#/'], ['Asistente']]) +
      '<div class="page-h"><h1>Asistente de documentación</h1><p>Respuestas construidas exclusivamente con los manuales oficiales de Univac.ERP. Si la documentación no cubre tu consulta, te lo indicará.</p></div>' +
      '<div class="mode"><i></i>' + (ASISTENTE_IA.endpoint ? 'IA conectada · limitada a la documentación' : 'Modo búsqueda documental: responde con fragmentos literales de los manuales') + '</div>' +
      '<div class="chat"><div class="chat-log" id="chatLog" aria-live="polite"></div>' +
      '<form class="chat-form" id="chatForm"><textarea id="chatQ" placeholder="Escribí tu consulta, por ejemplo: ¿Cómo registro una cobranza?" aria-label="Consulta"></textarea><button>Enviar</button></form></div>' +
      '<p class="small">Ejemplos: ' + EXAMPLES.slice(0, 4).map(e => '<button class="chip" data-q="' + esc(e) + '">' + esc(e) + '</button>').join(' ') + '</p></div>';
    const log = $('#chatLog');
    const paint = () => {
      log.innerHTML = chatLog.length ? chatLog.map(m => '<div class="msg ' + m.r + '">' + m.h + '</div>').join('') :
        '<div class="msg bot"><p>Hola. Soy el asistente del Centro de Ayuda de Univac.ERP. Consultame sobre cualquier función documentada del sistema.</p></div>';
      log.scrollTop = log.scrollHeight;
    };
    const send = async q => {
      q = q.trim(); if (!q) return;
      chatLog.push({ r: 'user', h: esc(q) }); paint();
      chatLog.push({ r: 'bot', h: await ask(q) }); paint();
    };
    $('#chatForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#chatQ').value; $('#chatQ').value = ''; send(v); });
    $('#chatQ').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chatForm').requestSubmit(); } });
    main.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => send(b.dataset.q)));
    paint(); $('#chatQ').focus();
  }

  function viewSources() {
    setActive(null);
    const per = {}; DB.articulos.forEach(a => a.fuentes.forEach(f => (per[f.m] = (per[f.m] || new Set()).add(a.id))));
    main.innerHTML = crumbs([['Inicio', '#/'], ['Fuentes y alcance']]) +
      '<div class="page-h"><h1>Fuentes y alcance</h1><p>Todo el contenido de este Centro de Ayuda proviene exclusivamente de los siguientes manuales oficiales. Univac.ERP es el nombre actual del sistema anteriormente denominado Wayra ERP.</p></div>' +
      Object.keys(DB.manuales).map(m => '<div class="manual-row"><span><b>' + esc(m) + '</b></span><span class="small">' + (per[m] ? per[m].size : 0) + ' artículos</span></div>').join('') +
      '<p class="small" style="margin-top:20px">Las capturas de pantalla y los videos se incorporarán a medida que estén disponibles. Ningún artículo contiene imágenes ni enlaces que no hayan sido provistos oficialmente.</p>';
  }
  function viewReview() {
    setActive(null);
    const items = DB.articulos.filter(a => a.revision);
    const byT = {}; items.forEach(a => a.revision.forEach(r => { (byT[r.texto] = byT[r.texto] || { r, arts: [] }).arts.push(a); }));
    main.innerHTML = crumbs([['Inicio', '#/'], ['Observaciones de documentación']]) +
      '<div class="page-h"><h1>Observaciones de documentación</h1><p>Diferencias detectadas entre manuales. No se unificaron: se muestran tal como figuran en cada fuente hasta su revisión por el equipo de Univac.</p></div>' +
      Object.values(byT).map(o => '<div class="notice review"><span class="k">' + esc(o.r.titulo) + '</span>' + fmt(o.r.texto) +
        '<div class="small" style="margin-top:8px">Artículos afectados: ' + o.arts.map(a => '<a href="#/articulo/' + a.id + '">' + esc(a.titulo) + '</a>').join(' · ') + '</div></div>').join('');
  }
  function viewNotFound() {
    main.innerHTML = '<div class="empty"><h2>Página no encontrada</h2><p>El contenido solicitado no existe.</p><p><a href="#/">Volver al inicio</a></p></div>';
  }

  /* ---------- Router ---------- */
  function go(h) { if (location.hash === h) route(); else location.hash = h; }
  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const [v, p, anchor] = parts.map(x => decodeURIComponent(x || ''));
    closeMenu();
    if (!v) viewHome();
    else if (v === 'modulo') viewCat(p);
    else if (v === 'articulo') viewArticle(p);
    else if (v === 'buscar') viewSearch(parts.slice(1).map(decodeURIComponent).join('/'));
    else if (v === 'asistente') viewAssistant();
    else if (v === 'fuentes') viewSources();
    else if (v === 'revision') viewReview();
    else viewNotFound();
    const el = anchor && document.getElementById(anchor);
    if (el) el.scrollIntoView(); else window.scrollTo(0, 0);
    document.title = (($('h1', main) || {}).textContent || 'Inicio') + ' | Centro de Ayuda Univac.ERP';
  }

  /* ---------- Menú móvil y atajos ---------- */
  const side = $('#sidebar'), scrim = $('#scrim'), btn = $('#btnMenu');
  function closeMenu() { side.classList.remove('open'); scrim.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
  btn.addEventListener('click', () => { const o = !side.classList.contains('open'); side.classList.toggle('open', o); scrim.hidden = !o; btn.setAttribute('aria-expanded', String(o)); });
  scrim.addEventListener('click', closeMenu);
  $('#topSearch').addEventListener('submit', e => { e.preventDefault(); go('#/buscar/' + encodeURIComponent($('#topQ').value)); });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); $('#topQ').focus(); }
    if (e.key === 'Escape') closeMenu();
  });

  renderSide();
  window.addEventListener('hashchange', route);
  route();
  window.UnivacAyuda = { search: q => search(q).res.map(r => r.d.a.id), ask: q => localAnswer(q) };
})();
