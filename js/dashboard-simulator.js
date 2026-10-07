document.addEventListener('DOMContentLoaded', () => {
  const tabButtons = [...document.querySelectorAll('[role="tab"]')];
  const tabPanels = tabButtons.map(button => document.getElementById(button.getAttribute('aria-controls')));
  const form = document.getElementById('spillForm');
  const chartCanvas = document.getElementById('spillMassChart');
  const historyBody = document.getElementById('scenarioHistory');
  const scenarios = [];
  let spillChart = null;

  function activateTab(activeButton) {
    tabButtons.forEach((button, index) => {
      const selected = button === activeButton;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      tabPanels[index].hidden = !selected;
    });

    if (activeButton.id === 'tabCharts') {
      window.dispatchEvent(new Event('resize'));
      if (spillChart) {
        spillChart.resize();
        spillChart.update('none');
      }
    }
  }

  tabButtons.forEach((button, index) => {
    button.addEventListener('click', () => activateTab(button));
    button.addEventListener('keydown', event => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === 'Home' ? 0
        : event.key === 'End' ? tabButtons.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabButtons.length) % tabButtons.length;
      tabButtons[nextIndex].focus();
      activateTab(tabButtons[nextIndex]);
    });
  });

  const fields = [
    { key: 'flow', range: 'flowRange', input: 'flowInput', display: 'flowValue', unit: 'm³/h', decimals: 2 },
    { key: 'concentration', range: 'concentrationRange', input: 'concentrationInput', display: 'concentrationValue', unit: 'mg/L', decimals: 1 },
    { key: 'time', range: 'timeRange', input: 'timeInput', display: 'timeValue', unit: 'h', decimals: 1 }
  ];

  function readValues() {
    const values = {};
    for (const field of fields) {
      const input = document.getElementById(field.input);
      const value = Number(input.value);
      if (!input.value || !Number.isFinite(value) || !input.checkValidity()) return null;
      values[field.key] = value;
    }
    return values;
  }

  function formatNumber(value, decimals = 3) {
    return value.toLocaleString('es-ES', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function drawFallbackChart(values, rateKgPerHour) {
    const rect = chartCanvas.getBoundingClientRect();
    const width = rect.width || 640;
    const height = rect.height || 240;
    const ratio = window.devicePixelRatio || 1;
    chartCanvas.width = width * ratio;
    chartCanvas.height = height * ratio;
    const context = chartCanvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const padding = { top: 16, right: 18, bottom: 32, left: 54 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const maxMass = Math.max(rateKgPerHour * values.time, 0.001) * 1.1;
    context.strokeStyle = '#d5d0c5';
    context.fillStyle = '#706d65';
    context.font = '12px sans-serif';
    context.beginPath();
    context.moveTo(padding.left, padding.top);
    context.lineTo(padding.left, padding.top + plotHeight);
    context.lineTo(padding.left + plotWidth, padding.top + plotHeight);
    context.stroke();
    context.beginPath();
    context.strokeStyle = '#171715';
    context.lineWidth = 2.5;
    context.moveTo(padding.left, padding.top + plotHeight);
    context.lineTo(padding.left + plotWidth, padding.top);
    context.stroke();
    context.fillText('0 kg', 8, padding.top + plotHeight);
    context.fillText(`${formatNumber(maxMass, 2)} kg`, 8, padding.top + 12);
    context.fillText('0 h', padding.left, height - 8);
    context.fillText(`${formatNumber(values.time, 1)} h`, padding.left + plotWidth - 38, height - 8);
  }

  function renderChart(values, rateKgPerHour) {
    const labels = Array.from({ length: 41 }, (_, index) => values.time * index / 40);
    const data = labels.map(time => rateKgPerHour * time);
    const summary = document.getElementById('spillChartSummary');
    summary.textContent = `R = ${formatNumber(rateKgPerHour, 4)} kg/h · M(${formatNumber(values.time, 1)} h) = ${formatNumber(data[data.length - 1], 4)} kg`;

    if (typeof window.Chart !== 'function') {
      drawFallbackChart(values, rateKgPerHour);
      return;
    }

    const chartData = {
      datasets: [{
        label: 'Masa acumulada M(t) [kg]',
        data: labels.map((time, index) => ({ x: time, y: data[index] })),
        borderColor: '#171715',
        backgroundColor: 'rgba(140, 133, 120, 0.16)',
        borderWidth: 2.5,
        fill: true,
        pointRadius: context => context.dataIndex === data.length - 1 ? 4 : 0,
        pointBackgroundColor: '#171715',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointHitRadius: 8,
        tension: 0
      }]
    };

    if (!spillChart) {
      spillChart = new window.Chart(chartCanvas, {
        type: 'line',
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          parsing: false,
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            legend: {
              labels: { color: '#393832', usePointStyle: true, boxWidth: 10 }
            },
            tooltip: {
              backgroundColor: '#171715',
              titleColor: '#f4f0e6',
              bodyColor: '#fff',
              borderColor: '#8c8578',
              borderWidth: 1,
              callbacks: {
                label: context => `t = ${formatNumber(context.raw.x, 1)} h · M = ${formatNumber(context.raw.y, 4)} kg`
              }
            }
          },
          scales: {
            x: {
              type: 'linear',
              min: 0,
              max: values.time,
              title: { display: true, text: 'Tiempo (h)' },
              ticks: {
                maxTicksLimit: 8,
                color: '#706d65',
                callback: value => formatNumber(Number(value), 1)
              },
              grid: { color: 'rgba(140, 133, 120, 0.16)' },
              border: { color: '#8c8578' }
            },
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Masa acumulada (kg)' },
              ticks: { color: '#706d65' },
              grid: { color: 'rgba(140, 133, 120, 0.2)' },
              border: { color: '#8c8578' }
            }
          }
        }
      });
    } else {
      spillChart.data = chartData;
      spillChart.options.scales.x.max = values.time;
      spillChart.update('none');
    }
  }

  function renderSolution() {
    const values = readValues();
    if (!values) return;

    const rateKgPerHour = values.flow * values.concentration / 1000;
    const accumulatedMass = rateKgPerHour * values.time;
    const flowText = formatNumber(values.flow, 2);
    const concentrationText = formatNumber(values.concentration, 1);
    const timeText = formatNumber(values.time, 1);
    const rateText = formatNumber(rateKgPerHour, 4);
    const massText = formatNumber(accumulatedMass, 4);
    const solution = document.getElementById('simStepByStep');

    solution.textContent = [
      `\\[\\text{1. Conversión de unidades: } R = \\frac{Q_c C_c}{1000} = \\frac{${flowText.replace(',', '.') } \\cdot ${concentrationText.replace(',', '.') }}{1000} = ${rateText.replace(',', '.') } \\;\\text{kg/h}\\]`,
      `\\[\\text{2. Integral definida: } M(t) = \\int_0^t R \\, d\\tau = [R\\tau]_0^t\\]`,
      `\\[\\text{3. Evaluación: } M(${timeText.replace(',', '.') }) = ${rateText.replace(',', '.') } \\cdot ${timeText.replace(',', '.') } = ${massText.replace(',', '.') } \\;\\text{kg}\\]`
    ].join('\n\n');
    document.getElementById('simMassResult').textContent = `${massText} kg`;

    if (typeof window.renderMathInElement === 'function') {
      window.renderMathInElement(solution, {
        delimiters: [{ left: '\\[', right: '\\]', display: true }],
        throwOnError: false
      });
    }

    renderChart(values, rateKgPerHour);
  }

  fields.forEach(field => {
    const range = document.getElementById(field.range);
    const input = document.getElementById(field.input);
    const display = document.getElementById(field.display);

    function sync(source, target) {
      target.value = source.value;
      input.setAttribute('aria-invalid', String(!input.checkValidity()));
      if (input.checkValidity()) {
        display.textContent = `${Number(input.value).toFixed(field.decimals)} ${field.unit}`;
        renderSolution();
      }
    }

    range.addEventListener('input', () => sync(range, input));
    input.addEventListener('input', () => sync(input, range));
  });

  function appendScenarioRow(scenario, index) {
    const row = document.createElement('tr');
    const values = [
      `Escenario ${index}`,
      `${formatNumber(scenario.flow, 2)}`,
      `${formatNumber(scenario.concentration, 1)}`,
      `${formatNumber(scenario.time, 1)}`,
      `${formatNumber(scenario.mass, 4)}`
    ];
    values.forEach(value => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });
    historyBody.appendChild(row);
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const values = readValues();
    const scenario = {
      ...values,
      mass: values.flow * values.concentration * values.time / 1000
    };
    scenarios.push(scenario);
    if (scenarios.length === 1) historyBody.replaceChildren();
    appendScenarioRow(scenario, scenarios.length);
  });

  window.addEventListener('resize', () => {
    const values = readValues();
    if (values && !spillChart && chartCanvas.getBoundingClientRect().width > 0) {
      renderSolution();
    }
  });

  renderSolution();
});
