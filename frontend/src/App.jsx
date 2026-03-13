import { useEffect, useMemo, useState } from "react";
import "./App.css";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);
  const [activeView, setActiveView] = useState("dashboard");

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
    const obtenerNiveles = () => {
      fetch("http://localhost:3001/api/niveles")
        .then((res) => res.json())
        .then((data) => {
          setNiveles(data.niveles || {});
          setPlcStatus(data.plcStatus || {});
        })
        .catch((err) => console.error("Error al obtener niveles:", err));
    };

    obtenerNiveles();
    const interval = setInterval(obtenerNiveles, 5000);
    return () => clearInterval(interval);
  }, []);

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

          <button className="nav-item">
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
            </div>
          </div>

          <div className="topbar__user">BIENVENIDO ______________</div>
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
      </main>
    </div>
  );
}

function PlantaCard({ level, plc }) {
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

      <CardHeader title="PLANTA" />
      <TankGauge level={level} />

      <div className="control-section-card">
        <div className="control-section-card__title">Control de Trenes</div>

        <div className="button-grid button-grid--3">
          <button className="action-btn" disabled={noDisponible}>
            TREN A
          </button>
          <button
            className="action-btn action-btn--active"
            disabled={noDisponible}
          >
            TREN B
          </button>
          <button className="action-btn" disabled={noDisponible}>
            TREN C
          </button>
        </div>
      </div>

      <div className="control-section-card">
        <div className="control-section-card__title">Control de Bombas</div>

        <div className="button-grid button-grid--3">
          <button className="action-btn" disabled={noDisponible}>
            BOMBA A
          </button>
          <button className="action-btn" disabled={noDisponible}>
            BOMBA B
          </button>
          <button
            className="action-btn action-btn--active"
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
            <div
              className="mini-gauge__water"
              style={{ height: `${safeLevel}%` }}
            />
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
      <div
        className={`pump-box__state ${alert ? "pump-box__state--alert" : ""}`}
      >
        {state}
      </div>

      <div className="mode-grid">
        <button
          className={`mode-btn ${active === "HAND" ? "mode-btn--active" : ""}`}
        >
          HAND
        </button>
        <button
          className={`mode-btn ${active === "OFF" ? "mode-btn--active" : ""}`}
        >
          OFF
        </button>
        <button
          className={`mode-btn ${active === "AUTO" ? "mode-btn--active" : ""}`}
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
      fetch("http://localhost:3001/api/cabo-viejo")
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
    return <div className="chart-empty">No hay datos de Cabo Viejo todavía.</div>;
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