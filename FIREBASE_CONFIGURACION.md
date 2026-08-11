# Configuración rápida de Firebase

1. En **Authentication → Sign-in method**, activa **Correo/Contraseña**.
   Activa también **Anónimo** para que Aris pueda reaccionar sin ver un login.
2. En **Authentication → Users**, comprueba que existe `andrestam.97@gmail.com` con UID `KSYoyWiYB4dChzlwVFAaWIyN0YJ3`.
3. Crea **Firestore Database** y **Storage** si todavía no existen.
4. Copia las reglas de `FIREBASE_REGLAS.txt` en las secciones de reglas de Firestore y Storage y pulsa **Publicar**.
5. En **Authentication → Settings → Authorized domains**, comprueba que aparece `andytm97.github.io`.
6. Publica el proyecto en GitHub Pages y entra en `/Arisita/admin/`.

No hay que crear colecciones ni documentos manualmente. El administrador crea `recuerdos` y `configuracion` al publicar el primer contenido.
