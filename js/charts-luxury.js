/**
 * AQUA-METRIC LUXE | High-Definition Canvas Chart Engine
 * Director Científico: Lucas Tapia
 * 
 * Gráficos de instrumentación científica para Cálculo Integral y Masa Acumulada
 * Diseño: Blanco natural, rejilla limpia y curvas con colores vivos de alto contraste.
 */

class LuxuryChartEngine {
  constructor(canvasRateId, canvasMassId) {
    this.rateCanvas = document.getElementById(canvasRateId);
    this.massCanvas = document.getElementById(canvasMassId);
    this.dpr = window.devicePixelRatio || 1;

    this.initCanvases();
    this.bindWindowResize();
  }

  initCanvases() {
    [this.rateCanvas, this.massCanvas].forEach(c => {
      if (!c) return;
      const rect = c.getBoundingClientRect();
      c.width = rect.width * this.dpr;
      c.height = (rect.height || 230) * this.dpr;
      const ctx = c.getContext('2d');
      ctx.scale(this.dpr, this.dpr);
    });
  }

  bindWindowResize() {
    window.addEventListener('resize', () => {
      this.initCanvases();
      if (window.renderDashboard) {
        window.renderDashboard();
      }
    });
  }

  /**
   * Renderiza el gráfico de Tasa de Vertido R(t) con particiones de integración
   */
  renderRateChart(params, integrationResult, currentHour) {
    if (!this.rateCanvas) return;
    const ctx = this.rateCanvas.getContext('2d');
    const rect = this.rateCanvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height || 230;

    ctx.clearRect(0, 0, w, h);

    const padLeft = 55;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 35;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const tMax = params.timeWindow || 24;
    let rMax = 10;
    const sampleCount = 100;
    for (let i = 0; i <= sampleCount; i++) {
      const t = (i / sampleCount) * tMax;
      const r = window.HydroMath.evaluateDischargeRate(t, params);
      if (r > rMax) rMax = r;
    }
    rMax = Math.ceil(rMax * 1.25);

    const toScreenX = (t) => padLeft + (t / tMax) * plotW;
    const toScreenY = (r) => padTop + plotH - (r / rMax) * plotH;

    // 1. Rejilla y Ejes limpios de alta legibilidad
    this.drawGridAndAxes(ctx, padLeft, padTop, plotW, plotH, tMax, rMax, 'h', 'kg/h');

    // 2. Particiones de Integración Numérica (Sumas de Riemann / Trapecios)
    if (integrationResult && integrationResult.slices && params.integrationMethod !== 'exact') {
      this.drawNumericalSlices(ctx, integrationResult.slices, toScreenX, toScreenY, padTop + plotH);
    }

    // 3. Área sombreada analítica bajo la curva (Gradiente Esmeralda Vivo)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(toScreenX(0), toScreenY(0));
    for (let i = 0; i <= sampleCount; i++) {
      const t = (i / sampleCount) * tMax;
      const r = window.HydroMath.evaluateDischargeRate(t, params);
      ctx.lineTo(toScreenX(t), toScreenY(r));
    }
    ctx.lineTo(toScreenX(tMax), toScreenY(0));
    ctx.closePath();

    const areaGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    areaGrad.addColorStop(0, 'rgba(140, 133, 120, 0.22)');
    areaGrad.addColorStop(1, 'rgba(140, 133, 120, 0.02)');
    ctx.fillStyle = areaGrad;
    ctx.fill();
    ctx.restore();

    // 4. Curva continua R(t) - Esmeralda brillante de alto contraste
    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = 2.8;
    ctx.strokeStyle = '#393832';
    for (let i = 0; i <= sampleCount; i++) {
      const t = (i / sampleCount) * tMax;
      const r = window.HydroMath.evaluateDischargeRate(t, params);
      const x = toScreenX(t);
      const y = toScreenY(r);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // 5. Línea de tiempo actual t_now (Azul vibrante)
    if (currentHour !== undefined && currentHour <= tMax) {
      const curX = toScreenX(currentHour);
      const curR = window.HydroMath.evaluateDischargeRate(currentHour, params);
      const curY = toScreenY(curR);

      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#706959';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(curX, padTop);
      ctx.lineTo(curX, padTop + plotH);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = '#171715';
      ctx.beginPath();
      ctx.arc(curX, curY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#393832';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.fillText(`${curR.toFixed(1)} kg/h`, curX + 8, Math.max(padTop + 14, curY - 6));
      ctx.restore();
    }
  }

  /**
   * Renderiza el gráfico de Masa Acumulada M(t)
   */
  renderMassChart(params, currentHour) {
    if (!this.massCanvas) return;
    const ctx = this.massCanvas.getContext('2d');
    const rect = this.massCanvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height || 230;

    ctx.clearRect(0, 0, w, h);

    const padLeft = 65;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 35;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const tMax = params.timeWindow || 24;
    const totalMass = window.HydroMath.computeExactAccumulation(tMax, params);
    const mMax = Math.ceil(totalMass * 1.25) || 100;

    const toScreenX = (t) => padLeft + (t / tMax) * plotW;
    const toScreenY = (m) => padTop + plotH - (m / mMax) * plotH;

    // 1. Rejilla y Ejes limpios
    this.drawGridAndAxes(ctx, padLeft, padTop, plotW, plotH, tMax, mMax, 'h', 'kg');

    // 2. Línea de Umbral Regulatorio de Alerta (Coral vivo)
    const regThresholdKg = params.regulatoryCapKg || (totalMass * 0.85);
    const threshY = toScreenY(regThresholdKg);
    if (threshY >= padTop && threshY <= padTop + plotH) {
      ctx.save();
      ctx.strokeStyle = '#8c8578';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(padLeft, threshY);
      ctx.lineTo(padLeft + plotW, threshY);
      ctx.stroke();

      ctx.fillStyle = '#625d55';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.fillText(`LÍMITE AMBIENTAL (${regThresholdKg.toFixed(0)} kg)`, padLeft + 10, threshY - 6);
      ctx.restore();
    }

    // 3. Curva acumulada M(t) = \int R(t) dt (Azul Océano Vivo)
    ctx.save();
    const sampleCount = 100;

    ctx.beginPath();
    ctx.moveTo(toScreenX(0), toScreenY(0));
    for (let i = 0; i <= sampleCount; i++) {
      const t = (i / sampleCount) * tMax;
      const m = window.HydroMath.computeExactAccumulation(t, params);
      ctx.lineTo(toScreenX(t), toScreenY(m));
    }
    ctx.lineTo(toScreenX(tMax), toScreenY(0));
    ctx.closePath();

    const massGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    massGrad.addColorStop(0, 'rgba(140, 133, 120, 0.22)');
    massGrad.addColorStop(1, 'rgba(140, 133, 120, 0.02)');
    ctx.fillStyle = massGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.lineWidth = 2.8;
    ctx.strokeStyle = '#171715';
    for (let i = 0; i <= sampleCount; i++) {
      const t = (i / sampleCount) * tMax;
      const m = window.HydroMath.computeExactAccumulation(t, params);
      const x = toScreenX(t);
      const y = toScreenY(m);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // 4. Marcador de tiempo actual y masa acumulada
    if (currentHour !== undefined && currentHour <= tMax) {
      const curX = toScreenX(currentHour);
      const curM = window.HydroMath.computeExactAccumulation(currentHour, params);
      const curY = toScreenY(curM);

      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#625d55';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(curX, padTop);
      ctx.lineTo(curX, padTop + plotH);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = '#171715';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(curX, curY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#393832';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.fillText(`${curM.toFixed(1)} kg`, curX + 8, Math.max(padTop + 14, curY - 6));
      ctx.restore();
    }
  }

  drawGridAndAxes(ctx, x0, y0, w, h, xMax, yMax, xUnit, yUnit) {
    ctx.save();
    ctx.strokeStyle = '#e1ddd3';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#706d65';
    ctx.font = '9px JetBrains Mono, monospace';

    // Líneas horizontales
    const yDivs = 4;
    for (let i = 0; i <= yDivs; i++) {
      const yVal = (yMax / yDivs) * i;
      const y = y0 + h - (i / yDivs) * h;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + w, y);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.fillText(yVal.toFixed(0) + ' ' + yUnit, x0 - 8, y + 3);
    }

    // Líneas verticales
    const xDivs = 6;
    for (let i = 0; i <= xDivs; i++) {
      const xVal = (xMax / xDivs) * i;
      const x = x0 + (i / xDivs) * w;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + h);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillText(xVal.toFixed(0) + ' ' + xUnit, x, y0 + h + 16);
    }

    ctx.restore();
  }

  drawNumericalSlices(ctx, slices, toScreenX, toScreenY, baseScreenY) {
    ctx.save();
    ctx.lineWidth = 1;

    slices.forEach((s) => {
      if (s.method === 'trapezoidal') {
        const x1 = toScreenX(s.x1);
        const y1 = toScreenY(s.y1);
        const x2 = toScreenX(s.x2);
        const y2 = toScreenY(s.y2);

        ctx.fillStyle = 'rgba(140, 133, 120, 0.12)';
        ctx.strokeStyle = '#706959';
        ctx.beginPath();
        ctx.moveTo(x1, baseScreenY);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2, baseScreenY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        const sx = toScreenX(s.x);
        const sw = toScreenX(s.x + s.w) - sx;
        const sy = toScreenY(s.h);
        const sh = baseScreenY - sy;

        ctx.fillStyle = 'rgba(140, 133, 120, 0.12)';
        ctx.strokeStyle = '#706959';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeRect(sx, sy, sw, sh);
      }
    });

    ctx.restore();
  }
}

window.LuxuryCharts = LuxuryChartEngine;
