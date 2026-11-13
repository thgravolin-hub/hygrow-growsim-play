/* HyGrow Campaign scenes: flat storybook SVGs for <svg viewBox="0 0 400 240">. Adds to window.Art (load after art.js). */
(function (w) {
'use strict';
var NS = 'http://www.w3.org/2000/svg';
var C = { ink: '#080808', panel: '#121512', panel2: '#1a1f1a', line: '#2a312a', text: '#f0f4f0', green: '#6ec846', orange: '#ec8024', yellow: '#f2b950', brown: '#2a1d14', muted: '#a9b3a9', water: '#2f6f7a', axel: '#f4b6c2' };

function fill(svg, inner) { svg.setAttribute('viewBox', '0 0 400 240'); svg.setAttribute('preserveAspectRatio', 'xMidYMid slice'); svg.innerHTML = inner; return svg; }
function axel(x, y, s) { // little axolotl: body, gills, eyes, smile
  return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><ellipse cx="0" cy="0" rx="26" ry="14" fill="' + C.axel + '"/>' +
    '<path d="M22 0 Q40 -4 44 6 Q34 8 22 6Z" fill="' + C.axel + '"/>' +
    '<g stroke="' + C.orange + '" stroke-width="3" stroke-linecap="round"><path d="M-22 -6 L-34 -14M-22 -1 L-36 -3M-22 4 L-34 8"/></g>' +
    '<circle cx="-14" cy="-3" r="2.6" fill="' + C.ink + '"/><circle cx="-6" cy="-3" r="2.6" fill="' + C.ink + '"/>' +
    '<path d="M-14 4 Q-10 8 -6 4" stroke="' + C.ink + '" stroke-width="1.5" fill="none"/></g>';
}
function plant(x, y, h) { return '<path d="M' + x + ' ' + y + ' q-8 -' + h * 0.6 + ' 0 -' + h + ' q8 ' + h * 0.4 + ' 0 ' + h + 'z" fill="' + C.green + '"/>'; }

// Ch.1: HyGrow shopfront in Byford
function sceneShopfront(svg) {
  var h = '<rect width="400" height="240" fill="' + C.panel + '"/>' +
    '<circle cx="330" cy="46" r="22" fill="' + C.yellow + '"/>' +
    '<rect y="190" width="400" height="50" fill="' + C.line + '"/>' +
    '<rect x="50" y="70" width="300" height="122" fill="' + C.panel2 + '" stroke="' + C.line + '" stroke-width="3"/>' +
    '<rect x="42" y="52" width="316" height="26" rx="4" fill="' + C.green + '"/>' +
    '<text x="200" y="71" text-anchor="middle" font-family="Fredoka,Nunito,sans-serif" font-weight="700" font-size="17" fill="' + C.ink + '">HyGrow Hydroponics</text>' +
    '<path d="M42 78 h316 l-8 14 h-300z" fill="' + C.orange + '"/>';
  for (var i = 0; i < 8; i++) h += '<path d="M' + (50 + i * 40) + ' 78 h20 l-4 14 h-12z" fill="' + C.text + '" opacity=".85"/>';
  h += '<rect x="70" y="106" width="110" height="70" rx="4" fill="' + C.ink + '" stroke="' + C.line + '" stroke-width="3"/>' +
    '<rect x="75" y="136" width="100" height="36" fill="' + C.water + '" opacity=".8"/>' + axel(120, 154, 0.8) +
    '<rect x="225" y="106" width="46" height="86" rx="3" fill="' + C.brown + '"/><circle cx="262" cy="150" r="3" fill="' + C.yellow + '"/>' +
    '<rect x="290" y="112" width="50" height="60" rx="3" fill="' + C.ink + '" stroke="' + C.line + '" stroke-width="3"/>' + plant(315, 168, 30) +
    '<text x="200" y="228" text-anchor="middle" font-family="Nunito,sans-serif" font-size="12" fill="' + C.muted + '">Byford, Western Australia</text>';
  return fill(svg, h);
}

// Ch.2-5: Axel's tank on the shop counter
function sceneCounter(svg) {
  var h = '<rect width="400" height="240" fill="' + C.panel + '"/>' +
    '<rect x="20" y="20" width="360" height="110" fill="' + C.panel2 + '"/>';
  for (var i = 0; i < 4; i++) h += '<rect x="' + (36 + i * 88) + '" y="34" width="70" height="8" fill="' + C.line + '"/><rect x="' + (44 + i * 88) + '" y="12" width="14" height="22" rx="3" fill="' + [C.green, C.orange, C.yellow, C.green][i] + '"/>';
  h += '<rect y="168" width="400" height="72" fill="' + C.brown + '"/><rect y="162" width="400" height="10" fill="' + C.orange + '"/>' +
    '<rect x="130" y="72" width="140" height="92" rx="8" fill="' + C.water + '" opacity=".75" stroke="' + C.text + '" stroke-width="3"/>' +
    '<rect x="130" y="72" width="140" height="14" rx="6" fill="' + C.ink + '" opacity=".4"/>' + plant(150, 160, 36) + plant(250, 160, 28) +
    '<circle cx="170" cy="100" r="3" fill="' + C.text + '" opacity=".6"/><circle cx="232" cy="112" r="4" fill="' + C.text + '" opacity=".6"/>' + axel(200, 138, 1.1) +
    '<rect x="40" y="128" width="40" height="36" rx="4" fill="' + C.text + '" opacity=".9"/><rect x="40" y="128" width="40" height="10" fill="' + C.green + '"/>' +
    '<rect x="300" y="116" width="26" height="48" rx="5" fill="' + C.orange + '"/><rect x="306" y="108" width="14" height="10" fill="' + C.line + '"/>' +
    '<rect x="334" y="130" width="22" height="34" rx="4" fill="' + C.green + '"/>';
  return fill(svg, h);
}

// Ch.6: market stall
function sceneMarket(svg) {
  var h = '<rect width="400" height="240" fill="' + C.panel + '"/><circle cx="60" cy="48" r="20" fill="' + C.yellow + '"/>' +
    '<rect y="188" width="400" height="52" fill="' + C.line + '"/>' +
    '<rect x="70" y="62" width="6" height="130" fill="' + C.text + '"/><rect x="324" y="62" width="6" height="130" fill="' + C.text + '"/>';
  for (var i = 0; i < 10; i++) h += '<path d="M' + (60 + i * 28) + ' 62 h28 l-4 24 h-20z" fill="' + (i % 2 ? C.text : C.green) + '"/>';
  h += '<rect x="60" y="30" width="280" height="32" rx="6" fill="' + C.orange + '"/>' +
    '<text x="200" y="52" text-anchor="middle" font-family="Fredoka,Nunito,sans-serif" font-weight="700" font-size="18" fill="' + C.ink + '">HyGrow Market Stall</text>' +
    '<rect x="70" y="140" width="260" height="52" rx="4" fill="' + C.brown + '"/>' +
    '<rect x="90" y="120" width="90" height="26" rx="4" fill="' + C.panel2 + '" stroke="' + C.line + '" stroke-width="2"/>';
  for (var j = 0; j < 6; j++) h += '<ellipse cx="' + (104 + j * 13) + '" cy="124" rx="7" ry="13" fill="' + C.green + '" transform="rotate(' + (j % 2 ? 20 : -20) + ' ' + (104 + j * 13) + ' 124)"/>';
  h += '<rect x="214" y="124" width="90" height="22" rx="4" fill="' + C.panel2 + '" stroke="' + C.line + '" stroke-width="2"/>' +
    '<circle cx="230" cy="122" r="9" fill="' + C.orange + '"/><circle cx="252" cy="122" r="9" fill="#e2453a"/><circle cx="274" cy="122" r="9" fill="' + C.yellow + '"/>' +
    '<rect x="150" y="88" width="100" height="22" rx="3" fill="' + C.text + '"/><text x="200" y="104" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="800" font-size="13" fill="' + C.ink + '">Fresh local</text>' +
    '<rect x="350" y="150" width="34" height="38" rx="5" fill="' + C.water + '" opacity=".8"/>' + axel(367, 168, 0.5);
  return fill(svg, h);
}

w.Art = w.Art || {};
w.Art.sceneShopfront = sceneShopfront; w.Art.sceneCounter = sceneCounter; w.Art.sceneMarket = sceneMarket;
})(window);
