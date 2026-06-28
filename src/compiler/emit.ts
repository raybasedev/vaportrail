import postcss, { type AtRule, type ChildNode } from "postcss";
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

export function applyEmitPolicy(css: string, policy: ResolvedEmitPolicy): string {
  if (isFullPolicy(policy)) {
    return css;
  }

  const root = postcss.parse(css);

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
    if (!shouldKeepTopLevelNode(node, policy)) {
      node.remove();
    }
  }

  return root.toString();
}

function isFullPolicy(policy: ResolvedEmitPolicy): boolean {
  return (
    policy.theme === "all" &&
    policy.base &&
    policy.components &&
    policy.utilities &&
    policy.properties
  );
}

function shouldKeepTopLevelNode(node: ChildNode, policy: ResolvedEmitPolicy): boolean {
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

    return policy.components;
  }

  return policy.components;
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
