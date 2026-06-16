import type { DetectedField } from "../shared/types";

export function scanPageFields(): DetectedField[] {
  const maxNearbyItems = 6;
  const maxTextLength = 160;

  const normalizeText = (value: string | null | undefined): string | null => {
    if (!value) {
      return null;
    }

    const collapsed = value.replace(/\s+/g, " ").trim();
    if (!collapsed) {
      return null;
    }

    if (collapsed.length <= maxTextLength) {
      return collapsed;
    }

    return `${collapsed.slice(0, maxTextLength - 1).trimEnd()}…`;
  };

  const getReadonly = (element: HTMLElement): boolean => {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      return element.readOnly;
    }

    return element.getAttribute("aria-readonly") === "true";
  };

  const getDisabled = (element: HTMLElement): boolean => {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLButtonElement
    ) {
      return element.disabled;
    }

    return element.getAttribute("aria-disabled") === "true";
  };

  const getRequired = (element: HTMLElement): boolean => {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      return element.required;
    }

    return element.getAttribute("aria-required") === "true";
  };

  const isVisible = (element: HTMLElement): boolean => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }

    return true;
  };

  const isIgnoredInputType = (element: HTMLElement): boolean => {
    if (!(element instanceof HTMLInputElement)) {
      return false;
    }

    const ignoredTypes = new Set(["hidden", "submit", "password", "file"]);
    return ignoredTypes.has(element.type.toLowerCase());
  };

  const isCandidateField = (element: HTMLElement): boolean => {
    if (!element.isConnected || !isVisible(element)) {
      return false;
    }

    if (element instanceof HTMLButtonElement) {
      return false;
    }

    if (isIgnoredInputType(element)) {
      return false;
    }

    if (getDisabled(element)) {
      return false;
    }

    if (getReadonly(element)) {
      return false;
    }

    return true;
  };

  const getAriaLabelledByText = (element: HTMLElement): string | null => {
    const labelledBy = element.getAttribute("aria-labelledby");
    if (!labelledBy) {
      return null;
    }

    const parts = labelledBy
      .split(/\s+/)
      .map((id) => normalizeText(document.getElementById(id)?.textContent))
      .filter((value): value is string => Boolean(value));

    return normalizeText(parts.join(" "));
  };

  const getExplicitLabel = (element: HTMLElement): string | null => {
    const id = element.id;
    if (!id) {
      return null;
    }

    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    return normalizeText(label?.textContent);
  };

  const getWrappingLabel = (element: HTMLElement): string | null => {
    const label = element.closest("label");
    return normalizeText(label?.textContent);
  };

  const getPlaceholder = (element: HTMLElement): string | null => {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      return normalizeText(element.placeholder);
    }

    return null;
  };

  const collectPreviousSiblingText = (element: HTMLElement): string | null => {
    let current: HTMLElement | null = element;

    while (current) {
      let sibling: ChildNode | null = current.previousSibling;
      while (sibling) {
        if (sibling.nodeType === Node.TEXT_NODE) {
          const text = normalizeText(sibling.textContent);
          if (text) {
            return text;
          }
        }

        if (sibling instanceof HTMLElement) {
          const text = normalizeText(sibling.innerText || sibling.textContent);
          if (text) {
            return text;
          }
        }

        sibling = sibling.previousSibling;
      }

      current = current.parentElement;
    }

    return null;
  };

  const getSectionHeading = (element: HTMLElement): string | null => {
    let current = element.parentElement;

    while (current) {
      const heading = current.querySelector(
        "legend, h1, h2, h3, h4, h5, h6, [role='heading']"
      );
      const text = normalizeText(heading?.textContent);
      if (text) {
        return text;
      }

      current = current.parentElement;
    }

    return null;
  };

  const findMeaningfulContainer = (element: HTMLElement): HTMLElement => {
    const selectors = [
      "[data-testid]",
      "[role='group']",
      "fieldset",
      "form",
      "section",
      "article",
      "li",
      ".form-row",
      ".form-group",
      ".field",
      ".input-group",
      "div"
    ];

    for (const selector of selectors) {
      const container = element.closest<HTMLElement>(selector);
      if (!container) {
        continue;
      }

      const text = normalizeText(container.innerText || container.textContent);
      if (text) {
        return container;
      }
    }

    return element.parentElement ?? element;
  };

  const collectNearbyText = (element: HTMLElement): string[] => {
    const container = findMeaningfulContainer(element);
    const texts = new Set<string>();

    const addText = (value: string | null) => {
      if (value) {
        texts.add(value);
      }
    };

    addText(getExplicitLabel(element));
    addText(getWrappingLabel(element));
    addText(getAriaLabelledByText(element));
    addText(getSectionHeading(element));

    const siblings = Array.from(container.children).slice(0, 12);
    for (const sibling of siblings) {
      if (!(sibling instanceof HTMLElement) || sibling === element) {
        continue;
      }

      addText(normalizeText(sibling.innerText || sibling.textContent));
      if (texts.size >= maxNearbyItems) {
        break;
      }
    }

    return Array.from(texts).slice(0, maxNearbyItems);
  };

  const getLabelText = (element: HTMLElement): string | null => {
    return (
      getExplicitLabel(element) ??
      getWrappingLabel(element) ??
      normalizeText(element.getAttribute("aria-label")) ??
      getAriaLabelledByText(element) ??
      getPlaceholder(element) ??
      collectPreviousSiblingText(element) ??
      getSectionHeading(element) ??
      collectNearbyText(element)[0] ??
      null
    );
  };

  const getCurrentValue = (element: HTMLElement): string | null => {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      return normalizeText(element.value);
    }

    return normalizeText(element.innerText || element.textContent);
  };

  const getOptions = (element: HTMLElement): string[] | undefined => {
    if (!(element instanceof HTMLSelectElement)) {
      return undefined;
    }

    return Array.from(element.options)
      .map((option) => normalizeText(option.text))
      .filter((value): value is string => Boolean(value));
  };

  const getDomPath = (element: HTMLElement): string => {
    const parts: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== document.body && parts.length < 6) {
      const currentElement: HTMLElement = current;
      const parentElement: HTMLElement | null = currentElement.parentElement;
      if (!parentElement) {
        break;
      }

      const siblings = Array.from(parentElement.children as HTMLCollectionOf<HTMLElement>).filter(
        (child) => {
          return child.tagName === currentElement.tagName;
        }
      );
      const index = siblings.indexOf(currentElement);
      parts.unshift(`${currentElement.tagName.toLowerCase()}:${index}`);
      current = parentElement;
    }

    return parts.join(">");
  };

  const buildInternalId = (element: HTMLElement, index: number): string => {
    const idPart = normalizeText(element.id)?.replace(/\s+/g, "-") ?? "no-id";
    const namePart =
      normalizeText(element.getAttribute("name"))?.replace(/\s+/g, "-") ??
      "no-name";
    const pathPart = getDomPath(element).replace(/[^a-z0-9:>_-]/gi, "");

    return `field-${index}-${element.tagName.toLowerCase()}-${idPart}-${namePart}-${pathPart}`;
  };

  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(
      "input, textarea, select, [contenteditable='true'], [role='textbox'], [role='combobox']"
    )
  );

  return elements
    .filter((element) => isCandidateField(element))
    .map((element, index) => {
      const rect = element.getBoundingClientRect();

      return {
        internalId: buildInternalId(element, index),
        tagName: element.tagName.toLowerCase(),
        inputType:
          element instanceof HTMLInputElement ? element.type.toLowerCase() : undefined,
        role: element.getAttribute("role"),
        name: element.getAttribute("name"),
        id: element.id || null,
        ariaLabel: normalizeText(element.getAttribute("aria-label")),
        ariaLabelledByText: getAriaLabelledByText(element),
        placeholder: getPlaceholder(element),
        labelText: getLabelText(element),
        nearbyText: collectNearbyText(element),
        sectionText: getSectionHeading(element),
        currentValue: getCurrentValue(element),
        options: getOptions(element),
        required: getRequired(element),
        disabled: getDisabled(element),
        readonly: getReadonly(element),
        boundingBox: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }
      } satisfies DetectedField;
    });
}
