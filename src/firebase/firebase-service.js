import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  uploadString,
  getDownloadURL,
  deleteObject,
  listAll
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";
import { FIREBASE_CONFIG, ADMIN_UID } from "./firebase-config.js";

const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export function prepararPersistenciaAuth() {
  return setPersistence(auth, browserLocalPersistence);
}

export function observarSesion(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function iniciarSesion(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  if (credential.user.uid !== ADMIN_UID) {
    await signOut(auth);
    throw new Error("Esta cuenta no está autorizada para publicar en ARIS.");
  }
  return credential.user;
}

export function cerrarSesion() {
  return signOut(auth);
}

export function usuarioEsAdmin(user = auth.currentUser) {
  return Boolean(user && user.uid === ADMIN_UID);
}

export async function asegurarSesionAlbum() {
  await prepararPersistenciaAuth();
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser;
}

export async function obtenerRecuerdosFirebase() {
  const snapshot = await getDocs(collection(db, "recuerdos"));
  return snapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(item => item.publicado !== false)
    .sort((a, b) => String(a.fechaISO || a.fecha || "").localeCompare(String(b.fechaISO || b.fecha || "")) || String(a.createdAt?.seconds || 0).localeCompare(String(b.createdAt?.seconds || 0)));
}

export function observarRecuerdosFirebase(callback) {
  return onSnapshot(collection(db, "recuerdos"), snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))));
}

export async function obtenerTodosLosRecuerdosFirebase() {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  const snapshot = await getDocs(collection(db, "recuerdos"));
  return snapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(b.createdAt?.seconds || 0).localeCompare(String(a.createdAt?.seconds || 0)));
}

export function crearIdRecuerdo() {
  return doc(collection(db, "recuerdos")).id;
}

function limpiarValoresIndefinidos(value) {
  if (Array.isArray(value)) return value.map(limpiarValoresIndefinidos);
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, limpiarValoresIndefinidos(item)])
    );
  }
  return value;
}

export async function guardarRecuerdoFirebase(recuerdo) {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  const id = recuerdo.id || crearIdRecuerdo();
  await setDoc(doc(db, "recuerdos", id), limpiarValoresIndefinidos({
    ...recuerdo,
    id,
    publicado: recuerdo.publicado !== false,
    updatedAt: serverTimestamp(),
    createdAt: recuerdo.createdAt || serverTimestamp()
  }), { merge: true });
  return id;
}

export async function borrarRecuerdoFirebase(id) {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  const archivos = await listAll(ref(storage, `aris/recuerdos/${id}`));
  await Promise.allSettled(archivos.items.map(item => deleteObject(item)));
  await deleteDoc(doc(db, "recuerdos", id));
}

