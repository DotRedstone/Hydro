import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';
import { getAvailableLangs, tpl } from 'vj/utils';

const page = new NamedPage('problem_statistics', () => {
  // Charts read the same design tokens as the page so they follow the palette
  // (and dark mode) instead of shipping their own hardcoded colour scheme.
  function token(name: string, fallback: string) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function scoreColor(score: number) {
    if (score >= 100) return token('--c-ok', '#427253');
    if (score >= 80) return token('--c-cat-3', '#7d9366');
    if (score >= 40) return token('--c-warn', '#96681a');
    if (score > 0) return token('--c-cat-1', '#c76b4e');
    return token('--c-bad', '#a94733');
  }

  const STATUS_TONES: Record<string, string> = {
    AC: '--c-ok',
    WA: '--c-bad',
    TLE: '--c-warn',
    MLE: '--c-cat-2',
    RE: '--c-cat-7',
    CE: '--c-neutral',
  };

  async function initChart() {
    if (!Object.keys(UiContext.pdoc.stats || {}).length) {
      $('#submission-status-placeholder').parent().hide();
      return;
    }
    const echarts = await import('echarts');
    const $status = document.getElementById('submission-status-placeholder');
    const statusChart = echarts.init($status);
    const textStyle = {
      color: token('--c-fg-2', '#5e5c55'),
      fontFamily: getComputedStyle(document.body).fontFamily,
    };
    const tooltip = {
      trigger: 'item',
      backgroundColor: token('--c-surface', '#ffffff'),
      borderColor: token('--c-border', '#e6e3d8'),
      textStyle: { color: token('--c-fg', '#2b2a27') },
    };
    statusChart.setOption({
      textStyle,
      tooltip,
      series: [
        {
          name: 'Submissions',
          type: 'pie',
          radius: '70%',
          label: { show: false },
          labelLine: { show: false },
          data: ['TLE', 'AC', 'MLE', 'WA', 'RE', 'CE'].map((name) => ({
            name,
            value: UiContext.pdoc.stats[name],
            itemStyle: { color: token(STATUS_TONES[name], '#8e8b82') },
          })),
        },
      ],
    });
    const $score = document.getElementById('submission-score-placeholder');
    const x = Array.from({ length: 101 }, (v, i) => i).filter((i) => UiContext.pdoc.stats[`s${i}`]);
    const scoreChart = echarts.init($score);
    scoreChart.setOption({
      textStyle,
      tooltip,
      xAxis: {
        data: x,
        axisLine: { lineStyle: { color: token('--c-border-strong', '#d3cfc1') } },
        axisLabel: { color: token('--c-fg-3', '#8e8b82') },
      },
      yAxis: {
        axisLine: { lineStyle: { color: token('--c-border-strong', '#d3cfc1') } },
        axisLabel: { color: token('--c-fg-3', '#8e8b82') },
        splitLine: { lineStyle: { color: token('--c-border', '#e6e3d8') } },
      },
      series: [{
        data: x.map((i) => ({
          value: UiContext.pdoc.stats[`s${i}`],
          itemStyle: { color: scoreColor(i) },
        })),
        type: 'bar',
      }],
    });

    window.onresize = function () {
      statusChart.resize();
      scoreChart.resize();
    };
    if (UiContext.pdoc.config?.type === 'objective') $($status).hide();
  }

  const availableLangs = getAvailableLangs(UiContext.pdoc.config.langs);
  Object.keys(availableLangs).map(
    (i) => ($('select[name="lang"]').append(tpl`<option value="${i}" key="${i}">${availableLangs[i].display}</option>`)));
  const lang = new URL(window.location.href).searchParams.get('lang');
  if (lang) $('select[name="lang"]').val(lang);
  initChart();
  $('[name="filter-form"] select').on('change', () => {
    $('[name="filter-form"]').trigger('submit');
  });
});

export default page;
