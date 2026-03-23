import { createFileRoute } from "@tanstack/react-router"
import { motion } from "motion/react"
import { PulsingDot } from "../components/PulsingDot"

export const Route = createFileRoute("/")({ component: LandingPage })

function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-950">
      {/* Subtle gradient backdrop */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(16,185,129,0.08),transparent_60%)]" />

      {/* Hero */}
      <section className="relative mx-auto flex max-w-5xl flex-col items-center px-6 pt-32 pb-16 text-center">
        <motion.h1
          className="font-bold tracking-tight text-white text-5xl sm:text-7xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
        >
          Devland
          <br />
          <p className="text-2xl sm:text-4xl text-gray-200">
            Your hackable development workspace
          </p>
        </motion.h1>
      </section>

      {/* Screenshot with pulsing dots */}
      <section className="relative mx-auto max-w-7xl px-6 pb-24">
        <motion.div
          className="relative"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Glow behind the image */}
          <div className="absolute -inset-4 rounded-3xl bg-linear-to-b from-emerald-500/10 via-transparent to-transparent blur-2xl" />

          {/* Image container */}
          <div className="relative overflow-hidden rounded-2xl border-2 border-white/8 shadow-2xl shadow-black/40">
            <img
              src="/images/devland1.png"
              alt="Devland workspace showing Codex AI agent analyzing code with task tracking and git integration"
              className="block w-full"
            />

            {/* Pulsing dots overlay */}
            <PulsingDot
              step={1}
              x="14.5%"
              y="4.5%"
              label="Per-project workspace"
              description={<>Easily add and start working on your local Git repos<br /> and view your remote Github repos using Github CLI.</>}
              side="bottom"
              delay={1}
            />
            <PulsingDot
              step={2}
              x="6.5%"
              y="9%"
              label="Code tab"
              description={<>Devland ships only with the Code tab.<br/>Easily create your own extensions that integrate with Devland.</>}
              side="bottom"
              delay={2}
            />
            <PulsingDot
              step={3}
              x="22%"
              y="9%"
              label="Extensions"
              description={<>Extensions are simple Vite projects that use Devland<br/>as bridge to run commands on your local machine.</>}
              side="bottom"
              delay={3}
            />
          </div>
        </motion.div>
      </section>
    </main>
  )
}
