/**
 * AQUA-METRIC LUXE | Master Application Orchestrator
 * Director Científico: Lucas Tapia
 */

document.addEventListener('DOMContentLoaded', () => {
  // Configuración global y parámetros reactivos
  const defaultParams = {
    modelType: 'periodic',
    R0: 16.0,          // Tasa base (kg/h)
    A: 12.0,           // Amplitud de oscilación (kg/h)
    period: 24.0,      // Periodo diurno (h)
    phi: 0.0,          // Fase
    tau: 5.0,          // Tiempo característico de pulso (h)
    pulseMax: 55.0,    // Pico de derrame (kg/h)
    c1: 1.5,           // Coeficiente lineal
    c2: 0.04,          // Coeficiente cuadrático
    kDecay: 0.18,      // Tasa de mitigación (1/h)
    timeWindow: 24.0,  // Ventana de evaluación (h)
    integrationSteps: 24, // Pasos de Riemann/Simpson n
    integrationMethod: 'exact',
    riverFlow: 50.0,   // Caudal del río (m³/s)
    riverSpeed: 2.8,   // Velocidad media fluvial (km/h)
    kBiochem: 0.035,   // Tasa decaimiento natural río (1/h)
    regThreshold: 15.0 // Límite normativo concentración (mg/L)
  };

  window.currentParams = { ...defaultParams };
  window.currentSimTime = 0; // Horas

  // Inicializar Subsistemas
  const riverSim = new window.RiverCanvas('riverCanvas');
  const charts = new window.LuxuryCharts('chartRateCanvas', 'chartMassCanvas');

  // Estado del temporizador de reproducción
  let isPlaying = true;
  let playSpeed = 1.0;
  let animLastTimestamp = performance.now();

  // Motor de Audio Ambiental Sintetizado (Sonido sutil y natural de corriente de agua)
  class AmbientRiverAudio {
    constructor() {
      this.ctx = null;
      this.gain = null;
      this.isPlaying = false;
    }

    init() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();

      // Generador de ruido rosa/suave para emular flujo de agua
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.0555179;
        b1 = 0.96300 * b1 + white * 0.0750759;
        b2 = 0.57000 * b2 + white * 0.1538520;
        output[i] = (b0 + b1 + b2) * 0.12;
      }

      this.whiteNoise = this.ctx.createBufferSource();
      this.whiteNoise.buffer = noiseBuffer;
      this.whiteNoise.loop = true;

      // Filtro pasa-banda hidrodinámico
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, this.ctx.currentTime);

      this.gain = this.ctx.createGain();
      this.gain.gain.setValueAtTime(0.04, this.ctx.currentTime);

      this.whiteNoise.connect(filter);
      filter.connect(this.gain);
      this.gain.connect(this.ctx.destination);
      this.whiteNoise.start();
    }

    toggle() {
      if (!this.ctx) this.init();
      if (!this.ctx) return false;

      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      this.isPlaying = !this.isPlaying;
      if (this.gain) {
        this.gain.gain.setTargetAtTime(this.isPlaying ? 0.04 : 0.0001, this.ctx.currentTime, 0.2);
      }
      return this.isPlaying;
    }
  }

  const riverAudio = new AmbientRiverAudio();

  // Función principal de actualización del Dashboard
  function updateDashboard() {
    const params = window.currentParams;

    // 1. Cálculo de Integración Numérica vs Exacta
    const integrationResult = window.HydroMath.integrate(
      params.timeWindow,
      params.integrationSteps,
      params.integrationMethod,
      params
    );

    // 2. Cálculos de Tasa Pico y Masa Acumulada
    let peakRate = 0;
    const testPoints = 120;
    for (let i = 0; i <= testPoints; i++) {
      const t = (i / testPoints) * params.timeWindow;
      const r = window.HydroMath.evaluateDischargeRate(t, params);
      if (r > peakRate) peakRate = r;
    }

    const totalMassKg = integrationResult.exactValue;
    const numericalMassKg = integrationResult.value;

    // Métricas Asimilativas Ambientales
    const assimilative = window.HydroMath.computeAssimilativeMetrics(
      totalMassKg,
      peakRate,
      params.riverFlow,
      params.regThreshold
    );

    // 3. Actualizar Indicadores KPI en la Interfaz
    const elTotalMass = document.getElementById('kpiTotalMass');
    if (elTotalMass) elTotalMass.textContent = totalMassKg.toLocaleString('es-ES', { maximumFractionDigits: 1 });

    const elPeakRate = document.getElementById('kpiPeakRate');
    if (elPeakRate) elPeakRate.textContent = peakRate.toFixed(1);

    const elAssimScore = document.getElementById('kpiAssimScore');
    if (elAssimScore) elAssimScore.textContent = assimilative.complianceScore + '%';

    const elAssimStatus = document.getElementById('kpiAssimStatus');
    if (elAssimStatus) {
      elAssimStatus.textContent = assimilative.status === 'safe' ? 'Cumplimiento Óptimo' : (assimilative.status === 'warn' ? 'Precaución Ambiental' : 'Riesgo Crítico');
      elAssimStatus.className = 'kpi-status-tag ' + (assimilative.status === 'safe' ? 'tag-safe' : (assimilative.status === 'warn' ? 'tag-warn' : 'tag-danger'));
    }

    const elCurrentMass = document.getElementById('kpiCurrentMass');
    if (elCurrentMass) {
      const mCur = window.HydroMath.computeExactAccumulation(window.currentSimTime, params);
      elCurrentMass.textContent = mCur.toLocaleString('es-ES', { maximumFractionDigits: 1 });
    }

    // Actualizar Tabla de Error Científico
    updateErrorTable(integrationResult, totalMassKg, numericalMassKg);

    // 4. Renderizar Gráficos de Lujo
    charts.renderRateChart(params, integrationResult, window.currentSimTime);
    charts.renderMassChart(params, window.currentSimTime);

    // Sincronizar UI de tiempo en HUD
    const hudTime = document.getElementById('hudSimTime');
    if (hudTime) hudTime.textContent = window.currentSimTime.toFixed(1) + ' h';

    const hudRate = document.getElementById('hudSimRate');
    if (hudRate) {
      const rNow = window.HydroMath.evaluateDischargeRate(window.currentSimTime, params);
      hudRate.textContent = rNow.toFixed(1) + ' kg/h';
    }
  }

  function updateErrorTable(res, exactM, numM) {
    const elMethod = document.getElementById('statIntMethod');
    if (elMethod) elMethod.textContent = getMethodDisplayName(window.currentParams.integrationMethod);

    const elSteps = document.getElementById('statIntSteps');
    if (elSteps) elSteps.textContent = res.n;

    const elStepSize = document.getElementById('statStepSize');
    if (elStepSize) elStepSize.textContent = res.dt.toFixed(3) + ' h';

    const elExact = document.getElementById('statExactMass');
    if (elExact) elExact.textContent = exactM.toFixed(3) + ' kg';

    const elNum = document.getElementById('statNumMass');
    if (elNum) elNum.textContent = numM.toFixed(3) + ' kg';

    const elAbsErr = document.getElementById('statAbsError');
    if (elAbsErr) elAbsErr.textContent = res.absError.toFixed(4) + ' kg';

    const elRelErr = document.getElementById('statRelError');
    if (elRelErr) elRelErr.textContent = res.relError.toFixed(4) + ' %';
  }

  function getMethodDisplayName(key) {
    const map = {
      exact: 'Analítico Exacto (Teorema Fundamental)',
      simpson: "Regla de Simpson 1/3 Compuesta",
      trapezoidal: 'Regla del Trapecio Compuesta',
      midpoint: 'Suma de Riemann (Punto Medio)',
      riemann_left: 'Suma de Riemann (Extremo Izquierdo)',
      riemann_right: 'Suma de Riemann (Extremo Derecho)'
    };
    return map[key] || key;
  }

  window.renderDashboard = updateDashboard;

  // Bucle de tiempo de simulación continua
  function runSimulationLoop(timestamp) {
    const dt = (timestamp - animLastTimestamp) / 1000;
    animLastTimestamp = timestamp;

    if (isPlaying) {
      window.currentSimTime += dt * playSpeed * 1.5;
      if (window.currentSimTime > window.currentParams.timeWindow) {
        window.currentSimTime = 0; // Bucle cíclico natural
      }
      updateDashboard();
    }

    requestAnimationFrame(runSimulationLoop);
  }
  requestAnimationFrame(runSimulationLoop);

  // Vínculos de Controles de Escenario
  const scenarioBtns = document.querySelectorAll('.scenario-btn');
  scenarioBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      scenarioBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const scenario = btn.dataset.scenario;
      applyScenarioPreset(scenario);
    });
  });

  function applyScenarioPreset(key) {
    const p = window.currentParams;
    p.modelType = key;

    switch (key) {
      case 'periodic':
        p.R0 = 16.0;
        p.A = 12.0;
        p.period = 24.0;
        p.phi = 0.0;
        break;
      case 'accidental_pulse':
        p.R0 = 4.0;
        p.pulseMax = 65.0;
        p.tau = 4.5;
        break;
      case 'ramp_valve':
        p.R0 = 8.0;
        p.c1 = 1.8;
        p.c2 = 0.035;
        break;
      case 'mitigated':
        p.R0 = 5.0;
        p.pulseMax = 48.0;
        p.kDecay = 0.22;
        break;
    }

    syncControlInputsFromParams();
    window.currentSimTime = 0;
    updateDashboard();
  }

  // Sincronización bidireccional de Controles Deslizantes
  function bindSlider(id, paramKey, displayId, unit, decimals = 1) {
    const input = document.getElementById(id);
    const display = document.getElementById(displayId);
    if (!input) return;

    input.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      window.currentParams[paramKey] = val;
      if (display) display.textContent = val.toFixed(decimals) + (unit ? ' ' + unit : '');
      updateDashboard();
    });
  }

  bindSlider('sliderR0', 'R0', 'valR0', 'kg/h', 1);
  bindSlider('sliderParamA', 'A', 'valParamA', 'kg/h', 1);
  bindSlider('sliderTimeWindow', 'timeWindow', 'valTimeWindow', 'h', 0);
  bindSlider('sliderSteps', 'integrationSteps', 'valSteps', '', 0);
  bindSlider('sliderRiverFlow', 'riverFlow', 'valRiverFlow', 'm³/s', 0);
  bindSlider('sliderRiverSpeed', 'riverSpeed', 'valRiverSpeed', 'km/h', 1);

  // Selector de Método de Integración
  const methodSelect = document.getElementById('selectMethod');
  if (methodSelect) {
    methodSelect.addEventListener('change', (e) => {
      window.currentParams.integrationMethod = e.target.value;
      updateDashboard();
    });
  }

  function syncControlInputsFromParams() {
    const p = window.currentParams;
    const map = [
      { id: 'sliderR0', disp: 'valR0', val: p.R0, unit: 'kg/h', dec: 1 },
      { id: 'sliderParamA', disp: 'valParamA', val: p.A, unit: 'kg/h', dec: 1 },
      { id: 'sliderTimeWindow', disp: 'valTimeWindow', val: p.timeWindow, unit: 'h', dec: 0 },
      { id: 'sliderSteps', disp: 'valSteps', val: p.integrationSteps, unit: '', dec: 0 },
      { id: 'sliderRiverFlow', disp: 'valRiverFlow', val: p.riverFlow, unit: 'm³/s', dec: 0 },
      { id: 'sliderRiverSpeed', disp: 'valRiverSpeed', val: p.riverSpeed, unit: 'km/h', dec: 1 }
    ];

    map.forEach(item => {
      const el = document.getElementById(item.id);
      const d = document.getElementById(item.disp);
      if (el) el.value = item.val;
      if (d) d.textContent = item.val.toFixed(item.dec) + (item.unit ? ' ' + item.unit : '');
    });
  }

  // Botón Reproducir / Pausar Simulación
  const btnPlay = document.getElementById('btnPlayPause');
  if (btnPlay) {
    btnPlay.addEventListener('click', () => {
      isPlaying = !isPlaying;
      btnPlay.innerHTML = isPlaying ? '<span>⏸</span> Pausar' : '<span>▶</span> Reanudar';
    });
  }

  // Botón Reiniciar
  const btnReset = document.getElementById('btnResetSim');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      window.currentSimTime = 0;
      updateDashboard();
    });
  }

  // Audio Ambiental de Río Toggle
  const btnAudio = document.getElementById('btnAmbientAudio');
  if (btnAudio) {
    btnAudio.addEventListener('click', () => {
      const active = riverAudio.toggle();
      btnAudio.classList.toggle('active', active);
      btnAudio.title = active ? 'Sonido de Corriente Hídrica Activo' : 'Activar Sonido Fluvial Relajante';
    });
  }

  // Modal de Auditoría Ejecutiva y Dossier
  const btnReport = document.getElementById('btnOpenReport');
  const modalBackdrop = document.getElementById('reportModalBackdrop');
  const btnCloseModal = document.getElementById('btnCloseReport');
  const btnPrintModal = document.getElementById('btnPrintReport');
  const btnExportCSV = document.getElementById('btnExportCSV');

  if (btnReport && modalBackdrop) {
    btnReport.addEventListener('click', () => {
      populateExecutiveReport();
      modalBackdrop.classList.add('active');
    });

    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', () => {
        modalBackdrop.classList.remove('active');
      });
    }

    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) {
        modalBackdrop.classList.remove('active');
      }
    });

    if (btnPrintModal) {
      btnPrintModal.addEventListener('click', () => {
        window.print();
      });
    }

    if (btnExportCSV) {
      btnExportCSV.addEventListener('click', () => {
        exportSimulationCSV();
      });
    }
  }

  function populateExecutiveReport() {
    const params = window.currentParams;
    const tMax = params.timeWindow;
    const exactM = window.HydroMath.computeExactAccumulation(tMax, params);
    const intRes = window.HydroMath.integrate(tMax, params.integrationSteps, params.integrationMethod, params);

    let peakR = 0;
    for (let i = 0; i <= 60; i++) {
      const r = window.HydroMath.evaluateDischargeRate((i / 60) * tMax, params);
      if (r > peakR) peakR = r;
    }

    const assimilative = window.HydroMath.computeAssimilativeMetrics(exactM, peakR, params.riverFlow, params.regThreshold);

    const elDate = document.getElementById('dossierDate');
    if (elDate) elDate.textContent = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    const elDossierScenario = document.getElementById('dossierScenario');
    if (elDossierScenario) elDossierScenario.textContent = getScenarioLabel(params.modelType);

    const elDossierTotalM = document.getElementById('dossierTotalMass');
    if (elDossierTotalM) elDossierTotalM.textContent = exactM.toFixed(2) + ' kg (' + (exactM / 1000).toFixed(3) + ' t)';

    const elDossierPeak = document.getElementById('dossierPeakRate');
    if (elDossierPeak) elDossierPeak.textContent = peakR.toFixed(2) + ' kg/h';

    const elDossierCompliance = document.getElementById('dossierCompliance');
    if (elDossierCompliance) elDossierCompliance.textContent = assimilative.complianceScore + '% (' + (assimilative.status.toUpperCase()) + ')';

    const elDossierMethod = document.getElementById('dossierMethod');
    if (elDossierMethod) elDossierMethod.textContent = getMethodDisplayName(params.integrationMethod);

    const elDossierRelErr = document.getElementById('dossierRelError');
    if (elDossierRelErr) elDossierRelErr.textContent = intRes.relError.toFixed(4) + ' %';
  }

  function getScenarioLabel(type) {
    const map = {
      periodic: 'Ciclo Diurno Industrial Periódico',
      accidental_pulse: 'Derrame Transitorio de Alto Impacto',
      ramp_valve: 'Falla Progresiva de Compuerta de Retención',
      mitigated: 'Inyección de Neutralización y Mitigación Dinámica'
    };
    return map[type] || type;
  }

  function exportSimulationCSV() {
    const params = window.currentParams;
    const tMax = params.timeWindow;
    const steps = 100;
    let csv = 'Tiempo (h),Tasa de Vertido R(t) [kg/h],Masa Acumulada M(t) [kg],Conc 0.5km [mg/L],Conc 2.0km [mg/L],Conc 5.0km [mg/L]\n';

    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * tMax;
      const r = window.HydroMath.evaluateDischargeRate(t, params);
      const m = window.HydroMath.computeExactAccumulation(t, params);
      const c1 = window.HydroMath.computeRiverConcentration(0.5, t, params);
      const c2 = window.HydroMath.computeRiverConcentration(2.0, t, params);
      const c3 = window.HydroMath.computeRiverConcentration(5.0, t, params);

      csv += `${t.toFixed(2)},${r.toFixed(3)},${m.toFixed(3)},${c1.toFixed(3)},${c2.toFixed(3)},${c3.toFixed(3)}\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Auditoria_Hidrica_LucasTapia_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Primer renderizado del sistema
  syncControlInputsFromParams();
  updateDashboard();
});
