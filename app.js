// ─────────────────────────────────────────────────────────────
//  Maptap Highway — app.js
//  라이브러리 없음 | SVG <polyline> + <circle> 기반 렌더링
//  크기 계산: ResizeObserver로 실제 DOM 크기 보장
// ─────────────────────────────────────────────────────────────

// ── 1. API 데이터 불러오기 ────────────────────────────────────────────
// function fetchAllRoutes() {
//   var TOTAL_PAGES = 6;
//   var requests = [];

//   for (var page = 1; page <= TOTAL_PAGES; page++) {
//     var url = API_BASE
//       + '?key=' + API_KEY
//       + '&type=json'
//       + '&numOfRows=100'
//       + '&pageNo=' + page;
//     requests.push(fetch(url).then(function(res) { return res.json(); }));
//   }

//   return Promise.all(requests).then(function(results) {
//     var combined = [];
//     results.forEach(function(r) {
//       if (r.list) {
//         r.list.forEach(function(d) {
//           // 5대 노선만 추가
//           if (TARGET_ROUTES[d.routeNo]) combined.push(d);
//         });
//       }
//     });
//     return { list: combined };
//   });
// }
// ── 1. 데이터 불러오기 ────────────────────────────────────────────

function fetchAllRoutes() {
  return fetch('./data.json').then(function(r) { return r.json(); });
}

function init() {
  fetchAllRoutes().then(function(apiResponse) {

    var stations    = parseStations(apiResponse);
    var routeGroups = groupByRoute(stations);
    var bounds      = calcBounds(stations);
    _routeGroups    = routeGroups;

    var svg        = document.getElementById('map-svg');
    var gridLayer  = svg.querySelector('#grid-layer');
    var roadsLayer = svg.querySelector('#roads-layer');
    var dotsLayer  = svg.querySelector('#dots-layer');

    initTooltip();
    renderSidebar(routeGroups);

    function draw(W, H) {
      svg.setAttribute('width',   W);
      svg.setAttribute('height',  H);
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      var toSVG = createProjector(bounds, W, H, { top:60, right:80, bottom:60, left:80 });
      renderGrid(gridLayer, W, H);
      renderMap(roadsLayer, dotsLayer, routeGroups, toSVG, openTabs);
      renderLegend(openTabs);
      updateStatusBar();
    }

    _drawCurrent = function() {
      var W = parseFloat(svg.getAttribute('width'))  || 0;
      var H = parseFloat(svg.getAttribute('height')) || 0;
      if (W > 0 && H > 0) draw(W, H);
    };

    var initialized = false;
    var ro = new ResizeObserver(function(entries) {
      var entry = entries[0];
      var W = Math.floor(entry.contentRect.width);
      var H = Math.floor(entry.contentRect.height);
      if (W > 0 && H > 0) {
        draw(W, H);
        if (!initialized) {
          initialized = true;
          var available = Object.keys(routeGroups);
          available.forEach(function(r){ openTabs.push(r); });
          setActive(available[0]);
        }
      }
    });

    ro.observe(svg.parentElement);

  }).catch(function(err) {
    console.error('API 오류:', err);
    // 실패 시 사용자에게 표시
    document.querySelector('.map-wrapper').insertAdjacentHTML(
      'beforeend',
      '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#e84040;font-size:14px;">API 연결 실패: ' + err.message + '</div>'
    );
  });
}

// ── 2. 노선 메타 ──────────────────────────────────────────────
const ROUTE_META = {
  "001": { name:"경부선",   color:"#e84040" },
  "015": { name:"서해안선", color:"#e87a40" },
  "050": { name:"영동선",   color:"#3ab54a" },
  "035": { name:"중부선-대전통영선A",   color:"#d4b800" },
  "010": { name:"남해선A",   color:"#3a80e8" },
};

// ── 3. 좌표 변환 ─────────────────────────────────────────────
function createProjector(bounds, canvasW, canvasH, pad) {
  const mapW    = canvasW - pad.left - pad.right;
  const mapH    = canvasH - pad.top  - pad.bottom;
  const lonSpan = bounds.maxLon - bounds.minLon;
  const latSpan = bounds.maxLat - bounds.minLat;
  const scale   = Math.min(mapW / lonSpan, mapH / latSpan);
  const offX    = pad.left  + (mapW - lonSpan * scale) / 2;
  const offY    = pad.top   + (mapH - latSpan * scale) / 2;

  return function toSVG(lon, lat) {
    return {
      x: +( offX + (lon - bounds.minLon) * scale ).toFixed(2),
      y: +( offY + (bounds.maxLat - lat) * scale ).toFixed(2),
    };
  };
}

