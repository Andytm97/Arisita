import { renderTarjeta } from "../src/components/memory-renderer.js";

const STORAGE_KEY = "aris-content-draft-v1";
const COVER_STORAGE_KEY = "aris-cover-image-v1";
const MAX_IMAGE_EDGE = 1200;
const JPEG_QUALITY = 0.72;
const MAX_DATA_URL_LENGTH = 1_250_000;

const FORM_DRAFT_KEY = "aris-editor-form-draft-v1";
let formDraftTimer;

const form = document.getElementById("memoryForm");
const tipo = document.getElementById("tipo");
const dynamicFields = document.getElementById("dynamicFields");
const previewCard = document.getElementById("previewCard");
const status = document.getElementById("formStatus");
const memoryList = document.getElementById("memoryList");
let baseData;
let metadataTimer;
let pendingCoverImage = "";
const coverGalleryInput = document.getElementById("coverGalleryInput");
const coverCameraInput = document.getElementById("coverCameraInput");
const coverPreviewImage = document.getElementById("coverPreviewImage");
const coverStatus = document.getElementById("coverStatus");
const saveCoverButton = document.getElementById("saveCover");

const imagePicker = ({ targetName, label = "Imagen", optional = false }) => `
  <div class="field media-picker" data-image-picker="${targetName}">
    <span>${label}${optional ? " (opcional)" : ""}</span>
    <input type="hidden" name="${targetName}" ${optional ? "" : "required"}>
    <div class="picker-actions">
      <button class="secondary-button picker-button" type="button" data-pick-gallery="${targetName}">Elegir de la galería</button>
      <button class="secondary-button picker-button" type="button" data-pick-camera="${targetName}">Hacer una foto</button>
    </div>
    <input class="visually-hidden" type="file" accept="image/*" data-file-gallery="${targetName}">
    <input class="visually-hidden" type="file" accept="image/*" capture="environment" data-file-camera="${targetName}">
    <div class="picked-image" data-picked-image="${targetName}" hidden>
      <img alt="Vista previa de la imagen seleccionada">
      <button type="button" class="ghost-button" data-clear-image="${targetName}">Quitar imagen</button>
    </div>
    <p class="field-hint">La imagen se reduce y comprime automáticamente antes de guardarse.</p>
  </div>`;

const fieldTemplates = {
  foto: `${imagePicker({ targetName: "contenido", label: "Fotografía" })}<label class="field"><span>Descripción</span><textarea name="descripcion" placeholder="Lo que quieres contar sobre esta foto"></textarea></label>`,
  texto: `<label class="field"><span>Texto de la carta</span><textarea name="texto" placeholder="Escribe aquí tu carta…" required></textarea></label><label class="field"><span>Firma</span><input name="firma" placeholder="Siempre contigo"></label>`,
  video: `<label class="field"><span>Ruta o URL del vídeo</span><input name="contenido" placeholder="assets/media/video.mp4" required></label>${imagePicker({ targetName: "poster", label: "Miniatura", optional: true })}<label class="field"><span>Descripción</span><textarea name="descripcion"></textarea></label>`,
  audio: `<label class="field"><span>Ruta o URL del audio</span><input name="contenido" placeholder="assets/media/nota.m4a" required></label><label class="field"><span>Duración visible</span><input name="duracion" placeholder="0:38"></label><label class="field"><span>Descripción</span><textarea name="descripcion"></textarea></label>`,
  spotify: `<label class="field metadata-field"><span>Enlace de Spotify</span><div class="metadata-input-row"><input name="enlace" type="url" inputmode="url" placeholder="https://open.spotify.com/track/…" required><button class="secondary-button metadata-button" type="button" data-fetch-metadata="spotify">Obtener datos</button></div><small data-metadata-status="spotify"></small></label><label class="field"><span>Título de la canción</span><input name="cancionTitulo" placeholder="Se completará automáticamente"></label><label class="field"><span>Artista</span><input name="artista" placeholder="Puedes corregirlo si hace falta"></label>${imagePicker({ targetName: "portada", label: "Carátula", optional: true })}<label class="field"><span>Duración visible</span><input name="duracion" placeholder="3:42"></label><label class="field"><span>Descripción</span><textarea name="descripcion"></textarea></label>`,
  youtube: `<label class="field metadata-field"><span>Enlace de YouTube</span><div class="metadata-input-row"><input name="enlace" type="url" inputmode="url" placeholder="https://youtu.be/…" required><button class="secondary-button metadata-button" type="button" data-fetch-metadata="youtube">Obtener datos</button></div><small data-metadata-status="youtube"></small></label><label class="field"><span>Título del vídeo</span><input name="videoTitulo" placeholder="Se completará automáticamente"></label><label class="field"><span>Canal</span><input name="canal" placeholder="Se completará automáticamente"></label>${imagePicker({ targetName: "miniatura", label: "Miniatura", optional: true })}<label class="field"><span>Descripción</span><textarea name="descripcion"></textarea></label>`,
  ubicacion: `<label class="field"><span>Nombre del lugar</span><input name="lugar" placeholder="Madrid · 40.4168° N" required></label><label class="field"><span>Enlace de Maps</span><input name="enlace" type="url" placeholder="https://maps.google.com/?q=…" required></label><label class="field"><span>Descripción</span><textarea name="descripcion"></textarea></label>`
};

