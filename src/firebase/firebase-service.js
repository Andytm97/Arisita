import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  uploadString,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";
import { FIREBASE_CONFIG, ADMIN_UID } from "./firebase-config.js";

const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

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

export async function obtenerRecuerdosFirebase() {
  const snapshot = await getDocs(collection(db, "recuerdos"));
  return snapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(item => item.publicado !== false)
    .sort((a, b) => String(a.fechaISO || a.fecha || "").localeCompare(String(b.fechaISO || b.fecha || "")) || String(a.createdAt?.seconds || 0).localeCompare(String(b.createdAt?.seconds || 0)));
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
  await deleteDoc(doc(db, "recuerdos", id));
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
  await uploadBytes(referencia, archivo, { contentType: archivo.type || undefined });
  return getDownloadURL(referencia);
}

export async function subirDataUrlFirebase({ recuerdoId, campo, dataUrl }) {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  if (!String(dataUrl).startsWith("data:")) return dataUrl;
  const tipo = String(dataUrl).slice(5, String(dataUrl).indexOf(";")) || "image/jpeg";
  const ext = extensionSegura("", tipo);
  const ruta = `aris/recuerdos/${recuerdoId}/${campo}-${Date.now()}.${ext}`;
  const referencia = ref(storage, ruta);
  await uploadString(referencia, dataUrl, "data_url", { contentType: tipo });
  return getDownloadURL(referencia);
}

export async function guardarPortadaFirebase(dataUrl) {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  const url = await subirDataUrlFirebase({ recuerdoId: "configuracion", campo: "portada", dataUrl });
  await setDoc(doc(db, "configuracion", "portada"), { contenido: url, updatedAt: serverTimestamp() }, { merge: true });
  return url;
}

export async function obtenerPortadaFirebase() {
  const snapshot = await getDoc(doc(db, "configuracion", "portada"));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function restaurarPortadaFirebase() {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  await deleteDoc(doc(db, "configuracion", "portada"));
}

export async function guardarReencuentroFirebase(fecha) {
  if (!usuarioEsAdmin()) throw new Error("No autorizado.");
  await setDoc(doc(db, "configuracion", "reencuentro"), { fecha, updatedAt: serverTimestamp() }, { merge: true });
}

export async function obtenerReencuentroFirebase() {
  const snapshot = await getDoc(doc(db, "configuracion", "reencuentro"));
  return snapshot.exists() ? snapshot.data() : null;
}
