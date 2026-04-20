import { useEffect, useMemo, useState } from "react";
import "./App.css";

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

const TANK_OPTIONS = [
  { key: "planta", label: "Planta" },
  { key: "cabo_viejo", label: "Cabo Viejo" },
  { key: "falcone", label: "Falcone" },
  { key: "cinco", label: "Cinco" },
  { key: "seis", label: "Seis" },
  { key: "marilu", label: "Marilu" },
  { key: "pacifico", label: "Pacifico" },
  { key: "cuadrada", label: "Cuadrada" },
];

function escalarNivel(valor, min, max) {
  const v = Number(valor);
  const minNum = Number(min);
  const maxNum = Number(max);

  if (Number.isNaN(v) || Number.isNaN(minNum) || Number.isNaN(maxNum)) return 0;
  if (maxNum === minNum) return 0;

  const porcentaje = ((v - minNum) / (maxNum - minNum)) * 100;
  return Math.max(0, Math.min(100, porcentaje));
}

function formatLevel(level) {
  const safeLevel = Math.max(0, Math.min(100, Number(level) || 0));
  return `${Math.round(safeLevel)}%`;
}

function formatChartDateTime(value) {
  if (!value) return "";

  const date = parseSqlUtcDate(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    }).format(date);
  }

function parseSqlUtcDate(value) {
  if (!value) return new Date(NaN);
  return new Date(`${String(value).replace(" ", "T")}Z`);
}

