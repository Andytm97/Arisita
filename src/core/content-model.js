function convertirPaginaEnRecuerdo(pagina, indice) {
  const id = pagina.id || `recuerdo-${String(indice + 1).padStart(3, "0")}`;
  const { fecha = "", ...elemento } = pagina;
  return {
    id,
    fecha,
    titulo: pagina.titulo || pagina.texto || pagina.cancion?.titulo || "",
    publicacion: pagina.publicacion || null,
    destacado: Boolean(pagina.destacado),
    elementos: [{ ...elemento, id: `${id}-elemento-1` }]
  };
}

function convertirRecuerdoEnPaginas(recuerdo) {
  const elementos = Array.isArray(recuerdo.elementos) ? recuerdo.elementos : [];
  return elementos.map((elemento, indice) => ({
    ...elemento,
    id: elemento.id || `${recuerdo.id || "recuerdo"}-elemento-${indice + 1}`,
    recuerdoId: recuerdo.id,
    fecha: elemento.fecha || recuerdo.fecha || "",
    titulo: elemento.titulo || recuerdo.titulo || "",
    destacado: elemento.destacado ?? recuerdo.destacado ?? false
  }));
}

export function normalizarContenido(origen, fallback) {
  const base = origen && typeof origen === "object" ? origen : fallback;
  const recuerdos = Array.isArray(base.recuerdos) && base.recuerdos.length
    ? base.recuerdos
    : (Array.isArray(base.paginas) ? base.paginas.map(convertirPaginaEnRecuerdo) : []);
  const paginas = recuerdos.flatMap(convertirRecuerdoEnPaginas);

  return {
    nombre: base.nombre || fallback.nombre || "Aris",
    portada: base.portada || fallback.portada || {},
    recuerdos,
    paginas
  };
}
