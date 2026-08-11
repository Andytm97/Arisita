import { renderTarjeta } from "../src/components/memory-renderer.js";
import { ADMIN_EMAIL } from "../src/firebase/firebase-config.js";
import {
  observarSesion, iniciarSesion, cerrarSesion, usuarioEsAdmin, prepararPersistenciaAuth,
  obtenerTodosLosRecuerdosFirebase, crearIdRecuerdo, guardarRecuerdoFirebase,
  borrarRecuerdoFirebase, enviarRecuerdoPapeleraFirebase, restaurarRecuerdoFirebase, subirArchivoFirebase, subirDataUrlFirebase,
  guardarPortadaFirebase, actualizarGaleriaPortadasFirebase, guardarAjustesPortadaFirebase, obtenerPortadaFirebase, restaurarPortadaFirebase,
  guardarReencuentroFirebase, obtenerReencuentroFirebase, obtenerRespuestasFirebase,
  observarRespuestasFirebase, marcarRespuestaLeidaFirebase,
  guardarConfiguracionGeneralFirebase, obtenerConfiguracionGeneralFirebase
} from "../src/firebase/firebase-service.js";

const MAX_IMAGE_EDGE = 1280;
const JPEG_QUALITY = .72;
const loginView = document.getElementById("loginView");
const adminView = document.getElementById("adminView");
const loginForm = document.getElementById("loginForm");
const form = document.getElementById("memoryForm");
const tipo = document.getElementById("tipo");
const fields = document.getElementById("dynamicFields");
const preview = document.getElementById("previewCard");
const formStatus = document.getElementById("formStatus");
const memoryList = document.getElementById("memoryList");
const publishButton = document.getElementById("publishButton");
let pendingCoverImage = "";
let pendingCoverImages = [];
let activeCoverImages = [];
let removedCoverImages = new Set();
let memories = [];
let editingId = "";
let previewMedia = {};
const DRAFT_KEY = "aris-admin-current-draft-v2";

const mediaInput = (name, label, accept, capture = "") => `<label class="field"><span>${label}</span><input name="${name}" type="file" accept="${accept}" ${capture} required></label>`;
const imageInput = (name, label, required = true) => `<label class="field"><span>${label}${required ? "" : " (opcional)"}</span><input name="${name}" type="file" accept="image/*" ${required ? "required" : ""}></label>`;
const templates = {
  foto: `${imageInput("contenidoArchivo", "Fotografía")}<label class="field"><span>Descripción</span><textarea name="descripcion"></textarea></label>`,
  texto: `<label class="field"><span>Texto de la carta</span><textarea name="texto" required></textarea></label><label class="field"><span>Firma</span><input name="firma" placeholder="Siempre contigo"></label>`,
  video: `${mediaInput("contenidoArchivo", "Vídeo", "video/*")} ${imageInput("posterArchivo", "Miniatura", false)}<label class="field"><span>Descripción</span><textarea name="descripcion"></textarea></label>`,
  audio: `${mediaInput("contenidoArchivo", "Audio", "audio/*", "capture")}<label class="field"><span>Duración visible</span><input name="duracion" placeholder="0:38"></label><label class="field"><span>Descripción</span><textarea name="descripcion"></textarea></label>`,
  spotify: `<label class="field"><span>Enlace de Spotify</span><input name="enlace" type="url" required></label><label class="field"><span>Título de la canción</span><input name="cancionTitulo"></label><label class="field"><span>Artista</span><input name="artista"></label>${imageInput("portadaArchivo", "Carátula", false)}<label class="field"><span>Descripción</span><textarea name="descripcion"></textarea></label>`,
  youtube: `<label class="field"><span>Enlace de YouTube</span><input name="enlace" type="url" required></label><label class="field"><span>Título del vídeo</span><input name="videoTitulo"></label><label class="field"><span>Canal</span><input name="canal"></label>${imageInput("miniaturaArchivo", "Miniatura", false)}<label class="field"><span>Descripción</span><textarea name="descripcion"></textarea></label>`,
  ubicacion: `<label class="field"><span>Nombre del lugar</span><input name="lugar" required></label><label class="field"><span>Enlace de Maps</span><input name="enlace" type="url" required></label><label class="field"><span>Descripción</span><textarea name="descripcion"></textarea></label>`
};