function calcBounds(stations, margin) {
  margin = margin === undefined ? 0.18 : margin;
  const lons = stations.map(function(s){ return s.lon; });
  const lats = stations.map(function(s){ return s.lat; });
  return {
    minLon: Math.min.apply(null, lons) - margin,
    maxLon: Math.max.apply(null, lons) + margin,
    minLat: Math.min.apply(null, lats) - margin,
    maxLat: Math.max.apply(null, lats) + margin,
  };
}

// ── 4. 데이터 파싱 ────────────────────────────────────────────
// ✅ 수정 — null/비정상 좌표 제거
function parseStations(apiResp) {

  // 경부선/영동선: 수작업 조사 순서 기준
  var ROUTE_ORDER = {
    "001": ["대왕판교","판교","서울","수원신갈","기흥","기흥동탄","오산","남사진위","안성","북천안","천안","독립기념관","청주","남청주","신탄진","대전","옥천","금강","영동","황간","추풍령","김천","동김천","구미","남구미","왜관","칠곡물류","북대구","경산","영천","서경주","경주","활천","서울산","통도사","양산","노포","부산"],
    "050": ["군자","서안산","안산","군포","동군포","부곡","북수원","동수원","마성","용인","양지","덕평","이천","여주","문막","원주","새말","둔내","면온","평창","속사","진부","대관령"],
  };

  // 남해선 순천 구간 교정 순서
  var NAMHAE_SUNCHEON = ["남순천","순천만","서순천","순천"];

  // 서해안선/중부선/남해선: 위도경도 기준 정렬
  var ROUTE_SORT = {
    "015": function(a, b) { return b.lat - a.lat; },
    "035": function(a, b) { return b.lat - a.lat; },
    "010": function(a, b) { return a.lon - b.lon; },
  };

  var stations = apiResp.list
    .filter(function(d) {
      var bad = d.xValue == null || d.yValue == null || d.xValue === '' || d.yValue === '';
      if (bad) console.warn('좌표 없는 영업소 제외:', d.unitName, d.routeName);
      return !bad;
    })
    .map(function(d) {
      return {
        name:      d.unitName,
        code:      d.unitCode.trim(),
        routeNo:   d.routeNo,
        routeName: d.routeName,
        lon:       parseFloat(d.xValue),
        lat:       parseFloat(d.yValue),
      };
    })
    .filter(function(s) {
      return !isNaN(s.lon) && !isNaN(s.lat);
    });

  // 노선별로 그룹화 후 각각 정렬
  var grouped = {};
  stations.forEach(function(s) {
    if (!grouped[s.routeNo]) grouped[s.routeNo] = [];
    grouped[s.routeNo].push(s);
  });

  var result = [];
  Object.keys(grouped).forEach(function(routeNo) {
    var group = grouped[routeNo];

    if (ROUTE_ORDER[routeNo]) {
      // ROUTE_ORDER 기준 정렬, 목록에 없는 영업소는 맨 뒤
      var orderMap = {};
      ROUTE_ORDER[routeNo].forEach(function(name, i) { orderMap[name] = i; });
      group.sort(function(a, b) {
        var ia = orderMap[a.name] !== undefined ? orderMap[a.name] : 9999;
        var ib = orderMap[b.name] !== undefined ? orderMap[b.name] : 9999;
        return ia - ib;
      });

    } else if (routeNo === "010") {
      // 남해선: 위도경도 정렬 후 순천 구간 교정
      group.sort(ROUTE_SORT["010"]);

      // 순천 구간 4개 추출
      var suncheonMap = {};
      NAMHAE_SUNCHEON.forEach(function(name, i) { suncheonMap[name] = i; });
      var suncheon = group.filter(function(s) { return suncheonMap[s.name] !== undefined; });
      var others   = group.filter(function(s) { return suncheonMap[s.name] === undefined; });
      suncheon.sort(function(a, b) { return suncheonMap[a.name] - suncheonMap[b.name]; });

      // 순천만 위치(others 기준)에 삽입
      var insertAt = others.findIndex(function(s) { return s.name === "광양"; });
      if (insertAt === -1) insertAt = others.length;
      group = others.slice(0, insertAt).concat(suncheon).concat(others.slice(insertAt));

    } else {
      // 서해안선/중부선: 위도경도 정렬
      var sortFn = ROUTE_SORT[routeNo];
      if (sortFn) group.sort(sortFn);
    }

    result = result.concat(group);
  });

  return result;
}

