import { useState } from "react"
import { motion, AnimatePresence } from "motion/react"

interface PulsingDotProps {
  x: string
  y: string
  label: string
  description: React.ReactNode
  side?: "top" | "bottom" | "left" | "right"
  delay?: number
  step: number
}

type Side = "top" | "bottom" | "left" | "right"

function tooltipPosition(side: Side) {
  switch (side) {
    case "top": return "left-1/2 bottom-full mb-4 -translate-x-1/2"
    case "bottom": return "left-0 top-full mt-4"
    case "left": return "top-1/2 right-full mr-4 -translate-y-1/2"
    case "right": return "top-1/2 left-full ml-4 -translate-y-1/2"
  }
}

function tooltipOffset(side: Side, resolved: boolean) {
  const d = resolved ? 0 : 6
  switch (side) {
    case "top": return { y: d }
    case "bottom": return { y: -d }
    case "left": return { x: d }
    case "right": return { x: -d }
  }
}

function arrowPosition(side: Side) {
  switch (side) {
    case "top": return "left-1/2 -translate-x-1/2 top-full border-t-zinc-900/95"
    case "bottom": return "left-1.5 bottom-full border-b-zinc-900/95"
    case "left": return "top-1/2 -translate-y-1/2 left-full border-l-zinc-900/95"
    case "right": return "top-1/2 -translate-y-1/2 right-full border-r-zinc-900/95"
  }
}

export function PulsingDot({ x, y, label, description, step, side = "top", delay = 0 }: PulsingDotProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="absolute"
      style={{ left: x, top: y }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Ping ring */}
      <motion.div
        className="absolute -inset-3 rounded-full bg-emerald-400/30"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: [0.5, 0.6, 0.5], opacity: [0, 0.6, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, delay, ease: "easeInOut" }}
      />
      {/* Second ring */}
      <motion.div
        className="absolute -inset-2 rounded-full bg-emerald-400/20"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: [0.8, 0.9, 0.8], opacity: [0, 0.4, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, delay: delay + 0.4, ease: "easeInOut" }}
      />
      {/* Core dot */}
      <motion.button
        className="flex items-center justify-center relative h-3 w-3 cursor-pointer rounded-full border border-emerald-300/60 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: delay + 0.3, type: "spring", stiffness: 300, damping: 20 }}
        whileHover={{ scale: 1.3 }}
        aria-label={label}
      >
        <span className="text-[9px] font-bold text-emerald-950">{step}</span>
        </motion.button>
      {/* Tooltip */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            className={`z-100 absolute whitespace-nowrap ${tooltipPosition(side)}`}
            initial={{ opacity: 0, ...tooltipOffset(side, false) }}
            animate={{ opacity: 1, ...tooltipOffset(side, true) }}
            exit={{ opacity: 0, ...tooltipOffset(side, false) }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="rounded-lg border border-white/10 bg-zinc-900/95 px-3 py-2 shadow-xl backdrop-blur-sm">
              <p className="text-xs font-semibold text-white">{label}</p>
              <p className="mt-0.5 text-[11px] text-zinc-400">{description}</p>
            </div>
            {/* Arrow */}
            <div className={`absolute border-[5px] border-transparent ${arrowPosition(side)}`} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
