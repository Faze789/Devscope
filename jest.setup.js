// Mock op-sqlite
jest.mock('@op-engineering/op-sqlite', () => ({
  open: () => ({
    execute: jest.fn().mockResolvedValue({ rows: [] }),
    close: jest.fn(),
  }),
}));
