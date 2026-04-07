export type RootStackParamList = {
  Home: undefined;
  DependencyList: {
    repositoryId: string;
    repositoryName: string;
  };
  DependencyDetail: {
    packageName: string;
  };
  CVEDetail: {
    cveId: string;
  };
  Settings: undefined;
};

export type TabParamList = {
  Overview: undefined;
  Dependencies: undefined;
  Security: undefined;
  Settings: undefined;
};
