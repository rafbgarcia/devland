import { highlight } from "sugar-high";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "#/components/ui/hover-card";

interface PulsingDotProps {
	x: string;
	y: string;
	label: string;
	description: ReactNode;
	side?: "top" | "bottom" | "left" | "right";
	delay?: number;
	step: number;
}

export function CodeBlock({ children }: { children: string }) {
	const html = highlight(children.trim());
	return (
		<pre className="mt-2 overflow-x-auto whitespace-pre rounded-lg border border-white/6 bg-black/40 px-3 py-2.5 text-[11px] leading-relaxed">
			<code dangerouslySetInnerHTML={{ __html: html }} />
		</pre>
	);
}

export function PulsingDot({
	x,
	y,
	label,
	description,
	step,
	side = "top",
	delay = 0,
}: PulsingDotProps) {
	return (
		<div
			className="pointer-events-auto absolute select-none"
			style={{ left: x, top: y }}
		>
			{/* Ping ring */}
			<motion.div
				className="absolute -inset-3 rounded-full bg-emerald-400/30"
				initial={{ scale: 0.5, opacity: 0 }}
				animate={{ scale: [0.5, 0.6, 0.5], opacity: [0, 0.6, 0] }}
				transition={{
					duration: 2.4,
					repeat: Infinity,
					delay,
					ease: "easeInOut",
				}}
			/>
			{/* Second ring */}
			<motion.div
				className="absolute -inset-2 rounded-full bg-emerald-400/20"
				initial={{ scale: 0.8, opacity: 0 }}
				animate={{ scale: [0.8, 0.9, 0.8], opacity: [0, 0.4, 0] }}
				transition={{
					duration: 2.4,
					repeat: Infinity,
					delay: delay + 0.4,
					ease: "easeInOut",
				}}
			/>

			<HoverCard openDelay={100} closeDelay={200}>
				<HoverCardTrigger asChild>
					{/* Core dot */}
					<motion.button
						className="flex items-center justify-center relative h-3 w-3 cursor-pointer rounded-full border border-emerald-300/60 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
						initial={{ scale: 0, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={{
							delay: delay + 0.3,
							type: "spring",
							stiffness: 300,
							damping: 20,
						}}
						whileHover={{ scale: 1.3 }}
						aria-label={label}
					>
						<span className="text-[9px] font-bold text-emerald-950">
							{step}
						</span>
					</motion.button>
				</HoverCardTrigger>

				<HoverCardContent side={side} className="w-fit">
					<p className="text-sm font-semibold text-white">{label}</p>
					<div className="mt-1 text-xs leading-relaxed text-zinc-400 [&_strong]:font-semibold [&_strong]:text-white">
						{description}
					</div>
				</HoverCardContent>
			</HoverCard>
		</div>
	);
}
