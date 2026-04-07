import { create } from 'zustand';
import { Repository, AnalysisStatus } from '../types';

interface RepositoryState {
  repositories: Repository[];
  activeRepositoryId: string | null;

  addRepository: (repo: Repository) => void;
  removeRepository: (id: string) => void;
  setActiveRepository: (id: string | null) => void;
  updateAnalysisStatus: (id: string, status: AnalysisStatus) => void;
  updateRepository: (id: string, updates: Partial<Repository>) => void;
  getActiveRepository: () => Repository | undefined;
}

export const useRepositoryStore = create<RepositoryState>((set, get) => ({
  repositories: [],
  activeRepositoryId: null,

  addRepository: (repo) =>
    set((state) => ({
      repositories: [...state.repositories, repo],
      activeRepositoryId: state.activeRepositoryId ?? repo.id,
    })),

  removeRepository: (id) =>
    set((state) => ({
      repositories: state.repositories.filter((r) => r.id !== id),
      activeRepositoryId:
        state.activeRepositoryId === id
          ? state.repositories.find((r) => r.id !== id)?.id ?? null
          : state.activeRepositoryId,
    })),

  setActiveRepository: (id) => set({ activeRepositoryId: id }),

  updateAnalysisStatus: (id, status) =>
    set((state) => ({
      repositories: state.repositories.map((r) =>
        r.id === id ? { ...r, analysisStatus: status } : r,
      ),
    })),

  updateRepository: (id, updates) =>
    set((state) => ({
      repositories: state.repositories.map((r) =>
        r.id === id ? { ...r, ...updates } : r,
      ),
    })),

  getActiveRepository: () => {
    const state = get();
    return state.repositories.find((r) => r.id === state.activeRepositoryId);
  },
}));
