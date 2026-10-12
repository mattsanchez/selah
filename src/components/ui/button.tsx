import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

type ButtonProps = ComponentProps<"button"> & {
  // Render the child element (for example a link) with the button's styles.
  asChild?: boolean;
};

export function Button({ asChild = false, className = "", ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      className={`inline-flex h-10 items-center rounded-md bg-stone-900 px-4 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300 ${className}`}
      {...props}
    />
  );
}
