import { DEMO_DATA } from "./data/demo-data.js";
import { normalizarContenido } from "./core/content-model.js";
import { escapar, atributoSeguro, suavizarProgreso, formatearTiempo } from "./core/utils.js";
import { renderTarjeta } from "./components/memory-renderer.js";
import { obtenerRecuerdosFirebase, obtenerPortadaFirebase, obtenerReencuentroFirebase, obtenerConfiguracionGeneralFirebase, obtenerCalendarioFirebase, observarRecuerdosFirebase, asegurarSesionAlbum, obtenerRespuestaFirebase, obtenerRespuestasRecuerdosFirebase, guardarRespuestaFirebase } from "./firebase/firebase-service.js";

let data = DEMO_DATA;
let paginas = [];
let portada = {};
let paginaActual = 0;
let enAlbum = false;
let bloqueado = false;
let pointerActivo = false;
let inicioX = 0;
let inicioY = 0;
let movimientoX = 0;
let movimientoY = 0;
let ejeBloqueado = null;
let paginaFondoPreparada = null;
let favoritos = new Set();
const colaNavegacion = [];

const zonaTarjetas = document.getElementById("zonaTarjetas");
let tarjetaActual = document.getElementById("tarjetaActual");
let tarjetaSiguiente = document.getElementById("tarjetaSiguiente");
const indicadores = document.getElementById("indicadores");
const numeroPagina = document.getElementById("numeroPagina");
const textoGesto = document.getElementById("textoGesto");
const background = document.getElementById("background");
const backgroundShade = document.querySelector(".background-shade");
const album = document.querySelector(".album");
const openMemoryExplorer = document.getElementById("openMemoryExplorer");
const openRandomMemory = document.getElementById("openRandomMemory");
const openFavorites = document.getElementById("openFavorites");
let fechaReencuentro = "2026-10-09";
let configGeneral = {};
let mensajesCalendario = [];
const paginaFinal = { id: "proximo-recuerdo", tipo: "proximo", titulo: "Aquí aparecerá el próximo recuerdo.", descripcion: "Cuando tenga algo nuevo que contarte, aparecerá justo aquí." };
const conPaginaFinal = items => [...items, paginaFinal];
function elegirPortada(configuracion) {
  const images = configuracion?.imagenes?.length ? configuracion.imagenes : (configuracion?.contenido ? [configuracion.contenido] : []);
  if (!images.length) return configuracion?.contenido || "";
  let candidates = images;
  try { const last = localStorage.getItem("aris-last-random-cover"); if (images.length > 1) candidates = images.filter(url => url !== last); } catch (_) {}
  const selected = candidates[Math.floor(Math.random() * candidates.length)] || images[0];
  try { localStorage.setItem("aris-last-random-cover", selected); } catch (_) {}
  return selected;
}

function imagenesPortada(configuracion) {
  return configuracion?.imagenes?.length ? configuracion.imagenes : (configuracion?.contenido ? [configuracion.contenido] : []);
}

function prepararRecuerdosVisibles(items) {
  const now = Date.now();
  return [...items].sort((a, b) => String(a.fechaISO || a.fecha || "").localeCompare(String(b.fechaISO || b.fecha || "")) || Number(a.createdAt?.seconds || 0) - Number(b.createdAt?.seconds || 0)).flatMap(memory => {
    if (memory.eliminado || memory.publicado === false || memory.publicationMode === "borrador") return [];
    const unlock = memory.availableAt ? new Date(memory.availableAt).getTime() : 0;
    if (!unlock || unlock <= now) return [memory];
    if (memory.lockMode === "oculto") return [];
    return [{ ...memory, elementos: [{ tipo: "bloqueado", titulo: "Hay algo esperando para ti…", descripcion: `Podrás abrirlo el ${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long" }).format(new Date(unlock))} ♥`, desbloqueo: memory.availableAt }] }];
  });
}

iniciar().catch((error) => {
  console.error("ARIS no pudo iniciar con los datos guardados.", error);
  data = normalizarContenido(DEMO_DATA, DEMO_DATA);
  prepararAplicacion(data);
  cargarFavoritos();
  revelarAplicacion();
});

function revelarAplicacion() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.body.classList.add("cover-intro");
    document.body.classList.remove("app-loading");
    setTimeout(() => document.body.classList.remove("cover-intro"), 1800);
  }));
}

function precargarImagen(src) {
  if (!src) return Promise.resolve();
  return new Promise(resolve => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = resolve;
    image.src = src;
  });
}

async function iniciar() {
  asegurarSesionAlbum().catch(error => console.warn("Las respuestas no están disponibles.", error));
  let recuerdosFirebase = [];
  let portadaFirebase = null;
  let reencuentroFirebase = null;
  let generalFirebase = null;

  try {
    const portadaLista = obtenerPortadaFirebase().then(async portada => {
      const contenido = elegirPortada(portada);
      const precargas = portada?.mode === "mosaic" ? imagenesPortada(portada) : [contenido];
      await Promise.all(precargas.map(precargarImagen));
      return portada ? { ...portada, contenido } : portada;
    });
    [recuerdosFirebase, portadaFirebase, reencuentroFirebase, generalFirebase, mensajesCalendario] = await Promise.all([
      obtenerRecuerdosFirebase(),
      portadaLista,
      obtenerReencuentroFirebase(),
      obtenerConfiguracionGeneralFirebase(),
      obtenerCalendarioFirebase()
    ]);
  } catch (error) {
    console.warn("Firebase no está disponible; ARIS mostrará el álbum vacío.", error);
  }

  fechaReencuentro = reencuentroFirebase?.fecha || fechaReencuentro;
  configGeneral = generalFirebase || {};
  const portadaElegida = portadaFirebase?.contenido || "";

  data = normalizarContenido({
    ...DEMO_DATA,
    nombre: configGeneral.nombre || DEMO_DATA.nombre,
    portada: portadaElegida
      ? { ...DEMO_DATA.portada, ...portadaFirebase, titulo: configGeneral.titulo || DEMO_DATA.portada.titulo, texto: configGeneral.subtitulo || DEMO_DATA.portada.texto, contenido: portadaElegida }
      : { ...DEMO_DATA.portada, titulo: configGeneral.titulo || DEMO_DATA.portada.titulo, texto: configGeneral.subtitulo || DEMO_DATA.portada.texto },
    recuerdos: prepararRecuerdosVisibles(recuerdosFirebase)
  }, DEMO_DATA);

  prepararAplicacion(data);
  cargarFavoritos();
  revelarAplicacion();
  setTimeout(mostrarMensajesDeHoy, 1900);
  let firstSnapshot = true;
  observarRecuerdosFirebase(items => { if (firstSnapshot) { firstSnapshot = false; return; } const updated = normalizarContenido({ ...data, recuerdos: prepararRecuerdosVisibles(items) }, DEMO_DATA); const previousCount = paginas.length; data = updated; paginas = conPaginaFinal(updated.paginas); crearIndicadores(); if (enAlbum) { paginaActual = Math.min(paginaActual, Math.max(0, paginas.length - 1)); mostrarPagina(); } if (paginas.length > previousCount) mostrarAvisoNuevoRecuerdo(); });
}

