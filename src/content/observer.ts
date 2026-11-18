export function observeMutations(onScan: () => void): void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const rescan = () => {
    clearTimeout(timer);
    timer = setTimeout(onScan, 250);
  };

  const observer = new MutationObserver(rescan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
