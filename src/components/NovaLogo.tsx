import { forwardRef } from "react";
import logoAsset from "@/assets/novachat-logo.png.asset.json";

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  /** Optional alt text. Defaults to "NovaChat". */
  title?: string;
};

/**
 * NovaChat brand logo — official PNG asset served from the CDN.
 * Rendered as an <img> to preserve the original colors, gradients,
 * shadows, and transparency exactly as delivered.
 */
export const NovaLogo = forwardRef<HTMLImageElement, Props>(function NovaLogo(
  { title = "NovaChat", className, ...rest },
  ref,
) {
  return (
    <img
      ref={ref}
      src={logoAsset.url}
      alt={title}
      draggable={false}
      decoding="async"
      className={className}
      style={{ objectFit: "contain", ...(rest.style || {}) }}
      {...rest}
    />
  );
});

export default NovaLogo;