document.getElementById("loginEmail").value = ADMIN_EMAIL;
try { await prepararPersistenciaAuth(); } catch (error) { console.warn("No se pudo fijar la persistencia de sesión.", error); }
observarSesion(async user => {
  const allowed = usuarioEsAdmin(user);
  loginView.hidden = allowed;
  adminView.hidden = !allowed;
  if (allowed) await initialiseAdmin();
});

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const output = document.getElementById("loginStatus");
  output.textContent = "Entrando…";
  try { await iniciarSesion(document.getElementById("loginEmail").value.trim(), document.getElementById("loginPassword").value); output.textContent = ""; }
  catch (error) { output.textContent = friendlyError(error); output.classList.add("is-error"); }
});
document.getElementById("logoutButton").addEventListener("click", cerrarSesion);

async function initialiseAdmin() {
  renderFields();
  document.getElementById("fecha").value ||= new Date().toISOString().slice(0, 10);
  wireCover();
  await Promise.all([loadMemories(), loadConfiguration(), loadResponses()]);
  await loadCoverPresentation();
  restoreDraft();
  observarRespuestasFirebase(responses => renderResponses(responses));
  updatePreview();
}

tipo.addEventListener("change", () => { renderFields(); updatePreview(); });
form.addEventListener("input", updatePreview);
form.addEventListener("input", saveDraftSoon);
form.addEventListener("change", updatePreview);
form.addEventListener("submit", publishMemory);
document.getElementById("previewButton").addEventListener("click", updatePreview);
document.getElementById("resetForm").addEventListener("click", resetForm);
document.getElementById("refreshMemories").addEventListener("click", loadMemories);
document.getElementById("backupButton").addEventListener("click", exportBackup);
document.getElementById("publicationMode").addEventListener("change", event => { document.getElementById("scheduleFields").hidden = event.target.value !== "programado"; });
document.getElementById("saveSettings").addEventListener("click", saveSettings);
initAccordion();
initConnectionStatus();

function renderFields() { clearPreviewMedia(); fields.innerHTML = templates[tipo.value] || templates.texto; wireFilePreviews(); }
function wireFilePreviews() {
  fields.querySelectorAll('input[type="file"]').forEach(input => input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    const target = ({ contenidoArchivo: "contenido", posterArchivo: "poster", portadaArchivo: "portada", miniaturaArchivo: "miniatura" })[input.name];
    if (!target) return;
    if (previewMedia[target]?.startsWith("blob:")) URL.revokeObjectURL(previewMedia[target]);
    previewMedia[target] = URL.createObjectURL(file);
    updatePreview();
  }));
}
function clearPreviewMedia() {
  Object.values(previewMedia).forEach(value => { if (String(value).startsWith("blob:")) URL.revokeObjectURL(value); });
  previewMedia = {};
}
function pageFromForm() {
  const fd = new FormData(form);
  const kind = String(fd.get("tipo"));
  const title = String(fd.get("titulo") || "Hoy quería enseñarte algo");
  const existing = memories.find(memory => memory.id === editingId)?.elementos?.[0] || {};
  const page = { ...existing, tipo: kind, fecha: formatDate(fd.get("fecha")), titulo: title, etiqueta: labelFor(kind), descripcion: String(fd.get("descripcion") || ""), ...previewMedia };
  ["texto", "firma", "duracion", "enlace", "lugar"].forEach(key => { const value = fd.get(key); if (typeof value === "string" && value) page[key] = value; });
  if (kind === "spotify") page.cancion = { titulo: String(fd.get("cancionTitulo") || title), artista: String(fd.get("artista") || "Nuestra playlist") };
  if (kind === "youtube") { page.titulo = String(fd.get("videoTitulo") || title); page.canal = String(fd.get("canal") || ""); }
  return page;
}
function updatePreview() { preview.innerHTML = renderTarjeta(pageFromForm()); }