export async function enviarRecuerdoPapeleraFirebase(id) {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  await setDoc(doc(db, "recuerdos", id), {
    eliminado: true,
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function restaurarRecuerdoFirebase(id) {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  await setDoc(doc(db, "recuerdos", id), {
    eliminado: false,
    restoredAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function obtenerRespuestaFirebase(recuerdoId) {
  const snapshot = await getDoc(doc(db, "recuerdos", recuerdoId, "respuestas", "aris"));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function obtenerRespuestasRecuerdosFirebase(recuerdoIds = []) {
  await asegurarSesionAlbum();
  const respuestas = await Promise.all([...new Set(recuerdoIds)].filter(Boolean).map(async recuerdoId => {
    const snapshot = await getDoc(doc(db, "recuerdos", recuerdoId, "respuestas", "aris"));
    return snapshot.exists() ? { recuerdoId, ...snapshot.data() } : null;
  }));
  return respuestas.filter(Boolean);
}

export async function guardarRespuestaFirebase(recuerdoId, { corazon, nota }) {
  const user = await asegurarSesionAlbum();
  const referencia = doc(db, "recuerdos", recuerdoId, "respuestas", "aris");
  const actual = await getDoc(referencia);
  if (actual.exists() && actual.data().ownerUid !== user.uid && !usuarioEsAdmin(user)) {
    throw new Error("Esta tarjeta ya tiene una respuesta desde otro dispositivo.");
  }
  await setDoc(referencia, {
    ownerUid: actual.data()?.ownerUid || user.uid,
    autor: "Aris",
    corazon: Boolean(corazon),
    nota: String(nota || "").slice(0, 600),
    leida: false,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function obtenerRespuestasFirebase() {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  const recuerdos = await getDocs(collection(db, "recuerdos"));
  const respuestas = await Promise.all(recuerdos.docs.map(async recuerdo => {
    const respuesta = await getDoc(doc(db, "recuerdos", recuerdo.id, "respuestas", "aris"));
    return respuesta.exists() ? { id: respuesta.id, recuerdoId: recuerdo.id, ...respuesta.data() } : null;
  }));
  return respuestas.filter(Boolean);
}

export function observarRespuestasFirebase(callback) {
  let cancelarRespuestas = [];
  const valores = new Map();
  const cancelarRecuerdos = onSnapshot(collection(db, "recuerdos"), snapshot => {
    cancelarRespuestas.forEach(cancelar => cancelar());
    cancelarRespuestas = [];
    valores.clear();
    if (!snapshot.docs.length) { callback([]); return; }
    snapshot.docs.forEach(recuerdo => {
      const cancelar = onSnapshot(doc(db, "recuerdos", recuerdo.id, "respuestas", "aris"), respuesta => {
        if (respuesta.exists()) valores.set(recuerdo.id, { id: respuesta.id, recuerdoId: recuerdo.id, ...respuesta.data() });
        else valores.delete(recuerdo.id);
        callback([...valores.values()]);
      });
      cancelarRespuestas.push(cancelar);
    });
  });
  return () => { cancelarRecuerdos(); cancelarRespuestas.forEach(cancelar => cancelar()); };
}

export async function marcarRespuestaLeidaFirebase(recuerdoId) {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  await setDoc(doc(db, "recuerdos", recuerdoId, "respuestas", "aris"), { leida: true, leidaAt: serverTimestamp() }, { merge: true });
}

export async function guardarConfiguracionGeneralFirebase(configuracion) {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  await setDoc(doc(db, "configuracion", "general"), { ...configuracion, updatedAt: serverTimestamp() }, { merge: true });
}

export async function obtenerConfiguracionGeneralFirebase() {
  const snapshot = await getDoc(doc(db, "configuracion", "general"));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function obtenerCalendarioFirebase() {
  const snapshot = await getDoc(doc(db, "configuracion", "calendario"));
  return snapshot.exists() && Array.isArray(snapshot.data().mensajes) ? snapshot.data().mensajes : [];
}

export async function guardarCalendarioFirebase(mensajes) {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  const limpios = mensajes.map(mensaje => ({
    id: String(mensaje.id || ""),
    fecha: String(mensaje.fecha || ""),
    titulo: String(mensaje.titulo || "").slice(0, 80),
    texto: String(mensaje.texto || "").slice(0, 700),
    anual: Boolean(mensaje.anual)
  })).filter(mensaje => mensaje.id && /^\d{4}-\d{2}-\d{2}$/.test(mensaje.fecha) && mensaje.titulo && mensaje.texto);
  await setDoc(doc(db, "configuracion", "calendario"), { mensajes: limpios, updatedAt: serverTimestamp() }, { merge: true });
  return limpios;
}

function extensionSegura(nombre = "archivo", tipo = "") {
  const extension = nombre.includes(".") ? nombre.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  if (extension) return extension;
  if (tipo.startsWith("image/")) return "jpg";
  if (tipo.startsWith("audio/")) return "m4a";
  if (tipo.startsWith("video/")) return "mp4";
  return "bin";
}

export async function subirArchivoFirebase({ recuerdoId, campo, archivo }) {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  const ext = extensionSegura(archivo.name, archivo.type);
  const ruta = `aris/recuerdos/${recuerdoId}/${campo}-${Date.now()}.${ext}`;
  const referencia = ref(storage, ruta);
  await uploadBytes(referencia, archivo, { contentType: archivo.type || undefined, cacheControl: "public,max-age=31536000,immutable" });
  return getDownloadURL(referencia);
}

export async function subirDataUrlFirebase({ recuerdoId, campo, dataUrl }) {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  if (!String(dataUrl).startsWith("data:")) return dataUrl;
  const tipo = String(dataUrl).slice(5, String(dataUrl).indexOf(";")) || "image/jpeg";
  const ext = extensionSegura("", tipo);
  const ruta = `aris/recuerdos/${recuerdoId}/${campo}-${Date.now()}.${ext}`;
  const referencia = ref(storage, ruta);
  await uploadString(referencia, dataUrl, "data_url", { contentType: tipo, cacheControl: "public,max-age=31536000,immutable" });
  return getDownloadURL(referencia);
}

export async function guardarPortadaFirebase(dataUrl) {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  const url = await subirDataUrlFirebase({ recuerdoId: "configuracion", campo: "portada", dataUrl });
  await setDoc(doc(db, "configuracion", "portada"), { contenido: url, updatedAt: serverTimestamp() }, { merge: true });
  return url;
}

export async function reemplazarGaleriaPortadasFirebase(dataUrls) {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  const imagenes = dataUrls.filter(value => String(value).startsWith("data:"));
  if (!imagenes.length) throw new Error("Selecciona al menos una imagen.");
  const carpeta = ref(storage, "aris/recuerdos/configuracion");
  const anteriores = await listAll(carpeta).catch(() => ({ items: [] }));
  const urls = [];
  for (let index = 0; index < imagenes.length; index += 1) {
    const dataUrl = imagenes[index];
    const tipo = String(dataUrl).slice(5, String(dataUrl).indexOf(";")) || "image/jpeg";
    const referencia = ref(storage, `aris/recuerdos/configuracion/portada-galeria-${Date.now()}-${index}.jpg`);
    await uploadString(referencia, dataUrl, "data_url", { contentType: tipo, cacheControl: "public,max-age=31536000,immutable" });
    urls.push(await getDownloadURL(referencia));
  }
  await setDoc(doc(db, "configuracion", "portada"), { contenido: urls[0], imagenes: urls, updatedAt: serverTimestamp() }, { merge: true });
  await Promise.allSettled(anteriores.items.map(item => deleteObject(item)));
  return urls;
}

export async function actualizarGaleriaPortadasFirebase({ imagenesActuales = [], nuevas = [], eliminadas = [] }) {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  const conservadas = imagenesActuales.filter(url => !eliminadas.includes(url));
  const subidas = [];
  for (let index = 0; index < nuevas.length; index += 1) {
    const dataUrl = nuevas[index];
    if (!String(dataUrl).startsWith("data:")) continue;
    const tipo = String(dataUrl).slice(5, String(dataUrl).indexOf(";")) || "image/jpeg";
    const referencia = ref(storage, `aris/recuerdos/configuracion/portada-galeria-${Date.now()}-${index}.jpg`);
    await uploadString(referencia, dataUrl, "data_url", { contentType: tipo, cacheControl: "public,max-age=31536000,immutable" });
    subidas.push(await getDownloadURL(referencia));
  }
  const imagenes = [...conservadas, ...subidas];
  if (!imagenes.length) throw new Error("La colección debe conservar al menos una fotografía.");
  await setDoc(doc(db, "configuracion", "portada"), { contenido: imagenes[0], imagenes, updatedAt: serverTimestamp() }, { merge: true });
  await Promise.allSettled(eliminadas.map(url => deleteObject(ref(storage, url))));
  return imagenes;
}

export async function guardarAjustesPortadaFirebase(ajustes) {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  await setDoc(doc(db, "configuracion", "portada"), { ...ajustes, updatedAt: serverTimestamp() }, { merge: true });
}

export async function obtenerPortadaFirebase() {
  const snapshot = await getDoc(doc(db, "configuracion", "portada"));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function restaurarPortadaFirebase() {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  await deleteDoc(doc(db, "configuracion", "portada"));
  const carpeta = await listAll(ref(storage, "aris/recuerdos/configuracion")).catch(() => ({ items: [] }));
  await Promise.allSettled(carpeta.items.map(item => deleteObject(item)));
}

export async function guardarReencuentroFirebase(fecha) {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  await setDoc(doc(db, "configuracion", "reencuentro"), { fecha, updatedAt: serverTimestamp() }, { merge: true });
}

export async function obtenerReencuentroFirebase() {
  const snapshot = await getDoc(doc(db, "configuracion", "reencuentro"));
  return snapshot.exists() ? snapshot.data() : null;
}
