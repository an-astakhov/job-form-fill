import type { ApprovedSuggestion, FillResult } from "../shared/types";

export function fillApprovedFields(
  approvedSuggestions: ApprovedSuggestion[]
): FillResult[] {
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

    return `${collapsed.slice(0, maxTextLength - 1).trimEnd()}...`;
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

    if (getDisabled(element) || getReadonly(element)) {
      return false;
    }

    return true;
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

      const siblings = Array.from(
        parentElement.children as HTMLCollectionOf<HTMLElement>
      ).filter((child) => {
        return child.tagName === currentElement.tagName;
      });
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

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      "input, textarea, select, [contenteditable='true'], [role='textbox'], [role='combobox']"
    )
  ).filter((element) => isCandidateField(element));

  const elementByInternalId = new Map<string, HTMLElement>();
  for (const [index, element] of candidates.entries()) {
    elementByInternalId.set(buildInternalId(element, index), element);
  }

  const dispatchFieldEvents = (element: HTMLElement): void => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  };

  const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    const setter = descriptor?.set;

    if (setter) {
      setter.call(element, value);
    } else {
      element.value = value;
    }
  };

  const fillSelectElement = (
    element: HTMLSelectElement,
    value: string,
    internalId: string
  ): FillResult => {
    const exactTextMatch = Array.from(element.options).find((option) => {
      return option.text === value;
    });

    const caseInsensitiveTextMatch = Array.from(element.options).find((option) => {
      return option.text.toLowerCase() === value.toLowerCase();
    });

    const valueMatch = Array.from(element.options).find((option) => {
      return option.value === value;
    });

    const matchedOption = exactTextMatch ?? caseInsensitiveTextMatch ?? valueMatch;
    if (!matchedOption) {
      return {
        internalId,
        success: false,
        message: "No matching select option was found."
      };
    }

    element.value = matchedOption.value;
    dispatchFieldEvents(element);
    return {
      internalId,
      success: true,
      message: `Filled select with "${matchedOption.text}".`
    };
  };

  return approvedSuggestions.map((approvedSuggestion) => {
    const element = elementByInternalId.get(approvedSuggestion.internalId);
    if (!element) {
      return {
        internalId: approvedSuggestion.internalId,
        success: false,
        message: "Field was not found on the current page."
      };
    }

    if (element instanceof HTMLSelectElement) {
      return fillSelectElement(
        element,
        approvedSuggestion.value,
        approvedSuggestion.internalId
      );
    }

    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      setNativeValue(element, approvedSuggestion.value);
      dispatchFieldEvents(element);
      return {
        internalId: approvedSuggestion.internalId,
        success: true,
        message: "Filled input value."
      };
    }

    if (element.isContentEditable || element.getAttribute("role") === "textbox") {
      element.textContent = approvedSuggestion.value;
      dispatchFieldEvents(element);
      return {
        internalId: approvedSuggestion.internalId,
        success: true,
        message: "Filled editable text content."
      };
    }

    return {
      internalId: approvedSuggestion.internalId,
      success: false,
      message: "Field type is not supported for filling."
    };
  });
}