async function publishMemory(event) {
  event.preventDefault();
  if (!form.reportValidity()) return;
  publishButton.disabled = true;
  setProgress(8);
  setStatus("Subiendo archivos…");
  try {
    const id = editingId || crearIdRecuerdo();
    const fd = new FormData(form);
    const existing = memories.find(memory => memory.id === editingId);
    const page = { ...(existing?.elementos?.[0] || {}), ...pageFromForm() };
    const uploadMap = { contenidoArchivo: "contenido", posterArchivo: "poster", portadaArchivo: "portada", miniaturaArchivo: "miniatura" };
    const uploads = Object.entries(uploadMap);
    let uploadIndex = 0;
    for (const [inputName, target] of uploads) {
      const file = fd.get(inputName);
      if (!(file instanceof File) || !file.size) continue;
      if (file.type.startsWith("image/")) {
        const dataUrl = await compressImage(file);
        page[target] = await retry(() => subirDataUrlFirebase({ recuerdoId: id, campo: target, dataUrl }));
      } else page[target] = await retry(() => subirArchivoFirebase({ recuerdoId: id, campo: target, archivo: file }));
      uploadIndex += 1; setProgress(15 + Math.round((uploadIndex / uploads.length) * 65));
    }
    const rawDate = String(fd.get("fecha") || "");
    const element = { ...page, id: `${id}-elemento-1` };
    delete element.fecha;
    setStatus("Guardando recuerdo…"); setProgress(88);
    const publicationMode = String(fd.get("publicationMode") || "ahora");
    await retry(() => guardarRecuerdoFirebase({ ...(existing || {}), id, fecha: formatDate(rawDate), fechaISO: rawDate, titulo: String(fd.get("titulo")), destacado: fd.get("destacado") === "on", publicado: publicationMode !== "borrador", publicationMode, availableAt: String(fd.get("availableAt") || ""), lockMode: String(fd.get("lockMode") || "cerrado"), elementos: [element] }));
    setProgress(100); localStorage.removeItem(DRAFT_KEY);
    setStatus(editingId ? "Recuerdo actualizado en el álbum." : "Recuerdo publicado. Ya está disponible en el álbum.");
    resetForm(false);
    await loadMemories();
    document.querySelector('[data-section="create"]').open = false;
  } catch (error) { console.error(error); setStatus(friendlyError(error), true); }
  finally { publishButton.disabled = false; setTimeout(() => setProgress(0), 700); }
}

async function retry(operation, attempts = 2) { let error; for (let i = 0; i < attempts; i += 1) { try { return await operation(); } catch (caught) { error = caught; if (i + 1 < attempts) { setStatus("La conexión falló. Reintentando…"); await new Promise(resolve => setTimeout(resolve, 900)); } } } throw error; }
function setProgress(value) { const bar = document.getElementById("publishProgress"); bar.hidden = value <= 0; bar.style.setProperty("--progress", `${value}%`); }

async function loadMemories() {
  memoryList.innerHTML = '<div class="empty-state">Cargando recuerdos…</div>';
  try { memories = await obtenerTodosLosRecuerdosFirebase(); renderList(); }
  catch (error) { memoryList.innerHTML = `<div class="empty-state">${escapeHtml(friendlyError(error))}</div>`; }
}
function renderList() {
  const active = memories.filter(memory => !memory.eliminado);
  const trash = memories.filter(memory => memory.eliminado);
  const now = Date.now();
  const statusFor = memory => memory.publicationMode === "borrador" || memory.publicado === false ? ["BORRADOR", "draft"] : memory.publicationMode === "programado" && new Date(memory.availableAt).getTime() > now ? [`PROGRAMADO · ${new Date(memory.availableAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`, "scheduled"] : ["PUBLICADO", "published"];
  document.getElementById("metricPublished").textContent = active.filter(memory => statusFor(memory)[1] === "published").length;
  document.getElementById("metricScheduled").textContent = active.filter(memory => statusFor(memory)[1] === "scheduled").length;
  document.getElementById("metricDrafts").textContent = active.filter(memory => statusFor(memory)[1] === "draft").length;
  document.getElementById("memorySummary").textContent = `${active.length} elementos`;
  document.getElementById("trashSummary").textContent = trash.length ? `${trash.length} recuerdos` : "Vacía";
  memoryList.innerHTML = active.length ? active.map(memory => { const [label, state] = statusFor(memory); return `<article class="memory-row"><div><span class="status-chip status-${state}">${label}</span><h3>${escapeHtml(memory.titulo)}</h3><p>${escapeHtml(memory.fecha)} · ${escapeHtml(labelFor(memory.elementos?.[0]?.tipo))}</p><small>Último cambio: ${formatTimestamp(memory.updatedAt)}</small></div><div class="row-actions"><button class="icon-button" data-preview="${memory.id}" aria-label="Previsualizar">◉</button><button class="icon-button" data-edit="${memory.id}" aria-label="Editar">✎</button><button class="icon-button" data-delete="${memory.id}" aria-label="Mover a papelera">×</button></div></article>`; }).join("") : '<div class="empty-state">Todavía no hay recuerdos.</div>';
  const trashList = document.getElementById("trashList");
  trashList.innerHTML = trash.length ? trash.map(memory => `<article class="memory-row"><div><span class="status-chip status-trash">EN PAPELERA</span><h3>${escapeHtml(memory.titulo)}</h3><p>Eliminado: ${formatTimestamp(memory.deletedAt)}</p></div><div class="row-actions"><button class="secondary-button" data-restore="${memory.id}" type="button">Restaurar</button><button class="ghost-button danger" data-delete-forever="${memory.id}" type="button">Eliminar</button></div></article>`).join("") : '<div class="empty-state">La papelera está vacía.</div>';
  memoryList.querySelectorAll("[data-preview]").forEach(button => button.addEventListener("click", () => { const item = memories.find(memory => memory.id === button.dataset.preview); if (item) preview.innerHTML = renderTarjeta({ ...item.elementos?.[0], fecha: item.fecha, titulo: item.titulo }); window.scrollTo({ top: 0, behavior: "smooth" }); }));
  memoryList.querySelectorAll("[data-edit]").forEach(button => button.addEventListener("click", () => editMemory(button.dataset.edit)));
  memoryList.querySelectorAll("[data-delete]").forEach(button => button.addEventListener("click", async () => { if (!confirm("¿Mover este recuerdo a la papelera?")) return; try { await enviarRecuerdoPapeleraFirebase(button.dataset.delete); await loadMemories(); } catch (error) { setStatus(friendlyError(error), true); } }));
  trashList.querySelectorAll("[data-restore]").forEach(button => button.addEventListener("click", async () => { await restaurarRecuerdoFirebase(button.dataset.restore); await loadMemories(); }));
  trashList.querySelectorAll("[data-delete-forever]").forEach(button => button.addEventListener("click", async () => { if (!confirm("Se borrarán también sus archivos. Esta acción no se puede deshacer.")) return; await borrarRecuerdoFirebase(button.dataset.deleteForever); await loadMemories(); }));
}

