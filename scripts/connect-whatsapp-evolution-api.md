# Cómo conectar tu número de WhatsApp con Evolution API

Para conectar tu número de WhatsApp con Evolution API, el proceso consta de dos pasos principales utilizando las rutas de la API: **crear una instancia** y **conectar dicha instancia**. Esto generará un código QR que deberás escanear con tu aplicación de WhatsApp, o en su defecto, podrás usar un código de emparejamiento directamente con tu número.

A continuación, se detalla el proceso paso a paso usando peticiones HTTP. Puedes realizar estas peticiones desde herramientas como Postman, Insomnia o directamente mediante comandos cURL.

## Requisitos Previos

- Asegúrate de tener la API de Evolution en ejecución.
- Conoce tu **API Key Global** (esta clave se configura en el archivo `.env` bajo la variable `AUTHENTICATION_API_KEY`).
- En los ejemplos a continuación, la base de la URL es `http://localhost:8080`. Si tu API se ejecuta en otro puerto o dominio, ajusta la URL en consecuencia.

---

## Paso 1: Crear una Instancia

Una "instancia" representa la sesión de tu número de WhatsApp. Para crearla, realiza una petición `POST` al endpoint `/instance/create`.

**Petición con cURL:**

```bash
curl --request POST \
  --url http://localhost:8080/instance/create \
  --header 'apikey: TU_API_KEY_GLOBAL' \
  --header 'Content-Type: application/json' \
  --data '{
    "instanceName": "mi_numero_ws",
    "integration": "WHATSAPP-BAILEYS"
  }'
```

> **Nota:** 
> - Reemplaza `TU_API_KEY_GLOBAL` por tu clave de API.
> - `mi_numero_ws` es el nombre que identifica a esta sesión. Puedes elegir cualquier nombre.
> - `WHATSAPP-BAILEYS` es la integración estándar para vincular WhatsApp a través del teléfono (WhatsApp Web). Si utilizas la API oficial de Cloud, deberás usar `WHATSAPP-BUSINESS`.

---

## Paso 2: Conectar la Instancia (Generar QR)

Una vez creada la instancia, debes solicitar conectarla. Esta petición devuelve un código QR en formato Base64. Realiza una petición `GET` a `/instance/connect/{nombre_de_la_instancia}`.

**Petición con cURL:**

```bash
curl --request GET \
  --url http://localhost:8080/instance/connect/mi_numero_ws \
  --header 'apikey: TU_API_KEY_GLOBAL'
```

**Respuesta Esperada:**

La API te devolverá un JSON similar a este:

```json
{
  "instance": {
    "instanceName": "mi_numero_ws",
    "status": "connecting"
  },
  "qrcode": {
    "base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "code": "1@..."
  }
}
```

---

## Paso 3: Escanear el QR

Para completar la conexión, debes escanear el código QR devuelto.

1. Toma el texto contenido en el campo `base64` de la respuesta obtenida en el paso anterior.
2. Utiliza un visor en línea de Base64 a Imagen o cualquier herramienta de tu preferencia para renderizar la imagen del QR.
3. Abre WhatsApp en tu celular.
4. Dirígete a **Configuración** (o presiona los tres puntos) > **Dispositivos Vinculados**.
5. Toca en **Vincular un dispositivo** y escanea el código QR renderizado.

---

## Alternativa: Conexión por Código de Emparejamiento (Pairing Code)

Si prefieres no usar un código QR y en su lugar emplear el nuevo método de código de emparejamiento, Evolution API lo soporta nativamente.

Para ello, en el Paso 2 añade el número de WhatsApp (incluyendo el código de país y sin signos `+` o espacios) en la petición como parámetro `number`:

**Petición con cURL:**

```bash
curl --request GET \
  --url http://localhost:8080/instance/connect/mi_numero_ws?number=521XXXXXXXXXX \
  --header 'apikey: TU_API_KEY_GLOBAL'
```

Esta respuesta te devolverá un objeto con la propiedad `pairingCode` (por ejemplo: `ABCD-1234`). 

1. Recibirás una notificación en tu aplicación de WhatsApp en el celular avisando de un intento de conexión.
2. Abre la notificación e ingresa el código de 8 dígitos que te entregó la API.

**Una vez escaneado el QR o ingresado el código de emparejamiento, el estado de la instancia cambiará a `open` y tu número estará conectado correctamente a la API listo para enviar y recibir mensajes.**