function mostrarAvisoNuevoRecuerdo() { const notice = document.createElement("div"); notice.className = "new-memory-toast"; notice.textContent = "Hay un recuerdo nuevo para ti ♥"; document.body.appendChild(notice); requestAnimationFrame(() => notice.classList.add("is-visible")); setTimeout(() => notice.remove(), 3200); }

function fechaLocalISO(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function mostrarMensajesDeHoy() {
  const hoy = fechaLocalISO();
  const mensajes = mensajesCalendario.filter(mensaje => mensaje.anual ? mensaje.fecha?.slice(5) === hoy.slice(5) : mensaje.fecha === hoy);
  if (!mensajes.length) return;
  const sessionKey = `aris-calendar-${hoy}-${mensajes.map(item => item.id).join("-")}`;
  try { if (sessionStorage.getItem(sessionKey)) return; sessionStorage.setItem(sessionKey, "shown"); } catch (_) {}
  let index = 0;
  const modal = document.createElement("div"); modal.className = "calendar-popup";
  modal.innerHTML = `<article class="calendar-popup-card" role="dialog" aria-modal="true"><button class="calendar-popup-close" type="button" aria-label="Cerrar">×</button><div class="calendar-popup-heart" aria-hidden="true">♥</div><p class="calendar-popup-kicker">UN MENSAJE PARA HOY</p><h2></h2><p class="calendar-popup-text"></p><button class="calendar-popup-next" type="button"></button></article>`;
  document.body.appendChild(modal);
  const render = () => { const mensaje = mensajes[index]; modal.querySelector("h2").textContent = mensaje.titulo; modal.querySelector(".calendar-popup-text").textContent = mensaje.texto; modal.querySelector(".calendar-popup-next").textContent = index < mensajes.length - 1 ? `Ver el siguiente · ${index + 1}/${mensajes.length}` : "Guardar este momento ♥"; };
  const close = () => { modal.classList.remove("is-open"); setTimeout(() => modal.remove(), 320); };
  modal.querySelector(".calendar-popup-close").addEventListener("click", close);
  modal.querySelector(".calendar-popup-next").addEventListener("click", () => { if (index < mensajes.length - 1) { index += 1; modal.querySelector(".calendar-popup-card").classList.add("is-changing"); setTimeout(() => { render(); modal.querySelector(".calendar-popup-card").classList.remove("is-changing"); }, 170); } else close(); });
  render(); requestAnimationFrame(() => modal.classList.add("is-open"));
}

async function cargarFavoritos() {
  try {
    const ids = paginas.map(pagina => pagina.recuerdoId).filter(Boolean);
    const respuestas = await obtenerRespuestasRecuerdosFirebase(ids);
    favoritos = new Set(respuestas.filter(respuesta => respuesta.corazon).map(respuesta => respuesta.recuerdoId));
    openFavorites?.classList.toggle("has-favorites", favoritos.size > 0);
  } catch (_) {}
}

function miniaturaPagina(pagina) {
  if (pagina.tipo === "foto") return pagina.imagenes?.[0] || pagina.contenido || "";
  if (pagina.tipo === "spotify") return pagina.portada || pagina.caratula || "";
  if (pagina.tipo === "video") return pagina.poster || "";
  if (pagina.tipo === "youtube") return pagina.miniatura || "";
  return "";
}

function abrirExplorador(soloFavoritos = false) {
  document.getElementById("memoryExplorer")?.remove();
  const disponibles = paginas.map((pagina, index) => ({ pagina, index })).filter(({ pagina }) => pagina.tipo !== "proximo" && (!soloFavoritos || favoritos.has(pagina.recuerdoId)));
  const modal = document.createElement("div");
  modal.id = "memoryExplorer";
  modal.className = "memory-explorer";
  modal.innerHTML = `<section class="memory-explorer-sheet" role="dialog" aria-modal="true" aria-label="${soloFavoritos ? "Favoritos de Aris" : "Nuestros recuerdos"}"><header><div><p>${soloFavoritos ? "LOS QUE MÁS TE GUSTAN" : "NUESTRO ÁLBUM"}</p><h2>${soloFavoritos ? "Favoritos de Aris" : "Todos nuestros recuerdos"}</h2></div><button type="button" class="memory-explorer-close" aria-label="Cerrar">×</button></header><div class="memory-explorer-grid">${disponibles.length ? disponibles.map(({ pagina, index }) => { const miniatura = miniaturaPagina(pagina); return `<button type="button" class="memory-explorer-item" data-memory-index="${index}">${miniatura ? `<img src="${atributoSeguro(miniatura)}" alt="">` : `<span class="memory-explorer-symbol">${pagina.tipo === "texto" ? "“" : "♥"}</span>`}<span><strong>${escapar(pagina.titulo || "Un recuerdo")}</strong><small>${escapar(pagina.fecha || "")}</small></span></button>`; }).join("") : `<div class="memory-explorer-empty">${soloFavoritos ? "Aquí aparecerán los recuerdos a los que des corazón." : "Todavía no hay recuerdos para mostrar."}</div>`}</div></section>`;
  document.body.appendChild(modal);
  const cerrar = () => { modal.classList.remove("is-open"); setTimeout(() => modal.remove(), 260); };
  modal.querySelector(".memory-explorer-close").addEventListener("click", cerrar);
  modal.addEventListener("click", event => { if (event.target === modal) cerrar(); });
  modal.querySelectorAll("[data-memory-index]").forEach(button => button.addEventListener("click", () => { paginaActual = Number(button.dataset.memoryIndex); mostrarPagina({ instantaneo: true }); cerrar(); }));
  requestAnimationFrame(() => modal.classList.add("is-open"));
}

function abrirRecuerdoSorpresa() {
  const indices = paginas.map((pagina, index) => pagina.tipo !== "proximo" ? index : -1).filter(index => index >= 0 && index !== paginaActual);
  if (!indices.length) return;
  paginaActual = indices[Math.floor(Math.random() * indices.length)];
  mostrarPagina();
}

function actualizarCuentaAtras() {
  const pie = document.getElementById("cuentaAtras");
  if (!pie) return;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const [year, month, day] = fechaReencuentro.split("-").map(Number);
  const destino = new Date(year, month - 1, day);
  destino.setHours(0, 0, 0, 0);
  const dias = Math.ceil((destino - hoy) / 86400000);

  if (dias > 1) {
    pie.innerHTML = `<span>Quedan</span><strong id="contador">${dias}</strong><span>días para vernos.</span>`;
  } else if (dias === 1) {
    pie.innerHTML = `<span>Queda</span><strong id="contador">1</strong><span>día para vernos.</span>`;
  } else if (dias === 0) {
    pie.innerHTML = `<strong class="countdown-message">Hoy nos vemos ❤️</strong>`;
  } else {
    pie.innerHTML = `<strong class="countdown-message">Por fin estamos juntos ❤️</strong>`;
  }
}

function prepararAplicacion(contenido) {
  data = normalizarContenido(contenido, DEMO_DATA);
  document.getElementById("nombre").textContent = data.nombre || "Aris";
  actualizarCuentaAtras();
  portada = { ...(data.portada || DEMO_DATA.portada) };
  paginas = conPaginaFinal(Array.isArray(data.paginas) ? data.paginas : []);
  crearIndicadores();
  precargarRecuerdosCercanos(indiceUltimoRecuerdo());
  mostrarPortada();
}

function indiceUltimoRecuerdo() {
  return Math.max(0, paginas.length - 2);
}

function imagenesDePagina(pagina) {
  if (!pagina) return [];
  if (pagina.tipo === "foto") return (pagina.imagenes?.length ? pagina.imagenes : [pagina.contenido]).filter(Boolean);
  return [pagina.poster, pagina.miniatura, pagina.portada].filter(Boolean);
}

function precargarRecuerdosCercanos(indice) {
  [-2, -1, 1, 2].flatMap(offset => imagenesDePagina(paginas[indice + offset])).forEach(src => precargarImagen(src));
}

function cargarTarjeta(elemento, pagina) {
  elemento.innerHTML = renderTarjeta(pagina);
  if (pagina?.recuerdoId) prepararRespuesta(elemento, pagina);
}

async function prepararRespuesta(elemento, pagina) {
  const actions = document.createElement("div");
  actions.className = "memory-feedback-line-v2";
  actions.innerHTML = `<button type="button" class="response-heart" aria-label="Reaccionar con un corazón">♡</button><button type="button" class="response-note">Deja una nota</button>`;
  const description = elemento.querySelector(".card-description, .spotify-description, .letter-signature");
  const copy = elemento.querySelector(".card-copy, .spotify-player, .letter-body, .card-inner");
  if (description) description.insertAdjacentElement("afterend", actions);
  else copy?.appendChild(actions);
  actions.addEventListener("pointerdown", event => event.stopPropagation());
  let response = null;
  try { response = await obtenerRespuestaFirebase(pagina.recuerdoId); } catch (_) {}
  const heart = actions.querySelector(".response-heart");
  const noteButton = actions.querySelector(".response-note");
  if (response?.corazon) { heart.textContent = "♥"; heart.classList.add("is-active"); favoritos.add(pagina.recuerdoId); }
  if (response?.nota) { noteButton.textContent = "Notas"; noteButton.classList.add("has-note"); }
  heart.addEventListener("click", async event => {
    event.stopPropagation();
    const active = !heart.classList.contains("is-active");
    heart.classList.toggle("is-active", active); heart.textContent = active ? "♥" : "♡";
    try { await guardarRespuestaFirebase(pagina.recuerdoId, { corazon: active, nota: response?.nota || "" }); response = { ...(response || {}), corazon: active }; active ? favoritos.add(pagina.recuerdoId) : favoritos.delete(pagina.recuerdoId); openFavorites?.classList.toggle("has-favorites", favoritos.size > 0); }
    catch (error) { heart.classList.toggle("is-active", !active); heart.textContent = active ? "♡" : "♥"; alert(error.message); }
  });
  noteButton.addEventListener("click", event => { event.stopPropagation(); abrirNota(pagina, response, saved => { response = saved; noteButton.textContent = saved.nota ? "Notas" : "Deja una nota"; noteButton.classList.toggle("has-note", Boolean(saved.nota)); }); });
}

function abrirNota(pagina, response, onSaved) {
  let modal = document.getElementById("responseModal");
  if (!modal) {
    modal = document.createElement("div"); modal.id = "responseModal"; modal.className = "response-modal";
    modal.innerHTML = `<form class="response-sheet"><button class="response-close" type="button" aria-label="Cerrar">×</button><p class="response-kicker">UNA NOTA PARA ANDRÉS</p><h2>¿Qué quieres decir sobre este recuerdo?</h2><textarea maxlength="600" placeholder="Escribe aquí…"></textarea><button class="primary-response" type="submit">Enviar ♥</button><p class="response-status" aria-live="polite"></p></form>`;
    document.body.appendChild(modal);
    modal.querySelector(".response-close").addEventListener("click", () => modal.classList.remove("is-open"));
    modal.addEventListener("click", event => { if (event.target === modal) modal.classList.remove("is-open"); });
  }
  const textarea = modal.querySelector("textarea"); textarea.value = response?.nota || "";
  const form = modal.querySelector("form"); const status = modal.querySelector(".response-status");
  form.onsubmit = async event => { event.preventDefault(); status.textContent = "Guardando…"; try { const saved = { ...(response || {}), corazon: Boolean(response?.corazon), nota: textarea.value.trim() }; await guardarRespuestaFirebase(pagina.recuerdoId, saved); onSaved?.(saved); status.textContent = "Nota guardada ♥"; setTimeout(() => modal.classList.remove("is-open"), 500); } catch (error) { status.textContent = error.message; } };
  modal.classList.add("is-open"); setTimeout(() => textarea.focus(), 200);
}

let tarjetaAnterior = document.getElementById("tarjetaAnterior");
const tarjetas = [tarjetaAnterior, tarjetaActual, tarjetaSiguiente];
let inicioTiempo = 0;
let ultimaX = 0;
let ultimaY = 0;
let ultimoTiempo = 0;
let velocidadX = 0;
let velocidadY = 0;
let frameArrastre = 0;
let capaPortadaGesto = null;
let transicionPortadaPreparada = false;
let progresoPortada = 0;

function obtenerPagina(indice) {
  return indice >= 0 && indice < paginas.length ? paginas[indice] : null;
}

function asignarRolesTarjetas() {
  tarjetas.forEach(tarjeta => {
    tarjeta.classList.remove(
      "memory-card--previous",
      "memory-card--current",
      "memory-card--next",
      "is-active-neighbor"
    );
  });
  tarjetaAnterior.classList.add("memory-card--previous");
  tarjetaActual.classList.add("memory-card--current");
  tarjetaSiguiente.classList.add("memory-card--next");
}

function configurarTarjeta(elemento, pagina, indice) {
  if (!pagina) {
    elemento.innerHTML = "";
    elemento.dataset.index = "";
    elemento.setAttribute("aria-hidden", "true");
    return;
  }
  if (elemento.dataset.index !== String(indice)) {
    cargarTarjeta(elemento, pagina);
    elemento.dataset.index = String(indice);
  }
  elemento.setAttribute("aria-hidden", elemento === tarjetaActual ? "false" : "true");
}

function mostrarPortada() {
  document.body.classList.add("cover-mode");
  enAlbum = false;
  configurarTarjeta(tarjetaAnterior, null, -1);
  configurarTarjeta(tarjetaSiguiente, null, -1);
  tarjetaActual.dataset.index = "portada";
  tarjetaActual.innerHTML = `
    <div class="card-inner cover-card">
      <p class="cover-kicker">${escapar(configGeneral.kicker || "A PESAR DE LA DISTANCIA...")}</p>
      <h2 class="cover-title">${escapar(portada.titulo || "Un pedacito de nosotros, cada día.")}</h2>
      <p class="cover-copy">${escapar(portada.texto || "Tengo algo que enseñarte.")}</p>
      <div class="cover-arrow" aria-hidden="true"></div>
    </div>`;
  numeroPagina.textContent = "00";
  textoGesto.textContent = "Desliza hacia arriba";
  cambiarFondo();
  actualizarIndicadores();
  resetVisual(true);
}

function crearIndicadores() {
  indicadores.innerHTML = paginas.map((_, i) => `<span class="indicator" data-index="${i}"></span>`).join("");
}

function actualizarIndicadores() {
  [...indicadores.children].forEach((item, i) => item.classList.toggle("active", enAlbum && i === paginaActual));
}

function mostrarPagina({ instantaneo = true } = {}) {
  document.body.classList.remove("cover-mode");

  if (!paginas.length) {
    configurarTarjeta(tarjetaAnterior, null, -1);
    configurarTarjeta(tarjetaSiguiente, null, -1);
    tarjetaActual.dataset.index = "vacio";
    tarjetaActual.setAttribute("aria-hidden", "false");
    tarjetaActual.innerHTML = `
      <div class="card-inner empty-album-card">
        <p class="memory-label">Nuestro álbum</p>
        <div class="empty-album-symbol" aria-hidden="true">♡</div>
        <h2>Aquí empezará nuestra historia.</h2>
        <p>El primer recuerdo aparecerá muy pronto.</p>
      </div>`;
    numeroPagina.textContent = "—";
    textoGesto.textContent = "Todavía no hay recuerdos";
    actualizarIndicadores();
    resetVisual(instantaneo);
    return;
  }

  configurarTarjeta(tarjetaAnterior, obtenerPagina(paginaActual - 1), paginaActual - 1);
  configurarTarjeta(tarjetaActual, obtenerPagina(paginaActual), paginaActual);
  configurarTarjeta(tarjetaSiguiente, obtenerPagina(paginaActual + 1), paginaActual + 1);
  numeroPagina.textContent = String(paginaActual + 1).padStart(2, "0");
  textoGesto.textContent = "Desliza para continuar";
  actualizarIndicadores();
  resetVisual(instantaneo);
}

function cambiarFondo() {
  const segura = portada.contenido || "assets/fondo.jpg";
  background.style.backgroundImage = "none";
  let image = background.querySelector(".background-image");
  if (!image) { image = document.createElement("img"); image.className = "background-image"; image.alt = ""; background.appendChild(image); }
  let mosaic = background.querySelector(".background-mosaic");
  if (!mosaic) { mosaic = document.createElement("div"); mosaic.className = "background-mosaic"; background.appendChild(mosaic); }
  const sources = imagenesPortada(portada);
  const useMosaic = portada.mode === "mosaic" && sources.length > 1;
  if (useMosaic) {
    const ratio = Math.max(.45, innerWidth / innerHeight);
    const columns = Math.max(1, Math.ceil(Math.sqrt(sources.length * ratio)));
    const rows = Math.max(1, Math.ceil(sources.length / columns), Math.ceil(columns / ratio));
    const count = columns * rows;
    const tiles = Array.from({ length: count }, (_, index) => sources[index % sources.length]);
    mosaic.style.setProperty("--mosaic-columns", columns);
    mosaic.style.setProperty("--mosaic-rows", rows);
    mosaic.replaceChildren(...tiles.map(source => { const tile = document.createElement("img"); tile.src = source; tile.alt = ""; return tile; }));
  } else mosaic.replaceChildren();
  mosaic.hidden = !useMosaic;
  image.hidden = useMosaic;
  image.src = segura;
  image.style.objectPosition = `center ${portada.position ?? 44}%`;
  document.documentElement.style.setProperty("--aris-cover-position", `${portada.position ?? 44}%`);
  if (backgroundShade) backgroundShade.style.opacity = String(.55 + (portada.shade ?? 22) / 170);
}

function setSinTransicion(valor) {
  tarjetas.forEach(t => t.classList.toggle("sin-transicion", valor));
}

function aplicarVars(elemento, x, y, escala, rotacion, opacidad, elevacion, luz = 50) {
  elemento.style.setProperty("--x", `${x}px`);
  elemento.style.setProperty("--y", `${y}px`);
  elemento.style.setProperty("--scale", escala);
  elemento.style.setProperty("--rotate", `${rotacion}deg`);
  elemento.style.setProperty("--opacity", opacidad);
  elemento.style.setProperty("--lift", elevacion);
  elemento.style.setProperty("--light-x", `${luz}%`);
}

function resetVisual(instantaneo = false) {
  if (instantaneo) setSinTransicion(true);
  tarjetas.forEach(t => t.classList.remove("is-dragging", "is-active-neighbor"));
  aplicarVars(tarjetaActual, 0, 0, 1, 0, 1, 0, 50);
  aplicarVars(tarjetaAnterior, -20, 14, .958, -0.35, paginaActual > 0 ? .34 : 0, 0, 42);
  aplicarVars(tarjetaSiguiente, 20, 14, .958, .35, paginaActual < paginas.length - 1 ? .34 : 0, 0, 58);
  tarjetas.forEach(t => t.querySelector(".card-inner")?.style.removeProperty("--content-shift"));
  if (instantaneo) {
    void tarjetaActual.offsetWidth;
    requestAnimationFrame(() => setSinTransicion(false));
  }
}


function aplicarArrastreHorizontal() {
  frameArrastre = 0;
  if (!pointerActivo || bloqueado || !enAlbum) return;

  const ancho = Math.max(1, zonaTarjetas.clientWidth);
  let x = movimientoX;
  const sinAnterior = paginaActual === 0 && x > 0;
  const sinSiguiente = paginaActual === paginas.length - 1 && x < 0;
  if (sinAnterior || sinSiguiente) x *= .28;

  const progreso = Math.min(1, Math.abs(x) / ancho);
  const giro = (x / ancho) * 1.25;

  // Durante el gesto solo se modifican transform y opacity. Esto evita
  // repintar el cristal, la luz y las sombras completas en cada fotograma.
  aplicarVars(tarjetaActual, x, 0, 1, giro, 1, 0, 50);

  const activa = x < 0 ? tarjetaSiguiente : tarjetaAnterior;
  const pasiva = x < 0 ? tarjetaAnterior : tarjetaSiguiente;
  activa.classList.add("is-active-neighbor");
  pasiva.classList.remove("is-active-neighbor");
  const disponible = x < 0 ? paginaActual < paginas.length - 1 : paginaActual > 0;
  const desplazamientoEntrada = x < 0 ? 18 * (1 - progreso) : -18 * (1 - progreso);

  aplicarVars(
    activa,
    desplazamientoEntrada,
    12 * (1 - progreso),
    .965 + progreso * .035,
    -giro * .08,
    disponible ? .40 + progreso * .60 : 0,
    0,
    50
  );

  aplicarVars(
    pasiva,
    x < 0 ? -18 : 18,
    12,
    .965,
    0,
    .10 * (1 - progreso),
    0,
    50
  );
}

function prepararTransicionPortada() {
  if (transicionPortadaPreparada || enAlbum) return;
  transicionPortadaPreparada = true;

  capaPortadaGesto = document.createElement("div");
  capaPortadaGesto.className = "cover-gesture-layer";
  capaPortadaGesto.setAttribute("aria-hidden", "true");
  capaPortadaGesto.innerHTML = tarjetaActual.innerHTML;
  document.body.appendChild(capaPortadaGesto);

  // Montamos el álbum por debajo sin convertir todavía el gesto en horizontal.
  enAlbum = true;
  paginaActual = indiceUltimoRecuerdo();
  mostrarPagina({ instantaneo: true });
  enAlbum = false;
  document.body.classList.add("cover-gesture-active");
  actualizarTransicionPortada(0);
}

function actualizarTransicionPortada(progreso) {
  progresoPortada = Math.max(0, Math.min(1, progreso));
  if (!capaPortadaGesto) return;

  // La portada domina durante la primera mitad del gesto. El álbum empieza
  // a revelarse más tarde para que el fundido acompañe todo el recorrido.
  const progresoPortadaVisual = suavizarProgreso(
    Math.max(0, (progresoPortada - .24) / .76)
  );
  const progresoAlbumVisual = suavizarProgreso(
    Math.max(0, (progresoPortada - .42) / .58)
  );
  const desplazamiento = movimientoY < 0 ? movimientoY * .96 : 0;

  capaPortadaGesto.style.setProperty("--cover-y", `${desplazamiento}px`);
  capaPortadaGesto.style.setProperty("--cover-opacity", String(1 - progresoPortadaVisual * .985));
  capaPortadaGesto.style.setProperty("--hint-opacity", String(Math.max(0, 1 - progresoPortada * 2.1)));

  album.style.setProperty("--album-reveal", String(progresoAlbumVisual));
  album.style.setProperty("--album-y", `${18 * (1 - progresoAlbumVisual)}px`);
  album.style.setProperty("--album-scale", String(.986 + progresoAlbumVisual * .014));
}

function aplicarArrastrePortada() {
  frameArrastre = 0;
  if (!pointerActivo || bloqueado || enAlbum) return;
  const y = Math.min(0, movimientoY);
  if (y < -2) prepararTransicionPortada();
  if (!transicionPortadaPreparada) return;
  const recorrido = Math.max(1, window.innerHeight * .92);
  actualizarTransicionPortada(Math.abs(y) / recorrido);
}

function solicitarArrastre() {
  if (frameArrastre) return;
  frameArrastre = requestAnimationFrame(enAlbum ? aplicarArrastreHorizontal : aplicarArrastrePortada);
}

function iniciarGesto(evento) {
  if ((bloqueado && !enAlbum) || evento.button > 0) return;
  pointerActivo = true;
  ejeBloqueado = null;
  inicioX = ultimaX = evento.clientX;
  inicioY = ultimaY = evento.clientY;
  movimientoX = movimientoY = velocidadX = velocidadY = 0;
  inicioTiempo = ultimoTiempo = performance.now();
  if (!bloqueado) tarjetas.forEach(t => t.classList.add("is-dragging"));
  zonaTarjetas.setPointerCapture?.(evento.pointerId);
}

function moverGesto(evento) {
  if (!pointerActivo || (bloqueado && !enAlbum)) return;
  const ahora = performance.now();
  movimientoX = evento.clientX - inicioX;
  movimientoY = evento.clientY - inicioY;
  const dt = Math.max(8, ahora - ultimoTiempo);
  const instantanea = (evento.clientX - ultimaX) / dt;
  const instantaneaY = (evento.clientY - ultimaY) / dt;
  velocidadX = velocidadX * .72 + instantanea * .28;
  velocidadY = velocidadY * .72 + instantaneaY * .28;
  ultimaX = evento.clientX;
  ultimaY = evento.clientY;
  ultimoTiempo = ahora;
  if (!ejeBloqueado && Math.max(Math.abs(movimientoX), Math.abs(movimientoY)) > 7) {
    ejeBloqueado = Math.abs(movimientoX) > Math.abs(movimientoY) ? "x" : "y";
  }
  if ((enAlbum && ejeBloqueado === "x") || (!enAlbum && ejeBloqueado === "y")) {
    evento.preventDefault();
    if (!bloqueado) solicitarArrastre();
  }
}

function terminarGesto(evento) {
  if (!pointerActivo) return;
  const navegacionOcupada = bloqueado && enAlbum;
  pointerActivo = false;
  if (frameArrastre) cancelAnimationFrame(frameArrastre);
  frameArrastre = 0;
  if (!navegacionOcupada) tarjetas.forEach(t => t.classList.remove("is-dragging", "is-active-neighbor"));
  zonaTarjetas.releasePointerCapture?.(evento.pointerId);

  if (navegacionOcupada) {
    const ancho = zonaTarjetas.clientWidth;
    const rapido = Math.abs(movimientoX) > Math.min(62, ancho * .16) || (Math.abs(velocidadX) > .42 && Math.abs(movimientoX) > 18);
    if (rapido) {
      const direccion = movimientoX < 0 ? 1 : -1;
      const proyectada = paginaActual + colaNavegacion.reduce((total, item) => total + item, 0) + direccion;
      if (proyectada >= 0 && proyectada < paginas.length) colaNavegacion.push(direccion);
    }
    return;
  }

  if (!enAlbum) {
    const completar = movimientoY < -68 || (velocidadY < -.42 && movimientoY < -24);
    if (transicionPortadaPreparada) finalizarTransicionPortada(completar);
    else resetVisual();
    return;
  }

  const ancho = zonaTarjetas.clientWidth;
  const distanciaSuficiente = Math.abs(movimientoX) > Math.min(86, ancho * .22);
  const impulsoSuficiente = Math.abs(velocidadX) > .48 && Math.abs(movimientoX) > 24;
  const direccion = movimientoX < 0 ? 1 : -1;
  const existe = paginaActual + direccion >= 0 && paginaActual + direccion < paginas.length;
  if ((distanciaSuficiente || impulsoSuficiente) && existe) cambiarPagina(direccion, velocidadX);
  else resetVisual();
}

function limpiarTransicionPortada() {
  capaPortadaGesto?.remove();
  capaPortadaGesto = null;
  transicionPortadaPreparada = false;
  progresoPortada = 0;
  document.body.classList.remove("cover-gesture-active", "cover-gesture-settling");
  album.style.removeProperty("--album-reveal");
  album.style.removeProperty("--album-y");
  album.style.removeProperty("--album-scale");
}

function finalizarTransicionPortada(completar) {
  if (!transicionPortadaPreparada || bloqueado) return;
  bloqueado = true;
  document.body.classList.add("cover-gesture-settling");

  const capa = capaPortadaGesto;
  const finalizar = () => {
    if (completar) {
      enAlbum = true;
      actualizarIndicadores();
      limpiarTransicionPortada();
      resetVisual(true);
      bloqueado = false;
      return;
    }

    // Reutilizamos el mismo nodo visual que el usuario estaba arrastrando.
    // Así Safari no reconstruye la portada ni vuelve a cargar su contenido.
    document.body.classList.add("cover-mode");
    enAlbum = false;
    configurarTarjeta(tarjetaAnterior, null, -1);
    configurarTarjeta(tarjetaSiguiente, null, -1);
    tarjetaActual.replaceChildren();
    const portadaVisual = capa?.firstElementChild;
    if (portadaVisual) tarjetaActual.appendChild(portadaVisual);
    tarjetaActual.dataset.index = "portada";
    tarjetaActual.setAttribute("aria-hidden", "false");
    numeroPagina.textContent = "00";
    textoGesto.textContent = "Desliza hacia arriba";
    actualizarIndicadores();
    resetVisual(true);
    limpiarTransicionPortada();
    bloqueado = false;
  };

  requestAnimationFrame(() => {
    if (completar) {
      movimientoY = -window.innerHeight;
      actualizarTransicionPortada(1);
      capa?.classList.add("is-completing");
    } else {
      movimientoY = 0;
      actualizarTransicionPortada(0);
      capa?.classList.add("is-returning");
    }
  });

  let terminado = false;
  const terminarUnaVez = () => {
    if (terminado) return;
    terminado = true;
    finalizar();
  };
  capa?.addEventListener("transitionend", terminarUnaVez, { once: true });
  window.setTimeout(terminarUnaVez, completar ? 540 : 430);
}

function entrarAlbum() {
  if (bloqueado) return;
  prepararTransicionPortada();
  movimientoY = -window.innerHeight;
  finalizarTransicionPortada(true);
}

function esperarFinTransicion(elemento, limite = 720) {
  return new Promise(resolve => {
    let hecho = false;
    const finalizar = () => {
      if (hecho) return;
      hecho = true;
      elemento.removeEventListener("transitionend", alFinal);
      clearTimeout(respaldo);
      resolve();
    };
    const alFinal = e => {
      if (e.target === elemento && e.propertyName === "transform") finalizar();
    };
    const respaldo = setTimeout(finalizar, limite);
    elemento.addEventListener("transitionend", alFinal);
  });
}

async function cambiarPagina(direccion, velocidad = 0) {
  if (bloqueado) { colaNavegacion.push(direccion); return; }
  detenerAudio();
  const objetivo = paginaActual + direccion;
  if (objetivo < 0 || objetivo >= paginas.length) return resetVisual();

  bloqueado = true;
  const salida = direccion > 0 ? -1 : 1;
  const duracion = Math.max(175, 255 - Math.min(80, Math.abs(velocidad) * 70));
  tarjetas.forEach(t => t.style.setProperty("--swipe-duration", `${duracion}ms`));

  const entrante = direccion > 0 ? tarjetaSiguiente : tarjetaAnterior;
  entrante.classList.add("is-active-neighbor");

  aplicarVars(tarjetaActual, salida * zonaTarjetas.clientWidth * 1.18, 12, .975, salida * 3.2, 0, 1, salida < 0 ? 78 : 22);
  aplicarVars(entrante, 0, 0, 1, 0, 1, 0, 50);

  await esperarFinTransicion(tarjetaActual, duracion + 180);

  const anteriorVieja = tarjetaAnterior;
  const actualVieja = tarjetaActual;
  const siguienteVieja = tarjetaSiguiente;

  paginaActual = objetivo;

  if (direccion > 0) {
    tarjetaAnterior = actualVieja;
    tarjetaActual = siguienteVieja;
    tarjetaSiguiente = anteriorVieja;
  } else {
    tarjetaAnterior = siguienteVieja;
    tarjetaActual = anteriorVieja;
    tarjetaSiguiente = actualVieja;
  }

  asignarRolesTarjetas();

  // La tarjeta que acaba de llegar permanece intacta. Solo reciclamos la que
  // ha quedado fuera de pantalla para preparar el siguiente recuerdo.
  configurarTarjeta(tarjetaAnterior, obtenerPagina(paginaActual - 1), paginaActual - 1);
  configurarTarjeta(tarjetaActual, obtenerPagina(paginaActual), paginaActual);
  configurarTarjeta(tarjetaSiguiente, obtenerPagina(paginaActual + 1), paginaActual + 1);

  numeroPagina.textContent = String(paginaActual + 1).padStart(2, "0");
  textoGesto.textContent = "Desliza para continuar";
  actualizarIndicadores();

  resetVisual(true);
  precargarRecuerdosCercanos(paginaActual);
  tarjetas.forEach(t => t.style.removeProperty("--swipe-duration"));
  bloqueado = false;
  const siguiente = colaNavegacion.shift();
  if (siguiente) requestAnimationFrame(() => cambiarPagina(siguiente, .9));
}


let audioActivo = null;
let botonAudioActivo = null;
let frameAudio = 0;
let modalMedia = null;
let contextoMelodia = null;
let indiceMelodiaFinal = 0;
const notasMelodiaFinal = [329.63, 392, 440, 493.88, 440, 392, 329.63, 293.66, 329.63, 392, 440, 523.25, 493.88, 440, 392, 329.63];

function tocarNotaFinal(button) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  contextoMelodia ||= new AudioContext();
  contextoMelodia.resume?.();
  const now = contextoMelodia.currentTime;
  const frequency = notasMelodiaFinal[indiceMelodiaFinal];
  const gain = contextoMelodia.createGain();
  const tone = contextoMelodia.createOscillator();
  const warmth = contextoMelodia.createOscillator();
  tone.type = "sine"; warmth.type = "triangle";
  tone.frequency.setValueAtTime(frequency, now); warmth.frequency.setValueAtTime(frequency * 2, now);
  gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.16, now + .018); gain.gain.exponentialRampToValueAtTime(.0001, now + .62);
  tone.connect(gain); warmth.connect(gain); gain.connect(contextoMelodia.destination);
  tone.start(now); warmth.start(now); tone.stop(now + .65); warmth.stop(now + .65);
  button.classList.remove("is-playing"); void button.offsetWidth; button.classList.add("is-playing");
  indiceMelodiaFinal = (indiceMelodiaFinal + 1) % notasMelodiaFinal.length;
  const message = button.parentElement.querySelector(".final-heart-message");
  if (indiceMelodiaFinal === 0) { message.textContent = "Siempre a tu lado ♥"; message.classList.add("is-complete"); setTimeout(() => { message.textContent = "Toca nuestro pequeño ritmo"; message.classList.remove("is-complete"); }, 2200); }
}