init();

async function init(){
  baseData = await loadBase();
  renderFields();
  setDefaultDate();
  updatePreview();
  renderList();
  tipo.addEventListener("change",()=>{renderFields();updatePreview();});
  form.addEventListener("input",handleFormInput);
  form.addEventListener("submit",saveMemory);
  document.getElementById("previewButton").addEventListener("click",updatePreview);
  document.getElementById("resetForm").addEventListener("click",()=>{form.reset();setDefaultDate();renderFields();updatePreview();});
  document.getElementById("exportButton").addEventListener("click",exportJson);
  document.getElementById("clearDrafts").addEventListener("click",clearDrafts);
  initCoverEditor();
}

function initCoverEditor(){
  const original = baseData?.portada?.contenido || "../assets/fondo.jpg";
  let saved = "";
  try { saved = localStorage.getItem(COVER_STORAGE_KEY) || ""; } catch (_) {}
  pendingCoverImage = saved;
  setCoverPreview(saved || resolveAdminAsset(original));

  document.getElementById("pickCoverGallery").addEventListener("click",()=>coverGalleryInput.click());
  document.getElementById("pickCoverCamera").addEventListener("click",()=>coverCameraInput.click());
  coverGalleryInput.addEventListener("change",handleCoverSelection);
  coverCameraInput.addEventListener("change",handleCoverSelection);
  saveCoverButton.addEventListener("click",saveCoverImage);
  document.getElementById("restoreCover").addEventListener("click",restoreCoverImage);
}

function resolveAdminAsset(value){
  if(!value)return "../assets/fondo.jpg";
  if(/^(data:|https?:|blob:|\/)/i.test(value))return value;
  return `../${value.replace(/^\.\//,"")}`;
}

async function handleCoverSelection(event){
  const file=event.currentTarget.files?.[0];
  if(!file)return;
  if(!file.type.startsWith("image/")){setCoverStatus("El archivo seleccionado no es una imagen.",true);return;}
  setCoverStatus("Preparando la portada…");
  try{
    pendingCoverImage=await compressImage(file);
    setCoverPreview(pendingCoverImage);
    saveCoverButton.disabled=false;
    setCoverStatus("Portada preparada. Pulsa Guardar portada para aplicarla.");
  }catch(error){
    console.error(error);
    setCoverStatus("No se pudo procesar la imagen. Prueba con otra fotografía.",true);
  }finally{event.currentTarget.value="";}
}

function setCoverPreview(src){
  coverPreviewImage.src=src || "../assets/fondo.jpg";
}

function saveCoverImage(){
  if(!pendingCoverImage)return;
  try{
    localStorage.setItem(COVER_STORAGE_KEY,pendingCoverImage);
    saveCoverButton.disabled=true;
    setCoverStatus("Portada guardada. Al volver al álbum aparecerá automáticamente.");
  }catch(error){
    console.error(error);
    setCoverStatus("Safari no tiene espacio suficiente para guardar esta portada.",true);
  }
}

function restoreCoverImage(){
  try{localStorage.removeItem(COVER_STORAGE_KEY);}catch(_){}
  pendingCoverImage="";
  saveCoverButton.disabled=true;
  setCoverPreview(resolveAdminAsset(baseData?.portada?.contenido || "assets/fondo.jpg"));
  setCoverStatus("Se ha restaurado la portada original.");
}

function setCoverStatus(message,isError=false){
  coverStatus.textContent=message;
  coverStatus.classList.toggle("is-error",isError);
}

