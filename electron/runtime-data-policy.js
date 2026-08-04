'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const RUNTIME_DATA_FILES = Object.freeze([
  'bot-state.json',
  'orders-log.jsonl',
  'crash-events.jsonl',
]);

function resolveRuntimeDataDir({ localAppData, userData }) {
  const baseDir = String(localAppData || '').trim() || path.dirname(String(userData || '').trim());
  if (!baseDir) {
    throw new Error('A LocalAppData or userData path is required for runtime data.');
  }
  return path.join(baseDir, 'GMMarketBot', 'data');
}

async function migrateLegacyRuntimeData({ legacyDir, targetDir, logger = console }) {
  await fs.mkdir(targetDir, { recursive: true });
  const copied = [];

  for (const fileName of RUNTIME_DATA_FILES) {
    const sourcePath = path.join(legacyDir, fileName);
    const targetPath = path.join(targetDir, fileName);
    try {
      await fs.copyFile(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
      const [sourceStat, targetStat] = await Promise.all([fs.stat(sourcePath), fs.stat(targetPath)]);
      if (sourceStat.size !== targetStat.size) {
        await fs.rm(targetPath, { force: true });
        throw new Error(`Runtime data migration verification failed for ${fileName}.`);
      }
      copied.push(fileName);
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'EEXIST') continue;
      logger.error?.(`[GM] Failed to migrate ${fileName}:`, error);
      throw error;
    }
  }

  return { copied, targetDir };
}

module.exports = {
  RUNTIME_DATA_FILES,
  migrateLegacyRuntimeData,
  resolveRuntimeDataDir,
};