function detenerAudio() {
  if (frameAudio) cancelAnimationFrame(frameAudio);
  frameAudio = 0;
  if (audioActivo) {
    audioActivo.pause();
    audioActivo.currentTime = 0;
  }
  if (botonAudioActivo) {
    botonAudioActivo.textContent = "▶";
    botonAudioActivo.closest(".audio-body")?.querySelector("[data-audio-progress]")?.style.setProperty("width", "0%");
    const barra = botonAudioActivo.closest(".audio-body")?.querySelector("[data-audio-seek]");
    barra?.style.setProperty("--audio-progress", "0%");
    barra?.setAttribute("aria-valuenow", "0");
    botonAudioActivo.closest(".audio-body")?.querySelector("[data-audio-current]")?.replaceChildren("0:00");
    botonAudioActivo.closest(".audio-body")?.querySelector("[data-audio-wave]")?.classList.remove("is-playing");
  }
  audioActivo = null;
  botonAudioActivo = null;
}

function actualizarAudio() {
  if (!audioActivo || !botonAudioActivo) return;
  const cuerpo = botonAudioActivo.closest(".audio-body");
  const porcentaje = audioActivo.duration ? (audioActivo.currentTime / audioActivo.duration) * 100 : 0;
  cuerpo?.querySelector("[data-audio-progress]")?.style.setProperty("width", `${porcentaje}%`);
  const barra = cuerpo?.querySelector("[data-audio-seek]");
  barra?.style.setProperty("--audio-progress", `${porcentaje}%`);
  barra?.setAttribute("aria-valuenow", String(Math.round(porcentaje)));
  const tiempo = cuerpo?.querySelector("[data-audio-current]");
  if (tiempo) tiempo.textContent = formatearTiempo(audioActivo.currentTime);
  if (!audioActivo.paused) frameAudio = requestAnimationFrame(actualizarAudio);
}

