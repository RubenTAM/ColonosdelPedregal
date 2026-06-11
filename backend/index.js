require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mqtt = require("mqtt");
const db = require("./database");
const usersDb = require("./usersDatabase");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const PORT = 3001;
const MQTT_URL = "mqtt://157.230.49.105:1883";
const JWT_SECRET = "TIA_PORTAL_COLONOS_2026_SECRET";
const HISTORICAL_TABLE = "niveles_historicos";
const MANUAL_ACTION_WINDOW_MS = 30 * 1000;
const MAYTAPI_BASE_URL =
  process.env.MAYTAPI_BASE_URL || "https://api.maytapi.com/api";
const MAYTAPI_PRODUCT_ID = process.env.MAYTAPI_PRODUCT_ID || "";
const MAYTAPI_PHONE_ID = process.env.MAYTAPI_PHONE_ID || "";
const MAYTAPI_API_TOKEN =
  process.env.MAYTAPI_API_TOKEN || process.env.MAYTAPI_TOKEN || "";
const MAYTAPI_GROUP_NAME =
  process.env.MAYTAPI_GROUP_NAME || "Alertas Colonos del Pedregal";
let maytapiGroupId = process.env.MAYTAPI_GROUP_ID || "";
const MAYTAPI_GROUP_PARTICIPANTS = (
  process.env.MAYTAPI_GROUP_PARTICIPANTS || ""
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const DEFAULT_LEVEL_CONFIG = {
  planta: { min: 0, max: 140 },
  cabo_viejo: { min: 0, max: 140 },
  falcone: { min: 0, max: 140 },
  cinco: { min: 0, max: 140 },
  seis: { min: 0, max: 140 },
  marilu: { min: 0, max: 140 },
  pacifico: { min: 0, max: 140 },
  cuadrada: { min: 0, max: 140 },
};

/* ESTADO EN MEMORIA */
let niveles = {
  planta: 0,
  cabo_viejo: 0,
  cabo_viejo_tanques: 0,
  falcone: 0,
  cinco: 0,
  seis: 0,
  marilu: 0,
  pacifico: 0,
  cuadrada: 0,
  runtime_p70a: 0,
  runtime_p70b: 0,
  runtime_p71a: 0,
  runtime_p71b: 0,
};

let plcStatus = {
  planta: 0,
  cabo_viejo: 0,
  falcone: 0,
  cinco: 0,
  seis: 0,
  marilu: 0,
  pacifico: 0,
  cuadrada: 0,
};

const HEARTBEAT_TIMEOUT_MS = 20 * 60 * 1000;
const HEARTBEAT_CHECK_INTERVAL_MS = 5000;

let heartbeatState = Object.keys(plcStatus).reduce((acc, key) => {
  acc[key] = {
    lastValue: plcStatus[key],
    lastChangedAt: Date.now(),
    isOnline: true,
  };
  return acc;
}, {});

const heartbeatLabels = {
  planta: "Planta",
  cabo_viejo: "Cabo Viejo",
  falcone: "Falcone",
  cinco: "Cinco",
  seis: "Seis",
  marilu: "Marilu",
  pacifico: "Pacifico",
  cuadrada: "Cuadrada",
};

const heartbeatAlarmLabels = {
  ...heartbeatLabels,
  cabo_viejo: "Caboviejo",
};

const heartbeatEventZones = {
  planta: "PLANTA",
  cabo_viejo: "CABO VIEJO",
  falcone: "FALCONE",
  cinco: "CINCO",
  seis: "SEIS",
  marilu: "MARILU",
  pacifico: "PACIFICO",
  cuadrada: "CUADRADA",
};

const heartbeatAlertKeys = new Set(["planta", "cabo_viejo", "cinco"]);

let ultimasAlertasWhatsApp = [];

function registrarIntentoWhatsApp(entry) {
  ultimasAlertasWhatsApp = [
    {
      fecha: fechaLocalTijuana(),
      ...entry,
    },
    ...ultimasAlertasWhatsApp,
  ].slice(0, 20);
}

let bombasCaboviejo = {
  p70a: { man: 0, off: 0, auto: 1, running: 0 },
  p70b: { man: 0, off: 0, auto: 1, running: 0 },
  p71a: { man: 0, off: 0, auto: 1, running: 0 },
  p71b: { man: 0, off: 0, auto: 1, running: 0 },
};

let plantaBotones = {
  bombaA: 0,
  bombaB: 0,
  bombaC: 0,
  trenA: 0,
  trenB: 0,
  trenC: 0,
  bypassPlanta: 0,
  bypassCuadrada: 0,
  bypassFalcone: 0,
  bombasHabilitadas: 1,
};

let guardandoHistorico = false;
const plantaEventoPrevio = {};
const caboViejoEventoPrevio = {};

/* TOPICS MQTT - NIVELES */
const topicToKeyNivel = {
  Planta_Real_1: "planta",
  Caboviejo_Real_1: "cabo_viejo",
  Planta_Real_5: "cabo_viejo_tanques",
  Falcone_Real_1: "falcone",
  Cinco_Real_1: "cinco",
  Seis_Real_1: "seis",
  Marilu_Real_1: "marilu",
  Pacifico_Real_1: "pacifico",
  Cuadrada_Real_1: "cuadrada",
};

const HISTORICAL_TANK_COLUMNS = {
  planta: "planta",
  cabo_viejo: "cabo_viejo",
  falcone: "falcone",
  cinco: "cinco",
  seis: "seis",
  marilu: "marilu",
  pacifico: "pacifico",
  cuadrada: "cuadrada",
};


/* TOPICS MQTT - PLC STATUS / BIT DE VIDA */
const topicToKeyPlc = {
  Planta_Real_2: "planta",
  Caboviejo_Real_6: "cabo_viejo",
  Falcone_Real_2: "falcone",
  Cinco_Real_2: "cinco",
  Seis_Real_2: "seis",
  Marilu_Real_2: "marilu",
  Pacifico_Real_2: "pacifico",
  Cuadrada_Real_2: "cuadrada",
};

/* TOPICS MQTT - RUNTIME CABO VIEJO */
const topicToKeyRuntime = {
  Caboviejo_Real_2: "runtime_p70a",
  Caboviejo_Real_3: "runtime_p70b",
  Planta_Real_8: "runtime_p71a",
  Planta_Real_9: "runtime_p71b",
};

/* TOPICS MQTT - BOTONES Y ESTADO CABO VIEJO */
const topicToKeyBombasCaboviejo = {
  Caboviejo_Bool_2: { bomba: "p70a", campo: "man" },
  Caboviejo_Bool_3: { bomba: "p70a", campo: "off" },
  Caboviejo_Bool_4: { bomba: "p70a", campo: "auto" },
  Caboviejo_Bool_14: { bomba: "p70a", campo: "running" },

  Caboviejo_Bool_5: { bomba: "p70b", campo: "man" },
  Caboviejo_Bool_6: { bomba: "p70b", campo: "off" },
  Caboviejo_Bool_7: { bomba: "p70b", campo: "auto" },
  Caboviejo_Bool_15: { bomba: "p70b", campo: "running" },

  Planta_Bool_21: { bomba: "p71a", campo: "man" },
  Planta_Bool_22: { bomba: "p71a", campo: "off" },
  Planta_Bool_20: { bomba: "p71a", campo: "auto" },
  Planta_Bool_28: { bomba: "p71a", campo: "running" },

  Planta_Bool_24: { bomba: "p71b", campo: "man" },
  Planta_Bool_25: { bomba: "p71b", campo: "off" },
  Planta_Bool_23: { bomba: "p71b", campo: "auto" },
  Planta_Bool_29: { bomba: "p71b", campo: "running" },
};

const caboViejoP70AModos = {
  man: "Manual",
  off: "Apagado",
  auto: "Automatico",
};

const caboViejoBombasEventos = {
  p70a: "P70A",
  p70b: "P70B",
  p71a: "P71A",
  p71b: "P71B",
};

const caboViejoModoComandos = {
  p70a: {
    man: "cv_p70a_man",
    off: "cv_p70a_off",
    auto: "cv_p70a_auto",
  },
  p70b: {
    man: "cv_p70b_man",
    off: "cv_p70b_off",
    auto: "cv_p70b_auto",
  },
  p71a: {
    man: "R_Bool_19",
    off: "R_Bool_20",
    auto: "R_Bool_18",
  },
  p71b: {
    man: "R_Bool_22",
    off: "R_Bool_23",
    auto: "R_Bool_21",
  },
};

const caboViejoModoPendiente = {};
const caboViejoBombaPendiente = {};
const caboViejoModoTimers = {};
const plantaAccionPendiente = {};

// TOPICS PLANTA ESTADOS 
const topicToKeyPlantaBotones = {
  Planta_Bool_2: "bombaA",
  Planta_Bool_3: "bombaB",
  Planta_Bool_4: "bombaC",
  Planta_Bool_5: "trenA",
  Planta_Bool_6: "trenB",
  Planta_Bool_7: "trenC",
  Planta_Bool_8: "bombasHabilitadas",
  Planta_Bool_9: "bypassPlanta",
  Caboviejo_Bool_22: "bypassCuadrada",
  Caboviejo_Bool_23: "bypassFalcone",
};

const plantaBypassTopics = {
  set: "Planta_Bypass_S",
  reset: "Planta_Bypass_R",
};

const caboViejoBypassTopics = {
  falcone: {
    stateKey: "bypassFalcone",
    set: "cv_bypass_falcone_s",
    reset: "cv_bypass_falcone_r",
  },
  cuadrada: {
    stateKey: "bypassCuadrada",
    set: "cv_bypass_cuadrada_s",
    reset: "cv_bypass_cuadrada_r",
  },
};

const plantaBombasControlTopics = {
  set: "Planta_Bombas_Crl_S",
  reset: "Planta_Bombas_Crl_R",
};

const plantaEquipoEventos = {
  bombaA: { equipo: "Bomba A", tipo: "bomba" },
  bombaB: { equipo: "Bomba B", tipo: "bomba" },
  bombaC: { equipo: "Bomba C", tipo: "bomba" },
  trenA: { equipo: "Tren A", tipo: "tren" },
  trenB: { equipo: "Tren B", tipo: "tren" },
  trenC: { equipo: "Tren C", tipo: "tren" },
  bombasHabilitadas: {
    equipo: "Bombas",
    tipo: "control",
    estados: { 0: "deshabilitadas", 1: "habilitadas" },
  },
  bypassPlanta: {
    equipo: "Bypass Planta",
    tipo: "bypass",
    estados: { 0: "desactivado", 1: "activado" },
  },
  bypassCuadrada: {
    zona: "CABO VIEJO",
    equipo: "Bypass Cuadrada",
    tipo: "bypass",
    estados: { 0: "desactivado", 1: "activado" },
  },
  bypassFalcone: {
    zona: "CABO VIEJO",
    equipo: "Bypass Falcone",
    tipo: "bypass",
    estados: { 0: "desactivado", 1: "activado" },
  },
};

const bombaCNivelesSnapshotItems = [
  { key: "planta", configKey: "planta", label: "PLANTA" },
  { key: "cabo_viejo_tanques", configKey: "cabo_viejo", label: "CV" },
  { key: "cinco", configKey: "cinco", label: "CINCO" },
  { key: "seis", configKey: "seis", label: "SEIS" },
  { key: "cuadrada", configKey: "cuadrada", label: "CUADRA" },
  { key: "falcone", configKey: "falcone", label: "FALC" },
  { key: "marilu", configKey: "marilu", label: "MARI" },
  { key: "pacifico", configKey: "pacifico", label: "PACF" },
];

function tomarSnapshotNivelesActuales() {
  return bombaCNivelesSnapshotItems.reduce((acc, item) => {
    acc[item.key] = Number(niveles[item.key]) || 0;
    return acc;
  }, {});
}

function construirStatusNivelesBombaC(snapshot, config) {
  return bombaCNivelesSnapshotItems
    .map(({ key, configKey, label }) => {
      const tankConfig = config[configKey] || DEFAULT_LEVEL_CONFIG[configKey];
      const percentage = escalarNivel(
        snapshot[key],
        tankConfig.min,
        tankConfig.max
      );

      return `[${label}]: ${formatearNumero(percentage, 0)}%`;
    })
    .join(" ");
}

function registrarAccionPendiente(mapa, key, username, targetState = null) {
  if (!key || !username) return;

  mapa[key] = {
    username,
    targetState,
    expiresAt: Date.now() + MANUAL_ACTION_WINDOW_MS,
  };
}

function limpiarAccionPendiente(mapa, key) {
  delete mapa[key];
}

function consumirAccionPendiente(mapa, key, valorNuevo = null) {
  const pendiente = mapa[key];
  if (!pendiente) return "";

  if (pendiente.expiresAt <= Date.now()) {
    delete mapa[key];
    return "";
  }

  if (
    pendiente.targetState !== null &&
    valorNuevo !== null &&
    Number(pendiente.targetState) !== Number(valorNuevo)
  ) {
    return "";
  }

  delete mapa[key];
  return pendiente.username || "";
}

async function procesarEventoPlanta(key, valorAnterior, valorNuevo) {
  const configEvento = plantaEquipoEventos[key];

  if (!configEvento || Number(valorAnterior) === Number(valorNuevo)) return;

  const estado = Number(valorNuevo) === 1 ? "encendido" : "apagado";
  const estadoMensaje = configEvento.estados?.[Number(valorNuevo)] || estado;
  let mensaje = `${configEvento.equipo} ${estadoMensaje}`;
  const modificadoPor = consumirAccionPendiente(
    plantaAccionPendiente,
    key,
    valorNuevo
  );

  if (key === "bombaC" && Number(valorNuevo) === 0) {
    const snapshotNiveles = tomarSnapshotNivelesActuales();
    const config = await obtenerLevelConfig();
    const statusNiveles = construirStatusNivelesBombaC(snapshotNiveles, config);
    mensaje = `${configEvento.equipo} apagada : STATUS => ${statusNiveles}`;
  }

  guardarEventoSistema({
    zona: configEvento.zona || "PLANTA",
    equipo: configEvento.equipo,
    tipo: configEvento.tipo,
    estado,
    mensaje,
    modificadoPor,
  });
}

function fechaLocalTijuana() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Tijuana",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function obtenerHoraLocal(fecha) {
  return String(fecha || "").split(" ")[1] || fecha;
}

