/**
 * AQUA-METRIC LUXE | Hydrodynamic 2D River Simulation Canvas
 * Director Científico: Lucas Tapia
 * 
 * Simulación en tiempo real de corriente fluvial, vertido industrial,
 * dispersión advectiva-difusiva y telemetría de boyas sensoriales IoT.
 */

class RiverSimulationCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    // Partículas de agua y contaminante
    this.waterParticles = [];
    this.contaminantParticles = [];
    this.maxContaminants = 650;
    this.maxWaterParticles = 120;

    // Estado del río y parámetros
    this.currentSimTime = 0; // tiempo transcurrido en horas de simulación
    this.simSpeed = 0.5; // aceleración de simulación
    this.isRunning = true;
    this.dpr = window.devicePixelRatio || 1;

    // Boyas de monitoreo sensorial (distancias normalizadas y en km)
    this.probes = [
      { id: 'alpha', name: 'Boya Alpha (0.5 km)', normX: 0.28, normY: 0.5, distKm: 0.5, val: 0, status: 'safe' },
      { id: 'beta', name: 'Boya Beta (2.0 km)', normX: 0.58, normY: 0.52, distKm: 2.0, val: 0, status: 'safe' },
      { id: 'gamma', name: 'Boya Gamma (5.0 km)', normX: 0.88, normY: 0.48, distKm: 5.0, val: 0, status: 'safe' }
    ];

    // Interacción táctil / ratón
    this.hoverPos = null;
    this.activeProbe = null;

    this.initCanvasSize();
    this.initParticles();
    this.bindEvents();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initCanvasSize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height || 320;

    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
  }

  initParticles() {
    // Inicializar corrientes de agua de fondo
    this.waterParticles = [];
    for (let i = 0; i < this.maxWaterParticles; i++) {
      this.waterParticles.push({
        x: Math.random() * this.width,
        y: 40 + Math.random() * (this.height - 80),
        speed: 1.2 + Math.random() * 1.8,
        length: 15 + Math.random() * 30,
        opacity: 0.15 + Math.random() * 0.25,
        depth: Math.random()
      });
    }

    this.contaminantParticles = [];
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.initCanvasSize();
      this.initParticles();
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.hoverPos = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverPos = null;
    });

    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Verificar si clic en una boya
      for (const p of this.probes) {
        const px = p.normX * this.width;
        const py = p.normY * this.height;
        const dist = Math.hypot(clickX - px, clickY - py);
        if (dist < 22) {
          this.activeProbe = p;
          if (window.onProbeSelect) {
            window.onProbeSelect(p);
          }
          break;
        }
      }
    });
  }

  /**
   * Genera nuevas partículas de contaminante según el valor R(t) actual
   */
  emitContaminant(currentRateKgH, riverParams) {
    if (currentRateKgH <= 0.1) return;

    // Emisión proporcional a R(t)
    const baseEmitCount = Math.min(6, Math.max(1, Math.floor(currentRateKgH / 12)));
    const pipeX = 65; // Salida del emisario industrial
    const pipeY = this.height * 0.46;

    for (let i = 0; i < baseEmitCount; i++) {
      if (this.contaminantParticles.length >= this.maxContaminants) {
        this.contaminantParticles.shift(); // Reciclar partícula más antigua
      }

      const streamSpeed = (riverParams.riverSpeed || 2.5) * 1.2;
      this.contaminantParticles.push({
        x: pipeX + (Math.random() - 0.5) * 8,
        y: pipeY + (Math.random() - 0.5) * 10,
        vx: streamSpeed * (0.8 + Math.random() * 0.5),
        vy: (Math.random() - 0.5) * 0.8, // Difusión turbulenta lateral
        age: 0,
        maxLife: 260 + Math.random() * 120,
        radius: 2 + Math.random() * 2.8,
        initialRate: currentRateKgH
      });
    }
  }

  update(params, currentHour) {
    this.currentSimTime = currentHour;
    const currentRate = window.HydroMath ? window.HydroMath.evaluateDischargeRate(currentHour, params) : 20;

    // Emitir partículas
    this.emitContaminant(currentRate, params);

    // Actualizar partículas de agua
    const riverFlowSpeed = (params.riverSpeed || 2.5) * 0.8;
    for (const wp of this.waterParticles) {
      wp.x += wp.speed * riverFlowSpeed * 0.45;
      if (wp.x > this.width + 50) {
        wp.x = -50;
        wp.y = 40 + Math.random() * (this.height - 80);
      }
    }

    // Actualizar partículas contaminantes (Advección + Difusión 2D)
    const riverBedTop = 38;
    const riverBedBottom = this.height - 38;

    for (let i = this.contaminantParticles.length - 1; i >= 0; i--) {
      const p = this.contaminantParticles[i];
      p.age++;

      // Movimiento advectivo hacia la derecha
      p.x += p.vx * 0.65;
      // Difusión browniana / turbulenta lateral
      p.y += p.vy + (Math.random() - 0.5) * 0.6;
      p.radius += 0.015; // Expansión de la pluma transversal

      // Rebote suave en riberas
      if (p.y < riverBedTop + 10) {
        p.y = riverBedTop + 10;
        p.vy *= -0.7;
      } else if (p.y > riverBedBottom - 10) {
        p.y = riverBedBottom - 10;
        p.vy *= -0.7;
      }

      // Eliminar al salir del canvas o expirar
      if (p.x > this.width + 20 || p.age > p.maxLife) {
        this.contaminantParticles.splice(i, 1);
      }
    }

    // Actualizar concentraciones en boyas
    for (const probe of this.probes) {
      const val = window.HydroMath ? window.HydroMath.computeRiverConcentration(probe.distKm, currentHour, params) : 0;
      probe.val = val;
      const regLimit = params.regThreshold || 15.0;
      if (val > regLimit * 1.1) {
        probe.status = 'danger';
      } else if (val > regLimit * 0.7) {
        probe.status = 'warn';
      } else {
        probe.status = 'safe';
      }
    }
  }

  render(params) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Fondo del lecho fluvial con gradiente hidrológico de lujo
    const riverGrad = ctx.createLinearGradient(0, 0, 0, this.height);
    riverGrad.addColorStop(0, '#040914');
    riverGrad.addColorStop(0.12, '#061329');
    riverGrad.addColorStop(0.5, '#091c36');
    riverGrad.addColorStop(0.88, '#061329');
    riverGrad.addColorStop(1, '#040914');
    ctx.fillStyle = riverGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // 2. Riberas del río (Bordes orgánicos estilizados)
    this.renderRiverBanks(ctx);

    // 3. Corrientes dinámicas de agua límpida
    ctx.lineWidth = 1.2;
    for (const wp of this.waterParticles) {
      ctx.strokeStyle = `rgba(0, 217, 245, ${wp.opacity * 0.35})`;
      ctx.beginPath();
      ctx.moveTo(wp.x, wp.y);
      ctx.lineTo(wp.x + wp.length, wp.y);
      ctx.stroke();
    }

    // 4. Pluma de contaminación (Partículas dispersas con brillo reactivo)
    this.renderContaminantPlume(ctx);

    // 5. Tubería emisaria industrial (Outfall pipe de lujo con detalles dorados)
    this.renderOutfallFacility(ctx);

    // 6. Boyas de monitoreo sensorial IoT
    this.renderProbes(ctx);

    // 7. Cursor HUD si sobrevuela
    if (this.hoverPos) {
      this.renderHoverTelemetry(ctx, params);
    }
  }

  renderRiverBanks(ctx) {
    // Ribera superior
    ctx.fillStyle = '#080d1a';
    ctx.fillRect(0, 0, this.width, 36);

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 36);
    ctx.bezierCurveTo(this.width * 0.3, 33, this.width * 0.7, 39, this.width, 36);
    ctx.stroke();

    // Ribera inferior
    ctx.fillStyle = '#080d1a';
    ctx.fillRect(0, this.height - 36, this.width, 36);

    ctx.beginPath();
    ctx.moveTo(0, this.height - 36);
    ctx.bezierCurveTo(this.width * 0.3, this.height - 39, this.width * 0.7, this.height - 33, this.width, this.height - 36);
    ctx.stroke();

    // Indicador sutil de dirección de corriente fluvial
    ctx.fillStyle = 'rgba(203, 213, 225, 0.4)';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText('DIRECCIÓN DE CORRIENTE FLUVIAL (ADVECCIÓN) ➔', this.width * 0.42, 24);
  }

  renderOutfallFacility(ctx) {
    const pipeX = 65;
    const pipeY = this.height * 0.46;

    // Emisario industrial de acero y acentos dorados
    ctx.save();
    ctx.fillStyle = '#101a2e';
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.6)';
    ctx.lineWidth = 2;

    // Tubería
    ctx.beginPath();
    ctx.roundRect(10, pipeY - 14, 55, 28, [0, 8, 8, 0]);
    ctx.fill();
    ctx.stroke();

    // Anillos dorados de la válvula
    ctx.strokeStyle = '#d4af37';
    ctx.beginPath();
    ctx.moveTo(35, pipeY - 14);
    ctx.lineTo(35, pipeY + 14);
    ctx.moveTo(50, pipeY - 14);
    ctx.lineTo(50, pipeY + 14);
    ctx.stroke();

    // Boca de vertido
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.arc(pipeX, pipeY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Etiqueta emisario
    ctx.fillStyle = '#f3e5ab';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillText('VERTEDERO R(t)', 12, pipeY - 19);
    ctx.restore();
  }

  renderContaminantPlume(ctx) {
    for (const p of this.contaminantParticles) {
      const lifeRatio = 1 - (p.age / p.maxLife);
      const intensity = Math.min(1, p.initialRate / 50);

      // Paleta de degradado de contaminante: Púrpura/Carmesí a Ámbar a Cian disperso
      let color;
      if (p.x < 220) {
        // Cerca del origen: muy concentrado
        color = `rgba(255, 77, 109, ${lifeRatio * 0.75})`;
      } else if (p.x < 480) {
        // Zona media: mezcla reactiva
        color = `rgba(255, 183, 3, ${lifeRatio * 0.65})`;
      } else {
        // Zona lejana: atenuado y disperso
        color = `rgba(0, 217, 245, ${lifeRatio * 0.5})`;
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderProbes(ctx) {
    for (const probe of this.probes) {
      const px = probe.normX * this.width;
      const py = probe.normY * this.height;

      ctx.save();
      // Halo de estado de la boya
      let statusColor = '#00f5a0';
      if (probe.status === 'warn') statusColor = '#ffb703';
      if (probe.status === 'danger') statusColor = '#ff4d6d';

      ctx.strokeStyle = statusColor;
      ctx.fillStyle = '#0b1326';
      ctx.lineWidth = 2;

      // Anillo radiante
      ctx.beginPath();
      ctx.arc(px, py, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Centro luminoso
      ctx.fillStyle = statusColor;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();

      // Etiqueta flotante de telemetría de lujo
      const valStr = probe.val.toFixed(2) + ' mg/L';
      ctx.fillStyle = 'rgba(6, 11, 24, 0.88)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(px - 50, py - 46, 100, 26, 6);
      ctx.fill();
      ctx.stroke();

      // Texto de etiqueta
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 9px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(probe.name.split(' (')[0], px, py - 32);

      ctx.fillStyle = statusColor;
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.fillText(valStr, px, py - 22);

      ctx.restore();
    }
  }

  renderHoverTelemetry(ctx, params) {
    const hx = this.hoverPos.x;
    const hy = this.hoverPos.y;

    // Solo dentro del río
    if (hy < 36 || hy > this.height - 36 || hx < 65) return;

    // Calcular distancia estimada proporcional
    const riverLengthKm = 6.0;
    const distKm = ((hx - 65) / (this.width - 65)) * riverLengthKm;
    const localConc = window.HydroMath ? window.HydroMath.computeRiverConcentration(distKm, this.currentSimTime, params) : 0;

    ctx.save();
    ctx.fillStyle = 'rgba(4, 8, 18, 0.92)';
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(hx + 12, hy - 35, 130, 48, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#d4af37';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillText(`SONDA VIRTUAL [${distKm.toFixed(2)} km]`, hx + 20, hy - 20);

    ctx.fillStyle = '#00f5a0';
    ctx.font = 'bold 12px JetBrains Mono, monospace';
    ctx.fillText(`${localConc.toFixed(2)} mg/L`, hx + 20, hy - 4);
    ctx.restore();
  }

  animate() {
    if (this.isRunning && window.currentParams) {
      this.update(window.currentParams, window.currentSimTime || 0);
      this.render(window.currentParams);
    }
    requestAnimationFrame(this.animate);
  }
}

window.RiverCanvas = RiverSimulationCanvas;