function alternarAudio(boton) {
  const ruta = boton.dataset.media;
  if (!ruta) return;
  if (botonAudioActivo === boton && audioActivo) {
    if (audioActivo.paused) {
      audioActivo.play();
      boton.textContent = "❚❚";
      boton.closest(".audio-body")?.querySelector("[data-audio-wave]")?.classList.add("is-playing");
      actualizarAudio();
    } else {
      audioActivo.pause();
      boton.textContent = "▶";
      boton.closest(".audio-body")?.querySelector("[data-audio-wave]")?.classList.remove("is-playing");
    }
    return;
  }
  detenerAudio();
  audioActivo = new Audio(ruta);
  audioActivo.preload = "metadata";
  botonAudioActivo = boton;
  audioActivo.addEventListener("ended", detenerAudio, { once: true });
  audioActivo.addEventListener("error", () => {
    detenerAudio();
    alert("No se ha podido reproducir este audio.");
  }, { once: true });
  audioActivo.play().then(() => {
    boton.textContent = "❚❚";
    boton.closest(".audio-body")?.querySelector("[data-audio-wave]")?.classList.add("is-playing");
    actualizarAudio();
  }).catch(() => detenerAudio());
}

let barraAudioActiva = null;

function obtenerAudioParaBarra(barra) {
  const cuerpo = barra.closest(".audio-body");
  const boton = cuerpo?.querySelector("[data-media-action=\"audio\"]");
  if (!boton?.dataset.media) return null;

  if (botonAudioActivo !== boton || !audioActivo) {
    detenerAudio();
    audioActivo = new Audio(boton.dataset.media);
    audioActivo.preload = "metadata";
    botonAudioActivo = boton;
    audioActivo.addEventListener("ended", detenerAudio, { once: true });
    audioActivo.addEventListener("error", () => {
      detenerAudio();
      alert("No se ha podido reproducir este audio.");
    }, { once: true });
  }
  return audioActivo;
}

