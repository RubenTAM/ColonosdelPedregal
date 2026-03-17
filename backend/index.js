const express = require("express");
const cors = require("cors");
const mqtt = require("mqtt");
const db = require("./database");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 3001;
const MQTT_URL = "mqtt://18.216.64.219:1883";

/* ESTADO EN MEMORIA */
let niveles = {
  planta: 0,
  cabo_viejo: 0,
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

let guardandoHistorico = false;

/* TOPICS MQTT - NIVELES */
const topicToKeyNivel = {
  Planta_Real_1: "planta",
  Caboviejo_Real_1: "cabo_viejo",
  Falcone_Real_1: "falcone",
  Cinco_Real_1: "cinco",
  Seis_Real_1: "seis",
  Marilu_Real_1: "marilu",
  Pacifico_Real_1: "pacifico",
  Cuadrada_Real_1: "cuadrada",
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
  Caboviejo_Real_4: "runtime_p71a",
  Caboviejo_Real_5: "runtime_p71b",
};

const topicsNivel = Object.keys(topicToKeyNivel);
const topicsPlc = Object.keys(topicToKeyPlc);
const topicsRuntime = Object.keys(topicToKeyRuntime);
const topics = [...topicsNivel, ...topicsPlc, ...topicsRuntime];

const client = mqtt.connect(MQTT_URL);

client.on("connect", () => {
  console.log("Conectado al broker:", MQTT_URL);

  client.subscribe(topics, (err) => {
    if (err) {
      console.log("Error al suscribirse:", err);
    } else {
      console.log("Suscrito a los topics correctamente");
      console.log(topics);
    }
  });
});

client.on("message", (topic, message) => {
  const texto = message.toString().trim();

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

    plcStatus[key] = Number.isNaN(numero) ? texto : numero;
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

/* GUARDAR SOLO LOS NIVELES CADA 10 MINUTOS */
function guardarHistorico() {
  if (guardandoHistorico) return;
  guardandoHistorico = true;

  db.run(
    `
    INSERT INTO niveles_historicos (
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
      niveles.cabo_viejo,
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
        console.log("Histórico guardado cada 10 min. ID:", this.lastID);
      }
    }
  );
}

setInterval(guardarHistorico, 600000);

/* API LIBRE, SIN USUARIOS */
app.get("/api/niveles", (req, res) => {
  res.json({
    niveles,
    plcStatus,
  });
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
      datetime(fecha, 'localtime') AS fecha
    FROM niveles_historicos
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

app.get("/api/cabo-viejo", (req, res) => {
  db.all(
    `
    SELECT
      id,
      cabo_viejo AS nivel,
      datetime(fecha, 'localtime') AS fecha
    FROM niveles_historicos
    ORDER BY id DESC
    LIMIT 50
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

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});