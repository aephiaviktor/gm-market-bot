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

function normalizeDependencySpecs(packageJson) {
  const sortEntries = (value) => Object.fromEntries(Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b)));
  return {
    dependencies: sortEntries(packageJson?.dependencies),
    devDependencies: sortEntries(packageJson?.devDependencies),
    optionalDependencies: sortEntries(packageJson?.optionalDependencies),
  };
}

function dependencySpecsChanged(currentPackage, nextPackage) {
  return JSON.stringify(normalizeDependencySpecs(currentPackage))
    !== JSON.stringify(normalizeDependencySpecs(nextPackage));
}

function scheduleRelaunch(app, delayMs = 750, schedule = setTimeout) {
  schedule(() => {
    app.relaunch();
    app.exit(0);
  }, delayMs);
}

module.exports = { compareVersions, dependencySpecsChanged, normalizeVersion, scheduleRelaunch };