function posicionarAudioDesdePuntero(barra, clientX) {
  const audio = obtenerAudioParaBarra(barra);
  if (!audio) return;
  const rect = barra.getBoundingClientRect();
  const porcentaje = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));

  const aplicar = () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = porcentaje * audio.duration;
    actualizarAudio();
  };

  if (Number.isFinite(audio.duration) && audio.duration > 0) aplicar();
  else audio.addEventListener("loadedmetadata", aplicar, { once: true });

  barra.style.setProperty("--audio-progress", `${porcentaje * 100}%`);
  barra.querySelector("[data-audio-progress]")?.style.setProperty("width", `${porcentaje * 100}%`);
  barra.setAttribute("aria-valuenow", String(Math.round(porcentaje * 100)));
}

function iniciarSeekAudio(evento) {
  const barra = evento.target.closest("[data-audio-seek]");
  if (!barra) return;
  evento.preventDefault();
  evento.stopPropagation();
  barraAudioActiva = barra;
  barra.setPointerCapture?.(evento.pointerId);
  posicionarAudioDesdePuntero(barra, evento.clientX);
}

function moverSeekAudio(evento) {
  if (!barraAudioActiva) return;
  evento.preventDefault();
  evento.stopPropagation();
  posicionarAudioDesdePuntero(barraAudioActiva, evento.clientX);
}