function groupByRoute(stations) {
  var acc = {};
  stations.forEach(function(s) {
    if (!acc[s.routeNo]) acc[s.routeNo] = [];
    acc[s.routeNo].push(s);
  });
  return acc;
}

// ── 5. SVG 헬퍼 ──────────────────────────────────────────────
var SVG_NS = 'http://www.w3.org/2000/svg';

function makeSVG(tag, attrs, text) {
  var el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    Object.keys(attrs).forEach(function(k) {
      el.setAttribute(k, attrs[k]);
    });
  }
  if (text) el.textContent = text;
  return el;
}

// ── 6. 격자 렌더링 ────────────────────────────────────────────
function renderGrid(layer, W, H) {
  var cols = 12, rows = 8;
  layer.innerHTML = '';
  for (var i = 1; i < cols; i++) {
    var x = (W / cols) * i;
    layer.appendChild(makeSVG('line', { x1:x, y1:0, x2:x, y2:H, class:'grid-line' }));
  }
  for (var j = 1; j < rows; j++) {
    var y = (H / rows) * j;
    layer.appendChild(makeSVG('line', { x1:0, y1:y, x2:W, y2:y, class:'grid-line' }));
  }
}

// ── 7. 지도 렌더링 ────────────────────────────────────────────
var _showTooltip, _moveTooltip, _hideTooltip;

function renderMap(roadsLayer, dotsLayer, routeGroups, toSVG, activeRoutes) {
  roadsLayer.innerHTML = '';
  dotsLayer.innerHTML  = '';

  activeRoutes.forEach(function(routeNo) {
    var stations = routeGroups[routeNo];
    if (!stations || stations.length === 0) return;

    var color = (ROUTE_META[routeNo] || {}).color || '#ffffff';

    // polyline
    var pts = stations.map(function(s) {
      var p = toSVG(s.lon, s.lat);
      return p.x + ',' + p.y;
    }).join(' ');

    roadsLayer.appendChild(makeSVG('polyline', {
      points: pts,
      fill:   'none',
      stroke: color,
      'stroke-width':    2.5,
      'stroke-linecap':  'round',
      'stroke-linejoin': 'round',
      opacity: 0.85,
    }));

    // circles
    stations.forEach(function(s, idx) {
      var p    = toSVG(s.lon, s.lat);
      var x    = p.x, y = p.y;
      var isEnd = idx === 0 || idx === stations.length - 1;
      var r    = isEnd ? 7 : 4.5;

      // 글로우
      dotsLayer.appendChild(makeSVG('circle', {
        cx: x, cy: y, r: r + 4,
        fill: color, opacity: 0.15,
      }));

      // 본체
      var circle = makeSVG('circle', {
        cx: x, cy: y, r: r,
        fill: color,
        stroke: '#0d0f14',
        'stroke-width': 1.5,
        style: 'cursor:pointer',
      });
      circle.addEventListener('mouseenter', function(e){ _showTooltip(e, s, color); });
      circle.addEventListener('mouseleave', function(){ _hideTooltip(); });
      circle.addEventListener('mousemove',  function(e){ _moveTooltip(e); });
      dotsLayer.appendChild(circle);

      // 시작/종점 라벨
      if (isEnd) {
        dotsLayer.appendChild(makeSVG('text', {
          x: x + 10, y: y + 4,
          fill: color,
          'font-size': 11,
          'font-family': 'Noto Sans KR, sans-serif',
          'font-weight': 600,
        }, s.name));
      }
    });
  });
}

// ── 8. 범례 ──────────────────────────────────────────────────
function renderLegend(activeRoutes) {
  var legend = document.getElementById('legend');
  legend.innerHTML = '<div class="legend-title">노선 범례</div>';
  activeRoutes.forEach(function(routeNo) {
    var m = ROUTE_META[routeNo];
    if (!m) return;
    var item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = '<div class="legend-line" style="background:' + m.color + '"></div><span>' + m.name + '</span>';
    legend.appendChild(item);
  });
  var dw = document.createElement('div');
  dw.className = 'legend-dot-wrap';
  dw.innerHTML = '<div class="legend-dot"></div><span style="font-size:10px;color:var(--muted)">영업소(톨게이트)</span>';
  legend.appendChild(dw);
}

