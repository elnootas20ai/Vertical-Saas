import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';

const JSX_EXTENSION = '.jsx';

function injectAyDataInSource(source) {
  const returnIndex = source.indexOf('return');
  if (returnIndex < 0) {
    return { changed: false, reason: 'return_not_found', content: source };
  }

  const fromReturn = source.slice(returnIndex);
  const tagRegex = /<([a-z][a-z0-9-]*)(\s[^>]*)?>/g;
  let match;
  while ((match = tagRegex.exec(fromReturn))) {
    const fullTag = match[0];
    const attrs = match[2] || '';
    if (/\bay-data\s*=/.test(attrs)) {
      return { changed: false, reason: 'already_has_ay_data', content: source };
    }
    const uuid = uuidv4();
    const patchedTag = fullTag.replace(/>$/, ` ay-data="${uuid}">`);
    const absoluteStart = returnIndex + match.index;
    const absoluteEnd = absoluteStart + fullTag.length;
    const nextContent = `${source.slice(0, absoluteStart)}${patchedTag}${source.slice(absoluteEnd)}`;
    return { changed: true, reason: 'updated', content: nextContent, ayData: uuid };
  }

  return { changed: false, reason: 'html_tag_not_found', content: source };
}

async function collectJsxFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectJsxFiles(fullPath);
      files.push(...nested);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(JSX_EXTENSION)) {
      files.push(fullPath);
    }
  }
  return files;
}

export async function runHuellaIndexer({ rootDir, targetDir = 'src', dryRun = false } = {}) {
  const resolvedRoot = rootDir || process.cwd();
  const scanRoot = path.resolve(resolvedRoot, targetDir);
  const jsxFiles = await collectJsxFiles(scanRoot);
  const changedFiles = [];
  const skippedFiles = [];

  for (const filePath of jsxFiles) {
    const current = await fs.readFile(filePath, 'utf8');
    const result = injectAyDataInSource(current);
    if (!result.changed) {
      skippedFiles.push({ file: path.relative(resolvedRoot, filePath), reason: result.reason });
      continue;
    }
    if (!dryRun) {
      await fs.writeFile(filePath, result.content, 'utf8');
    }
    changedFiles.push({
      file: path.relative(resolvedRoot, filePath),
      ayData: result.ayData,
    });
  }

  return {
    ok: true,
    scannedRoot: scanRoot,
    scannedFiles: jsxFiles.length,
    changedFiles: changedFiles.length,
    changed: changedFiles,
    skipped: skippedFiles,
    dryRun: Boolean(dryRun),
  };
}

