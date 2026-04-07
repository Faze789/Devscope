/**
 * Demo Data Generator — Populates stores with realistic mock data
 * so the full UI can be explored without a native file system bridge.
 */
import type {
  Repository,
  Dependency,
  CVE,
  UsageNode,
  RefactorSuggestion,
  UpgradeImpact,
} from '../../types';

export function createDemoRepository(name: string, path: string): Repository {
  return {
    id: Date.now().toString(),
    name,
    path,
    packageManager: 'npm',
    isMonorepo: false,
    workspaceRoots: [],
    dependencyCount: 12,
    healthScore: 74,
    lastAnalyzed: new Date().toISOString(),
    analysisStatus: { type: 'complete', timestamp: new Date().toISOString() },
  };
}

export function createDemoDependencies(): Dependency[] {
  return [
    {
      name: 'react',
      version: '18.3.1',
      isDev: false,
      totalExports: 65,
      usedExports: [
        { name: 'useState', filePath: 'react/index.js', isDefault: false, isReExport: false, kind: 'function' },
        { name: 'useEffect', filePath: 'react/index.js', isDefault: false, isReExport: false, kind: 'function' },
        { name: 'useCallback', filePath: 'react/index.js', isDefault: false, isReExport: false, kind: 'function' },
        { name: 'useMemo', filePath: 'react/index.js', isDefault: false, isReExport: false, kind: 'function' },
        { name: 'useRef', filePath: 'react/index.js', isDefault: false, isReExport: false, kind: 'function' },
        { name: 'default', filePath: 'react/index.js', isDefault: true, isReExport: false, kind: 'variable' },
      ],
      usageRatio: 0.092,
      packageSize: 310000,
      transitiveDeps: ['loose-envify', 'js-tokens'],
      cves: [],
      healthScore: 93,
    },
    {
      name: 'lodash',
      version: '4.17.21',
      isDev: false,
      totalExports: 312,
      usedExports: [
        { name: 'debounce', filePath: 'lodash/debounce.js', isDefault: false, isReExport: false, kind: 'function' },
        { name: 'get', filePath: 'lodash/get.js', isDefault: false, isReExport: false, kind: 'function' },
        { name: 'cloneDeep', filePath: 'lodash/cloneDeep.js', isDefault: false, isReExport: false, kind: 'function' },
      ],
      usageRatio: 0.0096,
      packageSize: 531000,
      transitiveDeps: [],
      cves: [
        {
          id: 'GHSA-jf85-cpcp-j695',
          aliases: ['CVE-2021-23337'],
          summary: 'Command Injection in lodash',
          details: 'lodash versions prior to 4.17.21 are vulnerable to Command Injection via the template function.',
          severity: 'HIGH',
          cvssScore: 7.2,
          affectedVersions: ['<4.17.21'],
          fixedVersion: '4.17.21',
          affectedFunctions: ['template'],
          inUsagePath: false,
          published: '2021-02-19',
          modified: '2024-01-05',
          references: ['https://github.com/lodash/lodash/pull/5085'],
        },
        {
          id: 'GHSA-35jh-r3h4-6jhm',
          aliases: ['CVE-2020-28500'],
          summary: 'Regular Expression Denial of Service (ReDoS) in lodash',
          details: 'lodash prior to 4.17.21 is vulnerable to ReDoS via the toNumber, trim, and trimEnd functions.',
          severity: 'MEDIUM',
          cvssScore: 5.3,
          affectedVersions: ['<4.17.21'],
          fixedVersion: '4.17.21',
          affectedFunctions: ['toNumber', 'trim', 'trimEnd'],
          inUsagePath: false,
          published: '2021-02-15',
          modified: '2024-01-05',
          references: ['https://github.com/lodash/lodash/pull/5065'],
        },
      ],
      healthScore: 58,
    },
    {
      name: 'axios',
      version: '1.6.2',
      isDev: false,
      totalExports: 18,
      usedExports: [
        { name: 'default', filePath: 'axios/index.js', isDefault: true, isReExport: false, kind: 'function' },
      ],
      usageRatio: 0.055,
      packageSize: 198000,
      transitiveDeps: ['follow-redirects', 'form-data', 'proxy-from-env'],
      cves: [
        {
          id: 'GHSA-wf5p-g6vw-rhxx',
          aliases: ['CVE-2023-45857'],
          summary: 'Cross-Site Request Forgery in axios',
          details: 'axios sets the XSRF-TOKEN cookie value on every request, which can lead to CSRF attacks.',
          severity: 'MEDIUM',
          cvssScore: 6.5,
          affectedVersions: ['>=0.8.1', '<1.6.0'],
          fixedVersion: '1.6.1',
          affectedFunctions: ['request'],
          inUsagePath: true,
          published: '2023-11-08',
          modified: '2024-03-15',
          references: ['https://github.com/axios/axios/pull/6028'],
        },
      ],
      healthScore: 62,
    },
    {
      name: 'moment',
      version: '2.29.4',
      isDev: false,
      totalExports: 48,
      usedExports: [
        { name: 'default', filePath: 'moment/moment.js', isDefault: true, isReExport: false, kind: 'function' },
      ],
      usageRatio: 0.021,
      packageSize: 4200000,
      transitiveDeps: [],
      cves: [],
      healthScore: 45,
    },
    {
      name: 'express',
      version: '4.18.2',
      isDev: false,
      totalExports: 24,
      usedExports: [
        { name: 'default', filePath: 'express/index.js', isDefault: true, isReExport: false, kind: 'function' },
        { name: 'Router', filePath: 'express/lib/router/index.js', isDefault: false, isReExport: true, kind: 'class' },
        { name: 'json', filePath: 'express/lib/express.js', isDefault: false, isReExport: false, kind: 'function' },
        { name: 'urlencoded', filePath: 'express/lib/express.js', isDefault: false, isReExport: false, kind: 'function' },
        { name: 'static', filePath: 'express/lib/express.js', isDefault: false, isReExport: false, kind: 'function' },
      ],
      usageRatio: 0.208,
      packageSize: 210000,
      transitiveDeps: ['body-parser', 'content-type', 'cookie', 'qs', 'send', 'serve-static'],
      cves: [],
      healthScore: 88,
    },
    {
      name: 'jsonwebtoken',
      version: '9.0.0',
      isDev: false,
      totalExports: 5,
      usedExports: [
        { name: 'sign', filePath: 'jsonwebtoken/index.js', isDefault: false, isReExport: false, kind: 'function' },
        { name: 'verify', filePath: 'jsonwebtoken/index.js', isDefault: false, isReExport: false, kind: 'function' },
      ],
      usageRatio: 0.4,
      packageSize: 68000,
      transitiveDeps: ['jws', 'lodash.includes', 'ms', 'semver'],
      cves: [
        {
          id: 'GHSA-hjrf-2m68-5959',
          aliases: ['CVE-2022-23529'],
          summary: 'Insecure key retrieval in jsonwebtoken',
          details: 'Versions of jsonwebtoken before 9.0.0 are vulnerable when the secretOrPublicKey is fetched from an untrusted source.',
          severity: 'HIGH',
          cvssScore: 7.6,
          affectedVersions: ['<9.0.0'],
          fixedVersion: '9.0.0',
          affectedFunctions: ['verify'],
          inUsagePath: true,
          published: '2022-12-21',
          modified: '2024-02-01',
          references: ['https://github.com/auth0/node-jsonwebtoken/security/advisories/GHSA-hjrf-2m68-5959'],
        },
      ],
      healthScore: 65,
    },
    {
      name: 'zod',
      version: '3.22.4',
      isDev: false,
      totalExports: 42,
      usedExports: [
        { name: 'z', filePath: 'zod/lib/index.mjs', isDefault: false, isReExport: false, kind: 'variable' },
      ],
      usageRatio: 0.024,
      packageSize: 57000,
      transitiveDeps: [],
      cves: [],
      healthScore: 85,
    },
    {
      name: 'uuid',
      version: '9.0.0',
      isDev: false,
      totalExports: 7,
      usedExports: [
        { name: 'v4', filePath: 'uuid/dist/esm-browser/index.js', isDefault: false, isReExport: false, kind: 'function' },
      ],
      usageRatio: 0.143,
      packageSize: 32000,
      transitiveDeps: [],
      cves: [],
      healthScore: 90,
    },
    {
      name: 'chalk',
      version: '5.3.0',
      isDev: false,
      totalExports: 12,
      usedExports: [
        { name: 'default', filePath: 'chalk/source/index.js', isDefault: true, isReExport: false, kind: 'function' },
      ],
      usageRatio: 0.083,
      packageSize: 41000,
      transitiveDeps: [],
      cves: [],
      healthScore: 82,
    },
    {
      name: 'typescript',
      version: '5.3.3',
      isDev: true,
      totalExports: 180,
      usedExports: [],
      usageRatio: 0,
      packageSize: 8500000,
      transitiveDeps: [],
      cves: [],
      healthScore: 100,
    },
    {
      name: 'eslint',
      version: '8.56.0',
      isDev: true,
      totalExports: 22,
      usedExports: [],
      usageRatio: 0,
      packageSize: 3200000,
      transitiveDeps: [],
      cves: [],
      healthScore: 100,
    },
    {
      name: 'dotenv',
      version: '16.3.1',
      isDev: false,
      totalExports: 4,
      usedExports: [
        { name: 'config', filePath: 'dotenv/lib/main.js', isDefault: false, isReExport: false, kind: 'function' },
      ],
      usageRatio: 0.25,
      packageSize: 28000,
      transitiveDeps: [],
      cves: [],
      healthScore: 95,
    },
  ];
}

