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

function escalarNivel(valor, min, max) {
  const v = Number(valor);
  const minNum = Number(min);
  const maxNum = Number(max);

  if (Number.isNaN(v) || Number.isNaN(minNum) || Number.isNaN(maxNum)) return 0;
  if (maxNum === minNum) return 0;

  const porcentaje = ((v - minNum) / (maxNum - minNum)) * 100;
  return Math.max(0, Math.min(100, porcentaje));
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
    p70a: { man: 0, off: 0, auto: 0, running: 0, modoEntero: -1 },
    p70b: { man: 0, off: 0, auto: 0, running: 0, modoEntero: -1 },
    p71a: { man: 0, off: 0, auto: 0, running: 0, modoEntero: -1 },
    p71b: { man: 0, off: 0, auto: 0, running: 0, modoEntero: -1 },
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

  const [levelConfig, setLevelConfig] = useState(() => {
    const saved = localStorage.getItem("level_config");
    return saved ? JSON.parse(saved) : DEFAULT_LEVEL_CONFIG;
  });

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedTank, setSelectedTank] = useState(null);
  const [configForm, setConfigForm] = useState({
    min: "",
    max: "",
  });

  // ====== COMANDOS CABO VIEJO ======
  const [cvCommandModalOpen, setCvCommandModalOpen] = useState(false);
  const [cvPendingCommand, setCvPendingCommand] = useState(null);

  const [cvWaitingModalOpen, setCvWaitingModalOpen] = useState(false);
  const [cvWaitingText, setCvWaitingText] = useState(
    "Esperando respuesta del PLC..."
  );

  const openCvCommandModal = (bomba, modo) => {
    if (bomba !== "p70a") {
      alert("Por ahora solo está habilitada la prueba en P70A");
      return;
    }

    setCvPendingCommand({ bomba, modo });
    setCvCommandModalOpen(true);
  };

  const closeCvCommandModal = () => {
    setCvCommandModalOpen(false);
    setCvPendingCommand(null);
  };

  const closeCvWaitingModal = () => {
    setCvWaitingModalOpen(false);
    setCvWaitingText("Esperando respuesta del PLC...");
  };

