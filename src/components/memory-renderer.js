import { escapar, atributoSeguro } from "../core/utils.js";

function botonAccion({ accion, texto, icono = "↗", url = "", media = "", titulo = "" }) {
  return `<button class="media-action" type="button" data-media-action="${atributoSeguro(accion)}" data-url="${atributoSeguro(url)}" data-media="${atributoSeguro(media)}" data-title="${atributoSeguro(titulo)}"><span>${escapar(texto)}</span><span class="media-action-icon" aria-hidden="true">${icono}</span></button>`;
}

export function renderTarjeta(pagina) {
  if (!pagina) return "";
  const tipo = pagina.tipo || "texto";
  const fecha = escapar(pagina.fecha || "");
  const etiqueta = escapar(pagina.etiqueta || nombreTipo(tipo));
  const meta = `<div class="card-meta"><p class="card-date">${fecha}</p><p class="card-kind ${tipo}-mark">${etiqueta}</p></div>`;

  if (tipo === "foto") {
    return `<div class="card-inner photo-card">${meta}
      <div class="photo-wrap"><img class="photo" src="${escapar(pagina.contenido || "assets/fondo.jpg")}" alt="Recuerdo fotográfico"></div>
      <div class="card-copy"><h2 class="card-title">${escapar(pagina.titulo || pagina.texto || "Un recuerdo contigo")}</h2><p class="card-description">${escapar(pagina.descripcion || "")}</p></div>
    </div>`;
  }

  if (tipo === "texto") {
    return `<div class="card-inner letter-card">${meta}
      <div class="letter-body"><div class="letter-mark">“</div><p class="letter-text">${escapar(pagina.texto || pagina.titulo || "")}</p><p class="letter-signature">${escapar(pagina.firma || pagina.descripcion || "Siempre contigo")}</p></div>
    </div>`;
  }

  if (tipo === "cancion" || tipo === "spotify") {
    const cancion = pagina.cancion || {};
    const enlace = pagina.enlace || pagina.url || "";

    if (tipo === "spotify") {
      const portada = pagina.portada || pagina.carátula || pagina.caratula || "";
      const estiloPortada = portada ? ` style="background-image:url('${atributoSeguro(portada)}')"` : "";
      const controlPrincipal = enlace
        ? `<button class="spotify-play media-icon-action" type="button" data-media-action="external" data-url="${atributoSeguro(enlace)}" aria-label="Abrir en Spotify">▶</button>`
        : `<div class="spotify-play spotify-play--decorative" aria-hidden="true">▶</div>`;
      return `<div class="card-inner spotify-card">${meta}
        <div class="spotify-player">
          <div class="spotify-art"${estiloPortada}><span class="spotify-art-wordmark">ARIS</span></div>
          <div class="spotify-track-row">
            <div class="spotify-track-copy"><h2 class="spotify-track-title">${escapar(cancion.titulo || "Nuestra canción")}</h2><p class="spotify-track-artist">${escapar(cancion.artista || "Nuestra playlist")}</p></div>
            <span class="spotify-like" aria-hidden="true">♡</span>
          </div>
          <div class="spotify-progress"><span></span></div>
          <div class="spotify-times"><span>1:18</span><span>${escapar(pagina.duracion || "3:42")}</span></div>
          <div class="spotify-controls" aria-hidden="true"><span>↶</span><span>◀</span>${controlPrincipal}<span>▶</span><span>↷</span></div>
          <p class="spotify-description">${escapar(pagina.descripcion || "")}</p>
          ${!enlace ? `<p class="media-placeholder">Añade el enlace en <code>contenido.json</code></p>` : ""}
        </div>
      </div>`;
    }

    const control = enlace
      ? `<button class="play-button media-icon-action" type="button" data-media-action="external" data-url="${atributoSeguro(enlace)}" aria-label="Escuchar canción">▶</button>`
      : `<div class="play-button play-button--decorative" aria-hidden="true">▶</div>`;
    return `<div class="card-inner music-card">${meta}
      <div class="music-body">
        <div class="album-art"></div>
        <div class="track-info"><div><h2 class="track-title">${escapar(cancion.titulo || "Nuestra canción")}</h2><p class="track-artist">${escapar(cancion.artista || "Nuestra historia")}</p></div>${control}<div class="progress-track"><span></span></div></div>
        <p class="card-description">${escapar(pagina.descripcion || "")}</p>
        ${!enlace ? `<p class="media-placeholder">Añade el enlace en <code>contenido.json</code></p>` : ""}
      </div>
    </div>`;
  }

  if (tipo === "video") {
    const media = pagina.contenido || pagina.video || "";
    const poster = pagina.poster || pagina.miniatura || "assets/fondo.jpg";
    const aviso = media ? "" : `<p class="media-placeholder">Añade el archivo de vídeo en <code>contenido.json</code></p>`;
    return `<div class="card-inner video-card">${meta}
      <div class="video-body"><div class="video-poster" style="background-image:linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.38)),url('${atributoSeguro(poster)}')"><button class="poster-play" type="button" data-media-action="video" data-media="${atributoSeguro(media)}" data-title="${atributoSeguro(pagina.titulo || "Vídeo")}" aria-label="Reproducir vídeo" ${media ? "" : "disabled"}>▶</button><span class="video-duration">${escapar(pagina.duracion || "0:24")}</span></div></div>
      <div class="card-copy"><h2 class="card-title">${escapar(pagina.titulo || "Un vídeo para ti")}</h2><p class="card-description">${escapar(pagina.descripcion || "")}</p>${aviso}</div>
    </div>`;
  }

  if (tipo === "audio") {
    const alturas = [28,45,62,38,74,52,90,66,40,82,56,98,61,44,76,34,58,88,49,69,37,78,54,31];
    const media = pagina.contenido || pagina.audio || "";
    return `<div class="card-inner audio-card">${meta}
      <div class="audio-body"><h2 class="card-title">${escapar(pagina.titulo || "Una nota de voz")}</h2><div class="waveform" data-audio-wave>${alturas.map(h => `<span style="--h:${h}%"></span>`).join("")}</div><div class="audio-controls"><button class="play-button audio-play" type="button" data-media-action="audio" data-media="${atributoSeguro(media)}" data-title="${atributoSeguro(pagina.titulo || "Nota de voz")}" aria-label="Reproducir nota de voz">▶</button><span class="audio-time"><span data-audio-current>0:00</span> / ${escapar(pagina.duracion || "0:38")}</span></div><div class="audio-progress" data-audio-seek role="slider" tabindex="0" aria-label="Posición del audio" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span data-audio-progress></span><i class="audio-progress-thumb" aria-hidden="true"></i></div><p class="audio-note">${escapar(pagina.descripcion || "")}</p></div>
    </div>`;
  }

  if (tipo === "youtube") {
    const enlace = pagina.enlace || pagina.url || "";
    const miniatura = pagina.miniatura || "assets/fondo.jpg";
    return `<div class="card-inner youtube-card">${meta}
      <div class="youtube-body"><div class="video-poster" style="background-image:linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.38)),url('${atributoSeguro(miniatura)}')"><button class="poster-play" type="button" data-media-action="external" data-url="${atributoSeguro(enlace)}" aria-label="Abrir vídeo en YouTube">▶</button><span class="video-duration">${escapar(pagina.duracion || "3:42")}</span></div><div class="card-copy youtube-copy"><h2 class="card-title">${escapar(pagina.titulo || "Un vídeo para ver juntos")}</h2><p class="card-description">${escapar(pagina.descripcion || "")}</p>${!enlace ? `<p class="media-placeholder">Añade el enlace en <code>contenido.json</code></p>` : ""}</div></div>
    </div>`;
  }

  if (tipo === "ubicacion") {
    const enlace = pagina.enlace || pagina.url || "";
    const pin = enlace
      ? `<button class="map-pin map-pin-action" type="button" data-media-action="external" data-url="${atributoSeguro(enlace)}" aria-label="Abrir ubicación en Maps"><span>●</span></button>`
      : `<div class="map-pin"><span>●</span></div>`;
    return `<div class="card-inner location-card">${meta}
      <div class="map-canvas">${pin}</div>
      <div class="card-copy"><h2 class="card-title">${escapar(pagina.titulo || "Un lugar pendiente")}</h2><p class="card-description">${escapar(pagina.lugar || "")}${pagina.descripcion ? ` · ${escapar(pagina.descripcion)}` : ""}</p>${!enlace ? `<p class="media-placeholder">Añade el enlace en <code>contenido.json</code></p>` : ""}</div>
    </div>`;
  }

  return `<div class="card-inner letter-card">${meta}<div class="letter-body"><p class="letter-text">${escapar(pagina.texto || pagina.titulo || "")}</p></div></div>`;
}

function nombreTipo(tipo) {
  const nombres = { foto: "Fotografía", texto: "Carta", cancion: "Canción", video: "Vídeo", audio: "Nota de voz", spotify: "Spotify", youtube: "YouTube", ubicacion: "Lugar" };
  return nombres[tipo] || "Recuerdo";
}
