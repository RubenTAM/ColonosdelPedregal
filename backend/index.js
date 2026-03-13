const express = require("express");
const cors = require("cors");
const mqtt = require("mqtt");
const db = require("./database");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 3001;
const MQTT_URL = "mqtt://18.216.64.219:1883";
const JWT_SECRET = "CAMBIA_ESTA_LLAVE_POR_UNA_MAS_SEGURA_2026";

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

/* MQTT */
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

const topicToKeyRuntime = {
  Caboviejo_Real_2: "runtime_p70a",
  Caboviejo_Real_3: "runtime_p70b",
  Caboviejo_Real_4: "runtime_p71a",
  Caboviejo_Real_5: "runtime_p71b",
};

const topics = [
  ...Object.keys(topicToKeyNivel),
  ...Object.keys(topicToKeyPlc),
  ...Object.keys(topicToKeyRuntime),
];

const client = mqtt.connect(MQTT_URL);

client.on("connect", () => {
  console.log("Conectado al broker:", MQTT_URL);

  client.subscribe(topics, (err) => {
    if (err) {
      console.log("Error al suscribirse:", err);
    } else {
      console.log("Suscrito a los topics correctamente");
    }
  });
});

client.on("message", (topic, message) => {
  const texto = message.toString().trim();

  if (topicToKeyNivel[topic]) {
    const valor = parseFloat(texto);
    if (isNaN(valor)) return;
    niveles[topicToKeyNivel[topic]] = valor;
    return;
  }

  if (topicToKeyPlc[topic]) {
    const numero = Number(texto);
    plcStatus[topicToKeyPlc[topic]] = Number.isNaN(numero) ? texto : numero;
    return;
  }

  if (topicToKeyRuntime[topic]) {
    const valor = parseFloat(texto);
    if (isNaN(valor)) return;
    niveles[topicToKeyRuntime[topic]] = valor;
  }
});

/* HELPERS AUTH */
function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    ""
  );
}

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

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

function adminRequired(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Solo admin puede realizar esta acción" });
  }
  next();
}

/* HISTÓRICO */
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

/* AUTH */
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const ip = getClientIp(req);

  if (!username || !password) {
    return res.status(400).json({ error: "Usuario y contraseña son obligatorios" });
  }

  db.get(
    `SELECT id, username, password_hash, role FROM users WHERE username = ?`,
    [username],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!user) {
        db.run(
          `INSERT INTO login_logs (username, role, success, ip) VALUES (?, ?, ?, ?)`,
          [username, null, 0, ip]
        );
        return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
      }

      const ok = bcrypt.compareSync(password, user.password_hash);

      db.run(
        `INSERT INTO login_logs (username, role, success, ip) VALUES (?, ?, ?, ?)`,
        [username, user.role, ok ? 1 : 0, ip]
      );

      if (!ok) {
        return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
      }

      const token = createToken(user);

      res.json({
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

app.get("/api/auth/me", authRequired, (req, res) => {
  res.json({ user: req.user });
});

/* DATOS DEL DASHBOARD */
app.get("/api/niveles", authRequired, (req, res) => {
  res.json({
    niveles,
    plcStatus,
  });
});

app.get("/api/historico", authRequired, (req, res) => {
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
      datetime(created_at, 'localtime') AS fecha
    FROM (
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
        fecha AS created_at
      FROM niveles_historicos
    )
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

app.get("/api/cabo-viejo", authRequired, (req, res) => {
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

/* USERS */
app.get("/api/users", authRequired, (req, res) => {
  db.all(
    `
    SELECT
      id,
      username,
      role,
      datetime(created_at, 'localtime') AS created_at
    FROM users
    ORDER BY id DESC
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

app.post("/api/users", authRequired, adminRequired, (req, res) => {
  const { username, password, role } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Usuario y contraseña son obligatorios" });
  }

  const finalRole = role === "admin" ? "admin" : "viewer";
  const hash = bcrypt.hashSync(password, 10);

  db.run(
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

app.delete("/api/users/:id", authRequired, adminRequired, (req, res) => {
  const userId = Number(req.params.id);

  db.get(`SELECT * FROM users WHERE id = ?`, [userId], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    if (user.username === "admin") {
      return res.status(400).json({ error: "No se puede eliminar admin" });
    }

    db.run(`DELETE FROM users WHERE id = ?`, [userId], function (delErr) {
      if (delErr) return res.status(500).json({ error: delErr.message });
      res.json({ ok: true, message: "Usuario eliminado" });
    });
  });
});

app.get("/api/login-logs", authRequired, (req, res) => {
  db.all(
    `
    SELECT
      id,
      username,
      role,
      success,
      ip,
      datetime(created_at, 'localtime') AS created_at
    FROM login_logs
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

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});