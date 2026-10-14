import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { lint, resolveWindowsTsgolintExecutable } from '../resolve-lint.js';

function writeFakeOxlint(nodeModulesDir: string) {
  const pkgDir = join(nodeModulesDir, 'oxlint');
  mkdirSync(join(pkgDir, 'dist'), { recursive: true });
  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'oxlint', version: '0.0.0-fake', main: 'dist/index.js' }),
  );
  writeFileSync(join(pkgDir, 'dist', 'index.js'), '');
  return pkgDir;
}

function writePackageJson(dir: string, pkg: Record<string, unknown>) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
}

describe('resolve-lint', () => {
  describe('which oxlint runs', () => {
    let originalCwd: string;
    let tmp: string;

    beforeEach(() => {
      originalCwd = process.cwd();
      tmp = realpathSync(mkdtempSync(join(tmpdir(), 'vp-resolve-lint-')));
    });

    afterEach(() => {
      process.chdir(originalCwd);
      rmSync(tmp, { recursive: true, force: true });
    });

    it('runs the bundled oxlint, not one installed in a parent directory such as the main checkout around a git worktree', async () => {
      writePackageJson(tmp, { name: 'parent', devDependencies: { oxlint: '1.60.0' } });
      writeFakeOxlint(join(tmp, 'node_modules'));
      const project = join(tmp, 'project');
      writePackageJson(project, { name: 'app', devDependencies: { 'vite-plus': '1.2.0' } });
      process.chdir(project);

      const { binPath } = await lint();

      expect(binPath.startsWith(tmp)).toBe(false);
      expect(existsSync(binPath)).toBe(true);
    });

    it('runs the oxlint the project declares', async () => {
      const project = join(tmp, 'project');
      writePackageJson(project, { name: 'app', devDependencies: { oxlint: '1.60.0' } });
      const fakeOxlint = writeFakeOxlint(join(project, 'node_modules'));
      process.chdir(project);

      const { binPath } = await lint();

      expect(binPath).toBe(join(fakeOxlint, 'bin', 'oxlint'));
    });
  });

  it('should resolve binPath and OXLINT_TSGOLINT_PATH to existing files', async () => {
    const result = await lint();

    expect(result.binPath).toBeTruthy();
    expect(
      existsSync(result.binPath),
      `oxlint binPath should point to an existing file, got: ${result.binPath}`,
    ).toBe(true);

    const tsgolintPath = result.envs.OXLINT_TSGOLINT_PATH;
    expect(tsgolintPath).toBeTruthy();
    expect(
      existsSync(tsgolintPath),
      `OXLINT_TSGOLINT_PATH should point to an existing file, got: ${tsgolintPath}`,
    ).toBe(true);
  });

  it('should keep the Windows tsgolint executable path absolute', () => {
    const tsgolintPath =
      'C:\\repo\\node_modules\\.pnpm\\vite-plus@0.1.24\\node_modules\\vite-plus\\node_modules\\.bin\\tsgolint.cmd';
    const result = resolveWindowsTsgolintExecutable(
      [
        'C:\\repo\\node_modules\\.pnpm\\vite-plus@0.1.24\\node_modules\\vite-plus\\node_modules\\.bin\\tsgolint.exe',
        tsgolintPath,
      ],
      {
        exists: (path) => path === tsgolintPath,
      },
    );

    expect(result).toBe(tsgolintPath);
    expect(result).not.toMatch(/^\.\\/);
  });
});