function formatChartAxisTime(value) {
  const date = parseSqlUtcDate(value);

  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatChartAxisDate(value) {
  const date = parseSqlUtcDate(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatChartRangeLabel(startValue, endValue) {
  const start = parseSqlUtcDate(startValue);
  const end = parseSqlUtcDate(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Ventana de 12 horas";
  }

  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (sameDay) {
    return `${dateFormatter.format(start)} ${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
  }

  return `${dateFormatter.format(start)} ${timeFormatter.format(start)} - ${dateFormatter.format(end)} ${timeFormatter.format(end)}`;
}

function formatSqlUtcDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
}

function toSqlDateTimeString(dateValue, timeValue) {
  if (!dateValue || !timeValue) return "";
  return `${dateValue} ${timeValue}:00`;
}

function apiFetch(url, options = {}) {
  const token = localStorage.getItem("auth_token");

  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);
  const [activeView, setActiveView] = useState("dashboard");

  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [loginForm, setLoginForm] = useState({
    username: "",
    password: "",
  });
  const [loginError, setLoginError] = useState("");

  const [niveles, setNiveles] = useState({
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
  });

  const [plcStatus, setPlcStatus] = useState({
    planta: 0,
    cabo_viejo: 0,
    falcone: 0,
    cinco: 0,
    seis: 0,
    marilu: 0,
    pacifico: 0,
    cuadrada: 0,
  });

  const [bombasCaboviejo, setBombasCaboviejo] = useState({
    p70a: { man: 0, off: 0, auto: 1, running: 0 },
    p70b: { man: 0, off: 0, auto: 1, running: 0 },
    p71a: { man: 0, off: 0, auto: 1, running: 0 },
    p71b: { man: 0, off: 0, auto: 1, running: 0 },
  });

  const [plantaBotones, setPlantaBotones] = useState({
    bombaA: 0,
    bombaB: 0,
    bombaC: 0,
    trenA: 0,
    trenB: 0,
    trenC: 0,
  });

  const [users, setUsers] = useState([]);
  const [loginLogs, setLoginLogs] = useState([]);
  const [userMessage, setUserMessage] = useState("");
  const [userForm, setUserForm] = useState({
    username: "",
    password: "",
    role: "viewer",
  });

  const [levelConfig, setLevelConfig] = useState(DEFAULT_LEVEL_CONFIG);

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedTank, setSelectedTank] = useState(null);
  const [graphModalTank, setGraphModalTank] = useState(null);
  const [queryForm, setQueryForm] = useState({
    tankKey: "cinco",
    date: "",
    startTime: "",
    endTime: "",
  });
  const [queryRows, setQueryRows] = useState([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState("");

  const [configForm, setConfigForm] = useState({
    min: "",
    max: "",
  });

  const openConfigModal = (tankKey) => {
    const current = levelConfig[tankKey] || { min: 0, max: 140 };

    setSelectedTank(tankKey);
    setConfigForm({
      min: String(current.min),
      max: String(current.max),
    });
    setConfigModalOpen(true);
  };

  const closeConfigModal = () => {
    setConfigModalOpen(false);
    setSelectedTank(null);
    setConfigForm({ min: "", max: "" });
  };

  const openGraphModal = (tankKey) => {
    setGraphModalTank(tankKey);
  };

  const closeGraphModal = () => {
    setGraphModalTank(null);
  };

  const saveTankConfig = () => {
    if (!selectedTank) return;
    const min = Number(configForm.min);
    const max = Number(configForm.max);

    apiFetch(`/api/level-config/${selectedTank}`, {
      method: "POST",
      body: JSON.stringify({ min, max }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al guardar configuracion");
        return data;
      })
      .then(() => {
        setLevelConfig((prev) => ({
          ...prev,
          [selectedTank]: {
            min,
            max,
          },
        }));

        closeConfigModal();
      })
      .catch((err) => console.error("Error al guardar configuracion:", err));
  };

  useEffect(() => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const localDate = now.toISOString().slice(0, 10);
    const pad = (value) => String(value).padStart(2, "0");

    setQueryForm((prev) => ({
      ...prev,
      date: localDate,
      startTime: `${pad(oneHourAgo.getHours())}:${pad(oneHourAgo.getMinutes())}`,
      endTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    }));
  }, []);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 900;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };

    window.addEventListener("resize", onResize);
    onResize();

    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");

    if (!token) {
      setAuthChecked(true);
      return;
    }

    apiFetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Token inválido");
        return res.json();
      })
      .then((data) => {
        setAuthUser(data.user);
      })
      .catch(() => {
        localStorage.removeItem("auth_token");
        setAuthUser(null);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!authUser) return;

    const obtenerNiveles = () => {
      fetch("/api/niveles")
        .then((res) => res.json())
        .then((data) => {
          setNiveles(data.niveles || {});
          setPlcStatus(data.plcStatus || {});
          setBombasCaboviejo(data.bombasCaboviejo || {});
          setPlantaBotones(data.plantaBotones || {});
        })
        .catch((err) => console.error("Error al obtener niveles:", err));
    };

    obtenerNiveles();
    const interval = setInterval(obtenerNiveles, 1000);
    return () => clearInterval(interval);
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;

    const cargarConfig = () => {
      apiFetch("/api/level-config")
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Error al cargar configuracion");
          return data;
        })
        .then((data) => {
          setLevelConfig(data.config || DEFAULT_LEVEL_CONFIG);
        })
        .catch((err) => console.error("Error al cargar configuracion:", err));
    };

    cargarConfig();
    const interval = setInterval(cargarConfig, 5000);
    return () => clearInterval(interval);
  }, [authUser]);

  useEffect(() => {
    if (!authUser || activeView !== "usuarios") return;

    apiFetch("/api/users")
      .then((res) => res.json())
      .then((data) => setUsers(Array.isArray(data) ? data : []));

    apiFetch("/api/login-logs")
      .then((res) => res.json())
      .then((data) => setLoginLogs(Array.isArray(data) ? data : []));
  }, [authUser, activeView]);

  const nivelesEscalados = {
    planta: escalarNivel(
      niveles.planta,
      levelConfig.planta.min,
      levelConfig.planta.max
    ),
    cabo_viejo: escalarNivel(
      niveles.cabo_viejo,
      levelConfig.cabo_viejo.min,
      levelConfig.cabo_viejo.max
    ),
    falcone: escalarNivel(
      niveles.falcone,
      levelConfig.falcone.min,
      levelConfig.falcone.max
    ),
    cinco: escalarNivel(
      niveles.cinco,
      levelConfig.cinco.min,
      levelConfig.cinco.max
    ),
    seis: escalarNivel(
      niveles.seis,
      levelConfig.seis.min,
      levelConfig.seis.max
    ),
    marilu: escalarNivel(
      niveles.marilu,
      levelConfig.marilu.min,
      levelConfig.marilu.max
    ),
    pacifico: escalarNivel(
      niveles.pacifico,
      levelConfig.pacifico.min,
      levelConfig.pacifico.max
    ),
    cuadrada: escalarNivel(
      niveles.cuadrada,
      levelConfig.cuadrada.min,
      levelConfig.cuadrada.max
    ),
  };

  const widgetsInferiores = [
    {
      title: "Cinco",
      tankKey: "cinco",
      level: nivelesEscalados.cinco,
      plc: plcStatus.cinco,
    },
    {
      title: "Seis",
      tankKey: "seis",
      level: nivelesEscalados.seis,
      plc: plcStatus.seis,
    },
    {
      title: "Marilu",
      tankKey: "marilu",
      level: nivelesEscalados.marilu,
      plc: plcStatus.marilu,
    },
    {
      title: "Pacifico",
      tankKey: "pacifico",
      level: nivelesEscalados.pacifico,
      plc: plcStatus.pacifico,
    },
    {
      title: "Cuadrada",
      tankKey: "cuadrada",
      level: nivelesEscalados.cuadrada,
      plc: plcStatus.cuadrada,
    },
    { title: "", level: null, plc: null, empty: true },
  ];

  const alarmasDemo = [
    {
      id: 1,
      zona: "FALCONE",
      mensaje: "Nivel bajo detectado en tanque",
      fecha: "2026-03-10 10:21:14",
      prioridad: "alta",
    },
    {
      id: 2,
      zona: "CABO VIEJO",
      mensaje: "Bomba P70B fuera de servicio",
      fecha: "2026-03-10 10:18:03",
      prioridad: "media",
    },
    {
      id: 3,
      zona: "PLANTA",
      mensaje: "Reset de contadores pendiente",
      fecha: "2026-03-10 09:56:41",
      prioridad: "baja",
    },
  ];

  const handleLogin = (e) => {
    e.preventDefault();

    apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(loginForm),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error de login");
        return data;
      })
      .then((data) => {
        localStorage.setItem("auth_token", data.token);
        setAuthUser(data.user);
        setLoginError("");
        setLoginForm({ username: "", password: "" });
        setActiveView("dashboard");
      })
      .catch((err) => setLoginError(err.message));
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    setAuthUser(null);
    setLoginForm({ username: "", password: "" });
    setSidebarOpen(!isMobile);
  };

  const handleCreateUser = (e) => {
    e.preventDefault();

    apiFetch("/api/users", {
      method: "POST",
      body: JSON.stringify(userForm),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al crear usuario");
        return data;
      })
      .then(() => {
        setUserMessage("Usuario creado correctamente");
        setUserForm({
          username: "",
          password: "",
          role: "viewer",
        });

        return apiFetch("/api/users")
          .then((res) => res.json())
          .then((data) => setUsers(Array.isArray(data) ? data : []));
      })
      .catch((err) => setUserMessage(err.message));
  };

  const handleDeleteUser = (id) => {
    apiFetch(`/api/users/${id}`, {
      method: "DELETE",
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al eliminar");
        return data;
      })
      .then(() => {
        setUsers((prev) => prev.filter((u) => u.id !== id));
      })
      .catch((err) => setUserMessage(err.message));
  };

  const handleQuerySubmit = (e) => {
    e.preventDefault();

    const start = toSqlDateTimeString(queryForm.date, queryForm.startTime);
    const end = toSqlDateTimeString(queryForm.date, queryForm.endTime);

    if (!start || !end) {
      setQueryError("Completa fecha y horas validas.");
      setQueryRows([]);
      return;
    }

    if (start > end) {
      setQueryError("La hora inicial debe ser menor o igual a la final.");
      setQueryRows([]);
      return;
    }

    setQueryLoading(true);
    setQueryError("");

    const params = new URLSearchParams({
      tankKey: queryForm.tankKey,
      start,
      end,
    });

    apiFetch(`/api/historico-query?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al consultar");
        return data;
      })
      .then((data) => {
        setQueryRows(Array.isArray(data.rows) ? data.rows : []);
      })
      .catch((err) => {
        setQueryError(err.message);
        setQueryRows([]);
      })
      .finally(() => setQueryLoading(false));
  };

  if (!authChecked) {
    return (
      <div className="login-page">
        <div className="login-card">Cargando...</div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <LoginScreen
        loginForm={loginForm}
        setLoginForm={setLoginForm}
        handleLogin={handleLogin}
        loginError={loginError}
      />
    );
  }

  const isAdmin = authUser.role === "admin";

  return (
    <div className="app-shell">
      {sidebarOpen && isMobile && (
        <div className="overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`sidebar ${
          sidebarOpen ? "sidebar--open" : "sidebar--closed"
        }`}
      >
        <div className="sidebar__header">
          <div className="brand">
            <div className="brand__logo">
              <div className="brand__wave brand__wave--blue" />
              <div className="brand__wave brand__wave--green" />
            </div>

            <div className="brand__text">
              <span className="brand__title">Colonos</span>
              <span className="brand__subtitle">del Pedregal</span>
            </div>
          </div>

          <button
            className="sidebar__close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </div>

        <nav className="sidebar__nav">
          <button
            className={`nav-item ${
              activeView === "dashboard" ? "nav-item--active" : ""
            }`}
            onClick={() => setActiveView("dashboard")}
          >
            <span className="nav-item__icon">🛢️</span>
            <span>Tanques</span>
          </button>

          <button
            className={`nav-item ${
              activeView === "historico" ? "nav-item--active" : ""
            }`}
            onClick={() => setActiveView("historico")}
          >
            <span className="nav-item__icon">🕘</span>
            <span>Historico</span>
          </button>

          <button
            className={`nav-item ${
              activeView === "consultas" ? "nav-item--active" : ""
            }`}
            onClick={() => setActiveView("consultas")}
          >
            <span className="nav-item__icon">🔎</span>
            <span>Consultas</span>
          </button>

          <button
            className={`nav-item ${
              activeView === "usuarios" ? "nav-item--active" : ""
            }`}
            onClick={() => setActiveView("usuarios")}
          >
            <span className="nav-item__icon">👥</span>
            <span>Usuarios</span>
          </button>
        </nav>

        <div className="sidebar__footer">
          ©️ 2025 Colonos del Pedregal v2.0.0
        </div>
      </aside>

      <main className={`main ${sidebarOpen && !isMobile ? "" : "main--full"}`}>
        <header className="topbar">
          <div className="topbar__left">
            {(!sidebarOpen || isMobile) && (
              <button
                className="topbar__menu"
                onClick={() => setSidebarOpen(true)}
                aria-label="Mostrar menú"
              >
                ☰
              </button>
            )}

            <div className="topbar__titles">
              {activeView === "historico" && (
                <>
                  <h1>Histórico de Alarmas</h1>
                  <p>Registro general de eventos y alarmas del sistema</p>
                </>
              )}

              {activeView === "consultas" && (
                <>
                  <h1>Consultas</h1>
                  <p>Consulta historicos por tanque, fecha y rango horario</p>
                </>
              )}

              {activeView === "usuarios" && (
                <>
                  <h1>Usuarios</h1>
                  <p>Administración y bitácora de accesos</p>
                </>
              )}
            </div>
          </div>

          <div className="topbar__user topbar__user--auth">
            <span>
              BIENVENIDO {authUser.username.toUpperCase()} (
              {authUser.role.toUpperCase()})
            </span>
            <button className="logout-btn" onClick={handleLogout}>
              Salir
            </button>
          </div>
        </header>

        {activeView === "dashboard" && (
          <section className="content">
            <div className="cards-grid">
              <PlantaCard
                level={nivelesEscalados.planta}
                plc={plcStatus.planta}
                plantaBotones={plantaBotones}
                onOpenConfig={() => openConfigModal("planta")}
                onOpenGraph={() => openGraphModal("planta")}
              />

              <CaboViejoCard
                level={nivelesEscalados.cabo_viejo}
                plc={plcStatus.cabo_viejo}
                p70a={niveles.runtime_p70a}
                p70b={niveles.runtime_p70b}
                p71a={niveles.runtime_p71a}
                p71b={niveles.runtime_p71b}
                bombasCaboviejo={bombasCaboviejo}
                onOpenConfig={() => openConfigModal("cabo_viejo")}
                onOpenGraph={() => openGraphModal("cabo_viejo")}
              />

              <FalconeCard
                level={nivelesEscalados.falcone}
                plc={plcStatus.falcone}
                onOpenConfig={() => openConfigModal("falcone")}
                onOpenGraph={() => openGraphModal("falcone")}
              />
            </div>

            <div className="lower-section">
              <div className="mini-widgets-panel">
                <div className="mini-widgets-grid">
                  {widgetsInferiores.map((item, index) =>
                    item.empty ? (
                      <div className="mini-card mini-card--empty" key={index} />
                    ) : (
                      <MiniTankCard
                        key={item.title}
                        title={item.title}
                        level={item.level}
                        plc={item.plc}
                        onOpenConfig={() => openConfigModal(item.tankKey)}
                        onOpenGraph={() => openGraphModal(item.tankKey)}
                      />
                    )
                  )}
                </div>
              </div>

              <div className="alarm-log-panel">
                <div className="alarm-log-header">
                  <h3>Log de alarmas</h3>
                  <span>En espera de eventos MQTT</span>
                </div>

                <div className="alarm-log-body">
                  <div className="alarm-empty-state">
                    <div className="alarm-empty-icon">⚠️</div>
                    <p>No hay alarmas registradas por ahora</p>
                    <small>
                      Aquí aparecerán alertas, fallas y eventos del sistema.
                    </small>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeView === "historico" && (
          <section className="content">
            <div className="historico-page">
              <div className="historico-header-card">
                <div>
                  <h2>Histórico de alarmas</h2>
                  <p>
                    Vista general del registro de alarmas, fallas y eventos del
                    sistema.
                  </p>
                </div>

                <div className="historico-stats">
                  <div className="historico-stat">
                    <span>Total</span>
                    <strong>{alarmasDemo.length}</strong>
                  </div>
                  <div className="historico-stat">
                    <span>Altas</span>
                    <strong>
                      {
                        alarmasDemo.filter((a) => a.prioridad === "alta").length
                      }
                    </strong>
                  </div>
                </div>
              </div>

              <div className="historico-log-card">
                <div className="historico-log-table">
                  <div className="historico-log-head">
                    <div>Zona</div>
                    <div>Mensaje</div>
                    <div>Prioridad</div>
                    <div>Fecha</div>
                  </div>

                  {alarmasDemo.map((alarma) => (
                    <div className="historico-log-row" key={alarma.id}>
                      <div className="historico-zone">{alarma.zona}</div>
                      <div className="historico-message">{alarma.mensaje}</div>
                      <div>
                        <span
                          className={`historico-badge historico-badge--${alarma.prioridad}`}
                        >
                          {alarma.prioridad}
                        </span>
                      </div>
                      <div className="historico-date">{alarma.fecha}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeView === "consultas" && (
          <section className="content">
            <HistoricalQueryView
              queryForm={queryForm}
              setQueryForm={setQueryForm}
              queryRows={queryRows}
              queryLoading={queryLoading}
              queryError={queryError}
              levelConfig={levelConfig}
              onSubmit={handleQuerySubmit}
            />
          </section>
        )}

        {activeView === "usuarios" && (
          <section className="content">
            <div className="users-page">
              <div
                className={`users-form-card ${
                  !isAdmin ? "users-form-card--disabled" : ""
                }`}
              >
                <h2>Crear usuario</h2>

                {!isAdmin && (
                  <div className="card-disabled-banner">NO DISPONIBLE</div>
                )}

                <form className="users-form" onSubmit={handleCreateUser}>
                  <div className="login-field">
                    <label>Usuario</label>
                    <input
                      type="text"
                      value={userForm.username}
                      disabled={!isAdmin}
                      onChange={(e) =>
                        setUserForm((prev) => ({
                          ...prev,
                          username: e.target.value,
                        }))
                      }
                      placeholder="Nuevo usuario"
                    />
                  </div>

                  <div className="login-field">
                    <label>Contraseña</label>
                    <input
                      type="text"
                      value={userForm.password}
                      disabled={!isAdmin}
                      onChange={(e) =>
                        setUserForm((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                      placeholder="Nueva contraseña"
                    />
                  </div>

                  <div className="login-field">
                    <label>Rol</label>
                    <select
                      className="users-select"
                      value={userForm.role}
                      disabled={!isAdmin}
                      onChange={(e) =>
                        setUserForm((prev) => ({
                          ...prev,
                          role: e.target.value,
                        }))
                      }
                    >
                      <option value="viewer">viewer</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>

                  {userMessage && (
                    <div className="users-message">{userMessage}</div>
                  )}

                  <button
                    className="login-btn"
                    type="submit"
                    disabled={!isAdmin}
                  >
                    Crear usuario
                  </button>
                </form>
              </div>

              <div
                className={`users-list-card ${
                  !isAdmin ? "users-form-card--disabled" : ""
                }`}
              >
                <h2>Usuarios registrados</h2>

                {!isAdmin && (
                  <div className="card-disabled-banner">NO DISPONIBLE</div>
                )}

                <div className="users-list">
                  {users.map((user) => (
                    <div className="user-row" key={user.id}>
                      <div>
                        <strong>{user.username}</strong>
                        <p>
                          Rol: {user.role} | Creado: {user.created_at}
                        </p>
                      </div>

                      <button
                        className="user-delete-btn"
                        onClick={() => handleDeleteUser(user.id)}
                        disabled={!isAdmin || user.username === "admin"}
                      >
                        Eliminar
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="users-list-card users-list-card--full">
                <h2>Historial de logins</h2>

                <div className="alarm-log-body users-log-body">
                  {loginLogs.length === 0 ? (
                    <div className="alarm-empty-state">
                      <div className="alarm-empty-icon">🕘</div>
                      <p>No hay inicios de sesión registrados</p>
                      <small>
                        Aquí aparecerán usuario y hora de acceso.
                      </small>
                    </div>
                  ) : (
                    loginLogs.map((log) => (
                      <div className="alarm-item" key={log.id}>
                        <div>
                          <strong>{log.username}</strong>
                          <p>{log.username} inició sesión</p>
                        </div>

                        <span className="historico-date">
                          {log.login_time}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {configModalOpen && selectedTank && (
        <LevelConfigModal
          tankKey={selectedTank}
          form={configForm}
          setForm={setConfigForm}
          onClose={closeConfigModal}
          onSave={saveTankConfig}
        />
      )}

      {graphModalTank && (
        <TankGraphModal
          tankKey={graphModalTank}
          levelConfig={levelConfig}
          onClose={closeGraphModal}
        />
      )}
    </div>
  );
}

function LoginScreen({ loginForm, setLoginForm, handleLogin, loginError }) {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand__logo">
            <div className="brand__wave brand__wave--blue" />
            <div className="brand__wave brand__wave--green" />
          </div>

          <div>
            <h1>Colonos del Pedregal</h1>
            <p>Acceso al dashboard</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          <div className="login-field">
            <label>Usuario</label>
            <input
              type="text"
              value={loginForm.username}
              onChange={(e) =>
                setLoginForm((prev) => ({ ...prev, username: e.target.value }))
              }
              placeholder="Ingresa tu usuario"
            />
          </div>

          <div className="login-field">
            <label>Contraseña</label>
            <input
              type="password"
              value={loginForm.password}
              onChange={(e) =>
                setLoginForm((prev) => ({ ...prev, password: e.target.value }))
              }
              placeholder="Ingresa tu contraseña"
            />
          </div>

          {loginError && <div className="login-error">{loginError}</div>}

          <button type="submit" className="login-btn">
            Iniciar sesión
          </button>
        </form>
      </div>
    </div>
  );
}

function PlantaCard({
  level,
  plc,
  plantaBotones,
  onOpenConfig,
  onOpenGraph,
}) {
  const [noDisponible, setNoDisponible] = useState(false);

  return (
    <article
      className={`dashboard-card dashboard-card--planta ${
        noDisponible ? "dashboard-card--disabled" : ""
      }`}
    >
      <button
        className={`power-button ${noDisponible ? "power-button--off" : ""}`}
        onClick={() => setNoDisponible(!noDisponible)}
        type="button"
      >
        ⏻
      </button>

      {noDisponible && (
        <div className="card-disabled-banner">NO DISPONIBLE</div>
      )}

      <CardHeader title="PLANTA" onOpenConfig={onOpenConfig} />
      <TankGauge level={level} />

      <div className="control-section-card">
        <div className="control-section-card__title">Control de Trenes</div>

        <div className="button-grid button-grid--3">
          <button
            className={`action-btn ${
              Number(plantaBotones?.trenA) === 1 ? "action-btn--active" : ""
            }`}
            disabled={noDisponible}
          >
            TREN A
          </button>

          <button
            className={`action-btn ${
              Number(plantaBotones?.trenB) === 1 ? "action-btn--active" : ""
            }`}
            disabled={noDisponible}
          >
            TREN B
          </button>

          <button
            className={`action-btn ${
              Number(plantaBotones?.trenC) === 1 ? "action-btn--active" : ""
            }`}
            disabled={noDisponible}
          >
            TREN C
          </button>
        </div>
      </div>

      <div className="control-section-card">
        <div className="control-section-card__title">Control de Bombas</div>

        <div className="button-grid button-grid--3">
          <button
            className={`action-btn ${
              Number(plantaBotones?.bombaA) === 1 ? "action-btn--active" : ""
            }`}
            disabled={noDisponible}
          >
            BOMBA A
          </button>

          <button
            className={`action-btn ${
              Number(plantaBotones?.bombaB) === 1 ? "action-btn--active" : ""
            }`}
            disabled={noDisponible}
          >
            BOMBA B
          </button>

          <button
            className={`action-btn ${
              Number(plantaBotones?.bombaC) === 1 ? "action-btn--active" : ""
            }`}
            disabled={noDisponible}
          >
            BOMBA C
          </button>
        </div>
      </div>

      <div className="plant-reset-row">
        <button className="plant-reset-card" disabled={noDisponible}>
          ⟲ RESET CONTADORES
        </button>
      </div>

      <div className="footer-pills">
        <div className="footer-pill">PLC: {plc}</div>
      </div>

      <GraphCardButton onClick={onOpenGraph} />
    </article>
  );
}

function CaboViejoCard({
  level,
  plc,
  p70a,
  p70b,
  p71a,
  p71b,
  bombasCaboviejo,
  onOpenConfig,
  onOpenGraph,
}) {
  return (
    <article className="dashboard-card">
      <CardHeader title="CABO VIEJO" onOpenConfig={onOpenConfig} />
      <TankGauge level={level} />

      <div className="pump-grid pump-grid--cabo">
        <PumpBox name="P70A" runtime={p70a} modes={bombasCaboviejo.p70a} />
        <PumpBox name="P70B" runtime={p70b} modes={bombasCaboviejo.p70b} />
        <PumpBox name="P71A" runtime={p71a} modes={bombasCaboviejo.p71a} />
        <PumpBox name="P71B" runtime={p71b} modes={bombasCaboviejo.p71b} />
      </div>

      <div className="footer-pills">
        <div className="footer-pill">PLC: {plc}</div>
      </div>

      <GraphCardButton onClick={onOpenGraph} />
    </article>
  );
}

function FalconeCard({ level, plc, onOpenConfig, onOpenGraph }) {
  return (
    <article className="dashboard-card">
      <CardHeader title="FALCONE" onOpenConfig={onOpenConfig} />
      <TankGauge level={level} />

      <div className="pump-grid pump-grid--2">
        <PumpBox name="P80A" runtime={0} state="ALARMADO" active="OFF" alert />
        <PumpBox name="P80B" runtime={0} state="ALARMADO" active="OFF" alert />
      </div>

      <div className="footer-pills">
        <div className="footer-pill">PLC: {plc}</div>
      </div>

      <GraphCardButton onClick={onOpenGraph} />
    </article>
  );
}

function MiniTankCard({ title, level, plc, onOpenConfig, onOpenGraph }) {
  const safeLevel = Math.max(0, Math.min(100, Number(level) || 0));

  return (
    <article className="mini-card">
      <div className="mini-card__header mini-card__header--with-actions">
        <h4>{title}</h4>
        <button className="mini-card__menu" onClick={onOpenConfig}>
          ⋮
        </button>
      </div>

      <div className="mini-gauge-wrap">
        <div className="mini-gauge">
          <div className="mini-gauge__inner">
            <div
              className="mini-gauge__water"
              style={{ height: `${safeLevel}%` }}
            >
              <div className="mini-gauge__wave mini-gauge__wave--back" />
              <div className="mini-gauge__wave mini-gauge__wave--front" />
              <div className="mini-gauge__wave-shine" />
            </div>
          </div>

          <div className="mini-gauge__value">{formatLevel(safeLevel)}</div>
        </div>
      </div>

      <div className="mini-footer">
        <div className="footer-pill">PLC: {plc}</div>
      </div>

      <GraphCardButton onClick={onOpenGraph} compact />
    </article>
  );
}

function GraphCardButton({ onClick, compact = false }) {
  return (
    <button
      type="button"
      className={`graph-card-btn ${compact ? "graph-card-btn--compact" : ""}`}
      onClick={onClick}
      aria-label="Ver grafica"
      title="Ver grafica"
    >
      &#128200;
    </button>
  );
}

function CardHeader({ title, onOpenConfig }) {
  return (
    <div className="card-head">
      <div className="card-head__center">
        <h2>{title}</h2>
        <span className="status-dot" />
      </div>

      <button className="more-btn" onClick={onOpenConfig}>
        ⋮
      </button>
    </div>
  );
}

function PumpBox({ name, runtime, modes = {}, alert = false }) {
  const manActivo = Number(modes.man) === 1;
  const offActivo = Number(modes.off) === 1;
  const autoActivo = Number(modes.auto) === 1;
  const runningActivo = Number(modes.running) === 1;

  const stateText = runningActivo ? "ENCENDIDO" : "APAGADO";

  return (
    <div className="pump-box">
      <div className="pump-box__name">{name}</div>

      <div
        className={`pump-box__state ${alert ? "pump-box__state--alert" : ""}`}
      >
        {stateText}
      </div>

      <div className="mode-grid">
        <button className={`mode-btn ${manActivo ? "mode-btn--active" : ""}`}>
          HAND
        </button>

        <button className={`mode-btn ${offActivo ? "mode-btn--active" : ""}`}>
          OFF
        </button>

        <button className={`mode-btn ${autoActivo ? "mode-btn--active" : ""}`}>
          AUTO
        </button>
      </div>

      <div className="runtime-list">
        <div className="runtime-pill">
          RUNTIME {name}: {runtime}
        </div>
      </div>
    </div>
  );
}

function TankGauge({ level }) {
  const safeLevel = Math.max(0, Math.min(100, Number(level) || 0));

  return (
    <div className="gauge-wrap">
      <div className="gauge">
        <div className="gauge__inner">
          <div className="gauge__water" style={{ height: `${safeLevel}%` }}>
            <div className="gauge__wave gauge__wave--back" />
            <div className="gauge__wave gauge__wave--front" />
            <div className="gauge__wave-shine" />
          </div>
        </div>

        <div className="gauge__value">{formatLevel(safeLevel)}</div>
      </div>
    </div>
  );
}

function TankHistoryChart({ tankKey, tankLabel, levelConfig }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [windowEnd, setWindowEnd] = useState(null);
  const [rangeInfo, setRangeInfo] = useState({
    start: null,
    end: null,
    min: null,
    max: null,
  });

  useEffect(() => {
    setLoading(true);
    setHoveredPoint(null);
    setWindowEnd(null);

    const fetchRows = () => {
      const params = new URLSearchParams();

      if (windowEnd) {
        const endDate = parseSqlUtcDate(windowEnd);

        if (!Number.isNaN(endDate.getTime())) {
          const startDate = new Date(endDate.getTime() - 12 * 60 * 60 * 1000);
          params.set("start", formatSqlUtcDate(startDate));
          params.set("end", formatSqlUtcDate(endDate));
        }
      }

      const query = params.toString();

      fetch(`/api/historico/${tankKey}${query ? `?${query}` : ""}`)
        .then((res) => res.json())
        .then((data) => {
          const fetchedRows = Array.isArray(data?.rows) ? data.rows : [];
          setRows(fetchedRows);
          setRangeInfo({
            start: data?.range?.start || null,
            end: data?.range?.end || null,
            min: data?.range?.min || null,
            max: data?.range?.max || null,
          });
          setLoading(false);
        })
        .catch((err) => {
          console.error("Error al cargar grafica:", err);
          setLoading(false);
        });
    };

    fetchRows();
    const interval = windowEnd ? null : setInterval(fetchRows, 10000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [tankKey, windowEnd]);

  const chartData = useMemo(() => {
    const config = levelConfig[tankKey] || DEFAULT_LEVEL_CONFIG[tankKey];

    return rows.slice(-72).map((row) => ({
      ...row,
      parsedDate: parseSqlUtcDate(row.fecha),
      nivelEscalado: escalarNivel(row.nivel, config.min, config.max),
    }));
  }, [levelConfig, rows, tankKey]);

  if (loading) {
    return <div className="chart-empty">Cargando datos...</div>;
  }

  if (!chartData.length) {
    return (
      <div className="chart-empty">
        No hay datos historicos para {tankLabel} todavia.
      </div>
    );
  }

  const width = 900;
  const height = 320;
  const padding = 52;
  const minY = 0;
  const maxY = 100;

  const buildPoint = (item, index) => {
    const x =
      padding +
      (index * (width - padding * 2)) / Math.max(chartData.length - 1, 1);

    const nivel = Number(item.nivelEscalado) || 0;
    const y =
      height -
      padding -
      ((nivel - minY) / (maxY - minY)) * (height - padding * 2);

    return { x, y, nivel, item };
  };

  const pointsData = chartData.map(buildPoint);
  const xAxisTicks = pointsData.filter((point, index, array) => {
    if (index === 0 || index === array.length - 1) return true;

    const currentDate = point.item.parsedDate;
    const previousDate = array[index - 1]?.item?.parsedDate;

    if (
      Number.isNaN(currentDate?.getTime?.()) ||
      Number.isNaN(previousDate?.getTime?.())
    ) {
      return false;
    }

    return (
      currentDate.getHours() !== previousDate.getHours() ||
      currentDate.getDate() !== previousDate.getDate() ||
      currentDate.getMonth() !== previousDate.getMonth() ||
      currentDate.getFullYear() !== previousDate.getFullYear()
    );
  });
  const points = pointsData.map((p) => `${p.x},${p.y}`).join(" ");
  const availableMin = parseSqlUtcDate(rangeInfo.min);
  const availableMax = parseSqlUtcDate(rangeInfo.max);
  const currentWindowStart = parseSqlUtcDate(rangeInfo.start);
  const currentWindowEnd = parseSqlUtcDate(rangeInfo.end);

  const canGoBack =
    !Number.isNaN(availableMin.getTime()) &&
    !Number.isNaN(currentWindowStart.getTime()) &&
    currentWindowStart.getTime() > availableMin.getTime();

  const canGoForward =
    !Number.isNaN(availableMax.getTime()) &&
    !Number.isNaN(currentWindowEnd.getTime()) &&
    currentWindowEnd.getTime() < availableMax.getTime();

  const handlePreviousWindow = () => {
    if (!canGoBack || Number.isNaN(currentWindowStart.getTime())) return;
    setWindowEnd(formatSqlUtcDate(currentWindowStart));
  };

  const handleNextWindow = () => {
    if (!canGoForward || Number.isNaN(currentWindowEnd.getTime())) return;

    const nextEnd = new Date(
      Math.min(
        currentWindowEnd.getTime() + 12 * 60 * 60 * 1000,
        availableMax.getTime()
      )
    );

    if (nextEnd.getTime() >= availableMax.getTime()) {
      setWindowEnd(null);
      return;
    }

    setWindowEnd(formatSqlUtcDate(nextEnd));
  };

  return (
    <div className="chart-wrap">
      <div className="chart-toolbar">
        <button
          type="button"
          className="chart-nav-btn"
          onClick={handlePreviousWindow}
          disabled={!canGoBack}
        >
          &lt;
        </button>

        <div className="chart-range-label">
          {formatChartRangeLabel(rangeInfo.start, rangeInfo.end)}
        </div>

        <button
          type="button"
          className="chart-nav-btn"
          onClick={handleNextWindow}
          disabled={!canGoForward}
        >
          &gt;
        </button>
      </div>

      <div className="chart-svg-container">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="chart-svg"
          preserveAspectRatio="none"
        >
          {[0, 25, 50, 75, 100].map((value) => {
            const y =
              height -
              padding -
              ((value - minY) / (maxY - minY)) * (height - padding * 2);

            return (
              <g key={value}>
                <line
                  x1={padding}
                  y1={y}
                  x2={width - padding}
                  y2={y}
                  className="chart-grid-line"
                />
                <text x="8" y={y + 4} className="chart-axis-text">
                  {value}
                </text>
              </g>
            );
          })}

            <line
              x1={padding}
              y1={height - padding}
              x2={width - padding}
              y2={height - padding}
              className="chart-axis-line"
            />

            <line
              x1={padding}
              y1={padding}
              x2={padding}
              y2={height - padding}
              className="chart-axis-line"
            />

            {xAxisTicks.map((point, index) => {
              const previousTick = xAxisTicks[index - 1];
              const currentDate = point.item.parsedDate;
              const previousDate = previousTick?.item?.parsedDate;
              const showDate =
                index === 0 ||
                !previousDate ||
                currentDate.getDate() !== previousDate.getDate() ||
                currentDate.getMonth() !== previousDate.getMonth() ||
                currentDate.getFullYear() !== previousDate.getFullYear();

              return (
                <g key={`tick-${point.item.id}`}>
                  <line
                    x1={point.x}
                    y1={height - padding}
                    x2={point.x}
                    y2={padding}
                    className="chart-grid-line chart-grid-line--vertical"
                  />
                  <text
                    x={point.x}
                    y={height - padding + 22}
                    className="chart-axis-text chart-axis-text--x"
                    textAnchor="middle"
                  >
                    <tspan x={point.x} dy="0">
                      {formatChartAxisTime(point.item.fecha)}
                    </tspan>
                    {showDate && (
                      <tspan x={point.x} dy="14" className="chart-axis-date">
                        {formatChartAxisDate(point.item.fecha)}
                      </tspan>
                    )}
                  </text>
                </g>
              );
            })}

            <polyline points={points} className="chart-line" fill="none" />

          {pointsData.map((p) => (
            <circle
              key={p.item.id}
              cx={p.x}
              cy={p.y}
              r="6"
              className="chart-point"
              onMouseEnter={() => setHoveredPoint(p)}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          ))}
        </svg>

        {hoveredPoint && (
          <div
            className="chart-tooltip"
            style={{
              left: `${(hoveredPoint.x / width) * 100}%`,
              top: `${(hoveredPoint.y / height) * 100}%`,
            }}
          >
            <div className="chart-tooltip__value">{Math.round(hoveredPoint.nivel)}%</div>
            <div className="chart-tooltip__time">
              {formatChartDateTime(hoveredPoint.item.fecha)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TankGraphModal({ tankKey, levelConfig, onClose }) {
  const tankLabel =
    TANK_OPTIONS.find((tank) => tank.key === tankKey)?.label || tankKey;

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="tank-graph-modal">
        <div className="tank-graph-modal__header">
          <div>
            <h3>{tankLabel}</h3>
            <span>Historico de nivel, muestreo cada 10 minutos</span>
          </div>

          <button
            type="button"
            className="tank-graph-modal__close"
            onClick={onClose}
            aria-label="Cerrar grafica"
          >
            X
          </button>
        </div>

          <div className="tank-graph-modal__body">
            <TankHistoryChart
              tankKey={tankKey}
              tankLabel={tankLabel}
            levelConfig={levelConfig}
          />
        </div>
      </div>
    </>
  );
}

function HistoricalQueryView({
  queryForm,
  setQueryForm,
  queryRows,
  queryLoading,
  queryError,
  levelConfig,
  onSubmit,
}) {
  const config =
    levelConfig[queryForm.tankKey] || DEFAULT_LEVEL_CONFIG[queryForm.tankKey];
  const scaledRows = queryRows.map((row) => ({
    ...row,
    nivelEscalado: escalarNivel(row.nivel, config.min, config.max),
  }));

  return (
    <div className="query-page">
      <div className="query-form-card">
        <div className="query-form-card__intro">
          <h2>Consulta de registros</h2>
          <p>
            Selecciona tanque, fecha y rango horario para ver los valores
            historicos registrados.
          </p>
        </div>

        <form className="query-form" onSubmit={onSubmit}>
          <div className="query-form__grid">
            <div className="login-field">
              <label>Tanque</label>
              <select
                className="users-select"
                value={queryForm.tankKey}
                onChange={(e) =>
                  setQueryForm((prev) => ({
                    ...prev,
                    tankKey: e.target.value,
                  }))
                }
              >
                {TANK_OPTIONS.map((tank) => (
                  <option key={tank.key} value={tank.key}>
                    {tank.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="login-field">
              <label>Fecha</label>
              <input
                type="date"
                value={queryForm.date}
                onChange={(e) =>
                  setQueryForm((prev) => ({
                    ...prev,
                    date: e.target.value,
                  }))
                }
              />
            </div>

            <div className="login-field">
              <label>Hora inicio</label>
              <input
                type="time"
                value={queryForm.startTime}
                onChange={(e) =>
                  setQueryForm((prev) => ({
                    ...prev,
                    startTime: e.target.value,
                  }))
                }
              />
            </div>

            <div className="login-field">
              <label>Hora fin</label>
              <input
                type="time"
                value={queryForm.endTime}
                onChange={(e) =>
                  setQueryForm((prev) => ({
                    ...prev,
                    endTime: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          {queryError && <div className="users-message">{queryError}</div>}

          <div className="query-form__actions">
            <button className="login-btn" type="submit" disabled={queryLoading}>
              {queryLoading ? "Consultando..." : "Consultar"}
            </button>
          </div>
        </form>
      </div>

      <div className="query-results-card">
        <div className="query-results-card__header">
          <h3>Log de resultados</h3>
          <span>{scaledRows.length} registros</span>
        </div>

        {!scaledRows.length ? (
          <div className="query-empty-state">
            {queryLoading
              ? "Buscando registros..."
              : "Aqui apareceran los valores encontrados para tu consulta."}
          </div>
        ) : (
          <div className="query-table">
            <div className="query-table__head">
              <div>Fecha y hora</div>
              <div>Valor</div>
            </div>

            {scaledRows.map((row) => (
              <div className="query-table__row" key={row.id}>
                <div>{formatChartDateTime(row.fecha)}</div>
                <div>{Math.round(row.nivelEscalado)}%</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LevelConfigModal({ tankKey, form, setForm, onClose, onSave }) {
  const niceName = {
    planta: "PLANTA",
    cabo_viejo: "CABO VIEJO",
    falcone: "FALCONE",
    cinco: "CINCO",
    seis: "SEIS",
    marilu: "MARILU",
    pacifico: "PACIFICO",
    cuadrada: "CUADRADA",
  };

  const renderBypassButtons = () => {
    if (tankKey === "planta") {
      return (
        <button className="level-modal__bypass">
          BYPASS PLANTA
        </button>
      );
    }

    if (tankKey === "cabo_viejo") {
      return (
        <div className="level-modal__bypass-group">
          <button className="level-modal__bypass">
            BYPASS FALCONE
          </button>

          <button className="level-modal__bypass">
            BYPASS CUADRADA
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />

      <div className="level-modal">
        <div className="level-modal__header">
          <h3>Configuración de niveles - {niceName[tankKey]}</h3>
          <button className="level-modal__close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="level-modal__body">
          <div className="login-field">
            <label>MÍNIMA</label>
            <input
              type="number"
              value={form.min}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, min: e.target.value }))
              }
              placeholder="0"
            />
          </div>

          <div className="login-field">
            <label>MÁXIMA</label>
            <input
              type="number"
              value={form.max}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, max: e.target.value }))
              }
              placeholder="140"
            />
          </div>

          <button className="level-modal__save" onClick={onSave}>
            GUARDAR
          </button>

          {renderBypassButtons()}
        </div>
      </div>
    </>
  );
}