function obtenerLevelConfig() {
  return new Promise((resolve) => {
    db.all(
      `
      SELECT tank_key, min, max
      FROM level_config
      `,
      [],
      (err, rows) => {
        const config = { ...DEFAULT_LEVEL_CONFIG };

        if (err) {
          console.error("Error al cargar config de niveles:", err.message);
          resolve(config);
          return;
        }

        rows.forEach((row) => {
          config[row.tank_key] = {
            min: Number(row.min),
            max: Number(row.max),
          };
        });

        resolve(config);
      }
    );
  });
}

function escalarNivel(valor, min, max) {
  const value = Number(valor);
  const minNum = Number(min);
  const maxNum = Number(max);

  if (Number.isNaN(value) || Number.isNaN(minNum) || Number.isNaN(maxNum)) {
    return 0;
  }

  if (maxNum === minNum) return 0;

  const percentage = ((value - minNum) / (maxNum - minNum)) * 100;
  return Math.max(0, Math.min(100, percentage));
}

function formatearNumero(value, decimals = 1) {
  const number = Number(value);
  if (Number.isNaN(number)) return "0";
  return number.toFixed(decimals);
}

function obtenerFaltantesMaytapi(requireGroup = true) {
  const faltantes = [];

  if (!MAYTAPI_PRODUCT_ID) faltantes.push("MAYTAPI_PRODUCT_ID");
  if (!MAYTAPI_PHONE_ID) faltantes.push("MAYTAPI_PHONE_ID");
  if (!MAYTAPI_API_TOKEN) faltantes.push("MAYTAPI_API_TOKEN");
  if (requireGroup && !maytapiGroupId) faltantes.push("MAYTAPI_GROUP_ID");

  return faltantes;
}

