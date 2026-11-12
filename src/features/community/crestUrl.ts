// ¿El link de la imagen de una comunidad es de un escudo diseñado en la app? Va aparte de crestCore a propósito: Inicio lo necesita
// para dibujar el escudo, y si lo importara desde crestCore, todo el diseñador (formas, patrones y SVG) viajaría en el bundle principal.

/** ¿El link es de un escudo diseñado (PNG con forma propia, que no se recorta dentro del escudo de siempre)? */
export const isCrestUrl = (url: string | null | undefined) => !!url && /\/crest-[0-9a-f-]+\.png(\?|$)/i.test(url);
