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

const PORT = 3001;
const MQTT_URL = "mqtt://64.23.155.31:1883";
const JWT_SECRET = "TIA_PORTAL_COLONOS_2026_SECRET";
const COMMAND_PULSE_MS = 10000;

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

let bombasCaboviejo = {
  p70a: { man: 0, off: 0, auto: 0, running: 0, modoEntero: -1 },
  p70b: { man: 0, off: 0, auto: 0, running: 0, modoEntero: -1 },
  p71a: { man: 0, off: 0, auto: 0, running: 0, modoEntero: -1 },
  p71b: { man: 0, off: 0, auto: 0, running: 0, modoEntero: -1 },
};

let plantaBotones = {
  bombaA: 0,
  bombaB: 0,
  bombaC: 0,
  trenA: 0,
  trenB: 0,
  trenC: 0,
};

let guardandoHistorico = false;

/* ESTADO DE FEEDBACK / ASIGNACIÓN PARA COMANDOS */
let caboviejoFeedback = {
  p70a: {
    status: -1, // 0=off, 1=man, 2=auto
  },
};

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

/* TOPICS MQTT - ESTADO RUNNING CABO VIEJO */
const topicToKeyBombasCaboviejo = {
  Caboviejo_Bool_14: { bomba: "p70a", campo: "running" },
  Caboviejo_Bool_15: { bomba: "p70b", campo: "running" },
  Caboviejo_Bool_16: { bomba: "p71a", campo: "running" },
  Caboviejo_Bool_17: { bomba: "p71b", campo: "running" },
};

/* TOPIC MQTT - ESTADO ENTERO P70A */
const topicToKeyCaboviejoStatus = {
  Caboviejo_P70A_Int_2: { bomba: "p70a" },
};

/* COMANDOS A PLC - PRUEBA SOLO P70A */
const commandTopicCaboviejo = {
  p70a: {
    man: "R_Bool_2",
    off: "R_Bool_3",
    auto: "R_Bool_4",
  },
};

/* TOPICS PLANTA ESTADOS */
const topicToKeyPlantaBotones = {
  Planta_Bool_2: "bombaA",
  Planta_Bool_3: "bombaB",
  Planta_Bool_4: "bombaC",
  Planta_Bool_5: "trenA",
  Planta_Bool_6: "trenB",
  Planta_Bool_7: "trenC",
};

const topicsNivel = Object.keys(topicToKeyNivel);
const topicsPlc = Object.keys(topicToKeyPlc);
const topicsRuntime = Object.keys(topicToKeyRuntime);
const topicsBombasCaboviejo = Object.keys(topicToKeyBombasCaboviejo);
const topicsPlantaBotones = Object.keys(topicToKeyPlantaBotones);
const topicsCaboviejoStatus = Object.keys(topicToKeyCaboviejoStatus);

const topics = [
  ...topicsNivel,
  ...topicsPlc,
  ...topicsRuntime,
  ...topicsBombasCaboviejo,
  ...topicsPlantaBotones,
  ...topicsCaboviejoStatus,
];

const client = mqtt.connect(MQTT_URL);

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

  /* ESTADO ENTERO P70A */
  if (topicToKeyCaboviejoStatus[topic]) {
    const { bomba } = topicToKeyCaboviejoStatus[topic];
    const valor = parseInt(texto, 10);

    if (Number.isNaN(valor)) return;

    caboviejoFeedback[bomba].status = valor;

    if (!bombasCaboviejo[bomba]) {
      bombasCaboviejo[bomba] = {
        man: 0,
        off: 0,
        auto: 0,
        running: 0,
        modoEntero: -1,
      };
    }

    bombasCaboviejo[bomba].modoEntero = valor;

    // 0 = off, 1 = man, 2 = auto
    bombasCaboviejo[bomba].man = valor === 1 ? 1 : 0;
    bombasCaboviejo[bomba].off = valor === 0 ? 1 : 0;
    bombasCaboviejo[bomba].auto = valor === 2 ? 1 : 0;

    console.log(`Estado entero ${bomba}:`, valor);
    console.log("Estado visual actual:", bombasCaboviejo[bomba]);
    return;
  }

  /* BOTONES PLANTA */
  if (topicToKeyPlantaBotones[topic]) {
    const key = topicToKeyPlantaBotones[topic];

    const valorNormalizado =
      texto === "1" || texto.toLowerCase() === "true" ? 1 : 0;

    plantaBotones[key] = valorNormalizado;

    console.log(`Planta botón ${key}:`, valorNormalizado);
    return;
  }

  /* ESTADO RUNNING CABO VIEJO */
  if (topicToKeyBombasCaboviejo[topic]) {
    const { bomba, campo } = topicToKeyBombasCaboviejo[topic];

    const valorNormalizado =
      texto === "1" || texto.toLowerCase() === "true" ? 1 : 0;

    bombasCaboviejo[bomba][campo] = valorNormalizado;

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

/* GUARDAR HISTÓRICO DE NIVELES */
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
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Solo admin puede hacer esto" });
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
        return res
          .status(401)
          .json({ error: "Usuario o contraseña incorrectos" });
      }

      const valid = bcrypt.compareSync(password, user.password_hash);

      if (!valid) {
        return res
          .status(401)
          .json({ error: "Usuario o contraseña incorrectos" });
      }

      usersDb.run(
        `INSERT INTO login_logs (username, role) VALUES (?, ?)`,
        [user.username, user.role]
      );

      const token = createToken(user);

      res.json({
        ok: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
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

app.get("/api/users", verifyToken, (req, res) => {
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

  const finalRole = role === "admin" ? "admin" : "viewer";
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

app.get("/api/login-logs", verifyToken, (req, res) => {
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

/* ---------- RUTAS DE NIVELES LIBRES ---------- */

app.get("/api/niveles", (req, res) => {
  res.json({
    niveles,
    plcStatus,
    bombasCaboviejo,
    plantaBotones,
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

/* ---------- COMANDO CABO VIEJO P70A ---------- */

app.post("/api/caboviejo/comando", verifyToken, (req, res) => {
  console.log("COMANDO RECIBIDO:", req.body);
  try {
    const { bomba, modo } = req.body;

    if (bomba !== "p70a") {
      return res
        .status(400)
        .json({ error: "Por ahora solo está habilitado P70A" });
    }

    if (!["man", "off", "auto"].includes(modo)) {
      return res.status(400).json({ error: "Modo inválido" });
    }

    const topicComando = commandTopicCaboviejo[bomba]?.[modo];

    if (!topicComando) {
      return res
        .status(400)
        .json({ error: "No se encontró topic de comando" });
    }

    client.publish(topicComando, "1", { qos: 0, retain: false });
    console.log(`Pulso ON -> ${topicComando}: 1`);

    setTimeout(() => {
      client.publish(topicComando, "0", { qos: 0, retain: false });
      console.log(`Pulso OFF -> ${topicComando}: 0`);
    }, COMMAND_PULSE_MS);

    return res.json({
      ok: true,
      bomba,
      modo,
      topicComando,
      pulseMs: COMMAND_PULSE_MS,
      message: "Comando enviado correctamente",
    });
  } catch (error) {
    console.error("Error en comando Cabo Viejo:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

app.get("/api/caboviejo/feedback", verifyToken, (req, res) => {
  res.json(caboviejoFeedback);
});

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});

