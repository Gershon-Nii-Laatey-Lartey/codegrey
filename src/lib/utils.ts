export const getFileIcon = (fileName: string, isDir?: boolean) => {
  if (isDir) return { svg: "/seti-icons/folder.svg", color: "#d4d7d6" };

  const lower = fileName.toLowerCase();
  const ext = fileName.split('.').pop()?.toLowerCase();

  // Colors
  const colors = {
    blue: "#519aba",
    yellow: "#cbcb41",
    orange: "#e34c26",
    red: "#cc3e44",
    green: "#41b883",
    purple: "#a074c4",
    pink: "#f55385",
    grey: "#d4d7d6",
    darkGrey: "#41535b",
    cyan: "#11a8cd",
  };

  // 1. Exact Name Matches (Highest Priority)
  const exactNames: Record<string, { svg: string, color: string }> = {
    "package.json": { svg: "/seti-icons/npm.svg", color: colors.red },
    "package-lock.json": { svg: "/seti-icons/npm.svg", color: colors.red },
    "tsconfig.json": { svg: "/seti-icons/tsconfig.svg", color: colors.blue },
    "vite.config.ts": { svg: "/seti-icons/vite.svg", color: colors.yellow },
    "vite.config.js": { svg: "/seti-icons/vite.svg", color: colors.yellow },
    ".gitignore": { svg: "/seti-icons/git_ignore.svg", color: colors.darkGrey },
    ".gitconfig": { svg: "/seti-icons/git.svg", color: colors.orange },
    "dockerfile": { svg: "/seti-icons/docker.svg", color: colors.cyan },
    "docker-compose.yml": { svg: "/seti-icons/docker.svg", color: colors.cyan },
    "docker-compose.yaml": { svg: "/seti-icons/docker.svg", color: colors.cyan },
    "makefile": { svg: "/seti-icons/makefile.svg", color: colors.yellow },
    ".editorconfig": { svg: "/seti-icons/editorconfig.svg", color: colors.grey },
    ".eslintrc.js": { svg: "/seti-icons/eslint.svg", color: colors.purple },
    ".eslintrc.json": { svg: "/seti-icons/eslint.svg", color: colors.purple },
    "favicon.ico": { svg: "/seti-icons/favicon.svg", color: colors.yellow },
    "gemfile": { svg: "/seti-icons/ruby.svg", color: colors.red },
    "rakefile": { svg: "/seti-icons/ruby.svg", color: colors.red },
    "procfile": { svg: "/seti-icons/heroku.svg", color: colors.purple },
    "webpack.config.js": { svg: "/seti-icons/webpack.svg", color: colors.blue },
    "rollup.config.js": { svg: "/seti-icons/rollup.svg", color: colors.red },
    "jenkinsfile": { svg: "/seti-icons/jenkins.svg", color: colors.orange },
    "firebase.json": { svg: "/seti-icons/firebase.svg", color: colors.yellow },
    ".babelrc": { svg: "/seti-icons/babel.svg", color: colors.yellow },
    ".eslintignore": { svg: "/seti-icons/eslint.svg", color: colors.darkGrey },
    "bower.json": { svg: "/seti-icons/bower.svg", color: colors.orange },
    "gruntfile.js": { svg: "/seti-icons/grunt.svg", color: colors.orange },
    "gulpfile.js": { svg: "/seti-icons/gulp.svg", color: colors.red },
    "karma.conf.js": { svg: "/seti-icons/karma.svg", color: colors.red },
    "platformio.ini": { svg: "/seti-icons/platformio.svg", color: colors.orange },
    "build": { svg: "/seti-icons/bazel.svg", color: colors.green },
    ".codeclimate.yml": { svg: "/seti-icons/code-climate.svg", color: colors.green },
    "stylelint.config.js": { svg: "/seti-icons/stylelint.svg", color: colors.yellow },
  };

  if (exactNames[lower]) return exactNames[lower];
  if (lower.includes("license")) return { svg: "/seti-icons/license.svg", color: colors.yellow };

  // 2. Extension Matches
  const extMap: Record<string, { svg: string, color: string }> = {
    // Web & JS
    js: { svg: "/seti-icons/javascript.svg", color: colors.yellow },
    mjs: { svg: "/seti-icons/javascript.svg", color: colors.yellow },
    cjs: { svg: "/seti-icons/javascript.svg", color: colors.yellow },
    ts: { svg: "/seti-icons/typescript.svg", color: colors.blue },
    mts: { svg: "/seti-icons/typescript.svg", color: colors.blue },
    cts: { svg: "/seti-icons/typescript.svg", color: colors.blue },
    tsx: { svg: "/seti-icons/react.svg", color: colors.blue },
    jsx: { svg: "/seti-icons/react.svg", color: colors.yellow },
    css: { svg: "/seti-icons/css.svg", color: colors.blue },
    scss: { svg: "/seti-icons/sass.svg", color: colors.pink },
    sass: { svg: "/seti-icons/sass.svg", color: colors.pink },
    less: { svg: "/seti-icons/less.svg", color: colors.blue },
    html: { svg: "/seti-icons/html.svg", color: colors.orange },
    json: { svg: "/seti-icons/json.svg", color: colors.yellow },
    svg: { svg: "/seti-icons/svg.svg", color: colors.yellow },
    vue: { svg: "/seti-icons/vue.svg", color: colors.green },
    svelte: { svg: "/seti-icons/svelte.svg", color: colors.orange },
    graphql: { svg: "/seti-icons/graphql.svg", color: colors.pink },
    gql: { svg: "/seti-icons/graphql.svg", color: colors.pink },

    // Languages
    py: { svg: "/seti-icons/python.svg", color: colors.blue },
    rs: { svg: "/seti-icons/rust.svg", color: colors.grey },
    go: { svg: "/seti-icons/go.svg", color: colors.cyan },
    php: { svg: "/seti-icons/php.svg", color: colors.purple },
    rb: { svg: "/seti-icons/ruby.svg", color: colors.red },
    java: { svg: "/seti-icons/java.svg", color: colors.red },
    jar: { svg: "/seti-icons/java.svg", color: colors.red },
    cpp: { svg: "/seti-icons/cpp.svg", color: colors.blue },
    hpp: { svg: "/seti-icons/cpp.svg", color: colors.blue },
    cc: { svg: "/seti-icons/cpp.svg", color: colors.blue },
    hh: { svg: "/seti-icons/cpp.svg", color: colors.blue },
    c: { svg: "/seti-icons/c.svg", color: colors.blue },
    h: { svg: "/seti-icons/c.svg", color: colors.blue },
    cs: { svg: "/seti-icons/c-sharp.svg", color: colors.purple },
    swift: { svg: "/seti-icons/swift.svg", color: colors.orange },
    kt: { svg: "/seti-icons/kotlin.svg", color: colors.purple },
    kts: { svg: "/seti-icons/kotlin.svg", color: colors.purple },
    dart: { svg: "/seti-icons/dart.svg", color: colors.cyan },
    lua: { svg: "/seti-icons/lua.svg", color: colors.blue },
    ex: { svg: "/seti-icons/elixir.svg", color: colors.purple },
    exs: { svg: "/seti-icons/elixir.svg", color: colors.purple },
    erl: { svg: "/seti-icons/hex.svg", color: colors.purple },
    clj: { svg: "/seti-icons/clojure.svg", color: colors.green },
    cljs: { svg: "/seti-icons/clojure.svg", color: colors.green },
    hs: { svg: "/seti-icons/haskell.svg", color: colors.purple },
    scala: { svg: "/seti-icons/scala.svg", color: colors.red },
    sc: { svg: "/seti-icons/scala.svg", color: colors.red },
    sol: { svg: "/seti-icons/ethereum.svg", color: colors.blue },
    gd: { svg: "/seti-icons/godot.svg", color: colors.blue },
    groovy: { svg: "/seti-icons/grails.svg", color: colors.green },
    hx: { svg: "/seti-icons/haxe.svg", color: colors.orange },
    ls: { svg: "/seti-icons/livescript.svg", color: colors.yellow },
    re: { svg: "/seti-icons/reasonml.svg", color: colors.orange },
    res: { svg: "/seti-icons/rescript.svg", color: colors.red },
    cls: { svg: "/seti-icons/salesforce.svg", color: colors.blue },
    tex: { svg: "/seti-icons/tex.svg", color: colors.blue },
    vala: { svg: "/seti-icons/vala.svg", color: colors.grey },
    hxproj: { svg: "/seti-icons/haxe.svg", color: colors.orange },
    pp: { svg: "/seti-icons/puppet.svg", color: colors.yellow },
    zig: { svg: "/seti-icons/zig.svg", color: colors.yellow },
    nim: { svg: "/seti-icons/nim.svg", color: colors.yellow },
    julia: { svg: "/seti-icons/julia.svg", color: colors.purple },
    r: { svg: "/seti-icons/R.svg", color: colors.blue },
    perl: { svg: "/seti-icons/perl.svg", color: colors.blue },
    pl: { svg: "/seti-icons/perl.svg", color: colors.blue },
    pm: { svg: "/seti-icons/perl.svg", color: colors.blue },
    sh: { svg: "/seti-icons/shell.svg", color: colors.green },
    bash: { svg: "/seti-icons/shell.svg", color: colors.green },
    zsh: { svg: "/seti-icons/shell.svg", color: colors.green },
    ps1: { svg: "/seti-icons/powershell.svg", color: colors.blue },
    elm: { svg: "/seti-icons/elm.svg", color: colors.cyan },
    purescript: { svg: "/seti-icons/purescript.svg", color: colors.grey },
    purs: { svg: "/seti-icons/purescript.svg", color: colors.grey },
    coffee: { svg: "/seti-icons/coffee.svg", color: colors.grey },
    cjsx: { svg: "/seti-icons/cjsx.svg", color: colors.grey },
    cu: { svg: "/seti-icons/cu.svg", color: colors.green },
    asm: { svg: "/seti-icons/asm.svg", color: colors.red },
    s: { svg: "/seti-icons/asm.svg", color: colors.red },
    wasm: { svg: "/seti-icons/wasm.svg", color: colors.purple },
    wat: { svg: "/seti-icons/wat.svg", color: colors.purple },
    crystal: { svg: "/seti-icons/crystal.svg", color: colors.grey },
    nimrod: { svg: "/seti-icons/nim.svg", color: colors.yellow },

    // Frameworks & Tools
    tf: { svg: "/seti-icons/terraform.svg", color: colors.purple },
    tfvars: { svg: "/seti-icons/terraform.svg", color: colors.purple },
    prisma: { svg: "/seti-icons/prisma.svg", color: colors.blue },
    docker: { svg: "/seti-icons/docker.svg", color: colors.cyan },
    yaml: { svg: "/seti-icons/yml.svg", color: colors.purple },
    yml: { svg: "/seti-icons/yml.svg", color: colors.purple },
    xml: { svg: "/seti-icons/xml.svg", color: colors.orange },
    sql: { svg: "/seti-icons/db.svg", color: colors.blue },
    db: { svg: "/seti-icons/db.svg", color: colors.blue },
    gradle: { svg: "/seti-icons/gradle.svg", color: colors.cyan },
    maven: { svg: "/seti-icons/maven.svg", color: colors.red },
    sbt: { svg: "/seti-icons/sbt.svg", color: colors.blue },
    cmake: { svg: "/seti-icons/makefile.svg", color: colors.yellow },
    jade: { svg: "/seti-icons/jade.svg", color: colors.red },
    pug: { svg: "/seti-icons/pug.svg", color: colors.red },
    haml: { svg: "/seti-icons/haml.svg", color: colors.red },
    slim: { svg: "/seti-icons/slim.svg", color: colors.orange },
    liquid: { svg: "/seti-icons/liquid.svg", color: colors.green },
    mustache: { svg: "/seti-icons/mustache.svg", color: colors.orange },
    nunjucks: { svg: "/seti-icons/nunjucks.svg", color: colors.green },
    njk: { svg: "/seti-icons/nunjucks.svg", color: colors.green },
    jinja: { svg: "/seti-icons/jinja.svg", color: colors.red },
    twig: { svg: "/seti-icons/twig.svg", color: colors.green },
    ejs: { svg: "/seti-icons/ejs.svg", color: colors.yellow },
    "html.erb": { svg: "/seti-icons/html_erb.svg", color: colors.red },
    "js.erb": { svg: "/seti-icons/js_erb.svg", color: colors.yellow },
    erb: { svg: "/seti-icons/html_erb.svg", color: colors.red },
    tpl: { svg: "/seti-icons/smarty.svg", color: colors.red },
    styl: { svg: "/seti-icons/stylus.svg", color: colors.green },
    ad: { svg: "/seti-icons/argdown.svg", color: colors.blue },
    bicep: { svg: "/seti-icons/bicep.svg", color: colors.blue },
    bsl: { svg: "/seti-icons/bsl.svg", color: colors.red },
    cake: { svg: "/seti-icons/cake.svg", color: colors.yellow },
    ctp: { svg: "/seti-icons/cake_php.svg", color: colors.red },
    cfm: { svg: "/seti-icons/coldfusion.svg", color: colors.blue },
    cfc: { svg: "/seti-icons/coldfusion.svg", color: colors.blue },
    ecr: { svg: "/seti-icons/crystal_embedded.svg", color: colors.grey },
    pddl: { svg: "/seti-icons/pddl.svg", color: colors.grey },

    // Assets & Documents
    md: { svg: "/seti-icons/markdown.svg", color: colors.blue },
    markdown: { svg: "/seti-icons/markdown.svg", color: colors.blue },
    pdf: { svg: "/seti-icons/pdf.svg", color: colors.red },
    doc: { svg: "/seti-icons/word.svg", color: colors.blue },
    docx: { svg: "/seti-icons/word.svg", color: colors.blue },
    xls: { svg: "/seti-icons/xls.svg", color: colors.green },
    xlsx: { svg: "/seti-icons/xls.svg", color: colors.green },
    ppt: { svg: "/seti-icons/plan.svg", color: colors.orange },
    pptx: { svg: "/seti-icons/plan.svg", color: colors.orange },
    png: { svg: "/seti-icons/image.svg", color: colors.purple },
    jpg: { svg: "/seti-icons/image.svg", color: colors.purple },
    jpeg: { svg: "/seti-icons/image.svg", color: colors.purple },
    gif: { svg: "/seti-icons/image.svg", color: colors.purple },
    webp: { svg: "/seti-icons/image.svg", color: colors.purple },
    ico: { svg: "/seti-icons/image.svg", color: colors.yellow },
    svg_asset: { svg: "/seti-icons/svg.svg", color: colors.yellow },
    ai: { svg: "/seti-icons/illustrator.svg", color: colors.yellow },
    psd: { svg: "/seti-icons/photoshop.svg", color: colors.blue },
    mp3: { svg: "/seti-icons/audio.svg", color: colors.purple },
    wav: { svg: "/seti-icons/audio.svg", color: colors.purple },
    mp4: { svg: "/seti-icons/video.svg", color: colors.purple },
    mov: { svg: "/seti-icons/video.svg", color: colors.purple },
    zip: { svg: "/seti-icons/zip.svg", color: colors.yellow },
    tar: { svg: "/seti-icons/zip.svg", color: colors.yellow },
    gz: { svg: "/seti-icons/zip.svg", color: colors.yellow },
    rar: { svg: "/seti-icons/zip.svg", color: colors.yellow },
    "7z": { svg: "/seti-icons/zip.svg", color: colors.yellow },
    ttf: { svg: "/seti-icons/font.svg", color: colors.red },
    woff: { svg: "/seti-icons/font.svg", color: colors.red },
    woff2: { svg: "/seti-icons/font.svg", color: colors.red },
  };

  if (ext && extMap[ext]) return extMap[ext];

  // 3. Fallback to generic icons
  if (lower.endsWith(".config.js") || lower.endsWith(".config.ts") || lower.includes("config")) {
    return { svg: "/seti-icons/config.svg", color: colors.grey };
  }

  return { svg: "/seti-icons/default.svg", color: colors.grey };
};

export function getRelativePath(root: string, fullPath: string) {
  if (!root) return fullPath;
  const r = root.replace(/[/\\]+$/, '');
  if (fullPath.startsWith(r)) {
    let rel = fullPath.slice(r.length);
    if (rel.startsWith('/') || rel.startsWith('\\')) rel = rel.slice(1);
    return rel;
  }
  return fullPath;
}

export function getBaseName(filePath: string) {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}