function maytapiConfigurado(requireGroup = true) {
  return obtenerFaltantesMaytapi(requireGroup).length === 0;
}

function construirMaytapiPath(path) {
  const base = MAYTAPI_BASE_URL.replace(/\/+$/, "");
  const productId = encodeURIComponent(MAYTAPI_PRODUCT_ID);

  return `${base}/${productId}${path}`;
}

async function enviarMaytapi(path, options = {}) {
  const response = await fetch(construirMaytapiPath(path), {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "x-maytapi-key": MAYTAPI_API_TOKEN,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const responseText = await response.text();
  let data = null;

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }
  }

  if (!response.ok || data?.success === false) {
    const message =
      data?.message ||
      data?.error ||
      data?.raw ||
      `Maytapi respondio con HTTP ${response.status}`;
    throw new Error(message);
  }

  return data || {};
}

function resolverGrupoMaytapiId(data) {
  return (
    data?.data?.id ||
    data?.data?.conversation_id ||
    data?.data?.chatId ||
    data?.id ||
    data?.conversation_id ||
    data?.chatId ||
    ""
  );
}

async function crearGrupoMaytapi({ name, participants }) {
  const faltantes = obtenerFaltantesMaytapi(false);

  if (faltantes.length > 0) {
    throw new Error(`Maytapi no configurado: ${faltantes.join(", ")}`);
  }

  const participantes = Array.isArray(participants)
    ? participants.map((value) => String(value).trim()).filter(Boolean)
    : [];

  if (participantes.length === 0) {
    throw new Error("Debes indicar participantes para crear el grupo");
  }

  const phoneId = encodeURIComponent(MAYTAPI_PHONE_ID);
  const data = await enviarMaytapi(`/${phoneId}/createGroup`, {
    method: "POST",
    body: {
      subject: name || MAYTAPI_GROUP_NAME,
      participants: participantes,
    },
  });
  const groupId = resolverGrupoMaytapiId(data);

  if (groupId) {
    maytapiGroupId = groupId;
  }

  return {
    ...data,
    groupId,
  };
}