//Cambio en el status de las bombas (0=off, 1=man, 2=auto)
  const getExpectedStatusValue = (bomba, modo) => {
    if (bomba !== "p70a") return null;

    if (bomba === "off") return 0;
    if (bomba === "man") return 1;
    if (bomba === "auto") return 2;

    return null;

  };

  const confirmCvCommand = async () => {
    // alert("ENTRO A confirmCvCommand")
    console.log("ENTRO A confirmCvCommand");
    console.log("cvPendingCommand:", cvPendingCommand);

  if (!cvPendingCommand) return;

  const { bomba, modo } = cvPendingCommand;
  const expectedStatusValue = 
    modo === "off" ? 0 :
    modo === "man" ? 1 :
    modo === "auto" ? 2 :
    null;

  console.log("expectedStatusValue:", expectedStatusValue)  

  try {
    setCvCommandModalOpen(false);
    setCvWaitingText("Enviando comando al PLC...");
    setCvWaitingModalOpen(true);

    const res = await apiFetch("/api/caboviejo/comando", {
      method: "POST",
      body: JSON.stringify({ bomba, modo }),
    });

    const retryInterval = setInterval(() =>{
      console.log("Reintentando comando ...");
      
      apiFetch("/api/caboviejo/comando",{
        method: "POST",
        body: JSON.stringify({bomba, modo}),
      })
    }, 1000);

    const data = await res.json();
    console.log("respuesta comando:", data);

    if (!res.ok) {
      throw new Error(data.error || "Error al enviar comando");
    }

    setCvWaitingText("Esperando respuesta del PLC...");

    const start = Date.now();
    const timeoutMs = 15000;

    const interval = setInterval(async () => {
      try {
        const feedbackRes = await apiFetch("/api/caboviejo/feedback");
        const feedbackData = await feedbackRes.json();

        const statusValue = Number(feedbackData?.[bomba]?.status);
        console.log("statusValue:", statusValue, "expected:", expectedStatusValue);

        if (Number(statusValue) === expectedStatusValue) {
          clearInterval(interval);
          clearInterval(retryInterval);
          setCvWaitingText("Respuesta asignada");

          setTimeout(() => {
            closeCvWaitingModal();
            setCvPendingCommand(null);
          }, 1200);
          return;
        }

        if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          clearInterval(retryInterval);
          setCvWaitingText("Tiempo de espera agotado");

          setTimeout(() => {
            closeCvWaitingModal();
            setCvPendingCommand(null);
          }, 1500);
        }
      } catch (err) {
        clearInterval(interval);
        setCvWaitingText("Error leyendo status");

        setTimeout(() => {
          closeCvWaitingModal();
          setCvPendingCommand(null);
        }, 1500);
      }
    }, 700);
  } catch (error) {
    setCvWaitingText(error.message || "Error al enviar comando");

    setTimeout(() => {
      closeCvWaitingModal();
      setCvPendingCommand(null);
    }, 1500);
  }
};
  // ================================

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

  const saveTankConfig = () => {
    if (!selectedTank) return;

    setLevelConfig((prev) => ({
      ...prev,
      [selectedTank]: {
        min: Number(configForm.min),
        max: Number(configForm.max),
      },
    }));

    closeConfigModal();
  };

  useEffect(() => {
    localStorage.setItem("level_config", JSON.stringify(levelConfig));
  }, [levelConfig]);

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
              activeView === "graficas" ? "nav-item--active" : ""
            }`}
            onClick={() => setActiveView("graficas")}
          >
            <span className="nav-item__icon">📈</span>
            <span>Gráficas</span>
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

              {activeView === "graficas" && (
                <>
                  <h1>Gráficas</h1>
                  <p>Visualización histórica de niveles</p>
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
                onSelectMode={openCvCommandModal}
              />

              <FalconeCard
                level={nivelesEscalados.falcone}
                plc={plcStatus.falcone}
                onOpenConfig={() => openConfigModal("falcone")}
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

        {activeView === "graficas" && (
          <section className="content graficas-content">
            <div className="graficas-grid">
              <div className="grafica-card grafica-card--main">
                <div className="grafica-card__header">
                  <h3>Cabo Viejo</h3>
                  <span>Tiempo vs Nivel</span>
                </div>

                <CaboViejoChart />
              </div>

              <div className="grafica-card grafica-card--empty" />
              <div className="grafica-card grafica-card--empty" />
              <div className="grafica-card grafica-card--empty" />
            </div>
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

      {cvCommandModalOpen && cvPendingCommand && (
        <CaboViejoCommandModal
          command={cvPendingCommand}
          onClose={closeCvCommandModal}
          onConfirm={confirmCvCommand}
        />
      )}

      {cvWaitingModalOpen && (
        <CaboViejoWaitingModal text={cvWaitingText} />
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

function PlantaCard({ level, plc, plantaBotones, onOpenConfig }) {
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
          ⟲ RESET DE TECNOALL
        </button>
      </div>

      <div className="footer-pills">
        <div className="footer-pill">PLC: {plc}</div>
      </div>
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
  onSelectMode,
}) {
  return (
    <article className="dashboard-card">
      <CardHeader title="CABO VIEJO" onOpenConfig={onOpenConfig} />
      <TankGauge level={level} />

      <div className="pump-grid pump-grid--cabo">
        <PumpBox
          name="P70A"
          runtime={p70a}
          modes={bombasCaboviejo.p70a}
          onSelectMode={onSelectMode}
          pumpKey="p70a"
        />

        <PumpBox
          name="P70B"
          runtime={p70b}
          modes={bombasCaboviejo.p70b}
          onSelectMode={onSelectMode}
          pumpKey="p70b"
        />

        <PumpBox
          name="P71A"
          runtime={p71a}
          modes={bombasCaboviejo.p71a}
          onSelectMode={onSelectMode}
          pumpKey="p71a"
        />

        <PumpBox
          name="P71B"
          runtime={p71b}
          modes={bombasCaboviejo.p71b}
          onSelectMode={onSelectMode}
          pumpKey="p71b"
        />
      </div>

      <div className="footer-pills">
        <div className="footer-pill">PLC: {plc}</div>
      </div>
    </article>
  );
}

function FalconeCard({ level, plc, onOpenConfig }) {
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
    </article>
  );
}

function MiniTankCard({ title, level, plc, onOpenConfig }) {
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
            />
          </div>

          <div className="mini-gauge__value">
            {Number.isInteger(safeLevel) ? safeLevel : safeLevel.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="mini-footer">
        <div className="footer-pill">PLC: {plc}</div>
      </div>
    </article>
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

function PumpBox({
  name,
  runtime,
  modes = {},
  alert = false,
  onSelectMode,
  pumpKey,
}) {
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
        <button
          className={`mode-btn ${manActivo ? "mode-btn--active" : ""}`}
          onClick={() => onSelectMode?.(pumpKey, "man")}
          type="button"
        >
          HAND
        </button>

        <button
          className={`mode-btn ${offActivo ? "mode-btn--active" : ""}`}
          onClick={() => onSelectMode?.(pumpKey, "off")}
          type="button"
        >
          OFF
        </button>

        <button
          className={`mode-btn ${autoActivo ? "mode-btn--active" : ""}`}
          onClick={() => onSelectMode?.(pumpKey, "auto")}
          type="button"
        >
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
          <div className="gauge__water" style={{ height: `${safeLevel}%` }} />
        </div>

        <div className="gauge__value">
          {Number.isInteger(safeLevel) ? safeLevel : safeLevel.toFixed(2)}%
        </div>
      </div>
    </div>
  );
}

function CaboViejoChart() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  useEffect(() => {
    const fetchRows = () => {
      fetch("/api/cabo-viejo")
        .then((res) => res.json())
        .then((data) => {
          const ordenados = [...data].reverse();
          setRows(ordenados);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Error al cargar gráfica:", err);
          setLoading(false);
        });
    };

    fetchRows();
    const interval = setInterval(fetchRows, 10000);
    return () => clearInterval(interval);
  }, []);

  const chartData = useMemo(() => rows.slice(-20), [rows]);

  if (loading) {
    return <div className="chart-empty">Cargando datos...</div>;
  }

  if (!chartData.length) {
    return (
      <div className="chart-empty">No hay datos de Cabo Viejo todavía.</div>
    );
  }

  const width = 900;
  const height = 320;
  const padding = 36;
  const minY = 0;
  const maxY = 100;

  const buildPoint = (item, index) => {
    const x =
      padding +
      (index * (width - padding * 2)) / Math.max(chartData.length - 1, 1);

    const nivel = Number(item.nivel) || 0;
    const y =
      height -
      padding -
      ((nivel - minY) / (maxY - minY)) * (height - padding * 2);

    return { x, y, nivel, item };
  };

  const pointsData = chartData.map(buildPoint);
  const points = pointsData.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="chart-wrap">
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
            <div className="chart-tooltip__value">{hoveredPoint.nivel}%</div>
            <div className="chart-tooltip__time">{hoveredPoint.item.fecha}</div>
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
      return <button className="level-modal__bypass">BYPASS PLANTA</button>;
    }

    if (tankKey === "cabo_viejo") {
      return (
        <div className="level-modal__bypass-group">
          <button className="level-modal__bypass">BYPASS FALCONE</button>

          <button className="level-modal__bypass">BYPASS CUADRADA</button>
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

function CaboViejoCommandModal({ command, onClose, onConfirm }) {
  const pumpNames = {
    p70a: "P70A",
    p70b: "P70B",
    p71a: "P71A",
    p71b: "P71B",
  };

  const modeNames = {
    man: "HAND",
    off: "OFF",
    auto: "AUTO",
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />

      <div className="cv-command-modal">
        <div className="cv-command-modal__header">
          <h3>Confirmar comando</h3>
          <button className="cv-command-modal__close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="cv-command-modal__body">
          <p className="cv-command-modal__text">
            ¿Estás seguro de mandar este comando al PLC?
          </p>

          <div className="cv-command-modal__summary">
            <div className="cv-command-modal__row">
              <span>Bomba:</span>
              <strong>{pumpNames[command.bomba]}</strong>
            </div>

            <div className="cv-command-modal__row">
              <span>Modo:</span>
              <strong>{modeNames[command.modo]}</strong>
            </div>
          </div>

          <div className="cv-command-modal__actions">
            <button
              className="cv-command-modal__btn cv-command-modal__btn--cancel"
              onClick={onClose}
              type="button"
            >
              Cancelar
            </button>

            <button
              className="cv-command-modal__btn cv-command-modal__btn--confirm"
              onClick={() => {
                // alert("CLICK EN SI ENVIAR");
                console.log("CLICK EN SI ENVIAR");
                console.log("onConfirm:", onConfirm);
                onConfirm?.();
              }}
              type="button"
            >
              Sí, enviar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function CaboViejoWaitingModal({ text }) {
  return (
    <>
      <div className="modal-overlay" />

      <div className="cv-waiting-modal">
        <div className="cv-waiting-modal__spinner" />
        <h3>{text}</h3>
      </div>
    </>
  );
}