function terminarSeekAudio(evento) {
  if (!barraAudioActiva) return;
  evento.preventDefault();
  evento.stopPropagation();
  barraAudioActiva.releasePointerCapture?.(evento.pointerId);
  barraAudioActiva = null;
}

function manejarTecladoSeek(evento) {
  const barra = evento.target.closest("[data-audio-seek]");
  if (!barra || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
  evento.preventDefault();
  evento.stopPropagation();
  const audio = obtenerAudioParaBarra(barra);
  if (!audio) return;
  const aplicar = () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    if (evento.key === "Home") audio.currentTime = 0;
    else if (evento.key === "End") audio.currentTime = audio.duration;
    else audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + (evento.key === "ArrowRight" ? 5 : -5)));
    actualizarAudio();
  };
  if (Number.isFinite(audio.duration) && audio.duration > 0) aplicar();
  else audio.addEventListener("loadedmetadata", aplicar, { once: true });
}

function cerrarModalMedia() {
  if (!modalMedia) return;
  modalMedia.querySelector("video")?.pause();
  modalMedia.classList.add("is-closing");
  window.setTimeout(() => {
    modalMedia?.remove();
    modalMedia = null;
  }, 260);
}

function abrirVideo(ruta, titulo = "Vídeo") {
  if (!ruta) return;
  detenerAudio();
  cerrarModalMedia();
  modalMedia = document.createElement("div");
  modalMedia.className = "media-modal";
  modalMedia.innerHTML = `<div class="media-modal-panel" role="dialog" aria-modal="true" aria-label="${atributoSeguro(titulo)}"><div class="media-modal-header"><p>${escapar(titulo)}</p><button type="button" class="media-modal-close" aria-label="Cerrar">×</button></div><video src="${atributoSeguro(ruta)}" controls playsinline preload="metadata"></video></div>`;
  document.body.appendChild(modalMedia);
  requestAnimationFrame(() => modalMedia?.classList.add("is-open"));
  modalMedia.querySelector(".media-modal-close")?.addEventListener("click", cerrarModalMedia);
  modalMedia.addEventListener("click", evento => { if (evento.target === modalMedia) cerrarModalMedia(); });
  modalMedia.querySelector("video")?.play().catch(() => {});
}

