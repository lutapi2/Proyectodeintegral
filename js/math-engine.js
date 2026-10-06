/**
 * AQUA-METRIC LUXE | Scientific Computational Core
 * Director Científico: Lucas Tapia
 * 
 * Modelado matemático de acumulación de contaminantes en fuentes hídricas:
 * M(t) = \int_{0}^{t} R(\tau) d\tau
 */

class HydroMathEngine {
  constructor() {
    this.methods = {
      EXACT: 'exact',
      SIMPSON: 'simpson',
      TRAPEZOIDAL: 'trapezoidal',
      MIDPOINT: 'midpoint',
      RIEMANN_LEFT: 'riemann_left',
      RIEMANN_RIGHT: 'riemann_right'
    };
  }

  /**
   * Evalúa la tasa de vertido instantánea R(t) [kg/h]
   * @param {number} t - Tiempo en horas
   * @param {object} params - Parámetros del modelo
   * @returns {number} R(t) en kg/h
   */
  evaluateDischargeRate(t, params) {
    if (t < 0) return 0;
    const { modelType, R0, A, period, phi, tau, pulseMax, c1, c2, kDecay } = params;

    switch (modelType) {
      case 'periodic': {
        // Ciclo diurno industrial
        const omega = (2 * Math.PI) / (period || 24);
        const val = R0 + A * Math.sin(omega * t + (phi || 0));
        return Math.max(0, val);
      }

      case 'accidental_pulse': {
        // Derrame transitorio tipo Gamma / Surge
        // R(t) = R0 + pulseMax * (t / tau) * exp(1 - t / tau)
        // El pico ocurre exactamente en t = tau con valor R0 + pulseMax
        const tEff = t;
        const tauVal = Math.max(0.1, tau || 6);
        const pulse = pulseMax * (tEff / tauVal) * Math.exp(1 - (tEff / tauVal));
        return Math.max(0, R0 + (pulse >= 0 ? pulse : 0));
      }

      case 'ramp_valve': {
        // Crecimiento polinómico con falla de compuerta y estabilización
        const quad = R0 + (c1 || 1.2) * t + (c2 || 0.05) * Math.pow(t, 2);
        return Math.max(0, quad);
      }

      case 'mitigated': {
        // Descarga inicial con mitigación/neutralización activa exponencial
        const decay = Math.exp(-(kDecay || 0.15) * t);
        return Math.max(0, R0 + (pulseMax || 40) * decay);
      }

      default:
        return Math.max(0, R0);
    }
  }

  /**
   * Cálculo de la integral analítica exacta M(t) [kg]
   * M(t) = \int_0^t R(\tau) d\tau
   */
  computeExactAccumulation(t, params) {
    if (t <= 0) return 0;
    const { modelType, R0, A, period, phi, tau, pulseMax, c1, c2, kDecay } = params;

    switch (modelType) {
      case 'periodic': {
        const omega = (2 * Math.PI) / (period || 24);
        const p = phi || 0;
        // \int [R0 + A*sin(omega*tau + p)] dtau = R0*t - (A/omega)*[cos(omega*t + p) - cos(p)]
        const baseMass = R0 * t;
        const oscMass = -(A / omega) * (Math.cos(omega * t + p) - Math.cos(p));
        return Math.max(0, baseMass + oscMass);
      }

      case 'accidental_pulse': {
        const tauVal = Math.max(0.1, tau || 6);
        // \int [ (t/tau)*exp(1 - t/tau) ] dt = e * [ tau - (t + tau)*exp(-t/tau) ]
        const eConstant = Math.E;
        const pulseIntegral = pulseMax * eConstant * (tauVal - (t + tauVal) * Math.exp(-t / tauVal));
        return Math.max(0, R0 * t + pulseIntegral);
      }

      case 'ramp_valve': {
        const c1Val = c1 || 1.2;
        const c2Val = c2 || 0.05;
        // \int [R0 + c1*t + c2*t^2] dt = R0*t + (c1/2)*t^2 + (c2/3)*t^3
        return Math.max(0, R0 * t + (c1Val / 2) * Math.pow(t, 2) + (c2Val / 3) * Math.pow(t, 3));
      }

      case 'mitigated': {
        const k = Math.max(0.001, kDecay || 0.15);
        const pMax = pulseMax || 40;
        // \int [R0 + pMax*exp(-k*t)] dt = R0*t + (pMax/k)*(1 - exp(-k*t))
        return Math.max(0, R0 * t + (pMax / k) * (1 - Math.exp(-k * t)));
      }

      default:
        return R0 * t;
    }
  }

