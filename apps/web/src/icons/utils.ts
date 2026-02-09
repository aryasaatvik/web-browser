export const toKebabCase = (string: string): string =>
  string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

export const mergeClasses = <ClassType = string | undefined | null>(
  ...classes: ClassType[]
): string =>
  classes
    .filter((className, index, array) => {
      return (
        Boolean(className) &&
        (className as string).trim() !== "" &&
        array.indexOf(className) === index
      );
    })
    .join(" ")
    .trim();

export const hasA11yProp = (props: Record<string, any>): boolean => {
  for (const prop in props) {
    if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
      return true;
    }
  }
  return false;
};

