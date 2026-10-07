import { Field as BaseField } from "@base-ui/react/field";
import { Fieldset as BaseFieldset } from "@base-ui/react/fieldset";
import type * as React from "react";

import { cn } from "../lib/cn";

/**
 * Form field: wires label, description and error to the control via ids/aria automatically.
 *
 * ```tsx
 * <Field name="name">
 *   <Label>App name</Label>
 *   <Input required placeholder="Linear" />
 *   <Description>Shown on cards and in search.</Description>
 *   <FieldError match="valueMissing">Name is required</FieldError>
 * </Field>
 * ```
 */
export function Field({ className, ...props }: React.ComponentProps<typeof BaseField.Root>) {
  return <BaseField.Root className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<typeof BaseField.Label>) {
  return (
    <BaseField.Label
      className={cn(
        "text-sm font-medium text-fg data-[disabled]:opacity-50 [&_.ou-optional]:font-normal [&_.ou-optional]:text-fg-subtle",
        className,
      )}
      {...props}
    />
  );
}

export function Description({
  className,
  ...props
}: React.ComponentProps<typeof BaseField.Description>) {
  return <BaseField.Description className={cn("text-sm text-fg-muted", className)} {...props} />;
}

export function FieldError({ className, ...props }: React.ComponentProps<typeof BaseField.Error>) {
  return <BaseField.Error className={cn("text-sm text-danger", className)} {...props} />;
}

/** Group of related fields with a legend (e.g. "Profile"). */
export function Fieldset({ className, ...props }: React.ComponentProps<typeof BaseFieldset.Root>) {
  return <BaseFieldset.Root className={cn("flex flex-col gap-5", className)} {...props} />;
}

export function Legend({ className, ...props }: React.ComponentProps<typeof BaseFieldset.Legend>) {
  return (
    <BaseFieldset.Legend className={cn("text-md font-semibold text-fg", className)} {...props} />
  );
}

/** Inline "(optional)" marker for labels: `<Label>Tagline <Optional /></Label>`. */
export function Optional() {
  return <span className="ou-optional">(optional)</span>;
}
