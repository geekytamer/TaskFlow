import * as React from 'react';

export function Logo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width="1em"
      height="1em"
      {...props}
    >
      <g fill="currentColor">
        <path d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24Zm0 192a88 88 0 1 1 88-88a88.1 88.1 0 0 1-88 88Z" />
        <path d="M113.37 159.91a8 8 0 0 1-11.32-11.32L124.69 128l-22.64-20.59a8 8 0 0 1 10.58-12.08l24.19 22a8 8 0 0 1 0 11.31Z" />
        <path d="m173.32 107.25-48-32a8 8 0 0 0-8.64 12.08L148.69 110H96a8 8 0 0 0 0 16h52.69l-32.01 22.67a8 8 0 1 0 9.28 13.1l48-34a8 8 0 0 0-.64-13.18Z" />
      </g>
    </svg>
  );
}
