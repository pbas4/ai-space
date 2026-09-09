export interface IgnoreRule {
  basePath: string;
  negated: boolean;
  pattern: RegExp;
}

function escapeRegularExpression(character: string): string {
  return /[\\^$.[\]{}()+|]/.test(character) ? `\\${character}` : character;
}

function globSource(pattern: string): string {
  let source = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        if (pattern[index + 2] === "/") {
          source += "(?:.*/)?";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else {
        source += "[^/]*";
      }
    } else if (character === "?") {
      source += "[^/]";
    } else if (character !== undefined) {
      source += escapeRegularExpression(character);
    }
  }

  return source;
}

export function parseIgnoreFile(contents: string, basePath: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];

  for (const rawLine of contents.split(/\r?\n/u)) {
    if (rawLine === "" || rawLine.startsWith("#")) continue;

    let line = rawLine;
    let negated = false;
    if (line.startsWith("\\#") || line.startsWith("\\!")) {
      line = line.slice(1);
    } else if (line.startsWith("!")) {
      negated = true;
      line = line.slice(1);
    }
    if (line === "") continue;

    const rooted = line.startsWith("/");
    if (rooted) line = line.slice(1);
    const directoryOnly = line.endsWith("/");
    if (directoryOnly) line = line.slice(0, -1);
    if (line === "") continue;

    const source = globSource(line);
    const containsSlash = line.includes("/");
    const prefix = rooted || containsSlash ? "^" : "(?:^|/)";
    const suffix = directoryOnly || containsSlash ? "(?:/.*)?$" : "(?:$|/)";

    rules.push({
      basePath,
      negated,
      pattern: new RegExp(`${prefix}${source}${suffix}`, "u"),
    });
  }

  return rules;
}

export function isIgnored(relativePath: string, rules: IgnoreRule[]): boolean {
  let ignored = false;

  for (const rule of rules) {
    const pathWithinBase =
      rule.basePath === ""
        ? relativePath
        : relativePath === rule.basePath
          ? ""
          : relativePath.startsWith(`${rule.basePath}/`)
            ? relativePath.slice(rule.basePath.length + 1)
            : undefined;

    if (pathWithinBase !== undefined && rule.pattern.test(pathWithinBase)) {
      ignored = !rule.negated;
    }
  }

  return ignored;
}
