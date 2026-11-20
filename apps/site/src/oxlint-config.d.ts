// The shared JavaScript config has no bundled declaration.
declare module '@maxhill/oxlint-config' {
  const config: import('oxlint').OxlintConfig;
  export default config;
}
