'use strict';

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '');
}

function compareVersions(a, b) {
  const left = normalizeVersion(a).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = normalizeVersion(b).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if ((left[index] || 0) > (right[index] || 0)) return 1;
    if ((left[index] || 0) < (right[index] || 0)) return -1;
  }
  return 0;
}

function scheduleRelaunch(app, delayMs = 750, schedule = setTimeout) {
  schedule(() => {
    app.relaunch();
    app.exit(0);
  }, delayMs);
}

module.exports = { compareVersions, normalizeVersion, scheduleRelaunch };