  /**
   * Integración numérica según el método seleccionado
   * @param {number} tEnd - Límite superior de integración
   * @param {number} steps - Número de subdivisiones n
   * @param {string} method - Método de aproximación
   * @param {object} params - Parámetros del modelo
   * @returns {object} { value: number, partitions: Array<{x: number, y: number, w: number, h: number}> }
   */
  integrate(tEnd, steps, method, params) {
    const n = Math.max(2, Math.floor(steps));
    const dt = tEnd / n;
    let sum = 0;
    const slices = [];

    switch (method) {
      case this.methods.RIEMANN_LEFT: {
        for (let i = 0; i < n; i++) {
          const ti = i * dt;
          const fi = this.evaluateDischargeRate(ti, params);
          sum += fi * dt;
          slices.push({ x: ti, y: fi, w: dt, h: fi, method: 'left' });
        }
        break;
      }

      case this.methods.RIEMANN_RIGHT: {
        for (let i = 1; i <= n; i++) {
          const ti = i * dt;
          const fi = this.evaluateDischargeRate(ti, params);
          sum += fi * dt;
          slices.push({ x: (i - 1) * dt, y: fi, w: dt, h: fi, method: 'right' });
        }
        break;
      }

      case this.methods.MIDPOINT: {
        for (let i = 0; i < n; i++) {
          const tMid = (i + 0.5) * dt;
          const fMid = this.evaluateDischargeRate(tMid, params);
          sum += fMid * dt;
          slices.push({ x: i * dt, y: fMid, w: dt, h: fMid, method: 'midpoint' });
        }
        break;
      }

      case this.methods.TRAPEZOIDAL: {
        for (let i = 0; i < n; i++) {
          const t1 = i * dt;
          const t2 = (i + 1) * dt;
          const f1 = this.evaluateDischargeRate(t1, params);
          const f2 = this.evaluateDischargeRate(t2, params);
          const trapArea = ((f1 + f2) / 2) * dt;
          sum += trapArea;
          slices.push({ x1: t1, y1: f1, x2: t2, y2: f2, w: dt, area: trapArea, method: 'trapezoidal' });
        }
        break;
      }

      case this.methods.SIMPSON: {
        // Regla de Simpson 1/3 compuesta (requiere n par)
        const evenN = n % 2 === 0 ? n : n + 1;
        const h = tEnd / evenN;
        let s = this.evaluateDischargeRate(0, params) + this.evaluateDischargeRate(tEnd, params);

        for (let i = 1; i < evenN; i++) {
          const ti = i * h;
          const fi = this.evaluateDischargeRate(ti, params);
          s += (i % 2 === 0 ? 2 : 4) * fi;
        }
        sum = (h / 3) * s;

        // Para representación visual de soporte
        for (let i = 0; i < evenN; i += 2) {
          const t1 = i * h;
          const t2 = (i + 2) * h;
          slices.push({ x1: t1, x2: t2, method: 'simpson' });
        }
        break;
      }

      case this.methods.EXACT:
      default: {
        sum = this.computeExactAccumulation(tEnd, params);
        break;
      }
    }

    const exactVal = this.computeExactAccumulation(tEnd, params);
    const absError = Math.abs(sum - exactVal);
    const relError = exactVal > 0 ? (absError / exactVal) * 100 : 0;

    return {
      value: sum,
      exactValue: exactVal,
      absError: absError,
      relError: relError,
      slices: slices,
      dt: dt,
      n: n
    };
  }

  /**
   * Modela la concentración local en el río C(x, t) [mg/L o g/m³]
   * Considerando advección fluvial con velocidad u, dispersión D_L y decaimiento k
   * C_mezcla_inicial(t) = R(t) / (Q_rio + Q_desecho)
   */
  computeRiverConcentration(xDistKm, tHour, params) {
    const { riverFlow, riverSpeed, kBiochem } = params; // riverFlow en m³/s, riverSpeed en km/h
    const u = riverSpeed || 2.5; // km/h
    const Qrio_m3_h = (riverFlow || 45) * 3600; // m³/h

    // Tiempo de retardo advectivo hasta la distancia x
    const transitTime = xDistKm / u; // horas
    const injectionTime = tHour - transitTime;

    if (injectionTime < 0) {
      return 0; // La pluma aún no alcanza esta distancia
    }

    // Tasa vertida en el momento t - transitTime (kg/h)
    const R_eff = this.evaluateDischargeRate(injectionTime, params); // kg/h
    const R_eff_g_h = R_eff * 1000; // g/h

    // Concentración inicial en sección transversal (g/m³ = mg/L)
    const C0 = R_eff_g_h / Qrio_m3_h;

    // Decaimiento biológico / fotolítico / absorción: exp(-k * transitTime)
    const k = kBiochem || 0.04; // 1/h
    const attenuation = Math.exp(-k * transitTime);

    return Math.max(0, C0 * attenuation);
  }

  /**
   * Índice de Calidad y Capacidad de Asimilación Ambiental (Executive KPI)
   */
  computeAssimilativeMetrics(totalMassKg, peakRateKgH, riverFlowM3s, regThresholdPpm) {
    // Concentración media estimada en el régimen
    const totalVolumeM3 = riverFlowM3s * 3600 * 24; // 24h base
    const avgConcentrationMgL = (totalMassKg * 1000) / totalVolumeM3;
    const peakConcentrationMgL = (peakRateKgH * 1000) / (riverFlowM3s * 3600);

    const threshold = regThresholdPpm || 15.0; // Límite normativo típico mg/L
    const hazardRatio = (peakConcentrationMgL / threshold);

    let status = 'safe';
    let complianceScore = 100;

    if (hazardRatio > 1.2) {
      status = 'danger';
      complianceScore = Math.max(10, Math.round(100 - (hazardRatio - 1) * 60));
    } else if (hazardRatio > 0.75) {
      status = 'warn';
      complianceScore = Math.round(100 - (hazardRatio - 0.75) * 80);
    }

    return {
      avgConcentration: avgConcentrationMgL,
      peakConcentration: peakConcentrationMgL,
      hazardRatio: hazardRatio,
      complianceScore: Math.min(100, Math.max(0, complianceScore)),
      status: status
    };
  }
}

// Instancia global
window.HydroMath = new HydroMathEngine();
