export function getLanguageFromExtension(
  extension: string | undefined,
): string | null {
  if (!extension) return null;

  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    mjs: 'javascript',
    cjs: 'javascript',

    // Web
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',

    // Python
    py: 'python',
    pyw: 'python',

    // Java/Kotlin
    java: 'java',
    kt: 'kotlin',
    kts: 'kotlin',

    // C/C++/C#
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',

    // Go
    go: 'go',

    // Rust
    rs: 'rust',

    // Ruby
    rb: 'ruby',

    // PHP
    php: 'php',

    // Shell
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'bash',

    // Configuration
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    ini: 'ini',
    xml: 'xml',

    // SQL
    sql: 'sql',

    // Markdown
    md: 'markdown',
    mdx: 'markdown',

    // Docker
    dockerfile: 'dockerfile',

    // Make
    makefile: 'makefile',
    mk: 'makefile',

    // Swift
    swift: 'swift',

    // Objective-C
    m: 'objectivec',
    mm: 'objectivec',

    // Lua
    lua: 'lua',

    // Perl
    pl: 'perl',
    pm: 'perl',

    // R
    r: 'r',

    // Scala
    scala: 'scala',
    sc: 'scala',

    // Clojure
    clj: 'clojure',
    cljs: 'clojure',

    // Haskell
    hs: 'haskell',

    // Elixir
    ex: 'elixir',
    exs: 'elixir',

    // Dart
    dart: 'dart',

    // Julia
    jl: 'julia',

    // Vim
    vim: 'vim',

    // GraphQL
    graphql: 'graphql',
    gql: 'graphql',

    // Protobuf
    proto: 'protobuf',
  };

  return languageMap[extension.toLowerCase()] || null;
}

export function isImageFile(extension: string | undefined): boolean {
  if (!extension) return false;
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(
    extension.toLowerCase(),
  );
}

export function isSvgFile(extension: string | undefined): boolean {
  if (!extension) return false;
  return extension.toLowerCase() === 'svg';
}

export function isJsonFile(extension: string | undefined): boolean {
  if (!extension) return false;
  return extension.toLowerCase() === 'json';
}

export function isZipFile(extension: string | undefined): boolean {
  if (!extension) return false;
  return ['zip', 'jar', 'war', 'ear'].includes(extension.toLowerCase());
}

export function isSpreadsheetFile(extension: string | undefined): boolean {
  if (!extension) return false;
  return ['xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'tab'].includes(
    extension.toLowerCase(),
  );
}
