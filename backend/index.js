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
const MQTT_URL = "mqtt://18.216.64.219:1883";
const JWT_SECRET = "TIA_PORTAL_COLONOS_2026_SECRET";
const HISTORICAL_TABLE = "niveles_historicos_v2";

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
  Caboviejo_Real_4: "runtime_p71a",
  Caboviejo_Real_5: "runtime_p71b",
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

  Caboviejo_Bool_8: { bomba: "p71a", campo: "man" },
  Caboviejo_Bool_9: { bomba: "p71a", campo: "off" },
  Caboviejo_Bool_10: { bomba: "p71a", campo: "auto" },
  Caboviejo_Bool_16: { bomba: "p71a", campo: "running" },

  Caboviejo_Bool_11: { bomba: "p71b", campo: "man" },
  Caboviejo_Bool_12: { bomba: "p71b", campo: "off" },
  Caboviejo_Bool_13: { bomba: "p71b", campo: "auto" },
  Caboviejo_Bool_17: { bomba: "p71b", campo: "running" },
};

// TOPICS PLANTA ESTADOS 
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

const topics = [
  ...topicsNivel,
  ...topicsPlc,
  ...topicsRuntime,
  ...topicsBombasCaboviejo,
  ...topicsPlantaBotones,
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

    /* BOTONES PLANTA */
  if (topicToKeyPlantaBotones[topic]) {
    const key = topicToKeyPlantaBotones[topic];

    const valorNormalizado =
      texto === "1" || texto.toLowerCase() === "true" ? 1 : 0;

    plantaBotones[key] = valorNormalizado;

    console.log(`Planta botón ${key}:`, valorNormalizado);
    return;
  }

    /* BOTONES Y ESTADO DE BOMBAS CABO VIEJO */
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
        return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
      }

      const valid = bcrypt.compareSync(password, user.password_hash);

      if (!valid) {
        return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
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

app.post("/api/level-config/:tankKey", verifyToken, (req, res) => {
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

/* ---------- RUTAS DE NIVELES LIBRES ---------- */
/* ESTO ES LO IMPORTANTE PARA NO ROMPER MQTT/DASHBOARD */

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
          ORDER BY fecha ASC
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

        const orderedRows = hasRange ? rows : [...rows].reverse();

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
