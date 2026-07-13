import { forwardRef } from "react";

type Props = React.SVGProps<SVGSVGElement> & {
  /** Optional title for accessibility. Pass empty string to hide. */
  title?: string;
};

/**
 * NovaChat brand logo — squircle tile in teal with a circular speech
 * bubble (pointed tail toward lower-left) and a 4-point sparkle at the
 * lower-right. Fully SVG, retina-crisp, theme-agnostic.
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
        {/* Tile body: soft top-to-bottom teal with a hint of radial depth */}
        <linearGradient id="nova-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4CA98A" />
          <stop offset="55%" stopColor="#348870" />
          <stop offset="100%" stopColor="#256B58" />
        </linearGradient>
        {/* Top sheen (very subtle glossy highlight) */}
        <linearGradient id="nova-sheen" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="40%" stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {/* Bubble/sparkle stroke: warm off-white with a subtle vertical fade */}
        <linearGradient id="nova-stroke" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F6F1E4" />
          <stop offset="100%" stopColor="#D8CFB8" />
        </linearGradient>
        {/* Inner shadow inside the tile edges */}
        <filter id="nova-inner" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.6" />
          <feOffset dx="0" dy="1.5" result="off" />
          <feComposite in="off" in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="inner" />
          <feColorMatrix in="inner" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0" />
        </filter>
        {/* Soft drop shadow for the bubble and sparkle */}
        <filter id="nova-drop" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.3" />
          <feOffset dx="0" dy="1.8" result="o" />
          <feComponentTransfer in="o" result="s">
            <feFuncA type="linear" slope="0.38" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="s" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Squircle tile (iOS-style rounded corners) */}
      <rect x="4" y="4" width="120" height="120" rx="30" ry="30" fill="url(#nova-tile)" />
      <rect x="4" y="4" width="120" height="120" rx="30" ry="30" fill="url(#nova-tile)" filter="url(#nova-inner)" />
      {/* Top gloss */}
      <rect x="4" y="4" width="120" height="120" rx="30" ry="30" fill="url(#nova-sheen)" />
      {/* Hairline edge */}
      <rect
        x="4.5"
        y="4.5"
        width="119"
        height="119"
        rx="29.5"
        ry="29.5"
        fill="none"
        stroke="#000"
        strokeOpacity="0.20"
      />

      {/* Speech bubble: clean circle + pointed triangular tail toward lower-left */}
      <g filter="url(#nova-drop)">
        <path
          d="M 37.8 68.3 L 28 100 L 55.7 86.2 A 30 30 0 1 1 37.8 68.3 Z"
          fill="none"
          stroke="url(#nova-stroke)"
          strokeWidth="6.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </g>

      {/* 4-point sparkle at lower-right, below the bubble */}
      <g filter="url(#nova-drop)">
        <path
          d="M78 84
             C 78 90.5 80.5 93 87 93
             C 80.5 93 78 95.5 78 102
             C 78 95.5 75.5 93 69 93
             C 75.5 93 78 90.5 78 84 Z"
          fill="url(#nova-stroke)"
        />
      </g>
    </svg>
  );
});

export default NovaLogo;
