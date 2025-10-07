import { cn } from "@/lib/utils";
import { cva, VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { ComponentProps } from "react";

const spinnerVariants = cva(
  "animate-spin",
  {
    variants: {
      size: {
        default: "h-10 w-10",
        sm: "h-4 w-4"
      }
    },
    defaultVariants: {
      size: "default"
    }
  }
)

export function Spinner({
  className,
  size,
  ...props
}: ComponentProps<typeof Loader2> &
  VariantProps<typeof spinnerVariants>) {
  return (
    <Loader2
      className={cn(spinnerVariants({ size }), className)}
      {...props}
    />
  )
}