import { useEffect, useMemo, useState } from "react";
import "./App.css";

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

  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
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

  const [users, setUsers] = useState([]);
  const [loginLogs, setLoginLogs] = useState([]);
  const [userForm, setUserForm] = useState({
    username: "",
    password: "",
    role: "viewer",
  });
  const [userMessage, setUserMessage] = useState("");

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
        if (!res.ok) throw new Error();
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
      apiFetch("/api/niveles")
        .then((res) => {
          if (res.status === 401) throw new Error("unauthorized");
          return res.json();
        })
        .then((data) => {
          setNiveles(data.niveles || {});
          setPlcStatus(data.plcStatus || {});
        })
        .catch((err) => {
          if (err.message === "unauthorized") {
            localStorage.removeItem("auth_token");
            setAuthUser(null);
          }
        });
    };

    obtenerNiveles();
    const interval = setInterval(obtenerNiveles, 1000);
    return () => clearInterval(interval);
  }, [authUser]);

  useEffect(() => {
    if (!authUser || activeView !== "usuarios") return;

    apiFetch("/api/users")
      .then((res) => res.json())
      .then((data) => setUsers(data))
      .catch(() => setUsers([]));

    apiFetch("/api/login-logs")
      .then((res) => res.json())
      .then((data) => setLoginLogs(data))
      .catch(() => setLoginLogs([]));
  }, [authUser, activeView]);

  const widgetsInferiores = [
    { title: "Cinco", level: niveles.cinco, plc: plcStatus.cinco },
    { title: "Seis", level: niveles.seis, plc: plcStatus.seis },
    { title: "Marilu", level: niveles.marilu, plc: plcStatus.marilu },
    { title: "Pacifico", level: niveles.pacifico, plc: plcStatus.pacifico },
    { title: "Cuadrada", level: niveles.cuadrada, plc: plcStatus.cuadrada },
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
    setLoginError("");

    apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(loginForm),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al iniciar sesión");
        return data;
      })
      .then((data) => {
        localStorage.setItem("auth_token", data.token);
        setAuthUser(data.user);
        setLoginForm({ username: "", password: "" });
        setActiveView("dashboard");
      })
      .catch((err) => setLoginError(err.message));
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    setAuthUser(null);
    setUsers([]);
    setLoginLogs([]);
  };

  const handleCreateUser = (e) => {
    e.preventDefault();
    setUserMessage("");

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
        setUserForm({ username: "", password: "", role: "viewer" });

        return apiFetch("/api/users")
          .then((res) => res.json())
          .then((data) => setUsers(data));
      })
      .catch((err) => setUserMessage(err.message));
  };

  const handleDeleteUser = (id) => {
    apiFetch(`/api/users/${id}`, { method: "DELETE" })
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
    return <div className="login-page"><div className="login-card">Cargando...</div></div>;
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
            className={`nav-item ${activeView === "dashboard" ? "nav-item--active" : ""}`}
            onClick={() => setActiveView("dashboard")}
          >
            <span className="nav-item__icon">🛢️</span>
            <span>Tanques</span>
          </button>

          <button
            className={`nav-item ${activeView === "historico" ? "nav-item--active" : ""}`}
            onClick={() => setActiveView("historico")}
          >
            <span className="nav-item__icon">🕘</span>
            <span>Historico</span>
          </button>

          <button
            className={`nav-item ${activeView === "graficas" ? "nav-item--active" : ""}`}
            onClick={() => setActiveView("graficas")}
          >
            <span className="nav-item__icon">📈</span>
            <span>Gráficas</span>
          </button>

          <button
            className={`nav-item ${activeView === "usuarios" ? "nav-item--active" : ""}`}
            onClick={() => setActiveView("usuarios")}
          >
            <span className="nav-item__icon">👥</span>
            <span>Usuarios</span>
          </button>
        </nav>

        <div className="sidebar__footer">© 2025 Colonos del Pedregal v2.0.0</div>
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
          </div>

          <div className="topbar__user topbar__user--auth">
            <span>
              {authUser.username.toUpperCase()} | {authUser.role.toUpperCase()}
            </span>
            <button className="logout-btn" onClick={handleLogout}>
              Salir
            </button>
          </div>
        </header>

        {activeView === "dashboard" && (
          <section className="content">
            <div className="cards-grid">
              <PlantaCard level={niveles.planta} plc={plcStatus.planta} />

              <CaboViejoCard
                level={niveles.cabo_viejo}
                plc={plcStatus.cabo_viejo}
                p70a={niveles.runtime_p70a}
                p70b={niveles.runtime_p70b}
                p71a={niveles.runtime_p71a}
                p71b={niveles.runtime_p71b}
              />

              <FalconeCard level={niveles.falcone} plc={plcStatus.falcone} />
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
                    <small>Aquí aparecerán alertas, fallas y eventos del sistema.</small>
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
                  <p>Vista general del registro de alarmas, fallas y eventos del sistema.</p>
                </div>

                <div className="historico-stats">
                  <div className="historico-stat">
                    <span>Total</span>
                    <strong>{alarmasDemo.length}</strong>
                  </div>
                  <div className="historico-stat">
                    <span>Altas</span>
                    <strong>{alarmasDemo.filter((a) => a.prioridad === "alta").length}</strong>
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
                        <span className={`historico-badge historico-badge--${alarma.prioridad}`}>
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
              <div className="users-form-card">
                <h2>Crear usuario</h2>

                {authUser.role !== "admin" && (
                  <div className="users-readonly-banner">
                    Solo el administrador puede crear o eliminar usuarios.
                  </div>
                )}

                <form className="users-form" onSubmit={handleCreateUser}>
                  <div className="login-field">
                    <label>Usuario</label>
                    <input
                      type="text"
                      value={userForm.username}
                      disabled={authUser.role !== "admin"}
                      onChange={(e) =>
                        setUserForm((prev) => ({ ...prev, username: e.target.value }))
                      }
                    />
                  </div>

                  <div className="login-field">
                    <label>Contraseña</label>
                    <input
                      type="text"
                      value={userForm.password}
                      disabled={authUser.role !== "admin"}
                      onChange={(e) =>
                        setUserForm((prev) => ({ ...prev, password: e.target.value }))
                      }
                    />
                  </div>

                  <div className="login-field">
                    <label>Rol</label>
                    <select
                      className="users-select"
                      value={userForm.role}
                      disabled={authUser.role !== "admin"}
                      onChange={(e) =>
                        setUserForm((prev) => ({ ...prev, role: e.target.value }))
                      }
                    >
                      <option value="viewer">viewer</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>

                  {userMessage && <div className="users-message">{userMessage}</div>}

                  <button
                    className="login-btn"
                    type="submit"
                    disabled={authUser.role !== "admin"}
                  >
                    Crear usuario
                  </button>
                </form>
              </div>

              <div className="users-list-card">
                <h2>Usuarios registrados</h2>

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
                        disabled={authUser.role !== "admin" || user.username === "admin"}
                      >
                        Eliminar
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="users-list-card users-list-card--full">
                <h2>Log de sesiones</h2>

                <div className="historico-log-table">
                  <div className="historico-log-head">
                    <div>Usuario</div>
                    <div>Rol</div>
                    <div>Resultado</div>
                    <div>Hora / IP</div>
                  </div>

                  {loginLogs.map((log) => (
                    <div className="historico-log-row" key={log.id}>
                      <div className="historico-zone">{log.username}</div>
                      <div className="historico-message">{log.role || "-"}</div>
                      <div>
                        <span
                          className={`historico-badge ${
                            log.success ? "historico-badge--baja" : "historico-badge--alta"
                          }`}
                        >
                          {log.success ? "Éxito" : "Falló"}
                        </span>
                      </div>
                      <div className="historico-date">
                        {log.created_at} | {log.ip}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
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

function PlantaCard({ level, plc }) {
  return (
    <article className="dashboard-card dashboard-card--planta">
      <CardHeader title="PLANTA" />
      <TankGauge level={level} />
      <div className="footer-pills">
        <div className="footer-pill">PLC: {plc}</div>
      </div>
    </article>
  );
}

function CaboViejoCard({ level, plc, p70a, p70b, p71a, p71b }) {
  return (
    <article className="dashboard-card">
      <CardHeader title="CABO VIEJO" />
      <TankGauge level={level} />

      <div className="pump-grid pump-grid--cabo">
        <PumpBox name="P70A" runtime={p70a} state="APAGADO" active="AUTO" />
        <PumpBox name="P70B" runtime={p70b} state="ENCENDIDO" active="AUTO" />
        <PumpBox name="P71A" runtime={p71a} state="ENCENDIDO" active="AUTO" />
        <PumpBox name="P71B" runtime={p71b} state="APAGADO" active="AUTO" />
      </div>

      <div className="footer-pills">
        <div className="footer-pill">PLC: {plc}</div>
      </div>
    </article>
  );
}

function FalconeCard({ level, plc }) {
  return (
    <article className="dashboard-card">
      <CardHeader title="FALCONE" />
      <TankGauge level={level} />
      <div className="footer-pills">
        <div className="footer-pill">PLC: {plc}</div>
      </div>
    </article>
  );
}

function MiniTankCard({ title, level, plc }) {
  const safeLevel = Math.max(0, Math.min(100, Number(level) || 0));

  return (
    <article className="mini-card">
      <div className="mini-card__header">
        <h4>{title}</h4>
      </div>

      <div className="mini-gauge-wrap">
        <div className="mini-gauge">
          <div className="mini-gauge__inner">
            <div className="mini-gauge__water" style={{ height: `${safeLevel}%` }} />
          </div>
          <div className="mini-gauge__value">{safeLevel}%</div>
        </div>
      </div>

      <div className="mini-footer">
        <div className="footer-pill">PLC: {plc}</div>
      </div>
    </article>
  );
}

function CardHeader({ title }) {
  return (
    <div className="card-head">
      <div className="card-head__center">
        <h2>{title}</h2>
        <span className="status-dot" />
      </div>
      <button className="more-btn">⋮</button>
    </div>
  );
}

function PumpBox({ name, state, active, runtime, alert = false }) {
  return (
    <div className="pump-box">
      <div className="pump-box__name">{name}</div>
      <div className={`pump-box__state ${alert ? "pump-box__state--alert" : ""}`}>
        {state}
      </div>

      <div className="mode-grid">
        <button className={`mode-btn ${active === "HAND" ? "mode-btn--active" : ""}`}>HAND</button>
        <button className={`mode-btn ${active === "OFF" ? "mode-btn--active" : ""}`}>OFF</button>
        <button className={`mode-btn ${active === "AUTO" ? "mode-btn--active" : ""}`}>AUTO</button>
      </div>

      <div className="runtime-list">
        <div className="runtime-pill">RUNTIME {name}: {runtime}</div>
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
      apiFetch("/api/cabo-viejo")
        .then((res) => res.json())
        .then((data) => {
          const ordenados = [...data].reverse();
          setRows(ordenados);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };

    fetchRows();
    const interval = setInterval(fetchRows, 10000);
    return () => clearInterval(interval);
  }, []);

  const chartData = useMemo(() => rows.slice(-20), [rows]);

  if (loading) return <div className="chart-empty">Cargando datos...</div>;
  if (!chartData.length) return <div className="chart-empty">No hay datos de Cabo Viejo todavía.</div>;

  const width = 900;
  const height = 320;
  const padding = 36;
  const minY = 0;
  const maxY = 100;

  const buildPoint = (item, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(chartData.length - 1, 1);
    const nivel = Number(item.nivel) || 0;
    const y = height - padding - ((nivel - minY) / (maxY - minY)) * (height - padding * 2);
    return { x, y, nivel, item };
  };

  const pointsData = chartData.map(buildPoint);
  const points = pointsData.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="chart-wrap">
      <div className="chart-svg-container">
        <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" preserveAspectRatio="none">
          {[0, 25, 50, 75, 100].map((value) => {
            const y = height - padding - ((value - minY) / (maxY - minY)) * (height - padding * 2);
            return (
              <g key={value}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} className="chart-grid-line" />
                <text x="8" y={y + 4} className="chart-axis-text">{value}</text>
              </g>
            );
          })}

          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="chart-axis-line" />
          <line x1={padding} y1={padding} x2={padding} y2={height - padding} className="chart-axis-line" />
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