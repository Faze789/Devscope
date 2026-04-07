import { create } from 'zustand';
import { Dependency, UsageNode, CVE, RefactorSuggestion, UpgradeImpact } from '../types';

interface DependencyState {
  /** All dependencies for the active repository */
  dependencies: Dependency[];
  /** Usage graph nodes */
  usageGraph: Map<string, UsageNode>;
  /** All CVEs across dependencies */
  cves: CVE[];
  /** Refactoring suggestions */
  suggestions: RefactorSuggestion[];
  /** Upgrade impact previews */
  upgradeImpacts: UpgradeImpact[];
  /** Loading states */
  loading: {
    dependencies: boolean;
    cves: boolean;
    suggestions: boolean;
  };

  setDependencies: (deps: Dependency[]) => void;
  setUsageGraph: (graph: Map<string, UsageNode>) => void;
  setCVEs: (cves: CVE[]) => void;
  setSuggestions: (suggestions: RefactorSuggestion[]) => void;
  setUpgradeImpacts: (impacts: UpgradeImpact[]) => void;
  setLoading: (key: keyof DependencyState['loading'], value: boolean) => void;
  getDependency: (name: string) => Dependency | undefined;
  getCVEsForPackage: (name: string) => CVE[];
  getCVEsInUsagePath: () => CVE[];
  getCVEsOutsideUsagePath: () => CVE[];
  reset: () => void;
}

const initialState = {
  dependencies: [],
  usageGraph: new Map<string, UsageNode>(),
  cves: [],
  suggestions: [],
  upgradeImpacts: [],
  loading: { dependencies: false, cves: false, suggestions: false },
};

export const useDependencyStore = create<DependencyState>((set, get) => ({
  ...initialState,

  setDependencies: (deps) => set({ dependencies: deps }),
  setUsageGraph: (graph) => set({ usageGraph: graph }),
  setCVEs: (cves) => set({ cves }),
  setSuggestions: (suggestions) => set({ suggestions }),
  setUpgradeImpacts: (impacts) => set({ upgradeImpacts: impacts }),

  setLoading: (key, value) =>
    set((state) => ({
      loading: { ...state.loading, [key]: value },
    })),

  getDependency: (name) => get().dependencies.find((d) => d.name === name),

  getCVEsForPackage: (name) =>
    get().cves.filter((c) =>
      get().dependencies.find((d) => d.name === name)?.cves.some((dc) => dc.id === c.id),
    ),

  getCVEsInUsagePath: () => get().cves.filter((c) => c.inUsagePath),
  getCVEsOutsideUsagePath: () => get().cves.filter((c) => !c.inUsagePath),

  reset: () => set(initialState),
}));