async function loadBase(){
  try{const r=await fetch("../data/contenido.json",{cache:"no-store"});if(r.ok)return await r.json();}catch(_){}
  return {nombre:"Aris",diasRestantes:82,portada:{titulo:"A PESAR DE LA DISTANCIA...",texto:"Para que nos podamos sentir un poco más cerca.",contenido:"assets/fondo.jpg"},recuerdos:[]};
}

function renderFields(){
  dynamicFields.innerHTML=fieldTemplates[tipo.value]||fieldTemplates.texto;
  wireDynamicFields();
}

function wireDynamicFields(){
  dynamicFields.querySelectorAll("[data-pick-gallery]").forEach(button=>button.addEventListener("click",()=>dynamicFields.querySelector(`[data-file-gallery="${button.dataset.pickGallery}"]`)?.click()));
  dynamicFields.querySelectorAll("[data-pick-camera]").forEach(button=>button.addEventListener("click",()=>dynamicFields.querySelector(`[data-file-camera="${button.dataset.pickCamera}"]`)?.click()));
  dynamicFields.querySelectorAll("[data-file-gallery],[data-file-camera]").forEach(input=>input.addEventListener("change",handleImageSelection));
  dynamicFields.querySelectorAll("[data-clear-image]").forEach(button=>button.addEventListener("click",()=>clearSelectedImage(button.dataset.clearImage)));
  dynamicFields.querySelectorAll("[data-fetch-metadata]").forEach(button=>button.addEventListener("click",()=>fetchMetadata(button.dataset.fetchMetadata)));
}

function handleFormInput(event){
  requestAnimationFrame(updatePreview);
  scheduleFormDraftSave();
  const linkInput=event.target.closest('input[name="enlace"]');
  if(!linkInput||!["spotify","youtube"].includes(tipo.value))return;
  clearTimeout(metadataTimer);
  metadataTimer=setTimeout(()=>fetchMetadata(tipo.value,{silent:true}),650);
}

async function handleImageSelection(event){
  const input=event.currentTarget;
  const file=input.files?.[0];
  if(!file)return;
  if(!file.type.startsWith("image/")){setStatus("El archivo seleccionado no es una imagen.",true);return;}
  setStatus("Preparando la imagen…");
  try{
    const dataUrl=await compressImage(file);
    const target=input.dataset.fileGallery||input.dataset.fileCamera;
    setImageValue(target,dataUrl);
    setStatus("Imagen preparada. Se guardará dentro del recuerdo local.");
  }catch(error){
    console.error(error);
    setStatus("No se pudo procesar la imagen. Prueba con otra fotografía.",true);
  }finally{input.value="";}
}

async function compressImage(file){
  const source=await fileToDataUrl(file);
  const image=await loadImage(source);
  let edge=MAX_IMAGE_EDGE;
  let quality=JPEG_QUALITY;
  let result="";

  for(let attempt=0;attempt<4;attempt+=1){
    const scale=Math.min(1,edge/Math.max(image.naturalWidth,image.naturalHeight));
    const width=Math.max(1,Math.round(image.naturalWidth*scale));
    const height=Math.max(1,Math.round(image.naturalHeight*scale));
    const canvas=document.createElement("canvas");
    canvas.width=width;canvas.height=height;
    const context=canvas.getContext("2d",{alpha:false});
    if(!context)throw new Error("Canvas no disponible");
    context.drawImage(image,0,0,width,height);
    result=canvas.toDataURL("image/jpeg",quality);
    if(result.length<=MAX_DATA_URL_LENGTH)return result;
    edge=Math.round(edge*.78);
    quality=Math.max(.54,quality-.08);
  }

  return result;
}

function fileToDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});}
function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src;});}

function setImageValue(name,value){
  const hidden=dynamicFields.querySelector(`input[name="${name}"]`);
  if(hidden)hidden.value=value;
  const wrapper=dynamicFields.querySelector(`[data-picked-image="${name}"]`);
  if(wrapper){wrapper.hidden=!value;wrapper.querySelector("img").src=value||"";}
  updatePreview();
}

function clearSelectedImage(name){setImageValue(name,"");}

async function fetchMetadata(provider,{silent=false}={}){
  const url=String(form.elements.enlace?.value||"").trim();
  if(!url)return;
  const metadataStatus=dynamicFields.querySelector(`[data-metadata-status="${provider}"]`);
  if(metadataStatus&&!silent)metadataStatus.textContent="Buscando información…";
  try{
    if(provider==="spotify")await fillSpotifyMetadata(url);
    if(provider==="youtube")await fillYouTubeMetadata(url);
    if(metadataStatus)metadataStatus.textContent="Información añadida automáticamente. Puedes editarla.";
    updatePreview();
  }catch(error){
    console.warn(error);
    if(metadataStatus)metadataStatus.textContent="No se pudo obtener todo automáticamente. Puedes completarlo a mano.";
    if(!silent)setStatus("No he podido leer ese enlace automáticamente; los campos siguen siendo editables.",true);
  }
}