async function listarGruposMaytapi() {
  const faltantes = obtenerFaltantesMaytapi(false);

  if (faltantes.length > 0) {
    throw new Error(`Maytapi no configurado: ${faltantes.join(", ")}`);
  }

  const phoneId = encodeURIComponent(MAYTAPI_PHONE_ID);
  return enviarMaytapi(`/${phoneId}/getGroups?sort=true&invite=true`);
}

function registrarCambioHeartbeat(key, value) {
  if (!heartbeatState[key]) {
    heartbeatState[key] = {
      lastValue: value,
      lastChangedAt: Date.now(),
      isOnline: true,
    };
    return;
  }

  if (Number(heartbeatState[key].lastValue) !== Number(value)) {
    heartbeatState[key].lastValue = value;
    heartbeatState[key].lastChangedAt = Date.now();
  }
}

async function enviarWhatsAppAlerta(mensaje) {
  const faltantes = obtenerFaltantesMaytapi(true);

  if (faltantes.length > 0) {
    console.log("Maytapi no configurado. Alerta omitida:", mensaje);
    registrarIntentoWhatsApp({
      ok: false,
      mensaje,
      proveedor: "maytapi",
      error: `Maytapi no configurado: ${faltantes.join(", ")}`,
    });
    return;
  }

  try {
    const phoneId = encodeURIComponent(MAYTAPI_PHONE_ID);
    const result = await enviarMaytapi(`/${phoneId}/sendMessage`, {
      method: "POST",
      body: {
        to_number: maytapiGroupId,
        type: "text",
        message: mensaje,
        skip_filter: true,
      },
    });

    console.log(`WhatsApp enviado al grupo ${maytapiGroupId}: ${mensaje}`);
    registrarIntentoWhatsApp({
      ok: true,
      mensaje,
      proveedor: "maytapi",
      groupId: maytapiGroupId,
      chatId: result?.data?.chatId,
      msgId: result?.data?.msgId,
    });
  } catch (error) {
    console.error("Error enviando WhatsApp por Maytapi:", error.message);
    registrarIntentoWhatsApp({
      ok: false,
      mensaje,
      proveedor: "maytapi",
      groupId: maytapiGroupId,
      error: error.message,
    });
  }
}

function guardarAlarmaSistema({ zonaKey, zona, tipo, mensaje, fecha }) {
  db.run(
    `
    INSERT INTO alarmas
      (zona_key, zona, tipo, mensaje, fecha)
    VALUES (?, ?, ?, ?, ?)
    `,
    [zonaKey, zona, tipo, mensaje, fecha],
    (err) => {
      if (err) {
        console.error("Error al guardar alarma:", err.message);
      } else {
        console.log("Alarma guardada:", mensaje);
      }
    }
  );
}

function registrarAlarmaDesconexion(key) {
  const fecha = fechaLocalTijuana();
  const zona = heartbeatAlarmLabels[key] || heartbeatLabels[key] || key;
  const mensaje = `Desconexion de "${zona}" a las ${obtenerHoraLocal(fecha)}`;

  guardarAlarmaSistema({
    zonaKey: key,
    zona,
    tipo: "desconexion",
    mensaje,
    fecha,
  });

  guardarEventoSistema({
    zona: heartbeatEventZones[key] || String(zona).toUpperCase(),
    equipo: zona,
    tipo: "alarma",
    estado: "desconexion",
    mensaje,
    fecha,
  });

  return mensaje;
}

function revisarHeartbeatsYAlertas() {
  const now = Date.now();

  Object.keys(plcStatus).forEach((key) => {
    const state = heartbeatState[key];
    if (!state) return;

    const elapsedMs = Math.max(0, now - Number(state.lastChangedAt || now));
    const isOnline = elapsedMs < HEARTBEAT_TIMEOUT_MS;

    if (state.isOnline === isOnline) return;

    state.isOnline = isOnline;

    if (isOnline) return;

    const mensaje = registrarAlarmaDesconexion(key);

    if (!heartbeatAlertKeys.has(key)) return;

    void enviarWhatsAppAlerta(mensaje);
  });
}

function construirHeartbeatStatus() {
  const now = Date.now();

  return Object.keys(plcStatus).reduce((acc, key) => {
    const state = heartbeatState[key] || {
      lastValue: plcStatus[key],
      lastChangedAt: now,
    };
    const elapsedMs = Math.max(0, now - Number(state.lastChangedAt || now));
    const remainingMs = Math.max(0, HEARTBEAT_TIMEOUT_MS - elapsedMs);

    acc[key] = {
      currentValue: plcStatus[key],
      lastValue: state.lastValue,
      lastChangedAt: state.lastChangedAt,
      elapsedMs,
      remainingMs,
      timeoutMs: HEARTBEAT_TIMEOUT_MS,
      isOnline:
        typeof state.isOnline === "boolean"
          ? state.isOnline
          : elapsedMs < HEARTBEAT_TIMEOUT_MS,
    };

    return acc;
  }, {});
}

