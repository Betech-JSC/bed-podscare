import assert from 'node:assert';
import test, { describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('OpenSpec: Task 6 Frontend Resilience & Hydration Safety Tests', () => {
  const webAppDir = path.resolve(__dirname, '../app');
  const iconsFilePath = path.resolve(__dirname, '../../../packages/ui/src/atoms/Icons.tsx');
  const iconsContent = fs.readFileSync(iconsFilePath, 'utf-8');

  // Extract all icon names defined in iconPaths
  const availableIcons = new Set();
  const iconDeclRegex = /^\s*([a-zA-Z0-9]+):\s*['"`]/gm;
  let m;
  while ((m = iconDeclRegex.exec(iconsContent)) !== null) {
    availableIcons.add(m[1]);
  }

  test('Task 6.1: error.tsx exists, is Client Component, and uses valid standard icons', () => {
    const errorFilePath = path.join(webAppDir, 'error.tsx');
    assert.ok(fs.existsSync(errorFilePath), 'apps/web/app/error.tsx must exist');

    const content = fs.readFileSync(errorFilePath, 'utf-8');
    assert.ok(content.includes("'use client'"), 'error.tsx must be a Client Component');
    assert.ok(content.includes('reset()') || content.includes('reset'), 'error.tsx must include reset() trigger');

    // Extract all icon names used in <Icon name="..." /> or icon="..."
    const iconRegex = /icon(?:Name)?=["']([a-zA-Z0-9]+)["']/g;
    let match;
    const usedIcons = [];
    while ((match = iconRegex.exec(content)) !== null) {
      usedIcons.push(match[1]);
    }

    assert.ok(usedIcons.length > 0, 'error.tsx should use standard icons');
    for (const iconName of usedIcons) {
      assert.ok(
        availableIcons.has(iconName),
        `Icon "${iconName}" used in error.tsx must exist in iconPaths of Icons.tsx`
      );
    }
  });

  test('Task 6.2: global-error.tsx exists, is Client Component, contains <html> and <body>, and uses valid icons', () => {
    const globalErrorFilePath = path.join(webAppDir, 'global-error.tsx');
    assert.ok(fs.existsSync(globalErrorFilePath), 'apps/web/app/global-error.tsx must exist');

    const content = fs.readFileSync(globalErrorFilePath, 'utf-8');
    assert.ok(content.includes("'use client'"), 'global-error.tsx must be a Client Component');
    assert.ok(content.includes('<html'), 'global-error.tsx must render <html>');
    assert.ok(content.includes('<body'), 'global-error.tsx must render <body>');
    assert.ok(content.includes('Tải lại trang'), 'global-error.tsx must have "Tải lại trang" action');

    const iconRegex = /icon(?:Name)?=["']([a-zA-Z0-9]+)["']/g;
    let match;
    const usedIcons = [];
    while ((match = iconRegex.exec(content)) !== null) {
      usedIcons.push(match[1]);
    }

    assert.ok(usedIcons.length > 0, 'global-error.tsx should use standard icons');
    for (const iconName of usedIcons) {
      assert.ok(
        availableIcons.has(iconName),
        `Icon "${iconName}" used in global-error.tsx must exist in iconPaths of Icons.tsx`
      );
    }
  });

  test('Task 6.3: not-found.tsx exists, displays 404 and link to Dashboard (/), using valid icons', () => {
    const notFoundFilePath = path.join(webAppDir, 'not-found.tsx');
    assert.ok(fs.existsSync(notFoundFilePath), 'apps/web/app/not-found.tsx must exist');

    const content = fs.readFileSync(notFoundFilePath, 'utf-8');
    assert.ok(content.includes('404'), 'not-found.tsx must contain 404 indicator');
    assert.ok(content.includes('href="/"'), 'not-found.tsx must link to dashboard /');

    const iconRegex = /icon(?:Name)?=["']([a-zA-Z0-9]+)["']/g;
    let match;
    const usedIcons = [];
    while ((match = iconRegex.exec(content)) !== null) {
      usedIcons.push(match[1]);
    }

    assert.ok(usedIcons.length > 0, 'not-found.tsx should use standard icons');
    for (const iconName of usedIcons) {
      assert.ok(
        availableIcons.has(iconName),
        `Icon "${iconName}" used in not-found.tsx must exist in iconPaths of Icons.tsx`
      );
    }
  });

  test('Task 6.4: providers.tsx does not read localStorage in useState initializer and provides static default', () => {
    const providersFilePath = path.join(webAppDir, 'providers.tsx');
    const content = fs.readFileSync(providersFilePath, 'utf-8');

    // Ensure branch and branchId are initialized with static defaults
    assert.ok(
      content.includes("const [branch, setBranchState] = useState<string>('Tất cả chi nhánh')"),
      'branch state must be initialized statically to "Tất cả chi nhánh"'
    );
    assert.ok(
      content.includes("const [branchId, setBranchIdState] = useState<string | number>('all')"),
      'branchId state must be initialized statically to "all"'
    );

    // Verify localStorage reads are moved inside useEffect
    assert.ok(
      content.includes('setIsMounted(true)'),
      'providers.tsx must set isMounted flag in mount useEffect'
    );
    assert.ok(
      content.includes("localStorage.getItem('podscare_branch')"),
      'providers.tsx should restore podscare_branch in useEffect'
    );
    assert.ok(
      content.includes("localStorage.getItem('podscare_branch_id')"),
      'providers.tsx should restore podscare_branch_id in useEffect'
    );

    // Ensure useState does not contain localStorage calls
    const useStateSectionMatch = content.match(/const \[role[\s\S]*?const \[deviceProfiles/);
    assert.ok(useStateSectionMatch, 'useState declarations found');
    const useStateSection = useStateSectionMatch[0];
    assert.strictEqual(
      useStateSection.includes('localStorage.getItem'),
      false,
      'useState initializers must not access localStorage directly'
    );
  });
});