async function fillSpotifyMetadata(url){
  if(!/spotify\.(com|link)/i.test(url))throw new Error("Enlace de Spotify no reconocido");
  const endpoint=`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
  const response=await fetch(endpoint);
  if(!response.ok)throw new Error("Spotify oEmbed no disponible");
  const data=await response.json();
  const rawTitle=String(data.title||"").replace(/\s*\|\s*Spotify\s*$/i,"").trim();
  const parsed=parseSpotifyTitle(rawTitle);
  setNamedValue("cancionTitulo",parsed.title||rawTitle);
  if(parsed.artist)setNamedValue("artista",parsed.artist);
  if(data.thumbnail_url)setImageValue("portada",data.thumbnail_url);
  if(!form.elements.titulo.value&&rawTitle)form.elements.titulo.value=parsed.title||rawTitle;
}

function parseSpotifyTitle(title){
  const patterns=[
    /^(.*?)\s+-\s+song and lyrics by\s+(.+)$/i,
    /^(.*?)\s+by\s+(.+)$/i,
    /^(.*?)\s+•\s+(.+)$/
  ];
  for(const pattern of patterns){const match=title.match(pattern);if(match)return{title:match[1].trim(),artist:match[2].trim()};}
  return{title,artist:""};
}

async function fillYouTubeMetadata(url){
  const videoId=getYouTubeId(url);
  if(!videoId)throw new Error("Enlace de YouTube no reconocido");
  let data={};
  try{
    const endpoint=`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response=await fetch(endpoint);
    if(response.ok)data=await response.json();
  }catch(_){}
  setNamedValue("videoTitulo",data.title||"");
  setNamedValue("canal",data.author_name||"");
  setImageValue("miniatura",data.thumbnail_url||`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
  if(!form.elements.titulo.value&&data.title)form.elements.titulo.value=data.title;
}

function getYouTubeId(value){
  try{
    const url=new URL(value);
    if(url.hostname.includes("youtu.be"))return url.pathname.split("/").filter(Boolean)[0]||"";
    if(url.pathname.startsWith("/shorts/"))return url.pathname.split("/")[2]||"";
    if(url.pathname.startsWith("/embed/"))return url.pathname.split("/")[2]||"";
    return url.searchParams.get("v")||"";
  }catch(_){return"";}
}

function setNamedValue(name,value){const field=form.elements[name];if(field&&value)field.value=value;}
function setDefaultDate(){document.getElementById("fecha").value ||= new Date().toISOString().slice(0,10);}

function formPage(){
  const fd=new FormData(form);
  const t=fd.get("tipo");
  const title=String(fd.get("titulo")||"Hoy quería enseñarte algo");
  const page={tipo:t,fecha:formatDate(fd.get("fecha")),titulo:title,etiqueta:labelFor(t),descripcion:String(fd.get("descripcion")||"")};
  const excluded=new Set(["fecha","titulo","tipo","destacado","artista","cancionTitulo","videoTitulo","canal"]);
  for(const [key,value] of fd.entries())if(!excluded.has(key)&&typeof value==="string"&&value)page[key]=value;
  if(t==="texto")page.texto=String(fd.get("texto")||title);
  if(t==="spotify")page.cancion={titulo:String(fd.get("cancionTitulo")||title),artista:String(fd.get("artista")||"Nuestra playlist")};
  if(t==="youtube"){
    page.titulo=String(fd.get("videoTitulo")||title);
    page.canal=String(fd.get("canal")||"");
  }
  return page;
}

function updatePreview(){previewCard.innerHTML=renderTarjeta(formPage());}

function saveMemory(event){
  event.preventDefault();
  if(!form.reportValidity())return;
  const page=formPage();
  const drafts=getDrafts();
  const id=`recuerdo-local-${Date.now()}`;
  drafts.push({id,fecha:page.fecha,titulo:page.titulo,destacado:document.getElementById("destacado").checked,elementos:[{...page,id:`${id}-elemento-1`,fecha:undefined}]});
  const next={version:2,recuerdos:drafts};
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
    setStatus("Recuerdo guardado y disponible en el álbum de este dispositivo.");
    renderList();
  }catch(error){
    console.error(error);
    setStatus("El navegador no tiene espacio suficiente. Exporta el JSON o utiliza imágenes más pequeñas; Firebase eliminará este límite.",true);
  }
}

function getSaved(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");}catch(_){return null;}}
function getDrafts(){
  const saved=getSaved();
  if(!saved?.recuerdos)return[];
  if(saved.version===2)return saved.recuerdos;
  const baseCount=(baseData.recuerdos||[]).length;
  return saved.recuerdos.slice(baseCount);
}

function renderList(){
  const drafts=getDrafts();
  if(!drafts.length){memoryList.innerHTML='<div class="empty-state">Todavía no has preparado ningún recuerdo local.</div>';return;}
  memoryList.innerHTML=drafts.map((memory,index)=>`<article class="memory-row"><div><h3>${escapeHtml(memory.titulo)}</h3><p>${escapeHtml(memory.fecha)} · ${escapeHtml(labelFor(memory.elementos?.[0]?.tipo))}</p></div><div class="row-actions"><button class="icon-button" data-preview="${index}" aria-label="Previsualizar">◉</button><button class="icon-button" data-delete="${index}" aria-label="Eliminar">×</button></div></article>`).join("");
  memoryList.querySelectorAll("[data-preview]").forEach(button=>button.addEventListener("click",()=>{const memory=drafts[+button.dataset.preview];previewCard.innerHTML=renderTarjeta({...memory.elementos[0],fecha:memory.fecha,titulo:memory.titulo});window.scrollTo({top:0,behavior:"smooth"});}));
  memoryList.querySelectorAll("[data-delete]").forEach(button=>button.addEventListener("click",()=>deleteDraft(+button.dataset.delete)));
}

function deleteDraft(index){const drafts=getDrafts();drafts.splice(index,1);localStorage.setItem(STORAGE_KEY,JSON.stringify({version:2,recuerdos:drafts}));renderList();setStatus("Borrador eliminado.");}
function clearDrafts(){if(!confirm("¿Borrar todos los recuerdos locales?"))return;localStorage.removeItem(STORAGE_KEY);renderList();setStatus("Borradores locales eliminados.");}
function exportJson(){const drafts=getDrafts();const content={...baseData,recuerdos:[...(baseData.recuerdos||[]),...drafts]};const blob=new Blob([JSON.stringify(content,null,2)],{type:"application/json"});const anchor=document.createElement("a");anchor.href=URL.createObjectURL(blob);anchor.download="contenido-aris.json";anchor.click();URL.revokeObjectURL(anchor.href);}
function formatDate(value){if(!value)return"";return new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}T00:00:00Z`));}
function labelFor(value){return({foto:"Fotografía",texto:"Carta",video:"Vídeo",audio:"Nota de voz",spotify:"Spotify",youtube:"YouTube",ubicacion:"Lugar"})[value]||"Recuerdo";}
function escapeHtml(value){return String(value||"").replace(/[&<>'"]/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[character]);}
function setStatus(message,isError=false){status.textContent=message;status.classList.toggle("is-error",isError);}


function serializarBorradorFormulario() {
  const values = {};
  new FormData(form).forEach((value, key) => {
    if (typeof value === "string") values[key] = value;
  });
  return { tipo: tipo.value, values, savedAt: Date.now() };
}

function scheduleFormDraftSave() {
  clearTimeout(formDraftTimer);
  formDraftTimer = setTimeout(() => {
    try { localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(serializarBorradorFormulario())); } catch (_) {}
  }, 300);
}

function restaurarBorradorFormulario() {
  let draft;
  try { draft = JSON.parse(localStorage.getItem(FORM_DRAFT_KEY) || "null"); } catch (_) { return; }
  if (!draft?.values) return;
  if (draft.tipo && fieldTemplates[draft.tipo]) {
    tipo.value = draft.tipo;
    renderFields();
  }
  for (const [name, value] of Object.entries(draft.values)) {
    const field = form.elements[name];
    if (!field || !value) continue;
    if (field.type === "checkbox") field.checked = value === "on";
    else field.value = value;
    if (["contenido", "portada", "miniatura", "poster"].includes(name)) setImageValue(name, value);
  }
  updatePreview();
  setStatus("He recuperado el recuerdo que estabas preparando.");
}

window.addEventListener("load", () => window.setTimeout(restaurarBorradorFormulario, 80));
