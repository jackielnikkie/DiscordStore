type TemplateContext = Record<string, string | number | undefined | null>;

export function renderTemplate(
  template: string,
  context: TemplateContext,
  fallback = "",
) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const value = context[key];

    if (value === undefined || value === null) {
      return fallback;
    }

    return String(value);
  });
}