function editMemory(id) {
  const memory = memories.find(item => item.id === id);
  if (!memory) return;
  editingId = id;
  const page = memory.elementos?.[0] || {};
  tipo.value = page.tipo || "texto";
  renderFields();
  previewMedia = Object.fromEntries(["contenido", "poster", "portada", "miniatura"].filter(key => page[key]).map(key => [key, page[key]]));
  document.getElementById("fecha").value = memory.fechaISO || "";
  document.getElementById("titulo").value = memory.titulo || "";
  document.getElementById("destacado").checked = Boolean(memory.destacado);
  document.getElementById("publicationMode").value = memory.publicationMode || (memory.publicado === false ? "borrador" : "ahora");
  document.getElementById("scheduleFields").hidden = document.getElementById("publicationMode").value !== "programado";
  if (form.elements.availableAt) form.elements.availableAt.value = memory.availableAt || "";
  if (form.elements.lockMode) form.elements.lockMode.value = memory.lockMode || "cerrado";
  const values = { ...page, cancionTitulo: page.cancion?.titulo, artista: page.cancion?.artista, videoTitulo: page.titulo };
  Object.entries(values).forEach(([name, value]) => { const field = form.elements[name]; if (field && typeof value === "string" && field.type !== "file") field.value = value; });
  fields.querySelectorAll('input[type="file"][required]').forEach(input => input.required = false);
  publishButton.textContent = "Guardar cambios";
  updatePreview();
  setStatus("Editando un recuerdo publicado. Los archivos actuales se conservarán si no eliges otros.");
  document.querySelector('[data-section="create"]').open = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

let coverWired = false;
function wireCover() {
  const controls = document.querySelector(".cover-controls");
  if (!document.getElementById("coverMode")) controls.insertAdjacentHTML("beforeend", `<label class="field"><span>Presentación</span><select id="coverMode"><option value="random">Una foto distinta al abrir</option><option value="mosaic">Mosaico con todas las fotos</option></select></label>`);
  const coverCopy = document.querySelector(".cover-admin-copy");
  if (!document.getElementById("editCoverGallery")) {
    coverCopy.querySelector(".picker-actions").hidden = true;
    coverCopy.querySelector(".picker-actions").insertAdjacentHTML("beforebegin", `<button id="editCoverGallery" class="secondary-button cover-gallery-edit-button" type="button">Modificar fotos de fondo</button><div id="coverGalleryEditor" class="cover-gallery-editor" hidden><div id="coverGalleryGrid" class="cover-gallery-grid"></div><div class="cover-gallery-actions"><button id="saveCoverGallery" class="primary-button" type="button">Guardar cambios</button><button id="cancelCoverGallery" class="ghost-button" type="button">Cancelar</button></div></div>`);
    document.getElementById("saveCover").textContent = "Guardar presentación";
  }
  if (coverWired) return; coverWired = true;
  const gallery = document.getElementById("coverGalleryInput"); const camera = document.getElementById("coverCameraInput");
  document.getElementById("pickCoverGallery").addEventListener("click", () => gallery.click());
  document.getElementById("pickCoverCamera").addEventListener("click", () => camera.click());
  gallery.addEventListener("change", selectCover); camera.addEventListener("change", selectCover);
  document.getElementById("saveCover").addEventListener("click", saveCoverSettings);
  document.getElementById("editCoverGallery").addEventListener("click", openCoverGallery);
  document.getElementById("saveCoverGallery").addEventListener("click", publishCover);
  document.getElementById("cancelCoverGallery").addEventListener("click", cancelCoverGallery);
  document.getElementById("restoreCover").addEventListener("click", restoreCover);
  document.getElementById("saveReunion").addEventListener("click", saveReunion);
  ["coverPosition", "coverShade", "coverMode"].forEach(id => document.getElementById(id).addEventListener("input", updateCoverPreviewStyle));
}
async function selectCover(event) { const files = [...(event.target.files || [])]; if (!files.length) return; try { setCoverStatus(`Preparando ${files.length} ${files.length === 1 ? "foto" : "fotos"}…`); for (const file of files) pendingCoverImages.push(await compressImage(file)); pendingCoverImage = pendingCoverImages[0] || ""; renderCoverGallery(); updateCoverPreviewStyle(); setCoverStatus("Fotos añadidas. Guarda los cambios cuando termines."); } catch (error) { setCoverStatus(friendlyError(error), true); } event.target.value = ""; }
async function saveCoverSettings() { const button = document.getElementById("saveCover"); button.disabled = true; setCoverStatus("Guardando presentación…"); try { await guardarAjustesPortadaFirebase(getCoverAdjustments()); updateCoverSummary(); setCoverStatus("Presentación actualizada."); } catch (error) { setCoverStatus(friendlyError(error), true); } finally { button.disabled = false; } }
async function publishCover() { const button = document.getElementById("saveCoverGallery"); const remaining = activeCoverImages.filter(url => !removedCoverImages.has(url)).length + pendingCoverImages.length; if (!remaining) { setCoverStatus("Conserva al menos una foto o usa Restaurar original.", true); return; } button.disabled = true; setCoverStatus("Guardando cambios…"); try { activeCoverImages = await actualizarGaleriaPortadasFirebase({ imagenesActuales: activeCoverImages, nuevas: pendingCoverImages, eliminadas: [...removedCoverImages] }); await guardarAjustesPortadaFirebase(getCoverAdjustments()); pendingCoverImage = ""; pendingCoverImages = []; removedCoverImages.clear(); closeCoverGallery(); document.getElementById("coverPreviewImage").src = activeCoverImages[0]; updateCoverSummary(); updateCoverPreviewStyle(); setCoverStatus("Listado actualizado para todos los dispositivos."); } catch (error) { setCoverStatus(friendlyError(error), true); } finally { button.disabled = false; } }
function openCoverGallery() { document.getElementById("coverGalleryEditor").hidden = false; document.getElementById("editCoverGallery").hidden = true; renderCoverGallery(); }
function closeCoverGallery() { document.getElementById("coverGalleryEditor").hidden = true; document.getElementById("editCoverGallery").hidden = false; }
function cancelCoverGallery() { pendingCoverImage = ""; pendingCoverImages = []; removedCoverImages.clear(); closeCoverGallery(); updateCoverSummary(); updateCoverPreviewStyle(); setCoverStatus("Cambios descartados."); }
function toggleCoverRemoval(url) { removedCoverImages.has(url) ? removedCoverImages.delete(url) : removedCoverImages.add(url); renderCoverGallery(); updateCoverPreviewStyle(); }
function removePendingCover(index) { pendingCoverImages.splice(index, 1); pendingCoverImage = pendingCoverImages[0] || ""; renderCoverGallery(); updateCoverPreviewStyle(); }
function renderCoverGallery() { const grid = document.getElementById("coverGalleryGrid"); if (!grid) return; grid.replaceChildren(); activeCoverImages.forEach((url, index) => { const item = document.createElement("div"); item.className = `cover-gallery-item${removedCoverImages.has(url) ? " is-removed" : ""}`; const image = document.createElement("img"); image.src = url; image.alt = `Foto de fondo ${index + 1}`; const remove = document.createElement("button"); remove.type = "button"; remove.className = "cover-gallery-remove"; remove.textContent = removedCoverImages.has(url) ? "↶" : "×"; remove.title = removedCoverImages.has(url) ? "Conservar foto" : "Eliminar foto"; remove.addEventListener("click", () => toggleCoverRemoval(url)); item.append(image, remove); grid.append(item); }); pendingCoverImages.forEach((url, index) => { const item = document.createElement("div"); item.className = "cover-gallery-item is-new"; const image = document.createElement("img"); image.src = url; image.alt = "Nueva foto de fondo"; const remove = document.createElement("button"); remove.type = "button"; remove.className = "cover-gallery-remove"; remove.textContent = "×"; remove.title = "Quitar foto nueva"; remove.addEventListener("click", () => removePendingCover(index)); const badge = document.createElement("span"); badge.className = "cover-gallery-badge"; badge.textContent = "NUEVA"; item.append(image, remove, badge); grid.append(item); }); const add = document.createElement("button"); add.type = "button"; add.className = "cover-gallery-add"; add.innerHTML = `<strong>＋</strong><span>Añadir fotos</span>`; add.addEventListener("click", () => document.getElementById("coverGalleryInput").click()); grid.append(add); const remaining = activeCoverImages.filter(url => !removedCoverImages.has(url)).length + pendingCoverImages.length; document.getElementById("coverGalleryCount").textContent = `${remaining} ${remaining === 1 ? "foto de fondo" : "fotos de fondo"}${removedCoverImages.size ? ` · ${removedCoverImages.size} pendientes de eliminar` : ""}.`; }
function updateCoverSummary() { const count = activeCoverImages.length; document.getElementById("coverSummary").textContent = count ? `${count} ${count === 1 ? "portada" : "portadas"} · ${document.getElementById("coverMode").value === "mosaic" ? "mosaico" : "aleatorias"}` : "Portada original"; document.getElementById("coverGalleryCount").textContent = count ? `${count} ${count === 1 ? "fotografía activa" : "fotografías activas"}.` : "Selecciona fotografías para crear una colección."; }
async function restoreCover() { if (!confirm("¿Restaurar la portada original?")) return; try { await restaurarPortadaFirebase(); pendingCoverImage = ""; pendingCoverImages = []; activeCoverImages = []; removedCoverImages.clear(); closeCoverGallery(); document.getElementById("coverMode").value = "random"; document.getElementById("coverPreviewImage").src = "../assets/fondo.jpg"; document.getElementById("coverSummary").textContent = "Una portada"; document.getElementById("coverGalleryCount").textContent = "Selecciona varias fotografías para crear una colección."; updateCoverPreviewStyle(); setCoverStatus("Portada original restaurada."); } catch (error) { setCoverStatus(friendlyError(error), true); } }
async function loadConfiguration() { try { const [cover, reunion, general] = await Promise.all([obtenerPortadaFirebase(), obtenerReencuentroFirebase(), obtenerConfiguracionGeneralFirebase()]); const coverImages = cover?.imagenes?.length ? cover.imagenes : (cover?.contenido ? [cover.contenido] : []); document.getElementById("coverPreviewImage").src = coverImages[0] || "../assets/fondo.jpg"; document.getElementById("coverSummary").textContent = coverImages.length > 1 ? `${coverImages.length} portadas` : "Una portada"; document.getElementById("coverGalleryCount").textContent = coverImages.length > 1 ? `${coverImages.length} fotografías activas.` : "Selecciona varias fotografías para crear una colección."; document.getElementById("coverPosition").value = cover?.position ?? 44; document.getElementById("coverShade").value = cover?.shade ?? 22; updateCoverPreviewStyle(); document.getElementById("reunionDate").value = reunion?.fecha || "2026-10-09"; document.getElementById("reunionSummary").textContent = reunion?.fecha || "Elegir fecha"; document.getElementById("settingName").value = general?.nombre || "Aris"; document.getElementById("settingKicker").value = general?.kicker || "A PESAR DE LA DISTANCIA..."; document.getElementById("settingTitle").value = general?.titulo || "Un pedacito de nosotros, cada día."; document.getElementById("settingSubtitle").value = general?.subtitulo || "Para que nos podamos sentir un poco más cerca."; } catch (error) { setCoverStatus(friendlyError(error), true); } }
async function saveReunion() { const value = document.getElementById("reunionDate").value; const output = document.getElementById("reunionStatus"); if (!value) { output.textContent = "Elige una fecha."; return; } output.textContent = "Guardando…"; try { await guardarReencuentroFirebase(value); output.textContent = "Fecha actualizada en el álbum."; } catch (error) { output.textContent = friendlyError(error); output.classList.add("is-error"); } }

async function loadResponses() { try { renderResponses(await obtenerRespuestasFirebase()); } catch (error) { document.getElementById("responseList").innerHTML = `<div class="empty-state">${escapeHtml(friendlyError(error))}</div>`; } }
function renderResponses(responses) { const list = document.getElementById("responseList"); const unread = responses.filter(response => !response.leida).length; document.getElementById("metricReplies").textContent = unread; document.getElementById("responseSummary").textContent = unread ? `${unread} nuevas` : "Sin novedades"; if (!responses.length) { list.innerHTML = '<div class="empty-state">Aris todavía no ha dejado ninguna nota.</div>'; return; } list.innerHTML = responses.map(response => { const memory = memories.find(item => item.id === response.recuerdoId); return `<article class="response-row ${response.leida ? "" : "is-new"}"><h3>${response.corazon ? "♥ " : ""}${escapeHtml(memory?.titulo || "Recuerdo")}${response.leida ? "" : " · Nueva"}</h3><p>${escapeHtml(response.nota || "Ha reaccionado con un corazón.")}</p>${response.leida ? "" : `<button class="ghost-button" data-read-response="${response.recuerdoId}" type="button">Marcar como leída</button>`}</article>`; }).join(""); list.querySelectorAll("[data-read-response]").forEach(button => button.addEventListener("click", () => marcarRespuestaLeidaFirebase(button.dataset.readResponse))); }
async function saveSettings() { const status = document.getElementById("settingsStatus"); status.textContent = "Guardando…"; try { await guardarConfiguracionGeneralFirebase({ nombre: document.getElementById("settingName").value.trim(), kicker: document.getElementById("settingKicker").value.trim(), titulo: document.getElementById("settingTitle").value.trim(), subtitulo: document.getElementById("settingSubtitle").value.trim() }); status.textContent = "Textos actualizados en el álbum."; } catch (error) { status.textContent = friendlyError(error); status.classList.add("is-error"); } }
async function exportBackup() { try { const [allMemories, responses, cover, reunion] = await Promise.all([obtenerTodosLosRecuerdosFirebase(), obtenerRespuestasFirebase(), obtenerPortadaFirebase(), obtenerReencuentroFirebase()]); const blob = new Blob([JSON.stringify({ version: 3, exportedAt: new Date().toISOString(), recuerdos: allMemories, respuestas: responses, configuracion: { portada: cover, reencuentro: reunion } }, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `aris-backup-${new Date().toISOString().slice(0,10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); } catch (error) { setStatus(friendlyError(error), true); } }
let draftTimer;
function saveDraftSoon() { clearTimeout(draftTimer); draftTimer = setTimeout(() => { const values = {}; new FormData(form).forEach((value, key) => { if (typeof value === "string") values[key] = value; }); localStorage.setItem(DRAFT_KEY, JSON.stringify({ values, tipo: tipo.value })); }, 350); }
function restoreDraft() { try { const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); if (!draft?.values) return; tipo.value = draft.tipo || "foto"; renderFields(); Object.entries(draft.values).forEach(([name, value]) => { const field = form.elements[name]; if (field && field.type !== "file") field.type === "checkbox" ? field.checked = value === "on" : field.value = value; }); updatePreview(); setStatus("He recuperado el borrador que estabas preparando."); } catch (_) {} }

function resetForm(clearStatus = true) { editingId = ""; publishButton.textContent = "Publicar recuerdo"; form.reset(); document.getElementById("fecha").value = new Date().toISOString().slice(0, 10); renderFields(); updatePreview(); if (clearStatus) { localStorage.removeItem(DRAFT_KEY); setStatus(""); } }
function formatDate(value) { if (!value) return ""; return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
function formatTimestamp(value) { const date = value?.toDate?.() || (value?.seconds ? new Date(value.seconds * 1000) : null); return date ? date.toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "ahora"; }
function labelFor(value) { return ({ foto: "Fotografía", texto: "Carta", video: "Vídeo", audio: "Nota de voz", spotify: "Spotify", youtube: "YouTube", ubicacion: "Lugar" })[value] || "Recuerdo"; }
function setStatus(message, error = false) { formStatus.textContent = message; formStatus.classList.toggle("is-error", error); }
function setCoverStatus(message, error = false) { const output = document.getElementById("coverStatus"); output.textContent = message; output.classList.toggle("is-error", error); }
function escapeHtml(value) { return String(value || "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
function friendlyError(error) { const code = String(error?.code || ""); if (code.includes("invalid-credential")) return "Correo o contraseña incorrectos."; if (code.includes("too-many-requests")) return "Demasiados intentos. Espera unos minutos."; if (code.includes("unauthorized") || code.includes("permission-denied")) return "Firebase ha rechazado la operación. Revisa las reglas publicadas."; if (code.includes("storage/unauthorized")) return "Storage ha rechazado la subida. Revisa sus reglas."; return error?.message || "No se pudo completar la operación."; }
async function compressImage(file) { const source = await fileToDataUrl(file); const image = await loadImage(source); const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight)); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale)); const context = canvas.getContext("2d", { alpha: false }); context.drawImage(image, 0, 0, canvas.width, canvas.height); return canvas.toDataURL("image/jpeg", JPEG_QUALITY); }
function fileToDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
function loadImage(src) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; }); }

async function loadCoverPresentation() { const cover = await obtenerPortadaFirebase(); activeCoverImages = cover?.imagenes?.length ? cover.imagenes : (cover?.contenido ? [cover.contenido] : []); document.getElementById("coverMode").value = cover?.mode === "mosaic" ? "mosaic" : "random"; document.getElementById("coverSummary").textContent = activeCoverImages.length > 1 ? `${activeCoverImages.length} portadas · ${cover?.mode === "mosaic" ? "mosaico" : "aleatorias"}` : "Una portada"; updateCoverPreviewStyle(); }
function getCoverAdjustments() { return { position: Number(document.getElementById("coverPosition").value), shade: Number(document.getElementById("coverShade").value), mode: document.getElementById("coverMode").value }; }
function updateCoverPreviewStyle() { const image = document.getElementById("coverPreviewImage"); const shade = document.getElementById("coverPreviewShade"); const preview = image.parentElement; const values = getCoverAdjustments(); const sources = [...activeCoverImages.filter(url => !removedCoverImages.has(url)), ...pendingCoverImages]; image.style.objectPosition = `center ${values.position}%`; image.style.transform = "none"; image.style.filter = "none"; if (sources.length && !sources.includes(image.src)) image.src = sources[0]; let mosaic = preview.querySelector(".cover-preview-mosaic"); if (!mosaic) { mosaic = document.createElement("div"); mosaic.className = "cover-preview-mosaic"; preview.insertBefore(mosaic, image); } mosaic.replaceChildren(...(values.mode === "mosaic" ? sources.map(source => { const tile = document.createElement("img"); tile.src = source; tile.alt = ""; return tile; }) : [])); mosaic.hidden = values.mode !== "mosaic" || !sources.length; image.hidden = !mosaic.hidden; shade.style.background = `rgba(0,0,0,${values.shade / 100})`; }
function initAccordion() { const sections = [...document.querySelectorAll(".dashboard-section")]; sections.forEach(section => section.addEventListener("toggle", () => { if (!section.open) return; sections.forEach(other => { if (other !== section) other.open = false; }); sessionStorage.setItem("aris-admin-section", section.dataset.section || ""); })); const remembered = sessionStorage.getItem("aris-admin-section"); if (remembered) document.querySelector(`[data-section="${remembered}"]`)?.setAttribute("open", ""); }
function initConnectionStatus() { const output = document.getElementById("connectionStatus"); const update = () => { const online = navigator.onLine; output.classList.toggle("is-offline", !online); output.querySelector("span").textContent = online ? "Conectado" : "Sin conexión"; }; addEventListener("online", update); addEventListener("offline", update); update(); }