function abrirFoto(ruta, titulo = "Recuerdo fotográfico") {
  if (!ruta) return;
  cerrarModalMedia();
  modalMedia = document.createElement("div");
  modalMedia.className = "media-modal photo-modal";
  modalMedia.innerHTML = `<div class="media-modal-panel photo-modal-panel" role="dialog" aria-modal="true" aria-label="${atributoSeguro(titulo)}"><div class="media-modal-header"><p>${escapar(titulo)}</p><button type="button" class="media-modal-close" aria-label="Cerrar">×</button></div><img src="${atributoSeguro(ruta)}" alt="${atributoSeguro(titulo)}"></div>`;
  document.body.appendChild(modalMedia);
  requestAnimationFrame(() => modalMedia?.classList.add("is-open"));
  modalMedia.querySelector(".media-modal-close")?.addEventListener("click", cerrarModalMedia);
  modalMedia.addEventListener("click", evento => { if (evento.target === modalMedia) cerrarModalMedia(); });
  configurarZoomFoto(modalMedia.querySelector(".photo-modal-panel>img"));
}

function configurarZoomFoto(image) {
  if (!image) return;
  let scale = 1, x = 0, y = 0, lastDistance = 0;
  const pointers = new Map();
  const apply = (animate = false) => { image.style.transition = animate ? "transform 220ms ease" : "none"; image.style.transform = `translate3d(${x}px,${y}px,0) scale(${scale})`; };
  const reset = () => { scale = 1; x = 0; y = 0; apply(true); };
  image.addEventListener("dblclick", event => { event.preventDefault(); if (scale > 1) reset(); else { scale = 2.5; x = y = 0; apply(true); } });
  image.addEventListener("wheel", event => { event.preventDefault(); scale = Math.max(1, Math.min(4, scale + (event.deltaY < 0 ? .35 : -.35))); if (scale === 1) x = y = 0; apply(); }, { passive: false });
  image.addEventListener("pointerdown", event => { image.setPointerCapture?.(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); lastDistance = 0; });
  image.addEventListener("pointermove", event => { const previous = pointers.get(event.pointerId); if (!previous) return; pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); const points = [...pointers.values()]; if (points.length >= 2) { const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y); if (lastDistance) scale = Math.max(1, Math.min(4, scale * distance / lastDistance)); lastDistance = distance; } else { const dx = event.clientX - previous.x, dy = event.clientY - previous.y; if (scale > 1) { x += dx; y += dy; } else if (dy > 0 || y > 0) y = Math.max(0, y + dy); } apply(); });
  const finish = event => { pointers.delete(event.pointerId); lastDistance = 0; if (!pointers.size && scale === 1) { if (y > 105) cerrarModalMedia(); else reset(); } };
  image.addEventListener("pointerup", finish); image.addEventListener("pointercancel", finish);
}