function guardarEventoSistema({
  zona,
  equipo,
  tipo,
  estado,
  mensaje,
  modificadoPor = "",
  fecha = fechaLocalTijuana(),
}) {
  db.run(
    `
    INSERT INTO eventos_sistema
      (zona, equipo, tipo, estado, mensaje, modificado_por, fecha)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [zona, equipo, tipo, estado, mensaje, modificadoPor || "", fecha],
    (err) => {
      if (err) {
        console.error("Error al guardar evento:", err.message);
      } else {
        console.log("Evento guardado:", mensaje);
      }
    }
  );
}

function limpiarComandoBombaCaboviejo(bomba) {
  const timer = caboViejoModoTimers[bomba];
  if (!timer) return;

  clearInterval(timer.intervalId);
  clearTimeout(timer.timeoutId);

  if (timer.topic && client.connected) {
    client.publish(timer.topic, "0");
  }

  delete caboViejoModoTimers[bomba];
}

function sostenerComandoBombaCaboviejo(bomba, topic) {
  limpiarComandoBombaCaboviejo(bomba);

  const intervalId = setInterval(() => {
    if (!client.connected) return;
    client.publish(topic, "1");
  }, 700);

  const timeoutId = setTimeout(() => {
    clearInterval(intervalId);

    if (client.connected) {
      client.publish(topic, "0");
    }

    delete caboViejoModoTimers[bomba];
  }, 10000);

  caboViejoModoTimers[bomba] = {
    topic,
    intervalId,
    timeoutId,
  };
}

const topicsNivel = Object.keys(topicToKeyNivel);
const topicsPlc = Object.keys(topicToKeyPlc);
const topicsRuntime = Object.keys(topicToKeyRuntime);
const topicsBombasCaboviejo = Object.keys(topicToKeyBombasCaboviejo);
const topicsPlantaBotones = Object.keys(topicToKeyPlantaBotones);

const topics = [
  ...topicsNivel,
  ...topicsPlc,
  ...topicsRuntime,
  ...topicsBombasCaboviejo,
  ...topicsPlantaBotones,
];

const client = mqtt.connect(MQTT_URL);

setInterval(revisarHeartbeatsYAlertas, HEARTBEAT_CHECK_INTERVAL_MS);

client.on("connect", () => {
  console.log("Conectado al broker:", MQTT_URL);

  client.subscribe(topics, (err) => {
    if (err) {
      console.log("Error al suscribirse:", err);
    } else {
      console.log("Suscrito a los topics correctamente");
      console.log("TOPICS:");
      console.log(topics);
    }
  });
});

client.on("message", (topic, message) => {
  const texto = message.toString().trim();

    /* BOTONES PLANTA */
  if (topicToKeyPlantaBotones[topic]) {
    const key = topicToKeyPlantaBotones[topic];

    const valorNormalizado =
      texto === "1" || texto.toLowerCase() === "true" ? 1 : 0;

    const valorAnterior =
      Object.prototype.hasOwnProperty.call(plantaEventoPrevio, key)
        ? plantaEventoPrevio[key]
        : plantaBotones[key];

    plantaBotones[key] = valorNormalizado;
    plantaEventoPrevio[key] = valorNormalizado;

    void procesarEventoPlanta(key, valorAnterior, valorNormalizado);

    console.log(`Planta botón ${key}:`, valorNormalizado);
    return;
  }

    /* BOTONES Y ESTADO DE BOMBAS CABO VIEJO */
  if (topicToKeyBombasCaboviejo[topic]) {
    const { bomba, campo } = topicToKeyBombasCaboviejo[topic];

    const valorNormalizado =
      texto === "1" || texto.toLowerCase() === "true" ? 1 : 0;

    const valorAnterior = caboViejoEventoPrevio[`${bomba}.${campo}`];
    bombasCaboviejo[bomba][campo] = valorNormalizado;
    caboViejoEventoPrevio[`${bomba}.${campo}`] = valorNormalizado;

    if (
      campo === "running" &&
      typeof valorAnterior !== "undefined" &&
      Number(valorAnterior) !== valorNormalizado
    ) {
      const equipo = caboViejoBombasEventos[bomba];
      const estado = valorNormalizado === 1 ? "encendido" : "apagado";
      const accion = valorNormalizado === 1 ? "Encendida" : "Apagada";
      const mensaje = `${equipo} ${accion}`;
      const modificadoPor = consumirAccionPendiente(
        caboViejoBombaPendiente,
        bomba
      );

      guardarEventoSistema({
        zona: "CABO VIEJO",
        equipo,
        tipo: "bomba",
        estado,
        mensaje,
        modificadoPor,
      });
    }

    if (
      caboViejoP70AModos[campo] &&
      valorNormalizado === 1 &&
      typeof valorAnterior !== "undefined" &&
      Number(valorAnterior) !== 1
    ) {
      const equipo = caboViejoBombasEventos[bomba];
      const modo = caboViejoP70AModos[campo];
      const pendienteKey = `${bomba}.${campo}`;
      const mensaje = `${equipo} puesta en modo ${modo}`;
      const modificadoPor =
        consumirAccionPendiente(caboViejoModoPendiente, pendienteKey, 1) ||
        consumirAccionPendiente(caboViejoBombaPendiente, bomba);

      guardarEventoSistema({
        zona: "CABO VIEJO",
        equipo,
        tipo: "bomba",
        estado: campo,
        mensaje,
        modificadoPor,
      });
    }

    console.log(`Bomba ${bomba} - ${campo}:`, valorNormalizado);
    return;
  }

  /* NIVELES */
  if (topicToKeyNivel[topic]) {
    const valor = parseFloat(texto);
    if (isNaN(valor)) return;

    const key = topicToKeyNivel[topic];
    niveles[key] = valor;
    console.log(`Nivel ${key}:`, valor);
    return;
  }

  /* PLC STATUS / BIT DE VIDA */
  if (topicToKeyPlc[topic]) {
    const key = topicToKeyPlc[topic];
    const numero = Number(texto);
    const valorPlc = Number.isNaN(numero) ? texto : numero;

    plcStatus[key] = valorPlc;
    registrarCambioHeartbeat(key, valorPlc);
    console.log(`PLC status ${key}:`, plcStatus[key]);
    return;
  }

  /* RUNTIME CABO VIEJO */
  if (topicToKeyRuntime[topic]) {
    const valor = parseFloat(texto);
    if (isNaN(valor)) return;

    const key = topicToKeyRuntime[topic];
    niveles[key] = valor;
    console.log(`${key}:`, valor);
  }
});

/* GUARDAR HISTÓRICO DE NIVELES */
function guardarHistorico() {
  if (guardandoHistorico) return;
  guardandoHistorico = true;

  db.run(
    `
    INSERT INTO ${HISTORICAL_TABLE} (
      planta,
      cabo_viejo,
      falcone,
      cinco,
      seis,
      marilu,
      pacifico,
      cuadrada
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        niveles.planta,
        niveles.cabo_viejo_tanques,
        niveles.falcone,
        niveles.cinco,
        niveles.seis,
        niveles.marilu,
      niveles.pacifico,
      niveles.cuadrada,
    ],
    function (err) {
      guardandoHistorico = false;

      if (err) {
        console.error("Error al guardar histórico:", err.message);
      } else {
        console.log("Histórico guardado. ID:", this.lastID);
      }
    }
  );
}

