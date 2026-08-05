export function escapar(valor = "") {
  return String(valor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function atributoSeguro(valor = "") {
  return escapar(valor).replaceAll("`", "&#096;");
}

export function suavizarProgreso(valor) {
  const t = Math.max(0, Math.min(1, valor));
  return t * t * (3 - 2 * t);
}

export function formatearTiempo(segundos) {
  if (!Number.isFinite(segundos)) return "0:00";
  const min = Math.floor(segundos / 60);
  const sec = Math.floor(segundos % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}
