import { forwardRef } from "react";

type Props = React.SVGProps<SVGSVGElement> & {
  /** Optional title for accessibility. Pass empty string to hide. */
  title?: string;
};

/**
 * NovaChat brand logo.
 * Rounded-square tile in teal with a speech-bubble outline and a sparkle —
 * fully SVG, retina-crisp, theme-agnostic (colors are baked in, not tokenized,
 * so the brand mark looks identical in light and dark modes).
 */
export const NovaLogo = forwardRef<SVGSVGElement, Props>(function NovaLogo(
  { title = "NovaChat", className, ...rest },
  ref,
) {
  return (
    <svg
      ref={ref}
      viewBox="0 0 128 128"
      role="img"
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        {/* Tile body: soft radial from lighter center to deeper edges */}
        <radialGradient id="nova-tile" cx="50%" cy="42%" r="72%">
          <stop offset="0%" stopColor="#3E9E7F" />
          <stop offset="55%" stopColor="#2F8368" />
          <stop offset="100%" stopColor="#1F5F4B" />
        </radialGradient>
        {/* Top sheen */}
        <linearGradient id="nova-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {/* Bubble stroke: warm off-white with a subtle top-to-bottom fade */}
        <linearGradient id="nova-stroke" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F6F1E4" />
          <stop offset="100%" stopColor="#DFD6C1" />
        </linearGradient>
        {/* Inner shadow inside the tile */}
        <filter id="nova-inner" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
          <feOffset dx="0" dy="2" result="off" />
          <feComposite in="off" in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="inner" />
          <feColorMatrix in="inner" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0" />
        </filter>
        {/* Soft drop shadow for the bubble */}
        <filter id="nova-drop" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.2" />
          <feOffset dx="0" dy="1.5" result="o" />
          <feComponentTransfer in="o" result="s">
            <feFuncA type="linear" slope="0.35" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="s" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Tile */}
      <rect x="6" y="6" width="116" height="116" rx="28" fill="url(#nova-tile)" />
      <rect x="6" y="6" width="116" height="116" rx="28" fill="url(#nova-tile)" filter="url(#nova-inner)" />
      {/* Top gloss */}
      <rect x="6" y="6" width="116" height="116" rx="28" fill="url(#nova-sheen)" />
      {/* Hairline border */}
      <rect
        x="6.5"
        y="6.5"
        width="115"
        height="115"
        rx="27.5"
        fill="none"
        stroke="#000"
        strokeOpacity="0.18"
      />

      {/* Speech bubble: circle with a small tail on the lower-left */}
      <g filter="url(#nova-drop)">
        <path
          d="M64 30
             c 19.33 0 35 14.33 35 32
             c 0 17.67 -15.67 32 -35 32
             c -3.6 0 -7.05 -0.5 -10.25 -1.42
             L 38.5 100.5
             c -1.6 0.7 -3.3 -1 -2.55 -2.6
             l 5.1 -11.02
             C 34.4 81.06 29 71.9 29 62
             c 0 -17.67 15.67 -32 35 -32 z"
          fill="none"
          stroke="url(#nova-stroke)"
          strokeWidth="7.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </g>

      {/* Sparkle inside bubble, bottom-right */}
      <g filter="url(#nova-drop)">
        <path
          d="M82 74
             C 82 80 84 82 90 82
             C 84 82 82 84 82 90
             C 82 84 80 82 74 82
             C 80 82 82 80 82 74 Z"
          fill="url(#nova-stroke)"
        />
      </g>
    </svg>
  );
});

export default NovaLogo;
