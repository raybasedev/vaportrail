import postcss, { type AtRule, type ChildNode, type Rule } from "postcss";
import type { EmitPolicy, ResolvedEmitPolicy } from "./types.js";

const allPolicy: ResolvedEmitPolicy = {
  theme: "all",
  base: true,
  components: true,
  utilities: true,
  properties: true,
};

export function normalizeEmitPolicy(policy: EmitPolicy | undefined): ResolvedEmitPolicy {
  if (!policy || policy === "full") {
    return { ...allPolicy };
  }

  if (policy === "runtime") {
    return {
      theme: "all",
      base: false,
      components: false,
      utilities: true,
      properties: true,
    };
  }

  return {
    theme: policy.theme ?? "all",
    base: policy.base ?? true,
    components: policy.components ?? true,
    utilities: policy.utilities ?? true,
    properties: policy.properties ?? true,
  };
}

export function applyEmitPolicy(input: {
  css: string;
  baselineCss: string;
  policy: ResolvedEmitPolicy;
}): string {
  const { css, baselineCss, policy } = input;

  if (isFullEmitPolicy(policy)) {
    return css;
  }

  const root = postcss.parse(css);
  const baselineTopLevelNodes = topLevelNodeFingerprints(baselineCss);

  root.walkAtRules("layer", (rule) => {
    if (!rule.nodes) {
      rewriteLayerOrder(rule, policy);
      return;
    }

    const layer = firstLayerName(rule.params);
    if (!layer || !shouldKeepLayer(layer, policy)) {
      rule.remove();
    }
  });

  for (const node of [...root.nodes]) {
    if (!shouldKeepTopLevelNode(node, policy, baselineTopLevelNodes)) {
      node.remove();
    }
  }

  return root.toString();
}

export function isFullEmitPolicy(policy: ResolvedEmitPolicy): boolean {
  return (
    policy.theme === "all" &&
    policy.base &&
    policy.components &&
    policy.utilities &&
    policy.properties
  );
}

function shouldKeepTopLevelNode(
  node: ChildNode,
  policy: ResolvedEmitPolicy,
  baselineTopLevelNodes: ReadonlySet<string>,
): boolean {
  const keepComponentOrGeneratedUtility =
    policy.components || isGeneratedTopLevelUtility(node, policy.utilities, baselineTopLevelNodes);

  if (node.type === "comment") {
    return true;
  }

  if (node.type === "atrule") {
    if (node.name === "property") {
      return policy.properties;
    }

    if (node.name === "layer") {
      return true;
    }

    if (node.name === "keyframes") {
      return policy.utilities;
    }

    return keepComponentOrGeneratedUtility;
  }

  if (node.type === "rule" && isTopLevelThemeRule(node)) {
    return policy.theme === "all";
  }

  return keepComponentOrGeneratedUtility;
}

function rewriteLayerOrder(rule: AtRule, policy: ResolvedEmitPolicy): void {
  const retained = rule.params
    .split(",")
    .map((part) => part.trim())
    .filter((layer) => layer && shouldKeepLayer(layer, policy));

  if (retained.length === 0) {
    rule.remove();
    return;
  }

  rule.params = retained.join(", ");
}

function firstLayerName(params: string): string | null {
  return params.split(",")[0]?.trim().split(/\s+/)[0] ?? null;
}

function shouldKeepLayer(layer: string, policy: ResolvedEmitPolicy): boolean {
  if (layer === "theme") return policy.theme === "all";
  if (layer === "base") return policy.base;
  if (layer === "components") return policy.components;
  if (layer === "utilities") return policy.utilities;
  return policy.components;
}

function topLevelNodeFingerprints(css: string): Set<string> {
  const root = postcss.parse(css);
  return new Set(root.nodes.map((node) => nodeFingerprint(node)));
}

function isGeneratedTopLevelUtility(
  node: ChildNode,
  keepUtilities: boolean,
  baselineTopLevelNodes: ReadonlySet<string>,
): boolean {
  return keepUtilities && !baselineTopLevelNodes.has(nodeFingerprint(node));
}

function nodeFingerprint(node: ChildNode): string {
  return node.toString().trim();
}

function isTopLevelThemeRule(node: Rule): boolean {
  if (node.selector !== ":root, :host" && node.selector !== ":root") {
    return false;
  }

  const declarations = node.nodes?.filter((child) => child.type === "decl") ?? [];
  return (
    declarations.length > 0 &&
    declarations.every((declaration) => declaration.prop.startsWith("--"))
  );
}
