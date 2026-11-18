export function queryAllDeep(root: ParentNode, selector: string): Element[] {
  const results: Element[] = [];
  try {
    results.push(...root.querySelectorAll(selector));
  } catch {
    return results;
  }
  for (const el of root.querySelectorAll("*")) {
    if (el.shadowRoot) results.push(...queryAllDeep(el.shadowRoot, selector));
  }
  return results;
}

export function scriptUrls(doc: Document): string[] {
  return [...doc.querySelectorAll("script[src]")].map(
    (s) => s.getAttribute("src") ?? ""
  );
}

export function currentFrameOrigin(): string | undefined {
  try {
    return window.location.origin;
  } catch {
    return undefined;
  }
}