export function createDemoCVEs(): CVE[] {
  const deps = createDemoDependencies();
  return deps.flatMap((d) => d.cves);
}

export function createDemoUsageNodes(): Map<string, UsageNode> {
  const nodes = new Map<string, UsageNode>();

  const lodashNodes: UsageNode[] = [
    {
      id: 'lodash::debounce',
      packageName: 'lodash',
      exportName: 'debounce',
      consumers: [
        { filePath: 'src/hooks/useSearch.ts', line: 3, column: 0, context: "import { debounce } from 'lodash'" },
        { filePath: 'src/components/SearchBar.tsx', line: 5, column: 0, context: "import { debounce } from 'lodash'" },
      ],
      internalDeps: [],
      depth: 0,
    },
    {
      id: 'lodash::get',
      packageName: 'lodash',
      exportName: 'get',
      consumers: [
        { filePath: 'src/utils/config.ts', line: 2, column: 0, context: "import { get } from 'lodash'" },
      ],
      internalDeps: [],
      depth: 0,
    },
    {
      id: 'lodash::cloneDeep',
      packageName: 'lodash',
      exportName: 'cloneDeep',
      consumers: [
        { filePath: 'src/store/reducer.ts', line: 4, column: 0, context: "import { cloneDeep } from 'lodash'" },
      ],
      internalDeps: [],
      depth: 0,
    },
  ];

  const axiosNodes: UsageNode[] = [
    {
      id: 'axios::default',
      packageName: 'axios',
      exportName: 'default',
      consumers: [
        { filePath: 'src/services/api.ts', line: 1, column: 0, context: "import axios from 'axios'" },
        { filePath: 'src/services/auth.ts', line: 2, column: 0, context: "import axios from 'axios'" },
        { filePath: 'src/services/users.ts', line: 1, column: 0, context: "import axios from 'axios'" },
      ],
      internalDeps: [],
      depth: 0,
    },
  ];

  const jwtNodes: UsageNode[] = [
    {
      id: 'jsonwebtoken::sign',
      packageName: 'jsonwebtoken',
      exportName: 'sign',
      consumers: [
        { filePath: 'src/auth/token.ts', line: 1, column: 0, context: "import { sign, verify } from 'jsonwebtoken'" },
      ],
      internalDeps: [],
      depth: 0,
    },
    {
      id: 'jsonwebtoken::verify',
      packageName: 'jsonwebtoken',
      exportName: 'verify',
      consumers: [
        { filePath: 'src/auth/token.ts', line: 1, column: 0, context: "import { sign, verify } from 'jsonwebtoken'" },
        { filePath: 'src/middleware/auth.ts', line: 3, column: 0, context: "import { verify } from 'jsonwebtoken'" },
      ],
      internalDeps: [],
      depth: 0,
    },
  ];

  for (const node of [...lodashNodes, ...axiosNodes, ...jwtNodes]) {
    nodes.set(node.id, node);
  }

  return nodes;
}