// ── 9. 툴팁 ──────────────────────────────────────────────────
function initTooltip() {
  var tooltip  = document.getElementById('tooltip');
  var ttName   = document.getElementById('tt-name');
  var ttCoords = document.getElementById('tt-coords');
  var ttRoute  = document.getElementById('tt-route');

  _showTooltip = function(e, s, color) {
    ttName.textContent   = s.name + ' 영업소';
    ttName.style.color   = color;
    ttCoords.textContent = s.lat.toFixed(6) + '°N  ' + s.lon.toFixed(6) + '°E';
    ttRoute.textContent  = s.routeName;
    ttRoute.style.color  = color;
    tooltip.classList.add('show');
    _moveTooltip(e);
  };
  _moveTooltip = function(e) {
    var wrap = document.querySelector('.map-wrapper');
    var rect = wrap.getBoundingClientRect();
    var tx = e.clientX - rect.left + 14;
    var ty = e.clientY - rect.top  - 10;
    if (tx + 190 > rect.width) tx = e.clientX - rect.left - 200;
    tooltip.style.left = tx + 'px';
    tooltip.style.top  = ty + 'px';
  };
  _hideTooltip = function() {
    tooltip.classList.remove('show');
  };
}

// ── 10. 탭 / 사이드바 UI ─────────────────────────────────────
var openTabs    = [];
var activeRoute = null;
var _routeGroups = null;
var _drawCurrent = null;

function renderSidebar(routeGroups) {
  var list = document.getElementById('sidebar-list');
  list.innerHTML = '';
  Object.keys(ROUTE_META).forEach(function(routeNo) {
    var m  = ROUTE_META[routeNo];
    var ct = routeGroups[routeNo] ? routeGroups[routeNo].length : 0;
    var el = document.createElement('div');
    el.className     = 'road-item';
    el.dataset.route = routeNo;
    el.innerHTML =
      '<div class="road-dot" style="background:' + m.color + '"></div>' +
      '<div><div class="road-label">' + m.name + '</div>' +
      '<div class="road-sub">' + ct + '개 영업소</div></div>';
    el.addEventListener('click', function(){ openTab(routeNo); });
    list.appendChild(el);
  });
}

function openTab(routeNo) {
  if (openTabs.indexOf(routeNo) === -1) openTabs.push(routeNo);
  setActive(routeNo);
}

function closeTab(routeNo, e) {
  e.stopPropagation();
  openTabs = openTabs.filter(function(r){ return r !== routeNo; });
  var next = activeRoute === routeNo
    ? (openTabs[openTabs.length - 1] || null)
    : activeRoute;
  setActive(next);
}

function setActive(routeNo) {
  activeRoute = routeNo;
  renderTabs();
  updateSidebarHighlight();
  if (_drawCurrent) _drawCurrent();
  updateStatusBar();
}

function renderTabs() {
  var bar = document.getElementById('tab-bar');
  bar.innerHTML = '';
  openTabs.forEach(function(routeNo) {
    var m  = ROUTE_META[routeNo] || { name: routeNo };
    var el = document.createElement('div');
    el.className     = 'tab' + (routeNo === activeRoute ? ' active' : '');
    el.dataset.route = routeNo;
    el.innerHTML = m.name + '<span class="tab-close" title="닫기">✕</span>';
    el.addEventListener('click', function(){ setActive(routeNo); });
    el.querySelector('.tab-close').addEventListener('click', function(e){ closeTab(routeNo, e); });
    bar.appendChild(el);
  });
}

function updateSidebarHighlight() {
  document.querySelectorAll('.road-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.route === activeRoute);
  });
}

function updateStatusBar() {
  var total = openTabs.reduce(function(n, r) {
    return n + (_routeGroups && _routeGroups[r] ? _routeGroups[r].length : 0);
  }, 0);
  document.getElementById('st-count').textContent  = total;
  document.getElementById('st-routes').textContent = openTabs.length;
}

document.addEventListener('DOMContentLoaded', init);