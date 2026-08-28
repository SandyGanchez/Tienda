# Configuración de autenticación

La API carga automáticamente `backend/.env` al iniciar y requiere allí `JWT_SECRET`. Usa un valor largo, aleatorio y privado. Para habilitar Google también requiere `GOOGLE_CLIENT_ID`, cuyo valor debe coincidir con el OAuth Client ID Web configurado en Google Cloud. Copia `backend/.env.example` como referencia y no versiones `backend/.env` ni otros secretos.

El frontend utiliza el valor público `GOOGLE_WEB_CLIENT_ID` de `src/environments/environment*.ts`. Mientras permanezca vacío, el botón Google se muestra deshabilitado.

## Primer administrador

La tabla `empleados` está vacía y no existe autorregistro. Genera un hash sin guardar la contraseña en el código:

```powershell
$env:INITIAL_PASSWORD = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
node backend/scripts/hash-password.js
Remove-Item Env:INITIAL_PASSWORD
```

Inserta manualmente el empleado administrador usando ese hash y el `idCargo` del cargo `ADMINISTRADOR`. No guardes texto plano.

## Google Cloud

1. Crear o elegir el proyecto Google Cloud.
2. Configurar la pantalla de consentimiento OAuth.
3. Crear un OAuth Client ID Web y usarlo como `GOOGLE_CLIENT_ID` y `GOOGLE_WEB_CLIENT_ID`.
4. Crear un OAuth Client ID Android.
5. Configurar el package name `com.donapaty.tienda`.
6. Registrar el SHA-1 debug reportado por `gradlew signingReport`.
7. Registrar posteriormente el SHA-1 del certificado release.

Google no auto-registra empleados. El correo debe existir previamente y estar activo; el primer acceso verificado vincula `googleSub`.