export function createDemoSuggestions(): RefactorSuggestion[] {
  return [
    {
      type: 'replace_package',
      packageName: 'moment',
      reason: 'moment.js is 4.2MB and mutable. You only use the default import for date formatting. date-fns is tree-shakeable; dayjs is 2KB.',
      alternative: 'date-fns or dayjs',
      sizeReduction: 4100000,
      confidence: 0.92,
    },
    {
      type: 'inline_code',
      packageName: 'lodash',
      reason: 'You only use "debounce", "get", and "cloneDeep" from lodash (3/312 exports = 0.9%). Inline them to drop 531KB.',
      codeSnippet: `function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}`,
      sizeReduction: 531000,
      confidence: 0.85,
    },
    {
      type: 'replace_package',
      packageName: 'axios',
      reason: 'You only use the default axios instance for HTTP calls. Native fetch() is built-in and covers your use case.',
      alternative: 'Native fetch API',
      sizeReduction: 180000,
      confidence: 0.78,
    },
    {
      type: 'replace_package',
      packageName: 'uuid',
      reason: 'You only use v4(). crypto.randomUUID() is a built-in that generates v4 UUIDs natively.',
      alternative: 'crypto.randomUUID()',
      sizeReduction: 32000,
      confidence: 0.95,
    },
    {
      type: 'replace_package',
      packageName: 'chalk',
      reason: 'Only the default export is used. picocolors is 14x smaller and covers the same use case.',
      alternative: 'picocolors',
      sizeReduction: 38000,
      confidence: 0.88,
    },
  ];
}

export function createDemoUpgradeImpacts(): UpgradeImpact[] {
  return [
    {
      packageName: 'lodash',
      currentVersion: '4.17.21',
      targetVersion: '5.0.0',
      bumpType: 'major',
      breakingChanges: [
        {
          description: 'Removed `_.pluck` in favor of `_.map` with iteratee shorthand',
          affectedApis: ['pluck'],
          affectsUser: false,
          affectedCallSites: [],
        },
        {
          description: 'Changed `_.debounce` to use `requestAnimationFrame` by default',
          affectedApis: ['debounce'],
          affectsUser: true,
          affectedCallSites: [
            { filePath: 'src/hooks/useSearch.ts', line: 3, column: 0, context: '' },
            { filePath: 'src/components/SearchBar.tsx', line: 5, column: 0, context: '' },
          ],
        },
      ],
      filesAffected: 2,
      risk: 'medium',
    },
    {
      packageName: 'axios',
      currentVersion: '1.6.2',
      targetVersion: '1.7.0',
      bumpType: 'minor',
      breakingChanges: [],
      filesAffected: 0,
      risk: 'none',
    },
  ];
}