setTimeout(guardarHistorico, 1500);
setInterval(guardarHistorico, 600000);

/* ---------- AUTH USERS ---------- */

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido" });
  }
}

function onlyAdmin(req, res, next) {
  if (req.user.username !== "admin" || req.user.role !== "admin") {
    return res.status(403).json({ error: "Solo admin puede hacer esto" });
  }
  next();
}

function canOperate(req, res, next) {
  const isAdminUser = req.user.username === "admin" && req.user.role === "admin";
  const isMaintenanceUser = req.user.role === "mantenimiento";

  if (!isAdminUser && !isMaintenanceUser) {
    return res.status(403).json({ error: "No tienes permiso para modificar" });
  }
  next();
}

/* LOGIN */
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;

  usersDb.get(
    `SELECT * FROM users WHERE username = ?`,
    [username],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!user) {
        return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
      }

      const valid = bcrypt.compareSync(password, user.password_hash);

      if (!valid) {
        return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
      }

      usersDb.run(
        `INSERT INTO login_logs (username, role) VALUES (?, ?)`,
        [
          user.username,
          user.username === "admin"
            ? "admin"
            : user.role === "mantenimiento"
              ? "mantenimiento"
              : "viewer",
        ]
      );

      const normalizedUser = {
        ...user,
        role:
          user.username === "admin"
            ? "admin"
            : user.role === "mantenimiento"
              ? "mantenimiento"
              : "viewer",
      };

      const token = createToken(normalizedUser);

      res.json({
        ok: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          role: normalizedUser.role,
        },
      });
    }
  );
});

app.get("/api/auth/me", verifyToken, (req, res) => {
  res.json({
    ok: true,
    user: req.user,
  });
});

