import { useState } from 'react';

import { ChevronRightIcon } from 'lucide-react';
import { motion } from 'motion/react';

export function DrawerCloseButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="absolute right-full top-0 h-full group flex w-5 hover:w-10 shrink-0 items-center justify-center text-gray-500 transition-all bg-linear-to-r from-transparent to-background hover:from-background/80 active:from-gray-900"
    >
      <span className="sr-only">Close</span>
      <motion.span
        className="inline-flex"
        animate={
          hovered
            ? { x: [0, 4, 0], transition: { repeat: Infinity, duration: 0.8 } }
            : { x: 0 }
        }
      >
        <ChevronRightIcon className="size-4 group-hover:size-5" />
      </motion.span>
    </button>
  );
}