zonaTarjetas.addEventListener("pointerdown", evento => {
  if (evento.target.closest("button, a, video, audio, [data-audio-seek]")) evento.stopPropagation();
}, true);

zonaTarjetas.addEventListener("click", evento => {
  const heart = evento.target.closest("[data-final-heart]");
  if (heart) { evento.preventDefault(); evento.stopPropagation(); tocarNotaFinal(heart); return; }
  const navegadorGaleria = evento.target.closest("[data-gallery-direction]");
  if (navegadorGaleria) {
    evento.preventDefault(); evento.stopPropagation();
    const galeria = navegadorGaleria.closest("[data-gallery-images]");
    let imagenes = []; try { imagenes = JSON.parse(galeria.dataset.galleryImages || "[]"); } catch (_) {}
    if (!imagenes.length) return;
    const indice = (Number(galeria.dataset.galleryIndex || 0) + Number(navegadorGaleria.dataset.galleryDirection) + imagenes.length) % imagenes.length;
    galeria.dataset.galleryIndex = String(indice); galeria.dataset.photoExpand = imagenes[indice];
    galeria.querySelector(".photo").src = imagenes[indice]; galeria.querySelector(".photo-gallery-count").textContent = `${indice + 1} / ${imagenes.length}`;
    return;
  }
  const foto = evento.target.closest("[data-photo-expand]");
  if (foto && Math.abs(movimientoX) < 10 && Math.abs(movimientoY) < 10) {
    evento.preventDefault();
    evento.stopPropagation();
    abrirFoto(foto.dataset.photoExpand, foto.dataset.photoTitle);
    return;
  }
  const boton = evento.target.closest("[data-media-action]");
  if (!boton) return;
  evento.preventDefault();
  evento.stopPropagation();
  const accion = boton.dataset.mediaAction;
  if (accion === "audio") alternarAudio(boton);
  else if (accion === "video") abrirVideo(boton.dataset.media, boton.dataset.title);
  else if (accion === "external" && boton.dataset.url) window.open(boton.dataset.url, "_blank", "noopener,noreferrer");
});

zonaTarjetas.addEventListener("keydown", evento => { const foto = evento.target.closest("[data-photo-expand]"); if (foto && (evento.key === "Enter" || evento.key === " ")) { evento.preventDefault(); abrirFoto(foto.dataset.photoExpand, foto.dataset.photoTitle); } });
openMemoryExplorer?.addEventListener("click", () => abrirExplorador(false));
openRandomMemory?.addEventListener("click", abrirRecuerdoSorpresa);
openFavorites?.addEventListener("click", () => abrirExplorador(true));

zonaTarjetas.addEventListener("pointerdown", iniciarSeekAudio, true);
zonaTarjetas.addEventListener("pointermove", moverSeekAudio, { passive: false, capture: true });
zonaTarjetas.addEventListener("pointerup", terminarSeekAudio, true);
zonaTarjetas.addEventListener("pointercancel", terminarSeekAudio, true);
zonaTarjetas.addEventListener("keydown", manejarTecladoSeek, true);

zonaTarjetas.addEventListener("pointerdown", iniciarGesto);
zonaTarjetas.addEventListener("pointermove", moverGesto, { passive: false });
zonaTarjetas.addEventListener("pointerup", terminarGesto);
zonaTarjetas.addEventListener("pointercancel", terminarGesto);

window.addEventListener("keydown", evento => {
  if (bloqueado) return;
  if (!enAlbum && (evento.key === "Enter" || evento.key === "ArrowUp" || evento.key === " ")) entrarAlbum();
  else if (enAlbum && evento.key === "ArrowRight") cambiarPagina(1);
  else if (enAlbum && evento.key === "ArrowLeft") cambiarPagina(-1);
});


// Caché offline ligera. No muestra avisos ni bloquea la portada.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.info("ARIS funciona sin service worker en este entorno.", error);
    });
  });
}