app.get("/api/users", verifyToken, onlyAdmin, (req, res) => {
  usersDb.all(
    `SELECT id, username, role, created_at FROM users ORDER BY id DESC`,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

app.post("/api/users", verifyToken, onlyAdmin, (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Completa usuario y contraseña" });
  }

  const requestedRole = String(role || "").trim().toLowerCase();
  const finalRole = ["mantenimiento", "mtto"].includes(requestedRole)
    ? "mantenimiento"
    : "viewer";
  const hash = bcrypt.hashSync(password, 10);

  usersDb.run(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
    [username.trim(), hash, finalRole],
    function (err) {
      if (err) {
        if (err.message.includes("UNIQUE")) {
          return res.status(400).json({ error: "Ese usuario ya existe" });
        }
        return res.status(500).json({ error: err.message });
      }

      res.json({
        ok: true,
        id: this.lastID,
        message: "Usuario creado correctamente",
      });
    }
  );
});

app.delete("/api/users/:id", verifyToken, onlyAdmin, (req, res) => {
  const userId = Number(req.params.id);

  usersDb.get(`SELECT * FROM users WHERE id = ?`, [userId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!row) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    if (row.username === "admin") {
      return res.status(400).json({ error: "No se puede eliminar admin" });
    }

    usersDb.run(`DELETE FROM users WHERE id = ?`, [userId], function (deleteErr) {
      if (deleteErr) {
        return res.status(500).json({ error: deleteErr.message });
      }

      res.json({ ok: true, message: "Usuario eliminado" });
    });
  });
});

app.get("/api/login-logs", verifyToken, onlyAdmin, (req, res) => {
  usersDb.all(
    `SELECT id, username, role, datetime(login_time, 'localtime') AS login_time
     FROM login_logs
     ORDER BY id DESC
     LIMIT 100`,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

app.get("/api/level-config", verifyToken, (req, res) => {
  db.all(
    `
    SELECT tank_key, min, max
    FROM level_config
    `,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const config = { ...DEFAULT_LEVEL_CONFIG };

      rows.forEach((row) => {
        config[row.tank_key] = {
          min: Number(row.min),
          max: Number(row.max),
        };
      });

      res.json({ config });
    }
  );
});

app.post("/api/level-config/:tankKey", verifyToken, canOperate, (req, res) => {
  const tankKey = String(req.params.tankKey || "").trim().toLowerCase();
  const defaults = DEFAULT_LEVEL_CONFIG[tankKey];

  if (!defaults) {
    return res.status(400).json({ error: "Tanque no valido" });
  }

  const min = Number(req.body.min);
  const max = Number(req.body.max);

  if (Number.isNaN(min) || Number.isNaN(max)) {
    return res.status(400).json({ error: "Min y max deben ser numericos" });
  }

  db.run(
    `
    INSERT INTO level_config (tank_key, min, max, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(tank_key) DO UPDATE SET
      min = excluded.min,
      max = excluded.max,
      updated_at = CURRENT_TIMESTAMP
    `,
    [tankKey, min, max],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json({
        ok: true,
        config: {
          tankKey,
          min,
          max,
        },
      });
    }
  );
});

app.post("/api/cabo-viejo/bombas/:bomba/mode", verifyToken, canOperate, (req, res) => {
  const bomba = String(req.params.bomba || "").trim().toLowerCase();
  const modo = String(req.body.mode || "").trim().toLowerCase();
  const topic = caboViejoModoComandos[bomba]?.[modo];
  const equipo = caboViejoBombasEventos[bomba];

  if (!topic || !equipo) {
    return res.status(400).json({ error: "Bomba o modo no valido" });
  }

  if (!client.connected) {
    return res.status(503).json({ error: "MQTT no conectado" });
  }

  const pendienteKey = `${bomba}.${modo}`;
  registrarAccionPendiente(
    caboViejoModoPendiente,
    pendienteKey,
    req.user.username,
    1
  );
  registrarAccionPendiente(caboViejoBombaPendiente, bomba, req.user.username);

  client.publish(topic, "1", (err) => {
    if (err) {
      limpiarAccionPendiente(caboViejoModoPendiente, pendienteKey);
      limpiarAccionPendiente(caboViejoBombaPendiente, bomba);
      return res.status(500).json({ error: "No se pudo enviar al PLC" });
    }

    sostenerComandoBombaCaboviejo(bomba, topic);

    res.json({
      ok: true,
      bomba,
      modo,
      topic,
      usuario: req.user.username,
    });
  });
});

app.post("/api/planta/bypass-toggle", verifyToken, canOperate, (req, res) => {
  if (!client.connected) {
    return res.status(503).json({ error: "MQTT no conectado" });
  }

  const bypassActivo = Number(plantaBotones.bypassPlanta) === 1;
  const targetState = bypassActivo ? 0 : 1;
  const topic = bypassActivo ? plantaBypassTopics.reset : plantaBypassTopics.set;

  registrarAccionPendiente(
    plantaAccionPendiente,
    "bypassPlanta",
    req.user.username,
    targetState
  );

  client.publish(topic, "1", (err) => {
    if (err) {
      limpiarAccionPendiente(plantaAccionPendiente, "bypassPlanta");
      return res.status(500).json({ error: "No se pudo enviar al PLC" });
    }

    res.json({
      ok: true,
      topic,
      targetState,
      usuario: req.user.username,
    });
  });
});

app.post("/api/cabo-viejo/bypass/:target/toggle", verifyToken, canOperate, (req, res) => {
  const target = String(req.params.target || "").trim().toLowerCase();
  const config = caboViejoBypassTopics[target];

  if (!config) {
    return res.status(400).json({ error: "Bypass no valido" });
  }

  if (!client.connected) {
    return res.status(503).json({ error: "MQTT no conectado" });
  }

  const bypassActivo = Number(plantaBotones[config.stateKey]) === 1;
  const targetState = bypassActivo ? 0 : 1;
  const topic = bypassActivo ? config.reset : config.set;

  registrarAccionPendiente(
    plantaAccionPendiente,
    config.stateKey,
    req.user.username,
    targetState
  );

  client.publish(topic, "1", (err) => {
    if (err) {
      limpiarAccionPendiente(plantaAccionPendiente, config.stateKey);
      return res.status(500).json({ error: "No se pudo enviar al PLC" });
    }

    res.json({
      ok: true,
      target,
      topic,
      targetState,
      usuario: req.user.username,
    });
  });
});

app.post("/api/planta/bombas-toggle", verifyToken, canOperate, (req, res) => {
  if (!client.connected) {
    return res.status(503).json({ error: "MQTT no conectado" });
  }

  const bombasHabilitadas = Number(plantaBotones.bombasHabilitadas) === 1;
  const targetState = bombasHabilitadas ? 0 : 1;
  const topic = bombasHabilitadas
    ? plantaBombasControlTopics.reset
    : plantaBombasControlTopics.set;

  registrarAccionPendiente(
    plantaAccionPendiente,
    "bombasHabilitadas",
    req.user.username,
    targetState
  );

  client.publish(topic, "1", (err) => {
    if (err) {
      limpiarAccionPendiente(plantaAccionPendiente, "bombasHabilitadas");
      return res.status(500).json({ error: "No se pudo enviar al PLC" });
    }

    res.json({
      ok: true,
      topic,
      targetState,
      usuario: req.user.username,
    });
  });
});

/* ---------- RUTAS DE NIVELES LIBRES ---------- */
/* ESTO ES LO IMPORTANTE PARA NO ROMPER MQTT/DASHBOARD */

app.get("/api/niveles", (req, res) => {
  res.json({
    niveles,
    plcStatus,
    heartbeatStatus: construirHeartbeatStatus(),
    alertasWhatsApp: ultimasAlertasWhatsApp,
    maytapi: {
      configured: maytapiConfigurado(true),
      faltantes: obtenerFaltantesMaytapi(true),
      groupId: maytapiGroupId,
      groupName: MAYTAPI_GROUP_NAME,
      alertKeys: Array.from(heartbeatAlertKeys),
    },
    bombasCaboviejo,
    plantaBotones,
  });
});

app.get("/api/alarmas", verifyToken, (req, res) => {
  const start = String(req.query.start || "").trim();
  const end = String(req.query.end || "").trim();
  const zonaKey = String(req.query.zonaKey || "").trim().toLowerCase();
  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), 300)
      : 50;
  const params = [];
  const whereParts = [];

  if (zonaKey && zonaKey !== "todos") {
    whereParts.push("zona_key = ?");
    params.push(zonaKey);
  }

  if (start) {
    whereParts.push("fecha >= ?");
    params.push(start);
  }

  if (end) {
    whereParts.push("fecha <= ?");
    params.push(end);
  }

  const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  db.all(
    `
    SELECT
      id,
      zona_key AS zonaKey,
      zona,
      tipo,
      mensaje,
      fecha
    FROM alarmas
    ${where}
    ORDER BY fecha DESC, id DESC
    LIMIT ?
    `,
    [...params, limit],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json({ rows });
    }
  );
});

