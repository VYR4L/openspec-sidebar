export const workspace = {
  getConfiguration: () => ({
    get: (_key: string, defaultValue: unknown) => defaultValue
  })
};