app.get("/api/maytapi/groups", verifyToken, onlyAdmin, async (req, res) => {
  try {
    const data = await listarGruposMaytapi();
    res.json({
      ok: true,
      configured: maytapiConfigurado(true),
      currentGroupId: maytapiGroupId,
      data,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/maytapi/group", verifyToken, onlyAdmin, async (req, res) => {
  try {
    const participantes = Array.isArray(req.body.participants)
      ? req.body.participants
      : MAYTAPI_GROUP_PARTICIPANTS;
    const data = await crearGrupoMaytapi({
      name: req.body.name || MAYTAPI_GROUP_NAME,
      participants: participantes,
    });

    res.json({
      ok: true,
      groupId: maytapiGroupId,
      data,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/eventos", verifyToken, (req, res) => {
  const zona = String(req.query.zona || "todos").trim().toUpperCase();
  const start = String(req.query.start || "").trim();
  const end = String(req.query.end || "").trim();
  const params = [];
  const whereParts = [];

  if (zona && zona !== "TODOS") {
    whereParts.push("zona = ?");
    params.push(zona);
  }

  if (start) {
    whereParts.push("fecha >= ?");
    params.push(start);
  }

  if (end) {
    whereParts.push("fecha <= ?");
    params.push(end);
  }

  const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  db.all(
    `
    SELECT
      id,
      zona,
      equipo,
      tipo,
      estado,
      mensaje,
      modificado_por AS modificadoPor,
      fecha
    FROM eventos_sistema
    ${where}
    ORDER BY fecha DESC, id DESC
    LIMIT 300
    `,
    params,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json({ rows });
    }
  );
});

app.get("/api/historico", (req, res) => {
  db.all(
    `
    SELECT
      id,
      planta,
      cabo_viejo,
      falcone,
      cinco,
      seis,
      marilu,
      pacifico,
      cuadrada,
      fecha
    FROM ${HISTORICAL_TABLE}
    ORDER BY id DESC
    LIMIT 100
    `,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

app.get("/api/historico/:tankKey", (req, res) => {
  const tankKey = String(req.params.tankKey || "").trim().toLowerCase();
  const column = HISTORICAL_TANK_COLUMNS[tankKey];
  const start = String(req.query.start || "").trim();
  const end = String(req.query.end || "").trim();

  if (!column) {
    return res.status(400).json({ error: "Tanque no valido" });
  }

  db.get(
    `
    SELECT
      MIN(fecha) AS minFecha,
      MAX(fecha) AS maxFecha
    FROM ${HISTORICAL_TABLE}
    `,
    [],
    (metaErr, metaRow) => {
      if (metaErr) {
        return res.status(500).json({ error: metaErr.message });
      }

      const hasRange = start && end;
      const sql = hasRange
        ? `
          SELECT
            id,
            ${column} AS nivel,
            fecha
          FROM ${HISTORICAL_TABLE}
          WHERE fecha > ? AND fecha <= ?
          ORDER BY fecha DESC
          LIMIT 72
        `
        : `
          SELECT
            id,
            ${column} AS nivel,
            fecha
          FROM ${HISTORICAL_TABLE}
          ORDER BY fecha DESC
          LIMIT 72
        `;

      const params = hasRange ? [start, end] : [];

      db.all(sql, params, (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const orderedRows = [...rows].reverse();

        res.json({
          rows: orderedRows,
          range: {
            start: orderedRows[0]?.fecha || null,
            end: orderedRows[orderedRows.length - 1]?.fecha || null,
            min: metaRow?.minFecha || null,
            max: metaRow?.maxFecha || null,
          },
        });
      });
    }
  );
});

app.get("/api/historico-query", verifyToken, (req, res) => {
  const tankKey = String(req.query.tankKey || "").trim().toLowerCase();
  const start = String(req.query.start || "").trim();
  const end = String(req.query.end || "").trim();
  const column = HISTORICAL_TANK_COLUMNS[tankKey];

  if (!column) {
    return res.status(400).json({ error: "Tanque no valido" });
  }

  if (!start || !end) {
    return res.status(400).json({ error: "Debes indicar fecha inicial y final" });
  }

  db.all(
    `
    SELECT
      id,
      ${column} AS nivel,
      fecha
    FROM ${HISTORICAL_TABLE}
    WHERE fecha >= ? AND fecha <= ?
    ORDER BY fecha ASC
    LIMIT 1000
    `,
    [start, end],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ rows });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});
